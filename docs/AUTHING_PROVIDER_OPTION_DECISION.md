# Authing Provider 路由决策

状态：选择 **B** 作为首发方案；A 仅保留为实验候选，不进入当前发布。

## 方案矩阵

| 方案 | Authing / Supabase 拓扑 | 客户端路由 | 结论 |
| --- | --- | --- | --- |
| A | 单个 Authing OIDC 应用 + 单个 `custom:authing`，依靠未验证的连接参数分流 | 微信、QQ 共用 Provider | 实验/阻塞。当前 Supabase identity registry 不能从相同 provider key 可靠区分两个产品入口，且尚未证明 Authing 参数能穿透 Supabase。 |
| B | 两个只开放单一社会化连接的 Authing OIDC 应用 + `custom:wechat` / `custom:qq` | 微信只发 `custom:wechat`；QQ 只发 `custom:qq` | **首发选择。** 与数据库 canonical provider key 和审计摘要一一对应，无客户端私有连接参数。 |

## B 的不可变合同

- 每个 Authing OIDC 应用只开放对应连接，不能落入连接选择页。
- 微信配置必须规范化为 `custom:wechat`，QQ 必须规范化为 `custom:qq`。缺失、格式错误、相同 route 或对调/改名均 fail-closed，不做 fallback。
- 客户端只向 `signInWithOAuth` 传 `redirectTo` 和 `skipBrowserRedirect: true`；不添加未经真实 tenant 验证的 Authing connection query 参数。
- 两个应用使用 `authorization_code` + PKCE `S256`，scope 至少包含 `openid profile`；邮箱不可用时在 Supabase Custom Provider 启用 `email_optional`，不能制造假邮箱。
- Supabase callback 是 `https://vchvqfdlkomlrjenkdhj.supabase.co/auth/v1/callback`。授权必须使用系统浏览器，禁止内嵌 WebView。
- Authing discovery 的 issuer 必须精确匹配，authorization/token/JWKS 端点必须为 HTTPS，ID token 必须支持 RS256，JWKS 必须发布带 `kid` 的 RS256 RSA 签名键。
- QQ 首发是“系统浏览器中的 QQ 授权 PoC”，不是 QQ 原生 SDK 集成；只有真机证据证明体验与账号隔离后才能改变该表述。
- 当前浏览器会话保留 SSO（`preferEphemeralSession: false`）。双 Provider 只隔离服务端 route，不等于隔离系统浏览器 cookie；不能据此宣称账号切换已解决。不得为了规避验证而只在 iOS 改成 ephemeral，因为 Android 没有同等保证且会破坏既有 SSO。连接选择、退出后重登和 A→B 账号切换必须由两个平台真机证明。

## 身份隔离与 issuer 绑定

- 微信/QQ 首发默认不做跨渠道自动合并。Authing 的账号关联和字段匹配保持关闭，两个应用只申请 `openid profile`，Supabase 两个 Custom Provider 均设置 `email_optional=true`。不得生成假邮箱，也不得用昵称、手机号或空邮箱匹配账号。
- Canary 若从微信/QQ broker 收到 verified email，结果必须记为 `BLOCKED`，先审查 Authing 映射、上游真实性和 Supabase identity linking 影响，不能直接放量。
- `custom:wechat`、`custom:qq` 分别与批准的 Authing issuer 不可变绑定。更换 issuer 时不得原地复用旧 identifier；必须建立新 provider key、执行身份迁移/重新认证方案并完成审计后再切换。
- 身份映射证据只保存脱敏 issuer fingerprint、provider key、subject hash 与 DOSO user ID；不得保存原始 subject、token、code 或 client secret。

## 容量与事故开关

- 当前 Supabase 项目/组织按 Free 容量规划，官方当前上限为 3 个 Custom Provider；B 固定占用 2 个。上线前必须列出现有 Provider 并确认至少有两个名额，套餐或官方限额变化时重新核对，不能假定永远可用。
- Authing tenant 必须至少支持 2 个社会化连接和 2 个自建 OIDC 应用。具体套餐、配额和价格在上线前按 Authing 当期官方信息复核，文档不硬编码价格。
- Kill switch 顺序：先在 Supabase 禁用受影响 Custom Provider，阻止新 DOSO 登录；再在 Authing 禁用对应连接/应用；最后把对应客户端 feature flag 设为 `false` 并发布新版本。客户端开关不是即时远程开关。
- 禁用 Provider 不会撤销已经签发的 DOSO session。严重身份事故还必须导出受影响的 identity 摘要清单，按 terminal/session 撤销 runbook 逐用户撤销会话和终端，并保留脱敏审计证据。

## 回滚与启用

A 只有在独立安全评审证明连接参数可端到端保留、identity subject 仍可区分、两端真机矩阵达到 B parity 后，才可重新立项。正式启用 B 前还必须完成真实 Authing tenant、微信/QQ 开放平台审核、Supabase 两个 Custom OIDC Provider、容量核对、正式签名包与 iOS/Android 真机 E2E。仓库中的三个社交登录开关在这些门禁通过前保持 `false`。
