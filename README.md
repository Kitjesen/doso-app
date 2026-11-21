# DOSO App

DOSO 是基于 React Native、Expo、Supabase Auth、PostgreSQL 和 Edge Functions 的机器人管理 App。当前源码版本为 `0.0.1`。

当前 UI 的唯一入口与历史 `legacy` 清单见 [UI source of truth](./docs/UI_SOURCE_OF_TRUTH.md)。登录与注册使用 `LoginSurface`，旧 Figma 认证素材只用于回溯。

> `0.0.1` 是项目尚未正式发布时的开发基线，不是生产发布版本。历史 `1.2.x` APK 仅作为 QA 证据保留，不代表正式版本序列。社交登录 Provider 尚未在线启用，用户名认领和外部身份相关的最新托管数据库迁移也尚未完成部署验收。当前发布状态与 APK 对应关系见 [0.0.1 当前发布状态](./docs/CURRENT_RELEASE_STATUS.md)，机器人 App 范围、用户故事和阶段路线见 [机器人 App 产品需求与推进计划](./docs/APP_ROBOT_LIFECYCLE_PRD.md)。

## 当前产品推进顺序

1. **蓝牙/Wi-Fi 安全配网**：先建立机器人身份校验、临时配网会话、凭据保护、失败恢复和恢复出厂后的重新配网合同。
2. **固件升级与回滚**：随后建立签名固件清单、型号/硬件兼容校验、断点恢复、安装状态机和失败回滚合同。
3. **命令、ACK 与可信遥测**：在前两项具备可测试合同后，再接入任务、路线、召回、实时状态和故障通知。

前两项均为当前 P0。纯 TypeScript 合同、Node 机器人模拟器、App 内明确标注的配网/OTA 演示流程和离线安全门禁已经落地；Android 真实设备现在进入独立 BLE discovery 页面，源码可请求权限并读取广播。当前源码快照已通过 Android 原生预构建、四 ABI Gradle debug APK 编译、模拟器安装与 JS 启动，但尚无物理手机 + 真实广播扫描证据。GATT 身份、Wi-Fi 写入、托管作业、机器人固件与 bootloader 仍为 `BLOCKED/尚未实现`。

## 当前完成状态

已经接入真实服务的部分：

- 邮箱注册、6 位邮箱验证码、登录、会话持久化、退出登录
- 忘记密码验证码、重置密码，以及兼容的 PKCE App Deep Link 回跳
- PKCE 一次性授权码恢复流程；回跳 URL 不携带 access/refresh token
- `profiles`、`account_terminals`、`devices`、`audit_logs` 和私有设备绑定凭据表
- 数据库行级安全策略（RLS）：用户只能读取自己的账户、登录终端和设备；撤销终端后立即阻断数据访问
- 登录终端登记、心跳、指定终端/其他终端/全部终端撤销
- 机器人库存、序列号 + 一次性绑定码认领与解绑；绑定码只存 SHA-256 摘要
- 用户、支持人员、管理员角色；账户暂停/恢复、密码重置、全局下线和追加式审计
- 受保护 Edge Functions：终端、设备绑定、用户/设备管理，以及机器人可信 enrollment；内部邮件和机器人服务使用独立的服务端认证
- 独立 `admin/` Web 管理端；管理接口强制 TOTP MFA 的 `aal2` 会话
- 普通 App 只能更新设备名称与告警偏好，不能伪造在线状态、安全锁或遥测
- Android 使用 SecureStore 保存登录会话，Web 使用浏览器本地存储

已经写入当前 `0.0.1` 源码、但尚未形成线上闭环的部分：

- Apple、微信、QQ 登录入口、客户端授权流程和登录方式展示
- 社交用户首次登录的唯一用户名认领页面、门禁和 RPC
- 外部身份注册表与 `list_my_login_methods` RPC
- 安全配网状态机、单设备活动会话、安全信道 envelope、会话绑定的设备/连接事件签名证明、事件防重放、凭据 receipt 与恢复出厂失效模拟；运行 `npm run test:robot-provisioning`
- 签名固件 manifest 与电量策略、A/B 槽、分块续传、健康检查 deadline、完整绑定的签名健康/回滚证明与连续 OTA 作业模拟；运行 `npm run test:firmware-lifecycle`
- “我的设备”中的安全配网和固件更新演示页：演示/真实设备隔离、密码不留存、资格门槛、取消边界、回滚与恢复；运行 `npm run test:provisioning-ui` 和 `npm run test:firmware-update-ui`
- Android 前台 BLE discovery adapter 与候选设备页：真实权限、Android 11 及以下定位开关检查、扫描错误码、取消/重试隔离、App 进入后台自动停止、广播去重、脱敏设备标识和平台 fallback；运行 `npm run test:ble-discovery`。候选身份未验证，不连接或写入 characteristic。
- 制造 Ed25519 身份、短时一次性 enrollment challenge、恢复出厂计数推进、设备事件防重放和运行时公钥安装的数据库/Edge 合同已写；仍待托管 Supabase 部署与物理机器人签名验收
- 首页与设备页在无可信遥测时显示“待同步/—”，不再展示虚构电量、传感器和温度。
- 汇总发布门禁会顺序执行生产基线、机器人合同、App 演示 UI、BLE discovery 代码合同、可信数据 guard 和 TypeScript 检查；运行 `npm run test:release-gate`

Apple 与 Supabase Apple Provider、微信/QQ 的 Custom OIDC Provider 当前仍关闭；默认功能开关为 `false`，因此三个入口显示为灰色禁用状态。必须先部署并验证最新迁移，再配置 Provider 并完成真机登录，才能启用这些入口。

仍然缺少真实物理、云端或机器人侧闭环的部分：

- Android Development Build 在物理手机上的 BLE 扫描验收，以及后续 GATT 身份/凭据传输、Wi-Fi 安全配网；当前已有原生 APK 编译与模拟器启动证据，但模拟器不能替代 BLE 射频验收
- 生产固件签名、制品分发、机器人写入、重启健康证明与物理回滚
- 机器人实时电量、里程、运行时长等可信遥测上报
- 路线、任务、召回和控制指令下发

也就是说，账户、密码、登录终端、管理员 API、审计和物理设备所有权绑定已经是联网后端逻辑；App 已开始读取 Android 真实 BLE 广播，但机器人通信协议、设备侧密钥和 bootloader 尚未提供，因此发现页只显示“身份未验证”，不会假装完成配网、刷写固件或发送命令。

## 本地运行真实后端

前置条件：Node.js、Docker Desktop，以及能运行 Android 模拟器或浏览器的开发环境。

```powershell
npm install
Copy-Item .env.example .env.local
npm run supabase:start
npm run db:reset
$env:DOSO_ALLOW_ALL_WEB_ORIGINS_FOR_LOCAL_DEV='true'
npx supabase functions serve
npm run web -- --port 8081
```

本地测试账号：

- 邮箱：`demo@doso.local`
- 密码：`DosoDemo123!`

本地服务：

- Supabase API：`http://127.0.0.1:54321`
- 测试邮件箱 Mailpit：`http://127.0.0.1:54324`

Android 模拟器通过 `http://10.0.2.2:54321` 访问电脑上的本地 Supabase。另开一个终端运行 `npx supabase functions serve`，App 才能登记登录终端和绑定设备。实体手机不能直接使用这个模拟器专用地址；实体机或公开发布必须换成托管 Supabase 的 HTTPS URL。

Android 原生构建会根据后端 URL 自动决定是否允许明文流量：仅当本地 QA 地址以 `http://` 开头时启用；托管生产地址使用 HTTPS 时会自动关闭明文流量。

## 验证

```powershell
npm run typecheck
npm run test:release-gate
npm run test:ble-discovery
npx expo-doctor
npm run test:config
npm run test:db
npm run test:pkce
npm run test:network
npx supabase db lint --local --level warning
npm run export:web
npm run export:android
```

`npm run test:auth`、`npm run test:pkce` 和 `npm run test:network` 需要先从 `supabase status -o env` 将本地测试凭据注入当前进程。联网测试还需设置 `VERIFY_EDGE_FUNCTIONS=1` 并保持 `supabase functions serve` 运行。测试凭据绝不能写入 App、APK、Git 或任何 `EXPO_PUBLIC_` 环境变量。

## Android APK

以下 `1.2.3` 文件是历史 QA 构建，文件名与哈希保持不变，不属于当前 `0.0.1` 正式版本序列。

- `releases/DOSO-1.2.3-pure-social-icons-qa.apk` 和 `releases/DOSO-1.2.3-pure-social-icons-universal-qa.apk` 早于最后一轮用户名门禁与外部身份代码，只能验收当时的社交图标 UI。
- `releases/DOSO-1.2.3-quiet-auth-identity-qa.apk` 是较新的 QA 构建，但仍未证明托管迁移、线上 Provider 或真实第三方登录可用。
- 旧版 APK 的用途与校验值见 [Android builds](./releases/README.md)。

启动 Android 模拟器后，可执行：

```powershell
adb install -r .\releases\DOSO-1.2.3-quiet-auth-identity-qa.apk
```

也可以把 APK 拖入已打开的 Android 模拟器窗口完成安装。Windows 不能直接运行 APK。当前所有 APK 都使用 QA/debug 签名，不是应用商店生产包；即使连接托管后端，也不能据此认定未部署的数据库迁移或关闭的 Provider 已经可用。

生产 APK 需要把 `.env.local` 改为托管 Supabase 项目的 URL 和 publishable key 后重新构建。客户端只能使用 publishable/anon key，不得使用 service-role key。

### Android BLE Development Build

BLE 原生模块不在 Expo Go 中。使用 USB 连接的 Android 真机时运行：

```powershell
adb devices
npm run android -- --device
```

本地 Android 原生构建使用 JDK 17 或 21；JDK 24 会在当前 Expo/RN CMake 链路触发受限 API 错误。Windows 构建路径应尽量简短，避免 New Architecture C++ 对象路径超过 260 字符。也可用 `eas.json` 的 `development` profile 构建内部 APK。`EXPO_PUBLIC_DOSO_BLE_NAME_PREFIX` 默认是 `DOSO`；固件提供正式 provisioning service UUID 后，再设置 `EXPO_PUBLIC_DOSO_BLE_SERVICE_UUID`。UUID 未配置时页面会展示附近 BLE 广播并全部标为身份未验证，不会自动连接。

## 上线到托管 Supabase

1. 创建 Supabase 项目。
2. 将 `.env.local` 中的 URL 和 publishable key 替换为托管项目值。
3. 将 `supabase/migrations/` 中的迁移推送到托管数据库，并按 `supabase/functions/README.md` 与各 runbook 部署所需 Edge Functions。
4. 配置 6 位 OTP 邮件模板、TOTP MFA、正式域名 HTTPS 回跳、Android App Links 和 iOS Universal Links。
5. 为 Auth 配置生产 Custom SMTP，再用真实外部邮箱和两台终端完成注册、重置密码和远程撤销验收。
6. 单独部署 `admin/` 管理端，并将其限制为管理员账户 + TOTP MFA。
7. 使用正式签名密钥构建 AAB/APK；当前本地包只用于测试，不用于应用商店发布。

完整命令、SMTP、DNS、Secrets、MFA 和上线验收清单见 [联网后端部署指南](./docs/NETWORK_BACKEND.md)。

## DOSO 后缀邮箱

不能直接注册一个只有 `@DOSO` 的公网邮箱后缀。公司必须先购买并持有完整域名，例如 `doso.com` 或 `doso.cn`（示例不代表可注册或已持有），然后才能创建：

- `support@你的域名`：客服收件邮箱
- `no-reply@mail.你的域名`：注册验证和密码重置发件地址

域名购买、企业邮箱、DNS 的 MX/SPF/DKIM/DMARC，以及 Supabase Custom SMTP 的完整步骤见 [DOSO 域名邮箱配置指南](./docs/DOSO_EMAIL_DOMAIN.md)。

## 远程 GPS 定位

“我的 → 远程状态 → 查看位置”可展开 GPS 地图，支持拖动、缩放、旋转地球与“定位设备”。坐标使用 WGS84，定位采集时间超过 5 秒独立显示过期；旧设备无定位时不显示设备标记。模拟设备始终带模拟提示。地图只复用面板现有状态轮询，不传递登录 token。

底图默认使用 OpenFreeMap Liberty（保留 OpenStreetMap / OpenMapTiles 版权），可通过 `EXPO_PUBLIC_MAP_STYLE_URL` 替换兼容的 HTTPS MapLibre 样式。MapLibre GL JS/CSS 固定为 6.17.0，通过 unpkg 加载，需要联网与 WebGL；底图失败仍可查看原始时间和坐标。Web 使用 iframe，Android/iOS 使用 Expo SDK 57 推荐的 `react-native-webview` 13.16.1，需要重新构建原生客户端；原生候选实现仍须真机验证。

## 关键目录

- `src/auth/`：认证状态和会话恢复
- `src/services/`：Supabase 客户端、认证接口、设备数据接口
- `supabase/migrations/`：用户、登录终端、设备、审计、RLS 与权限
- `supabase/functions/`：账户、设备、管理员、邮件与机器人可信边界的服务端 API/worker
- `admin/`：不含 service-role key 的独立管理员 Web 端
- `supabase/tests/`：数据库和认证配置测试
- `scripts/verify-auth.mjs`：真实 Auth + Mailpit + RLS 端到端测试
- `scripts/verify-pkce-recovery.mjs`：按邮件模板自动验证恢复 OTP/PKCE，并覆盖修改密码重新认证 nonce
- `scripts/verify-network-backend.mjs`：终端撤销、设备绑定、权限隔离和管理员 MFA 端到端测试
