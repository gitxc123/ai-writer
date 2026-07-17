# 合规清单（产品侧）

本文档描述本仓库已落地的**产品侧合规能力**与**商用前建议**。  
协议与隐私政策文案为模板，**非正式法律意见**；正式对外收费或公开运营前，请咨询律师审核并替换运营主体信息。

## 已实现

| 项 | 说明 |
|----|------|
| 用户协议 / 隐私政策 | 「我的」与登录/注册页可查看；含主体占位、未成年人、跨境、代理、注销说明 |
| 登录 / 注册同意 | 两端均须勾选协议；后端强制 `acceptedTerms` |
| 满 18 岁确认 | 注册页勾选 + 后端 `ageConfirmed`；写入 `ageConfirmedAt` |
| 正文 AI 标识 | 成稿附加【AI 生成说明】 |
| 网络图 / AI 图 / 产品图免责 | 文末【配图来源】；产品图同步归因 |
| 导出保留标识 | 「复制全部结果」含 footer；小红书导出附短合规声明 |
| 投诉入口 | 「我的 → 投诉与反馈」；公示 SLA（默认 15 日）与平台侧另行投诉提示 |
| 下架能力 | 管理接口按投诉下架并删除本地配图 |
| 留存 | 默认 ≥180 天；`AUTO_PURGE` 启动后定时清理记录+本地图+任务日志 |
| 账号注销 | 「我的」入口；删记录/图/订单；投诉联系方式匿名化 |
| 演示支付 | 生产默认关闭 |
| 基础内容拦截 | 生成前关键词级拒绝（非完整审核） |
| 日志隐私 | 查看权限仅 `LOG_VIEWER_PHONE`；列表手机号脱敏 |
| 上传签名 | 生产默认 `/uploads` 需签名 URL（见安全 P0） |

## 环境变量

```env
COMPLAINT_EMAIL=legal@your-domain.com
OPERATOR_NAME=你的公司全称
ADMIN_TOKEN=请换成足够长的随机串
RECORD_RETENTION_DAYS=180
AUTO_PURGE=1
COMPLAINT_SLA_DAYS=15
LOG_VIEWER_PHONE=仅运维手机号
STRICT_SECURITY=1
PUBLIC_BASE_URL=https://你的域名
NODE_ENV=production
```

## 投诉下架 API（管理）

列出待处理投诉：

```bash
curl -H "X-Admin-Token: $ADMIN_TOKEN" https://你的域名/api/complaints/admin/list
```

按投诉 ID 下架：

```bash
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"note\":\"侵权核实后下架\"}" \
  https://你的域名/api/complaints/admin/<complaintId>/takedown
```

公开提交：`POST /api/complaints`。

## 留存清理

- **自动**：进程内 `AUTO_PURGE`（默认开），启动约 15s 后执行，并按日定时。
- **手动**：`cd backend && node scripts/purge-old-records.js`

## 仍需人工 / 律师 / 外部能力（代码无法单独完成）

1. 律师审定协议全文并替换运营主体、住所、跨境接收方清单  
2. 短信实名验证码（需短信服务商与模板报备）  
3. 生成式 AI / ICP 等备案与正式深度合成隐式标识（如元数据水印服务）  
4. 专业内容安全审核 API  
5. 投诉邮件告警与运营值班 SOP  
6. 正式支付、发票与七天无理由等消保配套  

完成上述前，建议仅小范围试用，并在产品内保留明显免责与投诉入口。
