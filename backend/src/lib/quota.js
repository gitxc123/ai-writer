import { prisma } from './prisma.js';
import { getDailyGenerateLimit } from './security-config.js';
import { QUALITY_OVER_QUANTITY_TIP } from './submit-cooldown.js';

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

/** 今日已用次数（不含本次） */
export async function getDailyGenerateUsage(userId) {
  const limit = getDailyGenerateLimit();
  const used = await countGenerationsSince(userId, startOfLocalDay());
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * @returns {Promise<null | { used: number, limit: number, message: string }>}
 * null = 未超限
 */
export async function checkDailyGenerateQuota(userId) {
  const { used, limit } = await getDailyGenerateUsage(userId);
  if (used >= limit) {
    return {
      used,
      limit,
      message: `今日创作次数已达上限（${limit} 次）。${QUALITY_OVER_QUANTITY_TIP}。请明天再试`
    };
  }
  return null;
}
