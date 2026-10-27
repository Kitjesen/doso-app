# DOSO 管理控制台

这是一个无构建依赖的静态管理端。它使用管理员自己的 Supabase 邮箱/密码登录，只把会话保存在当前标签页的 `sessionStorage` 中，并通过管理员 JWT 调用 `admin-users` 和 `admin-devices` Edge Functions。

## 安全边界

- 只能配置 Supabase URL 和 **publishable/anon key**。
- 严禁把 `service_role`、secret key、SMTP 密码或数据库密码放进 `config.js`、浏览器存储或网页源码。
- service role 只能存在于 Supabase Edge Function 的服务端环境变量中。
- 管理员密码只发送到 Supabase Auth；本页面不会保存密码。
- access token 与 refresh token 仅存在 `sessionStorage`，关闭标签页后自动清除；点击退出也会清除。
- 生产环境必须使用 HTTPS；配置页只允许 HTTPS 项目根地址，HTTP 仅允许 `localhost`、`127.0.0.1` 和 `[::1]` 本地回环地址。通过 `DOSO_ALLOWED_WEB_ORIGINS` 同时允许正式 App Web 与管理端 Origin；管理员强制启用 MFA。Edge Function 仍需在服务端验证 JWT、管理员角色/MFA 等级和每个动作的权限，不能依赖前端隐藏按钮。
- 管理端在登录后解析由 Supabase Auth 签发的 JWT `aal` claim；只有 `aal2` 会话才会加载管理数据。Edge Functions 必须独立验证 JWT 签名并再次强制 `aal2`，前端检查不是授权边界。
- 建议把管理端放在独立域名（如 `admin.doso.example`），启用 CSP、HSTS、访问日志和企业身份代理/IP 白名单。

## 配置与运行

1. 修改 `config.js` 中的公开配置：

   ```js
   window.DOSO_ADMIN_CONFIG = Object.freeze({
     supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
     publishableKey: 'sb_publishable_...',
   });
   ```

   也可以保留为空，在登录页临时输入。临时配置只保存在当前标签页。

2. 从 `admin` 目录启动任意静态服务器，不能直接双击 `index.html`（ES modules 通常会被浏览器的 `file:` 安全策略阻止）：

   ```bash
   npx serve .
   ```

3. 在 Supabase Edge Function CORS 配置中允许该管理端的 HTTPS Origin。

## Edge Function 请求契约

管理端发送 `POST /functions/v1/{name}`，带 `Authorization: Bearer <管理员 access token>`、`apikey: <publishable key>` 和 JSON 请求体。

`admin-users`：

- `list_users`: `{ action, page, perPage, search }`
- `set_status`: `{ action, userId, status: "active" | "suspended", reason }`
- `send_password_reset`: `{ action, userId, reason }`
- `global_signout`: `{ action, userId, reason }`
- `set_role`: `{ action, userId, role: "user" | "support" | "admin", reason }`
- `list_user_terminals`: `{ action, userId }`
- `list_user_identities`: `{ action, userId }`
- `verify_username`: `{ action, userId, reason? }`（仅管理员；通过 service-role RPC 记录人工核验，不直接修改 `profiles`）
- `revoke_user_terminal`: `{ action, userId, terminalId, reason }`
- `list_audit_logs`: `{ action, page, perPage, targetUserId? }`

`admin-devices`：

- `list_devices`: `{ action, page, perPage, search }`
- `create_inventory`: `{ action, modelCode, displayName, serialNumber, category, environment }`
- `rotate_binding_code`: `{ action, deviceId, expiresInMinutes, code? }`
- `unbind`: `{ action, deviceId, reason }`

分页列表响应包含对应数组（`users` / `devices` / `auditLogs`）和 `pagination.total`。`list_users` 的 `profile` 包含 `username`；账号列表以用户名为主信息、邮箱为副信息，搜索同时匹配用户名和邮箱。该目录仅由要求管理员/支持角色、活跃管理终端和 AAL2 的 Edge Function 提供，普通用户不能直接访问。设备入库不会自动生成绑定码，管理端随后单独调用轮换接口；轮换成功只返回一次 `{ bindingCode, expiresAt }`，数据库只能保存不可逆哈希。

角色修改按钮只在服务端权限探测确认当前账号为 `admin` 后显示，`support` 不显示。当前管理员不能修改自己的角色；角色变更需要重新选择目标角色、填写审计原因并在确认对话框二次确认。后端的 `set_role` 权限、自改限制和审计仍是最终安全边界。

“登录方式”同样是 `admin` 专属的只读详情：Edge Function 通过 service-role RPC `admin_list_user_identities` 返回 `registry_id`、`provider_key`、类型、邮箱验证状态、绑定/Provider 最近登录/最近观察/解绑时间和状态。管理端不会请求或展示第三方 subject、哈希、provider token、`identity_data` 或其他原始身份标识，目前也不提供绑定/解绑按钮。

`send_password_reset` 不信任 `profiles.email`。Edge Function 会通过 Supabase Auth Admin API 重新读取目标 Auth user，只有 Auth 中存在非空邮箱且 `email_confirmed_at` 已设置时才发送；纯社交账号、空邮箱或未验证邮箱会稳定返回 HTTP 409 / `verified_email_required`。

可用以下命令校验静态请求/响应 fixture 与管理端适配器：

```bash
node admin/contract.test.mjs
```

401 会触发一次 refresh token 刷新，刷新失败即退出；403 会显示无权限错误。所有危险操作要求输入原因，并应由 Edge Function 以追加方式写入不可由客户端删除的审计日志。

## 管理员 MFA step-up 契约

邮箱密码登录返回 AAL1 会话时，管理端不会调用任何管理 Edge Function，而是执行以下 Supabase Auth 官方 TOTP 流程：

1. 先调用 `account-sessions` 的 `register` action，登记当前 Supabase `session_id` 对应的网页终端。请求体为 `{ action: "register", installationId, platform: "web", deviceLabel, appVersion }`。标签页级 installation ID 保存在 `sessionStorage`。
2. `GET /auth/v1/user`，使用当前 access token 验证会话并读取 `user.factors`，只展示 `factor_type = "totp"` 且 `status = "verified"` 的因子。
3. `POST /auth/v1/factors/:factor_id/challenge` 创建 challenge。
4. `POST /auth/v1/factors/:factor_id/verify`，请求体为 `{ challenge_id, code }`。
5. 使用 verify 响应中的新 access/refresh token 替换当前 `sessionStorage` 会话，确认新 JWT 的 `aal` 为 `aal2`，再幂等调用一次 `account-sessions/register`，最后才进入控制台。

静态契约测试覆盖入口顺序：`login → register_terminal → validate_session → mfa_challenge → mfa_verify → register_terminal → admin`。`account-sessions/register` 是唯一允许 AAL1 bootstrap 的 Edge Function；`admin-users` 和 `admin-devices` 仍必须在服务端同时验证活跃终端与 AAL2。

若账号没有已验证的 TOTP 因子，控制台会阻止进入并要求管理员先在受信任的账号安全流程注册。本控制台故意不调用 MFA enroll、不展示二维码，也不接收或展示 TOTP secret。

首位管理员由项目所有者在 Supabase SQL Editor 中一次性把已确认邮箱的 `profiles.app_role` 设置为 `admin`，随后该用户必须先登录 DOSO App，在“账号与安全 → 管理员身份验证器”完成 TOTP 注册。后续角色变更全部通过管理端并写入审计日志。

## 部署前检查

- 管理员账号已确认邮箱并绑定 MFA；服务端强制验证 AAL2。
- 管理员角色保存在受保护的服务端表/自定义 claim 中，普通用户无法自行修改。
- Edge Functions 对 `Origin`、HTTP method、payload schema、角色、目标资源和限流进行验证。
- 暂停账号先在数据库事务中阻断 DOSO 访问、撤销终端并写审计，再同步 Supabase Auth ban；恢复时先解除 Auth ban，再恢复 DOSO 访问。跨系统同步失败会保持安全侧状态，并返回可重试的 `reconciliationRequired` 状态。管理员按用户“全局下线”受 Supabase 公共 Admin API 限制，保证的是 DOSO RLS/Edge Function 立即阻断；不能宣称可按 user id 单独删除全部内部 Auth session。
- 密码重置只发送 Auth 重置流程；任何管理员都不能读取用户密码。
- 当前追加式审计记录成功的管理动作、管理员、目标、原因、时间、请求标识和 `success` 结果，且禁止 update/delete。失败/拒绝事件与来源 IP 需由 Supabase/网关访问日志补齐，本仓库不能宣称已写入业务审计表。
- 已验证备份、告警、密钥轮换与管理员离职回收流程。
