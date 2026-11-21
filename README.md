# DOSO App

DOSO 是面向四足轮腿机器狗（Thunder 系列 / G20 遥控终端与移动设备）的直连操控与状态终端，基于 React Native（Expo SDK 57）与 TypeScript 构建。当前源码版本为 `0.0.1`。

> `0.0.1` 是项目正式发版前的开发基线。当前 App 已收敛为单一入口（`index.ts` → `App.tsx`），启动直达 **三页机器狗工作台（控制 / 状态 / 设置）**，主控横屏采用 **方案 A-1 16:9 深色曜石三岛悬浮 HUD**。
> - 界面启用、占位与已下线页面完整清单见 [UI Source of Truth](./docs/UI_SOURCE_OF_TRUTH.md)
> - 阶段构建与实机验证记录见 [0.0.1 当前发布状态](./docs/CURRENT_RELEASE_STATUS.md)

---

## 一、系统通信与功能架构

App 端侧同时对接机器狗底层运控服务（`brainstem`）与上层视觉/图传服务（`lingtu`）：

| 层级 | 服务端来源 | 协议与默认端口 | 当前已接通能力 |
| --- | --- | --- | --- |
| **运控与本体遥测** | **Brainstem**（`contracts/brainstem_api/*.proto`，`brainstem.api.v1.RobotControl` & `RobotRecovery`） | gRPC `:13145`（Android 原生 `DosoBrainstemGrpc` 直连；Web 开发经本地代理 `:8121` 转发） | 电机使能/失能（`Enable`/`Disable`）、站立/坐下（`StandUp`/`SitDown`）、租约申请/续期/释放与 50Hz `WalkChecked` 连续摇杆控制、软急停、运动模式切换（`SwitchProfile`：平地/楼梯/高台）、**电机标零（`SetZero`）**、**清除电机故障（`ClearMotorFault`）**、**预设动作列表与执行（`ListGestures`/`PlayGesture`）**、16 电机健康/温度/角度/母线电压与 IMU 流读取、摔倒恢复（`RobotRecovery`） |
| **实时图传与端侧采集** | **LingTu / 媒体网关**（本地联调为 MuJoCo 4.0 仿真推流服务） | WebRTC WHEP / 本地仿真流 `:5050` | 前/后双广角实时画面、右上角 16:9 画中画（PiP）一键互换主副视角、深度图预览叠层、**端侧 1080p JPEG 抓拍与 MP4/WebM 视频录制**（Web Canvas/MediaRecorder + Android 原生 `modules/media-capture`） |

---

## 二、当前界面结构与废弃/占位标记

详情与逐文件说明见 [docs/UI_SOURCE_OF_TRUTH.md](./docs/UI_SOURCE_OF_TRUTH.md)：

### 1. `[ACTIVE]` 正式在用界面
- **主控台（默认首屏）** — `src/screens/ControlScreen.tsx` + `src/components/controlLandscapeHud.tsx`：
  - **顶部三岛**：左岛展示设备名与连接状态（点击打开连接抽屉）及 `状态 / 操控 / 设置` 快捷切换；中岛提供 `平地 / 楼梯 / 高台` 模式切换与 `1.0 m/s` 速度上限调节；右岛展示延迟、电压、温度、录屏 `REC` 计时与置顶红色 `急停`。
  - **右侧视觉轨**：后广角/深度 16:9 小窗 + `双摄 / 深度 / 抓拍` 圆钮 + `前视 / 车灯 / 录屏` 胶囊条。
  - **底部控制坞与双摇杆**：左右独立虚拟摇杆（接入 G20 实体手柄时可切换实体输入），底栏集成 `使能/失能电机`、`站立`、`坐下`、`姿态`、`动作 ▾`（鞠躬 / 点头 / 扭动 / 伸展 / 跳舞 / 后退）及可展开整机仪表盘（`ControlHudDashboard.tsx`）。
- **操控设置浮层** — `src/components/ControlReferenceUi.tsx`：不离开实时画面叠加展开 `通用 / 操控 / 视频 / 音频 / 网络 / 机器人 / 安全 / 关于` 8 栏；其中 **`机器人`** 页集成**电机标零**、**清除故障**、运动模式、动作触发与 **16/16 电机实时状态双列卡片**，**`视频`** 页提供视角切换与端侧抓拍/录屏管理。
- **连接机器狗** — `src/screens/RobotConnectionScreen.tsx`：支持输入局域网私有 IP（默认端口 `13145`）、Wi-Fi 热点发现与 mTLS 配对证书连接。
- **状态页** — `src/screens/JointStatusScreen.tsx`：按四条腿分组查看 16 关节状态、电压与 IMU 数据。
- **全局设置与隐私页** — `src/screens/ProfileScreen.tsx`、`src/screens/DataPrivacyScreen.tsx`。

### 2. `[PLACEHOLDER / EXPERIMENTAL]` 占位与实验性只读界面（已在源码标记）
- `src/screens/DeviceUnavailableScreen.tsx`（`@status PLACEHOLDER / BLOCKED`）：无线配网与固件 OTA 协议尚未接入设备端 bootloader，仅展示诚实未开放说明。
- `src/screens/BleDiscoveryScreen.tsx`（`@status EXPERIMENTAL_READONLY`）：仅扫描附近 BLE 广播尾号，尚未接通 GATT 身份验证与配网写参。
- `src/screens/LingtuStatusScreen.tsx`、`src/screens/VideoViewerScreen.tsx`：连接页下的只读网关体检与独立画面预览辅助页。
- `ControlReferenceUi.tsx` 内暂未接入底层协议的条目（`音频` 扬声器/对讲、`车灯` 本地状态预览、`摇杆灵敏度`、`视频清晰度`、`自动录像`）均保持只读或本地预览标注。

### 3. `[RETIRED / DORMANT]` 已下线页面与未挂载后台目录
- 早期的登录/注册/验证码/MFA 页、旧 5-Tab（首页 / 地图 / 任务 / 分析 / 选型）、旧配网/OTA 演示页以及 `index.preview.ts` / `src/design-qa/*` 共 **30+ 个历史页面已从源码移除**。
- `src/auth/`、`supabase/`、`admin/`、`src/domain/`、`iot/simulator/` 当前作为无头模块保留在仓内用于契约测试与后续云端能力演进，不在当前 App 运行时挂载任何 UI。

---

## 三、本地全链路热加载联调（Web + Brainstem 仿真 + MuJoCo 1080p 图传）

前置条件：Node.js `>= 22.13`（推荐 Node 24 LTS）；如需运行 3D 实时相机仿真画面，需安装带 `mujoco` 的 Python 3.11+ 环境。

### 1. 安装依赖

```powershell
npm install
npm --prefix iot/brainstem-bridge install
```

### 2. 启动本地仿真与 Web 热加载服务（分终端运行）

```powershell
# 1) 启动本地 Brainstem gRPC 运控仿真（监听 127.0.0.1:13145，状态镜像 :13146）
npm run dev:brainstem-sim

# 2) 启动 Web 局域网 gRPC 代理桥（监听 127.0.0.1:8121）
npm run dev:web-grpc-bridge

# 3) 启动 MuJoCo 4.0 1080p 前/后双视角视频仿真（监听 127.0.0.1:5050）
npm run dev:mujoco-video

# 4) 启动 Expo Web 热加载服务（http://localhost:8081/）
npm run web -- --port 8081
```

### 3. 浏览器联调实操步骤
1. 打开 `http://localhost:8081/`，点击左上角设备胶囊进入 **连接机器狗**。
2. 地址输入 `127.0.0.1`（端口保持 `13145`），点击 **连接机器狗** 返回主控台（直连真机时将地址替换为机器狗热点 `192.168.50.1` 或局域网 IP 如 `192.168.66.64`）。
3. 在主控台或 **操控 › 机器人** 面板中依次体验：
   - 趴地态执行 **电机标零**（二次确认）与查看 **16/16 电机实时健康/温度/角度**
   - **使能电机** → **站立** → 拖动虚拟摇杆下发 50Hz `WalkChecked` 连续速度
   - 展开底栏 **动作 ▾** 或在设置页触发 `鞠躬 / 点头 / 扭动 / 伸展 / 跳舞 / 后退`
   - 切换 **平地 / 楼梯 / 高台** 运动模式
   - 点击右侧 **抓拍** / **录屏** 导出 1080p JPEG 与 MP4/WebM 视频文件

---

## 四、Android 真机 / G20 构建与测试验证

### 常用验证命令（与 GitHub Actions CI 对齐）

```powershell
# TypeScript 全量类型检查
npm run typecheck

# 控制台 UI 契约、横竖屏安全区布局、摇杆与交互回归
npm run test:control-ui

# 字体打包完整性与导航栏测试
npm run test:app-font
npm run test:nav

# Brainstem 桥接与本地仿真协议回归（需指定 contracts 目录）
$env:DOSO_BRAINSTEM_PROTO_ROOT = (Resolve-Path .\contracts).Path
npm run test:brainstem-bridge
```

### Android Development / QA 构建注意事项
- 原生模块（`modules/brainstem-grpc`、`modules/media-capture`、`modules/g20-input`、`modules/robot-wifi`、`modules/doso-pointcloud`）不包含在 Expo Go 中，真机调试需构建原生客户端（`npm run android -- --device` 或按 `eas.json` 构建内部包）。
- 本地 Android 编译请使用 **JDK 17 或 JDK 21**，并保持工程路径简短以避免 Windows CMake 路径长度超限。
- 签名密钥、`.env*.local`、本地构建缓存与 `.apk` 安装包严禁提交入库。

---

## 五、关键目录结构

- `App.tsx` / `index.ts`：三页工作台根容器与 Web 16:9 舞台适配
- `contracts/brainstem_api/`：Brainstem gRPC Protobuf 契约（`cms.proto`、`recovery.proto`、`common.proto`）
- `src/screens/`：当前启用页面与显式标记的占位/辅助页面
- `src/components/`：方案 A-1 横屏战术 HUD、8 栏操控设置、摇杆、仪表盘与恢复控件
- `src/features/control/`：Brainstem 控制会话、动作前置门禁、遥测轮询与 G20 物理摇杆模型
- `src/features/video/`：WebRTC WHEP 接收器、本地 MuJoCo 仿真流接收器与跨平台抓拍/录屏封装
- `src/services/`：Brainstem gRPC 客户端、Web 开发桥接垫片与 LingTu 只读探测服务
- `modules/`：Expo Android/iOS 原生模块（`brainstem-grpc`、`media-capture`、`g20-input`、`robot-wifi`、`doso-pointcloud`）
- `iot/brainstem-bridge/`：本地 Web gRPC 桥接服务、Brainstem 状态机仿真与 MuJoCo 1080p 视频推流脚本
- `scripts/`：UI 契约、控制会话、原生桥接与发布门禁自动化测试集
- `supabase/` & `admin/`：`[DORMANT_HEADLESS]` 保留的云端数据库迁移、Edge Functions 与独立管理端源码（参考 [联网后端部署指南](./docs/NETWORK_BACKEND.md)）
