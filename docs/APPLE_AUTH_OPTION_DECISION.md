# Apple 登录 A/B/C 选型决定

状态：`A CHOSEN / B ROLLBACK-ONLY / C REJECTED`  
生效范围：本地生产候选代码；Apple Provider 与客户端功能开关仍关闭。

## 结论

### A — Expo 原生 iOS + Supabase OAuth Android/Web（已选）

- iOS 使用 SDK 57 对齐的 `expo-apple-authentication@57.0.1` 与 `expo-crypto@57.0.2`。原始 nonce 与 state 分别由 32 字节密码学随机数生成，Apple 收到 SHA-256 nonce，Supabase `signInWithIdToken` 收到原始 nonce。
- iOS 请求 `FULL_NAME` 与 `EMAIL`；首次非空格式化姓名在 token 交换前按 Apple subject 哈希键暂存于 SecureStore。社交登录服务在终端登记完成前绝不写 profile。AuthContext 在每次 session change 开始时清空 ready identity，只有 `registerCurrentTerminal` 与 profile load 对同一未过期 preparation ticket 成功后才发布 user ID + generation ready key；旧异步任务、旧 heartbeat、同用户旧 session 都不能提交。App 的恢复探测按该 ready key 门禁；只要探测确认 SecureStore 记录存在（包括同时有内存展示值），保存/跳过后就必须成功删除，否则保留待办；仅纯内存兜底候选在 SecureStore 读写失败时仍可确认，其删除为 best-effort。资料更新始终用 RLS-scoped `profiles.display_name` + expected user ID，绝不写 DOSO `username` 或不带账户范围的 auth metadata。新用户随后继续用户名门禁，已认领用户恢复主流程。
- Android 与 Web 都由 Supabase `signInWithOAuth({ provider: 'apple', options: { redirectTo, skipBrowserRedirect: true } })` 启动，继续使用现有 PKCE 回调交换。Web 必须使用经过严格验证的当前部署 `window.location.origin`，不能把移动 Link host 当作 Web callback。客户端不持有 Services ID、Apple 回调或 client secret。
- Expo revoke listener 负责热态撤销通知；iOS 启动和回前台时按 Apple identity 的 `identity_data.sub` 查询 credential state。generation/active/当前 subject 与 single-flight 退出门禁防止旧账号延迟结果退出新账号。只有 `REVOKED`、`NOT_FOUND`、`TRANSFERRED` 进入既有终端/会话退出链路；模拟器/不支持返回 sanitized `unsupported`，原生或瞬时查询失败返回 sanitized failure diagnostic，均不会退出。
- 本地证据：`npm run test:apple-auth-core` 覆盖 nonce/state、交换、姓名、浏览器结果、凭据状态、回调幂等和禁用短路；`npm run test:social-auth` 约束依赖、配置和无敏感日志；`npm run typecheck` 验证平台接口。

选择原因：Expo 模块与当前 Expo SDK 同版本管理，iOS 原生能力最小；Android/Web 复用 Supabase 托管 Apple OAuth 与现有 PKCE/Verified Link 合同，客户端无需再承担 Apple Services ID 配置和自建回调面。

### B — Invertase 原生方案（仅回滚候选）

`@invertase/react-native-apple-authentication` 已从直接依赖移除。B 不进入当前构建，也不能与 A 双栈运行。只有 A 在正式签名真机上出现无法修复的能力缺口，并且 B 在同一候选包、同一测试账号、同一回调与撤销矩阵达到等价结果后，才允许通过新决策记录恢复 B。未达到真机 parity 前，B 仅是回滚研究选项。

### C — 旧的客户端 Services ID / Android 直接 Apple 适配（拒绝）

旧实现要求 `EXPO_PUBLIC_APPLE_AUTH_SERVICE_ID`、`EXPO_PUBLIC_APPLE_AUTH_REDIRECT_URI`，并在客户端承担额外 Apple 授权适配。该路径已拒绝，不得重新加入生产候选；只保留 Git 历史作为回归比较基线。Apple Services ID、回调、`.p8` 和轮换 client secret 属于 Apple Developer/Supabase 服务端配置。

## 尚未解除的外部门禁

A 的代码通过不等于 Apple 登录可上线。以下全部完成并留证前，`EXPO_PUBLIC_APPLE_AUTH_ENABLED=false`，Supabase Apple Provider 保持关闭：

1. Apple Developer capability、Team ID、Services ID、Key ID、`.p8` 与 Supabase Apple Provider 真实配置。
2. Supabase Apple Client IDs 必须以 Services ID 为首项，再列 `com.doso.robot` Bundle ID；client secret 轮换流程已验证。
3. G004 的 `links.dosorobotics.com` App Links/Universal Links、正式 iOS/Android 签名和精确 callback 已完成域名归属验证。
   每个正式 Web App origin 的精确 `/auth/callback` 也必须加入 Supabase Redirect URLs；`links.dosorobotics.com` 只承担移动 App/Universal Link 与安全浏览器兜底，不交换、转发或读取 authorization code。
4. 正式签名真机覆盖首次登录、重复登录、隐藏邮箱、取消、离线、冷启动、热回调、系统撤销、跨 iOS/Android/Web 同一 Apple identity。
5. 服务端账号删除能够交换/保管撤销所需凭据并调用 Apple revoke；定期 client-secret rotation 有监控和回滚证据。

## 参考

- [Expo AppleAuthentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [Expo Crypto](https://docs.expo.dev/versions/latest/sdk/crypto/)
- [Supabase Apple 登录](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Supabase Expo/React Native 社交登录](https://supabase.com/docs/guides/auth/quickstarts/with-expo-react-native-social-auth)
