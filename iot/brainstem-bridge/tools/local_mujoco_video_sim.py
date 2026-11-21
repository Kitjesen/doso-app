"""Loopback-only MuJoCo 3D simulation video server for local DOSO App development.

Loads LingTu's latest DOSO Thunder V4 CAD-mesh MJCF (`thunderv4@1.0.3`, with fallback to
`quadruped_v3.xml`) and DOSO Robotics Factory Workshop (`factory_workshop@2.0.0`,
with procedural proving-ground fallback), caches compiled `.mjb` binaries for fast
restarts, syncs pose/joints in real time from the local Brainstem simulation HTTP
state endpoint (127.0.0.1:13146/api/v1/sim/state), and serves 1280x720 JPEG / MJPEG
plus depth snapshot streams over HTTP on 127.0.0.1:5050.

Note: MuJoCo Windows OpenGL contexts are thread-affine and single-context per thread,
so the HTTP server runs in a daemon thread while one shared `mujoco.Renderer` runs
on the main thread.
"""

from __future__ import annotations

import argparse
import copy
import gc
import hashlib
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import shutil
import signal
import socket
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import parse_qs, urlparse
import xml.etree.ElementTree as ET

import cv2
import mujoco
import numpy as np


BUILDER_REVISION = "lingtu-thunderv4-workshop-v3-hd"

THUNDER_V4_XML = Path(
    r"D:\inovxio\brain\lingtu\sim\packages\robots\doso\thunder_v4\mjcf\thunderv4.xml"
)
QUADRUPED_V3_XML = Path(r"D:\inovxio\brain\brainstem\sim\robot\quadruped_v3.xml")
LINGTU_SIM_WORLDS_DIR = Path(r"D:\inovxio\brain\lingtu\sim\packages\worlds")
FACTORY_WORKSHOP_XML = (
    LINGTU_SIM_WORLDS_DIR / "factory_workshop" / "2.0.0" / "physics" / "campus.xml"
)
LINGTU_STAIRS_WORLD_XML = Path(
    r"D:\inovxio\brain\lingtu\sim\compat\engine\worlds\thunderv4_stair_showcase.xml"
)

WORLD_XML_BY_SCENE = {
    "factory_workshop": FACTORY_WORKSHOP_XML,
    "factory_park": LINGTU_SIM_WORLDS_DIR / "factory_park_hf" / "physics" / "factory_park_hf.xml",
    "industrial_park": LINGTU_SIM_WORLDS_DIR / "industrial_park" / "physics" / "industrial_park_scene.xml",
    "nav_course": LINGTU_SIM_WORLDS_DIR / "nav_3d_course" / "physics" / "nav_3d_course.xml",
    "stair_showcase": LINGTU_STAIRS_WORLD_XML,
}

# Skip multi-million-triangle exterior/roof OBJs in campus.xml while retaining the full
# indoor DOSO Robotics CNC hall, roof shell, mezzanine slab, floor markings, racks, and workbenches.
WORKSHOP_SKIP_PREFIXES = (
    "exterior_",
    "upper_maintenance",
    "upper_equipment",
    "upper_console",
    "upper_metrology",
    "upper_test_cell",
    "site_land",
    "site_dressing",
)

# Dart 16-motor order matching localBrainstemSimServer.js & thunderv4.xml:
# [FR(h,t,c), FL(h,t,c), RR(h,t,c), RL(h,t,c), feet(FR,FL,RR,RL)]
V4_JOINT_ORDER = (
    "FR_hip_joint",
    "FR_thigh_joint",
    "FR_calf_joint",
    "FL_hip_joint",
    "FL_thigh_joint",
    "FL_calf_joint",
    "RR_hip_joint",
    "RR_thigh_joint",
    "RR_calf_joint",
    "RL_hip_joint",
    "RL_thigh_joint",
    "RL_calf_joint",
    "FR_foot_joint",
    "FL_foot_joint",
    "RR_foot_joint",
    "RL_foot_joint",
)

V4_FOOT_LINKS = ("FR_foot", "FL_foot", "RR_foot", "RL_foot")
V3_FOOT_LINKS = ("fr_foot_Link", "fl_foot_Link", "rr_foot_Link", "rl_foot_Link")

DEFAULT_SITTING_POS = [
    -0.1, -1.35, 2.65,
    0.1, 1.35, -2.65,
    0.1, 1.35, -2.65,
    -0.1, -1.35, 2.65,
    0.0, 0.0, 0.0, 0.0,
]

STANDING_POSE = [
    0.0, -0.78, 1.48,
    0.0, 0.78, -1.48,
    0.0, 0.78, -1.48,
    0.0, -0.78, 1.48,
    0.0, 0.0, 0.0, 0.0,
]

_SIM_ANIM_STATE: dict[str, object] = {
    "gesture": None,
    "gesture_t0": 0.0,
    "recovery": None,
    "recovery_t0": 0.0,
}


def _quat_roll_pitch(q: tuple[float, float, float, float]) -> tuple[float, float]:
    w, x, y, z = q
    sinr_cosp = 2.0 * (w * x + y * z)
    cosr_cosp = 1.0 - 2.0 * (x * x + y * y)
    roll = math.atan2(sinr_cosp, cosr_cosp)
    sinp = max(-1.0, min(1.0, 2.0 * (w * y - z * x)))
    pitch = math.asin(sinp)
    return roll, pitch


def _apply_gesture_pose(
    gesture_name: str,
    elapsed_s: float,
    base_joints: list[float] | None = None,
) -> tuple[list[float], float, float]:
    """Compute V4 joint targets plus (roll_delta, pitch_delta) for a preset gesture."""
    base = list(base_joints) if base_joints and len(base_joints) >= 16 else list(STANDING_POSE)
    if sum(abs(v) for v in base[:12]) < 0.05:
        base = list(STANDING_POSE)
    t = max(0.0, float(elapsed_s))
    name = (gesture_name or "").strip().lower()
    out = list(base[:16])
    roll_delta = 0.0
    pitch_delta = 0.0

    if name == "bow":
        env = math.sin(math.pi * min(1.0, t / 2.4))
        out[1] -= 0.35 * env
        out[2] += 0.65 * env
        out[4] += 0.35 * env
        out[5] -= 0.65 * env
        out[7] -= 0.08 * env
        out[8] += 0.14 * env
        out[10] += 0.08 * env
        out[11] -= 0.14 * env
        pitch_delta = 0.22 * env
    elif name == "nod":
        env = math.sin(math.pi * min(1.0, t / 1.8))
        osc = 0.5 * (1.0 - math.cos(2.0 * math.pi * 2.0 * t)) * env
        out[1] -= 0.16 * osc
        out[2] += 0.30 * osc
        out[4] += 0.16 * osc
        out[5] -= 0.30 * osc
        pitch_delta = 0.16 * osc
    elif name == "wiggle":
        env = math.sin(math.pi * min(1.0, t / 2.2))
        sway = math.sin(2.0 * math.pi * 2.5 * t) * env
        for hip_idx in (0, 3, 6, 9):
            out[hip_idx] += 0.18 * sway
        out[1] -= 0.10 * abs(sway)
        out[4] += 0.10 * abs(sway)
        roll_delta = 0.14 * sway
    elif name == "stretch":
        env = math.sin(math.pi * min(1.0, t / 2.8))
        out[1] += 0.24 * env
        out[2] -= 0.36 * env
        out[4] -= 0.24 * env
        out[5] += 0.36 * env
        out[7] -= 0.22 * env
        out[8] += 0.34 * env
        out[10] += 0.22 * env
        out[11] -= 0.34 * env
        pitch_delta = -0.10 * env
    elif name == "dance":
        env = math.sin(math.pi * min(1.0, t / 3.0))
        beat = math.sin(2.0 * math.pi * 2.0 * t) * env
        diag_a = max(0.0, beat)
        diag_b = max(0.0, -beat)
        out[1] -= 0.24 * diag_a
        out[2] += 0.45 * diag_a
        out[10] -= 0.24 * diag_a
        out[11] += 0.45 * diag_a
        out[4] += 0.24 * diag_b
        out[5] -= 0.45 * diag_b
        out[7] += 0.24 * diag_b
        out[8] -= 0.45 * diag_b
        for hip_idx in (0, 3, 6, 9):
            out[hip_idx] += 0.12 * beat
        roll_delta = 0.12 * beat
        pitch_delta = 0.08 * math.cos(2.0 * math.pi * 2.0 * t) * env
    elif name in ("step_back", "step-back"):
        env = math.sin(math.pi * min(1.0, t / 1.8))
        step = math.sin(2.0 * math.pi * 1.6 * t) * env
        out[1] -= 0.18 * max(0.0, step)
        out[2] += 0.34 * max(0.0, step)
        out[4] += 0.18 * max(0.0, -step)
        out[5] -= 0.34 * max(0.0, -step)
        pitch_delta = -0.10 * env

    return out, roll_delta, pitch_delta


def _apply_recovery_pose(
    recovery_phase: str | int,
    elapsed_s: float,
    base_joints: list[float] | None = None,
) -> tuple[list[float], float, float]:
    """Compute V4 joint targets plus (roll_delta, pitch_delta) for RobotRecovery phases."""
    phase_str = str(recovery_phase).strip().lower().replace("_", "-")
    base = list(base_joints) if base_joints and len(base_joints) >= 16 else list(STANDING_POSE)
    fallen = list(DEFAULT_SITTING_POS)
    t = max(0.0, float(elapsed_s))

    if phase_str in ("2", "selected", "3", "enabled", "fallen"):
        # Side-lying brace pose with subtle recovery readiness articulation
        pulse = 0.06 * math.sin(2.0 * math.pi * 0.8 * t) if phase_str in ("3", "enabled") else 0.0
        out = [v + (pulse if idx % 3 == 2 else 0.0) for idx, v in enumerate(fallen)]
        return out, 1.95, 0.08
    if phase_str in ("4", "getting-up", "gettingup"):
        s = min(1.0, t / 1.8)
        ease = 0.5 - 0.5 * math.cos(math.pi * s)
        roll_delta = 1.95 * (1.0 - ease)
        pitch_delta = 0.16 * math.sin(math.pi * s)
        out = [
            fallen[i] * (1.0 - ease) + STANDING_POSE[i] * ease
            for i in range(16)
        ]
        # Asymmetric push-off on low side during mid flip
        push = 0.25 * math.sin(math.pi * s)
        out[0] -= push
        out[6] += push
        return out, roll_delta, pitch_delta
    if phase_str in ("5", "stable-stand", "stablestand"):
        return list(STANDING_POSE), 0.0, 0.0
    return base, 0.0, 0.0


def _apply_sim_motion_overlays(
    state: dict,
    fsm_obj: dict,
    status: dict,
    raw_kind: object,
    raw_transition: object,
    fsm_kind: str,
    imu_quat: tuple[float, float, float, float],
    joint_vec: list[float],
    now_s: float,
) -> tuple[tuple[float, float, float, float], list[float]]:
    recovery_obj = state.get("recovery") if isinstance(state.get("recovery"), dict) else {}
    raw_phase = recovery_obj.get("phase")
    if raw_phase is None:
        raw_phase = recovery_obj.get("rawPhase")
    phase_str = str(raw_phase or "").strip().lower().replace("_", "-")
    active_recovery_phase = phase_str if phase_str in (
        "2", "selected", "3", "enabled", "fallen",
        "4", "getting-up", "gettingup", "5", "stable-stand", "stablestand",
    ) else None

    if active_recovery_phase is not None:
        if _SIM_ANIM_STATE["recovery"] != active_recovery_phase:
            _SIM_ANIM_STATE["recovery"] = active_recovery_phase
            _SIM_ANIM_STATE["recovery_t0"] = now_s
        elapsed_r = max(0.0, now_s - float(_SIM_ANIM_STATE["recovery_t0"]))
        joint_vec, r_roll, r_pitch = _apply_recovery_pose(active_recovery_phase, elapsed_r, joint_vec)
        cur_roll, _ = _quat_roll_pitch(imu_quat)
        if abs(cur_roll) < 0.35 and (abs(r_roll) > 1e-4 or abs(r_pitch) > 1e-4):
            imu_quat = _quat_mul(imu_quat, _euler_to_quat_wxyz(r_roll, r_pitch, 0.0))
        return imu_quat, joint_vec
    _SIM_ANIM_STATE["recovery"] = None

    gesture_name = str(
        fsm_obj.get("gestureName")
        or status.get("gestureName")
        or state.get("gestureName")
        or ""
    ).strip().lower()
    is_gesture_active = bool(gesture_name) and (
        raw_kind == 4 or raw_transition == 3 or fsm_kind == "transitioning"
    )
    if is_gesture_active:
        if _SIM_ANIM_STATE["gesture"] != gesture_name:
            _SIM_ANIM_STATE["gesture"] = gesture_name
            _SIM_ANIM_STATE["gesture_t0"] = now_s
        elapsed_g = max(0.0, now_s - float(_SIM_ANIM_STATE["gesture_t0"]))
        joint_vec, g_roll, g_pitch = _apply_gesture_pose(gesture_name, elapsed_g, joint_vec)
        if abs(g_roll) > 1e-4 or abs(g_pitch) > 1e-4:
            imu_quat = _quat_mul(imu_quat, _euler_to_quat_wxyz(g_roll, g_pitch, 0.0))
    else:
        _SIM_ANIM_STATE["gesture"] = None

    return imu_quat, joint_vec

# Crisp metallic/graphite materials for Thunder V4 under balanced MuJoCo workshop OpenGL.
ROBOT_SRGB_MATERIALS = {
    "body_shell_black": ("0.25 0.29 0.34 1", "0.55", "0.45", "0.10"),
    "joint_graphite": ("0.40 0.45 0.52 1", "0.65", "0.55", "0.10"),
    "limb_graphite": ("0.30 0.35 0.41 1", "0.50", "0.40", "0.10"),
    "sensor_black": ("0.15 0.18 0.23 1", "0.70", "0.60", "0.06"),
    "wheel_black": ("0.13 0.14 0.17 1", "0.30", "0.25", "0.03"),
}

V4_DISPLAY_JOINTS = (
    ("hip", "FR_hip", "0.249499 -0.0649956 0.08105", "-1 0 0 -0.12", "FR_hip_visual", "joint_graphite",
     "thigh", "FR_thigh", "0.078 -0.0795 0", "0 1 0 -0.93", "FR_thigh_visual", "limb_graphite",
     "calf", "FR_calf", "0.249452 -0.0695 -0.01655", "0 1 0 1.96", "FR_calf_visual", "limb_graphite",
     "foot", "FR_foot", "0.240758 -0.0729 0.0305", "FR_foot_visual", "wheel_black"),
    ("hip", "FL_hip", "0.249499 0.0650044 0.08105", "-1 0 0 0.12", "FL_hip_visual", "joint_graphite",
     "thigh", "FL_thigh", "0.078 0.0795 0", "0 -1 0 0.93", "FL_thigh_visual", "limb_graphite",
     "calf", "FL_calf", "-0.249478 0.0695 -0.01615", "0 -1 0 -1.96", "FL_calf_visual", "limb_graphite",
     "foot", "FL_foot", "0.240809 0.0729 0.0301", "FL_foot_visual", "wheel_black"),
    ("hip", "RR_hip", "-0.249501 -0.0649956 0.08105", "1 0 0 0.12", "RR_hip_visual", "joint_graphite",
     "thigh", "RR_thigh", "-0.078 -0.0795 0", "0 1 0 0.93", "RR_thigh_visual", "limb_graphite",
     "calf", "RR_calf", "0.249452 -0.0695 -0.01655", "0 1 0 -1.96", "RR_calf_visual", "limb_graphite",
     "foot", "RR_foot", "-0.240758 -0.0729 0.0305", "RR_foot_visual", "wheel_black"),
    ("hip", "RL_hip", "-0.249501 0.0650044 0.08105", "1 0 0 -0.12", "RL_hip_visual", "joint_graphite",
     "thigh", "RL_thigh", "-0.078 0.0795 0", "0 -1 0 -0.93", "RL_thigh_visual", "limb_graphite",
     "calf", "RL_calf", "0.249452 0.0695 -0.01655", "0 -1 0 1.96", "RL_calf_visual", "limb_graphite",
     "foot", "RL_foot", "-0.240758 0.0729 0.0305", "RL_foot_visual", "wheel_black"),
)

CAMERA_IDS = ("follow", "front", "rear")
ALLOWED_ORIGINS = {
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:8083",
    "http://127.0.0.1:8083",
    "http://localhost:19006",
    "http://127.0.0.1:19006",
}


def resolve_xml_path(explicit: str | None) -> Path:
    candidates = [explicit] if explicit else []
    env_xml = os.environ.get("DOSO_QUADRUPED_XML", "").strip()
    if env_xml:
        candidates.append(env_xml)
    candidates.extend([str(THUNDER_V4_XML), str(QUADRUPED_V3_XML)])
    for candidate in candidates:
        path = Path(candidate)
        if path.is_file():
            return path.resolve()
    raise FileNotFoundError(
        "Unable to locate thunderv4.xml or quadruped_v3.xml; pass --xml or set DOSO_QUADRUPED_XML"
    )


def resolve_scene_name(requested: str) -> str:
    if requested != "auto":
        if requested in WORLD_XML_BY_SCENE and not WORLD_XML_BY_SCENE[requested].is_file():
            return "proving_ground"
        return requested
    return "factory_workshop" if FACTORY_WORKSHOP_XML.is_file() else "proving_ground"


def _float_rgba_transparent(rgba_str: str | None) -> str:
    parts = (rgba_str or "0.8 0.8 0.8 1").split()
    rgb = parts[:3] if len(parts) >= 3 else ["0.8", "0.8", "0.8"]
    return f"{rgb[0]} {rgb[1]} {rgb[2]} 0"


def _hide_robot_collision_geoms(body_elem: ET.Element) -> None:
    """Keep all non-mesh robot collision primitives invisible in group 3 while retaining contacts."""
    for geom in body_elem.findall("geom"):
        if geom.attrib.get("type") != "mesh":
            geom.attrib["group"] = "3"
            geom.attrib["rgba"] = _float_rgba_transparent(geom.attrib.get("rgba"))
    for child in body_elem.findall("body"):
        _hide_robot_collision_geoms(child)


def _resolve_asset_paths(root: ET.Element, base_dir: Path) -> None:
    compiler = root.find("compiler")
    settings = compiler.attrib if compiler is not None else {}
    for asset in root.findall("./asset/*[@file]"):
        filename = Path(asset.attrib["file"])
        if settings.get("strippath", "false") == "true":
            filename = Path(filename.name)
        directory = settings.get("assetdir", "")
        if asset.tag == "mesh":
            directory = settings.get("meshdir", directory)
        elif asset.tag == "texture":
            directory = settings.get("texturedir", directory)
        elif asset.tag == "hfield":
            directory = settings.get("assetdir", directory)
        asset.set("file", (base_dir / directory / filename).resolve().as_posix())


def _freeze_euler_to_quat(root: ET.Element, worldbody: ET.Element) -> None:
    compiler = root.find("compiler")
    angle_unit = str(compiler.attrib.get("angle", "degree") if compiler is not None else "degree").strip().lower()
    euler_seq = str(compiler.attrib.get("eulerseq", "xyz") if compiler is not None else "xyz").strip()
    for elem in worldbody.iter():
        encoded = elem.attrib.get("euler")
        if encoded is None:
            continue
        vals = np.fromstring(encoded, sep=" ", dtype=np.float64)
        if vals.size != 3 or not np.isfinite(vals).all():
            continue
        if angle_unit.startswith("deg"):
            vals = np.deg2rad(vals)
        quat = np.zeros(4, dtype=np.float64)
        mujoco.mju_euler2Quat(quat, vals, euler_seq)
        elem.attrib["quat"] = " ".join(f"{v:.12g}" for v in quat)
        del elem.attrib["euler"]


def _generate_proving_textures(staging_dir: Path) -> tuple[Path, Path]:
    """Generate crisp procedural PNG tarmac & brushed-concrete textures for fallback proving ground."""
    tex_dir = staging_dir / "textures"
    tex_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(42)
    n = 512

    asphalt = np.empty((n, n, 3), dtype=np.int16)
    asphalt[:, :, 0] = 52
    asphalt[:, :, 1] = 48
    asphalt[:, :, 2] = 46
    grain = rng.integers(-14, 15, size=(n, n, 1), dtype=np.int16)
    mottle = cv2.resize(
        rng.integers(-6, 7, size=(64, 64, 1), dtype=np.int16).astype(np.float32),
        (n, n),
        interpolation=cv2.INTER_LINEAR,
    )[..., None].astype(np.int16)
    asphalt = np.clip(asphalt + grain + mottle, 18, 92).astype(np.uint8)
    asphalt[0:2, :] = (30, 32, 36)
    asphalt[:, 0:2] = (30, 32, 36)
    asphalt[2:3, :] = (62, 65, 70)
    asphalt[:, 2:3] = (62, 65, 70)
    asphalt_path = tex_dir / "asphalt_hd.png"
    cv2.imwrite(str(asphalt_path), asphalt)

    concrete = np.empty((n, n, 3), dtype=np.int16)
    concrete[:, :, 0] = 108
    concrete[:, :, 1] = 109
    concrete[:, :, 2] = 105
    c_grain = rng.integers(-9, 10, size=(n, n, 1), dtype=np.int16)
    concrete = np.clip(concrete + c_grain, 72, 145).astype(np.uint8)
    for pos in (0, 256):
        concrete[pos:pos + 2, :] = (68, 70, 68)
        concrete[:, pos:pos + 2] = (68, 70, 68)
    concrete_path = tex_dir / "concrete_hd.png"
    cv2.imwrite(str(concrete_path), concrete)
    return asphalt_path, concrete_path


def _apply_robot_materials(
    asset: ET.Element,
    *,
    include_proving_materials: bool,
    staging_dir: Path | None = None,
) -> None:
    for mat in asset.findall("material"):
        name = mat.attrib.get("name", "")
        if name in ROBOT_SRGB_MATERIALS:
            rgba, spec, shin, emis = ROBOT_SRGB_MATERIALS[name]
            mat.attrib["rgba"] = rgba
            mat.attrib["specular"] = spec
            mat.attrib["shininess"] = shin
            mat.attrib["emission"] = emis

    if not include_proving_materials:
        return

    for tex in list(asset.findall("texture")):
        if tex.attrib.get("type") == "skybox":
            asset.remove(tex)
    ET.SubElement(
        asset,
        "texture",
        {
            "type": "skybox",
            "builtin": "gradient",
            "rgb1": "0.42 0.62 0.86",
            "rgb2": "0.82 0.89 0.96",
            "width": "512",
            "height": "512",
        },
    )

    existing_tex = {t.attrib.get("name") for t in asset.findall("texture")}
    if staging_dir is not None:
        asphalt_path, concrete_path = _generate_proving_textures(staging_dir)
        if "pg_asphalt_tex" not in existing_tex:
            ET.SubElement(
                asset,
                "texture",
                {
                    "name": "pg_asphalt_tex",
                    "type": "2d",
                    "file": asphalt_path.resolve().as_posix(),
                },
            )
        if "pg_concrete_tex" not in existing_tex:
            ET.SubElement(
                asset,
                "texture",
                {
                    "name": "pg_concrete_tex",
                    "type": "2d",
                    "file": concrete_path.resolve().as_posix(),
                },
            )
    else:
        if "pg_asphalt_tex" not in existing_tex:
            ET.SubElement(
                asset,
                "texture",
                {
                    "name": "pg_asphalt_tex",
                    "type": "2d",
                    "builtin": "checker",
                    "rgb1": "0.18 0.19 0.21",
                    "rgb2": "0.21 0.22 0.24",
                    "width": "512",
                    "height": "512",
                },
            )
        if "pg_concrete_tex" not in existing_tex:
            ET.SubElement(
                asset,
                "texture",
                {
                    "name": "pg_concrete_tex",
                    "type": "2d",
                    "builtin": "checker",
                    "rgb1": "0.42 0.44 0.43",
                    "rgb2": "0.37 0.39 0.38",
                    "width": "512",
                    "height": "512",
                },
            )

    existing_mat = {m.attrib.get("name") for m in asset.findall("material")}
    extra_materials = [
        ("pg_asphalt", {"texture": "pg_asphalt_tex", "texrepeat": "1.2 1.2", "texuniform": "true", "reflectance": "0.04", "specular": "0.08", "shininess": "0.1"}),
        ("pg_concrete", {"texture": "pg_concrete_tex", "texrepeat": "1.0 1.0", "texuniform": "true", "reflectance": "0.03", "specular": "0.05", "shininess": "0.06"}),
        ("pg_curb", {"rgba": "0.60 0.61 0.58 1", "specular": "0.05", "shininess": "0.05"}),
        ("pg_road_yellow", {"rgba": "0.90 0.72 0.14 1", "specular": "0.08", "shininess": "0.10"}),
        ("pg_zebra_white", {"rgba": "0.82 0.83 0.80 1", "specular": "0.05", "shininess": "0.06"}),
        ("pg_stair", {"rgba": "0.36 0.37 0.36 1", "specular": "0.04", "shininess": "0.05"}),
        ("pg_stair_edge", {"rgba": "0.90 0.68 0.10 1", "specular": "0.08", "shininess": "0.1"}),
        ("pg_ramp", {"rgba": "0.30 0.36 0.42 1", "specular": "0.06", "shininess": "0.08"}),
        ("pg_platform", {"rgba": "0.35 0.40 0.44 1", "specular": "0.06", "shininess": "0.08"}),
        ("pg_building", {"rgba": "0.54 0.57 0.59 1", "specular": "0.05", "shininess": "0.05"}),
        ("pg_wall", {"rgba": "0.66 0.67 0.64 1", "specular": "0.04", "shininess": "0.04"}),
        ("pg_steel", {"rgba": "0.28 0.31 0.35 1", "specular": "0.25", "shininess": "0.3"}),
        ("pg_glass", {"rgba": "0.22 0.44 0.56 0.78", "specular": "0.4", "shininess": "0.6"}),
        ("pg_container_blue", {"rgba": "0.14 0.34 0.56 1", "specular": "0.10", "shininess": "0.12"}),
        ("pg_container_orange", {"rgba": "0.78 0.32 0.10 1", "specular": "0.10", "shininess": "0.12"}),
        ("pg_container_red", {"rgba": "0.62 0.16 0.14 1", "specular": "0.10", "shininess": "0.12"}),
        ("pg_pallet", {"rgba": "0.52 0.36 0.18 1", "specular": "0.04", "shininess": "0.05"}),
        ("pg_cone", {"rgba": "0.94 0.36 0.06 1", "specular": "0.10", "shininess": "0.12"}),
        ("pg_tank", {"rgba": "0.76 0.78 0.76 1", "specular": "0.18", "shininess": "0.25"}),
        ("pg_green_beacon", {"rgba": "0.16 0.80 0.36 0.9", "emission": "0.25"}),
        ("pg_lamp", {"rgba": "1.0 0.92 0.68 1", "emission": "0.85"}),
    ]
    for name, attrs in extra_materials:
        if name not in existing_mat:
            ET.SubElement(asset, "material", {"name": name, **attrs})


def _add_display_thunder_v4(worldbody: ET.Element, asset: ET.Element) -> None:
    mesh_names = {m.attrib.get("name") for m in asset.findall("mesh")}
    if "base_link_visual" not in mesh_names:
        return
    disp = ET.SubElement(
        worldbody,
        "body",
        {"name": "display_thunder_v4", "pos": "3.85 -0.85 0.46", "quat": "0.382683 0 0 0.923880"},
    )
    ET.SubElement(
        disp,
        "geom",
        {"type": "mesh", "mesh": "base_link_visual", "contype": "0", "conaffinity": "0", "group": "1", "material": "body_shell_black"},
    )
    for (
        _, hip_name, hip_pos, hip_aa, hip_mesh, hip_mat,
        _, thigh_name, thigh_pos, thigh_aa, thigh_mesh, thigh_mat,
        _, calf_name, calf_pos, calf_aa, calf_mesh, calf_mat,
        _, foot_name, foot_pos, foot_mesh, foot_mat,
    ) in V4_DISPLAY_JOINTS:
        if hip_mesh not in mesh_names:
            continue
        hb = ET.SubElement(disp, "body", {"name": f"disp_{hip_name}", "pos": hip_pos, "axisangle": hip_aa})
        ET.SubElement(hb, "geom", {"type": "mesh", "mesh": hip_mesh, "contype": "0", "conaffinity": "0", "group": "1", "material": hip_mat})
        tb = ET.SubElement(hb, "body", {"name": f"disp_{thigh_name}", "pos": thigh_pos, "axisangle": thigh_aa})
        ET.SubElement(tb, "geom", {"type": "mesh", "mesh": thigh_mesh, "contype": "0", "conaffinity": "0", "group": "1", "material": thigh_mat})
        cb = ET.SubElement(tb, "body", {"name": f"disp_{calf_name}", "pos": calf_pos, "axisangle": calf_aa})
        ET.SubElement(cb, "geom", {"type": "mesh", "mesh": calf_mesh, "contype": "0", "conaffinity": "0", "group": "1", "material": calf_mat})
        fb = ET.SubElement(cb, "body", {"name": f"disp_{foot_name}", "pos": foot_pos})
        ET.SubElement(fb, "geom", {"type": "mesh", "mesh": foot_mesh, "contype": "0", "conaffinity": "0", "group": "1", "material": foot_mat})


def _populate_proving_ground(worldbody: ET.Element, asset: ET.Element) -> None:
    ET.SubElement(worldbody, "geom", {"name": "ground", "type": "plane", "size": "80 80 0.1", "material": "pg_asphalt", "group": "0", "condim": "4", "conaffinity": "15", "friction": "1.0 0.02 0.0002"})
    ET.SubElement(worldbody, "geom", {"name": "main_road_apron", "type": "box", "pos": "2.0 0 0.002", "size": "18.0 1.4 0.002", "material": "pg_asphalt", "group": "0", "contype": "0", "conaffinity": "0"})
    ET.SubElement(worldbody, "geom", {"name": "concrete_test_pad", "pos": "4.8 0 0.003", "size": "4.2 4.6 0.003", "material": "pg_concrete", "group": "0", "contype": "0", "conaffinity": "0"})

    for i, x_pos in enumerate((-6.0, -4.2, -2.4, -0.6, 4.4, 6.4, 8.4)):
        ET.SubElement(worldbody, "geom", {"name": f"lane_dash_{i}", "type": "box", "pos": f"{x_pos} 0 0.005", "size": "0.55 0.045 0.003", "material": "pg_road_yellow", "contype": "0", "conaffinity": "0"})
    for idx, y_pos in enumerate((-0.90, -0.54, -0.18, 0.18, 0.54, 0.90)):
        ET.SubElement(worldbody, "geom", {"name": f"zebra_{idx}", "type": "box", "pos": f"1.85 {y_pos} 0.006", "size": "0.42 0.10 0.003", "material": "pg_zebra_white", "contype": "0", "conaffinity": "0"})

    ET.SubElement(worldbody, "geom", {"name": "spawn_marker", "type": "cylinder", "pos": "0 0 0.005", "size": "0.48 0.003", "material": "pg_curb", "contype": "0", "conaffinity": "0"})
    ET.SubElement(worldbody, "geom", {"name": "front_goal_beacon", "type": "cylinder", "pos": "7.2 0 0.006", "size": "0.35 0.005", "material": "pg_green_beacon", "contype": "0", "conaffinity": "0"})

    ET.SubElement(worldbody, "geom", {"name": "stair_apron", "type": "box", "pos": "2.45 1.75 0.01", "size": "0.45 0.90 0.01", "material": "pg_curb", "group": "0", "condim": "4", "conaffinity": "15"})
    for s in range(8):
        rise = (s + 1) * 0.06
        cx = 3.05 + s * 0.34
        ET.SubElement(worldbody, "geom", {"name": f"stair_step_{s+1}", "type": "box", "pos": f"{cx:.2f} 1.75 {rise * 0.5:.3f}", "size": f"0.17 0.85 {rise * 0.5:.3f}", "material": "pg_stair", "group": "0", "condim": "4", "conaffinity": "15"})
        ET.SubElement(worldbody, "geom", {"name": f"stair_nosing_{s+1}", "type": "box", "pos": f"{cx - 0.16:.2f} 1.75 {rise + 0.003:.3f}", "size": "0.014 0.85 0.003", "material": "pg_stair_edge", "contype": "0", "conaffinity": "0"})
    ET.SubElement(worldbody, "geom", {"name": "stair_top_landing", "type": "box", "pos": "6.35 1.75 0.24", "size": "0.75 0.85 0.24", "material": "pg_curb", "group": "0", "condim": "4", "conaffinity": "15"})
    for side, sy in (("left", 2.63), ("right", 0.87)):
        ET.SubElement(worldbody, "geom", {"name": f"stair_stringer_{side}", "type": "box", "pos": f"4.24 {sy} 0.27", "euler": "0 -0.175 0", "size": "1.55 0.04 0.06", "material": "pg_steel", "group": "0", "condim": "3", "conaffinity": "15"})
        ET.SubElement(worldbody, "geom", {"name": f"stair_rail_{side}", "type": "box", "pos": f"4.24 {sy} 0.72", "euler": "0 -0.175 0", "size": "1.55 0.02 0.02", "material": "pg_road_yellow", "contype": "0", "conaffinity": "0"})

    ET.SubElement(worldbody, "geom", {"name": "platform_ramp", "type": "box", "pos": "3.75 -2.25 0.165", "euler": "0 -0.155 0", "size": "1.20 0.88 0.03", "material": "pg_ramp", "group": "0", "condim": "4", "conaffinity": "15"})
    ET.SubElement(worldbody, "geom", {"name": "high_platform", "type": "box", "pos": "6.10 -2.25 0.18", "size": "1.25 0.90 0.18", "material": "pg_platform", "group": "0", "condim": "4", "conaffinity": "15"})
    ET.SubElement(worldbody, "geom", {"name": "platform_beacon", "type": "cylinder", "pos": "6.45 -2.25 0.365", "size": "0.28 0.006", "material": "pg_green_beacon", "contype": "0", "conaffinity": "0"})

    _add_display_thunder_v4(worldbody, asset)


def _merge_external_world(
    worldbody: ET.Element,
    asset: ET.Element,
    robot_root: ET.Element,
    world_xml: Path,
    *,
    is_workshop: bool,
    width: int,
    height: int,
) -> None:
    scene_root = ET.fromstring(world_xml.read_text(encoding="utf-8", errors="ignore"))
    scene_worldbody = scene_root.find("worldbody")
    if scene_worldbody is None:
        return

    scene_asset = scene_root.find("asset")
    if scene_asset is not None and is_workshop:
        kept_meshes: set[str] = set()
        for child in list(scene_asset):
            name = child.attrib.get("name", "")
            if child.tag in {"mesh", "texture", "material"} and name.startswith(WORKSHOP_SKIP_PREFIXES):
                scene_asset.remove(child)
                continue
            if child.tag == "mesh":
                child.attrib.pop("inertia", None)
                kept_meshes.add(name)
        for parent in scene_worldbody.iter():
            for g in list(parent):
                if g.tag == "geom":
                    mname = g.attrib.get("mesh")
                    if mname and mname not in kept_meshes:
                        parent.remove(g)

    _freeze_euler_to_quat(scene_root, scene_worldbody)
    _resolve_asset_paths(scene_root, world_xml.resolve().parent)

    scene_stat = scene_root.find("statistic")
    if scene_stat is not None:
        for old_stat in list(robot_root.findall("statistic")):
            robot_root.remove(old_stat)
        robot_root.insert(1, copy.deepcopy(scene_stat))

    scene_visual = scene_root.find("visual")
    if scene_visual is not None:
        rv = robot_root.find("visual")
        if rv is not None:
            robot_root.remove(rv)
        robot_root.insert(0, copy.deepcopy(scene_visual))
        vis = robot_root.find("visual")
        if vis is not None:
            glob = vis.find("global")
            if glob is None:
                glob = ET.SubElement(vis, "global")
            glob.set("offwidth", str(max(1920, width)))
            glob.set("offheight", str(max(1080, height)))
            qual = vis.find("quality")
            if qual is None:
                qual = ET.SubElement(vis, "quality")
            qual.set("offsamples", "4")
            qual.set("shadowsize", "4096")
            hl = vis.find("headlight")
            if hl is None:
                hl = ET.SubElement(vis, "headlight")
            hl.set("ambient", "0.28 0.29 0.31")
            hl.set("diffuse", "0.18 0.18 0.18")
            hl.set("specular", "0.20 0.20 0.20")
            mp = vis.find("map")
            if mp is None:
                mp = ET.SubElement(vis, "map")
            mp.set("znear", "0.001")
            mp.set("zfar", "6.0")

    scene_size = scene_root.find("size")
    if scene_size is not None and robot_root.find("size") is None:
        insert_at = 0
        for idx, child in enumerate(list(robot_root)):
            if child.tag == "compiler":
                insert_at = idx + 1
                break
        robot_root.insert(insert_at, copy.deepcopy(scene_size))

    if scene_asset is not None:
        existing_keys = {(child.tag, child.attrib.get("name")) for child in list(asset)}
        for child in list(scene_asset):
            key = (child.tag, child.attrib.get("name"))
            if key not in existing_keys:
                asset.append(copy.deepcopy(child))
                existing_keys.add(key)

    for child in list(worldbody):
        if child.tag == "geom" and (child.attrib.get("name") in {"ground", "floor"} or child.attrib.get("type") == "plane"):
            worldbody.remove(child)

    for child in list(scene_worldbody):
        if child.tag == "body" and child.attrib.get("name") in {"robot_placeholder", "base_link", "trunk"}:
            continue
        cloned = copy.deepcopy(child)
        if cloned.tag == "geom" and "group" not in cloned.attrib:
            cloned.attrib["group"] = "0"
        worldbody.append(cloned)


def load_or_build_model(
    robot_xml: Path,
    scene_name: str,
    width: int,
    height: int,
) -> mujoco.MjModel:
    """Compile thunderv4 + LingTu scene with persistent `.mjb` binary cache."""
    world_xml = WORLD_XML_BY_SCENE.get(scene_name)
    has_external_world = world_xml is not None and world_xml.is_file()
    is_workshop = scene_name == "factory_workshop" and has_external_world

    robot_stat = robot_xml.stat()
    world_stat = world_xml.stat() if has_external_world and world_xml is not None else None
    sig = "|".join([
        BUILDER_REVISION,
        str(robot_xml),
        str(robot_stat.st_mtime_ns),
        scene_name,
        str(world_xml or ""),
        str(world_stat.st_mtime_ns if world_stat else 0),
        f"{width}x{height}",
        mujoco.__version__,
    ])
    digest = hashlib.sha256(sig.encode("utf-8")).hexdigest()[:16]
    cache_dir = Path(tempfile.gettempdir()) / "doso_mujoco_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_mjb = cache_dir / f"{scene_name}_{digest}.mjb"

    if cache_mjb.is_file():
        try:
            return mujoco.MjModel.from_binary_path(str(cache_mjb))
        except Exception:
            cache_mjb.unlink(missing_ok=True)

    staging_dir = Path(tempfile.mkdtemp(prefix="doso_mujoco_scene_"))
    try:
        robot_root = ET.fromstring(robot_xml.read_text(encoding="utf-8", errors="ignore"))
        compiler = robot_root.find("compiler")
        if compiler is None:
            compiler = ET.SubElement(robot_root, "compiler", {"angle": "radian", "eulerseq": "zyx", "autolimits": "true"})
        meshdir_raw = compiler.attrib.get("meshdir", "meshes")
        resolved_meshdir = (robot_xml.parent / meshdir_raw).resolve()
        compiler.attrib["meshdir"] = resolved_meshdir.as_posix()

        if not has_external_world:
            for old_stat in list(robot_root.findall("statistic")):
                robot_root.remove(old_stat)
            robot_root.insert(1, ET.Element("statistic", {"center": "0 0 0.5", "extent": "2.0"}))
            visual = robot_root.find("visual")
            if visual is None:
                visual = ET.Element("visual")
                robot_root.insert(2, visual)
            for tag in ("global", "quality", "map", "headlight", "rgba"):
                old = visual.find(tag)
                if old is not None:
                    visual.remove(old)
            ET.SubElement(visual, "global", {"offwidth": str(max(1920, width)), "offheight": str(max(1080, height))})
            ET.SubElement(visual, "quality", {"shadowsize": "4096", "offsamples": "4"})
            ET.SubElement(visual, "map", {"znear": "0.008", "zfar": "80"})
            ET.SubElement(visual, "headlight", {"ambient": "0.42 0.44 0.46", "diffuse": "0.55 0.55 0.52", "specular": "0.22 0.22 0.22"})
            ET.SubElement(visual, "rgba", {"haze": "0.74 0.83 0.92 1"})

        asset = robot_root.find("asset")
        if asset is None:
            asset = ET.SubElement(robot_root, "asset")
        _apply_robot_materials(
            asset,
            include_proving_materials=not has_external_world,
            staging_dir=staging_dir,
        )

        worldbody = robot_root.find("worldbody")
        if worldbody is None:
            raise ValueError(f"Robot XML {robot_xml} has no <worldbody>")

        for child in list(worldbody):
            if child.tag == "light":
                worldbody.remove(child)
            elif child.tag == "geom" and child.attrib.get("type") == "plane":
                worldbody.remove(child)

        robot_body = None
        for candidate_name in ("base_link", "trunk"):
            for b in worldbody.findall("body"):
                if b.attrib.get("name") == candidate_name:
                    robot_body = b
                    break
            if robot_body is not None:
                break

        if robot_body is not None:
            _hide_robot_collision_geoms(robot_body)
            for cam_elem in list(robot_body.findall("camera")):
                if cam_elem.attrib.get("name") in ("front_camera", "rear_camera"):
                    robot_body.remove(cam_elem)
            ET.SubElement(
                robot_body,
                "camera",
                {
                    "name": "front_camera",
                    "pos": "0.445 -0.0005 0.128",
                    "xyaxes": "0 -1 0 0.087 0 0.996",
                    "fovy": "64",
                },
            )
            ET.SubElement(
                robot_body,
                "camera",
                {
                    "name": "rear_camera",
                    "pos": "-0.448 0 0.112",
                    "xyaxes": "0 1 0 -0.087 0 0.996",
                    "fovy": "64",
                },
            )

        ET.SubElement(
            worldbody,
            "light",
            {
                "name": "sun_key",
                "directional": "true",
                "pos": "60 10 24",
                "dir": "-0.30 0.35 -1",
                "diffuse": "0.22 0.22 0.21" if is_workshop else "0.75 0.74 0.70",
                "specular": "0.14 0.14 0.14" if is_workshop else "0.22 0.22 0.22",
                "castshadow": "false" if is_workshop else "true",
            },
        )
        ET.SubElement(
            worldbody,
            "light",
            {
                "name": "sky_fill",
                "directional": "true",
                "pos": "40 50 18",
                "dir": "0.35 -0.35 -1",
                "diffuse": "0.08 0.09 0.11" if is_workshop else "0.32 0.36 0.42",
                "specular": "0.03 0.03 0.03" if is_workshop else "0.05 0.05 0.05",
                "castshadow": "false",
            },
        )

        if has_external_world and world_xml is not None:
            _merge_external_world(
                worldbody,
                asset,
                robot_root,
                world_xml,
                is_workshop=is_workshop,
                width=width,
                height=height,
            )
        else:
            _populate_proving_ground(worldbody, asset)

        _freeze_euler_to_quat(robot_root, worldbody)
        out_xml = staging_dir / f"doso_{scene_name}.xml"
        ET.ElementTree(robot_root).write(out_xml, encoding="utf-8", xml_declaration=True)
        model = mujoco.MjModel.from_xml_path(str(out_xml))

        tmp_mjb = cache_dir / f".{cache_mjb.name}.{os.getpid()}.tmp"
        try:
            mujoco.mj_saveModel(model, str(tmp_mjb))
            os.replace(tmp_mjb, cache_mjb)
        except Exception:
            tmp_mjb.unlink(missing_ok=True)
        return model
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)


def fetch_sim_state(url: str, timeout_s: float = 0.25) -> dict | None:
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            if resp.status != 200:
                return None
            payload = json.loads(resp.read().decode("utf-8"))
            if isinstance(payload, dict) and (payload.get("ok") is True or "fsmState" in payload):
                return payload
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None
    return None


def overlay_hud(
    rgb: np.ndarray,
    *,
    connected_to_sim: bool,
    fsm_kind: str,
    motors_enabled: bool,
    mode_id: str,
    vx: float,
    vy: float,
    wz: float,
    frame_seq: int,
    cam_label: str,
) -> np.ndarray:
    img = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    cv2.rectangle(img, (8, 8), (640, 46), (12, 16, 24), thickness=-1)
    cv2.rectangle(img, (8, 8), (640, 46), (65, 110, 175), thickness=1)
    if connected_to_sim:
        motor_txt = "ON" if motors_enabled else "OFF"
        line1 = f"SIMULATION | ThunderV4 [{cam_label}] | FSM:{fsm_kind.upper()} | MOTORS:{motor_txt} | MODE:{mode_id}"
        line2 = f"CMD VEL vx={vx:+.2f} m/s  vy={vy:+.2f} m/s  wz={wz:+.2f} rad/s   #{frame_seq}"
        accent = (120, 220, 150) if motors_enabled else (180, 210, 255)
    else:
        line1 = f"SIMULATION | ThunderV4 [{cam_label}] | WAITING FOR BRAINSTEM SIM (127.0.0.1:13145)"
        line2 = f"THUNDER V4 WORKSHOP POSE   #{frame_seq}"
        accent = (130, 195, 255)
    cv2.putText(img, line1, (16, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.42, accent, 1, cv2.LINE_AA)
    cv2.putText(img, line2, (16, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.39, (220, 226, 234), 1, cv2.LINE_AA)
    return img


def _encode_jpeg_hd(bgr: np.ndarray, quality: int = 92) -> tuple[bool, np.ndarray]:
    params = [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)]
    if hasattr(cv2, "IMWRITE_JPEG_SAMPLING_FACTOR") and hasattr(cv2, "IMWRITE_JPEG_SAMPLING_FACTOR_444"):
        params.extend([
            int(cv2.IMWRITE_JPEG_SAMPLING_FACTOR),
            int(cv2.IMWRITE_JPEG_SAMPLING_FACTOR_444),
        ])
    return cv2.imencode(".jpg", bgr, params)


class SharedCameraStore:
    def __init__(self, width: int, height: int, fps: int, model_name: str, scene_name: str):
        self.width = width
        self.height = height
        self.fps = fps
        self.model_name = model_name
        self.scene_name = scene_name
        self._cond = threading.Condition()
        self._seqs: dict[str, int] = {cid: 0 for cid in CAMERA_IDS}
        self._jpegs: dict[str, bytes] = {cid: b"" for cid in CAMERA_IDS}
        self._last_demand: dict[str, float] = {cid: (time.monotonic() if cid == "front" else 0.0) for cid in CAMERA_IDS}
        self._last_depth_demand: float = 0.0
        self.depth_bytes: bytes = b""
        self.source_ready = False
        self.sim_connected = False

    def mark_demand(self, cam_id: str) -> None:
        if cam_id in CAMERA_IDS:
            with self._cond:
                self._last_demand[cam_id] = time.monotonic()

    def mark_depth_demand(self) -> None:
        with self._cond:
            self._last_depth_demand = time.monotonic()

    def depth_demanded(self, ttl_s: float = 5.0) -> bool:
        with self._cond:
            return (time.monotonic() - self._last_depth_demand) <= ttl_s

    def active_cameras(self, loop_count: int = 0, ttl_s: float = 2.5) -> list[str]:
        now = time.monotonic()
        with self._cond:
            if any(self._seqs[cid] == 0 for cid in CAMERA_IDS):
                return list(CAMERA_IDS)
            demanded = sorted(
                [cid for cid in CAMERA_IDS if now - self._last_demand[cid] <= ttl_s],
                key=lambda cid: self._last_demand[cid],
                reverse=True,
            )
            if not demanded:
                return ["front"]
            if len(demanded) == 1:
                return demanded
            return [demanded[0]] + [cid for cid in demanded[1:] if loop_count % 2 == 0]

    def next_seq(self, cam_id: str) -> int:
        with self._cond:
            return self._seqs[cam_id] + 1

    def publish(self, cam_id: str, jpeg_bytes: bytes, *, depth_bytes: bytes | None = None, sim_connected: bool = False) -> int:
        with self._cond:
            self._seqs[cam_id] += 1
            self._jpegs[cam_id] = jpeg_bytes
            if depth_bytes is not None:
                self.depth_bytes = depth_bytes
            self.sim_connected = sim_connected
            self.source_ready = True
            seq = self._seqs[cam_id]
            self._cond.notify_all()
            return seq

    def latest(self, cam_id: str = "front") -> tuple[int, bytes, bytes, bool]:
        key = cam_id if cam_id in CAMERA_IDS else "front"
        with self._cond:
            return self._seqs[key], self._jpegs[key], self.depth_bytes, self.source_ready

    def wait_next(self, cam_id: str, after_seq: int, timeout_s: float = 1.0) -> tuple[int, bytes]:
        key = cam_id if cam_id in CAMERA_IDS else "front"
        deadline = time.monotonic() + timeout_s
        with self._cond:
            while self._seqs[key] <= after_seq:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                self._cond.wait(remaining)
            return self._seqs[key], self._jpegs[key]


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def server_bind(self) -> None:
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            try:
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            except OSError:
                pass
        super().server_bind()

    def handle_error(self, request, client_address) -> None:
        exc_type, _, _ = sys.exc_info()
        if exc_type is not None and issubclass(
            exc_type, (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)
        ):
            return
        super().handle_error(request, client_address)


def _normalize_cam_param(raw_cam: str) -> str:
    cam = raw_cam.strip().lower()
    if cam in ("", "front"):
        return "front"
    if cam in ("chase", "follow"):
        return "follow"
    if cam in CAMERA_IDS:
        return cam
    return "front"


def make_handler(store: SharedCameraStore, listen_port: int):
    class SimVideoHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, format: str, *args) -> None:
            return

        def _validate_host(self) -> bool:
            host = (self.headers.get("Host") or "").strip().lower()
            return host in (f"127.0.0.1:{listen_port}", f"localhost:{listen_port}", "127.0.0.1", "localhost")

        def _send_cors_headers(self) -> bool:
            origin = self.headers.get("Origin")
            if origin is None:
                return True
            if origin not in ALLOWED_ORIGINS:
                return False
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Expose-Headers", "X-Doso-Frame-Seq, X-Doso-Simulation, X-Doso-Camera")
            return True

        def do_OPTIONS(self) -> None:
            if not self._validate_host():
                self.send_response(HTTPStatus.FORBIDDEN)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            origin = self.headers.get("Origin")
            if origin is not None and origin not in ALLOWED_ORIGINS:
                self.send_response(HTTPStatus.FORBIDDEN)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_response(HTTPStatus.NO_CONTENT)
            self._send_cors_headers()
            if (self.headers.get("Access-Control-Request-Private-Network") or "").lower() == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept, Cache-Control")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def _send_json(self, status: int, obj: dict) -> None:
            body = json.dumps(obj).encode("utf-8")
            self.send_response(status)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Doso-Simulation", "true")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_html(self, html: str) -> None:
            body = html.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self._send_cors_headers()
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_jpeg(self, payload: bytes, seq: int, cam_id: str) -> None:
            self.send_response(HTTPStatus.OK)
            self._send_cors_headers()
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Doso-Frame-Seq", str(seq))
            self.send_header("X-Doso-Camera", cam_id)
            self.send_header("X-Doso-Simulation", "true")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self) -> None:
            if not self._validate_host():
                self.send_response(HTTPStatus.FORBIDDEN)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            origin = self.headers.get("Origin")
            if origin is not None and origin not in ALLOWED_ORIGINS:
                self.send_response(HTTPStatus.FORBIDDEN)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

            parsed = urlparse(self.path)
            path = parsed.path
            query = parse_qs(parsed.query)
            cam_id = _normalize_cam_param((query.get("cam") or ["front"])[0])

            if path == "/" or path == "/preview":
                for cid in CAMERA_IDS:
                    store.mark_demand(cid)
                self._send_html(
                    f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>DOSO Thunder V4 MuJoCo 相机流</title>
<style>body{{margin:0;background:#101216;color:#e6eaf0;font-family:system-ui,sans-serif;padding:18px}}
h1{{font-size:18px;margin:0 0 12px}} .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px}}
.card{{background:#181c22;border:1px solid #2b313c;border-radius:12px;overflow:hidden}}
.label{{padding:8px 12px;font-size:13px;font-weight:600;border-bottom:1px solid #2b313c}}
img{{width:100%;display:block;background:#000}}</style></head>
<body><h1>DOSO {store.model_name} MuJoCo ({store.scene_name}) 实时视角</h1><div class="grid">
<div class="card"><div class="label">前广角车载相机 (front_camera)</div><img src="/api/v1/sim/video/mjpeg?cam=front"></div>
<div class="card"><div class="label">后广角车载相机 (rear_camera)</div><img src="/api/v1/sim/video/mjpeg?cam=rear"></div>
<div class="card"><div class="label">第三人称追随视角 (follow)</div><img src="/api/v1/sim/video/mjpeg?cam=follow"></div>
</div></body></html>"""
                )
                return

            seq, jpeg_bytes, depth_bytes, source_ready = store.latest(cam_id)

            if path == "/api/v1/sim/video/status":
                store.mark_demand(cam_id)
                self._send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "simulation": True,
                        "backend": "mujoco",
                        "mujoco_version": mujoco.__version__,
                        "model": store.model_name,
                        "world": store.scene_name,
                        "scene": store.scene_name,
                        "cameras": ["chase", "front", "rear", "follow"],
                        "active_camera": cam_id,
                        "available": True,
                        "source_ready": source_ready,
                        "sim_connected": store.sim_connected,
                        "frame_seq": seq,
                        "width": store.width,
                        "height": store.height,
                        "fps": store.fps,
                    },
                )
                return

            if path == "/api/v1/sim/video/frame.jpg":
                store.mark_demand(cam_id)
                if not source_ready or not jpeg_bytes:
                    self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"ok": False, "code": "warming"})
                    return
                self._send_jpeg(jpeg_bytes, seq, cam_id)
                return

            if path == "/api/v1/camera/depth/snapshot":
                store.mark_depth_demand()
                payload = depth_bytes or store.latest("front")[1]
                if not payload:
                    self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"ok": False, "code": "warming"})
                    return
                self._send_jpeg(payload, seq, "front")
                return

            if path == "/api/v1/webrtc/status":
                self._send_json(HTTPStatus.NOT_FOUND, {"available": False, "simulation": True})
                return

            if path == "/api/v1/sim/video/mjpeg":
                store.mark_demand(cam_id)
                self.send_response(HTTPStatus.OK)
                self._send_cors_headers()
                self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Doso-Simulation", "true")
                self.end_headers()
                last_seq = 0
                try:
                    while True:
                        store.mark_demand(cam_id)
                        next_seq, payload = store.wait_next(cam_id, last_seq, timeout_s=1.0)
                        if not payload or next_seq == last_seq:
                            continue
                        last_seq = next_seq
                        header = (
                            f"--frame\r\n"
                            f"Content-Type: image/jpeg\r\n"
                            f"Content-Length: {len(payload)}\r\n"
                            f"X-Doso-Frame-Seq: {next_seq}\r\n\r\n"
                        ).encode("ascii")
                        self.wfile.write(header)
                        self.wfile.write(payload)
                        self.wfile.write(b"\r\n")
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                    return

            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "code": "not_found"})

    return SimVideoHandler


def _resolve_joint_qpos_indices(model: mujoco.MjModel) -> tuple[list[int], list[str], int, float]:
    v4_probe = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, "FR_hip_joint")
    if v4_probe >= 0:
        indices = []
        for name in V4_JOINT_ORDER:
            jid = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, name)
            indices.append(int(model.jnt_qposadr[jid]))
        foot_names = [n for n in V4_FOOT_LINKS if mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, n) >= 0]
        trunk_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, "base_link")
        return indices, foot_names, trunk_id, 0.093

    v3_joint_names = (
        "fr_hip_joint", "fr_thigh_joint", "fr_calf_joint",
        "fl_hip_joint", "fl_thigh_joint", "fl_calf_joint",
        "rr_hip_joint", "rr_thigh_joint", "rr_calf_joint",
        "rl_hip_joint", "rl_thigh_joint", "rl_calf_joint",
        "fr_foot_joint", "fl_foot_joint", "rr_foot_joint", "rl_foot_joint",
    )
    indices = []
    for name in v3_joint_names:
        jid = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, name)
        indices.append(int(model.jnt_qposadr[jid]))
    foot_names = [n for n in V3_FOOT_LINKS if mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, n) >= 0]
    trunk_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, "trunk")
    return indices, foot_names, trunk_id, 0.12


def _terrain_height(model: mujoco.MjModel, data: mujoco.MjData, x: float, y: float) -> float:
    pnt = np.array([x, y, 4.0], dtype=np.float64)
    vec = np.array([0.0, 0.0, -1.0], dtype=np.float64)
    geomgroup = np.array([1, 0, 0, 0, 1, 1], dtype=np.uint8)
    geomid = np.array([-1], dtype=np.int32)
    dist = mujoco.mj_ray(model, data, pnt, vec, geomgroup, 1, -1, geomid)
    if dist >= 0.0 and geomid[0] >= 0 and int(model.geom_bodyid[geomid[0]]) == 0:
        return float(4.0 - dist)
    return 0.0


def _euler_to_quat_wxyz(roll: float, pitch: float, yaw: float) -> tuple[float, float, float, float]:
    cy, sy = math.cos(yaw * 0.5), math.sin(yaw * 0.5)
    cp, sp = math.cos(pitch * 0.5), math.sin(pitch * 0.5)
    cr, sr = math.cos(roll * 0.5), math.sin(roll * 0.5)
    return (
        cr * cp * cy + sr * sp * sy,
        sr * cp * cy - cr * sp * sy,
        cr * sp * cy + sr * cp * sy,
        cr * cp * sy - sr * sp * cy,
    )


def _quat_mul(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return (
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local MuJoCo 3D simulation video HTTP server")
    parser.add_argument("--host", default="127.0.0.1", help="Loopback bind host (only 127.0.0.1 allowed)")
    parser.add_argument("--port", type=int, default=5050, help="HTTP listen port (default 5050)")
    parser.add_argument(
        "--sim-state-url",
        default="http://127.0.0.1:13146/api/v1/sim/state",
        help="Brainstem simulation HTTP state endpoint",
    )
    parser.add_argument("--xml", default=None, help="Path to thunderv4.xml or quadruped_v3.xml")
    parser.add_argument(
        "--scene",
        default="auto",
        choices=("auto", "factory_workshop", "proving_ground", "factory_park", "industrial_park", "nav_course", "stair_showcase"),
        help="Scene environment to merge with the robot (default: auto -> factory_workshop when available)",
    )
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--fps", type=int, default=22)
    parser.add_argument("--jpeg-quality", type=int, default=92, help="JPEG compression quality (1-100, default 92)")
    parser.add_argument("--hud", action="store_true", help="Overlay debug telemetry banner onto video frames")
    parser.add_argument("--self-test", default=None, help="Render follow/front/rear test images into directory and exit")
    return parser.parse_args()


def _apply_kinematics(
    model: mujoco.MjModel,
    data: mujoco.MjData,
    *,
    dof_ids: list[int],
    foot_body_ids: list[int],
    wheel_radius_m: float,
    world_x: float,
    world_y: float,
    yaw: float,
    imu_quat: tuple[float, float, float, float] | None,
    joint_vec: list[float],
    trunk_body_id: int | None = None,
) -> None:
    h_front = _terrain_height(model, data, world_x + 0.25 * math.cos(yaw), world_y + 0.25 * math.sin(yaw))
    h_rear = _terrain_height(model, data, world_x - 0.25 * math.cos(yaw), world_y - 0.25 * math.sin(yaw))
    terrain_z = max(_terrain_height(model, data, world_x, world_y), 0.5 * (h_front + h_rear))
    terrain_pitch = math.atan2(h_rear - h_front, 0.50)

    if imu_quat is not None:
        qw, qx, qy, qz = imu_quat
    else:
        qw, qx, qy, qz = _euler_to_quat_wxyz(0.0, terrain_pitch, yaw)

    data.qpos[0] = world_x
    data.qpos[1] = world_y
    data.qpos[2] = terrain_z + 0.46
    qnorm = math.sqrt(qw * qw + qx * qx + qy * qy + qz * qz) or 1.0
    data.qpos[3:7] = [qw / qnorm, qx / qnorm, qy / qnorm, qz / qnorm]
    for idx, mj_idx in enumerate(dof_ids):
        data.qpos[mj_idx] = joint_vec[idx]

    mujoco.mj_kinematics(model, data)
    min_foot_z = min(float(data.xpos[fid][2]) for fid in foot_body_ids) - wheel_radius_m
    resolved_trunk_id = trunk_body_id
    if resolved_trunk_id is None:
        for candidate in ("base", "trunk", "chassis", "body", "torso"):
            bid = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, candidate)
            if bid > 0:
                resolved_trunk_id = bid
                break
        if resolved_trunk_id is None and model.nbody > 1:
            resolved_trunk_id = 1
    min_contact_z = min_foot_z
    if resolved_trunk_id is not None and 0 < resolved_trunk_id < model.nbody:
        trunk_z = float(data.xpos[resolved_trunk_id][2]) - 0.11
        min_contact_z = min(min_foot_z, trunk_z)
    data.qpos[2] += terrain_z - min_contact_z
    mujoco.mj_forward(model, data)


def main() -> int:
    args = parse_args()
    if args.host != "127.0.0.1":
        raise RuntimeError("Local MuJoCo video server may only bind to loopback 127.0.0.1")
    if not (1 <= args.port <= 65535):
        raise RuntimeError("Invalid --port")

    robot_xml = resolve_xml_path(args.xml)
    scene_name = resolve_scene_name(args.scene)
    model_name = "thunderv4@1.0.3" if "thunder" in robot_xml.name.lower() else robot_xml.stem

    model = load_or_build_model(robot_xml, scene_name, args.width, args.height)
    data = mujoco.MjData(model)

    dof_ids, foot_names, trunk_body_id, wheel_radius_m = _resolve_joint_qpos_indices(model)
    foot_body_ids = [model.body(name).id for name in foot_names]

    front_cam_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_CAMERA, "front_camera")
    rear_cam_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_CAMERA, "rear_camera")

    # Single Windows-safe OpenGL renderer shared for RGB + periodic depth snapshot.
    renderer = mujoco.Renderer(model, height=args.height, width=args.width)
    scene_opt = mujoco.MjvOption()
    scene_opt.geomgroup[3] = 0
    scene_opt.geomgroup[4] = 0
    scene_opt.geomgroup[1] = 1
    scene_opt.geomgroup[2] = 1

    follow_cam = mujoco.MjvCamera()
    follow_cam.type = mujoco.mjtCamera.mjCAMERA_TRACKING
    follow_cam.trackbodyid = trunk_body_id
    follow_cam.distance = 2.05
    follow_cam.elevation = -15.5
    follow_cam.azimuth = 74.0

    front_cam = mujoco.MjvCamera()
    if front_cam_id >= 0:
        front_cam.type = mujoco.mjtCamera.mjCAMERA_FIXED
        front_cam.fixedcamid = front_cam_id
    else:
        front_cam = follow_cam

    rear_cam = mujoco.MjvCamera()
    if rear_cam_id >= 0:
        rear_cam.type = mujoco.mjtCamera.mjCAMERA_FIXED
        rear_cam.fixedcamid = rear_cam_id
    else:
        rear_cam = follow_cam

    spawn_x = 57.5 if scene_name == "factory_workshop" else 0.0
    spawn_y = 27.5 if scene_name == "factory_workshop" else 0.0
    spawn_yaw = (math.pi * 0.5) if scene_name == "factory_workshop" else 0.0
    spawn_yaw_quat = _euler_to_quat_wxyz(0.0, 0.0, spawn_yaw)

    if args.self_test:
        out_dir = Path(args.self_test)
        out_dir.mkdir(parents=True, exist_ok=True)
        standing = [-0.1, -0.8, 1.8, 0.1, 0.8, -1.8, 0.1, 0.8, -1.8, -0.1, -0.8, 1.8, 0, 0, 0, 0]
        _apply_kinematics(
            model,
            data,
            dof_ids=dof_ids,
            foot_body_ids=foot_body_ids,
            wheel_radius_m=wheel_radius_m,
            world_x=spawn_x,
            world_y=spawn_y,
            yaw=spawn_yaw,
            imu_quat=None,
            joint_vec=standing,
        )
        follow_cam.lookat[:] = data.xpos[trunk_body_id] + np.array([0.0, 0.0, 0.08])
        follow_cam.azimuth = math.degrees(spawn_yaw) - 14.0
        stats = {}
        for cid, cam_obj in (("follow", follow_cam), ("front", front_cam), ("rear", rear_cam)):
            renderer.update_scene(data, camera=cam_obj, scene_option=scene_opt)
            rgb = renderer.render()
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            dest = out_dir / f"{cid}.jpg"
            ok_jpg, encoded = _encode_jpeg_hd(bgr, args.jpeg_quality)
            if ok_jpg:
                dest.write_bytes(encoded.tobytes())
            stats[cid] = {
                "path": str(dest),
                "bytes": dest.stat().st_size if dest.is_file() else 0,
                "meanLuma": round(float(rgb.mean()), 2),
                "stdLuma": round(float(rgb.std()), 2),
            }
        print(
            json.dumps(
                {
                    "ok": True,
                    "mujoco": mujoco.__version__,
                    "model": model_name,
                    "scene": scene_name,
                    "robotXml": str(robot_xml),
                    "nmesh": int(model.nmesh),
                    "ngeom": int(model.ngeom),
                    "cameras": stats,
                },
                indent=2,
            ),
            flush=True,
        )
        renderer.close()
        return 0

    store = SharedCameraStore(args.width, args.height, args.fps, model_name, scene_name)
    handler_cls = make_handler(store, args.port)
    httpd = QuietThreadingHTTPServer(("127.0.0.1", args.port), handler_cls)

    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()

    stop_event = threading.Event()

    def _stop(_signum=None, _frame=None):
        stop_event.set()

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    world_x = spawn_x
    world_y = spawn_y
    prev_tick = time.monotonic()
    frame_interval_s = 1.0 / max(1, args.fps)
    loop_count = 0
    ready_announced = False
    rgb_buf = np.empty((args.height, args.width, 3), dtype=np.uint8)
    bgr_buf = np.empty((args.height, args.width, 3), dtype=np.uint8)

    try:
        while not stop_event.is_set():
            tick_start = time.monotonic()
            dt = max(0.0, min(0.1, tick_start - prev_tick))
            prev_tick = tick_start

            state = fetch_sim_state(args.sim_state_url, timeout_s=0.20)
            connected_to_sim = state is not None
            if connected_to_sim:
                status = state.get("status") or {}
                profile = state.get("profile") or {}
                vel = state.get("velocity") or {}
                imu = state.get("imu") or {}
                motors = state.get("motors") or []
                if isinstance(state.get("pose"), dict) and "fsmState" in state:
                    fsm_kind = str(state.get("fsmState") or "grounded")
                    motors_enabled = fsm_kind in ("standing", "walking")
                    mode_id = str(state.get("profile") or "flat")
                    vx = float(vel.get("x") or 0.0)
                    vy = float(vel.get("y") or 0.0)
                    wz = float(vel.get("z") or 0.0)
                    world_x = spawn_x + float(state["pose"].get("x") or 0.0)
                    world_y = spawn_y + float(state["pose"].get("y") or 0.0)
                    yaw = spawn_yaw + float(state["pose"].get("yaw") or 0.0)
                    imu_quat = None
                    joint_vec = [-0.1, -0.8, 1.8, 0.1, 0.8, -1.8, 0.1, 0.8, -1.8, -0.1, -0.8, 1.8, 0, 0, 0, 0]
                else:
                    fsm_obj = status.get("fsm") if isinstance(status.get("fsm"), dict) else {}
                    raw_kind = fsm_obj.get("kind")
                    raw_transition = fsm_obj.get("transition")
                    kind_map = {1: "grounded", 2: "standing", 3: "walking", 4: "transitioning", 5: "fault"}
                    fsm_kind = kind_map.get(raw_kind) or str(status.get("fsmKind") or "grounded")
                    if raw_kind in (1, 2) and raw_transition in (1, 2):
                        fsm_kind = "standing_up" if raw_transition == 1 else "sitting_down"
                    motors_enabled = bool(status.get("motorOutputEnabled"))
                    mode_id = str(profile.get("activeModeId") or profile.get("current") or "flat")
                    vx = float(vel.get("x") or 0.0)
                    vy = float(vel.get("y") or 0.0)
                    wz = float(vel.get("z") or 0.0)
                    yaw = spawn_yaw + float(state.get("yawAngle") or 0.0)
                    quat = imu.get("quaternion") or {}
                    qw = float(quat.get("w") if quat.get("w") is not None else 1.0)
                    qx = float(quat.get("x") or 0.0)
                    qy = float(quat.get("y") or 0.0)
                    qz = float(quat.get("z") or 0.0)
                    imu_quat = _quat_mul(spawn_yaw_quat, (qw, qx, qy, qz))

                    if raw_kind == 3 or fsm_kind == "walking":
                        cy = math.cos(yaw)
                        sy = math.sin(yaw)
                        world_x += (vx * cy - vy * sy) * dt
                        world_y += (vx * sy + vy * cy) * dt

                    motor_pos_by_id = {}
                    for item in motors:
                        if isinstance(item, dict) and isinstance(item.get("id"), int):
                            motor_pos_by_id[item["id"]] = float(item.get("position") or 0.0)
                    joint_vec = [
                        motor_pos_by_id.get(i, DEFAULT_SITTING_POS[i])
                        for i in range(16)
                    ]
                    imu_quat, joint_vec = _apply_sim_motion_overlays(
                        state,
                        fsm_obj,
                        status,
                        raw_kind,
                        raw_transition,
                        fsm_kind,
                        imu_quat,
                        joint_vec,
                        time.monotonic(),
                    )
            else:
                fsm_kind = "idle"
                motors_enabled = False
                mode_id = "flat"
                vx = vy = wz = 0.0
                yaw = spawn_yaw
                imu_quat = None
                joint_vec = [-0.1, -0.8, 1.8, 0.1, 0.8, -1.8, 0.1, 0.8, -1.8, -0.1, -0.8, 1.8, 0, 0, 0, 0]

            _apply_kinematics(
                model,
                data,
                dof_ids=dof_ids,
                foot_body_ids=foot_body_ids,
                wheel_radius_m=wheel_radius_m,
                world_x=world_x,
                world_y=world_y,
                yaw=yaw,
                imu_quat=imu_quat,
                joint_vec=joint_vec,
            )

            follow_cam.lookat[:] = data.xpos[trunk_body_id] + np.array([0.0, 0.0, 0.08])
            follow_cam.azimuth = math.degrees(yaw) - 14.0
            cam_map = {"follow": follow_cam, "front": front_cam, "rear": rear_cam}
            active_cams = store.active_cameras(loop_count)
            for cam_idx, cid in enumerate(active_cams):
                try:
                    renderer.update_scene(data, camera=cam_map[cid], scene_option=scene_opt)
                    rgb = renderer.render(out=rgb_buf)
                    if args.hud:
                        bgr = overlay_hud(
                            rgb,
                            connected_to_sim=connected_to_sim,
                            fsm_kind=fsm_kind,
                            motors_enabled=motors_enabled,
                            mode_id=mode_id,
                            vx=vx,
                            vy=vy,
                            wz=wz,
                            frame_seq=store.next_seq(cid),
                            cam_label=cid,
                        )
                    else:
                        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR, dst=bgr_buf)
                    ok_jpg, encoded = _encode_jpeg_hd(bgr, args.jpeg_quality)
                    if not ok_jpg:
                        continue

                    depth_bytes = None
                    if cam_idx == 0 and store.depth_demanded() and loop_count % 10 == 0:
                        try:
                            renderer.enable_depth_rendering()
                            renderer.update_scene(data, camera=front_cam, scene_option=scene_opt)
                            depth = renderer.render()
                            if hasattr(renderer, "disable_depth_rendering"):
                                renderer.disable_depth_rendering()
                            clipped = np.clip(np.nan_to_num(depth, nan=6.0, posinf=6.0, neginf=0.2), 0.2, 6.0)
                            norm = (255.0 * (1.0 - (clipped - 0.2) / 5.8)).astype(np.uint8)
                            resized = cv2.resize(norm, (320, 180), interpolation=cv2.INTER_AREA)
                            colored = cv2.applyColorMap(resized, cv2.COLORMAP_TURBO)
                            ok_d, enc_d = cv2.imencode(".jpg", colored, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                            if ok_d:
                                depth_bytes = enc_d.tobytes()
                        except Exception:
                            try:
                                if hasattr(renderer, "disable_depth_rendering"):
                                    renderer.disable_depth_rendering()
                            except Exception:
                                pass

                    store.publish(cid, encoded.tobytes(), depth_bytes=depth_bytes, sim_connected=connected_to_sim)
                except MemoryError:
                    gc.collect()
                    stop_event.wait(0.25)
                    break

            if not ready_announced and store.source_ready:
                ready_announced = True
                print(
                    json.dumps(
                        {
                            "event": "ready",
                            "service": "local-mujoco-video-sim",
                            "host": "127.0.0.1",
                            "port": args.port,
                            "mujoco": mujoco.__version__,
                            "model": model_name,
                            "world": scene_name,
                            "scene": scene_name,
                            "xml": str(robot_xml),
                            "width": args.width,
                            "height": args.height,
                            "cameras": ["chase", "front", "rear", "follow"],
                            "simStateUrl": args.sim_state_url,
                            "simulation": True,
                        }
                    ),
                    flush=True,
                )

            loop_count += 1
            elapsed = time.monotonic() - tick_start
            if elapsed < frame_interval_s:
                stop_event.wait(frame_interval_s - elapsed)
    finally:
        httpd.shutdown()
        httpd.server_close()
        try:
            renderer.close()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
