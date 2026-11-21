# DOSO 机器人 App 下一阶段研究与产品设计报告

> 日期：2026-08-25
> 客户端基线：`0.0.1`
> 研究对象：现有 DOSO Expo / React Native 客户端
> 结论状态：可进入下一 App 产品切片；真实安全配网与机器人 OTA 仍为 `BLOCKED`

## 1. 执行结论

DOSO 下一阶段最值得做的不是新增底部 Tab，也不是把 GATT、密钥协商、bootloader 或 A/B 分区暴露给普通用户，而是建立一个统一的 **设备就绪中心（Device Readiness Center）**，把用户真正关心的四件事串成一条生命周期：

1. 机器人是不是我的。
2. 机器人能不能稳定联网。
3. 机器人当前是否健康、是否需要处理问题。
4. 固件能否安全更新；失败后是已回滚，还是需要售后恢复。

这个中心应继续放在“我的设备”中，不新增底部导航。它复用现有 `ProvisioningScreen`、`FirmwareUpdateScreen`、gateway 和设计 token，只新增一个状态摘要与引导层，使现有分散入口变成一条连续、可恢复、诚实呈现状态的用户旅程。

### 决策

- **P0 下一实现切片：**“我的设备”顶部增加设备就绪摘要，进入后呈现“认领 → 网络 → 固件 → 就绪”清单，并根据真实/模拟状态给出唯一主行动。
- **P0 同步修复：**统一登录、注册、密码恢复在手机/Web 窄视口下的内容宽度；当前登录与注册页在 390 px 视口内只使用了约三分之二宽度，而密码恢复页宽度正常。
- **P0 不变边界：**真实设备没有通过身份验证时，不能出现 Wi-Fi 凭据输入；没有托管 OTA、设备端签名校验和回滚证据时，不能显示真实升级成功。
- **P1：**家庭/团队共享、更新窗口、诊断导出、通知服务。
- **P2：**多设备总览、局域网离线控制、企业 Wi-Fi、现场批量配网。

## 2. 研究问题与方法

本轮研究回答三个问题：

1. 在现有配网与 OTA 演示闭环之上，哪一条 App 用户旅程最值得优先完善？
2. 机器人行业的成熟产品如何处理首配、换网、设备健康、固件更新、故障恢复与共享？
3. Android、iOS 和通用 IoT 安全规范对真实 BLE 配网与设备固件 OTA 有哪些不可绕过的要求？

方法：

- 代码与文档审查：现有导航、设备页、配网、OTA、发布状态和验证矩阵。
- 视觉审计：在 390 × 844 视口审查当前可访问的登录、注册和密码恢复流程。
- 第一轮外部研究：Expo、Android、Apple、NIST、ETSI、EU 官方资料。
- 第二轮缺口补齐：iRobot、ECOVACS、Roborock、DJI 官方支持资料，以及 ESP-IDF、MCUboot 官方实现文档。

## 3. 当前产品基线

### 已支持

- 邮箱注册、登录、验证码与密码恢复的客户端流程。
- 设备认领、机型预览、首页、路线/任务预览、分析和“我的设备”导航。
- 安全配网和机器人固件 OTA 的纯 TypeScript 领域状态、模拟 gateway 和静态 UI/wiring 门禁。
- Android BLE 前台发现的原生依赖、权限/config、候选列表与 debug APK 构建证据。
- 配网/OTA 的模拟与真实设备路径隔离；真实设备不允许借用模拟成功状态。
- 任务、路线、遥测和通知在没有可信数据时保持禁用或明确“待接入”。

### 尚未完成

- Android 物理手机真实广播扫描验收；iPhone 真机 BLE 路径。
- 机器人身份验证、GATT 服务/特征、临时安全会话和 Wi-Fi 凭据写入。
- Hosted OTA 的签名制品、发布 manifest、作业、审计和恢复。
- 机器人 bootloader、A/B 或等价回滚、首次启动健康确认和故障注入测试。
- 可信在线、电量、故障、命令 ACK、任务和路线数据源。

因此，当前可以继续完善 App 的产品闭环和自动化交互测试，但不能把 `SIMULATED PASS`、原生编译或模拟器启动扩写成真实配网/OTA 已完成。

## 4. 当前界面视觉审计

审计范围仅覆盖无需有效测试账户即可访问的认证流程。登录后的机型、设备、配网和 OTA 页面需要有效会话，当前没有预览旁路，因此本轮没有伪造其运行截图。

### 4.1 登录：需要修复

![登录页审计截图](../../../artifacts/product-design-audit/2026-08-25/01-login.png)

- 健康度：**Needs attention**。
- 在 390 px 视口下，白色认证内容区仅覆盖约 260 px，右侧出现大面积空白；字段和 CTA 因此显得过窄。
- 核心字段有可见标签，密码显示/隐藏入口和主要 CTA 层级清楚。
- 社交登录当前禁用，图标对比度很低；即便功能未开放，也应让用户明确理解“暂不可用”，而不是像渲染失败。
- 标题只说明“登录账户”，没有告诉首次用户登录后将完成机器人认领、网络和设备就绪；这是转化与预期管理缺口。

### 4.2 注册：需要修复

![注册页审计截图](../../../artifacts/product-design-audit/2026-08-25/02-register.png)

- 健康度：**Needs attention**。
- 与登录页相同，内容宽度异常偏窄；这说明问题更可能位于共享认证容器或 Web 响应式布局，而不是单个表单。
- 用户名、邮箱、密码标签与主 CTA 清晰。
- 副标题“开始连接你的机器人”给出了产品方向，但没有说明创建账户之后还要认领设备和联网；建议在下一版用一行三步预期替代泛化描述。

### 4.3 密码恢复：基本健康

![密码恢复页审计截图](../../../artifacts/product-design-audit/2026-08-25/03-password-recovery.png)

- 健康度：**Mostly healthy**。
- 同一视口中内容宽度正常、信息层级清楚，可作为登录/注册响应式修复的视觉基准。
- “无论邮箱是否注册都显示相同发送结果”是正确的账户枚举防护说明。
- 仍需在真实设备上验证动态字体、键盘弹出、VoiceOver/TalkBack 和错误 live region。

### 4.4 可访问性风险

- 认证表单的可见标签和密码可见性控制是正向基础。
- 禁用社交入口的低对比度与缺少文字状态，可能造成“不可操作”和“加载失败”无法区分。
- 配网/OTA 页面源码已为主要状态准备 live region、进度角色和 44 px 触控目标，但尚无组件交互与真机辅助技术证据。
- 当前视觉审计不能替代 iOS/Android 动态字体、对比度、键盘、读屏和横竖屏验收。

## 5. 行业与平台证据转化

### 5.1 首次设置必须是一条可恢复的向导

iRobot 的官方设置流程把蓝牙发现、目标 Wi-Fi、设备命名和账户关联串成连续步骤；ECOVACS 则把频段、隐藏 SSID、系统权限和网络切换等常见阻塞因素转化为明确操作。这支持 DOSO 使用“前置条件 → 发现 → 归属证明 → 网络 → 上线确认 → 命名/完成”的流程，而不是把“绑定”和“配网”分散成用户难以理解的工程动作。[iRobot 设置说明](https://answers.irobot.com/en-CA/knowledge/17734)；[ECOVACS 配网故障排查](https://help.ecovacs.com/uk/support/app-wifi-connection/troubleshooting-for-home-wi-fi-connection-failure)

### 5.2 更换 Wi-Fi 应是独立、非破坏性入口

iRobot 将“Reconnect or Change Product Wi-Fi”作为设备设置中的专门流程。DOSO 应优先提供“更换/重新连接网络”，把重启、热点、恢复出厂放在逐步升级的恢复树后段，避免把破坏性操作当成默认解法。[iRobot Wi-Fi 设置说明](https://answers.irobot.com/en-GB/knowledge/17734)；[iRobot 连接故障排查](https://answers.irobot.com/en-GB/knowledge/17735)

### 5.3 设备健康中心应给行动，不做抽象健康分

Roborock 的官方手册把任务历史、电量、维护与固件信息集中在机器人信息区域。当前证据不足以证明行业有统一、可信的“健康分”，所以 DOSO P0 应显示可解释状态和下一动作：在线/待确认、网络、供电、电量、固件、维护、最近同步与故障，而不是虚构综合分数。[Roborock Q7 Max+ 用户手册](https://support.roborock.com/hc/en-us/article_attachments/46130825358873)

### 5.4 OTA 必须展示前检、阶段、中断影响和恢复结果

ECOVACS 官方要求设备联网、供电/充电且电量满足条件；DJI 官方流程明确下载、安装、自动重启和不中断提示，并针对低电量、网络和中断给出恢复路径。DOSO 当前“资格检查 → 下载 → 校验 → 安装 → 重启 → 健康检查 → 成功/回滚/恢复”的状态机方向正确，应把它纳入设备就绪中心，而不是孤立成一个技术页。[ECOVACS 固件升级说明](https://help.ecovacs.com/global/support/faq-detail?id=734)；[DJI 固件更新说明](https://repair.dji.com/help/content?customId=en-us03400006835&documentType=artical&lang=en&paperDocType=paper&re=US&spaceId=34)；[DJI 更新失败恢复](https://repair.dji.com/help/content?customId=01700006480&lang=en&paperDocType=ARTICLE&re=US&spaceId=17)

### 5.5 Expo、Android 与 iOS 的真实设备边界

Expo Go 的原生运行时不可加入任意 BLE 模块；真实 BLE 集成需要 DOSO 自己的 Development Build。[Expo Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)

Android 12 及以上扫描和连接分别需要运行时 `BLUETOOTH_SCAN` 与 `BLUETOOTH_CONNECT`；Companion Device Manager 可用于首次系统选择，但它既不建立连接，也不提供持续扫描。[Android 蓝牙权限](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions)；[Android Companion Device Pairing](https://developer.android.com/develop/connectivity/bluetooth/companion-device-pairing)

iOS 的实际 BLE 通信使用 CoreBluetooth；iOS 18 及以上可评估 AccessorySetupKit 作为更隐私友好的首次发现/授权入口，但授权后的通信仍由 CoreBluetooth 完成，并且必须保留旧系统 fallback。[Apple Core Bluetooth](https://developer.apple.com/documentation/corebluetooth)；[Apple AccessorySetupKit](https://developer.apple.com/documentation/AccessorySetupKit)；[WWDC24: Meet AccessorySetupKit](https://developer.apple.com/videos/play/wwdc2024/10203/)

### 5.6 安全配网与 OTA 的信任根在设备端

蓝牙链路不等于设备所有权。Wi-Fi、解绑、恢复出厂和 OTA 等特权动作必须先完成设备归属证明和受保护会话；仅凭广播名称、MAC 或服务 UUID 不足以确认设备身份。

NISTIR 8259A 要求只有授权实体能通过安全、可配置机制更新设备软件，设备端要在安装前验证更新，并考虑回滚与自动/手动更新控制。[NISTIR 8259A](https://csrc.nist.gov/pubs/ir/8259/a/final)

ETSI EN 303 645 要求安全更新机制、最佳实践密码学、受保护的敏感参数与调试接口，并要求用户易于应用更新、理解安全影响和中断时长。[ETSI EN 303 645 V3.1.3](https://www.etsi.org/deliver/etsi_en/303600_303699/303645/03.01.03_60/en_303645v030103p.pdf)

ESP-IDF 与 MCUboot 都能实现候选镜像、首次启动健康确认和失败回滚，但它们只是平台示例；DOSO 未确定 MCU、Flash、RTOS 与 bootloader 前，不能提前选择具体 A/B 方案。[ESP-IDF OTA](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/ota.html)；[MCUboot 设计](https://docs.mcuboot.com/design.html)

### 5.7 合规是产品生命周期要求，不是单个页面

如果 DOSO 在欧盟销售，Cyber Resilience Act 对支持期内的漏洞处理、安全更新与可用性提出生命周期义务；主要条款自 2027-12-11 起适用，报告义务自 2026-09-11 起适用。实际适用范围、产品分类和符合性评估需由法务按市场确认。[EU Cyber Resilience Act](https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng)；[European Commission CRA 概览](https://digital-strategy.ec.europa.eu/en/policies/cyber-resilience-act)

## 6. 推荐产品结构：设备就绪中心

### 6.1 信息架构

```text
我的设备
├─ 设备就绪摘要（新增）
│  ├─ 未添加机器人 → 添加机器人
│  ├─ 待完成设置 → 继续设置（x/4）
│  ├─ 需要处理 → 查看问题
│  └─ 已就绪 → 查看设备健康
├─ 设备就绪中心（新增全屏编排层）
│  ├─ 1. 认领与所有权
│  ├─ 2. 网络与配网
│  ├─ 3. 固件与更新
│  └─ 4. 健康、维护与恢复
├─ 网络与配网（复用）
├─ 固件更新（复用）
├─ 绑定/解绑设备
├─ 安全锁
└─ 状态警报
```

### 6.2 用户旅程

1. **未认领：**显示“添加机器人”，解释需要机器人、手机蓝牙和家庭 Wi-Fi。
2. **已认领、未联网：**主行动为“连接网络”；进入前检查平台权限、蓝牙和机器人在场。
3. **已联网、状态待确认：**等待可信上线证明；不能把“凭据已写入”显示为成功。
4. **在线、有更新：**显示版本、影响、预计时长和电量/任务/联网资格；用户决定立即、稍后或进入 P1 更新窗口。
5. **更新中：**仅下载阶段显示真实百分比；校验、安装、重启和健康检查显示阶段，不虚构进度。
6. **已回滚：**说明已恢复到最后确认版本，并提供再次检查或联系支持。
7. **需要恢复：**停止使用，显示脱敏诊断编号和售后行动；不显示“更新成功”。
8. **已就绪：**显示在线/待确认、最近同步、网络、固件、维护和安全锁；每项都能进入对应行动。

### 6.3 状态与唯一主行动

| 状态 | 用户看到的标题 | 唯一主行动 | 禁止出现 |
| --- | --- | --- | --- |
| `unclaimed` | 尚未添加机器人 | 添加机器人 | 在线、电量、固件已同步 |
| `claimed_offline` | 机器人尚未联网 | 连接网络 | “已配网成功” |
| `provisioning` | 正在连接网络 | 查看进度 | 重复开始、明文密码 |
| `online_unverified` | 正在确认机器人上线 | 继续等待/重新检查 | 提前显示完成 |
| `update_available` | 有可用更新 | 查看更新 | 自动开始安装 |
| `updating` | 正在安全更新 | 查看进度 | 安装后取消、虚构百分比 |
| `rolled_back` | 已恢复稳定版本 | 查看原因 | “升级成功” |
| `recovery_required` | 需要人工恢复 | 联系支持 | 继续控制机器人 |
| `ready` | 机器人已就绪 | 查看设备 | 抽象、不可解释的健康分 |

## 7. P0 下一实现切片

### 7.1 功能范围

1. 在 `ProfileScreen` 设备卡下新增“设备就绪”摘要卡。
2. 新增 `DeviceReadinessScreen`，只负责编排现有绑定、配网、OTA 和状态说明入口，不复制底层状态机。
3. 增加纯派生 `deriveDeviceReadiness()`：只从绑定、可信在线、最近同步、固件 gateway 和恢复状态推导展示；不得直接改写机器人状态。
4. 为无设备、模拟设备、真实设备不可用、配网进行中、更新可用、回滚和人工恢复提供固定展示合同。
5. 修复共享认证容器在 390 px Web 视口下的宽度不一致，并以密码恢复页为当前视觉基准。
6. 为主要旅程增加组件交互测试或端到端测试，弥补现有静态 wiring guard 的证据缺口。

### 7.2 验收标准

- 从“我的设备”一眼能判断设备当前最重要的问题和下一动作。
- 就绪中心最多只有一个高强调主 CTA；次要行动不与主行动竞争。
- 所有状态均能由现有 gateway/可信数据推导，模拟状态持续标注“开发演示”。
- 真实设备未通过 GATT 身份验证时，Wi-Fi 输入不可达。
- OTA 安装开始后取消入口不可达；`rolled_back` 与 `recovery_required` 的文案和行动不同。
- 认证三页在 320、390、430 px 宽度下左右留白一致，字段不裁切，CTA 不溢出。
- 读屏能听到步骤、当前状态、错误和主行动；状态不只依赖颜色。
- 新增测试覆盖至少：未认领、模拟全完成、真实设备阻塞、配网失败、OTA 回滚、人工恢复和认证窄视口。
- `npm run typecheck`、相关交互测试、`npm run test:release-gate`、Web 和 Android export 通过。

### 7.3 明确非目标

- 不新增底部导航或重做视觉系统。
- 不在未知协议下实现 GATT 写入或自创密钥协商。
- 不在未知 MCU/bootloader 下选择 ESP-IDF、MCUboot 或固定 A/B 分区。
- 不把 EAS Update 当作机器人固件 OTA。
- 不用 UI 演示、模拟器或 APK 编译替代物理机器人验收。

## 8. 后续优先级

### P1

- 独立“更换/重新连接 Wi-Fi”流程；恢复出厂放在高级恢复。
- Owner 邀请家庭/团队成员；共享者默认只有基础控制，高风险动作仅 Owner。
- 更新窗口、自动更新策略、发布说明和更新历史。
- 推送通知：更新完成、已回滚、需要恢复、设备长时间离线、安全公告。
- 脱敏诊断导出与售后恢复向导。
- iOS 18+ AccessorySetupKit 可行性原型，同时保留 CoreBluetooth fallback。

### P2

- 多机器人列表和批量健康总览。
- 本地局域网离线控制，前提是单独完成威胁模型。
- 企业 Wi-Fi、证书网络、NFC/QR 快速认领和现场批量配网。
- 远程支持模式与高级维修工具。

## 9. 实机测试需要的输入

### 最低设备

- 一台 Android 12 及以上手机；若要覆盖 iOS，再提供一台受支持 iPhone。
- 一台可重置、可刷写、可查看串口日志的机器人主控板或整机。
- 一个可控制 2.4/5 GHz、密码、断网和重启的测试 AP。
- USB 数据线、供电、串口/调试工具和可靠救砖方式。

### 机器人/GATT 资料

- 主控/无线 SoC、RTOS/SDK、蓝牙版本。
- 广播名称、厂商数据、Service UUID、Characteristic UUID。
- 每个特征的读/写/通知属性、消息格式、最大包长、错误码、超时和重连规则。
- 设备归属证明：每台设备证书/公钥、一次性绑定材料、物理按键、QR/NFC 或其他 OOB 能力。
- 密钥协商、会话过期、防重放和恢复出厂后的旧所有者失效规则。

### OTA/bootloader 资料

- Flash 容量、分区表、bootloader 名称/版本、是否支持 A/B 或等价回滚。
- 镜像格式、目标型号/硬件版本字段、哈希、签名算法、签名密钥 ID 和安全版本计数器。
- OTA 传输通道、分块、断点续传、校验和重试语义。
- 首次启动健康检查、确认超时、watchdog、回滚和人工恢复条件。
- 一份安全测试固件、一份故意自检失败固件，以及完整恢复刷机步骤。

### 不应提供

- 不要把生产私钥、量产根密钥、真实用户 Wi-Fi 密码或生产 token 交给 App、仓库或测试日志。
- 测试应使用隔离的测试/签名密钥和可恢复硬件。

### 能证明什么

- **只有手机：**可验证 App 权限、Development Build 安装、BLE 扫描 UI 和取消/错误处理。
- **手机 + 广播设备：**可验证真实发现与候选去重，但不能证明设备身份或安全配网。
- **手机 + 协议固件 + 测试 AP：**可验证 GATT 身份、一次性 Wi-Fi 写入和上线确认。
- **再加 bootloader/签名 OTA：**才可验证真实升级、断网/断电、坏镜像、健康失败与回滚。

## 10. 证据缺口矩阵

| 结论 | 证据强度 | 仍需补齐 |
| --- | --- | --- |
| 使用 Development Build 承载 BLE 原生能力 | 高 | 当前 BLE 库与最终 Expo SDK 的真机兼容性 |
| Android 12+ 需要附近设备运行时权限 | 高 | Android 11 及以下与各厂商 ROM 回归 |
| iOS 18+ 可用 AccessorySetupKit 优化首配 | 高 | React Native 原生桥接成本、最低 iOS 策略 |
| 首配应串联发现、网络、命名/账户与完成确认 | 高 | DOSO 实际硬件频段、灯效/语音反馈 |
| 更换 Wi-Fi 应为非破坏性流程 | 高 | DOSO 固件是否支持保留所有权的重配 |
| OTA 必须设备端验签并支持回滚 | 高 | MCU、bootloader、Flash 与量产密钥体系 |
| Owner/共享者需要权限分层 | 中高 | DOSO 首发是家庭、商用还是工业场景 |
| EU CRA 可能影响支持期和更新策略 | 高但条件性 | 销售地区、产品分类和法务判断 |
| 登录/注册有窄视口宽度异常 | 高（当前截图） | 根因修复与多视口回归 |
| 登录后的机器人主流程视觉质量 | 未完成 | 有效测试会话或安全的预览入口 |

## 11. Claim-to-source ledger

| 关键主张 | 一手来源 | 置信度 | 说明 |
| --- | --- | --- | --- |
| Expo Go 不能承载任意 BLE 原生模块 | [Expo Development Builds](https://docs.expo.dev/develop/development-builds/introduction/) | 高 | 证明运行时边界，不证明具体 BLE 库兼容性 |
| Android 12+ 扫描/连接需运行时权限 | [Android Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions) | 高 | 旧系统另有权限路径 |
| CDM 是系统选择器，不负责后续连接 | [Android Companion pairing](https://developer.android.com/develop/connectivity/bluetooth/companion-device-pairing) | 高 | 可选产品路径 |
| iOS BLE 通信由 CoreBluetooth 承担 | [Apple Core Bluetooth](https://developer.apple.com/documentation/corebluetooth) | 高 | AccessorySetupKit 只改善发现/授权 |
| 更新须由授权机制触发并由设备验证 | [NISTIR 8259A](https://csrc.nist.gov/pubs/ir/8259/a/final) | 高 | 通用 IoT 基线 |
| 消费 IoT 应提供安全更新和可用更新 UX | [ETSI EN 303 645](https://www.etsi.org/deliver/etsi_en/303600_303699/303645/03.01.03_60/en_303645v030103p.pdf) | 高 | 法律适用性另行判断 |
| 双槽/候选镜像可支持首次启动确认与回滚 | [ESP-IDF OTA](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/ota.html)、[MCUboot](https://docs.mcuboot.com/design.html) | 高 | 仅作为实现参考，不预选平台 |
| 首配应覆盖发现、Wi-Fi、命名与账户关联 | [iRobot 设置](https://answers.irobot.com/en-CA/knowledge/17734) | 高 | 具体频段约束不能照搬 |
| 网络重配应是独立入口 | [iRobot Wi-Fi 设置](https://answers.irobot.com/en-GB/knowledge/17734) | 高 | 支持非破坏性恢复原则 |
| OTA 要展示资格、中断与恢复 | [ECOVACS 更新](https://help.ecovacs.com/global/support/faq-detail?id=734)、[DJI 更新](https://repair.dji.com/help/content?customId=en-us03400006835&documentType=artical&lang=en&paperDocType=paper&re=US&spaceId=34) | 高 | 设备细节不同，产品模式可迁移 |

## 12. 下一阶段完成定义

以下条件全部满足后，“设备就绪中心”App 切片可以标记为完成：

1. 设备就绪摘要和全屏中心已接入现有导航。
2. 七类关键状态及唯一主行动通过组件交互测试。
3. 登录/注册/密码恢复在 320、390、430 px 宽度视觉一致。
4. 开发演示与真实硬件不可用路径继续 fail-closed。
5. TypeScript、相关功能测试、release gate、Web 和 Android export 通过。
6. 报告明确保留真实 GATT/Wi-Fi 和机器人 OTA 的 `BLOCKED` 状态。

完成这个 App 切片之后，下一工程里程碑才是“Android 物理扫描 → GATT/身份 ADR → 一次性 Wi-Fi 写入 → 测试 AP 上线确认”；真实 OTA 必须等待 MCU、bootloader、分区和签名方案。
