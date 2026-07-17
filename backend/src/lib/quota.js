import { prisma } from './prisma.js';
import { getDailyGenerateLimit } from './security-config.js';

export function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function countGenerationsSince(userId, since) {
  return prisma.generationRecord.count({
    where: {
      userId,
      createdAt: { gte: since }
    }
  });
}

/**
 * @returns {Promise<null | { used: number, limit: number, message: string }>}
 * null = 未超限
 */
export async function checkDailyGenerateQuota(userId) {
  const limit = getDailyGenerateLimit();
  const used = await countGenerationsSince(userId, startOfLocalDay());
  if (used >= limit) {
    return {
      used,
      limit,
      message: `今日创作次数已达上限（${limit} 次），请明天再试`
    };
  }
  return null;
}
