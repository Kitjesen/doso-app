# DOSO 自有机器人算法升级计划：参考 Boston Dynamics 的公开能力

更新：2026-10-13（Asia/Shanghai）。

## 目标边界

DOSO 不接入 Boston Dynamics Spot 作为产品设备。本文件只参考其公开 SDK 文档、示例和可观察的产品能力，提升 DOSO 自己的 Brainstem、地图、导航和安全控制算法。具体复用公开代码前，必须单独核对仓库许可证；默认只借鉴接口思想、数据模型和验收方法，不复制专有实现。

参考入口：[Boston Dynamics Spot SDK](https://github.com/boston-dynamics/spot-sdk)、[GraphNav 服务示例](https://github.com/boston-dynamics/spot-sdk/tree/master/python/examples/graph_nav_command_line)、[GraphNav 地图结构](https://github.com/boston-dynamics/spot-sdk/blob/master/docs/concepts/autonomy/graphnav_map_structure.md)。

## 借鉴的能力

### 1. 地图图结构

把设备地图建模为 waypoint + edge + frame，而不是一张静态图片。每张地图有版本、坐标系、单位、边界和校验摘要；路线绑定地图版本，地图更新后旧路线自动失效。

### 2. 定位和地图初始化

地图加载后，机器人需要显式初始化自己相对地图的位置。定位状态区分 `uninitialized`、`localizing`、`localized`、`lost`，路线执行前必须是 `localized`。这部分需要 Brainstem 新增只读定位合同，不能从 UI 坐标猜测。

### 3. 路线与任务分层

把“手动速度控制”“路线执行”“任务编排”拆成三个层级：手动层输出短时速度命令；路线层按已验证 waypoint/edge 执行；任务层编排多个路线、检查点和动作。

### 4. 反馈状态机

统一区分 `queued`、`accepted`、`running`、`localized`、`reached`、`stopped`、`failed`、`unknown`。网络超时、设备未确认或反馈过期时保持 `unknown`，不显示成功。

### 5. 安全控制权

沿用本轮 Brainstem 仿真的租约、序号、零速度确认、失活 watchdog、后台停止和释放顺序；再扩展到路线执行的 authority epoch、抢占、断链和硬件急停。控制权由服务端持有，App 只提交受保护意图。

### 6. 局部环境与恢复

在静态地图之外增加局部障碍层和恢复策略：减速、等待、绕行、重新定位、回退和人工接管。先在 MuJoCo/离线回放中验证，再考虑真机。

## 当前 Brainstem 差距

- `cms.proto` 目前只有 locomotion、lease、state、IMU、joint、motor 和 profile 合同，没有 map、localization、waypoint、route、mission 或 navigation RPC。
- App `MapScreen` 目前是三条模板图片；没有地图 SDK、定位图层、航点编辑或 route repository。
- Supabase 目前没有 map、waypoint、edge、route、route execution 表和事务 RPC。
- 本地 MuJoCo 只验证移动/转向控制，缺少地图、障碍、定位漂移和路线执行场景。
- 转向目标跟踪偏弱；应先校准策略/仿真，再把速度误差与角速度误差纳入算法门槛。
- 当前云端命令管线是 `diagnostics.health_check` 非运动合同，不能伪装成路线执行通道。

## 实施批次

### A：协议与离线模型

先定义自有协议：`MapSnapshot`、`LocalizationState`、`RouteDraft`、`ValidatedRoute`、`RouteExecution`、`NavigationFeedback`。建立图结构、坐标系、几何校验、版本和 hash 的纯 TypeScript/Dart/Python 测试。

### B：MuJoCo 地图回放

给本地仿真增加一张小型 waypoint/edge 图、当前位置和模拟定位；验证路径选择、速度限制、到点判定、失定位和停止。所有数据标记 simulation-only。

### C：只读设备地图适配器

由 Brainstem 提供地图快照和定位快照；App 只读同步并渲染真实 waypoint/edge。同步失败、版本冲突和定位丢失都进入明确状态。

### D：路线草稿与服务端校验

新增受 RLS 保护的 `route_maps`、`routes`、`route_waypoints` 和 `route_executions`，路线绑定 `device_id + map_version + geometry_hash`。只有 `validated` 且版本匹配的路线可进入执行层。

### E：受限路线执行

增加独立 route executor，不复用当前 health-check command。执行前重验设备归属、authority epoch、地图版本、定位、Lease 和安全状态；持续写入反馈，超时保持 unknown 并触发停止流程。

### F：App 地图 UI

把模板区改成真实地图状态：同步、定位、waypoint/edge、路线草稿、版本失效、校验、执行进度和停止结果。没有真实数据时展示空态，不显示假路线。

## 验收出口

1. 离线图模型、坐标和几何测试通过。
2. MuJoCo 路线回放通过，包含到点、障碍、失定位、停止和恢复。
3. Brainstem 只读地图/定位快照可读取，App 显示真实版本和定位。
4. 路线草稿保存、版本失效、几何校验和账号/设备隔离通过。
5. 受限执行可看到服务端反馈，失败不伪造成功。
6. 真实机器人接入前，手动控制和路线执行分别通过独立安全门禁。
