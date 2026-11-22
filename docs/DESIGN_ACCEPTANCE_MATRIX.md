# DOSO App 逐页设计验收矩阵
## 2026-09-08 当前状态更正

本轮优先修复上线前认证逻辑，暂停视觉方案微调。共享 `App.tsx` 的 OTP 请求锁已修正，原首页、路线、任务的源码绑定因此失效：当前为 **0/20 当前源码有效通过，3 页保留历史通过证据**，不代表已完成的页面被删除。必须按新源码复验，不能只更新 SHA 继承通过。


本矩阵记录 DOSO App 与 Figma 设计稿的逐页验收进度。它不代表生产功能放行，也不能替代 `docs/PRODUCTION_VERIFICATION_MATRIX.md` 中的真机、机器人、托管服务和安全协议门禁。

## 设计基准与证据约定

- Figma 参考文件：`Y9BYG8ctEXdLeW3yXwfzpY`
- Figma 可编辑源码同步副本：`ZDueCh91PDy5oyLKicv0zR`；当前 Section 为 `3444:2680`，名称为 `DOSO · Source Sync · 11 Pages × 3 States`。合同 `2026-08-31.1` 在临时区完成全部校验后原子替换旧 `3433:2682`，此后节点 ID 冻结并按映射定点更新。
- Section `3444:2680` 已登记 33 个三态 Frame 容器和六类共享组件，但容器数量不代表真实产品界面完成。2026-09-07 读取绑定页确认其仍为旧通用说明/输入卡，需要在冻结节点上更新为当前产品界面。
- 在线 Scripter 回执为 `DOSO_PRODUCT_PAGES_PASS`：33 帧、6 个组件族；Light/Dark 变量集合各含 22 个变量且基础校验无缺失。用户界面不再显示 `SAFE AREA`、`真实状态合同` 或开发说明，安全区与真实状态边界记录在节点数据中；配网与固件保持不可执行的 `unavailable` 产品态。
- 本地生成器 `2026-09-04.20` 保留历史 11 页安全区合同，但不包含 2026-09-07 新绑定页与配网/固件信息页。当前 Figma 连接可读、Starter 写入配额耗尽；恢复连接后必须在冻结节点逐页更新，不能把旧脚本准备完成记为云端同步。
- 2026-09-07 共享 App/QA 入口变更后，7 个已通过页已在 `20260907-device-product-shared-refresh-v5` 重拍并完成同尺寸像素复核与源码 SHA 刷新。其余页面旧截图仅供诊断，不再宣称全部 13 页已有当前源码证据；MFA、BLE 和账号安全的 QA 安全壳也不等同真实页面交互验收。
- 已确认区段：`浅色`、`深色模式`、`浅色 · 中文`、`横屏 · 规范优化副本`
- 中文 App 以 `浅色 · 中文` 为竖屏浅色主基准；深色与横屏节点用于颜色、层级和响应式布局验收。节点中的英文文案不覆盖当前中文产品文案。
- 其他未核实的节点统一写为“待定位”，不得根据页面顺序或相近名称猜测节点 ID。
- 每轮使用唯一 `<run-id>`，建议格式为 `YYYYMMDD-HHmm-<git-short-sha>`。
- 本轮证据统一归档到 `artifacts/design-acceptance/<run-id>/<page-id>/`。本地临时截图、聊天附件或仅存在于 `.codex/tmp` 的文件不能作为最终证据。

## 单页通过定义

页面只有同时满足以下条件，才可从“待验收”或“进行中”改为“通过”：

1. **浅色竖屏**：在 390 × 844 基准视口完成 Figma 对照，主要结构、间距、字体层级、颜色、圆角、图标和安全区无 P0/P1/P2 差异。
2. **深色竖屏**：在 390 × 844 基准视口完成深色 Figma 对照；状态栏、页面背景、卡片、分隔线、文字、图标和底部导航均切换完整，无不可读或仍为浅色的孤立区域。
3. **横屏**：在 844 × 390 基准视口完成横屏 Figma 对照；内容不得仅缩放竖屏稿，导航、主次区域、滚动和安全区必须符合对应横屏节点。
4. **交互与状态**：核心点击、返回、输入、禁用、加载、空态、错误态和重试路径可执行。真实物理设备无可信数据时保持真实空态；设计预览数据必须明确标记“预览数据”或“不代表真实设备记录”，不得伪装成真实遥测或设备结果。
5. **缺陷清零**：同一轮设计 QA 中没有未解决的 P0、P1 或 P2。仅文案偏好或后续探索项可记录为 P3，且不得遮挡功能、误导状态或破坏可访问性。
6. **源码门禁与构建**：至少执行 `npm run typecheck` 和 `npm run export:android`；页面对应的已有源码门禁也必须通过。认证页执行 `npm run test:auth-ui` 与 `npm run test:ui`；机器人页面按实际范围执行 `npm run test:robot-lifecycle-ui`、`npm run test:provisioning-ui`、`npm run test:firmware-update-ui` 或 `npm run test:trusted-device-data-ui`。
7. **证据完整**：证据目录至少包含三态 `figma-*.png`、`app-*.png`、左右同尺寸 `comparison-*.png`、`design-qa.md`、`verification.txt` 和 `evidence.json`。`design-qa.md` 必须写明比较尺寸、逐态 PASS、P0/P1/P2 = 0、修复结果，并以 `final result: passed` 结束；`evidence.json` 必须绑定 Figma 节点、`typecheck` 与单页 `test:release-gate:design-audit` 退出码、证据文件 SHA-256 与当前页面源码依赖 SHA-256。`docs/design/DESIGN_ACCEPTANCE_MANIFEST.json` 是默认 release gate 的机器可读总清单，源码漂移或任一页面不是强证据 `passed` 时必须 fail-closed；单页 design-audit 只用于无循环地落账当前切片，不能替代 20/20 后的默认全局 release gate。

## 状态说明

- `历史通过，待本轮深色/横屏复验`：以前完成过页面 QA，但当前轮次还没有满足上述完整通过定义。
- `进行中`：当前正在实现或比对，尚未形成完整通过证据。
- `待验收`：仓库已有页面实现，但还没有本轮三种显示形态的完整验收证据。

## 逐页矩阵

| 页面 ID | 页面 | 仓库实现 | 中文浅色 Figma 节点 | 深色 Figma 节点 | 横屏 Figma 节点 | 真实功能态要求 | 验收状态 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `auth-login` | 登录 | `src/screens/LoginScreen.tsx` | `139:5200` | `139:2728` | `139:7722` | 邮箱密码与社交入口必须调用真实认证流程；加载、字段错误、服务未配置和取消状态不得伪造成功。 | **复验中** | 2026-09-08 目视复核发现横屏表单左侧遮挡，深色社交图标对比度不足；旧机器通过不再代表最终视觉通过。等待按白底、石墨与柔和蓝规范更新并重拍。 历史证据：`artifacts/design-acceptance/20260907-device-product-shared-refresh-v5/auth-login/`。 |
| `auth-register` | 注册 | `src/screens/RegisterScreen.tsx` | `139:5247` | `139:2773` | `139:7784` | 用户名、邮箱、密码规则、社交入口、发送验证码和错误反馈保留现有认证合同；用真实文字/控件实现新视觉，不能继承旧 Figma 通过记录。 | **进行中** | 2026-09-08 白底、深石墨与柔和蓝注册页源码样板完成；Android 浅/深/横三态、Web 小屏/焦点/错误/加载、12 个行为与布局测试、typecheck、Android export 和单页 release audit 通过。此为按用户新参考制作的候选；Figma 云端新视觉、同标准像素比较与真实注册/Provider E2E 未完成，不继承旧通过记录。 当前源码候选：`artifacts/design-acceptance/20260908-register-soft-blue-v6/auth-register/`。 |
| `auth-email-otp` | 邮箱验证码 | `src/screens/EmailOtpScreen.tsx` | `3444:2752` | `3444:2774` | `3444:2796` | 注册与密码恢复必须区分用途；验证码长度、倒计时、重发、过期、错误和返回路径必须使用真实认证状态。 | **进行中** | `20260907-auth-email-otp-current-v2` 已完成修后 Android 浅色、深色、横屏三态：六个明确空态圆点、倒计时和返回入口均可见；`20260907-auth-email-otp-expired-v2` 另完成过期态三态，横屏首屏可直接触达“重新发送验证码”，无 IME 覆盖或裁切。取证入口现强制清 Metro 缓存并校验精确 stage/state，防止跨状态旧画面串线。仍缺 `3444` 当前三态 Figma 原生导出、同尺寸拼图及隔离账户真实 OTP 成功/重发证据。 |
| `auth-forgot-password` | 找回密码 | `src/screens/ForgotPasswordScreen.tsx` | `3444:2818` | `3444:2836` | `3444:2854` | 仅对合法邮箱触发真实恢复流程；发送中、已发送、失败、重试和返回登录状态可验证。 | **进行中** | Figma 生成器 `2026-09-04.17` 已保留真实 validation-first 表单与账户枚举防护文案，并把横屏邮箱框改为 54px Compact 结构，清除说明/按钮叠压；生成器现会在原子替换前拒绝关键表单碰撞。历史证据仍来自退役节点；当前 `3444` 云端帧、三态导出/拼图和隔离账户真实响应仍缺失。 |
| `auth-reset-password` | 重置/修改密码 | `src/screens/ResetPasswordScreen.tsx` | `3444:2872` | `3444:2894` | `3444:2916` | 恢复验证码或重新认证 nonce 必须真实校验；密码规则、确认密码、失效和成功退出路径可验证。 | **进行中** | Figma 生成器已把横屏两组密码框改为 Compact 结构，清除原 4px 相互叠压，并继续保留 recovery-session/nonce-required 状态。仍缺当前 `3444` 云端执行、三态拼图与真实 nonce 失效/成功退出证据。 |
| `auth-username` | 设置用户名 | `src/screens/UsernameOnboardingScreen.tsx` | `3444:2938` | `3444:2956` | `3444:2974` | 用户名认领必须执行现有唯一性与不可修改门禁；冲突、格式错误、加载和退出路径可验证。 | **进行中** | Figma 生成器已把横屏用户名输入改为 Compact 结构，清除原 13px 主按钮叠压，并保留 validation-first 认领与退出状态。仍缺当前 `3444` 云端执行、三态拼图和真实 RPC 冲突/错误/成功证据。 |
| `auth-display-name` | 确认显示名称 | `src/screens/DisplayNameConfirmationScreen.tsx` | `3444:2992` | `3444:3012` | `3444:3032` | 仅在符合现有 Apple 首次登录恢复条件时出现；保存、取消、错误和会话隔离必须使用真实状态。 | **进行中** | Figma 生成器 `2026-09-04.20` 与共享 `DesignQaRoot.tsx` 均已删除假 `DOSO 设计验收` 姓名并保留当前 Apple 会话数据合同；Android 当前源码三态已在 ADB 5038 重拍，受共享入口影响的 7 个通过页证据也已刷新并通过 release audit。仍缺 `3444` 云端执行、该页 Figma 三态拼图及真实 Apple 首登恢复证据。 |
| `auth-mfa` | 管理员双重验证 | `src/screens/MfaSetupScreen.tsx` | `3444:3052` | `3444:3068` | `3444:3084` | 只在允许管理 MFA 的真实会话开放；二维码/密钥、验证码、取消、错误与 AAL2 完成状态可验证。 | **进行中** | Figma 保持服务读取前的安全 loading 态，不展示假二维码/密钥/因子结果或可执行验证；App 真实 enrollment/step-up 验证码框已由假 `000000` 改为六个空态圆点，未满 6 位继续禁用。仍缺当前 `3444` 云端三态、拼图和隔离账户 AAL2 证据。 |
| `model-select` | 机器人型号选择 | `src/screens/ModelSelectScreen.tsx` | `139:5298` | `139:2821` | `139:7848` | 型号选择、继续、跳过、返回和忙碌态使用当前 App 流程；未绑定设备时不得把预览机型显示为真实已连接设备。 | **复验中** | 2026-09-08 目视复核发现横屏“跳过”和 CTA 边缘重复，旧合成素材与真实控件可能叠加；撤回通过，等待去重和重新验收。 历史证据：`artifacts/design-acceptance/20260907-device-product-shared-refresh-v5/model-select/`。 |
| `main-home` | 首页 | `src/screens/HomeScreen.tsx` | `139:6636` | `139:4126` | `139:10575` | 连接、电量、安全锁与召回能力只展示可信设备状态；无设备或命令执行器未接入时必须保持禁用并说明原因。 | **待复验** | 历史源码 Android 三态与同尺寸拼图通过，P0/P1/P2 = 0。light MAE 7.4973 / SSIM 0.908；dark MAE 7.1489 / SSIM 0.8058；landscape MAE 7.7831 / SSIM 0.8886。完整四项像素指标与源码 SHA：`artifacts/design-acceptance/20260907-device-product-shared-refresh-v5/main-home/`。 | <!-- 2026-09-08: App.tsx OTP guard changed; current-source evidence is stale. -->
| `main-routes` | 路线/地图 | `src/screens/MapScreen.tsx` | `139:7397` | `139:4784` | `139:10680` | 路线内容可作为明确标识的模板预览；真实路线启动必须同时具备 control/executor、可信来源、有效 routeId 与已验证 geometry，并在发送前原子重验；阻断时不得显示已启动。 | **待复验** | 历史源码 Android 三态与同尺寸拼图通过，P0/P1/P2 = 0。light MAE 8.8163 / SSIM 0.8453；dark MAE 9.2454 / SSIM 0.8863；landscape MAE 9.3168 / SSIM 0.8221。完整四项像素指标与源码 SHA：`artifacts/design-acceptance/20260907-device-product-shared-refresh-v5/main-routes/`。 | <!-- 2026-09-08: App.tsx OTP guard changed; current-source evidence is stale. -->
| `main-tasks` | 任务 | `src/screens/TasksScreen.tsx` | `139:6722` | `139:4209` | `139:11041` | 任务模板与真实任务状态必须区分；开始任务必须具备独立 control/executor 门禁、可信来源、有效 taskId 与已验证计划，并在点击边界原子重验；失败、超时或未接入不得显示完成。 | **待复验** | 历史源码 Android 三态与同尺寸拼图通过，P0/P1/P2 = 0。light MAE 5.77 / SSIM 0.8941；dark MAE 1.2118 / SSIM 0.9569；landscape MAE 6.1775 / SSIM 0.8743。完整四项像素指标与源码 SHA：`artifacts/design-acceptance/20260907-device-product-shared-refresh-v5/main-tasks/`。 | <!-- 2026-09-08: App.tsx OTP guard changed; current-source evidence is stale. -->
| `main-analysis` | 数据分析 | `src/screens/AnalysisScreen.tsx` | `139:6953` | `139:4440` | `139:10757` | 物理设备无可信遥测时显示真实空态；演示数据必须持续披露为预览，不得冒充可信遥测。 | **复验中** | 2026-09-08 目视复核发现深色/横屏月份与性能文字重叠，并需核对导航边界；旧机器像素通过未覆盖这些问题，撤回通过并重新验收。 历史证据：`artifacts/design-acceptance/20260907-device-product-shared-refresh-v5/main-analysis/`。 |
| `main-profile` | 我的设备/个人页 | `src/screens/ProfileScreen.tsx` | `139:7104` | `139:4589` | `139:10918` | 设备资料、连接、电量、固件、上次同步和安全状态只显示仓库/网关真实值；未接入能力的说明页可进入，但执行动作必须禁用并显示阻断原因。 | **复验中** | 当前绑定的 Figma 原节点仍有假在线、50% 电量、v2.4.1 固件、6.4 小时运行时长和 2 分钟前同步；本地定点修复脚本尚未写入云端。`artifacts/design-acceptance/20260904-main-profile-original-figma-baseline/main-profile/` 三态仍未全部过线，反向横屏仍待真机。 |
| `robot-control` | 机器人控制 | `src/screens/ControlScreen.tsx` | `139:6520` | `139:4019` | `139:8596` | 手动、路线和任务控制必须由能力授权与真实命令执行器决定；提交、受理、执行、成功、失败、取消和超时不可互相冒充。 | **复验中** | Figma 假距离/电量/运行时长/传感器/健康成功态已清除且三模式禁用；App 离线态已恢复 Figma Wi-Fi 图标，并完成横屏头部、机器人与右侧卡片定点校准。最新 `artifacts/design-acceptance/20260904-robot-control-stale-figma-baseline-v8/robot-control/` 为 Light SSIM 0.7751、Dark 0.7326、Landscape MAE 8.7496 / delta>32 7.4340% / SSIM 0.6700；仍缺云端原子补丁执行与原生中性路线图导出。 |
| `device-bind` | 绑定机器人 | `src/screens/BindDeviceScreen.tsx` | `3444:3100` | `3444:3122` | `3444:3144` | 序列号与激活码走真实绑定仓库；忙碌、格式错误、冲突、失败、成功和返回路径可验证，失败不得落入已绑定状态。 | **进行中** | 2026-09-07 已更新真实产品文案、输入焦点、键盘下一项、绑定码占位字距和深色按钮对比度。当前 Android 三态候选位于 `artifacts/design-acceptance/20260907-device-product-current-v6/device-bind/`；默认空表单通过点击触发本地校验。Figma 绑定节点仍为旧通用结构，云端写入受 Starter 配额阻挡；当前 Figma 三态/拼图及真实仓库绑定交互仍缺失。 |
| `device-ble-discovery` | 附近 BLE 设备 | `src/screens/BleDiscoveryScreen.tsx` | `3444:3166` | `3444:3182` | `3444:3198` | 当前诊断入口只扫描广播，不得描述为已连接、已绑定或已配网；权限拒绝、蓝牙关闭、扫描中、无结果、停止和后台中断状态可验证。 | **进行中** | Figma 生成器 `2026-09-04.17` 已把横屏扫描卡从越过右安全区的 `x=824` 收敛到 `x=776`，并按 App 的 `0.9 : 1.1` 双栏比例重排；生成前越界硬校验已加入。BLE 合同 12/12 与原生权限 introspection 通过；旧安全壳不代表实际页面视觉通过，当前云端三态、拼图和真机状态仍缺失。 |
| `device-provisioning` | 蓝牙/Wi-Fi 安全配网 | `src/screens/DeviceUnavailableScreen.tsx`（生产与 QA 共用） | `3444:3214` | `3444:3230` | `3444:3246` | 设计验收必须覆盖明确的不可用生产态；只有真实安全配网 adapter、设备身份验证和受保护凭据通道接入后，才可验收扫描、选择网络、输入密码、连接、失败与重试闭环。 | **进行中** | 2026-09-07 生产与 QA 共用 DeviceUnavailableScreen，只展示配网暂未开放及返回设备设置；无密码输入、网关或模拟成功。当前 Android 三态候选：`artifacts/design-acceptance/20260907-device-product-current-v6/device-provisioning/`。六态渲染语义与生产 wiring 检查通过；云端定点更新、原生 Figma 导出及拼图仍缺失，真实配网执行保持关闭。 |
| `device-firmware` | 固件更新与回滚 | `src/screens/DeviceUnavailableScreen.tsx`（生产与 QA 共用） | `3444:3262` | `3444:3278` | `3444:3294` | 设计验收必须覆盖明确的不可用生产态；预览不得称为真实升级。真实开放后需覆盖检查、下载、校验、安装、重启、健康检查、失败和回滚状态。 | **进行中** | 2026-09-07 生产与 QA 共用 DeviceUnavailableScreen，只展示固件更新暂未开放及返回设备设置；无虚构版本、升级/回滚或模拟网关。当前 Android 三态候选：`artifacts/design-acceptance/20260907-device-product-current-v6/device-firmware/`。六态渲染语义与生产 wiring 检查通过；当前 Figma 更新、原生导出及拼图仍缺失，真实 OTA/回滚保持关闭。 |
| `account-security` | 账号与安全 | `src/screens/AccountSecurityScreen.tsx` | `3444:3310` | `3444:3326` | `3444:3342` | 登录方式、邮箱验证、修改密码、MFA、撤销终端和返回路径必须反映真实账户状态；危险操作需确认并显示真实结果。 | **进行中** | App 的安全页/MFA 竖屏内容已从错误的 20px 边距收敛到 Figma 的 24px（390px 画布内容宽 342px），横屏继续使用 20px 双栏网格；安全响应式 14/14 与 typecheck 通过。`artifacts/design-acceptance/20260829-092544-android-current-source/account-security/` 仍只是旧安全壳，不代表实际页面通过；仍缺当前 Figma 拼图、隔离账户危险操作和确认焦点证据。 |

## 历史执行记录（2026-09-07，已被上方状态更正取代）

1. `main-analysis` 已完成当前源码 Android 浅色、深色、横屏、可信遥测空态和预览披露复验；三态像素门禁与 P0/P1/P2 全部通过。
2. `auth-login` 与 `auth-register` 已用当前源码重新完成 Android 三态、拼图、像素门禁和真实社交入口合同复验。
3. `main-routes`、`main-home`、`main-tasks`、`auth-login`、`auth-register`、`model-select` 与 `main-analysis` 已恢复当前源码强证据通过；当前为 **7/20 通过，13 页待完成**。
4. Batch B 中已通过页面保持冻结；`main-profile` 当前绑定 Figma 节点仍存在假在线与假遥测，`robot-control` 仍需逐项核对。修复脚本准备完成不等于云端节点已同步，必须以重新导出的绑定节点为准。
5. 随后按账户流程验收邮箱验证码、密码恢复、用户名、显示名称、MFA 和账号安全。
6. 最后验收设备绑定、BLE 发现、安全配网、固件升级与回滚；设计验收结果必须继续与生产实机门禁分开记录。

历史记录曾将多页视为视觉通过，但强证据清单当前只把 `main-routes`、`main-home`、`main-tasks`、`auth-login`、`auth-register`、`model-select` 与 `main-analysis` 计入最终全局 release gate。其余“进行中”或“待验收”页面不得在缺少本轮三形态证据时改写为通过。

2026-09-04 当前状态：20 页中 `main-routes`、`main-home`、`main-tasks`、`main-analysis`、`auth-login`、`auth-register`、`model-select` 共 7 页满足当前源码强证据通过，仍有 13 页未完成。Source Sync Section `3444:2680` 的 33 个三态 Frame 已完成上一轮原子替换并取得 `VERIFY_PASS`；本地 `.20` 安全区合同仍须在 Figma 中执行并导出，不能代替 App 运行时验收。其余页面继续按当前节点导出、真实交互、Figma 产品真值和像素门禁逐页收敛；配网与固件保持真实 unavailable 产品态，认证页仍需隔离账户真实响应。Figma Starter MCP 已达调用上限时继续使用已授权的 Scripter 定点写入和 Figma 原生 PNG 导出。

本轮登录/注册社交入口已统一为 44 × 44 光学画布、至少 44 dp 的含 hitSlop 点击区，并加入 readiness 驱动的禁用态、单 provider 选中/授权中反馈、重复调用保护、取消/错误清理与一致的读屏状态。当前生产模板三个 provider 均为未配置，因此默认运行时证据只展示真实不可用态；注册页三个 Figma 节点已同步该默认状态。
