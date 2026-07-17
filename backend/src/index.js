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
import { authMiddleware } from './middleware/auth.js';
import { prisma } from './lib/prisma.js';
import { createAIClient, getFallbackModes } from './lib/ai.js';
import { ensureSchema } from './lib/ensure-schema.js';
import { resumeStuckTasks } from './lib/task-runner.js';
import { UPLOAD_DIR, ensureUploadDir } from './lib/public-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const port = process.env.PORT || 3001;
const staticDir = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(__dirname, '../public');

ensureUploadDir();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api/health', (_req, res) => {
  res.json({ code: 200, message: 'ok' });
});

app.get('/api/user/me', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  res.json({ code: 200, data: publicUser(user) });
});

app.use('/api/auth', authRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/hot', hotRoutes);
app.use('/api/membership', membershipRoutes);
app.use('/api/uploads', uploadRoutes);

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
  console.log(`AI Writer API running at http://0.0.0.0:${port}`);
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
    await resumeStuckTasks();
  } catch (err) {
    console.error('[task:resume] failed', err.message);
  }
});
