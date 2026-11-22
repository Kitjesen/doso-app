# DOSO 自建 MQTT 接入与量产准备

2026-11-08 文档核对：本页保留2026-11-02技术选择和首轮隔离试验，以下“待实现/未部署”描述只属于当时阶段。后续已建立 `D:\DOSO\robot-cloud` 的 `robot/`、`cloud/`、`shared/` 和 `tools/` 工程，云Gateway自动同步已有部署记录；状态许可的业务数据库、App开关和消息链路已有实现。当前路线与缺口见 [ARCHITECTURE.md](D:/DOSO/robot-cloud/ARCHITECTURE.md) 和 [PROGRESS.md](D:/DOSO/robot-cloud/PROGRESS.md)，2026-11-07模拟设备与真实业务/App串联见 [SIMULATED_FLOW.md](D:/DOSO/robot-cloud/docs/SIMULATED_FLOW.md)。

日期：2026-11-02。状态：已选择自建 MQTT 路线；首轮为本机隔离验证，非生产部署或量产验收。用户远程管理选择以 [数据边界约定](DOSO_REMOTE_MANAGEMENT_CONSENT.md) 为准。

本轮完成：新增独立 [MQTT 试验包](../../iot/mqtt-staging/README.md)，Windows 上真实 Mosquitto 2.1.2 + 模拟 A/B/Gateway 客户端的 8 个传输场景通过（测试报告含父用例共 9 项）；独立复核再次通过，退出后无遗留 Broker。[无密钥测试记录](../../iot/mqtt-staging/evidence/transport-20261102.json) 保留版本、二进制摘要与未验证项。阶段 A 的这部分已完成；Broker 重启、动态撤权和后续业务/实机阶段仍未完成。

## 本轮决定

1. MQTT 承担获用户授权后的设备状态、事件和有界任务消息；视频、地图、语音和原始传感器数据不因此自动上传。
2. 自建成熟 Broker，不开发自己的 MQTT 协议栈。不接入托管物联网平台意味着我们负责设备生命周期、用户权限、业务网关、运维与数据边界，不意味着所有底层能力从零开发。
3. 首轮采用 Eclipse Mosquitto 2.1.2 做真实 Broker / 模拟客户端的 loopback 测试。版本是本轮官方发布页与实际二进制核对结果，不是自动升级策略。
4. 首轮测试代码放在独立 `iot/mqtt-staging/`；不修改 App、根依赖、数据库或生产配置。这个名字不表示它已连接云 staging；不能把开发 Broker 接入现有真实 worker。
5. Mosquitto 单节点只作为接入验证基线。客户要求在线升级、节点故障自动切换或明确可用性承诺时，先选定并验证真正的高可用方案。不得把 Broker bridge 或负载均衡说成会话复制集群。
6. EMQX 保留为集群候选，需核对商用许可、修复版本、镜像摘要和故障测试。本次不购买、不安装它，不把单节点免费条件推广到量产对外服务。

## 2026-11-02 候选边界记录

```text
DOSO App --HTTPS/用户权限--> 现有业务服务
                               |
                 用户远程管理许可 + 任务记录
                               |
现有 worker --签名命令/HTTPS--> 常驻 MQTT Gateway（待实现）
                               |
                     Broker / 每设备 mTLS + ACL
                               |
                     设备连接代理（待实现）
                               |
                 本地接口、任务与安全系统

上行：设备签名的状态/回执 -> Gateway -> 现有 robot-ingress 验证 -> 数据库
```

- 复用 `docs/runbooks/ROBOT_COMMAND_WORKER_DEPLOYMENT.md` 的 Gateway v1：主题仅从签名 `command.device_id` 推导；QoS 1、`retain=false`；传输接纳与设备执行回执分开。
- 现有命令仅为非运动 `diagnostics.health_check`。`DOSO_ROBOT_COMMAND_DELIVERY_ENABLED=false` 保持不变。
- 不把 Supabase service-role、命令签名私钥或 named ingress 服务密钥发到机器狗。MQTT 双向 TLS 与现有业务签名分别验证，Broker 认证不能自动替代业务校验。
- ACK/遥测沿用现有设备协议；当前 `robotIngress.ts` 仅支持 `diagnostics.health`，不得把设计中的模式、告警等字段说成已经接通。
- 当时云入站、命令入口与数据库还没有完整的用户远程管理许可检查。后续远程状态已补业务许可和入站事务门控，当前仍缺机器狗本地可信开启与远程持久化断云；本页候选命令路线不作为远程运动已接通的声明。
- 现有只读 Brainstem bridge 不改成运动执行器。所有运动与安全仍由本地已定义的所有者处理。

## 配置基线与身份

| 项目 | 隔离试验 | 量产要求 / 未决项 |
| --- | --- | --- |
| 网络 | 只绑定 127.0.0.1 的临时端口 | Linux 上独立 MQTT TLS 入口；域名、证书、监控和防火墙在正式部署时配置 |
| 身份 | 临时测试 CA 和 A/B/Gateway 客户端证书 | 每台设备独立密钥与证书；签发、到期、轮换、吊销流程均需验收 |
| 用户映射 | 证书 CN 映射 MQTT 身份，拒绝自报身份提权 | immutable device ID；不以设备 IP、昵称或客户填写字段作认证依据 |
| Client ID | 测试服务端将 Client ID 绑定认证身份 | 防止 A 自报 B 的 Client ID 把 B 顶下线；生产断线重连语义单独验证 |
| 主题权限 | A/B 精确的读写方向，默认拒绝 | Gateway 管理 API 和凭据不向设备开放；跨客户/换主人撤权要测 |
| 消息 | 人工构造的非运动测试数据 | 任务 ID、时效、序号、授权版本和独立回执沿用现有契约 |
| 保留与队列 | 不保留命令；有界队列 | `retain=false` 不等于没有离线队列；设备独立检查过期与重放 |
| 日志 | 只保留测试身份、错误与结果，不打印私钥 | 默认不记录业务 payload；日志权限、期限和必要字段另行明确 |

### Mosquitto 2.1.2 的撤权注意事项

官方 Dynamic Security 说明支持禁用客户端，但不能直接套用到所有认证组合。对固定版本源码的检查发现：`use_identity_as_username=true` 使用客户端证书 CN，并跳过 MQTT BASIC_AUTH；Dynamic Security 的 disabled 检查位于 BASIC_AUTH 回调。不能据此配置“CN 映射 + disableClient”并假定有效证书再连接仍被拒绝。

本轮因此采用 CN + 静态 ACL 的传输验证，不把它包装成已完成运行中撤权。生产候选需分别验证：ACL 撤销是否阻止现存连接继续收发、重新加载的生效时点、主动断连、CRL/证书吊销对新连接的影响、设备端停止上报以及撤权期间在途消息处理。

关闭 CN 映射后额外添加 MQTT 密码也不是自动修复：若不验证证书身份与用户名一致，可能出现 A 的有效证书配合 B 凭据登录为 B。必须先证明身份绑定，不添加未经验证的认证组合。

## 用户授权生命周期

1. **未选择 / 已关闭**：设备端默认不启动远程状态发送；云端拒绝新的状态入站和远程任务。账号登录、设备绑定与设备状态上报是不同目的，不能悄悄合并授权。
2. **开启请求**：授权用户选择具体设备并确认数据范围；保存期望状态与授权版本。未收到设备真实确认前显示待确认，不能直接显示已开启。
3. **设备确认**：设备验证授权后只发布约定最小字段。是否接受运动任务由独立权限与本地安全链路决定。
4. **关闭**：云端立即撤销新的业务许可并停止续期；设备收到后停止远程采样/队列/发送并回确认。本地避障等仍可采集本地所需数据。
5. **设备失联**：显示关闭待设备确认。需要有界停止时，由设备本地单调时钟执行上传许可的有效期，期限须结合真实网络测试确定；MQTT 保活或 token 到期本身不能代替它。
6. **重连 / 重启**：先核实许可版本与新鲜度再恢复发送，拒绝旧开启消息。关闭期间的数据不在以后重新开启时补传。
7. **更换主人 / 恢复出厂**：清除旧所有者权限及会话，远程管理恢复未授权；不把旧证书和授权复制给新设备。

完全关闭远程连接时，远程重新开启需要另有明确可达路径。首版优先通过已配对本地连接开通；若产品之后需要云端远程重新开通，应明确最小配置通道是否保持连接及其元数据范围，不能在“关闭”名义下暗中继续遥测。

## 量产出厂与运维

- 设备 ID 贯穿出厂台账、证书身份、用户绑定和协议；每台设备生成独立私钥，不把同一密钥烧进所有固件。
- 优先设备内生成私钥；硬件安全存储是否可用尚未核查。生产 CA 与运行 Broker 分离，不把 CA 签发私钥放在公共服务进程中。
- 工厂完成身份登记和受控测试，交付前远程管理为关闭；产测权限和凭据不能残留为通用后门。
- 服务器发布锁定版本及构建/镜像摘要；保留配置备份、恢复演练、证书到期提醒与撤销记录。
- 分别监测在线连接、连接失败、鉴权/ACL 拒绝、队列积压、消息量、Gateway 延迟及设备执行回执；不把 Broker 在线当成机器狗健康或可运动。
- 设备重连使用有界退避及抖动；断电后集中上线、网络切换、证书过期均进入验收。
- HA、RTO/RPO、运行数据保留期与售后访问授权在量产前明确。本方案不承诺单机零故障或固定设备容量。

## 分阶段完成条件

| 阶段 | 交付 | 完成证据 |
| --- | --- | --- |
| A 本机传输基线 | Broker + 临时证书 + A/B/Gateway 模拟客户端 | mTLS、证书身份绑定、跨设备 ACL、正确消息方向与非保留交付的真实本机测试 |
| B 业务门控 | 常驻 Gateway、设备代理、云端用户许可与签名验证 | 默认关、真实本地开/关、过期/重复/迟到消息、撤权及重启负例；复用现有协议测试 |
| C 隔离云 staging | 专用 Linux 实例、独立身份、域名和证书 | 满足现有 staging 契约；单个非运动健康检查以及受控 RM500U 外网测试 |
| D 小批试点 | 100/500/1000 模拟连接与多台真实设备 | 实测 p95/p99、流量、资源、重连峰值；模拟与真实网络结果分列 |
| E 量产放行 | 工厂流程、用户开关、运维、升级回滚、故障恢复 | 完整权限/隐私/故障验收及明确可用性要求，必要时验证集群方案 |

阶段 A 不证明用户开关已实现，不证明完整 Gateway 或云/5G 已接通，也不替代阶段 B–E。不得为了演示成功而打开现有生产投递门控。

## 官方与本地证据

- [Mosquitto 官方下载](https://mosquitto.org/download/)：本轮稳定下载为 2.1.2。
- [Mosquitto 2.1.2 许可证](https://github.com/eclipse-mosquitto/mosquitto/blob/v2.1.2/LICENSE.txt)：EPL-2.0 OR BSD-3-Clause，商业分发仍需遵守所选许可证并保留相应声明。
- [Mosquitto 配置手册](https://mosquitto.org/man/mosquitto-conf-5.html)：mTLS、身份映射、ACL 与 Client ID 行为。
- [Dynamic Security](https://mosquitto.org/documentation/dynamic-security/)：角色及禁用客户端；版本认证组合还需以下源码核对。
- [2.1.2 handle_connect.c](https://github.com/eclipse-mosquitto/mosquitto/blob/v2.1.2/src/handle_connect.c)、[dynamic-security/auth.c](https://github.com/eclipse-mosquitto/mosquitto/blob/v2.1.2/plugins/dynamic-security/auth.c)：CN 映射与 BASIC_AUTH 路径的版本证据。
- [EMQX 许可](https://docs.emqx.com/en/emqx/latest/get-started/deploy/license.html)：5.9 起 BSL，商用/集群条件；应核对具体业务适用范围。
- [MQTT 5.0 标准](https://docs.oasis-open.org/mqtt/mqtt/v5.0/mqtt-v5.0.html)：QoS、会话、保留与消息过期，不提供物理任务执行事务。
- 本地：`docs/runbooks/ROBOT_COMMAND_WORKER_DEPLOYMENT.md`、`src/domain/device-protocol/`、`supabase/functions/_shared/robotIngress.ts`、`supabase/functions/robot-command-worker/gatewayTransport.ts`；已查看，不改写其契约。

待完成的生产判断：真实目标主机/资源、客户并发与上报频率、期望可用性、批量证书签发和轮换、撤权实现、用户开关端到端验收、目标 Linux 上复验。已有厂商资料不足以证明宇树公网设备管理采用 MQTT；本选择基于我们的需求与可验证的开源能力。
