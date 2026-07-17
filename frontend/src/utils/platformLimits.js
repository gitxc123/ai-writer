/** 今日头条标题栏上限（汉字/字母均按 1 字计） */
export const TOUTIAO_TITLE_MAX = 30;
/** 今日头条「图片描述」上限 */
export const TOUTIAO_CAPTION_MAX = 50;

export function charLen(text = '') {
  return Array.from(String(text)).length;
}

/**
 * 按平台字数上限裁切，优先在标点处断开
 */
export function clampChars(text = '', max = 30, ellipsis = false) {
  const raw = String(text || '').trim();
  if (!raw || max <= 0) return '';
  const chars = Array.from(raw);
  if (chars.length <= max) return raw;

  const budget = ellipsis ? Math.max(1, max - 1) : max;
  let cut = budget;
  const window = chars.slice(0, budget);
  for (let i = window.length - 1; i >= Math.floor(budget * 0.4); i -= 1) {
    if (/[！？。，、；：!?,;:…]/.test(window[i])) {
      cut = i + 1;
      break;
    }
  }
  const out = chars.slice(0, cut).join('').trim();
  return ellipsis ? `${out}…` : out;
}

export function clampToutiaoTitle(title = '') {
  return clampChars(title, TOUTIAO_TITLE_MAX, false);
}

export function clampToutiaoCaption(caption = '') {
  // 去掉「图N：」前缀，只保留描述本体，便于粘贴进图片描述框
  const cleaned = String(caption || '')
    .replace(/^图\s*\d+\s*[:：]\s*/u, '')
    .trim();
  return clampChars(cleaned, TOUTIAO_CAPTION_MAX, false);
}
