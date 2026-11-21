# DOSO 社交登录接入说明

DOSO 的 Apple、微信和 QQ 登录入口默认关闭。只有客户端、第三方开放平台和 Supabase 全部配置并通过真机测试后，才启用对应的 `EXPO_PUBLIC_*_AUTH_ENABLED` 开关。

## 安全边界

- `EXPO_PUBLIC_*` 会被打包进 APK/IPA，只能保存公开标识、公开回调地址和功能开关。
- Apple `.p8`、微信 AppSecret、QQ AppKey、Supabase secret/service-role key 只能保存在第三方控制台或服务端密钥存储中。
- 微信/QQ 的 `openid` 仅在对应应用或连接范围内有效。身份键必须使用 Authing 向 Supabase 输出的稳定 `sub`，不能使用昵称、头像、手机号或空邮箱推断身份。

## 用户名与首次登录门禁

- DOSO 的唯一、规范用户名是 `profiles.username`，`profiles.display_name` 和社交平台昵称都不是身份键。
- `username_claimed_at` 是服务端维护的认领标记。社交用户首次创建时由数据库生成临时唯一用户名，`username_claimed_at` 保持为空。
- App 恢复社交会话后必须先读取 profile。若 `username_claimed_at IS NULL`，进入用户名认领页，并通过一次性用户名认领 RPC 写入最终用户名。
- 认领成功后必须重新读取 profile；只有确认 `username_claimed_at` 已写入，才允许加载或操作设备。
- 不得用邮箱前缀、Apple 姓名、微信/QQ 昵称自动认领用户名，也不得让客户端直接更新认领标记。
- 发布顺序必须是数据库优先：先部署并验证 `username_claimed_at` 与 `claim_username(text)`，再发布包含门禁的新客户端，最后才开启任何社交 Provider。旧 schema 与新客户端不得并存。

## Apple 登录

Apple 登录采用 [A 方案决策](./APPLE_AUTH_OPTION_DECISION.md)：iOS 使用 Expo 原生 Apple 授权，Android 与 Web 统一使用 Supabase Apple OAuth、系统浏览器和既有 PKCE 回调。客户端不配置 Services ID 或 Apple Return URL；这些只存在于 Apple Developer 与 Supabase Dashboard。

iOS 每次请求生成彼此不同的密码学随机 raw nonce 与 state，传给 Apple 的 nonce 是 raw nonce 的 SHA-256，Supabase ID-token 交换使用 raw nonce。首次非空姓名在交换前按 Apple subject 哈希键暂存于 SecureStore；social auth 在终端登记前不读取 RLS profile、更不写 profile。AuthContext 以 user ID + session preparation generation 组成不透明 ready key，只在终端登记和 profile load 对当前 ticket 成功后发布；旧 prepare、旧 heartbeat 和同一用户的旧 session 都不能提交状态。App 在 ready key 匹配后完成显式恢复探测，探测完成前阻止用户名/设备路由，并用 RLS-scoped `profiles.update(...).eq('id', expectedUserId)` 保存。SecureStore 中恢复的候选必须在保存或跳过时成功删除才算消费；即使同时存在更优先展示的内存姓名，只要探测确认持久记录存在，删除失败就必须保留确认页。若登录时 SecureStore 写入失败且探测未发现持久记录，纯内存候选仍可显示和保存/跳过，其清理仅 best-effort，不会把已认证会话困在错误页。账号切换不会清除另一个 result-session 用户的候选，也不会串写。新用户随后继续用户名门禁，已认领用户继续主流程。

正式启用前：

1. 在 Apple Developer 为 `com.doso.robot` 开启 Sign in with Apple，准备 Team ID、Services ID、Key ID 和 `.p8`。
2. 在 Supabase Authentication → Providers → Apple 启用 provider。Client IDs 首项填写 Services ID，随后填写 `com.doso.robot`。
3. Apple Services ID 的 Domain 配置为 `vchvqfdlkomlrjenkdhj.supabase.co`，Return URL 配置为 `https://vchvqfdlkomlrjenkdhj.supabase.co/auth/v1/callback`。
4. iOS 工程启用 Sign in with Apple capability；Android/Web 由 Supabase Provider 使用同一个 Services ID，无客户端 Services ID 环境变量。
5. 真机测试通过后设置 `EXPO_PUBLIC_APPLE_AUTH_ENABLED=true`，并重新构建 App。

Apple client secret 有有效期，必须使用安全保存的 `.p8` 定期轮换。Supabase Apple Client IDs 的首项必须是 Services ID，随后才是 `com.doso.robot` Bundle ID。

App 使用 Expo revoke listener，并在 iOS 启动/回到前台时按 Apple identity 的 `identity_data.sub` 检查 credential state。`REVOKED`、`NOT_FOUND`、`TRANSFERRED` 走既有终端撤销/会话退出链路；模拟器、不支持和查询错误只记为 unknown，不会误退出。

登录时使用的 Apple 授权码不等同于账号删除时所需的授权撤销能力。正式提供删除账号前，后端必须独立实现令牌托管流程：接收一次性授权码、在服务端与 Apple 交换令牌、加密保存撤销所需凭据，并在删除阶段调用 Apple 撤销接口。验收还必须覆盖 Apple credential state、用户在系统设置中撤销授权、App 收到凭据撤销事件后的会话处理。详见 [Supabase Apple 登录](https://supabase.com/docs/guides/auth/social-login/auth-apple)。

## 微信与 QQ：Authing OIDC broker

微信和 QQ 不是 Supabase 内置 provider。DOSO 使用 Authing 把两种身份标准化为 OIDC，再由 Supabase 统一签发业务会话：

```text
DOSO App → Supabase Custom OIDC Provider → Authing OIDC 应用
         → 微信或 QQ 身份源 → Authing OIDC 身份 → Supabase 会话
```

首发采用 [Authing B 方案](./AUTHING_PROVIDER_OPTION_DECISION.md)：在同一 Authing 用户池中创建两个社会化连接，并分别准备只开放单一连接的 OIDC 应用。单个 `custom:authing` 再靠连接参数分流的 A 方案仅是实验候选；客户端不会发送未经真实 tenant 证明可穿透 Supabase 的连接 query 参数。

| App 入口 | Authing 连接 | Supabase Provider | 客户端公开变量 |
| --- | --- | --- | --- |
| 微信 | 微信移动应用 | `custom:wechat` | `EXPO_PUBLIC_WECHAT_SUPABASE_PROVIDER` |
| QQ | QQ | `custom:qq` | `EXPO_PUBLIC_QQ_SUPABASE_PROVIDER` |

### 开放平台准备

- 微信：完成移动应用审核，取得 AppID/AppSecret；配置 Android 包名与发布签名、iOS Bundle ID 与 Universal Link；在 Authing 创建“微信移动应用”连接。开放平台回调使用 Authing 连接页给出的地址。
- QQ：完成 QQ 互联应用审核，取得 AppID/AppKey；配置 Android 包名与发布签名、iOS Bundle ID 与平台要求的回调；在 Authing 创建 QQ 连接。开放平台回调使用 Authing 连接页给出的地址。

### Authing → Supabase

微信和 QQ 分别执行：

1. 创建 OIDC 应用，启用授权码模式和 PKCE `S256`，scope 至少包含 `openid profile`。
2. 将每个应用限制为对应的单一社会化连接；首发不依赖客户端授权参数分流。
3. 在 Supabase Custom Providers 新建 OIDC provider，分别使用 `custom:wechat`、`custom:qq`，填写 Authing Client ID、Client Secret 和 Issuer。
4. 将 `https://vchvqfdlkomlrjenkdhj.supabase.co/auth/v1/callback` 加入 Authing 回调白名单。
5. 确认 `{issuer}/.well-known/openid-configuration` 可访问、issuer 精确匹配、`sub` 稳定，authorization/token/JWKS 均为 HTTPS；必须支持 `code`、PKCE `S256`、RS256，并在 JWKS 发布带 `kid` 的 RS256 RSA 签名键。
6. 微信/QQ 没有可信邮箱时启用 `email_optional`，不得生成 `openid@doso` 一类假邮箱。

首发身份隔离合同更严格：Authing 账号关联/字段匹配关闭，scope 精确为 `openid profile`，两个 Supabase Provider 均配置 `email_optional=true`。微信与 QQ 不因相同邮箱、昵称或手机号自动合并；canary 一旦返回 verified email 必须 `BLOCKED` 并经过身份关联评审。`custom:wechat` 和 `custom:qq` 各自与批准 issuer 不可变绑定；issuer 变更必须使用新 provider key 并制定身份迁移/重新认证方案，不能原地复用 identifier。验收证据只保存脱敏 issuer fingerprint、provider key、subject hash 和 DOSO user ID。

App 只在系统浏览器中完成授权，禁止内嵌 WebView。QQ 当前定义为系统浏览器授权 PoC，不等同于“原生 QQ SDK”。当前 `preferEphemeralSession: false` 用于保留常规 SSO；双 Provider 仅隔离 route，并不隔离系统浏览器 cookie。不能用这一架构推断账号切换安全，也不能只在 iOS 强制 ephemeral 来掩盖 Android 不具备同等保证的问题。Authing PoC 必须在两个平台真机验证：两个图标是否稳定直达正确连接；取消后重试；切换微信/QQ 账号；浏览器 cookie 是否错误复用旧账号；退出 DOSO 后第三方 session 是否导致静默登录到错误账号；同一设备连续登录不同账号是否隔离。

客户端共享纯路由核心会把缺失/非法 Provider、微信与 QQ route 相同（`provider-route-collision`）以及与数据库 canonical key 不一致（`provider-route-mismatch`）作为稳定 blocker。微信只能生成 `custom:wechat`，QQ 只能生成 `custom:qq`，且 OAuth options 精确为 `redirectTo` + `skipBrowserRedirect: true`。可用真实 tenant 时，先设置服务端测试环境的 `AUTHING_WECHAT_ISSUER`、`AUTHING_QQ_ISSUER`，再运行 `npm run authing:verify-live-oidc`；该命令不读取 client secret，也不进入默认离线 release gate。

验证通过后重新构建：

```env
EXPO_PUBLIC_WECHAT_AUTH_ENABLED=true
EXPO_PUBLIC_WECHAT_SUPABASE_PROVIDER=custom:wechat
EXPO_PUBLIC_QQ_AUTH_ENABLED=true
EXPO_PUBLIC_QQ_SUPABASE_PROVIDER=custom:qq
```

## 账号关联与无邮箱账号

- 接受 Supabase 对“相同且已验证邮箱”的自动身份关联，行为以 [Supabase Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking) 为准。
- 上一条不适用于首发微信/QQ broker：这两条渠道明确禁止跨渠道自动合并，并以 `openid profile` + `email_optional=true` 运行；任何 verified email 输出先阻断并评审，不能直接触发关联。
- App 禁止根据未验证邮箱、空邮箱、昵称、头像或手机号自行合并用户；空字符串不能作为邮箱身份键。
- 手动绑定/解绑暂缓上线。Supabase 手动 identity linking 仍是 Beta；只有在定义真实的 recent-auth/提供商重新认证协议、通过功能审批并验证解绑后仍有可用登录方式后，才允许启用。
- 无邮箱的社交账号不能使用邮件重置密码或邮件密码变更。必须先完成已验证邮箱登记，或通过原社交 provider 重新认证；不得用假邮箱补齐流程。

### 外部身份注册表与管理摘要

- `private.account_identities` 由 `auth.identities` 的数据库触发器维护。它只保存稳定 provider key、subject 的 SHA-256 和时间/状态字段，不保存原始 subject、`identity_data`、authorization code 或 provider token。
- 捕获异常采用 fail-open：外部身份摘要同步失败时记录数据库 warning，但不能阻断 Supabase Auth 的正常注册或登录；service-role reconciliation RPC 用于修复漂移。
- 对单个用户的修复通过管理员 Edge Function `admin-users` 的 `reconcile_user_identities` action 触发。该 action 仅允许 DOSO `admin` 角色，内部使用 service-role 调用 `admin_reconcile_user_identities(uuid)`；成功和失败都会写入 `audit_logs`，数据库失败也会返回 RPC 错误并写 Postgres warning，便于告警与重试。
- reconcile 是幂等的：仍存在于 `auth.identities` 的身份保留原始 `linked_at`；只有 Auth 已不存在的活跃投影会被 tombstone。运维定时任务如需批量修复，应从受控服务逐用户调用上述 Edge action/RPC，不得把 service-role key 放入 App 或浏览器，也不得读取或记录原始 subject、`identity_data` 或 provider token。
- App 的“账户安全”和管理端“登录方式”只能读取安全摘要字段：provider 类型、邮箱是否验证、关联/最近登录/最近观测时间和状态。
- provider token 与 provider refresh token 在 Supabase Session 写入本地存储前会被递归移除；Supabase 自身的 access/refresh session token 保留用于会话恢复。
- 首发不提供手动绑定/解绑按钮；数据库解绑记录仅用于反映 Supabase Auth 的真实身份状态与审计。

## 回调与功能开关

回调链路：

1. 微信/QQ 开放平台 → Authing：使用每个社会化连接详情页的 callback URL。
2. Authing → Supabase：使用 `https://vchvqfdlkomlrjenkdhj.supabase.co/auth/v1/callback`。
3. Apple → Supabase：使用同一个 Supabase HTTPS callback。
4. Supabase → 移动 App：生产版使用 `https://links.dosorobotics.com/auth/callback`；密码恢复使用 `https://links.dosorobotics.com/auth/reset-password`。Web 使用当前部署站点经过严格验证的同源 `/auth/callback`，即使移动 Link origin 同时存在也不能覆盖 Web origin。每个 Web origin 的精确 callback 必须加入 Supabase Redirect URLs。`doso://` 私有 scheme 继续用于本地开发，不作为生产信任声明。

客户端已具备的本地声明：

- `EXPO_PUBLIC_AUTH_LINK_ORIGIN=https://links.dosorobotics.com` 时，注册、社交登录和密码恢复优先生成 HTTPS 回调；变量若不是纯 HTTPS origin（例如含路径、查询、片段、账号或密码），客户端会明确报错，不会静默降级使用错误地址。
- iOS Expo 配置声明 `applinks:links.dosorobotics.com`；Android Expo 配置与生成的 Manifest 都声明 `autoVerify`，并且仅匹配 `/auth/callback`、`/auth/reset-password`。
- Supabase 本地配置已列出上述两个精确 HTTPS Redirect URL；托管项目仍需在 Authentication → URL Configuration 中加入同样的两个精确地址。
- 每个正式 Web 部署还需在 Supabase Redirect URLs 单独加入该站点的精确 `https://<web-origin>/auth/callback`；禁止通配任意 origin。`links.dosorobotics.com` 浏览器兜底页仍不得交换、读取或转发 authorization code。

### 仍需在域名与开放平台完成的关联证明

仓库中的自包含部署根 `link-host/` 会从部署环境注入的真实公开签名身份生成 `.well-known` 文件；`scripts/build-auth-link-site.mjs` 只是本地 npm 命令的薄包装。缺少或错误的 Team ID、证书 SHA-256 会使构建失败，仓库自带 QA/debug 证书也会被拒绝。以下内容依赖正式签名，必须在外部准备完成后再发布：

1. `https://links.dosorobotics.com/.well-known/apple-app-site-association`：无重定向、正确 JSON Content-Type，`appID` 使用真实的 `<APPLE_TEAM_ID>.com.doso.robot`，components 仅授权两个回调路径。
2. `https://links.dosorobotics.com/.well-known/assetlinks.json`：`package_name` 为 `com.doso.robot`；Play 渠道使用 Play Console 的 app-signing certificate SHA-256，其他渠道使用该渠道用户实际安装包的签名指纹；不能使用 upload/debug/QA 证书指纹代替 Play 的 app-signing 指纹。
3. DNS、TLS、CDN/源站配置完成后，分别用 Apple CDN/AASA 检查、Android Digital Asset Links API 和真机 `adb shell am start` 验证域名归属及精确路由。
4. Apple Team ID、生产 Android 证书、微信/QQ 审核资料仍是外部阻塞项。在这些证明与真机 E2E 完成前，Apple/微信/QQ Provider 和三个客户端功能开关保持关闭。

构建与部署链接站点：

```powershell
$env:DOSO_APPLE_TEAM_ID = '<真实 10 位 Team ID>'
$env:DOSO_ANDROID_APP_LINK_FINGERPRINTS = '<生产证书 SHA-256；多个值用逗号分隔>'
npm run auth-links:test
npm run auth-links:build
# 部署 link-host/ 后：
npm run auth-links:verify-deployment -- https://links.dosorobotics.com
```

浏览器兜底页只存在于两个精确路径。若已落到网页，它会立即从地址栏清除查询参数和片段，只显示重新打开官方 App 并重试的说明；页面不会构造 `doso://` 链接，也不会读取、展示、交换或向其他 origin 发送回调内容。Verified Universal/App Links 仍是唯一生产回 App 路径。

必须明确区分浏览器与边缘网络：查询参数会先到达 Vercel edge，随后页面脚本才能清理浏览器历史；URL fragment 不会随 HTTP 请求发送。生产回调查询只允许 Supabase PKCE 的短时、一次性 authorization code，不得放 access token、refresh token 或其他长期凭据。正式启用前必须审查并配置 Vercel Request Logs、Log Drain/导出、可观测性与保留周期，确保回调查询值不被留存或已可靠脱敏；浏览器清理不能代替边缘日志治理。

在 Supabase/Authing 服务端关闭 provider 可立即阻止新登录。`EXPO_PUBLIC_*_AUTH_ENABLED` 是构建期变量：关闭后必须重新构建并发布客户端，图标才会隐藏或禁用；在接入远程配置前不能承诺客户端即时隐藏。

生产容量与 kill switch 也属于上线门禁：当前 Supabase Free 容量按最多 3 个 Custom Provider 核对，B 占 2 个；上线前必须盘点现有名额。Authing 需至少 2 个社会连接和 2 个自建 OIDC 应用，套餐、配额和价格按上线时官方信息复核，不在仓库硬编码。事故处置顺序为“Supabase 禁 Provider → Authing 禁连接/应用 → client flags 下版”。这只能阻止新登录，不能撤销已有 DOSO sessions；严重事故还要生成受影响 identity 摘要清单，并执行 terminal/session 撤销 runbook。

## 账号删除

账号删除必须是服务端分阶段、可重试且幂等的流程。当前内容仍是设计约束：没有删除入口、后台执行器或删除账本接线，也没有部署或执行任何账户、对象、外部身份删除。

1. 验证当前用户与 Auth session，完成必要的重新认证和明确确认，并创建 owner-scoped 的持久化幂等操作。
2. 在 profile 和头像引用仍存在时，通过经过审查的 server-only 事务/锁协议冻结账户、禁止新增头像/命令写入，并将已知引用写入独立持久化清理账本；不能先做未设门禁的快照再冻结，留下并发上传逃出清单的窗口。普通 `profile_avatar_retirements` 只用于资料编辑并发保护，不是耐删除、耐重试的账户删除账本。
3. 标记 `account_status='deleting'` 的同一受审查冻结协议还须衔接终端、会话和云端命令权限撤销；通过单独的 Storage API 核对当前头像、已退休路径与 owner 下的孤立对象。在途上传/保存必须先有确定结果或可恢复的持久记录，再完成最终清单核对；数据库锁或一次空清单都不证明在途请求已取消。不得发送机器人运动指令。
4. 按产品已批准的策略处置实体机器人归属，再撤销 Apple/Authing 外部身份；绑定机器人时是阻断、解绑还是进入人工审核目前仍未决定，不能自动选择。
5. 根据持久化快照通过 Storage API 清理头像对象并记录每个结果。超时、格式异常或其他未确认响应必须保留为 `unknown`，不能自动重发、清除账本或误报完成；直接删除 `storage.objects` 元数据不算对象清理，元数据为空也不能声称底层物理字节已验证擦除。
6. 只有前序阶段及已批准的留存处理均确认后，才调用 `auth.admin.deleteUser`。最终结果必须区分 pending、blocked、unknown 和 completed。

顺序不能简单互换：先标记 `deleting` 或撤销当前会话，会让普通用户态 profile cleanup 和 `revoke_all` 失去 active account/session 权限；先删除 Auth 用户又会通过外键级联删除 profile 与 retirement 引用，使头像清理债务失去依据。因此这些步骤必须由持久化的 server-only 删除作业协调，不能由 App 串联现有用户态接口。

删除用户前必须按已批准策略处理设备，或确保设备外键使用 `ON DELETE SET NULL`；不得让 `ON DELETE CASCADE` 删除实体设备/库存记录。头像清理响应的本地严格验证证据位于 `artifacts/release-readiness/20261017-avatar-cleanup-proof/`，它不是云端删除、物理字节擦除或完整账户删除通过证明。

## 上线验证

静态 wiring 检查只能证明变量、provider 名称、回调处理和按钮代码存在，不能证明登录安全或第三方配置有效。上线还必须完成：

- 行为测试：用户名门禁不可绕过，认领成功后重新加载 profile，再加载设备；无邮箱账号不会进入邮件找回流程。
- 集成测试：Supabase 自动关联只发生在相同已验证邮箱；空/未验证邮箱不会被 App 合并；provider 禁用后新登录立即失败。
- 真机 E2E：Apple、微信、QQ 的首次/重复登录、取消、拒绝、回调失败、断网、退出、重启恢复、账号切换和错误 session 复用。
- 安全测试：PKCE/state/nonce、回调劫持、解绑后登录能力、Apple credential revoke、两阶段删除与失败重试。
- 发布检查：APK/IPA、source map、构建日志和 Git 历史中不存在 `.p8`、AppSecret、AppKey 或 Supabase 高权限密钥。
- Android `release` 不再使用 debug keystore。发布签名只从 CI/受控终端的 `DOSO_ANDROID_KEYSTORE_PATH`、`DOSO_ANDROID_KEYSTORE_PASSWORD`、`DOSO_ANDROID_KEY_ALIAS`、`DOSO_ANDROID_KEY_PASSWORD` 读取；缺少任一项时 release task 会明确失败。密钥文件和密码都不得提交。
- Android 正式输出任务还会强制 `EXPO_PUBLIC_AUTH_LINK_ORIGIN=https://links.dosorobotics.com`；缺失或错误时直接失败，不会把正式包静默降级到 `doso://`。iOS 正式包使用 `eas build --platform ios --profile production`，同一 Expo config plugin 会在 production profile 的 prebuild 阶段执行相同门禁。
- 本地/模拟器使用 `cd android && .\\gradlew.bat assembleQa`；EAS 内测使用 `eas build --platform android --profile qa`，该 profile 精确绑定 `:app:assembleQa`。它使用 debug 签名并带 `.qa` application ID 后缀，不得向开放平台登记。当前 `qa` profile 只作为 Android 内测通道；iOS 若要与商店版并存，需先增加独立 `.qa` bundle identifier 与对应签名配置。
- 正式 Android 交付优先生成 Play/商店使用的 AAB：`cd android && .\\gradlew.bat bundleRelease`。`DOSO_ANDROID_*` 配置的是上传 AAB 的 upload key；启用 Play App Signing 后，用户从 Play 安装的 APK 会由 Play 的 app-signing key 签名，两者通常不是同一张证书。
- `assetlinks.json` 必须登记 Play Console 中 app-signing certificate 的 SHA-256，而不是本地 upload key 或 QA/debug key。微信/QQ 应登记实际分发渠道安装包使用的签名；若国内商店或官网包使用不同证书，需要分别登记支持的签名或统一渠道签名策略，并分别做真机回调验证。

## 官方参考

- [Supabase Apple 登录](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Supabase Expo/React Native 社交登录 quickstart](https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth)
- [Supabase Custom OAuth/OIDC Providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)
- [Supabase Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase Native Mobile Deep Linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Authing 微信移动应用登录](https://docs.authing.cn/v2/guides/connections/social/wechat-mobile/)
- [Authing QQ 登录](https://docs.authing.cn/v2/reference/sdk-for-ios/social/tencent.html)
- [微信开放平台移动应用微信登录](https://developers.weixin.qq.com/doc/oplatform/Mobile_App/WeChat_Login/Development_Guide.html)
- [QQ 互联文档](https://wiki.connect.qq.com/qq%E7%99%BB%E5%BD%95)
