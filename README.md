# AI Writer

类似 Bombai 的 AI 文案生成平台 MVP。

## 功能

- 用户注册 / 登录（手机号 + 密码）
- 模板库（小红书、头条、公众号、抖音等）
- AI 文案生成（Agnes AI / Mock / Ollama）
- **Agnes 文章配图**（文生图，多尺寸）
- 生成历史记录（含配图）

## 技术栈

- 前端：uni-app (Vue3) H5
- 后端：Node.js + Express + Prisma + SQLite
- AI：DeepSeek / 通义 / 任何 OpenAI 兼容接口

## 快速启动

### 1. 后端

```bash
cd backend
cp .env.example .env
# 编辑 .env，填入 AI_API_KEY

npm install
npx prisma db push
npm run db:seed
npm run dev
```

后端地址：http://localhost:3001

### 2. 前端

```bash
cd frontend
npm install
npm run dev:h5
```

前端地址：http://localhost:5173

## 环境变量 (backend/.env)

| 变量 | 说明 |
|------|------|
| `AI_API_KEY` | AI 接口密钥 |
| `AI_BASE_URL` | API 地址，默认 `https://api.deepseek.com` |
| `AI_MODEL` | 模型名，默认 `deepseek-chat` |
| `JWT_SECRET` | JWT 密钥 |
| `PORT` | 端口，默认 3001 |

## 项目结构

```
ai-writer/
├── backend/          # API 服务
│   ├── prisma/       # 数据库模型 + 种子数据
│   └── src/          # 路由 + 业务逻辑
└── frontend/         # uni-app H5
    └── src/pages/    # 页面
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/templates/categories` | 模板分类列表 |
| GET | `/api/templates/:id` | 模板详情 |
| POST | `/api/generate` | 生成文案（需登录） |
| POST | `/api/images/generate` | 生成配图（需登录，需 Agnes Key） |
| GET | `/api/records` | 历史记录（需登录） |
