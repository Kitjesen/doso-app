# DOSO 机器狗本体标准化部署包（RDK S100 + Orbbec Gemini 335）

本目录保存真机验证通过的机器狗端（Ubuntu / D-Robotics RDK S100）标准化源码补丁、系统配置模板与一键部署脚本。完整说明与排障手册见 [ROBOT_DOG_STANDARD_PROVISIONING.md](../../docs/runbooks/ROBOT_DOG_STANDARD_PROVISIONING.md)。

## 目录结构

- `provision-robot-dog.sh`：幂等一键部署与 30 秒稳定性自检脚本（自动备份旧配置至 `/root/doso-backup-*`，不触碰电机使能状态）。
- `orbbec/camera.cpp`：支持硬件 `MJPG -> RGB8` 采集转换与散斑激光功率控制的 `lingtu::drivers::orbbec::Camera` 实现。
- `orbbec/orbbec-mjpg-laser-power.patch`：对应的 Git 标准补丁文件。
- `configs/camera.env.30fps`：默认高性能宽屏档（彩色 `848x480@30` 16:9 MJPG + 深度 `424x240@30` 同频帧同步 + 关闭满功率散斑激光脉冲）。
- `configs/camera.env.15fps`：低功耗省流档（彩色 `640x480@15` 4:3 MJPG + 深度 `424x240@15` + 关闭满功率散斑激光脉冲）。
- `configs/lingtu_camera_go2rtc_mpegts.py`：`go2rtc` H.264 零缓冲（`nobuffer` / `low_delay` / `muxdelay 0`）低延迟管道生产者。
- `configs/go2rtc.yaml.template`：局域网离线直连 WebRTC 候选地址配置（移除不可达 Google STUN）。
- `configs/99-doso-wlan1-txpower`：NetworkManager 钩子，将 `wlan1` 5 GHz 热点发射功率锁定为 `18.00 dBm`。
- `configs/99-doso-usb-no-autosuspend.rules`、`configs/doso-usb-stability.service`：USB 电源常开与 `256 MB` `usbfs` 缓冲加固。
- `configs/99-doso-webrtc.conf`：WebRTC 4 MB UDP 收发缓冲内核参数。
- `configs/lt-camera-zz-doso-stability.conf`、`configs/go2rtc-zz-doso-cpu.conf`：CPU 核间亲和性隔离（保护 `CPU 4-5` 上的 `brainstem` 实时控制与 `CPU 1` 上的 USB 中断）。

## 新机器快速执行

```bash
# 1. 在开发机将本目录上传至新机器狗
scp -r iot/robot-provisioning sunrise@<ROBOT_IP>:/home/sunrise/

# 2. 登录机器狗执行一键部署（默认 15fps 稳定档；如需原生 30fps 传 --profile 30fps）
ssh sunrise@<ROBOT_IP>
sudo bash /home/sunrise/robot-provisioning/provision-robot-dog.sh --profile 15fps

# 3. 如需重启机器狗使 brainstem /28 白名单或热点变更生效（确认机器狗已趴地且电机未使能后执行）
sudo systemctl restart brainstem.service
```
