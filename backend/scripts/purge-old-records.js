/**
 * 清理超过留存期的生成记录、本地配图与任务日志。
 * 用法：node scripts/purge-old-records.js
 * 环境变量：RECORD_RETENTION_DAYS=180（可选）
 *
 * 生产可由进程内 AUTO_PURGE 定时执行；本脚本供手动 / cron 调用。
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { purgeExpiredRecords } from '../src/lib/retention.js';

const result = await purgeExpiredRecords();

console.log(
  `[purge-old-records] retention=${result.days}d cutoff=${result.cutoff} records=${result.records} files=${result.files} taskLogs=${result.taskLogs}`
);

await prisma.$disconnect();
