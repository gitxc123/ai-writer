const STORAGE_KEY = 'promo_ref_code';
const STORAGE_AT = 'promo_ref_at';
const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16);
}

function parseQuery(search) {
  const q = String(search || '').replace(/^\?/, '');
  const out = {};
  if (!q) return out;
  for (const part of q.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/** 从当前地址解析 ref / invite / inviteCode */
export function extractRefFromLocation() {
  try {
    if (typeof location === 'undefined') return '';
    const fromSearch = parseQuery(location.search);
    let fromHash = {};
    const hash = String(location.hash || '');
    const qi = hash.indexOf('?');
    if (qi >= 0) fromHash = parseQuery(hash.slice(qi));
    const raw = fromSearch.ref || fromSearch.invite || fromSearch.inviteCode
      || fromHash.ref || fromHash.invite || fromHash.inviteCode
      || '';
    return normalizeCode(raw);
  } catch {
    return '';
  }
}

export function savePromoRef(code) {
  const c = normalizeCode(code);
  if (!c) return;
  try {
    uni.setStorageSync(STORAGE_KEY, c);
    uni.setStorageSync(STORAGE_AT, String(Date.now()));
  } catch {
    // ignore
  }
}

export function capturePromoRefFromUrl() {
  const code = extractRefFromLocation();
  if (code) savePromoRef(code);
  return code;
}

export function getStoredPromoRef() {
  try {
    const code = normalizeCode(uni.getStorageSync(STORAGE_KEY));
    if (!code) return '';
    const at = Number(uni.getStorageSync(STORAGE_AT) || 0);
    if (at && Date.now() - at > REF_TTL_MS) {
      clearPromoRef();
      return '';
    }
    return code;
  } catch {
    return '';
  }
}

export function clearPromoRef() {
  try {
    uni.removeStorageSync(STORAGE_KEY);
    uni.removeStorageSync(STORAGE_AT);
  } catch {
    // ignore
  }
}

/** 注册用：优先手工输入，否则用链接带来的 ref */
export function resolveInviteCodeForRegister(manual) {
  const typed = normalizeCode(manual);
  if (typed) return typed;
  return getStoredPromoRef();
}

export function buildPromoLink(inviteCode) {
  const code = normalizeCode(inviteCode);
  if (!code) return '';
  try {
    if (typeof location !== 'undefined' && location.origin) {
      // H5 hash 路由：落到首页并带 ref，注册时自动带上
      return `${location.origin}/#/?ref=${encodeURIComponent(code)}`;
    }
  } catch {
    // ignore
  }
  return `/?ref=${encodeURIComponent(code)}`;
}
