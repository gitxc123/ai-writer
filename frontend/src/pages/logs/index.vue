<template>
  <view class="page">
    <view class="toolbar">
      <input
        v-model="filter"
        class="input"
        placeholder="任务 ID（支持前缀）或点最近"
        confirm-type="search"
        @confirm="search"
      />
      <view class="actions">
        <text class="btn-link" @click="search">查询</text>
        <text class="btn-link" @click="loadRecent">最近</text>
      </view>
    </view>

    <view v-if="loading" class="empty">加载中...</view>
    <view v-else-if="items.length === 0" class="empty">
      {{ filter ? '没有匹配的日志，请确认任务 ID 是否完整，或点「最近」查看全部' : '暂无日志。请新提交一次生成任务；也可点「最近」加载历史任务摘要' }}
    </view>

    <view v-for="item in items" :key="item.id" class="card">
      <view class="meta">
        <text class="level" :class="item.level">{{ item.level }}</text>
        <text class="time">{{ formatTime(item.createdAt) }}</text>
      </view>
      <view v-if="accountLabel(item)" class="account-row">
        <text class="account">{{ accountLabel(item) }}</text>
      </view>
      <view v-if="item.taskId" class="task-row">
        <text class="task-id">{{ item.taskId }}</text>
        <text class="copy" @click.stop="copyId(item.taskId)">复制</text>
      </view>
      <text class="message">{{ item.message }}</text>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../../utils/request.js';
import { copyTextToClipboard } from '../../utils/clipboard.js';

const filter = ref('');
const items = ref([]);
const loading = ref(false);

function formatTime(t) {
  return new Date(t).toLocaleString('zh-CN');
}

function accountLabel(item) {
  const name = String(item?.nickName || '').trim();
  const phone = String(item?.phone || '').trim();
  if (name && phone) return `${name} · ${phone}`;
  return name || phone || '';
}

async function load(taskId) {
  loading.value = true;
  try {
    const data = await api.getLogs({
      taskId: taskId || undefined,
      limit: 100
    });
    items.value = data.items || [];
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
    if (/权限|403|登录/.test(String(e.message || ''))) {
      setTimeout(() => uni.navigateBack(), 500);
    }
  } finally {
    loading.value = false;
  }
}

function search() {
  load(filter.value.trim());
}

function loadRecent() {
  filter.value = '';
  load();
}

async function copyId(id) {
  if (!id) return;
  try {
    await copyTextToClipboard(id);
    uni.showToast({ title: '已复制任务 ID', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: e.message || '复制失败', icon: 'none' });
  }
}

onMounted(() => load());
</script>

<style scoped>
.page {
  padding: 24rpx;
  padding-bottom: 60rpx;
  background: #f4f6fa;
  min-height: 100vh;
}
.toolbar {
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx;
  margin-bottom: 20rpx;
}
.input {
  border: 1rpx solid #dcdfe6;
  border-radius: 12rpx;
  padding: 18rpx;
  font-size: 28rpx;
  background: #fafafa;
}
.actions {
  display: flex;
  gap: 32rpx;
  margin-top: 16rpx;
}
.btn-link {
  color: #0a84ff;
  font-size: 28rpx;
}
.empty {
  text-align: center;
  color: #909399;
  padding: 80rpx 0;
  font-size: 28rpx;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}
.meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10rpx;
}
.level {
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  background: #eef5ff;
  color: #0a84ff;
  text-transform: uppercase;
}
.level.warn {
  background: #fff7e6;
  color: #e6a23c;
}
.level.error {
  background: #fef0f0;
  color: #f56c6c;
}
.time {
  font-size: 22rpx;
  color: #909399;
}
.account-row {
  margin-bottom: 8rpx;
}
.account {
  font-size: 26rpx;
  color: #303133;
  font-weight: 600;
}
.task-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}
.task-id {
  font-size: 22rpx;
  color: #606266;
  font-family: ui-monospace, monospace;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy {
  font-size: 22rpx;
  color: #0a84ff;
  margin-left: 16rpx;
  padding: 4rpx 8rpx;
  flex-shrink: 0;
}
.message {
  font-size: 28rpx;
  color: #303133;
  line-height: 1.5;
  display: block;
}
</style>
