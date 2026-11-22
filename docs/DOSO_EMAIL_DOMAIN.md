# DOSO 域名、企业邮箱与备案：当前状态及推进清单

### 2026-10-27 紧凑邮件字标与上海模板已启用

邮件专用字标从旧2172×724无损裁到新2172×216，原字形和RGBA像素保留，新对象 `doso-robotics-wordmark-email-03526d27c6b4.png` 为157380bytes，完整SHA `03526d27c6b4ca23ae12f24e6541ff2b6901b6303e4374ee4a0d229effad8cc4`；既有公开桶补传后匿名严格TLS GET 200/MIME/长度/SHA一致。共享生成器改为单页头并压紧间距，页脚只留版权；同步13份本地产物、Logo guard和fixtures，99项组合验证通过。

上海当前注册确认模板服务已实际提供6208bytes/SHA `059ea02a0de00258977c2a6d04dbc9cb1171529f033ba917b383b1931a0b8115`；新版本独立目录和第八层覆盖保留旧模板/manifest，其他核心服务/认证环境/原站检查保持。部署工具首次预检误拒及最小修订分别留证，最终10项离线检查、独立复审和实际私网HTTP通过。完整记录 `artifacts/release-readiness/20261027-email-compact-layout/`。此前“需两处Logo/旧29dea对象/未切换”的文字是当时历史，本轮新本地契约为恰好一个03526页头；旧对象仍保留供历史邮件使用。

未追加发送新版邮件，QQ/Outlook真实新邮件渲染尚未验收；当前仅上海注册确认服务切换，旧托管项目及其他业务发信函数未部署，本地一致性不冒称所有线上邮件均已切换。新后端公网HTTPS与App接入状态另按部署记录。

### 2026-10-27 收件反馈与邮件留白审查

森哥已确认收到此前唯一授权的图片检查邮件；原SMTP回执保持不可变，用户确认是新增证据。上下留白的本地根因包含：2172×724 PNG可见墨色仅175px高，上透明251/下298px，180×60显示时字高约14.5px；模板再叠加内容顶38px、标题前30px、页脚分隔前38/后26px。建议另存无损裁边的版本化字标并按真实比例显示，外层上下12、内容上下24、标题前16、页脚分隔前24/后16px。未获取QQ客户端截图，未在本轮修改资产、模板或云服务，未追加发信；详细只读记录 `artifacts/release-readiness/20261027-email-spacing-review/analysis.json`。以下“QQ待确认”是此前时点历史；本次仅确认收件，Logo实际显示仍没有独立确认。

### 2026-10-27 最新补充：缺失邮件字标已补齐

本轮修复前匿名 GET HTTP400，已登录 Storage 可见目录仅旧两个对象，版本化字标缺失。已在既有公开 email-assets 桶根目录只补传一次 `doso-robotics-wordmark-email-29dea10fd204.png`，未覆盖旧对象或改变权限。上传后匿名严格 TLS GET HTTP200、image/png、196202 bytes、无跳转，完整SHA256为 `29dea10fd2048cf016ddc9fa4bc9bafaf30ff891187e6f0fb09a8efea6a0de3c`，浏览器同地址加载2172×724图片。现有上海确认模板已引用此地址，HTML SHA `d0c36d7f0f3dde994a407754938edd6ff4028dad1967b3724cf053b8bd422fe1` 保留；无需重写模板或重启服务，未执行托管模板同步。

13份生成文件检查一致；Node `--logo` 的本地检查通过，但公开请求仍网络失败 exit1，因此不声称所有网络均通过。QQ图片加载/缓存仍待用户确认。上海新测试Auth终端已回报注册、6位验证码确认、密码登录及同账号读取通过；托管旧项目8位配置、App/G20实际登录另行验收。修复图片不自动发新邮件；用户另行批准的1封无验证码图片检查邮件已获得SMTP接受回执，`delivery_verified=false`，不重复注册或重发OTP。最终记录 `artifacts/release-readiness/20261027-email-logo-object-repair/single-mail-result-final-02.json`，其余证据同目录。以下各日期条目保留历史事实。

> 最后核对：2026-08-26
>
> 核对范围：阿里云域名控制台、云解析 DNS、阿里邮箱控制台、备案控制台、公共 DNS，以及仓库内 Auth/OTP 配置。账号、证件和联系方式等敏感信息不写入本文。

### 2026-10-17 02:52 当前只读复核：标准对象仍缺失，控制台绑定阻断

当轮SQL仅查询email-assets公开桶与两条品牌对象存在布尔：bucket公开、标准 `doso-robotics-wordmark-email-29dea10fd204.png` 不存在、旧 `DOSO.png` 存在。一次 `node scripts/manage-auth-email-templates.mjs --logo` 通过7份本地原生模板与196,202字节标准Logo校验，公网GET因网络失败exit1，未取得HTTP状态/正文；不是已观察404或公网字节通过。13份生成文件只读检查一致，不冒充云模板一致。

控制台库存可见原storage标签，但URL绑定30秒、读故障恢复规则后同标签ID绑定20秒均超时，已停止；页面正文未读、上传未开始、click/type0，没有安全绕过或云写。本轮不运行需要PAT且接触raw smtp_pass的 `--remote`，不读任何凭据。最小人工动作是将已有 `C:/doso-build/assets/brand/doso-robotics-wordmark-email-29dea10fd204.png` 原名补传至该桶根目录，不覆盖、不改权限，同名冲突即停；操作/网络条件变化后再做一次公开MIME/长度/完整SHA验证，随后另验真实托管模板与邮箱显示。证据：`artifacts/release-readiness/20261017-email-logo-readonly/observations.json`、`20261017-qa-client-build/integration.json`。历史结论不改写。

### 2026-10-15 22:29 补验：无需管理凭据的公开 Logo 检查

新增只读命令（不需要 PAT，不读取/修改托管 Auth 配置，不写快照或文件）：

```powershell
node scripts/manage-auth-email-templates.mjs --logo
```

它保留本地模板与批准 PNG 的严格预检，只 GET 固定公开 URL且禁止重定向；实际响应逐块累计，超出 256 KiB 时取消并停止后续读取，伪小/缺少 Content-Length 不能绕过；成功仍要求与本地完整长度及 SHA-256 一致。不能把流读取边界理解为网络预取或进程内存的绝对上限。此命令通过也**不等于实际托管模板、SMTP 投递、收件箱渲染或安卓认证通过**；完整托管配置比对仍使用已有安全授权流程和 `--remote`，不要把令牌发到聊天或写入仓库。

本轮云端只读查询项目健康、bucket 公开，但标准对象名仍无元数据行，只有旧 `DOSO.png`。唯一一次真实公开 GET 因网络连接失败而结束（exit 1，未取得 HTTP 状态，非已确认 404）；浏览器绑定超时后已停止，托管 Auth 配置未回读、未上传/同步、未发邮件。83/83 本地工具测试与 13 生成文件一致性通过仅关闭核验工具缺口，**线上 Logo 仍未闭环**。先不覆盖地补传标准资产，再验公开字节、托管模板及真实邮件。当前完整证据：`artifacts/release-readiness/20261015-public-logo-check/integration.json`。

### 2026-10-15 专项补验：Logo 对象与本地检查

本轮只读 Storage 目录查询确认固定对象 `email-assets/doso-robotics-wordmark-email-29dea10fd204.png` 不存在，旧 `DOSO.png` 存在。此次没有公网下载、线上模板回读、上传或模板同步，不能宣称 Logo 已恢复。下方历史域名/SMTP 结论不因本次对象检查而自动重新生效。

修正 `manage-auth-email-templates.mjs` 的缺图误通过：在排除 HTML 注释后要求两处真实 Logo `<img>`；按当前生成器约定，唯一且带引号的 `src` 必须是首属性并精确引用标准 URL，拒绝备用图片源。纯文本网址、注释图片及 `alt` 内伪 `src` 不再满足检查；无效模板的本地、远端核验和直接同步入口均在网络/快照前停止。`email:check` 通过，专项测试 74/74（网络与写入仅 mock）；此检查不证明 CSS 可见性或真实收件箱渲染。证据见 `artifacts/release-readiness/20261015-email-logo-guard/verification.json`。线上恢复仍以禁止覆盖补传、公网 MIME/长度/SHA-256、真实云模板回读和邮件客户端复验为准。

## 当前结论

DOSO 的主域名已经确定为 `dosorobotics.com`，域名由上海穹沛科技有限公司持有，企业实名认证成功，有效期至 2028-07-16。

阿里企业邮箱也已经购买并开通，不需要再购买免费版：当前实例为 **企业邮箱-AI尊享版**，已购买 3 个用户数，有效期至 2027-07-16。阿里邮箱控制台显示域名解析已生效，公共 DNS 也能查询到三条 MX、根域 SPF，以及 Webmail/SMTP/IMAP/POP3 的 CNAME。

企业邮箱当前下一步是为管理员 `postmaster@dosorobotics.com` 初始化密码。之后还需要分配成员账号、验证 DKIM/DMARC 并完成真实收发测试；这些项目通过后，`@dosorobotics.com` 才能作为 DOSO 的正式办公邮箱使用。

生产 Auth 事务邮件的 SMTP 密码由所有者确认已在 DirectMail 与 Supabase 保存。2026-08-26 已使用独立 DirectMail SMTP 预览发送器按固定顺序提交全部 11 份模板，TLS 1.3、SMTP AUTH 和每封 `SMTP 250` 均通过；账户所有者此前已确认 `confirmation` 真实到达 QQ 手机客户端且版式可读。准确统计应分层记录：**模板资产 11/11、本地静态/MIME 渲染 11/11、DirectMail SMTP 接受 11/11、已人工确认真实邮件客户端 1/11、Supabase Auth 或自定义 worker 生产事件触发 0/11**。SMTP `250` 只证明服务商接受，剩余 10 封仍需在 QQ 收件箱/垃圾箱核对，不能写成最终投递完成。办公邮箱和 App 验证码邮件继续隔离：办公邮箱使用根域 `@dosorobotics.com`；DirectMail 发信域 `auth.dosorobotics.com` 已于 2026-08-23 23:00:12 创建，四条 DNS 记录均已验证通过；触发邮件地址 `no-reply@auth.dosorobotics.com` 已创建且状态正常。仓库已按 2026-08-24 的 9 张参考图建立统一 DOSO 邮件设计系统：7 份 Supabase 原生模板和 4 份 DOSO 自定义事件模板。原生模板由 Auth 发送；自定义链路已在提交 `ea247ff` 中补齐服务端 outbox、租约/dispatch fencing、unknown/dead 运维状态、DirectMail HTTPS `SingleSendMail` 适配器和首次新安装登录原子入队。功能 flag 仍默认关闭，数据库 migration、Edge Function、专用 RAM AccessKey、named secret、Edge Secrets 和 Cron 均尚未部署到托管项目。

托管 Supabase 项目此前使用默认发件人 `noreply@mail.app.supabase.io` 和默认确认链接模板。Auth 日志已经确认：第一次访问链接实际完成了邮箱确认并返回 303，而该验证请求记录的开发回跳配置是 `http://localhost:3000`，所以在邮件所在设备上看起来像“链接打不开”；同一个一次性链接再次访问会返回 `Email link is invalid or has expired`。历史控制台操作记录显示，该旧问题随后已修复：注册确认、密码重置和重新认证三套 DOSO 品牌 OTP-only 模板保存到托管项目，只包含 `{{ .Token }}`，不包含 `ConfirmationURL` 或 `<a>` 链接；Site URL 改为 `doso://auth/callback`，Redirect URLs 加入 `doso://auth/callback` 和 `doso://auth/reset-password`。本次仓库实现进一步补齐登录 OTP、验证新邮箱、密码已修改和邮箱已修改四份原生模板，并启用后两类安全通知的本地基准；所有 5 份验证码模板仍为 OTP-only。Management API 管理工具现以 schema v2 管理 7 个主题、7 份 HTML 和 2 个通知开关，同时继续严格兼容只回滚旧 6 字段的 schema v1 快照。当前执行环境尚未注入 `SUPABASE_ACCESS_TOKEN`，所以这些新增托管字段尚未在本轮写入或回读生产。

DirectMail 已不再受欠费或发信域验证阻塞。`auth.dosorobotics.com` 的 DKIM、SPF、DMARC 和 MX 已保存到阿里云 DNS，DirectMail 控制台显示四项全部验证通过，发信域整体状态为“验证通过”；MX 在阿里云 DNS 实际使用优先级 `1`。SMTP 密码由所有者确认已设置，本轮未读取或披露明文。2026-08-25 对 Supabase SMTP 页面进行的只读核对显示 Custom SMTP 已开启、Host=`smtpdm.aliyun.com`、Port=`465`、Sender name=`DOSO`、最小间隔=`60`；当时页面中的 Sender email 与 Username 可见值为空，密码字段无法由平台安全读回。因此仍必须用 Management API 的脱敏 `email:verify` 确认非敏感字段和 `smtp_pass` 非空，再做真实投递；不能仅凭“已点保存”判定生产完成。

2026-08-24 本轮通过 Supabase 项目接口重新确认 `DOSOrobotics`（ref `vchvqfdlkomlrjenkdhj`）状态为 `ACTIVE_HEALTHY`。最近 24 小时 Auth 日志可见配置重新加载，未提供新增模板的主题/HTML 正文，也没有覆盖本轮注册、恢复、重新认证或安全通知投递，因此不能替代 Management API `email:verify` 和真实收件箱验收。日志仍有 GoTrue 旧 JWT group 环境变量弃用警告，与当前 SMTP/模板链路无直接关系，后续随平台配置清理跟踪。

2026-08-26 在 11 封预览提交后再次只读核对托管项目：项目仍为 `ACTIVE_HEALTHY`，远端 migration 仍止于 `20260823111035`；Edge Functions 仍只有 `account-sessions`、`admin-devices`、`admin-users`、`device-binding`，没有 `account-email-worker`；远端不存在 `account_email*` 表或函数，`pg_cron` 与 `pg_net` 均未安装。安全 Advisor 仍报告 leaked-password protection 关闭、6 个 authenticated 可执行的 `SECURITY DEFINER` 函数警告，以及 `private.device_claims`、`public.audit_logs` 的 RLS 无 policy 信息项。邮件专用版本化 Logo URL 同期仍返回 HTTP 400。

2026-08-25 再次程序化回读托管项目：远端 migration 列表仍截止于 `20260823111035_inline_username_constraint`，Edge Function 仍只有 `account-sessions`、`admin-devices`、`admin-users` 和 `device-binding`；没有 `20260825070607_add_account_email_outbox` 或 `account-email-worker`。因此本文把新 outbox/worker 明确标记为“本地完成、待托管部署”，不把测试通过误写成已经上线。

2026-08-26 本地安全收敛新增四项：`--sync` 现在会在任何快照或 PATCH 前完整 GET 并校验 11 个 Auth/SMTP 前置字段、`smtp_pass` 非空和公网 Logo 哈希，任一不合格都保持零写入；新安装邮件对同一认证会话保留首个 installation ID，并以数据库 advisory lock 串行化同一用户、限制每 24 小时最多 3 封新 installation 通知，达到上限只跳过邮件而不阻塞终端登记；自定义邮件 URL 进一步限制到 `/account/security` 与 `/account/delete/confirm` 两条受控 HTTPS 路径；本地预览 `.eml` 改为 `multipart/alternative`，同时包含纯文本与 HTML，纯文本部分会保留安全与注销按钮的完整 URL。G016 提交 `e6e671f` 合入后已在当前集成工作树重新执行 fresh reset；清理两个无持久数据的残留 `gotrue migrate` 临时容器后一次通过，账户邮件目标 pgTAP `74/74`、全库 DB `461/461` 通过。上述内容仍未部署到托管项目。

同日对账户安全落地页做了外部复核：`dosorobotics.com` 根域没有可用的 A、AAAA 或 CNAME，`https://dosorobotics.com/account/security` 无法完成 TLS 连接。该 URL 已写入新安装/异常登录模板，因此在页面、DNS 和证书真实可用前，`new_device_login` 功能 flag 必须继续保持 `false`；暗部署 migration/function 也不得被解释为允许生产发信。

进一步审计还发现四个容易被“11 份模板已完成”掩盖的边界：第一，11 份 HTML 资产不等于 11 条生产事件链路，当前只有 7 个 Supabase Auth 模板槽位和 1 条本地自定义 `new_device_login` 事件实现，异常登录与注销仍只是安全关闭的设计资产；第二，本地预览 SMTP 已生成 `text/plain + text/html`，但 Supabase 托管 Auth 与 DirectMail `SingleSendMail` worker 是两条不同发送路径，不能用预览 MIME 证明生产邮件也有纯文本替代体；第三，installation ID 仍是客户端报告值，稳定绑定和 24 小时限流只能抑制滥发，不能把它升级为可信硬件身份或风控信号；第四，unknown/dead 人工处理 RPC 会保存操作理由，但 service-role 数据库调用本身不能证明具体人类运维员身份，生产运行必须再通过带登录身份的后台或工单审批层绑定操作者与票据。

托管 Supabase 安全顾问的本轮只读回读还显示：泄露密码保护仍关闭；6 个终端相关 `SECURITY DEFINER` RPC 对 `authenticated` 可执行，需要逐项确认这是受 `auth.uid()` 严格自作用域约束的有意接口，而不是宽授权；`private.device_claims` 与 `public.audit_logs` 为 RLS 已开启但无策略的 INFO。它们不是本次“邮件发不出”的直接原因，也不能仅凭顾问提示判定已存在漏洞，但属于生产上线前必须关闭或形成书面接受结论的安全门禁。

Exa MCP 已启用并完成过 GitHub 技术项目调研。它与 DirectMail、DNS 和 Supabase Auth 发信链路无关，不参与生产发信。

备案方面，公司已经有备案主体，`inovaxio.com` 已通过备案；新的一笔“有主体新增服务”订单在阿里云初审阶段被退回，需修改后重新提交。该订单详情中的目标域名需要再次手机验证后才能最终确认，因此在重新提交前必须确认它绑定的是 `dosorobotics.com`。

## 阿里云账号下的域名清单

| 域名 | 状态 | 到期时间 | 自动续费 | 当前建议 |
| --- | --- | --- | --- | --- |
| `dosorobotics.com` | 正常、企业实名成功 | 2028-07-16 | 未开启 | DOSO 主品牌、官网和企业邮箱根域；建议开启自动续费 |
| `inovxio.com` | 正常、企业持有 | 2027-03-11 | 未开启 | 用途待确认；若为防御性域名则开启续费，否则提前决定是否放弃 |
| `robohubio.com` | 正常、企业持有 | 2026-12-14 | 未开启 | 最紧急；在 2026-10 前完成保留/放弃决策 |
| `inovaxio.cn` | 正常、企业持有 | 2026-10-22 | 已开启 | 保留为中国区/品牌防御域名 |
| `inovaxio.com` | 正常、企业持有 | 2034-09-20 | 已开启 | 现有已备案网站，继续保留 |

所有 5 个域名当前都使用阿里云 DNS，状态正常。

### 域名侧的近期动作

1. 优先处理 `robohubio.com`：它将在 2026-12-14 到期且未开启自动续费。
2. 为 `dosorobotics.com` 开启自动续费，并确认域名注册联系人邮箱和阿里云账号均启用 MFA。
3. 明确 `inovxio.com` 是否为拼写保护/防御性域名；如果保留，也应开启自动续费。
4. 不要删除 `dosorobotics.com` 现有邮箱 DNS 记录；官网上线时只新增网站所需的 A/AAAA/CNAME，不能覆盖 MX 和 SPF。

## 完成情况

| 项目 | 状态 | 当前证据或说明 |
| --- | --- | --- |
| 注册、恢复、重新认证的 8 位邮箱验证码 | 🟡 邮件基础设施已对齐；App 兼容改造与实机复验中 | 托管项目实际发送 8 位邮箱 OTP；本地 Auth/邮件管理契约已改为 8 位，不影响独立的 MFA/TOTP 契约 |
| OTP 长度、有效期、重发间隔 | ✅ 邮件配置完成 | 邮箱 OTP 8 位、10 分钟有效、60 秒重发间隔；MFA/TOTP 不随本次改动弱化 |
| Supabase 原生 DOSO 邮件套件 | ✅ 仓库完成；待托管同步 | 5 份 OTP-only 模板 + 密码/邮箱变更 2 份安全通知；统一 640px 品牌布局 |
| 自定义账户安全邮件模板 | ✅ 仓库完成 | 4 份模板已生成，并生成 Edge 运行时模板模块；变量白名单、HTML 转义和 DOSO HTTPS 链接校验均有测试 |
| 自定义邮件 outbox 与 DirectMail HTTPS worker | 🟡 本地完成并加固；待托管部署 | 新安装登录原子入队；稳定 session installation ID、每用户 24 小时最多 3 封、严格 worker 请求体、Provider 错误脱敏、幂等键、lease/dispatch fencing、unknown/manual retry、指数退避、死信及 `SingleSendMail`；G015 后 fresh reset、目标 DB `74/74`、full DB `432/432` 通过 |
| 异常登录邮件 | ⬜ 安全关闭 | 尚无可信风险信号、GeoIP/ASN 与失败聚合，不发送伪造的“异常登录”结论 |
| 账户注销邮件/执行 | ⬜ 安全关闭 | 仅建立默认关闭的状态契约；数据处理清单和外部身份撤销适配完成前不执行真实注销 |
| 本地邮件捕获与 Auth 自动验证 | ✅ 已通过 | Mailpit、本地 Auth、`test:auth`、`test:pkce` 的 OTP 分支 |
| `dosorobotics.com` 注册及公司权属 | ✅ 完成 | 企业实名认证成功，有效至 2028-07-16 |
| 阿里企业邮箱实例 | ✅ 已购买并开通 | AI尊享版、3 用户，有效至 2027-07-16 |
| 企业邮箱 MX/SPF/客户端 DNS | ✅ 已生效 | 公共 DNS 已查询到 MX、SPF、mail/smtp/imap/pop3 CNAME |
| 企业邮箱管理员密码 | ⬜ 未完成 | `postmaster@dosorobotics.com` 显示“尚未设置” |
| DOSO 成员邮箱分配 | ⬜ 未完成 | 已购 3 用户，尚待按团队需求创建 |
| 企业邮箱真实收发验收 | ⬜ 未完成 | 尚未覆盖外部来信、回复、Gmail/Outlook/国内邮箱投递 |
| 根域 DMARC 与可验证的自有域 DKIM | 🟡 待补验/配置 | 当前 DNS 清单未见 `_dmarc`；需从实际发信原文确认 DKIM 与域对齐 |
| DirectMail 服务 | ✅ 已开通 | 华东 1（杭州）实例可用 |
| `auth.dosorobotics.com` 事务发件域 | ✅ 验证通过 | 2026-08-23 23:00:12 已创建；DKIM、SPF、DMARC、MX 四项均已通过 DirectMail 验证 |
| DirectMail 发信地址 | ✅ 已创建 | 触发邮件地址 `no-reply@auth.dosorobotics.com` 状态正常 |
| DirectMail SMTP 密码 | 🟡 独立 SMTP 预览 11/11 获得 `250`；凭据因曾进入聊天必须轮换，仍待 `email:verify` 核对 Supabase 托管配置 | 立即轮换 DirectMail 与 Supabase 中的 SMTP 密码；管理工具只验证远端 `smtp_pass` 非空及 11 个非敏感配置字段，绝不比较、回显或快照密码 |
| Supabase 托管邮件模板 | 🟡 历史三模板有保存记录；新增套件待同步 | 本轮缺少 `SUPABASE_ACCESS_TOKEN`；需脱敏回读 7 个主题、7 份 HTML 和 2 个通知开关 |
| Supabase 模板程序化管理 | ✅ 本地工具扩展完成；待管理令牌回读 | `email:check` 为本地检查，`email:verify` 为只读 GET；同步先完整校验 11 个非敏感 Auth/SMTP 前置字段、密码存在性与 Logo 哈希，全部通过后才创建仓库外 schema v2 快照并 PATCH 16 个 allowlist 字段；schema v1 旧快照仍只回滚原 6 字段 |
| Supabase 生产 Custom SMTP | 🟡 已启用；非敏感字段疑似不完整 | 页面只读核对显示 Host/Port/Sender name/间隔正确，但 Sender email 与 Username 可见值为空；待 `email:verify` 脱敏回读和真实投递 |
| Supabase Site URL / Redirect URLs | 🟡 App 与本地配置已准备；待托管回读 | Site URL 仍为 OTP MVP 的 `doso://auth/callback`；白名单同时包含自定义 scheme 和精确 HTTPS callback/reset 路径；生产 DNS、站点与 `.well-known` 尚未部署验证 |
| DOSO 账户安全落地页 | ⛔ 阻塞 | `https://dosorobotics.com/account/security` 当前无根域 A/AAAA/CNAME 且 TLS 失败；页面上线前不得开启账户安全邮件 flag |
| 现有 ICP 主体及 `inovaxio.com` | ✅ 已备案 | `沪ICP备2025116222号-1`，管局审核通过 |
| 新增服务备案订单（目标域名待确认） | 🟡 阿里云初审退回 | 需修正网站名称、负责人证件和联系电话可达性 |
| `dosorobotics.com` 官网公共解析 | ⬜ 尚未配置 | 根域和 `www` 未见 A/AAAA；若使用中国内地服务器，应待备案通过后再配置 |
| CAPTCHA | ⬜ 无完成证据 | App 未接入；本轮未核查托管 Auth Dashboard |
| HTTPS App Links / Universal Links | 🟡 App/Supabase 配置已准备 | `https://links.dosorobotics.com/auth/callback` 与 `/auth/reset-password` 已写入 App 和配置；DNS、站点、AASA/assetlinks、正式签名和真机回调仍未完成 |

## 企业邮箱：现在怎么推进

### 1. 初始化管理员

在阿里邮箱控制台为 `postmaster@dosorobotics.com` 设置管理员密码和安全手机。密码应由 DOSO 管理员本人输入并保存到团队密码管理器，不写入聊天、Git、文档或 App 配置。

初始化完成后，从 [阿里企业邮箱 Webmail](https://qiye.aliyun.com) 登录管理员账号。

### 2. 分配已购买的 3 个邮箱账号

建议先按实际岗位建立账号，不把个人长期使用的邮箱做成共享密码账号。首批可从以下方案中选择 3 个：

- `support@dosorobotics.com`：客服与产品支持。
- `business@dosorobotics.com` 或 `hello@dosorobotics.com`：商务与外部合作。
- `finance@dosorobotics.com`：账单、合同和财务通知。
- 核心成员姓名邮箱：例如 `name@dosorobotics.com`。

`postmaster@` 只用于管理；`no-reply@` 不应作为人工办公邮箱使用。如果产品支持邮件需要多人处理，优先使用邮件组、共享流程或客服系统，而不是多人共用一个密码。

### 3. 完成真实收发测试

- 从 QQ、163、Gmail、Outlook/Hotmail 向 DOSO 邮箱发信，确认能收件。
- 从 DOSO 邮箱逐一回复，检查收件箱/垃圾箱、延迟和显示名称。
- 查看 Gmail/Outlook 邮件原文，确认 SPF、DKIM、DMARC 结果及 From 域对齐。
- 在确认合法发件源后，为 `_dmarc.dosorobotics.com` 先发布 `p=none` 报告策略，再逐步提升至 `quarantine` 或 `reject`。

### 4. 保护续费和管理员账号

- `dosorobotics.com` 当前未开启自动续费，应在域名控制台开启。
- 阿里邮箱实例有效至 2027-07-16；在到期前确认邮箱实例的自动续费状态。
- 域名、DNS、企业邮箱和 Supabase 管理员账号均开启 MFA，并至少保留两名受控管理员。

## Auth 事务邮件：与办公邮箱隔离

推荐结构：

| 用途 | 地址/域名 | 服务 |
| --- | --- | --- |
| DOSO 办公、客服、商务 | `@dosorobotics.com` | 已开通的阿里企业邮箱 |
| App 注册、找回密码、安全验证码 | `no-reply@auth.dosorobotics.com` | 阿里云邮件推送 DirectMail，或独立事务邮件服务 |
| 认证邮件人工联系入口 | `support@dosorobotics.com` | 在模板文案中提供；若必须设置邮件头 `Reply-To`，使用 Send Email Hook 或服务商支持的实现 |
| 营销邮件 | `marketing@marketing.dosorobotics.com` | 未来独立发送子域和服务 |

不要把 Supabase Auth 直接接到普通员工邮箱的 SMTP 密码。事务邮件服务需要独立 SMTP 凭据、退信/投诉处理和发送子域，避免验证码邮件影响办公邮箱信誉，也避免办公账号泄露后获得批量发信能力。

### 为什么当前确认链接看起来失效

本次托管 Auth 日志给出的顺序是：

1. Supabase 从 `noreply@mail.app.supabase.io` 发出默认确认邮件。
2. 第一次访问 `/verify` 返回 303，并记录 `user_signedup`，说明一次性 token 已成功消费。
3. 随后浏览器被带到请求中的 `http://localhost:3000`；该地址只在开发电脑上有效。
4. 再次点击相同链接时，服务端找不到未使用 token，因此返回 403 和“链接无效或已过期”。

目标流程不依赖邮件链接：

`DOSO 注册页 → Supabase 生成 OTP → DirectMail 以 DOSO 域名发信 → 用户在 DOSO 验证页输入 8 位数字 → verifyOtp 完成确认`

App 的注册、重发、验证码校验、密码恢复页面和三套纯验证码模板已经实现，无需重写客户端认证逻辑。Supabase Site URL 已从 `localhost` 改为 `doso://auth/callback`；回跳白名单同时保留代码实际使用的 `doso://auth/callback`、`doso://auth/reset-password`，并加入精确的 `https://links.dosorobotics.com/auth/callback` 与 `/auth/reset-password`。OTP-only 主流程不依赖邮件链接；HTTPS 配置只有在 DNS、站点、AASA/assetlinks、正式签名和真机回调完成后才可视为生产可用。

用户确认的完整中英组合 Logo 继续原样保存在 `assets/brand/doso-robotics-logo-email.png`，其现有公网对象仍返回 HTTP 200，但文件为 866,228 字节且与参考稿的紧凑字标比例不同。2026-08-26 已从该正式资产提取透明背景的邮件专用横版字标 `assets/brand/doso-robotics-wordmark-email-29dea10fd204.png`：2172×724 RGBA PNG、196,202 字节，SHA-256 为 `29dea10fd2048cf016ddc9fa4bc9bafaf30ff891187e6f0fb09a8efea6a0de3c`。约 3:1 的横版比例适合模板头部 180×60 与页脚 120×40。11 份本地模板已统一引用待上传 URL `https://vchvqfdlkomlrjenkdhj.supabase.co/storage/v1/object/public/email-assets/doso-robotics-wordmark-email-29dea10fd204.png`，但截至 2026-10-13 公网实测仍为 HTTP 400，Storage 中只存在旧对象；因此真实邮件 Logo 破损的根因是新对象缺失，并非模板尺寸或本地文件损坏。**在控制台以禁止覆盖方式上传该文件，并回读确认 HTTP 200、`image/png`、196,202 字节及完整 SHA-256 一致前，线上 Logo 仍未修复，也禁止执行模板同步。** `--sync` 预检会在创建快照和 PATCH 前零写入阻断。生产邮件仍不使用本地路径、临时地址或 Base64 图片。

### 9 张参考图的实际落地边界

Supabase 官方模板变量没有登录时间、设备、地点或 IP。原生模板只能使用官方提供的 `Token`、`Email`、`NewEmail`、`OldEmail` 等变量；登录环境信息必须由 DOSO 后端从可信事件中获取，地点还需要独立 GeoIP 推导，不能在模板中编造。

| 参考用途 | 发送链路 | 当前状态 |
| --- | --- | --- |
| 异常登录提醒 | DOSO 自定义事务邮件 | HTML、outbox 与发送器完成；无可信风控信号，功能保持关闭 |
| 邮箱已修改通知 | Supabase `email_changed` 安全通知 | 本地模板和开关完成；待托管同步与真实投递 |
| 注销账户确认 | DOSO 自定义一次性确认流程 | HTML 与默认关闭的状态契约完成；安全令牌入口和删除执行器未启用 |
| 密码已修改通知 | Supabase `password_changed` 安全通知 | 本地模板和开关完成；待托管同步与真实投递 |
| 验证新邮箱 | Supabase `email_change` OTP | 本地模板完成；当前 App 尚无改邮箱入口 |
| 登录验证码 | Supabase `magic_link`/email OTP 共用模板 | 本地模板完成；当前 App 仍使用密码登录 |
| 新安装登录提醒 | DOSO 自定义事务邮件 | 首次 `user_id + installation_id` 判定、稳定 session installation ID、每用户 24 小时最多 3 封、幂等 outbox、worker 本地完成；文案明确为“客户端报告”，不声称识别真实物理设备，待托管部署 |
| 重置密码验证码 | Supabase `recovery` OTP | App 流程与本地模板已接入；待生产回读/投递复验 |
| 账户注销完成 | DOSO 自定义事务邮件 | HTML 和发送基础设施完成；真实注销执行关闭，所以不会提前发送“已注销” |

另外保留注册确认 `confirmation` 和敏感操作 `reauthentication` 两份现有 OTP 模板，所以仓库最终包含 7 份 Supabase 原生模板、4 份 DOSO 自定义模板，共 11 份 HTML。全部由 `scripts/build-email-template-suite.mjs` 统一生成；生成器还输出一个只读 TypeScript 运行时模板模块，所以 `email:check` 当前核对 13 个生成产物，避免 HTML 与 Edge Function 的主题、变量契约发生漂移。

### Supabase 接入顺序

1. ✅ DirectMail 已在华东 1（杭州）开通。
2. ✅ `auth.dosorobotics.com` 已添加，四条 DNS 记录均已保存并通过 DirectMail 验证。
3. ✅ SPF、DKIM、DMARC 和 MX 已配置；根域企业邮箱的 MX 和根域 SPF 未改动。
4. ✅ 触发邮件地址 `no-reply@auth.dosorobotics.com` 已创建且状态正常；SMTP 密码的历史控制台记录显示已保存，待本轮脱敏回读与真实投递。
5. 🟡 托管 Supabase 的 **Authentication > Emails > SMTP Settings** 已启用；密码由所有者确认已保存，但 2026-08-25 页面只读核对时 Sender email 与 Username 可见值为空，待本轮 `email:verify` 与真实投递。目标配置为：
   - Host：华东 1（杭州）为 `smtpdm.aliyun.com`；若开在其他区域，以 DirectMail 控制台 endpoint 为准
   - Port：`465`
   - Username：`no-reply@auth.dosorobotics.com`
   - Sender name：`DOSO`
   - Sender email：`no-reply@auth.dosorobotics.com`
   - Password：由项目所有者直接填入 Supabase Dashboard；安全要求是不复制到聊天、Git 或客户端
6. ✅ 仓库已生成 7 份 Supabase 原生 DOSO 模板，其中 5 份为纯验证码，2 份为密码/邮箱变更安全通知；4 份自定义事件模板和安全渲染模块也已生成。
7. 🟡 先运行 `email:verify` 保存本轮脱敏现状证据，再用仓库外 schema v2 快照执行 `email:sync`，回读确认 16 个字段；历史三模板记录不能证明新增字段已上线。
8. ✅ 2026-10-27 已向既有公开 `email-assets` Bucket 补齐196,202字节版本化邮件字标；匿名严格TLS GET及浏览器加载通过，完整SHA256与批准资产一致。QQ实际显示及其他网络仍待验，未同步托管模板；见本页最新补充。
9. 🟡 URL Configuration 的仓库配置已准备：Site URL 保留 `doso://auth/callback`；Redirect URLs 同时包含 `doso://auth/callback`、`doso://auth/reset-password`、`https://links.dosorobotics.com/auth/callback` 和 `https://links.dosorobotics.com/auth/reset-password`。待托管回读、DNS、回调站点、AASA/`assetlinks.json`、正式签名与真机验证。
10. 🟡 本地已建立服务端 outbox、首次新安装登录事件、DirectMail HTTPS worker、重试和死信；下一步是部署 migration/function，配置专用 RAM `dm:SingleSendMail` AccessKey、工作器 Secret 与受控调度。异常登录和注销仍按安全条件关闭。
11. 🟡 2026-08-26 全部 11 份模板预览均通过 TLS 1.3 与 SMTP AUTH，并获得 DirectMail `SMTP 250` 接受；`confirmation` 已有 QQ 手机端真实到达/可读证据，其余 10 份仍待收件箱或垃圾箱人工确认。后续还需完成 Gmail、Outlook/Hotmail、QQ/163 投递、DirectMail 发送详情和邮件原文检查。Provider 接受不代表已入箱。

### DirectMail 已验证的 DNS 记录

以下值已保存到阿里云 DNS，并在华东 1（杭州）DirectMail 控制台全部验证通过。

| 类型 | 主机记录 | 记录值 | 当前状态 |
| --- | --- | --- | --- |
| TXT（DKIM） | `aliyun-cn-hangzhou._domainkey.auth` | `v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCaqDvrDq1f9+mdbMWeIkbB6biAY6YwuTHkJ4Fh/1196Xb5l2+WpygANs3y3ElpPBLcW4aWh5ATVIl3s/+vQR53XHuvkZhZWksAjdJkLhamVmO1BdJD7ygEoE6n8GxeDPXXAhbR8yh3tT0drha2sdsJO+ogbMuqrlQSnHAdEdV4WQIDAQAB` | ✅ 验证通过 |
| TXT（SPF） | `auth` | `v=spf1 include:spf1.dm.aliyun.com -all` | ✅ 验证通过 |
| TXT（DMARC） | `_dmarc.auth` | `v=DMARC1;p=none;rua=mailto:dmarc_report@service.aliyun.com` | ✅ 验证通过 |
| MX | `auth` | `mx01.dm.aliyun.com` | ✅ 验证通过；阿里云 DNS 优先级 `1` |

这些记录属于 `auth.dosorobotics.com` 子域。DKIM 公钥和 DNS 策略记录不是密码，可以公开；SMTP 密码仍只能保存在 DirectMail、Supabase Dashboard 或受保护的 Secret 中。

Supabase Custom SMTP 没有独立的 `Reply-To` 配置项。若认证邮件必须带 `Reply-To: support@dosorobotics.com`，应使用 Send Email Hook 自行发送，或采用事务邮件服务明确支持且经过验证的实现方式。

SMTP 密码只能保存在 Supabase Dashboard、服务端 Secret 或受保护的 CI Secret；不得写入 Expo/React Native 代码、APK、Git 或任何 `EXPO_PUBLIC_*` 变量。

## ICP 备案：当前状态和修复方案

### 已完成

- 备案主体：上海穹沛科技有限公司。
- 主体备案号：`沪ICP备2025116222号`。
- 已备案网站：`inovaxio.com`，网站备案号 `沪ICP备2025116222号-1`，管局审核通过。

### 正在进行

备案控制台存在一笔 2026-07-16 创建的“有主体新增服务”订单，目前停留在阿里云初审退回状态。重新提交前应先通过手机验证进入订单详情，确认目标域名确实为 `dosorobotics.com`。

初审明确给出的三项修改意见：

1. **网站名称与主体关联不足**：原名称“大算机器人”与“上海穹沛科技有限公司”关联不明显。建议改为 `穹沛科技机器人` 或 `上海穹沛科技`；如果必须保留 DOSO/大算机器人名称，在网站备注中明确说明它是上海穹沛科技有限公司运营的机器人品牌或产品。
2. **负责人证件图片不合格**：重新上传证件原件的高清扫描件或实拍照片，画面完整、四角无缺失、文字可辨认，不使用截图、复印件翻拍或裁边图片。
3. **负责人电话未接通**：重新提交前确认备案负责人手机畅通、无陌生来电拦截，并能在阿里云初审期间及时接听核验电话。

### 推荐推进顺序

1. 手机验证后进入订单详情，确认域名、网站名称、负责人、云资源/备案服务码和联系方式。
2. 将网站名称改为与公司主体直接相关的名称，并在备注中说明 DOSO 品牌关系。
3. 上传合格的负责人证件原件照片。
4. 确认备案负责人能接听阿里云电话。
5. 检查全部字段后重新提交阿里云初审。
6. 初审通过后，在收到工信部短信的 **24 小时内**完成短信核验。
7. 等待管局审核；审核通过后再将官网域名解析到中国内地服务器并上线。
8. 网站上线后在页脚展示备案号并链接工信部备案系统；按要求继续完成公安联网备案。

企业邮箱的开通和日常收发不需要等待这笔网站备案通过；本次 ICP 流程主要决定 `dosorobotics.com` 官网或使用中国内地服务器的 App 后端能否合规上线。若官网仅部署在中国香港或海外节点，通常不以中国大陆 ICP 作为接入前置，但中国大陆访问质量、应用商店要求和长期合规仍需单独评估。

## 生产验收清单

### 企业邮箱

- [ ] `postmaster@dosorobotics.com` 已初始化并启用安全措施。
- [ ] 已分配首批 3 个成员/岗位邮箱。
- [ ] 外部邮箱能向 DOSO 邮箱发信，DOSO 邮箱也能正常回复。
- [ ] SPF、DKIM、DMARC 已从真实邮件原文验证。
- [ ] 域名和邮箱续费策略已确认。

### App 认证邮件

- [x] `auth.dosorobotics.com` 已在 DirectMail 中验证，四条 DNS 记录全部通过。
- [x] `no-reply@auth.dosorobotics.com` 已创建为触发邮件地址且状态正常。
- [ ] DirectMail SMTP 密码由所有者确认已设置；Supabase Custom SMTP 已启用，但需本轮 `email:verify` 确认密码非空、Sender email/Username 及其他安全字段符合预期，且不披露明文。
- [x] 已完成当前工作树与 Git patch 历史的已知格式凭据扫描：未发现 Aliyun AccessKey、Supabase JWT/secret key 等强特征候选；`test:config` 也确认受检客户端/模板/config 无字面 Secret。SMTP/Edge 凭据仍只允许进入受控 Secret。
- [ ] 用本轮 `npm run email:verify` 重新确认托管 7 份原生模板和 2 个安全通知开关；5 份 OTP 模板必须仍无验证链接。
- [x] 已创建公开 `email-assets` Bucket，旧版完整公司 Logo 可匿名访问。
- [ ] 以禁止覆盖方式上传 196,202 字节的 `doso-robotics-wordmark-email-29dea10fd204.png`，确认新公网 URL 为 HTTP 200、`image/png` 且 SHA-256 与仓库一致；完成前 `email:sync` 必须保持阻断。
- [ ] 仓库内 7 份原生 DOSO 品牌模板与托管配置的主题、正文长度、SHA-256 和通知开关已在本轮受控回读中一致。
- [x] 已提供统一生成器、Management API 本地检查、远端回读、schema v1/v2 安全快照、最小同步、严格回滚和 SHA-256 比对工具；不会输出或快照 SMTP/OAuth 秘密或完整 Auth 配置。
- [ ] 在受控终端临时注入 `SUPABASE_ACCESS_TOKEN` 后运行一次 `npm run email:verify`，留存脱敏 PASS/DIFF 结果。
- [ ] Supabase Site URL 与回跳白名单已在仓库准备为自定义 scheme 加两个精确 HTTPS 路径；待 `email:verify` 托管回读以及 DNS、`.well-known`、正式签名和真机回调验收后勾选生产完成。
- [ ] 注册、恢复和重新认证都能收到 8 位邮箱验证码，并由 App 完整输入与验证；MFA/TOTP 独立验收。
- [ ] 登录 OTP 和改邮箱 OTP 在对应 App 入口接入后完成生产测试。
- [ ] 密码/邮箱变更安全通知已在托管项目启用并完成真实投递。
- [x] 本地已实现首次新安装登录事件、稳定 session installation ID、每用户 24 小时 3 封上限、严格 worker 请求体、Provider 错误脱敏、幂等 outbox、lease/dispatch fencing、unknown/manual retry、死信和 DirectMail HTTPS worker；G015 后 fresh reset、目标 DB `74/74`、full DB `432/432` 已通过。
- [ ] 托管项目已部署 outbox migration 与 `account-email-worker`，并以最小权限 RAM AccessKey、工作器 Secret 和受控调度完成真实运行。
- [ ] 异常登录在可信风控信号接入后再启用；账户注销在数据处理清单和全部外部身份撤销适配完成后再启用。
- [ ] 60 秒重发限制、10 分钟失效和一次性使用均通过生产测试。
- [ ] Gmail、Outlook/Hotmail、QQ/163 的收件箱、垃圾箱和延迟已检查。
- [ ] 退信和投诉事件可监控、告警和处理。

### 备案与官网

- [ ] 新增服务订单已确认绑定 `dosorobotics.com`。
- [ ] 三项初审退回意见已全部修复。
- [ ] 工信部短信核验在 24 小时内完成。
- [ ] 管局审核通过后再解析到中国内地服务器。
- [ ] 官网页脚备案号和公安备案按要求展示。

## 相关文件与程序化验证

这几份文件的职责不同，不需要依赖 Supabase Dashboard 逐页检查：

| 文件 | 作用 | 对应托管字段 |
| --- | --- | --- |
| `supabase/templates/confirmation.html` | 注册确认验证码邮件正文 | `mailer_templates_confirmation_content` |
| `supabase/templates/recovery.html` | 密码重置验证码邮件正文 | `mailer_templates_recovery_content` |
| `supabase/templates/reauthentication.html` | 敏感操作重新认证邮件正文 | `mailer_templates_reauthentication_content` |
| `supabase/templates/magic_link.html` | 登录 OTP/Magic Link 共用正文（当前仅使用 OTP） | `mailer_templates_magic_link_content` |
| `supabase/templates/email_change.html` | 验证新邮箱 OTP 正文 | `mailer_templates_email_change_content` |
| `supabase/templates/password_changed_notification.html` | 密码已修改安全通知 | `mailer_templates_password_changed_notification_content` |
| `supabase/templates/email_changed_notification.html` | 邮箱已修改安全通知 | `mailer_templates_email_changed_notification_content` |
| `supabase/templates/custom/*.html` | 异常登录、新设备、注销确认和注销完成的后端邮件 | 不进入 Supabase Auth `/config/auth` |
| `scripts/build-email-template-suite.mjs` | 统一生成并 `--check` 11 份 HTML、自定义变量契约和 Edge 运行时模板模块 | 不直接写托管配置 |
| `supabase/functions/_shared/accountEmail.ts` | 自定义邮件类型/变量白名单、HTML 转义和 DOSO HTTPS URL 校验 | 服务端运行时边界 |
| `supabase/functions/_shared/aliyunDirectMail.ts` | 阿里云 DirectMail `SingleSendMail` RPC 签名和 HTTPS 适配 | 只从 Edge Secret 读取 RAM 凭据 |
| `supabase/functions/account-email-worker/index.ts` | 受 Secret 保护的 outbox claim/send/ack/retry/dead-letter 工作器 | 新 Edge Function，待托管部署 |
| `supabase/migrations/20260825070607_add_account_email_outbox.sql` | outbox、功能开关、租约 RPC 与默认关闭的注销状态契约 | 新迁移，待托管部署 |
| `supabase/config.toml` | 本地 Auth 基准；记录 7 份原生模板、通知开关、OTP 长度和有效期 | 7 个 `mailer_subjects_*`、7 个 HTML 字段和 2 个通知开关 |
| `docs/DOSO_EMAIL_DOMAIN.md` | 人可读的域名、企业邮箱、DirectMail、Supabase 和备案进度记录 | 不参与运行时发信 |
| `scripts/manage-auth-email-templates.mjs` | 本地校验、线上 GET 回读、仓库外安全快照、显式同步、严格回滚和哈希比对 | Supabase Management API `/config/auth` |

无需生产凭据即可执行静态检查：

```powershell
npm run test:config
npm run email:check
npm run email:test
npm run email:send-previews:test
npm run test:functions
npm run test:db
npm run typecheck
```

逐一向 QQ 测试邮箱发送 11 份模板时，使用安全 PowerShell 包装器。它只在当前进程内保存 SMTP 密码，每份模板单独连接和提交；中途失败会停在明确的模板 ID，可用 `-StartAt` 从该模板继续，避免整批重发造成重复邮件。预览 SMTP MIME 同时包含 `text/plain` 与 `text/html`；还可先把 11 份模拟数据 HTML/.eml 写到忽略提交的本地目录进行人工检查：

```powershell
npm run email:send-previews:secure

# 示例：检查 DirectMail 发送详情后，从指定模板继续
npm run email:send-previews:secure -- -StartAt recovery

# 只渲染、不连接 SMTP
npm run email:send-previews -- --dry-run --output-dir artifacts/email-previews
```

脚本要求显式输入授权测试收件邮箱，源码不保存真实收件人；所有主题和正文都带“DOSO 模板测试/模拟数据”标识。2026-08-26 已通过不可回显的 PowerShell 提示临时注入密码，向脱敏记录为 `995***531@qq.com` 的授权邮箱顺序提交 11 份预览；全部获得 `SMTP 250`，进程正常退出并清除了环境变量。该凭据没有写入 `.env` 或 Git，但曾进入聊天记录，因此必须在验收后立即轮换，并同步更新 Supabase Custom SMTP。

| 顺序 | 模板 ID | SMTP 结果 | Message-ID |
| ---: | --- | --- | --- |
| 1 | `confirmation` | `250 accepted` | `<doso-preview-1787710498535-1-252e85f9a382@auth.dosorobotics.com>` |
| 2 | `magic_link` | `250 accepted` | `<doso-preview-1787710509789-1-5577cb13d6e8@auth.dosorobotics.com>` |
| 3 | `recovery` | `250 accepted` | `<doso-preview-1787710520948-1-b8744d1f7907@auth.dosorobotics.com>` |
| 4 | `reauthentication` | `250 accepted` | `<doso-preview-1787710532246-1-5e18c59d26e7@auth.dosorobotics.com>` |
| 5 | `email_change` | `250 accepted` | `<doso-preview-1787710543224-1-ccaa3420bd02e@auth.dosorobotics.com>` |
| 6 | `password_changed` | `250 accepted` | `<doso-preview-1787710554105-1-9683211c4c81@auth.dosorobotics.com>` |
| 7 | `email_changed` | `250 accepted` | `<doso-preview-1787710569274-1-31ae5de5f68d@auth.dosorobotics.com>` |
| 8 | `anomalous_login` | `250 accepted` | `<doso-preview-1787710580287-1-67c6945a1103@auth.dosorobotics.com>` |
| 9 | `new_device_login` | `250 accepted` | `<doso-preview-1787710591254-1-c42563c0568d@auth.dosorobotics.com>` |
| 10 | `account_deletion_confirmation` | `250 accepted` | `<doso-preview-1787710602040-1-8ebfb0bbb959@auth.dosorobotics.com>` |
| 11 | `account_deleted` | `250 accepted` | `<doso-preview-1787710614952-1-15240a4458c5@auth.dosorobotics.com>` |

只读核对托管 Supabase 时，在当前 PowerShell 会话临时注入项目 ref 和 Management API 访问令牌。脚本只输出安全字段、长度和 SHA-256 摘要，不输出访问令牌、SMTP 密码、完整远端响应或完整 HTML：

```powershell
$env:DOSO_SUPABASE_PROJECT_REF = 'vchvqfdlkomlrjenkdhj'
$dosoSupabasePat = Read-Host '粘贴 Supabase PAT（输入不会显示或进入命令历史）' -AsSecureString
try {
  $env:SUPABASE_ACCESS_TOKEN = [System.Net.NetworkCredential]::new('', $dosoSupabasePat).Password
  npm run email:verify
  if ($LASTEXITCODE -ne 0) { throw 'email:verify failed' }
} finally {
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  $dosoSupabasePat.Dispose()
}
```

需要将本地原生模板套件同步到托管项目时，先把 `DOSO_RELEASE_EVIDENCE_ROOT` 显式设置为预先创建、可耐久保留且位于真实 Git worktree 根目录之外的发布证据目录；不得使用 `$env:TEMP`。脚本通过 `git rev-parse --show-toplevel` 和 `realpath` 确定边界；无法确定时写操作 fail closed。脚本在任何快照/PATCH 前先 GET：确认全部 11 个 Auth/SMTP 非敏感前置字段、`smtp_pass` 非空，并下载公网 Logo 与本地文件比较长度和 SHA-256；任一不符合即零写入。全部通过后才以排他方式保存 allowlist JSON 快照，再 PATCH 7 个主题、7 份 HTML 和 2 个通知开关。schema v2 快照只包含项目 ref、UTC、7 个主题、7 份 HTML、2 个布尔开关和整体 SHA-256，不包含 SMTP/OAuth secret：

```powershell
$env:DOSO_SUPABASE_PROJECT_REF = 'vchvqfdlkomlrjenkdhj'
if ([string]::IsNullOrWhiteSpace($env:DOSO_RELEASE_EVIDENCE_ROOT)) {
  throw 'DOSO_RELEASE_EVIDENCE_ROOT must name a durable release-evidence directory outside the Git worktree'
}
$dosoEvidenceRoot = [IO.Path]::GetFullPath($env:DOSO_RELEASE_EVIDENCE_ROOT)
if (-not (Test-Path -LiteralPath $dosoEvidenceRoot -PathType Container)) {
  throw 'DOSO_RELEASE_EVIDENCE_ROOT directory does not exist'
}
$dosoGitRootOutput = git rev-parse --show-toplevel
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($dosoGitRootOutput)) {
  throw 'cannot determine Git worktree root'
}
$dosoGitRoot = [IO.Path]::GetFullPath($dosoGitRootOutput.Trim())
$dosoRelativeToGit = [IO.Path]::GetRelativePath($dosoGitRoot, $dosoEvidenceRoot)
$dosoSeparator = [IO.Path]::DirectorySeparatorChar
$dosoEvidenceIsOutsideGit = $dosoRelativeToGit -eq '..' -or
  $dosoRelativeToGit.StartsWith("..$dosoSeparator") -or
  [IO.Path]::IsPathRooted($dosoRelativeToGit)
if (-not $dosoEvidenceIsOutsideGit) {
  throw 'DOSO_RELEASE_EVIDENCE_ROOT must be outside the Git worktree'
}
$dosoSnapshotName = "doso-auth-email-{0}-{1}.json" -f (
  (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'),
  [Guid]::NewGuid().ToString('N')
)
$dosoSnapshotPath = [IO.Path]::GetFullPath((Join-Path $dosoEvidenceRoot $dosoSnapshotName))
if (-not [IO.Path]::IsPathRooted($dosoSnapshotPath) -or (Test-Path -LiteralPath $dosoSnapshotPath)) {
  throw 'snapshot path must be a new absolute file'
}
$dosoSupabasePat = Read-Host '粘贴 Supabase PAT（输入不会显示或进入命令历史）' -AsSecureString
try {
  $env:SUPABASE_ACCESS_TOKEN = [System.Net.NetworkCredential]::new('', $dosoSupabasePat).Password
  npm run email:sync -- --snapshot $dosoSnapshotPath
  if ($LASTEXITCODE -ne 0) { throw 'email:sync failed' }
} finally {
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  $dosoSupabasePat.Dispose()
}
```

如果同步后回读出现差异、真实投递回归或需要恢复，使用同一个快照显式回滚。回滚是独立紧急路径：不加载当前本地模板或 Logo，不要求当前 `smtp_pass` 非空，也不做 SMTP/Logo 检查。脚本严格校验绝对路径在真实 Git worktree 根目录外、schema 版本、项目 ref、字段 allowlist 和 SHA-256；schema v2 只 PATCH 并回读比较 16 个字段。历史 schema v1 快照仍被严格接受，但只恢复当时记录的旧 6 字段，不会覆盖新增模板或通知开关：

```powershell
$env:DOSO_SUPABASE_PROJECT_REF = 'vchvqfdlkomlrjenkdhj'
$dosoSupabasePat = Read-Host '粘贴 Supabase PAT（输入不会显示或进入命令历史）' -AsSecureString
try {
  $env:SUPABASE_ACCESS_TOKEN = [System.Net.NetworkCredential]::new('', $dosoSupabasePat).Password
  node scripts/manage-auth-email-templates.mjs --rollback $dosoSnapshotPath
  if ($LASTEXITCODE -ne 0) { throw 'email rollback failed' }
} finally {
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  $dosoSupabasePat.Dispose()
}
```

快照应保留在受控发布目录直到真实投递验收完成；不要提交到 Git、粘贴到聊天或与日志归档混放。脚本拒绝覆盖既有快照，也拒绝 Git worktree 内（包括 `doso-app` 的父级仓库目录）、相对路径、错误项目、错误版本、未知字段或哈希被篡改的文件。常规验证/同步中的远端 `smtp_pass` 只转换为“非空/缺失”布尔状态，绝不参与比较、输出、快照或回滚 PATCH。

Management API 回读能证明线上模板已保存，但不能证明 DirectMail 最终投递或 Gmail、Outlook、QQ/163 的实际渲染；真实收件箱验收仍是最后一关。

启动本地 Supabase 后，先重置本地数据库以应用迁移和 seed，再从 `supabase status -o env` 临时注入本地测试变量。注意：`db:reset` 会清空并重建本地 Supabase 数据。

```powershell
npm run supabase:start
npm run db:reset

$dosoLocalEnv = @{}
npx supabase status -o env | ForEach-Object {
  if ($_ -match '^([A-Z0-9_]+)=(.*)$') {
    $dosoLocalEnv[$matches[1]] = $matches[2].Trim().Trim('"')
  }
}
$env:SUPABASE_URL = $dosoLocalEnv['API_URL']
$env:SUPABASE_PUBLISHABLE_KEY = if ($dosoLocalEnv['PUBLISHABLE_KEY']) {
  $dosoLocalEnv['PUBLISHABLE_KEY']
} else {
  $dosoLocalEnv['ANON_KEY']
}
$env:SUPABASE_SERVICE_ROLE_KEY = $dosoLocalEnv['SERVICE_ROLE_KEY']
$env:MAILPIT_URL = if ($dosoLocalEnv['MAILPIT_URL']) {
  $dosoLocalEnv['MAILPIT_URL']
} else {
  $dosoLocalEnv['INBUCKET_URL']
}

npm run test:auth
npm run test:pkce
```

当前 OTP-only 模板下，`test:pkce` 会验证恢复 OTP、改密和重新认证；只有模板实际包含验证 URL 时，脚本才会进入 PKCE 回跳分支。本地 Mailpit 验证只证明模板和 Auth 流程可用，不能替代公网 DNS、SMTP 信誉和真实邮箱投递验收。

## 开源项目参考

以下项目只用于借鉴 OTP、认证安全和邮件模块组织方式，不替换 DOSO 现有的 Supabase Auth，也不作为整套系统迁移目标：

- [Supabase 官方 Next.js User Management 示例](https://github.com/supabase/supabase/tree/master/examples/user-management/nextjs-user-management)：参考 Supabase Auth、SSR 客户端、RLS 和迁移组织。
- [Cal.com](https://github.com/calcom/cal.com)：参考直接展示验证码的认证邮件和独立邮件模块。
- [Next.js SaaS Starter](https://github.com/nextjs/saas-starter)：参考 RBAC、审计、输入校验和上线检查。
- [Dub](https://github.com/dubinc/dub) 与 [Midday](https://github.com/midday-ai/midday)：参考邮件服务边界、限流、队列、日志和通知偏好。Dub 使用 AGPL 许可证，仅借鉴思路，不把其代码复制到闭源 DOSO 代码库。

## 官方参考

- [阿里企业邮箱免费版说明](https://help.aliyun.com/zh/document_detail/446177.html)
- [阿里云企业邮箱与邮件推送的区别](https://help.aliyun.com/zh/direct-mail/differences-between-directmail-and-alibaba-mail)
- [阿里云 ICP 备案申请概述](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)
- [使用阿里云企业邮箱的备案说明](https://help.aliyun.com/zh/icp-filing/basic-icp-service/product-overview/use-ali-cloud-enterprise-email)
- [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Management API：读取 Auth 配置](https://supabase.com/docs/reference/api/v1-get-auth-service-config)
- [Supabase Management API：更新 Auth 配置](https://supabase.com/docs/reference/api/v1-update-auth-service-config)
- [Supabase Management API：认证方式](https://supabase.com/docs/reference/api/getting-started)
- [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Native Mobile Deep Linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Supabase Free 项目邮件模板变更](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
- [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- [Supabase Auth Audit Logs](https://supabase.com/docs/guides/auth/audit-logs)
- [Gmail 发件人指南](https://support.google.com/mail/answer/81126)
- [DOSO 账户安全邮件 outbox 生产部署 Runbook](./runbooks/ACCOUNT_EMAIL_OUTBOX_DEPLOYMENT.md)
- [DOSO 联网后端部署指南](./NETWORK_BACKEND.md)
