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
const demoPayEnabled = ref(true);

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
      uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/mine/index' }) });
    }, 800);
  } catch (e) {
    uni.showToast({ title: e.message || '支付失败', icon: 'none' });
  } finally {
    paying.value = false;
  }
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
.plan.active {
  border-color: #0a84ff;
  box-shadow: 0 0 0 2rpx rgba(10, 132, 255, 0.15);
}
.plan.lifetime {
  background: linear-gradient(135deg, #fff 0%, #fff8ef 100%);
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
</style>
