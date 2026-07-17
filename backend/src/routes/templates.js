import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { isHiddenTemplate } from '../lib/product-images.js';

const router = Router();

router.get('/categories', async (_req, res) => {
  const categories = await prisma.templateCategory.findMany({
    orderBy: { sort: 'asc' },
    include: {
      templates: {
        orderBy: { sort: 'asc' },
        select: {
          id: true,
          name: true,
          description: true,
          icon: true,
          fields: true
        }
      }
    }
  });
  const visible = categories
    .map((cat) => ({
      ...cat,
      templates: (cat.templates || [])
        .filter((t) => !isHiddenTemplate(t.name))
        .map((t) => ({
          ...t,
          fields: (() => {
            try {
              return typeof t.fields === 'string' ? JSON.parse(t.fields || '[]') : t.fields || [];
            } catch {
              return [];
            }
          })()
        }))
    }))
    .filter((cat) => (cat.templates || []).length > 0);
  res.json({ code: 200, data: visible });
});

router.get('/:id', async (req, res) => {
  const template = await prisma.template.findUnique({ where: { id: req.params.id } });
  if (!template) {
    return res.status(404).json({ code: 404, message: '模板不存在' });
  }
  if (isHiddenTemplate(template.name)) {
    return res.status(404).json({
      code: 404,
      message: '产品介绍功能暂不可用，方案重订中'
    });
  }
  res.json({
    code: 200,
    data: {
      ...template,
      fields: JSON.parse(template.fields || '[]')
    }
  });
});

export default router;
