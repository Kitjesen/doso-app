"""Exercise movement, turning and dead-man stop against the real local sim."""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

import grpc


def observer(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=2) as response:  # noqa: S310
        return json.load(response)


def run(args: argparse.Namespace) -> int:
    sys.path.insert(0, str(Path(args.api_root).resolve()))
    import brainstem_api as api  # pylint: disable=import-outside-toplevel
    from brainstem_api import cms_pb2  # pylint: disable=import-outside-toplevel

    channel = grpc.insecure_channel(args.brainstem)
    grpc.channel_ready_future(channel).result(timeout=5)
    stub = api.RobotControlStub(channel)
    before = observer(args.observer)
    if not before.get("ready") or before.get("fsmState") not in ("standing", "walking"):
        raise RuntimeError(f"simulation is not motion-ready: {before.get('fsmState')}")

    lease = stub.AcquireControl(cms_pb2.AcquireControlRequest(client_id="doso-local-verifier"))
    if not lease.accepted:
        raise RuntimeError(f"control lease rejected: {lease.reason}")
    token = lease.token
    sequence = 0

    def command(x: float, y: float, yaw: float, duration: float) -> list[dict[str, Any]]:
        nonlocal sequence
        samples: list[dict[str, Any]] = []
        deadline = time.monotonic() + duration
        while time.monotonic() < deadline:
            sequence += 1
            ack = stub.WalkChecked(
                cms_pb2.WalkRequest(
                    token=token,
                    sequence=sequence,
                    direction=api.Vector3(x=x, y=y, z=yaw),
                ),
                timeout=1,
            )
            if not ack.accepted:
                raise RuntimeError(f"WalkChecked {sequence} rejected: {ack.reason}")
            samples.append(observer(args.observer))
            time.sleep(0.05)
        return samples

    try:
        command(0.0, 0.0, 0.0, 0.12)
        forward = command(0.25, 0.0, 0.0, 1.5)
        turning = command(0.0, 0.0, 0.5, 2.0)
        stopped = command(0.0, 0.0, 0.0, 1.0)
    finally:
        try:
            sequence += 1
            stub.WalkChecked(
                cms_pb2.WalkRequest(
                    token=token,
                    sequence=sequence,
                    direction=api.Vector3(),
                ),
                timeout=1,
            )
            stub.ReleaseControl(cms_pb2.ControlLeaseRequest(token=token), timeout=1)
        finally:
            channel.close()

    after = observer(args.observer)
    forward_desired = max(abs(float(s["desiredVelocity"]["x"])) for s in forward)
    turn_desired = max(abs(float(s["desiredVelocity"]["z"])) for s in turning)
    stop_desired = max(
        max(abs(float(v)) for v in s["desiredVelocity"].values()) for s in stopped[-5:]
    )
    displacement = ((after["pose"]["x"] - before["pose"]["x"]) ** 2 +
                    (after["pose"]["y"] - before["pose"]["y"]) ** 2) ** 0.5
    yaw_change = abs(float(after["pose"]["yaw"]) - float(before["pose"]["yaw"]))
    speed_after_stop = max(abs(float(v)) for v in after["velocity"].values())
    report = {
        "schemaVersion": 1,
        "simulationOnly": True,
        "source": after["source"],
        "instanceId": after["instanceId"],
        "forwardDesiredPeak": forward_desired,
        "turnDesiredPeak": turn_desired,
        "stopDesiredPeak": stop_desired,
        "physicalDisplacement": displacement,
        "physicalYawChange": yaw_change,
        "physicalSpeedAfterStop": speed_after_stop,
        "fsmState": after["fsmState"],
        "accepted": {
            "movement": forward_desired >= 0.2,
            "turn": turn_desired >= 0.45,
            "stop": stop_desired <= 1e-9,
            "physicalMovement": displacement >= 0.02,
            "physicalTurn": yaw_change >= 0.003,
            "physicalStop": speed_after_stop <= 0.05,
        },
    }
    print(json.dumps(report, indent=2))
    return 0 if all(report["accepted"].values()) else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--brainstem", default="127.0.0.1:13147")
    parser.add_argument(
        "--observer", default="http://127.0.0.1:13148/api/v1/simulation/state"
    )
    parser.add_argument(
        "--api-root", default=r"D:\inovxio\brain\brainstem\brainstem_api\python"
    )
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(run(parse_args()))
