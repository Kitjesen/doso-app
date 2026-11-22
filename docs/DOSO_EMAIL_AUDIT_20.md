# DOSO 邮件链路 Acid Audit：20 项问题

> 核对日期：2026-08-26  
> 结论：**FAIL（生产） / PASS（本地资产与测试）**  
> 核心问题：11 份模板确实存在，但“模板资产存在”仍被生产部署、真实触发和真实收件箱证据隔开。

## 证据快照

- 本地模板资产：11/11；生成器产物：13/13。
- G016 `e6e671f` 后当前集成树：fresh reset PASS；邮件 pgTAP 74/74；全库 DB 461/461。
- Management 工具测试 55/55；安全预览测试 7/7；Edge Function 测试 59/59；账户邮件运维契约 42/42。
- 托管项目仍只有 `account-sessions`、`admin-devices`、`admin-users`、`device-binding` 四个 Edge Functions；没有 `account-email-worker`。
- 托管 migration head 仍是 `20260823111035`；本地邮件 migration `20260825070607` 未部署。
- 邮件字标目标 URL 当前返回 HTTP 400；`dosorobotics.com/account/security` 与 `/account/delete/confirm` 当前 TLS 连接失败。
- 2026-08-26 全部 11 份预览均通过 TLS 1.3、SMTP AUTH，并获得 `SMTP 250`；目前仍只有 `confirmation` 在 QQ Mail iOS 具备人工确认的最终到达/可读证据，其余 10 封待收件箱或垃圾箱确认。

## 20 项问题

| # | 级别 | 状态 | 问题与证据 | 影响 | 最小修复 |
| --- | --- | --- | --- | --- | --- |
| 1 | P1 | 阻塞 | 11 份模板共同引用的版本化 Logo URL 返回 HTTP 400。`scripts/build-email-template-suite.mjs:9` | 所有真实邮件可能破图；`email:sync` 会正确地拒绝同步。 | 以禁止覆盖方式上传哈希命名 PNG，回读校验 HTTP 200、`image/png`、196202 bytes 与 SHA-256。 |
| 2 | P1 | 部分完成 | 11/11 预览已获 `SMTP 250`，但最终收件箱人工确认仍只有 QQ iOS `confirmation` 1/11。`docs/DOSO_EMAIL_DOMAIN.md` 的批次证据表记录了 11 个 Message-ID。 | 其余十份是否入箱、进垃圾箱、延迟或布局破坏仍未知。 | 在 QQ 收件箱/垃圾箱逐封核对，保存截图和原始邮件头；随后扩展至 Gmail、Outlook/Hotmail 与 163。 |
| 3 | P1 | 阻塞 | 生产事件触发是 0/11；预览脚本直接读取本地 HTML 并走 SMTP。`scripts/send-email-template-previews.mjs:108-143,245` | 即使预览全部到达，也不能证明 Supabase Auth、outbox、Worker 或 Cron。 | 将“视觉投递”和“生产事件触发”拆成两张验收矩阵，分别通过。 |
| 4 | P1 | 阻塞 | 托管项目没有 `account-email-worker`。 | 四份自定义模板没有生产发送执行器。 | 部署 Worker，验证错误 key=401、正确 named key=200、空队列=200。 |
| 5 | P1 | 阻塞 | 托管项目没有邮件 outbox migration、RPC、`pg_cron`/`pg_net` 调度资产；远端 migration head 落后。 | 当前新安装登录不可能入队、领取或发送邮件。 | 按 migration → Worker → Vault/Cron 顺序暗部署，flag 保持关闭，再做 smoke test。 |
| 6 | P1 | 未实现 | 四份自定义模板中只有 `new_device_login` 被运行时允许。`supabase/functions/_shared/accountEmail.ts:36` | `anomalous_login`、注销确认、注销完成只是不可达设计资产。 | 每类先建立可信事件源、enqueue 契约、feature flag 与端到端测试，再称为实现。 |
| 7 | P1 | 未实现 | 当前 App 使用密码登录，且没有改邮箱入口；`magic_link` 与 `email_change` 无产品入口。`src/services/authService.ts:229` | 两份原生模板只能预览，用户无法从现有 App 触发。 | 实现对应流程，或明确标注“模板就绪、功能未接入”。 |
| 8 | P1 | 阻塞 | 安全与注销 CTA 指向的两个根域页面没有可用 DNS/TLS。`supabase/functions/_shared/accountEmail.ts:9` | 邮件主按钮点击后打不开，安全恢复路径失效。 | 先上线 DNS、证书和页面，再开启相关邮件事件。 |
| 9 | P1 | 未验证 | 托管 Auth 的 7 份模板、2 个通知开关及 SMTP 非敏感字段尚未通过 Management API 回读；历史页面曾显示 Sender email/Username 为空。`docs/DOSO_EMAIL_DOMAIN.md:19` | 本地模板不能证明 Supabase 正在使用相同主题、HTML 和发件配置。 | 在本机临时注入 PAT 运行只读 `email:verify`，保存脱敏 hash 证据，再考虑同步。 |
| 10 | P1 | **已修复** | 安全发送包装器的 UTF-8 中文提示在 Windows PowerShell 5.1 被误解码，脚本在密码提示前即 ParserError。`scripts/send-email-template-previews.ps1` | 这是本轮 11 封真实发送无法启动的直接代码缺陷。 | 提示改为 ASCII，并加入 PowerShell 5.1 解析回归测试；当前预览测试 7/7 PASS。 |
| 11 | P2 | 能力漂移 | 预览 SMTP 生成 `text/plain + text/html`，生产 DirectMail Worker 只提交 `HtmlBody`。`scripts/send-email-template-previews.mjs:304`、`supabase/functions/_shared/aliyunDirectMail.ts:269` | 本地证明的纯文本可访问性并不存在于自定义生产路径。 | 核实 DirectMail 合同后支持 `TextBody`；否则明确记录限制并真实验证降级。 |
| 12 | P2 | 缺失 | outbox 的 `accepted` 只代表 Provider 接受请求；没有 delivered/bounced/complained 闭环。`supabase/migrations/20260825070607_add_account_email_outbox.sql:392` | 退信、垃圾箱或投诉仍可能被误报为成功。 | 接入 DirectMail 投递/退信查询或事件同步，增加最终投递状态与告警。 |
| 13 | P2 | 未部署 | unknown/dead/队列积压告警与 PII 清理 Cron 目前只存在 Runbook。`docs/runbooks/ACCOUNT_EMAIL_OUTBOX_DEPLOYMENT.md:74-100` | Worker 卡死或结果不明时只能依赖人工偶然发现。 | 把 Cron、最近执行时间、非 2xx 告警和负责人变成发布门禁证据。 |
| 14 | P2 | 设计缺口 | 30 天 PII 清理只覆盖 `accepted`、`dead`、`delivery_unknown`，长期 `queued/leased/dispatching` 不在清理范围。`supabase/migrations/20260825070607_add_account_email_outbox.sql:358` | flag 关闭、Cron 中断或队列卡住时 recipient/payload 可能无限期保存。 | 为过期非终态建立 quarantine/unknown 转换，再进入统一脱敏流程。 |
| 15 | P2 | 有缓解 | installation ID 来自客户端，可被重新安装或恶意客户端伪造；当前稳定 session ID 与 24 小时三封上限只能限流。 | 不能把“新 installation”描述成可信物理设备或风控判断。 | 保持“客户端报告”文案；需要更强信号时增加设备证明/风险引擎，勿直接信任 ID。 |
| 16 | P2 | 生产漂移 | 托管 `account-sessions` v1 仍将原始 `installationId` 写入审计；本地新版才改为 digest。 | 当前生产审计保存可关联安装标识，且托管代码落后于本地安全模型。 | 部署新版 `account-sessions`，验证审计只含 digest。 |
| 17 | P2 | 未验证 | 客户端矩阵缺失：QQ 桌面、163、Outlook/Hotmail、Gmail 均为 0/11。 | 无法证明入箱、垃圾箱、图片代理、链接重写和布局兼容。 | 建立 11×客户端矩阵并检查 SPF/DKIM/DMARC 原始头。 |
| 18 | P2 | 未验证 | 模板只声明 light color scheme，未验证客户端强制暗色反转。`scripts/build-email-template-suite.mjs:74` | 蓝色 Logo、红色警示和浅蓝面板可能对比失真。 | 在 QQ、Outlook、Apple Mail/Gmail 暗色实测后增加安全覆盖。 |
| 19 | P2 | 兼容风险 | CTA 是普通 HTML 链接按钮，不是老版 Windows Outlook 的 VML bulletproof button。`scripts/build-email-template-suite.mjs:61` | Outlook 可能丢失内边距、圆角或完整点击区域。 | 增加 MSO 条件 VML fallback，并在 Windows Outlook 验证。 |
| 20 | P2 | 契约缺失 | 注销确认文案写死“24 小时失效”，但当前没有与后端 token TTL 绑定的实现或测试。`scripts/build-email-template-suite.mjs:154` | 未来真实 TTL 不一致会形成错误安全承诺。 | 增加 TTL 契约测试；实现前移除固定时长或由可信服务端提供到期时间。 |

## 什么是真的

- 7 份 Supabase Auth 模板和 4 份自定义模板确实由统一生成器产出。
- OTP-only、变量白名单、HTML 转义、受控 URL、Provider 错误脱敏和 unknown 状态机有真实测试。
- G016 后当前本地集成树 fresh reset、邮件 74/74、全库 461/461 均已通过。

## 什么被夸大了

- “11 份邮件完成”仍不成立；准确说法是“11/11 本地资产、11/11 SMTP 接受、人工确认真实客户端 1/11、生产事件 0/11”。
- 预览 SMTP 成功不能证明 Supabase Auth、outbox、Worker、Cron 或最终入箱。
- Provider `accepted` 不能写成“已投递”。

## 修复顺序

1. 上传并回读版本化 Logo；上线安全页 DNS/TLS。
2. 在 QQ 收件箱/垃圾箱逐封确认已获 SMTP 接受的 11 封预览，检查图片、暗色、链接和原始头；随后立即轮换曾进入聊天记录的 SMTP 密码。
3. 用 Management API 只读核对并同步 7 份 Auth 模板。
4. 部署邮件 migration、Worker、新版 `account-sessions`、Vault/Cron 与告警。
5. 逐项补齐不可达事件和跨客户端/生产触发验收。
