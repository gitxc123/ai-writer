import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  MEMBER_PLANS,
  getPlan,
  calcExpireAt,
  isMemberActive,
  formatMemberLabel,
  genInviteCode
} from '../lib/membership.js';

const router = Router();

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
    agentRate: user.isAgent ? Number(user.agentRate || 0.5) : 0,
    inviteCode: user.inviteCode || '',
    createdAt: user.createdAt
  };
}

router.get('/plans', (_req, res) => {
  res.json({ code: 200, data: MEMBER_PLANS });
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });

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

export { publicUser };
export default router;
