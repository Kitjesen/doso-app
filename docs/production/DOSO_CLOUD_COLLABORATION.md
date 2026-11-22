# DOSO 云端功能协作分工

## 2026-11-08 当前交接

当前源码和运行位置统一为 `D:\DOSO\robot-cloud\robot/`（机器狗端）、`cloud/`（云服务器端）、`shared/`（共享协议）、`tools/`（联调与部署工具）。云端当前状态与下一阶段由 [PROGRESS.md](D:/DOSO/robot-cloud/PROGRESS.md) 维护，验证事实由 [TESTING.md](D:/DOSO/robot-cloud/TESTING.md) 维护，本文保留归属和接口交接。

2026-11-07已完成正常账号、已登记模拟设备、实际Web App与真实业务数据库的状态流程。设备源为模拟Brainstem，本机MQTT经公网SSH隧道接隔离Gateway；不是机器狗、G20、手机扫码或5G验收，详见 [SIMULATED_FLOW.md](D:/DOSO/robot-cloud/docs/SIMULATED_FLOW.md)。云端自动同步已有部署记录；机器狗本地可信开启、断云后重新开启和远程持久化断云仍未接通。以下11月3日分工与验证记录不覆盖后续部署状态。

2026-11-03，森哥要求本聊天与 `RM500U-CNV` 协同实施。分工已发送，实施聊天已在正常进展中确认“本聊天负责 App 和业务后端、RM500U-CNV 负责 Rust 通信与部署”。当前为工作归属与接口交接约定，不代表功能已交付。

## 唯一维护位置

统一验收入口与目录约定：[tools/cloud-acceptance/README.md](../../tools/cloud-acceptance/README.md)。看板模板/运行器放在该工具目录，生成记录放在 `artifacts/cloud-acceptance/<runId>`；不另建App、数据库或Rust源码副本。运行器读取Rust历史证据时标注来源，不擅自重跑公网或硬件测试。

- 通信工程：`D:\DOSO\robot-cloud`。机器狗程序在 `robot/`，云服务器程序与配置在 `cloud/`，共享协议在 `shared/`，联调与部署工具在 `tools/`。旧 C 盘通信入口仅为迁移说明。
- App/业务后端：本仓库的 `doso-app` 项目根目录；本机当前开发位置见 [DOSO 工程入口](D:/DOSO/PROJECTS.md)。保留现有 App 与 Supabase 技术栈。
- 业务部署目标为阿里云自建Auth/PostgreSQL/REST/Functions，沿用开源Supabase接口与SDK不表示继续使用Supabase托管服务。App遗留托管地址需在阿里云真实链路可用后切换；旧托管只读探测不得算作阿里云验收。
- 森哥最新要求改为真实服务与设备测试，停止用模拟结果代替验收；本轮仅发出只读云请求。机器狗当前开机联网情况尚未确认，运动控制不在本轮范围。

## 文件与运行职责

| 工作 | 负责聊天 | 可修改范围 |
| --- | --- | --- |
| 机器狗云连接、云端 Gateway、MQTT 配置、Rust 联调 | RM500U-CNV | `D:\DOSO\robot-cloud` 的 `robot/`、`cloud/gateway/`、`cloud/broker/`、`cloud/media/`、`shared/`、`tools/lab/`、`tools/deploy/` |
| ECS、设备安装包、证书和后续真机/5G | RM500U-CNV | 对应服务器与 `D:\DOSO` 的私有凭据/产物/工具目录；严格按当前用户授权操作 |
| 用户设备列表、远程管理选择、状态显示 | 本聊天 | doso-app 的 App/UI/services/types 相关文件，修改前核对共享脏工作树 |
| 设备归属、用户许可、最新状态与地图元数据 | 本聊天 | doso-app 的 Supabase 函数、迁移和数据库测试；部署与源码通过分开报告 |
| 状态/消息类型的唯一实现 | RM500U-CNV | robot-cloud `shared` 与 `CONTRACT.md`；本聊天按这份合同接 App/DB |
| 需求、数据边界与整体验收 | 本聊天 | doso-app `docs/production`；需求建议不作为第二份可执行协议 |

双方不同时编辑对方归属文件。需要改变范围时先在对应聊天或本文件记清楚；不使用整目录覆盖、批量回退或将另一聊天工作当成无关改动清理。

## 接口交接

1. 已部署的按需状态查询和现有 Status 保持兼容。
2. 持续遥测、用户许可确认和地图 transfer 的新字段/topic/错误码及样例由 Rust 主线写入唯一合同，本聊天据此接数据库和 App。
3. 业务后端负责用户身份、设备归属和用户许可；服务凭据不进入 App 或机器狗。Gateway 登记 enabled 不冒充用户开关。
4. 设备本地门控、许可版本/确认和云端拒收必须对应；保存 App 偏好不等于设备已经执行。
5. 地图文件经私有 HTTPS 通道传输，MQTT 只传控制与结果；采用 LingTu 已有完整地图包。下载、导入、导航激活分别验收。
6. 应用源码合并前核对字段和拒绝行为；真实端到端测试在机器狗开机且用户允许后执行。

## 2026-11-03 交付顺序记录

- **本地实现 A**：当时Rust持续状态采集、自动同步，以及业务许可/状态数据库/App面板已完成本地分项验证；地图目录/权限和文件能力保留既有验证。该轮安装部署暂停，之后的部署与模拟设备联调见本页顶部入口。
- **本地串联 B**：先核对捕获的Rust报文与实际handler，再连接实际handler与隔离PostgreSQL；Auth、RPC传输、模拟设备各自说明，不将分项结果拼称实时端到端。
- **后续联调**：获准后连接实际App、托管业务后端、Gateway和设备；缺失真机条件时只报告模拟结果。
- **联调 C**：用户选图上传 -> 私有文件与元数据 -> 指定机器狗下载/导入 -> 独立激活验证。
- **联调 D**：Wi-Fi/5G 断开恢复、关闭停发、设备隔离与必要流量记录。

每批交付报告：本次修改、接口版本、通过检查、部署位置、仍未验收项。不重复无变化的Broker基线测试，不用程序编译成功代替上线或真机成功。

2026-11-03业务侧已完成本地候选：用户按设备选择远程状态、PostgreSQL许可事务/状态保存、Gateway服务同步接口和App状态面板。App前台自动读取；退出App不撤销选择，续期由后端完成。关闭事务立即拒绝旧报告，不等待Gateway送达。当前权限的完整ACK（含截止时间）匹配后才能续期，不能把响应受理当成设备确认。

跨工程消息以 `D:\DOSO\robot-cloud\CONTRACT.md` 的 **Automatic business sync v1** 为唯一合同：批次 `v/observedAt/devices`，每设备 `deviceId/connectionId/lastSeenAt/reachable/permission/latest/sessionReusable`。业务数据库唯一持有用户选择；不从App维持短期许可。细节见[远程状态接口](DOSO_REMOTE_STATE_API.md)。地图业务接口见 [DOSO_MAP_LIBRARY_API.md](DOSO_MAP_LIBRARY_API.md)，尚未建立第二套MQTT地图消息定义。

统一本地9项检查于北京时间15:37:25完成，关键源码哈希一致；其中远程状态App21项、handler21项、真实PG7组通过，包括等待设备锁期间撤销授权的实测。`D:\DOSO\artifacts\robot-cloud\auto-sync-result.json` 另记录真实Rust Gateway/Broker/Agent与模拟业务API/Brainstem的自动续期及重连联调；8秒实验租期不能混同生产30秒配置。报文兼容回放与本地数据库串联分别记录，不作为完整托管端到端证据。当前未部署本批代码、未接真机。完整结果见[远程状态进度](DOSO_REMOTE_STATE_PROGRESS_20261103.md)。

相关范围：[远程管理约定](DOSO_REMOTE_MANAGEMENT_CONSENT.md)、[设备状态与地图 v1](DOSO_DEVICE_STATE_MAPS_V1.md)。
