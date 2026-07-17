<template>
  <view class="page">
    <view class="form">
      <input v-model="phone" class="input" type="number" maxlength="11" placeholder="手机号" />
      <input v-model="password" class="input" password placeholder="密码（至少6位）" />
      <input v-model="inviteCode" class="input" placeholder="邀请码（选填，注册时生效）" />
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
const userStore = useUserStore();

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
