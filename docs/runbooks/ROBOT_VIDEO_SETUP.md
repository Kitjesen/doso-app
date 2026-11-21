# 机器狗图传配置：先核实相机，再接只读视频

更新：2026-10-25。状态为本地准备，未安装、未启动、未连接相机或机器人。本指南不修改账号、gRPC控制、动力或现有服务。

## 2026-11-18 当前真机链路

当前研发机 `192.168.66.64` 已有实际视频链路：

```text
Orbbec → LingTu camera owner → go2rtc → DOSO Video Gateway :5050 → WebRTC/WHEP → App
```

产品和 App 文案使用 `DOSO Video Gateway`。`go2rtc` 保留为设备内部组件名，用于进程、配置和故障排查。Brainstem `13145` 只负责运动、IMU、关节和电机状态，不承载图像或 WebRTC。

本次只读检查返回相机 `streaming`、WHEP 流 `cam` 可用、JPEG 快照 `200 image/jpeg`。历史 WebRTC 验收已经确认播放器连接、640×480 解码帧增长和 0 丢包。结构化证据见 [camera-current-readonly-20261118.json](D:/DOSO/artifacts/robot-cloud/real-connect-20261113/camera-current-readonly-20261118.json) 和 [real-webrtc-acceptance-20261115.json](D:/DOSO/artifacts/robot-cloud/real-connect-20261113/real-webrtc-acceptance-20261115.json)。

建议路线是 **相机 → H264 → MediaMTX → WebRTC/WHEP视频**，既有Brainstem gRPC继续负责控制。`13145`不是视频地址；视频连接成功也不授予控制权。

## 现在先做这一件事

森哥已确认机器狗目前未开机，稍后才会启动。先等待开机并确认局域网地址。本轮对`192.168.66.64:22`两次有4秒连接上限的只读SSH尝试均超时，未远程执行检查脚本；不继续重试，也不据此推断相机类型、主机架构或开机后的服务状态。

可以在机器狗本地终端执行以下只读命令，把输出交给负责人；不用提供密码、密钥或带口令的摄像头URL：

```sh
uname -srm
ls -l /dev/video* /dev/v4l/by-id/ 2>/dev/null
command -v ffmpeg ffprobe v4l2-ctl mediamtx python3
```

完整的只读清单脚本是[inspect-camera-env.sh](../../iot/video-gateway/inspect-camera-env.sh)，放到机器狗后可用`sh inspect-camera-env.sh`执行。它不打开视频帧、不保存图像、不启动服务、不探测网络对端、不触及CAN。请同时说明相机是USB还是网口相机；设备名中的序列号可遮去，但保留视频节点对应关系。

## 当前源码真正有什么

本地`D:/inovxio/brain/brainstem/sdk/python/brainstem_sdk/camera.py`提供可选OpenCV相机工具。它可打开USB节点或已有RTSP/MJPEG源，并单独发布HTTP MJPEG（默认8080，`/stream`）及JPEG快照（`/snapshot`）；不随Brainstem自动启动。`rtsp://…:8554/cam`只是SDK输入示例，不代表机器上存在RTSP服务器。

SDK采集失败会保留最后JPEG，HTTP发送循环仍可能重发旧帧，且没有采集时间/序号。不能把HTTP200或收到重复JPEG当作实时图传证明。不要用这条旧路径宣称帧率、低延迟或画面新鲜。

App源码现已增加`ControlVideoSurface`视频宿主/状态槽，可接收独立的presentation与surface并呈现未配置、连接中、中断或错误；这还不是接收器。目前没有实际视频provider、解码器或原生WebRTC播放器/SDK，也没有已接入的流。先验证独立只读视频，再补接收器及实际帧新鲜度/恢复合同；仅填写WHEP URL不会让现在的G20安装包播放。WebRTC迁移标记是方向，不是已部署能力。

## 阶段1：确认实际相机和格式

先依据`uname`选择工具包与编码器，不假定RDK S100、ARM64或某个硬件编码器已经可用。USB相机可在确认节点后只读查询能力：

```sh
: "${DOSO_CAMERA_DEVICE:?先填写已确认的USB视频节点，不能盲填/dev/video0}"
test -c "$DOSO_CAMERA_DEVICE" || exit 1
v4l2-ctl --device "$DOSO_CAMERA_DEVICE" --list-formats-ext
```

选择该节点真实支持的格式、分辨率和帧率。若是IP相机，改为核实其厂家型号、真实RTSP/其他协议端点和H264编码能力；不要运行USB命令，不把含用户名/密码的URL发到聊天或写进仓库。若源已经是可用的H264且没有B帧，可考虑透传，避免无谓转码；尚未知道源之前不直接生成生产pull配置。

确认后，负责人先在设备本地填写下列环境变量，且只有完成实际能力核验后才把`DOSO_CAMERA_VERIFIED`设为`yes`。这里不提供会被误用的默认设备值：

```sh
set -eu
[ "${DOSO_CAMERA_VERIFIED:-no}" = yes ] || { echo '相机参数尚未核验'; exit 1; }
: "${DOSO_CAMERA_DEVICE:?缺少已确认的视频节点}"
: "${DOSO_CAMERA_FORMAT:?缺少已确认的V4L2输入格式}"
: "${DOSO_CAMERA_SIZE:?缺少已确认的宽x高}"
: "${DOSO_CAMERA_FPS:?缺少已确认的帧率}"
test -c "$DOSO_CAMERA_DEVICE" || exit 1
command -v timeout >/dev/null
timeout 8s ffmpeg -hide_banner -loglevel error \
  -f v4l2 -input_format "$DOSO_CAMERA_FORMAT" \
  -video_size "$DOSO_CAMERA_SIZE" -framerate "$DOSO_CAMERA_FPS" \
  -i "$DOSO_CAMERA_DEVICE" -frames:v 1 -an -f null -
```

这一步才会实际读取相机，只解码一帧到空输出，不录制文件。退出0仅证明这个节点当时能产出一帧，不是持续图传或G20验收。设备忙、无帧或超时先停，不启动第二个采集进程争抢。

## 阶段2：仅本机回环验证H264媒体链

确认主机架构及现有工具后再选择匹配的MediaMTX版本；当前没有下载或安装任何二进制。准备的[回环配置](../../iot/video-gateway/mediamtx.loopback.example.yml)只监听`127.0.0.1:8554`（本地RTSP发布）、`127.0.0.1:8889`（WebRTC HTTP信令）和`127.0.0.1:8189/UDP`（ICE）。其他服务显式关闭，无开机自启、无相机启动钩子。参数按官方当前v1.21.2参考核对，仍需与实际安装版本匹配；未实际加载MediaMTX。

由负责人确认资源和相机占用后，在设备本地的两个独立终端手动进行，勿将以下命令加进现有Brainstem服务：

```sh
# 终端A，只有工具已核对且没有重复网关时才启动；配置路径按实际位置填写。
: "${DOSO_VIDEO_LOCAL_CONFIG:?缺少回环配置的绝对路径}"
test -r "$DOSO_VIDEO_LOCAL_CONFIG" || exit 1
mediamtx "$DOSO_VIDEO_LOCAL_CONFIG"
```

```sh
# 终端B，沿用阶段1已核验的变量；确认ffmpeg确实包含libx264。
set -eu
[ "${DOSO_CAMERA_VERIFIED:-no}" = yes ] || exit 1
: "${DOSO_CAMERA_DEVICE:?}"
: "${DOSO_CAMERA_FORMAT:?}"
: "${DOSO_CAMERA_SIZE:?}"
: "${DOSO_CAMERA_FPS:?}"
test -c "$DOSO_CAMERA_DEVICE" || exit 1
ffmpeg -hide_banner -f v4l2 -input_format "$DOSO_CAMERA_FORMAT" \
  -video_size "$DOSO_CAMERA_SIZE" -framerate "$DOSO_CAMERA_FPS" \
  -i "$DOSO_CAMERA_DEVICE" -an -c:v libx264 -profile:v baseline \
  -pix_fmt yuv420p -bf 0 -preset ultrafast -tune zerolatency \
  -b:v 1200k -maxrate 1200k -bufsize 1200k -g "$DOSO_CAMERA_FPS" \
  -rtsp_transport tcp -f rtsp rtsp://127.0.0.1:8554/doso_camera
```

该编码参数是本机试验起点，不是吞吐或控制实时性承诺。软件编码若不可用或占用过高应停止并依据实际硬件选编码器，不猜芯片厂商参数。WebRTC浏览器兼容性优先选H264 baseline、无B帧；MediaMTX不会自动把任意摄像头编码转成适合客户端的编码。[官方编码说明](https://mediamtx.org/docs/features/webrtc-specific-features)、[FFmpeg发布](https://mediamtx.org/docs/publish/ffmpeg)。

同一设备本地的播放页是`http://127.0.0.1:8889/doso_camera`；支持WHEP的客户端端点是`http://127.0.0.1:8889/doso_camera/whep`。前者是播放页面，后者是WebRTC信令端点，不是MP4文件；普通播放器不能只靠这个URL播放。[官方WHEP读取](https://mediamtx.org/docs/read/webrtc)。

若机器狗没有本地图形浏览器，可先在本机检查RTSP数据；不要误以为SSH只转发8889就能同时转发UDP媒体。此阶段只在回环范围工作，G20还不能连这个模板。

## 阶段3：审核后再开放局域网只读视频

本阶段配置尚未生成/启用，不能直接把回环监听地址改为`0.0.0.0`：

- 保持本地发布RTSP只绑定回环；局域网观看身份只能`read doso_camera`，不能publish或管理。凭据在设备本地受限文件/安全存储配置，不写聊天、仓库或含口令URL。
- 对WHEP/播放页启用HTTPS，使用观看设备能验证的证书；WebRTC媒体加密不能替代HTTP信令及凭据的保护。未通过验证不降低证书校验。[官方认证](https://mediamtx.org/docs/features/authentication)。
- 确认机器狗当时的真实LAN IP，配置可达监听与`webrtcAdditionalHosts`。官方默认WebRTC信令是8889/TCP，媒体ICE是8189/UDP；仅按实际网络放行所需观看设备，不把RTSP、管理端口或匿名发布暴露出去。不要先假定需要STUN/TURN或购买中继。[官方配置](https://mediamtx.org/docs/references/configuration-file)。
- 浏览器验证真实相机后，再为G20增加视频播放器、只读媒体地址/认证、生命周期释放及掉线/陈旧画面提示。认证、gRPC连接、租约和视频状态分别处理，不因画面出现就使能或取得控制，也不重放旧动作。

完成标准是实际来源明确、持续画面和中断可识别、未授权读写被拒绝、G20解码与资源实测合格。参考设计中的78%电量、0.8速度、画面延迟不能作为实测数据。当前没有完成这些验收。
