import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { fetchHotTopics } from '../lib/hot-topics.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    let templateName = String(req.query.channel || req.query.templateName || '').trim();
    const templateId = String(req.query.templateId || '').trim();

    if (!templateName && templateId) {
      const tpl = await prisma.template.findUnique({
        where: { id: templateId },
        select: { name: true }
      });
      templateName = tpl?.name || '';
    }

    const data = await fetchHotTopics(templateName, {
      limit: Number(req.query.limit) || 8,
      force: req.query.refresh === '1'
    });
    res.json({ code: 200, data });
  } catch (err) {
    console.error('[hot]', err);
    res.status(500).json({ code: 500, message: err.message || '获取热门失败' });
  }
});

export default router;
