import { prisma } from './prisma.js';
import { deleteUploadFilesForRecord } from './upload-cleanup.js';
import { purgeTaskLogs } from './logger.js';

export function getRecordRetentionDays() {
  const n = Number(process.env.RECORD_RETENTION_DAYS || 180);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 180;
}

/**
 * 删除超过留存期的生成记录及本地配图，并清理 TaskLog。
 * @returns {{ records: number, files: number, taskLogs: number, cutoff: string }}
 */
export async function purgeExpiredRecords() {
  const days = getRecordRetentionDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const old = await prisma.generationRecord.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, imageUrl: true, imageUrls: true, imageMeta: true }
  });

  let files = 0;
  for (const r of old) {
    files += deleteUploadFilesForRecord(r);
  }

  const ids = old.map((r) => r.id);
  if (ids.length) {
    await prisma.taskLog.deleteMany({ where: { taskId: { in: ids } } });
  }

  const result = await prisma.generationRecord.deleteMany({
    where: { createdAt: { lt: cutoff } }
  });

  const taskLogs = await purgeTaskLogs();

  return {
    records: result.count,
    files,
    taskLogs,
    cutoff: cutoff.toISOString(),
    days
  };
}

let purgeTimer = null;

/** 启动时跑一次 + 按天定时（单实例） */
export function startRetentionScheduler() {
  const enabled = String(process.env.AUTO_PURGE || '1').trim();
  if (/^(0|false|off|no)$/i.test(enabled)) {
    console.log('[purge] AUTO_PURGE disabled');
    return;
  }

  const run = async (reason) => {
    try {
      const r = await purgeExpiredRecords();
      console.log(
        `[purge] ${reason} days=${r.days} records=${r.records} files=${r.files} taskLogs=${r.taskLogs}`
      );
    } catch (err) {
      console.warn('[purge] failed', err.message);
    }
  };

  // 启动后稍晚执行，避免拖慢 listen
  setTimeout(() => run('boot'), 15_000).unref?.();

  const intervalMs = Number(process.env.AUTO_PURGE_INTERVAL_MS || 24 * 60 * 60 * 1000);
  if (purgeTimer) clearInterval(purgeTimer);
  purgeTimer = setInterval(() => run('interval'), Math.max(intervalMs, 60_000));
  purgeTimer.unref?.();
}
