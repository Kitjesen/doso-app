# Brainstem 本地接入与后续控制验收

## 2026-10-25 当前状态校正

下文保留历史仿真和只读阶段证据。当前源码已增加Android原生ControlSession/ControlWire，实际连接AcquireControl、WalkChecked、ReleaseControl、StandUp/SitDown、Enable/Disable和SwitchProfile，不能再把“原生仅只读”作为今天的源码结论。账号命令执行器null与这条原生直连控制路径是不同通道，不能据前者推断后者不存在。

上轮只读结果为G20 code13、本地保留包最高code15、源码准备code16；电脑到192.168.66.64:13145超时，G20同端口No route to host。本轮没有重测现场网络。随后已在本地Brainstem源码修复纯gRPC策略/姿态增益依赖本地手柄，以及自动fuser抢端口：共同初始化同一PM/gains，按实际FSM切参数，端口冲突只清理本次server并报错。386项联合回归及严格分析通过，详见artifacts/release-readiness/20261025-grpc-only-wiring/；尚未部署或执行真实动作。两处修复不改变App RPC协议，生效需更新机器人端Brainstem；不能仅靠重装App。受控部署仍须停旧硬件实例，不可双开硬件入口做端口试验。

更新：2026-10-13。用户确认当前没有机器人，先进行本地联调。以下最新本地仿真控制取代旧只读范围；旧协议证据仍独立保留。

## 当前配置门禁（2026-10-24）

DOSO 连接中心和控制页统一使用 `src/services/brainstemIntegrationReadiness.ts` 的九项门禁：原生 gRPC 模块、端点、只读状态、设备身份、远程监听、远程 mTLS、控制租约、生产执行器、ACK/失联清零。它只投影布尔状态和固定中文原因，不读取或保存令牌、证书路径或私钥；只读 `GetControlStatus` 成功不会让 `controlReady` 变为 true。

本地桥接配置可用 `iot/brainstem-bridge` 的 `npm run preflight:config` 做脱敏预检。该命令只检查绝对路径是否存在和配置组合是否安全，不连接目标地址、不读取证书内容、不启动服务；桥接当前仍只提供 `GetControlStatus`。未通过现场监听、mTLS principal、设备身份和控制执行器验收前，生产 App 不发送 `AcquireControl`、`WalkChecked`、`StandUp`、`SitDown`、`Enable` 或 `Disable`。

## 当前实际仿真控制

Android 双摇杆 → App 控制器 → `127.0.0.1:8122` WebSocket → `127.0.0.1:13147` 真实 `UnifiedCmsServer` → ONNX mini policy / MuJoCo，观察器在 `127.0.0.1:13148`。这是真实本地仿真，不是 fixture，也不等于真机。

会话先确认观察器实例身份，再 `AcquireControl`，确认序号 1 零指令后才开放输入。左杆控制前后/横移（各限幅 0.25m/s），右杆控制转向（0.5rad/s）；采用 50ms 持续输入、串行递增序号与真实 ACK。客户端输入截止时间 180ms、服务续租 90ms、输入失活 250ms。初始零速 bootstrap 最多 1000ms；任意首条输入到达后启用严格失活保护。不缓存或重试运动，不自动重连。

松手独立清零，全部松手零速；取消/离页/后台/断连停止会话。正常释放先确认零指令，再确认租约不活动；无法确认会明确失败，不补写成功 ACK。页面底部是最近一次真实确认的目标指令，不是实测速度。

最终安卓 5 组原生场景和当前 App 控制器 5 组真实链路场景通过，10 个源码 SHA 已核对。前进约 0.295m、松手到服务侧观测零指令约 107ms；物理速度随后衰减至近零，不宣称瞬停。转向指令已到达但实际转角约 -0.40°，跟踪偏弱，策略与仿真参数待标定。

启动、停止、ADB reverse、复现和证据见 `artifacts/release-readiness/20261013-brainstem-simulation-control/README.md`，流协议见 `iot/brainstem-bridge/LOCAL_SIMULATION.md`。开发变量 `EXPO_PUBLIC_BRAINSTEM_SIMULATION=1`，Design QA 与连接诊断关闭，当前 Metro 8130。只有开发入口和实例验证后的 loopback 会话可操作；生产 executor 保持 null，不能将此模块指向硬件端口。

仍需：运动跟踪门槛与模型/参数校准、真机身份和权限、硬件保护链路与实测停止、稳定原生新包、正式设计与完整发布验收。本轮未修改 Brainstem 仓库或生成协议文件。

## 历史只读接入范围（2026-10-12）

Android 原生 App（连接诊断）→ 本机 HTTP 只读网关 → gRPC `RobotControl.GetControlStatus`。

生产 `PRODUCTION_ROBOT_COMMAND_EXECUTOR` 保持 `null`。读取结果不会变成设备绑定、可信电量、在线状态或运动权限。控制中心新增的“连接 Brainstem · 开发联调”入口仅在开发构建出现；返回诊断页不会更改控制模式。登录页和个人页仍可进入同一诊断页，Design QA 保持离线。

本机协议 fixture 使用真实 `cms.proto` 编解码，但状态是测试数据，**不是实际 Dart 服务、ONNX/MuJoCo 仿真或真机证据**。另有独立 harness 运行真实 `UnifiedCmsServer`，Brain/FSM 仍为 mock；它验证真实服务的网络合同，但仍不等于完整仿真或真机。App 展示“本地联调 · 未验证真机”；即使 gRPC owner 或电机使能为真，也明确不代表本 App 已取得控制权。快照 15 秒过期，取消/离页中止读取，后台清除令牌及状态，不自动联网。

协议来源：`D:/inovxio/brain/brainstem/brainstem_api/brainstem_api/cms.proto`；实际实现：`han_dog/lib/src/server/unified_cms_server.dart`；硬件鉴权说明：`docs/LINGTU_REMOTE_MOTION.md`。不修改生成协议文件。

## 控制接入不能省略的合同

1. Supabase 账号认证、设备绑定与 Brainstem 的客户端证书身份是三件事。账号登录成功不自动授予机器人控制权。
2. 硬件远程控制需要 mTLS 客户端证书映射和来源 IP 许可；App 不内嵌机器人私钥。网关仍需实现账号到设备权限的核验，当前诊断 bearer 不能用作运动授权。
3. `AcquireControl(client_id)` 获取租约；`RenewControlLease(token)` 续租。默认租约只有 300ms，不能依赖移动端后台 JS 定时器或云端数据库轮询维持安全。部署时必须以实际 Brainstem 配置为准。
4. `WalkChecked(token, sequence, direction)` 要求有效租约、单调递增序号、有限数值、FSM/电机/故障门禁；先完成零速度确认，不能直接发送非零运动。
5. `ReleaseControl`、超时/抢占与 `Disable` 语义不同。协议没有独立 `Estop` RPC；不能把断开页面或本地取消按钮冒充硬件急停。真实停止、禁用和物理急停必须分别验证。
6. 当前控制协议不等于地图/路线/导航服务；不能将 Figma 路线模板直接发送为执行路径。

## 按依赖推进

| 阶段 | 本阶段证据 | 进入下一阶段的条件 |
| --- | --- | --- |
| 本地协议链路 | 真实 proto 的本机 fixture、Android 读状态、错误令牌/过期/后台行为 | 接口和失败路径通过，不登记硬件完成 |
| 实际 Brainstem 服务 | 隔离且完整的 Dart SDK，loopback-only 的真实 server 实现；再跑 ONNX/MuJoCo | 区分 server 合同 harness、完整仿真和硬件三个证据等级 |
| 非运动控制会话 | 仿真中获取/续租/释放与零速度 ACK、序号、超时/断连/抢占测试 | 正确实现鉴权与失效安全；不依赖 UI 假 ACK |
| 真机只读 | 当前端点、TLS 身份、设备归属和真实状态对照 | 现场负责人确认安全条件，保护链路可用 |
| 真机运动 | 明确限幅/速率/死区，控制权抢占、硬件急停与断线停止 | 每项有实机证据后才开放生产 executor |

真机地址、证书私钥不写进聊天、源码或截图。没有安全条件时继续离线测试，不探测历史机器人 IP、不启动硬件入口或扫描 CAN。

## 验证入口

- `npm run test:connection`：App HTTP 合同、状态展示、取消/后台/过期行为及云端公共接口预检。
- `npm run test:robot-command-executor`：现有生产门禁、ACK/截止时间、取消和控制权失效回归。
- `iot/brainstem-bridge` 内 `npm test`：真实 proto + 本机 gRPC 网关协议测试。须设置 `DOSO_BRAINSTEM_PROTO_ROOT=D:/inovxio/brain/brainstem/brainstem_api`。
- Android 测试证据：`D:/DOSO/ui-review/20261012-brainstem-local/`。旧开发壳加载当前 JS；不等同于新 APK，不能覆盖尚未打包的原生相册模块。

只读网关的正式启动、mTLS 和 HTTPS 配置见 `iot/brainstem-bridge/README.md`。不得为了联调将远程 TLS 校验或生产权限门禁关闭。

### 开发客户端启动与已知限制

以下脚本的参数/预检/ADB 链接已校验，但本轮再次启动的实际 UI 尚未通过：热启动出现 DevLauncherController NPE，冷启动一次返回桌面。不能把 exit 0 当作可用页面或稳定测试环境。已保存成功截图来自此前加载成功的当前源码会话；后续应先解决可重复启动，再继续扩大原生验收。

先在当前 app 根目录启动 Metro，端口必须与后续命令一致；联调页需要开发环境变量 `EXPO_PUBLIC_CONNECTION_DIAGNOSTICS=1`。然后运行：

```powershell
pwsh -NoProfile -File scripts/launch-android-dev.ps1 `
  -AdbPath 'D:/software/Android/platform-tools/adb.exe' `
  -Serial emulator-5554 -Port 8082 -RestartApp
```

脚本先检查本机 Metro `/status`，再确认设备和已安装包，最后建立指定端口的 reverse 并使用 `doso://` 显式进入 `.MainActivity`。`-RestartApp` 仅在全部预检通过后停止指定开发包再冷启动；省略此参数则不停止 App。该选项未证明能修复上述启动器异常。不存在的 Metro 在 ADB 操作前报错；脚本不删除缓存、不修改代理、不结束其他应用。使用其他端口时显式传入 `-Port`，不要复用旧证据目录中硬编码 8081 / `expo-dev-launcher://` 的历史脚本。启动成功仍需核对实际页面及当前 bundle，不以进程退出码替代 UI 验证。
