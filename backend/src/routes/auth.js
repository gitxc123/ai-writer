import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../middleware/auth.js';
import { publicUser } from './membership.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { phone, password, nickName, inviteCode } = req.body || {};
  if (!phone || !password) {
    return res.status(400).json({ code: 400, message: '手机号和密码不能为空' });
  }
  if (!/^1\d{10}$/.test(phone)) {
    return res.status(400).json({ code: 400, message: '手机号格式不正确' });
  }
  const exists = await prisma.user.findUnique({ where: { phone } });
  if (exists) {
    return res.status(400).json({ code: 400, message: '手机号已注册' });
  }

  let invitedBy = null;
  if (inviteCode) {
    const agent = await prisma.user.findFirst({
      where: { inviteCode: String(inviteCode).trim().toUpperCase(), isAgent: true }
    });
    if (agent) invitedBy = agent.id;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      phone,
      passwordHash,
      nickName: nickName || `用户${phone.slice(-4)}`,
      invitedBy
    }
  });
  const token = signToken(user.id);
  res.json({
    code: 200,
    data: { token, user: publicUser(user) }
  });
});

router.post('/login', async (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) {
    return res.status(400).json({ code: 400, message: '手机号和密码不能为空' });
  }
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    return res.status(400).json({ code: 400, message: '用户不存在' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(400).json({ code: 400, message: '密码错误' });
  }
  const token = signToken(user.id);
  res.json({
    code: 200,
    data: { token, user: publicUser(user) }
  });
});

export default router;
