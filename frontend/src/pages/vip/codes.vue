<template>
  <view class="page">
    <view class="hero">
      <text class="hero-title">创建激活码</text>
      <text class="hero-desc">仅发码账号可创建四档会员激活码，发给买家兑换。</text>
    </view>

    <view class="issue-box">
      <text class="issue-title">创建激活码</text>
      <view class="plan-chip-row">
        <view
          v-for="p in codePlans"
          :key="p.planId"
          class="plan-chip"
          :class="{ active: issuePlanId === p.planId }"
          @click="issuePlanId = p.planId"
        >
          {{ p.name }}
          <text class="plan-chip-sub">{{ p.days > 0 ? p.days + '天' : '永久' }} · ¥{{ p.price }}</text>
        </view>
      </view>
      <view class="issue-row">
        <text class="issue-label">数量</text>
        <input v-model="issueCount" class="issue-input" type="number" maxlength="3" />
      </view>
      <view class="issue-row">
        <text class="issue-label">备注</text>
        <input v-model="issueNote" class="issue-input" placeholder="如：客户微信昵称" maxlength="40" />
      </view>
      <view class="create-btn" :class="{ disabled: issuing }" @click="createCodes">
        {{ issuing ? '生成中…' : '生成激活码' }}
      </view>
    </view>

    <view class="stock-box">
      <text class="stock-title">库存与状态</text>
      <text class="stock-summary">
        共 {{ agentSummary.total }} 个 · 未用完 {{ agentSummary.unused }} · 已核销次数 {{ agentSummary.usedSlots }}
      </text>
      <view v-if="agentCodes.length" class="code-list">
        <view v-for="c in agentCodes" :key="c.id" class="code-item">
          <view class="code-main">
            <text class="code-value">{{ c.code }}</text>
            <text class="code-meta">
              {{ c.planName || c.planId }} · {{ c.days > 0 ? c.days + '天' : '永久' }} ·
              {{ c.statusLabel }} · 剩{{ c.remaining }}/{{ c.maxUses }}
            </text>
            <text
              v-for="(acc, i) in (c.linkedAccounts || []).slice(0, 3)"
              :key="acc.userId + i"
              class="code-link"
            >
              关联：{{ acc.phoneMask || acc.userId }} · {{ formatDate(acc.createdAt) }}
            </text>
          </view>
          <text class="copy-link" @click="copyText(c.code)">复制</text>
        </view>
      </view>
      <text v-else class="empty">暂无库存码，请先上方创建</text>
    </view>

    <view v-if="agentRedeems.length" class="log-box">
      <text class="stock-title">使用日志</text>
      <view class="comm-list">
        <view v-for="r in agentRedeems" :key="r.id" class="comm-item">
          <text>
            {{ r.phoneMask || '用户' }} · {{ r.planName || '' }}
            {{ r.days > 0 ? '+' + r.days + '天' : '永久' }} · {{ r.code }}
          </text>
          <text class="comm-time">{{ formatDate(r.createdAt) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { api } from '../../utils/request.js';
import { useUserStore } from '../../stores/user.js';

const userStore = useUserStore();
const agentCodes = ref([]);
const agentRedeems = ref([]);
const agentSummary = ref({ total: 0, unused: 0, usedSlots: 0 });
const codePlans = ref([
  { planId: 'trial', name: '试用会员', days: 3, price: 9.9 },
  { planId: 'monthly', name: '包月会员', days: 30, price: 59.9 },
  { planId: 'yearly', name: '包年会员', days: 365, price: 299 },
  { planId: 'lifetime', name: '永久会员', days: 0, price: 499 }
]);
const issuePlanId = ref('monthly');
const issueCount = ref('1');
const issueNote = ref('');
const issuing = ref(false);

onMounted(async () => {
  if (!userStore.checkLogin()) return;
  await userStore.fetchUser();
  try {
    const data = await api.getMembershipMe();
    if (data?.user) userStore.user = data.user;
  } catch {
    // ignore
  }
  if (!userStore.user?.canIssueCodes) {
    uni.showToast({ title: '仅发码账号可进入', icon: 'none' });
    setTimeout(() => {
      uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/mine/index' }) });
    }, 800);
    return;
  }
  await loadCodes();
});

async function loadCodes() {
  try {
    const pack = await api.getAgentCodes();
    agentSummary.value = pack?.summary || { total: 0, unused: 0, usedSlots: 0 };
    agentCodes.value = pack?.codes || [];
    agentRedeems.value = pack?.redeems || [];
    if (Array.isArray(pack?.plans) && pack.plans.length) {
      codePlans.value = pack.plans;
    }
  } catch (e) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  }
}

function formatDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day} ${hh}:${mm}`;
}

function copyText(text) {
  uni.setClipboardData({
    data: String(text || ''),
    success: () => uni.showToast({ title: '已复制', icon: 'none' })
  });
}

async function createCodes() {
  if (issuing.value) return;
  if (!userStore.checkLogin()) return;
  if (!userStore.user?.canIssueCodes) {
    uni.showToast({ title: '无权创建激活码', icon: 'none' });
    return;
  }
  const count = Math.min(50, Math.max(1, Number(issueCount.value) || 1));
  issuing.value = true;
  try {
    const data = await api.createAgentCodes({
      planId: issuePlanId.value,
      count,
      maxUses: 1,
      note: String(issueNote.value || '').trim()
    });
    const list = data?.codes || [];
    if (list.length === 1) {
      await new Promise((resolve) => {
        uni.setClipboardData({
          data: list[0].code,
          success: () => {
            uni.showToast({ title: `已生成并复制：${list[0].code}`, icon: 'none', duration: 2500 });
            resolve();
          },
          fail: resolve
        });
      });
    } else {
      uni.showToast({ title: `已生成 ${list.length} 个激活码`, icon: 'none' });
    }
    issueNote.value = '';
    await loadCodes();
  } catch (e) {
    uni.showToast({ title: e.message || '创建失败', icon: 'none' });
  } finally {
    issuing.value = false;
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f5f6f8;
  padding: 24rpx 24rpx 48rpx;
  box-sizing: border-box;
}
.hero {
  margin-bottom: 24rpx;
}
.hero-title {
  font-size: 40rpx;
  font-weight: 700;
  display: block;
}
.hero-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #909399;
  line-height: 1.5;
}
.issue-box,
.stock-box,
.log-box {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.issue-title,
.stock-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.plan-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 16rpx;
}
.plan-chip {
  background: #f5f7fa;
  border: 2rpx solid #e4e7ed;
  border-radius: 12rpx;
  padding: 12rpx 16rpx;
  font-size: 24rpx;
  color: #606266;
  min-width: 40%;
  box-sizing: border-box;
}
.plan-chip.active {
  border-color: #0a84ff;
  color: #0a84ff;
  background: #eef6ff;
}
.plan-chip-sub {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: #909399;
}
.issue-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 12rpx;
}
.issue-label {
  width: 80rpx;
  font-size: 24rpx;
  color: #606266;
  flex-shrink: 0;
}
.issue-input {
  flex: 1;
  background: #f5f7fa;
  border-radius: 8rpx;
  padding: 14rpx 16rpx;
  font-size: 26rpx;
}
.create-btn {
  margin-top: 12rpx;
  background: #1a1a2e;
  color: #fff;
  text-align: center;
  padding: 22rpx;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 600;
}
.create-btn.disabled {
  opacity: 0.6;
}
.stock-summary {
  display: block;
  font-size: 26rpx;
  color: #606266;
}
.empty {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #c0c4cc;
}
.code-list {
  margin-top: 16rpx;
}
.code-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 14rpx 0;
  border-top: 1rpx solid #ebeef5;
}
.code-main {
  flex: 1;
  min-width: 0;
}
.code-value {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  font-family: ui-monospace, monospace;
  letter-spacing: 1rpx;
}
.code-meta {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #909399;
}
.code-link {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: #67c23a;
}
.copy-link {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #0a84ff;
  padding: 8rpx 12rpx;
}
.comm-list {
  border-top: 1rpx solid #ebeef5;
  padding-top: 4rpx;
}
.comm-item {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  padding: 10rpx 0;
  color: #67c23a;
  gap: 12rpx;
}
.comm-time {
  color: #c0c4cc;
  flex-shrink: 0;
}
</style>
