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
      <text class="hint">同一任务的过程日志已折叠为一条，点开可看明细</text>
    </view>

    <view v-if="loading" class="empty">加载中...</view>
    <view v-else-if="groups.length === 0" class="empty">
      {{ filter ? '没有匹配的日志，请确认任务 ID 是否完整，或点「最近」查看全部' : '暂无日志。请新提交一次生成任务；也可点「最近」加载历史任务摘要' }}
    </view>

    <view
      v-for="g in groups"
      :key="g.key"
      class="card"
      @click="toggle(g.key)"
    >
      <view class="meta">
        <text class="level" :class="g.level">{{ g.level }}</text>
        <text class="time">{{ formatTime(g.updatedAt) }}</text>
      </view>
      <view v-if="g.account" class="account-row">
        <text class="account">{{ g.account }}</text>
      </view>
      <view v-if="g.taskId" class="task-row">
        <text class="task-id">{{ g.taskId }}</text>
        <text class="copy" @click.stop="copyId(g.taskId)">复制</text>
      </view>
      <view class="summary-row">
        <text class="message">{{ g.summary }}</text>
        <text class="expand">{{ expanded[g.key] ? '收起' : `${g.steps.length} 步 ›` }}</text>
      </view>

      <view v-if="expanded[g.key]" class="steps" @click.stop>
        <view v-for="step in g.steps" :key="step.id" class="step">
          <view class="step-meta">
            <text class="level tiny" :class="step.level">{{ step.level }}</text>
            <text class="step-time">{{ formatTime(step.createdAt) }}</text>
          </view>
          <text class="step-msg">{{ step.message }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api } from '../../utils/request.js';

const filter = ref('');
const groups = ref([]);
const loading = ref(false);
const expanded = reactive({});

function formatTime(t) {
  return new Date(t).toLocaleString('zh-CN');
}

function accountLabel(item) {
  const name = String(item?.nickName || '').trim();
  const phone = String(item?.phone || '').trim();
  if (name && phone) return `${name} · ${phone}`;
  return name || phone || '';
}

function pickLevel(steps) {
  if (steps.some((s) => s.level === 'error')) return 'error';
  if (steps.some((s) => s.level === 'warn')) return 'warn';
  return 'info';
}

function pickSummary(steps) {
  const done = steps.find((s) => /^(completed|product completed)$/i.test(String(s.message || '')));
  if (done) return done.message;
  const err = steps.find((s) => s.level === 'error');
  if (err) return err.message;
  return steps[0]?.message || '过程日志';
}

/** 按任务折叠；无 taskId 的单独成组 */
function groupByTask(items) {
  const map = new Map();
  const order = [];

  for (const item of items) {
    const tid = String(item.taskId || '').trim();
    const key = tid || `orphan:${item.id}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        taskId: tid || '',
        account: accountLabel(item),
        steps: []
      });
      order.push(key);
    }
    const g = map.get(key);
    g.steps.push(item);
    if (!g.account) g.account = accountLabel(item);
  }

  return order.map((key) => {
    const g = map.get(key);
    // 接口按时间倒序；组内步骤改为正序便于阅读过程
    const steps = [...g.steps].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const latest = g.steps[0];
    return {
      key: g.key,
      taskId: g.taskId,
      account: g.account,
      level: pickLevel(steps),
      updatedAt: latest?.createdAt || steps[steps.length - 1]?.createdAt,
      summary: pickSummary([...steps].reverse()),
      steps
    };
  });
}

function toggle(key) {
  expanded[key] = !expanded[key];
}

async function load(taskId) {
  loading.value = true;
  try {
    const data = await api.getLogs({
      taskId: taskId || undefined,
      limit: 200
    });
    const list = data.items || [];
    groups.value = groupByTask(list);
    Object.keys(expanded).forEach((k) => {
      delete expanded[k];
    });
    // 按任务 ID 查询时默认展开这一组
    if (taskId && groups.value.length === 1) {
      expanded[groups.value[0].key] = true;
    }
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

function copyId(id) {
  if (!id) return;
  uni.setClipboardData({
    data: id,
    success: () => uni.showToast({ title: '已复制任务 ID', icon: 'none' })
  });
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
.hint {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #c0c4cc;
  line-height: 1.4;
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
.level.tiny {
  font-size: 20rpx;
  padding: 2rpx 8rpx;
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
.summary-row {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}
.message {
  font-size: 28rpx;
  color: #303133;
  line-height: 1.5;
  flex: 1;
  min-width: 0;
}
.expand {
  font-size: 22rpx;
  color: #909399;
  flex-shrink: 0;
  padding-top: 4rpx;
}
.steps {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #eef0f3;
}
.step {
  padding: 12rpx 0;
  border-bottom: 1rpx solid #f5f6f8;
}
.step:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.step-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6rpx;
}
.step-time {
  font-size: 20rpx;
  color: #c0c4cc;
}
.step-msg {
  font-size: 26rpx;
  color: #606266;
  line-height: 1.45;
  display: block;
}
</style>
