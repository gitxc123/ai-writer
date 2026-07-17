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

router.post('/:id/retry', authMiddleware, async (req, res) => {
  try {
    const { isMemberActive } = await import('../lib/membership.js');
    const { retryGenerationTask, TASK_STATUS } = await import('../lib/task-runner.js');
    const { prisma: db } = await import('../lib/prisma.js');

    const user = await db.user.findUnique({ where: { id: req.userId } });
    if (!isMemberActive(user)) {
      return res.status(403).json({
        code: 403,
        message: '请先开通会员后再创作',
        needVip: true
      });
    }

    const plan = await retryGenerationTask(req.params.id, req.userId);
    res.json({
      code: 200,
      data: {
        taskId: req.params.id,
        status: TASK_STATUS.PENDING,
        mode: plan.mode,
        message: plan.mode === 'images' ? '已开始重试配图' : '已重新提交任务'
      }
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ code: status, message: err.message || '重试失败' });
  }
});

/** 重新生成某一张配图 */
router.post('/:id/images/:index/regenerate', authMiddleware, async (req, res) => {
  try {
    const { isMemberActive } = await import('../lib/membership.js');
    const { regenerateOneImage } = await import('../lib/task-runner.js');
    const { prisma: db } = await import('../lib/prisma.js');

    const user = await db.user.findUnique({ where: { id: req.userId } });
    if (!isMemberActive(user)) {
      return res.status(403).json({
        code: 403,
        message: '请先开通会员后再创作',
        needVip: true
      });
    }

    const data = await regenerateOneImage(req.params.id, req.userId, req.params.index);
    res.json({ code: 200, data });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ code: status, message: err.message || '重新生成失败' });
  }
});

/** 把任务里的远程配图转存到本地 /uploads，方便下载后手动上传到头条等平台 */
router.post('/:id/localize-images', authMiddleware, async (req, res) => {
  try {
    const { persistImageUrl } = await import('../lib/public-url.js');
    const record = await prisma.generationRecord.findFirst({
      where: { id: req.params.id, userId: req.userId }
    });
    if (!record) {
      return res.status(404).json({ code: 404, message: '任务不存在' });
    }

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
    if (!Array.isArray(imageUrls)) imageUrls = [];
    if (!Array.isArray(imageMeta)) imageMeta = [];

    const nextUrls = [];
    const nextMeta = [];
    let changed = 0;

    for (let i = 0; i < imageUrls.length; i += 1) {
      const url = imageUrls[i];
      if (!url) continue;
      const stored = await persistImageUrl(url);
      if (stored !== url) changed += 1;
      nextUrls.push(stored);
      const prev = imageMeta.find((m) => m?.url === url) || imageMeta[i] || {};
      nextMeta.push({
        ...prev,
        url: stored,
        remoteUrl: prev.remoteUrl || (stored !== url ? url : prev.remoteUrl)
      });
    }

    const urlsJson = JSON.stringify(nextUrls);
    const metaJson = JSON.stringify(nextMeta);
    const cover = nextUrls[0] || null;
    try {
      await prisma.generationRecord.update({
        where: { id: record.id },
        data: { imageUrls: urlsJson, imageUrl: cover, imageMeta: metaJson }
      });
    } catch {
      await prisma.$executeRawUnsafe(
        'UPDATE GenerationRecord SET imageMeta = ?, imageUrls = ?, imageUrl = ? WHERE id = ?',
        metaJson,
        urlsJson,
        cover,
        record.id
      );
    }

    res.json({
      code: 200,
      data: {
        imageUrls: nextUrls,
        imageMeta: nextMeta,
        localized: changed,
        message: changed
          ? `已转存 ${changed} 张配图到本地，可下载后上传到头条`
          : '配图已是本地文件，可直接下载'
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message || '转存失败' });
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

  const { getRetryPlan, getRegeneratingIndexes } = await import('../lib/task-runner.js');
  const retry = getRetryPlan({
    ...record,
    imageUrls: JSON.stringify(imageUrls),
    imageMeta: JSON.stringify(imageMeta)
  });

  const data = {
    ...record,
    input: formInputs,
    imageCount: Number(input.imageCount) || imageUrls.length || 0,
    imageSize: input.imageSize || record.imageSize || 'landscape',
    imageSource: input.imageSource === 'web' ? 'web' : 'ai',
    imageUrls,
    imageMeta,
    retry,
    regeneratingIndexes: getRegeneratingIndexes(record.id)
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
