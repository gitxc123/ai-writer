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

/** 当天第 N 次提交起开始轮流提醒（含第 N 次） */
export const QUALITY_TIP_FROM_COUNT = 11;

/** 润色后的质量提醒，按提交次数轮流展示 */
export const QUALITY_TIPS = [
  '少做几条、打磨到位，比堆一堆半成品更有爆款机会。',
  '内容贵在精准：先想清楚读者要什么，再动笔往往更稳。',
  '宁可少发一条精品，也不要用数量稀释质量。',
  '热点会过，表达力留得住——把这一条写透再说。',
  '节奏放慢一点：选题、标题、结构各抠一遍，转化通常更好。'
];

/** @deprecated 兼容旧引用；请用 pickQualityTip / QUALITY_TIPS */
export const QUALITY_OVER_QUANTITY_TIP = QUALITY_TIPS[0];

/**
 * @param {number} usedAfter 含本次在内的今日已用次数
 * @returns {string | null}
 */
export function pickQualityTip(usedAfter) {
  const n = Math.floor(Number(usedAfter) || 0);
  if (n < QUALITY_TIP_FROM_COUNT) return null;
  const idx = (n - QUALITY_TIP_FROM_COUNT) % QUALITY_TIPS.length;
  return QUALITY_TIPS[idx];
}