# 机器狗本体与图传标准化部署手册（RDK S100 + Orbbec Gemini 335 + Skydroid G20）

更新日期：2026-11-22  
配套文件目录：[iot/robot-provisioning](../../iot/robot-provisioning)

本手册沉淀在研发真机（D-Robotics RDK S100 V1P0 + Orbbec Gemini 335 + BCM43569 双频 USB 网卡 + 云卓 G20 遥控器）上完成闭环验证的全套改动，供下一台机器狗出厂/装机标准化复刻，以及按需切换 `15 fps` / `30 fps` 图传档位。

---

## 一、全链路真实架构说明

当前机器狗与 G20 App 之间分为**两条物理独立但同网段（`192.168.50.0/28`，5 GHz 热点）的真实链路**：

### 1. 运动与状态控制链路（Brainstem gRPC `:13145`）
```text
G20 App (原生 gRPC 模块) ──TCP 192.168.50.1:13145──▶ brainstem.service (/opt/brainstem/current/bin/thunder, CPU 4-5) ──CAN──▶ 16 电机 + IMU
```
- **已真实接入并闭环的能力**：局域网直连、控制权租约申请/续期/释放、电机使能/失能、站立/坐下、双摇杆行走/转向（`WalkChecked`）、地形策略切换（平地/楼梯/身高调节 `height_v2` `RobotModeKind=3`）、软件急停、16 电机母线电压（如 `49.7V`）、温度（`26°C`）与通信 RTT（`~28ms`）。
- **界面仍标「待接入」的能力**：原地踏步、匍匐前进、智能跟随、打招呼等扩展动作，需后续底层固件策略开放后自动点亮；单相机机型开启「双摄」画中画时主副窗口复用同一路前视流 `cam`。

### 2. 视觉与实时图传链路（OrbbecSDK 原生采集 + WebRTC `:5050` / `:8555`）
```text
Orbbec Gemini 335 (USB 3.2)
  └─▶ orbbec_capture (直连官方 C++ libOrbbecSDK.so：硬件 MJPG 采集转 RGB8 + 深度 Z16)
        └─▶ lingtu_camera_dds (lt-camera.service, CPU 1-2) ──▶ POSIX 共享内存 (/dev/shm/lingtu_camera_color & depth)
              └─▶ lingtu_camera_video + ffmpeg (H.264 Baseline 零延迟编码, CPU 0,3)
                    └─▶ go2rtc (:1984 内部 API / :8555 WebRTC UDP 媒体端口)
                          └─▶ lt-video-gateway (:5050 HTTP WHEP 信令网关) ──UDP 直连──▶ G20 App (react-native-webrtc)
```

### 3. 常见疑问澄清
- **现在走的是 Orbbec 官方 SDK 吗？**  
  **是的。** `lt-camera.service` 运行的是 `LINGTU_CAMERA_DRIVER=orbbec_native`，底层由 `orbbec_capture` 直接链接奥比中光官方 C++ `libOrbbecSDK.so`（不经过 ROS，也不走残缺的内核 V4L2 节点），采集后直接写入 `/dev/shm/lingtu_camera_*` 共享内存供图传与后续感知/SLAM 零拷贝读取。
- **`go2rtc` 是什么？为什么名字带 `go2`，跟宇树 Go2 有关吗？**  
  **与宇树 Go2 没有任何关系。** `go2rtc`（开源项目 `AlexxIT/go2rtc`）是 **“Go 语言（Golang）转（2 = to）WebRTC”** 的缩写（类似 `v4l2rtsp` 中的 `2`）。它的职责仅仅是把本地 H.264 视频流封装成标准的低延迟 WebRTC（WHEP 协议，UDP `8555` 端口）发给 G20 App 播放。在产品对外名称中统称为 `DOSO Video Gateway`。
- **为什么默认用 `15 fps` / `800 kbps`，官方相机不是支持 `30 fps` 吗？**  
  Gemini 335 硬件确实支持 `30 fps`。此前机器狗原始 `/etc/lingtu/camera.env` 被设为 `15 fps`，是因为旧版 `camera.cpp` 用未压缩 `YUYV` 传输，开 `30 fps` 会产生近 `300 Mbps` 的裸 USB 流量直接卡死总线；而旧版推流脚本却写了 `--fps 30`，实际上是在把 `15 fps` 画面每帧重复编码两遍（假 30 帧，白耗一倍 CPU 和无线带宽）。  
  现在我们已为 `camera.cpp` 接入了相机硬件 **MJPG 压缩传输（`LINGTU_ORBBEC_COLOR_MJPG=1`）**，USB 带宽下降了 **18 倍**，并将共享内存单槽容量提升至 `4 MB`、FFmpeg 管道切换为 `nobuffer / low_delay / muxdelay 0` 零缓冲模式：
  - **高性能宽屏档（`--profile 30fps`，默认）**：相机与编码器同步开启真原生 **`848x480@30`（16:9 宽屏，水平视野拓宽 32.5%，原生贴合 G20 屏幕）MJPG + `1200 kbps` 零缓冲 H.264**，USB 彩色带宽仅约 `10 Mbps`。
  - **低功耗省流档（`--profile 15fps`，按需切换）**：`640x480@15` + `800 kbps`，适合弱网或超长续航场景。
  - **App 端配套性能优化**：当机器狗仅公布单路 `cam` 流时，G20 开启「双摄」画中画直接共享同一路解码 `MediaStream`（不再重复发起第 2 条 WebRTC 连接，节省 **50%** 无线带宽与硬件解码器占用）；同时在局域网控制会话期间将遥测轮询（状态/电压/电机）多路复用到同一条 HTTP/2 长连接，并强制锁定 Android `WIFI_MODE_FULL_LOW_LATENCY` 低延迟模式。

---

## 二、解决的核心顽疾与修改配置总表

在未做下述标准化加固前，机器狗切换到 5 GHz 热点或重启后，会出现 **① G20 连不上 Brainstem** 以及 **② 热机后每隔 20–30 秒视频和操控周期性掉线一次**（根源为 Gemini 335 满档激光脉冲 + 未压缩双流 + 同控制器 `BCM43569` 网卡 `31 dBm` 满功率发射引发 USB 5V 过流重枚举）。

| 序号 | 所属模块 | 目标机器狗路径 | 仓库标准化源文件 | 核心改动内容与作用 |
| --- | --- | --- | --- | --- |
| 1 | App 端协议兼容 | 已合入 `main`（PR #11） | [ProfileInfoParser.java](../../modules/brainstem-grpc/android/src/main/java/expo/modules/brainstemgrpc/ProfileInfoParser.java)、[RobotWifiModule.kt](../../modules/robot-wifi/android/src/main/java/expo/modules/robotwifi/RobotWifiModule.kt) | 支持 `height_v2` 固件返回的 `RobotModeKind=3`（`body-height`）；Wi-Fi 断开 `onLost` 时自动清理残留进程网口绑定 |
| 2 | 5 GHz 热点与子网 | `/etc/NetworkManager/system-connections/dog-hotspot.nmconnection` | [provision-robot-dog.sh](../../iot/robot-provisioning/provision-robot-dog.sh) | `wlan1` 设为 5 GHz `band=a`、`channel=149`、`192.168.50.1/28`（14 个可用客户端 IP），关闭网卡省电 `powersave=2`；限制无卡 `usb0` 路由优先级防止劫持 |
| 3 | Brainstem 白名单 | `/etc/brainstem/brainstem.env` | [provision-robot-dog.sh](../../iot/robot-provisioning/provision-robot-dog.sh) | `THUNDER_GRPC_ALLOWED_IPS` 与 `THUNDER_LINGTU_ALLOWED_IPS` 覆盖 `192.168.50.2`–`192.168.50.14` 全 `/28` 网段（满足 16 IP 上限约束） |
| 4 | Orbbec 原生驱动 | `/home/sunrise/lingtu-src/src/drivers/real/camera/impl/orbbec/camera.cpp` -> `/opt/lingtu/current/bin/orbbec_capture` | [camera.cpp](../../iot/robot-provisioning/orbbec/camera.cpp)、[orbbec-mjpg-laser-power.patch](../../iot/robot-provisioning/orbbec/orbbec-mjpg-laser-power.patch) | 增加 `LINGTU_ORBBEC_COLOR_MJPG=1`（相机端硬件 MJPG 传输 + SDK `FormatConvertFilter` 转 `RGB8`）及 `LINGTU_ORBBEC_LASER_CONTROL` / `LASER_ENERGY_LEVEL` 寄存器控制，砍掉 >75% USB 带宽与散斑激光峰值电流 |
| 5 | 相机运行参数 | `/etc/lingtu/camera.env` | [camera.env.15fps](../../iot/robot-provisioning/configs/camera.env.15fps) / [camera.env.30fps](../../iot/robot-provisioning/configs/camera.env.30fps) | 默认关闭高功耗主动激光脉冲（`LASER_CONTROL=0`，双目被动红外仍正常输出深度），`30fps` 档采用彩色 `848x480@30` MJPG + 深度 `424x240@30`（保持同频以确保 `ob::Pipeline` 帧集同步），单槽共享内存扩至 `4 MB` |
| 6 | 网卡发射功率锁 | `/etc/NetworkManager/dispatcher.d/99-doso-wlan1-txpower` | [99-doso-wlan1-txpower](../../iot/robot-provisioning/configs/99-doso-wlan1-txpower) | 解决 `BCM43569` 缺 `clm_blob` 默认 `31.00 dBm`（`1.26W`）功放过载失真问题，热点启动自动锁定 `18.00 dBm`（`63mW`） |
| 7 | USB 电源与缓冲 | `/etc/udev/rules.d/99-doso-usb-no-autosuspend.rules`、`/etc/systemd/system/doso-usb-stability.service` | [99-doso-usb-no-autosuspend.rules](../../iot/robot-provisioning/configs/99-doso-usb-no-autosuspend.rules)、[doso-usb-stability.service](../../iot/robot-provisioning/configs/doso-usb-stability.service) | 开机强制 `usbcore.autosuspend=-1`、全 USB 设备 `power/control=on`、`usbfs_memory_mb=256` |
| 8 | WebRTC 直连与内核缓冲 | `/etc/go2rtc/go2rtc.yaml`、`/etc/sysctl.d/99-doso-webrtc.conf` | [go2rtc.yaml.template](../../iot/robot-provisioning/configs/go2rtc.yaml.template)、[99-doso-webrtc.conf](../../iot/robot-provisioning/configs/99-doso-webrtc.conf) | 移除国内不可达的 `stun.l.google.com:19302`，直配 `192.168.50.1:8555` 本地 UDP host 候选；UDP 收发缓冲调至 `4 MB` |
| 9 | 编码管道与绑核隔离 | `/opt/lingtu/current/bin/lingtu_camera_go2rtc_mpegts.py`、`*.service.d/zz-doso-*.conf` | [lingtu_camera_go2rtc_mpegts.py](../../iot/robot-provisioning/configs/lingtu_camera_go2rtc_mpegts.py)、[lt-camera-zz-doso-stability.conf](../../iot/robot-provisioning/configs/lt-camera-zz-doso-stability.conf)、[go2rtc-zz-doso-cpu.conf](../../iot/robot-provisioning/configs/go2rtc-zz-doso-cpu.conf) | 相机采集绑 `CPU 1-2`（对齐 `xhci_hcd` USB 中断核），`go2rtc`/`libx264` 绑 `CPU 0,3`，`brainstem` 独占 `CPU 4-5` 互不抢占 |

---

## 三、下一台新机器狗怎么部署？（标准三步 SOP）

> **安全前提**：执行前请确保机器狗处于**趴地（Grounded）且电机未使能**状态。脚本本身只操作网络、USB 与相机服务，不会发送任何运动指令。

### 第 1 步：上传标准化部署包到新机器狗
在开发电脑终端执行（将 `<ROBOT_IP>` 替换为机器狗局域网 IP 或热点 IP `192.168.50.1`）：
```bash
scp -r doso-app/iot/robot-provisioning sunrise@<ROBOT_IP>:/home/sunrise/
```

### 第 2 步：一键执行编译、配置与 30 秒自检
SSH 登录机器狗后执行：
```bash
# 方案 A（推荐默认）：15fps / 800kbps 超稳低功耗基线
sudo bash /home/sunrise/robot-provisioning/provision-robot-dog.sh --profile 15fps

# 方案 B（高帧率需求）：原生 30fps / 1200kbps
sudo bash /home/sunrise/robot-provisioning/provision-robot-dog.sh --profile 30fps
```
- 如果研发阶段还需要通过办公网 `wlan0`（例如 `192.168.66.64`）调试，可附加 `--extra-lan-ip 192.168.66.64`。
- 脚本会自动将原有配置备份在 `/root/doso-backup-时间戳/` 下，并自动完成编译与 30 秒连续帧检查，最后打印 `SUCCESS: Robot dog standardized provisioning verified.`。

### 第 3 步：重启验证（出厂必做）
确认机器狗安全趴地后，重启整机验证所有配置开机自启持久生效：
```bash
sudo reboot
```
开机约 40 秒后，可用以下一条只读命令复核四项核心指标：
```bash
echo "devnum=$(cat /sys/bus/usb/devices/2-2.2/devnum) restarts=$(systemctl show lt-camera.service -p NRestarts --value)" && \
iw dev wlan1 info | grep -E "channel|txpower" && \
cat /dev/shm/lingtu/camera_status.json && echo ""
```
**合格判据**：
1. `restarts=0`，且连续运行 5 分钟以上 `devnum` 数值保持不变；
2. `wlan1` 显示 `channel 149 (5745 MHz)` 且 `txpower 18.00 dBm`；
3. `camera_status.json` 中 `"status":"running"`、`"last_error":""`、`color_frames` 持续递增；
4. G20 安装最新 `main` 分支编译的 APK，连接 `DOSOrobotics` 热点并输入 `192.168.50.1` 点击「连接机器狗」，状态栏绿灯在线且画面流畅不中断。

---

## 四、常见问题与本体进阶服务开启（`RobotRecovery` 与机载动作库）

### 1. Android 12/13 掌机连接 `DOSOrobotics` 四次握手被拒（Reason Code 17）
Broadcom `brcmfmac`（BCM43569）在热点模式下若配置 `ieee80211w=1`（PMF 可选），其固件信标 RSN IE 与 `hostapd` EAPOL Msg3 RSN IE 不一致，会导致 Android 12/13 掌机在 `FOUR_WAY_HANDSHAKE` 阶段断开（`reasonCode: 17 / REASON_IE_IN_4WAY_DIFFERS`）。
- **必须保持 `ieee80211w=0`**（`hostapd.conf` 中设置 `ieee80211w=0`，或 NetworkManager 执行 `nmcli connection modify dog-hotspot 802-11-wireless-security.pmf 1`）。

### 2. 开启机器狗本体“摔倒恢复（`RobotRecovery`）”服务
App 端 UI、安全确认、原生 `brainstem.api.v1.RobotRecovery` 全部 7 个 RPC 与 100ms 硬件守护心跳均已就绪；机器狗本体默认因安全冻结关闭该模块（`THUNDER_RECOVERY_MODEL_CONFIG` 为空）。开启步骤如下：

1. **准备 ONNX 起身模型与校验清单**（例如 `/etc/brainstem/recovery-model.json`，契约须匹配 `mujica-v89-history60x6-raw16-features56`）：
   ```json
   {
     "schema_version": 1,
     "contract": "mujica-v89-history60x6-raw16-features56",
     "model": "/opt/brainstem/models/recovery_v89.onnx",
     "sha256": "<对应 onnx 文件的 64 位小写 sha256>"
   }
   ```
2. **在 `/etc/brainstem/brainstem.env` 中配置开关**：
   ```bash
   THUNDER_RECOVERY_MODEL_CONFIG=/etc/brainstem/recovery-model.json
   # 仅在吊装/架空完成硬件使能顺序实测核验后，才允许设为 true：
   THUNDER_NORMAL_RECOVERY_ENABLE_SEQUENCE_VERIFIED=true
   ```
3. **重启 Brainstem 并验证日志**：
   ```bash
   sudo systemctl restart brainstem.service
   journalctl -u brainstem.service -n 40 --no-pager | grep -i recovery
   ```
   确认日志打印 `RobotRecovery configured from /etc/brainstem/recovery-model.json`，且未出现 SHA-256 校验失败报错；此时 App 端 `姿态 -> 摔倒恢复` 按钮会自动解锁（**请务必先在架空保护下实测验证**）。

### 3. 开启机器狗本体 35 预设动作服务（`ListGestures` / `PlayGesture`）
在 `/etc/brainstem/brainstem.env` 中配置机载动作目录与关键帧库路径并重启 `brainstem.service`：
```bash
THUNDER_GESTURE_CATALOG=/home/sunrise/gesture-library/gestures/index.json
THUNDER_GESTURE_LIBRARY=/home/sunrise/gesture-library/gestures/library.json
```
确保固件为支持动作库的版本（`cms.proto` `ListGestures`/`PlayGesture`）；重启后 App 端 `动作 ▾` 抽屉将自动从「仅可预览动作库」解锁为站立态可执行。

---

## 五、局域网自动发现（Avahi mDNS / DNS-SD）与多机热点命名规范

为支持 App 端在同一局域网（办公网 `wlan0` 或直连热点 `wlan1`）零手填 IP 自动发现机器狗，以及多台机器狗同时上电时的热点区分，新机出厂/装机需统一配置以下两项。

### 1. Avahi 服务发布（`/etc/avahi/services/doso-robot.service`）

1. **配置 `/etc/avahi/avahi-daemon.conf`**（确保与 `orbbec_capture` 的 UDP `5353` 共存、屏蔽 5G 网卡 `usb0`、并避免 IPv6 链路本地地址干扰 Android `NsdManager`）：
   ```ini
   [server]
   use-ipv4=yes
   use-ipv6=yes
   deny-interfaces=usb0
   disallow-other-stacks=no

   [publish]
   publish-hinfo=no
   publish-workstation=no
   publish-aaaa-on-ipv4=no
   ```
2. **写入 `/etc/avahi/services/doso-robot.service`**（权限 `0644`，`root:root`；按单机实际编号替换 `THUNDER-DEV-001` / `DOSO-THUNDER-001` / `ap=`）：
   ```xml
   <?xml version="1.0" standalone='no'?><!--*-nxml-*-->
   <!DOCTYPE service-group SYSTEM "avahi-service.dtd">
   <service-group>
     <name replace-wildcards="no">DOSO-THUNDER-001</name>
     <service protocol="ipv4">
       <type>_doso-robot._tcp</type>
       <port>13145</port>
       <txt-record>v=1</txt-record>
       <txt-record>id=THUNDER-DEV-001</txt-record>
       <txt-record>name=DOSO-THUNDER-001</txt-record>
       <txt-record>ap=DOSOrobotics</txt-record>
       <txt-record>vport=5050</txt-record>
       <txt-record>transport=lan-dev</txt-record>
     </service>
   </service-group>
   ```
   - `replace-wildcards="no"` 防止多台默认主机名均为 `ubuntu` 的机器狗在局域网内发生实例名冲突。
   - `protocol="ipv4"` 配合 `publish-aaaa-on-ipv4=no`，保证客户端在 `wlan0` 解析到办公网 IPv4、在 `wlan1` 解析到热点 `192.168.50.1`，不混入 `fe80::` 链路本地 IPv6。
   - TXT 契约字段：`v`（协议版本 `1`）、`id`（机身唯一 ID）、`name`（展示名称）、`ap`（本机热点 SSID）、`vport`（图传网关端口 `5050`）、`transport`（当前 Brainstem 传输模式，研发态 `lan-dev`，量产态 `mtls`）。
3. **生效与验收**（无需重启 `brainstem.service` 或相机服务）：
   ```bash
   sudo systemctl restart avahi-daemon.service   # 仅修改 avahi-daemon.conf 时需要；仅改 .service 文件执行 reload 即可
   sudo journalctl -u avahi-daemon.service -n 20 --no-pager
   ```
   确认日志打印 `Service "DOSO-THUNDER-001" (/services/doso-robot.service) successfully established.`，且在同网段开发机向 `224.0.0.251:5353` 发送 `_doso-robot._tcp.local` PTR 查询可返回对应 IPv4、端口 `13145` 及完整 6 条 TXT 记录，同时 `lt-camera.service` 的 `NRestarts` 仍为 `0`。

### 2. 多台机器狗热点命名规范（`DOSO-<id>`）

- **量产/多机规则**：每台机器狗的 5 GHz 热点 SSID 统一命名为 `DOSO-<id>`（匹配 `^DOSO-[A-Za-z0-9_-]{2,24}$`，例如 `DOSO-THUNDER-001`、`DOSO-AB12CD`），同时 App 端向下兼容研发遗留热点名 `DOSOrobotics`。
- **单机改名命令**（保持既有 `192.168.50.1/28`、5 GHz `channel=149`、`txpower 18 dBm` 与 `pmf=1` / `ieee80211w=0` 不变）：
  ```bash
  sudo nmcli connection modify dog-hotspot 802-11-wireless.ssid "DOSO-<id>"
  sudo nmcli connection up dog-hotspot
  ```
- **同步更新 mDNS**：修改热点 SSID 后，务必同步更新 `/etc/avahi/services/doso-robot.service` 中的 `<name>`、`<txt-record>name=DOSO-<id></txt-record>` 与 `<txt-record>ap=DOSO-<id></txt-record>`，并执行 `sudo systemctl reload avahi-daemon.service`，确保 App 的局域网自动发现与热点扫描展示一致。
