import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { buildImagePrompt } from '../lib/agnes-image.js';
import { enqueueImageTask, TASK_STATUS } from '../lib/task-runner.js';
import { isMemberActive } from '../lib/membership.js';
import { checkDailyGenerateQuota } from '../lib/quota.js';

const router = Router();

router.post('/generate', authMiddleware, async (req, res) => {
  const { recordId, prompt, keyword, style, templateName, size } = req.body || {};

  if (!recordId) {
    return res.status(400).json({ code: 400, message: '缺少文案任务ID' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!isMemberActive(user)) {
    return res.status(403).json({
      code: 403,
      message: '请先开通会员后再创作',
      needVip: true
    });
  }

  const overQuota = await checkDailyGenerateQuota(req.userId);
  if (overQuota) {
    return res.status(429).json({
      code: 429,
      message: overQuota.message,
      used: overQuota.used,
      limit: overQuota.limit
    });
  }

  const parent = await prisma.generationRecord.findFirst({
    where: { id: recordId, userId: req.userId, taskType: 'text' }
  });
  if (!parent) {
    return res.status(404).json({ code: 404, message: '文案任务不存在' });
  }
  if (parent.status !== TASK_STATUS.COMPLETED) {
    return res.status(400).json({ code: 400, message: '文案尚未生成完成，请稍后再试' });
  }

  const imagePrompt = prompt || buildImagePrompt({ keyword, style, templateName });
  const payload = { recordId, keyword, style, templateName, size: size || 'landscape', imagePrompt };

  const task = await prisma.generationRecord.create({
    data: {
      userId: req.userId,
      templateId: parent.templateId,
      parentId: recordId,
      input: JSON.stringify(payload),
      output: '',
      status: TASK_STATUS.PENDING,
      taskType: 'image',
      imageSize: size || 'landscape'
    }
  });

  enqueueImageTask(task.id);

  res.json({
    code: 200,
    data: {
      taskId: task.id,
      id: task.id,
      status: task.status,
      taskType: task.taskType,
      parentId: recordId
    }
  });
});

export default router;
