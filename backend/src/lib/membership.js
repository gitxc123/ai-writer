/**
 * 会员套餐定义
 * trial: 试用3天 | monthly: 包月 | yearly: 包年 | lifetime: 永久会员+永久代理(分成50%)
 */
export const MEMBER_PLANS = [
  {
    id: 'trial',
    name: '试用会员',
    price: 9.9,
    days: 3,
    badge: '体验',
    desc: '开通后可体验全部 AI 创作功能 3 天',
    features: ['全部模板', '图文一键生成', '网络搜图', '有效期 3 天']
  },
  {
    id: 'monthly',
    name: '包月会员',
    price: 59.9,
    days: 30,
    badge: '月卡',
    desc: '按月开通，灵活使用',
    features: ['全部模板', '图文一键生成', '网络搜图', '热门选题', '有效期 30 天']
  },
  {
    id: 'yearly',
    name: '包年会员',
    price: 299,
    days: 365,
    badge: '年卡',
    desc: '更划算，全年畅用',
    features: ['全部模板', '图文一键生成', '网络搜图', '热门选题', '优先生成队列', '有效期 365 天']
  },
  {
    id: 'lifetime',
    name: '永久会员 + 代理',
    price: 499,
    days: 0, // 0 = 永久
    badge: '永久',
    desc: '永久会员权益，并成为永久代理，下级充值分成 50%',
    features: ['永久会员全部权益', '永久代理身份', '下级开通会员分成 50%', '专属邀请码', '代理收益可查看'],
    isAgent: true,
    agentRate: 0.5
  }
];

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
  if (!isMemberActive(user)) return '已过期';
  if (user.memberPlan === 'lifetime') return user.isAgent ? '永久会员·代理' : '永久会员';
  const map = { trial: '试用会员', monthly: '包月会员', yearly: '包年会员' };
  return map[user.memberPlan] || '会员';
}

export function genInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
