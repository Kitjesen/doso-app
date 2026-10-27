#!/usr/bin/env sh
# Read-only inventory. Does not open/capture frames, contact peers, or start services.
set -eu

task_os=$(uname -s)
printf 'SYSTEM\n'
uname -srm
if [ "$task_os" != Linux ]; then
  printf 'This inventory targets the robot Linux host; no further inspection performed.\n' >&2
  exit 2
fi
if [ -r /etc/os-release ]; then
  sed -n '/^PRETTY_NAME=/p' /etc/os-release
fi

printf '\nVIDEO DEVICE NODES (names only; no frames)\n'
task_found=0
for task_device in /dev/video*; do
  [ -e "$task_device" ] || continue
  task_found=1
  ls -l "$task_device"
done
[ "$task_found" -eq 1 ] || printf 'No /dev/video* nodes found.\n'
if [ -d /dev/v4l/by-id ]; then
  printf '\nSTABLE DEVICE LINKS\n'
  ls -l /dev/v4l/by-id
fi
printf '\nVIDEO DEVICE LABELS\n'
for task_name in /sys/class/video4linux/video*/name; do
  [ -r "$task_name" ] || continue
  printf '%s: ' "$task_name"
  cat "$task_name"
done

printf '\nAVAILABLE TOOLS (paths only)\n'
for task_tool in ffmpeg ffprobe v4l2-ctl mediamtx python3 timeout; do
  if command -v "$task_tool" >/dev/null 2>&1; then
    command -v "$task_tool"
  else
    printf '%s: not found\n' "$task_tool"
  fi
done
if command -v ffmpeg >/dev/null 2>&1; then
  printf '\nFFMPEG VERSION / DECLARED H264 ENCODERS (not hardware proof)\n'
  ffmpeg -version 2>/dev/null | sed -n '1p'
  ffmpeg -hide_banner -encoders 2>/dev/null | awk '/264/ {print $1, $2}'
fi

if command -v ip >/dev/null 2>&1; then
  printf '\nLOCAL IPv4 ADDRESSES (no network probes)\n'
  ip -brief -4 address show
fi
if command -v ss >/dev/null 2>&1; then
  printf '\nLOCAL LISTENERS (no connections or process arguments)\n'
  ss -lnut
fi
printf '\nInventory complete. No camera opened, frames saved, service installed or started.\n'
