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
      <text
        v-if="taskError"
        class="status-error"
        :class="{ 'status-partial': isPartialImageNote }"
      >{{ displayTaskError }}</text>
      <view v-if="retryAction" class="btn retry status-retry" :class="{ disabled: retrying }" @click="retryTask">
        {{ retrying ? '提交中...' : retryAction.label }}
      </view>
    </view>

    <view v-if="!recordId" class="form">
      <view v-if="loadError" class="load-error">{{ loadError }}</view>
      <view v-if="pageReady && !enrichedFields.length && !loadError" class="load-error">
        模板字段加载失败，请返回重试
      </view>

      <!-- 产品介绍：独立表单，避开 uni-input 动态 v-model 不同步 -->
      <view v-if="isProductIntro" class="product-form">
        <view class="field">
          <text class="label">产品名称</text>
          <textarea
            class="input area"
            :key="'pn-' + productNameKey"
            :value="productName"
            placeholder="输入产品叫什么，例如：便携榨汁杯"
            :auto-height="true"
            :maxlength="80"
            @input="onProductNameInput"
          />
          <view class="chip-row">
            <view
              v-for="ex in productNameExamples"
              :key="ex"
              class="option-chip"
              :class="{ active: productName === ex }"
              @click="pickProductName(ex)"
            >
              {{ ex }}
            </view>
          </view>
        </view>

        <view class="field">
          <text class="label">产品卖点</text>
          <textarea
            class="input area"
            :key="'ps-' + productSellingKey"
            :value="productSelling"
            placeholder="点选下方卖点（可多选），也可自己输入"
            :auto-height="true"
            :maxlength="200"
            @input="onProductSellingInput"
          />
          <view class="chip-row">
            <text class="chip-hint">可多选，也可在上方自己输入</text>
            <view
              v-for="point in sellingPointOptions"
              :key="point"
              class="option-chip"
              :class="{ active: selectedSellingPoints.includes(point) }"
              @click="toggleProductSellingPoint(point)"
            >
              {{ point }}
            </view>
          </view>
        </view>

        <view class="field">
          <text class="label">卖给谁</text>
          <textarea
            class="input area"
            :key="'aud-' + productAudienceKey"
            :value="productAudience"
            placeholder="点选或自填"
            :auto-height="true"
            :maxlength="40"
            @input="onProductAudienceInput"
          />
          <view class="chip-row">
            <view
              v-for="opt in audienceOptions"
              :key="opt"
              class="option-chip"
              :class="{ active: productAudience === opt }"
              @click="pickAudience(opt)"
            >
              {{ opt }}
            </view>
          </view>
        </view>

        <view class="field">
          <text class="label">字数</text>
          <view class="chip-row">
            <view
              v-for="opt in lengthOptions"
              :key="opt"
              class="option-chip"
              :class="{ active: String(inputs.length) === String(opt) }"
              @click="setField('length', opt)"
            >
              {{ opt }}
            </view>
          </view>
        </view>

        <view class="field">
          <text class="label">产品参考图（1–9 张）</text>
          <text class="field-tip">建议多角度实拍。系统会解析并设计约 5 张图（修复+特写+场景），并校验商标保真与场景物理逻辑</text>
          <view class="slot-row wrap">
            <view
              v-for="(photo, idx) in productPhotos"
              :key="photo.key"
              class="slot filled"
            >
              <image class="slot-img" :src="photo.url" mode="aspectFill" @click="previewProductPhoto(idx)" />
              <text class="slot-remove" @click.stop="removeProductPhoto(idx)">×</text>
              <text class="slot-label">{{ idx + 1 }}</text>
            </view>
            <view
              v-if="productPhotos.length < 9"
              class="slot add"
              @click="addProductPhotos"
            >
              <text class="slot-placeholder">+ 添加</text>
              <text class="slot-sub">{{ productPhotos.length }}/9</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 其它模板：通用字段 -->
      <view v-if="templateGuide.tip && !isProductIntro" class="guide-tip">{{ templateGuide.tip }}</view>
      <view v-for="field in genericFields" :key="field.key" class="field">
        <view v-if="field.key === 'keyword' && !isPasteTemplate" class="label-row">
          <text class="label">{{ field.label }}</text>
          <text class="hot-refresh" @click="loadHotTopics">
            {{ hotLoading ? '加载中…' : `${hotLabel} · 换一批` }}
          </text>
        </view>
        <text v-else class="label">{{ field.label }}</text>

        <textarea
          v-if="
            field.key === 'article' ||
            field.key === 'story' ||
            field.key === 'requirements' ||
            field.key === 'keyword' ||
            field.key === 'style' ||
            !field.options?.length
          "
          class="input area"
          :class="{ 'area-lg': field.key === 'article' || field.key === 'story' }"
          :value="inputs[field.key] || ''"
          :placeholder="
            field.key === 'keyword' && !isPasteTemplate
              ? keywordPlaceholder(field)
              : field.placeholder || '点选或自填'
          "
          v-bind="
            field.key === 'story'
              ? { maxlength: 10000 }
              : field.key === 'article'
                ? { maxlength: 8000 }
                : {}
          "
          :auto-height="true"
          @input="(e) => onGenericInput(field.key, e)"
        />
        <text v-if="field.key === 'story'" class="char-count">
          {{ String(inputs.story || '').length }}/10000
        </text>

        <view v-if="field.key === 'keyword' && !isPasteTemplate" class="chip-row">
          <view v-if="hotLoading && !hotTopics.length" class="hot-empty">正在拉取热门…</view>
          <view
            v-for="topic in hotTopics"
            :key="topic"
            class="hot-chip"
            :class="{ active: inputs.keyword === topic }"
            @click="setGenericField('keyword', topic)"
          >
            {{ topic }}
          </view>
        </view>

        <view
          v-if="field.options?.length && field.key !== 'article' && field.key !== 'story'"
          class="chip-row"
        >
          <view
            v-for="opt in field.options"
            :key="opt"
            class="option-chip"
            :class="{
              active:
                field.key === 'requirements'
                  ? isRequirementSelected(opt)
                  : inputs[field.key] === opt
            }"
            @click="
              field.key === 'requirements'
                ? toggleRequirement(opt)
                : setGenericField(field.key, opt)
            "
          >
            {{ opt }}
          </view>
        </view>
      </view>
      <view v-if="!isProductIntro && !isStoryboard && template" class="field">
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

      <view v-if="!isProductIntro && !isStoryboard && imageCount > 0" class="field">
        <text class="label">配图来源</text>
        <view class="source-row">
          <view
            class="source-card"
            :class="{ active: imageSource === 'ai' }"
            @click="imageSource = 'ai'"
          >
            <text class="source-title">AI 配图</text>
            <text class="source-desc">AI 生成，非现场真实照片</text>
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
        <text v-if="imageSource === 'ai'" class="source-hint">{{ aiImageSubmitHint }}</text>
        <text v-else class="source-hint">{{ webImageSubmitHint }}</text>
      </view>

      <view v-if="!isProductIntro && !isStoryboard && imageCount > 0 && imageSource === 'ai'" class="field">
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

      <text class="peak-hint">高峰期（如晚间）服务可能繁忙，文案或配图偶发失败属正常，失败后可在任务列表重试。</text>
      <text class="quota-hint">每日最多 {{ dailyGenerateLimit }} 次；从第 11 次起会轮流提醒精做。提交间隔至少 5 秒。</text>
      <view class="btn" :class="{ disabled: submitting }" @click="submitTask">
        {{ submitting ? '提交中...' : submitLabel }}
      </view>
    </view>

    <view v-if="output || isRunning(taskStatus)" class="result">
      <view v-if="currentRecordId" class="task-id-bar">
        <text>任务 ID：{{ shortTaskId(currentRecordId) }}</text>
        <text class="copy-link" @click.stop="copyCurrentTaskId">复制</text>
      </view>
      <view v-if="canCopyResult" class="platform-bar">
        <text class="platform-name">已适配：{{ platformInfo.name }}</text>
        <text class="platform-tip">{{ platformInfo.tip }}</text>
      </view>

      <text class="result-title">{{ isStoryboard ? '分镜结果' : '文案结果' }}</text>
      <text v-if="isRunning(taskStatus) && !output" class="result-text muted">文案生成中，可前往任务列表查看进度...</text>

      <!-- 分镜：按镜头卡片 + 一键复制 -->
      <view v-else-if="isStoryboard && storyboardShots.length" class="shot-list">
        <view v-for="shot in storyboardShots" :key="shot.id" class="shot-card">
          <view class="shot-head">
            <text class="shot-title">镜头 {{ shot.id }}｜{{ shot.title }}</text>
            <view class="shot-copy" @click="copyShotPrompt(shot)">复制提示词</view>
          </view>
          <text class="shot-prompt">{{ shot.prompt }}</text>
        </view>
        <view v-if="canCopyResult" class="btn-row shot-actions">
          <view class="btn copy" @click="copyTextOnly">复制全部结果</view>
        </view>
      </view>

      <text v-else class="result-text">{{ articleBody }}</text>

      <view v-if="attributionFooter && canCopyResult" class="attribution-box">
        <text class="attribution-title">配图来源与免责声明</text>
        <text class="attribution-text">{{ attributionFooter }}</text>
      </view>

      <view v-if="canCopyResult && !isStoryboard" class="btn-row">
        <view
          v-if="imageUrls.length"
          class="btn copy-main"
          :class="{ disabled: copying }"
          @click="copyPack"
        >
          {{ copying ? '复制中...' : `一键复制图文 · ${platformInfo.name}` }}
        </view>
        <view
          v-if="platformInfo.id === 'toutiao' && exportTitle"
          class="btn copy"
          @click="copyExportTitle"
        >
          复制标题
        </view>
        <view class="btn copy" :class="{ 'copy-main': !imageUrls.length }" @click="copyTextOnly">
          仅复制文案
        </view>
      </view>

      <view v-if="platformInfo.id === 'toutiao' && exportTitle" class="export-tip">
        {{ platformInfo.tip }}
      </view>

      <view v-if="imageUrls.length || (isRunning(taskStatus) && imageCount > 0)" class="image-section">
        <text class="result-title">
          文章配图
          <text v-if="imageCount > 0" class="image-count">（{{ imageUrls.length }}/{{ imageCount }}）</text>
        </text>
        <text v-if="canRegenerateImage" class="result-text muted regen-hint">
          每张配图最多重新生成 {{ imageRegenMax }} 次（不占用每日创作次数）；用尽后需新建任务。高峰期重生成也可能失败。
        </text>
        <text v-if="isRunning(taskStatus) && imageUrls.length < imageCount" class="result-text muted">
          配图生成中，请稍候...
        </text>
        <view class="image-grid">
          <view v-for="(item, idx) in displayImages" :key="'img-' + (item.slotIndex ?? idx)" class="image-card">
            <view class="image-wrap">
              <image
                class="cover-image"
                :src="item.url"
                mode="widthFix"
                @click="previewImage(idx)"
              />
              <view v-if="isImageRegenerating(item.slotIndex ?? idx)" class="img-regen-mask">
                <text class="img-regen-text">重新生成中...</text>
              </view>
              <text v-if="imageTypeLabel(item.type)" class="img-tag">{{ imageTypeLabel(item.type) }}</text>
            </view>
            <text v-if="item.caption" class="image-caption">对应：{{ item.caption }}</text>
            <text v-if="item.credit" class="image-credit">{{ item.credit }}</text>
            <view
              v-if="canRegenerateImage"
              class="img-regen-btn"
              :class="{ disabled: isImageRegenerating(item.slotIndex ?? idx) || !imageRegenRemaining(item.slotIndex ?? idx) }"
              @click="regenerateImage(item.slotIndex ?? idx)"
            >
              {{ regenButtonLabel(item.slotIndex ?? idx) }}
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="link-tasks" @click="goTasks">查看全部任务 →</view>
  </view>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { api, uploadProductPhoto } from '../../utils/request.js';
import { useUserStore } from '../../stores/user.js';
import { getStatusMeta, isRunning } from '../../utils/taskStatus.js';
import { splitArticleOutput, WEB_IMAGE_SUBMIT_HINT, AI_IMAGE_SUBMIT_HINT } from '../../utils/articleOutput.js';
import { enrichTemplateFields } from '../../utils/fieldGuides.js';
import { buildPlatformPack, copyPlatformPack, detectPlatform } from '../../utils/platformExport.js';
import { clampToutiaoTitle, charLen } from '../../utils/platformLimits.js';
import { toUserErrorMessage } from '../../utils/userError.js';
import { parseStoryboardShots } from '../../utils/storyboardShots.js';
import { applyImageUrlCacheToRecords, extractUploadPath } from '../../utils/imageUrlCache.js';
import {
  getSellingPointOptions,
  splitSellingPoints,
  toggleSellingPoint
} from '../../utils/productSellingPoints.js';

const template = ref(null);
const inputs = reactive({});
const output = ref('');
const imageUrls = ref([]);
const imageMeta = ref([]);
const imageCount = ref(1);
const imageSource = ref('ai');
const submitting = ref(false);
const dailyGenerateLimit = ref(30);
const lastSubmitAt = ref(0);
const SUBMIT_COOLDOWN_MS = 5000;
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
const retrying = ref(false);
const retryInfo = ref(null);
const regeneratingIndexes = ref([]);
const imageRegenMax = ref(3);
const imageRegenRemainingList = ref([]);
const pageReady = ref(false);
const loadError = ref('');
const productPhotos = ref([]);
const userStore = useUserStore();
let pollTimer = null;
let pollInFlight = false;
let productPhotoSeq = 0;

const sizeOptions = [
  { value: 'landscape', label: '横图 4:3' },
  { value: 'square', label: '方图 1:1' },
  { value: 'portrait', label: '竖图 3:4' },
  { value: 'cover', label: '封面 16:9' }
];

const isProductIntro = computed(() => template.value?.name === '产品介绍');
const isRewrite = computed(() => template.value?.name === '一键改文');
const isStoryboard = computed(() => template.value?.name === '故事分镜提示词');
const isPasteTemplate = computed(() => isRewrite.value || isStoryboard.value);
const statusLabel = computed(() => getStatusMeta(taskStatus.value).label);
const statusClass = computed(() => getStatusMeta(taskStatus.value).class);
const isPartialImageNote = computed(() =>
  /部分完成|配图完成|文案已完成/.test(String(taskError.value || ''))
);
const canRegenerateImage = computed(
  () =>
    Boolean(currentRecordId.value) &&
    !isStoryboard.value &&
    !isProductIntro.value &&
    imageUrls.value.length > 0 &&
    Boolean(output.value) &&
    !isRunning(taskStatus.value)
);
const displayTaskError = computed(() => {
  if (!taskError.value) return '';
  if (isPartialImageNote.value) return taskError.value;
  return toUserErrorMessage(taskError.value, '生成失败，请稍后重试');
});
const canCopyResult = computed(
  () => Boolean(String(output.value || '').trim()) && !isRunning(taskStatus.value)
);
const retryAction = computed(() => {
  if (isRunning(taskStatus.value)) return null;
  if (retryInfo.value?.mode) return retryInfo.value;
  // 本地兜底：未拉到 retry 字段时也能判断
  const hasOut = Boolean(String(output.value || '').trim());
  const needImg = imageCount.value > 0;
  const missing = needImg && imageUrls.value.length < imageCount.value;
  const note = String(taskError.value || '');
  const imageFail = /配图失败|文案已完成|配图完成/.test(note);
  if (hasOut && needImg && (missing || imageFail)) {
    return { mode: 'images', label: '重试配图' };
  }
  if (taskStatus.value === 'failed' && !hasOut) {
    return { mode: 'full', label: '重新提交' };
  }
  return null;
});
const templateGuide = computed(() => enrichTemplateFields(template.value));
const enrichedFields = computed(() => templateGuide.value.fields);
const genericFields = computed(() =>
  isProductIntro.value ? [] : enrichedFields.value
);

const productName = ref('');
const productSelling = ref('');
const productAudience = ref('');
const productNameKey = ref(0);
const productSellingKey = ref(0);
const productAudienceKey = ref(0);
const productNameExamples = [
  '便携榨汁杯',
  '降噪耳机',
  '氨基酸洗发水',
  '保温杯',
  '筋膜枪',
  '空气炸锅'
];
const audienceOptions = ['上班族', '宝妈', '学生党', '商务人群', '银发群体', '户外运动党'];
const lengthOptions = ['150', '200', '300'];

const sellingPointOptions = computed(() =>
  isProductIntro.value ? getSellingPointOptions(productName.value) : []
);
const selectedSellingPoints = computed(() =>
  isProductIntro.value ? splitSellingPoints(productSelling.value) : []
);
const submitLabel = computed(() => {
  if (isStoryboard.value) return '生成分镜提示词';
  if (isRewrite.value) {
    return imageCount.value > 0 ? '一键改写配图' : '一键改写';
  }
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
  const meta = imageMeta.value || [];
  const urls = imageUrls.value || [];
  const len = Math.max(meta.length, urls.length);
  const out = [];
  for (let i = 0; i < len; i += 1) {
    const m = meta[i] && typeof meta[i] === 'object' ? meta[i] : {};
    const url = m.url || urls[i] || '';
    if (!url) continue;
    out.push({ ...m, url, slotIndex: i });
  }
  return out;
});

const exportPackPreview = computed(() =>
  buildPlatformPack({
    templateName: template.value?.name || '',
    output: output.value || '',
    images: displayImages.value
  })
);

const exportTitle = computed(() => exportPackPreview.value.title || '');

const articleBody = computed(() => splitArticleOutput(output.value).body);
const attributionFooter = computed(() => splitArticleOutput(output.value).footer);
const aiImageSubmitHint = AI_IMAGE_SUBMIT_HINT;
const webImageSubmitHint = WEB_IMAGE_SUBMIT_HINT;
const storyboardShots = computed(() =>
  isStoryboard.value ? parseStoryboardShots(output.value) : []
);
const platformInfo = computed(() => detectPlatform(template.value?.name || ''));

const progressHint = computed(() => {
  if (!isRunning(taskStatus.value)) return '';
  if (output.value && imageCount.value > 0 && imageUrls.value.length < imageCount.value) {
    return `配图生成中 ${imageUrls.value.length}/${imageCount.value}`;
  }
  if (output.value && imageCount.value > 0 && !imageUrls.value.length) {
    return '解析参考图并设计中...';
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

function eventValue(event) {
  return event?.detail?.value ?? event?.target?.value ?? '';
}

function syncProductInputs() {
  inputs.keyword = productName.value;
  inputs.sellingPoint = productSelling.value;
  inputs.style = productAudience.value;
  if (!inputs.length) inputs.length = '200';
}

function onProductNameInput(event) {
  productName.value = eventValue(event);
  syncProductInputs();
}

function onProductSellingInput(event) {
  productSelling.value = eventValue(event);
  syncProductInputs();
}

function onProductAudienceInput(event) {
  productAudience.value = eventValue(event);
  syncProductInputs();
}

function pickProductName(name) {
  productName.value = name;
  const nextOpts = new Set(getSellingPointOptions(name));
  const knownChips = collectAllMappedPoints();
  const preserved = splitSellingPoints(productSelling.value).filter(
    (p) => nextOpts.has(p) || !knownChips.has(p)
  );
  productSelling.value = preserved.join('、');
  productNameKey.value += 1;
  productSellingKey.value += 1;
  syncProductInputs();
}

function toggleProductSellingPoint(point) {
  productSelling.value = toggleSellingPoint(productSelling.value, point);
  productSellingKey.value += 1;
  syncProductInputs();
}

function pickAudience(opt) {
  productAudience.value = opt;
  productAudienceKey.value += 1;
  syncProductInputs();
}

function setField(key, value) {
  inputs[key] = value;
}

const genericInputTick = ref(0);

function setGenericField(key, value) {
  inputs[key] = value;
  genericInputTick.value += 1;
}

function splitRequirements(raw) {
  return String(raw || '')
    .split(/[、,，;；\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isRequirementSelected(opt) {
  return splitRequirements(inputs.requirements).includes(opt);
}

/** 额外要求：预置项可多选，再拼进输入框；自定义文字保留 */
function toggleRequirement(opt) {
  const presets = new Set([
    '无字幕',
    '无声音',
    '无旁白',
    '无口播',
    '无文字出镜',
    '无人物正脸',
    '无品牌 Logo',
    '循环可播',
    '适合竖屏刷完'
  ]);
  const parts = splitRequirements(inputs.requirements);
  const selected = new Set(parts.filter((p) => presets.has(p)));
  const custom = parts.filter((p) => !presets.has(p));
  if (selected.has(opt)) selected.delete(opt);
  else selected.add(opt);
  inputs.requirements = [...selected, ...custom].join('、');
  genericInputTick.value += 1;
}

function onGenericInput(key, event) {
  inputs[key] = eventValue(event);
}

function collectAllMappedPoints() {
  const set = new Set(getSellingPointOptions(''));
  ['榨汁', '耳机', '洗发', '保温杯', '筋膜', '空气炸锅', '护肤', '鼠标', '吸尘器', '台灯'].forEach((k) => {
    getSellingPointOptions(k).forEach((p) => set.add(p));
  });
  return set;
}

function keywordPlaceholder(field) {
  if (hotTopics.value[0]) return `热门：${hotTopics.value[0]}`;
  return field.placeholder || '输入主题，或点选下方热门';
}

async function addProductPhotos() {
  if (!userStore.checkLogin()) return;
  const remain = 9 - productPhotos.value.length;
  if (remain <= 0) {
    uni.showToast({ title: '最多上传 9 张参考图', icon: 'none' });
    return;
  }
  try {
    const choose = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: remain,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: resolve,
        fail: reject
      });
    });
    const paths = choose.tempFilePaths || [];
    if (!paths.length) return;
    uni.showLoading({ title: '上传中...' });
    for (const filePath of paths) {
      if (productPhotos.value.length >= 9) break;
      productPhotoSeq += 1;
      const slot = `ref-${productPhotoSeq}`;
      const data = await uploadProductPhoto(filePath, slot);
      productPhotos.value.push({
        key: `${slot}-${Date.now()}`,
        slot,
        storedUrl: data.url,
        url: previewUrl(data.url)
      });
    }
    uni.hideLoading();
    uni.showToast({ title: `已上传 ${productPhotos.value.length}/9`, icon: 'none' });
  } catch (e) {
    uni.hideLoading();
    if (e?.errMsg?.includes('cancel')) return;
    if (e.needVip) {
      uni.showModal({
        title: '需要开通会员',
        content: e.message || '请先开通会员后再创作',
        confirmText: '去开通',
        success: (r) => {
          if (r.confirm) uni.navigateTo({ url: '/pages/vip/activate' });
        }
      });
    } else {
      uni.showToast({ title: e.message || '上传失败', icon: 'none' });
    }
  }
}

function removeProductPhoto(idx) {
  productPhotos.value.splice(idx, 1);
}

function previewProductPhoto(idx) {
  const urls = productPhotos.value.map((p) => p.url).filter(Boolean);
  if (!urls.length) return;
  uni.previewImage({ current: urls[idx] || urls[0], urls });
}

async function loadHotTopics() {
  if (isProductIntro.value || isPasteTemplate.value) {
    hotTopics.value = [];
    return;
  }
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

function shortTaskId(id) {
  const s = String(id || '');
  return s.length <= 10 ? s : `${s.slice(0, 8)}…`;
}

function copyCurrentTaskId() {
  if (!currentRecordId.value) return;
  uni.setClipboardData({
    data: String(currentRecordId.value),
    success: () => uni.showToast({ title: '任务 ID 已复制', icon: 'none' })
  });
}

async function loadTask(id, options = {}) {
  const poll = options.poll === true;
  const record = await api.getRecord(id);

  if (!poll) {
    template.value = record.template;
    Object.keys(inputs).forEach((k) => delete inputs[k]);
    Object.assign(inputs, record.input || {});
    productName.value = inputs.keyword || '';
    productSelling.value = inputs.sellingPoint || '';
    productAudience.value = inputs.style || '';
    productNameKey.value += 1;
    productSellingKey.value += 1;
    productAudienceKey.value += 1;
    imageCount.value = record.imageCount ?? 0;
    imageSize.value = record.imageSize || 'landscape';
    imageSource.value = record.imageSource === 'web' ? 'web' : 'ai';
  }

  if (!poll || record.output !== output.value) {
    output.value = record.output || '';
  }

  const userId = userStore.user?.id || null;
  const [cached] = applyImageUrlCacheToRecords(
    [
      {
        imageUrl: record.imageUrl,
        imageUrls: record.imageUrls || (record.imageUrl ? [record.imageUrl] : []),
        imageMeta: record.imageMeta || [],
        imageUrlPath: record.imageUrlPath,
        imagePaths: record.imagePaths
      }
    ],
    userId
  );
  const nextUrls = cached?.imageUrls || record.imageUrls || (record.imageUrl ? [record.imageUrl] : []);
  const nextMeta = cached?.imageMeta || record.imageMeta || [];
  const prevUrls = imageUrls.value || [];
  const prevMeta = imageMeta.value || [];

  imageUrls.value = nextUrls.map((u, i) => {
    const prev = prevUrls[i];
    const pa = extractUploadPath(u);
    const pb = extractUploadPath(prev);
    if (pa && pb && pa === pb && prev) return prev;
    return u;
  });
  imageMeta.value = nextMeta.map((m, i) => {
    const prev = prevMeta[i] || {};
    const raw = m?.url || nextUrls[i] || '';
    const prevUrl = prev.url || prevUrls[i] || '';
    const pa = extractUploadPath(raw);
    const pb = extractUploadPath(prevUrl);
    const url = pa && pb && pa === pb && prevUrl ? prevUrl : raw;
    return { ...(m || {}), url };
  });
  if (!imageMeta.value.length && imageUrls.value.length) {
    imageMeta.value = imageUrls.value.map((url) => ({ url }));
  }
  if (!poll) {
    imageCount.value = record.imageCount ?? imageUrls.value.length ?? 0;
  }

  currentRecordId.value = record.id;
  taskStatus.value = record.status;
  taskError.value = record.error || '';
  retryInfo.value = record.retry || null;
  regeneratingIndexes.value = Array.isArray(record.regeneratingIndexes)
    ? record.regeneratingIndexes
    : [];
  if (record.imageRegen?.max) {
    imageRegenMax.value = Number(record.imageRegen.max) || 3;
  }
  if (Array.isArray(record.imageRegen?.remaining)) {
    imageRegenRemainingList.value = record.imageRegen.remaining.map((n) =>
      Math.max(0, Number(n) || 0)
    );
  } else {
    imageRegenRemainingList.value = (imageMeta.value || []).map((m) => {
      const used = Math.max(0, Number(m?.regenCount) || 0);
      return Math.max(0, imageRegenMax.value - used);
    });
  }
  return record;
}

function isImageRegenerating(idx) {
  return regeneratingIndexes.value.includes(idx);
}

function imageRegenRemaining(idx) {
  if (imageRegenRemainingList.value[idx] != null) {
    return imageRegenRemainingList.value[idx];
  }
  const used = Math.max(0, Number(imageMeta.value?.[idx]?.regenCount) || 0);
  return Math.max(0, imageRegenMax.value - used);
}

function regenButtonLabel(idx) {
  if (isImageRegenerating(idx)) return '生成中...';
  const left = imageRegenRemaining(idx);
  if (left <= 0) return `已达上限（${imageRegenMax.value}次）`;
  return `重新生成（剩${left}次）`;
}

async function regenerateImage(idx) {
  if (!canRegenerateImage.value || isImageRegenerating(idx) || !currentRecordId.value) return;
  if (!imageRegenRemaining(idx)) {
    uni.showModal({
      title: '已达重新生成上限',
      content: `第 ${idx + 1} 张配图最多可重新生成 ${imageRegenMax.value} 次，次数已用完。如需新图请新建任务。`,
      showCancel: false,
      confirmText: '知道了'
    });
    return;
  }
  if (!userStore.checkLogin()) return;
  try {
    regeneratingIndexes.value = [...new Set([...regeneratingIndexes.value, idx])];
    const data = await api.regenerateRecordImage(currentRecordId.value, idx);
    if (typeof data?.regenRemaining === 'number') {
      const next = [...imageRegenRemainingList.value];
      next[idx] = data.regenRemaining;
      imageRegenRemainingList.value = next;
    } else {
      const next = [...imageRegenRemainingList.value];
      next[idx] = Math.max(0, (next[idx] ?? imageRegenMax.value) - 1);
      imageRegenRemainingList.value = next;
    }
    uni.showToast({ title: data.message || `第 ${idx + 1} 张开始重新生成`, icon: 'none' });
    startPolling(currentRecordId.value, { untilRegenDone: true });
  } catch (e) {
    regeneratingIndexes.value = regeneratingIndexes.value.filter((i) => i !== idx);
    if (e.needVip) {
      uni.showModal({
        title: '需要开通会员',
        content: e.message || '请先开通会员后再创作',
        confirmText: '去开通',
        success: (r) => {
          if (r.confirm) uni.navigateTo({ url: '/pages/vip/activate' });
        }
      });
    } else {
      uni.showToast({ title: e.message || '重新生成失败', icon: 'none' });
    }
  }
}

function startPolling(id, options = {}) {
  stopPolling();
  const tick = async () => {
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      const record = await loadTask(id, { poll: true });
      const regenDone = !(record.regeneratingIndexes || []).length;
      const taskDone = !isRunning(record.status);
      if (options.untilRegenDone) {
        if (regenDone) stopPolling();
      } else if (taskDone && regenDone) {
        stopPolling();
      }
    } catch {
      stopPolling();
    } finally {
      pollInFlight = false;
    }
  };
  pollTimer = setInterval(tick, 4000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pollInFlight = false;
}

onLoad((options) => {
  templateId.value = options?.id || '';
  recordId.value = options?.recordId || '';
});

onMounted(async () => {
  // H5 / 某些端 onLoad 参数偶发丢失，再兜底一次
  if (!templateId.value && !recordId.value) {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    const options = page?.$page?.options || page?.options || {};
    templateId.value = options.id || '';
    recordId.value = options.recordId || '';
  }

  try {
    if (recordId.value) {
      const record = await loadTask(recordId.value);
      pageReady.value = true;
      if (isRunning(record.status)) startPolling(recordId.value);
      return;
    }

    try {
      const cfg = await api.getMembershipConfig();
      if (cfg?.dailyGenerateLimit) {
        dailyGenerateLimit.value = Number(cfg.dailyGenerateLimit) || 30;
      }
    } catch {
      // ignore
    }

    if (!templateId.value) {
      loadError.value = '缺少模板参数，请从模板列表重新进入';
      pageReady.value = true;
      return;
    }

    template.value = await api.getTemplate(templateId.value);
    const fields = Array.isArray(template.value.fields)
      ? template.value.fields
      : typeof template.value.fields === 'string'
        ? JSON.parse(template.value.fields || '[]')
        : [];
    template.value = { ...template.value, fields };
    Object.keys(inputs).forEach((k) => delete inputs[k]);
    for (const f of fields) {
      inputs[f.key] = '';
    }
    if (!inputs.length && template.value.name !== '故事分镜提示词') {
      inputs.length = '200';
    }
    if (template.value.name === '故事分镜提示词') {
      delete inputs.length;
      inputs.platform = inputs.platform || '通用';
      inputs.style = inputs.style || '真人实拍';
      inputs.ratio = inputs.ratio || '9:16';
      inputs.duration = inputs.duration || '5秒';
      inputs.cameraMove = inputs.cameraMove || '按剧情自动';
      imageCount.value = 0;
    }
    productName.value = '';
    productSelling.value = '';
    productAudience.value = '';
    productNameKey.value += 1;
    productSellingKey.value += 1;
    productAudienceKey.value += 1;
    pageReady.value = true;
    loadHotTopics();
  } catch (e) {
    loadError.value = e.message || '加载失败';
    pageReady.value = true;
    uni.showToast({ title: loadError.value, icon: 'none' });
  }
});

onUnmounted(stopPolling);

async function submitTask() {
  if (submitting.value) return;
  if (!userStore.checkLogin()) return;

  const sinceLast = Date.now() - (lastSubmitAt.value || 0);
  if (lastSubmitAt.value && sinceLast < SUBMIT_COOLDOWN_MS) {
    const wait = Math.ceil((SUBMIT_COOLDOWN_MS - sinceLast) / 1000);
    uni.showToast({ title: `提交过快，请 ${wait} 秒后再试`, icon: 'none' });
    return;
  }

  let options = {
    imageCount: imageCount.value,
    imageSize: imageSize.value,
    imageSource: imageSource.value
  };

  if (isProductIntro.value) {
    syncProductInputs();
    if (!String(productName.value || '').trim()) {
      uni.showToast({ title: '请填写产品名称', icon: 'none' });
      return;
    }
    if (!String(productSelling.value || '').trim()) {
      uni.showToast({ title: '请填写或选择产品卖点', icon: 'none' });
      return;
    }
    const photos = productPhotos.value
      .filter((s) => s.storedUrl)
      .map((s) => ({ slot: s.slot, url: s.storedUrl }));
    if (!photos.length) {
      uni.showToast({ title: '请至少上传 1 张产品参考图', icon: 'none' });
      return;
    }
    if (photos.length > 9) {
      uni.showToast({ title: '参考图最多 9 张', icon: 'none' });
      return;
    }
    options = {
      imageCount: 0,
      imageSize: 'square',
      imageSource: 'product',
      productPhotos: photos
    };
  }

  if (isRewrite.value) {
    const article = String(inputs.article || '').trim();
    if (article.length < 50) {
      uni.showToast({ title: '请粘贴至少 50 字的原文', icon: 'none' });
      return;
    }
    // 保留用户选择的配图数量/来源/尺寸
  }

  if (isStoryboard.value) {
    const story = String(inputs.story || '').trim();
    if (story.length < 30) {
      uni.showToast({ title: '请粘贴至少 30 字的故事原文', icon: 'none' });
      return;
    }
    if (story.length > 10000) {
      uni.showToast({ title: '故事原文请控制在 10000 字以内', icon: 'none' });
      return;
    }
    if (!String(inputs.platform || '').trim()) {
      uni.showToast({ title: '请选择提示词平台', icon: 'none' });
      return;
    }
    options = {
      imageCount: 0,
      imageSize: imageSize.value,
      imageSource: 'ai'
    };
  }

  submitting.value = true;
  try {
    const data = await api.generate(templateId.value, { ...inputs }, options);
    lastSubmitAt.value = Date.now();
    currentRecordId.value = data.taskId;
    taskStatus.value = data.status;
    const hasImages = isProductIntro.value || imageCount.value > 0;
    const tip = data.qualityTip || data.tip || '';
    const goHistory = () => uni.reLaunch({ url: '/pages/history/index' });

    if (tip) {
      uni.showModal({
        title: '任务已提交',
        content: tip,
        showCancel: false,
        confirmText: '知道了',
        success: goHistory
      });
      return;
    }

    uni.showToast({
      title: hasImages
        ? '图文任务已提交'
        : isStoryboard.value
          ? '分镜任务已提交'
          : isRewrite.value
            ? '改写任务已提交'
            : '文案任务已提交'
    });
    setTimeout(goHistory, 600);
  } catch (e) {
    if (e.needVip) {
      uni.showModal({
        title: '需要开通会员',
        content: e.message || '请先开通会员后再创作',
        confirmText: '去开通',
        success: (r) => {
          if (r.confirm) uni.navigateTo({ url: '/pages/vip/activate' });
        }
      });
    } else {
      uni.showToast({ title: e.message || '提交失败，请稍后重试', icon: 'none', duration: 2800 });
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
    let tip =
      result.mode === 'rich' || result.mode === 'html'
        ? `已复制${pack.platform.name}图文（含图片链接），可直接粘贴`
        : `已复制文本（含图片链接），粘贴到${pack.platform.name}`;
    if (pack.platform.id === 'toutiao' && pack.title) {
      tip = `已复制图文链接。标题${charLen(pack.title)}/30字，也可单独点「复制标题」`;
    }
    uni.showToast({ title: tip, icon: 'none', duration: 2800 });
  } catch (e) {
    uni.showToast({ title: e.message || '复制失败', icon: 'none' });
  } finally {
    copying.value = false;
  }
}

function copyExportTitle() {
  const title = clampToutiaoTitle(exportTitle.value || '');
  if (!title) {
    uni.showToast({ title: '没有可复制的标题', icon: 'none' });
    return;
  }
  uni.setClipboardData({
    data: title,
    success: () =>
      uni.showToast({
        title: `标题已复制（${charLen(title)}/30字）`,
        icon: 'none'
      })
  });
}

function copyTextOnly() {
  // 含 AI 标识与配图免责，避免一键复制剥离合规声明
  const full = String(output.value || '').trim();
  uni.setClipboardData({
    data: full || articleBody.value,
    success: () => uni.showToast({ title: '文案已复制（含标识说明）', icon: 'none' })
  });
}

function copyShotPrompt(shot) {
  const text = String(shot?.prompt || '').trim();
  if (!text) {
    uni.showToast({ title: '该镜头暂无可复制提示词', icon: 'none' });
    return;
  }
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title: `镜头 ${shot.id} 已复制` })
  });
}

async function retryTask() {
  if (retrying.value || !retryAction.value || !currentRecordId.value) return;
  if (!userStore.checkLogin()) return;
  retrying.value = true;
  try {
    const data = await api.retryRecord(currentRecordId.value);
    taskStatus.value = data.status || 'pending';
    taskError.value = '';
    retryInfo.value = null;
    uni.showToast({
      title: data.message || (data.mode === 'images' ? '开始重试配图' : '已重新提交'),
      icon: 'none'
    });
    startPolling(currentRecordId.value);
  } catch (e) {
    if (e.needVip) {
      uni.showModal({
        title: '需要开通会员',
        content: e.message || '请先开通会员后再创作',
        confirmText: '去开通',
        success: (r) => {
          if (r.confirm) uni.navigateTo({ url: '/pages/vip/activate' });
        }
      });
    } else {
      uni.showToast({ title: e.message || '重试失败', icon: 'none' });
    }
  } finally {
    retrying.value = false;
  }
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
.status-error.status-partial {
  color: #c98900;
}
.status-retry {
  margin-top: 20rpx;
}
.btn.retry {
  background: #ff9500;
  color: #fff;
}
.form {
  background: #fff;
  border-radius: 16rpx;
  padding: 28rpx;
  margin-bottom: 24rpx;
}
.load-error {
  font-size: 26rpx;
  color: #fa3534;
  margin-bottom: 16rpx;
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
.chip-hint {
  width: 100%;
  font-size: 22rpx;
  color: #909399;
  margin-bottom: 4rpx;
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
  background: #ffffff;
  border: 1rpx solid #dcdfe6;
  border-radius: 12rpx;
  padding: 24rpx;
  font-size: 28rpx;
  width: 100%;
  box-sizing: border-box;
  color: #303133;
  min-height: 80rpx;
}
.input.area {
  min-height: 88rpx;
  line-height: 1.5;
  width: 100%;
}
.input.area.area-lg {
  min-height: 360rpx;
}
.char-count {
  display: block;
  text-align: right;
  font-size: 22rpx;
  color: #999;
  margin-top: 8rpx;
}
.guide-tip {
  font-size: 24rpx;
  color: #666;
  line-height: 1.5;
  margin-bottom: 16rpx;
  padding: 16rpx 20rpx;
  background: #f5f7fa;
  border-radius: 12rpx;
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
.export-tip {
  margin: 12rpx 0 8rpx;
  padding: 16rpx 20rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #b88230;
  background: #fdf6ec;
  border-radius: 12rpx;
}
.btn-row {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
  flex-wrap: wrap;
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
.task-id-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 24rpx;
  color: #606266;
  background: #f4f6fa;
  border-radius: 10rpx;
  padding: 16rpx 20rpx;
  margin-bottom: 16rpx;
}
.task-id-bar .copy-link {
  color: #0a84ff;
  padding: 4rpx 8rpx;
  flex-shrink: 0;
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
  word-break: break-word;
}
.result-text.muted {
  color: #909399;
}
.shot-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.shot-card {
  background: #f7f9fc;
  border-radius: 16rpx;
  padding: 20rpx 22rpx;
  border: 1px solid #e8eef6;
}
.shot-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 12rpx;
}
.shot-title {
  flex: 1;
  font-size: 28rpx;
  font-weight: 600;
  color: #1a1a1a;
}
.shot-copy {
  flex-shrink: 0;
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  background: #0a84ff;
  color: #fff;
  font-size: 24rpx;
}
.shot-prompt {
  display: block;
  font-size: 26rpx;
  color: #444;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.shot-actions {
  margin-top: 8rpx;
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
.source-hint {
  font-size: 22rpx;
  color: #909399;
  margin-top: 12rpx;
  display: block;
  line-height: 1.5;
}
.peak-hint {
  display: block;
  margin: 8rpx 0 12rpx;
  font-size: 22rpx;
  color: #b88230;
  line-height: 1.5;
}
.quota-hint {
  display: block;
  margin: 0 0 20rpx;
  font-size: 22rpx;
  color: #606266;
  line-height: 1.5;
}
.image-card {
  margin-bottom: 8rpx;
}
.image-wrap {
  position: relative;
}
.img-regen-mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12rpx;
}
.img-regen-text {
  color: #fff;
  font-size: 26rpx;
}
.img-regen-btn {
  margin-top: 12rpx;
  display: inline-flex;
  padding: 10rpx 24rpx;
  font-size: 24rpx;
  color: #0a84ff;
  background: #f0f7ff;
  border-radius: 10rpx;
}
.img-regen-btn.disabled {
  opacity: 0.55;
  pointer-events: none;
}
.regen-hint {
  margin: -8rpx 0 12rpx;
  display: block;
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
.field-tip {
  display: block;
  font-size: 22rpx;
  color: #909399;
  line-height: 1.5;
  margin: 8rpx 0 16rpx;
}
.slot-row {
  display: flex;
  gap: 16rpx;
}
.slot-row.wrap {
  flex-wrap: wrap;
}
.slot {
  width: calc((100% - 32rpx) / 3);
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
  box-sizing: border-box;
}
.slot.filled {
  border-style: solid;
  border-color: #e4e7ed;
}
.slot.add {
  border-color: #0a84ff;
  background: #f5f9ff;
}
.slot-img {
  width: 100%;
  height: 100%;
}
.slot-placeholder {
  font-size: 26rpx;
  color: #0a84ff;
}
.slot-sub {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #909399;
}
.slot-label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  text-align: center;
  font-size: 20rpx;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  padding: 4rpx 0;
}
.slot-remove {
  position: absolute;
  top: 4rpx;
  right: 8rpx;
  width: 36rpx;
  height: 36rpx;
  line-height: 32rpx;
  text-align: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 28rpx;
  z-index: 2;
}
</style>
