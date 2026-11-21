#!/usr/bin/env bash
# DOSO Robot Dog (RDK S100 + Orbbec Gemini 335 + BCM43569) Standard Provisioning
# Safely configures 5 GHz AP, Brainstem /28 whitelist, USB/Wi-Fi power stability,
# OrbbecSDK MJPG + laser power tuning, CPU core isolation, and go2rtc WebRTC.
# NEVER enables motors or issues motion RPCs.

set -euo pipefail

PROFILE="30fps"
HOTSPOT_CONN="dog-hotspot"
HOTSPOT_IFACE="wlan1"
HOTSPOT_CHANNEL="149"
HOTSPOT_CIDR="192.168.50.1/28"
LINGTU_SRC="/home/sunrise/lingtu-src"
EXTRA_LAN_IP=""
VERIFY_SECONDS=30

usage() {
  cat << 'EOF'
Usage: sudo bash provision-robot-dog.sh [options]

Options:
  --profile 30fps|15fps   Camera & WebRTC preset (default: 30fps)
                            30fps: 848x480@30 (16:9) MJPG + 1200 kbps zero-buffer H.264
                            15fps: 640x480@15 (4:3)  MJPG + 800 kbps low-power H.264
  --extra-lan-ip IP       Optional extra LAN IP (e.g. wlan0 192.168.66.64) for go2rtc & whitelist
  --lingtu-src DIR        Path to lingtu-src checkout (default: /home/sunrise/lingtu-src)
  --verify-seconds N      Post-deploy stability check duration (default: 30)
  -h, --help              Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    --extra-lan-ip) EXTRA_LAN_IP="$2"; shift 2 ;;
    --lingtu-src) LINGTU_SRC="$2"; shift 2 ;;
    --verify-seconds) VERIFY_SECONDS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ "$EUID" -ne 0 ]]; then
  echo "ERROR: Please run with sudo: sudo bash $0 $*" >&2
  exit 1
fi

if [[ "$PROFILE" != "15fps" && "$PROFILE" != "30fps" ]]; then
  echo "ERROR: --profile must be 15fps or 30fps (got: $PROFILE)" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/root/doso-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
echo "[1/7] Backing up existing robot configs to $BACKUP_DIR ..."

for f in \
  /etc/lingtu/camera.env \
  /etc/go2rtc/go2rtc.yaml \
  /etc/brainstem/brainstem.env \
  /opt/lingtu/current/bin/orbbec_capture \
  /opt/lingtu/current/bin/lingtu_camera_go2rtc_mpegts.py \
  "$LINGTU_SRC/src/drivers/real/camera/impl/orbbec/camera.cpp" \
  "/etc/NetworkManager/system-connections/${HOTSPOT_CONN}.nmconnection"; do
  if [[ -e "$f" ]]; then
    cp -a "$f" "$BACKUP_DIR/"
  fi
done

install_lf() {
  local src="$1" dst="$2" mode="$3"
  mkdir -p "$(dirname "$dst")"
  tr -d '\r' < "$src" > "$dst"
  chmod "$mode" "$dst"
}

echo "[2/7] Configuring 5 GHz hotspot ($HOTSPOT_IFACE ch $HOTSPOT_CHANNEL $HOTSPOT_CIDR) & usb0 route guard ..."
if nmcli -t -f NAME connection show | grep -Fxq "$HOTSPOT_CONN"; then
  nmcli connection modify "$HOTSPOT_CONN" \
    802-11-wireless.band a \
    802-11-wireless.channel "$HOTSPOT_CHANNEL" \
    802-11-wireless.powersave 2 \
    ipv4.method shared \
    ipv4.addresses "$HOTSPOT_CIDR" \
    ipv4.never-default yes \
    ipv4.route-metric 3000
fi
if nmcli -t -f NAME connection show | grep -Fxq "Wired connection 1"; then
  nmcli connection modify "Wired connection 1" ipv4.route-metric 2000 ipv4.never-default yes || true
fi

echo "[3/7] Updating Brainstem /28 subnet whitelist in /etc/brainstem/brainstem.env ..."
if [[ -f /etc/brainstem/brainstem.env ]]; then
  SUBNET_IPS="192.168.50.2,192.168.50.3,192.168.50.4,192.168.50.5,192.168.50.6,192.168.50.7,192.168.50.8,192.168.50.9,192.168.50.10,192.168.50.11,192.168.50.12,192.168.50.13,192.168.50.14"
  if [[ -n "$EXTRA_LAN_IP" ]]; then
    ALLOWED_LIST="${EXTRA_LAN_IP},${SUBNET_IPS}"
  else
    ALLOWED_LIST="$SUBNET_IPS"
  fi
  sed -i \
    -e "s|^THUNDER_GRPC_ALLOWED_IPS=.*|THUNDER_GRPC_ALLOWED_IPS=${ALLOWED_LIST}|" \
    -e "s|^THUNDER_LINGTU_ALLOWED_IPS=.*|THUNDER_LINGTU_ALLOWED_IPS=${ALLOWED_LIST}|" \
    /etc/brainstem/brainstem.env
fi

echo "[4/7] Installing USB power, sysctl WebRTC buffer, and wlan1 18 dBm TX power rules ..."
install_lf "$SCRIPT_DIR/configs/99-doso-usb-no-autosuspend.rules" /etc/udev/rules.d/99-doso-usb-no-autosuspend.rules 0644
install_lf "$SCRIPT_DIR/configs/99-doso-webrtc.conf" /etc/sysctl.d/99-doso-webrtc.conf 0644
install_lf "$SCRIPT_DIR/configs/99-doso-wlan1-txpower" /etc/NetworkManager/dispatcher.d/99-doso-wlan1-txpower 0755
install_lf "$SCRIPT_DIR/configs/doso-usb-stability.service" /etc/systemd/system/doso-usb-stability.service 0644
chown root:root /etc/NetworkManager/dispatcher.d/99-doso-wlan1-txpower

udevadm control --reload-rules
sysctl --system >/dev/null
systemctl daemon-reload
systemctl enable NetworkManager-dispatcher.service 2>/dev/null || true
systemctl enable --now doso-usb-stability.service

echo "[5/7] Building OrbbecSDK native capture (MJPG + laser power control) ..."
if [[ -d "$LINGTU_SRC" ]]; then
  install_lf "$SCRIPT_DIR/orbbec/camera.cpp" "$LINGTU_SRC/src/drivers/real/camera/impl/orbbec/camera.cpp" 0644
  chown sunrise:sunrise "$LINGTU_SRC/src/drivers/real/camera/impl/orbbec/camera.cpp" 2>/dev/null || true
  su - sunrise -c "cd '$LINGTU_SRC' && bash scripts/build/build_orbbec_native.sh"
  systemctl stop lt-camera.service || true
  cp -f "$LINGTU_SRC/build/orbbec_native/orbbec_capture" /opt/lingtu/current/bin/orbbec_capture
  chmod 0755 /opt/lingtu/current/bin/orbbec_capture
else
  echo "WARNING: $LINGTU_SRC not found; skipping orbbec_capture rebuild." >&2
fi

mkdir -p /opt/lingtu/current/Log
chown sunrise:sunrise /opt/lingtu/current/Log 2>/dev/null || true

echo "[6/7] Installing camera ($PROFILE), go2rtc, and CPU core isolation configs ..."
if [[ "$PROFILE" == "30fps" ]]; then
  VIDEO_FPS="30"
  VIDEO_BITRATE="1200"
  install_lf "$SCRIPT_DIR/configs/camera.env.30fps" /etc/lingtu/camera.env 0644
else
  VIDEO_FPS="15"
  VIDEO_BITRATE="800"
  install_lf "$SCRIPT_DIR/configs/camera.env.15fps" /etc/lingtu/camera.env 0644
fi

install_lf "$SCRIPT_DIR/configs/lingtu_camera_go2rtc_mpegts.py" /opt/lingtu/current/bin/lingtu_camera_go2rtc_mpegts.py 0755
install_lf "$SCRIPT_DIR/configs/lt-camera-zz-doso-stability.conf" /etc/systemd/system/lt-camera.service.d/zz-doso-stability.conf 0644
install_lf "$SCRIPT_DIR/configs/go2rtc-zz-doso-cpu.conf" /etc/systemd/system/go2rtc.service.d/zz-doso-cpu.conf 0644
sed -i \
  -e "s|^Environment=LINGTU_VIDEO_FPS=.*|Environment=LINGTU_VIDEO_FPS=${VIDEO_FPS}|" \
  -e "s|^Environment=LINGTU_VIDEO_BITRATE_KBPS=.*|Environment=LINGTU_VIDEO_BITRATE_KBPS=${VIDEO_BITRATE}|" \
  /etc/systemd/system/go2rtc.service.d/zz-doso-cpu.conf

install_lf "$SCRIPT_DIR/configs/go2rtc.yaml.template" /etc/go2rtc/go2rtc.yaml 0644
if [[ -n "$EXTRA_LAN_IP" ]]; then
  sed -i "/192\.168\.50\.1:8555/a\\    - \"${EXTRA_LAN_IP}:8555\"" /etc/go2rtc/go2rtc.yaml
fi

systemctl daemon-reload
systemctl reset-failed lt-camera.service 2>/dev/null || true
systemctl restart lt-camera.service
systemctl restart go2rtc.service

echo "[7/7] Verifying USB devnum & camera frame output for ${VERIFY_SECONDS}s ..."
DEV_BEFORE="$(cat /sys/bus/usb/devices/2-2.2/devnum 2>/dev/null || echo unknown)"
sleep "$VERIFY_SECONDS"
DEV_AFTER="$(cat /sys/bus/usb/devices/2-2.2/devnum 2>/dev/null || echo unknown)"
NRESTARTS="$(systemctl show lt-camera.service -p NRestarts --value)"
STATUS_JSON="$(cat /dev/shm/lingtu/camera_status.json 2>/dev/null || echo '{}')"

echo "=== PROVISIONING SUMMARY ==="
echo "Profile       : $PROFILE (${VIDEO_FPS}fps / ${VIDEO_BITRATE}kbps)"
echo "USB devnum    : $DEV_BEFORE -> $DEV_AFTER"
echo "NRestarts     : $NRESTARTS"
echo "wlan1 txpower : $(iw dev "$HOTSPOT_IFACE" info 2>/dev/null | awk '/txpower/ {print $2, $3}')"
echo "Camera status : $STATUS_JSON"
echo "Backup dir    : $BACKUP_DIR"

if [[ "$NRESTARTS" != "0" || "$DEV_BEFORE" != "$DEV_AFTER" ]]; then
  echo "ERROR: Camera restarted or USB re-enumerated during verification!" >&2
  exit 1
fi
echo "SUCCESS: Robot dog standardized provisioning verified."
