# Brainstem 远程 mTLS 一次性配对方案

## 目标

让 G20 和开发电脑可以安全地读取 Brainstem 状态，并在后续安全门禁通过后申请控制租约。普通使用只需要在 DOSO 连接中心选择已配对设备，不要求用户理解证书细节。

本方案不会把私钥放进 DOSO 源码、APK、聊天或日志，也不会把私钥上传到 Supabase。

本地准备工具位于 [prepare_mtls_bundle.py](D:/inovxio/brain/brainstem/scripts/prepare_mtls_bundle.py)。默认只输出脱敏 manifest；只有在本地受控终端显式增加 `--generate` 才会创建证书，并且 PKCS#12 密码只通过隐藏输入提供，不放在命令行。工具拒绝把输出写进 Brainstem 仓库，生成目录必须是绝对路径且为空。

## 信任模型

```text
设备本地 CA
├── Brainstem server certificate
├── G20 client certificate  → Android KeyChain
└── 开发电脑 client certificate → 本机系统密钥存储
```

- CA 私钥只在受控的证书管理环境保存，不能提交仓库。
- Brainstem 服务端私钥只保存在机器狗主机，权限 `0600`，属主为 Brainstem 服务用户 `sunrise`。
- G20 客户端私钥只在 Android 系统 KeyChain 中生成或导入；DOSO 只拿到 KeyChain alias，不接收私钥字节。
- 服务器证书 SAN 必须包含机器狗实际地址 `192.168.66.64`；连接时仍启用主机名/IP 校验。
- Brainstem 客户端 CA 只信任这套专用 CA，不使用“接受任意证书”或关闭 TLS 校验。

## 当前来源地址

2026-10-25复核：以下104/62为此前记录，不是当前部署参数。G20本轮wlan地址为192.168.66.94；开发电脑来源IP和机器人服务allowlist未在本轮远程复核。部署前按真实来源更新核对，不能直接复制旧示例。

本轮已只读确认：

- 机器狗主机：`192.168.66.64`
- G20：`192.168.66.104`
- 开发电脑：`192.168.66.62`

服务配置应使用 G20 和开发电脑的来源地址：

```text
HAN_DOG_GRPC_ALLOWED_IPS=192.168.66.104,192.168.66.62
```

不能把机器狗自己的 `192.168.66.64` 填到来源 allowlist 中。控制租约仍然是单一拥有者，允许多个受信来源不等于允许多个控制者同时发指令。

## 主机文件布局

证书由用户指定的受控 PKI 生成后，再由主机管理员放置；不要在聊天中发送文件内容：

```text
/etc/brainstem/tls/server.crt
/etc/brainstem/tls/server.key
/etc/brainstem/tls/brainstem-client-ca.crt
/etc/brainstem/tls/doso-g20-client.crt
/etc/brainstem/tls/doso-dev-client.crt
```

权限要求：

- `server.key`: `0600`, owner `sunrise:sunrise`
- 其余 `.crt`: `0644`, owner `root:root` 或由服务用户可读
- 目录: `0750`, owner `root:sunrise`

## 配置与切换顺序

1. 证书管理员准备 CA、服务器证书和两个客户端证书；私钥不通过聊天传输。
2. 在机器狗主机创建 `/etc/brainstem/tls` 并进行权限检查。
3. 使用 [setup_brainstem_service.py](D:/inovxio/brain/brainstem/scripts/setup_brainstem_service.py) 的 `--grpc-peer-ip` 重复参数，同时传入 G20 与开发电脑地址。
4. 先以候选二进制运行 `systemd-analyze verify` 和配置门禁，不切换旧服务。
5. 在机器狗固定、急停可用、电机未使能的条件下切换独立 `brainstem.service`；旧 `thunder-web.service` 保留为回滚目标。
6. 只做 TCP 监听、mTLS 握手和 `GetControlStatus` 读取。
7. 读取连续成功后，才在 DOSO 原生层接入租约生命周期；任何站立、坐下、策略或动力操作仍需单独安全验收。

## 为什么不能直接省略证书

Brainstem 的远程接口包含控制租约和姿态指令。仅使用 IP 或明文 gRPC 会让同一局域网内的未知设备可以伪装控制端；“连接成功”无法证明调用者是 G20，也无法把账号归属与机器人控制权区分开。mTLS 只在首次配对时增加步骤，之后 DOSO 使用 KeyChain alias 自动完成客户端身份选择，正常连接不会反复输入证书。

## 当前未完成项

- 此前证据未完成机器狗mTLS文件准备；本轮机器狗端点不可达，未重新读取证书或远程配置，不能将历史目录缺失当今天实测。
- Android原生源码已实现租约、WalkChecked、站坐、电机和策略RPC；仍待部署身份/权限及实机验收。已授权motion principal在当前服务器实现中也可调用电机/标零/清故障/策略接口，须按实际权限管理证书，文档不构成执行这些动作的新授权。
- 本轮G20实读为code13，保留包最高code15，源码准备code16；新修改尚未进入获验收的安装包。
- 本轮未发送机器人控制指令，未生成、读取或变更私钥，也未切换服务。

证书文件就绪后，先做只读握手和服务监听证据；没有这些证据，不放行生产控制执行器。
