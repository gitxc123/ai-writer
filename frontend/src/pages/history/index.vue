<template>
  <view class="page">
    <view class="toolbar">
      <view class="toolbar-left">
        <text class="toolbar-title">任务列表</text>
        <text class="toolbar-hint">仅保留最近 10 条</text>
      </view>
      <view class="toolbar-actions">
        <text class="refresh-btn" @click="loadTasks(true)">刷新</text>
      </view>
    </view>

    <view v-if="loading" class="empty">任务加载中…</view>
    <view v-else-if="records.length === 0" class="empty empty-box">
      <text class="empty-text">暂无任务</text>
      <view class="empty-cta" @click="goTemplates">去选模板</view>
    </view>

    <view
      v-for="item in records"
      :key="item.id"
      class="record-item"
      @click="openDetail(item)"
    >
      <text class="icon">{{ getTaskIcon(item) }}</text>
      <view class="info">
        <view class="title-row">
          <text class="name">{{ getTaskTitle(item) }}</text>
          <text class="status" :class="getStatusMeta(item.status).class">
            {{ getStatusMeta(item.status).label }}
          </text>
        </view>
        <text class="time">{{ formatTime(item.updatedAt || item.createdAt) }}</text>
        <view v-if="item.imageUrls?.length && (item.status === 'completed' || item.status === 'failed')" class="thumb-row">
          <view
            v-for="(thumb, idx) in getThumbs(item)"
            :key="thumb.url + idx"
            class="thumb-wrap"
            :class="{ 'thumb-single': item.imageUrls.length === 1 }"
          >
            <image class="thumb" :src="thumb.url" mode="aspectFill" />
            <text v-if="thumb.label" class="img-tag">{{ thumb.label }}</text>
          </view>
          <text v-if="item.imageUrls.length > 3" class="thumb-more">+{{ item.imageUrls.length - 3 }}</text>
        </view>
        <image
          v-else-if="item.imageUrl && item.status === 'completed'"
          class="thumb thumb-single"
          :src="item.imageUrl"
          mode="aspectFill"
        />
        <text class="preview" :class="{ error: item.status === 'failed' }">
          {{ getPreviewText(item) }}
        </text>
      </view>
    </view>

    <view class="bottom-space" />
    <TabBar current="/pages/history/index" />
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import { api } from '../../utils/request.js';
import { useUserStore } from '../../stores/user.js';
import TabBar from '../../components/TabBar.vue';
import {
  getStatusMeta,
  getTaskTitle,
  getTaskIcon,
  getPreviewText
} from '../../utils/taskStatus.js';
import {
  loadRecordsCache,
  saveRecordsCache,
  RECORDS_LIST_LIMIT
} from '../../utils/recordsCache.js';
import { applyImageUrlCacheToRecords } from '../../utils/imageUrlCache.js';

const records = ref([]);
const loading = ref(false);
const backgroundLoading = ref(false);
const userStore = useUserStore();

function goTemplates() {
  uni.redirectTo({ url: '/pages/templates/index' });
}

const IMAGE_TYPE_LABELS = {
  enhanced: '已修复',
  closeup: '特写',
  scene: '场景'
};

function getThumbs(item) {
  const seen = new Set();
  const meta = item.imageMeta || [];
  const fromMeta = meta
    .filter((m) => m?.url)
    .map((m) => ({
      url: m.url,
      label: IMAGE_TYPE_LABELS[m.type] || ''
    }))
    .filter((t) => {
      const key = t.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
  if (fromMeta.length) return fromMeta;
  return (item.imageUrls || []).slice(0, 3).map((url) => ({ url, label: '' }));
}

async function ensureUserId() {
  if (userStore.user?.id) return userStore.user.id;
  try {
    await userStore.fetchUser();
  } catch {
    // ignore
  }
  return userStore.user?.id || null;
}

async function loadTasks(force = false, { keepVisible = false } = {}) {
  if (!userStore.isLogin) return;

  const userId = await ensureUserId();
  const hadList = records.value.length > 0;

  if (!force && userId) {
    const cached = loadRecordsCache(userId);
    if (cached?.records?.length) {
      records.value = applyImageUrlCacheToRecords(cached.records, userId);
    }
  }

  const showSpinner = !keepVisible && (force || !records.value.length);
  if (showSpinner) {
    if (loading.value) return;
    loading.value = true;
  } else if (backgroundLoading.value) {
    return;
  } else {
    backgroundLoading.value = true;
  }

  try {
    const list = await api.getRecords();
    const processed = applyImageUrlCacheToRecords(
      (Array.isArray(list) ? list : []).slice(0, RECORDS_LIST_LIMIT),
      userId
    );
    records.value = processed;
    if (userId) saveRecordsCache(userId, processed);
  } catch (e) {
    if (showSpinner || !hadList) {
      uni.showToast({ title: e.message || '任务加载失败', icon: 'none', duration: 2500 });
    }
  } finally {
    loading.value = false;
    backgroundLoading.value = false;
  }
}

async function onPullRefresh() {
  try {
    await loadTasks(true, { keepVisible: true });
  } finally {
    uni.stopPullDownRefresh();
  }
}

function formatTime(t) {
  return new Date(t).toLocaleString('zh-CN');
}

function openDetail(item) {
  if (item.taskType === 'image' && item.parentId) {
    uni.navigateTo({ url: `/pages/create/create?recordId=${item.parentId}` });
    return;
  }
  uni.navigateTo({ url: `/pages/create/create?recordId=${item.id}` });
}

onMounted(() => {
  if (!userStore.checkLogin()) return;
  loadTasks();
});

onShow(() => {
  if (userStore.isLogin) loadTasks();
});

onPullDownRefresh(() => {
  onPullRefresh();
});
</script>

<style scoped>
.page {
  padding: 24rpx;
  padding-bottom: 140rpx;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}
.toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  min-width: 0;
}
.toolbar-actions {
  display: flex;
  gap: 24rpx;
  flex-shrink: 0;
}
.toolbar-title {
  font-size: 30rpx;
  font-weight: 600;
}
.toolbar-hint {
  font-size: 22rpx;
  color: #c0c4cc;
}
.refresh-btn {
  font-size: 26rpx;
  color: #0a84ff;
}
.empty {
  text-align: center;
  color: #909399;
  padding: 120rpx 0;
  font-size: 28rpx;
}
.empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
}
.empty-text {
  font-size: 28rpx;
  color: #909399;
}
.empty-cta {
  background: #0a84ff;
  color: #fff;
  font-size: 28rpx;
  padding: 16rpx 40rpx;
  border-radius: 999rpx;
}
.record-item {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  display: flex;
}
.icon {
  font-size: 44rpx;
  margin-right: 20rpx;
}
.info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12rpx;
}
.name {
  font-size: 28rpx;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status {
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 20rpx;
  white-space: nowrap;
  flex-shrink: 0;
}
.status-pending {
  background: #f4f4f5;
  color: #909399;
}
.status-processing {
  background: #e8f4ff;
  color: #0a84ff;
}
.status-completed {
  background: #e8faf0;
  color: #19be6b;
}
.status-failed {
  background: #fef0f0;
  color: #fa3534;
}
.time {
  font-size: 22rpx;
  color: #909399;
  margin-top: 8rpx;
  display: block;
}
.thumb-row {
  display: flex;
  gap: 8rpx;
  margin-top: 12rpx;
  align-items: stretch;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
}
.thumb-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 180rpx;
  border-radius: 12rpx;
  overflow: hidden;
}
.thumb-wrap.thumb-single {
  flex: 1 1 100%;
  height: 200rpx;
}
.thumb {
  width: 100%;
  height: 100%;
  border-radius: 12rpx;
  display: block;
}
/* 兼容仅有单张 imageUrl 的旧任务 */
image.thumb.thumb-single {
  width: 100%;
  height: 200rpx;
  margin-top: 12rpx;
}
.img-tag {
  position: absolute;
  left: 8rpx;
  top: 8rpx;
  font-size: 18rpx;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  line-height: 1.4;
}
.thumb-more {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #909399;
  align-self: center;
}
.preview {
  font-size: 24rpx;
  color: #606266;
  margin-top: 8rpx;
  display: block;
  line-height: 1.6;
}
.preview.error {
  color: #fa3534;
}
.bottom-space {
  height: 40rpx;
}
</style>
