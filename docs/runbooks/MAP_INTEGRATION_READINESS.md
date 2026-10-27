# DOSO 地图接入实施方案（自有 Brainstem）

更新：2026-10-13（Asia/Shanghai）。

## 当前审查结论

当前 `MapScreen` 展示的是三条静态图片模板，`routeId` 为 `null`、几何状态为 `unknown`、来源为 `template`，因此启动策略会正确阻断。Supabase 现有 schema 有 `devices`，没有地图、航点、边、路线或路线执行记录。Brainstem 仓库也没有地图/导航 RPC。

因此地图接入不能从替换 PNG 开始，必须先为 DOSO 自有 Brainstem 定义地图与定位合同，再让 UI 消费真实数据。Boston Dynamics GraphNav 只作为公开能力参考：它将地图建模为 waypoint + edge，并区分地图同步、定位、路线和反馈。参考：[GraphNav Service](https://dev.bostondynamics.com/docs/concepts/autonomy/graphnav_service.html)、[GraphNav 地图结构](https://dev.bostondynamics.com/docs/concepts/autonomy/graphnav_map_structure.html)。DOSO 不接入 Spot API，也不把 Spot 协议当成 Brainstem 协议。

## 目标闭环

```text
Brainstem 地图 / 定位服务
        ↓ 只读同步
Map Gateway（身份、版本、校验、坐标系）
        ↓
App 地图页（地图、定位、waypoint、edge）
        ↓ 编辑草稿
路线服务（用户/设备/地图版本隔离）
        ↓ 设备校验
Brainstem Route Execute / Navigation Feedback
        ↓
导航反馈、停止、失败、过期与审计
```

## 第一阶段：真实只读地图

先不开放绘制和执行，只把设备当前地图安全展示出来。

1. 建立 Brainstem 只读地图/定位连接，读取设备地图版本和定位状态。
2. 保存 waypoint/edge 的轻量元数据；大体量地图资产通过受控缓存或对象存储下载，不直接塞进 App 内存。
3. 读取当前 waypoint、定位 frame、机器人 pose 和定位质量。
4. 生成 `MapSnapshot`：`mapId`、`mapVersion`、`coordinateFrame`、`units`、`bounds`、`waypoints`、`edges`、`checksum`、`source`、`syncedAt`。
5. App 显示真实地图、当前定位和同步时间；没有地图、定位未初始化或地图服务不可用时显示空态/错误态，不能继续使用静态模板冒充设备地图。

## 第二阶段：路线草稿与保存

路线不能直接写入设备，也不能把用户点击坐标当成已验证航点。

建议的最小数据合同：

- `device_maps`：`id`、`device_id`、`source`、`map_version`、`coordinate_frame`、`units`、`bounds`、`checksum`、`synced_at`、`status`。
- `map_waypoints`：`map_id`、`waypoint_id`、`name`、`x`、`y`、`yaw`、`metadata`。
- `map_edges`：`map_id`、`from_waypoint_id`、`to_waypoint_id`、`transform`、`metadata`。
- `routes`：`id`、`owner_id`、`device_id`、`map_id`、`map_version`、`name`、`source`、`status`、`geometry_hash`、`validated_at`。
- `route_waypoints`：`route_id`、`ordinal`、`waypoint_id` 或经过校验的设备坐标。
- `route_executions`：`route_id`、`device_id`、`authorization_epoch`、`status`、`progress`、`last_feedback_at`、`failure_reason`。

写入规则：路线绑定地图版本；地图版本变化后路线进入 `stale`，不能执行；所有写入按用户和设备 RLS 隔离；重复保存使用幂等键；保存失败保留本地草稿。

## 第三阶段：设备校验与导航执行

执行前服务端必须原子重验：

- 当前用户仍拥有设备；
- 设备身份、boot id 和 authorization epoch 未变化；
- 当前 Brainstem 地图版本与路线一致；
- 路线中的 waypoint/edge 仍存在；
- 设备已定位且安全状态、Lease、Power 状态满足要求；
- 速度和目标区域在产品限制内；
- 当前没有其他控制方或正在执行的任务。

之后才调用自有导航执行接口，持续读取导航反馈。执行状态必须区分 `queued`、`accepted`、`running`、`reached`、`stopped`、`failed`、`unknown`；网络超时不能被显示成“已完成”。停止使用设备安全停止/任务取消路径，不能用 App 本地清除按钮冒充机器人急停。

## App 页面需要怎样改

当前示例路线区保留为“示例”，但不再作为地图主路径。地图页应增加：

- `同步设备地图`：显示加载、成功、无地图、定位失败、版本变化；
- 地图画布：waypoint、edge、当前定位、地图版本和比例尺；
- `我的路线`：空态、草稿、已校验、已过期、执行中和历史结果；
- 路线编辑：只允许选择真实 waypoint 或在已定义坐标系中编辑，并显示未保存状态；
- 执行前检查面板：地图版本、定位、安全状态、Lease、Power、路线校验；
- 真实反馈：进度、当前 waypoint、失败原因、停止结果；
- 离线和权限状态：不能把模板图片、假电量或假在线状态混进地图结果。

## 现在还不能做的事情

- 不能用 Figma 地图 PNG 推导真实坐标；
- 不能把三条 `routeId=null` 模板转换成可执行路线；
- 不能在没有 Brainstem 地图/定位来源时开放“开始巡航”；
- 不能把 App 本地绘图直接发送给设备；
- 不能在地图版本、定位、安全状态、Lease 或设备校验缺失时启动导航。

## 当前执行出口

第一份可验收证据应是：Brainstem 只读地图/定位服务返回地图元数据、定位状态和当前 waypoint，App 显示 map/version/waypoint，且没有发送导航或运动指令。之后再设计数据库迁移和路线编辑器，避免先写一套与设备地图不兼容的表。算法参考与差距见 `docs/algorithms/BOSTON_DYNAMICS_REFERENCE_PLAN.md`。
