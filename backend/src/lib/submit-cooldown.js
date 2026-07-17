/**
 * 单用户提交冷却（内存；单实例有效）。
 */

const lastSubmitAt = new Map();

export const DEFAULT_SUBMIT_COOLDOWN_MS = 5000;

export function getSubmitCooldownMs() {
  const n = Number(process.env.GENERATE_SUBMIT_COOLDOWN_MS);
  if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  return DEFAULT_SUBMIT_COOLDOWN_MS;
}

/**
 * @returns {null | { retryAfterSec: number, message: string }}
 * null = 可提交；非 null 时勿继续，并应在允许后再标记
 */
export function checkSubmitCooldown(userId, cooldownMs = getSubmitCooldownMs()) {
  if (!userId || cooldownMs <= 0) return null;
  const last = lastSubmitAt.get(userId) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < cooldownMs) {
    const retryAfterSec = Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
    return {
      retryAfterSec,
      message: `提交过快，请 ${retryAfterSec} 秒后再试`
    };
  }
  return null;
}

/** 仅在业务校验通过、即将创建任务前调用 */
export function markSubmitCooldown(userId) {
  if (!userId) return;
  lastSubmitAt.set(userId, Date.now());
}

export function clearSubmitCooldown(userId) {
  if (userId) lastSubmitAt.delete(userId);
}

export const QUALITY_OVER_QUANTITY_TIP = '不要堆数量，爆款靠精而不靠多';
