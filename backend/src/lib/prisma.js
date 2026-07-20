import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/** SQLite：写锁等待 + WAL，减轻多人并发读写互相卡住 */
async function initSqlite() {
  try {
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 15000');
  } catch (err) {
    console.warn('[prisma] busy_timeout', err.message);
  }
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
  } catch (err) {
    console.warn('[prisma] journal_mode WAL', err.message);
  }
}

initSqlite();
