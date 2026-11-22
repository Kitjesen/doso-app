# Boston Dynamics Spot 公开能力参考说明

更新：2026-10-13（Asia/Shanghai）。本文件仅用于算法和产品能力参考，不是 DOSO Spot 真机接入计划。DOSO 继续使用自有 Brainstem 机器人，不接入 Spot API。

Boston Dynamics 的公开 SDK 和 GraphNav 示例可参考以下能力：

- waypoint + edge + frame 的图地图；
- 地图加载后的显式定位初始化；
- 路线与任务分层；
- `accepted / running / reached / stopped / failed / unknown` 反馈状态；
- lease、heartbeat、截止时间和失联停止；
- 地图版本、路线校验和导航反馈分离。

参考资料：

- [Boston Dynamics Spot SDK](https://github.com/boston-dynamics/spot-sdk)
- [GraphNav 路线示例](https://github.com/boston-dynamics/spot-sdk/tree/master/python/examples/graph_nav_command_line)
- [GraphNav 地图结构](https://github.com/boston-dynamics/spot-sdk/blob/master/docs/concepts/autonomy/graphnav_map_structure.md)

DOSO 对这些思路的实现见 [自有机器人算法升级计划](../algorithms/BOSTON_DYNAMICS_REFERENCE_PLAN.md)。公开代码如需复用，必须先核对许可证；默认只借鉴数据模型、状态机和验收方法，不复制专有实现。

当前已完成：

- Brainstem 本地 ONNX/MuJoCo 双摇杆控制链；
- Android 原生双指、独立松手、取消、后台停止；
- 地图图快照和路线草稿的第一版纯算法校验：地图版本、坐标合同、waypoint/edge 引用和路线连接校验。

当前待完成：

- Brainstem 自有地图和定位协议；
- MuJoCo waypoint/edge 路线回放；
- 地图版本、路线草稿和路线执行数据层；
- 自有导航反馈和安全停止；
- App 真实地图 UI 与路线编辑器。

当前生产运动 executor 保持 `null`，正式 Figma 验收仍为 0/20。
