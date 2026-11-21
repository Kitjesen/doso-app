# DOSO App UI source of truth

当前 App 已收敛为单一入口（`index.ts` → `App.tsx`），启动后直接进入以机器狗连接与控制为核心的三页工作台。账号登录、注册、独立设计预览入口（`index.preview.ts` / `index.video-test.ts` / `src/design-qa`）及早期 5-Tab 演示页已按阶段收敛下线；底层无头服务（`supabase/`、`admin/`、`src/services/`）保留以便后续恢复账号体系维护。

## 当前页面与入口

| 区域 | 当前实现 |
| --- | --- |
| 统一入口 | `index.ts`（包裹 `FontProvider`）→ `App.tsx`，启动直达三页工作台（默认 `control`） |
| 主导航 | `src/components/BottomNav.tsx` 中的 `RobotMainNav`，提供「控制」「状态」「设置」 |
| 机器人控制（默认首页） | `src/screens/ControlScreen.tsx`：实时画面（WHEP / Probe）、8 类参考设置项、摇杆/G20 输入、站立/趴下/电机使能/失能/策略切换、摔倒恢复 |
| 机器人状态 | `src/screens/JointStatusScreen.tsx`：只读查看本体状态、IMU、16 个腿部关节与足轮电机遥测；未连接或数据过期显示为 `—` / `未同步` |
| 设置与设备详情 | `src/screens/ProfileScreen.tsx`（`ProfileHub` 与 `detailsOnly`）：当前机器狗摘要、连接/切换/断开管理、安全锁状态、通知/外观偏好及「数据与隐私」「关于 DOSO」 |
| 连接机器狗 | `src/screens/RobotConnectionScreen.tsx`：局域网（LAN Dev）与 mTLS 配对证书直连、本机身份申请、`WifiDiscoveryPanel` 热点发现 |
| 视频与诊断 | `src/screens/LingtuStatusScreen.tsx`：导航/视频网关只读状态查询、绑定控制台视频、相机与深度预览链路检查 |
| 独立实时视频页 | `src/screens/VideoViewerScreen.tsx`：从连接页进入的只读全屏实时画面与深度预览 |
| 附近蓝牙发现 | `src/screens/BleDiscoveryScreen.tsx`：基于 `react-native-ble-manager` 的真实附近设备扫描与设备尾号读取 |
| 未开放功能说明页 | `src/screens/DeviceUnavailableScreen.tsx`：网络配网与固件更新的诚实只读状态说明 |
| 数据与隐私 | `src/screens/DataPrivacyScreen.tsx`：说明本机直连、视频流及 BLE 定位开关检查的实际数据范围 |
| 主题色 | `src/theme.ts`、`src/appearance.ts`、`src/officialPalette.ts` |

## 历史归档

- 历史构建包与设计审查画廊归档完整保留在 `releases/` 与 `artifacts/`（如 `artifacts/ui-review/`），不作为生产运行时入口。
