#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the unified Thunder V4 gesture library under doso-app/gesture/.

Merges:
  1. C:/Users/99563/robot-dog-motions (19 standing-start Brainstem 50 Hz matrix4 motions + GIFs;
     excludes stand_up and wake_stand since standing up uses official StandUp / RobotRecovery)
  2. D:/inovxio/brain/train/_external/flip-review-20261011 (16 MotionBank continuous
     show motions + 9 WBC/MPC/AMP/teleop dynamic skills + all 29 GIFs)

Outputs under d:/DOSO/app-workspace/doso-app/gesture/:
  - index.json                     Unified catalog (35 standing-start keyframe gestures + 9 dynamic skills + 4 aux previews)
  - library.json                   Brainstem GestureLibrary.loadFromJson array (35 sparse keyframe gestures)
  - keyframes/<name>.json          Individual 50 Hz sparse keyframe files (35 files)
  - trajectories/<name>.json       Dense 50 Hz matrix4 16-DOF trajectories (35 files)
  - trajectories/flip_dynamic/*.json  Dense WBC/MPC/AMP trajectories & simulation metrics for Flip dynamic skills
  - trajectories/flip_banks/       Original Flip 100 Hz MotionBank bundles (show/tether json+npz)
  - gifs/<name>.gif                All 48 preview GIFs (19 robot-dog-motions + 29 Flip)
  - README.md                      Documentation & PlayGesture standing-only contract
"""
from __future__ import annotations

import json
import math
import shutil
import sys
from pathlib import Path
from typing import Any

import numpy as np

APP_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = APP_ROOT / "gesture"
RDM_ROOT = Path(r"C:\Users\99563\robot-dog-motions")
FLIP_ROOT = Path(r"D:\inovxio\brain\train\_external\flip-review-20261011")

sys.path.insert(0, str(RDM_ROOT / "src"))
from gesture_sparsify import (  # noqa: E402
    DT_MS,
    EPS_RAD,
    FPS,
    STANDING_POSE,
    intended_duration_ticks,
    sparsify,
)

MATRIX4_JOINT_ORDER = [
    "fr_hip_joint",
    "fr_thigh_joint",
    "fr_calf_joint",
    "fl_hip_joint",
    "fl_thigh_joint",
    "fl_calf_joint",
    "rr_hip_joint",
    "rr_thigh_joint",
    "rr_calf_joint",
    "rl_hip_joint",
    "rl_thigh_joint",
    "rl_calf_joint",
    "fr_foot_joint",
    "fl_foot_joint",
    "rr_foot_joint",
    "rl_foot_joint",
]

FLIP_NOMINAL_LEG_Q = np.array(
    [-0.1, -1.2, 2.7, 0.1, 1.2, -2.7, 0.1, 1.2, -2.7, -0.1, -1.2, 2.7],
    dtype=np.float64,
)
BRAINSTEM_STAND_LEG_Q = np.array(STANDING_POSE[:12], dtype=np.float64)

# Official Thunder V4 URDF leg joint limits in Matrix4 leg order [FR, FL, RR, RL]
LEG_LOWER = np.array(
    [-0.41, -3.14, 0.0, -0.41, 0.0, -3.14, -0.41, 0.0, -3.14, -0.41, -3.14, -3.14],
    dtype=np.float64,
)
LEG_UPPER = np.array(
    [0.41, 0.0, 3.14, 0.41, 3.14, 0.0, 0.41, 3.14, 3.14, 0.41, 0.0, 3.14],
    dtype=np.float64,
)
MAX_LEG_VEL_RAD_S = 17.48

FLIP_MOTION_BANK_SPECS: list[dict[str, str]] = [
    {
        "bank_key": "wiggle",
        "name": "wiggle",
        "title_zh": "后摆扭身",
        "family": "核心机身",
        "gif_src": "thunder_v4_wiggle.gif",
        "metric_src": "thunder_v4_wiggle_metrics.json",
        "brief": "后侧偏置的机身扭动，髋部偏移更明显，四轮保持接地。",
    },
    {
        "bank_key": "breathing_squat",
        "name": "breathing_squat",
        "title_zh": "呼吸下蹲",
        "family": "核心机身",
        "gif_src": "thunder_v4_breathing_squat.gif",
        "metric_src": "thunder_v4_breathing_squat_metrics.json",
        "brief": "平稳下压再回到站姿的垂直呼吸下蹲动作。",
    },
    {
        "bank_key": "body_sway",
        "name": "body_sway",
        "title_zh": "机身横摆",
        "family": "核心机身",
        "gif_src": "thunder_v4_body_sway.gif",
        "metric_src": "thunder_v4_body_sway_metrics.json",
        "brief": "左右机身平移并配合滚转的稳定横摆动作。",
    },
    {
        "bank_key": "side_dip",
        "name": "side_dip",
        "title_zh": "侧向压肩",
        "family": "核心机身",
        "gif_src": "thunder_v4_side_dip.gif",
        "metric_src": "thunder_v4_side_dip_metrics.json",
        "brief": "固定四轮支撑多边形内交替向左右压肩。",
    },
    {
        "bank_key": "body_circle",
        "name": "body_circle",
        "title_zh": "机身画圆",
        "family": "核心机身",
        "gif_src": "thunder_v4_body_circle.gif",
        "metric_src": "thunder_v4_body_circle_metrics.json",
        "brief": "机身沿闭环圆周移动，并联动横滚与俯仰。",
    },
    {
        "bank_key": "diagonal_curtsy",
        "name": "diagonal_curtsy",
        "title_zh": "对角屈身",
        "family": "核心机身",
        "gif_src": "thunder_v4_diagonal_curtsy.gif",
        "metric_src": "thunder_v4_diagonal_curtsy_metrics.json",
        "brief": "沿四个对角方向依次屈身行礼，带清晰滚转和俯仰。",
    },
    {
        "bank_key": "play_bow",
        "name": "flip_play_bow",
        "title_zh": "玩耍深鞠躬（长版）",
        "family": "核心机身",
        "gif_src": "thunder_v4_play_bow.gif",
        "metric_src": "thunder_v4_play_bow_metrics.json",
        "brief": "Flip 长时前伸深鞠躬后再进入反向俯仰伸展（与短版 play_bow 区分命名）。",
    },
    {
        "bank_key": "new_year_bow",
        "name": "new_year_bow",
        "title_zh": "拜年鞠躬",
        "family": "核心机身",
        "gif_src": "thunder_v4_new_year_bow.gif",
        "metric_src": "thunder_v4_new_year_bow_metrics.json",
        "brief": "连续三次独立拜年礼拜动作，平稳回到站姿。",
    },
    {
        "bank_key": "curious_peek",
        "name": "curious_peek",
        "title_zh": "好奇探头",
        "family": "核心机身",
        "gif_src": "thunder_v4_curious_peek.gif",
        "metric_src": "thunder_v4_curious_peek_metrics.json",
        "brief": "前向与侧向偏置交替出现的好奇探头动作。",
    },
    {
        "bank_key": "head_tilt",
        "name": "head_tilt",
        "title_zh": "歪头观察",
        "family": "核心机身",
        "gif_src": "thunder_v4_head_tilt.gif",
        "metric_src": "thunder_v4_head_tilt_metrics.json",
        "brief": "小幅交替横滚歪头，用于注意力和待机表情。",
    },
    {
        "bank_key": "happy_bounce",
        "name": "happy_bounce",
        "title_zh": "开心弹跳",
        "family": "核心机身",
        "gif_src": "thunder_v4_happy_bounce.gif",
        "metric_src": "thunder_v4_happy_bounce_metrics.json",
        "brief": "两次紧凑的俯仰与下蹲回弹。",
    },
    {
        "bank_key": "shake",
        "name": "shake",
        "title_zh": "快速甩身",
        "family": "舞台动作",
        "gif_src": "shake.gif",
        "metric_src": "shake.json",
        "brief": "快速横向甩身，用作舞台表情和节奏启动。",
    },
    {
        "bank_key": "figure8",
        "name": "figure8",
        "title_zh": "8字摆动",
        "family": "舞台动作",
        "gif_src": "figure8.gif",
        "metric_src": "figure8.json",
        "brief": "机身沿 8 字轨迹连续摆动，四轮保持接地。",
    },
    {
        "bank_key": "hip_pop",
        "name": "hip_pop",
        "title_zh": "髋部弹点",
        "family": "舞台动作",
        "gif_src": "hip_pop.gif",
        "metric_src": "hip_pop.json",
        "brief": "短促侧向髋部节拍重音动作。",
    },
    {
        "bank_key": "hello",
        "name": "hello",
        "title_zh": "你好问候",
        "family": "舞台动作",
        "gif_src": "hello.gif",
        "metric_src": "hello.json",
        "brief": "面向操作员和观众的友好问候机身动作。",
    },
    {
        "bank_key": "dance",
        "name": "dance",
        "title_zh": "组合舞蹈",
        "family": "舞台动作",
        "gif_src": "dance.gif",
        "metric_src": "dance.json",
        "brief": "由快速甩身、8字摆动、髋部弹点和开心弹跳组成的长时舞台组合舞蹈。",
    },
]

FLIP_DYNAMIC_SKILLS: list[dict[str, Any]] = [
    {
        "name": "front_paw_wave",
        "description": "前爪挥手",
        "family": "接触切换 (WBC)",
        "gif_src": "thunder_v4_front_paw_wave.gif",
        "gif": "gifs/front_paw_wave.gif",
        "artifact_npz": "docs/artifacts/paw_wave.npz",
        "artifact_json": "docs/artifacts/paw_wave.json",
        "metric_src": "thunder_v4_front_paw_wave_metrics.json",
        "execution_mode": "wbc_contact_choreography",
        "brief": "22 cm 抬爪、三次挥动、触地去抖与三足支撑 WBC 接触力切换轨迹。",
    },
    {
        "name": "march",
        "description": "原地踏步",
        "family": "接触切换 (WBC)",
        "gif_src": "march.gif",
        "gif": "gifs/march.gif",
        "artifact_npz": "docs/artifacts/march.npz",
        "artifact_json": "docs/artifacts/march.json",
        "metric_src": "march.json",
        "execution_mode": "wbc_contact_choreography",
        "brief": "四轮依次抬起 14.7 cm，每步先移重心再摆腿并确认触地的三足支撑 WBC 轨迹。",
    },
    {
        "name": "diag_step",
        "description": "对角节拍踏步",
        "family": "接触切换 (WBC)",
        "gif_src": "diag_trot.gif",
        "gif": "gifs/diag_step.gif",
        "artifact_npz": "docs/artifacts/diag_trot.npz",
        "artifact_json": "docs/artifacts/diag_trot.json",
        "metric_src": "diag_trot.json",
        "execution_mode": "wbc_contact_choreography",
        "brief": "FR->RL->FL->RR 逐轮对角节拍踏步，每个计划摆动段保持三轮支撑。",
    },
    {
        "name": "diag_trot",
        "description": "对角原地小跑（MPC实验）",
        "family": "动态接触 (MPC+WBC)",
        "gif_src": "trot.gif",
        "gif": "gifs/diag_trot.gif",
        "artifact_npz": "docs/artifacts/trot.npz",
        "artifact_json": "docs/artifacts/trot.json",
        "metric_src": "trot.json",
        "execution_mode": "mpc_wbc_dynamic",
        "brief": "FR+RL <-> FL+RR 同步双对角小跑轨迹（含精确接触事件与质心参考）。",
    },
    {
        "name": "contact_side",
        "description": "无力传感侧移",
        "family": "无力传感接触估计 (AMP/MPC+WBC)",
        "gif_src": "contact_side.gif",
        "gif": "gifs/contact_side.gif",
        "amp_npz": ["datasets/amp/side_l.npz"],
        "amp_json": ["datasets/amp/side_l.json"],
        "metric_src": "contact_side.json",
        "execution_mode": "mpc_wbc_contact_observer",
        "brief": "融合计划先验、编码器、IMU 与电流代理量的侧移轨迹（含 50 Hz 16-DOF AMP 数据集轨迹）。",
    },
    {
        "name": "contact_yaw",
        "description": "四轮原地偏航",
        "family": "轮式姿态与接触估计 (AMP/MPC+WBC)",
        "gif_src": "contact_yaw.gif",
        "gif": "gifs/contact_yaw.gif",
        "amp_npz": ["datasets/amp/yaw_l.npz", "datasets/amp/yaw_r.npz"],
        "amp_json": ["datasets/amp/yaw_l.json", "datasets/amp/yaw_r.json"],
        "metric_src": "contact_yaw.json",
        "execution_mode": "mpc_wbc_wheel_yaw",
        "brief": "四轮持续接地、IMU yaw-rate PI 调轮速的原地左/右偏航 16-DOF 轨迹。",
    },
    {
        "name": "turn360",
        "description": "对角踏步整圈转向 (360°)",
        "family": "动态接触与偏航 (MPC+WBC)",
        "gif_src": "turn360.gif",
        "gif": "gifs/turn360.gif",
        "metric_src": "turn360.json",
        "execution_mode": "closed_loop_turn_goal",
        "brief": "FR+RL <-> FL+RR 连续踏步整圈转向，TurnGoal 闭环提前减速并在四轮锁定窗口停止。",
    },
    {
        "name": "trot_yaw",
        "description": "对角踏步定速偏航",
        "family": "动态接触与偏航 (MPC+WBC)",
        "gif_src": "trot_yaw.gif",
        "gif": "gifs/trot_yaw.gif",
        "metric_src": "trot_yaw.json",
        "execution_mode": "closed_loop_yaw_rate",
        "brief": "对角踏步定速偏航闭环控制与多速率对比验证。",
    },
    {
        "name": "twist",
        "description": "Xbox 组合扭身",
        "family": "实时遥操作姿态 (WBC)",
        "gif_src": "twist.gif",
        "gif": "gifs/twist.gif",
        "metric_src": "twist.json",
        "execution_mode": "realtime_teleop_wbc",
        "brief": "右摇杆圆周同时驱动 roll 与 pitch 的 50 Hz QP 四轮支撑姿态控制。",
    },
]

FLIP_AUX_PREVIEWS: list[dict[str, str]] = [
    {"name": "trot_yaw_speeds", "gif_src": "trot_yaw_speeds.gif", "metric_src": "trot_yaw_speeds.json", "description": "对角踏步多偏航速率四宫格对比"},
    {"name": "xbox", "gif_src": "xbox.gif", "metric_src": "xbox.json", "description": "Xbox 手柄摇杆实时姿态映射预览"},
    {"name": "joy_pose", "gif_src": "joy_pose.gif", "metric_src": "", "description": "手柄俯仰/横滚姿态控制预览"},
    {"name": "joy_sway", "gif_src": "joy_sway.gif", "metric_src": "", "description": "手柄机身横摆控制预览"},
]


def _round_nested(val: Any, digits: int = 5) -> Any:
    if isinstance(val, (float, np.floating)):
        v = float(val)
        return 0.0 if abs(v) < 1e-12 else round(v, digits)
    if isinstance(val, (int, np.integer)):
        return int(val)
    if isinstance(val, np.ndarray):
        return _round_nested(val.tolist(), digits)
    if isinstance(val, list):
        return [_round_nested(x, digits) for x in val]
    if isinstance(val, dict):
        return {k: _round_nested(v, digits) for k, v in val.items()}
    return val


def _write_compact_trajectory_json(path: Path, payload: dict[str, Any]) -> None:
    """Write readable header + one-line-per-frame arrays so git diffs and file sizes stay clean."""
    path.write_text(
        json.dumps(_round_nested(payload, 5), ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    gifs_dir = OUT_DIR / "gifs"
    kf_dir = OUT_DIR / "keyframes"
    traj_dir = OUT_DIR / "trajectories"
    dyn_dir = traj_dir / "flip_dynamic"
    banks_dir = traj_dir / "flip_banks"
    for d in (gifs_dir, kf_dir, traj_dir, dyn_dir, banks_dir):
        d.mkdir(parents=True, exist_ok=True)

    # 1. Load robot-dog-motions catalog + keyframes + dense 50Hz matrix4 trajectories
    # Exclude stand-up utility clips (stand_up, wake_stand): standing up uses official StandUp / RobotRecovery.
    EXCLUDED_STAND_UP_GESTURES = {"stand_up", "wake_stand"}
    rdm_index = json.loads((RDM_ROOT / "gestures" / "index.json").read_text(encoding="utf-8"))
    catalog_gestures: list[dict[str, Any]] = []
    library_items: list[dict[str, Any]] = []

    for item in rdm_index["gestures"]:
        name = item["name"]
        if name in EXCLUDED_STAND_UP_GESTURES:
            continue
        kf_record = json.loads((RDM_ROOT / "gestures" / f"{name}.json").read_text(encoding="utf-8"))
        dense_traj = json.loads((RDM_ROOT / "trajectories_matrix4" / f"{name}.json").read_text(encoding="utf-8"))

        # Copy GIF
        src_gif = RDM_ROOT / "gifs" / f"{name}.gif"
        if not src_gif.is_file():
            raise FileNotFoundError(f"Missing robot-dog-motions GIF: {src_gif}")
        shutil.copy2(src_gif, gifs_dir / f"{name}.gif")

        standing_ok = kf_record["start_pose"] == "standing"
        kf_out = {
            **kf_record,
            "source": "robot-dog-motions",
            "standing_trigger_allowed": standing_ok,
            "grounded_trigger_allowed": False,
            "gif": f"gifs/{name}.gif",
            "trajectory_file": f"trajectories/{name}.json",
        }
        (kf_dir / f"{name}.json").write_text(
            json.dumps(kf_out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

        dense_out = {
            "name": name,
            "title": dense_traj.get("title", name),
            "title_zh": dense_traj.get("title_zh", kf_record["description"]),
            "description": kf_record["description"],
            "detail": dense_traj.get("description", ""),
            "source": "robot-dog-motions",
            "fps": 50,
            "dt": 0.02,
            "duration_s": dense_traj["duration_s"],
            "n_frames": dense_traj["n_frames"],
            "joint_order": MATRIX4_JOINT_ORDER,
            "joint_order_name": "matrix4",
            "start_pose": kf_record["start_pose"],
            "end_pose": kf_record["end_pose"],
            "standing_trigger_allowed": standing_ok,
            "grounded_trigger_allowed": False,
            "uses_wheels": kf_record["uses_wheels"],
            "playback": kf_record["playback"],
            "phases": dense_traj.get("phases", []),
            "sfx": dense_traj.get("sfx", []),
            "stats": dense_traj.get("stats", {}),
            "t": dense_traj["t"],
            "q": dense_traj["q"],
            "qd": dense_traj["qd"],
            "base_xyz": dense_traj["base_xyz"],
            "base_rpy": dense_traj["base_rpy"],
            "planted": dense_traj["planted"],
        }
        _write_compact_trajectory_json(traj_dir / f"{name}.json", dense_out)

        catalog_gestures.append(
            {
                "name": name,
                "description": kf_record["description"],
                "source": "robot-dog-motions",
                "family": "基础姿态与交互",
                "gif": f"gifs/{name}.gif",
                "file": f"keyframes/{name}.json",
                "trajectory_file": f"trajectories/{name}.json",
                "duration_ms": kf_record["duration_ms"],
                "fps": 50,
                "start_pose": kf_record["start_pose"],
                "end_pose": kf_record["end_pose"],
                "standing_trigger_allowed": standing_ok,
                "grounded_trigger_allowed": False,
                "uses_wheels": kf_record["uses_wheels"],
                "playback": kf_record["playback"],
                "n_keyframes": kf_record["n_keyframes"],
                "n_source_frames": kf_record["n_source_frames"],
                "max_replay_error_rad": kf_record["max_replay_error_rad"],
            }
        )
        library_items.append(
            {
                "name": name,
                "description": kf_record["description"],
                "keyframes": kf_record["keyframes"],
            }
        )

    # 2. Convert & merge Flip's 16 MotionBank continuous motions (100 Hz -> 50 Hz Brainstem Matrix4)
    show_npz = np.load(FLIP_ROOT / "banks" / "show.npz")
    show_manifest = json.loads((FLIP_ROOT / "banks" / "show.json").read_text(encoding="utf-8"))
    tether_manifest = json.loads((FLIP_ROOT / "banks" / "tether.json").read_text(encoding="utf-8"))
    show_meta_by_key = {m["name"]: m for m in show_manifest["motions"]}
    tether_meta_by_key = {m["name"]: m for m in tether_manifest["motions"]}

    # Copy original Flip MotionBank archives for lossless preservation
    for fname in ("show.json", "show.npz", "tether.json", "tether.npz"):
        shutil.copy2(FLIP_ROOT / "banks" / fname, banks_dir / fname)

    for spec in FLIP_MOTION_BANK_SPECS:
        bank_key = spec["bank_key"]
        name = spec["name"]
        title_zh = spec["title_zh"]

        pos_100 = np.asarray(show_npz[f"{bank_key}__positions_rad"], dtype=np.float64)
        vel_100 = np.asarray(show_npz[f"{bank_key}__velocities_rad_s"], dtype=np.float64)
        contact_100 = np.asarray(show_npz[f"{bank_key}__contact_masks"], dtype=np.uint8)

        # Verify Flip MotionBank starts and ends at FLIP_NOMINAL_LEG_Q
        start_err = float(np.max(np.abs(pos_100[0] - FLIP_NOMINAL_LEG_Q)))
        end_err = float(np.max(np.abs(pos_100[-1] - FLIP_NOMINAL_LEG_Q)))
        if start_err > 1e-4 or end_err > 1e-4:
            raise ValueError(f"Flip {bank_key} endpoint mismatch: start={start_err}, end={end_err}")

        # Downsample 100 Hz (dt=0.01s) -> 50 Hz (dt=0.02s); odd frame counts (e.g. 461) land cleanly on index -1
        indices = list(range(0, pos_100.shape[0], 2))
        if indices[-1] != pos_100.shape[0] - 1:
            indices.append(pos_100.shape[0] - 1)
        pos_50_leg = BRAINSTEM_STAND_LEG_Q[None, :] + (pos_100[indices] - FLIP_NOMINAL_LEG_Q[None, :])
        vel_50_leg = vel_100[indices]
        contact_50 = contact_100[indices]

        # Pin exact endpoints to Brainstem STANDING_POSE[:12]
        pos_50_leg[0] = BRAINSTEM_STAND_LEG_Q
        pos_50_leg[-1] = BRAINSTEM_STAND_LEG_Q

        # Verify URDF joint limits and velocity limits
        lower_margin = float(np.min(pos_50_leg - LEG_LOWER[None, :]))
        upper_margin = float(np.min(LEG_UPPER[None, :] - pos_50_leg))
        min_margin = min(lower_margin, upper_margin)
        if min_margin < 0.0:
            raise ValueError(f"Flip {name} exceeded Thunder V4 URDF joint limits: min_margin={min_margin:.4f} rad")
        max_qd = float(np.max(np.abs(vel_50_leg)))
        if max_qd > MAX_LEG_VEL_RAD_S:
            raise ValueError(f"Flip {name} exceeded leg velocity limit: max_qd={max_qd:.4f} rad/s")

        n_frames = pos_50_leg.shape[0]
        zeros_wheels = np.zeros((n_frames, 4), dtype=np.float64)
        q_50 = np.hstack([pos_50_leg, zeros_wheels])
        qd_50 = np.hstack([vel_50_leg, zeros_wheels])
        t_50 = [round(i * 0.02, 4) for i in range(n_frames)]

        frames_list = q_50.tolist()
        keyframes, sp_stats = sparsify(frames_list, eps_rad=EPS_RAD)
        duration_ms = intended_duration_ticks(keyframes) * DT_MS

        # Copy GIF normalized to <name>.gif
        src_gif = FLIP_ROOT / "docs" / "media" / spec["gif_src"]
        if not src_gif.is_file():
            raise FileNotFoundError(f"Missing Flip GIF: {src_gif}")
        shutil.copy2(src_gif, gifs_dir / f"{name}.gif")

        sim_metrics = json.loads((FLIP_ROOT / "docs" / "media" / spec["metric_src"]).read_text(encoding="utf-8"))

        kf_out = {
            "name": name,
            "description": title_zh,
            "source": "flip",
            "flip_bank_key": bank_key,
            "family": spec["family"],
            "brief": spec["brief"],
            "keyframes": _round_nested(keyframes, 6),
            "fps": FPS,
            "duration_ms": duration_ms,
            "start_pose": "standing",
            "end_pose": "standing",
            "standing_trigger_allowed": True,
            "grounded_trigger_allowed": False,
            "uses_wheels": False,
            "playback": "joint_lerp",
            "n_source_frames": sp_stats["n_source_frames"],
            "n_keyframes": sp_stats["n_keyframes"],
            "max_replay_error_rad": sp_stats["max_replay_error_rad"],
            "min_urdf_joint_margin_rad": round(min_margin, 5),
            "max_leg_qd_rad_s": round(max_qd, 5),
            "gif": f"gifs/{name}.gif",
            "trajectory_file": f"trajectories/{name}.json",
        }
        (kf_dir / f"{name}.json").write_text(
            json.dumps(kf_out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

        dense_out = {
            "name": name,
            "flip_bank_key": bank_key,
            "title_zh": title_zh,
            "description": title_zh,
            "detail": spec["brief"],
            "source": "flip",
            "family": spec["family"],
            "fps": 50,
            "dt": 0.02,
            "duration_s": round((n_frames - 1) * 0.02, 4),
            "n_frames": n_frames,
            "joint_order": MATRIX4_JOINT_ORDER,
            "joint_order_name": "matrix4",
            "start_pose": "standing",
            "end_pose": "standing",
            "standing_trigger_allowed": True,
            "grounded_trigger_allowed": False,
            "uses_wheels": False,
            "playback": "joint_lerp",
            "anchor_conversion": {
                "method": "leg_delta_from_flip_nominal_to_brainstem_stand",
                "flip_nominal_leg_q": FLIP_NOMINAL_LEG_Q.tolist(),
                "brainstem_standing_pose": STANDING_POSE,
                "source_bank": "trajectories/flip_banks/show.npz",
                "tether_bank": "trajectories/flip_banks/tether.npz",
            },
            "stats": {
                "n_frames": n_frames,
                "duration_s": round((n_frames - 1) * 0.02, 4),
                "min_joint_margin_rad": round(min_margin, 5),
                "max_abs_leg_qd_rad_s": round(max_qd, 5),
                "flip_show_bank_meta": show_meta_by_key.get(bank_key, {}),
                "flip_tether_bank_meta": tether_meta_by_key.get(bank_key, {}),
                "mujoco_sim_metrics": sim_metrics,
            },
            "t": t_50,
            "q": q_50,
            "qd": qd_50,
            "planted": contact_50.astype(bool).tolist(),
        }
        _write_compact_trajectory_json(traj_dir / f"{name}.json", dense_out)

        catalog_gestures.append(
            {
                "name": name,
                "description": title_zh,
                "source": "flip",
                "flip_bank_key": bank_key,
                "family": spec["family"],
                "gif": f"gifs/{name}.gif",
                "file": f"keyframes/{name}.json",
                "trajectory_file": f"trajectories/{name}.json",
                "duration_ms": duration_ms,
                "fps": 50,
                "start_pose": "standing",
                "end_pose": "standing",
                "standing_trigger_allowed": True,
                "grounded_trigger_allowed": False,
                "uses_wheels": False,
                "playback": "joint_lerp",
                "n_keyframes": sp_stats["n_keyframes"],
                "n_source_frames": sp_stats["n_source_frames"],
                "max_replay_error_rad": sp_stats["max_replay_error_rad"],
                "min_joint_margin_rad": round(min_margin, 5),
            }
        )
        library_items.append(
            {
                "name": name,
                "description": title_zh,
                "keyframes": _round_nested(keyframes, 6),
            }
        )

    # 3. Export Flip's 9 WBC/MPC/AMP/teleop dynamic skills + trajectories + GIFs
    catalog_dynamic: list[dict[str, Any]] = []
    for skill in FLIP_DYNAMIC_SKILLS:
        name = skill["name"]
        src_gif = FLIP_ROOT / "docs" / "media" / skill["gif_src"]
        if not src_gif.is_file():
            raise FileNotFoundError(f"Missing Flip dynamic GIF: {src_gif}")
        shutil.copy2(src_gif, OUT_DIR / skill["gif"])

        metrics = json.loads((FLIP_ROOT / "docs" / "media" / skill["metric_src"]).read_text(encoding="utf-8"))
        dyn_payload: dict[str, Any] = {
            "name": name,
            "description": skill["description"],
            "source": "flip",
            "family": skill["family"],
            "execution_mode": skill["execution_mode"],
            "open_loop_keyframe_playable": False,
            "standing_trigger_allowed": False,
            "grounded_trigger_allowed": False,
            "brief": skill["brief"],
            "gif": skill["gif"],
            "mujoco_metrics": metrics,
        }

        if "artifact_npz" in skill:
            z = np.load(FLIP_ROOT / skill["artifact_npz"])
            art_meta = json.loads((FLIP_ROOT / skill["artifact_json"]).read_text(encoding="utf-8"))
            pos = np.asarray(z["positions_rad"], dtype=np.float64)
            vel = np.asarray(z["velocities_rad_s"], dtype=np.float64)
            # Artifacts are 100 Hz choreography clips; store 50 Hz downsampled trajectory + full metadata
            idx = list(range(0, pos.shape[0], 2))
            if idx[-1] != pos.shape[0] - 1:
                idx.append(pos.shape[0] - 1)
            dyn_payload["artifact_metadata"] = art_meta
            dyn_payload["trajectory_50hz"] = {
                "fps": 50,
                "dt": 0.02,
                "n_frames": len(idx),
                "leg_joint_order": MATRIX4_JOINT_ORDER[:12],
                "positions_rad": pos[idx],
                "velocities_rad_s": vel[idx],
                "body_position_offsets_m": np.asarray(z["body_position_offsets_m"])[idx],
                "body_rpy_offsets_rad": np.asarray(z["body_rpy_offsets_rad"])[idx],
                "wheel_center_offsets_m": np.asarray(z["wheel_center_offsets_m"])[idx],
                "contact_modes": np.asarray(z["contact_modes"])[idx].tolist(),
            }
        elif "amp_npz" in skill:
            clips_data = []
            for npz_rel, json_rel in zip(skill["amp_npz"], skill["amp_json"]):
                z = np.load(FLIP_ROOT / npz_rel)
                meta = json.loads((FLIP_ROOT / json_rel).read_text(encoding="utf-8"))
                clips_data.append(
                    {
                        "clip": Path(npz_rel).stem,
                        "fps": int(z["fps"]),
                        "dof_names": [str(x) for x in z["dof_names"].tolist()],
                        "n_frames": int(z["dof_positions"].shape[0]),
                        "time_s": z["time_s"],
                        "dof_positions": z["dof_positions"],
                        "dof_velocities": z["dof_velocities"],
                        "body_positions": z["body_positions"],
                        "body_rotations": z["body_rotations"],
                        "metadata": meta,
                    }
                )
            dyn_payload["amp_rollouts"] = clips_data

        dyn_rel = f"trajectories/flip_dynamic/{name}.json"
        _write_compact_trajectory_json(dyn_dir / f"{name}.json", dyn_payload)

        catalog_dynamic.append(
            {
                "name": name,
                "description": skill["description"],
                "source": "flip",
                "family": skill["family"],
                "execution_mode": skill["execution_mode"],
                "gif": skill["gif"],
                "trajectory_file": dyn_rel,
                "open_loop_keyframe_playable": False,
                "standing_trigger_allowed": False,
                "grounded_trigger_allowed": False,
                "duration_s": round(
                    float(metrics.get("simulated_duration_s", metrics.get("duration_s", 0.0))), 2
                ),
            }
        )

    # 4. Copy Flip's 4 auxiliary teleop / comparison GIFs & metrics
    catalog_aux: list[dict[str, Any]] = []
    for aux in FLIP_AUX_PREVIEWS:
        name = aux["name"]
        shutil.copy2(FLIP_ROOT / "docs" / "media" / aux["gif_src"], gifs_dir / f"{name}.gif")
        metric_rel = None
        if aux["metric_src"]:
            metric_data = json.loads((FLIP_ROOT / "docs" / "media" / aux["metric_src"]).read_text(encoding="utf-8"))
            metric_rel = f"trajectories/flip_dynamic/{name}.json"
            _write_compact_trajectory_json(dyn_dir / f"{name}.json", metric_data)
        catalog_aux.append(
            {
                "name": name,
                "description": aux["description"],
                "source": "flip",
                "gif": f"gifs/{name}.gif",
                "metrics_file": metric_rel,
            }
        )

    # 5. Write library.json and index.json
    (OUT_DIR / "library.json").write_text(
        json.dumps(library_items, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    standing_count = sum(1 for g in catalog_gestures if g["standing_trigger_allowed"])
    unified_index = {
        "model": "thunder_v4",
        "fps": FPS,
        "dt_ms": DT_MS,
        "pose_order": "matrix4",
        "pose_order_detail": "16 joints: FR/FL/RR/RL hip, thigh, calf, then FR/FL/RR/RL wheels",
        "standing_pose": STANDING_POSE,
        "epsilon_rad": EPS_RAD,
        "play_gesture_policy": {
            "required_fsm_state": "standing",
            "grounded_allowed": False,
            "motor_output_required": True,
            "grpc_lease_must_be_inactive": True,
            "excluded_stand_up_gestures": ["stand_up", "wake_stand"],
            "notes": (
                "PlayGesture strictly requires fsmKind === 'standing' (Grounded is disallowed). "
                "Stand-up utility clips (stand_up, wake_stand) are removed so all 35 keyframe gestures "
                "start at standing; standing up uses official StandUp / RobotRecovery."
            ),
        },
        "counts": {
            "keyframe_gestures_total": len(catalog_gestures),
            "keyframe_gestures_standing_playable": standing_count,
            "robot_dog_motions_gestures": sum(1 for g in catalog_gestures if g["source"] == "robot-dog-motions"),
            "flip_motion_bank_gestures": len(FLIP_MOTION_BANK_SPECS),
            "flip_dynamic_skills": len(catalog_dynamic),
            "flip_aux_previews": len(catalog_aux),
            "gifs_total": len(list(gifs_dir.glob("*.gif"))),
        },
        "gestures": catalog_gestures,
        "dynamic_skills": catalog_dynamic,
        "auxiliary_previews": catalog_aux,
    }
    (OUT_DIR / "index.json").write_text(
        json.dumps(unified_index, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    # 6. Write README.md
    lines = [
        "# Thunder V4 合并动作库 (`gesture/`)",
        "",
        "本目录合并了 **Thunder V4** 两套站姿动作资产（已剔除起立类动作 `stand_up`、`wake_stand`，起立统一走官方 `StandUp` / `RobotRecovery`）：",
        "",
        "1. **`robot-dog-motions`（19 个站姿起动作）**：50 Hz `Matrix4` 关节轨迹、Brainstem 稀疏关键帧与预览 GIF。",
        "2. **`Flip`（16 个四轮接地连续舞台动作 + 9 个 WBC/MPC/AMP 动态技能 + 4 个遥操作/对比预览，共 29 个 GIF）**：",
        "   - 16 个四轮连续动作已从 Flip `NOMINAL_LEG_Q` 增量锚定转换至官方 Brainstem `STANDING_POSE`，通过 Thunder V4 URDF 关节限位与角速度校验，并压缩为 50 Hz 稀疏关键帧（`max_replay_error_rad <= 0.01 rad`），同时完整保留原始 100 Hz `show.npz` / `tether.npz`。",
        "   - 短版 `play_bow`（3.20 s，来自 `robot-dog-motions`）保留原名 `play_bow`；Flip 长版深鞠躬（16.00 s）命名为 `flip_play_bow`。",
        "   - 9 个需闭环 WBC / MPC / 接触估计器的动态技能单独归档于 `trajectories/flip_dynamic/`，标记 `open_loop_keyframe_playable: false`，不混入开环关键帧直放列表。",
        "",
        "## `PlayGesture` 触发安全约束",
        "",
        "- **严格禁止 `grounded`（趴地）状态触发 `PlayGesture`**：App（TypeScript 会话、Android 原生 `ControlSession.kt`、Web LAN Bridge `devLanBridge.js`、本地仿真器 `localBrainstemSimServer.js`）均强制要求 `fsmKind === 'standing'`、`motorOutputEnabled === true` 且无活跃行走租约（`!grpcLeaseActive`）。",
        "- 起立类动作（`stand_up`、`wake_stand`）已从动作库移除，库内全部 **35 个**关键帧动作均为 `standing` 起始。",
        "",
        "## 目录结构",
        "",
        "- `index.json`：统一动作目录（35 个站姿关键帧动作 + 9 个动态技能 + 4 个辅助预览）。",
        "- `library.json`：Brainstem `GestureLibrary.loadFromJson` 标准数组（35 个稀疏关键帧动作）。",
        "- `keyframes/<name>.json`：单动作 50 Hz 稀疏关键帧文件（35 个）。",
        "- `trajectories/<name>.json`：单动作 50 Hz `Matrix4` 16 自由度稠密轨迹（35 个）。",
        "- `trajectories/flip_banks/`：Flip 原始 100 Hz MotionBank（`show.npz`、`tether.npz` 及清单）。",
        "- `trajectories/flip_dynamic/*.json`：Flip 动态接触/WBC/MPC/AMP 稠密轨迹与仿真指标。",
        "- `gifs/*.gif`：全部 **48** 个动作预览 GIF。",
        "",
        "## 1. Brainstem 50 Hz 关键帧动作清单（35 个）",
        "",
        "| # | 动作 ID | 中文名 | 来源 | 时长 (ms) | 关键帧数 | 起始→结束姿态 | Standing 可触发 | GIF |",
        "|---:|---|---|---|---:|---:|---|---|---|",
    ]
    for idx, g in enumerate(catalog_gestures, 1):
        trig = "是" if g["standing_trigger_allowed"] else "否（非站姿起）"
        lines.append(
            f"| {idx} | `{g['name']}` | {g['description']} | `{g['source']}` | {g['duration_ms']} | {g['n_keyframes']} | `{g['start_pose']} -> {g['end_pose']}` | {trig} | `{g['gif']}` |"
        )
    lines += [
        "",
        "## 2. Flip 闭环动态 / 接触切换技能归档（9 个）",
        "",
        "| # | 技能 ID | 中文名 | 控制器模式 | 仿真时长 (s) | 轨迹/指标文件 | GIF |",
        "|---:|---|---|---|---:|---|---|",
    ]
    for idx, d in enumerate(catalog_dynamic, 1):
        lines.append(
            f"| {idx} | `{d['name']}` | {d['description']} | `{d['execution_mode']}` | {d['duration_s']} | `{d['trajectory_file']}` | `{d['gif']}` |"
        )
    lines.append("")
    (OUT_DIR / "README.md").write_text("\n".join(lines), encoding="utf-8")

    total_bytes = sum(p.stat().st_size for p in OUT_DIR.rglob("*") if p.is_file())
    print(
        f"Built {OUT_DIR}: {len(catalog_gestures)} keyframe gestures ({standing_count} standing-playable), "
        f"{len(catalog_dynamic)} dynamic skills, {len(list(gifs_dir.glob('*.gif')))} GIFs, "
        f"total size = {total_bytes / (1024 * 1024):.2f} MB"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
