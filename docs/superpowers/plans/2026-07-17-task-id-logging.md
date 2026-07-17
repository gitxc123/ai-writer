# Task ID Display + Queryable Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户可复制任务 ID；将任务关键步骤写入 `TaskLog`；仅白名单手机号（默认 `17682160819`）可在「我的 → 运行日志」查看全局流与按任务过滤。

**Architecture:** 新增 `TaskLog` 表与 `logTask()`；`task-runner` / 投诉下架埋点；`GET /api/logs` + `/meta` 服务端校验手机号；前端任务列表/详情展示可复制 ID，新日志页 + 我的入口按 `canViewLogs` 显示。

**Tech Stack:** Express、Prisma/SQLite、uni-app Vue3、Node `node --test`

**Spec:** `docs/superpowers/specs/2026-07-17-task-id-logging-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `backend/prisma/schema.prisma` | 新增 `TaskLog` model |
| `backend/src/lib/ensure-schema.js` | `CREATE TABLE TaskLog` + 索引 |
| `backend/src/lib/logger.js` | `logTask`、白名单、limit 钳制、留存清理 |
| `backend/tests/logger.test.js` | 白名单 / limit / meta 序列化单测 |
| `backend/src/lib/task-runner.js` | 关键节点调用 `logTask` |
| `backend/src/routes/complaints.js` | 下架时 `logTask` |
| `backend/src/routes/logs.js` | `GET /`、`GET /meta` |
| `backend/src/index.js` | 挂载 `/api/logs`；启动时 `purgeTaskLogs` |
| `backend/scripts/purge-old-records.js` | 顺带清理 `TaskLog` |
| `backend/.env.example` | `LOG_VIEWER_PHONE`、`TASK_LOG_RETENTION_DAYS` |
| `frontend/src/utils/request.js` | `getLogsMeta`、`getLogs` |
| `frontend/src/pages/history/index.vue` | 任务 ID 截断 + 复制 |
| `frontend/src/pages/create/create.vue` | 详情任务 ID + 复制 |
| `frontend/src/pages/legal/complaint.vue` | 「记录 ID」→「任务 ID」文案 |
| `frontend/src/pages/logs/index.vue` | 日志列表页（新建） |
| `frontend/src/pages.json` | 注册 logs 路由 |
| `frontend/src/pages/mine/index.vue` | `canViewLogs` 时显示入口 |

---

### Task 1: Prisma schema + ensure-schema

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/src/lib/ensure-schema.js`

- [ ] **Step 1: 在 schema 末尾追加 TaskLog**

在 `Complaint` model 之后追加：

```prisma
model TaskLog {
  id        String   @id @default(cuid())
  taskId    String?
  level     String
  message   String
  meta      String?
  createdAt DateTime @default(now())

  @@index([createdAt])
  @@index([taskId, createdAt])
}
```

- [ ] **Step 2: ensure-schema 增加建表 SQL**

在 `MIGRATIONS` 数组末尾追加：

```js
  `CREATE TABLE IF NOT EXISTS TaskLog (
    id TEXT PRIMARY KEY NOT NULL,
    taskId TEXT,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    meta TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  'CREATE INDEX IF NOT EXISTS TaskLog_createdAt_idx ON TaskLog(createdAt)',
  'CREATE INDEX IF NOT EXISTS TaskLog_taskId_createdAt_idx ON TaskLog(taskId, createdAt)'
```

- [ ] **Step 3: 生成 Prisma Client**

Run（若 backend 进程占用导致 EPERM，先停后端）:

```powershell
cd backend
npx prisma generate
npx prisma db push
```

Expected: Client 含 `prisma.taskLog`；表已创建。

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/lib/ensure-schema.js
git commit -m "Add TaskLog model for queryable task runtime logs."
```

---

### Task 2: logger.js + 单测

**Files:**
- Create: `backend/src/lib/logger.js`
- Create: `backend/tests/logger.test.js`

- [ ] **Step 1: 写失败单测**

```js
// backend/tests/logger.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOG_VIEWER_PHONE,
  getLogViewerPhone,
  canViewLogs,
  clampLogLimit,
  serializeMeta
} from '../src/lib/logger.js';

describe('log viewer phone', () => {
  it('defaults to hardcoded phone', () => {
    const prev = process.env.LOG_VIEWER_PHONE;
    delete process.env.LOG_VIEWER_PHONE;
    assert.equal(getLogViewerPhone(), DEFAULT_LOG_VIEWER_PHONE);
    assert.equal(DEFAULT_LOG_VIEWER_PHONE, '17682160819');
    if (prev !== undefined) process.env.LOG_VIEWER_PHONE = prev;
  });

  it('respects LOG_VIEWER_PHONE override', () => {
    const prev = process.env.LOG_VIEWER_PHONE;
    process.env.LOG_VIEWER_PHONE = '13900000000';
    assert.equal(getLogViewerPhone(), '13900000000');
    assert.equal(canViewLogs('13900000000'), true);
    assert.equal(canViewLogs('17682160819'), false);
    if (prev === undefined) delete process.env.LOG_VIEWER_PHONE;
    else process.env.LOG_VIEWER_PHONE = prev;
  });

  it('canViewLogs matches viewer phone', () => {
    const prev = process.env.LOG_VIEWER_PHONE;
    delete process.env.LOG_VIEWER_PHONE;
    assert.equal(canViewLogs('17682160819'), true);
    assert.equal(canViewLogs('13800000000'), false);
    assert.equal(canViewLogs(''), false);
    if (prev !== undefined) process.env.LOG_VIEWER_PHONE = prev;
  });
});

describe('clampLogLimit', () => {
  it('defaults to 100, caps at 200', () => {
    assert.equal(clampLogLimit(undefined), 100);
    assert.equal(clampLogLimit(0), 100);
    assert.equal(clampLogLimit(50), 50);
    assert.equal(clampLogLimit(999), 200);
  });
});

describe('serializeMeta', () => {
  it('returns null for empty, JSON for object', () => {
    assert.equal(serializeMeta(null), null);
    assert.equal(serializeMeta(undefined), null);
    assert.equal(serializeMeta({ imageIndex: 1 }), '{"imageIndex":1}');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```powershell
cd backend
node --test tests/logger.test.js
```

Expected: `Cannot find module` or missing exports.

- [ ] **Step 3: 实现 logger.js**

```js
// backend/src/lib/logger.js
import { prisma } from './prisma.js';

export const DEFAULT_LOG_VIEWER_PHONE = '17682160819';
export const DEFAULT_LOG_LIMIT = 100;
export const MAX_LOG_LIMIT = 200;
export const DEFAULT_TASK_LOG_RETENTION_DAYS = 7;
export const MAX_TASK_LOG_ROWS = 5000;

export function getLogViewerPhone() {
  const fromEnv = String(process.env.LOG_VIEWER_PHONE || '').trim();
  return fromEnv || DEFAULT_LOG_VIEWER_PHONE;
}

export function canViewLogs(phone) {
  return Boolean(phone) && String(phone) === getLogViewerPhone();
}

export function clampLogLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LOG_LIMIT;
  return Math.min(MAX_LOG_LIMIT, Math.floor(n));
}

export function serializeMeta(meta) {
  if (meta == null) return null;
  if (typeof meta === 'string') return meta.slice(0, 2000);
  try {
    return JSON.stringify(meta).slice(0, 2000);
  } catch {
    return null;
  }
}

/**
 * Persist task log + console. Never throws to caller.
 */
export async function logTask(taskId, level, message, meta) {
  const lvl = ['info', 'warn', 'error'].includes(level) ? level : 'info';
  const msg = String(message || '').slice(0, 2000);
  const metaStr = serializeMeta(meta);
  const prefix = `[task:${lvl}]`;
  const line = taskId ? `${prefix} ${taskId} ${msg}` : `${prefix} ${msg}`;
  if (lvl === 'error') console.error(line, metaStr || '');
  else if (lvl === 'warn') console.warn(line, metaStr || '');
  else console.log(line, metaStr || '');

  try {
    await prisma.taskLog.create({
      data: {
        taskId: taskId || null,
        level: lvl,
        message: msg,
        meta: metaStr
      }
    });
  } catch (err) {
    console.warn('[logger] write failed', err.message);
  }
}

export async function purgeTaskLogs() {
  const days = Number(process.env.TASK_LOG_RETENTION_DAYS || DEFAULT_TASK_LOG_RETENTION_DAYS);
  const cutoff = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
  let deleted = 0;
  try {
    const byAge = await prisma.taskLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    deleted += byAge.count;
  } catch (err) {
    console.warn('[logger] purge by age failed', err.message);
  }
  try {
    const count = await prisma.taskLog.count();
    if (count > MAX_TASK_LOG_ROWS) {
      const overflow = count - MAX_TASK_LOG_ROWS;
      const old = await prisma.taskLog.findMany({
        orderBy: { createdAt: 'asc' },
        take: overflow,
        select: { id: true }
      });
      if (old.length) {
        const r = await prisma.taskLog.deleteMany({
          where: { id: { in: old.map((x) => x.id) } }
        });
        deleted += r.count;
      }
    }
  } catch (err) {
    console.warn('[logger] purge by count failed', err.message);
  }
  return deleted;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```powershell
cd backend
node --test tests/logger.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/logger.js backend/tests/logger.test.js
git commit -m "Add task logger with viewer phone gate helpers."
```

---

### Task 3: task-runner + complaints 埋点

**Files:**
- Modify: `backend/src/lib/task-runner.js`
- Modify: `backend/src/routes/complaints.js`

- [ ] **Step 1: 在 task-runner 顶部 import**

```js
import { logTask } from './logger.js';
```

- [ ] **Step 2: markProcessing / markFailed 埋点**

```js
async function markProcessing(taskId) {
  await prisma.generationRecord.update({
    where: { id: taskId },
    data: { status: TASK_STATUS.PROCESSING }
  });
  await logTask(taskId, 'info', 'processing started');
}

async function markFailed(taskId, error) {
  const friendly = toUserErrorMessage(error, '生成失败，请稍后重试');
  try {
    await prisma.generationRecord.update({
      where: { id: taskId },
      data: { status: TASK_STATUS.FAILED, error: friendly.slice(0, 200) }
    });
    await logTask(taskId, 'error', friendly.slice(0, 500));
  } catch (err) {
    console.error('[task:markFailed]', taskId, err.message);
  }
}
```

- [ ] **Step 3: 文案开始/完成与配图进度**

在 `runGenerationTaskBody` 中，于现有 `console.log('[task:generation] start text'...)` 旁加：

```js
await logTask(taskId, 'info', 'text start', { imageCount, imageSource });
```

在 text done 处：

```js
await logTask(taskId, 'info', 'text done', { length: output.length });
```

在配图循环（现有 `console.log('[task:generation] image', i + 1, ...)`）旁：

```js
await logTask(taskId, 'info', `image ${i + 1}/${imageCount} ${imageSource}`, {
  searchQuery: plan?.searchQuery || undefined
});
```

在任务最终 completed（`console.log('[task:generation] completed', taskId)`）旁：

```js
await logTask(taskId, 'info', 'completed');
```

在 `runGenerationTask` 的 timeout salvage / text salvage 处分别：

```js
await logTask(taskId, 'warn', 'salvage partial images after timeout', { count: urls.length });
// ...
await logTask(taskId, 'warn', 'salvage text after image failure');
```

rewrite / product 分支若已有明显阶段 log，各加 1～2 条 `logTask`（`rewrite start`、`product completed` 即可），保持与现有 console 语义一致，勿记录 prompt 全文。

- [ ] **Step 4: 投诉下架埋点**

在 `complaints.js` takedown 成功更新 record 之后：

```js
import { logTask } from '../lib/logger.js';
// ...
await logTask(record.id, 'warn', 'takedown by complaint', { complaintId: complaint.id });
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/task-runner.js backend/src/routes/complaints.js
git commit -m "Instrument task runner and takedown with TaskLog writes."
```

---

### Task 4: logs API + 启动清理 + env

**Files:**
- Create: `backend/src/routes/logs.js`
- Modify: `backend/src/index.js`
- Modify: `backend/scripts/purge-old-records.js`
- Modify: `backend/.env.example`

- [ ] **Step 1: 实现 routes/logs.js**

```js
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { canViewLogs, clampLogLimit } from '../lib/logger.js';

const router = Router();

async function requireLogViewer(req, res, next) {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || !canViewLogs(user.phone)) {
    return res.status(403).json({ code: 403, message: '无日志查看权限' });
  }
  req.logViewer = user;
  return next();
}

router.get('/meta', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  res.json({
    code: 200,
    data: { canViewLogs: canViewLogs(user?.phone) }
  });
});

router.get('/', authMiddleware, requireLogViewer, async (req, res) => {
  try {
    const taskId = String(req.query.taskId || '').trim() || undefined;
    const limit = clampLogLimit(req.query.limit);
    const before = String(req.query.before || '').trim();

    const where = {};
    if (taskId) where.taskId = taskId;
    if (before) {
      const d = new Date(before);
      if (!Number.isNaN(d.getTime())) where.createdAt = { lt: d };
    }

    const rows = await prisma.taskLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    res.json({
      code: 200,
      data: {
        items: rows.map((r) => ({
          id: r.id,
          taskId: r.taskId,
          level: r.level,
          message: r.message,
          meta: r.meta,
          createdAt: r.createdAt
        }))
      }
    });
  } catch (err) {
    console.error('[logs]', err);
    res.status(500).json({ code: 500, message: '读取日志失败' });
  }
});

export default router;
```

注意：将 `/meta` 注册在 `/` 同 router 上，挂载路径为 `/api/logs`，即完整路径 `/api/logs/meta` 与 `/api/logs`。Express 中 `router.get('/meta')` 必须写在可能冲突的参数路由之前（本处无 `:id`，顺序无妨）。

- [ ] **Step 2: index.js 挂载与启动清理**

```js
import logRoutes from './routes/logs.js';
import { purgeTaskLogs } from './lib/logger.js';
// ...
app.use('/api/logs', logRoutes);
// 在 app.listen 回调内 resumeStuckTasks 之后或之前：
try {
  const n = await purgeTaskLogs();
  if (n) console.log('[logger] purged task logs', n);
} catch (err) {
  console.warn('[logger] purge on boot failed', err.message);
}
```

- [ ] **Step 3: purge-old-records.js 末尾追加**

```js
import { purgeTaskLogs } from '../src/lib/logger.js';
// after generationRecord deleteMany:
const logDeleted = await purgeTaskLogs();
console.log(`[purge-old-records] taskLogs deleted=${logDeleted}`);
```

- [ ] **Step 4: .env.example 追加**

```env
# 可查看运行日志的手机号（默认 17682160819）
# LOG_VIEWER_PHONE=17682160819
# TASK_LOG_RETENTION_DAYS=7
```

- [ ] **Step 5: 手工冒烟（可选）**

启动 backend 后，用白名单账号登录拿 token：

```powershell
# 非白名单应 403；白名单 200
curl -H "Authorization: Bearer <token>" http://127.0.0.1:3001/api/logs/meta
curl -H "Authorization: Bearer <token>" "http://127.0.0.1:3001/api/logs?limit=20"
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/logs.js backend/src/index.js backend/scripts/purge-old-records.js backend/.env.example
git commit -m "Add authenticated task log query API for viewer phone."
```

---

### Task 5: 前端任务 ID 展示 + 投诉文案

**Files:**
- Modify: `frontend/src/pages/history/index.vue`
- Modify: `frontend/src/pages/create/create.vue`
- Modify: `frontend/src/pages/legal/complaint.vue`
- Modify: `frontend/src/pages/mine/index.vue`（投诉副文案若仍写「记录 ID」一并改）

- [ ] **Step 1: history 卡片增加 ID 行**

在 `title-row` 下方、`time` 旁增加（阻止冒泡复制）：

```html
<view class="id-row" @click.stop="copyTaskId(item.id)">
  <text class="task-id">ID {{ shortId(item.id) }}</text>
  <text class="copy-id">复制</text>
</view>
```

```js
function shortId(id) {
  const s = String(id || '');
  return s.length <= 10 ? s : `${s.slice(0, 8)}…`;
}
function copyTaskId(id) {
  uni.setClipboardData({
    data: String(id),
    success: () => uni.showToast({ title: '任务 ID 已复制', icon: 'none' })
  });
}
```

样式：`.id-row` 小字灰色；`.copy-id` 蓝色可点。

- [ ] **Step 2: create.vue 结果区顶部**

在结果卡片内、状态文案附近（有 `currentRecordId` 时）：

```html
<view v-if="currentRecordId" class="task-id-bar" @click="copyCurrentTaskId">
  <text>任务 ID：{{ shortId(currentRecordId) }}</text>
  <text class="copy-link">复制</text>
</view>
```

复用同样的 `shortId` / `copyCurrentTaskId`（复制 `currentRecordId`）。

- [ ] **Step 3: complaint.vue 文案**

- intro：`记录 ID` → `任务 ID`（说明在任务列表/详情复制）
- label：`任务 ID（必填）`
- 变量名可仍用 `recordId`（API 字段不变）

- [ ] **Step 4: mine 投诉副文案**

`按记录 ID 提交侵权投诉` → `按任务 ID 提交侵权投诉`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/history/index.vue frontend/src/pages/create/create.vue frontend/src/pages/legal/complaint.vue frontend/src/pages/mine/index.vue
git commit -m "Show copyable task IDs on list and detail screens."
```

---

### Task 6: 日志页 + 我的入口 + API 客户端

**Files:**
- Modify: `frontend/src/utils/request.js`
- Create: `frontend/src/pages/logs/index.vue`
- Modify: `frontend/src/pages.json`
- Modify: `frontend/src/pages/mine/index.vue`

- [ ] **Step 1: request.js 增加 API**

```js
  getLogsMeta: () => request({ url: '/logs/meta' }),
  getLogs: (params = {}) => {
    const q = new URLSearchParams();
    if (params.taskId) q.set('taskId', params.taskId);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.before) q.set('before', params.before);
    const qs = q.toString();
    return request({ url: `/logs${qs ? `?${qs}` : ''}` });
  },
```

- [ ] **Step 2: pages.json 注册**

```json
{ "path": "pages/logs/index", "style": { "navigationBarTitleText": "运行日志" } }
```

- [ ] **Step 3: 新建 logs/index.vue**

页面结构：

- 顶部：任务 ID 输入框 +「查询」/「最近」按钮
- 列表：`createdAt`、`level`（颜色区分）、`taskId`（点复制）、`message`
- `onMounted` 调 `api.getLogs({ limit: 100 })`；403 则 toast 并 `navigateBack`
- 查询：`api.getLogs({ taskId: filter.value.trim(), limit: 100 })`

参考样式与 `complaint.vue` / `history` 一致（白卡片、灰底 `#f4f6fa`），勿引入新设计系统。

核心 script 骨架：

```js
import { ref, onMounted } from 'vue';
import { api } from '../../utils/request.js';

const filter = ref('');
const items = ref([]);
const loading = ref(false);

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
function copyId(id) {
  if (!id) return;
  uni.setClipboardData({
    data: id,
    success: () => uni.showToast({ title: '已复制任务 ID', icon: 'none' })
  });
}

onMounted(() => load());
```

- [ ] **Step 4: mine 入口**

```js
import { ref, onMounted } from 'vue';
const canViewLogs = ref(false);

onMounted(async () => {
  if (userStore.isLogin) {
    await userStore.fetchUser();
    try {
      const meta = await api.getLogsMeta();
      canViewLogs.value = !!meta?.canViewLogs;
    } catch {
      canViewLogs.value = false;
    }
  }
});

function goLogs() {
  uni.navigateTo({ url: '/pages/logs/index' });
}
```

模板（会员中心附近）：

```html
<view v-if="userStore.isLogin && canViewLogs" class="menu-item" @click="goLogs">
  <view>
    <text class="menu-title">运行日志</text>
    <text class="menu-sub">按任务 ID 查看生成过程</text>
  </view>
  <text class="arrow">›</text>
</view>
```

需 `import { api } from '../../utils/request.js'`。

- [ ] **Step 5: 手工验收清单**

1. 非白名单登录：「我的」无「运行日志」；直开 `/pages/logs/index` 应 403 toast。
2. `17682160819` 登录：可见入口；默认最近日志；输入任务 ID 过滤。
3. 任务列表/详情可复制 ID；投诉页文案为「任务 ID」。
4. 跑一条生成，日志页出现 `processing started` / `text start` 等。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/request.js frontend/src/pages/logs/index.vue frontend/src/pages.json frontend/src/pages/mine/index.vue
git commit -m "Add viewer-only runtime logs page gated by phone."
```

---

## Spec coverage checklist

| Spec 要求 | Task |
|-----------|------|
| TaskLog 模型 + ensure-schema | Task 1 |
| logTask + console | Task 2 |
| task-runner / 下架埋点 | Task 3 |
| GET /api/logs + /meta + 手机号鉴权 | Task 4 |
| 留存 7 天 / 5000 条 | Task 2 `purgeTaskLogs` + Task 4 启动与 purge 脚本 |
| LOG_VIEWER_PHONE / TASK_LOG_RETENTION_DAYS | Task 4 `.env.example` |
| 任务列表/详情可复制 ID | Task 5 |
| 投诉「任务 ID」文案 | Task 5 |
| 日志页全局流 + 按 taskId | Task 6 |
| 我的页仅白名单显示按钮 | Task 6 |

---

## Self-review notes

- 无 TBD/placeholder 步骤。
- `canViewLogs` / `clampLogLimit` / `logTask` / `purgeTaskLogs` 命名在 Tasks 2–4 一致。
- API 字段 `recordId`（投诉）不变；仅 UI 称「任务 ID」。
- 全局流对白名单暴露全部用户任务日志（与 spec 明确决策一致）。
