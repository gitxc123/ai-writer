<template>
  <view class="page">
    <view v-if="template" class="header">
      <text class="icon">{{ template.icon }}</text>
      <text class="name">{{ template.name }}</text>
      <text class="desc">{{ template.description }}</text>
    </view>

    <view v-if="taskStatus" class="status-card">
      <text class="status-label">任务状态</text>
      <text class="status-value" :class="statusClass">{{ statusLabel }}</text>
      <text v-if="progressHint" class="status-hint">{{ progressHint }}</text>
      <text v-if="taskError" class="status-error">{{ taskError }}</text>
    </view>

    <view v-if="!recordId" class="form">
      <view v-for="field in enrichedFields" :key="field.key" class="field">
        <view v-if="field.key === 'keyword'" class="label-row">
          <text class="label">{{ field.label }}</text>
          <text class="hot-refresh" @click="loadHotTopics">
            {{ hotLoading ? '加载中…' : `${hotLabel} · 换一批` }}
          </text>
        </view>
        <text v-else class="label">{{ field.label }}</text>

        <input
          v-if="!field.options?.length || field.key === 'keyword' || field.key === 'style'"
          v-model="inputs[field.key]"
          class="input"
          :placeholder="field.key === 'keyword' ? keywordPlaceholder(field) : (field.placeholder || '点选或自填')"
        />

        <view v-if="field.key === 'keyword'" class="chip-row">
          <view v-if="hotLoading && !hotTopics.length" class="hot-empty">正在拉取热门…</view>
          <view
            v-for="topic in hotTopics"
            :key="topic"
            class="hot-chip"
            :class="{ active: inputs.keyword === topic }"
            @click="inputs.keyword = topic"
          >
            {{ topic }}
          </view>
        </view>

        <view v-if="field.options?.length" class="chip-row">
          <view
            v-for="opt in field.options"
            :key="opt"
            class="option-chip"
            :class="{ active: inputs[field.key] === opt }"
            @click="inputs[field.key] = opt"
          >
            {{ opt }}
          </view>
        </view>
      </view>

      <view v-if="isProductIntro" class="field">
        <text class="label">产品实拍（正面 / 侧面 / 细节，至少 1 张）</text>
        <view class="slot-row">
          <view
            v-for="slot in productSlots"
            :key="slot.key"
            class="slot"
            @click="pickSlot(slot.key)"
          >
            <image v-if="slot.url" class="slot-img" :src="slot.url" mode="aspectFill" />
            <text v-else class="slot-placeholder">{{ slot.label }}</text>
            <text v-if="slot.url" class="slot-label">{{ slot.label }}</text>
          </view>
        </view>
      </view>

      <view v-if="!isProductIntro" class="field">
        <text class="label">配图</text>
        <view class="count-row">
          <view
            v-for="n in 6"
            :key="n - 1"
            class="count-chip"
            :class="{ active: imageCount === n - 1 }"
            @click="imageCount = n - 1"
          >
            {{ n - 1 === 0 ? '无' : `${n - 1}张` }}
          </view>
        </view>
      </view>

      <view v-if="!isProductIntro && imageCount > 0" class="field">
        <text class="label">配图来源</text>
        <view class="source-row">
          <view
            class="source-card"
            :class="{ active: imageSource === 'ai' }"
            @click="imageSource = 'ai'"
          >
            <text class="source-title">AI 配图</text>
            <text class="source-desc">风格统一，适合种草/创意</text>
          </view>
          <view
            class="source-card"
            :class="{ active: imageSource === 'web' }"
            @click="imageSource = 'web'"
          >
            <text class="source-title">网络搜图</text>
            <text class="source-desc">真实照片，适合新闻/赛事</text>
          </view>
        </view>
      </view>

      <view v-if="!isProductIntro && imageCount > 0 && imageSource === 'ai'" class="field">
        <text class="label">尺寸</text>
        <view class="size-row">
          <view
            v-for="opt in sizeOptions"
            :key="opt.value"
            class="size-chip"
            :class="{ active: imageSize === opt.value }"
            @click="imageSize = opt.value"
          >
            {{ opt.label }}
          </view>
        </view>
      </view>

      <view class="btn" :class="{ disabled: submitting }" @click="submitTask">
        {{ submitting ? '提交中...' : submitLabel }}
      </view>
    </view>

    <view v-if="output || isRunning(taskStatus)" class="result">
      <view v-if="output && taskStatus === 'completed'" class="platform-bar">
        <text class="platform-name">已适配：{{ platformInfo.name }}</text>
        <text class="platform-tip">{{ platformInfo.tip }}</text>
      </view>

      <text class="result-title">文案结果</text>
      <text v-if="isRunning(taskStatus) && !output" class="result-text muted">文案生成中，可前往任务列表查看进度...</text>
      <text v-else class="result-text">{{ articleBody }}</text>

      <view v-if="attributionFooter && taskStatus === 'completed'" class="attribution-box">
        <text class="attribution-title">配图来源与免责声明</text>
        <text class="attribution-text">{{ attributionFooter }}</text>
      </view>

      <view v-if="output && taskStatus === 'completed'" class="btn-row">
        <view class="btn copy-main" :class="{ disabled: copying }" @click="copyPack">
          {{ copying ? '复制中...' : `一键复制图文 · ${platformInfo.name}` }}
        </view>
        <view class="btn copy" @click="copyTextOnly">仅复制文案</view>
      </view>

      <view v-if="imageUrls.length || (isRunning(taskStatus) && imageCount > 0)" class="image-section">
        <text class="result-title">
          文章配图
          <text v-if="imageCount > 0" class="image-count">（{{ imageUrls.length }}/{{ imageCount }}）</text>
        </text>
        <text v-if="isRunning(taskStatus) && imageUrls.length < imageCount" class="result-text muted">
          配图生成中，请稍候...
        </text>
        <view class="image-grid">
          <view v-for="(item, idx) in displayImages" :key="item.url + idx" class="image-card">
            <view class="image-wrap">
              <image
                class="cover-image"
                :src="item.url"
                mode="widthFix"
                @click="previewImage(idx)"
              />
              <text v-if="imageTypeLabel(item.type)" class="img-tag">{{ imageTypeLabel(item.type) }}</text>
            </view>
            <text v-if="item.caption" class="image-caption">对应：{{ item.caption }}</text>
            <text v-if="item.credit" class="image-credit">{{ item.credit }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="link-tasks" @click="goTasks">查看全部任务 →</view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api, uploadProductPhoto } from '../../utils/request.js';
import { useUserStore } from '../../stores/user.js';
import { getStatusMeta, isRunning } from '../../utils/taskStatus.js';
import { splitArticleOutput } from '../../utils/articleOutput.js';
import { enrichTemplateFields } from '../../utils/fieldGuides.js';
import { buildPlatformPack, copyPlatformPack, detectPlatform } from '../../utils/platformExport.js';

const template = ref(null);
const inputs = ref({});
const output = ref('');
const imageUrls = ref([]);
const imageMeta = ref([]);
const imageCount = ref(1);
const imageSource = ref('ai');
const submitting = ref(false);
const templateId = ref('');
const recordId = ref('');
const currentRecordId = ref('');
const taskStatus = ref('');
const taskError = ref('');
const imageSize = ref('landscape');
const hotTopics = ref([]);
const hotLabel = ref('热门');
const hotLoading = ref(false);
const copying = ref(false);
const productSlots = ref([
  { key: 'front', label: '正面', url: '', storedUrl: '' },
  { key: 'side', label: '侧面', url: '', storedUrl: '' },
  { key: 'detail', label: '细节', url: '', storedUrl: '' }
]);
const userStore = useUserStore();
let pollTimer = null;

const sizeOptions = [
  { value: 'landscape', label: '横图 4:3' },
  { value: 'square', label: '方图 1:1' },
  { value: 'portrait', label: '竖图 3:4' },
  { value: 'cover', label: '封面 16:9' }
];

const isProductIntro = computed(() => template.value?.name === '产品介绍');
const statusLabel = computed(() => getStatusMeta(taskStatus.value).label);
const statusClass = computed(() => getStatusMeta(taskStatus.value).class);
const enrichedFields = computed(() => enrichTemplateFields(template.value).fields);
const submitLabel = computed(() => {
  if (isProductIntro.value) return '一键生成图文';
  if (imageCount.value <= 0) return '生成文案';
  return '一键生成图文';
});

const IMAGE_TYPE_LABELS = {
  enhanced: '已修复',
  closeup: '特写',
  scene: '场景'
};

function imageTypeLabel(type) {
  return IMAGE_TYPE_LABELS[type] || '';
}

const displayImages = computed(() => {
  if (imageMeta.value.length) {
    return imageMeta.value.map((meta, i) => ({
      ...meta,
      url: meta.url || imageUrls.value[i]
    }));
  }
  return imageUrls.value.map((url) => ({ url }));
});

const articleBody = computed(() => splitArticleOutput(output.value).body);
const attributionFooter = computed(() => splitArticleOutput(output.value).footer);
const platformInfo = computed(() => detectPlatform(template.value?.name || ''));

const progressHint = computed(() => {
  if (!isRunning(taskStatus.value)) return '';
  if (output.value && imageCount.value > 0 && imageUrls.value.length < imageCount.value) {
    return `配图生成中 ${imageUrls.value.length}/${imageCount.value}`;
  }
  if (!output.value) return '文案生成中...';
  return '';
});

function backendOrigin() {
  try {
    if (typeof location !== 'undefined' && location.origin) {
      return location.origin.replace(':5173', ':3001');
    }
  } catch {
    /* ignore */
  }
  return 'http://localhost:3001';
}

function previewUrl(storedUrl) {
  if (!storedUrl) return '';
  if (/^https?:\/\//i.test(storedUrl)) return storedUrl;
  return backendOrigin() + storedUrl;
}

function keywordPlaceholder(field) {
  if (hotTopics.value[0]) return `热门：${hotTopics.value[0]}`;
  return field.placeholder || '输入主题，或点选下方热门';
}

async function pickSlot(slotKey) {
  if (!userStore.checkLogin()) return;
  try {
    const choose = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: resolve,
        fail: reject
      });
    });
    const filePath = choose.tempFilePaths?.[0];
    if (!filePath) return;
    uni.showLoading({ title: '上传中...' });
    const data = await uploadProductPhoto(filePath, slotKey);
    const slot = productSlots.value.find((s) => s.key === slotKey);
    if (slot) {
      slot.storedUrl = data.url;
      slot.url = previewUrl(data.url);
    }
    uni.hideLoading();
    uni.showToast({ title: '上传成功' });
  } catch (e) {
    uni.hideLoading();
    if (e?.errMsg?.includes('cancel')) return;
    if (e.needVip) {
      uni.showModal({
        title: '需要开通会员',
        content: e.message || '请先开通会员后再创作',
        confirmText: '去开通',
        success: (r) => {
          if (r.confirm) uni.navigateTo({ url: '/pages/vip/index' });
        }
      });
    } else {
      uni.showToast({ title: e.message || '上传失败', icon: 'none' });
    }
  }
}

async function loadHotTopics() {
  if (!template.value?.name && !templateId.value) return;
  hotLoading.value = true;
  try {
    const data = await api.getHotTopics({
      templateId: templateId.value || template.value?.id,
      templateName: template.value?.name,
      limit: 8,
      refresh: true
    });
    hotTopics.value = data.topics || [];
    hotLabel.value = data.label || '热门';
  } catch {
    hotTopics.value = [];
  } finally {
    hotLoading.value = false;
  }
}

async function loadTask(id) {
  const record = await api.getRecord(id);
  template.value = record.template;
  inputs.value = record.input;
  output.value = record.output || '';
  imageUrls.value = record.imageUrls || (record.imageUrl ? [record.imageUrl] : []);
  imageMeta.value = record.imageMeta || imageUrls.value.map((url) => ({ url }));
  imageCount.value = record.imageCount ?? imageUrls.value.length ?? 0;
  imageSize.value = record.imageSize || 'landscape';
  imageSource.value = record.imageSource === 'web' ? 'web' : 'ai';
  currentRecordId.value = record.id;
  taskStatus.value = record.status;
  taskError.value = record.error || '';
  return record;
}

function startPolling(id) {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const record = await loadTask(id);
      if (!isRunning(record.status)) stopPolling();
    } catch {
      stopPolling();
    }
  }, 2500);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

onMounted(async () => {
  const pages = getCurrentPages();
  const page = pages[pages.length - 1];
  const options = page.$page?.options || page.options || {};
  templateId.value = options.id || '';
  recordId.value = options.recordId || '';

  if (recordId.value) {
    const record = await loadTask(recordId.value);
    if (isRunning(record.status)) startPolling(recordId.value);
    return;
  }

  if (!templateId.value) return;
  template.value = await api.getTemplate(templateId.value);
  for (const f of template.value.fields || []) {
    inputs.value[f.key] = '';
  }
  loadHotTopics();
});

onUnmounted(stopPolling);

async function submitTask() {
  if (submitting.value) return;
  if (!userStore.checkLogin()) return;

  let options = {
    imageCount: imageCount.value,
    imageSize: imageSize.value,
    imageSource: imageSource.value
  };

  if (isProductIntro.value) {
    const photos = productSlots.value
      .filter((s) => s.storedUrl)
      .map((s) => ({ slot: s.key, url: s.storedUrl }));
    if (!photos.length) {
      uni.showToast({ title: '请至少上传 1 张产品图', icon: 'none' });
      return;
    }
    options = {
      imageCount: 0,
      imageSize: 'square',
      imageSource: 'product',
      productPhotos: photos
    };
  }

  submitting.value = true;
  try {
    const data = await api.generate(templateId.value, inputs.value, options);
    currentRecordId.value = data.taskId;
    taskStatus.value = data.status;
    const hasImages = isProductIntro.value || imageCount.value > 0;
    uni.showToast({ title: hasImages ? '图文任务已提交' : '文案任务已提交' });
    setTimeout(() => uni.reLaunch({ url: '/pages/history/index' }), 600);
  } catch (e) {
    if (e.needVip) {
      uni.showModal({
        title: '需要开通会员',
        content: e.message || '请先开通会员后再创作',
        confirmText: '去开通',
        success: (r) => {
          if (r.confirm) uni.navigateTo({ url: '/pages/vip/index' });
        }
      });
    } else {
      uni.showToast({ title: e.message, icon: 'none' });
    }
  } finally {
    submitting.value = false;
  }
}

async function copyPack() {
  if (copying.value || !output.value) return;
  copying.value = true;
  try {
    const pack = buildPlatformPack({
      templateName: template.value?.name || '',
      output: output.value,
      images: displayImages.value
    });
    const result = await copyPlatformPack(pack);
    const tip =
      result.mode === 'rich' || result.mode === 'html'
        ? `已复制${pack.platform.name}图文，可直接粘贴`
        : `已复制文本（含图片链接），粘贴到${pack.platform.name}`;
    uni.showToast({ title: tip, icon: 'none', duration: 2500 });
  } catch (e) {
    uni.showToast({ title: e.message || '复制失败', icon: 'none' });
  } finally {
    copying.value = false;
  }
}

function copyTextOnly() {
  uni.setClipboardData({
    data: articleBody.value || output.value,
    success: () => uni.showToast({ title: '文案已复制' })
  });
}

function previewImage(index) {
  if (!imageUrls.value.length) return;
  uni.previewImage({ urls: imageUrls.value, current: imageUrls.value[index] });
}

function goTasks() {
  uni.reLaunch({ url: '/pages/history/index' });
}
</script>

<style scoped>
.page {
  padding: 24rpx;
  padding-bottom: 48rpx;
}
.header {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
}
.icon {
  font-size: 48rpx;
  display: block;
}
.name {
  font-size: 34rpx;
  font-weight: 700;
  margin-top: 8rpx;
  display: block;
}
.desc {
  font-size: 26rpx;
  color: #909399;
  margin-top: 8rpx;
  display: block;
}
.status-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
}
.status-label {
  font-size: 24rpx;
  color: #909399;
  display: block;
}
.status-value {
  font-size: 30rpx;
  font-weight: 600;
  margin-top: 8rpx;
  display: block;
}
.status-value.status-pending,
.status-value.status-processing {
  color: #0a84ff;
}
.status-value.status-completed {
  color: #19be6b;
}
.status-value.status-failed {
  color: #fa3534;
}
.status-hint {
  font-size: 24rpx;
  color: #0a84ff;
  margin-top: 8rpx;
  display: block;
}
.status-error {
  font-size: 24rpx;
  color: #fa3534;
  margin-top: 8rpx;
  display: block;
}
.field {
  margin-bottom: 28rpx;
}
.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}
.label-row .label {
  margin-bottom: 0;
}
.hot-refresh {
  font-size: 24rpx;
  color: #0a84ff;
}
.hot-chip {
  font-size: 24rpx;
  padding: 10rpx 18rpx;
  border-radius: 20rpx;
  background: #fff7e8;
  color: #b88230;
  max-width: 100%;
  line-height: 1.4;
}
.hot-chip.active {
  background: #0a84ff;
  color: #fff;
}
.hot-empty {
  font-size: 22rpx;
  color: #909399;
  padding: 8rpx 0;
}
.label {
  font-size: 28rpx;
  color: #303133;
  font-weight: 600;
  margin-bottom: 12rpx;
  display: block;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 12rpx;
}
.option-chip {
  font-size: 24rpx;
  padding: 10rpx 20rpx;
  border-radius: 20rpx;
  background: #f4f6fa;
  color: #606266;
}
.option-chip.active {
  background: #0a84ff;
  color: #fff;
}
.input {
  background: #fff;
  border-radius: 12rpx;
  padding: 24rpx;
  font-size: 28rpx;
}
.count-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.count-chip {
  font-size: 24rpx;
  padding: 12rpx 20rpx;
  border-radius: 12rpx;
  background: #fff;
  color: #606266;
}
.count-chip.active {
  background: #0a84ff;
  color: #fff;
}
.size-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.size-chip {
  font-size: 22rpx;
  padding: 8rpx 16rpx;
  border-radius: 20rpx;
  background: #fff;
  color: #606266;
}
.size-chip.active {
  background: #e8f4ff;
  color: #0a84ff;
}
.btn {
  background: #0a84ff;
  color: #fff;
  text-align: center;
  padding: 24rpx;
  border-radius: 12rpx;
  margin-top: 24rpx;
  font-size: 30rpx;
}
.btn.copy {
  background: #f0f7ff;
  color: #0a84ff;
  flex: 1;
  margin-top: 0;
}
.btn.copy-main {
  background: #0a84ff;
  color: #fff;
  flex: 1.4;
  margin-top: 0;
}
.btn-row {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}
.platform-bar {
  background: #f0f7ff;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  margin-bottom: 20rpx;
}
.platform-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #0a84ff;
  display: block;
}
.platform-tip {
  font-size: 22rpx;
  color: #606266;
  margin-top: 6rpx;
  line-height: 1.5;
  display: block;
}
.btn.disabled {
  opacity: 0.6;
}
.result {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-top: 24rpx;
}
.result-title {
  font-size: 30rpx;
  font-weight: 600;
  display: block;
  margin-bottom: 16rpx;
}
.image-count {
  font-size: 24rpx;
  font-weight: 400;
  color: #909399;
}
.result-text {
  font-size: 28rpx;
  line-height: 1.8;
  white-space: pre-wrap;
  display: block;
}
.result-text.muted {
  color: #909399;
}
.image-section {
  margin-top: 32rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #ebeef5;
}
.source-row {
  display: flex;
  gap: 12rpx;
}
.source-card {
  flex: 1;
  background: #fff;
  border-radius: 12rpx;
  padding: 20rpx;
  border: 2rpx solid transparent;
}
.source-card.active {
  border-color: #0a84ff;
  background: #f0f7ff;
}
.source-title {
  font-size: 28rpx;
  font-weight: 600;
  display: block;
  color: #303133;
}
.source-desc {
  font-size: 22rpx;
  color: #909399;
  margin-top: 6rpx;
  display: block;
}
.image-card {
  margin-bottom: 8rpx;
}
.image-wrap {
  position: relative;
}
.img-tag {
  position: absolute;
  left: 12rpx;
  top: 12rpx;
  font-size: 20rpx;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  line-height: 1.4;
}
.image-caption {
  font-size: 24rpx;
  color: #606266;
  margin-top: 8rpx;
  display: block;
}
.image-credit {
  font-size: 20rpx;
  color: #909399;
  margin-top: 4rpx;
  display: block;
}
.image-grid {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.cover-image {
  width: 100%;
  border-radius: 12rpx;
  background: #f4f6fa;
}
.attribution-box {
  margin-top: 24rpx;
  padding: 24rpx;
  background: #f8f9fb;
  border-radius: 12rpx;
  border-left: 6rpx solid #e6a23c;
}
.attribution-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #606266;
  display: block;
  margin-bottom: 12rpx;
}
.attribution-text {
  font-size: 24rpx;
  line-height: 1.8;
  color: #606266;
  white-space: pre-wrap;
  display: block;
}
.link-tasks {
  text-align: center;
  color: #0a84ff;
  font-size: 28rpx;
  margin-top: 32rpx;
}
.slot-row {
  display: flex;
  gap: 16rpx;
}
.slot {
  flex: 1;
  aspect-ratio: 1;
  background: #fff;
  border-radius: 12rpx;
  border: 2rpx dashed #dcdfe6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}
.slot-img {
  width: 100%;
  height: 100%;
}
.slot-placeholder {
  font-size: 26rpx;
  color: #909399;
}
.slot-label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  text-align: center;
  font-size: 22rpx;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  padding: 6rpx 0;
}
</style>
