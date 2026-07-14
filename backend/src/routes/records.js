import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

async function hydrateImageMeta(records) {
  if (!records.length) return records;
  const ids = records.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, imageMeta FROM GenerationRecord WHERE id IN (${placeholders})`,
      ...ids
    );
    const map = new Map(rows.map((r) => [r.id, r.imageMeta]));
    return records.map((r) => ({
      ...r,
      imageMeta: r.imageMeta ?? map.get(r.id) ?? null
    }));
  } catch {
    return records;
  }
}

const router = Router();

router.post('/resume', authMiddleware, async (req, res) => {
  try {
    const { resumeStuckTasks } = await import('../lib/task-runner.js');
    await resumeStuckTasks();
    res.json({ code: 200, data: { message: '已重新排队卡住的任务' } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message || '恢复失败' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  let records = await prisma.generationRecord.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    include: {
      template: { select: { name: true, icon: true } }
    },
    take: 100
  });
  records = await hydrateImageMeta(records);

  const data = records.map((record) => {
    let imageUrls = [];
    let imageMeta = [];
    let imageCount = 0;
    let imageSource = 'ai';
    try {
      imageUrls = record.imageUrls ? JSON.parse(record.imageUrls) : [];
    } catch {
      imageUrls = record.imageUrl ? [record.imageUrl] : [];
    }
    try {
      imageMeta = record.imageMeta ? JSON.parse(record.imageMeta) : [];
    } catch {
      imageMeta = [];
    }
    try {
      const input = JSON.parse(record.input || '{}');
      imageCount = Number(input.imageCount) || 0;
      imageSource = input.imageSource === 'web' ? 'web' : 'ai';
    } catch {
      imageCount = imageUrls.length;
    }
    return { ...record, imageUrls, imageMeta, imageCount, imageSource };
  });

  res.json({ code: 200, data });
});

router.get('/:id', authMiddleware, async (req, res) => {
  let record = await prisma.generationRecord.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: { template: true }
  });
  if (!record) {
    return res.status(404).json({ code: 404, message: '任务不存在' });
  }
  [record] = await hydrateImageMeta([record]);

  const input = JSON.parse(record.input || '{}');
  const { imageCount: _ic, imageSize: _is, imageSource: _src, ...formInputs } = input;
  let imageUrls = [];
  let imageMeta = [];
  try {
    imageUrls = record.imageUrls ? JSON.parse(record.imageUrls) : [];
  } catch {
    imageUrls = record.imageUrl ? [record.imageUrl] : [];
  }
  try {
    imageMeta = record.imageMeta ? JSON.parse(record.imageMeta) : [];
  } catch {
    imageMeta = [];
  }

  const data = {
    ...record,
    input: formInputs,
    imageCount: Number(input.imageCount) || imageUrls.length || 0,
    imageSize: input.imageSize || record.imageSize || 'landscape',
    imageSource: input.imageSource === 'web' ? 'web' : 'ai',
    imageUrls,
    imageMeta
  };

  if (record.template) {
    data.template = {
      ...record.template,
      fields: JSON.parse(record.template.fields || '[]')
    };
  }

  res.json({ code: 200, data });
});

export default router;
