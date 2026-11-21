# 多设备与真实服务检查

2026-11-08 文档核对：本页保留多设备迁移和部署历史。2026-11-07已创建明确标记的模拟库存，通过正常API绑定并在实际Web App、真实业务数据库验证远程状态流程；这不是多台实体设备或手机扫码验收。[模拟流程与证据](D:/DOSO/robot-cloud/docs/SIMULATED_FLOW.md)。当前云端推进统一见 [PROGRESS.md](D:/DOSO/robot-cloud/PROGRESS.md)，下文各时点公网、数据库和安装状态按记录日期理解。

## 2026-11-04 更新：阿里云服务已接通

本页后续“未部署/HTTPS未通”描述为11月3日部署前的记录。最新现场结果：可信公网HTTPS已启用，三份最小SQL已事务提交，多设备约束已放开；Functions和Envoy增量发布成功，六服务运行且健康，四个原有core服务保持。公开配置下Auth health/settings返回200；8项API鉴权边界通过；合法服务key的空设备同步batch返回200、空permissions。

App本地公开配置、Android专用Metro/QA目标已切到阿里云，对应23项测试通过。尚无新版安装包和真实账号/机器狗完整闭环，不把源码、服务上线或空batch当作真机状态验收。详细发布状态与证据统一见[国内后端部署](DOSO_BACKEND_DEPLOYMENT.md)。

下一项按顺序验收：Gateway连接新同步API；使用阿里云真实账号读取/认领/切换设备；用户逐台选择远程管理；真实Agent持续上报与关闭即停；断线恢复及Wi-Fi/5G。地图上传、私有对象存储、下载导入和“单独选择使用”另行推进。

2026-11-03。森哥要求解决一账户多台机器狗、减少无必要验证，并以真实服务测试推进。**目标为阿里云自建业务后端**；App配置中残留的Supabase托管地址是尚未切换的旧配置，不作为新功能部署目标。此前按该旧地址发出的只读请求仅能说明旧服务情况，不能判断阿里云业务库。无需登录或发布到Supabase托管项目。

阿里云业务后端部署记录指向上海 `47.103.89.137` / `api-test.dosorobotics.com`；MQTT/Gateway使用另一个ECS `8.153.169.177`。源码中的Supabase SDK、Auth、PostgREST及Functions可以用于阿里云自建运行时，目录/组件名称不代表服务仍托管在supabase.com。迁移记录见[国内后端部署](DOSO_BACKEND_DEPLOYMENT.md)。

## 已完成

- 新迁移 `20261103170000_allow_multiple_owned_devices.sql` 放开一账户一实体设备限制，保留设备serial唯一性、认领码校验与消费、设备行锁和服务端权限。已有第一台绑定不受影响。
- `device-binding` 删除过时的单台限制错误映射。
- 真实PostgreSQL17.11执行生产迁移及RPC，6项通过：升级保留原设备；同账户认领第二台；拒绝无效认领和跨账户抢占；两台分别开关远程状态；解绑一台保留另一台；两个数据库连接并发认领同一设备时只有一个账户成功。
- 数据库测试用本地测试账号/会话/设备记录，不伪造狗端状态。测试数据库已经停止。[结果](../../artifacts/multi-device/2026-11-03T09-25-21-905Z/verification.json)。
- 验收工具删除源码清单/逐文件哈希/结束复核/源码变化失效/重渲染入口，净减146行。保留命令、执行时间、范围、退出状态、日志和数据库所属进程清理。工具17项检查通过；没有为此重跑完整业务测试。

App源码已完成“我的设备”列表、已绑定仍可添加、选中设备、绑定后选中新设备、解绑后保留其他设备。当前设备按账户记忆；重载时重新核对归属；切账户清空列表。切换会退休旧连接及控制/遥测/视频上下文，A→B→A和迟到请求不会覆盖新选择。设置缓存只保留已确认值，保存请求在会话内保持单飞。

完整App类型检查通过，11个直接相关回归脚本106项通过；最后收紧迟到设置结果的操作标识后，只复跑相关两组25项，全部通过。回归检查使用受控I/O，不能作为真实账号或机器狗验收。独立代码审查无剩余阻断。既有bootstrap测试夹具遗漏的guestMode/accountBusy已补齐；新Deno数据库验证代码已从Expo App类型检查范围排除，继续由Deno单独检查。

兼容变化：旧版只按账户记忆的IP无法确定属于哪台狗，不自动归属到任意设备。首次需要重新选择该设备连接，之后按账户与设备分别恢复。当前未发布新App安装包，也未部署数据库迁移；线上多设备功能尚未生效。

## 本轮线上结果及目标区分

| 对象 | 实际请求结果 | 能证明什么 |
| --- | --- | --- |
| 阿里云业务域名 | DNS为47.103.89.137，HTTP首页200/nginx | 域名和HTTP站点可达；首页不是业务API验收 |
| 阿里云业务HTTPS | /auth/v1/health连接ECONNREFUSED | 当前公网HTTPS入口未接通，不能切App到该HTTPS地址 |
| 旧托管Supabase Auth | health/settings均HTTP200 | 旧账号服务可访问；不是阿里云验收 |
| 旧托管PostgREST | 正常返回不存在测试表的PGRST205 | 旧数据库API可访问；未读取用户记录 |
| 旧托管device-binding | OPTIONS HTTP204 | 旧绑定函数入口在线；未操作设备归属 |
| 旧托管remote-state / remote-state-sync | 两个均HTTP404 NOT_FOUND | 仅说明旧目标未发布新函数 |
| 旧托管get_remote_state | HTTP404 PGRST202 | 仅说明旧库无该RPC |
| 旧托管devices.robot_authorization_epoch | limit=0返回42703 | 仅说明旧库缺该列，不能用于阿里云部署判断 |
| ECS HTTPS按需查询 | 无凭据401；有效服务凭据查询未登记UUID403 | 实际TLS、Nginx/Gateway查询和鉴权路径可访问；未读狗端数据 |
| ECS持续状态查询 | 有效服务凭据GET status/latest返回404 | 新持续状态查询路由未在此ECS运行 |
| ECS MQTT 8883 | TCP可连接 | 端口可达；本轮未将TCP连通等同完整MQTT/设备通信验收 |

阿里云业务域名检查为北京时间21:16，[本轮实际结果](../../artifacts/remote-state-live/aliyun-business-public.json)显示HTTP不再返回此前的ICP备案拦截页，但不据此认定备案流程全部完成。MQTT ECS检查为20:45，[只读请求结果](../../artifacts/remote-state-live/ecs-readonly.json)。

旧托管调查记录仅用于解释遗留配置：[连通](../../artifacts/remote-state-live/2026-11-03T09-08-59.437Z/connectivity.json)、[Edge入口](../../artifacts/remote-state-live/edge-presence.json)、[数据库结构](../../artifacts/remote-state-live/schema-presence.json)。不得作为阿里云数据库或函数状态。

没有启动模拟Brainstem、没有生成假状态、没有发运动命令。上述请求不修改服务器配置或用户设备数据。

## 狗端与服务器程序

- 当前机器狗源码入口为 `D:\DOSO\robot-cloud\robot`，程序名 `doso-cloud-link`：主动连接MQTT，通过本机只读gRPC读取Brainstem，在有效许可内上报；Wi-Fi和5G共用这一程序。此前 `agent` / `doso-robot-agent` 名称仅用于对应历史产物记录。
- 当前云服务器源码入口为 `D:\DOSO\robot-cloud\cloud\gateway`，程序名 `doso-cloud-gateway`：验证设备消息、接收报告、同步业务数据库与用户许可；`cloud/broker/` 保存Mosquitto配置，Nginx提供HTTPS入口。
- App工程的 `supabase/functions/remote-state*` 和对应SQL负责账号归属、用户开关及状态保存，发布目标为阿里云自建运行时。阿里云当前数据库与函数结构需按该实例核对。
- 狗端ARM64安装包此前已准备，但旧包不能视为包含本次自动同步功能；尚未取得真实机器狗运行当前Agent并读取Brainstem的本轮证据。

## 接通真实闭环需要的具体工作

已有部署回执（2026-10-28）记录阿里云业务机六服务运行，网关仅监听127.0.0.1:18000，Functions只开放account-sessions。已运行12份SQL包含认领/解绑及会话权限，没有创建robot_authorization_epoch的机器人权限迁移。remote-state-sync还需要配置专用命名密钥；当前第十层Functions环境没有该配置。本轮没有取得远端Shell，不能把历史记录当成当前容器实况。

本机SSH已按现有known_hosts核对目标，但root公钥认证被拒绝；浏览器官方管理入口未能加载。后续使用该业务实例既有的官方Workbench免密入口或已授权SSH入口，不要求Supabase托管登录。

随后按森哥“你来操作打开”的要求，已通过官方轻量控制台打开该实例Workbench，以admin登录并切至普通Shell。**现场只读结果已取得**：六个后端容器均为Up且healthy（包括当前Functions）；网关仍只发布127.0.0.1:18000，公网80存在，443没有监听；真实数据库仍存在`devices_one_physical_per_owner_idx`，`get_remote_state(uuid)`不存在。此前“未取得远端Shell”的描述仅为接入前状态，当前已恢复通路。未重启服务、未改配置或写业务数据。

证据：[现场记录](../../artifacts/remote-state-live/aliyun-workbench-readonly.json)、[容器实况](../../artifacts/remote-state-live/aliyun-services.png)、[监听实况](../../artifacts/remote-state-live/aliyun-listeners-final.png)、[数据库结构](../../artifacts/remote-state-live/aliyun-db-final.png)。

1. 核对阿里云业务ECS当前六服务、十层Compose和数据库实际基线。旧托管库的缺列结果不作为此判断，不重跑旧首启或全量历史迁移。
2. 将必要数据库变更、两个状态函数及更新后的device-binding接入阿里云自建运行时；复用现有运维入口，不要求Supabase托管管理登录。
3. RM500U-CNV主线构建并部署配套Gateway和Agent，配置专用业务同步凭据及设备身份。只更新一个程序不足以接通。
4. 确认阿里云业务HTTPS与账号链路可用后，将App从遗留托管地址切到阿里云；保留旧账号数据，明确重新登录及账号迁移边界。
5. 真实机器狗开机联网后，核对Brainstem只读入口、设备UUID和Agent运行；用真实账号开启、读状态、关闭，再验收断线恢复。用户尚未回传本次机器狗开机/联网状态。

以上涉及已有账号与服务器，本轮没有执行生产迁移、替换线上程序或触碰运动控制。真实传感器、App安装包、多台实体机器狗及5G链路均未验收。
