import { randomBytes } from 'crypto';
import { prisma } from './prisma.js';
import {
  MASTER_ACTIVATION_CODE,
  ACTIVATION_CODE_DAYS,
  normalizeActivationCode,
  isValidMasterActivationCode,
  resolveActivationExpiry,
  getCodePlanPreset,
  CODE_PLAN_PRESETS,
  canIssueActivationCodes,
  genInviteCode
} from './membership.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function genActivationCodeValue(len = 8) {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return out;
}

function codeStatus(row) {
  if (row.disabled) return 'disabled';
  if (row.usedCount >= row.maxUses) return 'used_up';
  if (row.usedCount > 0) return 'partial';
  return 'unused';
}

function statusLabel(status) {
  const map = {
    unused: '未使用',
    partial: '部分使用',
    used_up: '已用完',
    disabled: '已停用'
  };
  return map[status] || status;
}

export async function ensureCodeIssuerPrivileges(phone = '17682160819') {
  const user = await prisma.user.findUnique({ where: { phone: String(phone) } });
  if (!user) return null;
  if (user.isAgent && user.inviteCode) return user;
  return prisma.user.update({
    where: { id: user.id },
    data: {
      isAgent: true,
      agentRate: user.agentRate > 0 ? user.agentRate : 0.5,
      inviteCode: user.inviteCode || genInviteCode(),
      ...(user.memberPlan === 'none' || !user.memberPlan
        ? { memberPlan: 'lifetime', memberExpireAt: null }
        : {})
    }
  });
}

export async function createActivationCodes({
  agentId = null,
  count = 1,
  days,
  maxUses = 1,
  note = '',
  planId = 'trial'
} = {}) {
  const preset = getCodePlanPreset(planId) || getCodePlanPreset('trial');
  const n = Math.min(100, Math.max(1, Math.floor(Number(count) || 1)));
  const d =
    days != null && Number.isFinite(Number(days))
      ? Math.min(3650, Math.max(0, Math.floor(Number(days))))
      : preset.days;
  const uses = Math.min(1000, Math.max(1, Math.floor(Number(maxUses) || 1)));
  const created = [];

  for (let i = 0; i < n; i += 1) {
    let code = genActivationCodeValue(8);
    for (let retry = 0; retry < 8; retry += 1) {
      const exists = await prisma.activationCode.findUnique({ where: { code } });
      if (!exists) break;
      code = genActivationCodeValue(8);
    }
    const row = await prisma.activationCode.create({
      data: {
        code,
        agentId: agentId || null,
        planId: preset.planId,
        days: d,
        maxUses: uses,
        usedCount: 0,
        note: String(note || '').slice(0, 200),
        disabled: false
      }
    });
    created.push(row);
  }
  return created;
}

/**
 * 兑换激活码：万能码不限次；库存码按次核销并记账。
 */
export async function redeemActivationCode(user, rawCode) {
  const code = normalizeActivationCode(rawCode);
  if (!code) {
    const err = new Error('请输入激活码');
    err.status = 400;
    throw err;
  }

  if (isValidMasterActivationCode(code)) {
    const resolved = resolveActivationExpiry(user, ACTIVATION_CODE_DAYS);
    if (resolved.error) {
      const err = new Error(resolved.error);
      err.status = resolved.status || 400;
      throw err;
    }
    return {
      days: ACTIVATION_CODE_DAYS,
      expireAt: resolved.expireAt,
      lifetime: false,
      planId: 'code',
      agentId: null,
      code: MASTER_ACTIVATION_CODE,
      source: 'master'
    };
  }

  const stock = await prisma.activationCode.findUnique({ where: { code } });
  if (!stock || stock.disabled) {
    const err = new Error('激活码无效');
    err.status = 400;
    throw err;
  }
  if (stock.usedCount >= stock.maxUses) {
    const err = new Error('激活码已用完');
    err.status = 400;
    throw err;
  }

  const planId = stock.planId || 'code';
  const resolved = resolveActivationExpiry(user, stock.days);
  if (resolved.error) {
    const err = new Error(resolved.error);
    err.status = resolved.status || 400;
    throw err;
  }

  const updated = await prisma.activationCode.updateMany({
    where: {
      id: stock.id,
      usedCount: stock.usedCount,
      disabled: false
    },
    data: { usedCount: { increment: 1 } }
  });
  if (updated.count !== 1) {
    const err = new Error('激活码刚被使用，请换一个码');
    err.status = 409;
    throw err;
  }

  await prisma.activationRedeem.create({
    data: {
      codeId: stock.id,
      code: stock.code,
      agentId: stock.agentId || null,
      userId: user.id,
      days: stock.days,
      planId,
      phoneMask: maskPhone(user.phone)
    }
  });

  return {
    days: stock.days,
    expireAt: resolved.expireAt,
    lifetime: Boolean(resolved.lifetime) || planId === 'lifetime' || stock.days <= 0,
    planId: planId === 'lifetime' || stock.days <= 0 ? 'lifetime' : planId,
    agentId: stock.agentId || null,
    code: stock.code,
    source: 'stock'
  };
}

function maskPhone(phone) {
  const p = String(phone || '');
  if (!/^1\d{10}$/.test(p)) return p ? '***' : '';
  return `${p.slice(0, 3)}****${p.slice(-4)}`;
}

export async function listAgentCodes(agentId) {
  const codes = await prisma.activationCode.findMany({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
    take: 300
  });
  const redeems = await prisma.activationRedeem.findMany({
    where: { agentId },
    orderBy: { createdAt: 'desc' },
    take: 100
  });

  const redeemsByCode = new Map();
  for (const r of redeems) {
    const list = redeemsByCode.get(r.code) || [];
    list.push(r);
    redeemsByCode.set(r.code, list);
  }

  const unused = codes.filter((c) => !c.disabled && c.usedCount < c.maxUses).length;
  const used = codes.reduce((s, c) => s + Math.min(c.usedCount, c.maxUses), 0);

  return {
    plans: CODE_PLAN_PRESETS,
    canCreate: true,
    summary: {
      total: codes.length,
      unused,
      usedSlots: used
    },
    codes: codes.map((c) => {
      const status = codeStatus(c);
      const preset = getCodePlanPreset(c.planId);
      const linked = (redeemsByCode.get(c.code) || []).map((r) => ({
        userId: r.userId,
        phoneMask: r.phoneMask || '',
        days: r.days,
        planId: r.planId || c.planId,
        createdAt: r.createdAt
      }));
      return {
        id: c.id,
        code: c.code,
        planId: c.planId || 'trial',
        planName: preset?.name || c.planId || '会员',
        days: c.days,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        remaining: Math.max(0, c.maxUses - c.usedCount),
        disabled: c.disabled,
        status,
        statusLabel: statusLabel(status),
        note: c.note || '',
        createdAt: c.createdAt,
        linkedAccounts: linked
      };
    }),
    redeems: redeems.map((r) => {
      const preset = getCodePlanPreset(r.planId);
      return {
        id: r.id,
        code: r.code,
        days: r.days,
        planId: r.planId || '',
        planName: preset?.name || r.planId || '',
        phoneMask: r.phoneMask || '',
        userId: r.userId,
        createdAt: r.createdAt
      };
    })
  };
}

export { canIssueActivationCodes, CODE_PLAN_PRESETS };
