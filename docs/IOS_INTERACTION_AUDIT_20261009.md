# DOSO iOS 原生交互审计 — 2026-10-09

## 1. 结论与证据边界

当前 Build `948d1cf2-c94f-4842-a7b2-b50edabae1bf` 是 unsigned、只读、独立入口的 iOS Simulator 预览包，不是 TestFlight、生产在线包或真实机器人联调包。本轮通过 Appetize 在 iPhone 14 Pro Max / iOS 17.2 观察了首页、地图、任务、分析和“我的”五个主导航页，并补测登录默认态与空表单错误焦点、首页深色与横屏。这些结果不代表 20 页设计验收通过，也不证明认证、账户、BLE 或机器人功能可用。完整测试已启动，但尚未完成。

构建源码聚合 SHA-256 为 `03a4925563c7d88a8daa69a7a556d5b5a589409c2cb9f0dfbdfb040814a7cff1`；22:48（上海时间）逐文件比对 209/209 一致、0 个差异。本轮原生截图和记录位于 `artifacts/release-readiness/20261009-ios-full-test/native/`，逐项结果与截图 SHA 见上级目录 `native-observations.json`。此前 iPhone 14 Pro / iOS 17.2 的首页 → 控制预览 → 返回冒烟属于另一轮独立证据，不与本轮 Pro Max 结果合并冒充更完整覆盖。

本轮已知验证状态：

- 54 个本地检查组与 TypeScript typecheck 通过；这是源码、行为合同和静态门禁证据。
- 在线认证预检缺少 `SUPABASE_URL`，真实认证链路未执行。
- strict design-evidence 因当前清单 `0/20` 失败，符合预期；实际状态为 12 in_progress / 5 needs_revalidation / 3 stale / 0 passed，不得放宽或绕过。54 组是命令组数量，不能把重复调用的 TAP 总数当作独立用例数量。
- 完整 `test:release-gate` 本轮未运行，不记录为通过。
- Appetize 明确显示 `Free tier has a 3 minute time limit`。会话因免费时限、主机不活动或切换设备而返回 `Tap to Start`，不能在没有崩溃日志的情况下记为 App crash。
- 中断截图已明确重命名为 `session-limit-before-login.jpg`、`session-limit-before-landscape.jpg`、`device-switch-during-profile.jpg`、`session-reset-during-register-navigation.jpg`。登录和横屏的真实截图分别为 `login-pro-max-light-verified.jpg`、`home-pro-max-landscape-verified.jpg`；不以文件名代替画面核验。
- XXXL 字体选项已打开，但点击/后续状态查询连续超时，无法确认字体是否应用；没有 XXXL/200% PASS，没有有效的大字体截图，也未能完成测试设置恢复。横屏是最后确认的设备方向，后续测试先恢复默认设置并重新启动。

本审计没有测量 VoiceOver、200% Larger Text、真实性能、内存、网络可靠性或物理硬件行为，因此不提供暗示平台符合性的总分。

## 2. 本轮原生观察

| 场景 | 本轮观察 | 当前判定 |
| --- | --- | --- |
| 冷启动与首页 | 进入只读浅色首页；无登录阻塞 | Preview observed，不是正式入口或认证证据 |
| 五个主导航 | 首页、地图、任务、分析、我的均可进入 | 默认态导航 observed；不是五页设计 PASS |
| 任务页 | 点击亮绿色箭头后界面无可见变化 | P1：交互热点缺少可观察反馈；不能判断为任务启动 |
| 分析页 | 显示可信空态，不注入示例遥测 | 正向真实性证据；仍缺真实可信数据链路 |
| 登录默认态 | 页面目录进入真实 LoginScreen | Preview observed；提交回调无后端副作用 |
| 登录空表单 | 邮箱红色提示、焦点进入邮箱、iOS 邮箱键盘含 @ 与 next | 本用例的本地 UI 校验通过；不是登录成功 |
| 登录 → 注册 | 尝试后会话回到首页 | inconclusive；遇会话重置，不登记产品导航失败或通过 |
| 首页深色 | 卡片、按钮与导航随 QA 主题切换 | 默认字体视觉观察；非对比度/三态像素 PASS |
| 首页横屏 | 重启横屏会话后设备卡与快捷操作并排、侧边导航可见 | 重排已观察；非同尺寸像素或全页横屏验收 |
| XXXL / VoiceOver | 字体选项控制超时；VoiceOver 未运行 | 未通过，也未记录为已测产品失败 |
| 会话结束 | 出现免费时限提示或回到 `Tap to Start` | 主机/套餐边界；没有证据表明 App 崩溃 |

已有正向实现包括：认证和 OTP 页面具备输入、错误及并发保护的本地合同；主导航目标采用 48pt 级尺寸；设备能力与命令执行器保持 fail-closed；分析浏览页不展示伪造遥测。它们仍需相应原生、在线或硬件证据后才能提升为发布通过。

## 3. 20 页面当前可测性

当前预览入口的页面目录包含 20 个 stage，但默认构建只允许浏览默认态；页面菜单不能切换 loading、error、expired、nonce、BLE permission-denied、bluetooth-off、scanning 或 empty 等异常状态。

| 页面 | 预览中实际载荷 | 本轮原生状态 | 发布级缺口 |
| --- | --- | --- | --- |
| `main-home` | 真实页面；离线、无可信电量、召回禁用 | 已观察 | 真实设备与召回执行 |
| `main-routes` | 真实页面；路线执行禁用 | 已观察 | 可信路线、executor、ACK、机器人 |
| `main-tasks` | 真实页面；模板不可执行 | 已观察；箭头点击无反馈 | 真实任务、明确反馈、executor、ACK |
| `main-analysis` | 真实页面；可信空态 | 已观察 | 可信历史遥测与过期/断网回归 |
| `main-profile` | 真实页面；设备数据待同步 | 已观察 | 在线账户与设备数据、设置持久化 |
| `auth-login` | 真实组件；提交与社交登录为无副作用回调 | 默认态、空提交焦点/键盘已观察 | 邮箱/Apple 登录、回调与会话恢复 |
| `auth-register` | 真实组件；注册为无副作用回调 | 待原生测试 | 建号、OTP 投递与 Provider |
| `auth-email-otp` | 真实组件；验证/重发不访问服务 | 待原生测试 | 真实验证、重发、过期与后台恢复 |
| `auth-forgot-password` | 真实组件；请求不发信 | 待原生测试 | 邮件与 Universal Link |
| `auth-reset-password` | 真实组件；提交不改密码 | 待原生测试 | nonce、旧链接复用与服务端更新 |
| `auth-username` | 真实组件；认领为无副作用回调 | 待原生测试 | 已部署 RPC、冲突与会话隔离 |
| `auth-display-name` | 真实组件；保存/取消不写账户 | 待原生测试 | Apple 首登资料恢复 |
| `auth-mfa` | QA 安全占位壳，不是真实 MFA 页面 | 待原生浏览 | 隔离账户的 TOTP enrollment |
| `account-security` | QA 安全占位壳，不读取真实账户 | 待原生浏览 | 终端/MFA/登录方式；账户删除尚未实现 |
| `model-select` | 真实组件；继续只做预览导航 | 待原生测试 | 选择持久化与设备兼容验证 |
| `device-bind` | 真实组件；提交不绑定设备 | 待原生测试 | claim、重复/超时/跨账户与 RLS |
| `device-ble-discovery` | QA 安全占位壳；不请求权限、不扫描 | 待原生浏览 | iOS adapter 与物理 iPhone 扫描 |
| `device-provisioning` | 真实“尚未开放”页 | 待原生浏览 | GATT 身份、Wi-Fi 写入与联网确认 |
| `device-firmware` | 真实“尚未开放”页 | 待原生浏览 | Hosted OTA、签名、恢复与机器人回滚 |
| `robot-control` | 真实页面；运动和 physical diagnostics 禁用 | 此前 Pro 冒烟已观察，本轮 Pro Max 待复验 | 生产 executor、可信 ACK/遥测与安全硬件 |

因此，本轮可准确陈述的是“五个主导航及登录默认态已观察、两项首页显示切换和一项表单错误恢复已补测”；不能写成 `6/20 passed`，更不能从源码中存在 20 个 stage 推导 `20/20`。

## 4. 代码审计发现

以下为源码审计发现，其中 VoiceOver 影响是基于语义结构的风险推断，尚未用原生 VoiceOver 测量。

### P1：关键交互与可操作性

1. `src/screens/TasksScreen.tsx:223` 使用整张 UI PNG 配合透明 Pressable 选择热点；默认选中索引为 1，点击亮绿色箭头没有可观察动作或状态变化。本轮原生现象与源码一致。应以原生文字/卡片/按钮复现 Figma 结构，只保留机器人等图片素材；为可操作项提供明确按钮语义、按下/成功/阻塞反馈，并让无 executor 时的动作可解释。任务页绿色旧素材与首页蓝色主题不一致也已在原生截图确认。
2. `src/screens/ModelSelectScreen.tsx:172` 与 `src/screens/AnalysisScreen.tsx:29` 使用位图承载重要 UI。位图文字不能可靠响应 Dynamic Type 或 VoiceOver；分析示例图只应留在明确演示态，当前浏览模式继续保持可信空态。
3. `src/design-qa/DesignQaRoot.tsx:327` 把整个预览容器设为单一 accessible 元素，可能在 QA 入口中折叠后代的 VoiceOver 导航。该判断为源码推断，需 VoiceOver 实测确认；不应据此宣告正式产品页失败。
4. `src/screens/ProfileScreen.tsx:52`、`src/screens/ControlScreen.tsx:70`、`src/components/AppHeader.tsx:31` 依赖固定高度或单行文本，缺少基于 `fontScale` 的重排策略，存在放大字体截断或重叠风险。
5. `src/screens/AccountSecurityScreen.tsx:129`、`:420` 的确认 UI 为页面内联区域；`interactionLocked` 未包含 pending confirmation。确认块可能生成在当前视口外，同时背景交互仍开放。应在确认出现时锁定冲突操作、移动焦点并确保确认内容可见。

### P2：触控、对比与表单恢复

1. `src/components/GradientButton.tsx:59` 的 compact 高度为 42pt；`src/screens/AccountSecurityScreen.tsx:606` 的 retry 控件未保证 44pt。应将所有操作目标至少扩到 44×44pt，包括透明 hit area；这是源码几何检查，不是原生触控测量。
2. `src/screens/ProfileScreen.tsx:270` 的序列号为 10pt、`#A8AEB8` / `#F5F7FB` 约 2.08:1；9pt 辅助标签约 2.23:1。需要提升字号/对比度或重新定义为非必要装饰信息，不应依靠浅灰小字传递关键状态。
3. `App.tsx:1265` 的主 tab 内容切换会卸载页面，可能丢失局部选择/滚动状态；`App.tsx:1536` 的机型页返回会触发 logout。应先冻结预期返回语义，再补状态保留测试，避免把“返回”变成意外退出。
4. `src/screens/ResetPasswordScreen.tsx:37` 与 `src/screens/BindDeviceScreen.tsx:44` 的非法提交没有明确把焦点移到首个错误输入。应增加错误摘要或焦点移动，并用键盘打开、横屏和大字体复验。

## 5. 发布级功能边界

- **真实认证**：当前包没有 `AuthProvider` 或后端写入；在线预检又缺 `SUPABASE_URL`。必须使用签名、在线、staging 配置的 internal/TestFlight 包验证邮箱注册、OTP、登录恢复、密码回调与 Apple 登录。
- **账户删除**：当前生产账户安全页没有删除入口，服务端也没有已安装的两阶段删除执行路径。邮件模板不是删除能力。Apple 对支持建号的 App 要求提供 App 内发起删除能力，不能只用停用账号替代：[Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)。必须先确认设备解绑、数据保留、会话撤销、幂等重试和 Apple token revoke 策略；这轮没有执行删除操作。
- **iOS BLE**：通用 adapter 当前返回 unsupported，仅 Android 有 discovery adapter。Appetize/Simulator 不能替代物理 iPhone + 真实广播设备的权限、蓝牙关闭、扫描、取消、后台停止和恢复证据。
- **配网与 OTA**：当前是诚实的 unavailable 页面；真实 GATT/Wi-Fi、签名制品、bootloader 与回滚未接入。
- **Brainstem / 命令执行**：生产 robot command executor 仍为 `null`。离线协调器、G008 模拟和 Edge 合同不等于 MQTT/mTLS、生产 worker、可信 ACK/遥测或物理运动已完成。优先在静止夹具打通非运动 health-check；任何运动能力需独立安全协议、硬件互锁与场地验收。

## 6. 修复与复验顺序

1. 修复原生关键控件：任务箭头语义与反馈、确认流程可见性、错误焦点。
2. 修复 QA 容器语义分组，确保测试入口本身不会吞掉子控件。
3. 统一 Dynamic Type 重排、44pt 触控区和小字对比；保持白/石墨/蓝的既定 Figma 方向，不进行全量重设计。
4. 冻结账户安全确认、tab 状态保留和机型页返回语义，再补原生交互回归。
5. 用同一源码重新构建只读 simulator 包，完成 20 页 Light/Dark/Landscape 与异常态取证；页面证据仍与功能证据分开。
6. 构建签名在线候选，依次完成真实认证、账户删除、物理 iPhone BLE、非运动 Brainstem 闭环；最后再进入 TestFlight 和发布门禁。

所有修复都应维持现有 fail-closed 能力门禁，不用假数据、假成功或放宽验收阈值制造完成度。

## 7. 验收口径

每项只有在“前置条件、操作、可观察结果、平台/build、证据文件”齐全后才能记 PASS。原生页面最低复验集合包括：

- 默认与关键异常态；Light、Dark、Landscape；键盘打开和返回/手势。
- 支持范围内的小屏、常规屏、大屏；若继续 `supportsTablet:true`，追加 iPad 竖横屏、分屏与键盘。
- 默认字体、200% Larger Text、VoiceOver、减少动态效果；内容可重排或滚动，不重叠、不截断关键操作。
- 正常网、断网、慢网、请求中切后台和杀进程恢复；禁止重复提交、假成功或串账户。
- 预览包、签名 internal/TestFlight 包和硬件证据分别登记，不互相替代。

Apple 的基础交互建议是可点击控件至少 44×44pt，并保持文字清晰、布局不重叠：[Apple Design Tips](https://developer.apple.com/design/tips/)。若宣称支持 Larger Text，应支持至少 200% 或系统最大字号并检查重排、可访问性和信息完整性；XXXL 选项不自动等同于 200%/AX 最大字号：[Larger Text evaluation criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/larger-text-evaluation-criteria)。Tab 应保留各分区的导航状态并提供清楚的标签；当前仅图标导航可在保持 Figma 结构的前提下评估短标签补充，不在审计中擅自改稿：[Apple Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)。

## 8. 交互规范与后续验收矩阵

| 审查维度 | 已有证据 | 必须补齐 |
| --- | --- | --- |
| 无障碍 | 原生登录错误焦点；源码标签/选择语义检查 | QA 容器分组修正后 VoiceOver，200%/AX 字体、色差和非颜色提示 |
| 响应布局 | Pro Max 默认竖屏；首页横屏 | 每页横屏/键盘、最小屏与 iPad、字体放大；不能用整张界面图缩放 |
| 主题/视觉一致性 | 首页浅色/深色；任务残留绿色 | 白/石墨/蓝语义 token、原生文本、禁用/选择/按压状态；Figma 当前节点像素对照 |
| 行为与恢复 | 登录空提交、任务点击无反馈、分析诚实空态 | tab 状态保留、返回不退出、确认焦点、输入恢复；请求中/失败/取消/过期 |
| 性能/动态效果 | 本地行为合同，不含性能测量 | 原生冷/热启动、卡顿与内存、后台恢复、Reduce Motion；未测不得评分 |

建议冻结本轮源码和报告作为修复前基线。下一批只修改上述明确问题，补针对性回归后重新构建，不以一次大范围视觉重做覆盖具体交互缺陷。

