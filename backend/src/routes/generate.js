import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { fillPrompt } from '../lib/ai.js';
import { enqueueGenerationTask, TASK_STATUS } from '../lib/task-runner.js';
import { isMemberActive } from '../lib/membership.js';
import { isProductIntroTemplate, normalizeProductPhotos } from '../lib/product-images.js';

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { templateId, inputs, imageCount = 0, imageSize = 'landscape', imageSource = 'ai' } = req.body || {};
    if (!templateId) {
      return res.status(400).json({ code: 400, message: '缺少模板ID' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!isMemberActive(user)) {
      return res.status(403).json({
        code: 403,
        message: '请先开通会员后再创作',
        needVip: true
      });
    }

    const count = Math.min(5, Math.max(0, Number(imageCount) || 0));
    const size = imageSize || 'landscape';

    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) {
      return res.status(404).json({ code: 404, message: '模板不存在' });
    }

    let productPhotos = null;
    if (isProductIntroTemplate(template.name)) {
      try {
        productPhotos = normalizeProductPhotos(req.body?.productPhotos || inputs?.productPhotos);
      } catch (e) {
        return res.status(400).json({ code: 400, message: e.message });
      }
    }

    const { productPhotos: _pp, ...cleanInputs } = inputs || {};
    const source = imageSource === 'web' ? 'web' : 'ai';
    const storedInput = productPhotos
      ? { ...cleanInputs, productPhotos, imageSource: 'product', imageCount: 0, imageSize: 'square' }
      : { ...cleanInputs, imageCount: count, imageSize: size, imageSource: source };
    const prompt = fillPrompt(template.prompt, inputs || {});

    const task = await prisma.generationRecord.create({
      data: {
        userId: req.userId,
        templateId,
        input: JSON.stringify(storedInput),
        output: '',
        status: TASK_STATUS.PENDING,
        taskType: productPhotos || count > 0 ? 'combo' : 'text',
        imageSize: productPhotos ? 'square' : count > 0 ? size : null
      }
    });

    enqueueGenerationTask(task.id);

    res.json({
      code: 200,
      data: {
        taskId: task.id,
        id: task.id,
        status: task.status,
        taskType: task.taskType,
        prompt
      }
    });
  } catch (err) {
    console.error('[generate]', err);
    res.status(500).json({ code: 500, message: err.message || '提交失败' });
  }
});

export default router;
