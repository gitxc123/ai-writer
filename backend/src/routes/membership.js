import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  MEMBER_PLANS,
  AGENT_PROGRAM,
  getPlan,
  calcExpireAt,
  isMemberActive,
  formatMemberLabel,
  genInviteCode,
  ACTIVATION_CODE_DAYS,
  canIssueActivationCodes,
  CODE_PLAN_PRESETS
} from '../lib/membership.js';
import { isDemoPayEnabled, getDailyGenerateLimit } from '../lib/security-config.js';
import {
  createActivationCodes,
  redeemActivationCode,
  listAgentCodes,
  ensureCodeIssuerPrivileges
} from '../lib/activation-codes.js';

const router = Router();

function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN || '';
  if (!token) {
    return res.status(503).json({ code: 503, message: '未配置 ADMIN_TOKEN' });
  }
  const header =
    req.headers['x-admin-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (header !== token) {
    return res.status(401).json({ code: 401, message: '无权限' });
  }
  return next();
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    phone: user.phone,
    nickName: user.nickName,
    memberPlan: user.memberPlan || 'none',
    memberExpireAt: user.memberExpireAt,
    isMember: isMemberActive(user),
    memberLabel: formatMemberLabel(user),
    isAgent: !!user.isAgent,
    canIssueCodes: canIssueActivationCodes(user),
    agentRate: user.isAgent ? Number(user.agentRate || 0.5) : 0,
    inviteCode: user.inviteCode || '',
    createdAt: user.createdAt
  };
}

router.get('/config', (_req, res) => {
  res.json({
    code: 200,
    data: {
      demoPayEnabled: isDemoPayEnabled(),
      dailyGenerateLimit: getDailyGenerateLimit(),
      activationCodeDays: ACTIVATION_CODE_DAYS,
      codePlans: CODE_PLAN_PRESETS,
      agentProgram: AGENT_PROGRAM
    }
  });
});

router.get('/plans', (_req, res) => {
  res.json({ code: 200, data: MEMBER_PLANS });
});

router.get('/me', authMiddleware, async (req, res) => {
  await ensureCodeIssuerPrivileges('17682160819').catch(() => null);
  let user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
  if (canIssueActivationCodes(user) && !user.isAgent) {
    user = (await ensureCodeIssuerPrivileges(user.phone)) || user;
  }

  let commissionSummary = null;
  if (user.isAgent) {
    const rows = await prisma.agentCommission.findMany({
      where: { agentId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    commissionSummary = {
      total,
      recent: rows.map((r) => ({
        id: r.id,
        amount: r.amount,
        rate: r.rate,
        orderAmount: r.orderAmount,
        status: r.status,
        createdAt: r.createdAt
      }))
    };
  }

  res.json({
    code: 200,
    data: {
      user: publicUser(user),
      commission: commissionSummary
    }
  });
});

/** 创建订单（模拟支付前） */
router.post('/order', authMiddleware, async (req, res) => {
  try {
    if (!isDemoPayEnabled()) {
      return res.status(503).json({
        code: 503,
        message: '在线支付暂未开通，请联系运营开通会员'
      });
    }
    const { planId } = req.body || {};
    const plan = getPlan(planId);
    if (!plan) return res.status(400).json({ code: 400, message: '套餐不存在' });

    const order = await prisma.membershipOrder.create({
      data: {
        userId: req.userId,
        planId: plan.id,
        planName: plan.name,
        amount: plan.price,
        status: 'pending'
      }
    });

    res.json({
      code: 200,
      data: {
        orderId: order.id,
        planId: plan.id,
        planName: plan.name,
        amount: plan.price,
        payHint: '当前为演示支付，点击「确认支付」即可开通'
      }
    });
  } catch (err) {
    console.error('[membership:order]', err);
    res.status(500).json({ code: 500, message: err.message || '下单失败' });
  }
});

/** 模拟支付成功并发放权益 / 代理分成 */
router.post('/pay', authMiddleware, async (req, res) => {
  try {
    if (!isDemoPayEnabled()) {
      return res.status(503).json({
        code: 503,
        message: '演示支付已关闭。生产环境请接入真实支付或设置 ENABLE_DEMO_PAY=1（仅内测）'
      });
    }
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ code: 400, message: '缺少订单号' });

    const order = await prisma.membershipOrder.findFirst({
      where: { id: orderId, userId: req.userId }
    });
    if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });
    if (order.status === 'paid') {
      return res.json({ code: 200, data: { message: '订单已支付', orderId } });
    }

    const plan = getPlan(order.planId);
    if (!plan) return res.status(400).json({ code: 400, message: '套餐无效' });

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const now = new Date();
    let base = now;
    // 若当前会员未过期且非永久，则顺延
    if (
      user.memberExpireAt &&
      new Date(user.memberExpireAt).getTime() > now.getTime() &&
      user.memberPlan !== 'lifetime'
    ) {
      base = new Date(user.memberExpireAt);
    }

    const expireAt = plan.days > 0 ? calcExpireAt(base, plan.days) : null;
    const updateData = {
      memberPlan: plan.id,
      memberExpireAt: expireAt
    };

    if (plan.isAgent) {
      updateData.isAgent = true;
      updateData.agentRate = plan.agentRate ?? 0.5;
      if (!user.inviteCode) {
        updateData.inviteCode = genInviteCode();
      }
    }

    await prisma.user.update({ where: { id: req.userId }, data: updateData });
    await prisma.membershipOrder.update({
      where: { id: orderId },
      data: { status: 'paid', paidAt: now }
    });

    // 邀请人是代理 → 分成
    if (user.invitedBy) {
      const agent = await prisma.user.findUnique({ where: { id: user.invitedBy } });
      if (agent?.isAgent) {
        const rate = Number(agent.agentRate || 0.5);
        const amount = Math.round(Number(order.amount) * rate * 100) / 100;
        await prisma.agentCommission.create({
          data: {
            agentId: agent.id,
            fromUserId: user.id,
            orderId: order.id,
            orderAmount: order.amount,
            rate,
            amount,
            status: 'settled'
          }
        });
      }
    }

    const fresh = await prisma.user.findUnique({ where: { id: req.userId } });
    res.json({
      code: 200,
      data: {
        message: '支付成功，会员已开通',
        user: publicUser(fresh)
      }
    });
  } catch (err) {
    console.error('[membership:pay]', err);
    res.status(500).json({ code: 500, message: err.message || '支付失败' });
  }
});

/** 激活码开通会员：万能码不限次；库存码按次核销并记账 */
router.post('/activate', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });

    const redeemed = await redeemActivationCode(user, code);
    const updateData = redeemed.lifetime
      ? { memberPlan: 'lifetime', memberExpireAt: null }
      : {
          memberPlan: redeemed.planId && redeemed.planId !== 'code' ? redeemed.planId : 'code',
          memberExpireAt: redeemed.expireAt
        };

    const fresh = await prisma.user.update({
      where: { id: req.userId },
      data: updateData
    });

    res.json({
      code: 200,
      data: {
        message: redeemed.lifetime
          ? '激活成功，已开通永久会员'
          : `激活成功，会员已顺延 ${redeemed.days} 天`,
        days: redeemed.days,
        planId: redeemed.planId,
        memberExpireAt: fresh.memberExpireAt,
        source: redeemed.source,
        user: publicUser(fresh)
      }
    });
  } catch (err) {
    console.error('[membership:activate]', err);
    const status = err.status || 500;
    res.status(status).json({ code: status, message: err.message || '激活失败' });
  }
});

/** 发码账号（默认 17682160819）：查看库存、状态、使用日志与关联账户 */
router.get('/agent/codes', authMiddleware, async (req, res) => {
  try {
    let user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!canIssueActivationCodes(user)) {
      return res.status(403).json({ code: 403, message: '仅发码账号可查看' });
    }
    if (!user.isAgent) {
      user = (await ensureCodeIssuerPrivileges(user.phone)) || user;
    }
    const data = await listAgentCodes(user.id);
    data.canCreate = true;
    res.json({ code: 200, data });
  } catch (err) {
    console.error('[membership:agent-codes]', err);
    res.status(500).json({ code: 500, message: err.message || '读取失败' });
  }
});

/**
 * 发码账号自助创建四档会员激活码
 * body: { planId, count?, maxUses?, note? }
 */
router.post('/agent/codes', authMiddleware, async (req, res) => {
  try {
    let user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
    if (!canIssueActivationCodes(user)) {
      return res.status(403).json({ code: 403, message: '当前账号无权创建激活码' });
    }
    if (!user.isAgent) {
      user = (await ensureCodeIssuerPrivileges(user.phone)) || user;
    }

    const { planId, count, maxUses, note } = req.body || {};
    const created = await createActivationCodes({
      agentId: user.id,
      planId,
      count,
      maxUses,
      note
    });

    res.json({
      code: 200,
      data: {
        codes: created.map((c) => ({
          code: c.code,
          planId: c.planId,
          days: c.days,
          maxUses: c.maxUses,
          note: c.note
        }))
      }
    });
  } catch (err) {
    console.error('[membership:agent-create-codes]', err);
    res.status(500).json({ code: 500, message: err.message || '创建失败' });
  }
});

/**
 * 运营发码给代理（需 ADMIN_TOKEN）
 * body: { agentPhone, planId?, count?, days?, maxUses?, note? }
 */
router.post('/admin/codes', requireAdmin, async (req, res) => {
  try {
    const { agentPhone, agentId, count, days, maxUses, note, planId } = req.body || {};
    let agent = null;
    if (agentId) {
      agent = await prisma.user.findUnique({ where: { id: String(agentId) } });
    } else if (agentPhone) {
      agent = await prisma.user.findUnique({ where: { phone: String(agentPhone).trim() } });
    }
    if (!agent) {
      return res.status(404).json({ code: 404, message: '未找到代理用户，请先确认手机号已注册' });
    }
    if (!agent.isAgent) {
      const inviteCode = agent.inviteCode || genInviteCode();
      agent = await prisma.user.update({
        where: { id: agent.id },
        data: {
          isAgent: true,
          agentRate: agent.agentRate > 0 ? agent.agentRate : 0.5,
          inviteCode
        }
      });
    }

    const created = await createActivationCodes({
      agentId: agent.id,
      planId,
      count,
      days,
      maxUses,
      note
    });

    res.json({
      code: 200,
      data: {
        agent: {
          id: agent.id,
          phone: agent.phone,
          nickName: agent.nickName
        },
        codes: created.map((c) => ({
          code: c.code,
          planId: c.planId,
          days: c.days,
          maxUses: c.maxUses,
          note: c.note
        }))
      }
    });
  } catch (err) {
    console.error('[membership:admin-codes]', err);
    res.status(500).json({ code: 500, message: err.message || '发码失败' });
  }
});

export { publicUser };
export default router;
