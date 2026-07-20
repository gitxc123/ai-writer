<template>
  <view class="page">
    <text class="title">联系客服</text>
    <text class="intro">{{ tip }}</text>

    <view class="card">
      <text class="label">微信扫码添加</text>
      <image
        v-if="qrVisible"
        class="qr"
        :src="qrSrc"
        mode="aspectFit"
        show-menu-by-longpress
        @error="onQrError"
        @click="previewQr"
      />
      <view v-else class="qr-placeholder">
        <text class="ph-title">暂未配置二维码</text>
        <text class="ph-sub">请将客服微信二维码保存为</text>
        <text class="ph-code">frontend/src/static/wechat-service-qr.png</text>
      </view>
      <text class="hint">长按二维码可识别或保存到相册</text>
    </view>

    <view v-if="wechatId" class="card id-card">
      <text class="label">微信号</text>
      <view class="id-row">
        <text class="id-text">{{ wechatId }}</text>
        <text class="copy" @click="copyId">复制</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import {
  WECHAT_SERVICE_ID,
  WECHAT_SERVICE_QR,
  WECHAT_SERVICE_TIP
} from '../../utils/contact.js';
import { copyTextToClipboard } from '../../utils/clipboard.js';

const tip = WECHAT_SERVICE_TIP;
const wechatId = WECHAT_SERVICE_ID;
const qrSrc = WECHAT_SERVICE_QR;
const qrVisible = ref(true);

function onQrError() {
  qrVisible.value = false;
}

function previewQr() {
  if (!qrVisible.value) return;
  uni.previewImage({ urls: [qrSrc], current: qrSrc });
}

async function copyId() {
  if (!wechatId) return;
  try {
    await copyTextToClipboard(wechatId);
    uni.showToast({ title: '微信号已复制', icon: 'none' });
  } catch (e) {
    uni.showToast({ title: e.message || '复制失败', icon: 'none' });
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
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #606266;
  line-height: 1.6;
  display: block;
}
.card {
  margin-top: 28rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.label {
  font-size: 28rpx;
  font-weight: 600;
  color: #303133;
  align-self: flex-start;
  margin-bottom: 24rpx;
}
.qr {
  width: 420rpx;
  height: 420rpx;
  background: #f5f7fa;
  border-radius: 12rpx;
}
.qr-placeholder {
  width: 100%;
  padding: 48rpx 24rpx;
  background: #f5f7fa;
  border-radius: 12rpx;
  text-align: center;
}
.ph-title {
  display: block;
  font-size: 28rpx;
  color: #606266;
  margin-bottom: 12rpx;
}
.ph-sub {
  display: block;
  font-size: 24rpx;
  color: #909399;
}
.ph-code {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #0a84ff;
  word-break: break-all;
}
.hint {
  margin-top: 20rpx;
  font-size: 22rpx;
  color: #909399;
}
.id-card {
  align-items: stretch;
}
.id-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: #f5f7fa;
  border-radius: 12rpx;
  padding: 20rpx 24rpx;
}
.id-text {
  font-size: 30rpx;
  color: #303133;
}
.copy {
  font-size: 26rpx;
  color: #0a84ff;
  padding: 8rpx 12rpx;
}
</style>
