<template>
  <view class="page">
    <text class="title">投诉与反馈</text>
    <text class="intro">
      如您认为某条生成内容侵犯合法权益，请填写下方信息。任务 ID 可在「任务」列表或详情页复制。我们将尽力在收到完整材料后
      {{ slaDays }} 日内答复处理进展。本服务侧下架后，已发布至头条/小红书等平台的内容需另行向该平台投诉删除。
    </text>
    <text class="email" v-if="complaintEmail">联系邮箱：{{ complaintEmail }}</text>
    <text class="email" v-else>请优先通过下方表单提交；运营邮箱未配置时以表单记录为准。</text>

    <view class="form">
      <text class="label">任务 ID（必填）</text>
      <input v-model="recordId" class="input" placeholder="例如 clxxxxxxxx" />

      <text class="label">联系方式（必填）</text>
      <input v-model="contact" class="input" placeholder="手机号或邮箱，便于核实回访" />

      <text class="label">事由说明（必填）</text>
      <textarea
        v-model="reason"
        class="textarea"
        maxlength="1000"
        placeholder="请说明侵权类型、涉及权利及事实经过"
      />

      <text class="label">证据链接（选填）</text>
      <input v-model="evidenceUrl" class="input" placeholder="权利证明或原文链接" />

      <view class="btn" :class="{ disabled: submitting }" @click="submit">
        {{ submitting ? '提交中...' : '提交投诉' }}
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { request } from '../../utils/request.js';
import { getComplaintEmail } from '../../utils/legalTexts.js';

const complaintEmail = ref(getComplaintEmail());
const slaDays = ref(15);
const recordId = ref('');
const contact = ref('');
const reason = ref('');
const evidenceUrl = ref('');
const submitting = ref(false);

onMounted(async () => {
  try {
    const meta = await request({ url: '/complaints/meta', method: 'GET' });
    if (meta?.email) complaintEmail.value = meta.email;
    if (meta?.responseSlaDays) slaDays.value = meta.responseSlaDays;
  } catch {
    // keep placeholder
  }
});

async function submit() {
  if (submitting.value) return;
  const rid = recordId.value.trim();
  const c = contact.value.trim();
  const r = reason.value.trim();
  if (!rid || !c || !r) {
    uni.showToast({ title: '请填写必填项', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    await request({
      url: '/complaints',
      method: 'POST',
      data: {
        recordId: rid,
        contact: c,
        reason: r,
        evidenceUrl: evidenceUrl.value.trim() || undefined
      }
    });
    uni.showToast({ title: '已记录，将在核实后处理', icon: 'none' });
    recordId.value = '';
    reason.value = '';
    evidenceUrl.value = '';
  } catch (e) {
    uni.showToast({ title: e.message || '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.page {
  padding: 32rpx 28rpx 80rpx;
  background: #f4f6fa;
  min-height: 100vh;
}
.title {
  font-size: 40rpx;
  font-weight: 700;
  color: #1a1a1a;
  display: block;
}
.intro {
  font-size: 26rpx;
  color: #606266;
  line-height: 1.6;
  margin: 16rpx 0 12rpx;
  display: block;
}
.email {
  font-size: 24rpx;
  color: #0a84ff;
  margin-bottom: 24rpx;
  display: block;
}
.form {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
}
.label {
  font-size: 26rpx;
  color: #303133;
  font-weight: 600;
  display: block;
  margin-bottom: 10rpx;
  margin-top: 8rpx;
}
.input {
  border: 1rpx solid #dcdfe6;
  border-radius: 12rpx;
  padding: 20rpx;
  font-size: 28rpx;
  margin-bottom: 20rpx;
  background: #fafafa;
}
.textarea {
  border: 1rpx solid #dcdfe6;
  border-radius: 12rpx;
  padding: 20rpx;
  font-size: 28rpx;
  width: 100%;
  min-height: 200rpx;
  box-sizing: border-box;
  margin-bottom: 20rpx;
  background: #fafafa;
}
.btn {
  margin-top: 12rpx;
  background: #0a84ff;
  color: #fff;
  text-align: center;
  padding: 24rpx;
  border-radius: 12rpx;
  font-size: 30rpx;
}
.btn.disabled {
  opacity: 0.6;
}
</style>
