# 账号登录 IP 自查 API

文档核对：2026-11-12。本页描述 DOSO App 当前源码中的账号登录 IP 记录与本人查询合同。源码已完成，**尚未部署到托管或生产环境**；本页的本地测试结果不代表线上接口已经可用。

## 适用范围

账号安全页允许已登录用户查看自己的登录时间和认证服务记录的 IP。用户不能提交、修改或查询其他账号的记录。登录 IP 是账号安全信息，与机器人 MQTT 接入 IP、GNSS 位置和平台内部地址分别保存、分别授权。

该接口不授予设备归属、云端管理、远程运动控制、机器人采集或 MQTT 访问权限；查看本人记录也不会自动开启机器人云连接。

## 接口入口

统一使用已认证的 `account-sessions` Edge Function：

```text
POST /functions/v1/account-sessions
Authorization: Bearer <Supabase access token>
Content-Type: application/json
```

函数还接受 `GET` 作为已有终端列表的默认读取入口。登录 IP 操作使用 `POST` JSON action；请求必须携带有效用户会话。匿名请求、过期会话和被撤销会话由认证层拒绝。

### 记录当前登录会话

```json
{ "action": "capture_login" }
```

客户端只能发送 action。函数使用认证上下文中的 `caller.user.id` 和当前 JWT `session_id` 调用服务端专用 `capture_account_login` RPC。RPC 在 `auth.sessions` 中按用户和会话 ID读取认证服务保存的 `created_at` 与 `ip`，再以 `account.login` / `account_login` 写入 `audit_logs`。同一 `session_id` 重复调用是幂等的，不会重复写入。

响应：

```json
{ "recorded": true }
```

会话不存在或不属于当前账号时返回 `recorded: false`；RPC 不接受 `p_ip` 或任何客户端提供的 IP 参数。App 在认证完成、终端登记后尝试调用该 action；记录失败不会阻断登录，后续新的登录流程仍会尝试补写。

### 读取本人登录历史

```json
{ "action": "list_login_history" }
```

函数按当前认证用户过滤 `target_user_id`，不接受 `userId`、账号邮箱或设备 ID。结果按登录时间倒序返回，最多 50 条：

```json
{
  "records": [
    {
      "id": 123,
      "loggedInAt": "2026-11-12T03:20:10.000Z",
      "ipAddress": "203.0.113.10",
      "method": null
    },
    {
      "id": 122,
      "loggedInAt": "2026-11-11T08:05:00.000Z",
      "ipAddress": null,
      "method": null
    }
  ]
}
```

`ipAddress` 未被认证服务记录时为 `null`，App 显示“未记录”；不得用客户端请求头、设备自报值、地点或 GeoIP 猜测补齐。`method` 当前保留为 `null`，不能把它解释成邮箱、Apple 或其他登录方式。响应不包含 Auth token、session ID、内部代理地址、审计 metadata 或其他账号的记录。

App 的 `listLoginRecords()` 对返回记录执行类型校验；账号安全页只读显示时间和 IP，并提供刷新与错误重试。该读取属于安全页查询，客户端等待超过 15 秒会显示可重试的读取超时，不自动重放写入。

## 可信 IP 来源与代理要求

IP 真值来自认证服务保存的 `auth.sessions.ip`，而不是 App 的 body 或未清洗的 `X-Forwarded-For`。生产部署必须满足以下顺序：

1. 只允许受控反向代理进入 Auth/Functions，禁止客户端绕过代理直连内部 Envoy、GoTrue 或函数容器。
2. 代理链必须覆盖客户端自带的 `X-Forwarded-For`，只向上游传递经核验的客户端地址；不能直接使用 `$proxy_add_x_forwarded_for` 保留未经信任的前缀。
3. GoTrue 的 forwarded-for 读取方式、代理跳数和 TLS 终止位置必须与实际拓扑一致，并用真实请求验证普通请求、伪造 XFF 和绕过代理三种结果。
4. 来源无法核验时保存 `null`，不把代理地址、内网地址或猜测地点当成用户 IP。

当前仓库中的 Nginx 模板已覆盖 `X-Forwarded-For` 与 `Sb-Forwarded-For`，并将 API 网关限制在 loopback；可信代理链的真实拓扑、端到端公网验证和部署后的 Auth 会话 IP 读回仍未完成。因此“源码已完成”不等于“生产记录可信”。

## 与机器人 MQTT IP 分离

账号登录 IP 表示认证会话建立时由认证服务记录的访问来源。机器人 MQTT IP 表示 Broker 看到的已认证设备 socket peer，可能是 NAT、VPN 或设备代理出口。两者不共用字段、表或查询 action：

- 本 API 只返回当前账号的 `account.login` 记录。
- MQTT 连接 IP 需要由 Broker 连接事件按设备证书身份记录；当前机器人连接 IP 采集仍未完成。
- MQTT 出口 IP 不能反推登录地点、账号身份或 GNSS 位置；账号登录 IP 也不能用于 SSH、设备寻址或远程控制。

## 数据边界与已知限制

- 当前查询固定最多 50 条，没有分页或时间范围参数；更长历史需另行设计并保持本人过滤。
- 认证服务没有记录 IP 时保留 `null`，不返回伪造或过期地址。
- 登录记录以 session ID 幂等写入；令牌续期不会自动生成新的登录事件。首次登录、会话续期和最近活动不是同一事实。
- 退出或撤销终端不会因为本 API 自动删除已经写入的登录安全记录；保留和账号删除遵循现有账号数据规则。
- `method` 尚未由认证成功边界填充；UI 目前显示通用“登录”。
- `auth.sessions.ip` 取决于部署时可信代理链。当前代理配置存在 XFF 信任边界待收紧的问题，未完成修正前不能将 IP 当作已验证的地理或异常风险结论。
- 该功能没有新增安全邮件、GeoIP/ASN 定位、异常登录判定或告警规则。

## 验证与发布状态

已核对的源码事实：迁移 `supabase/migrations/20261112020000_add_login_history.sql`、函数 `supabase/functions/account-sessions/index.ts`、App 的 `sessionService.ts`、`AuthContext.tsx` 与 `AccountSecurityScreen.tsx` 已使用同一 action 和字段合同；静态函数检查要求服务端从 `auth.sessions` 取 IP、拒绝客户端 `p_ip`/`ipAddress`，并限制为本人历史。

本地 Node 回归：

```powershell
node --test --test-timeout=15000 scripts/session-service-response.test.mjs scripts/account-security-navigation.test.mjs
```

本次运行 46/46 通过。该命令覆盖账号安全页读取/显示/错误反馈和会话服务响应边界；它不连接真实 Supabase，不证明真实认证、代理 IP、数据库迁移或生产部署。

Deno 数据库/Edge 静态测试已通过 Deno 2.5.6（通过项目锁定的 npm 离线运行器）15/15；该测试仍不连接真实 Supabase。生产发布前必须按部署清单应用迁移并发布匹配的 `account-sessions`，随后用真实 JWT 验证本人隔离、伪造 XFF、未知 IP、重复 capture 和 50 条上限。
