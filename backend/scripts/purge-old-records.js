/**
 * 清理超过留存期的生成记录（默认 180 天）。
 * 用法：node scripts/purge-old-records.js
 * 环境变量：RECORD_RETENTION_DAYS=180（可选）
 *
 * 默认不挂 cron，请按需手动执行。
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

const days = Number(process.env.RECORD_RETENTION_DAYS || 180);
const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const result = await prisma.generationRecord.deleteMany({
  where: { createdAt: { lt: cutoff } }
});

console.log(
  `[purge-old-records] retention=${days}d cutoff=${cutoff.toISOString()} deleted=${result.count}`
);

await prisma.$disconnect();
