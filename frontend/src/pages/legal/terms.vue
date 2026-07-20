<template>
  <view class="page">
    <text class="title">{{ TERMS_TITLE }}</text>
    <text class="meta">更新日期：2026-07-20</text>
    <view v-for="(sec, i) in TERMS_SECTIONS" :key="i" class="section">
      <text class="heading">{{ sec.heading }}</text>
      <text v-for="(p, j) in sec.paragraphs" :key="j" class="para">{{ p }}</text>
    </view>
  </view>
</template>

<script setup>
import { TERMS_TITLE, TERMS_SECTIONS } from '../../utils/legalTexts.js';
</script>

<style scoped>
.page {
  padding: 32rpx 28rpx 80rpx;
  background: #fff;
  min-height: 100vh;
}
.title {
  font-size: 40rpx;
  font-weight: 700;
  color: #1a1a1a;
  display: block;
}
.meta {
  font-size: 22rpx;
  color: #909399;
  margin: 12rpx 0 32rpx;
  display: block;
}
.section {
  margin-bottom: 36rpx;
}
.heading {
  font-size: 30rpx;
  font-weight: 600;
  color: #303133;
  display: block;
  margin-bottom: 12rpx;
}
.para {
  font-size: 26rpx;
  color: #606266;
  line-height: 1.7;
  display: block;
  margin-bottom: 12rpx;
}
</style>
