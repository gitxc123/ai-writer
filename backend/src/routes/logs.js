import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  canViewLogs,
  clampLogLimit,
  backfillTaskLogsFromRecords,
  maskPhone,
  parseLogMeta,
  isRegisterLogTaskId,
  SYS_REGISTER_TASK_ID
} from '../lib/logger.js';

const router = Router();

async function requireLogViewer(req, res, next) {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || !canViewLogs(user.phone)) {
    return res.status(403).json({ code: 403, message: '无日志查看权限' });
  }
  req.logViewer = user;
  return next();
}

router.get('/meta', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  res.json({
    code: 200,
    data: {
      canViewLogs: canViewLogs(user?.phone),
      modules: ['tasks', 'register']
    }
  });
});

router.get('/', authMiddleware, requireLogViewer, async (req, res) => {
  try {
    // 首次查询时把历史任务补成可检索摘要（仅任务模块）
    const module = String(req.query.module || 'tasks').trim() || 'tasks';
    if (module !== 'register') {
      try {
        const n = await backfillTaskLogsFromRecords();
        if (n) console.log('[logs] backfilled', n);
      } catch (err) {
        console.warn('[logs] backfill', err.message);
      }
    }

    const taskId = String(req.query.taskId || '').trim() || undefined;
    const q = String(req.query.q || '').trim() || undefined;
    const limit = clampLogLimit(req.query.limit);
    const before = String(req.query.before || '').trim();

    const where = {};
    if (module === 'register') {
      where.taskId = SYS_REGISTER_TASK_ID;
      if (q) {
        where.OR = [
          { message: { contains: q } },
          { meta: { contains: q } }
        ];
      }
    } else {
      // 任务日志：排除系统模块
      where.NOT = { taskId: SYS_REGISTER_TASK_ID };
      if (taskId) {
        where.taskId = { contains: taskId.replace(/…/g, '').replace(/\.\.\./g, '') };
      }
      if (q) {
        where.message = { contains: q };
      }
    }

    if (before) {
      const d = new Date(before);
      if (!Number.isNaN(d.getTime())) where.createdAt = { lt: d };
    }

    const rows = await prisma.taskLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    const taskIds = [
      ...new Set(
        rows
          .map((r) => r.taskId)
          .filter((id) => id && !isRegisterLogTaskId(id))
      )
    ];
    const ownerByTask = new Map();
    if (taskIds.length) {
      const records = await prisma.generationRecord.findMany({
        where: { id: { in: taskIds } },
        select: {
          id: true,
          user: { select: { nickName: true, phone: true } }
        }
      });
      for (const rec of records) {
        ownerByTask.set(rec.id, {
          nickName: rec.user?.nickName || '',
          phone: rec.user?.phone || ''
        });
      }
    }

    res.json({
      code: 200,
      data: {
        module,
        items: rows.map((r) => {
          const metaObj = parseLogMeta(r.meta);
          if (isRegisterLogTaskId(r.taskId) || metaObj.module === 'register') {
            return {
              id: r.id,
              module: 'register',
              taskId: r.taskId,
              level: r.level,
              message: r.message,
              meta: r.meta,
              createdAt: r.createdAt,
              userId: metaObj.userId || '',
              nickName: metaObj.nickName || '',
              phone: maskPhone(metaObj.phone || '')
            };
          }
          const owner = (r.taskId && ownerByTask.get(r.taskId)) || {};
          return {
            id: r.id,
            module: 'tasks',
            taskId: r.taskId,
            level: r.level,
            message: r.message,
            meta: r.meta,
            createdAt: r.createdAt,
            nickName: owner.nickName || '',
            phone: maskPhone(owner.phone || '')
          };
        })
      }
    });
  } catch (err) {
    console.error('[logs]', err);
    res.status(500).json({ code: 500, message: '读取日志失败' });
  }
});

export default router;
