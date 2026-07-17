# 任务 ID 展示 + 运行日志（设计说明）

日期：2026-07-17  
状态：已确认需求，待实现

## 目标

1. **用户可见任务 ID**：任务列表与创作详情可复制任务 ID，便于投诉与反馈。
2. **可按任务检索的运行日志**：任务关键步骤写入数据库，支持「最近全局流」与「按任务 ID 过滤」。
3. **受限查看权**：仅手机号 `17682160819`（可用环境变量覆盖）登录后，在「我的」页看到「运行日志」入口并查询。

非目标：完整运维平台、外部日志服务、普通用户查看他人任务日志。

## 背景

- 任务实体即现有 `GenerationRecord`，主键 `id`（cuid）已作为 API 的 `taskId` / 投诉「记录 ID」。
- 后端已有大量 `console.log('[task:...]', taskId, ...)`，但不可检索、前端不可见。
- 投诉页依赖用户提供记录 ID，当前 UI 未突出展示与复制。

## 方案选择

采用 **SQLite `TaskLog` 表 + 专用 logger + 鉴权 API + 前端日志页**（方案 1）。

不采用：仅文件日志（难按任务查）、外部 Loki 等（与「我的」内入口不匹配）。

## 数据模型

```prisma
model TaskLog {
  id        String   @id @default(cuid())
  taskId    String?  // GenerationRecord.id；系统级可为 null（本期不写系统级）
  level     String   // info | warn | error
  message   String
  meta      String?  // JSON 字符串，可选附加上下文
  createdAt DateTime @default(now())

  @@index([createdAt])
  @@index([taskId, createdAt])
}
```

`ensure-schema.js` 同步建表，与现有 SQLite 迁移方式一致。

## 后端

### Logger

新增 `backend/src/lib/logger.js`：

- `logTask(taskId, level, message, meta?)`：写入 `TaskLog`；同时 `console` 输出，格式含 `taskId`，便于 Railway 日志检索。
- 写库失败不阻断主流程（catch + console.warn）。

### 埋点位置（最小必要集）

在 `task-runner.js`（及必要时投诉下架）记录：

| 事件 | level | 示例 message |
|------|-------|----------------|
| 任务开始处理 | info | `processing started` |
| 文案开始 / 完成 | info | `text start` / `text done` |
| 配图进度 | info | `image 1/3 web` |
| 任务完成 | info | `completed` |
| 失败 / 超时 salvage | error / warn | 失败原因摘要 |
| 投诉下架 | warn | `takedown by complaint` |

不把完整 prompt、用户手机号、API Key 写入 `message`/`meta`。

### API

- `GET /api/logs?taskId=&limit=&before=`
  - 需 `authMiddleware`。
  - 校验 `user.phone === process.env.LOG_VIEWER_PHONE || '17682160819'`，否则 `403`。
  - `taskId` 有值则按任务过滤；否则按 `createdAt desc` 返回最近日志（全局流）。
  - `limit` 默认 100，最大 200。
  - 可选 `before`（ISO 时间或 log id）做简单分页。
- `GET /api/logs/meta`：返回 `{ canViewLogs: boolean }`，供「我的」页决定是否显示按钮（避免前端写死号码）。

挂载：`app.use('/api/logs', logRoutes)`。

### 留存

- 默认保留 **7 天**，或总量超过 **5000** 条时删除更早记录。
- 在 `purge-old-records.js` 增加清理 `TaskLog`，或启动时轻量清理一次。
- 环境变量：`TASK_LOG_RETENTION_DAYS=7`（可选）。

## 前端

### 任务 ID 展示

- **任务列表**（`history/index.vue`）：卡片上展示截断 ID（如前 8 位 + …），点击「复制」阻止冒泡，复制完整 `item.id`。
- **创作详情**（`create.vue`）：结果区顶部展示「任务 ID」+ 复制按钮。
- **投诉页**：文案由「记录 ID」统一为「任务 ID」（字段含义不变，仍为 `GenerationRecord.id`）。

### 日志页

- 新页面 `frontend/src/pages/logs/index.vue`，`pages.json` 注册。
- 「我的」：当 `canViewLogs` 为 true 时显示「运行日志」菜单项。
- 页面能力：
  - 默认加载最近全局日志流。
  - 输入框输入任务 ID → 过滤查询。
  - 列表展示时间、level、taskId（可点复制）、message。
- 非授权用户直接打开日志页 URL：API 返回 403，前端 toast 并返回。

## 权限与安全

- 查看权绑定手机号白名单（默认 `17682160819`），服务端强制校验，前端仅控制入口可见性。
- 日志内容避免敏感凭证；`meta` 仅放非敏感结构化字段（如 `imageSource`、`imageIndex`）。
- 不因本功能扩大 CORS 或放开未登录访问。

## 测试要点

- 非白名单用户：`GET /api/logs` → 403；「我的」无日志按钮。
- 白名单用户：可见入口；无 `taskId` 返回最近日志；有 `taskId` 仅该任务。
- 跑一条生成任务后，库中有对应 `TaskLog` 行，控制台仍有带 taskId 的输出。
- 复制任务 ID 后可用于投诉表单。

## 实现顺序建议

1. Prisma/`ensure-schema` + `logger.js`
2. `task-runner` / 下架埋点
3. `/api/logs` 路由
4. 前端任务 ID 展示 + 日志页 + 我的入口
5. 留存清理 + 简单测试

## 明确决策（消除歧义）

- 任务 ID = 现有 `GenerationRecord.id`，不新增第二套 ID。
- 本期只写**带 taskId 的任务日志**，不做登录等系统级日志。
- 全局流 = 全站最近任务日志（白名单用户可见所有用户的任务日志，便于运维排查）。
- 白名单默认硬编码 `17682160819`，可用 `LOG_VIEWER_PHONE` 覆盖。
