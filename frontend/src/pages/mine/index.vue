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

    <view class="menu">
      <view class="menu-item vip" @click="goActivate">
        <view>
          <text class="menu-title">激活码开通</text>
          <text class="menu-sub">输入激活码开通或顺延会员</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="goVip">
        <view>
          <text class="menu-title">会员规则</text>
          <text class="menu-sub">试用 · 月卡 · 年卡 · 永久；代理请咨询客服</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view v-if="userStore.isLogin && userStore.user?.canIssueCodes" class="menu-item" @click="goCodes">
        <view>
          <text class="menu-title">创建激活码</text>
          <text class="menu-sub">生成四档激活码 · 库存与开通日志</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view v-if="userStore.isLogin && canViewLogs" class="menu-item" @click="goLogs">
        <view>
          <text class="menu-title">运行日志</text>
          <text class="menu-sub">按任务 ID 查看生成过程</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="goLegal('/pages/legal/terms')">
        <view>
          <text class="menu-title">用户协议</text>
          <text class="menu-sub">服务说明与用户责任</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="goLegal('/pages/legal/privacy')">
        <view>
          <text class="menu-title">隐私政策</text>
          <text class="menu-sub">信息收集与 180 天留存说明</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="goLegal('/pages/legal/complaint')">
        <view>
          <text class="menu-title">投诉与反馈</text>
          <text class="menu-sub">按任务 ID 提交侵权投诉</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="goContact">
        <view>
          <text class="menu-title">联系客服</text>
          <text class="menu-sub">微信扫码咨询会员与使用问题</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <view v-if="userStore.isLogin" class="menu-item danger" @click="toggleDeletePanel">
        <view>
          <text class="menu-title">注销账号</text>
          <text class="menu-sub">删除账号、生成记录与本地配图，不可恢复</text>
        </view>
        <text class="arrow">›</text>
      </view>
    </view>

    <view v-if="showDeletePanel" class="delete-panel">
      <text class="delete-tip">请输入登录密码，并在下方输入「注销账号」以确认。</text>
      <input
        class="delete-input"
        type="password"
        password
        v-model="deletePassword"
        placeholder="登录密码"
      />
      <input
        class="delete-input"
        v-model="deleteConfirm"
        placeholder="请输入：注销账号"
      />
      <view class="delete-actions">
        <view class="delete-cancel" @click="toggleDeletePanel">取消</view>
        <view class="delete-submit" @click="submitDeleteAccount">确认注销</view>
      </view>
    </view>

    <view v-if="!userStore.isLogin" class="login-btn" @click="goLogin">登录 / 注册</view>
    <view v-else class="logout-btn" @click="logout">退出登录</view>

    <view class="bottom-space" />
    <TabBar current="/pages/mine/index" />
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useUserStore } from '../../stores/user.js';
import { api } from '../../utils/request.js';
import TabBar from '../../components/TabBar.vue';

const userStore = useUserStore();
const canViewLogs = ref(false);
const showDeletePanel = ref(false);
const deletePassword = ref('');
const deleteConfirm = ref('');
const deleting = ref(false);

onMounted(async () => {
  if (!userStore.isLogin) return;
  await userStore.fetchUser();
  try {
    const meta = await api.getLogsMeta();
    canViewLogs.value = !!meta?.canViewLogs;
  } catch {
    canViewLogs.value = false;
  }
});

function goLogin() {
  uni.navigateTo({ url: '/pages/login/login' });
}

function goActivate() {
  if (!userStore.checkLogin()) return;
  uni.navigateTo({ url: '/pages/vip/activate' });
}

function goVip() {
  uni.navigateTo({ url: '/pages/vip/index' });
}

function goCodes() {
  if (!userStore.checkLogin()) return;
  if (!userStore.user?.canIssueCodes) {
    uni.showToast({ title: '仅发码账号可进入', icon: 'none' });
    return;
  }
  uni.navigateTo({ url: '/pages/vip/codes' });
}

function goLogs() {
  uni.navigateTo({ url: '/pages/logs/index' });
}

function goLegal(url) {
  uni.navigateTo({ url });
}

function goContact() {
  uni.navigateTo({ url: '/pages/mine/contact' });
}

function toggleDeletePanel() {
  showDeletePanel.value = !showDeletePanel.value;
  if (!showDeletePanel.value) {
    deletePassword.value = '';
    deleteConfirm.value = '';
  }
}

async function submitDeleteAccount() {
  if (deleting.value) return;
  if (!deletePassword.value) {
    uni.showToast({ title: '请输入密码', icon: 'none' });
    return;
  }
  if (deleteConfirm.value.trim() !== '注销账号') {
    uni.showToast({ title: '请输入「注销账号」确认', icon: 'none' });
    return;
  }
  deleting.value = true;
  try {
    await api.deleteAccount(deletePassword.value, deleteConfirm.value.trim());
    userStore.logout();
    showDeletePanel.value = false;
    uni.showToast({ title: '账号已注销', icon: 'none' });
    setTimeout(() => {
      uni.reLaunch({ url: '/pages/mine/index' });
    }, 500);
  } catch (err) {
    uni.showToast({ title: err.message || '注销失败', icon: 'none' });
  } finally {
    deleting.value = false;
  }
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
.menu-item.danger .menu-title {
  color: #fa3534;
}
.delete-panel {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx 32rpx;
  margin-bottom: 24rpx;
  border: 1rpx solid #fde2e2;
}
.delete-tip {
  font-size: 24rpx;
  color: #909399;
  display: block;
  margin-bottom: 20rpx;
  line-height: 1.5;
}
.delete-input {
  background: #f5f7fa;
  border-radius: 12rpx;
  padding: 20rpx 24rpx;
  font-size: 28rpx;
  margin-bottom: 16rpx;
}
.delete-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 8rpx;
}
.delete-cancel,
.delete-submit {
  flex: 1;
  text-align: center;
  padding: 20rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
}
.delete-cancel {
  background: #f0f2f5;
  color: #606266;
}
.delete-submit {
  background: #fa3534;
  color: #fff;
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
