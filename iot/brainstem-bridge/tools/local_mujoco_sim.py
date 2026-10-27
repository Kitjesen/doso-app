"""Real MuJoCo + Brainstem closed loop for DOSO local development."""

from __future__ import annotations

import argparse
import json
import math
import signal
import sys
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import grpc
import mujoco
import numpy as np


DOF_POS = [7, 8, 9, 11, 12, 13, 15, 16, 17, 19, 20, 21, 10, 14, 18, 22]
DOF_VEL = [6, 7, 8, 10, 11, 12, 14, 15, 16, 18, 19, 20, 9, 13, 17, 21]
CMS_GROUNDED = 1
CMS_STANDING = 2
CMS_WALKING = 3


class SimulationState:
    def __init__(self, instance_id: str) -> None:
        self.instance_id = instance_id
        self.lock = threading.Lock()
        self.snapshot: dict[str, Any] = {
            "schemaVersion": 1,
            "simulationOnly": True,
            "source": "brainstem.local-simulation",
            "instanceId": instance_id,
            "engine": "mujoco",
            "ready": False,
            "fsmState": "starting",
            "pose": {"x": 0.0, "y": 0.0, "yaw": 0.0},
            "velocity": {"x": 0.0, "y": 0.0, "z": 0.0},
            "desiredVelocity": {"x": 0.0, "y": 0.0, "z": 0.0},
            "simTime": 0.0,
            "history": [],
        }

    def replace(self, snapshot: dict[str, Any]) -> None:
        with self.lock:
            self.snapshot = snapshot

    def copy(self) -> dict[str, Any]:
        with self.lock:
            return json.loads(json.dumps(self.snapshot))


class ObserverHandler(BaseHTTPRequestHandler):
    state: SimulationState

    def do_GET(self) -> None:  # noqa: N802
        if self.path not in ("/state", "/api/v1/simulation/state"):
            self.send_error(404)
            return
        body = json.dumps(self.state.copy(), separators=(",", ":")).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        return


def quaternion_yaw(qpos: np.ndarray) -> float:
    w, x, y, z = (float(value) for value in qpos[3:7])
    return math.atan2(2.0 * (w * z + x * y), 1.0 - 2.0 * (y * y + z * z))


def build_sim_state(api: Any, data: mujoco.MjData, elapsed: float) -> Any:
    orientation = data.sensor("orientation").data
    gyro = data.sensor("angular-velocity").data
    seconds = int(elapsed)
    return api.SimState(
        gyroscope=api.Vector3(x=float(gyro[0]), y=float(gyro[1]), z=float(gyro[2])),
        quaternion=api.Quaternion(
            w=float(orientation[0]),
            x=float(orientation[1]),
            y=float(orientation[2]),
            z=float(orientation[3]),
        ),
        joint_position=api.Matrix4(values=[float(v) for v in data.qpos[DOF_POS]]),
        joint_velocity=api.Matrix4(values=[float(v) for v in data.qvel[DOF_VEL]]),
        timestamp=api.Duration(
            seconds=seconds,
            nanos=int((elapsed - seconds) * 1_000_000_000),
        ),
    )


def fsm_name(kind: int) -> str:
    return {
        0: "zero",
        CMS_GROUNDED: "grounded",
        CMS_STANDING: "standing",
        CMS_WALKING: "walking",
        4: "transitioning",
    }.get(kind, f"unknown:{kind}")


def run(args: argparse.Namespace) -> int:
    sys.path.insert(0, str(Path(args.api_root).resolve()))
    import brainstem_api as api  # pylint: disable=import-outside-toplevel

    stop = threading.Event()
    state = SimulationState(args.instance_id)
    ObserverHandler.state = state
    observer = ThreadingHTTPServer(("127.0.0.1", args.observer_port), ObserverHandler)
    observer_thread = threading.Thread(target=observer.serve_forever, daemon=True)
    observer_thread.start()

    def request_stop(_signum: int | None = None, _frame: object | None = None) -> None:
        stop.set()

    signal.signal(signal.SIGINT, request_stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, request_stop)

    channel = grpc.insecure_channel(f"127.0.0.1:{args.brainstem_port}")
    grpc.channel_ready_future(channel).result(timeout=30)
    stub = api.RobotControlStub(channel)
    model = mujoco.MjModel.from_xml_path(str(Path(args.xml).resolve()))
    model.opt.timestep = args.timestep
    data = mujoco.MjData(model)
    data.qpos[:3] = [0.0, 0.0, 0.15]
    data.qpos[3:7] = [1.0, 0.0, 0.0, 0.0]
    data.qpos[DOF_POS] = np.zeros(16)
    data.qvel[:] = 0.0
    mujoco.mj_forward(model, data)

    target = np.zeros(16, dtype=np.float64)
    kp = np.zeros(16, dtype=np.float64)
    kd = np.zeros(16, dtype=np.float64)
    trajectory: deque[dict[str, float]] = deque(maxlen=240)
    standup_sent = False
    ready_announced = False
    step_index = 0
    next_wall = time.perf_counter()

    try:
        while not stop.is_set() and not Path(args.stop_file).exists():
            if step_index % args.decimation == 0:
                stub.Step(build_sim_state(api, data, float(data.time)), timeout=1.0)
                cms = stub.GetCmsState(api.Empty(), timeout=1.0)
                if cms.kind == CMS_GROUNDED and not standup_sent:
                    stub.StandUp(api.Empty(), timeout=1.0)
                    standup_sent = True
                history = stub.Tick(api.Empty(), timeout=2.0)
                if len(history.next_action.values) == 16:
                    target = np.asarray(history.next_action.values, dtype=np.float64)
                if len(history.kp.values) == 16:
                    kp = np.asarray(history.kp.values, dtype=np.float64)
                if len(history.kd.values) == 16:
                    kd = np.asarray(history.kd.values, dtype=np.float64)
                desired = history.command.walk if history.command.HasField("walk") else api.Vector3()
                ready = cms.kind in (CMS_STANDING, CMS_WALKING)
                if ready and not ready_announced:
                    print(
                        f"READY observer=http://127.0.0.1:{args.observer_port}/state "
                        f"instanceId={args.instance_id} fsm={fsm_name(cms.kind)}",
                        flush=True,
                    )
                    ready_announced = True
                trajectory.append(
                    {
                        "t": round(float(data.time), 4),
                        "x": round(float(data.qpos[0]), 6),
                        "y": round(float(data.qpos[1]), 6),
                        "yaw": round(quaternion_yaw(data.qpos), 6),
                        "vx": round(float(data.qvel[0]), 6),
                        "vy": round(float(data.qvel[1]), 6),
                        "yawRate": round(float(data.qvel[5]), 6),
                        "desiredX": round(float(desired.x), 6),
                        "desiredY": round(float(desired.y), 6),
                        "desiredYaw": round(float(desired.z), 6),
                    }
                )
                state.replace(
                    {
                        "schemaVersion": 1,
                        "simulationOnly": True,
                        "source": "brainstem.local-simulation",
                        "instanceId": args.instance_id,
                        "engine": "mujoco",
                        "ready": ready,
                        "fsmState": fsm_name(cms.kind),
                        "pose": {
                            "x": float(data.qpos[0]),
                            "y": float(data.qpos[1]),
                            "yaw": quaternion_yaw(data.qpos),
                        },
                        "velocity": {
                            "x": float(data.qvel[0]),
                            "y": float(data.qvel[1]),
                            "z": float(data.qvel[5]),
                        },
                        "desiredVelocity": {
                            "x": float(desired.x),
                            "y": float(desired.y),
                            "z": float(desired.z),
                        },
                        "simTime": float(data.time),
                        "jointPosition": [float(v) for v in data.qpos[DOF_POS]],
                        "jointVelocity": [float(v) for v in data.qvel[DOF_VEL]],
                        "history": list(trajectory),
                    }
                )

            q = np.asarray(data.qpos[DOF_POS], dtype=np.float64)
            dq = np.asarray(data.qvel[DOF_VEL], dtype=np.float64)
            torque = kp * (target - q) - kd * dq
            data.ctrl[:] = np.clip(torque, -120.0, 120.0)
            mujoco.mj_step(model, data)
            step_index += 1
            if args.realtime:
                next_wall += args.timestep
                delay = next_wall - time.perf_counter()
                if delay > 0:
                    time.sleep(delay)
    finally:
        stop.set()
        observer.shutdown()
        observer.server_close()
        observer_thread.join(timeout=2.0)
        channel.close()
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--brainstem-port", type=int, default=13147)
    parser.add_argument("--observer-port", type=int, default=13148)
    parser.add_argument("--instance-id", required=True)
    parser.add_argument("--stop-file", required=True)
    parser.add_argument("--api-root", required=True)
    parser.add_argument("--xml", required=True)
    parser.add_argument("--timestep", type=float, default=0.005)
    parser.add_argument("--decimation", type=int, default=4)
    parser.add_argument("--realtime", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(run(parse_args()))
