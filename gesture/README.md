# Thunder V4 合并动作库 (`gesture/`)

本目录合并了 **Thunder V4** 两套站姿动作资产（已剔除起立类动作 `stand_up`、`wake_stand`，起立统一走官方 `StandUp` / `RobotRecovery`）：

1. **`robot-dog-motions`（19 个站姿起动作）**：50 Hz `Matrix4` 关节轨迹、Brainstem 稀疏关键帧与预览 GIF。
2. **`Flip`（16 个四轮接地连续舞台动作 + 9 个 WBC/MPC/AMP 动态技能 + 4 个遥操作/对比预览，共 29 个 GIF）**：
   - 16 个四轮连续动作已从 Flip `NOMINAL_LEG_Q` 增量锚定转换至官方 Brainstem `STANDING_POSE`，通过 Thunder V4 URDF 关节限位与角速度校验，并压缩为 50 Hz 稀疏关键帧（`max_replay_error_rad <= 0.01 rad`），同时完整保留原始 100 Hz `show.npz` / `tether.npz`。
   - 短版 `play_bow`（3.20 s，来自 `robot-dog-motions`）保留原名 `play_bow`；Flip 长版深鞠躬（16.00 s）命名为 `flip_play_bow`。
   - 9 个需闭环 WBC / MPC / 接触估计器的动态技能单独归档于 `trajectories/flip_dynamic/`，标记 `open_loop_keyframe_playable: false`，不混入开环关键帧直放列表。

## `PlayGesture` 触发安全约束

- **严格禁止 `grounded`（趴地）状态触发 `PlayGesture`**：App（TypeScript 会话、Android 原生 `ControlSession.kt`、Web LAN Bridge `devLanBridge.js`、本地仿真器 `localBrainstemSimServer.js`）均强制要求 `fsmKind === 'standing'`、`motorOutputEnabled === true` 且无活跃行走租约（`!grpcLeaseActive`）。
- 起立类动作（`stand_up`、`wake_stand`）已从动作库移除，库内全部 **35 个**关键帧动作均为 `standing` 起始。

## 目录结构

- `index.json`：统一动作目录（35 个站姿关键帧动作 + 9 个动态技能 + 4 个辅助预览）。
- `library.json`：Brainstem `GestureLibrary.loadFromJson` 标准数组（35 个稀疏关键帧动作）。
- `keyframes/<name>.json`：单动作 50 Hz 稀疏关键帧文件（35 个）。
- `trajectories/<name>.json`：单动作 50 Hz `Matrix4` 16 自由度稠密轨迹（35 个）。
- `trajectories/flip_banks/`：Flip 原始 100 Hz MotionBank（`show.npz`、`tether.npz` 及清单）。
- `trajectories/flip_dynamic/*.json`：Flip 动态接触/WBC/MPC/AMP 稠密轨迹与仿真指标。
- `gifs/*.gif`：全部 **48** 个动作预览 GIF。

## 1. Brainstem 50 Hz 关键帧动作清单（35 个）

| # | 动作 ID | 中文名 | 来源 | 时长 (ms) | 关键帧数 | 起始→结束姿态 | Standing 可触发 | GIF |
|---:|---|---|---|---:|---:|---|---|---|
| 1 | `stand_idle` | 原地待命 | `robot-dog-motions` | 4020 | 6 | `standing -> standing` | 是 | `gifs/stand_idle.gif` |
| 2 | `sit` | 坐下 | `robot-dog-motions` | 2820 | 15 | `standing -> sitting` | 是 | `gifs/sit.gif` |
| 3 | `lie_down` | 趴下 | `robot-dog-motions` | 3220 | 19 | `standing -> lying` | 是 | `gifs/lie_down.gif` |
| 4 | `sit_wait` | 坐姿待命 | `robot-dog-motions` | 6220 | 25 | `standing -> sitting` | 是 | `gifs/sit_wait.gif` |
| 5 | `ready_alert` | 警戒就绪 | `robot-dog-motions` | 3620 | 15 | `standing -> standing` | 是 | `gifs/ready_alert.gif` |
| 6 | `stretch` | 伸懒腰 | `robot-dog-motions` | 4820 | 36 | `standing -> standing` | 是 | `gifs/stretch.gif` |
| 7 | `sit_greet` | 坐下打招呼 | `robot-dog-motions` | 7560 | 70 | `standing -> sitting` | 是 | `gifs/sit_greet.gif` |
| 8 | `greet_stand` | 站立打招呼 | `robot-dog-motions` | 9200 | 59 | `standing -> standing` | 是 | `gifs/greet_stand.gif` |
| 9 | `offer_paw` | 站立伸爪 | `robot-dog-motions` | 4820 | 37 | `standing -> standing` | 是 | `gifs/offer_paw.gif` |
| 10 | `nod_yes` | 点头同意 | `robot-dog-motions` | 4020 | 29 | `standing -> standing` | 是 | `gifs/nod_yes.gif` |
| 11 | `shake_no` | 摇头拒绝 | `robot-dog-motions` | 3620 | 36 | `standing -> standing` | 是 | `gifs/shake_no.gif` |
| 12 | `play_bow` | 玩耍鞠躬 | `robot-dog-motions` | 3220 | 25 | `standing -> standing` | 是 | `gifs/play_bow.gif` |
| 13 | `celebrate` | 庆祝 | `robot-dog-motions` | 3220 | 91 | `standing -> standing` | 是 | `gifs/celebrate.gif` |
| 14 | `shake_body` | 抖毛 | `robot-dog-motions` | 3220 | 47 | `standing -> standing` | 是 | `gifs/shake_body.gif` |
| 15 | `curious_look` | 好奇张望 | `robot-dog-motions` | 4020 | 34 | `standing -> standing` | 是 | `gifs/curious_look.gif` |
| 16 | `look_back` | 回头看 | `robot-dog-motions` | 4020 | 17 | `standing -> standing` | 是 | `gifs/look_back.gif` |
| 17 | `inspect_down` | 低头查看 | `robot-dog-motions` | 4020 | 31 | `standing -> standing` | 是 | `gifs/inspect_down.gif` |
| 18 | `listen_tilt` | 侧耳倾听 | `robot-dog-motions` | 3820 | 14 | `standing -> standing` | 是 | `gifs/listen_tilt.gif` |
| 19 | `step_back` | 后退两步 | `robot-dog-motions` | 3020 | 30 | `standing -> standing` | 是 | `gifs/step_back.gif` |
| 20 | `wiggle` | 后摆扭身 | `flip` | 4620 | 45 | `standing -> standing` | 是 | `gifs/wiggle.gif` |
| 21 | `breathing_squat` | 呼吸下蹲 | `flip` | 2820 | 20 | `standing -> standing` | 是 | `gifs/breathing_squat.gif` |
| 22 | `body_sway` | 机身横摆 | `flip` | 6920 | 43 | `standing -> standing` | 是 | `gifs/body_sway.gif` |
| 23 | `side_dip` | 侧向压肩 | `flip` | 4940 | 32 | `standing -> standing` | 是 | `gifs/side_dip.gif` |
| 24 | `body_circle` | 机身画圆 | `flip` | 10620 | 63 | `standing -> standing` | 是 | `gifs/body_circle.gif` |
| 25 | `diagonal_curtsy` | 对角屈身 | `flip` | 5320 | 45 | `standing -> standing` | 是 | `gifs/diagonal_curtsy.gif` |
| 26 | `flip_play_bow` | 玩耍深鞠躬（长版） | `flip` | 16020 | 43 | `standing -> standing` | 是 | `gifs/flip_play_bow.gif` |
| 27 | `new_year_bow` | 拜年鞠躬 | `flip` | 12520 | 56 | `standing -> standing` | 是 | `gifs/new_year_bow.gif` |
| 28 | `curious_peek` | 好奇探头 | `flip` | 6820 | 35 | `standing -> standing` | 是 | `gifs/curious_peek.gif` |
| 29 | `head_tilt` | 歪头观察 | `flip` | 5620 | 20 | `standing -> standing` | 是 | `gifs/head_tilt.gif` |
| 30 | `happy_bounce` | 开心弹跳 | `flip` | 5620 | 41 | `standing -> standing` | 是 | `gifs/happy_bounce.gif` |
| 31 | `shake` | 快速甩身 | `flip` | 5520 | 53 | `standing -> standing` | 是 | `gifs/shake.gif` |
| 32 | `figure8` | 8字摆动 | `flip` | 10020 | 64 | `standing -> standing` | 是 | `gifs/figure8.gif` |
| 33 | `hip_pop` | 髋部弹点 | `flip` | 5620 | 42 | `standing -> standing` | 是 | `gifs/hip_pop.gif` |
| 34 | `hello` | 你好问候 | `flip` | 8420 | 46 | `standing -> standing` | 是 | `gifs/hello.gif` |
| 35 | `dance` | 组合舞蹈 | `flip` | 26740 | 204 | `standing -> standing` | 是 | `gifs/dance.gif` |

## 2. Flip 闭环动态 / 接触切换技能归档（9 个）

| # | 技能 ID | 中文名 | 控制器模式 | 仿真时长 (s) | 轨迹/指标文件 | GIF |
|---:|---|---|---|---:|---|---|
| 1 | `front_paw_wave` | 前爪挥手 | `wbc_contact_choreography` | 19.25 | `trajectories/flip_dynamic/front_paw_wave.json` | `gifs/front_paw_wave.gif` |
| 2 | `march` | 原地踏步 | `wbc_contact_choreography` | 18.45 | `trajectories/flip_dynamic/march.json` | `gifs/march.gif` |
| 3 | `diag_step` | 对角节拍踏步 | `wbc_contact_choreography` | 14.01 | `trajectories/flip_dynamic/diag_step.json` | `gifs/diag_step.gif` |
| 4 | `diag_trot` | 对角原地小跑（MPC实验） | `mpc_wbc_dynamic` | 6.58 | `trajectories/flip_dynamic/diag_trot.json` | `gifs/diag_trot.gif` |
| 5 | `contact_side` | 无力传感侧移 | `mpc_wbc_contact_observer` | 4.65 | `trajectories/flip_dynamic/contact_side.json` | `gifs/contact_side.gif` |
| 6 | `contact_yaw` | 四轮原地偏航 | `mpc_wbc_wheel_yaw` | 9.65 | `trajectories/flip_dynamic/contact_yaw.json` | `gifs/contact_yaw.gif` |
| 7 | `turn360` | 对角踏步整圈转向 (360°) | `closed_loop_turn_goal` | 84.87 | `trajectories/flip_dynamic/turn360.json` | `gifs/turn360.gif` |
| 8 | `trot_yaw` | 对角踏步定速偏航 | `closed_loop_yaw_rate` | 8.65 | `trajectories/flip_dynamic/trot_yaw.json` | `gifs/trot_yaw.gif` |
| 9 | `twist` | Xbox 组合扭身 | `realtime_teleop_wbc` | 8.0 | `trajectories/flip_dynamic/twist.json` | `gifs/twist.gif` |
