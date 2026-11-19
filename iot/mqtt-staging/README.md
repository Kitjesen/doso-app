# MQTT 本机接入验证

这是自建 MQTT 的第一轮传输验证包：真实 Mosquitto Broker，加上 A、B、Gateway 三个模拟客户端。只监听 `127.0.0.1` 临时端口，不连接云端、机器人或摄像头，不执行运动。

项目目录名含 staging，但本包不是已部署的云 staging Gateway。**不能将它接入正式 worker，也不能打开 `DOSO_ROBOT_COMMAND_DELIVERY_ENABLED`。**

## 已验证的范围

2026-11-02 在 Windows / Node 24.11.1 上使用 Mosquitto 2.1.2、MQTT.js 5.16.1，8 个场景通过（Node 报告含父测试共 9 项）：

- 合法的 A/B 证书可以向模拟 Gateway 发送各自的测试遥测和回执。
- 无客户端证书、另一 CA 签发的证书被拒绝。
- 客户端拒绝不匹配的服务器主机名。
- A 无法向 B 的状态/回执主题写消息，也不能向任务和管理主题发布。
- 有效证书但没有 ACL 的客户端没有消息发布权限；这不等同用户开关已实现。
- A 不会收到 B 的任务，包括尝试通配符订阅的场景。
- A 自报 B 的用户名和 Client ID 仍保持 A 的证书身份，且不会顶掉 B。
- QoS 1 非保留消息能到达；新订阅不会获得上一条非保留任务。这不证明业务 exactly-once 或离线过期处理。

本轮还新增了签名遥测的本机集成测试：模拟设备的消息通过真实 MQTT Broker 送到 `TrustedRobotIngress` 后，分别验证合法消息提交、重复序列拒绝和签名后篡改拒绝。使用实验设备 ID `device-a` 和内存投影，不代表生产 UUID、数据库或云端接入已验证。`npm test` 共报告 13 项通过，包含 8 个原场景、3 个新增场景及 2 个父测试。

结果见 [传输测试记录](evidence/transport-20261102.json)。Broker 与 ACL 插件二进制摘要写在记录中；测试结束已检查没有本包遗留的 Broker 进程。

## 如何复跑

需要 Node >=22.13、OpenSSL 和 Mosquitto 2.1.2 的 Broker/ACL 插件。默认工具路径针对本机 Windows。其他安装位置通过环境变量指定。请先在 `doso-app` 项目根目录打开 PowerShell：

```powershell
Set-Location '.\iot\mqtt-staging'
npm ci --ignore-scripts
$env:MOSQUITTO_BIN = '本机Mosquitto目录\mosquitto.exe'
$env:MOSQUITTO_ACL_PLUGIN = '本机Mosquitto目录\mosquitto_acl_file.dll'
$env:OPENSSL_BIN = '本机OpenSSL目录\openssl.exe'
npm test
```

本机已经在 `.runtime/tools/mosquitto-2.1.2/` 解压了官方 Windows 二进制，并设置了对应默认值，可直接 `npm test`。没有安装系统服务，也没有修改防火墙或启动 Docker。

每轮生成新的测试 CA 和有效期两天的测试证书，存放在被忽略的 `.runtime/run-*/`。测试证书、私钥、Broker 日志及工具不得提交或用于生产；需要共享证据时只共享经过检查的 JSON 结果。

配置由 `test/broker-fixture.js` 生成：启用双向 TLS，使用证书 CN 作为用户名及 Client ID，官方静态 ACL 插件限制精确主题，禁止匿名连接，关闭持久化。消息体均为人工测试数据；签名遥测集成测试使用现有业务协议的模拟帧。

官方二进制来源：[Mosquitto 2.1.2 下载](https://mosquitto.org/download/)。本次通过 HTTPS 下载 Windows 安装包并仅解压；安装包 SHA-256 为 `58008ad7a22ada0b4073afa415801746e027c5f583e4fa52d0f4e9193b98d6aa`。Windows Authenticode 检查为 NotSigned；该摘要用于记录本次输入，不代替官方签名验证。生产构建需另行落实供应链和目标 Linux 版本验证。

## 还没有证明什么

- 没有实现常驻 HTTP→MQTT Gateway 或 MQTT→robot-ingress 适配。
- 没有实现 App 远程管理开关、真实设备上传代理或数据库许可门控。
- 没有验证运行中撤权、证书吊销、过期证书、生产数据库上的业务去重、离线消息过期、Broker 重启与故障恢复。
- 没有进行 RM500U 5G、公网、Linux 服务、负载或集群测试。
- 单节点没有高可用保证。MQTT PUBACK 不等于任务执行回执；静态 ACL 拒绝消息也不证明设备已停止采集或出网。

后续实施与量产门槛见 [自建 MQTT 接入与量产准备](../../docs/production/DOSO_SELF_HOSTED_MQTT_PLAN_20261102.md)。
