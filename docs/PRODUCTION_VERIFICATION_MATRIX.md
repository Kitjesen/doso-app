# DOSO 生产上线可执行验收矩阵

本矩阵是上线放行记录，不是功能愿望清单。每次候选发布创建唯一 `run-id`（推荐 `YYYYMMDD-HHmm-<git-short-sha>`），所有原始证据写入 `artifacts/production-verification/<run-id>/<scenario-id>/`。证据目录不提交敏感凭据；日志中的 token、邮箱验证码、第三方 subject 和用户隐私必须脱敏。

## 结果与放行规则

- 允许结果仅为 `PASS`、`FAIL`、`BLOCKED`、`EXCLUDED`，不得用“基本通过”“待观察”替代。
- `PASS`：本次候选包在指定环境执行了精确命令和步骤，实际结果满足全部 PASS 条件，并留存要求的证据。
- `FAIL`：命令可执行但任一结果规则不满足，或证据缺失/不可复核。修复后必须用新的执行时间重新验证。
- `BLOCKED`：仅用于外部审批、平台凭据、硬件、托管环境不可用等确实使场景无法开始的条件。记录 blocker、责任人、发现时间和解除条件；它不是通过。
- `EXCLUDED`：仅用于本次发布目标客观不适用，或 A/B 候选方案已经正式淘汰。必须记录批准人、批准时间、理由和替代场景 ID。不能用来跳过失败测试。
- P0 有任一 `FAIL` 或 `BLOCKED` 时禁止上线；P0 仅当对应平台不在本次发布范围时才可 `EXCLUDED`。P1 有 `FAIL/BLOCKED` 时需产品与技术负责人共同签署风险接受。P2 不阻断发布，但必须进入缺陷清单。
- Apple A/B/C 是实现候选：A 已选且必须 `PASS`；B 仅在正式触发回滚并重新达到真机 parity 时适用；C 已拒绝，仅保留历史基线。B/C 以 `docs/APPLE_AUTH_OPTION_DECISION.md` 为证据标记 `EXCLUDED`。Authing 选择 B（隔离双 Provider）首发；A（单 Provider 参数分流）仅为实验/阻塞，依据 `docs/AUTHING_PROVIDER_OPTION_DECISION.md` 判定。
- 总体放行：全部适用 P0 为 `PASS`，没有未批准的 P1 风险，版本/签名/Provider 开关与候选包完全一致，且证据可由另一名成员复核。

## 环境定义

- `local-offline`：无网络、无 secret；只读取仓库文件。
- `local-supabase`：本机 Supabase、Mailpit 和测试数据库；允许清理测试数据。
- `hosted-staging`：与生产 schema/config 等价的托管测试项目，不使用真实生产用户。
- `production-canary`：正式配置的小流量候选包与专用验收账号。
- `ios-device` / `android-device`：正式签名真机；模拟器不能替代社交登录放行。
- `robot-simulator`：执行与真实机器人相同配网、固件、命令/ACK/遥测合同的可重置模拟器；UI demo 数据不属于该环境。

## 当前产品实施顺序

1. 先通过蓝牙/Wi-Fi 安全配网合同，证明机器人身份、临时配网会话和凭据处理边界。
2. 再通过固件升级与回滚合同，证明签名、兼容性、中断恢复和失败回滚。
3. 随后接入命令 ACK、可信遥测和故障通知，最后进入真实机器人最小闭环。

前两项是当前 P0 产品主线。对应纯 TypeScript 合同、模拟器和测试命令已经落地，但真实原生/托管/机器人环境仍必须保持 `BLOCKED`，不能以文档、UI 占位或 `SIMULATED PASS` 标记为生产 `PASS`。

## 通用执行约定

在 `doso-app` 根目录执行命令。PowerShell 先设置 `$runId = '<run-id>'`，再用 `$evidenceRoot = "artifacts/production-verification/$runId"` 创建证据目录。涉及托管环境的变量只从受控 CI/本机 secret store 注入，不写入命令历史或证据文件。每个场景的 `result.json` 至少包含：`scenarioId`、`result`、`gitSha`、`appVersion`、`artifactSha256`、`startedAt`、`finishedAt`、`operator`、`environment`、`notes`。

## BASELINE-001 — 离线生产基线

- Priority: `P0`
- Environment: `local-offline`
- Command: `npm run test:production-baseline`
- Evidence: `artifacts/production-verification/<run-id>/BASELINE-001/console.txt`
- PASS: 命令退出码为 0；版本一致、关键文件存在、示例 Provider flags 默认关闭、矩阵结构与稳定 ID 合法。
- FAIL: 任一断言失败、读取了 `.env.local`/secret，或发生网络访问。
- BLOCKED: 不允许；Node/npm 缺失属于构建环境故障，结果记 `FAIL`。

## DB-RPC-001 — 最新 schema 与关键 RPC 合同

- Priority: `P0`
- Environment: `local-supabase`
- Command: `npm run supabase:start`；`npm run db:reset`；`npm run test:db`
- Evidence: `artifacts/production-verification/<run-id>/DB-RPC-001/db-reset.txt` 和 `test-db.txt`
- PASS: 全部迁移成功；`claim_username(text)`、`list_my_login_methods()`、终端/设备绑定 RPC 存在且数据库测试 0 失败。
- FAIL: 迁移/RPC 缺失、返回列与客户端合同不一致、权限/RLS 断言失败或测试非零退出。
- BLOCKED: Docker/Supabase CLI 故障可暂记，但 P0 保持阻断。

## DB-RPC-002 — 托管项目 schema 兼容性

- Priority: `P0`
- Environment: `production-canary`
- Command: `npx supabase db push --dry-run --linked`；`npm run db:hosted-public-postflight`；`npm run test:network`；`npm run test:identity-hosted`
- Evidence: `artifacts/production-verification/<run-id>/DB-RPC-002/db-dry-run.txt`、`public-rpc-postflight.txt`、`network.txt`、`identity-hosted.txt` 和 `result.json`
- PASS: dry-run 无待部署迁移；绑定 production project ref/hostname 的无 Bearer 探针确认 release RPC 已进入 schema cache，并返回目标函数的精确 PostgreSQL EXECUTE ACL denial（函数体未执行）；网络合同测试 0 失败；`test:identity-hosted` 对真实托管项目执行成功并证明 `claim_username(text)`、`list_my_login_methods()` 及身份投影 RPC 的返回列与客户端合同一致。
- FAIL: 存在未部署迁移、任一 RPC 404/PGRST202、字段缺失、托管身份/RPC 断言未执行或任一命令非零退出。
- BLOCKED: `test:identity-hosted` 脚本、托管 staging 或受控测试凭据任一不存在时必须记 `BLOCKED`，不得用 dry-run、静态 wiring 或通用网络测试替代 PASS。

## AUTH-APPLE-A-001 — Apple A：Expo iOS 原生 + Android/Web Supabase OAuth

- Priority: `P0`
- Environment: `ios-device` + `android-device` + `production-canary`
- Command: `npm run test:apple-auth-core`；`npm run test:social-auth`；`npx expo run:ios --configuration Release --device`；`npx expo run:android --variant release --device`；`npm run export:web`
- Evidence: `artifacts/production-verification/<run-id>/AUTH-APPLE-A-001/screen-recording.mp4`、`auth-events.json`、`result.json`
- PASS: iOS 完成首次/重复/隐藏邮箱/取消/离线/冷启动/热回调/撤销；Android 完成移动 Link，Web 完成当前部署 same-origin 的精确 HTTPS PKCE 回跳且该 URL 在 Supabase allowlist；同一 Apple identity 稳定回到同一 DOSO user；首次姓名在 terminal-ready 前只暂存不写 profile，终端登记后可恢复并用 expected user ID/RLS 保存，App 重启仍能恢复未消费暂存；ready key 必须区分同一用户的新旧 session，stale preparation/heartbeat 不得覆盖或退出新 session；A→B 既不显示也不串写；探测确认 SecureStore 记录存在时（即使同时有内存值）保存/跳过须成功删除，纯内存兜底候选在存储失败时仍可确认且清理为 best-effort；旧 subject 的延迟 revoke 结果不能退出替换账号；用户名门禁不可绕过；日志无 token/code/nonce。
- FAIL: 串号、重复账号、绕过用户名门禁、取消后残留 session、token 出现在日志，或仅在模拟器验证。
- BLOCKED: Apple capability/provider/真机凭据未就绪时允许记录，但 P0 保持阻断。

## AUTH-APPLE-B-001 — Apple B：Invertase 回滚候选

- Priority: `P1`
- Environment: `ios-device` + `production-canary`
- Command: 仅在批准回滚后，使用独立候选分支执行与 A 完全相同的真机矩阵
- Evidence: `artifacts/production-verification/<run-id>/AUTH-APPLE-B-001/screen-recording.mp4`、`callback.txt`、`result.json`
- PASS: 只有正式触发回滚时，Invertase 在同一签名、账号、callback、nonce/state、姓名、撤销和跨平台矩阵达到 A parity。
- FAIL: 与 A 有行为差异、双栈并存、恢复旧客户端 Services ID 环境变量，或没有同候选真机证据。
- BLOCKED: 若正式批准回滚但 B 尚未达到 A 的真机 parity，则回滚发布保持阻断。
- EXCLUDED: 当前由 `docs/APPLE_AUTH_OPTION_DECISION.md` 排除；不是 A 的上线门禁替代品。

## AUTH-APPLE-C-001 — Apple C：旧客户端 Apple 适配历史基线

- Priority: `P1`
- Environment: `local-offline`
- Command: 无；仅允许查阅 Git 历史进行回归比较
- Evidence: `artifacts/production-verification/<run-id>/AUTH-APPLE-C-001/web-export.txt`、`revoke-timeline.md`、`result.json`
- PASS: 不适用；该方案不得发布。
- FAIL: 当前构建重新出现 `EXPO_PUBLIC_APPLE_AUTH_SERVICE_ID`、`EXPO_PUBLIC_APPLE_AUTH_REDIRECT_URI` 或旧直接依赖。
- BLOCKED: 不允许用 C 解除 A 的任何外部门禁；若试图恢复 C，发布保持阻断直到重新完成架构审批。
- EXCLUDED: 当前由 `docs/APPLE_AUTH_OPTION_DECISION.md` 排除；Web 与 revoke 验收已经合并到 A，不能随 C 一并跳过。

## AUTH-AUTHING-A-001 — Authing A：单 OIDC Provider 参数分流实验

- Priority: `P1`
- Environment: `android-device` + `ios-device` + `production-canary`
- Command: 仅在独立批准重新评估 A 后执行连接参数穿透与真机隔离矩阵
- Evidence: `artifacts/production-verification/<run-id>/AUTH-AUTHING-A-001/wechat.mp4`、`qq.mp4`、`identity-map.json`、`result.json`
- PASS: 单个 `custom:authing` 的受审连接参数端到端穿透 Supabase/Authing，两个入口仍产生可区分且稳定的身份映射，并达到 B 的完整真机 parity。
- FAIL: 参数被丢弃、出现连接选择页、入口跳错平台、身份不可区分或 cookie 串号。
- BLOCKED: 当前没有连接参数穿透与 identity 隔离的真实 tenant/真机证据，因此 A 不得进入发布。
- EXCLUDED: 当前由 `docs/AUTHING_PROVIDER_OPTION_DECISION.md` 排除；不能替代 B 的上线门禁。

## AUTH-AUTHING-B-001 — Authing B：微信/QQ 隔离 OIDC 应用与双 Provider

- Priority: `P0`
- Environment: `android-device` + `ios-device` + `production-canary`
- Command: `npm run test:authing-broker`；`npm run test:social-auth`；`npm run authing:verify-live-oidc`；`npx expo run:android --variant release --device`；`npx expo run:ios --configuration Release --device`
- Evidence: `artifacts/production-verification/<run-id>/AUTH-AUTHING-B-001/route-matrix.md`、`account-switch.mp4`、`issuer-provider-map.json`、`capacity-check.json`、`kill-switch-drill.json`、`result.json`；identity 映射只含脱敏 issuer fingerprint、provider key、subject hash、DOSO user ID。
- PASS: `custom:wechat` / `custom:qq` 与批准 issuer 不可变绑定并分别只直达微信/QQ；Authing 账号关联/字段匹配关闭，scope 为 `openid profile`，`email_optional=true`，无 verified email/假邮箱/跨渠道自动合并；discovery/JWKS 通过 issuer、HTTPS、authorization code、S256、RS256；Supabase 现有 Custom Provider 名额足够 B 占用 2 个，Authing tenant 支持至少 2 个社会连接和 2 个 OIDC 应用；在 `preferEphemeralSession: false` 的真实 cookie/SSO 条件下，两平台真机首次/重复/取消/退出重登/账号切换通过；kill switch 演练证明 Supabase → Authing → client 下版顺序，并另外完成受影响 terminal/session 撤销。QQ 证据明确是系统浏览器 PoC。
- FAIL: route 相同或 canonical key/issuer 绑定不符、原地复用 identifier 更换 issuer、出现连接选择页、入口跳错平台、昵称/空邮箱参与合并、cookie 串号、JWKS/RS256 不合格、容量不足、kill switch 未处理已有 session，或任一平台只有静态 wiring 证据。
- BLOCKED: Canary 返回 verified email，或 Authing tenant、开放平台审核/凭据、Supabase Provider/容量、正式签名真机不可用时允许记录；选中的 B 为 P0，发布保持阻断。

## AUTH-IDENTITY-001 — 社交身份投影与用户名门禁

- Priority: `P0`
- Environment: `hosted-staging`
- Command: `npm run test:identity-hosted`
- Evidence: `artifacts/production-verification/<run-id>/AUTH-IDENTITY-001/identity-hosted.txt` 和 `result.json`
- PASS: 命令对真实托管项目退出码为 0；创建真实 Auth identity 后验证投影、`list_my_login_methods()` 返回合同、社交用户一次性用户名认领及设备门禁；测试数据完成清理，且未保存原始 subject/provider token。
- FAIL: 仅运行 `test:username-onboarding`、`test:account-identities-ui`、`test:network` 等静态/通用检查，或出现门禁绕过、RPC 404、字段不一致、身份投影串号、敏感 token 落盘、清理失败。
- BLOCKED: 当前 `test:identity-hosted` 脚本或托管凭据尚不存在时必须记 `BLOCKED`，绝不能凭静态 wiring 或通用网络测试判定 PASS；该集成测试由 G002/G003 实现。

## AUTH-SESSION-ISOLATION-001 — 旧账号请求不得影响替换后的会话

- Priority: `P0`
- Environment: `local-offline` + `android-device` + `ios-device`
- Command: 当前故障表征为 `node --test scripts/session-service-identity.verification.mjs`；修复放行另须新增执行真实生产会话协调器及 AuthProvider 入口的行为测试，再在同一候选包和受控验收账号上执行会话切换矩阵。当前尚无该完整修复测试，不得把表征测试或静态检查当成替代。
- Evidence: `artifacts/production-verification/<run-id>/AUTH-SESSION-ISOLATION-001/` 下保存候选源码/SDK/包哈希、脱敏请求顺序、协调器行为测试、原生切换记录和 `result.json`。当前本地故障原始证据保留于 `artifacts/release-readiness/20261016-session-identity/`，不是正式原生验收。
- PASS: 实际生产入口下，A 的撤销、终端读取及 SDK logout 延迟均不能以 B 的身份派发后续操作或删除/覆盖 B 的会话；允许安全派发前拒绝，或将 B 的会话建立串行排在 A 的清理之后。密码登录、OTP/OAuth 完成、公开 setSession 和 Provider 两个摄入口均纳入受测边界；未知结果不自动重放；同 runtime 重挂载有实证。支持的平台具有同候选正式签名真机证据，跨 runtime/重启保证不得用单 runtime 测试冒充。原始 SDK 的直接调用诊断可以仍为 RED，不能据此要求修改 SDK 私有实现或反转断言。
- FAIL: 当前本地已实际复现 3 个安全断言失败，缺陷尚未修复；仅加 `getSession → compare → signOut` 或仅固定外发 JWT 而未关闭迟到本地清理窗口，仍不得放行。没有统一协调器的真实行为证据、出现串号清理/身份混用、跳过或反转故障断言以冒充通过，均为 FAIL。
- BLOCKED: 正式原生会话验收在网络、受控账号或正式签名测试机缺失时可记 BLOCKED；这些外部条件不能覆盖已知本地 FAIL。未另行授权不得用真实用户诱发撤销、改密或未知提交。

2026-10-16 局部证据：`artifacts/release-readiness/20261016-session-operation-slice/` 已通过邮箱认证 service 与撤销序列的同 runtime fail-fast 互斥，SDK 原请求未结束时不因 UI deadline 释放。Native Apple、MFA、Provider 双摄入口、可写/清会话的名义读取与自动刷新尚未接入；没有正式签名真机或完整协调器放行证据，**本场景仍为 FAIL**。这不是把 raw SDK 诊断改成 PASS。

后续局部证据 `artifacts/release-readiness/20261016-provider-session-slice/` 已接 native Apple ID-token 与 MFA 写入及刷新，两处本地包装通过 6 项行为验证；不是原生或真实 Provider 验收。实际 AuthProvider 的 busy 事件与初始恢复分别在发布、准备上 **4/4 FAIL**，整体审查 REQUEST CHANGES。须先补共享 pending/unknown 摄入 fence，再验证安全 fresh 恢复；不得以通用 idle 自动重登记清除未知结果。本场景仍为 **FAIL**，不是环境缺失造成的单纯 BLOCKED。

## SMTP-001 — 生产验证码真实投递

- Priority: `P0`
- Environment: `production-canary`
- Command: `npm run test:auth-ui`；在候选包依次触发注册、密码恢复、重新认证 OTP
- Evidence: `artifacts/production-verification/<run-id>/SMTP-001/delivery-matrix.csv`、`sanitized-headers/`、`directmail-events.csv`、`result.json`
- PASS: Gmail、Outlook/Hotmail、QQ/163 各收到 8 位邮箱 OTP；三种流程均验证一次性使用、10 分钟失效、60 秒重发；邮件原文 SPF/DKIM/DMARC 通过且域对齐。MFA/TOTP 按独立契约验收，不受本项变更影响。
- FAIL: 任一核心流程收不到、模板含确认链接、验证码可复用/超期有效、凭据泄漏或投递结果无法追踪。
- BLOCKED: DirectMail/Supabase/收件箱不可用可记录，但 P0 保持阻断。

## ACCOUNT-EMAIL-001 — 新安装账户邮件 Outbox

- Priority: `P0`
- Environment: `hosted-staging` → `production-canary`
- Command: `npm run test:db`；`npm run test:account-email-ops`；按 `docs/runbooks/ACCOUNT_EMAIL_OUTBOX_DEPLOYMENT.md` 执行 canary
- Evidence: `artifacts/production-verification/<run-id>/ACCOUNT-EMAIL-001/` 下的 sanitized state counts、Cron request status、DirectMail RequestId/EnvId、四类收件箱结果、unknown 演练、rollback 演练和 `result.json`
- PASS: feature 初始关闭；错误/publishable apikey 为 401、named secret 为 200；注册事务原子生成 terminal/outbox/audit；Provider 成功但 DB ACK 失败不会重发；timeout/dispatch expiry 进入 `delivery_unknown` 并告警；人工 retry 有原因与“可能重复”审计；30 天脱敏保留摘要/Provider ID/状态。
- FAIL: `dispatching` 自动重发、把 `accepted` 称为 delivered、客户端可控制 lease、payload 重复邮箱/IP/地点、日志含 PII/Secret、Cron 明文 Secret、unknown 无告警或回滚顺序不符。
- BLOCKED: named secret、DirectMail RAM/发信地址、Vault/Cron、账户安全页、真实收件箱或生产部署权限缺失时保持 flag off，不能用本地测试代替。

## SIGN-ANDROID-001 — Android 正式签名与制品身份

- Priority: `P0`
- Environment: `local-offline`
- Command: `cd android`；`.\gradlew.bat bundleRelease`；`cd ..`；`keytool -printcert -jarfile android\app\build\outputs\bundle\release\app-release.aab`
- Evidence: `artifacts/production-verification/<run-id>/SIGN-ANDROID-001/build.txt`、`certificate.txt`、`sha256.txt`、`result.json`
- PASS: release 不引用 `signingConfigs.debug`；证书 SHA-256 与微信/QQ/商店登记值一致；applicationId/versionCode/versionName 与发布记录一致；AAB 哈希已记录。
- FAIL: debug keystore、临时/未知证书、版本不一致、未生成 AAB 或证据不含证书指纹与制品哈希。
- BLOCKED: 正式 keystore/CI signing 不可用可记录，但 P0 保持阻断。

## SIGN-IOS-001 — iOS 正式签名与 capability

- Priority: `P0`
- Environment: `ios-device`
- Command: `npx expo run:ios --configuration Release --device`
- Evidence: `artifacts/production-verification/<run-id>/SIGN-IOS-001/build.txt`、`entitlements.plist`、`result.json`
- PASS: Bundle ID 为 `com.doso.robot`；distribution profile、Sign in with Apple、Associated Domains 与发布环境一致；候选包可安装启动。
- FAIL: development/ad-hoc 误作商店包、capability/域名缺失、Bundle ID/版本不一致或无法安装。
- BLOCKED: Apple distribution 凭据或 macOS 构建机不可用可记录，但 iOS 发布保持阻断。

## ROBOT-PROVISION-001 — 蓝牙/Wi-Fi 安全配网

- Priority: `P0`
- Environment: `robot-simulator` + `android-device` + `ios-device`
- Command: `npm run test:robot-provisioning`；`npm run test:provisioning-ui`；`npm run test:robot-lifecycle-ui`
- Evidence: `artifacts/production-verification/<run-id>/ROBOT-PROVISION-001/provisioning-timeline.json`、`credential-redaction.txt`、`screen-recording.mp4` 和 `result.json`
- PASS: App 验证机器人身份后建立短时一次性配网会话；Wi-Fi 凭据只通过受保护通道发送且不进入数据库、日志或持久缓存；设备连接/断开/失败报告均签名、绑定会话且序号防重放；正确凭据、错误密码、设备拒绝、超时、鉴权取消、断网恢复和恢复出厂后重配均得到确定结果。
- FAIL: 仅凭序列号即可配网、长期复用配网密钥、明文或可恢复 Wi-Fi 密码落盘、跨设备串配、取消后继续写入、超时仍显示成功，或只验证设备认领而没有真实配网状态机。
- BLOCKED: 纯 TypeScript 合同、兼容模拟器、Android 前台 BLE discovery 代码/config、独立“开发诊断”入口、原生 debug APK 编译与模拟器启动已实现，但只作为开发/离线测试资产，生产 App 配网入口保持禁用；诊断入口只读取广播且不会连接、绑定或写 Wi-Fi。物理 BLE 扫描证据、GATT 身份/凭据 adapter、测试 AP、机器人固件和 Android/iOS 完整真机链路尚未实现，因此仍必须记 `BLOCKED`。广播发现不能替代设备身份验证或安全配网。

## ROBOT-FIRMWARE-001 — 固件升级与回滚

- Priority: `P0`
- Environment: `robot-simulator` + `hosted-staging`
- Command: `npm run test:firmware-lifecycle`；`npm run test:firmware-update-ui`；`npm run test:robot-lifecycle-ui`
- Evidence: `artifacts/production-verification/<run-id>/ROBOT-FIRMWARE-001/manifest.json`、`upgrade-timeline.json`、`rollback-log.txt` 和 `result.json`
- PASS: 机器人只接受 DOSO 签名且型号/硬件兼容的固件；升级状态覆盖 scheduled/downloading/verifying/installing/rebooting/health_checking/succeeded/failed/rolled_back；低电量、离线或任务运行时拒绝升级；下载中断、校验失败、安装失败、重启失败和健康超时均能恢复或自动回滚到已验证版本；回滚结果具备绑定设备/作业/启动/槽位/版本的签名证明，后续升级保留单调版本与 A/B 历史。
- FAIL: 接受未签名或错误型号固件、客户端可伪造升级或回滚成功、健康检查可无限挂起、失败后无法启动或回滚、状态丢失、重复作业导致并发安装，或回滚版本/证明未经签名和兼容校验。
- BLOCKED: 签名 manifest、A/B 槽、回滚状态机和模拟 gateway 行为合同已实现，但只作为开发/离线测试资产，生产 App OTA 入口保持禁用；生产签名/制品服务、托管升级作业、机器人双分区或等价回滚能力尚未实现，因此仍必须记 `BLOCKED`。

## ROBOT-SIM-GATE-001 — 机器人模拟器控制闭环门禁

- Priority: `P0`
- Environment: `robot-simulator`
- Command: `npm run test:robot-simulator`
- Evidence: `artifacts/production-verification/<run-id>/ROBOT-SIM-GATE-001/console.txt`，以及当前提交中的 `scripts/verify-robot-simulator.mjs`、两个 G008 focused verifier 与其导入的 simulator/gateway 源码。
- PASS: 当前结果为 `SIMULATED PASS`：`test:robot-simulator` 退出码为 0，并输出机器人协议 `28/28`、安全配网 `24/24`、G008 命令投递 `18/18`、G008 诊断 UI `9/9` 的必需标记；命令 ACK 使用 `accepted` / `executing` / `succeeded` 或明确失败终态；App 只在已进入 canonical verified ACK log 的绑定事件后显示成功，过期可信遥测被隐藏并视为离线。
- FAIL: UI demo 数据可通过门禁、发布 MQTT 即显示成功、无 ACK/关联 ID、旧命令重放、解绑后仍执行或客户端可伪造遥测。
- BLOCKED: `robot-simulator` 本地执行环境无法启动，或 `npm run test:robot-simulator` 无法开始时记录；Node/npm 缺失属于构建环境故障，按本矩阵通用规则记 `FAIL`。
- NOT COVERED / remaining gates: MQTT/mTLS、生产 Supabase 持久化/worker、真实 GATT/Wi-Fi、物理机器人、运动控制、路线、任务与召回不属于本模拟器场景；它们分别由配网、真机、生产与安全门禁继续阻断，`SIMULATED PASS` 不能解除。

## ROBOT-DEVICE-001 — 真机机器人最小可用闭环

- Priority: `P1`
- Environment: `android-device` + `ios-device` + 真实测试机器人
- Command: `npx expo run:android --variant release --device`；`npx expo run:ios --configuration Release --device`
- Evidence: `artifacts/production-verification/<run-id>/ROBOT-DEVICE-001/run.mp4`、`gateway-events.jsonl`、`robot-log.txt`、`result.json`
- PASS: 安全绑定、Wi-Fi 配网、在线/离线、暂停、开始任务、返回充电座及故障提示完成真实闭环；App/网关/机器人 correlation ID 可对齐。
- FAIL: 仅演示 UI、任一动作无设备 ACK、断网状态虚假、错误机器人响应或本地安全拒绝未反馈到 App。
- BLOCKED: 真实硬件/固件未就绪时允许记录；机器人控制保持隐藏，纯账号版本可由产品明确缩小发布范围。

## ROBOT-CAPABILITY-001 — 分能力控制放行门禁

- Priority: `P0`
- Environment: `local-offline` + `production-canary` + 真实测试机器人
- Command: `npm run test:robot-capability-readiness`；`npm run test:robot-command-executor`；生产候选另按能力逐项执行真机证据矩阵。
- Evidence: `artifacts/production-verification/<run-id>/ROBOT-CAPABILITY-001/console.txt`、逐能力 ACK/遥测记录与 `result.json`。
- PASS: `diagnosticsHealth`、配网、OTA、路线启动、任务启动、召回、手动控制各自拥有独立可信证据和放行结果；开启任一能力不能顺带解锁其他能力；实体运动能力还必须满足绑定设备、在线、安全锁、executor 支持与非在途条件。`accepted` / `executing` 不得显示成功，只有绑定当前 attempt/command/device 的认证 `succeeded` ACK 且最终权限复核通过才能完成；超时、取消、authority 切换、旧 attempt 和迟到成功均保持终态不可复活。
- FAIL: 一个全局布尔值放行全部控制、模拟诊断解锁运动、连接状态或安全锁可替代协议证据、任一执行按钮在对应能力失败时仍可触发。
- BLOCKED: 当前只有 demo `diagnostics.health_check` 可独立运行；demo evidence 注入不能打开其他六项能力。App 的安全命令协调器与本地行为测试已完成，但生产 executor 明确为 `null`；实体七项能力均无完整生产证据，配网/OTA 模拟 gateway 仅保留为测试资产且产品入口禁用，路线、任务、召回和手动控制没有物理协议/可信 ACK，因此生产放行保持阻断。

## OPS-OBSERVABILITY-001 — 认证与机器人验收告警可观测性

- Priority: `P2`
- Environment: `production-canary`
- Command: `npm run test:production-baseline`
- Evidence: `artifacts/production-verification/<run-id>/OPS-OBSERVABILITY-001/alert-catalog.md`、`result.json`
- PASS: 认证失败、SMTP 退信、Provider 回调失败、机器人命令超时和遥测离线均有负责人、阈值、通知渠道与处置链接；使用合成事件验证至少一次通知链路。
- FAIL: 关键失败只能由用户报告、告警包含 token/OTP/原始 identity subject，或没有明确负责人和处置步骤。
- BLOCKED: 告警平台未选型可记录为 P2 缺口，不阻断纯账号候选包，但必须进入上线后缺陷清单。

## RELEASE-GATE-001 — 候选包总放行

- Priority: `P0`
- Environment: `production-canary`
- Command: `npm run test:release-gate`
- Evidence: `artifacts/production-verification/<run-id>/RELEASE-GATE-001/release-manifest.json`、`matrix-results.csv`、`approval.md`
- PASS: 所有适用 P0 为 PASS；P1 风险已关闭或双签；Git SHA、版本、制品 SHA-256、Provider flags、数据库迁移版本与本次证据一致。
- FAIL: 证据来自旧包/旧提交、存在 P0 FAIL/BLOCKED、开关与真机验证不一致，或批准记录不完整。
- BLOCKED: 上游 P0 未完成时必须 BLOCKED，不得以发布时间为由降级。

## 记录模板

每次执行复制以下对象到对应场景的 `result.json`，不要填写 secret：

```json
{
  "scenarioId": "DB-RPC-001",
  "result": "PASS",
  "gitSha": "<40-char-sha>",
  "appVersion": "0.0.1",
  "artifactSha256": "<sha256-or-null>",
  "startedAt": "<ISO-8601>",
  "finishedAt": "<ISO-8601>",
  "operator": "<name>",
  "environment": "local-supabase",
  "notes": "<sanitized notes>"
}
```
