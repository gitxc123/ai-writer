<template>
  <view class="page">
    <view class="form">
      <input v-model="phone" class="input" type="number" maxlength="11" placeholder="手机号" />
      <input v-model="password" class="input" password placeholder="密码（至少6位）" />

      <view class="agree-row" @click="agreed = !agreed">
        <view class="checkbox" :class="{ on: agreed }">{{ agreed ? '✓' : '' }}</view>
        <text class="agree-text">
          我已阅读并同意
          <text class="link" @click.stop="goTerms">《用户协议》</text>
          和
          <text class="link" @click.stop="goPrivacy">《隐私政策》</text>
        </text>
      </view>

      <view class="agree-row" @click="ageOk = !ageOk">
        <view class="checkbox" :class="{ on: ageOk }">{{ ageOk ? '✓' : '' }}</view>
        <text class="agree-text">我确认已年满 18 周岁</text>
      </view>

      <view class="btn primary" @click="handleRegister">注册</view>
      <view class="btn" @click="goLogin">已有账号？去登录</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { useUserStore } from '../../stores/user.js';

const phone = ref('');
const password = ref('');
const agreed = ref(false);
const ageOk = ref(false);
const submitting = ref(false);
const userStore = useUserStore();

function goTerms() {
  uni.navigateTo({ url: '/pages/legal/terms' });
}

function goPrivacy() {
  uni.navigateTo({ url: '/pages/legal/privacy' });
}

function goLogin() {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    uni.navigateBack();
    return;
  }
  uni.redirectTo({ url: '/pages/login/login' });
}

async function handleRegister() {
  if (submitting.value) return;
  if (!agreed.value) {
    uni.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none' });
    return;
  }
  if (!ageOk.value) {
    uni.showToast({ title: '请确认已年满18周岁', icon: 'none' });
    return;
  }
  if (!/^1\d{10}$/.test(phone.value)) {
    uni.showToast({ title: '请输入正确手机号', icon: 'none' });
    return;
  }
  if (password.value.length < 6) {
    uni.showToast({ title: '密码至少6位', icon: 'none' });
    return;
  }

  submitting.value = true;
  try {
    await userStore.register(phone.value, password.value, {
      acceptedTerms: true,
      ageConfirmed: true
    });
    uni.showToast({ title: '注册成功' });
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/index/index' });
    }, 500);
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.page {
  padding: 48rpx 32rpx;
}
.form {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
}
.input {
  border: 1rpx solid #dcdfe6;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
  font-size: 28rpx;
}
.agree-row {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  margin-bottom: 16rpx;
}
.checkbox {
  width: 36rpx;
  height: 36rpx;
  border: 2rpx solid #c0c4cc;
  border-radius: 8rpx;
  flex-shrink: 0;
  margin-top: 4rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: #fff;
  box-sizing: border-box;
}
.checkbox.on {
  background: #0a84ff;
  border-color: #0a84ff;
}
.agree-text {
  font-size: 24rpx;
  color: #606266;
  line-height: 1.6;
  flex: 1;
}
.link {
  color: #0a84ff;
}
.btn {
  text-align: center;
  padding: 24rpx;
  border-radius: 12rpx;
  font-size: 30rpx;
  margin-top: 16rpx;
  background: #f4f6fa;
  color: #606266;
}
.btn.primary {
  background: #0a84ff;
  color: #fff;
}
</style>
