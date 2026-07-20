<template>
  <view class="tabbar">
    <view
      v-for="item in tabs"
      :key="item.path"
      class="tab-item"
      :class="{ active: current === item.path }"
      @click="go(item.path)"
    >
      <image
        class="tab-icon"
        :src="iconSrc(item.key, current === item.path)"
        mode="aspectFit"
      />
      <text class="tab-text">{{ item.text }}</text>
    </view>
  </view>
</template>

<script setup>
const props = defineProps({ current: { type: String, required: true } });

const tabs = [
  { path: '/pages/index/index', text: '首页', key: 'home' },
  { path: '/pages/templates/index', text: '模板', key: 'templates' },
  { path: '/pages/history/index', text: '任务', key: 'tasks' },
  { path: '/pages/mine/index', text: '我的', key: 'mine' }
];

/** 统一描边线框图标，避免 emoji 风格不一 */
function iconSrc(key, active) {
  const c = active ? '#0A84FF' : '#909399';
  const paths = {
    home: '<path d="M4 10.5 12 3.8l8 6.7V20a.8.8 0 0 1-.8.8h-4.7v-5.6H9.5V20.8H4.8A.8.8 0 0 1 4 20v-9.5z"/>',
    templates:
      '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5"/>',
    tasks:
      '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.8v4.6l3 1.8"/>',
    mine: '<circle cx="12" cy="9" r="3.4"/><path d="M5.2 19.2c1.4-3.2 3.8-4.8 6.8-4.8s5.4 1.6 6.8 4.8"/>'
  };
  const body = paths[key] || paths.home;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function go(path) {
  if (props.current === path) return;
  uni.redirectTo({ url: path });
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
  width: 44rpx;
  height: 44rpx;
}
.tab-text {
  font-size: 22rpx;
  margin-top: 6rpx;
}
</style>
