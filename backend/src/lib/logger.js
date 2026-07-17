import { prisma } from './prisma.js';

/** 仅允许环境变量配置；不再内置默认手机号，避免源码泄露运营身份 */
export const DEFAULT_LOG_VIEWER_PHONE = '';
export const DEFAULT_LOG_LIMIT = 100;
export const MAX_LOG_LIMIT = 200;
export const DEFAULT_TASK_LOG_RETENTION_DAYS = 7;
export const MAX_TASK_LOG_ROWS = 5000;

export function getLogViewerPhone() {
  return String(process.env.LOG_VIEWER_PHONE || '').trim();
}

export function canViewLogs(phone) {
  const viewer = getLogViewerPhone();
  return Boolean(viewer) && Boolean(phone) && String(phone) === viewer;
}

/** 138****8000 */
export function maskPhone(phone) {
  const p = String(phone || '').trim();
  if (!/^1\d{10}$/.test(p)) return p ? '***' : '';
  return `${p.slice(0, 3)}****${p.slice(7)}`;
}

export function clampLogLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LOG_LIMIT;
  return Math.min(MAX_LOG_LIMIT, Math.floor(n));
}

export function serializeMeta(meta) {
  if (meta == null) return null;
  if (typeof meta === 'string') return meta.slice(0, 2000);
  try {
    return JSON.stringify(meta).slice(0, 2000);
  } catch {
    return null;
  }
}

/**
 * Persist task log + console. Never throws to caller.
 */
export async function logTask(taskId, level, message, meta) {
  const lvl = ['info', 'warn', 'error'].includes(level) ? level : 'info';
  const msg = String(message || '').slice(0, 2000);
  const metaStr = serializeMeta(meta);
  const prefix = `[task:${lvl}]`;
  const line = taskId ? `${prefix} ${taskId} ${msg}` : `${prefix} ${msg}`;
  if (lvl === 'error') console.error(line, metaStr || '');
  else if (lvl === 'warn') console.warn(line, metaStr || '');
  else console.log(line, metaStr || '');

  try {
    await prisma.taskLog.create({
      data: {
        taskId: taskId || null,
        level: lvl,
        message: msg,
        meta: metaStr
      }
    });
  } catch (err) {
    console.warn('[logger] write failed', err.message);
  }
}

/** 把历史任务补一条摘要日志，便于按任务 ID 检索（仅当 TaskLog 为空时） */
export async function backfillTaskLogsFromRecords(limit = 80) {
  const existing = await prisma.taskLog.count();
  if (existing > 0) return 0;

  const records = await prisma.generationRecord.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      status: true,
      error: true,
      createdAt: true,
      updatedAt: true
    }
  });

  let written = 0;
  for (const r of records) {
    const level = r.status === 'failed' ? 'error' : r.status === 'removed' ? 'warn' : 'info';
    const errPart = r.error ? ` · ${String(r.error).slice(0, 120)}` : '';
    try {
      await prisma.taskLog.create({
        data: {
          taskId: r.id,
          level,
          message: `历史任务摘要 status=${r.status}${errPart}`,
          meta: serializeMeta({ backfill: true }),
          createdAt: r.updatedAt || r.createdAt
        }
      });
      written += 1;
    } catch (err) {
      console.warn('[logger] backfill failed', r.id, err.message);
    }
  }
  return written;
}

export async function purgeTaskLogs() {
  const days = Number(process.env.TASK_LOG_RETENTION_DAYS || DEFAULT_TASK_LOG_RETENTION_DAYS);
  const cutoff = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
  let deleted = 0;
  try {
    const byAge = await prisma.taskLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    deleted += byAge.count;
  } catch (err) {
    console.warn('[logger] purge by age failed', err.message);
  }
  try {
    const count = await prisma.taskLog.count();
    if (count > MAX_TASK_LOG_ROWS) {
      const overflow = count - MAX_TASK_LOG_ROWS;
      const old = await prisma.taskLog.findMany({
        orderBy: { createdAt: 'asc' },
        take: overflow,
        select: { id: true }
      });
      if (old.length) {
        const r = await prisma.taskLog.deleteMany({
          where: { id: { in: old.map((x) => x.id) } }
        });
        deleted += r.count;
      }
    }
  } catch (err) {
    console.warn('[logger] purge by count failed', err.message);
  }
  return deleted;
}
