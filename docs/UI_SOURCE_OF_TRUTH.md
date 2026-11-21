# DOSO App UI Source of Truth

当前 App 已收敛为单一正式入口（`index.ts` → `App.tsx`），启动后直接进入以机器狗直连控制为核心的 **三页工作台**（横屏默认采用 **方案 A-1 16:9 深色曜石三岛悬浮 HUD**）。

为防止无效页面混入构建或误导联调，仓内所有界面与历史模块按以下三类状态严格标记管理。

---

## 1. `[ACTIVE]` 当前正式启用界面（主链路在用）

| 页面 / 组件 | 路径 | 当前职责 |
| --- | --- | --- |
| 统一应用入口 | `index.ts` → `App.tsx` | 挂载 MiSans `FontProvider` 与三页工作台（默认进入 `control`，Web 端支持 `16:9 掌机目标` / `铺满浏览器` 舞台切换） |
| 工作台导航 | `src/components/BottomNav.tsx`（`RobotMainNav`） | 在非沉浸页提供「控制」「状态」「设置」三页切换 |
| **主控页（默认首屏）** | `src/screens/ControlScreen.tsx` + `src/components/controlLandscapeHud.tsx` | 16:9 全屏实时主画面 + 右上双摄/深度画中画（PiP）、顶部三座悬浮胶囊岛、双虚拟摇杆 / G20 实体手柄 50Hz `WalkChecked` 控制、置顶软急停、姿态与预设动作抽屉、端侧抓拍与录屏 |
| **操控设置浮层** | `src/components/ControlReferenceUi.tsx` | 叠加于实时画面之上的 8 栏设置面板（通用 / 操控 / 视频 / 音频 / 网络 / 机器人 / 安全 / 关于），含**电机标零（`SetZero`）**、**清除故障（`ClearMotorFault`）**、**16/16 电机健康与温度角度矩阵**、**运动模式切换（`SwitchProfile`）**、**预设动作（`PlayGesture`）**及录像抓拍管理 |
| **HUD 仪表与诊断浮窗** | `src/components/ControlHudDashboard.tsx`、`src/components/ControlHudPanels.tsx`、`src/components/RobotRecoveryControls.tsx` | 底栏内联续航/电压托盘与展开圆盘仪表、单腿关节运动参数浮窗（L1）、电机测温浮窗、故障列表与 `RobotRecovery` 摔倒恢复控制 |
| **连接机器狗抽屉** | `src/screens/RobotConnectionScreen.tsx` + `src/screens/WifiDiscoveryPanel.tsx` | 局域网直连（LAN `:13145`）与 mTLS 客户端证书配对连接、本机身份申请、机器狗 Wi-Fi 热点扫描填入 |
| **机器人状态页** | `src/screens/JointStatusScreen.tsx` | 按四条腿分组只读查看 16 个关节与足轮电机遥测、母线电压及 IMU 姿态；断线或过期严格显示 `—` / `未同步` |
| **全局设置页** | `src/screens/ProfileScreen.tsx` | 当前连接摘要、连接/断开管理、告警与明暗主题偏好、数据与隐私入口 |
| **数据与隐私说明** | `src/screens/DataPrivacyScreen.tsx` | 说明局域网直连、实时视频流与蓝牙扫描权限的实际数据边界 |

---

## 2. `[PLACEHOLDER / EXPERIMENTAL / SECONDARY]` 辅助诊断与未开放占位界面

以下文件仍保留在 `src/` 中，但属于低频辅助入口或协议尚未闭环的诚实占位页，已在源码头部或界面内显式标注边界：

| 状态标记 | 路径 / 区域 | 当前边界说明 |
| --- | --- | --- |
| `[SECONDARY]` | `src/screens/LingtuStatusScreen.tsx` | 仅在连接页将传输切到 `navigation` 时显示，用于只读探测 LingTu 导航/视频网关状态 |
| `[SECONDARY]` | `src/screens/VideoViewerScreen.tsx` | 从连接页打开的独立只读全屏画面与深度预览页，不下发任何控制指令 |
| `[EXPERIMENTAL_READONLY]` | `src/screens/BleDiscoveryScreen.tsx` | 仅使用 `react-native-ble-manager` 扫描附近 BLE 广播并展示脱敏尾号；GATT 身份握手与 Wi-Fi 写参尚未接入（文件头已标 `@status EXPERIMENTAL_READONLY`） |
| `[PLACEHOLDER / BLOCKED]` | `src/screens/DeviceUnavailableScreen.tsx` | 无线配网（`provisioning`）与固件升级（`firmware`）的只读占位说明页，明确告知通道未接入，不伪造进度（文件头已标 `@status PLACEHOLDER / BLOCKED`） |
| `[READONLY_PLACEHOLDER]` | `ControlReferenceUi.tsx` 部分未接硬件项 | `音频` 页（扬声器/双向语音对讲标“未接入”）、`车灯`（仅本地状态预览）、`摇杆灵敏度` / `视频清晰度` / `自动录像`（只读灰态）、底栏 `-- KM`（无里程遥测时占位） |

---

## 3. `[RETIRED / DORMANT]` 已下线移除的无用界面与未挂载模块

### 3.1 已从源码彻底移除的历史无用页面（不再存在于 `src/screens` / `src/components`）
- **旧账号与认证流（11 页）**：`LoginScreen`、`RegisterScreen`、`EmailOtpScreen`、`ForgotPasswordScreen`、`ResetPasswordScreen`、`MfaSetupScreen`、`UsernameOnboardingScreen`、`DisplayNameConfirmationScreen`、`AccountSecurityScreen`、`EditProfileScreen`、`GuestScreen`（及 `LoginSurface`、`AuthEntry`、`SocialLoginButtons*`）
- **旧 5-Tab 业务演示页（9 页）**：`HomeScreen`、`MapScreen`、`MapLibraryScreen`、`CloudMapsScreen`、`LingtuMapsScreen`、`TasksScreen`、`LingtuTaskScreen`、`AnalysisScreen`、`ModelSelectScreen`（及 `LocationMap*`、`TaskAgenda`、`TaskEditor`、`TrackPanel`、`RoutePreviewMap`、`HomeArtwork` 等）
- **旧配网/OTA 演示与孤立调试入口（12 项）**：`BindDeviceScreen`、`DeviceEnrollmentScreen`、`ProvisioningScreen`、`FirmwareUpdateScreen`、`ConnectionDiagnosticsScreen`、`BrainstemSimulationScreen`、`LocalRobotScreen`、`DeviceTestScreen`、`VideoAcceptanceScreen`、`CloudVideoScreen`、`index.preview.ts`、`index.video-test.ts`、`src/design-qa/*`

### 3.2 保留在仓内但当前**未挂载任何前端界面**的无头模块（`[DORMANT_HEADLESS]`）
- `src/auth/`、`supabase/`、`admin/`、`src/domain/`、`iot/simulator/`：保留用于契约测试与后续云端账号/管理后台恢复演进，当前三页直连工作台运行时不加载上述登录或云端任务 UI。
- `releases/` 与 `artifacts/`：仅存放历史构建记录与验收归档，不参与运行时加载。
