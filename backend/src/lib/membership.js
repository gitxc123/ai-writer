/**
 * 会员套餐定义
 * trial / monthly / yearly / lifetime（成为代理：永久权益 + 固定比例返现）
 * 代理档不支持在线自助支付，联系客服开通
 */
export const MEMBER_PLANS = [
  {
    id: 'trial',
    name: '试用会员',
    price: 9.9,
    days: 3,
    badge: '体验',
    desc: '开通后可体验全部 AI 创作功能 3 天',
    features: ['全部模板', '图文一键生成', '网络搜图', '每日最多 30 次创作', '单次最多 5 张配图', '有效期 3 天']
  },
  {
    id: 'monthly',
    name: '包月会员',
    price: 59.9,
    days: 30,
    badge: '月卡',
    desc: '按月开通，灵活使用',
    features: ['全部模板', '图文一键生成', '网络搜图', '热门选题', '每日最多 30 次创作', '单次最多 5 张配图', '有效期 30 天']
  },
  {
    id: 'yearly',
    name: '包年会员',
    price: 299,
    days: 365,
    badge: '年卡',
    desc: '更划算，全年畅用',
    features: ['全部模板', '图文一键生成', '网络搜图', '热门选题', '每日最多 30 次创作', '单次最多 5 张配图', '有效期 365 天']
  },
  {
    id: 'lifetime',
    name: '成为代理',
    price: 499,
    days: 0, // 0 = 永久
    badge: '代理',
    isAgent: true,
    agentRate: 0.5,
    desc: '享受全部创作权益的永久使用权，并终身获得固定比例返现',
    features: [
      '永久解锁本产品全部创作能力',
      '全部模板、图文生成与配图能力',
      '每日最多 30 次创作，单次最多 5 张配图',
      '终身固定比例返现（卖码结算）',
      '联系客服开通'
    ]
  }
];

/** 与「成为代理」档一致，供配置接口返回 */
export const AGENT_PROGRAM = {
  id: 'agent',
  name: '成为代理',
  badge: '代理',
  rate: 0.5,
  price: 499,
  desc: '享受全部创作权益的永久使用权，并终身获得固定比例返现',
  features: [
    '永久解锁本产品全部创作能力',
    '全部模板、图文生成与配图能力',
    '每日最多 30 次创作，单次最多 5 张配图',
    '终身固定比例返现（卖码结算）',
    '联系客服开通'
  ]
};

export function getPlan(planId) {
  return MEMBER_PLANS.find((p) => p.id === planId) || null;
}

export function calcExpireAt(fromDate, days) {
  if (!days || days <= 0) return null; // 永久
  const d = new Date(fromDate);
  d.setDate(d.getDate() + days);
  return d;
}

export function isMemberActive(user) {
  if (!user) return false;
  if (user.memberPlan === 'lifetime' || user.isLifetime) return true;
  if (!user.memberExpireAt) return false;
  return new Date(user.memberExpireAt).getTime() > Date.now();
}

export function formatMemberLabel(user) {
  if (!user) return '未开通';
  if (isMemberActive(user)) {
    if (user.memberPlan === 'lifetime' || user.isAgent) return '代理';
    const map = { trial: '试用会员', monthly: '包月会员', yearly: '包年会员', code: '激活码会员' };
    return map[user.memberPlan] || '会员';
  }
  // 从未开通过（默认 none / 空）与曾经开通过但已到期区分开
  const plan = String(user.memberPlan || 'none').trim();
  if (!plan || plan === 'none') return '未开通';
  return '已过期';
}

/** 激活码对应的四档会员 */
export const CODE_PLAN_PRESETS = [
  { planId: 'trial', name: '试用会员', days: 3, price: 9.9 },
  { planId: 'monthly', name: '包月会员', days: 30, price: 59.9 },
  { planId: 'yearly', name: '包年会员', days: 365, price: 299 },
  { planId: 'lifetime', name: '永久会员', days: 0, price: 499 }
];

export function getCodePlanPreset(planId) {
  return CODE_PLAN_PRESETS.find((p) => p.planId === planId) || null;
}

/** 可在会员中心自助创建激活码的账号（逗号分隔）；默认含运营号 */
export function getCodeIssuerPhones() {
  const raw = String(process.env.CODE_ISSUER_PHONES || '').trim();
  const list = raw
    ? raw.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
    : [];
  if (!list.includes('17682160819')) list.push('17682160819');
  return list;
}

export function canIssueActivationCodes(user) {
  if (!user?.phone) return false;
  return getCodeIssuerPhones().includes(String(user.phone));
}

/** 写死万能激活码：不限次数；单次兑换有效期见 ACTIVATION_CODE_DAYS */
export const MASTER_ACTIVATION_CODE = 'admin666666';
export const ACTIVATION_CODE_DAYS = 3;

export function normalizeActivationCode(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '');
}

export function isValidMasterActivationCode(raw) {
  return normalizeActivationCode(raw) === MASTER_ACTIVATION_CODE;
}

/**
 * 计算激活后到期日：未过期则从当前到期日顺延，否则从现在起算。
 * days<=0 表示永久会员。
 * @returns {{ expireAt: Date|null, base: Date, lifetime?: boolean } | { error: string, status: number }}
 */
export function resolveActivationExpiry(user, days = ACTIVATION_CODE_DAYS, now = new Date()) {
  if (user?.memberPlan === 'lifetime' || user?.isLifetime) {
    return { error: '您已是永久会员，无需再激活', status: 400 };
  }
  if (!days || days <= 0) {
    return { expireAt: null, base: now, lifetime: true };
  }
  let base = now;
  if (
    user?.memberExpireAt &&
    new Date(user.memberExpireAt).getTime() > now.getTime() &&
    user.memberPlan !== 'lifetime'
  ) {
    base = new Date(user.memberExpireAt);
  }
  return { expireAt: calcExpireAt(base, days), base };
}
