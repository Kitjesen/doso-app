# 设备管理、持续状态与巡检地图同步 v1

文档核对：2026-11-08。范围为设备管理、远程持续状态及用户主动选择的地图上传下载。远程状态业务SQL、接口和云Gateway自动同步已有部署记录；2026-11-07已用已登记模拟设备、实际Web App和真实业务数据库完成状态流程，[范围与证据](D:/DOSO/robot-cloud/docs/SIMULATED_FLOW.md)。设备状态源为模拟Brainstem，机器狗、G20与5G仍待验收。地图目录、文件授权API与App目录入口保留本地验证边界，机器人地图执行器及真实OSS流程仍待完成。

## 分工和现状

- 复用 DOSO Auth / PostgreSQL 的账户、`devices`、设备绑定与现有 owner/session 权限。不再建立第二套账号或设备身份。
- Rust机器狗程序位于 `D:\DOSO\robot-cloud\robot/`，服务器组件位于 `cloud/`，协议位于 `shared/`，联调与部署工具位于 `tools/`；App、业务API和PostgreSQL负责用户选择、数据边界和业务状态。当前推进统一见 [PROGRESS.md](D:/DOSO/robot-cloud/PROGRESS.md)。
- Brainstem 是运行状态真源；现有 Rust `Status` 是传输投影，不新增另一套运动状态机或重复的 HighState。
- 既有 `status.read/result` 按需查询保持独立。持续上报使用正式 reporting 合同，并由用户选择、短时许可、后台同步和状态事务共同控制。
- App 已有按设备的主动开关和前台状态读取，业务数据库已有许可与最新状态投影；地图已有版本目录和私有对象记录。地图字节选用独立私有 OSS，bucket 尚未开通，真实文件传输待验收。

## 1. 设备管理的最小范围

| 范围 | 复用或新增 |
| --- | --- |
| 设备编号、型号、名称、序列号、所有者 | 复用 `devices`，不重复造设备登记真源 |
| 绑定、解绑、易主 | 复用现有身份与权限流程；易主后远程管理回到未授权 |
| 远程管理选择 | 已实现默认 false 的用户期望值、并发版本、短时许可与设备确认投影 |
| 最后状态与更新时间 | 已实现当前 Rust Status 的最新投影及上次成功状态，一设备一行，保留各自原始时间 |
| 连接与可用性 | 云端依据连接事件、最后接收时间、状态新鲜度显示；关闭、失联、状态读取失败不能混成物理掉电 |
| 地图目录与文件 | PostgreSQL 目录及文件授权接口已实现；独立私有 OSS 的实际字节传输待验收 |

许可变更必须通过已鉴权的后端；普通 App 不可直接写入设备生成的可信状态。状态提交在同一事务内检查最新所有权、设备授权代次、用户许可版本和流会话，关闭提交后拒绝旧许可报告。

远程管理默认关、媒体/地图独立选择、关闭待确认等规则继续遵守 [远程管理与数据边界](DOSO_REMOTE_MANAGEMENT_CONSENT.md)。临时服务配置 enabled 不是客户许可。

App 初次打开只读取，每次主动开启或关闭通过版本比较提交；前台自动读取，退出或进入后台不改变云端选择。业务数据库独立负责许可、续期、重连和状态保存，Gateway 负责执行许可。设备换主或授权代次变化后默认关闭并清除旧投影。接口与后台规则见 [用户远程状态接口](DOSO_REMOTE_STATE_API.md)。

## 2. 持续状态结构与消息

### 复用的业务状态

现有 `Status` 保留以下真实字段，不为界面完整而填假值：

- `state.kind`、`state.transition`：Brainstem 运行/过渡状态。
- `control.owner`：实际控制方。
- `control.motorOutputEnabled`：电机输出标志。
- `control.criticalMotorFault`：关键故障标志。
- `transport`：Agent 到本地 Brainstem 的连接方式，**不是 Wi-Fi/5G 类型**。

电量、充电、定位等仅在明确真实数据源后扩展类型和版本兼容；当前 `GetControlStatus` 读取未提供这些字段，不能写成 0 或伪造在线值。

### 持续上报与唯一消息合同

正式消息、主题、Ed25519 信封及 Automatic business sync v1 统一维护在 [robot-cloud 通信合同](D:/DOSO/robot-cloud/CONTRACT.md) 与 [shared reporting 类型](D:/DOSO/robot-cloud/shared/src/reporting.rs)。本文件只说明业务职责，具体字段按正式合同校对。

业务数据库持有设备授权代次、用户选择版本、采集会话及许可期限。Gateway 传递已验证的连接和设备确认事实，接收签名报告；数据库在状态事务中核对当前所有权、授权、会话、连接、递增序号和原始时间。重复报告不会推进采集或接收时间，旧授权无法在关闭提交后恢复入站。

本地读取失败使用固定 `upstream_unavailable`，`latest` 保存本次错误；`lastSuccess` 只保留业务数据库接受过的成功状态和原始时间。App 分开显示设备确认、数据新鲜度和上次成功时间，未知字段不补成零。既有按需查询不产生持续采集许可。

许可自动续期由后台负责，并要求当前完整许可的有效设备确认。未确认时重试原许可，保持原截止时间；过期、会话不可续用及换连接按正式合同处理。App 前台读取与后台许可生命周期独立。Rust 单元/本地实验、业务 SQL、Handler 和 App 的分项结果分别记录，完整联调与真机结果见对应验收证据。

## 3. 地图上传、存储与下载

### 复用真实 LingTu 地图包

LingTu 已有 `ExportMapPackage` / `ImportMapPackage`，格式 `lingtu-map-package-v1`。包目录包含 `package_manifest.txt` 和 `map/` 下的完整地图目录；manifest 保存 format、map_id、schema。通过本地 mapd 的 UDS service 调用，**不是已有的公网文件 API**：

原 manifest 仅接受这三个字段；云端 SHA-256、大小、归属等保存在外层传输记录，不塞入原 manifest。坐标系取原 metadata，例如已查看的车库图为 `odom`，不统一硬写成 `map`。

- `export_map_package`：`map_id`、`package_dir`、`dry_run`。
- `import_map_package`：`package_dir`、`requested_map_id`、`dry_run`。

不得只保存点云并宣称可完整恢复巡检地图。原始点云、元数据、占据地图以及原包中存在的 ray 等材料按现有导出结果保留。

导入原先会替换同名本地地图。本轮已在 LingTu 源码复用现有活动图检查，Windows 临时地图回归通过；尚未部署或在真机验证。云端下载仍默认导入为新的本地地图 ID，不能直接覆盖同名图。导入会重新分配本地 `content_epoch`，源 epoch 只作溯源，不冒充新本地 epoch。具体实施与验证见 [地图管理计划](DOSO_MAP_MANAGEMENT_PLAN.md)。

仅查看车库基线地图目录项：`map.pcd` 为 603,388,735 字节，`octomap.ot` 为 58,347,346 字节；这两项已约 662 MB，尚不含 523 个 patches 文件。完整包不能依赖当前本地 Storage 样例的 50 MiB 限额。文件服务须核对大对象、断点/分片传输和配额；实际压缩大小尚未测量。大包传输默认遵守用户网络设置，使用蜂窝或计量网络需用户明确允许；Wi-Fi 接口本身不保证上游不是计量 5G。

### 最小云端记录

已实现的地图版本记录包含不可变云版本 ID、名称、创建时所有者、来源设备及授权代次、原 map_id/source content_epoch、原包格式/schema、字节数、声明 SHA-256、预期 CRC64、上传状态和完成时间。对象 key 与 multipart ID 单独保存在私有记录，App 目录不暴露文件能力。坐标系等仅取已确认的地图元数据，没有来源时不编造。

所有者按创建时账户固定；设备换主人不自动向新主人开放旧地图。文件接口完成 multipart 后比较 OSS 实际保存对象的大小与 CRC64，通过后标记 ready，才允许签发下载能力。SHA-256 目前为上传方声明，目标机器人下载后必须复算并检查归档路径和原生格式。ready 仅表示该项存储与传输校验通过。地图字节通过 HTTPS 直传对象存储。

App 已接云目录查看和刷新；地图目录、上传准备、分片授权、完成、取消及临时下载接口已有本地候选。真实 OSS、机器人专用任务领取、导出上传、下载导入与单独激活仍待接入和验收。具体实现及校验含义见 [地图接口合同](DOSO_MAP_LIBRARY_API.md)。

### 目标文件流程

以下完整流程仍需机器人地图执行器接线，当前 App 只提供云端目录查看。

```text
用户明确选择上传
  -> 狗端在本地 exchange 目录导出现有 LingTu 包
  -> 标准文件归档（保留原包目录格式）及大小/SHA-256/CRC64
  -> 后端核对设备/地图权限并创建上传记录
  -> HTTPS 上传到私有文件存储
  -> 后端比较 OSS 实际大小和 CRC64，元数据变为 ready

用户选择已上传地图并要求目标狗下载
  -> 后端核对地图所有者、目标设备权限与本次授权
  -> MQTT 只通知 transferId、地图版本等小消息
  -> 狗端通过已鉴权 HTTPS 获取受限的下载信息并下载
  -> 临时目录校验大小/SHA-256及安全归档路径
  -> 调用本地 mapd 导入为新的 map_id
  -> 回传新本地 map_id/content_epoch，显示“已下载并导入”
```

下载/导入成功不等于激活。用户要求使用该地图时，仍经过现有 ProductControl 激活和定位就绪检查；传输程序不直接替换运行中的地图或授权运动。

当前云版本状态为 uploading、verifying、ready、failed、cancelled。机器人任务后续还须区分传输、校验和导入完成。断网失败不得把半文件标为可用；中断恢复只针对仍有效的用户传输任务。临时 URL 的有效期、取消及在途字节边界需用真实 OSS 验证，孤立对象和未完成分片的回收仍待实现。

## 4. 网络条件

| 条件 | 可做的事情 |
| --- | --- |
| Wi-Fi/5G/有线具有互联网且目标服务可达 | 按授权进行云设备管理、状态更新和地图同步 |
| 只有机器狗热点或无外网局域网 | 本地控制、状态读取及已有本地功能；没有通往 ECS 的路径时不能同步云数据 |
| 没有任何可达网络 | 本地已安装地图和安全控制继续；手机与云端都不能凭空取得当前状态 |
| 从断网恢复 | 重新核实权限，上报当前状态；地图任务按授权与实际任务状态恢复 |

Wi-Fi 已连接不等于有互联网，互联网可用也不等于 ECS 端口和证书验证一定成功。区分未启用、服务不可达、状态过期和读取失败，不用一个 online 布尔值代替所有情况。

## 5. 当前实现与有限验收

| 领域 | 本地已实现 | 仍须验收 |
| --- | --- | --- |
| 用户选择与状态入站 | 默认关闭、版本比较、设备归属及授权代次检查、关闭拒收旧报告；已有部署与正常账号模拟设备流程 | 真实机器狗完整流程、可信本地开启和完整断云 |
| 持续采集与后台许可 | Rust采样/网关、业务许可与续期、真实业务数据库及实际Web App已用模拟源串联 | 真实Brainstem、G20、独立公网MQTT与5G |
| App 状态界面 | 主动开关、前台自动读取、设备确认与过期显示、不确定结果自动核对 | 原生界面与真实账号/设备数据体验 |
| 地图目录与文件能力 | 数据库目录、固定归属、OSS 分片授权/完成/取消/临时下载、App 目录 | OSS 开通及真实上传/HEAD/下载、托管运行时、文件回收 |
| 机器人地图导入与使用 | 原生完整包导入入口活动图保护已有局部修复 | 地图执行器、HTTPS 传输、归档校验、新 ID 导入及单独激活 |
| 实际网络与设备 | 本地测试分项保留命令、日志和范围 | Wi-Fi/5G、断网恢复、真实延迟/流量和本地安全链路 |

普通状态只保存最新投影和上次成功状态，保留各自时间。远程状态的部署与模拟设备串联不覆盖私有OSS、真实地图传输或机器狗验收。分项检查、命令、日志和证据见 [本地验收工具](../../tools/cloud-acceptance/README.md)，后续当前状态见 [云端推进记录](D:/DOSO/robot-cloud/PROGRESS.md)，测试数量与通过状态以对应执行记录为准。

## 本轮代码依据

- DOSO：`src/services/deviceRepository.ts`、`src/services/remoteState.ts`、`src/components/RemoteStatePanel.tsx`、`src/services/cloudMaps.ts`、`src/screens/CloudMapsScreen.tsx`、`supabase/functions/remote-state/`、`remote-state-sync/`、`map-library/` 及对应 SQL 迁移。
- robot-cloud：`D:\DOSO\robot-cloud` 中的 `shared/src/status.rs`、`shared/src/reporting.rs`、`cloud/gateway/src/sync.rs`、`robot/` 和 `cloud/gateway/` 实现及 `CONTRACT.md`。
- LingTu：`src/maps/cpp/storage/maintenance.cpp`（包导出/导入）、`src/maps/cpp/service_jobs.cpp`、`src/maps/cpp/mapd/dispatch.cpp`（本地服务入口）。导航激活权威仍为 ProductControl。

本文记录本地已实现边界和剩余验收要求。运行消息以 Rust 合同为准，业务接口以各自 API 文档为准；真实机器狗、真实地图云传输和托管数据库尚未在本批验收。
