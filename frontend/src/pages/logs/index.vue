<template>
  <view class="page">
    <view class="tabs">
      <view
        class="tab"
        :class="{ on: logModule === 'tasks' }"
        @click="switchModule('tasks')"
      >
        任务日志
      </view>
      <view
        class="tab"
        :class="{ on: logModule === 'register' }"
        @click="switchModule('register')"
      >
        新用户注册
      </view>
    </view>

    <view class="toolbar">
      <input
        v-model="filter"
        class="input"
        :placeholder="
          logModule === 'register'
            ? '搜索昵称 / 手机号片段'
            : '任务 ID（支持前缀）或点最近'
        "
        confirm-type="search"
        @confirm="search"
      />
      <view class="actions">
        <text class="btn-link" @click="search">查询</text>
        <text class="btn-link" @click="loadRecent">最近</text>
      </view>
      <text class="hint">
        {{
          logModule === 'register'
            ? '仅记录成败、配图张数与重新生成次数'
            : '同一任务的关键结果已折叠，点开可看明细'
        }}
      </text>
    </view>

    <view v-if="loading" class="empty">加载中...</view>
    <view v-else-if="logModule === 'register' && registerItems.length === 0" class="empty">
      {{ filter ? '没有匹配的注册记录' : '暂无新用户注册记录' }}
    </view>
    <view v-else-if="logModule === 'tasks' && groups.length === 0" class="empty">
      {{
        filter
          ? '没有匹配的日志，请确认任务 ID 是否完整，或点「最近」查看全部'
          : '暂无关键日志。新任务完成后会出现成功/失败与配图摘要'
      }}
    </view>

    <!-- 新用户注册：平铺列表 -->
    <template v-if="logModule === 'register'">
      <view v-for="item in registerItems" :key="item.id" class="card">
        <view class="meta">
          <text class="level info">注册</text>
          <text class="time">{{ formatTime(item.createdAt) }}</text>
        </view>
        <view v-if="item.account" class="account-row">
          <text class="account">{{ item.account }}</text>
        </view>
        <view v-if="item.userId" class="task-row">
          <text class="task-id">用户 ID · {{ item.userId }}</text>
          <text class="copy" @click.stop="copyId(item.userId, '已复制用户 ID')">复制</text>
        </view>
        <text class="message">{{ localizeLogMessage(item.message) }}</text>
      </view>
    </template>

    <!-- 任务日志：按任务折叠 -->
    <template v-else>
      <view
        v-for="g in groups"
        :key="g.key"
        class="card"
        @click="toggle(g.key)"
      >
        <view class="meta">
          <text class="level" :class="g.level">{{ levelLabel(g.level) }}</text>
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
          <text v-if="g.steps.length > 1" class="expand">
            {{ expanded[g.key] ? '收起' : `${g.steps.length} 条 ›` }}
          </text>
        </view>

        <view v-if="expanded[g.key] && g.steps.length > 1" class="steps" @click.stop>
          <view v-for="step in g.steps" :key="step.id" class="step">
            <view class="step-meta">
              <text class="level tiny" :class="step.level">{{ levelLabel(step.level) }}</text>
              <text class="step-time">{{ formatTime(step.createdAt) }}</text>
            </view>
            <text class="step-msg">{{ localizeLogMessage(step.message) }}</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { api } from '../../utils/request.js';

const logModule = ref('tasks');
const filter = ref('');
const groups = ref([]);
const registerItems = ref([]);
const loading = ref(false);
const expanded = reactive({});

function formatTime(t) {
  return new Date(t).toLocaleString('zh-CN');
}

function levelLabel(level) {
  const map = { info: '信息', warn: '警告', error: '错误' };
  return map[level] || level || '信息';
}

/** 兼容历史英文日志文案 */
function localizeLogMessage(raw) {
  const msg = String(raw || '').trim();
  if (!msg) return '';
  const exact = {
    queued: '已加入队列',
    'processing started': '开始处理',
    'rewrite start': '开始改写',
    'text start': '开始生成文案',
    'text done': '文案生成完成',
    completed: '任务完成',
    'product completed': '产品配图完成',
    'salvage partial images after timeout': '超时后保留已生成的部分配图',
    'salvage text after image failure': '配图失败，已保留文案结果',
    'takedown by complaint': '因投诉下架内容'
  };
  if (exact[msg]) return exact[msg];

  let m = msg.match(/^image\s+(\d+)\/(\d+)\s+(\w+)$/i);
  if (m) {
    const src = { ai: 'AI 生成', web: '网络搜图', product: '产品图' }[m[3]] || m[3];
    return `配图 ${m[1]}/${m[2]} · ${src}`;
  }
  m = msg.match(/^历史任务摘要\s+status=(\w+)(.*)$/i);
  if (m) {
    const statusMap = {
      completed: '已完成',
      failed: '失败',
      pending: '排队中',
      processing: '处理中',
      removed: '已下架'
    };
    return `历史任务摘要 · ${statusMap[m[1]] || m[1]}${m[2] || ''}`;
  }
  return msg;
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
  const done = steps.find((s) =>
    /^(任务成功|任务部分成功|任务失败|重新生成|任务完成|产品配图完成|completed|product completed)/i.test(
      String(s.message || '')
    )
  );
  if (done) return localizeLogMessage(done.message);
  const err = steps.find((s) => s.level === 'error');
  if (err) return localizeLogMessage(err.message);
  return localizeLogMessage(steps[0]?.message) || '任务日志';
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

async function load(opts = {}) {
  loading.value = true;
  try {
    const q = filter.value.trim();
    const data = await api.getLogs({
      module: logModule.value,
      taskId: logModule.value === 'tasks' && q ? q : undefined,
      q: logModule.value === 'register' && q ? q : undefined,
      limit: 200
    });
    const list = data.items || [];
    if (logModule.value === 'register') {
      registerItems.value = list.map((item) => ({
        ...item,
        account: accountLabel(item)
      }));
      groups.value = [];
    } else {
      groups.value = groupByTask(list);
      registerItems.value = [];
      Object.keys(expanded).forEach((k) => {
        delete expanded[k];
      });
      if (opts.taskId && groups.value.length === 1) {
        expanded[groups.value[0].key] = true;
      }
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

function switchModule(next) {
  if (logModule.value === next) return;
  logModule.value = next;
  filter.value = '';
  load();
}

function search() {
  load({ taskId: logModule.value === 'tasks' ? filter.value.trim() : '' });
}

function loadRecent() {
  filter.value = '';
  load();
}

function copyId(id, tip = '已复制任务 ID') {
  if (!id) return;
  uni.setClipboardData({
    data: id,
    success: () => uni.showToast({ title: tip, icon: 'none' })
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
.tabs {
  display: flex;
  gap: 12rpx;
  margin-bottom: 16rpx;
}
.tab {
  flex: 1;
  text-align: center;
  padding: 18rpx 12rpx;
  font-size: 28rpx;
  color: #606266;
  background: #fff;
  border-radius: 12rpx;
  border: 1rpx solid #ebeef5;
}
.tab.on {
  color: #0a84ff;
  font-weight: 600;
  border-color: #0a84ff;
  background: #eef6ff;
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
  display: block;
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
