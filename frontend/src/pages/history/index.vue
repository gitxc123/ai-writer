<template>
  <view class="page">
    <view class="toolbar">
      <view class="toolbar-left">
        <text class="toolbar-title">任务列表</text>
        <text class="toolbar-hint">仅保留最近 10 条</text>
      </view>
      <view class="toolbar-actions">
        <text class="refresh-btn" :class="{ busy: refresherTriggered }" @click="onManualRefresh">
          {{ refresherTriggered ? '刷新中' : '刷新' }}
        </text>
      </view>
    </view>

    <scroll-view
      class="list-scroll"
      scroll-y
      :refresher-enabled="refresherEnabled"
      :refresher-triggered="refresherTriggered"
      :refresher-threshold="72"
      refresher-default-style="none"
      refresher-background="#f4f6fa"
      @scroll="onScroll"
      @refresherpulling="onRefresherPulling"
      @refresherrefresh="onRefresherRefresh"
      @refresherrestore="onRefresherRestore"
      @refresherabort="onRefresherAbort"
    >
      <template #refresher>
        <view class="refresher">
          <view class="refresher-inner">
            <view class="refresher-spinner" :class="{ spin: pullPhase === 'loading' }" />
            <text class="refresher-text">{{ pullHint }}</text>
          </view>
        </view>
      </template>

      <view v-if="loading && !records.length" class="empty">任务加载中…</view>
      <view v-else-if="!loading && records.length === 0" class="empty empty-box">
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
          <view
            v-if="item.imageUrls?.length && (item.status === 'completed' || item.status === 'failed')"
            class="thumb-row"
          >
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
    </scroll-view>

    <TabBar current="/pages/history/index" />
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
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
const refresherTriggered = ref(false);
/** idle | pulling | release | loading */
const pullPhase = ref('idle');
const scrollTop = ref(0);
const userStore = useUserStore();
let loadSeq = 0;
let refreshLock = false;
let refreshStartedAt = 0;

const REFRESH_THRESHOLD = 72;
const MIN_REFRESH_MS = 480;

const refresherEnabled = computed(
  () => scrollTop.value <= 2 || refresherTriggered.value
);

const pullHint = computed(() => {
  if (pullPhase.value === 'loading') return '正在刷新…';
  if (pullPhase.value === 'release') return '松开刷新';
  if (pullPhase.value === 'pulling') return '下拉刷新';
  return '下拉刷新';
});

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {boolean} force 强制请求网络
 * @param {{ soft?: boolean }} opts soft=true 时保留列表
 */
async function loadTasks(force = false, { soft = false } = {}) {
  if (!userStore.isLogin) return;

  const userId = await ensureUserId();
  const hadList = records.value.length > 0;
  const seq = ++loadSeq;

  if (!force && userId) {
    const cached = loadRecordsCache(userId);
    if (cached?.records?.length) {
      records.value = applyImageUrlCacheToRecords(cached.records, userId);
    }
  }

  const blankPage = !soft && !records.value.length;
  if (blankPage) loading.value = true;

  try {
    const list = await api.getRecords();
    if (seq !== loadSeq) return;
    const processed = applyImageUrlCacheToRecords(
      (Array.isArray(list) ? list : []).slice(0, RECORDS_LIST_LIMIT),
      userId
    );
    records.value = processed;
    if (userId) saveRecordsCache(userId, processed);
  } catch (e) {
    if (seq !== loadSeq) return;
    if (blankPage || !hadList || force) {
      uni.showToast({ title: e.message || '任务加载失败', icon: 'none', duration: 2500 });
    }
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

function onScroll(e) {
  scrollTop.value = Number(e?.detail?.scrollTop || 0);
}

function onRefresherPulling(e) {
  if (refreshLock || refresherTriggered.value) return;
  const dy = Number(e?.detail?.dy ?? e?.detail?.deltaY ?? 0);
  if (dy < 0) return;
  pullPhase.value = dy >= REFRESH_THRESHOLD ? 'release' : 'pulling';
}

function onRefresherRestore() {
  if (!refreshLock) pullPhase.value = 'idle';
}

function onRefresherAbort() {
  if (!refreshLock) {
    pullPhase.value = 'idle';
    refresherTriggered.value = false;
  }
}

async function finishRefresher() {
  const wait = Math.max(0, MIN_REFRESH_MS - (Date.now() - refreshStartedAt));
  if (wait) await sleep(wait);
  refresherTriggered.value = false;
  pullPhase.value = 'idle';
  refreshLock = false;
}

async function runRefresh() {
  if (refreshLock) return;
  refreshLock = true;
  pullPhase.value = 'loading';
  refresherTriggered.value = true;
  refreshStartedAt = Date.now();
  try {
    await loadTasks(true, { soft: true });
  } finally {
    await finishRefresher();
  }
}

async function onRefresherRefresh() {
  // 未到顶时误触：立刻复位
  if (scrollTop.value > 2) {
    refresherTriggered.value = false;
    pullPhase.value = 'idle';
    return;
  }
  await runRefresh();
}

async function onManualRefresh() {
  if (refreshLock || refresherTriggered.value) return;
  await runRefresh();
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
  if (userStore.isLogin) loadTasks(false, { soft: true });
});
</script>

<style scoped>
.page {
  height: 100vh;
  padding: 24rpx 24rpx 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: #f4f6fa;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
  flex-shrink: 0;
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
.refresh-btn.busy {
  color: #909399;
}
.list-scroll {
  flex: 1;
  height: 0;
  padding-bottom: 140rpx;
  box-sizing: border-box;
}
.refresher {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 16rpx;
  box-sizing: border-box;
}
.refresher-inner {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.refresher-spinner {
  width: 28rpx;
  height: 28rpx;
  border-radius: 50%;
  border: 3rpx solid #dcdfe6;
  border-top-color: #0a84ff;
  box-sizing: border-box;
}
.refresher-spinner.spin {
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.refresher-text {
  font-size: 24rpx;
  color: #909399;
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
