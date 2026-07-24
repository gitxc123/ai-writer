<template>
  <view class="page">
    <view class="hero">
      <text class="hero-title">小溪AI创作工具</text>
      <text class="hero-desc">一键生成小红书、头条、公众号等平台文案</text>
    </view>

    <view class="section-title">写作建议</view>
    <view class="tip-card">
      <text class="tip-title">{{ tip.title }}</text>
      <text class="tip-body">{{ tip.body }}</text>
      <view class="tip-actions">
        <text class="tip-link" @click="nextTip">下一条</text>
        <view class="tip-cta" @click="goTemplates">选模板</view>
      </view>
    </view>

    <view class="section-title">热门模板</view>
    <view class="tpl-grid">
      <view
        v-for="tpl in hotTemplates"
        :key="tpl.id"
        class="tpl-card"
        @click="openCreate(tpl.id)"
      >
        <text class="tpl-icon">{{ tpl.icon }}</text>
        <text class="tpl-name">{{ tpl.name }}</text>
        <text class="tpl-desc">{{ tpl.description }}</text>
      </view>
    </view>

    <view class="section-title">文案工具</view>
    <view class="tool-row">
      <view class="tool-item" @click="goTasks">查看全部任务</view>
    </view>

    <view class="bottom-space" />
    <TabBar current="/pages/index/index" />
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../../utils/request.js';
import { useUserStore } from '../../stores/user.js';
import TabBar from '../../components/TabBar.vue';
import { WRITING_TIPS, pickWritingTip } from '../../utils/writingTips.js';

const hotTemplates = ref([]);
const userStore = useUserStore();
const tipIndex = ref(0);
const tip = ref(pickWritingTip());

onMounted(async () => {
  tip.value = pickWritingTip(Date.now());
  tipIndex.value = tip.value.index;
  try {
    const categories = await api.getCategories();
    hotTemplates.value = categories
      .flatMap((c) => c.templates || [])
      .filter((t) => t?.name !== '产品介绍')
      .slice(0, 6);
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' });
  }
});

function nextTip() {
  tipIndex.value = (tipIndex.value + 1) % WRITING_TIPS.length;
  tip.value = { ...WRITING_TIPS[tipIndex.value], index: tipIndex.value };
}

function openCreate(id) {
  if (!userStore.checkLogin()) return;
  uni.navigateTo({ url: `/pages/create/create?id=${id}` });
}

function goTemplates() {
  uni.redirectTo({ url: '/pages/templates/index' });
}

function goTasks() {
  if (!userStore.checkLogin()) return;
  uni.redirectTo({ url: '/pages/history/index' });
}
</script>

<style scoped>
.page {
  padding: 32rpx;
  padding-bottom: 140rpx;
}
.hero {
  background: linear-gradient(135deg, #0a84ff, #5ac8fa);
  border-radius: 24rpx;
  padding: 48rpx 32rpx;
  color: #fff;
  margin-bottom: 32rpx;
}
.hero-title {
  font-size: 44rpx;
  font-weight: 700;
  display: block;
}
.hero-desc {
  font-size: 26rpx;
  opacity: 0.9;
  margin-top: 12rpx;
  display: block;
}
.section-title {
  font-size: 32rpx;
  font-weight: 600;
  margin: 24rpx 0 16rpx;
}
.tip-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  border: 1rpx solid #e8f1ff;
}
.tip-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1a1a1a;
  display: block;
}
.tip-body {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #606266;
  line-height: 1.65;
  display: block;
}
.tip-actions {
  margin-top: 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tip-link {
  font-size: 26rpx;
  color: #909399;
  padding: 8rpx 4rpx;
}
.tip-cta {
  background: #0a84ff;
  color: #fff;
  font-size: 26rpx;
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
}
.tpl-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
}
.tpl-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.04);
}
.tpl-icon {
  font-size: 40rpx;
  display: block;
}
.tpl-name {
  font-size: 28rpx;
  font-weight: 600;
  margin-top: 8rpx;
  display: block;
}
.tpl-desc {
  font-size: 22rpx;
  color: #909399;
  margin-top: 4rpx;
  display: block;
}
.tool-row {
  display: flex;
  gap: 20rpx;
}
.tool-item {
  flex: 1;
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  text-align: center;
  font-size: 28rpx;
  color: #0a84ff;
}
.bottom-space {
  height: 40rpx;
}
</style>
