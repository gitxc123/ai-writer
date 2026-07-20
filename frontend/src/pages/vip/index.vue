<template>
  <view class="page">
    <view class="hero">
      <text class="hero-title">开通会员</text>
      <text class="hero-desc">解锁全部 AI 创作能力</text>
      <view v-if="userStore.user?.isMember" class="current">
        当前：{{ userStore.user.memberLabel }}
        <text v-if="userStore.user.memberExpireAt && userStore.user.memberPlan !== 'lifetime'">
          · 至 {{ formatDate(userStore.user.memberExpireAt) }}
        </text>
      </view>
    </view>

    <view class="activate-box">
      <text class="activate-title">激活码开通</text>
      <text class="activate-desc">输入激活码可开通或顺延会员 {{ activationDays }} 天</text>
      <input
        class="activate-input"
        v-model="activationCode"
        placeholder="请输入激活码"
        maxlength="32"
        confirm-type="done"
        @confirm="activate"
      />
      <view class="activate-btn" :class="{ disabled: activating }" @click="activate">
        {{ activating ? '激活中…' : '立即激活' }}
      </view>
    </view>

    <view
      v-for="plan in plans"
      :key="plan.id"
      class="plan"
      :class="{ active: selected === plan.id, lifetime: plan.id === 'lifetime' }"
      @click="selected = plan.id"
    >
      <view class="plan-top">
        <view class="plan-name-row">
          <text class="plan-name">{{ plan.name }}</text>
          <text class="badge">{{ plan.badge }}</text>
        </view>
        <view class="price-row">
          <text class="currency">¥</text>
          <text class="price">{{ plan.price }}</text>
        </view>
      </view>
      <text class="plan-desc">{{ plan.desc }}</text>
      <view class="features">
        <text v-for="(f, i) in plan.features" :key="i" class="feat">· {{ f }}</text>
      </view>
    </view>

    <view v-if="userStore.user?.isAgent || userStore.user?.canIssueCodes" class="agent-box">
      <text class="agent-title">代理卖码</text>
      <text class="agent-tip">创建四档会员激活码发给买家兑换；可查看状态、使用日志与关联账号。</text>

      <view v-if="userStore.user?.canIssueCodes || canCreateCodes" class="issue-box">
        <text class="issue-title">创建激活码</text>
        <view class="plan-chip-row">
          <view
            v-for="p in codePlans"
            :key="p.planId"
            class="plan-chip"
            :class="{ active: issuePlanId === p.planId }"
            @click="issuePlanId = p.planId"
          >
            {{ p.name }}
            <text class="plan-chip-sub">{{ p.days > 0 ? p.days + '天' : '永久' }} · ¥{{ p.price }}</text>
          </view>
        </view>
        <view class="issue-row">
          <text class="issue-label">数量</text>
          <input v-model="issueCount" class="issue-input" type="number" maxlength="3" />
        </view>
        <view class="issue-row">
          <text class="issue-label">备注</text>
          <input v-model="issueNote" class="issue-input" placeholder="如：客户微信昵称" maxlength="40" />
        </view>
        <view class="activate-btn" :class="{ disabled: issuing }" @click="createCodes">
          {{ issuing ? '生成中…' : '生成激活码' }}
        </view>
      </view>

      <text class="agent-code">
        库存：共 {{ agentSummary.total }} 个 · 未用完 {{ agentSummary.unused }} · 已核销次数 {{ agentSummary.usedSlots }}
      </text>
      <view v-if="agentCodes.length" class="code-list">
        <view v-for="c in agentCodes" :key="c.id" class="code-item">
          <view class="code-main">
            <text class="code-value">{{ c.code }}</text>
            <text class="code-meta">
              {{ c.planName || c.planId }} · {{ c.days > 0 ? c.days + '天' : '永久' }} ·
              {{ c.statusLabel }} · 剩{{ c.remaining }}/{{ c.maxUses }}
            </text>
            <text
              v-for="(acc, i) in (c.linkedAccounts || []).slice(0, 3)"
              :key="acc.userId + i"
              class="code-link"
            >
              关联：{{ acc.phoneMask || acc.userId }} · {{ formatDate(acc.createdAt) }}
            </text>
          </view>
          <text class="copy-link" @click="copyText(c.code)">复制</text>
        </view>
      </view>
      <text v-else class="agent-empty">暂无库存码，请先上方创建</text>
      <text v-if="agentRedeems.length" class="agent-sub-title">使用日志</text>
      <view v-if="agentRedeems.length" class="comm-list">
        <view v-for="r in agentRedeems" :key="r.id" class="comm-item">
          <text>
            {{ r.phoneMask || '用户' }} · {{ r.planName || '' }}
            {{ r.days > 0 ? '+' + r.days + '天' : '永久' }} · {{ r.code }}
          </text>
          <text class="comm-time">{{ formatDate(r.createdAt) }}</text>
        </view>
      </view>
    </view>

    <view class="pay-bar">
      <view class="pay-info">
        <text class="pay-label">应付</text>
        <text class="pay-amount">¥{{ currentPlan?.price ?? '-' }}</text>
      </view>
      <view
        class="pay-btn"
        :class="{ disabled: paying || !demoPayEnabled }"
        @click="pay"
      >
        {{ payButtonText }}
      </view>
    </view>
    <text v-if="!demoPayEnabled" class="pay-off-tip">请联系客服开通会员。个人开发维持服务器与 AI Token 成本较高，虚拟服务一经售出概不退款，详见用户协议。</text>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../../utils/request.js';
import { useUserStore } from '../../stores/user.js';

const userStore = useUserStore();
const plans = ref([]);
const selected = ref('monthly');
const paying = ref(false);
const activating = ref(false);
const activationCode = ref('');
const activationDays = ref(3);
const demoPayEnabled = ref(true);
const agentCodes = ref([]);
const agentRedeems = ref([]);
const agentSummary = ref({ total: 0, unused: 0, usedSlots: 0 });
const codePlans = ref([
  { planId: 'trial', name: '试用会员', days: 3, price: 9.9 },
  { planId: 'monthly', name: '包月会员', days: 30, price: 59.9 },
  { planId: 'yearly', name: '包年会员', days: 365, price: 299 },
  { planId: 'lifetime', name: '永久会员', days: 0, price: 499 }
]);
const issuePlanId = ref('monthly');
const issueCount = ref('1');
const issueNote = ref('');
const issuing = ref(false);
const canCreateCodes = ref(false);

const currentPlan = computed(() => plans.value.find((p) => p.id === selected.value));
const payButtonText = computed(() => {
  if (!demoPayEnabled.value) return '请联系客服';
  if (paying.value) return '处理中…';
  return '确认支付（演示）';
});

onMounted(async () => {
  if (!userStore.checkLogin()) return;
  try {
    try {
      const cfg = await api.getMembershipConfig();
      demoPayEnabled.value = cfg?.demoPayEnabled !== false;
      if (cfg?.activationCodeDays) {
        activationDays.value = Number(cfg.activationCodeDays) || 3;
      }
      if (Array.isArray(cfg?.codePlans) && cfg.codePlans.length) {
        codePlans.value = cfg.codePlans;
      }
    } catch {
      demoPayEnabled.value = true;
    }
    plans.value = await api.getMemberPlans();
    if (plans.value.length && !plans.value.find((p) => p.id === selected.value)) {
      selected.value = plans.value[0].id;
    }
    await refreshMe();
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  }
});

async function refreshMe() {
  await userStore.fetchUser();
  try {
    const data = await api.getMembershipMe();
    if (data?.user) userStore.user = data.user;
  } catch {
    // ignore
  }
  if (userStore.user?.isAgent || userStore.user?.canIssueCodes) {
    try {
      const pack = await api.getAgentCodes();
      agentSummary.value = pack?.summary || { total: 0, unused: 0, usedSlots: 0 };
      agentCodes.value = pack?.codes || [];
      agentRedeems.value = pack?.redeems || [];
      canCreateCodes.value = pack?.canCreate !== false;
      if (Array.isArray(pack?.plans) && pack.plans.length) {
        codePlans.value = pack.plans;
      }
    } catch {
      agentCodes.value = [];
      agentRedeems.value = [];
    }
  }
}

function formatDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day} ${hh}:${mm}`;
}

function copyText(text) {
  uni.setClipboardData({
    data: String(text || ''),
    success: () => uni.showToast({ title: '已复制', icon: 'none' })
  });
}

async function createCodes() {
  if (issuing.value) return;
  if (!userStore.checkLogin()) return;
  const count = Math.min(50, Math.max(1, Number(issueCount.value) || 1));
  issuing.value = true;
  try {
    const data = await api.createAgentCodes({
      planId: issuePlanId.value,
      count,
      maxUses: 1,
      note: String(issueNote.value || '').trim()
    });
    const list = data?.codes || [];
    if (list.length === 1) {
      await new Promise((resolve) => {
        uni.setClipboardData({
          data: list[0].code,
          success: () => {
            uni.showToast({ title: `已生成并复制：${list[0].code}`, icon: 'none', duration: 2500 });
            resolve();
          },
          fail: resolve
        });
      });
    } else {
      uni.showToast({ title: `已生成 ${list.length} 个激活码`, icon: 'none' });
    }
    issueNote.value = '';
    await refreshMe();
  } catch (e) {
    uni.showToast({ title: e.message || '创建失败', icon: 'none' });
  } finally {
    issuing.value = false;
  }
}

async function activate() {
  if (activating.value) return;
  if (!userStore.checkLogin()) return;
  const code = String(activationCode.value || '').trim();
  if (!code) {
    uni.showToast({ title: '请输入激活码', icon: 'none' });
    return;
  }
  activating.value = true;
  try {
    const result = await api.activateMembership(code);
    if (result?.user) userStore.user = result.user;
    await refreshMe();
    activationCode.value = '';
    const until = result?.memberExpireAt || result?.user?.memberExpireAt;
    const tip = until
      ? `激活成功，有效至 ${formatDate(until)}`
      : result?.message || '激活成功';
    uni.showToast({ title: tip, icon: 'none', duration: 2500 });
  } catch (e) {
    uni.showToast({ title: e.message || '激活失败', icon: 'none' });
  } finally {
    activating.value = false;
  }
}

async function pay() {
  if (paying.value || !currentPlan.value) return;
  if (!demoPayEnabled.value) {
    uni.showToast({ title: '请联系客服开通', icon: 'none' });
    return;
  }
  if (!userStore.checkLogin()) return;
  paying.value = true;
  try {
    const order = await api.createMemberOrder(currentPlan.value.id);
    const result = await api.payMemberOrder(order.orderId);
    if (result?.user) userStore.user = result.user;
    await refreshMe();
    uni.showToast({ title: '开通成功', icon: 'success', duration: 1200 });
    setTimeout(() => {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        uni.navigateBack({ delta: 1 });
      } else {
        uni.reLaunch({ url: '/pages/mine/index' });
      }
    }, 1200);
  } catch (e) {
    uni.showToast({ title: e.message || '支付失败', icon: 'none' });
  } finally {
    paying.value = false;
  }
}
</script>

<style scoped>
.page {
  padding: 24rpx 24rpx 180rpx;
  background: #f4f6fa;
  min-height: 100vh;
}
.hero {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%);
  border-radius: 20rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 24rpx;
  color: #fff;
}
.hero-title {
  font-size: 40rpx;
  font-weight: 700;
  display: block;
}
.hero-desc {
  font-size: 26rpx;
  opacity: 0.85;
  margin-top: 12rpx;
  display: block;
}
.current {
  margin-top: 20rpx;
  font-size: 24rpx;
  background: rgba(255, 255, 255, 0.12);
  padding: 12rpx 20rpx;
  border-radius: 999rpx;
  display: inline-block;
}
.plan {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  border: 2rpx solid transparent;
}
.plan.active {
  border-color: #0a84ff;
  box-shadow: 0 4rpx 20rpx rgba(10, 132, 255, 0.12);
}
.plan.lifetime {
  background: linear-gradient(160deg, #fffbeb, #fff);
}
.plan-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.plan-name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.plan-name {
  font-size: 32rpx;
  font-weight: 600;
}
.badge {
  font-size: 20rpx;
  background: #0a84ff;
  color: #fff;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}
.lifetime .badge {
  background: #c9a227;
}
.price-row {
  display: flex;
  align-items: baseline;
  color: #e6a23c;
}
.currency {
  font-size: 24rpx;
}
.price {
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1;
}
.plan-desc {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #606266;
}
.features {
  margin-top: 16rpx;
}
.feat {
  display: block;
  font-size: 24rpx;
  color: #909399;
  line-height: 1.7;
}
.agent-box {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-top: 8rpx;
}
.agent-title {
  font-size: 30rpx;
  font-weight: 600;
  display: block;
  margin-bottom: 12rpx;
}
.agent-tip {
  display: block;
  font-size: 24rpx;
  color: #909399;
  line-height: 1.5;
  margin-bottom: 12rpx;
}
.issue-box {
  background: #f5f7fa;
  border-radius: 12rpx;
  padding: 20rpx;
  margin: 12rpx 0 20rpx;
}
.issue-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  margin-bottom: 12rpx;
}
.plan-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 16rpx;
}
.plan-chip {
  background: #fff;
  border: 2rpx solid #e4e7ed;
  border-radius: 12rpx;
  padding: 12rpx 16rpx;
  font-size: 24rpx;
  color: #606266;
  min-width: 40%;
  box-sizing: border-box;
}
.plan-chip.active {
  border-color: #0a84ff;
  color: #0a84ff;
  background: #eef6ff;
}
.plan-chip-sub {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: #909399;
}
.issue-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 12rpx;
}
.issue-label {
  width: 80rpx;
  font-size: 24rpx;
  color: #606266;
  flex-shrink: 0;
}
.issue-input {
  flex: 1;
  background: #fff;
  border-radius: 8rpx;
  padding: 14rpx 16rpx;
  font-size: 26rpx;
}
.code-link {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: #67c23a;
}
.agent-code,
.agent-rate,
.agent-total {
  display: block;
  font-size: 26rpx;
  color: #606266;
  margin-top: 8rpx;
}
.agent-empty {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #c0c4cc;
}
.agent-sub-title {
  display: block;
  margin-top: 20rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #303133;
}
.code-list {
  margin-top: 16rpx;
}
.code-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 14rpx 0;
  border-top: 1rpx solid #ebeef5;
}
.code-main {
  flex: 1;
  min-width: 0;
}
.code-value {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  letter-spacing: 1rpx;
}
.code-meta {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #909399;
}
.copy-link {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #0a84ff;
  padding: 8rpx 12rpx;
}
.comm-list {
  margin-top: 16rpx;
  border-top: 1rpx solid #ebeef5;
  padding-top: 12rpx;
}
.comm-item {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  padding: 10rpx 0;
  color: #67c23a;
}
.comm-time {
  color: #c0c4cc;
}
.pay-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fff;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 24rpx;
  box-shadow: 0 -4rpx 20rpx rgba(0, 0, 0, 0.06);
}
.pay-info {
  flex: 1;
}
.pay-label {
  font-size: 22rpx;
  color: #909399;
  display: block;
}
.pay-amount {
  font-size: 36rpx;
  font-weight: 700;
  color: #e6a23c;
}
.pay-btn {
  background: #0a84ff;
  color: #fff;
  padding: 22rpx 40rpx;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 600;
}
.pay-btn.disabled {
  opacity: 0.6;
}
.pay-off-tip {
  display: block;
  text-align: center;
  font-size: 24rpx;
  color: #909399;
  margin-top: 16rpx;
  padding-bottom: 24rpx;
}
.activate-box {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.activate-title {
  font-size: 30rpx;
  font-weight: 600;
  display: block;
}
.activate-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #909399;
}
.activate-input {
  margin-top: 20rpx;
  background: #f5f7fa;
  border-radius: 12rpx;
  padding: 20rpx 24rpx;
  font-size: 28rpx;
}
.activate-btn {
  margin-top: 20rpx;
  background: #1a1a2e;
  color: #fff;
  text-align: center;
  padding: 22rpx;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 600;
}
.activate-btn.disabled {
  opacity: 0.6;
}
</style>
