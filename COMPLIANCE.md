# 合规清单（产品侧）

本文档描述本仓库已落地的**产品侧合规能力**与**商用前建议**。  
协议与隐私政策文案为模板，**非正式法律意见**；正式对外收费或公开运营前，请咨询律师审核。

## 已实现

| 项 | 说明 |
|----|------|
| 用户协议 / 隐私政策 | 前端「我的」与注册页可查看全文 |
| 注册同意 | 注册须勾选同意协议与隐私政策 |
| 网络图免责 | 文末声明不授予版权，发布前须自行取得授权 |
| AI 图标识 | 图注与文末声明「AI 生成，非现场真实照片」 |
| 投诉入口 | 「我的 → 投诉与反馈」，按记录 ID 提交 |
| 下架能力 | 管理接口按投诉下架生成内容 |
| 留存 | 隐私政策写明生成记录默认保留 ≥180 天；可手动清理脚本 |

## 环境变量

```env
COMPLAINT_EMAIL=legal@your-domain.com
ADMIN_TOKEN=请换成足够长的随机串
RECORD_RETENTION_DAYS=180
```

## 投诉下架 API（管理）

列出待处理投诉：

```bash
curl -H "X-Admin-Token: $ADMIN_TOKEN" https://你的域名/api/complaints/admin/list
```

按投诉 ID 下架对应生成记录：

```bash
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"note\":\"侵权核实后下架\"}" \
  https://你的域名/api/complaints/admin/<complaintId>/takedown
```

公开提交投诉：`POST /api/complaints`（表单页已接好）。

## 留存清理（手动）

```bash
cd backend
node scripts/purge-old-records.js
```

默认删除 `createdAt` 早于 180 天的 `GenerationRecord`。不自动挂 cron。

## 商用前建议律师审核

1. 用户协议与隐私政策全文（含管辖、注销、未成年人等）
2. 网络检索配图的版权风险与免责是否充分
3. AI 生成内容标识是否满足目标市场监管要求（如深度合成标识）
4. 投诉受理时限、材料要求与下架流程
5. 个人信息收集与跨境传输（若 AI/托管在境外）

完成审核前，建议仅小范围试用，并在产品内保留明显免责与投诉入口。
