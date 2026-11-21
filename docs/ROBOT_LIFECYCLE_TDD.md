# DOSO 安全配网与机器人固件 OTA 技术设计

> 状态：领域模型、App gateway 行为合同、Android 前台 BLE discovery adapter/UI、原生 debug 构建与模拟器启动已实现
> 证据等级：`SIMULATED + BLE_DISCOVERY_NATIVE_BUILD`；尚无物理 BLE 扫描证据
> 客户端版本由独立 release baseline 管理；本切片不修改版本号
> 本文中的 OTA 指机器人固件 OTA，不是 Expo/EAS 的客户端 JavaScript 更新。

## 1. 目标

本阶段同时建立两个相互独立、可执行验证的产品模块：

1. 蓝牙/Wi-Fi 安全配网：验证制造身份，建立短时一次性会话，仅在安全信道就绪后发送 Wi-Fi 凭据，并等待机器人签名的联网确认与云端所有权复核。
2. 机器人固件 OTA、升级与回滚：校验签名 manifest 和硬件兼容性，执行下载、校验、安装、重启、健康检查和 last-known-good 回滚状态机。

首个模拟切片的成功标准是纯 TypeScript 领域模型、确定性 Node 模拟器、App gateway 行为测试和静态 UI/wiring guard 全部可运行；当前追加的 discovery 切片把真实 Android 权限、旧系统定位开关预检、BLE 初始化、扫描状态/失败码和候选列表接到独立 adapter，并已通过原生 debug 构建和模拟器启动。现有证据仍不包含物理 BLE 扫描、GATT 身份验证、Hosted OTA、bootloader 或机器人测试。

## 2. 非目标

- 当前 discovery 切片只做 Android 前台权限与扫描，不连接、不配对、不发现 GATT profile，也不写入 characteristic。
- 不在 Expo Go 中声明真实 BLE 能力。
- 不传输真实 Wi-Fi 凭据，不保存测试凭据。
- 不发布真实固件二进制，不建立 CDN、签名服务或生产密钥。
- 不把进程内下载 journal 描述为掉电后可恢复；持久化分块校验和阶段 watchdog 仍属于嵌入式/托管集成工作。
- 不直接让 App 更新 `devices.firmware_version` 或上报 OTA 成功。
- 不把 Expo Updates/EAS Update 当作机器人固件通道。

## 3. 约束与假设

- 项目使用 Expo SDK 57。真实 BLE 原生模块必须进入 Development Build/生产二进制；新增原生模块或 config plugin 后需要重新构建。
- 现有制造身份、一次性 challenge、授权 epoch、签名 ACK 和日志脱敏语义继续作为信任基础。
- 机器人必须具备不可由 App 伪造的设备身份。真实量产方案还需要制造 PKI、安全密钥存储和吊销分发。
- 真实回滚要求机器人拥有双分区或等价的原子激活机制，并能启动已验证的 last-known-good 镜像。
- App 是编排与展示端，不是设备状态、固件签名或升级结果的权威来源。

## 4. 运行时架构与所有权

| 模块 | 所有者 | 公共接口 | 持久化 |
| --- | --- | --- | --- |
| `src/domain/device-provisioning` | 客户端/协议领域层 | 配网状态、事件与纯状态推进函数 | 不持久化 Wi-Fi 凭据；首个切片不持久化会话 |
| `src/domain/firmware-lifecycle` | 客户端/协议领域层 | manifest、设备资格、OTA 状态、事件与纯状态推进函数 | 首个切片不持久化；生产由云端作业与设备日志持久化 |
| `src/features/robot-lifecycle/provisioningGateway.ts` | App 演示配网 seam | 准备/发现留在 UI 前置状态；认证后统一调用领域 reducer，派生遮罩 SSID、事件序号、故障和终态 | 仅组件内存；不接收或保存密码；只供预览/demo 设备使用 |
| `src/features/robot-lifecycle/firmwareUpdateGateway.ts` | App OTA seam | 使用领域 reducer 推进资格、下载 offset、校验、A/B 安装、健康检查、回滚与人工恢复 | 仅组件内存；真实设备注入 unavailable gateway；不接入 Node 模拟器 |
| `src/screens/ProvisioningScreen.tsx` / `FirmwareUpdateScreen.tsx` | 移动端产品 UI | 当前仅有静态 UI/wiring guard 证明页面注入 gateway、保留演示标识与阻塞文案 | 尚无组件交互或 E2E 证据；不持久化演示作业 |
| `bleDiscoveryAdapter.android.ts` / `bleDiscoverySession.ts` / `BleDiscoveryScreen.tsx` | Android 真机发现 seam | 请求 SCAN/CONNECT 或旧版位置权限，检查旧系统定位开关，处理 0/10 正常停止与原生失败码，取消时清理监听与扫描 | 仅组件内存；候选身份未验证；没有 connect/write/Wi-Fi 输入；原生 debug build 已通过，物理扫描尚未验收 |
| `iot/simulator/provisioning-simulator.ts` | 验证工具 | 制造身份、唯一活跃配网会话、云签名一次性凭据授权、签名设备事件/联网确认、故障注入 | 仅进程内存；输出统一标记 `SIMULATED` |
| `iot/simulator/firmware-lifecycle-simulator.ts` | 验证工具 | 签名 manifest/回滚证明、A/B 槽、下载/安装/重启/超时故障注入 | 仅进程内存；输出统一标记 `SIMULATED` |
| 未来 `GattProvisioningTransport` adapter | 移动端原生集成 | 从已发现候选继续连接、认证、提交一次性凭据、订阅签名报告、取消 | 短时密钥只进 SecureStore 或原生安全存储；Wi-Fi 密码不落盘 |
| 未来 OTA 云端模块 | Supabase/设备网关 | 查询可用版本、创建/查询作业、取消、请求回滚 | manifest、作业、事件、幂等键、审计；不保存下载授权秘密明文 |
| 未来机器人固件模块 | 嵌入式/bootloader | 验签、下载、槽位写入、原子激活、启动健康检查、回滚 | 设备安全存储、单调计数、last-known-good 槽与签名事件 |

Node 模拟器不得被 `src/` 导入，避免把 `node:crypto` 打进 Expo bundle。App、测试和生产 adapter 必须跨越同一个领域接口 seam。

## 5. 安全配网合同

### 5.1 状态

```text
Android foreground discovery（原生 debug build 已接入；物理扫描待验收）
  → transport opening / GATT authentication（后续 adapter）
  → authenticating
  → secure_channel_ready
  → connecting
  → awaiting_confirmation
  → succeeded

任一允许取消的非终态 → cancelled
会话超时 → expired
Wi-Fi 认证失败或设备拒绝 → failed
所有权、授权 epoch 或恢复出厂计数变化 → invalidated
连接恢复 → 保持 connecting，只查询同一会话且不重写凭据
```

`succeeded`、`failed`、`cancelled`、`expired`、`invalidated` 是不可逆终态。同一设备同一认证主体的重复 `begin` 返回现有活跃会话，避免 UI 双击创建两条凭据通道；主体变化会原子失效旧会话，终态后的主动重试才创建新的 session、nonce 和临时密钥。设备连接、断开和失败事件必须签名并使用严格递增的设备事件序号；用户取消必须由当前活跃账户、终端和认证 session 发起。Android 权限与广播发现属于独立 discovery seam；BLE 连接/GATT 认证仍属于未来 transport，二者都不伪造领域成功事件。

### 5.2 状态接口

配网状态只允许包含：

- `provisioningId`、`challengeId`、nonce、`deviceId`、账户/终端/认证 session 绑定、`authorizationEpoch`、`factoryResetCounter` 和设备事件单调序号；
- 当前 phase、签发/过期时间、凭据是否已由设备接受；
- `wifi_authentication_failed` 或 `device_rejected` 结构化失败码和不含秘密的安全提示。

配网状态、事件、日志、错误、审计和测试证据均不得包含 SSID 密码、临时密钥、可重放的 credential envelope 或完整签名材料。

### 5.3 成功条件

同时满足以下条件才能进入 `succeeded`：

1. 设备制造身份处于 active，challenge 签名有效且未重放。
2. 配网会话未过期，device/session/authorization epoch/factory-reset counter 全部匹配。
3. 安全信道和设备 proof 已由协调器确认；协调器签发绑定 provisioning/challenge/device/auth session/authorization epoch/factory-reset counter/expiry 的一次性 credential-write authorization，机器人端独立验签后才接受凭据。取消、过期、授权撤销、所有权变化或主体替换会 fence 设备端旧授权；设备保留已撤销 authorization ID，缓存的旧签名 envelope 不能重新激活。
4. 机器人返回签名且序号严格单调的连接状态/联网报告，报告绑定 provisioning/challenge/nonce、设备、认证 session、epoch 和恢复出厂计数。
5. 云端再次确认设备所有权未变化。

BLE 写入成功、手机连接到 Wi-Fi、设备可被扫描到或现有“序列号 + 绑定码”认领均不能单独视为配网成功。

## 6. 固件 OTA 合同

### 6.1 Manifest

manifest 至少包含：

- manifest/release ID 与版本；
- 目标 model code、hardware revisions、最低 bootloader；
- 签名的最低升级电量；
- 镜像 size、SHA-256、发布/过期时间与单调 release sequence；
- rollback policy；
- 使用独立固件发布信任根生成的签名。

固件签名密钥与机器人命令控制密钥分离。App 不接受任意下载 URL，也不能用服务端布尔字段代替本地/设备侧验签结果。

### 6.2 状态

```text
idle
  → scheduled
  → downloading
  → verifying
  → installing
  → rebooting
  → health_checking
  → succeeded

installing/rebooting/health_checking 故障或健康检查超时
  → rollback_pending
  → rolling_back
  → rolled_back | recovery_required
```

不可信或不满足资格的 manifest 在创建作业前直接拒绝，不进入状态机。单次作业内的 `succeeded`、`failed`、`rolled_back`、`recovery_required`、`cancelled` 是不可逆终态。除 `recovery_required` 外，设备协调器可在保留 release sequence、活动槽、last-known-good 槽和 boot identity 的前提下创建下一作业。取消只允许发生在 `scheduled` 或 `downloading`；进入安装后 App 不能强制取消或改写结果。

### 6.3 资格与成功条件

创建作业前必须验证：

- manifest 签名、有效期、镜像 hash/size；
- 型号、硬件 revision、bootloader 和 release sequence 兼容；
- 设备在线、电量达到 manifest 下限、未执行任务；
- 同一设备没有另一个不同 release 的活动作业；
- `(deviceId, releaseId)` 重复请求返回同一作业。

只有候选槽重启成功并返回签名健康报告后才能进入 `succeeded`。健康报告必须绑定 device/release/job/progress/boot/slot/version 和设备观测时间；设备观测时间与协调器的权威接收时间都必须位于本次健康检查窗口内，且观测时间不得晚于接收时间。健康检查失败或超时会由协调器自动执行回滚。只有设备签名且绑定 device/release/job/progress/boot/slot/version 的回滚证明才能进入 `rolled_back`；回滚目标只能是已验证的 last-known-good 槽，证明无效则进入 `recovery_required`。

## 7. 失败模式与恢复

| 失败 | 行为 | 恢复 |
| --- | --- | --- |
| 未知/吊销设备身份 | 配网失败，凭据发送次数保持 0 | 制造/售后流程恢复身份后创建新会话 |
| 同设备重复发起 | 同一认证主体复用活跃会话；主体变化时旧会话原子失效 | Hosted 阶段用事务/RPC与部分唯一约束保证单活跃会话 |
| 会话过期、重放或跨设备 | 拒绝事件，终态不改变 | 创建全新会话并重新认证 |
| 取消、授权撤销或所有权变化 | 云端会话进入终态并向设备交付 authorization fence，旧 envelope 不再可写 | 生产 transport 必须认证 fence；若设备离线则依赖短 TTL 且不得重新签发旧授权 |
| Wi-Fi 认证失败 | 当前 attempt 失败 | 用户重新输入；不得缓存旧密码自动重试 |
| 配网确认前断线 | 保持 `connecting`，只接收同一会话的签名设备报告 | 若无法确认则过期；不得再次发送凭据 |
| manifest 不可信或不兼容 | 作业不创建 | 发布系统修复 manifest |
| 下载中断（当前模拟） | 进程内保留 offset、长度 journal 和单调进度 | 同进程内按同一 job 续传；生产必须增加持久化分块校验、掉电恢复和下载 watchdog |
| 校验失败 | `failed`，不得进入安装 | 丢弃候选镜像 |
| 安装/重启/健康检查失败或超时 | `rollback_pending` 并自动启动回滚 | 仅接受签名的 last-known-good 回滚证明；失败或证明无效则 `recovery_required` |

## 8. 测试、遥测与性能

- `npm run test:robot-provisioning` 验证制造身份、唯一活跃会话、安全凭据 envelope、签名设备事件、重放/时间边界、故障恢复、终态、秘密零泄漏和恢复出厂失效。
- `npm run test:firmware-lifecycle` 验证 manifest、签名电量策略、跳序灰度、资格、reducer 幂等、连续多作业、完整健康/回滚证明、A/B 槽和健康超时/阶段故障自动回滚。
- `npm run test:provisioning-ui` 须以脚本最终 summary 全部通过：验证配网领域模型经 `provisioningGateway` 推进的演示/真实设备隔离、严格阶段、密码与原始 SSID 零留存、SSID 遮罩、断连恢复、过期与取消；其中页面检查是源码级静态 UI/wiring guard。
- `npm run test:firmware-update-ui` 须以脚本最终 summary 全部通过：验证 OTA 领域模型经 `firmwareUpdateGateway` 推进的资格、25% 到 100% 下载、取消边界、成功/自动回滚/人工恢复；其中页面检查是源码级静态 UI/wiring guard。
- `npm run test:ble-discovery` 以 13 项模型/行为/静态/introspection 检查验证候选分类与命名保留、Android 新旧权限/定位分支、正常/超时/失败停止码、取消/后台/迟到事件清理、平台 fallback、Development Build/config plugin 和“无连接/无写入”边界；这仍不是物理扫描证据。
- `npm run test:robot-lifecycle-ui` 验证“我的设备”入口、App stage、Android 返回分支和 demo eligibility 的静态 wiring；`npm run test:trusted-device-data-ui` 以静态 guard 阻止无来源电量、运行时长、传感器、温度、任务进度、路线位置和告警结论重新出现，并验证任务/路线命令 fail-closed。
- App 模拟流程证据口径仍是“领域模型 + gateway 测试 + 静态 UI/wiring guard”。BLE discovery 另有原生构建和 Android 模拟器启动证据，但不证明物理 BLE、GATT、Android/iOS 真机交互或机器人硬件链路。
- `npm run test:release-gate` 顺序执行生产基线、三个机器人离线合同、BLE discovery 代码门禁和 TypeScript 检查，任一步失败即停止并透传退出码；最终明确区分“discovery code gate 通过”和“GATT/Wi-Fi/真实控制仍阻塞”。
- 协议/模拟器脚本的证据行以 `SIMULATED` 开头；BLE discovery 可标记 code gate 与 native debug build，但不得扩写成物理扫描或安全配网通过。
- 生产遥测不得含 Wi-Fi 密码、临时密钥、下载 token 或完整签名。只记录 correlation ID、状态、结构化失败码、耗时和单调序号。
- BLE 配网会话目标 TTL 为分钟级；OTA 状态查询需退避并优先使用设备/网关事件，不做高频轮询。

## 9. 推进与放行

1. `SIMULATED`：领域模型、gateway 行为测试和静态 UI/wiring guard 的最终 summary 全部通过；不等同于组件交互、E2E 或真机通过。
2. `BLE DISCOVERY CODE`：`react-native-ble-manager`、config plugin、Android adapter、真实设备路由与前台扫描 UI 通过类型/行为/静态/Metro 门禁。
3. `DEVELOPMENT BUILD`：debug APK 编译与模拟器启动已通过；当前继续在 Android 物理手机完成权限、打开/关闭蓝牙/定位、真实扫描、停止、失败码、重试和监听清理；随后冻结 GATT 并实现认证、单次凭据写入和确认。iOS 单独验收。
4. `HOSTED STAGING`：部署配网会话、固件 manifest、OTA 作业和事件的服务端合同，验证 RLS、幂等和审计。
5. `PHYSICAL FIXTURE`：静止机器人完成安全配网；OTA 通过断网、断电、坏签名和坏镜像故障注入。
6. `PRODUCTION CANARY`：生产密钥、签名制品、正式客户端和少量设备灰度。

在第 4 阶段完成前，`ROBOT-PROVISION-001` 和 `ROBOT-FIRMWARE-001` 不能从 `BLOCKED` 改为 `PASS`。

## 10. 已决定与延后决定

### 已决定

- 配网与 OTA 是两个独立深模块，共享身份与签名原则，但不共享状态机。
- 首个模拟切片使用纯 TypeScript reducer、Node 模拟器和 App gateway；后续 discovery 切片选定 `react-native-ble-manager@12.5.1`，只开放 Android 前台广播发现。
- 配网成功以签名联网确认 + 云端所有权复核为准。
- OTA 成功以候选槽签名健康证明为准；失败优先自动回滚。
- Expo Updates 只处理手机客户端代码，不处理机器人固件。

### 延后决定

- GATT profile 与连接 adapter：机器人固件提供可评审的服务/特征、MTU、分片和密钥协商协议后实现；discovery 库选择不再等待该协议。
- 配网安全信道算法：在硬件安全能力、制造证书和固件密码库确定后形成 ADR。
- 固件制品格式、签名算法、A/B 分区布局与恢复模式：在芯片、bootloader 和 Flash 布局确认后形成嵌入式 ADR。
- Supabase 表、Edge Function 和设备网关接口：在模拟合同稳定且负责人批准持久化模型后实施。
