# Brainstem 与 DOSO App 对接清单

本文面向负责机器人端的开发者。协议快照来自本地 Brainstem 源文件，并未在本次分享时重新核对机器狗的当前运行版本；联调前请同时核对机器人端源码、部署程序和协议身份。

## 已有接口与代码入口

| 内容 | App 入口 | 机器人侧合同 |
| --- | --- | --- |
| 协议快照 | [cms.proto](../contracts/brainstem_api/cms.proto)、[common.proto](../contracts/brainstem_api/common.proto) | `brainstem.api.v1.RobotControl`；保持消息字段编号和现有语义兼容 |
| 只读状态 | [brainstemGrpc.ts](../src/services/brainstemGrpc.ts) | `GetControlStatus`、`GetProfile`、`GetVoltage`、`GetMotorStatus` |
| 动作与租约 | [ControlSession.kt](../modules/brainstem-grpc/android/src/main/java/expo/modules/brainstemgrpc/ControlSession.kt) | `AcquireControl`、`RenewControlLease`、`ReleaseControl`、`WalkChecked`，以及 `Enable`、`Disable`、`StandUp`、`SitDown`、`SwitchProfile` |
| App 状态映射 | [directRobotConnection.ts](../src/services/directRobotConnection.ts) | 当前标签按 12 腿关节与 4 足轮映射，需要与实际机器人核对 |
| 输入与前台安全门禁 | [brainstemControlSession.ts](../src/features/control/brainstemControlSession.ts)、[G20 输入](../src/features/control/useG20Input.ts) | 本地触屏或 G20 输入必须经身份、控制权、状态和新鲜度检查 |

协议 SHA-256：`cms.proto` 为 `cd91af0c7e8e6b8f8626967a584b4c52c1e7bb04e966fdb06c0ea11540b31336`；`common.proto` 为 `fe8bc962f986df4810d58917d1d4860d510060a8aa7a7768c25b8ce238b0096c`。如机器人端 proto 不同，请先检查字段编号和语义，再协商升级；不要手改生成文件。

历史现场证据中，G20 code19 曾读到上述四项只读结果，code20 曾在受控条件下完成一次电机使能及随后失能。它们不是本次的在线结果，也不构成站立、行走、断线安全或生产验收。code21 之后的动作回执与策略菜单仍需相应实机复验。

## 期望机器人端配合

1. **稳定的只读状态**：无本地手柄时也初始化策略管理和状态数据源；明确反馈 FSM、控制者、租约、电机使能、故障、当前策略和可用策略。确保状态有可判断的新鲜度，离线或缺失值保持未知。
2. **电池与运动遥测**：提供真实电池电量或电池管理系统数据、机身实际前后/横移/旋转速度、通信质量和数据时间。`GetVoltage` 当前是各电机母线电压，不能直接当电池百分比；摇杆目标速度也不能当实测速度。新增字段时约定单位、坐标、时间基准和无数据语义。
3. **16 电机及多机型**：提供稳定的电机 ID、位置、速度、温度、力矩、在线状态和故障；核对真实机器的 ID 与 12 腿关节 + 4 足轮标签。不同机型应发布关节布局和能力清单，不能仅靠 App 的型号卡或 IP 判定兼容。
4. **真实控制和失效处理**：实现并测试租约、单调递增序号、ACK、输入超时、断线停止和本地手柄抢占；运动输出前再次核验电机许可、控制权、状态和故障。`WalkChecked` 使用机身坐标：x 前后、y 左右（m/s）、z 转向（rad/s）；符号、限幅和时序需双方以实际机器核对。App 当前输入新鲜度上限为 150 ms，原生运动 RPC 截止为 100 ms；服务端超时仍以服务配置与实测为准。
5. **姿态、电机和策略动作**：为站立、坐下、使能、失能、策略切换提供真实接受/失败及状态反馈。当前 App 对策略切换要求落地、电机失能、无活动租约并已同步策略目录；策略 ID 和说明以机器狗返回的真实列表为准，不凭文件名推测“平地/楼梯/攀爬”。
6. **停止与急停的清晰边界**：确认零速度、释放租约、失能和物理急停各自的行为。当前 proto 没有独立 `Estop` RPC，App 停止或页面退出不能冒充硬件急停；请提供真实停机及失联后的测试证据。
7. **连接与授权**：开发局域网模式仅用于明确隔离的联调。正式连接需要服务身份、客户端授权和证书校验；账户登录、设备绑定、机器人控制权是不同环节。不要将私钥或设备凭据提交到仓库，也不要以关闭证书验证解决连接问题。
8. **首次配网与后续实时传输**：BLE 首次配网需要机器人端提供身份校验、受保护凭据写入、失败恢复和 Wi-Fi 连接结果；后续状态和控制走 Wi-Fi/IP。未来目标是在 App 与机器人之间用 WebRTC 承载视频、音频、点云、状态和控制，机器人内部继续对接 Brainstem gRPC。信令、认证、传输配置、回执和失联策略尚需实现与验收，不能把目标架构当成现有能力。

## 推荐联调顺序

1. 先在离线 fixture / 仿真中核对 proto 编解码、状态字段、拒绝原因和动作 ACK。
2. 在真实机器人上先做只读状态与设备身份检查；逐项记录源码版本、协议哈希、App 安装包哈希、测量时间和结果。
3. 单独验证控制权、失联和停止链路；现场条件明确后，才逐项验证使能、姿态和低速动作。
4. 再推进 BLE 配网、视频/点云传输及跨型号能力。不能用网页预览、TCP 可达或单次模拟成功代替真实设备验收。
