# DOSO 量产文档

当前优先级：先完成一台机器狗与真实G20/DOSO App的连接、状态读取及后续受控动作验收，再扩展量产管理。方案成熟度和当前产品完成度分别报告；文档不是通过记录。

2026-11-10已更新[App完成情况与统一待办](DOSO_FUNCTIONAL_REQUIREMENTS_AND_DELIVERY_BACKLOG.md)，当前P0为单狗稳定控制和50Hz链路，BLE配网的两端实现与硬件验收列为P1。[BLE专项待办](ROBOT_BLE_PROVISIONING.md)记录扫描/UUID读取、真实身份、Wi-Fi写入、联网结果和恢复各环节的状态。

2026-11-08 文档核对：云端当前进度与下一阶段统一见 [robot-cloud推进记录](D:/DOSO/robot-cloud/PROGRESS.md)，通信测试事实见 [TESTING.md](D:/DOSO/robot-cloud/TESTING.md)。2026-11-07已通过已登记模拟设备、实际Web App和真实业务数据库的状态流程，包含正常API绑定、开启、离开页面后续期、断网恢复和关闭停采；设备状态为模拟源，MQTT经SSH隧道，未代替机器狗、G20、手机扫码、独立公网MQTT或5G验收。[该轮范围与证据](D:/DOSO/robot-cloud/docs/SIMULATED_FLOW.md)

| 文档 | 用途 |
| --- | --- |
| [连接与使用规则（2026-11-04）](DOSO_DEVICE_ACCESS_RULES_20261104.md) | 当前采用的本地使用、临时借用、云端归属和数据上传规则；[PDF 存档](../../output/pdf/DOSO_机器狗连接与使用规则_20261104.pdf) |
| [统一产品方案](DOSO_DEVICE_OWNERSHIP_AND_PAIRING.md) | 工厂身份/检测、用户认领、多人多机、存储位置和售后 |
| [多设备与实际服务进度](DOSO_MULTI_DEVICE_PROGRESS_20261103.md) | 多设备实现、真实数据库测试、线上接口实测与待部署缺口 |
| [远程状态进度](DOSO_REMOTE_STATE_PROGRESS_20261103.md) | App、业务数据库与云通信的现有实现、模拟设备联调及真机缺口 |
| [远程状态API](DOSO_REMOTE_STATE_API.md) | 用户开关、业务状态与服务间同步合同 |
| [账号登录 IP 自查 API](DOSO_ACCOUNT_LOGIN_IP_API.md) | 本人登录时间/IP读取、可信代理边界与发布状态 |
| [视频观看授权](DOSO_VIDEO_ACCESS_20261105.md) | 独立观看许可、媒体会话及部署验收边界 |
| [单机App接入验收](SINGLE_ROBOT_APP_ACCEPTANCE.md) | 当前阻断、执行分工、逐级验收和证据 |
| [国内后端部署与账号迁移](DOSO_BACKEND_DEPLOYMENT.md) | 认证联网故障、部署材料、国内托管选项、保数据迁移及验收 |
| [机器狗端BLE配网](ROBOT_BLE_PROVISIONING.md) | 蓝牙硬件门槛、板端服务、App职责与真实成功条件 |
| [App完成情况与统一待办](DOSO_FUNCTIONAL_REQUIREMENTS_AND_DELIVERY_BACKLOG.md) | 当前完成表、单狗控制优先级、BLE配网、账号、地图任务、视频、动作与OTA的验收出口 |
| [官方手册归档](../references/robot-pairing/20261025/README.md) | 宇树、Spot、DJI六份手册，467页，保留来源与哈希 |

## 方案成熟度的表述

采用的是成熟的设备生命周期原则：每设备身份、制造/部署分工、首次授权、访问权限和后续撤销。不能声称所有公司用同样的表结构、证书体系或协议，也不能因为参考成熟方案就称DOSO已经量产成熟。

- AWS官方白皮书分别讨论制造阶段身份配置、可信用户部署、PKI和设备凭据生命周期，证明这些职责划分不是DOSO临时自创；采用该原则不要求购买或接入AWS。
  https://docs.aws.amazon.com/pdfs/whitepapers/latest/device-manufacturing-provisioning/device-manufacturing-provisioning.pdf
- CSA Matter官方FAQ明确BLE可用于设备设置、Wi-Fi/Thread/Ethernet用于联网，并包含设备身份和访问控制。仅用作架构参照，不声称机器狗已兼容/认证Matter，也不把其设备类型和协议直接照搬到运动控制。
  https://csa-iot.org/all-solutions/matter/matter-faq/
- 宇树、DJI、Spot的具体用户流程以归档手册为准；未知的内部生产密钥操作不作推断。

2026-10-25已将原docs/runbooks/DOSO_DEVICE_OWNERSHIP_AND_PAIRING.md正文移入本目录，迁移前后SHA256一致；旧文件只保留跳转。历史发布记录和原始证据中的旧地址不改写。

