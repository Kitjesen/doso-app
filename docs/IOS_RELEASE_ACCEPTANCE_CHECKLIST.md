# DOSO iOS 首发验收推进清单

核对日期：2026-10-10。目标：iOS 原生界面内测 → TestFlight 可测版本 → 正式 App Store 发布。
本清单使用 QA test matrix 方法：前置条件、操作、可观察结果、平台和证据均明确后才可勾选。它不代替现有机器门禁，也不把 Android 结果迁移成 iOS PASS。

## 1. 当前真实状态

### 2026-10-10 增量（优先于下方历史基线）

- native-sim 首轮基础设施试跑完成：私有仓库、现有模拟器预览包、macos-26 runner；run `37962162592` success。iPhone 17 Pro / iOS 26.2 的包校验、安装、launch 与 10 分钟 stream 健康检查通过。job 共 12 分 44 秒，20 分钟硬上限未触及。
- 仅上传既有 27,989,066 bytes 的只读 simulator archive；私有仓库 Git tree 只有 4 个测试配置文件，无产品源码。CLI 与云端禁用 telemetry；未启用 agent、真实后端或设备操作。
- 浏览器 live 状态与 DOSO 身份已观察；保存了结束后带 Connecting 遮罩的首页残留画面。不能把它登记为活动会话截图、UI-01/UI-02/UI-03 或任何页面三态 PASS。页面操作受浏览器自动化响应慢影响，仍待定点实测。
- 会话于北京时间 01:04:33 自动结束，临时 URL 已失效；没有自动再启动。费用尚未从账单核定，不能用 timing API 的 0 或历史账单代替本次实际支出。
- 2 项本地授权 gate 测试通过；209 个归档文件与当前产品源码重新核对一致。设计验收仍 0/20，发布阻塞不变。证据见 `artifacts/release-readiness/20261010-native-sim-pilot/`。

### 2026-10-09 增量（优先于下方历史基线）

- 当前独立只读 iOS Simulator 包已构建并上传 Appetize：Build `948d1cf2-c94f-4842-a7b2-b50edabae1bf`，DOSO 0.0.1 (5)。无需自有 Mac 即已取得原生浏览器运行证据，未购买服务或提交商店。
- `ios-browser-preview` 继承 unsigned simulator Release，并以 `ENTRY_FILE=index.preview.ts` 选择隔离入口。源码归档、产物内入口标识及正式入口隔离已检查；生产认证门禁没有改变。
- 实测设备为云端 iPhone 14 Pro / iOS 17.2：冷启动进入首页、首页进入控制页及返回已观察并截图。不是物理 iPhone，也不是完整 UI-01/UI-03 验收；其余导航、主题、横屏、键盘因浏览器控制超时尚未完成。
- 证据目录：`artifacts/release-readiness/20261009-appetize/`；13 项构建检查、8 项离线预览检查、typecheck、iOS 独立入口导出通过。设计总清单仍为 0/20。
- Apple Developer / 正式签名 / TestFlight / 物理 iPhone、真实认证和设备闭环仍未验收。不得把本包作为生产在线包。

### 2026-09-18 历史基线

- 已有 Expo / React Native 跨平台 App、20 个 QA 页面入口和认证/设备服务基础代码，不需要另起一个 iOS 产品。
- 可安装与启动证据来自 2026-09-09 Android 离线 Preview，不是 iOS，也不是在线产品闭环。
- 现有设计清单：12 项 in_progress、5 项 needs_revalidation、3 项 stale，最终通过 0/20。
- `app.json` 已声明 `com.doso.robot`、buildNumber 5、Apple 登录和 Universal Links；声明不等于开发者后台配置有效。
- `supportsTablet: true`：目前包含 iPad。未经产品确认，不静默移除支持；如保留，必须追加 iPad 验收。
- `eas.json` 已新增 `ios-simulator`：internal / preview 环境 / Release / simulator=true，正式入口不变。Android QA Gradle 配置不能视为 iOS 离线预览入口。
- 用户确认 Apple Developer、Mac、iPhone 均没有。Expo/EAS 账户和项目已连接；正式签名分发/真机验收仍阻塞。可以通过 EAS 云端 Maestro 做模拟器自动测试，不必将缺少自有 Mac 当作所有 iOS 测试的阻塞。
- 本轮 typecheck 与 iOS JS/Hermes/资源 export 退出码均为 0；这不是原生 archive、IPA 或安装验证。
- 构建推进增量：Expo 已登录并关联用户项目 `@kitjesens-team/hongsen`；已提交 iOS simulator 云构建 `ca1d0d14-e5e6-48e9-8a39-fa26b6e71a61`。已校验真实上传快照与修复目录 allowlist；3 项构建配置测试和 BLE 配置检查通过。尚无 iOS 运行/安装证据，云 preview 环境也未配置后端参数；IOS-02/03 部分推进，不标整项通过。
- 最新结果：上述云构建 FINISHED，已下载并核验 0.0.1 (5) 原生 universal simulator 包；IOS-04 编译子项完成，启动子项待 EAS Maestro 验证。7 项构建/工作流保护测试及官方 workflow schema 校验通过；不登记页面或真实认证通过。
- 云模拟器运行阻塞：EAS 拒绝创建 Maestro 任务，明确要求付费套餐；未购买、未生成 run ID、未产出 UI 证据。升级 EAS 或提供 Mac 是运行测试的外部条件，不能把此阻塞登记为 App 用例失败。
- BLE 只有 `bleDiscoveryAdapter.android.ts`；通用 adapter 返回 unsupported。权限测试明确要求 iOS BLE 权限说明保持缺省。不能只加权限文案就声称 iOS 蓝牙可用。
- 未在 App/src/函数检索中定位完整账户删除入口与处理链路；存在注销邮件模板，但模板不是已完成注销。
- 真实配网、OTA、运动执行仍未完成。控制/路线/任务预览不能当作机器人已执行。

## 2. 验收规则与里程碑

状态只允许：待执行、进行中、阻塞、失败、通过；缺证据不得标通过。下列未勾选项均未通过。

优先级：P0 阻止安装、账户安全、核心功能或发布；P1 主流程/可用性缺陷；P2 视觉与次要交互缺陷。沿用既定正式验收要求，P0/P1/P2 未清零不登记页面通过。

顺序：M0 范围与构建条件 → M1 iOS 原生首包 → M2 认证/页面/设备收敛 → M3 TestFlight 候选 → M4 App Store 提交。
内部 TestFlight 里程碑可以承载已披露的非危险缺陷；不能称为正式验收完成。外部 TestFlight 与商店提审单独处理。
不承诺尚未核验的上线日期；M1 成功后，按剩余失败用例和外部依赖估算排期。

## 3. 按依赖排序的阻塞项

责任是待分配的角色，不表示已有人接单：工程=当前源码与自动化；产品=用户/产品负责人；平台=Apple/EAS/后端管理员；设备=机器人固件与测试负责人。

| ID | 优先级/里程碑 | 待完成项 | 完成证据 | 责任/依赖 |
| --- | --- | --- | --- | --- |
| IOS-01 | P0 / M0 | 确认首发承诺：实际机器人管理与控制有哪些；未完成能力是延期还是本次补齐 | 签字范围与商店描述一致；不将纯预览包装为完整机器人产品 | 产品+设备 |
| IOS-02 | P0 / M0 | 核验 Apple Developer、App Store Connect、Bundle ID、签名与 EAS 工程/Mac 可用性 | 团队权限与构建记录；文档不保存私钥 | 平台 |
| IOS-03 | P0 / M1 | 区分 simulator、在线 development/internal、production 配置；如需免登录仅做隔离预览 | iOS 构建产物、入口隔离测试，正式包不存在 QA 绕过 | 工程；IOS-02 |
| IOS-04 | P0 / M1 | 原生依赖、Info.plist、entitlements、SDK 隐私声明与启动检查 | Xcode/EAS archive 成功；安装启动录屏；无启动崩溃 | 工程+Mac/iPhone |
| IOS-05 | P0 / M2 | 托管身份迁移、邮箱认证、回调域名与 Apple 登录逐项核验 | 测试账户完整 E2E、投递与回调记录 | 工程+平台 |
| IOS-06 | P0 / M2 | App 内账户删除及服务端执行、会话撤销、设备归属处置 | 一次性测试账户删除证据；不能仅退出或禁用账号 | 工程+平台；删除策略由产品确认 |
| IOS-07 | P1 / M2 | 安全区、键盘、导航、动态字体、主题和横屏公共壳层冻结 | iPhone 原生截图与交互录屏，无遮挡和误触 | 工程 |
| IOS-08 | P1/P2 / M2 | 20 页 iOS 三态、必要异常交互、Figma 对齐逐页收敛 | 每页证据与当前源码/构建一致，20/20 | 工程；IOS-07 |
| IOS-09 | P0 / M2 | iOS BLE adapter、权限、取消与扫描恢复 | iPhone + 真实设备广播记录；不把发现当认证成功 | 工程+设备 |
| IOS-10 | P0 / M2 | 首发承诺的配网、可信遥测与真实命令闭环 | iPhone↔服务↔机器人证据；权限/离线/ACK 超时安全 | 工程+设备；IOS-01/09 |
| IOS-11 | P0 / M2 | 首发如含 OTA，补签名校验、中断恢复、兼容与回滚 | 测试机器人上的失败注入与恢复记录 | 设备+工程；不得在用户设备试验 |
| IOS-12 | P0 / M3 | iOS 独立证据门禁，不能只执行现有 Android capture 检查 | 自动拒绝 Android/Web/过期证据；iOS 全量检查通过 | 工程 |
| IOS-13 | P0 / M3 | TestFlight 真机验收：新装/升级/杀进程/弱网/回前台 | 对应 build number 的回归报告、崩溃记录 | 工程+测试用户 |
| IOS-14 | P0 / M4 | 隐私政策、App Privacy、支持地址、截图、年龄/加密申报、审核账号与硬件说明 | 与最终包功能/实际数据处理一致的提交包 | 产品+平台 |
| IOS-15 | P0 / M4 | 最终 release gate、生产签名、候选包和服务环境冻结 | 签名构建、全量 PASS、版本/证据对应；提交授权另行确认 | 工程+平台 |

延期任何既定能力需产品明确决定，并同步 Figma、入口、帮助和商店文案；不得通过删除用例或放宽门槛制造通过率。

## 4. 平台与设备矩阵

| 维度 | 必测组合 | 验收边界 |
| --- | --- | --- |
| iOS 版本 | 实际部署最低版本 + 发布时当前稳定版本 | SDK 57 文档最低 iOS 16.4、Xcode 26.4；以最终构建配置和当期 Apple 要求复核 |
| iPhone | 支持范围内小屏、常规屏、大屏；至少一台物理 iPhone | 模拟器验证布局/导航；真机验证签名、Apple 登录、BLE、前后台 |
| 外观 | Light 竖屏、Dark 竖屏、Light 横屏；Dark 横屏做功能回归 | 标准设计画布 390×844 / 844×390；实际设备另做适配，不拉伸伪装同尺寸 |
| 字体与辅助功能 | 默认/放大/辅助功能大字体、VoiceOver、减少动态效果 | 大字体允许重排滚动；关键操作不截断、顺序可读、点击区 ≥44pt |
| 网络与生命周期 | 正常、断网、慢网、请求中切后台、杀进程恢复 | 无重复提交、假成功或敏感数据串账户 |
| iPad | 当前配置开启：竖/横屏、分屏及键盘 | 是否首发支持待确认；保留即必测 |
| 构建 | Simulator / 签名内部包 / TestFlight 候选 | 各自记录标识；Web、JS export、Android APK 不替代 IPA 安装证据 |

## 5. 必过行为用例（勾选需附证据）

| 状态/ID | 前置条件 | 操作 | 可观察预期 |
| --- | --- | --- | --- |
| [ ] AUTH-01 | 一次性邮箱、staging 服务可用 | 注册→收 OTP→校验→进入 App | 只建一个账户；会话和用户一致；服务端状态可核对 |
| [ ] AUTH-02 | 已发验证码 | 错误码、过期、重发、连点、后台返回 | 明确错误；倒计时正确；旧码按合同失效；无重复请求 |
| [ ] AUTH-03 | 已注册测试账户 | 密码登录→杀进程→重开→退出 | 正确恢复；退出后不能访问前用户私有数据 |
| [ ] AUTH-04 | 找回密码请求已发 | 冷/热启动打开回调→重设→旧链接重用 | 正确路由；成功后过期链接不可复用；取消可恢复 |
| [ ] AUTH-05 | Apple Provider、签名和回调配置完成 | Apple 首登/再次登录/取消/隐藏邮箱/撤销授权 | 资料与身份一致；取消无假错误或假成功；凭据安全处理 |
| [ ] AUTH-06 | 测试账号与关联测试设备 | App 内申请删除→重新认证/确认→完成删除 | 服务端删除；会话失效；设备与保留数据按已确认政策处理；Apple token 如适用被撤销 |
| [ ] AUTH-07 | 资料待补全或 MFA 测试账户 | 用户名冲突、资料确认、MFA 错误/取消/恢复 | 无绕过、无死路、重试保留合适输入；策略与角色一致 |
| [ ] UI-01 | 安装 iOS 候选包 | 五导航切换→各子页→返回/可用返回手势 | 当前页与选中态一致；状态保留符合设计；不卡登录 |
| [ ] UI-02 | 表单页，键盘已打开 | 最后输入框、下一项、提交、旋转、放大字体 | 焦点/错误/主按钮可达；安全区无重叠；横向不溢出 |
| [ ] UI-03 | 独立预览与正式包 | 预览直接进首页；正式包尝试 QA query/deep link | 预览无真实副作用；正式包无免登录绕过与开发工具栏 |
| [ ] DATA-01 | 无设备/离线/遥测过期 | 打开首页、分析、控制 | 无假电量、假在线、假成功；危险操作不可执行 |
| [ ] DEVICE-01 | 测试设备序列号/绑定码 | 有效、错误、重复绑定、超时后重试、跨账号访问 | 归属可信；歧义先核对服务状态；无重复绑定或越权 |
| [ ] BLE-01 | 物理 iPhone + 测试广播设备 | 未授权/拒绝/关闭蓝牙/扫描/空结果/取消/恢复 | 不崩溃；状态真实；可恢复；停止后不继续扫描 |
| [ ] DEVICE-02 | 已认证测试机器人和测试 AP | 配网成功、密码错误、断线、取消、重配 | 凭据不泄露；成功须可信联网确认；无假成功 |
| [ ] CONTROL-01 | 隔离安全场地、授权操作员、测试机器人 | 提交命令、连点、无权限、断线、迟到/错误 ACK | 一次执行；拒绝越权；超时不假成功；实体停止/安全恢复按合同验证 |
| [ ] OTA-01 | 可恢复测试机器人、签名/坏镜像 | 校验失败、型号不符、断网、受控断电、回滚 | 坏镜像不执行；可恢复；重启后版本与状态可信 |
| [ ] RELEASE-01 | 签名 TestFlight 候选与历史测试版本 | 新装、升级、首次权限、重启、长时间前后台 | 无崩溃/白屏/资料丢失；登录状态与权限符合策略 |

真实邮件、删除、部署及机器人动作测试必须限定专用环境和测试身份；涉及外部状态的操作先确认目标，不使用用户真实资产进行破坏性测试。

## 6. 20 页 iOS 验收台账

以下全部为待执行；每页必须同时满足 Light、Dark、Landscape、交互和当前证据。MFA/配网/固件等关闭能力验证真实限制，不能勾选为功能已接通。

| 批次 | 页面 ID | Light | Dark | Landscape | 交互 |
| --- | --- | --- | --- | --- | --- |
| A 公共壳/主导航 | main-home | [ ] | [ ] | [ ] | [ ] |
| A | main-routes | [ ] | [ ] | [ ] | [ ] |
| A | main-tasks | [ ] | [ ] | [ ] | [ ] |
| A | main-analysis | [ ] | [ ] | [ ] | [ ] |
| A | main-profile | [ ] | [ ] | [ ] | [ ] |
| B 认证（与 A 并行工作流） | auth-login | [ ] | [ ] | [ ] | [ ] |
| B | auth-register | [ ] | [ ] | [ ] | [ ] |
| B | auth-email-otp | [ ] | [ ] | [ ] | [ ] |
| B | auth-forgot-password | [ ] | [ ] | [ ] | [ ] |
| B | auth-reset-password | [ ] | [ ] | [ ] | [ ] |
| B | auth-username | [ ] | [ ] | [ ] | [ ] |
| B | auth-display-name | [ ] | [ ] | [ ] | [ ] |
| B | auth-mfa | [ ] | [ ] | [ ] | [ ] |
| B | account-security | [ ] | [ ] | [ ] | [ ] |
| C 设备 | model-select | [ ] | [ ] | [ ] | [ ] |
| C | device-bind | [ ] | [ ] | [ ] | [ ] |
| C | device-ble-discovery | [ ] | [ ] | [ ] | [ ] |
| C | device-provisioning | [ ] | [ ] | [ ] | [ ] |
| C | device-firmware | [ ] | [ ] | [ ] | [ ] |
| C | robot-control | [ ] | [ ] | [ ] | [ ] |

每页：确认服务边界 → Figma 定点修正并冻结节点 → 最小源码改动 → 交互测试 → iOS 截图 → 同尺寸对比 → 修复 → 登记通过。
统一阈值沿用原计划：MAE≤12；delta>16≤15%；delta>32≤8%；SSIM≥0.80。关键区域 SSIM≥0.90，位置/间距≤4pt，字号/行高≤1pt，点击区≥44pt。仅可遮罩动态系统栏；不可遮掉正文或按钮。
证据目录建议 `artifacts/ios-acceptance/<run-id>/<page-id>/`，保存 Figma/App/Comparison 三态、QA、verification/evidence JSON。记录 platform=ios、设备/OS、point/pixel尺寸与缩放、Bundle ID、版本/build、Figma 节点、Git SHA及工作树文件哈希、命令退出码和日志。脏工作树不能只写 HEAD SHA。
UI 20/20 不代表账户删除、BLE、真实控制等发布用例通过，二者均必须满足。

## 7. 下一执行队列

外部资源最低路径：Apple Developer 团队用于正式签名/TestFlight/App Store；EAS 云构建可替代自有 Mac 的编译工作；借用或准备一台受支持的物理 iPhone 用于 TestFlight、Apple 登录和 BLE。模拟器 UI 内测已有 EAS Simulator 包；Appetize 为历史通道，native-sim + 私有 GitHub macOS runner 的首轮安装/启动链路已成功。native-sim 会话按需启动、短时有效且可能消耗 Actions 额度；不是持续在线服务，不代替物理 iPhone 或正式签名。资源方案不自动开户、购买或提交商店。

1. 当前完成：源码/配置/门禁基线审查；建立此清单；本轮本地检查结果另见 `artifacts/release-readiness/20260918-ios-preflight/README.md`。
2. 工程可直接推进：iOS 配置与证据工具、认证与安全检查；不等待 Figma 连接才开始功能工作。
3. 已完成当前 Simulator 包构建、历史 Appetize 首页/控制页冒烟及 native-sim 基础链路试跑。下一轮先补 native-sim 首页→控制预览→返回的实际交互和无遮罩截图；进入前准备好定位与采集步骤，避免准备工作占用会话时间。随后补其他导航、主题、键盘、横屏、大字体与 VoiceOver；每次云端运行另行确认费用/时长边界。在线内部签名包及真实认证独立验收。
4. A/B 页面和认证闭环收敛，同时确认 iOS BLE 与首发硬件合同；不再无限换风格。
5. 打 TestFlight 候选、真机回归、最终证据门禁，最后准备并获准提交商店。

## 8. 依据与外部条件

- 本地：`docs/CURRENT_RELEASE_STATUS.md`、`docs/design/DESIGN_ACCEPTANCE_MANIFEST.json`、`app.json`、`eas.json`、`src/features/robot-lifecycle/bleDiscoveryAdapter.ts`、`scripts/verify-ble-introspection.mjs`、`scripts/verify-release-gate.mjs`。
- [Expo SDK 57 平台要求](https://docs.expo.dev/versions/v57.0.0/)：2026-09-18 核对，iOS 16.4+、Xcode 26.4+。
- [Expo iOS Simulator 构建](https://docs.expo.dev/build-reference/simulators/)：模拟器构建与设备构建区分；iOS Simulator 运行需要 Mac，Windows 可以准备源码及使用云构建路径，但不能冒充本机原生验收。
- [Apple 账户删除要求](https://developer.apple.com/support/offering-account-deletion-in-your-app)：提供注册的 App 需提供 App 内发起账户删除的能力；不是仅注销登录。
- [Apple Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) 与 [App Review](https://developer.apple.com/app-store/review/)：检查完整性、登录方式、隐私；提供有效审核账户及必要硬件说明/演示材料。实际申报、商业范围与提交由产品/平台负责人确认。
