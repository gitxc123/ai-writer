<template>
  <view class="page">
    <view class="user-card">
      <view class="avatar">👤</view>
      <view class="info">
        <text class="name">{{ userStore.user?.nickName || '未登录' }}</text>
        <text class="phone" v-if="userStore.user">{{ userStore.user.phone }}</text>
        <view v-if="userStore.isLogin" class="vip-tag" :class="{ on: userStore.user?.isMember }">
          {{ userStore.user?.memberLabel || '未开通' }}
        </view>
      </view>
    </view>

    <view v-if="userStore.isLogin" class="menu">
      <view class="menu-item vip" @click="goVip">
        <view>
          <text class="menu-title">会员中心</text>
          <text class="menu-sub">试用 ¥9.9 · 月卡 ¥59.9 · 年卡 ¥299 · 永久代理 ¥499</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view v-if="userStore.user?.isAgent" class="menu-item" @click="goVip">
        <view>
          <text class="menu-title">代理收益</text>
          <text class="menu-sub">邀请码 {{ userStore.user.inviteCode }} · 分成 50%</text>
        </view>
        <text class="arrow">›</text>
      </view>
    </view>

    <view v-if="!userStore.isLogin" class="login-btn" @click="goLogin">登录 / 注册</view>
    <view v-else class="logout-btn" @click="logout">退出登录</view>

    <view class="bottom-space" />
    <TabBar current="/pages/mine/index" />
  </view>
</template>

<script setup>
import { onMounted } from 'vue';
import { useUserStore } from '../../stores/user.js';
import TabBar from '../../components/TabBar.vue';

const userStore = useUserStore();

onMounted(() => {
  if (userStore.isLogin) userStore.fetchUser();
});

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' });
}

function goVip() {
  if (!userStore.checkLogin()) return;
  uni.navigateTo({ url: '/pages/vip/index' });
}

function logout() {
  userStore.logout();
  uni.showToast({ title: '已退出', icon: 'none' });
}
</script>

<style scoped>
.page {
  padding: 24rpx;
  padding-bottom: 140rpx;
}
.user-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}
.avatar {
  width: 100rpx;
  height: 100rpx;
  background: #e8f4ff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  margin-right: 24rpx;
}
.info {
  flex: 1;
}
.name {
  font-size: 32rpx;
  font-weight: 600;
  display: block;
}
.phone {
  font-size: 24rpx;
  color: #909399;
  margin-top: 8rpx;
  display: block;
}
.vip-tag {
  margin-top: 12rpx;
  display: inline-block;
  font-size: 22rpx;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  background: #f0f2f5;
  color: #909399;
}
.vip-tag.on {
  background: #fff7e6;
  color: #d48806;
}
.menu {
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  margin-bottom: 24rpx;
}
.menu-item {
  padding: 28rpx 32rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1rpx solid #f2f3f5;
}
.menu-item:last-child {
  border-bottom: none;
}
.menu-item.vip {
  background: linear-gradient(90deg, #fffbeb, #fff);
}
.menu-title {
  font-size: 30rpx;
  font-weight: 600;
  display: block;
}
.menu-sub {
  font-size: 22rpx;
  color: #909399;
  margin-top: 8rpx;
  display: block;
}
.arrow {
  font-size: 40rpx;
  color: #c0c4cc;
}
.login-btn,
.logout-btn {
  background: #0a84ff;
  color: #fff;
  text-align: center;
  padding: 24rpx;
  border-radius: 12rpx;
  font-size: 30rpx;
}
.logout-btn {
  background: #fff;
  color: #fa3534;
  border: 1rpx solid #fa3534;
}
.bottom-space {
  height: 40rpx;
}
</style>
