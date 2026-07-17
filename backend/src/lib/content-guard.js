/**
 * 基础内容安全拦截（关键词级，非完整审核方案）。
 * 命中则拒绝生成；正式商用仍需接专业审核服务。
 */

const BLOCK_PATTERNS = [
  /制作炸弹|爆炸物教程|枪支买卖/,
  /儿童色情|幼女|恋童/,
  /代孕中介|出售器官/,
  /伪造证件|假钞制作|洗钱教程/
];

/**
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function checkUserContentSafety(text) {
  const raw = String(text || '');
  if (!raw.trim()) return { ok: true };
  for (const re of BLOCK_PATTERNS) {
    if (re.test(raw)) {
      return {
        ok: false,
        message: '提交内容包含不允许的用途，已拒绝生成。如有疑问请通过投诉与反馈联系运营。'
      };
    }
  }
  return { ok: true };
}

export function checkInputsSafety(inputs = {}) {
  const parts = Object.values(inputs || {}).map((v) => String(v ?? ''));
  return checkUserContentSafety(parts.join('\n'));
}
