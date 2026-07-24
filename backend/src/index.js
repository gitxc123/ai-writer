import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import templateRoutes from './routes/templates.js';
import generateRoutes from './routes/generate.js';
import recordRoutes from './routes/records.js';
import imageRoutes from './routes/images.js';
import hotRoutes from './routes/hot.js';
import membershipRoutes, { publicUser } from './routes/membership.js';
import uploadRoutes from './routes/uploads.js';
import complaintRoutes from './routes/complaints.js';
import logRoutes from './routes/logs.js';
import { authMiddleware } from './middleware/auth.js';
import { prisma } from './lib/prisma.js';
import { createAIClient, getFallbackModes } from './lib/ai.js';
import { ensureSchema } from './lib/ensure-schema.js';
import { resumeStuckTasks } from './lib/task-runner.js';
import { UPLOAD_DIR, ensureUploadDir } from './lib/public-url.js';
import { purgeTaskLogs } from './lib/logger.js';
import { assertSecurityOnBoot } from './lib/security-config.js';
import { rateLimit, ipKey, userOrIpKey } from './lib/rate-limit.js';
import { buildCorsOptions } from './lib/cors-config.js';
import { startRetentionScheduler } from './lib/retention.js';
import { uploadAccessMiddleware } from './lib/upload-access.js';

assertSecurityOnBoot();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const port = process.env.PORT || 3001;
const staticDir = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(__dirname, '../public');

ensureUploadDir();
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', uploadAccessMiddleware, express.static(UPLOAD_DIR));

app.get('/api/health', (_req, res) => {
  res.json({ code: 200, message: 'ok' });
});

app.get('/api/user/me', authMiddleware, async (req, res) => {
  const { ensureCodeIssuerPrivileges } = await import('./lib/activation-codes.js');
  const { canIssueActivationCodes } = await import('./lib/membership.js');
  const { ensureUserAvatar } = await import('./lib/avatars.js');
  await ensureCodeIssuerPrivileges('17682160819').catch(() => null);
  let user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (user && canIssueActivationCodes(user) && !user.isAgent) {
    user = (await ensureCodeIssuerPrivileges(user.phone).catch(() => null)) || user;
  }
  if (user) user = await ensureUserAvatar(prisma, user);
  res.json({ code: 200, data: publicUser(user) });
});

app.use(
  '/api/auth',
  rateLimit({
    name: 'auth',
    windowMs: 60_000,
    max: Number(process.env.RATE_LIMIT_AUTH_PER_MIN || 20),
    key: ipKey,
    message: '登录/注册过于频繁，请稍后再试'
  }),
  authRoutes
);
app.use('/api/templates', templateRoutes);
app.use(
  '/api/generate',
  rateLimit({
    name: 'generate',
    windowMs: 60_000,
    max: Number(process.env.RATE_LIMIT_GENERATE_PER_MIN || 20),
    key: userOrIpKey,
    message: '提交过于频繁，请稍后再试'
  }),
  generateRoutes
);
app.use('/api/records', recordRoutes);
app.use(
  '/api/images',
  rateLimit({
    name: 'images',
    windowMs: 60_000,
    max: Number(process.env.RATE_LIMIT_IMAGES_PER_MIN || 30),
    key: userOrIpKey,
    message: '配图请求过于频繁，请稍后再试'
  }),
  imageRoutes
);
app.use('/api/hot', hotRoutes);
app.use('/api/membership', membershipRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/logs', logRoutes);

await ensureSchema();

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/^(?!\/api(?:\/|$)|\/uploads(?:\/|$)).*/, (req, res) => {
    const indexHtml = path.join(staticDir, 'index.html');
    if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
    return res.status(404).send('Frontend not built');
  });
  console.log('Serving frontend from', staticDir);
}

app.listen(port, '0.0.0.0', async () => {
  const client = createAIClient();
  const fallbacks = getFallbackModes();
  console.log(`小溪AI创作工具 API running at http://0.0.0.0:${port}`);
  console.log('AI baseURL:', client.baseURL);
  console.log('AI model:', process.env.AI_MODEL);
  console.log('AI mode:', process.env.AI_MODE || 'api');
  if (fallbacks.length) {
    console.log('AI fallback:', fallbacks.join(' → '));
  } else {
    console.log('AI fallback: off');
  }
  console.log('Task mode: async (pending -> processing -> completed/failed)');
  try {
    const { getMaxConcurrentTasks, getTaskQueueStats } = await import('./lib/task-queue.js');
    console.log(
      'Task concurrency:',
      `max=${getMaxConcurrentTasks()}`,
      getTaskQueueStats()
    );
  } catch (err) {
    console.warn('[task-queue] stats', err.message);
  }
  try {
    const n = await purgeTaskLogs();
    if (n) console.log('[logger] purged task logs', n);
  } catch (err) {
    console.warn('[logger] purge on boot failed', err.message);
  }
  try {
    await resumeStuckTasks();
  } catch (err) {
    console.error('[task:resume] failed', err.message);
  }
  startRetentionScheduler();
});
