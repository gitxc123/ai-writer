# 云平台部署（Railway）

本项目前后端打成 **一个 Docker 服务**：Express 提供 `/api`，同时托管 H5 前端。

推荐平台：[Railway](https://railway.app)（支持 Volume，可用 SQLite 持久化）。

## 一、准备

1. 代码已在 GitHub：https://github.com/gitxc123/ai-writer  
2. 注册 Railway，用 GitHub 登录并授权该仓库  

## 二、创建项目

1. Railway → **New Project** → **Deploy from GitHub repo** → 选 `ai-writer`  
2. 构建方式会自动用根目录 `Dockerfile`  

## 三、添加持久卷（重要）

否则重启后数据库和上传图片会丢：

1. 打开该 Service → **Settings** 或画布右键 → **Volume**  
2. Mount path 填：`/data`  
3. 保存并重新部署  

## 四、环境变量

在 Service → **Variables** 里配置：

| 变量 | 示例 | 说明 |
|------|------|------|
| `JWT_SECRET` | ≥32 位随机串 | **生产必填**；弱值会拒绝启动 |
| `AI_MODE` | `agnes` | 或 `mock` / `api` |
| `AI_API_KEY` | 你的 Agnes Key | 必填（mock 模式可空） |
| `AI_BASE_URL` | `https://apihub.agnes-ai.com/v1` | Agnes 默认 |
| `AI_MODEL` | `agnes-2.0-flash` | |
| `PUBLIC_BASE_URL` | `https://你的域名.up.railway.app` | 部署成功后填公网地址，方便配图 |
| `AI_FALLBACK_API_KEY` | DeepSeek Key（可选） | Agnes 挂了时兜底 |
| `PEXELS_API_KEY` | （可选） | 网络搜图更好用 |
| `COMPLAINT_EMAIL` | `legal@你的域名.com` | 投诉页展示邮箱（勿用占位） |
| `ADMIN_TOKEN` | ≥16 随机串 | 投诉下架管理接口鉴权 |
| `ENABLE_DEMO_PAY` | 不设 / `0` | 生产默认关闭演示支付；内测可设 `1` |
| `DAILY_GENERATE_LIMIT` | `10` | 每用户每日新建任务上限 |
| `GENERATE_SUBMIT_COOLDOWN_MS` | `5000` | 同一用户两次提交最短间隔（毫秒） |
| `STRICT_SECURITY` | `1`（可选） | 为 1 时缺投诉邮箱/ADMIN_TOKEN 则拒绝启动 |

以下一般 **不用改**（Dockerfile 已设）：

- `PORT`（Railway 会注入）
- `DATA_DIR=/data`
- `UPLOAD_DIR=/data/uploads`
- `DATABASE_URL=file:/data/prod.db`

## 五、生成公网域名

Service → **Settings** → **Networking** → **Generate Domain**  

得到类似：`https://ai-writer-xxxx.up.railway.app`

把这个地址填回 `PUBLIC_BASE_URL`，再部署一次。

## 六、验证

浏览器打开域名：

- 首页能打开  
- `https://你的域名/api/health` 返回 `{"code":200,"message":"ok"}`  
- 注册登录 → 选模板生成  

## 常见问题

**构建失败（前端）**  
看 Build 日志；uni-app 构建较吃内存，可在 Railway 把资源稍调高。

**数据库丢失**  
没挂 `/data` Volume。

**配图外链失败**  
检查 `PUBLIC_BASE_URL` 是否为当前 HTTPS 域名。

**只要演示、暂不上云**  
继续本机 + Cloudflare 隧道即可。

## 本地用 Docker 试跑

```bash
docker build -t ai-writer .
docker run --rm -p 3001:3001 ^
  -e JWT_SECRET=dev-secret ^
  -e AI_MODE=mock ^
  -v aiwriter-data:/data ^
  ai-writer
```

浏览器打开 http://localhost:3001

## 合规说明

产品侧已包含用户协议、隐私政策、注册勾选、网络图/AI 图免责与投诉下架能力，详见根目录 [COMPLIANCE.md](COMPLIANCE.md)。正式商用前请律师审核。
