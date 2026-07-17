<template>
  <view class="page">
    <view class="toolbar">
      <text class="toolbar-title">任务列表</text>
      <view class="toolbar-actions">
        <text class="refresh-btn" @click="resumeStuck">恢复卡住</text>
        <text class="refresh-btn" @click="loadTasks">刷新</text>
      </view>
    </view>

    <view v-if="records.length === 0 && !loading" class="empty">暂无任务</view>

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
        <view class="id-row" @click.stop="copyTaskId(item.id)">
          <text class="task-id">ID {{ shortId(item.id) }}</text>
          <text class="copy-id">复制</text>
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

    <view v-if="hasRunning" class="polling-tip">自动刷新中...</view>
    <view class="bottom-space" />
    <TabBar current="/pages/history/index" />
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api } from '../../utils/request.js';
import { useUserStore } from '../../stores/user.js';
import TabBar from '../../components/TabBar.vue';
import {
  getStatusMeta,
  getTaskTitle,
  getTaskIcon,
  getPreviewText,
  isRunning
} from '../../utils/taskStatus.js';

const records = ref([]);
const loading = ref(false);
const userStore = useUserStore();
let pollTimer = null;

const hasRunning = computed(() => records.value.some((item) => isRunning(item.status)));

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
      if (seen.has(t.url)) return false;
      seen.add(t.url);
      return true;
    })
    .slice(0, 3);
  if (fromMeta.length) return fromMeta;
  return (item.imageUrls || []).slice(0, 3).map((url) => ({ url, label: '' }));
}

async function loadTasks() {
  if (!userStore.isLogin) return;
  loading.value = true;
  try {
    records.value = await api.getRecords();
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function resumeStuck() {
  if (!userStore.checkLogin()) return;
  try {
    await api.resumeTasks();
    uni.showToast({ title: '已重新排队' });
    await loadTasks();
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' });
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (hasRunning.value) {
      loadTasks();
    }
  }, 2500);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function formatTime(t) {
  return new Date(t).toLocaleString('zh-CN');
}

function shortId(id) {
  const s = String(id || '');
  return s.length <= 10 ? s : `${s.slice(0, 8)}…`;
}

function copyTaskId(id) {
  uni.setClipboardData({
    data: String(id),
    success: () => uni.showToast({ title: '任务 ID 已复制', icon: 'none' })
  });
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
  startPolling();
});

onShow(() => {
  if (userStore.isLogin) loadTasks();
});

onUnmounted(stopPolling);
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
.toolbar-actions {
  display: flex;
  gap: 24rpx;
}
.toolbar-title {
  font-size: 30rpx;
  font-weight: 600;
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
.id-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 8rpx;
}
.task-id {
  font-size: 22rpx;
  color: #909399;
  font-family: ui-monospace, monospace;
}
.copy-id {
  font-size: 22rpx;
  color: #0a84ff;
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
.polling-tip {
  text-align: center;
  font-size: 22rpx;
  color: #909399;
  padding: 8rpx 0 16rpx;
}
.bottom-space {
  height: 40rpx;
}
</style>
