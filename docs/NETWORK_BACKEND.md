# DOSO 联网后端部署指南

## 2026-10-26 独立国内环境准备

G20/电脑对原项目 Auth 和会话地址的 TLS 握手重置仍未修复；本轮准备了官方稳定 self-hosted/v0.8.3 的源码锁、下载校验工具及仅公开 HTTPS 的 DOSO overlay，未部署或切换原服务。详细步骤、阿里云托管候选、邮箱 OTP、SQL/Functions 依赖与保留原账号的迁移门已归入[量产目录的后端部署文档](production/DOSO_BACKEND_DEPLOYMENT.md)。下文历史全量命令不适用于此次独立环境迁移，原有候选权限部署门保持。

## 2026-10-17 本地门禁收口与审批范围更新（本轮未重查云端）

总发布门已接入资料保存安全回归、profile升级暂存检查和门禁自身合同测试；旧full gate的数据库必选项未移除。已执行的15项本地合同/暂存测试在恢复时核对身份一致，没有重复运行；原静态基线保留，文档更新后的静态复验见`closure-baseline-final.json`，runner绑定修正前的结果另存、不计测试项。这些结果不是完整数据库升级、真实Storage或生产部署通过。

**两份候选不能被当作仅资料头像变更来批准。** 后一份Auth-session迁移会替换共享`private.is_session_active()`及终端登记，影响设备、终端/审计、用户名/登录方式、机器人命令及头像等现有入口。独立源码审查未确认SQL越权缺陷，但部署范围仍为`COMMENT_DEPLOYMENT_SCOPE_BLOCK`；完整跨域拒绝/零副作用、权限矩阵、Supabase升级/pgTAP、实际Storage/JWT及回退门禁未关闭。详情及下一项本地负例见`docs/runbooks/PROFILE_UPGRADE_TEST_GATE.md`。任何生产执行仍需范围清楚的明确批准，不执行下文全量命令来绕过门禁。

下文结构观测来源仍为历史只读结果`2026-10-16T20:49:18.706Z`，不是本轮重新查询。不得把缺少对象的历史记录扩称今天的实时状态；本轮没有云查询/写入或环境重试。证据：`artifacts/release-readiness/20261017-profile-release-gate/integration.json`。

本文把当前本地 Supabase 后端迁移到托管 Supabase。完成本文不等于已经上线：公网项目、域名、SMTP、Android 正式签名和生产凭据必须由 DOSO 的实际所有者提供。

## 当前资料与头像部署门（2026-10-17 只读核验）

当前项目的结构核验未找到资料编辑的3个新增字段、`update_my_profile`、头像清理RPC、退休路径表及5条头像策略；`profile-avatars`桶也未返回记录。现有`is_session_active`存在不证明新增Auth-session联合门已上线；`avatar_url`仍有authenticated直接UPDATE权限，这只是权限事实，不是跨账号绕过的证明。固定查询见 `supabase/verification/profile_editing_readonly_preflight.sql`，观察及查询上下文限制见 `artifacts/release-readiness/20261017-profile-cloud-preflight/cloud-observation.json`。

本地候选 `20261012090000_add_profile_editing.sql` 与 `20261016155923_require_auth_session_authority.sql` **未获本轮生产部署授权**。完整baseline/upgrade数据库测试、真实Storage HTTP/字节生命周期和安全审查仍是发布门；合成PostgreSQL通过、对象存在或单个函数的权限检查不能替代这些验收。按已审查依赖先部署并验收SQL联合门，再部署shared Edge auth及只读注销预览，不能倒序假定数据库具备新保证。到实际部署时还需范围明确的用户批准，不得把定时推进或下文通用CLI示例当作授权。

**不要为了接通资料头像直接执行下文的全量 `db push` / functions deploy。** 先确认具体迁移/函数清单、备份与回退边界，保留现有账号、用户名、头像和权限数据；不临时放宽RLS、改公共头像桶或把service key交给客户端。

本轮新增 `supabase/verification/local/auth_session_avatar_recovery.test.sql`，已在任务隔离的PostgreSQL17.11中一次执行通过：有效旧会话退休对象→Auth session删除后旧claims无法读取/上传/prepare/删除/挂接且状态保留→同owner新注册有效会话可以接续删除、不可复用退休path、新path可上传挂接。runner要求实际psql exit0、末尾marker和12份输入哈希一致；owned集群已停止，独立`pg_ctl status`返回3且PG进程0。迁移候选本身未改，这只是补充SQL/RLS恢复覆盖，不是线上故障修复、真实JWT/Storage HTTP或物理文件删除证明。完整pgTAP/升级与实际Storage门仍未关闭。

## 1. 生产结构

- Expo App 只保存 Supabase 的 HTTPS 项目地址和 publishable key。
- Supabase Auth 管理密码散列、注册验证码、密码重置和登录会话；任何后台页面都不能读取用户密码。
- PostgreSQL + RLS 保存用户、登录终端、机器人设备和审计数据。
- Edge Functions 执行需要服务端权限的会话和管理员操作。`SUPABASE_SERVICE_ROLE_KEY` 只存在于托管函数环境，不进入 App、网页或 Git。
- 邮件由已验证发件域名的 SMTP 服务商发送。

## 2. 先准备真实资源

需要以下资源，缺少任何一项都只能完成本地验收：

1. 一个 DOSO 组织拥有的 Supabase 项目。
2. 一个实际拥有并能修改 DNS 的域名，例如 `doso.example`。
3. SMTP 服务商账户，以及已验证的发件地址，例如 `account@doso.example`。
4. App 的正式 Web 地址，例如 `https://app.doso.example`。
5. Android 正式签名密钥和 Google/应用商店发布账户。
6. 管理员使用的 TOTP 身份验证器；管理 API 不接受只有密码的 `aal1` 会话。

“注册 DOSO 后缀邮箱”有两层含义：

- 用户用现有邮箱注册 DOSO 账户：Supabase Auth 已负责这一层。
- 创建 `name@doso.example` 邮箱：必须先购买域名，并在 Microsoft 365、Google Workspace、腾讯企业邮、阿里企业邮等邮件托管商创建邮箱。Supabase 不负责创建或托管收件箱，只负责发送认证邮件。

## 3. 连接托管 Supabase 并部署

在 PowerShell 中设置当前终端的临时变量。不要把真实值写进仓库：

```powershell
$env:DOSO_SUPABASE_PROJECT_REF = '替换为项目 ref'
npx supabase login
npx supabase link --project-ref $env:DOSO_SUPABASE_PROJECT_REF
npx supabase db push --linked
npx supabase functions deploy --project-ref $env:DOSO_SUPABASE_PROJECT_REF
```

托管 Edge Functions 自动获得 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY`。前端不得读取后者。自定义服务端密钥使用函数 Secret：

```powershell
npx supabase secrets set DOSO_ALLOWED_WEB_ORIGINS=https://app.doso.example,https://admin.doso.example --project-ref $env:DOSO_SUPABASE_PROJECT_REF
npx supabase secrets list --project-ref $env:DOSO_SUPABASE_PROJECT_REF
```

`DOSO_ALLOWED_WEB_ORIGINS` 是逗号分隔的完整 Origin 白名单；必须同时包含 App Web 和管理员 Web。原生 App 请求通常没有 `Origin`，仍可使用 Bearer Token。不要把 SMTP 密码做成 `EXPO_PUBLIC_*` 变量。

Edge Functions 在未配置该白名单时默认拒绝所有带 `Origin` 的浏览器请求，不会返回通配符 CORS。仅本地开发临时需要接受任意浏览器 Origin 时，才可在本地函数环境显式设置 `DOSO_ALLOW_ALL_WEB_ORIGINS_FOR_LOCAL_DEV=true`；生产环境不得设置此变量。即使开启，本地响应也会回显具体 Origin，不使用 `*`。无 `Origin` 的原生 App 请求不受此开关影响。

## 4. Auth、HTTPS 与回跳地址

在 Supabase Dashboard 的 **Authentication > URL Configuration** 中设置：

- Site URL：`https://app.doso.example`
- Redirect URLs（逐条精确添加）：
  - `doso://auth/callback`
  - `doso://auth/reset-password`
  - `https://app.doso.example/auth/callback`
  - `https://app.doso.example/auth/reset-password`

原生 App 的 `doso://` 地址保留现有 PKCE 深链回跳；Web 使用 HTTPS 回跳。生产环境不要沿用 `localhost`、`127.0.0.1` 或宽泛的 `/**` 通配符。

在 Auth 设置中同时确认：

- 邮箱确认开启。
- 最短密码 10 位，包含大小写字母和数字。
- 邮件 OTP 长度 8 位、有效期 600 秒、重发间隔 60 秒；MFA/TOTP 使用独立契约。
- Access JWT 有效期设为 1800 秒；如果安全策略更严格可设为 900 秒，不要超过 1800 秒。保持 refresh token rotation 开启。
- 启用 TOTP MFA 的 Enrollment 与 Verification。`admin-users`、`admin-devices` 必须在 `aal2` 会话下调用；只输入邮箱密码不能进入管理后台。
- 首位管理员先在 DOSO App 的“账号与安全”中注册身份验证器，再登录独立管理端完成 TOTP challenge；管理端不会展示或重新生成 TOTP secret。

首位管理员 bootstrap：先注册并确认普通账户，再由项目所有者在 Supabase SQL Editor 中执行一次受控的 `profiles.app_role = 'admin'` 更新；该用户随后必须回到 DOSO App 注册管理员身份验证器。不要用客户端 metadata 或 APK 内常量授予管理员权限。

托管 Supabase 项目地址自带 HTTPS，例如 `https://PROJECT_REF.supabase.co`。如使用 Supabase Custom Domain，先完成 DNS 验证，再把 App 环境变量切到新的 HTTPS API 域名。

## 5. SMTP 与 DOSO 发件域名

在 DNS 提供商和 SMTP 服务商完成以下设置：

1. 验证发件域名。
2. 添加服务商给出的 SPF 和 DKIM 记录。
3. 添加 DMARC；初期可用监控策略，稳定后逐步收紧。
4. 若 DOSO 还要接收邮件，再配置邮件托管商给出的 MX 记录。仅发送验证码不等于拥有收件箱。
5. 在 SMTP 服务商关闭营销邮件的链接跟踪，避免认证链接被改写。

在 Supabase Dashboard 的 **Authentication > Emails > SMTP Settings** 中开启自定义 SMTP。DOSO 当前推荐值如下，实际用户名必须与 DirectMail 控制台创建并验证的发信地址完全一致：

- Host：华东 1（杭州）为 `smtpdm.aliyun.com`；其他区域使用 DirectMail 控制台给出的 endpoint
- Port：`465`
- Username / Sender email：`no-reply@auth.dosorobotics.com`
- Sender name：`DOSO`
- Password：DirectMail 控制台单独设置的 SMTP 密码

当前线上 SMTP 与三套模板仅能表述为：历史控制台记录显示已保存；待本轮 `email:verify` 与真实投递。`email:verify` 会检查 `smtp_pass` 非空，但永不比较、回显或持久化密码；公开 Logo URL 的 HTTP 200、PNG 类型、长度与 SHA-256 则由工具在本轮实时验证。

SMTP 密码只填入 Dashboard，不写入 `.env.example`、客户端构建参数或 Git。2026-06-03 后创建的 Free 项目使用 Supabase 默认 SMTP 时不能自定义 Auth 邮件模板；必须先启用 Custom SMTP，才能把托管项目切换到本仓库的 DOSO OTP-only 模板。

生产验收必须使用至少两个非项目管理员邮箱测试，因为 Supabase 默认邮件服务不适合面向真实用户发送邮件。

## 6. 上传 OTP 邮件模板

本仓库的模板只显示 `{{ .Token }}`，不会把验证码、TokenHash 或 ConfirmationURL 放进 URL。这样可避免邮件安全扫描器提前消费认证链接。

当前托管项目曾发送 Supabase 默认确认链接。Auth 日志显示第一次访问已经返回 303 并完成确认，而该验证请求记录的开发回跳配置是 `http://localhost:3000`，因此在其他设备上看起来像“打不开”；链接是一次性的，第一次被用户或邮件安全扫描器消费后，再次访问会返回 `Email link is invalid or has expired`。切换下列 OTP-only 模板后，用户无需点击邮件链接，只在 DOSO 自己的验证页面输入托管项目当前配置的 8 位邮箱验证码。

Dashboard 可直接复制：

- Confirm signup：`supabase/templates/confirmation.html`
- Reset password：`supabase/templates/recovery.html`
- Reauthentication：`supabase/templates/reauthentication.html`

也可以使用仓库内的 Management API 工具上传，无需在 Dashboard 逐份复制。先做无需凭据的本地检查：

```powershell
npm run email:check
```

再在当前 PowerShell 会话临时设置 Management API 访问令牌。`email:verify` 只执行 GET 回读和脱敏哈希比对；令牌不要保存到仓库：

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

只有只读结果显示 `DIFF`、本地模板已审阅且确实要更新生产时，才运行同步。先把 `DOSO_RELEASE_EVIDENCE_ROOT` 显式设置为预先创建、可耐久保留且位于真实 Git worktree 根目录外的发布证据目录；不得使用 `$env:TEMP`。`email:sync` 使用该目录下尚不存在的唯一绝对文件；脚本用 `git rev-parse --show-toplevel` 与 `realpath` 再次确定边界，无法确定时 fail closed。之后先 GET、确认 SMTP 密码非空、安全创建 allowlist JSON 快照并自校验，才最小 PATCH 六个邮件字段并回读：

```powershell
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
npm run email:sync -- --snapshot $dosoSnapshotPath
if ($LASTEXITCODE -ne 0) { throw 'email:sync failed' }
```

同步后若回读失败或真实投递回归，使用同一快照回滚。它是独立紧急路径，不读取或校验当前本地模板与 Logo，也不要求当前 `smtp_pass` 非空：

```powershell
node scripts/manage-auth-email-templates.mjs --rollback $dosoSnapshotPath
if ($LASTEXITCODE -ne 0) { throw 'email rollback failed' }
```

快照只允许包含 schema 版本、项目 ref、UTC、三个主题、三份 HTML 和整体 SHA-256；不包含 SMTP/OAuth secret。回滚会严格校验绝对路径在真实 Git worktree 根目录外、schema、项目 ref、字段 allowlist 和哈希，只 PATCH 六字段，随后仅用一次 GET 严格比较这六字段。快照应在受控发布目录保留到真实投递验收结束，不得提交 Git；脚本拒绝覆盖既有文件。

不要把 `GET /config/auth` 的完整响应写入日志或文件，也不要把完整 GET 响应原样 PATCH 回去；其中可能包含 SMTP 或第三方登录的敏感配置。生产写入必须保持为上述六个邮件字段的最小 PATCH。

## 7. App 生产环境变量

从 Supabase Dashboard 的 Connect/API Keys 页面复制 **publishable key**，再为正式构建设置：

```text
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_URL_ANDROID=https://PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=项目的 publishable key
EXPO_PUBLIC_APP_VERSION=0.0.1
```

检查 APK/网页构建产物中不存在 `service_role`、SMTP 密码、Management API token 或私钥。publishable key 允许公开，但数据库仍必须由 RLS 和服务端授权保护。

## 8. 上线验收清单

### 注册与密码

- [ ] 新邮箱注册后收到 8 位邮箱验证码，邮件不包含可直接认证的 token URL。
- [ ] 60 秒内不能重复发送；验证码在 10 分钟后失效；验证码只能使用一次。
- [ ] 未验证邮箱不能登录。
- [ ] 密码重置验证码可用，完成重置后旧会话按产品策略失效。
- [ ] 错误提示不泄露邮箱是否已注册。

### 登录终端与后台

- [ ] App 能看到当前终端和其他终端，当前终端标识准确。
- [ ] “退出指定终端/其他终端/全部终端”在刷新后仍然生效。
- [ ] 管理员接口拒绝普通用户；成功的管理动作产生不可变审计记录。失败/拒绝请求与来源 IP 由 Supabase/网关访问日志覆盖。
- [ ] 管理员的 `aal1` 请求返回 `mfa_required`；输入已注册 TOTP 后升级为 `aal2` 才能执行管理动作。
- [ ] service-role key 未出现在 App、浏览器、日志、仓库或构建产物中。

### 网络与邮件

- [ ] App 所有生产 API 地址均为 HTTPS。
- [ ] 生产 Redirect URL 为精确白名单，原生 PKCE 深链和 Web HTTPS 回跳均通过。
- [ ] SPF、DKIM、DMARC 验证通过；验证码邮件在主流邮箱无明显退信/垃圾箱问题。
- [ ] Edge Functions 已部署，未带 JWT 的请求返回 401，越权请求返回 403。
- [ ] JWT 有效期 15–30 分钟，refresh token rotation 已开启。

### 发布

- [ ] 数据库迁移、RLS 测试、Auth 测试、配置测试、TypeScript 类型检查全部通过。
- [ ] APK 使用 DOSO 正式签名，不是 debug 签名。
- [ ] 完成备份、日志告警、SMTP 配额和回滚方案检查。

## 9. 官方参考

- [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Local email template configuration](https://supabase.com/docs/guides/local-development/customizing-email-templates)
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Free 项目邮件模板变更](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
- [Mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Managing Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Deploying Edge Functions](https://supabase.com/docs/guides/functions/deploy)
