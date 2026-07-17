<template>
  <view class="page">
    <view class="form">
      <input v-model="phone" class="input" type="number" maxlength="11" placeholder="手机号" />
      <input v-model="password" class="input" password placeholder="密码（至少6位）" />
      <input v-model="inviteCode" class="input" placeholder="邀请码（选填，注册时生效）" />

      <view class="agree-row" @click="agreed = !agreed">
        <view class="checkbox" :class="{ on: agreed }">{{ agreed ? '✓' : '' }}</view>
        <text class="agree-text">
          我已阅读并同意
          <text class="link" @click.stop="goTerms">《用户协议》</text>
          和
          <text class="link" @click.stop="goPrivacy">《隐私政策》</text>
        </text>
      </view>

      <view class="btn primary" @click="handleLogin">登录</view>
      <view class="btn" @click="handleRegister">注册账号</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { useUserStore } from '../../stores/user.js';

const phone = ref('');
const password = ref('');
const inviteCode = ref('');
const agreed = ref(false);
const userStore = useUserStore();

function goTerms() {
  uni.navigateTo({ url: '/pages/legal/terms' });
}

function goPrivacy() {
  uni.navigateTo({ url: '/pages/legal/privacy' });
}

async function handleLogin() {
  try {
    await userStore.login(phone.value, password.value);
    uni.showToast({ title: '登录成功' });
    setTimeout(() => uni.navigateBack(), 500);
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' });
  }
}

async function handleRegister() {
  if (!agreed.value) {
    uni.showToast({ title: '请先同意用户协议和隐私政策', icon: 'none' });
    return;
  }
  if (password.value.length < 6) {
    uni.showToast({ title: '密码至少6位', icon: 'none' });
    return;
  }
  try {
    await userStore.register(phone.value, password.value, inviteCode.value.trim() || undefined);
    uni.showToast({ title: '注册成功' });
    setTimeout(() => uni.navigateBack(), 500);
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' });
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
  margin-bottom: 8rpx;
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
