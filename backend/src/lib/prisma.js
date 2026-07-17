import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/** SQLite 写锁时读请求等待，减轻任务生成中列表加载失败 */
prisma
  .$queryRawUnsafe('PRAGMA busy_timeout = 15000')
  .catch((err) => console.warn('[prisma] busy_timeout', err.message));
