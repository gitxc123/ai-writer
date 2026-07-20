<template>
  <view class="page">
    <view class="hero">
      <text class="hero-title">激活码开通</text>
      <text class="activate-desc">输入激活码可开通或顺延会员（万能码每次 {{ activationDays }} 天）</text>
      <view v-if="userStore.user?.isMember" class="current">
        当前：{{ userStore.user.memberLabel }}
        <text v-if="userStore.user.memberExpireAt && userStore.user.memberPlan !== 'lifetime'">
          · 至 {{ formatDate(userStore.user.memberExpireAt) }}
        </text>
      </view>
    </view>

    <view class="activate-box">
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
  </view>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../../utils/request.js';
import { useUserStore } from '../../stores/user.js';

const userStore = useUserStore();
const activating = ref(false);
const activationCode = ref('');
const activationDays = ref(3);

onMounted(async () => {
  if (!userStore.checkLogin()) return;
  try {
    const cfg = await api.getMembershipConfig();
    if (cfg?.activationCodeDays) {
      activationDays.value = Number(cfg.activationCodeDays) || 3;
    }
  } catch {
    // ignore
  }
  await refreshMe();
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
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f6f8;
  padding: 24rpx;
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
.activate-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #909399;
  line-height: 1.5;
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
.activate-box {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
}
.activate-input {
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
