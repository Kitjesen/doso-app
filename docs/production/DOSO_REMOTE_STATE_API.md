# 用户远程状态与后台同步接口

文档核对：2026-11-08。本合同对应业务SQL与接口已有阿里云部署记录，真实公网服务鉴权检查通过，详见[部署记录](DOSO_BACKEND_DEPLOYMENT.md)。2026-11-07已用正常账号、已登记模拟设备、真实业务数据库和实际Web App完成状态串联；设备源为模拟状态，MQTT经SSH隧道，[范围与证据](D:/DOSO/robot-cloud/docs/SIMULATED_FLOW.md)。真实机器狗和G20的完整闭环仍待验收。用户每设备默认关闭，App退出不改变选择；地图、视频和运动使用各自权限。

## 单一归属

- PostgreSQL负责当前用户归属、选择、许可版本、采集会话及最新状态投影。
- Rust Gateway负责已认证设备连接、签名消息、短期许可发送及接收。状态与Permission字段以 `D:\DOSO\robot-cloud\CONTRACT.md` 和shared为准。
- App只访问业务接口；内部版本用于并发控制，不显示给用户，不接收Gateway服务凭据。

## Gateway服务同步

`POST /functions/v1/remote-state-sync`，只接受独立命名服务密钥的 `apikey`，不接受用户会话代替服务鉴权。密钥通过现有 `SUPABASE_SECRET_KEYS` 管理，`DOSO_REMOTE_SYNC_SECRET_NAME` 默认 `remote-state-sync`。函数自行校验，部署配置关闭此单个函数的平台JWT检查。

请求：`{v:1,observedAt:<Gateway UTC时间>,devices:[{deviceId,connectionId,lastSeenAt,reachable,permission,latest,sessionReusable}]}`。每批最多32台、128KiB；Gateway串行调用，每2秒一轮。批次时间用于拒绝乱序，最多旧15秒或未来2秒。permission/latest复用既有投影，sessionReusable是Gateway对当前投影会话可否续用的执行事实，不代表用户许可。此最终字段以Rust合同的Automatic business sync v1末节为准，不使用交接讨论中的其他候选字段。

响应：`{v:1,permissions:[{deviceId,permission:<既有Permission或null>}]} `。没有许可、响应错误或TLS验证失败时，Gateway不能自行延长。未知设备/等待连接或会话时返回null；用户期望true时不能返回同版本的false许可。只有实际关闭或归属重置才产生disabled决定，已确认相同关闭可返回null避免无谓重复确认。

每设备事务重新检查设备owner、授权代次、账户有效性和当前选择。关闭事务提交后拒绝旧epoch/version/session报告，不等待Gateway送达。设备换主/epoch变化默认关闭并清除旧状态。用户开启后，后台首次或重连创建session；有效同连接会话剩余不超过15秒时续到当前时间后30秒。到期会话不复活，另建新session。并发/旧同步不回滚新连接或版本。

当Gateway投影尚未匹配已签发会话，只重发原完整许可，不延长截止时间。匹配但sessionReusable=false时冻结续期；同连接须等待此前最高已签发截止时间再建新会话，换连接可立即建新会话。未曾发过采集许可的默认关闭显示“未开启”，不显示关闭待确认。

延期还要求设备已确认当前完整许可，包括已签发的expiresAt；旧期限的ACK只证明旧期限仍有效，不能授权继续滚动新期限。没有当前ACK则重试原许可，到期后新建会话。关闭时不继续保存/向App提供设备在线可见性；必要的连接/确认元数据只用于撤销执行和防乱序。

只有匹配当前epoch/version/session/connection并且序号推进的报告才能更新状态；重复缓存不刷新采集和接收时间。`latest`可为读取错误；`lastSuccess`只保留业务DB自己接受过的成功报告和原始时间，不从同步请求重复导入旧缓存。关闭后不接收新状态，用户数据的历史保留与单独删除规则不在此接口隐式改变。

## App业务入口

`GET /functions/v1/remote-state?deviceId=<UUID>` 读取当前账户拥有的真实设备；`POST`请求 `{deviceId,enabled,revision}` 提交用户选择。复用现有authenticate与caller-RLS RPC，不接受body中的owner。数据库用revision控制并发；网络结果不确定时App重新读取，不能只翻转本地开关冒充保存成功。

返回 `{deviceId,simulated,enabled,revision,activation,reachable,fresh,lastSeenAt,latest,lastSuccess}`。simulated取自库存身份，不能由设备报告覆盖；模拟设备使用正常绑定和授权，并在App明确标记。activation为 `off/enabling/on/disabling/unavailable`，与状态数据新鲜度分开。数据包含Status或固定读取错误，以及observedAt/receivedAt；无来源的数据保持未知。保存开启后等待设备确认；保存关闭后立即停收入库，未ACK显示等待设备确认。

2026-11-12本地合同候选将公共Status收敛为`state`、`control`和可选`location`。内部报告继续严格验证`transport`，公共采样DTO在数据库投影时移除该字段。CAS使用的`revision`保留，供设置冲突核对。此变更与历史公共投影一起协调发布，具体顺序见[历史接口协调发布](DOSO_REMOTE_HISTORY_API.md#协调发布)，尚未据此更新线上部署结论。

Status 从 2026-11-08 起支持可选 `location:{lat,lon,fixType,observedAt,accuracyM}`。坐标固定为 WGS84 经纬度，fixType 沿用 NMEA/LingTu 的 1..8，定位时间保留原始 fix 时间；未知精度为 `null`，不使用 HDOP 或名义精度填充。旧设备省略 location 仍兼容，不能上传 `location:null` 冒充有效定位。SQL DTO 只按状态/错误选择顶层字段，保留嵌套的未知精度。

位置沿用远程状态许可、归属和签名链路；GNSS失锁/过期时云连接程序省略位置，不阻断运行状态。App单独检查定位采集时间的五秒有效窗口，过期位置标灰；状态更新不刷新定位时间。查看位置使用 MapLibre 地球地图，底图与设备坐标分离，地图组件不接收账号token。底图失败仍显示坐标和采集时间。SLAM地图、视频和运动权限不受此扩展改变。

App在页面前台自动刷新：远程状态已开启时每秒发起一次、不并发；未开启或设置未知时每4秒。采集和接收超过5秒仍显示过期，不因轮询延长真实性窗口。已有状态的只读刷新不禁用开关；用户操作优先取消该读取，再按当前已保存revision提交，冲突或未知结果仍重新读取核对。离开/切账号停止页面请求，不修改后台选择。后端续期与App读取相互独立。App不负责每30秒续租，不向用户展示连接ID、采集session或序号。

## 实施与验收范围

本聊天维护App/SQL/Edge；RM500U-CNV维护Rust sync和正式共享类型。分层验证覆盖默认关闭、主动开启、同会话续期、断线重连、关闭与迟到报告竞争、跨账户/换主和错误状态时间；阿里云公网API已验证。2026-11-04已通过Wi-Fi读取真实Thunder的GetControlStatus，尚未完成狗端Agent与本机只读端点部署，不能据此声明自动持续上报通过。OSS、地图与5G另行验收。

当前源码按运行位置归类：机器狗程序在 `D:\DOSO\robot-cloud\robot/`，云服务器程序在 `cloud/`，共享消息在 `shared/`，开发/部署工具在 `tools/`。App的开关保存到业务数据库；机器狗本地持久化云连接选择与服务启停属于独立执行环节，仍有可信开启和完整断云缺口，详见 [PROGRESS.md](D:/DOSO/robot-cloud/PROGRESS.md)。
