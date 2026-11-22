#!/usr/bin/env python3
"""Own one color encoder/remux pair for a go2rtc exec producer."""

from __future__ import annotations

import ctypes
import os
import signal
import subprocess
import sys
from typing import NoReturn


PR_SET_PDEATHSIG = 1
LIBC = ctypes.CDLL(None, use_errno=True)


def _child_setup() -> None:
    # go2rtc may terminate an exec producer without running its shell traps.
    # Make both children die automatically when this supervisor disappears.
    if LIBC.prctl(PR_SET_PDEATHSIG, signal.SIGTERM) != 0:
        raise OSError(ctypes.get_errno(), "prctl(PR_SET_PDEATHSIG) failed")


FPS = os.environ.get("LINGTU_VIDEO_FPS", "30")
BITRATE_KBPS = os.environ.get("LINGTU_VIDEO_BITRATE_KBPS", "1200")

video_command = [
    "/opt/lingtu/current/bin/lingtu_camera_video",
    "--color-shm", "/lingtu_camera_color",
    "--output", "-",
    "--codec", "libx264",
    "--fps", FPS,
    "--bitrate-kbps", BITRATE_KBPS,
    "--idle-timeout-ms", "3000",
]
mux_command = [
    "ffmpeg", "-hide_banner", "-loglevel", "error",
    "-fflags", "nobuffer", "-flags", "low_delay",
    "-probesize", "32768", "-analyzeduration", "0",
    "-f", "h264", "-framerate", FPS, "-i", "pipe:0",
    "-c:v", "copy",
    "-muxdelay", "0", "-muxpreload", "0", "-flush_packets", "1",
    "-f", "mpegts", "pipe:1",
]

video: subprocess.Popen[bytes] | None = None
mux: subprocess.Popen[bytes] | None = None
stopping = False


def stop(_signum: int, _frame: object) -> NoReturn:
    global stopping
    stopping = True
    for process in (mux, video):
        if process is not None and process.poll() is None:
            process.terminate()
    raise SystemExit(0)


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)

try:
    video = subprocess.Popen(
        video_command,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        preexec_fn=_child_setup,
    )
    assert video.stdout is not None
    mux = subprocess.Popen(
        mux_command,
        stdin=video.stdout,
        stdout=sys.stdout.buffer,
        stderr=subprocess.DEVNULL,
        preexec_fn=_child_setup,
    )
    video.stdout.close()
    raise SystemExit(mux.wait())
finally:
    for process in (mux, video):
        if process is not None and process.poll() is None:
            process.terminate()
    for process in (mux, video):
        if process is not None:
            process.wait(timeout=2)
