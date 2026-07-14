import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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
import { createAIClient } from './lib/ai.js';
import { ensureSchema } from './lib/ensure-schema.js';
import { resumeStuckTasks } from './lib/task-runner.js';
import { UPLOAD_DIR, ensureUploadDir } from './lib/public-url.js';

const app = express();

const port = process.env.PORT || 3001;

ensureUploadDir();
app.use(cors());
app.use(express.json());
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

app.listen(port, async () => {
  const client = createAIClient();
  console.log(`AI Writer API running at http://localhost:${port}`);
  console.log('AI baseURL:', client.baseURL);
  console.log('AI model:', process.env.AI_MODEL);
  console.log('AI mode:', process.env.AI_MODE || 'api');
  console.log('Task mode: async (pending -> processing -> completed/failed)');
  try {
    await resumeStuckTasks();
  } catch (err) {
    console.error('[task:resume] failed', err.message);
  }
});
