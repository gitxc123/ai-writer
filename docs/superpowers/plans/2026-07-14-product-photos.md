# 产品介绍实物图管线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「产品介绍」支持上传 1–3 张三视图，经 Agnes 图生图完成画质修复、多角度特写与场景匹配，并交付约 6–8 张图 + 文案。

**Architecture:** 前端仅在产品介绍模板展示三格上传并调用上传接口；任务 `input.productPhotos` 驱动后端专用管线。`agnes-image.js` 扩展 img2img；新模块 `product-images.js` 规划增强/特写/场景 prompts；`task-runner` 在模板名为「产品介绍」时走该管线，其它模板保持原 AI/web 逻辑。静态文件 + `PUBLIC_BASE_URL`（或临时图床降级）保证 Agnes 能拉取参考图。

**Tech Stack:** Express、multer、Prisma/SQLite、Agnes images API（img2img）、uni-app Vue3、Node `node --test`

**Spec:** `docs/superpowers/specs/2026-07-14-product-photos-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/src/lib/agnes-image.js` | 新增 `generateImageFromRefs({ prompt, images, size, model })` |
| `backend/src/lib/product-images.js` | 规划增强/特写/场景步骤、英文 prompt、校验 photos |
| `backend/src/lib/public-url.js` | 本地文件 → Agnes 可读公网 URL（PUBLIC_BASE_URL 或 uguu.se） |
| `backend/src/routes/uploads.js` | `POST /api/uploads/product` multipart |
| `backend/src/index.js` | 挂载 uploads 路由 + `express.static('uploads')` |
| `backend/src/routes/generate.js` | 产品介绍强制 `productPhotos`，设 `imageSource: 'product'` |
| `backend/src/lib/task-runner.js` | `parseInput` 识别 productPhotos；产品管线分支 |
| `backend/uploads/.gitkeep` | 上传目录 |
| `backend/package.json` | 加 `multer`、`test` script |
| `backend/tests/product-images.test.js` | 纯函数单测 |
| `frontend/src/utils/request.js` | `uploadProductPhoto` |
| `frontend/src/pages/create/create.vue` | 三格 UI、校验、提交 payload |
| `frontend/src/pages/history/index.vue`（及详情区） | 图片类型角标 |

---

### Task 1: product-images 规划纯函数 + 单测

**Files:**
- Create: `backend/src/lib/product-images.js`
- Create: `backend/tests/product-images.test.js`
- Modify: `backend/package.json`（scripts.test）

- [ ] **Step 1: 写失败单测**

```js
// backend/tests/product-images.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProductPhotos,
  planProductImageJobs
} from '../src/lib/product-images.js';

describe('normalizeProductPhotos', () => {
  it('accepts 1–3 photos with slots', () => {
    const photos = normalizeProductPhotos([
      { slot: 'front', url: 'https://example.com/a.jpg' }
    ]);
    assert.equal(photos.length, 1);
    assert.equal(photos[0].slot, 'front');
  });

  it('rejects empty', () => {
    assert.throws(() => normalizeProductPhotos([]), /至少上传/);
  });
});

describe('planProductImageJobs', () => {
  it('plans enhance + 2-3 closeups + 2 scenes', () => {
    const jobs = planProductImageJobs({
      photos: [{ slot: 'front', url: 'https://example.com/a.jpg' }],
      keyword: '陶瓷杯',
      style: '年轻白领'
    });
    const types = jobs.map((j) => j.type);
    assert.ok(types.filter((t) => t === 'enhanced').length === 1);
    assert.ok(types.filter((t) => t === 'closeup').length >= 2);
    assert.ok(types.filter((t) => t === 'scene').length === 2);
    assert.ok(jobs.every((j) => j.prompt && j.refUrls?.length));
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && node --test tests/product-images.test.js`  
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `product-images.js`**

```js
// backend/src/lib/product-images.js
const SLOTS = ['front', 'side', 'detail'];

export function normalizeProductPhotos(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const photos = list
    .filter((p) => p && p.url && typeof p.url === 'string')
    .slice(0, 3)
    .map((p) => ({
      slot: SLOTS.includes(p.slot) ? p.slot : 'front',
      url: p.url.trim()
    }));
  if (!photos.length) throw new Error('请至少上传 1 张产品图');
  return photos;
}

const CLOSEUP_ANGLES = [
  'three-quarter view product close-up, slight camera angle from upper left',
  'top-down flat lay close-up of the product on clean surface',
  'macro detail close-up focusing on product texture and craftsmanship'
];

function scenePrompts(keyword, style) {
  const audience = style || 'modern consumer';
  const product = keyword || 'the product';
  return [
    `Place ${product} naturally in a realistic lifestyle scene for ${audience}, keep product appearance identical to reference, professional product photography, no text overlay`,
    `Show ${product} being used in a matching application scenario for ${audience}, preserve product shape and materials from reference, natural lighting, no text overlay`
  ];
}

export function planProductImageJobs({ photos, keyword, style }) {
  const normalized = normalizeProductPhotos(photos);
  const jobs = [];

  for (const photo of normalized) {
    jobs.push({
      type: 'enhanced',
      slot: photo.slot,
      refUrls: [photo.url],
      prompt:
        'Enhance image quality: sharper details, balanced lighting, remove noise and blur, preserve exact product shape, colors, logos and proportions, studio-clean background if messy, no text overlay, photorealistic'
    });
  }

  const closeupCount = normalized.length >= 3 ? 3 : 2;
  const primary = normalized[0].url;
  const allRefs = normalized.map((p) => p.url);
  for (let i = 0; i < closeupCount; i += 1) {
    jobs.push({
      type: 'closeup',
      refUrls: allRefs.slice(0, 2),
      prompt: `Using the reference product photo(s), generate a new ${CLOSEUP_ANGLES[i]} of "${keyword || 'the product'}". Preserve brand identity and materials. Photorealistic ecommerce shot, no text overlay.`
    });
  }

  for (const scenePrompt of scenePrompts(keyword, style)) {
    jobs.push({
      type: 'scene',
      refUrls: [primary],
      prompt: scenePrompt
    });
  }

  return jobs;
}

export function isProductIntroTemplate(name) {
  return name === '产品介绍';
}
```

- [ ] **Step 4: 加 test script 并跑通**

`package.json` scripts 增加：`"test": "node --test tests/**/*.test.js"`

Run: `cd backend && npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/product-images.js backend/tests/product-images.test.js backend/package.json
git commit -m "feat: add product image job planner with tests"
```

---

### Task 2: Agnes img2img + 公网 URL 助手

**Files:**
- Modify: `backend/src/lib/agnes-image.js`
- Create: `backend/src/lib/public-url.js`
- Create: `backend/tests/agnes-image-payload.test.js`（测 payload 拼装，不真实打 API）

- [ ] **Step 1: 扩展 generateImage，支持 images 数组**

在 `agnes-image.js` 中把 `generateImage` 改为：

```js
export async function generateImage({
  prompt,
  size = '1024x768',
  model = DEFAULT_MODEL,
  images
}) {
  const extra_body = { response_format: 'url' };
  if (Array.isArray(images) && images.length) {
    extra_body.image = images;
  }
  const payload = {
    model: images?.length ? (model || 'agnes-image-2.0-flash') : model,
    prompt,
    size: SIZE_OPTIONS[size] || size,
    extra_body
  };
  // ... existing fetch logic unchanged ...
}

export async function generateImageFromRefs({ prompt, images, size = 'square' }) {
  if (!images?.length) throw new Error('缺少参考图');
  return generateImage({
    prompt,
    size,
    images,
    model: 'agnes-image-2.0-flash'
  });
}
```

- [ ] **Step 2: 实现 `public-url.js`**

```js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

export function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/** 把本地相对路径或本机 URL 转成 Agnes 可访问的 https URL */
export async function resolveAgnesImageUrl(storedUrl) {
  if (!storedUrl) throw new Error('空图片地址');
  if (/^https?:\/\//i.test(storedUrl) && !/localhost|127\.0\.0\.1/i.test(storedUrl)) {
    return storedUrl;
  }

  const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (publicBase && storedUrl.startsWith('/uploads/')) {
    return `${publicBase}${storedUrl}`;
  }

  // 本地路径 /uploads/xxx → 上传临时图床
  const filePath = storedUrl.startsWith('/uploads/')
    ? path.join(UPLOAD_DIR, path.basename(storedUrl))
    : storedUrl.startsWith('file:')
      ? fileURLToPath(storedUrl)
      : storedUrl;

  return uploadToUguu(filePath);
}

async function uploadToUguu(filePath) {
  const buf = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const boundary = '----FormBoundary' + Date.now().toString(16);
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="files[]"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    ),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const res = await fetch('https://uguu.se/upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(120000)
  });
  const data = await res.json();
  const url = data?.files?.[0]?.url;
  if (!url) throw new Error('临时图床上传失败');
  return url;
}
```

- [ ] **Step 3: 单测 resolve 跳过本地 https**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAgnesImageUrl } from '../src/lib/public-url.js';

describe('resolveAgnesImageUrl', () => {
  it('passes through public https', async () => {
    const u = await resolveAgnesImageUrl('https://cdn.example.com/a.jpg');
    assert.equal(u, 'https://cdn.example.com/a.jpg');
  });
});
```

Run: `npm test` → PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/agnes-image.js backend/src/lib/public-url.js backend/tests/agnes-image-payload.test.js
git commit -m "feat: support Agnes img2img and public URL resolve"
```

---

### Task 3: 上传接口 + 静态托管

**Files:**
- Create: `backend/src/routes/uploads.js`
- Create: `backend/uploads/.gitkeep`
- Modify: `backend/src/index.js`
- Modify: `backend/package.json`（依赖 multer）
- Modify: `backend/.env.example`（`PUBLIC_BASE_URL=`）

- [ ] **Step 1: 安装 multer**

Run: `cd backend && npm install multer`

- [ ] **Step 2: 实现 uploads 路由**

```js
// backend/src/routes/uploads.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware } from '../middleware/auth.js';
import { ensureUploadDir, UPLOAD_DIR } from '../lib/public-url.js';

ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(jpeg|png|webp)/.test(file.mimetype);
    cb(ok ? null : new Error('仅支持 jpg/png/webp'), ok);
  }
});

const router = Router();
const SLOTS = new Set(['front', 'side', 'detail']);

router.post('/product', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ code: 400, message: err.message || '上传失败' });
    }
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '缺少文件' });
    }
    const slot = SLOTS.has(req.body?.slot) ? req.body.slot : 'front';
    const url = `/uploads/${req.file.filename}`;
    res.json({ code: 200, data: { slot, url, filename: req.file.filename } });
  });
});

export default router;
```

- [ ] **Step 3: 挂载到 index.js**

```js
import path from 'path';
import { fileURLToPath } from 'url';
import uploadRoutes from './routes/uploads.js';
import { UPLOAD_DIR, ensureUploadDir } from './lib/public-url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
ensureUploadDir();
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/api/uploads', uploadRoutes);
```

`.env.example` 增加：

```
# 公网可达的后端根地址，供 Agnes 拉参考图；本地可留空走临时图床
PUBLIC_BASE_URL=
```

- [ ] **Step 4: 手工冒烟**

登录拿 token 后：

```powershell
curl -X POST http://localhost:3001/api/uploads/product -H "Authorization: Bearer <token>" -F "file=@C:\path\to\test.jpg" -F "slot=front"
```

Expected: `{ "code": 200, "data": { "slot": "front", "url": "/uploads/...." } }`  
浏览器打开 `http://localhost:3001/uploads/...` 能看见图。

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/uploads.js backend/src/index.js backend/uploads/.gitkeep backend/package.json backend/package-lock.json backend/.env.example
git commit -m "feat: add product photo upload endpoint"
```

---

### Task 4: generate 路由 + task-runner 产品管线

**Files:**
- Modify: `backend/src/routes/generate.js`
- Modify: `backend/src/lib/task-runner.js`

- [ ] **Step 1: generate.js 校验**

在创建记录前：

```js
import { isProductIntroTemplate, normalizeProductPhotos } from '../lib/product-images.js';

const template = await prisma.template.findUnique({ where: { id: templateId } });
// ...
let productPhotos = null;
if (isProductIntroTemplate(template.name)) {
  try {
    productPhotos = normalizeProductPhotos(req.body?.productPhotos || inputs?.productPhotos);
  } catch (e) {
    return res.status(400).json({ code: 400, message: e.message });
  }
}

const storedInput = productPhotos
  ? { ...(inputs || {}), productPhotos, imageSource: 'product', imageCount: 0, imageSize: 'square' }
  : { ...(inputs || {}), imageCount: count, imageSize: size, imageSource: source };

const task = await prisma.generationRecord.create({
  data: {
    userId: req.userId,
    templateId,
    input: JSON.stringify(storedInput),
    output: '',
    status: TASK_STATUS.PENDING,
    taskType: productPhotos || count > 0 ? 'combo' : 'text',
    imageSize: productPhotos ? 'square' : count > 0 ? size : null
  }
});
```

- [ ] **Step 2: 改 parseInput**

```js
function parseInput(task) {
  const raw = JSON.parse(task.input || '{}');
  const productPhotos = Array.isArray(raw.productPhotos) ? raw.productPhotos : null;
  const { imageCount: _ic, imageSize: _is, imageSource: _src, productPhotos: _pp, ...inputs } = raw;
  const imageCount = Math.min(5, Math.max(0, Number(raw.imageCount) || 0));
  const imageSize = raw.imageSize || task.imageSize || 'landscape';
  let imageSource = raw.imageSource === 'web' ? 'web' : 'ai';
  if (raw.imageSource === 'product' || productPhotos?.length) imageSource = 'product';
  return { inputs, imageCount, imageSize, imageSource, productPhotos };
}
```

- [ ] **Step 3: runGenerationTaskBody 产品分支**

在文案生成并写入 `output` 之后，替换「仅 imageCount」逻辑开头：

```js
import { planProductImageJobs, isProductIntroTemplate } from './product-images.js';
import { generateImageFromRefs } from './agnes-image.js';
import { resolveAgnesImageUrl } from './public-url.js';

// after text saved:
if (imageSource === 'product' || (isProductIntroTemplate(task.template.name) && productPhotos?.length)) {
  const jobs = planProductImageJobs({
    photos: productPhotos,
    keyword,
    style
  });
  const imageUrls = [];
  const imageMeta = [];
  let success = 0;

  for (const job of jobs) {
    try {
      const refs = [];
      for (const u of job.refUrls) {
        refs.push(await resolveAgnesImageUrl(u));
      }
      const url = await withTimeout(
        generateImageFromRefs({ prompt: job.prompt, images: refs, size: 'square' }),
        360000,
        `产品图-${job.type}`
      );
      imageUrls.push(url);
      imageMeta.push({
        url,
        type: job.type,
        slot: job.slot || null,
        caption:
          job.type === 'enhanced' ? '画质修复' : job.type === 'closeup' ? '产品特写' : '应用场景',
        sourceType: 'product-img2img'
      });
      success += 1;
      await saveImages(taskId, imageUrls, imageMeta);
    } catch (err) {
      console.warn('[task:product-image]', job.type, err.message);
      imageMeta.push({
        type: job.type,
        error: err.message,
        sourceType: 'product-img2img'
      });
    }
  }

  if (success === 0) {
    await markFailed(taskId, '产品配图全部失败');
    return;
  }
  await prisma.generationRecord.update({
    where: { id: taskId },
    data: { status: TASK_STATUS.COMPLETED, error: null }
  });
  return;
}

if (imageCount <= 0) {
  // existing early complete
}
// existing ai/web loop unchanged
```

- [ ] **Step 4: 重启后端，用已有会员账号提交带 productPhotos 的 curl（可先用 mock https 图）冒烟**（完整端到端放到 Task 6）

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/generate.js backend/src/lib/task-runner.js
git commit -m "feat: run product img2img pipeline in task runner"
```

---

### Task 5: 前端三格上传 + 提交

**Files:**
- Modify: `frontend/src/utils/request.js`
- Modify: `frontend/src/pages/create/create.vue`

- [ ] **Step 1: request.js 增加上传与 generate 参数**

```js
uploadProductPhoto: (filePath, slot) =>
  new Promise((resolve, reject) => {
    uni.uploadFile({
      url: '/api/uploads/product',
      filePath,
      name: 'file',
      formData: { slot },
      header: { Authorization: getToken() ? `Bearer ${getToken()}` : '' },
      success: (res) => {
        try {
          const body = JSON.parse(res.data);
          if (body.code === 200) resolve(body.data);
          else reject(new Error(body.message || '上传失败'));
        } catch (e) {
          reject(e);
        }
      },
      fail: reject
    });
  }),

generate: (templateId, inputs, options = {}) =>
  request({
    url: '/generate',
    method: 'POST',
    data: {
      templateId,
      inputs,
      imageCount: options.imageCount ?? 0,
      imageSize: options.imageSize ?? 'landscape',
      imageSource: options.imageSource ?? 'ai',
      productPhotos: options.productPhotos
    }
  }),
```

注意：若 H5 下 `uni.uploadFile` 的 url 需带完整 origin，按现有代理用相对 `/api/uploads/product`（与 `BASE_URL` 一致：可写成 `BASE_URL + '/uploads/product'`）。

- [ ] **Step 2: create.vue 增加状态与 UI**

在 script：

```js
const isProductIntro = computed(() => template.value?.name === '产品介绍');
const productSlots = ref([
  { slot: 'front', label: '正面', url: '' },
  { slot: 'side', label: '侧面', url: '' },
  { slot: 'detail', label: '细节', url: '' }
]);

async function pickSlot(slotItem) {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    success: async (res) => {
      const path = res.tempFilePaths[0];
      try {
        uni.showLoading({ title: '上传中' });
        const data = await api.uploadProductPhoto(path, slotItem.slot);
        slotItem.url = data.url.startsWith('http')
          ? data.url
          : `${window.location.origin.replace('5173', '3001')}${data.url}`;
        // H5 开发：预览用后端静态；提交 payload 用相对 data.url
        slotItem.storedUrl = data.url;
      } catch (e) {
        uni.showToast({ title: e.message || '上传失败', icon: 'none' });
      } finally {
        uni.hideLoading();
      }
    }
  });
}
```

模板中（产品介绍区块，放在表单字段前或后）：

```html
<view v-if="isProductIntro" class="field">
  <text class="label">产品三视图（至少 1 张）</text>
  <view class="slot-row">
    <view
      v-for="s in productSlots"
      :key="s.slot"
      class="slot"
      @click="pickSlot(s)"
    >
      <image v-if="s.url" :src="s.url" mode="aspectFill" class="slot-img" />
      <text v-else class="slot-empty">{{ s.label }}+</text>
    </view>
  </view>
</view>
```

通用配图控件加条件：`v-if="!isProductIntro"`。

- [ ] **Step 3: submitTask 校验与 payload**

```js
async function submitTask() {
  if (submitting.value) return;
  if (!userStore.checkLogin()) return;

  let productPhotos;
  if (isProductIntro.value) {
    productPhotos = productSlots.value
      .filter((s) => s.storedUrl)
      .map((s) => ({ slot: s.slot, url: s.storedUrl }));
    if (!productPhotos.length) {
      uni.showToast({ title: '请至少上传 1 张产品图', icon: 'none' });
      return;
    }
  }

  submitting.value = true;
  try {
    const data = await api.generate(templateId.value, inputs.value, {
      imageCount: isProductIntro.value ? 0 : imageCount.value,
      imageSize: imageSize.value,
      imageSource: isProductIntro.value ? 'product' : imageSource.value,
      productPhotos
    });
    // ... existing navigate
  } catch (e) {
    // existing needVip handling
  } finally {
    submitting.value = false;
  }
}
```

样式：`.slot-row { display:flex; gap: 16rpx; }` `.slot { flex:1; height: 160rpx; background:#f5f7fa; border-radius:12rpx; overflow:hidden; ...}`

- [ ] **Step 4: 本地打开产品介绍页，确认三格出现、其它模板无三格**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/request.js frontend/src/pages/create/create.vue
git commit -m "feat: product three-view upload UI on create page"
```

---

### Task 6: 结果页类型角标 + 端到端验收

**Files:**
- Modify: `frontend/src/pages/create/create.vue`（结果区若在本页）
- Modify: `frontend/src/pages/history/index.vue`（列表缩略）
- 视 records 详情展示位置：若 history 展开显示 `imageMeta`，加角标

- [ ] **Step 1: 展示 meta type**

在图片列表项上：

```html
<text class="img-tag" v-if="meta.type === 'enhanced'">已修复</text>
<text class="img-tag" v-else-if="meta.type === 'closeup'">特写</text>
<text class="img-tag" v-else-if="meta.type === 'scene'">场景</text>
```

确保 records API 已把 `imageMeta` 解析返回（检查 `records.js`；若只有 JSON 字符串则 `JSON.parse`）。

- [ ] **Step 2: 端到端**

1. 会员登录 → 产品介绍 → 只传正面 1 张 → 生成  
2. 任务完成：文案有内容；图片 ≥ 5 张量级且含 enhanced/closeup/scene  
3. 0 张上传前端拦截  
4. 「小红书」等模板仍显示 AI/web 配图控件且可生成  

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/create/create.vue frontend/src/pages/history/index.vue backend/src/routes/records.js
git commit -m "feat: show product image type tags and verify E2E"
```

---

## Spec coverage check

| Spec 要求 | Task |
|-----------|------|
| 三格上传 UI | Task 5 |
| ≥1 张 | Task 1 normalize + Task 5/4 校验 |
| enhanced + closeup + scene 标准档 | Task 1 planner + Task 4 runner |
| Agnes img2img | Task 2 |
| 上传 API + 静态/公网 URL | Task 3 + Task 2 public-url |
| 仅产品介绍 | Task 4/5 `isProductIntroTemplate` |
| 其它模板不变 | Task 4 分支保守 |
| 单张失败继续 | Task 4 try/catch per job |
| 结果分类展示 | Task 6 |
| 会员 403 | 已有 generate 会员检查，不改坏即可 |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-product-photos.md`.

**Two execution options:**

1. **Subagent-Driven（推荐）** — 每个 Task 派生子代理，任务间复查  
2. **Inline Execution** — 本会话按 executing-plans 连续执行并设检查点  

用哪种？
