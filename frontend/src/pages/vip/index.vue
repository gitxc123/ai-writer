<template>
  <view class="page">
    <view class="hero">
      <text class="hero-title">会员规则</text>
      <text class="hero-desc">套餐权益、价格与开通说明</text>
      <view v-if="userStore.user?.isMember" class="current">
        当前：{{ userStore.user.memberLabel }}
        <text v-if="userStore.user.memberExpireAt && userStore.user.memberPlan !== 'lifetime'">
          · 至 {{ formatDate(userStore.user.memberExpireAt) }}
        </text>
      </view>
    </view>

    <view
      v-for="plan in plans"
      :key="plan.id"
      class="plan"
      :class="[plan.id, { active: selected === plan.id }]"
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

    <view class="agent-card">
      <view class="plan-top">
        <view class="plan-name-row">
          <text class="plan-name">成为代理</text>
          <text class="badge agent-badge">高分成</text>
        </view>
        <text class="agent-rate">50% 盈利分成</text>
      </view>
      <text class="plan-desc">
        不止卖工具：永久解锁本产品全部创作能力，卖出会员激活码还可拿约 50% 盈利分成——自己用、帮别人开通，双重收益。
      </text>
      <view class="features">
        <text class="feat">· 永久享有本工具全部创作能力（模板、图文、配图等）</text>
        <text class="feat">· 卖码结算约 50% 盈利分成，多推多赚</text>
        <text class="feat">· 支持发展推广伙伴，一起做大业绩</text>
        <text class="feat">· 联系客服开通即可</text>
      </view>
      <view class="contact-btn" @click="goContact">联系客服开通代理</view>
    </view>

    <view class="pay-bar">
      <view class="pay-info">
        <text class="pay-amount">¥{{ currentPlan?.price ?? '-' }}</text>
      </view>
      <view class="pay-btn" @click="onBottomAction">联系客服</view>
    </view>
    <text class="pay-off-tip">各档会员与代理均不支持在线支付。请联系客服开通，或使用激活码；虚拟服务一经售出概不退款，详见用户协议。</text>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../../utils/request.js';
import { useUserStore } from '../../stores/user.js';

const userStore = useUserStore();
const plans = ref([]);
const selected = ref('monthly');

const currentPlan = computed(() => plans.value.find((p) => p.id === selected.value));

onMounted(async () => {
  try {
    plans.value = await api.getMemberPlans();
    if (plans.value.length && !plans.value.find((p) => p.id === selected.value)) {
      selected.value = plans.value[0].id;
    }
    if (userStore.isLogin) {
      await refreshMe();
    }
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

function goContact() {
  uni.navigateTo({ url: '/pages/mine/contact' });
}

function onBottomAction() {
  goContact();
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f6f8;
  padding: 24rpx 24rpx 200rpx;
  box-sizing: border-box;
}
.hero {
  margin-bottom: 24rpx;
}
.hero-title {
  font-size: 40rpx;
  font-weight: 700;
  display: block;
}
.hero-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #909399;
}
.current {
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #0a84ff;
  background: #eef6ff;
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
.plan.trial.active {
  border-color: #909399;
  box-shadow: 0 0 0 2rpx rgba(144, 147, 153, 0.2);
}
.plan.monthly.active {
  border-color: #0a84ff;
  box-shadow: 0 0 0 2rpx rgba(10, 132, 255, 0.2);
}
.plan.yearly.active {
  border-color: #9a6b2f;
  box-shadow: 0 0 0 2rpx rgba(154, 107, 47, 0.25);
}
/* 套餐背景：试用 → 月卡 → 年卡 → 永久 → 代理，逐级更厚重 */
.plan.trial {
  background: #f7f8fa;
  border-color: #e4e7ed;
}
.plan.monthly {
  background: linear-gradient(160deg, #ffffff 0%, #eef5ff 100%);
  border-color: #d6e6ff;
}
.plan.yearly {
  background: linear-gradient(160deg, #fffdf8 0%, #f3e8d4 100%);
  border-color: #e8d5b5;
}
.plan.yearly .badge {
  color: #9a6b2f;
  background: rgba(154, 107, 47, 0.12);
}
.plan.yearly .price-row {
  color: #9a6b2f;
}
.plan.lifetime {
  background: linear-gradient(155deg, #f7e8c8 0%, #e4c48a 55%, #d4a85c 100%);
  border-color: #c4923a;
}
.plan.lifetime .plan-name,
.plan.lifetime .plan-desc,
.plan.lifetime .feat {
  color: #3d2a12;
}
.plan.lifetime .badge {
  color: #5c3d12;
  background: rgba(255, 255, 255, 0.45);
}
.plan.lifetime .price-row {
  color: #5c3d12;
}
.plan.lifetime.active {
  border-color: #8a6420;
  box-shadow: 0 0 0 2rpx rgba(138, 100, 32, 0.25);
}
.agent-card {
  background: linear-gradient(155deg, #2a241c 0%, #1a1510 45%, #0f0d0b 100%);
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  border: 2rpx solid #c9a227;
}
.agent-card .plan-name,
.agent-card .plan-desc,
.agent-card .feat {
  color: #f3e6c8;
}
.agent-card .plan-desc,
.agent-card .feat {
  color: rgba(243, 230, 200, 0.82);
}
.agent-card .badge.agent-badge {
  color: #1a1510;
  background: linear-gradient(90deg, #f0d78c, #c9a227);
}
.agent-rate {
  font-size: 28rpx;
  font-weight: 700;
  color: #f0d78c;
}
.contact-btn {
  margin-top: 20rpx;
  background: linear-gradient(90deg, #f0d78c, #c9a227);
  color: #1a1510;
  text-align: center;
  padding: 20rpx;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 600;
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
  color: #0a84ff;
  background: #eef6ff;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
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
  z-index: 10;
}
.pay-info {
  flex: 1;
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
</style>
