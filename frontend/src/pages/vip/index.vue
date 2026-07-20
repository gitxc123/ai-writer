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

    <view v-if="userStore.user?.isAgent" class="agent-box">
      <text class="agent-title">代理中心</text>
      <text class="agent-code">邀请码：{{ userStore.user.inviteCode || '-' }}</text>
      <text class="agent-rate">分成比例：{{ Math.round((userStore.user.agentRate || 0.5) * 100) }}%</text>
      <text class="agent-total">累计收益：¥{{ commissionTotal.toFixed(2) }}</text>
      <view v-if="commissions.length" class="comm-list">
        <view v-for="c in commissions" :key="c.id" class="comm-item">
          <text>+¥{{ Number(c.amount).toFixed(2) }}</text>
          <text class="comm-time">{{ formatDate(c.createdAt) }}</text>
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
    <text v-if="!demoPayEnabled" class="pay-off-tip">在线支付暂未开通，请联系运营人工开通会员</text>
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
const commissions = ref([]);
const commissionTotal = ref(0);
const demoPayEnabled = ref(true);

const currentPlan = computed(() => plans.value.find((p) => p.id === selected.value));
const payButtonText = computed(() => {
  if (!demoPayEnabled.value) return '支付未开通';
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
    commissionTotal.value = data?.commission?.total || 0;
    commissions.value = data?.commission?.recent || [];
  } catch {
    // ignore
  }
}

function formatDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
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
    uni.showToast({ title: '在线支付暂未开通', icon: 'none' });
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
.agent-code,
.agent-rate,
.agent-total {
  display: block;
  font-size: 26rpx;
  color: #606266;
  margin-top: 8rpx;
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
