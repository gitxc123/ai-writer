import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { fillPrompt } from '../lib/ai.js';
import { enqueueGenerationTask, TASK_STATUS } from '../lib/task-runner.js';
import { isMemberActive } from '../lib/membership.js';
import {
  isProductIntroTemplate,
  normalizeProductPhotos,
  PRODUCT_IMAGE_TARGET
} from '../lib/product-images.js';
import { isRewriteTemplate, MAX_SOURCE_CHARS } from '../lib/rewrite.js';
import {
  isStoryboardTemplate,
  MIN_STORY_CHARS,
  MAX_STORY_CHARS
} from '../lib/storyboard.js';

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

    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) {
      return res.status(404).json({ code: 404, message: '模板不存在' });
    }

    const count = isStoryboardTemplate(template.name)
      ? 0
      : Math.min(5, Math.max(0, Number(imageCount) || 0));
    const size = imageSize || 'landscape';

    if (isProductIntroTemplate(template.name)) {
      return res.status(503).json({
        code: 503,
        message: '产品介绍功能暂不可用，方案重订中，请先使用其他模板'
      });
    }

    if (isRewriteTemplate(template.name)) {
      const article = String(inputs?.article || inputs?.keyword || '').trim();
      if (article.length < 50) {
        return res.status(400).json({ code: 400, message: '请粘贴至少 50 字的原文' });
      }
      if (article.length > MAX_SOURCE_CHARS) {
        return res.status(400).json({
          code: 400,
          message: `原文过长，请控制在 ${MAX_SOURCE_CHARS} 字以内`
        });
      }
    }

    if (isStoryboardTemplate(template.name)) {
      const story = String(inputs?.story || inputs?.article || '').trim();
      if (story.length < MIN_STORY_CHARS) {
        return res.status(400).json({
          code: 400,
          message: `请粘贴至少 ${MIN_STORY_CHARS} 字的故事原文`
        });
      }
      if (story.length > MAX_STORY_CHARS) {
        return res.status(400).json({
          code: 400,
          message: `故事过长，请控制在 ${MAX_STORY_CHARS} 字以内`
        });
      }
      if (!String(inputs?.platform || '').trim()) {
        return res.status(400).json({ code: 400, message: '请选择提示词平台' });
      }
    }

    let productPhotos = null;
    // 产品介绍入口已临时关闭；保留配图流水线代码，重开时恢复下方分支即可
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
      ? {
          ...cleanInputs,
          productPhotos,
          imageSource: 'product',
          imageCount: PRODUCT_IMAGE_TARGET,
          imageSize: 'square'
        }
      : { ...cleanInputs, imageCount: count, imageSize: size, imageSource: source };

    let promptPreview = '';
    try {
      promptPreview = fillPrompt(template.prompt, inputs || {});
    } catch (e) {
      console.warn('[generate] fillPrompt', e.message);
    }

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
        prompt: promptPreview
      }
    });
  } catch (err) {
    console.error('[generate]', err);
    res.status(500).json({ code: 500, message: '提交失败，请稍后重试' });
  }
});

export default router;
