import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { logTask } from '../lib/logger.js';

const router = Router();

const rateBucket = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

function clientKey(req) {
  const ip =
    req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  return ip;
}

function checkRate(req) {
  const key = clientKey(req);
  const now = Date.now();
  const hit = rateBucket.get(key) || { count: 0, start: now };
  if (now - hit.start > RATE_WINDOW_MS) {
    hit.count = 0;
    hit.start = now;
  }
  hit.count += 1;
  rateBucket.set(key, hit);
  return hit.count <= RATE_MAX;
}

function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN || '';
  if (!token) {
    return res.status(503).json({ code: 503, message: '未配置 ADMIN_TOKEN' });
  }
  const header = req.headers['x-admin-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (header !== token) {
    return res.status(401).json({ code: 401, message: '无管理权限' });
  }
  return next();
}

router.get('/meta', (_req, res) => {
  res.json({
    code: 200,
    data: {
      email: process.env.COMPLAINT_EMAIL || '741952213@qq.com',
      retentionDays: 180
    }
  });
});

/** 公开提交投诉（可匿名） */
router.post('/', async (req, res) => {
  try {
    if (!checkRate(req)) {
      return res.status(429).json({ code: 429, message: '提交过于频繁，请稍后再试' });
    }

    const recordId = String(req.body?.recordId || '').trim();
    const contact = String(req.body?.contact || '').trim();
    const reason = String(req.body?.reason || '').trim();
    const evidenceUrl = String(req.body?.evidenceUrl || '').trim() || null;

    if (!recordId || recordId.length < 8) {
      return res.status(400).json({ code: 400, message: '请填写有效的记录 ID' });
    }
    if (!contact || contact.length < 5) {
      return res.status(400).json({ code: 400, message: '请填写有效联系方式' });
    }
    if (!reason || reason.length < 10) {
      return res.status(400).json({ code: 400, message: '请详细说明投诉事由（至少10字）' });
    }

    const complaint = await prisma.complaint.create({
      data: {
        recordId,
        contact: contact.slice(0, 200),
        reason: reason.slice(0, 2000),
        evidenceUrl: evidenceUrl ? evidenceUrl.slice(0, 500) : null,
        status: 'pending'
      }
    });

    console.log('[complaint] created', complaint.id, 'record=', recordId);

    res.json({
      code: 200,
      data: { id: complaint.id, message: '投诉已记录，将在核实后处理' }
    });
  } catch (err) {
    console.error('[complaint]', err);
    res.status(500).json({ code: 500, message: '提交失败，请稍后重试' });
  }
});

/** 管理：列出待处理投诉（需 ADMIN_TOKEN） */
router.get('/admin/list', requireAdmin, async (req, res) => {
  const status = String(req.query.status || 'pending');
  const list = await prisma.complaint.findMany({
    where: status === 'all' ? undefined : { status },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  res.json({ code: 200, data: list });
});

/**
 * 管理：按投诉 ID 下架对应生成记录
 * Header: X-Admin-Token: <ADMIN_TOKEN>
 */
router.post('/admin/:id/takedown', requireAdmin, async (req, res) => {
  try {
    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) {
      return res.status(404).json({ code: 404, message: '投诉不存在' });
    }

    const record = await prisma.generationRecord.findUnique({ where: { id: complaint.recordId } });
    if (!record) {
      await prisma.complaint.update({
        where: { id: complaint.id },
        data: {
          status: 'resolved',
          note: '记录不存在或已删除',
          resolvedAt: new Date()
        }
      });
      return res.json({ code: 200, data: { message: '记录已不存在，投诉已关闭' } });
    }

    await prisma.generationRecord.update({
      where: { id: record.id },
      data: {
        status: 'removed',
        output: '【内容已下架】因投诉或合规处理，该内容已不可访问。',
        imageUrl: null,
        imageUrls: '[]',
        imageMeta: '[]',
        error: 'removed_by_complaint'
      }
    });

    await prisma.complaint.update({
      where: { id: complaint.id },
      data: {
        status: 'resolved',
        note: req.body?.note || '已下架生成内容',
        resolvedAt: new Date()
      }
    });

    console.log('[complaint] takedown', complaint.id, 'record=', record.id);
    await logTask(record.id, 'warn', 'takedown by complaint', { complaintId: complaint.id });
    res.json({ code: 200, data: { message: '已下架', recordId: record.id } });
  } catch (err) {
    console.error('[complaint:takedown]', err);
    res.status(500).json({ code: 500, message: '下架失败' });
  }
});

export default router;
