<template>
  <view class="tabbar">
    <view
      v-for="item in tabs"
      :key="item.path"
      class="tab-item"
      :class="{ active: current === item.path }"
      @click="go(item.path)"
    >
      <text class="tab-icon">{{ item.icon }}</text>
      <text class="tab-text">{{ item.text }}</text>
    </view>
  </view>
</template>

<script setup>
defineProps({ current: { type: String, required: true } });

const tabs = [
  { path: '/pages/index/index', text: '首页', icon: '🏠' },
  { path: '/pages/templates/index', text: '模板', icon: '📋' },
  { path: '/pages/history/index', text: '任务', icon: '⏳' },
  { path: '/pages/mine/index', text: '我的', icon: '👤' }
];

function go(path) {
  uni.reLaunch({ url: path });
}
</script>

<style scoped>
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100rpx;
  background: #fff;
  border-top: 1rpx solid #ebeef5;
  display: flex;
  z-index: 99;
  padding-bottom: env(safe-area-inset-bottom);
}
.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
}
.tab-item.active {
  color: #0a84ff;
}
.tab-icon {
  font-size: 36rpx;
}
.tab-text {
  font-size: 22rpx;
  margin-top: 4rpx;
}
</style>
