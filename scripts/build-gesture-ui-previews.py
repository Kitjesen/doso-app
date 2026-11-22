#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate lightweight 16:9 UI preview GIFs under doso-app/assets/gestures/
from doso-app/gesture/gifs/ for the 35 standing-start Brainstem gestures.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
GESTURE_INDEX = APP_ROOT / "gesture" / "index.json"
SRC_GIFS = APP_ROOT / "gesture" / "gifs"
OUT_PREVIEWS = APP_ROOT / "assets" / "gestures"


def main() -> int:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found on PATH")

    index = json.loads(GESTURE_INDEX.read_text(encoding="utf-8"))
    if OUT_PREVIEWS.exists():
        shutil.rmtree(OUT_PREVIEWS)
    OUT_PREVIEWS.mkdir(parents=True, exist_ok=True)

    # Representative start offsets for long Flip clips so the 3.4s preview captures peak motion
    start_offsets = {
        "flip_play_bow": 2.0,
        "new_year_bow": 1.5,
        "body_circle": 1.5,
        "figure8": 1.5,
        "hello": 1.2,
        "dance": 2.0,
        "body_sway": 1.0,
        "curious_peek": 1.0,
    }

    vf = (
        "fps=9,scale=208:117:force_original_aspect_ratio=decrease,"
        "pad=208:117:(ow-iw)/2:(oh-ih)/2:color=0x101418,"
        "split[s0][s1];[s0]palettegen=max_colors=48:stats_mode=diff[p];"
        "[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle"
    )

    total_bytes = 0
    for item in index["gestures"]:
        name = item["name"]
        src = SRC_GIFS / f"{name}.gif"
        dst = OUT_PREVIEWS / f"{name}.gif"
        ss = start_offsets.get(name, 0.0)
        cmd = [
            ffmpeg,
            "-y",
            "-loglevel",
            "error",
            *(["-ss", str(ss)] if ss > 0 else []),
            "-t",
            "3.4",
            "-i",
            str(src),
            "-vf",
            vf,
            "-loop",
            "0",
            str(dst),
        ]
        subprocess.run(cmd, check=True)
        total_bytes += dst.stat().st_size

    files = sorted(OUT_PREVIEWS.glob("*.gif"))
    biggest = max(files, key=lambda p: p.stat().st_size)
    print(
        f"Generated {len(files)} UI preview GIFs in {OUT_PREVIEWS}: "
        f"total = {total_bytes / (1024 * 1024):.2f} MB, "
        f"max = {biggest.name} ({biggest.stat().st_size / 1024:.1f} KB)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
