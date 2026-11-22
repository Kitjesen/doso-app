# DOSO 0.0.1 当前发布状态

## 2026-11-20 本地三页工作台 QA54

主工作台默认进入机器人控制页，可切换到机器人状态和设置。地图、任务与分析已从正式入口收起。以离线示例账号在横屏和竖屏走通了「控制 → 状态 → 设置 → 控制」，并验证了确认停止后切页和继续使用只读视频的本地回归用例。Android QA 包已构建、验签并核对关键页面嵌入源码。当前 GitHub 基线为 code53，G20 最近核实安装的是 code52。[三页预览](../artifacts/ui-review/g20-three-pages/index.html) · [构建记录](../releases/README.md)

## 2026-11-19 源码已合入 GitHub main

合并提交为 `dd14e388de327cb5f353a18a6bd91afb11f758c4`。整合源码已生成 QA code53 的 arm64 APK，归档与 SHA-256 见[构建记录](../releases/README.md)。G20 最近核实安装的是 code52，本次发布源码没有执行设备安装或数据库迁移。[PR #10](https://github.com/Kitjesen/doso-app/pull/10)

## 2026-11-19 UI QA candidate

正式源码仍为 `D:\DOSO\app-workspace\doso-app`。本轮深度卡片交互调整生成 QA versionCode 50，APK SHA-256 为 `98274FF8038132B1A1E2B1BAB61A9B0409F468DF861C4F88A2013AD927FE66ED`。G20 当前可 ping，但 USB 调试状态为 `unauthorized`，因此尚未核对设备端是否已经安装该 50 包。

## 2026-11-10 当前核对与下一步

功能现状、优先级与验收出口统一更新在[功能需求与交付待办](production/DOSO_FUNCTIONAL_REQUIREMENTS_AND_DELIVERY_BACKLOG.md)。最新已确认安装记录为2026-11-06 QA code48，同签名保数据升级，后端为阿里云测试环境；本次文档更新依据源码和已有记录，当前G20包及机器狗程序待现场复核。

局域网控制已接真实状态/策略/电压/电机读取及动作RPC，历史G20使能/失能与用户站坐有实测记录。持续摇杆控制曾出现运动ACK超时，当前原生ACK后间隔与发送调度仍需验证和调整，端到端稳定50Hz及断网停止待验收。P0继续聚焦这一条单狗控制链路。

BLE扫描/GATT/只读UUID已有源码，完整Wi-Fi配网尚未实现，具体待办见[BLE配网](production/ROBOT_BLE_PROVISIONING.md)。本次135项控制/BLE离线回归全部通过。正式设计清单为0/20（13进行中、5待复验、2证据过期），正式发布维持NO-GO。

以下为按原日期保留的历史记录，设备在线、部署与安装描述按对应时点理解。

## 2026-10-29 code42实际摇杆控制尚未通过：WalkChecked超时退出

用户拨盘时两次退出已定位为G20 WalkChecked 100ms截止超时（103/102ms），发生于armed seq5/128，新鲜输入8/24ms；不是本次输入过期。Brainstem收到非零目标并进入Walking，但持续控制失败，不能宣称可正常摇杆行走。G20→机器人一次只读ICMP观察出现0.74–4.67秒延迟，后续短测恢复3–30ms，尚未归因具体端。Wi-Fi百分比仅RSSI，不代表实时链路健康。本次未改超时、限速或发送动作，详见artifacts/release-readiness/20261029-joystick-drop-01/RESULT.md。

## 2026-10-29 G20 code42已安装，机器人允许使能且真实使能/失能通过

按森哥本轮实机控制授权，只将正常brainstem.service现有ExecStart中的HAN_DOG_ALLOW_MOTOR_ENABLE改为true，备份原override后重启。进程PID16813、active/running、NRestarts0，程序SHA256 adb8c51b0174f1a15961b22e86a3b1e83bdf2c0e43c5e92863a6c23fac22dfff不变；自检/故障/来源/租约保护保留。G20 code41真实App分别确认Enable、Disable，服务器状态经历false→true→false，16个电机使能期间全部online且status_code=2，最终16/16在线且status_code=0、无租约/严重故障。机器人日志确认两次via gRPC，未使用电脑备用Disable。未发送站立、坐下或速度。

code42新增前台原生Wi-Fi RSSI读取（普通ACCESS_WIFI_STATE/ACCESS_NETWORK_STATE权限，-100至-55dBm线性换算0至100%，来源为G20到接入点）；指令速度在已连接无目标时显示0.0m/s，运行时显示已获ACK的本App目标并标“指令速度”，不冒充实际机体速度。断线/过期/外部控制者不填假0值。相关212项JS回归、TypeScript、Android SDK编译及原生行为复测通过。

code42正常构建输入漂移0，SHA256 e1f1ad17e2c0f62265a9506e751d92c980da528068a24d4afb3167f435e9185a，保留数据安装G20，设备APK哈希相同、UID10173/签名/首次安装时间保持。真实屏幕显示指令速度0.0m/s、Wi-Fi100%，系统RSSI约-39至-40dBm；Wi-Fi禁用后旧指标清除，恢复后自动重连并重读。最终电机失能、16/16在线、无租约；部署许可保持true。证据artifacts/release-readiness/20261029-live-control-02/RESULT.md。

当前可开始分步实机调试；站坐、实体摇杆实际运动、真实机体速度和运动中断线停止尚未验收，不将使能成功扩大为全部运动已通过。

## 2026-10-29 G20 code41已安装：只读自动连接与重连实机通过

已补上同一成功目标的有界重连、回前台恢复、账号隔离的成功目标保存及QA本地入口冷启动恢复。IP编辑页暂停自动连接；账号切换、主动退出和旧回包不能恢复旧目标。恢复只打开状态通道，不自动使能、取得租约或重放输入；停止未确认及身份失败保持阻断。存储保存/清除失败有明确提示。

code40实机发现原生先退出后台、JS再interrupt旧只读会话产生停止未确认误报；code41以派发前权限记录区分纯只读与可能有控制请求的连接，保留不确定停止保护。最终219/219测试、TypeScript及独立复核通过。code41正常构建输入漂移0，SHA256 `46fbbf4bfc97f4bcec3d7375bba46a40f9e269b68adbeb12a301bc32e731ede2`；G20保留数据覆盖安装，设备APK哈希一致，签名、UID10173和首次安装时间保持。

真实G20 LAN验收：安装后恢复保存目标、后台返回、进程关闭重开、Wi-Fi禁用后恢复均自动读回192.168.66.64:13145状态及56.2V，未手动重新连接；关节页返回也恢复。断网时旧读数清除，恢复后电机仍未使能、无租约。最终电脑四项读取成功，16/16电机在线。当前已核对正常服务active/running、PID1961、原二进制哈希不变，进程`HAN_DOG_ALLOW_MOTOR_ENABLE=false`，拒绝使能原因是部署许可而非未启动服务。本轮未修改机器人或发送动作。

证据：`artifacts/release-readiness/20261029-auto-reconnect-01/RESULT.md`及`code41-live-acceptance.json`。首次页面抓取工具失败记录保留，之后完整复验通过；不计为App崩溃。账号切换/TLS恢复仅本地逻辑验证，TLS原生证书授权不绕过；长期稳定性、实际运动、活动租约断网停止仍未验收。

## 2026-10-29 G20 code39已安装：明确动作拒绝不再断开连接

JS控制会话已将precondition/unimplemented拒绝与通信失败区分：撤销本地控制意图、确认租约退役并读取新状态后保留通道；停止未确认和通信错误继续安全失效。UI仅展示白名单拒绝码的固定中文，不透传服务端原文。相关回归、类型检查和独立审查通过。

code39已保留数据升级G20，输入漂移0、签名/UID/首次安装时间保持；APK SHA256 `eaed2cd535c3e13335ec880890b70586223667cd6bdd91c4427f480809f7c1d8`。真实Enable拒绝实测：机器狗日志明确拒绝，App显示“机器人当前状态不允许此操作。”并保持“已连接”和后续状态轮询。最终16/16电机在线，仍未使能、无运动租约；未进行实际动作。本轮没有增加自动重连、回前台自动恢复或冷启动自动连接。证据：`artifacts/release-readiness/20261029-connection-recovery-01/RESULT.md`。

## 2026-10-29 请求/回执验证已完成，未执行运动

用户选择“先只验证请求和回执”。在核实真实进程使能许可false后，通过G20 code37发送一次Enable，机器人明确返回FAILED_PRECONDITION（部署限制），实际未使能。另从电脑经Wi-Fi探测StandUp/SitDown（未使能而拒绝）、AcquireControl（accepted=false）、无租约零目标WalkChecked（权限拒绝）、Disable（12个离线电机无法确认，返回UNAVAILABLE）。服务PID7529、NRestarts0保持，前后Grounded且无运动租约。

已复现App在动作被拒绝后主动关闭控制会话，不能将这次表现解释为服务器崩溃或网络掉线。已重新连接G20。未验证实体摇杆运动、实际站坐或运动中断线停止，也没有修改使能策略。证据：`artifacts/release-readiness/20261029-app-robot-control-01/COMMAND_RECEIPTS.md`。

## 2026-10-29 正常服务已部署、G20 code37已安装，电机反馈仍阻断运动

从机器人现场正常源码构建并部署到独立目录 `doso_app_normal_20261029_0730`，正常服务直连监听192.168.66.64:13145。用户重启后已自动恢复并核验同一程序SHA256 `adb8c51b0174f1a15961b22e86a3b1e83bdf2c0e43c5e92863a6c23fac22dfff`。该版本保留现场硬件/模型基线，尚不包含下文Windows本地RobotRecovery新增接线。

G20真实Wi-Fi四项状态查询已取得响应，GetProfile不再UNIMPLEMENTED；控制页显示已连接及约50V总线电压。但当前仅左后腿4/16电机在线，受限重启后仍相同，另外三路CAN接收计数为0。使能自检未通过，部署允许使能仍为false，没有发送使能/运动。已请用户核对电机供电与连接，不记控制验收通过。

code37构建成功且输入漂移0，APK SHA256 `8af4b279635d28cfb1c26607e18ba0e10160d7cb7be6330223462b43c0b32b1c`，签名保持。已保留数据升级G20并核验设备包哈希、UID10173和首次安装时间；新包真实连接及关节诊断页面已检查。完整证据和剩余项：`artifacts/release-readiness/20261029-app-robot-control-01/RESULT.md`。

## 2026-10-29 正常 Brainstem 恢复接线与 App 模式展示（未部署）

本地 `D:/inovxio/brain/brainstem` 正常入口已接入可选恢复运行时与同端口 `RobotRecovery` 服务，复用现有硬件，恢复选择期间阻止普通输出和策略切换。新增协议由生成器更新，恢复启动、心跳、取消与电机失能确认分开。新硬件接线验证标记默认关闭，不沿用独立恢复测试服务的验证结果。相关103项本机测试通过、受影响Dart分析无问题；未改现场服务、硬件配置或执行动作。

App 已解析 GetProfile 扩展能力并调整恢复入口，读取状态与执行动作分开；相关291项回归及TypeScript检查通过，最后文案调整后控制页75项复验通过。Android恢复动作/心跳尚未接线，因此开始恢复保持禁用；本轮未构建安装，G20不会自动获得这些变更。证据：`artifacts/release-readiness/20261029-recovery-grpc-01/NORMAL_SERVICE_INTEGRATION.md`。硬件版本合并、真实使能/停止序列、初始机械边界以及G20端到端测试仍未完成。

## 2026-10-28 G20与Brainstem/MuJoCo联调准备

2026-10-29调度和截止时间复核：隔离实验中高精度等待末0.5ms短自旋，Walking在0.145秒因请求未完成停止；同期非自旋对照在19.929秒同样停止，不能据此将失败归因自旋。电脑采样空闲物理内存约7.32GiB、CPU瞬时约23%，并非毫秒级调度因果证据。发现原来每4物理步直接认定请求超20ms，会受步间隔校正影响；实验改为按实际提交时间计算，未到期但遇下一周期则不并发提交并记录跳过，20ms仍停止。改后一次在33.237秒停止，末次请求工作线程在提交后16.021ms已收到结果，但主物理线程超过20ms才处理，诊断应为消费者晚处理，非网络超时。

进一步独立分类器区分结果迟到和消费者晚醒，两者均保留停止；仅实验主线程使用更高一级优先级并退出恢复。7项分类、取消、优先级测试通过；Walking零速度对照在2.626秒出现请求确未完成且停止，最大物理间隔5.693ms，说明两类问题均可能出现，不能靠提高优先级单独解决。日志`bridge/walking-pipe-hybrid-20261029-01.log`、`bridge/walking-pipe-soak-control-20261029-01.log`、`bridge/walking-pipe-deadline-20261029-01.log`、`bridge/walking-pipe-classified-20261029-01.log`；分类调度脚本SHA256 `d941e1552b02dd8ab0b77a28b96f7683f10644280f7ff43aca056a7a31636739`。严格50/200Hz及G20动态验收仍未完成，本轮进程已退出、23145无监听。

2026-10-29流式分段与本地管道Walking实验：流式失败样本`20:680000000`入队至取出0.113ms，取出至服务端接收6.816ms，服务内2.479ms，后续客户端因超时取消，不能将取消时间冒充响应时间；日志`bridge/walking-stream-trace-20261029-01.log`和`bridge/stream-trace-server-20261029-01.log`。仅仿真新增自有子进程stdio管道交换SimState/History，G20原gRPC接口未修改；进程与回环监听须核验归属，单在途，超时取消终止自有子进程，结束清除虚拟力矩。管道编解码、异常帧、取消解除阻塞和线程计时器共5项测试通过，`bridge/pipe-soak-tests-20261029-02.log`。

模型预热、Walking零速度、单周期旧状态实验：管道加仅调用线程临时优先级，30虚拟秒运行6000步/1500请求，30.003秒墙钟、199.978Hz/49.994Hz、最大物理间隔6.210ms；进一步50虚拟秒10000步/2500请求，50.007秒墙钟、199.974Hz/49.993Hz，物理间隔P99 5.406ms、最大8.648ms，控制间隔P99 20.448ms、最大23.793ms，最大管道请求7.175ms。未超时但仍存在超过5ms物理周期和20ms控制周期的间隔；未定义可接受抖动上限，不能宣称严格稳定达标。原始证据`bridge/walking-pipe-priority-20261029-01.log`、`bridge/walking-pipe-soak-20261029-01.log`；50秒调度源码SHA256 `9098cb2e103b9e4f471e2c7ca8b4ba545f7403a81909101abc1787b0c0a66ce0`。仅为零速度闭环，未进行动态行为、G20或真机验收；本轮仿真进程已退出，23145无监听。

2026-10-29 Walking请求同号双端取证与流式实验：本机零速度Walking请求sample `9:80000000`，客户端提交至完成48.069ms、线程排队0.787ms；按同机系统时钟对齐，工作线程启动至服务端进入约20.013ms，服务端进入至返回约2.014ms，返回至客户端完成约25.253ms；误差含系统时钟粒度与埋点开销，服务方法之外含gRPC、序列化及两端调度，不可直接断定具体单一原因。正常线程优先级对照另一次亦在1.290秒因20ms请求超期停止。证据`bridge/walking-wall-20261029-01.log`、`bridge/wall-server-20261029-01.log`及highres对照。

独立回环仿真服务新增实验性双向流，单请求在途、逾期取消、退出清除虚拟力矩；不修改正式Brainstem协议或App。一次零速度Walking完成6000步/1500请求，30.026秒，199.83Hz/49.96Hz，最大请求10.21ms，但最大物理步间隔23.15ms，不满足稳定200Hz验收。带额外线程CPU计时的独立复测在3.710秒因请求超期停止，记录8.002ms物理间隔内线程CPU计时0ms（受计时分辨率影响），只能说明等待/调度值得继续检查，不能归因具体组件。新增单在途/取消及本机计时器2项测试通过；流式和诊断源码只作仿真实验，保留一个周期状态延迟。日志`bridge/walking-stream-20261029-01.log`、`bridge/walking-stream-gap-20261029-01.log`；实验脚本SHA256 `71877b6fdf909a027c8611af8408da85a32e9955afcd4f526ef4594400c780c5`。未达到持续稳定50/200Hz，未使用G20或真实机器狗；临时回环服务已停止。

2026-10-29 Walking仿真续测：确认回环端为本任务`walking-profile-server.dart`、simulation模式后，仿真内发送站立及零速度Walk，151周期到Standing、进入Walking后完成100次策略输出与400次MuJoCo步进；这是零速度闭环，不是实时或动态行走验收。未预热样本100次Walking推理首帧38.023ms、其余99次均小于5ms，端到端cycle最大56.494ms。随后单独服务器在Grounded预热相同模型，再完成100次Walking闭环，Walking首帧0.582ms、P99 0.839ms、最大0.840ms；是单次对照，不能证明消除所有冷启动和尾延迟。`walking-probe-20261029-01.log`、`walking-warm-probe-20261029-01.log`与相应服务日志保存原始证据。

预热后Walking零速度实时实验一次完整30虚拟秒：6000物理步、1500周期、墙钟30.186秒、198.77Hz/49.69Hz，最大RPC 11.55ms、最大物理间隔6.43ms；使用实验性合并RPC和一个控制周期旧状态，未达用户严格目标。调整实验计时校正下限至4ms后，第二次在9.268秒、1852步、462周期时因上一请求未在20ms内完成停止，请求从提交至返回34.041ms，最大步间隔7.35ms。服务器记录Walking推理P99 0.869ms、最大4.553ms；单次超时未完成端到端归因。新计时校正和计时器3项测试通过。完整日志`walking-realtime-probe-20261029-01.log`、`walking-precise-probe-20261029-01.log`及对应server日志。已停止本轮回环服务；未使用G20，未发送真机指令，不宣称稳定50/200Hz或动态行走通过。

2026-10-29模型与调度续测：仅在回环仿真服务副本中对当前mini ONNX策略的`Walk.inferOnce()`离线测量，预热10次后100次：ONNX调用平均0.166ms、P95 0.353ms、P99 0.685ms、最大0.860ms；含观察构造的inferOnce平均0.284ms、P99 0.997ms、最大1.244ms，原始数据`bridge/inference-server-20261029-01.log`。这不是Walking状态完整闭环推理。离线探针后Grounded日志的`lastInferenceUs`为历史值，不可当作当次Tick发生推理。

仿真实验使用进程本地Windows高精度等待计时器，未修改系统全局计时分辨率；一次30秒目标在19.844秒、3899物理步、974 Tick后因单请求超过20ms停止，最大步间隔16.055ms。随后仅对实验调用线程临时设置高于普通线程一级并在退出时恢复，测试通过；30秒目标运行24.075秒、4776物理步、1193完成Tick（约198.38Hz/49.55Hz）后因单个请求逾期停止，最大步间隔9.679ms；该次请求从提交到完成30.173ms、线程开始0.947ms。日志`bridge/highres-run-20261029-01.log`、`bridge/priority-run-20261029-01.log`。实验仅用于仿真、一个周期旧状态，仍未达到持续200/50Hz；未连接G20、未发真机命令。临时回环服务已停止；需要进一步定位请求尾延迟并对Walking闭环、丢包和超时做验证。

2026-10-29服务端性能取证及合并RPC实验：仅在回环仿真服务副本中对Step/Tick计时，一次Grounded超时样本服务端末次Step约0.136ms、Tick约2.129ms，而客户端对应请求提交至完成25.716ms；本次FSM Grounded、ONNX推理计数为0，不能推断行走推理性能，也不能准确归因网络、序列化或线程调度。证据`bridge/server-profile-20261029-02.log`、`bridge/realtime-profile-client-20261029-01.log`。独立仿真副本实验性增加SimulationCycle合并Step/Tick，无更改真实Brainstem或公开协议；10虚拟秒一次完成2000物理步、500控制周期，墙钟10.353秒、193.18Hz/48.29Hz、最大物理间隔12.26ms。30秒目标的另一次在5.903秒出现41.206ms物理调度间隔而按保护停止。实验包含一个周期旧状态延迟，未验证行走推理、G20或真机；稳定50/200Hz未通过。51项测试中含继承重复项，覆盖合并请求超时及既有保护。日志`bridge/combined-run-20261029-02.log`、`bridge/combined-run-20261029-03.log`；客户端SHA256 `ac27130038f9957baf367550dbd593447dd57e7befc52187916a6fe579a3943d`、仿真服务副本SHA256 `d3f317a78d44fce939981f13cf6c0644b7dfb2d7dd2d7beb1a419f0fc915b2db`。本轮仅用Grounded仿真，临时服务已关闭。

2026-10-29超时分段诊断：在独立异步仿真实验补充请求提交、线程启动、Step结束、Tick结束时间；本地49项测试通过（含重复继承测试）。一次10秒目标试验在第4步提前停止：提交到线程启动1.657ms、Step结束18.616ms、Tick结束28.750ms，下一控制周期已到。可确认本次两次RPC墙钟耗时合计约27.1ms；不能据此区分服务推理、网络或客户端调度。日志`bridge/realtime-trace-20261029-01.log`，实验文件SHA256 `dbcc188d69973debb34b07bdad97560aacba2e88d412ec78e9f3753bf5866992`。本次无G20、真机或运动指令，已关闭本轮回环仿真服务。50Hz/200Hz尚未通过，需结合服务端分段计时定位。

2026-10-29异步调度实验：新增独立`bridge/realtime_experiment.py`，使用单个在途Step/Tick请求与独立物理步进；实验存在一个控制周期的旧状态延迟，不可直接作为真机控制实现，20ms超时/积压即停并清除虚拟扭矩。首版一次10秒联跑完成2000步、500次Tick、墙钟10.955秒，约182.57Hz/45.64Hz，最大RPC 17.88ms；另一次请求超期而停止。后续增加最多0.5ms的定时误差校正并限制最短步间隔4.5ms，该版实测在12步、2次Tick、0.066秒时因控制请求逾期停止。日志为`bridge/realtime-experiment-20261029-01/02/03.log`；49项测试包含原桥测试及新实验超时、积压和步间隔测试。最新实验文件SHA256 `511ee90914a61ee682c4d1b1c4bef084920f3e56a52de7d1d294aa5dc4754a39`；10秒完成记录属于校正前版本。未完成持续200/50Hz、G20或动态动作验收，未将实验纳入App或Brainstem生产代码；本轮仿真服务已关闭。

2026-10-29实时频率推进：严格模式修改前10虚拟秒实测500 Tick、14.083秒墙钟、35.50Hz（约142物理步/秒），证据`bridge/strict-baseline-20261029-01.log`。修复每次物理计算结束后才开始下一个等待导致周期额外叠加计算时间的问题，仍以真实步开始时刻重新计时，不突发追赶且保留20ms超时保护；22项测试通过，新增物理工作计入5ms周期的回归。修改后严格实测在第872物理步因Step 22.740ms、Tick 8.703ms、落后27.842ms触发保护停止，证据`bridge/strict-timing-change-20261029-01.log`；未达到稳定200Hz物理/50Hz控制。同步gRPC偶发延迟及调度尚待优化，不能放宽保护或凭短时完成数宣称通过。桥SHA256 `aff15b1c50df11a7b9cec9f9d8868f2e1e6ff3595baa6db5d92d9cb4d312e028`。未使用G20或真机，本轮临时回环仿真进程已关闭。

2026-10-29续测：桥补齐有界预热、无租约及Grounded检查，本地测试21/21通过；真实仿真服务默认`motor_output_enabled=true`，不代表调用过使能。核对本次23145进程为回环仿真入口、`CmsMode.simulation`后，使用当前本地Brainstem及其API运行慢速演示：3虚拟秒、150次Tick、墙钟12.86秒、实际11.66Hz，约0.233倍速，未触发20ms落后保护。`--viewer`运行也正常退出（3虚拟秒、150 Tick），但没有独立截图，不将其作为画面验收。桥SHA256 `830fe05abc399531190267e12248b7482ed8d723b60af33ef52f55f2bf618d8a`；结果和先前冷启动及状态门禁失败均保存在`bridge/headless-slow-*.log`、`bridge/viewer-slow-attempt-01.log`。`Step`仅检查仿真注入器，`Tick`拒绝硬件模式，必须事先核实服务进程，不能将本桥当真机安全验证。G20由另一项工作占用，本轮未接入G20，未验证操作、断线保护或50Hz。上游版本仍未合并：三个源码冲突和API不兼容待解决，保留原始工作区与标定。

森哥要求使用G20控制电脑中的MuJoCo机器狗。GitHub Brainstem master经`ls-remote`核验为`1470a9cc3238ce3e223d69877f35859bdd2ff12a`，已下载到独立目录`artifacts/release-readiness/20261028-g20-mujoco-01/upstream-brainstem/`并检出其锁定子模块；原`D:/inovxio/brain/brainstem`的分叉和未提交改动保留。上游锁定的brainstem_api子模块`8e93d65`不包含当前App使用的AcquireControl/WalkChecked/GetControlStatus，不能直接覆盖现用API `a5c1dc5`或声称已合并上游。

现有电脑Python环境已具备MuJoCo、gRPC和protobuf，未安装依赖。在独立`bridge/`实现只连接127.0.0.1、只调用Step/Tick的MuJoCo桥，按16关节名称校验、已知姿态对照、超时/非有限输出清零虚拟扭矩且不快进补跑；不自动站立、行走、使能或获取控制权。Python模型和逻辑测试11/11通过，实际Dart SimSensorService三个姿态对照通过；首轮过严浮点阈值失败与修正记录在`bridge/verification.json`。独立复审发现并修复睡眠唤醒后超期未拦截问题，新回归及证据在`bridge/verification-sleep-deadline.json`，最终复审无阻断。

电脑端首次启动真实Brainstem仿真服务并运行MuJoCo桥3秒尝试，桥因墙钟落后超过20ms主动停止并退出1；随后一次6对Step/Tick预热及0.5秒有界诊断，仍因后续Step/Tick累计约25.46ms超限停止，物理步约0.16–0.21ms，未证明持续实时仿真或50Hz，证据`headless-attempt-01.txt`和`bridge/timing-diagnostic-01.json`。未启动GUI或G20控制；G20由另一项测试使用，尚未做USB转发、真实步进频率和画面验收。不可把仿真当作真实机器人动作或50Hz通过。

## 2026-10-28 电脑真实Brainstem仿真服务预检

依森哥要求准备G20连接电脑Brainstem：复制真实`han_dog/bin/server.dart`到独立证据目录，仅将监听绑定改为`127.0.0.1:23145`，不改机器人源码；`SimSensorService`无真实电机、IMU或CAN。电脑端实际启动真实`UnifiedCmsServer`、Brain和FSM，mini模型加载、FSM Grounded，本机gRPC读取`GetControlStatus`与`GetProfile`成功；因仿真无真实joint，`GetVoltage`和`GetMotorStatus`返回FAILED_PRECONDITION，不作为真实读数。证据`artifacts/release-readiness/20261028-brainstem-pc-simulation-01/`。

森哥确认G20仍在另一项测试中，本轮尚未使用USB转发连接此服务，未发送运动命令；已关闭本任务临时服务并核验23145不再监听。不能称G20→真实Brainstem仿真端到端通过，也不能推定真机控制或稳定50Hz。G20空闲后可用此目录的回环副本重新启动并续测。

## 2026-10-28 G20 code31已安装，静默高频观察通过，电脑动作链仍在修复

单项实测定位持续声：森哥确认SDK单KeyChannels在100ms和20ms均不持续响；单KeyChannelSettings和单KeyControlMode在100ms均持续响，各30/30成功。修正独立测量工具对窗口末端GET的误报超时后，单通道20ms目标取得147/147成功、约48.78Hz回包。此为短时SDK回包率，不能代替新硬件采样、JS接收或控制下发频率。一次左杆前推记录未捕获变化，不撤销此前通道变化证据，也不记逐轴映射通过。

源码新增observe复用既有生命周期与20ms串行调度，默认读取只观察通道、配置恒null/false，不授权实体输入。显式开始校验会退役观察并新建完整配置会话；原逐帧五GET配置复检仍保留，因此校验和其后的实体输入仍可能响、可能慢。没有用一次配置快照冒充运行中有效性。相关JS128项、原生41项session/12项adapter和固定SDK/Expo编译、类型检查通过，独立复审无阻断。

G20原生gRPC探针经USB reverse到电脑固定loopback取得GetControlStatus OK；code30 App四读均真实到达电脑，但结果快照的LAN地址校验遗漏127.0.0.1，导致页面通用失败。已只补精确loopback、保留其他别名/公网拒绝，85项相关回归通过。尚未做修复后App控制、断线和50Hz验收；电脑模拟器不证明Brainstem物理FSM或电机行为。

code31首次构建使用系统JDK24在CMake阶段失败，后续一次因内存不足未启动Gradle。森哥授权关闭Blender后，本轮确认其已无进程/窗口、可用内存恢复；build-04固定JDK21成功，输入漂移0。APK SHA256 `056566067295ec067e7992dfc4a2dd4a7ab69cf5c099831a28102cc45ee52677`，与code30签名相同，覆盖安装后独立核验哈希一致、UID10173及首次安装时间保持。

code31默认观察实机约18.29秒901帧，JS49.20Hz、JS最大gap34.06ms；原生相邻样本均值20.3267ms、最大41ms。森哥确认本次App读取无持续滴声。修复后PC四RPC各真实到达且页面接纳状态。不能从这两项推导实体输入已完成、四项数值均逐字段展示或实际运动50Hz。

后续PC动作试验发现：使能确认后没有Enable到达，页面最终结果未确认；操作反馈改变摇杆区域大小，会触发原有几何取消。另在PC预置使能/站立后，慢拖只收到三帧零目标并释放，尚无非零运动下发证据；held-neutral忙碌时撤销条件正在复现修复。模拟器预置不计App使能/站立通过，当前不放行运动验收。试验后已停止App、模拟器并移除本轮USB reverse。证据根目录artifacts/release-readiness/20261028-g20-pc-50hz-01/。本轮未操作真实机器人、未清App数据、未更换认证后端或修改遥控配置。

## 2026-10-28 机器狗连接只读预检

电脑对配置地址`192.168.66.64`的TCP 22端口可达，13145返回ECONNREFUSED；SSH批处理认证未通过，未执行远程命令，未确认对端身份或服务状态。证据为`artifacts/release-readiness/20261028-robot-preflight-readonly-01/result.json`。此前G20显示连接和电压不能替代这次的只读检查。

最新可见code31构建尝试失败、无候选包；G20端到端稳定50Hz、四轴映射和真实动作仍未验收。Brainstem本地源码连续目标消费与输出保护仍需补齐和验证。未发送机器狗动作或电机命令，也未改动其服务；先恢复可确认的状态读取并完成电脑模拟与保护验证。

## 2026-10-28 机器狗连接页精简与默认地址

连接页默认预填`192.168.66.64`，已有选中地址优先，手动修改或清空后不自动回填；连接仍需主动点击。主区去掉外层卡片，保留地址、连接、状态及连接方式标签，高级设置保留原证书、蓝牙、导航入口和安全门禁。

4份连接相关本地测试58/58、类型检查通过；独立审查和复跑58/58未发现阻断。源码`src/screens/RobotConnectionScreen.tsx` SHA256 `8b56b1c8adace0518ebc1ca7e346e1a92ac03617ac3d4409ae76868bc2371329`。本轮未构建或安装，G20历史code29不含此改动；未操作设备或机器人，真实连接与地图验收状态不因此变化。

后续跨聊天只读核对：共享工作目录的code30构建输入记录中该文件SHA与上述一致，输入漂移0；候选APK SHA256 `21df7c09a05f83d3b92f1f8d7a6298069660f185a2031872f7cb67822bb1f736`。G20当前包查询显示code30、UID 10173、首次安装时间保持；本次未重读已安装APK哈希，也未操作界面。code30的摇杆/50Hz测试由该测试流程继续，是否稳定不能从构建成功推断。

## 2026-10-28 G20 code29 地图入口与设备连接验证进行中

地图未选择导航服务时新增“地图连接设置”入口，沿用连接页高级设置，不改变账号或控制权限。连接与地图相关16文件本轮267/267通过，地图入口专项35/35、路由检查和类型检查通过，均为本地测试。app.json及Android版本号同步提升至29。

受控单次QA构建成功，输入漂移0，旧包未改。新包`com.doso.robot.qa` code29 SHA256 `9421d09b212c0857b0dfe6ccd56cab2a3c576a36d6ac6948257a60c84b212272`，签名与原code28一致，含arm64-v8a/x86_64，bundle含地图库/定位/连接入口；证据在`artifacts/release-readiness/20261028-g20-map-connection-code29-01/`。G20覆盖安装成功，已装APK哈希一致，UID 10173及首次安装时间不变；未卸载或清除数据。

G20打开免登录设备测试及连接页面，输入192.168.66.64后界面显示已连接和总线电压56.6V，电脑此前对13145/5050均超时；两端网络差异及对端身份尚未确认。随后观察到控制页面显示“已使能”、出现“确认失能电机”弹窗和“操作结果未确认”，本轮没有确认该弹窗或主动发送运动动作；森哥确认机器狗已固定且自己刚才操作过G20。源码显示首次连接只读取状态，失能弹窗需要二次确认才发出失能请求，红色提示需已有操作反馈流程；具体操作与真实物理状态尚未核实。上述界面不能证明端到端控制或全部遥测通过。

森哥确认暂停操作后，G20实机可打开连接页的高级设置→导航服务；以本地LingTu源码默认候选`http://192.168.66.64:5050`读取，显示“无法读取导航服务，请检查地址和网络”，未读到地图或定位，原因及真实部署仍需核实。完成后停留在导航只读失败页面，未确认失能或触碰运动按钮。地图编辑、路线和任务完整能力未因本次安装完成，国内认证迁移亦未完成。该QA包不等于生产发布包。

## 2026-10-28 App地图库、定位与导航任务查询/取消源码接入

继续沿用现有字体、颜色和主导航。连接机器狗→高级设置→导航服务，在成功读取后可打开“地图与定位”和“查询导航任务”；已准备的账户可显式“用于地图与任务”，把该服务地址用于主导航。地址只在本次内存会话中使用，关联账户/会话/设备上下文；上下文替换或准备失效即撤销，匿名诊断不开放任务取消。该选择不改变Brainstem控制目标、不绑定机器人、不申请控制权。

地图客户端只GET地图目录schema1及定位schema1，原生页显示名称、content_epoch、点云/栅格可用性和实际坐标系/位置/朝向；缺失值保留未知。当前位姿要求ready、pose_fresh、has_odometry明确为真且x/y/yaw完整，15秒批次期限、取消/后台/地址切换使旧结果失效。地图画面通过已安装的expo-web-browser打开同源LingTu地图工作台，固定observe=1与真实选中地图名；有界HTML预检，404提示未部署，不新添地图依赖。该Web观察模式不是服务端权限边界，不能据此认定用户后续操作受服务端只读限制；没有实现原生嵌入式地图或授权地图激活。

2026-11-05 实时点云入口进一步改为 App 内原生视图，不再打开浏览器。地图与定位页的“查看实时点云”挂载 `DosoPointCloud` Expo View，Android 模块通过 Rust SDK 接收并原生绘制，JS 只传端点、扫描/地图选择、显示开关和接收少量状态。地图库为空或读取失败时仍可进入；返回、后台或 Gateway/机器人上下文变化会卸载旧视图，过期原生事件不回显。旧 APK、iOS 和没有原生模块的运行环境显示明确不可用，不回退模拟图像。

SDK 端点按当前已验证导航 origin 的主机和协议使用默认端口 5052，区别于 Web 5050 和 Brainstem 13145；这只是当前端口约定，不是服务发现或 TLS 成功证明。HTTP 仍只限已有 QA 条件，并由 Android 原生网络策略再次校验。Rust 原生模块构建、实际 Gateway TLS、G20 的显示与帧率需按最终构建和现场证据验收。React Native 入口已通过 16 项行为测试和 `npm run typecheck`；未构建或安装新版 APK，也未连接机器人。已保存地图工作台继续沿用同源浏览器入口。

本轮已完成 Rust Android arm64 交叉编译和 Expo 原生模块 Gradle 编译。独立 Android 13 arm64 离屏测试用模拟点云经真实 Gateway、Rust SDK 和 JNI 驱动正式 OpenGL 绘制器，接收两帧变化并回读非背景像素；未切换已有前台 App，临时测试包及端口映射已清理。该结果不代表新版 App 页面已安装或机器狗真实点云已验收。

任务客户端只读当前导航schema3和指定任务schema1，保留记录source/evidence_status及原始生产者ts；不把新的HTTP时间当成旧任务的新鲜证据。任务记录状态、导航当前状态、记录终态与物理停稳分别显示；历史任务不继承另一任务的停稳确认，当前UNKNOWN/IDLE不显示残留确认。账户主导航的显式取消需要当前ID匹配、明确活动、非终态和新鲜查询，使用独立操作ID仅POST一次指定任务，并校验回执任务/操作/客户端身份；接收不等于完成。超时或失败只查询原任务，保留未知，不自动重试、回退全局取消、启动任务或申请租约。

新增服务与页面交互回归，并保留原地图/任务模板及诊断门禁回归。最终相关15文件206/206通过；测试前后源码哈希、类型检查及独立复审记录见artifacts/release-readiness/20261028-lingtu-map-task-app-01/。复审修复了状态页旧读取handler重开旧地址、动态文案命中Object原型、地图旧工作台handler、忽略Abort时无限等待及任务页卸载丢失取消操作ID的问题。取消记录按服务origin与任务ID保存在当前账户/设备上下文，切主导航或重选服务不会重复提交；仅明确未发送的cancel_blocked可重新查询后再次确认。未新增依赖或改动机器人端服务。

尚未构建/安装APK、核对G20、调用真实LingTu或机器人、发送真实取消；完整地图身份/图层、任务创建/路线/召回、网关生产鉴权和实机停稳验收仍待完成。取消操作记录当前仅内存保存，App进程重启后的恢复尚未实现；重启也不自动发送取消。本轮源码通过不代表当前G20已具备这些页面，也不放行50Hz或真实运动。

## 2026-10-28 App导航服务只读入口与客户端完成离线验收

已在现有连接中心的高级设置增加“导航服务”，免登录设备测试、登录前和登录后共用；沿用App字体/主题，无自动读取或控制。用户填写服务origin并显式读取四个固定GET：bootstrap4、capabilities2、state4、readiness1；复用既有有界HTTP读取，仅导出readJson，保留无cookies/不重定向/超时/取消及64KiB限制。批次非空env/Product/product_session_id冲突拒绝，15秒有效期从首请求单调时刻起算；地址变更、取消、后台、返回与卸载使旧结果失效。

页面分别呈现环境、模式、定位、服务报告就绪、控制来源、当前地图名称和接口能力；本体在线始终未知、motionAuthorized始终false，不从robot.online常量或HTTP/能力flags推导控制。ready/tracking须同时有localization.ready与pose_fresh真值才正向显示，缺失/过期保留待核验；未把地图名称当map_id。进入子页清原gRPC观察与期限，返回不自动重连。QA source-set新增HTTP覆盖及Expo重建模板，客户端仅QA允许明确私网/loopback HTTP；正式导航入口要求HTTPS，没有改证书校验、签名或机器人服务。

新增入口3项先失败后通过、定位新鲜度组合测试先复现误显示再修复；最终相关10文件105/105与npm run typecheck通过，独立复审无阻断。额外旧verify-social-auth.mjs在未触碰的RegisterScreen旧社交readiness断言失败，日志保留，未改账号页面或旧测试。测试后源码及范围见artifacts/release-readiness/20261028-lingtu-readonly-app-01/result.json；本轮未逐项核对测试期间源码漂移。App补充清单已写入现有DOSO_FUNCTIONAL_REQUIREMENTS_AND_DELIVERY_BACKLOG.md，第一项只标源码/离线完成，真实联调独立未勾选。

未执行prebuild/Gradle、构建/安装APK、读取G20或真实LingTu/机器人、申请控制权或发送动作；真实部署响应大小、鉴权/网络、Android合并manifest和G20显示仍待验收。既有gRPC控制、50Hz和Brainstem消费/输出保护未因本项放行，正式实机通过数不增。

## 2026-10-28 智身官方资源与三端功能缺口核查，GenisDog原APK未取得

继续搜索智身官方App：M1官方遥控器说明书明确名称GenisDog，并含主页/模式/设置图；已按官网实际链接下载并固定PDF身份，不能把手册图冒称当前App实拍。REA检查官方136853339bytes L1Maker资源包并导出证据，SHA256 `fac3d5c6a5aa6f03111600a81fea93018a20d206712e8f7d773eedd984b4d8b9`；包内Windows上位机不是Android GenisDog，未运行。公开下载目录26条无APK，两个官方升级目录网页跳飞书登录，浏览器工具超时；11个官方公开仓库树1794项和7个公开Release/24附件未找到APK，主要商店有界查询亦未定位可核实条目。这不能推定所有分发渠道不存在；DEX/RTC/离线启动逆向尚未完成。

固定智身SDK和当前源码交叉核查已完成：LingTu真实根D:/inovxio/brain/lingtu为ROS-free原生导航，已有App bootstrap/capabilities、state/readiness、地图/任务、WHEP及WS；DOSO当前未接该客户端，直连路线/任务/召回仍禁用。须复用现有服务，区分操作方式/本体策略/速度档和受仲裁控制路径。发现bootstrap的robot.online=True常量不能照搬成本体在线、Doso driver明确没有实测机身速度、远端TLS与App LAN开发设置不能直接互套；Brainstem速度档服务仍UNIMPLEMENTED，不能先加按钮冒充完成。IMU/Joint/CMS协议流和已有16关节查询应优先复用，BMS与实测速度仍需真实来源。

总报告及两份专项、官方资料、REA导出和搜索边界在artifacts/research/20261028-genisom-app-gap/。更新现有对接和推进清单；建议下一片为LingTu只读能力/就绪适配，Brainstem消费/输出保护由负责方继续。未改产品运行代码、未出包、未做G20/机器人操作或部署，本轮未重跑产品测试；源码存在不代表当前部署或实机通过，正式通过数不增。

## 2026-10-28 蓝牙连接与绑定挑战守卫修复，功能需求待办已整理

蓝牙系统连接在发布 connecting/discovering 时若 UI 同步取消，旧流程此前仍可能发起原生 connect/retrieveServices；修复前新增回归失败，修复后在两次发布后重新检查 owner 已结束状态。BLE session/native 20项通过，页面与 iOS 扫描补充9项通过。

设备绑定 begin 响应此前仅检查格式：服务层现核对响应 deviceId 与请求设备 UUID，App 层在既有请求/用户/会话/设备生命周期守卫后核对 ownerAccountId 与当前用户 UUID；大小写一致语义保持，错误响应拒绝。服务/UI 9项通过，独立复审合并29项通过，npm run typecheck通过；无数据库、RLS或云端变更。测试后源码SHA及范围见 `artifacts/release-readiness/20261028-ble-enrollment-guards-01/result.json`，测试期间未核对输入漂移。

地图、路线、任务、召回、扩展动作与OTA的首版需求、依赖、验收和P0–P6待办见 `docs/production/DOSO_FUNCTIONAL_REQUIREMENTS_AND_DELIVERY_BACKLOG.md`，量产目录已增加索引。当前真实BLE业务仍只有扫描、系统连接、服务发现；机器人身份握手、绑定完成、Wi-Fi GATT协议和板端配网服务尚未接通。最近硬件蓝牙无可用HCI为历史证据、未本轮重验。未构建或安装APK、未操作机器人或实际Wi-Fi；真实绑定/配网与全部实机验收仍待完成，正式通过数不增加。

## 2026-10-28 免登录与遥测本地模拟回归

森哥要求先做本地程序测试。本轮对游客路由、设备测试页、gRPC服务桥接、遥测归属、直连状态呈现和控制会话执行6份Node测试，140/140通过。覆盖免登录门禁、四项遥测模拟、部分失败和过期清理、断线/权限及ACK等；均使用本地测试夹具和模拟调用，不是G20 App或真实机器人验收。结果及测试后源码SHA在 `artifacts/release-readiness/20261028-local-device-tests-01/result.json`；测试期间未核对源码漂移。

本轮电脑对 `192.168.66.64:13145` TCP再次超时，G20 ADB仍为unauthorized；未安装包、未读取机器狗真实状态、未发送运动指令。实际G20免登录连接及机器人状态读取仍待两端恢复后验证，正式实机通过数不增加。

## 2026-10-28 G20 免登录状态实测受连接阻断

森哥回复已授权 USB 调试后，本机 ADB 两次仍显示设备 `unauthorized`；不能读取安装包信息或操作 App，未构建或安装。电脑对机器狗 `192.168.66.64:13145` 的四项只读 gRPC 调用均超时，随后 TCP 端口检查也超时；前轮成功的状态响应不能视作本轮连接成功。保留本轮结果 `artifacts/release-readiness/20261028-guest-brainstem-readonly-01/four-rpcs-01.json`，未获取控制权或发送动作。

当前源码遥测循环读取控制状态、策略目录、总线电压和电机状态；设备测试约5秒刷新一次，部分失败单独提示。协议有 IMU 数据流，但该循环尚未订阅；电池百分比、设备速度和信号强度没有在该直连遥测快照中提供。电机接口字段及总线电压为代码能力，不代表本轮设备真实读数已验证；设备恢复后需在 G20 验证每项数值、缺失和断线处理。

## 2026-10-28 免登录设备测试入口与机器人只读通信核对

现有 QA 源码已有登录页“进入设备测试”，仅在 Android QA 包提供局域网原生能力时显示；设备测试无需云账号，连接与控制权仍需显式操作，保留现有门禁。游客路由、设备测试与登录相关本地测试40/40通过，未修改 App 运行代码。App.tsx SHA `11fde498951920cb2497604bbb72338643f467ace2fd55a6eb9c1eb649b3319a`，DeviceTestScreen SHA `4ce61d0876d6f1c851eb58258afb2b3cec4a8a1f9e5dcb900a6efe6d4f27d726`。

电脑对 `192.168.66.64:13145` 发起一次局域网明文 gRPC `GetControlStatus` 只读请求，HTTP 200、gRPC status 0、返回29字节；未解码状态字段，未申请控制权或发送运动。G20 ADB 当前显示 unauthorized，故不能确认当前安装包身份，也未在 G20 App 上实测。最后历史安装记录为 QA code28、SHA `d6cef1dec66cebe3399e2d48e1ba5239ffa8e4acbec2c30cf63ec0d406336597`，不把历史记录当本次设备检查。证据 `artifacts/release-readiness/20261028-guest-brainstem-readonly-01/result.json`。待 G20 USB 调试授权后核对设备和安装包，进入设备测试并执行只读连接验证；未验证电机、动作或50Hz，正式实机通过数不增。

## 2026-10-28 智身核心行为对标与 App 过期状态通知修复完成

继续核对固定版智身GEN2公开SDK及本地Brainstem：ACK表示已接纳合理，当前裸A.walk经仲裁进入asyncExpand串行CMS，尚无实际消费边界的最新目标槽；停止也经相同事件通路，重复包可续租但没有独立目标期限。此为本地源码结构风险，未证明部署版本相同或真实发生积压。现有BRAINSTEM_APP_INTEGRATION.md增加双端功能对照和健康性判定，保留序号/ACK/租约、本地遥控优先及离散动作语义；不照搬厂商自动接管、速度上限或无ACK契约。

本轮最小App修复：复用已有500ms refresh轮询，在busy/reading/inputBusy早退前，对1500ms过期状态发布一次失效，清status/profile/observedAt/manualPrepared；界面显示状态待更新，电机/姿态/策略保持未知。连接、租约和在途离散动作保留，不伪报已失能或已完成；真实新状态回包恢复对应字段，仅状态回包不能使旧策略复活。过期通知受JS调度影响，正常情况下至下一轮约0–500ms，不声称硬实时。未增加定时器、请求或修改运动限值。

3项新增回归修复前全部失败，修复后session+clock59/59；整体7文件166/166及npm run typecheck本轮通过，独立复审无阻断。旧全仓库类型检查失败记录保持，另一会话已将部署快照排除后本轮重新检查通过。源码SHA256 `31254cb9e77e540cb03e5258a4f22c6df1906214ff74d18ed4a15ab4bfb991e2`，证据artifacts/release-readiness/20261028-control-freshness-01/。没有修改或部署Brainstem、构建/安装APK、操作G20或发送动作，没有发布到GitHub；50Hz、机器人消费与输出保护仍待完成，正式实机通过数不增。

## 2026-10-28 终端已恢复，会话函数与内部网关实际接入通过

已通过上海实例官方 Workbench Admin/22 免密入口恢复普通 Shell，没有重置密码或重跑 SQL。首次恢复在模型比较阶段停止，核对后保留冻结 Functions 命令的 `150000` idle-timeout；随后只读诊断确认固定镜像确实存在，Docker29 省略默认 `Config.User` 导致原模板失败。仅兼容缺失字段的默认用户，显式 null、非法用户、平台和 entrypoint 校验保留。独立复审另修正最终保全异常可能误报成功、探测创建超时无 cidfile 时的清理缺口，13项离线守卫测试及复审通过。

修订工具 SHA `f5c97e418227112ae69727a153b37a8bd28dd1d6a8ff1796175184f35f0f419c` 实际单次执行成功：无凭据依赖探测就绪并清理；Functions 启动，只有网关重建为第十层运行模型。20组真实内部HTTP检查全部通过，包含原Auth/REST路径与函数缺失/无效Bearer拒绝、未开放函数和子路径404。原core4容器ID/启动时间/环境/挂载、网站及冻结运行包保持。Functions无Docker healthcheck，以运行身份和实际handler响应验收，不能写成六服务全部healthy。

本轮修正Expo类型检查误纳入部署快照的问题，仅在既有exclude追加 `deploy/backend/**/*`；根目录 `npm run typecheck` 当轮实际通过，App产品源码未因后端工作修改。证据目录 `artifacts/release-readiness/20261027-domestic-api-gateway-01/` 中保留各次失败、只读诊断、成功回执 `functions-install-attempt-04.json`、对应不可变源码和实图；新检查点为 `verification-checkpoint-20261028-functions.json`，不回写旧证据。

公网与备案已重新只读核对：域名仍解析47.103.89.137，HTTP返回备案403，严格HTTPS失败；同一备案进度仍为“管局审核 / 审核中”。真实JWT正向登记/心跳/资料/退出、App续期重开、可信公网HTTPS、国内APK和G20/弱网均未验收。没有账号操作、原项目改动、App切换或安装包构建；正式通过数不增加。后续维护须保留十层模型，禁止重跑旧首启、邮件、SQL或五服务前置安装工具。

## 2026-10-28 会话函数部署输入和客户端回归已完成，服务器终端需恢复

在已验证的内部网关及新测试库基础上，新增 `deploy/backend/account-sessions-20261027/`：11份运行文件、7份原始源码身份、只开放精确 account-sessions 路径，保留既有Auth/REST过滤器与后台Auth/真实会话RLS校验；固定镜像，worker不接收数据库密码或JWT签名密钥。34项本地测试通过，manifest SHA `a572eea2a35aa85d568e064a829d000308b44dd6f9c1bbd75edac2aa81b5c0aa`。无凭据Deno依赖探测和带保持性检查的安装工具已准备；其本地文件准备不能算实际函数启动。

Workbench旧临时SSH连接已断开。粘贴/提交后页面仍只有旧SQL回执，未取得本次执行回执；一次正常重连仍断开，返回登录后要求服务器登录凭据，官方实例execute入口另报ERR_CONNECTION_RESET。没有把重试或静态配置冒称部署成功；已请森哥从实例远程连接重新打开普通Shell，恢复后先核对当前五服务和新目录，再继续单次依赖探测。数据库迁移不重跑。

并行客户端回归首次87项中8项失败，原结果保留：两处guestMode、五处setLogoutPending夹具缺失和一处旧loading门禁断言。仅更新两份测试夹具，保留不重复撤销/不错误兜底/不继续SDK退出断言，补忙碌状态[true,false]与门禁真值表；复跑87/87通过。App产品文件前后SHA同为 `4c8167930358e358b5078c920c8a429ef6565d5c2d7123a29e6348608d84d79e`，未改产品代码。证据在本轮目录 `client-tests/aligned-run-01.json`。

所有阶段证据位于 `artifacts/release-readiness/20261027-domestic-api-gateway-01/`，新增 `functions-submission-attempt-01.json` 说明提交与未执行确认的边界。可信公网HTTPS、备案接入、真实凭证的函数业务闭环、App切换/测试包、G20和弱网仍未验收；旧项目与账号数据保留，正式通过数不增。

## 2026-10-28 App单槽待发速度源码通过离线回归，Brainstem仍待接入

App控制会话由忙时直接丢输入改为一个在途RPC和一个可覆盖的待发快照；A在途时B被C覆盖，A的ACK有效后仅发送仍有效的C，不为未发送样本消耗网络序号。保存左右杆完整值、各轴JS接收时间和G20原始Android时间；出槽不刷新年龄，150ms及现有ACK/租约/状态门禁保持。停止/回中、错误ACK、状态读后失权、保护动作和连接更换清空目标。源码SHA256 `12d3f786a6c1acd689f74205cacf234e7cb69e0ddcb775cb1c405ba63e8f07d7`。

新增9组回归，相关7文件163项通过，独立复审无阻断；App及相关脚本范围TypeScript通过。全仓库npm run typecheck在另一会话正在开发的deploy/backend/account-sessions-20261027下7个文件报类型错误，未修改那些文件或全局配置；不记全仓库类型检查通过。证据 `artifacts/release-readiness/20261028-latest-motion-slot-01/{result.json,js.log,typecheck.log,app-typecheck.log,tsconfig.app-scope.json}`。

只读核查本地Brainstem仍为WalkChecked准入后裸A.walk进入串行CMS，未具备待消费速度单槽；ACK只代表准入，输出guard文件仍是离线原型。现有对接文档已写明实际消费边界、连续序号、跨设备时钟限制、重复RPC不续命、已应用目标期限和停止优先级，由负责方按当前版本接入。未修改或部署机器人、未发送指令、未构建/安装APK，也未新增50Hz定时器；G20实机和50Hz里程碑仍未完成。

## 2026-10-28 智身官方SDK对标完成，仅形成输入优化依据

已从智身官网确认当前L1和GEN2官方SDK，分别固定到f7ccbf393e96f1205af8cce8070c5886f9641428与e8f959a22a6e5714bc299a551b45e1c182ac05c7。GEN2 API建议Move/MoveVelocity以10–20Hz持续发送，协议1.3.0对1111直接速度建议20–50Hz，二者文档推荐不一致；OnMcData的50Hz是上行反馈。直接速度协议采用不逐帧ACK、单槽最新待发值；公开速度表随前后速度收紧横移/yaw，而非公开时间衰减公式。L1示例20ms循环和20Hz心跳均不能证明其遥控器采样或连续运动发包率。

研究报告和固定文本快照保存在artifacts/research/20261028-genisom-reference/，现有G20推进清单增加最新值发送、按真实dt限加减速和Brainstem统一速度约束的验收项。未改App/机器人运行代码、速度或150ms保护，未实测智身、读取G20或发送动作；本轮研究不构成DOSO 50Hz通过，安装包和实机验收状态不变。

## 2026-10-28 G20输入频率与通道契约核查，50Hz尚未实现

森哥提出机器狗最终收取50Hz控制目标。本轮只读核查：KeyChannels请求间隔100ms；code28历史前8帧中的7个原生发帧间隔均值103.9ms，约9.6Hz，样本请求至发出34–57ms。JS按onSample事件接收和触发控制，未独立实测JS到达频率；原生gRPC的20ms最小间隔只是上限保护，没有50Hz发送调度。前一RPC未确认或状态读取期间会跳过输入事件；每帧五次串行GET与100ms间隔可能吃满150ms新鲜度预算，此为风险推导，不能视为此前回登录原因已证实。

通道层采集16项，逻辑层动态学习4轴及6类选配动作；右杆纵向无机器人动作，映射仅保留在当前会话内存中，该G20逐轴/逐键验收未完成。App运动字段、单位与坐标和本地Brainstem proto相符；接收机SBUS编号不可照搬到Android SDK通道。部署端身份、完整功能、50Hz接收和运动未验证。已将分段频率量测、配置失效保护、通道表及ACK/抖动验收加入现有G20_APP_PROGRESS_PLAN.md。未改运行代码、出包、重新采样或操作机器人，正式通过数不增加。

## 2026-10-27 国内网关和新测试库业务结构已通过内部验收

本轮实际新增固定 Envoy 候选网关，只绑定 `127.0.0.1:18000`；启动入口/Studio依赖和私有tmpfs已适配。真实HTTP的17组检查通过：Auth/JWKS、REST OpenAPI/不存在表转发、无效密钥拒绝和未开放路径404。原四个核心容器ID/启动时间/环境/挂载、网站及冻结运行包保持；首次比较因Docker挂载顺序误报而在启动前停止，原失败回执保留，单次只读诊断后仅规范化挂载顺序，第二次实际验收成功。

森哥随后明确批准仅上海新测试库的12份SQL范围。实际保存179948bytes的root0700/0600备份、归档目录可读（尚未做完整恢复演练）；既有原生Auth会话用于事务内资料/登记/心跳/撤销及拒绝规则测试，全部回滚确认后才提交结构。SQL SHA `6bc29f269153bb79e82fe295a507e36ca4531f0d24acf57444853caf2e8d8c3f`，执行工具SHA `3bf1374d80735722622cbbb5b929ee630357f9612fb5ab930f0d4440248fa651`。结果为profiles1、terminals0、登记和heartbeat RPC存在、邮件worker关闭；Auth用户/会话可见行版本、原五服务和网站保持，旧托管项目未访问或改动。

证据 `artifacts/release-readiness/20261027-domestic-api-gateway-01/`。这些是新库SQL/RLS及内部HTTP结果，不是App真实JWT或G20验收。公网新鲜探测仍为备案403/HTTPS失败；重新登录后备案页同时出现管局审核/审核中及前序审核通过，不据此认定全部完成。`account-sessions`函数尚未接入，App目标、APK和G20没有切换，正式验收不增。后续需完成单一会话函数、可信HTTPS和实机完整链路。

## 2026-10-27 PR #1 已修正并合并，本地源码同步完成

森哥明确授权后，保留作者原始两次提交，补交 `4a2b11581122da75a0e029f26918970cce80530e`：实际控制会话复用只读连接的真实策略ID/槽位映射，横竖屏按钮从会话状态验证，空高台保持禁用；修正过时的云端控制回调测试并补直连转发覆盖。原PR #1 已确认 MERGED，main合并提交 `a105f21078e3f5e71f1cd519bb4becc506ce34da`，修正提交为其祖先。接入平地/楼梯真实SwitchProfile、Grounded/Standing切换门禁，以及Walking停止释放后显式站立流程；配套机器人补丁仅保留在文档，未部署。

隔离源码154项相关JS/TS测试、TypeScript检查、原生控制会话fake-channel测试及真实Expo桥接编译通过。相关14个文件经三方合并、既有内容备份和应用前后哈希核对接入本地，保留本地测试补充及G20输入诊断；本地154项相关测试与TypeScript复验通过。证据 `artifacts/release-readiness/20261027-pr1-merge/{merge-result.json,js-final.log,typecheck-fixed.log,native.log,local-js.log,local-typecheck.log,local-sync-final/applied.json}`。此前审查中的映射阻断已关闭，历史审查及失败/中断日志保留。

本轮只完成源码合并，没有构建或安装新APK，G20仍以此前code28安装证据为准；未修改或启动机器人服务、未使能或发送动作。正常出包、保留数据升级及对应Brainstem版本的现场运动/策略切换仍待另行验收，正式实机通过数不增加。

## 2026-10-27 code28 已安装，读取117帧后页面回到登录入口

JS 看门狗诊断16项输入测试和TypeScript通过；单次正常构建 freeMemoryKiB7941036、inputDrift0、旧包不变、锁清理成功。code28 APK 80827304bytes、SHA256 `d6cef1dec66cebe3399e2d48e1ba5239ffa8e4acbec2c30cf63ec0d406336597`，包名、签名、双ABI及旧客户端配置与code27一致，bundle含看门狗标记；保留数据安装、UID/首次安装时间/设备哈希核对通过。

设备助手保持停止，App控制页确认未连接机器人后单次本地读取：首配置26ms/首通道12ms成功，前8帧请求年龄34–57ms。约9秒后页面观察为正在读取，随后再查时页面已离开输入页；native末次记录 stopped/post_settings/sequence117/requestAge172ms，JS看门狗标记未观察到，系统前台为DOSO登录入口。未观察到具体触发动作，不能断言是用户、后台、认证还是看门狗导致。输入已停止，未连接机器人或发送动作，持续可靠性和滴声仍未通过。证据 `artifacts/release-readiness/20261027-g20-watchdog-diagnosis-01/{source-result.json,build-01/build-result.json,code28-metadata-install.json,code28-read-01.json}`。

## 2026-10-27 邮件留白已收紧，上海确认模板服务已切换

森哥要求执行清理后，原PNG按批准方案无损裁边，2172×724改为新版本2172×216、157380bytes，保留区域RGBA逐像素相同；新资产SHA `03526d27c6b4ca23ae12f24e6541ff2b6901b6303e4374ee4a0d229effad8cc4`。既有公开桶补传后匿名严格TLS GET HTTP200、PNG MIME/长度/hash通过，旧对象和权限保留。共享模板采用单页头Logo，外层上下12、主体24、Logo到标题16、页脚前24/后16px，页脚仅版权；13份产物一致、7原生模板本地检查及99项组合测试通过，OTP/安全文案/链接保留。

上海切换首轮在写入/重建前停止；单次只读诊断确认Compose省略create_host_path=false导致校验误拒。保留原失败源码和回执，只兼容此规范化省略且严格拒绝true/None/string/0，10项离线自检与独立复审通过。修订工具SHA `17529899d4332bbd3f9077d4dcd379b501343f1e9e20941029599838057c72c7`经hash断言后实际一次执行成功：`compact_mail_installed`、新版6208bytes HTML私网HTTP SHA `059ea02a0de00258977c2a6d04dbc9cb1171529f033ba917b383b1931a0b8115`一致；仅mail-templates更换，Auth/db/rest IDs、Auth Env、原站指纹及原37文件运行包保持。

新文件及第八层覆盖在 `runtime-20261027/docker/doso/mail-layout-20261027/`；后续操作须保留原六层、OTP6第七层、本次第八层，不重跑历史首启工具。完整证据 `artifacts/release-readiness/20261027-email-compact-layout/`。对比图是离线尺寸示意，非QQ/Outlook实拍；本轮未追加发信，用户此前收件不能作为新版渲染通过。旧托管模板、业务发信函数、App目标和安装包未切，账号数据保留，正式验收不增；新版实际邮件排版、公网HTTPS和业务会话仍待完成。

## 2026-10-27 code27 实体输入观察与声音未解决

森哥确认 G20 没有连接独立接收机或遥控链路，App控制页显示设备未连接、站立/电机禁用且触屏为当前来源。经用户操作左摇杆、右摇杆和一个按键的一次本地读取，页面显示16通道，8次稀疏UI抽样发现11和15变化；结束时 native sequence672，退出面板并停止，随后仍确认App未连接。抽样不能把变化逐一对应到动作，也未校验方向/按键映射；未发送运动。

森哥确认关闭 MCU 按键声后，上一次持续读取期间仍持续响。单次 Android 音频对照的读取以配置首读 SDK 超时、前后配置不一致而停止且sequence0；音频快照无法证明覆盖持续读取，不能用于定位声音源。不得把临时成功视为稳定或声音解决。

本地新增JS看门狗触发时仅一次记录序号和时间间隔，异常也不影响原有停止；15项输入/不变量测试和TypeScript通过，未打入已安装code27。现场证据 `artifacts/release-readiness/20261027-g20-channel-diagnosis-01/{manual-input-01.json,operator-confirmation.json,active-audio-comparison.json}`。下一步优先修复间歇 SDK 超时和时序中断，再对每轴/按键单独验证；不得放宽150ms输入门槛。

## 2026-10-27 code27 通道超时归类与设备助手退出对照

在code26证据基础上，仅增加首个通道回调的错误码/空值/短数组/越界分类，不记录原始通道值；adapter12组、session32组及真实SDK/Expo编译通过。正常单次构建资源6430832KiB、inputDrift0、旧包不变、锁清理成功；code27 APK 80827204 bytes、SHA256 `d7eba01cd0e7fff7f24ab667a02f24db73666f417d24bda50b42c44a26fafc0e`，签名、双ABI、包名和旧客户端配置与code26一致，保留数据安装且设备内哈希、UID、首次安装时间通过。

首次实机：SDK首配置2005ms/101超时、mode16ms，首通道102ms/101超时，非数组长度或越界；SDK字节码证实通道调用内建100ms期限。云卓说明其他设备助手可能占用通信口，本次我们先前打开的 `com.skydroid.devicetool` 仍在后台；正常返回后仍有进程，故仅停止该工具，保留 `rcservice`/`rc_daemon`。随后在新DOSO进程中首配置24ms、首通道12ms成功，前8帧请求年龄39至57ms；运行47帧后JS报告输入更新中断。相同进程只再做一次重读：前8帧请求年龄38至70ms，持续到sequence121时人工停止，UI为未读取。两次条件变更同时包括关闭设备助手及重启DOSO，结果支持竞争假设但不能证明唯一因果；短测不能证明长期稳定。

没有连接机器人、发送动作、校验轴/按键或更改其他遥控设置。声音是否消失仍待用户对实际采样期间确认，正式输入与运动验收未完成。证据 `artifacts/release-readiness/20261027-g20-channel-diagnosis-01/{source-result.json,build-01/build-result.json,code27-metadata-install.json,code27-first-read.json,assistant-stopped-comparison.json,same-process-restart.json}`；G20当前code27仍指向旧后端，国内迁移另行验收。

## 2026-10-27 图片检查邮件已确认收件，留白来源已定位

森哥明确确认收到此前授权的1封图片检查邮件；该用户收件确认与 `single-mail-result-final-02.json` 的SMTP接受回执合并记录，不把原始回执的 `delivery_verified=false` 回写成true。用户随后反馈上下留白，本轮没有邮箱截图或QQ客户端布局实测，不能额外认定Logo显示或全部客户端通过。

只读像素核对：2172×724批准PNG中可见墨色边界为(51,251)—(2121,426)，实际高度175px，透明上251/下298px；180×60显示时实际字高仅约14.5px。已发检查HTML另有外层上下24、内容顶38/底34、Logo到标题30、页脚分隔前38/后26px，属于两层留白叠加。建议另存原像素无损裁边资产后，以新真实比例显示，并将外层上下12、内容上下24、标题间距16、页脚前24/后16px作为紧凑稿；保留历史对象和已发邮件，不用CSS负边距裁图或拉伸。证据 `artifacts/release-readiness/20261027-email-spacing-review/analysis.json`。本轮只定位和给出明确规格，未改图片/模板/服务器、未追加发信；App国内后端接入状态不变。

## 2026-10-27 code26 已安装，首次配置 SDK 返回超时、通道数据无效

首次构建门禁停止后森哥释放资源，新的单次构建通过：freeMemoryKiB4582200、bundle/assemble/success、inputDrift0、旧包不变、锁清理成功。code26 APK 80827204 bytes、SHA256 `407955561e4c0623ea56fe589ce20c4948bc72f3102ce25c9a44803b0e3dd056`，包名、签名、双ABI和旧客户端公开配置与code25一致，保留数据安装后UID、首次安装时间与设备内APK哈希核对通过；仍沿用旧后端。

单次有界实机读取：首配置在2005ms返回 SDK errorCode101，查固定SDK字节码确认101为 Timeout；返回时会话仍为active，随后mode读取17ms，channels读取102ms但无可用数据，UI显示“G20 通道数据无效”，未产生帧。现有代码将SDK通道失败、空值、长度不足和越界合并，无法区分具体是哪一种，不能将其归因于硬件、信号或某种映射。首次等待调整提供了区分App提前关闭和SDK超时的证据，不等于故障修复；声音、连续输入和运动均未验收。未连接机器人或发送动作，证据 `artifacts/release-readiness/20261027-g20-startup-config-01/{source-result-final.json,build-02/build-result.json,code26-metadata-install.json,code26-first-read.json}`。

## 2026-10-27 code26 正常构建门禁因内存不足停止

最终离线测试结束后一次只读内存观测为5579216KiB，随后启动一次正常 QA launcher；正式门禁实测3809428KiB，小于4194304KiB，`preflight_stopped`、buildStarts0、inputDrift0、lockCleanup succeeded、无候选，未启动 Gradle。旧包和用户数据未改。证据 `artifacts/release-readiness/20261027-g20-startup-config-01/build-01/build-result.json`。下一次仅在资源释放后使用全新的证据目录和正常门禁；不要复用此次尝试或绕过门槛。G20 仍为code25，初始配置修订与声音未完成实机验收。

## 2026-10-27 G20 首次等待补充停止隔离复验

在首次配置延长等待期间新增“后台停止后迟到回调不能重新启动或产生输入”测试；最终32组 session 与真实 Expo/SDK 编译通过，adapter 最终代码此前9组通过。最终源码及测试身份 `artifacts/release-readiness/20261027-g20-startup-config-01/source-result-final.json`，原31组证据与历史记录保留。code26 候选尚未打包或安装，因可用内存首次观测低于4GiB而等待释放后一次正常门禁。

## 2026-10-27 G20 首次配置等待修订已离线验证，待资源达标出包

针对 code25 在 301ms 主动停止、SDK 在 2006ms 返回失败的事实，调整仅限尚未请求任何摇杆通道时的首次 `pre_settings` 上限为 2300ms，以便在没有可用输入的阶段观察 SDK 本身结果；首次完成后的各 GET 保持300ms、样本新鲜度150ms、JS启动总期限3秒不变。SDK首配置失败诊断增加受限数值错误码，不记录异常消息或设备数据。旧回调仍不得跨会话，不能凭超时放宽推断真实故障已修复。

测试先复现旧代码提前失败；最终 session31组、adapter9组、真实 Expo/SDK 编译通过，之前组合18项通过。第一次SDK编译曾因模拟方法与实际 `getErrorCode()` 不一致失败，已修正并复测通过。源码与测试哈希见 `artifacts/release-readiness/20261027-g20-startup-config-01/source-result.json`。本机一次观测可用内存4163116KiB，低于既定4GiB门槛4194304KiB；不启动 Gradle，等待资源释放后重新进行一次正常门禁。源码候选版本码26，设备仍为code25；未操作设备或机器人，未完成滴声、输入或运动验收。

## 2026-10-27 上海内部注册登录已通过，邮件缺失 Logo 对象已补齐

Workbench 的过滤可见结果已回报 `internal_auth_smoke_passed`：新测试账号的 signup 无会话、6位验证码确认、密码登录和 GET /user 同账号通过，账号保留；没有读取或落盘用户密码/验证码。这只关闭新上海私有 Auth 的该条测试，不等于 account-sessions、可信公网 HTTPS 或 App/G20 登录通过。此前“等待本地密码”的条目是各时点历史，最新结果以此段及脱敏 `internal-auth-smoke.json` 为准。

森哥已收到邮件并反馈 Logo 破损。本轮确认模板引用的版本化 PNG 缺失：修复前匿名 GET HTTP400、目录仅两个旧对象；现已在既有公开 email-assets 桶根目录上传批准字标一次，旧对象保留，未覆盖或改权限。上传后匿名严格 TLS GET 为 HTTP200、image/png、196202 bytes，完整 SHA256 与批准资产 `29dea10fd2048cf016ddc9fa4bc9bafaf30ff891187e6f0fb09a8efea6a0de3c` 一致；同一地址浏览器已加载 2172×724 图片。现有上海确认模板已引用此地址，无需重写 HTML 或重启；13份生成文件检查通过。Node 公开请求仍为网络失败 exit1，不能概括所有网络或邮箱客户端通过。

修复图片不自动重发邮件；森哥随后明确批准另发1封无验证码的图片显示检查邮件。单次工具首次在预检停止，历史结果保留；修订后真实回报 `logo_check_smtp_accepted`、`smtp_accepted=true`、无重试/账号操作/凭据输出、`delivery_verified=false`。执行源码SHA256 `2aacff1a276cc0dc54d91e331bdbf791b622eb0145cd5e123353acf77bd32fe8`，6项离线检查与独立复核通过；SMTP接受不冒称QQ送达。证据 `artifacts/release-readiness/20261027-email-logo-object-repair/single-mail-result-final-02.json`。QQ 实际显示、公网备案/HTTPS及业务会话仍待验收；未切 App 地址、未出新包、未改原账号/数据或机器人，正式通过数不增。

## 2026-10-27 code25 已保留数据升级，首次实机诊断发现 SDK 迟到失败

森哥连接 Supabase 后仅只读取旧项目公开客户端配置，完成单次正常 QA 构建；bundle/assemble/success 通过，输入漂移0、旧留存包不变、锁清理成功。code25 APK 80827204 bytes、SHA256 `0b02c45a5f3b6cb9402d50a7d590988a3199e70aeba43b69bfe40662f28117bb`，包名 `com.doso.robot.qa`、双ABI、签名与 code24 相同、旧客户端配置内存比对一致，DEX含新诊断标记。`adb install -r` 成功，UID与首次安装时间不变、设备内 APK 哈希一致；本包沿用旧 Supabase 目标，不表示已切换国内后端。

单次有界只读测试：App 首帧前 `pre_settings` 301ms 超时后撤销会话，SDK 在请求开始后 2006ms 返回失败回调且归属为 stale，未收到成功或任何采样；尚未记录 SDK 错误代码，不能仅凭耗时断言具体异常或根因。SDK 字节码显示相关 GET 基类使用2000ms期限，只能作为候选解释。输入、滴声、摇杆按键及机器人运动仍未通过；未连接机器人或发送动作。新增证据 `artifacts/release-readiness/20261027-g20-callback-diagnosis-01/{result.json,build-01/build-result.json,code25-metadata-install.json,code25-first-read.json}`。

APP 会话后续报告国内测试环境内部注册、6位验证码确认、密码登录与同账号读取通过；公网 HTTPS、业务接口及 App 切换仍待验收，不重复注册或发码。计划保持迁往阿里云国内后端，code25 仅用于当前 G20 诊断。

## 2026-10-27 G20 首次配置回调诊断源码完成，出包待配置来源

针对 code24 的 `pre_settings` 首帧前超时，本轮在 G20 原生 adapter 增加每次连接首个配置请求的最多一条回调诊断，记录固定结果、当前/过期归属和单调耗时，不记录通道值、配置或账号；缺少回调日志仍可能是 SDK 取消或未回复，不能单独判根因。过期回调依旧不能进入新会话，150ms 新鲜度和原有超时未放宽。本轮未操作设备、机器人或固件，未构建安装包；并非故障修复或实机通过。

新增回调隔离、去重和诊断异常测试；真实源码对固定 SDK/Expo 编译成功，输入相关组合 18/18、原生 session 29 组、adapter 9 组和 TypeScript 通过。源码/测试哈希及范围见 `artifacts/release-readiness/20261027-g20-callback-diagnosis-01/result.json`。正常 QA 构建要求只读获取旧项目公开客户端配置，本会话当前未连接对应 Supabase 工具；已提供插件连接入口，尚未启动 Gradle，不使用其他配置冒充原包。G20 仍为历史 code24，正式验收未增。

## 2026-10-27 G20 新进程读取仍超时，厂商舵量页观察到 CH03 变化

森哥要求继续第 2 项；G20 USB 连接、电量读数 72%，code24。停掉并重新打开 DOSO 进程（未清数据），只做一次有界读取：首帧前 `pre_settings` 301ms 超时、sequence0，UI“读取失败”，无持续采样；新进程不能保证恢复读取。用户“没有持续响”反馈发生在开始这次读取之前，不用于证明读取期间声音已解决。

云卓设备助手 3.2.3 “舵量查看”单次对照，森哥拨动左摇杆并松开，5 次 UI 采样观察到 CH03 值变化；只证明厂商页面有该通道变化，不证明 DOSO 收到新鲜数据、轴方向/按键正确，也不能排除配置通道或其他硬件问题。结束时退出舵量页，没有改设备设置、连接机器人或发送动作。证据 `artifacts/release-readiness/20261027-g20-offline-input-check/tone-off-fresh-process-01.json`、`vendor-rudder-ui-01.json`。输入、声音和运动验收未完成，下一步定位 DOSO 配置 GET 不返回的原因。

## 2026-10-27 G20 按键声已关闭，持续读取及滴声仍未通过

森哥要求消除 MCU 按键音。G20 电量读数 73%、USB 供电，云卓设备助手 3.2.3 页面先读回按键声“高”、长按“三段式自锁”；选择“低”但不保存再读取恢复“高”，为读取行为提供现场对照。随后仅选按键声“关”、长按不变，保存一次；再临时选“低”不保存，读取恢复“关”及“三段式自锁”。未改其他设置或固件，未证明其他告警行为。REA Android 提供器因未配置调用方 JADX JAR 不可用；本轮未改其配置。

返回 DOSO code24 仅一次有界读取，首帧前 `pre_settings` 约 300ms 超时、sequence0，UI 为“读取失败”，非连续采样；音频快照未发现匹配活动播放器，不能确定声音来源。森哥表示没听清，不能据此判定持续滴声消除。未连接机器人、未发送运动。证据 `artifacts/release-readiness/20261027-g20-offline-input-check/vendor-tone-off-readback-01.json`。本项仍未完成，下一步先定位读取配置超时并在安全前提下复验连续采样与滴声。

## 2026-10-27 19:10 国内后端网关候选已构建，真实版本输出有效；自检误报已定位

客户端补充：浏览器控制连接重建后，当前用户可见标签重新编号且只剩Workbench；新鲜DOM仍为普通shell，不能沿用旧连接的密码提示结论。再次先只读确认旧测试进程0，才在当前可见终端进入一次工具、填写指定邮箱并确认NEW test password及signup_pending_confirmation=false，清空剪贴板并保留该标签。最后DOM状态在registration-local-handoff-current.json；尝试的局部截图经视觉核对未包含提示行，已另记workbench-prompt-screenshot-correction.json撤销其证据资格，原图保留、不用于验收。仍待用户本人本地密码/验证码输入，不重复启动或代填聊天密码。

本轮在注册测试等待本地密码时推进独立网关候选，未代填聊天中出现的密码。t-sh071aijg7flxxc于17:35:22—23通过三工具安装及105039832bytes官方Envoy文件完整SHA256 002c6e1c69ed0fa0ea381887247cadadfaec9481375fa8d8d2b1731eeabf40b8校验。首次候选执行t-sh071ajhejhvhmo在preflight停止；只读t-sh071alg7mx2kn4与t-sh071amrhff7qbk确认资源、套接字、锁及镜像均满足，拒绝原因是Docker29省略可选字段导致旧inspect模板报format_missing。工具仅将OnBuild/Labels改为安全index访问，不放宽原门禁；旧源码和失败证据保持。

修订组合任务t-sh071aosr1xv1ts于18:45:32—18:46:16安装独立新工具后真实完成构建、平台和source labels检查，镜像ID sha256:7e5d2c0dbac760df975f4f5f809eec5f4149bfcfc0c538f2603df4ab29af25a8；整体exit1在version阶段，不能将其改写成云任务成功。随后单次版本诊断t-sh071ar17p2hk3k于19:10:35—36取得真实return_code=0、经CID/nonce/name/image核对的exit_code=0、oom_killed=false、cleanup_confirmed=true，输出95bytes为/app/envoy version、官方commit b579d07d3ad7ee11d32b105e91a5a39ad24718d7及1.39.1。旧解析器只接受裸envoy前缀，故诊断整体仍exit1，这是自检误报而非程序运行失败。

当前本地解析器只增加固定/app/前缀兼容，真实95bytes夹具先复现失败、修复后17项离线检查通过；源码SHA256 185164667388af32ff461c98535fa9258d9ed00f209bb1fa3f71b5b6cf395ef0。以保留的实际退出状态与输出生成独立assessment，不重新构建或运行探针，也不覆盖原始exit1。服务器历史工具仍为冻结8b009版本；最新解析器尚未安装。此结果仅证明自建候选的官方二进制在受限容器下可运行，不等于原OCI镜像、包装器、网关路由或App登录验收。未启动网关/Functions、发布公网端口、改旧服务/数据或操作机器人。

森哥找不到Workbench后，已定位现有标签并说明左右文件/终端区域。用户截图与新鲜DOM显示终端为新连接的普通shell；只读pgrep确认旧注册测试进程数0，随后在同一终端仅启动一次验证工具、填指定邮箱并停在NEW test password，signup_pending_confirmation=false。邮箱/密码/验证码不落证据，剪贴板已清空，等待用户本地输入两次新测试密码及6位邮件码；真实收信和注册登录尚未验收。

新证据artifacts/release-readiness/20261027-envoy-candidate-build-01/，包含各云任务、只读诊断、版本实际输出及version-assessment-04/assessment.json。App登录最小依赖只读核查明确还需account-sessions、匹配的profile/terminal schema及可信HTTPS，不全量推迁移或绕过RLS。公网备案阻断与正式发布NO-GO保持，App/G20/原账号目标未切换，正式通过数不增。

## 2026-10-27 G20 输入与提示音推进清单

森哥要求从 G20 实体输入继续，并逐项标记完成；新增 `docs/G20_APP_PROGRESS_PLAN.md`。本轮只读核对 G20 USB 在线、系统报告电量 73% 和 USB 供电、App 版本码 24，输入页为“未读取”。一次短时音频对照脚本没有返回可用的采样结果，随后确认页面仍为“未读取”，不计为声音或输入通过。代码使用云卓 SDK 的只读连接与通道查询，未发现本适配器直接播放提示音；官方资料提及 MCU 按键音/长按设置，但不足以证明本次滴声来源，未修改设置或告警。下一步定位对照脚本无结果原因后，再做经身份核对的单次有界采样；未连接机器人或执行动作。

## 2026-10-27 GitHub Releases 更新为 code24 测试包

按森哥要求，公开仓库发布 `v0.0.1-qa-code24` 并设置为 GitHub Latest；GitHub 接口复核 APK 大小 80810816 bytes、SHA256 `4903d35e76f27678c65ffeefe397d2d295fa21bb92989b3d9496ec92a3df4b6a`，与本地已留存并曾安装的 code24 一致。名称及说明明确为测试版，标签指向公开源码快照 `932d25388c65907c7091337417291bbd7f3c20a0`，该快照含 code24 之后的输入超时修复，不能作为此 APK 精确构建输入。公开说明保留设备验收、调试签名和 SDK 分发条款核对边界。本轮未构建新包，未操作 G20 或机器人，正式发布验收未增加。

## 2026-10-27 DOSO App 公开源码与 Brainstem 对接清单

经森哥确认仓库保持公开，隔离快照已正常推送至 GitHub `Kitjesen/doso-app` 的 `main`，提交 `932d25388c65907c7091337417291bbd7f3c20a0`；已核对远程提交与 README、`docs/BRAINSTEM_APP_INTEGRATION.md` 存在。公开快照排除本地凭据、签名、APK、运行证据及需单独取得的云卓 SDK AAR 和 MiSans 字体；README 说明获取方法与许可限制。未改变原工作区源码，也未操作 G20 或机器人。

快照复用本机依赖时 TypeScript 检查、92 项相关离线测试和 G20 原生测试通过，后者覆盖 29 组 session 与 7 组模拟 SDK 回调；这不代表全新环境构建或物理设备验收。公开协议副本取自本地 Brainstem 源码，未重新确认与机器狗当前运行实例完全一致。code24 后的输入超时修复已包含在源码，但尚未进入已安装包。

## 2026-10-27 15:44 上海测试 Auth 已改为6位码，首次注册待用户本地输入密码

森哥要求6位码并确认此前尚未执行测试。仅调整新上海测试环境，旧托管8位配置、原账号、App目标地址和G20包保持；客户端现有6至10位共享规则已兼容，无须改App。公开包15009bytes、SHA256 a3315f98f43582a5db8d848f71eab3353e3f93f77ac56bcb0973806e4b025353，仅含四份已审公开文件。

首次安装t-sh071a3vorsz8jk因Workbench上传ZIP为0664而停止。只读t-sh071a4baycaha8确认UID1000、完整hash正确、目标目录不存在；修订仅在同FD完整身份/hash验证后收紧此公开ZIP至0600。t-sh071a5562ozaio于15:05:12 exit0，四文件落入新root0700目录、文件0600。首次失败证据不变。控制台会话过期曾拒绝更新提交且未生成任务，森哥重新登录后才实际执行。

唯一重配置t-sh071a8mt66hfcw于15:44:19—29 exit0，helper SHA256 0a79b15f1caf977906b3011dd8eea7841bd11315c6c9a0d258bc9fb6254c93aa。七层Compose模型及实际Auth环境唯一变化为OTP8→6；仅一次no-deps更新auth。Auth健康，db/rest/mail容器ID、内部health/模板及旧站本机正文/Nginx指纹保持，全部通过才替换6位交互工具。未重跑首启、清数据或注册账号。helper12项、smoke26项、修订封装13项离线检查及独立复审通过；云DOM完整首尾/源码身份另经复核，不冒称raw stdout。

交互工具SHA256 7aaa196b86a2665b8adce2c8b84f51745f42f2e27d0bfcdabc4a6b69289caad6，每次HTTP前检查真实Auth唯一OTP6。森哥随后指定收件邮箱并要求代操作，负责人已在既有Workbench普通Shell启动并填好邮箱；观察到NEW test password提示、signup_pending_confirmation=false，未输入或保存密码。此刻请求尚未发送，等待用户本地无回显输入新密码两次及邮件6位码；确认→密码登录→GET /user同账号闭环仍未验收。不把配置健康当投递/登录通过。

只读备案详情确认dosorobotics.com在进行中的新增服务订单内，状态管局审核/审核中，尚未通过。公网403备案阻断、可信HTTPS、业务会话与App切换仍待完成。后续Auth重建必须保留最后一层compose.email-otp-six.yml，已成功的一次性工具不重跑。证据artifacts/release-readiness/20261027-shadow-otp-six-01/及20261027-shadow-runtime-01/icp-console-readonly.json。正式通过数不增、发布NO-GO保持，本聊天未改机器人或实体输入工作。

## 2026-10-27 13:37 上海新测试后端核心四服务已真实启动，公网另受备案层阻断

森哥明确批准新测试环境独立密钥落在 `/opt/doso-backend-shadow/env/.env` 后，两片任务顺序执行：t-sh0719q2xbpqps0公开源码传输通过；t-sh0719qqcefzqww于12:23:38—40生成真实新密钥，严格回报root/0600、父目录0700、pending_smtp，无密钥输出。SMTP输入工具t-sh0719swr9w29s0于12:48:03—04安装通过；森哥在Workbench普通Shell本地双次无回显输入，报告smtp_configured。随后工具直接使用服务器受保护配置做真实认证，不从聊天取密码。森哥之后把SMTP凭据发入聊天，后续应由所有者轮换并同步发信配置；本轮未复制该聊天值到代码、命令或证据，也未擅自修改旧服务凭据。

公开运行包v2共38文件、88181bytes，SHA256 f916c0f44e340c16addf250d93f32b54852691d3cbbcce32149cd80826e59d28；Workbench上传后，t-sh0719vgikblpmo于13:16:37—38逐项校验并落到全新runtime-20261027。原33项公开配置不变，新增镜像/确认模板运行材料与manifest；不包含真实env或旧数据库数据。源代码、固定七项DB初始化SQL和模板均以完整manifest核对，不在生产库执行迁移或RLS变更。

核心启动工具先修复nginx -T stderr时间/PID导致假漂移的缺陷，保留旧未执行候选。最终源码SHA256 c8966100b31118b0ba775b4af18f4022ffed42f69159a96d06e9f3751f4d7d82，23项离线测试及独立源码/两层封装APPROVE_SCOPE通过。唯一实际任务t-sh0719xawzzzmkg于13:37:18—46完成exit0：SMTP严格TLS登录成功，db/auth/rest/mail-templates四个新容器身份与健康通过，REST官方postgrest --ready通过，Auth /health与confirmation模板完整SHA通过。选中服务宿主发布端口0；没有启动网关、Studio、Storage、Functions等。官网本机Host=inovxio.com前后HTTP200/正文SHA与Nginx配置SHA一致，仅证明本机旧站保持。Guard不重跑、不删除数据库；服务原unless-stopped重启策略仍存在，不能表述为进程失败不会重启。

新鲜电脑匿名公网请求另发现：api-test.dosorobotics.com的HTTP返回403、Server=Beaver、title=Non-compliance ICP Filing；同一IP以inovxio.com Host对照也是该类403。HTTPS未通过，未关闭证书校验。阿里云官方文档说明未备案或未完成接入等状态可能阻断80/443及接口；具体订单/备案子状态待控制台核对，不从403猜测是哪一项。此证据不用于倒推旧Supabase域名TLS reset的原因。不得用换端口、IP或证书绕过备案限制。

当前只完成内部核心健康和SMTP认证，尚未完成真实验证码投递、signup验证、密码登录、DOSO会话函数/业务schema及App新地址验收。下一项是用户在本地输入新测试账号与验证码，完成内部Auth流程，同时核对备案接入；不将内部可达当公网或G20登录通过。原账号/生产数据未读未迁，本聊天未改App/G20/机器人，正式通过数不增，发布NO-GO保持。统一新证据：20261027-shadow-env-validation/install-01、smtp-input-01；20261027-shadow-runtime-01/core-reviewed-02/cloud-result.json及实图、公网匿名对照JSON。其他聊天的G20推进记录和历史证据不改。

## 2026-10-27 G20充电期间离线修复超时回调竞态，实机重读与声音仍待验证

森哥要求充电期间继续推进。未操作G20或机器人；当前安装包仍为已验证的code24，新源码尚未出包。G20InputSession此前仅依赖异步timer，若timer调度晚于SDK回调，超出1.5秒连接或300ms读取期限的回调可能抢先取消timer并进入下一步。新增回调当场用单调时钟复核原请求期限，回退或到期均失败并撤销会话；150ms输入新鲜度不变。此修复针对离线可复现的竞态，不声称已修复实机pre_settings无回包。

先用合成时钟复现旧实现失败，再修复；最终29组原生session case和7组实际adapter/模拟SDK回调隔离case分别通过，并编译实际Expo适配器与固定SDK。之前组合16项通过时session为28、adapter为6，随后各新增1项后分别复测，不将旧组合计数当成最终全量结果。源码SHA256 394201b9350f08e795db533289f5ec4fcfafe290ad9c3347b7a4568d6fe8f712，固定SDK AAR SHA256 e5977ba3292246bcee026defdb8563a18adc9d5573fdfb20a6880ee469f0fde2。证据 artifacts/release-readiness/20261027-g20-offline-deadline/result.json。

对SDK 1.9.2字节码的只读检查确认KeyManager使用进程级待执行/执行中映射，若同一请求ID仍在执行中新请求会等待；KeyChannelSettings继承SDK内部2秒超时，App自身是300ms，并无公开取消单次GET方法。旧请求占用队列可构成快速重试超时的候选机制，但历史实机未记录到旧SDK队列，不能确认就是该次故障。新复检也不能保证被同步阻塞的SDK调用按时返回。持续滴声来源、重复读取稳定性及实体摇杆/按键映射仍未验收，充电完成后再进行有界实机对照；没有新APK、设备音量/MCU设置更改或机器狗动作。

## 2026-10-27 G20已升级code24，首次持续采样有实证，重新读取仍有配置GET超时；按森哥要求静音

最新补充：一次全新DOSO进程对照恢复10秒真实读取，前8帧间隔94–117ms、requestAge33–67ms；不证明同进程重读已修复。此时森哥确认仍持续滴滴响，停止后安静；Android媒体/操作音量复核仍0，故此前短测“安静”不能作为解决声音问题的证据，持续采样声音判定未通过。随后Android电池报告1%、3409mV、USB充电；尚不能据此唯一判定为低电量报警。未修改MCU按键音/长按/告警设置。森哥明确先充电、待会继续，已保持“未读取”并暂停本轮设备调试，等待用户续接，不再自动发起采样或构建。

正常单次code24构建通过，资源9576164KiB、bundle/assemble/success均完成、inputDrift0、锁清理成功；构建后整份输入清单重新核对零漂移。APK 80810816bytes、SHA256 4903d35e76f27678c65ffeefe397d2d295fa21bb92989b3d9496ec92a3df4b6a，包名/入口/双ABI及签名与code23一致，公开配置仅内存比对一致，DEX有固定原生诊断tag。保留数据adb install -r成功，设备新读code24/UID10173/首次安装时间保持，base.apk与留存包一致。包 releases/20261027/DOSO-0.0.1-qa-code24-4903d35e.apk。

修复旧流程“五次串行GET完成后再固定等100ms”的排程：下一帧先读取配置，在实际KeyChannels请求前补足距前次请求100ms的剩余时间；不并发、不积压，停止/换代/销毁可取消。150ms新鲜度、前后配置复核及300ms/1500ms期限保持。固定时序诊断限每run前8帧48条加终止1条，无账号、原始通道、配置值或异常详情。实际Kotlin26组session、6组adapter及SDK/Expo编译通过，独立APPROVE_SOURCE；合成时钟不当硬件证据。

实机首个code24会话10秒安静窗口后UI仍“正在读取”，提前采集的前8帧间隔99–109ms、requestAge34–51ms，无终止事件；稍后同一run终止记录为stopped、sequence260、requestAge85ms，UI“未读取”且无错误。终止具体原因未采集，不推断为用户、后台或SDK；原始拨杆/按键操作仍没有同步变化证据，方向/映射未验收。

森哥反馈读取期间持续滴滴响后，已保持读取暂停并按明确静音请求用Android标准音量接口将媒体STREAM3实际15/15→0、操作提示STREAM1 7/7→0；告警STREAM4仍7/7，未改MCU按键音、遥控映射或固件。用户短测反馈“测试时已经安静”。该次重新start实际在pre_settings阶段301ms超时，sequence0、无采样，不能以此次安静证明持续采样时声音完全验收，也不能宣称所有重读稳定。没有循环重试；继续核查同进程SDK重连生命周期。

本轮机器狗保持关机，无机器人连接、校验学习、控制租约、使能或动作。证据 artifacts/release-readiness/20261027-g20-offline-input-check/ 中code24读数/安装/生命周期、音量调整、用户确认及phase JSON。持续实体输入与动作验收仍未完成，发布NO-GO保持；下一项为重读配置GET超时及稳定后实际摇杆/按键变化验证。

## 2026-10-27 G20 code23已安装，实读定位到JS输入更新间隔超时，尚未取得连续摇杆输入

code23正常构建成功并保留数据覆盖安装，留存APK SHA256 419b8233a07ddb625f57c22ffaca4a27ba6a20c09e7580a2a332a7bf0a73d8e8，80810820bytes；设备新读versionCode23/UID10173，首次安装时间保持，设备base.apk SHA与留存包一致。原生/JS白名单诊断与启动旧帧处理包含于该包，未放宽150ms输入时效。

单次本机读取结果为“读取失败 / G20 输入更新中断，请重新读取”，来自code23已区分的JS看门狗路径：至少一帧通过解析和native freshness后，JS在下一次检查时发现距已接受帧超过150ms。尚不能仅据此断言是SDK读取慢、主线程/JS排队或两者叠加；五次串行GET加完成后100ms等待为待量测的具体链路。不能将此前森哥“已操作”算成拨杆/按键通过，也不在连续输入建立前要求重复操作。

本轮机器狗保持关机，无机器人连接、校验/学习、遥控器设置修改或动作。新证据 artifacts/release-readiness/20261027-g20-offline-input-check/{code23-read-result.json,code23-installed-result.json,code23-input-result.png}。下一步为有界采样时序定位，完整实体摇杆/按键与code21后动作实机验收仍未通过。

## 2026-10-27 G20本机输入code22复测进入过期路径，code23启动旧帧处理待出包验证

code22诊断小包按正常门构建成功，资源6907284KiB、inputDrift0、锁清理成功，80810708bytes、SHA256 4ba7f25b99ae3ac9a71571119f3981ab99fb9cebf1190be56a715e3004053eec；包名/启动入口/双ABI及签名与code21一致，公开配置仅内存比对一致、bundle确有具体错误提示。保留数据覆盖安装成功，实际dumpsys code22/UID10173/首次安装时间保持。未改SDK、原生采样时序、遥控器配置或150ms门禁。

仅一次本机读取复测，没有连接机器人、校验学习或动作。结果为“读取失败 / 输入已过期，请重新读取”，证据code22-read-result.json及实图。该固定文案同时来自nativeFresh拒绝与JS读取更新>150ms，不能唯一定位分支，也不能与code21的泛化native停止判定同根因；只能确认经过解析后的输入时效路径，未取得连续可验证通道，G20实体输入仍未通过。

code23最小修复：仅首次fresh之前（sequence0、starting、未reading）丢弃native判失效的旧采样，不能写generation/sequence/时间或发下游事件，也不能延长原3秒启动期限；首fresh后仍原150ms停止。两处固定提示分别改为“G20 当前采样已失效”与“G20 输入更新中断”，用于后续区分。42项组合与TypeScript通过，独立APPROVE_SOURCE；不声称它已经解决真机失败。当前只启动一个正常code23构建，待结果/安装/一次复验。根最新原生hook SHA6c563ac1a003ac7ef6d0c4df49f7ae7bbfe9fe5ccd0834a4facc8496b5f57877，测试8129bfaef69c1780871719e30fe2fea50ed4c63549263f7c996091d64dcb2009。

多机型只读核查：src/models.ts有THUNDER01/MINI/PRO/SCOUT四个展示型号，选型不切换真实协议；当前关节语义固定12腿关节+4足轮，实际通道固定Brainstem gRPC；遥控器适配明确仅G20。不能称四款机器人或其他云卓型号已真实兼容。后续同协议机型需验证关节布局/坐标/速度/动作能力，其他厂家需协议适配，其他遥控器需输入来源与映射。当前优先完成本机G20输入，不增加无目标泛化框架。新证据 artifacts/release-readiness/20261027-g20-offline-input-check/；正式运动与发布NO-GO保持。

## 2026-10-27 code21机器狗关机场景的G20本机输入复验失败，正在保留具体原生原因

森哥要求不启动机器狗测试G20接入。本轮新读安装仍code21/UID10173，控制页未选机器人目标；仅打开G20输入面板并点一次读取，用户随后报告已拨动两侧摇杆并按键。实际UI为“读取失败 / G20 输入已停止”，没有取得可验证的原始通道，不能把用户已操作或本地模块存在当接入通过。没有连接机器狗、申请租约、运动、学习映射、改遥控配置或固件。

读到设备Build.MODEL=Bengal for arm64、ro.boot.ZBBoard=0、arm64-v8a；与已审固定SDK的G20识别分支一致，但仍不能证明SDK连接/采样成功。有限logcat标记计数未观察到linkage exception，未保留raw日志。源码实证useG20Input把native error/unavailable/stopped及reason全部归为一句，随后stop覆盖原生状态。独立只读复现六种reason均丢失，当前不足以区分连接、读取、配置或SDK故障；不能猜测根因或放宽150ms安全新鲜度。

最小后续为start结果/onState失败入口使用白名单中文原因，保留首次错误，未知异常不显示。该诊断改动尚未安装；先离线测试再正常出包，随后一次只读复验取真实原因，暂不要求用户重复拨杆。第一现场证据 artifacts/release-readiness/20261027-g20-offline-input-check/first-read-result.json。code21已安装和机器人四项查询的历史通过事实保持，本轮G20实体输入验收判定为未通过。

## 2026-10-27 G20已保留数据升级code21，动作事务与真实策略菜单修复完成，待新一轮实机复验

code21正常第二次构建实际成功：资源门11712076KiB、buildStarts1、bundleExecuted/assembleCompleted/buildSuccessful均true、inputDrift0、旧留存包未改、锁清理成功。源码审查后及构建后整份输入manifest再次对比零漂移。包80809540bytes、SHA256 c6a33f2d2975a84d22324b932ab90791fcff5961e69ca22910fb15d747355d56，com.doso.robot.qa code21/0.0.1-qa，arm64-v8a与x86_64，签名fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c与code20一致。JS bundle已变更、公开配置与code20一致，仅在内存核对，未输出或持久化配置值。

实际adb install -r成功，设备dumpsys确认code21、UID10173与首次安装时间保持；设备base.apk SHA与已留存包逐字节身份一致。已正常启动并打开设备测试控制页，在未选目标/未连接状态下确认双摇杆、站立、坐下、电机操作均禁用，保存code21离线实图和安装证据。本阶段未连接机器狗、未发使能或运动；原数据未清。留存包 releases/20261027/DOSO-0.0.1-qa-code21-c6a33f2d.apk。

动作事务已在首个等待readDone前占位；新鲜度过期仍使电机/姿态未知并锁定操作，但不提前抹掉正在等待回执的动作。读取完成/发布通知后、真正发送前复检epoch、目标、事务、freshness及状态；中断/断开取消排队动作，旧connect/Acquire/interrupt收尾不会释放新动作锁。横屏模式菜单支持真机返回的实际策略ID及当前项，不猜测模型文件与地形映射，保留滚动、切换确认与门禁。

负责人组合122/122、独立session39/39、最终TypeScript exit0；独立复审APPROVE_SOURCE及冻结SHA留存。最初只覆盖原生等待、后来发现readDone等待/通知重入/旧finally边界的历史检查与中断构建均保留，不能用早期119项报告代替最终122项。证据 artifacts/release-readiness/20261027-g20-app-control-completion/{code21-source-review.json,code21-verified-tests.log,code21-apk-metadata.json,code21-installed-offline.json}。

机器狗端无手柄策略初始化、四项查询、16电机详情与code20使能/失能反馈为此前真实通过事实；code21新的动作回执修复、实际策略菜单尚需下一次开机复验。用户最新询问是否需要开机，已明确代码修复/出包可离线完成；新一轮使能、姿态与低速运动须在当次现场条件核对后逐项验证。最后实际失能反馈仍是01:35历史证据，不当作此刻机器人状态；没有为此次离线升级重新连接或启动机器人。正式发布与运动验收仍NO-GO。

## 2026-10-27 G20已保留数据升级code20，四项查询及16电机详情接通，code21补修仍推进

机器人当前部署隔离源 /home/sunrise/doso_app_profiles_20261027：在真机既有LAN/串口修复基础上补无手柄ProfileManager与状态增益接线；手柄热插仅在落地/失能时接入并沿用当前策略，更新gRPC服务引用。Dart分析零问题，95项相关测试通过，完整dart build cli成功，binary SHA256 3d7442eb80c9412dc005fd307776a61b92b27c0ab6745432fc016a0a726a4482。未覆盖D:/inovxio/brain/brainstem的其他执行者源码/CAN/标定/模型文件；已部署补丁与源码身份在独立证据留存。本地canonical已有另一套解耦实现，不把两套源码混为同一构建。

01:20 G20 code19实际四项GetControlStatus/GetProfile/GetVoltage/GetMotorStatus读取均通过：落地、无控制者、未使能，真实W5策略描述，51.7–53.1V，16/16在线。四项只读监督目标完成，已删除g20自动监督，不再重复旧TLS/LAN故障。

code20正常单次构建成功，4302964KiB资源门通过、inputDrift0、原包未改、锁清理成功。新包80808928bytes，SHA256 c17fc91fd8475045337a7d6357f70cf3ead5bd6646a17ca937940d57bab1298d，package com.doso.robot.qa，arm64-v8a/x86_64，签名与code19一致。01:25实际adb install -r成功，UID10173与首次安装时间均保持，未清数据；首次全屏系统提示已正常关闭，未见AndroidRuntime崩溃。原生错误分类新增unimplemented，LAN查询不再一概显示网络错误；35项页面、29项服务测试及类型检查通过，原生桥接测试通过事实单列，不以早期含失败总日志冒充全套绿。

code20实机控制页已连真机，逐页实际查看全部16个电机的位置/温度/电压/速度/力矩，保留首尾截图、可见行与补漏证据。轮体速度和无线信号仍未知，视频未配置，不虚构遥测。模式菜单实机仍只展示flat/stairs/platform约定项，真机使用实际策略ID导致不可选，code21已补真实策略目录滚动菜单与确认门禁，尚未安装。

森哥明确要求远程解除并确认稳固支撑/可立即断电后，已将unit中的HAN_DOG_ALLOW_MOTOR_ENABLE置true；重启仍未自动使能，PID41280、重启0。01:34经G20确认使能真实成功；01:35确认失能，服务日志验证全部16电机新鲜失能反馈。未请求站立、坐下、控制租约或非零速度。使能后UI曾提前显示“结果未确认”但实时状态已使能：发现1.5秒遥测新鲜度与动作事务混用；code21修复中，不能称动作回执/运动已验收。最后确认输出为失能是01:35历史观察，不代表此刻开机状态；当前用户询问是否开机，代码修复无需开机，继续实机动作前须重新核实现场。

code21第一次正常构建因独立审查发现“等待已有readDone时尚未占位，界面可能退休请求后才发动作”的进一步缺陷而主动终止；仅终止经PID与父子关系核对的本任务编译树。launcher记build_failed、inputDrift0、lockCleanup succeeded、无候选，不采用中断包。相关菜单夹具补readiness后104项通过；动作事务进一步修复与复核、第二次新构建尚未完成。后续需更新包并重新验证回执，现场异常反馈尚待森哥回复。证据 artifacts/release-readiness/20261027-g20-app-control-completion/；发布NO-GO与运动验收未完成保持。

## 2026-10-27 11:37 国内测试后端继续推进：9/11镜像，新环境配置工具复审通过，服务未启动

新域名为 `api-test.dosorobotics.com`，用途是独立上海测试后端的API origin，不是官网或已切换的APK地址。已批准A记录仍指向47.103.89.137；本轮系统DNS再次核对匹配，原官网/邮件解析和原App服务地址未动。DNS不代替可信HTTPS或登录验收。

单次剩余两项镜像任务t-sh07183acii1gjk于01:17:16—01:17:25整体exit1：Realtime ECR固定RepoDigest/linux-amd64通过，imgproxy候选registry_denied。累计真实镜像9/11，仍缺Envoy/API网关、imgproxy原镜像。第五层仅将Realtime改为成功ECR来源，11个原digest不变；SHA256 9fec244596d9a6da27de1c12961e5fdba853da0e808f1f34ca4db2a096e929e8，本地真实五层Compose仍11默认服务、Caddy不启、唯一host端口127.0.0.1:18000。新证据20261027-ecr-remaining-two/，旧8/11汇总保持不变；独立只读核对9个成功来源与当前覆盖一致。

同版本Envoy v1.39.1官方release文件已在电脑取得并核对105039832bytes、SHA256 002c6e1c69ed0fa0ea381887247cadadfaec9481375fa8d8d2b1731eeabf40b8、ELF amd64；它不是原OCI镜像，未执行。服务器单次获取任务t-sh0719mbys54tmo于11:34:19—11:37:20实际exit1，首尾与嵌套源码9483d3931f3fdfcc40f8f11aeea79f56f2290af4b8b820505d9c57c9c5f695c0匹配；结果asset_download_or_identity_failed，未证明文件可用，输出不足以细分网络/读取/身份校验阶段，不猜具体原因。代码已先修总时限和TERM清理，经4项离线检查及独立APPROVE_SCOPE才提交；强杀/不可中断IO不保证清理边界保留。未重复下载或运行binary，证据20261027-envoy-server-asset/。云结果为规范化可见DOM，不冒称原始stdout。

新增prepare-shadow-env.py与generate-shadow-keys.mjs，保留官方密钥格式，以已下载固定Node镜像的无网络/无日志私有pipe生成；目标只允许root0700空目录中独占创建0600新env，旧env/账号不读不改。先前CID清理归属、密钥边界校验两项阻断已修，Node2/2及Python11/11新鲜离线测试和独立源码APPROVE_SCOPE通过；Python仅验HS256真签名及ES256结构，Node实际ES256验签。SMTP样例全部移除，工具明确pending_smtp/can_start=false。源码身份与限制在20261027-shadow-env-validation/；真实main、部署密钥、服务器env、SMTP配置均未执行。

当前可以在真实SMTP和安全env就绪后先验证db/auth/rest内部健康，不需要把11/11当作此子步骤的前提；Functions仍依赖网关。已向森哥具体请求新测试路径/密钥保存范围确认，并等待已有DirectMail密码是否可供本地安全输入；不在聊天收取密码。没有生产迁移/SQL/RLS、服务启动、HTTPS或App地址切换、新APK/G20安装，本轮不操作机器人。全部下载任务已结束，正式通过数不增加，发布NO-GO保持。

## 2026-10-27 00:27 G20 与真机 LAN 已对齐，三项读取通过，策略查询仍阻断

森哥明确要求开始对齐后，本聊天在真机当前源码的隔离副本应用既有五文件 LAN 补丁，逐项 before/after SHA 核对一致；未覆盖原工作源码、CAN配置、标定或策略。真机 Dart 分析零问题、76项针对性测试通过，dart build cli完整原生bundle构建成功。保留另一会话LD_PRELOAD串口修复与原WorkingDirectory/EnvironmentFiles，备份旧unit后仅切换新bundle并增加显式LAN配置；服务重启涉及正常硬件初始化，不称全程只读。新binary SHA256 fa870b7005ce214ee76242910902cc1b0569291f6e264af335a6a2199e35aa70；PID29465 active/running、NRestarts0，监听192.168.66.64:13145。实际进程环境确认lan-dev、允许来源192.168.66.62/94、HAN_DOG_ALLOW_MOTOR_ENABLE=false、Web控制false。

G20实际仍code19、IP192.168.66.94。00:27:18发起高级设置robot-grpc-read，00:27:21—28的新鲜UI显示：GetControlStatus落地、无控制者、电机未使能、无严重故障；GetVoltage52.5–53.9V；GetMotorStatus16/16在线。GetProfile未通过：服务日志明确UNIMPLEMENTED Profiles not configured。根因是当前真机启动代码仅在有本地手柄时创建ProfileManager；未检测到/dev/yunzhuo或/dev/input/js0时管理器为空。App将该服务端错误泛化为LAN网络错误，待修复。故传输对齐完成，四项验收为3/4，不能称策略/运动控制或可靠性验收完成。正式发布NO-GO保持。

证据：artifacts/release-readiness/20261027-g20-lan-alignment/。最初两次UI投影漏掉Android同级文本，保留空投影，不据此判定通过；第三次保存可见诊断文本与时间。未申请租约、未发使能/姿态/运动请求，未改账号和数据，未升级APK。下一项是无手柄时策略管理初始化解耦及服务端错误准确显示。监督任务已更新新基线，不再重复TLS/LAN旧故障。
## 2026-10-27 00:07 G20 App实际只读复核仍未接通

森哥询问当前gRPC能否通信后重新从G20核查：设备在线、com.doso.robot.qa仍code19，App明确选用LAN模式；同G20到192.168.66.64:13145实际TCP连接、TLS ServerHello和证书均可达，严格校验证书curl60，未关闭校验。随后仅点击一次高级设置robot-grpc-read，00:07:04—00:07:10实机仍报“局域网连接检查失败，请核对私有 IPv4、服务端口与来源许可。”，没有状态观察值。服务端TLS与App LAN方式不一致仍未消除，四项真实读取未通过；端口可达不算App接通。新证据artifacts/release-readiness/20261027-g20-grpc-check/{initial-observation.json,app-check-now.json}。本聊天继续只监督，不接管另一会话的机器人修改；未申请租约、使能、运动或更改服务/网络/标定，发布NO-GO保持。

## 2026-10-26 G20真实只读连接监督：服务已恢复，LAN/TLS不一致仍未通过

实际ADB确认G20 9f2679cd在线、192.168.66.94、com.doso.robot.qa code19，APK SHA256 2c7a7128ec7cf84d08edbb916373101c8ed9757471c513469703db0860b92c94与留存一致。App高级设置仅执行robot-grpc-read，初次13145拒绝连接。最初nc退出0的连通误判已由network-probe-correction.json明确撤销，不能采用；未覆盖旧证据。

固定SSH信任认证后读取到旧服务未运行/启动失败；核对期间另一执行者切换至control_mode_restore_20261026，新包曾因CSerialPortMalloc NativeAssets错误退出。启动前保护检测到配置变化，本聊天未发送systemctl start。森哥明确另一会话继续修改，本聊天只监督。23:22/23:31实读service active/running、PID17930、NRestarts0，13145监听属于该进程；binary SHA256 088489f63924800b2fc070322b62583cdcb57725ea85548d8995cefa78abfcb5，启动命令强制电机许可false。服务恢复不由本聊天操作。

服务恢复后G20在grpc-lan模式仅重试一次只读检查，仍失败且无诊断值；同G20严格TLS探测实际收到ServerHello/证书、curl60，未关闭证书校验。结合服务TLS配置与监听归属，当前明确是服务端TLS与App LAN明文方式不一致。四项真实读取、控制和可靠性均未通过，不把进程/端口成功当App接通。证据artifacts/release-readiness/20261026-g20-real-connection/README.md及逐项JSON。机器人服务/配置/CAN/标定变更、租约与运动请求均0；仅设置G20本机目标IP及只读检查。当前聊天已建五分钟只读监督g20，旧doso-ai仍PAUSED；待负责会话名称/链接后按森哥授权同步接口差异，不接管修改。发布NO-GO/正式实机通过数保持。

## 2026-10-27 测试域名已核验，国内后端8/11镜像就绪，服务尚未启动

森哥明确批准新增测试 A 记录后，已在阿里云实际提交 `api-test.dosorobotics.com → 47.103.89.137`，TTL600秒、启用，创建时间2026-10-26 23:43:10（UTC+8）。列表逐字段核对正确；系统DNS及权威dns21.hichina.com禁递归查询均返回同一A值/TTL600（23:53:25）。只证明这两条解析路径，不等于全球传播或HTTPS通过。原官网、邮件记录及App服务地址未改。证据attempt05/dns-api-test-committed.{json,png}。此前误将未提交确认页且TTL1010的截图标成created，现以dns-verification-correction.json明确撤销；旧文件保留，不作为成功证据。

Docker/Compose安装成功事实保持。首个Auth镜像实际下载/平台/digest核验通过；随后单次剩余10镜像任务t-sh0717vj6phq41s于23:50:20启动、次日00:10:08结束，exit1且完整首尾标记齐全：Studio、Storage、DB三项成功，API网关/PostgREST的Google缓存network_timeout，Realtime、imgproxy、Meta、Functions、Supavisor单项180秒pull_timeout。合计4/11项实际就绪，7项未通过；完整逐项结果pull-remaining-result.json、stdout及实图保留。未重复提交批次，不把manifest一致当镜像层就绪。Supabase容器未启动、旧账号/数据库/认证配置未迁移，App/G20仍未切新服务。

PostgREST已另核对Supabase官方ECR同一amd64 manifest字节，单次上海新来源任务t-sh0717zasmemuio于00:32:33至00:32:44实际exit0，RepoDigest/平台一致，累计5/11镜像就绪。新证据20261027-ecr-rest-probe/cloud-result.json与实图；短输出采用完整可见DOM JSON并标准化NBSP，不冒称保存了原始stdout字节。该探针首次外层CRLF与记录SHA不符，在提交前独立复审发现、改LF并复核嵌套身份后才执行；旧差异保存在line-ending-correction.json。

最后三个已核实ECR来源的单次任务t-sh07180mu21awhs于00:47:31至00:50:08完成exit0：Meta、Functions、Supavisor三项实际RepoDigest/平台均与固定原版一致，累计8/11镜像就绪。证据20261027-ecr-followup/cloud-result.json、cloud-output-rendered.txt及实图，均明确DOM渲染证据边界。新第五层覆盖把REST/Meta/Functions/Supavisor四来源改为ECR，11个原digest不变；本机真实Compose五层解析11默认服务、Caddy默认不启、仅127.0.0.1:18000，未启动引擎或容器。覆盖SHA256 d52bdcdb970b46b65d50ac003474daf15ec30479dfef6d80c40b03b0ad54fe86，验证image-overlay-validation.json；旧覆盖不改，不冒称新配置已在服务器落盘。

当前仍缺Envoy/API网关、Realtime、imgproxy。Envoy的官方组织GHCR候选未核实。电脑使用官方校验和一致的crane0.22.1做一次daemonless Envoy导出，exit1且未形成归档，不能称离线转存通过或猜测具体失败原因。Workbench免密连接已实际建立后关闭临时会话，未上传文件、重设密码或新开端口。对应新证据20261027-envoy-offline-transfer/。Realtime/imgproxy的ECR manifest本机单次20秒超时，未认定对应固定版本可用，未再开启新下载批次。

独立审查发现官方生成脚本用HMAC/Node及sed参数携带密钥，单纯重定向stdout不足；量产文档已撤销原样执行建议，后续须安全stdin/私有pipe/新0600环境文件适配并复核，JWT_JWKS含oct密钥也不向App公开。第五层镜像覆盖和--pull never已纳入文档，防止Compose重新请求旧Hub标签。DirectMail已有历史服务证据，但新服务器尚未配置/真实投递。本轮所有已启动下载任务均已结束，没有重复运行或遗留构建。下一步为剩余三镜像的受控获取、安全新环境配置、可信HTTPS与隔离测试账号链；原网络登录故障仍未关闭，正式通过数不增加。

## 2026-10-26 上海服务器 Docker 运行环境已真实安装，Supabase 后端尚未启动

森哥明确要求开始部署独立测试后端。本轮经云命令助手实际执行正常Ubuntu官方包首装，最终attempt05完成exit0：Docker29.1.3、Compose2.40.3+ds1-0ubuntu1~22.04.1，源码SHA72625b3625157ba351cd8b4d1f5a962e3b361b48b6e8d7aab08ce3a655388b94。完整stdout带成功与首尾标记，官网HTTP200/内容哈希和Nginx完整配置哈希前后一致、容器0、Docker无TCP监听。Docker正常建立自身内部bridge/NAT网络，未手工flush规则、改云入站或给用户增加docker组权限。证据20261026-aliyun-backend-deployment-attempt05/{bootstrap-install-result.json,bootstrap-success-output.txt,bootstrap-success.png}；不能据此称Supabase或登录已部署通过。

前四次均在apt前停止，旧失败保留：标准os-release symlink误拒绝；默认UFW六跳转被当转发业务；实际IPv6 type129变体；Ubuntu nft把xt模块呈null的表示差异。依据真实逐项诊断修复，保留双族转发关闭、无桥/容器冲突、完整canonical规则与nft闭包、未知附加表达式拒绝、apt只装审定新依赖和旧站保护。最终源码9/9、29组双视图样本，独立实际闭包/攻击反例与封装身份复核通过；这些是部署工具验证，不增加正式App或硬件通过数。

固定11项amd64镜像已通过本机只读manifest身份核对：9项GHCR与官方Hub同digest；Envoy/PostgREST的Google官方缓存也与官方源digest及Raw字节SHA一致。仅manifest验证，上海实际镜像层拉取尚未验收；本机Docker引擎未启动。域名管理中已确认dosorobotics.com，api-test A→上海主机的草稿已填并截图但未提交；没有开通付费DNS或更改现有记录。下一项为首个固定镜像的真实下载，再配置隔离测试后端与HTTPS；生产账号、SQL/RLS/触发器、SMTP凭据、App/G20配置、机器人和标定均未改，发布NO-GO保持。

## 2026-10-26 已确认上海现有服务器，完成只读预检与旧站兼容部署材料

已在森哥登录的阿里云账号内找到运行中的 Ubuntu-imon：华东2上海、2 vCPU/4 GiB/50 GiB ESSD，到期2027-03-11；无需先购买新服务器。两次真实云命令执行exit0且输出起止标记完整：主机Ubuntu22.04.5/x86_64，实际可用内存约2.80GiB、根盘可用42.23GiB、无swap，Docker未安装；Nginx80正在承载inovxio.com/www站点，本机HTTP200。实例与IP、命令执行ID及实图保存在Git忽略证据20261026-aliyun-server-inventory/，不写入公开模板。创建了两条云命令记录，未改主机应用配置、旧站、账号数据、DNS、防火墙或密码。

上海主机匿名访问原Auth和account-sessions均HTTP401且证书校验正常，只证明该路径可达，不是登录成功或国内迁移完成；Docker官方下载站200，DockerHub registry连接超时，镜像未拉取。普通SSH公钥拒绝，未重置密码或绕过信任检查，已用原有云命令助手完成预检。当前主机为小规模隔离测试候选，不凭购买规格称生产性能通过。

新增第四层compose.host-nginx.yml及独立Nginx模板，准备工具完整复制四模板；保留现有官网，默认Caddy不启动，仅127.0.0.1:18000发布网关，数据库/Studio/池连接器无宿主端口。专用状态日志排除URL、查询令牌、请求头和正文，避免Auth回调泄露。最终测试20/20、真实Compose5.1.0合并18项断言及独立APPROVE_SCOPE通过；reviewed候选与哈希单独保留，旧证据不改。未做nginx-t/真实TLS/WS/Auth/邮件验收。

量产部署文档DOSO_BACKEND_DEPLOYMENT.md与deploy/backend/README.md已同步四层命令和旧站保护流程。下一项为受控镜像获取、测试域名和可信HTTPS，再部署空的隔离测试后端；账号迁移仍须明确范围与权限核验。Docker安装/服务启动/账号迁移/App切换均未执行，G20仍code19、code20未构建；正式通过数和发布NO-GO保持。

四模板配置归档DOSO-backend-shanghai-config-v1.zip已生成，33项逐字节核对一致，80491bytes、SHA256 54c8fdcae2adcd2d4b196f41326fcf6826f0ac272b2bb725c5807aa55b22ca60；不含生产凭据/容器镜像。负责人复核四模板源码哈希及code20冻结38文件均零漂移。官方镜像替代源仅部分组件得到核实，未整体换源或购买ACR；镜像获取路径仍待实际验证，不以配置包代替运行验收。

## 2026-10-26 阿里云国内迁移开始核对，尚未执行数据迁移

森哥已登录阿里云并要求迁往中国内地。新查官方Deno函数/Secret、SMTP/OTP/模板及Cloud→RDS工具专门文档，优先核对RDS Supabase华东2（上海）；self-hosted/v0.8.3仅是已备Docker配置发布号，托管方案不依赖该包。已读登录控制台首页并看到上海轻量相关资源类别，未读到实例规格或RDS目标/报价。侧栏两次/Edge绑定一次超时；Windows Advanced可读首页，后续输入因前台微信被工具阻止，已暂停，不绕过窗口校验或反复提交。未下单、创建实例、授予角色、改白名单/DNS或迁移账号。

官方迁移v1.2包已下载并静态审查，不执行其validate/dry-run：默认public遗漏private，--no-acl/--no-owner不保留DOSO权限，Cloud示例默认Auth关闭，不能直接全量执行。App runtime支持标准URL/key，但QA出包门固定旧项目和publishable格式；确认新目标后才做明确配置适配，不绕过正常构建门。本轮保留原账号/数据与线上地址，code20运行源码和构建脚本未改。量产文档DOSO_BACKEND_DEPLOYMENT.md已更新，独立证据20261026-aliyun-rds-migration/；真实迁移/国内登录仍未验收，发布NO-GO保持。

下载包源代码与网页示例并不一致：实际配置/模型四条管道默认开启；dry-run/部分对象失败可能仍exit0，函数CLI分支使用源Cloud目标，WebUI默认公开且无认证，凭据日志/argv及路径处理存在阻断。故仅保存官方源码和静态审查，不运行该工具或WebUI，不把网页示例/exit0当迁移授权或结果。后续按明确目标的分阶段原生导出/恢复方案处理权限及对象metadata，不临时放宽RLS或删除原数据。

## 2026-10-26 国内后端部署材料已准备，原认证故障尚未关闭

按森哥要求重新查官方搭建路径：确认阿里云RDS Supabase托管与华为云Docker资源栈均有官方文档，前者的DOSO自定义函数/权限/OTP/动态客户端兼容性待核验，不把数据库托管当作完整登录可替换的证明。已准备官方稳定self-hosted/v0.8.3 commit bc27d2661edd09a5d0b8d76ce33da6d4071a756e的28文件源码锁、stdlib下载校验工具及DOSO Compose/Caddy overlay；17项测试与独立复审通过。Windows HTTPS下载官方字节后经Gitblob/SHA256/size三重校验，Node同源下载reset失败保留、不冒称CLI网络成功。真实Compose5.1.0合并解析12服务、仅Caddy80/TCP+443/TCP/UDP，网关/数据库/Studio不公开；这不是容器运行或公网服务通过。

材料位于deploy/backend/，量产步骤docs/production/DOSO_BACKEND_DEPLOYMENT.md，证据artifacts/release-readiness/20261026-selfhost-backend/。未找到可直接部署的确认服务器，本机Docker引擎未运行；未购资源、启动服务、拉镜像、生成凭据、导出账号、执行SQL/RLS/触发器或切DNS/App地址。邮箱验证码模板、旧Logo域名依赖、匹配SQL/Edge基线和现有账号迁移均单列验收门。G20仍code19；code20底栏修复构建尚未完成，原认证TLS/注册登录和真实机器人运动均未验收。正式通过数和发布NO-GO不变。

## 2026-10-26 code19免登录测试已安装；code20底栏遮挡修复完成验证，构建推进

本轮按用户截图确认Android底栏覆盖动作区，未以旧设计稿代替实机。根因在横屏沉浸区嵌套ScrollView/minHeight百分比导致输入面板往返后画布高于可用viewport。已改用实测画布高度并预留稳定导航bottom inset；仅主控制视图进入Android导航沉浸，子面板/后台/退出恢复，边缘滑动仍可显示系统栏。大字体沿原有滚动版式，视图/安全边界变化撤销旧输入。新增接口只操作窗口，不触及控制transport。

控制布局/行为80/80、服务边界28/28、TypeScript和production Kotlin实际编译通过；真实Expo bridge fixture包含稳定dp、原行为恢复、后台/前台/API29/销毁及零RPC反例，组合2/2。免登录入口此前45/45及独立复审已通过；后续导航独立复审因执行方不可用未完成，不冒称复审通过，由负责人检查并完成行为验证。code20运行/验证38项源码身份已冻结；G20当前仍code19，原始输入首次过期、真实LAN/运动未验收。

正常构建历史保留：attempt01因负责人提前写attempt文件而参数拒绝（未启动Gradle）；attempt02最终1529752KiB，preflight_stopped/buildStarts0/inputDrift0/锁清理成功。本轮新读5870504KiB、Java0、锁不存在，创建空attempt03使用正常启动器重新核验；配置仅从前次官方核验且独立验签/哈希一致的code19包读取公开publishable值到内存，禁回显/禁私有env。attempt03最终1464876KiB，preflight_stopped/buildStarts0/spawnAttempts0/inputDrift0/锁清理成功，无新APK或安装，不再循环重试。最后ADB只读确认仍code19；code20源码38项无漂移。出包须先释放用户程序占用后获得新的资源事实，未结束用户或其他任务进程。

认证网上核验支持优先排查项目域名/网络路径TLS终止，但不能定位RST源。Supabase官方仓库#1973是相似Windows/Android个案；CBC移除最早11月10日，不解释今天故障；Postgres白名单不控制Auth HTTPS，当前Management API事故也不是数据面pre-TLS重置的直接证据。账号、生产数据库、路由器、机器人/CAN配置及电机状态均未修改。

## 2026-10-26 code18已保数据安装，当前Wi-Fi认证TLS重置复现，QA设备测试入口推进

正常attempt02最终可用内存4742432KiB，Gradle一次成功、输入零漂移。候选完成独立签名/DEX/JNI/bundle核验，code18 APK SHA256 5ac44c0f1a7a00343fcefff665a8638e3e325c5d5ffa0b70945461cf2537c000，80800468bytes，保存在releases/20261026/DOSO-0.0.1-qa-code18-5ac44c0f.apk。已通过install -r由code16升级18，设备安装SHA匹配，UID10173/首次安装时间保持，冷启动ok；没有卸载、清数据或读取私有账号存储。证据20261026-lan-direct-control/qa-code18-attempt-02/{build-result.json,package.json,g20-install.json}。此前attempt01停止记录保持。原生LAN页面已观察，截图留存未成功，不能称已有实拍证据。

森哥报告当前Wi-Fi仍无法认证，明确要求先免登录测试。新鲜匿名只读探测：G20默认Wi-Fi有INTERNET/VALIDATED、无门户，项目Auth health与account-sessions均TCP通、ClientHello后reset/无ServerHello/无HTTP；官网对照证书正常/TLS1.3/HTTP200。电脑默认DNS/现代TLS及固定TLS1.2同项目均ECONNRESET，官网TLS成功；官方管理状态ACTIVE_HEALTHY/us-east-1。不能定位RST发送者或证明路由器封锁，不是账号密码已验证。诊断不含密钥、账号/登录请求，不改网络配置或关闭证书验证，见20261026-qa-device-entry-network/diagnosis/。网上原始Supabase Flutter #1973记录Windows/Android同类pre-HTTP失败，贡献者提出域名相关中间设备/大陆网络路径假设，不能据此证明本项目原因。官方CBC套件移除最早11月10日，早于该日故障不由该移除造成；数据库CIDR限制只用于Postgres/pooler；Management API当前事故不等于Auth接入端故障。完整来源和推论边界见diagnosis/research-findings.json。

本轮新增仅原生精确QA包的设备测试入口，复用真实控制/输入/连接页面，独立本地会话，不制造管理员身份或放宽云权限。45/45定向及TypeScript通过；独立审查发现隐藏账号页面仍占用G20输入，已加guest失活并补行为反例，复审APPROVE_SCOPE。源码App/Android code19、31项冻结身份，正常新attempt01最终可用4257376KiB并放行，Gradle一次成功/输入零漂移。候选SHA256 2c7a7128ec7cf84d08edbb916373101c8ed9757471c513469703db0860b92c94，80807968bytes，同历史签名、双ABI、DEX/SDK/JNI/真实bundle核验通过。已于13:05:37 install -r从18升级19，UID10173/首次安装时间保持、冷启动ok。原生实际点击免登录设备测试进入真实ControlScreen，离线动作/摇杆禁用，未提交云登录；原始SDK GET首次出现“输入已过期，请重新读取”，未取得有效通道验收。关闭输入面板后发现底部系统导航遮住动作dock，截图g20-code19-device-test.png保留为失败证据；当前继续修真实viewport与仅控制页导航沉浸，不能以隐藏栏掩盖越界。机器人未部署LAN、motorEnableAllowed仍false，没有连接/申请租约/使能/姿态/运动；正式通过数与发布NO-GO不变。

## 2026-10-26 code18新正常构建最终预检停止，G20在线仍code16

森哥明确要求保数据升级遥控器并验证摇杆。新读G20 9f2679cd在线、SDK33、com.doso.robot.qa code16/UID10173/首次安装时间保持；26项已核验源码零漂移，App/Android源码均code18。初读可用5056048KiB且无竞争任务后，使用既有正常qa-build-once创建全新attempt01；公开构建值只经官方只读来源核验并通过no-echo stdin送入，内存值随后清除。最终门禁降至2069244KiB，preflight_stopped/buildStarts0/spawnAttempts0/inputDrift0/lockCleanup succeeded，没有Gradle、新APK或安装，旧候选不采用。目录artifacts/release-readiness/20261026-lan-direct-control/qa-code18-attempt-01/保留结果及独立inspector静态自检，未对不存在的新候选宣称验签通过。

继续排查确认快照391项输入合计约59.06MiB，未发现可归属本任务的遗留Java/Gradle/测试JVM或headless浏览器，未结束用户应用/其他会话进程；宿主内存变动原因尚未确定，未降低4GiB门槛或循环重试。已请森哥保存工作并关闭不用程序；有新资源事实后才开新attempt。G20原生UI读取仅经stdout内存解析并固定标签脱敏，无XML磁盘副本/账号字段输出；当前未登录，未进入本机G20输入页，未取得真实通道值。摇杆SDK GET/16通道/四轴映射代码与原生编译已验证，但不能称本台实值通过。

本次功能范围重新列入DEVICE_ACCEPTANCE.md：核心手动控制和站坐/电机/策略接口已接；任务/路线/召回/视频和额外动作未构成完整真机闭环。机器人上次确认未开机，尚未部署LAN服务；既有motorEnableAllowed=false仍在，安装App不会解除。没有使能、电机/姿态/运动命令或账号/标定变更，发布NO-GO与正式实机通过数不变。

## 2026-10-26 免证书LAN直连源码完成，code18待构建，真机未开机

森哥明确要求当前阶段先不用握手/证书，先验证App控制功能。已同时修改App与Brainstem：QA默认IP直连，CSR/证书不再是主线前提；仅显式LAN模式使用h2c，TLS路径保留且不会失败自动降级。LAN仅精确QA包/规范私有IPv4，服务端指定LAN监听并对全部RPC限制工程来源。会话标签仅绑定租约owner，不冒充证书或账号验证；原有token/sequence/ACK/初始零速、50Hz、失联停止、物理遥控优先及明确电机使能门禁保持。

App162/162定向、TypeScript及production Kotlin/Expo编译通过；原生桥新增fixture曾泄漏watchdog，修复后定向1/1通过，失败记录保留。独立复审发现TLS租约门禁被放宽，已修共享校验及TLS/legacy反例，最终复审CLEAR。负责人收敛连接文案后34项页面回归通过（与162重叠，不相加）；最终26项源码/测试/版本文件身份已绑定。Brainstem canonical103项、实际分支候选76项及严格分析通过，包含本机私有IPv4真实h2c读取/拒绝来源；部署工具20项及独立复审通过，LAN不读取/上传PKI，旧TLS设置保留可恢复。以上均不冒称G20/真机通过。

源码App/Android versionCode18；最新已安装G20仍code16 a1ae7c574a9d80e16b17b34ac4cbd6c90c715a1c2bd3ca093a04e3f61448af18。最终资源门禁新读2607852KiB（约2.49GiB）/竞争任务0，低于4194304KiB；Gradle启动0、新APK0、安装0，没有为出包绕过门禁或结束用户程序。机器狗SSH曾超时，森哥随后确认目前未开机/暂不方便检查，因此部署0、真实LAN读取0、运动0。保留账号/标定/策略，motorEnableAllowed仍false。统一证据artifacts/release-readiness/20261026-lan-direct-control/（final-source-identity.json、resource-gate.json、release/、server-verification.json），App原始验证在artifacts/lan-dev-validation/；量产单机文档已将当前执行切为LAN，旧code16证书流程明确暂停。发布NO-GO/正式实机通过数不变。

## 2026-10-26 BLE配网离线两端切片完成；code16已保数据安装，旧CSR阶段按最新决定终止

按森哥询问USB蓝牙模块后如何让App给机器狗WiFi配网及能否模拟，新增tools/ble-provisioning-sim/独立工具，未加正式App模拟入口。App客户端/机器人服务通过有界ATT分片通信，复用既有配网domain，网络适配器仅内存模拟；成功止于verified-network-awaiting-bind/domain awaiting_confirmation，cloudBindingCommitted=false。USB/HCI、GATT与系统网络实际实现仍待接入，不把蓝牙可见或获得IP当成账号归属。

独立复审实证并关闭短GCM标签、旧会话回滚新候选、内部异常误当业务失败、跨会话旧IP证明、提交后虚假取消五类问题。修订22/22、五项语法、四固定合成场景CLI通过，根另实际运行all exit0；独立target反例APPROVE_SCOPE，不增加正式硬件通过数。证据tools/ble-provisioning-sim/evidence/result-reviewed-final.json、tests-reviewed-final.txt、security-review.md；旧16项及中间记录保留。README明确G20与新网互通、AP隔离和Android切网许可；生产协议、真实WiFi/回滚与提交ACK丢失恢复未验收。

本会话00:25已完成正常code16候选独立验签/DEX与bundle核验、留存并install-r由13升级16，UID10173与首次安装时间保持，冷启动成功。APK SHA256 a1ae7c574a9d80e16b17b34ac4cbd6c90c715a1c2bd3ca093a04e3f61448af18，80795104bytes；证据20261026-g20-local-identity-code16/qa-code16-attempt-02/。未卸载/清数据；不以安装身份保留代替逐条私有数据库审计。实机发现PinyinIME把编号横线变U+FF0D，最小提交NFKC/ASCII校验修复57/57+tsc0并独立复审，源码准备17；该唯一启动器最终2600428KiB，门禁停止、Gradle0/候选0，旧记录不覆盖。

随后核对「APP」中森哥最新人类指示：当前先做免证书局域网IP直连，证书/CSR等后置。旧G20编号/CSR问题与仅编号修复包不再由本会话继续；无需再回答之前填编号问题。本会话停止该分支设备/构建操作及跨聊天派任务，保留已完成NFKC和其他成果，后续App/Brainstem新包与G20统一由「APP」负责。本轮BLE模拟保持独立，不阻塞局域网开发，不代表当前App通信强制增加证书。未做真实BLE/WiFi、生产库/权限、账号或机器人运动改动，发布NO-GO不变。

## 2026-10-26 code16已保数据覆盖升级，量产文档归档与连接验收状态统一

本聊天核对既有执行方保存的attempt-02 package.json/g20-install.json：正常Gradle一次成功，候选包签名/内容核验通过，G20 com.doso.robot.qa由code13升级到code16并冷启动ok。APK SHA256 a1ae7c574a9d80e16b17b34ac4cbd6c90c715a1c2bd3ca093a04e3f61448af18；UID10173和首次安装时间保持，没有卸载、清数据或读取私有账号存储。证据路径artifacts/release-readiness/20261026-g20-local-identity-code16/qa-code16-attempt-02/。首次attempt-01仍是预检停止/Gradle0次，历史记录不改写。

统一产品方案正文已归docs/production/DOSO_DEVICE_OWNERSHIP_AND_PAIRING.md，旧runbook保留跳转；README、SINGLE_ROBOT_APP_ACCEPTANCE、ROBOT_BLE_PROVISIONING集中记录量产职责、当前单机主线与BLE真实前提。方案采用成熟生命周期原则，不声称所有厂商同一实现或DOSO已量产成熟。机器人当前系统无HCI控制器不等于物理无蓝牙，BLE仍待硬件匹配及实际GATT配网实现。

受控CSR签发/批准包最终48项及独立48项复测通过（重叠不相加），JDK证书解析互操作已核对，真实G20身份尚未在本聊天签发。新包包含G20输入、Brainstem控制客户端和本机身份接线，仍未形成G20自身份四项只读mTLS或动作通过证据。最近工程电脑真实mTLS读取仍是10月25日23:28，Grounded/电机输出false/租约false/accepted_count0，不能替代G20验收。用户最新要求停止两个聊天来回派任务，本聊天停止跨聊天追加派单，不重开构建或重复操作设备。账号、标定、策略与电机门禁未改，发布NO-GO及正式通过数不变。

## 2026-10-26 G20本机身份源码与定向核验完成，单次正常构建在最终资源门禁停止

按已授权跨会话分工，App新增AndroidKeyStore P256公开CSR/幂等身份、noBackup原子签发链录入和现有TLS接线。QA实际非debuggable，未修改构建flags；以MANAGE_DEBUGGING发送方权限保护5分钟前台显式工装receiver，限制包/目标/请求/代次/摘要，无网络注册或任意JS PEM。后台/取消清批准状态，旧磁盘文件不能自行授信。连接页仅高级设置最小入口，pending可幂等重开，ready不重复complete；四只读只有真实客户端证书请求+RPC成功且同叶才标握手已验证，不自动连接/租约/使能。

客户端55/55、TypeScript exit0；native最终运行源码真实SDK/Expo编译与其余5项于attempt03通过（该次整体5/6），最终证书/桥定向attempt05为1/1、exit0，分段不冒称单次6/6或实机通过。独立安全APPROVE_SCOPE，无未解高危。发现裸URI SAN可OpenSSL签发却被JDK拒绝，已协调签发端改合法URN，不放宽客户端校验。源码/测试SHA及失败阶段保留在artifacts/release-readiness/20261025-g20-local-identity/{client/result-final.json,native/final-result.json,security-review.md}。

G20新读仍com.doso.robot.qa code13、SDK33、UID10173、base.apk SHA23c372acbbee2d11b6120afeefd2ad0734785d3fa530c0d2adf806395224d2cd，无本轮新身份。独立资源检查先6810244KiB/竞争0，唯一正常启动器最终复检降到2004504KiB，故preflight_stopped、buildStarts0/spawnAttempts0、inputDrift0、锁清理成功；Gradle0、候选0、安装0。该尝试位于20261026-g20-local-identity-code16/qa-code16-attempt-01，不重用或自动循环。公开构建配置仅经既有授权来源/内存禁回显stdin传送并清除，未读.env/秘密配置。

用户功能问题已据实整理完整34项真机策略目录REAL_PROFILE_CATALOG.md：它来自10月25日工程身份实际GetProfile和operator_modes，不是34种正式模式或G20实读；平地/楼梯有槽，高台无映射，含失败/未硬件放行实验条目。BLE尚无业务GATT配网且机器人最近记录无hci，需硬件LE→认证加密下发→真实联网通知→IP身份核验。局域网主线继续优先。本轮无账号/生产库/云权限、机器人/CAN/服务、生产签发或运动操作，正式通过数不增加，发布NO-GO；下一项为资源就绪后新正常包保数据升级，再生成G20真实公开CSR及四只读mTLS验收。

## 2026-10-25 采用用户提供的四阶段绑定方案，明确认领事务差距

完整读取并保留用户提供的《机器狗绑定方案梳理》，统一主线为工厂建档、检测放行、用户认领、日常与售后；身份/联网/归属分离，工厂不认领到工作人员账号，套装G20预配不替代客户归属。明确换手机恢复列表但新终端独立授权，离线/恢复出厂不清云归属，解绑不删除档案，出厂测试权限须在交付前撤除。主文档docs/runbooks/DOSO_DEVICE_OWNERSHIP_AND_PAIRING.md及CONTEXT.md、Brainstem docs/PRODUCT_PAIRING.md已同步。

定点核查与独立架构审查确认：当前claim RPC先写owner并消费码，enrollment.begin却要求已是owner；目标“真机验证后确认归属”需限时待认领会话及原子提交，不可仅重排UI或移除校验。单账号单实体设备、共享及G20自动身份仍未完成。本轮仅文档修订/源码核对，未改运行代码、生产库/权限、机器人/G20或控制状态，不刷新历史硬件结论、不增加正式通过数。原文和决策记录见artifacts/release-readiness/20261025-binding-lifecycle-alignment/。

## 2026-10-25 多机/配对产品规则、官方手册与公开CSR签发子步骤完成

按森哥新请求，六份宇树/Spot/DJI官方手册已下载归档，共467页并保留来源/版本/SHA；宇树两份为官方原图汇编PDF，其他四份保留厂商PDF。账号多机、设备成员、编号存储、归属认领、终端配对、BLE配网和OTA规则写入CONTEXT.md及docs/runbooks/DOSO_DEVICE_OWNERSHIP_AND_PAIRING.md。源码核查确认当前仍有一账号一实体设备唯一索引/claim拒绝及App devices[0]，无共享成员；服务端可信入网有begin/attest/complete但App只接begin；BLE只有扫描/连接/服务发现；配网和OTA正式入口仍不可用。未把目标写成已实现。

Brainstem prepare_mtls_bundle.py新增--client-csr受控公开申请签发，默认dry-run，批准--client-san后输出仅client/CA公开证书和manifest，不搬运客户端私钥、不产生P12或要求导出密码。临时PKI全套30项通过，独立CSR12项及ruff/compile通过（重叠不相加）；复审修复混合CA PEM夹带私钥、CSR扩展伪造签名算法、SAN引号改写。仅受控本地签发已完成，G20端内密钥/回装和自动配对仍未验收，未签发生产身份或变更机器人授权主体/来源IP。

22:12—22:24固定SSH指纹只读检查：RDK S100 BlueZ运行但无hci控制器，btmgmt为0；hobot-bluetooth反复XM612固件加载超时，日志重试293，PCIe无线为RTL8822CE，模块/初始化匹配待核实。未刷固件/重启无线。Brainstem PID46122/NRestarts0、binary e59e83684d7c6edca69070e1caa435fdd3504806630099481f041da8044e1896；工程mTLS GetControlStatus/GetProfile/GetVoltage新读成功，Grounded、输出false、租约false、accepted_count0。34项策略实际目录与平地/楼梯槽位已保存，高台未绑定。不是G20连接验收。

公开台账、CSR客户端契约、策略目录、原始JSONL和代码哈希见artifacts/release-readiness/20261025-device-product-bootstrap/；未知正式SN/云UUID/制造公钥保持null。G20/App运行源码及构建安装、生产库迁移/权限、服务/标定/策略/电机/运动操作均0。Docker引擎不可用，未启动新数据库或执行迁移。下一步客户端接AndroidKeyStore与公开证书回装、做G20自身份只读验收，再完整改多机/共享和真实配网/OTA。发布NO-GO及正式通过数不变。

## 2026-10-25 App与真机release协议离线核验完成，已授权跨会话分工

森哥明确允许向「APP」会话同步并协调，已发送机器人端/身份签发工具与App/G20分工、单一设备操作权及只读联调边界。对方正在准备公开CSR申请签发工具，不能据此称自动配对已完成；用户暂停的手工P12密码/导入流程不重启。

本轮独立核对已部署release清单30/30文件哈希、App上轮审查20项源码/测试哈希均一致。用该release的cms.proto运行现有原生只读解析检查，完整日志3/3通过、0失败；上下文恢复后原执行句柄失效，外层退出码未恢复，证据明确留空且未重复启动。受审RPC/状态字段/租约与ACK未见冲突，不等于真实TLS或所有协议端到端通过。实际策略ID/模式槽映射仍待公开结果；关节MotorState.voltage占位不能用作真实电压，应读GetVoltage，不能虚构SOC/速度/RSSI。

当前缺口是G20独立身份和App正向mTLS，电脑工程身份不代替G20验收。下一步先明确并复用受控CSR签发与本机私钥接口，完成一台G20只读状态/策略/电压/关节；保持motorEnableAllowed=false，不申请真实控制租约或发送动作。本轮资源新读2690496KiB（约2.57GiB），未达既有4GiB门槛，构建0/安装0；code13仅引用前次观察，本轮未刷新设备状态。运行源码/云权限/账号数据/机器人RPC/CAN/身份签发改动0。证据artifacts/release-readiness/20261025-app-server-contract-review/README.md、result.json与原始日志；离线子步骤完成，实机接入与发布仍NO-GO，不增加正式通过数。

## 2026-10-25 配对交付研究：取消将手工P12导入作为量产用户流程

依据宇树官方Go2手册第9/11页、DJI对频指南及Spot官方手册/安全白皮书，区分设备身份、配网、用户授权和控制租约。产品建议为机器人身份与网络自动初始化，G20本机生成身份，套装可出厂预配；新增/更换通过一次授权，日常复用。厂商内部未公开的注入/PKI不作推断，mTLS不被描述成行业唯一选择。

具体职责、最小现有mTLS自动化顺序和量产差距记录在D:/inovxio/brain/brainstem/docs/PRODUCT_PAIRING.md。当前KeyChain仅选择已安装身份，CSR签发/自动录入/用户自助配对/完整撤销未实现；来源IP、热点及独立射频配对仍需各自验收。本轮仅文档研究与源码只读核对，无机器人/G20操作、身份签发、服务/权限变更、构建安装或控制RPC；不增加正式通过数，不刷新历史真机状态，发布结论不变。

## 2026-10-25 mTLS/租约已合入当前真机分支，工程客户端只读实测通过

按用户要求保留现有标定、策略和功能，从机器狗当前源码快照合入mTLS/租约及新版协议，保留mixed transport、操作模式槽、实际电机编码和Grounded保持，未整包覆盖为本地另一分支。协议通过生成器更新；租约失效强制轮停，控制器在途使能接入门禁，只读部署在gRPC与内部控制器入口都拒绝使能。远端受影响代码严格分析零issue，相关175项及CMS21项测试通过，原生构建部署成功。

新binary SHA256 e59e83684d7c6edca69070e1caa435fdd3504806630099481f041da8044e1896；brainstem.service active/enabled，PID46122、NRestarts0，0.0.0.0:13145使用双向TLS，内部Web仍回环，旧Web/proxy继续disabled。电脑独立工程身份实际通过mTLS读取Grounded、原策略、16在线电机和IMU；motor_output_enabled=false、grpc_lease_active=false、ready_for_walk=false、accepted_count0。无客户端证书连接被拒绝。未调用AcquireControl、Enable、Walk、姿态、切策略或置零RPC；服务启动执行既有失能/清故障/超时/上报配置，不能称零CAN写入。

G20实读仍code13，实际DEX支持KeyChain私有CA链及初次只读状态请求，TCP到新端口成功，但没有录入G20身份、没有App正向mTLS结果。用户认为逐台P12密码/导入过于复杂，明确先不按此工程搬运方式推进；量产身份批量写入与App自动配对仍未实现，不能冒充已交付。本轮仅工程探针身份，不持久化导出密码，不向G20或仓库发送生产私钥。

管理已落地：公开单机profile、带before/after哈希的源码release、证书签发/同CA追加客户端及可回滚部署脚本；同软件基线其他机器狗可用独立配置/PKI复现，拒绝覆盖不同源码，不携带标定/策略/模型。部署工具15项测试、证书工具17项测试及CA约束检查通过，生产CA与客户端私钥留在本地受保护目录，只部署服务端私钥600。证据artifacts/release-readiness/20261025-mtls-current/README.md、verified-result.json及原始只读记录。未重启验证、未构建安装APK或做运动验收；下一步简化身份录入并完成G20原生mTLS状态实测，发布NO-GO不变。

## 2026-10-25 19:45 新构建检查仍未过资源门槛，20项修复源码未漂移

森哥询问能否继续后重新检查：20项上轮验收源码/测试SHA全部一致，无需重复已通过套件；G20仍com.doso.robot.qa code13。新读空闲内存3034232KiB（约2.89GiB），低于既有4194304KiB门槛，竞争构建任务0，未启动Gradle或安装。只读进程检查未发现可停止的遗留构建/模拟器；未为释放内存结束用户应用或另一会话任务。

正常JBR21/SDK/构建目录、历史签名、候选独立核验及install-r保数据流程已整理到artifacts/release-readiness/20261025-app-build-resume/prepare.md；本轮新观测在resume-check.json。旧code16 execution失败记录保留，其buildStarts为null，不能说历史从未启动或复用旧输出。公开构建配置须在真正启动时按现有来源合同仅内存核验，未读取.env或密钥；本轮机器人/CAN/云变更0。修正源码已验证，出包与实机验收仍等待足够资源，发布结论不变。

## 2026-10-25 App顺序测试完成本地修复，新包停在4GiB资源门槛前

按森哥要求测试并修复App侧连接→关节诊断→返回、真实遥测与动作结果。诊断等待同一次停止确认并保留同设备查询身份，失败留原页；返回显式重连。修复旧账户名/另一IP快照混用、旧live端点残留，以及旧输入/迟到导航在换设备、弹层或后台往返后继续生效。停止未确认统一记录于当前连接代次，重复关闭/后台/失败重连不抹掉，新验证连接成功后旧清理不得污染它。

新增明确owner/endpoint/alias归属的现有只读RPC遥测hook，最早采集时间约束15秒有效期，只补真实电压/关节，不假造SOC/速度/RSSI。原生并发读取原本被busy拒绝、简单放行又会共队列阻塞控制，两份行为反例保留；最终同目标已批准身份白名单与独立只读executor已通过真实编译/假通道行为验证。动作提交后10秒未确认、断线、换目标/输入源均不当成完成，不自动重发；超时不等于设备停止或取消。

最终核心组合197/197、控制UI/布局/摇杆100/100、首页19/19、任务行为27/27、路线门禁3/3、G20离线含原生编译40/40、Brainstem原生编译/桥行为6/6通过，TypeScript exit0，独立复审APPROVE_SCOPE。组间重复不累加正式验收数；新增及各阶段失败日志、before/中间源码、最终SHA与完整范围在artifacts/release-readiness/20261025-app-sequential-tests/README.md和closeout.json。

测试结束后只读资源检查仍仅3681240KiB（约3.51GiB），低于现有构建门槛4GiB，冲突任务0；未启动Gradle，构建0/安装0。结束前ADB仍com.doso.robot.qa code13；源码配置16，尚无本轮新APK。新界面实拍、真实SDK/JNI值、认证弱网/正向mTLS和整机控制仍未验收。CAN/机器人配置由另一会话负责，本轮机器人RPC/CAN/服务/云权限/账号数据操作0，发布NO-GO不变。下一步释放资源后正常构建保数据升级，再做G20实机验证。

## 2026-10-25 19:05 CAN 映射已修复部署，独立 Brainstem 本机服务恢复

按用户要求保留已有标定并修改代码。本地入口改FR=usbbus2、FL=1、RR=4、RL=3，定点测试与严格分析通过，执行者另报告整包287项通过。远端实际源码含后续mixed transport、模式槽位和Grounded保持，未被本地整包覆盖；在其joint_transport.dart中同步修正实测腿/接口/USB表及默认分支，修复thunder-can-up.py路径检查并更新测试fixture。远端三文件严格分析、7项映射/启动测试通过，原生CLI新构建完成。

新binary为远端build/doso_mapping_20261025/bundle/bin/han_dog，SHA256 255947cc95b6396e8e892d889e93008edc11490559ee66a6455ec2f3be65fa65。独立brainstem.service已安装、enabled且实际active/running；复核PID28507、NRestarts=0，thunder-can active/exited、四CAN UP。旧thunder-web/proxy仍disabled/inactive，原配置和源码备份/var/backups/doso-mapping-20261025。原生只读RPC实读Grounded、原策略、关节和IMU；16电机均online且statusCode=0。未重新置零、保存标定或修改策略/模式绑定/账号数据；服务启动执行既有失能、清故障、上报与通信超时配置，不声称零CAN写入。

范围限制明确：远端旧分支没有mTLS与控制租约，故gRPC仅127.0.0.1:13145，并删除旧fuser-k抢端口。为保留现有无实体手柄的ProfileManager/gain路径，内部WebController仍回环监听127.0.0.1:8088；旧Web服务停用不等于移除全部Web代码。unit通过/usr/bin/env保证回环覆盖旧EnvironmentFile。未测试使能、姿态、模型切换或运动，未升级G20包，未实际重启验证自启。映射修复和本机服务恢复完成；G20外部控制与完整发布验收仍未完成，下一步将mTLS/租约实现合入当前远端功能分支再验证。证据artifacts/release-readiness/20261025-mapping-service/README.md、verified-result.json及原始jsonl/部署后源码快照。

## 2026-10-25 CAN移交另一会话，App下一步优先收敛连接/诊断、遥测和新包

按森哥指示停止本会话CAN推进。本轮ADB只读重查G20：com.doso.robot.qa仍code13/0.0.1-qa；发布目录最新保留code15，配置准备16，未构建安装。两项独立源码审查确认：关节诊断导航退出控制会话且使用账户设备名/另一份直连快照；控制连接后的runtimeState不含battery/signal且速度null，覆盖只读快照已有电压；动作accepted到目标状态之间缺明确终态等待期限和失联未确认处理。应先修同设备身份/只读诊断恢复、有效遥测来源和动作结果，再做G20真实输入/新包验收，不保留运动权限或重放旧输入。

实体SDK输入接线已存在，但100ms GET与150ms过期门槛需新APK现场量测，动态验证仍需隔离独立射频接收链/动力。任务生产执行器仍null、BLE实际绑定与视频接收器未完成，建议先收敛现有入口/空状态和G20横屏交互，再分别接真实能力。详细依据和顺序在artifacts/release-readiness/20261025-app-priority-review/README.md。

本轮App运行源码/机器人配置/SDK启动/构建安装/账号数据改动均0，未跑测试或宣称新包验收；只读审查与ADB版本观察不增加正式通过数。CAN保持交由另一会话，后续本会话只推进App。

## 2026-10-25 手转四轮完成 CAN 轮电机通道观察

用户确认机器狗固定支撑、四轮悬空、电机失能后，先进行6秒listen-only（四路零收发），再发送仅GET位置/运行模式请求，16个电机全部返回。随后按用户指定并确认的手转轮子采集轮电机ID4位置：左前FL→can0/1-2.1，右前FR→can1/1-2.2，左后RL→can2/1-2.3，右后RR→can3/3-2。每轮仅对应通道明显变化，其余通道范围小于0.0007rad。角度为电机原始mechPos，不冒充轮转角或里程。runMode读取不证明失能状态。

此前自动推进的round2时间窗未逐轮人工确认，保留原始记录但排除为物理映射依据；其中front-right标签窗口的can0变化不算右前结果。后三轮改为单轮独立采样并取得人工完成确认。四个有效观察构成一一对应，独立重复及每腿三个关节身份/方向/零点尚未验收。

采样结束均验证无清理错误、四路DOWN且listen-only关闭；暂设1Mbit配置只留当次内存。未写持久映射、启用新版服务或发送电机使能/失能、参数设置、姿态、运动指令，未改账号数据。旧Web/proxy仍停用，完整Brainstem/App实控仍未完成。证据与SHA256：artifacts/release-readiness/20261025-live-readonly/WHEEL_CHANNEL_OBSERVATIONS.md、wheel-channel-observations.json及其列明的四份jsonl。下一步据实测对应核对远端腿顺序和校准后审查部署，不直接沿用旧代码腿顺序。

## 2026-10-25 18:22 USB拓扑新实读：四CAN为一直插三Hub，另有直插串口

按森哥核实“两直插两集线器”的要求，重新SSH只读查询七项均返回0。四路CAN当前为can0→1-2.1、can1→1-2.2、can2→1-2.3（Hub下游1/2/3口）、can3→3-2（根Hub直连）；另有cp210x串口在1-1直连，不属于四路CAN。因此若把串口也计入可见两个直连USB外设，但CAN本身不是两直连两Hub。结论由USB树和sysfs相互核对，未以CAN编号推断物理腿。

四路均无UP标志且STOPPED；读到已有1Mbit配置/pfifo_fast，相较18:16记录有变化，未由本轮设置，不推断来源。thunder-can仍failed，旧Web/proxy inactive，13145无监听。原ROUTES与当前接口名称仍不符，物理腿对应仍未知；本轮遵从最新指示只查接线，未执行先前讨论的重命名或任何启CAN/服务/设备动作。

新原始证据为artifacts/release-readiness/20261025-can-topology-recheck/inspect-topology-02.jsonl，逐口表和摘要在同目录README.md与topology-02-summary.json；保留18:16和更早证据。产品源码、远程配置/启停/CAN帧/机器人RPC、构建安装变更均0；接线拓扑核实完成，控制服务恢复与真机实控未完成，发布结论不变。

## 2026-10-25 已取消旧 Web 服务自启，独立 Brainstem 切换尚未完成

按用户明确要求，通过固定主机密钥的 SSH 将 thunder-web.service 与依赖它的 brainstem-grpc-proxy.service 执行 disable --now。远端原 unit 备份于 /var/backups/doso-service-switch-20261025；执行返回 0，随后 systemctl 读回两者均 inactive/dead、disabled。原服务文件保留，未重启主机。不可将 systemctl 列表中的 preset enabled 误读为实际仍启用。

远端 brainstem.service 的 FragmentPath 与 UnitFileState 为空，尚未安装独立服务；现有可执行文件仍为 20261023 构建。新版二进制、mTLS 部署及 CAN 到物理腿映射尚未就绪，未启用新版自启或启动硬件入口。物理映射以用户最后“不确定”为准，未按 USB 枚举顺序改 CAN 映射。未发送机器人 RPC、使能、姿态或运动指令，未改账号数据。当前仍不能由 App 实控。

原始操作及读回证据：artifacts/release-readiness/20261025-live-readonly/disable-legacy-services.jsonl。旧服务停用完成；替代服务部署/自启与真实连接验证未完成，不增加验收通过数。下一步先核实四路适配器实际接线，再使用经核验的新程序、保留 CAN 启动检查和 mTLS 的独立服务完成切换。

## 2026-10-25 新SSH交互会话已登录成功，CAN失败与控制服务未运行再次确认

按森哥要求再次实测登录：固定既有主机信任的BatchMode密钥认证被拒，随后标准OpenSSH交互终端完成登录，读到Ubuntu欢迎、sunrise shell及uname返回Linux。新会话systemctl is-active实读thunder-can=failed、thunder-web=inactive、brainstem-grpc-proxy=inactive；这次确认的是实际服务状态，未把本地代码当远端运行版本。未将聊天认证信息写入脚本、证据或命令参数。

新会话在后续查询前窗口已不再存在，工具拒绝发送；未再启动重复登录。13145监听和四路CAN DOWN/物理路径不符的细节仍引用17:13—17:27的live-readonly历史记录，不称新会话刷新。既有物理映射阻断仍待明确哪个USB适配器对应原逻辑CAN，四个重复设备标识不能代替接线确认。不得按枚举顺序直接放行或启动硬件服务。

本轮证据为artifacts/release-readiness/20261025-remote-running-audit/auth-recheck-1732.json和login-confirmed-1746.json，保留先失败后成功的阶段记录。产品源码、部署/服务启停/CAN配置、机器人RPC/电机/姿态/运动、构建安装及账号数据变更均0。登录验证完成；机器人服务恢复与G20实控未完成，发布NO-GO不变。下一项是依据确认的物理接线保持逻辑CAN身份，再准备可审查的修复及受控服务验证。

## 2026-10-25 四USB/PCAN再次实读正常，物理腿映射仍未知

用户确认固定/急停可用/失能后，继续只读检查四USB口。Hub 1-2的1/2/3/4口各有一XCAN-USB，peak_usb均绑定，分别can0/1/2/3，未发现少一路PCAN；启动阻断是旧脚本仍要求can0→3-2。四适配器无唯一USB serial，各腿协议电机ID重复1至4。当前本地主入口约定can0后左/can1后右/can2前左/can3前右，但用户最后将物理接线确认更正为“不确定”，因此未改映射、未启用CAN、未启停服务或发送电机命令。最新证据为artifacts/release-readiness/20261025-live-readonly/inspect-four-ports.jsonl及CAN_MAPPING_REVIEW.md补充；需要先核实实际接线，软件枚举不能代替物理对应。旧passive工具含setReporting/disable且腿名约定不一致，已识别且未执行。

## 2026-10-25 开机后真实检查：主机在线，CAN物理映射不符阻断服务启动

按用户“开机测试功能”指示进行只读检查。电脑192.168.66.62、机器人192.168.66.64、G20 192.168.66.94同网；固定SSH主机密钥验证和登录成功。13145没有监听，G20单次TCP连接明确Connection refused，尚未进入mTLS或任何状态/策略RPC。thunder-can.service为failed，sudo只读启动日志明确报can0缺失或USB映射不是3-2；依赖它的thunder-web与gRPC proxy均inactive。

实际四个PCAN均存在但DOWN：can0→1-2.1、can1→1-2.2、can2→1-2.3、can3→1-2.4；原要求can0→3-2，其他顺次→1-2.1/2/3。四个适配器没有唯一USB serial，不可仅按当前枚举顺序修改映射。已提出一个明确物理接线确认及当次固定/急停/失能状态确认，回复前不重命名接口、启用CAN或启动硬件服务。候选映射与原始证据在artifacts/release-readiness/20261025-live-readonly/CAN_MAPPING_REVIEW.md及三份jsonl。

G20实读仍com.doso.robot.qa code13，base.apk SHA256 23c372acbbee2d11b6120afeefd2ad0734785d3fa530c0d2adf806395224d2cd；机器人旧服务二进制6e1899c9…e185，本地最新修复未部署。相机只读清单无/dev/video节点，已有ffmpeg/ffprobe/v4l2-ctl，未采集帧。此次源码功能修改、部署/启停、CAN配置/扫描、模型切换/电机/姿态/运动及账号数据修改均0；读到的网络/服务事实不算实控通过。

## 2026-10-25 机器狗开机后SSH可达，远程版本待本地认证；G20现包未见新增输入模块

森哥要求以机器狗实际运行版本为准核查，不能假定本地源码更新。当前电脑到192.168.66.64:22可达，G20到13145返回Connection refused，未进入RPC。精确.64现有主机指纹与此前机器人一致，StrictHostKeyChecking和禁止UpdateHostKeys下完成到认证阶段；免密BatchMode被拒，已请求用户在新本地终端手动登录，不在聊天收密码。旧.65别名未匹配，不覆盖信任、不使用它绕过目标校验。实际机器人服务/源码/二进制尚未读取，不能由本地结果判断远端新旧。

本轮fresh G20包读取为com.doso.robot.qa code13，base.apk SHA23c372ac…与保留code13一致；全部3个DEX静态检查未见DosoG20Input/G20InputModule/SkydroidG20Source标记，不能称新G20读取桥已进入设备。未启动App/SDK/JNI、未读实时杆量。实体接收机→机器人SBUS独立于App，App本机SDK读取是另一条路径；GET-only源码不证明SDK生命周期不干扰射频。认证后先只读版本与接收证据，动态拨杆前必须隔离独立接收链/动力，不以App许可关闭代替。

只读检查命令已准备并本地语法检查，未远程执行。证据在artifacts/release-readiness/20261025-remote-running-audit/。本轮部署/服务变更/安装/机器人RPC与电机姿态运动/遥控设置/账号权限变更均0；当前等待本地SSH认证，实控与发布结论未改变。

## 2026-10-25 模式改为按钮上方横向弹出菜单

按用户标注移除中央模式面板，左下模式按钮上方横向显示平地/楼梯/高台三个选项。使用180ms ease-out淡入/上移，系统减少动态效果时直接显示；点外部或再次点模式收起。菜单打开保留输入退休与控制门禁，选择真实可用模式仍走原确认/目录复检，未移除安全校验或新增真机指令。59项控制页行为与typecheck通过，覆盖外部关闭、按钮切换且不执行动作。实际组件截图与源码身份在artifacts/ui-refresh/20261025-terrain-popover/，不是G20实拍；未出包安装。

## 2026-10-25 Brainstem无手柄gRPC策略/增益接线与抢端口修复完成，本地联合验证通过

按森哥关于两项结构问题的追问，已修改本地Brainstem源码。硬件主入口在检测手柄分支之外建立唯一GainManager、ProfileManager和FSM增益订阅，gRPC绑定同一个manager；RealControlDog改为接共享gains，只负责手柄输入，不再保留六份独立矩阵/另一条增益监听。热插沿用当前策略/共享gains，不重建PM或热加载timer；关机getter读取最新热插对象。增益跟实际Walking/StandUp/SitDown与Fault恢复状态，保护过渡期间忽略的Walk不提前改增益；默认profile数值、模型与仿真applyCommand语义未改。主入口、示例与测试调用同步。

startHardwareGrpc已删除fuser-k、延迟及抢端口重试，保留原地址/TLS/客户端证书要求；serve失败只清理本次server并抛原错误，不结束原监听者。新增真实主入口组装函数复用测试，以真实M/PM及记录joint验证无手柄目录、复合站稳后坐下、Fault、忽略Walk、切策略后接手柄、取消监听；随机loopback占口测试确认失败后原listener仍能通信。未执行真实硬件_run或旧Linux fuser分支，不伪称旧分支在Windows行为红。

最终artifacts/release-readiness/20261025-grpc-only-wiring/combined-2.json：han_dog285、Brain83、频率8、代数10，共386/386通过，受影响包/主入口/示例严格分析0issue，130项相关输入验证期间零漂移。首轮全包唯一失败是既有fatal_cleanup源码检查仍找旧函数名，已同步实际调用并新增匹配存在断言、保留清理顺序检查；首轮记录保留。独立53项非网络定点及七文件分析通过，APPROVE_SCOPE，不与阶段重复数量累计整机通过。核心三个运行文件相对本轮原始字节净少1行，没有新增依赖/协议/运行flag；示例和测试增量单列，源码SHA见closeout.json。

这两处生效需要部署机器人端Brainstem，不要求为它们重做App或改RPC协议。本轮未部署、未启停服务、未发机器人RPC或姿态/电机/策略/运动动作，未构建安装APK、未改证书/权限/账号数据；App其他并行工作保留。实际硬件入口仍先初始化CAN再绑定端口，受控部署必须停旧硬件实例，不能双开main来测占口。整体网络、G20新包、身份和台架验收仍未完成，当前实控NOT_READY、发布NO-GO；不把本地修复说成机器狗已更新。

## 2026-10-25 模式面板精简文案；当前机器狗端口仍未连通

按用户要求，面板缩为320dp宽，仅显示“模式、平地、楼梯、高台、取消”，去掉待同步/未配置/当前尾注及常驻解释，当前模式使用勾选。目录和权限不足仍禁用，原因只保留辅助功能提示。SwitchProfile服务端已有真实实现，App已通过原生会话接线；本轮单次192.168.66.64:13145 TCP连接4秒超时，未发送RPC，不能称真机当前已连通。截图及控制页检查在artifacts/ui-refresh/20261025-terrain-simple/。未构建安装或执行动作。

## 2026-10-25 首页连接横条已移除，三种地形模式建立严格profile合同

按用户要求移除HomeScreen“连接机器狗/输入IP”横条及对应Home调用属性，保留控制页/我的连接入口和已有直连设备状态。模式面板固定平地、楼梯、高台，约定Brainstem profile ID为flat/stairs/platform；只在真实同步目录含完整ID时绑定，未知目录待同步、已知目录缺项未配置。只读地形展示也取消文件名/中文片段推断，不把climb或stairs_candidate当作已具备相应能力。确认使用中文模式名，当前模式仍来自真实current回报。

复用已有operationCallbacks.switchPolicy→session.action(switch-profile)→Android gRPC SwitchProfile(ProfileRequest.name)；未改服务端模型、协议或切换安全门禁，仍要求grounded/失能/无活动租约。接口说明在docs/runbooks/BRAINSTEM_TERRAIN_MODES.md。真实三个profile及模型尚未核实部署，这次完成App接口准备，未称真机地形能力接通。

相关95项回归/typecheck通过；初次两项旧认证入口夹具未包含现有guestMode/deviceBootstrapBusy而失败，已按真实调用更新并保留记录，未改认证逻辑。渲染发现第三项在旧面板高度内被截，调整后再次检查控制页/typecheck。证据在artifacts/release-readiness/20261025-terrain-profile-contract/与artifacts/ui-refresh/20261025-terrain-modes/。未构建安装、未发真机指令、未改账号/云权限，不增加正式验收数。

## 2026-10-25 动作库UI入口与未接入面板已加入

按用户允许先添加UI接口的要求，横屏左下新增“动作”，与“模式”并列，右下继续“诊断”。动作库可打开返回，目前明确显示暂不可用，不伪造拜年等可执行目录；真实PlayGesture/ListGestures仍待服务端与App接通。打开前撤销输入，并在面板期间关闭触屏/实体输入门禁，返回不重放旧触摸。59项ControlScreen行为/typecheck通过；新增用例覆盖进入、不可用状态、取消与返回后旧输入拒绝。实际组件截图在artifacts/ui-refresh/20261025-control-actions-entry/，未构建/安装、未发送真机命令；这不是扩展动作执行完成。

## 2026-10-25 控制页恢复模式和诊断入口，删除轮盘可见标签

按用户要求删除横屏轮盘“移动/转向”可见文字，保留辅助功能名称与轴语义。底部停止标为“软件急停”：实际仍调用session.interrupt，原生请求WalkChecked零速度及ReleaseControl，不宣称硬件断电/安全级急停。左下新增模式入口，打开前撤销旧输入，展示实际同步策略目录并复用原确认与权限门禁；未就绪时显示真实原因。右下诊断复用现有电机关节页回调，导航前退休输入；该页不是完整IMU/网络诊断。

额外动作核查：Brainstem cms.proto已声明PlayGesture/ListGestures，但han_dog/lib/src/server/unified_cms_server.dart当前两实现仍抛unimplemented。App未接这两RPC，不能声称拜年等动作可执行；本轮未新增假动作或启动机器人。初查未命中小写动作词，随后按完整RPC列表纠正，不将协议声明等同已实现。

现有与新增Screen58项+Joystick27项共85/85、typecheck通过。新增用例验证诊断导航前取消、离线模式说明不发指令、真实目录选择前不执行策略；首轮发现未就绪原因被原反馈过滤，已改为模式选择面板内展示并复验。三横屏含新入口48dp/不遮挡检查及源码身份见artifacts/ui-refresh/20261025-control-mode-diagnostics/。这是源码/浏览器检查，未构建安装、未发机器人命令，不增加正式通过数。

## 2026-10-25 控制页顶部白底胶囊已去除，浅色无视频状态统一底色

按用户圈选，仅调整横屏顶部材质：浅色无视频时设备身份、三项遥测、未取得控制权按钮及返回/工具均透明无底框，以排版区分；已有控制权仍用品牌蓝。实际视频接收状态与深色主题继续保留可读底衬，不改变连接/遥测/控制逻辑。底部动作和轮盘保持上一轮布局。ControlScreen现有55项行为及typecheck通过，渲染证据在artifacts/ui-refresh/20261025-control-unified-header/，包含三种横屏与旧版对比；不能作为用户视觉认可或G20实拍。未构建/安装、未连接机器人，正式验收与发布结论不变。

## 2026-10-25 Ponytail控制主线审查：G20仍code13且机器狗不可达，独立gRPC启动接线仍有缺口

按森哥要求审查实际控制调用和无用代码。当前App摇杆/站坐/电机/策略已真实接到Android ControlSession/ControlWire与Brainstem RPC，核心会话、原生输入、租约、仲裁均有生产调用；没有发现可整块放心删除的新核心模块。明确冗余仅两行未引用的摇杆步长常量，本轮只读审查未改运行代码。输出复检97行原型及333行测试仍隔离Brainstem tool/test、生产引用0，不进App包，也不冒称输出保护已接入。

当前实读：ADB授权G20为com.doso.robot.qa code13，设备base.apk SHA256为23c372acbbee2d11b6120afeefd2ad0734785d3fa530c0d2adf806395224d2cd，与保留code13一致；wlan192.168.66.94。本地最后保留包code15 b58eeef7…，源码准备code16，未生成/安装新包。电脑到192.168.66.64:13145限时探测超时；G20一次有效无数据探测No route to host，初次nc参数无效发生在连接前，修参数后未循环重试。未进入TLS/状态/租约或动作验收，不能称当前可控。

审查新确认高优先缺口：硬件入口无本地controller时不创建ProfileManager和RealControlDog，导致gRPC-only策略未配置，站坐增益也没有随FSM切换；硬件server未接GainManager。Android兼容GetProfile未实现，不因此必然阻断open，但不能消除姿态增益风险。另历史_startGrpc端口占用时fuser -k可能杀掉旧控制进程，应部署前改为明确失败。App还存在控制接通后只读总线电压显示源丢失、关节页回调无点击入口。最小修复应复用现有实现补接线，不再新增控制框架。

两条独立只读审查本轮App相关87项/typecheck通过，Brainstem相关98项/五文件严格分析0issue；未覆盖上述实际硬件入口组装缺口，不累加正式通过数、不声称全工作区冻结。修正旧接入/配对文档的“原生仅只读”和“远程电机仅loopback”过时描述，未变更任何实际权限。完整发现、代码位置、当前APK身份及网络观察见artifacts/release-readiness/20261025-ponytail-control-review/。

本轮运行代码改动、构建、安装、真实机器人RPC/姿态电机运动、SSH/服务启停/权限/账号数据操作均0。当前实控NOT_READY、发布NO-GO；下一优先修无手柄gRPC组装与抢端口，再恢复网络、正常新包升级、配对只读状态及台架逐项动作验收。未用历史仿真成功替代现场结果。

## 2026-10-25 控制页按用户反馈重新整理比例与版式，待视觉确认

用户明确否定上一轮暗底玻璃HUD。当前源码将无视频底色改为Radix浅色#F9F9FB；800/753横屏默认字号下顶部信息归为同一行，遥测数值24→18、移除紧凑宽度下的装饰图标。极窄屏/大字号仍按需分行。顶部按钮统一48dp圆形/胶囊且无边框；移除底部整块托盘，四个圆形动作独立排列。轮盘基准尺寸由宽高共同决定（800宽默认约162dp、1280宽约230dp），移动/转向标签移至盘外上方并随字号自然增高。保留用户布局偏好、真实未知状态和控制操作门禁；视频仍未配置，未添加假画面。

87项现有Screen/Joystick/VideoSurface行为与typecheck通过；实际组件离线渲染在artifacts/ui-refresh/20261025-control-reference-rework/，含1280×720、800×480、753×471及旧版对比。测试证明行为回归，几何检查证明边界，不能证明用户已认可设计。保留旧图片；未构建/安装APK、未连接机器狗或改账号数据。本次没有接入原生视频解码器，G20实机视觉仍待后续包验证。发布结论与正式通过数不变。

## 2026-10-25 输出前运动复检函数原型已验证，尚未接入生产电机出口

按森哥关于函数实现的提问，新增Brainstem han_dog/tool/motion_output_guard_prototype.dart及独立测试。checkMotionOutput为同步纯函数，检查推理前固定的permit与发送前本地current的来源/所有权、安全和已应用输入代次，电机/故障/运动状态，以及同一机器人单调域的接收/推理开始/截止时间；相等即到期。独立审查推动now也携带clockId，防止仅凭两份上下文标签一致却传入另一时钟读值。标签仍须可信producer提供，函数不认证伪造标签、不发RPC、不等待、不操作电机或自动决定恢复姿态。

最终artifacts/release-readiness/20261025-output-guard-prototype/verification-2.json与closeout.json：14项原型+28项既有租约/仲裁/生命周期相关回归共42/42、两文件严格分析0issue；14项相关输入运行期间零漂移，原生产上下文与初次阶段身份一致。独立最终14项及analysis通过并APPROVE_SCOPE。初次裸Duration阶段12/40项证据保留，阶段数量不累加，不冒充原运行路径的红绿修复。函数及测试SHA256在closeout中。

明确未完成：凭据必须绑定该帧实际应用的direction，当前M.commandVersion仅代表排队意图；现Brain.nextActionStream丢失History帧来源，不能输出时重新贴当前授权。现撤销先排A.walk零速度再release，若所有Walk都要求active租约可能拦恢复帧；Idle与Grounded保持也不能按普通运动租约一刀切。因此本轮只交付离线函数原型，lib/bin生产运行路径未改、没有声称真实电机已获得此保护。下一项是可信帧凭据及安全恢复/保持分类合同，再接真实输出Seam并做记录sink离线反例。

本轮App运行代码、协议/生成文件/依赖未改；构建、安装、G20/JNI、真实机器人RPC、服务部署、电机姿态运动、账号数据云权限操作均0，未测真机耗时或停止时限。code16包与现场验收仍未完成，发布NO-GO、正式整机/设计通过数不增加。函数设计及当前边界已补到docs/algorithms/CONTROL_EXECUTION_ARCHITECTURE.md。

## 2026-10-25 视频浮层控制页已落地源码，相机检查待机器狗开机

森哥已选择全幅视频背景与半透明HUD参考，随后确认优先检查机器狗现有相机；当前机器狗尚未开机。本轮两次限时SSH连接192.168.66.64:22均超时，未执行远程脚本、未读到相机型号/视频节点，不据此判断相机或服务故障，暂停重试待开机。

实际ControlScreen横屏已接入ControlVideoSurface宿主/状态槽，左上设备与连接入口、三项真实来源遥测、控制权/布局/G20输入入口、双玻璃材质摇杆及停止/站立/坐下/观察状态驱动电机开关保留。右杆仍为机器狗转向，不是相机云台；未知遥测为“—”，没有填入参考图在线、电量或速度。素材未充当真实视频，当前如实显示“尚未配置视频”。现用半透明原生面板，未安装blur依赖或宣称G20毛玻璃已验证；竖屏保留现有布局。

新增视频槽把视频与gRPC控制独立处理：未配置不阻断既有目视控制；已有画面中断或接收会话替换会退休旧输入，恢复不自动取控制权。后台卸载并隐藏媒体，恢复后旧id的receiving不能直接显示为实时，须由实际接收器创建新会话并以解码帧推进确认。尚无实际receiver/provider、WebRTC解码器或接入视频源，URL不能直接让现有APK播放；此处状态合同与本地夹具不能代替真实帧时序验收。

本地配置准备在docs/runbooks/ROBOT_VIDEO_SETUP.md和iot/video-gateway/，包括只读清单脚本、仅回环监听的MediaMTX模板及相机→H264→WebRTC/WHEP分阶段步骤。sh语法、YAML解析与静态监听/权限检查通过，不等于MediaMTX实际加载。未安装网关、采集相机或开放网络端口；现有gRPC控制通道不变。

最终artifacts/release-readiness/20261025-control-video-glass/verification-final.json：实际Screen55、Joystick27、视频槽5合计87/87通过，typecheck退出0，16项相关源码/测试/准备文件核验期间零漂移。首轮类型检查发现RN0.86不再提供absoluteFillObject，已改显式四边定位并复验，原失败记录保留。独立复核提出的恢复新鲜度门禁已修正；父级mock测试不冒充实际视频端到端集成。实际组件离线截图和适配证据在artifacts/ui-refresh/20261025-control-video-glass/，不是G20实拍。阶段重复检查不累加为正式设计或整机通过。

本轮APK构建0、安装0、相机采集0、真实机器人控制指令0，账号数据与云权限未改。code16仍未形成获验收新包，发布NO-GO。下一步：机器狗开机后只读核实系统/相机设备与采集格式，再验证本机视频、只读局域网观看及G20真实解码；不能把控制RPC端口13145当视频地址。

## 2026-10-25 控制核心顺序提交、完成来源和关闭生命周期已收敛，源码离线验证通过

按森哥继续调整核心逻辑和算法架构的要求，从实际cms1.4.4/Bloc默认并发、原始proto与真实M/行为订阅入手，实证修复取消窗口Fault按旧Grounded被忽略、双StandUp创建双行为、close后迟建订阅泄漏，以及旧StandUp Done提前完成新SitDown。M现显式串行状态变更，内部完成事件关联真实订阅并在处理时复检；closing同步退休输入、重复close共享Future并等待在途kernel清理。commandVersion同步入队与既有策略提交撤销保护保持，未改协议、生成文件、依赖或业务UI。外部无关联Done保留兼容语义。

同时补齐ControlArbiter终态门禁：dispose后普通授权/命令拒绝，迟到fault/init不再访问已关闭M，运行时安全绕过和云卓优先不变。App默认控制时钟不再回退Date.now，缺失/抛错/非法值拒绝时效判断，运动中请求撤销；服务器自生成相对遥测改用已有Stopwatch，日历startTime及硬件流时间透传保留。App最终夹具对保留旧实现3失败1通过、仲裁器原7失败1通过、FSM原3反例全红与串行中间阶段、旧Done扩展反例分别保存；服务端未注入日期跳变，未将来源修改冒充实测跳变。

最终artifacts/release-readiness/20261025-core-control/verification-2.json：App170/170、Dart322/322（Brain83、han_dog控制相关221、频率8、代数10）、typecheck及受影响Dart包严格分析0issue；374项App产品输入、114项Brainstem相关输入、实际cms/Bloc依赖和所测脚本验证期间零漂移。96项原生输入/脚本与此前身份一致，显式复用5项原生证据，不称本轮重新编译。首轮严格分析must_call_super失败保留，修为close内明确父类调用后完整复验；两条独立审查APPROVE_SCOPE，FSM独立28项与各阶段数量不重复累计为正式验收。最终源码SHA与复查见closeout.json、review.json。

本轮构建/安装/实际G20/JNI/机器人RPC/部署/姿态/电机/策略/运动及账号数据云权限操作均0；code16仍未形成获验收新包，不声称G20已升级。架构说明在docs/algorithms/CONTROL_EXECUTION_ARCHITECTURE.md。下一优先是机器人实际电机输出前的新鲜输入deadline与控制来源代次复检，先做迟到推理离线反例；同步ONNX可能延迟同isolate租约Timer、重复包续租与新输入仍耦合、挂起cancel无时间上界均作为明确残余。当前软件时序通过不等于硬实时或物理停止验收，发布仍NO-GO、正式设计/整机通过数不增加。

## 2026-10-25 用户仍不认可控制页观感；本轮完成原生操控台设计提案，未改运行代码

最新反馈为“这个版本还是很丑，需要重新思考设计”。此前字号/去框的回归和渲染检查仅证明局部实现，不构成视觉认可。本轮沿用白/石墨/品牌蓝与MiSans，通过两条独立设计复核形成一套轻量操控台提案：轮盘改中性实底、白色实体拇指和轻阴影，移除工程图式多圈/十字线；大DOSO更淡，遥测采用大数值/小标签，画布去外层大圆角卡片，底部仍四个圆形动作且不再增加外层灰卡。

提案在artifacts/ui-refresh/20261025-control-native-concept/，由当前组件的隔离视觉变换生成，原始及变换SHA、精确允许修改列表和八项控制源码字节守卫已保存。1280×720、800×480、753×471提案渲染检查通过，真实字体和离线禁用状态保留；这些是设计稿，不是当前App运行界面、G20实拍或已验证的原生手感。局部规则扫描[]未发现机械规则项，不视作美观或正式设计通过。

本轮没有修改src、业务测试、依赖或运行配置，构建/安装/真实机器人及账号云端操作均0；仅生成提案与记录。视觉迁移尚未实施，未获用户接受，也不增加任何正式通过数。设计理由及后续落地边界见docs/design/CONTROL_CONSOLE_PROPOSAL_20261025.md与artifacts/release-readiness/20261025-control-native-concept/README.md；发布仍NO-GO。

## 2026-10-25 yaw坐标与切换后中位栅栏已修正；时钟严格性仍有明确待项

按森哥关于右杆/yaw、时钟精度和切换的追问，三条独立审查回到Brainstem原始proto、坐标文档、现有RC代码与时钟/状态机。右杆水平为体坐标偏航角速度rad/s（App请求上限±0.30，约±17.2°/s），不是目标yaw角；右Y不发机器人动作但保留回中校验。发现原App把右推正X直接发正y/z，违背Brainstem正左/正逆时针合同；现横移=-drive.x×.20、yaw=-turn.x×.30，前后=-drive.y×.20，规范零值。右Y也从JS运动活跃标记排除。六方向及未映射轴两新增反例原实现真实失败，修后会话23项通过。

另闭合授权前旧中位晚到的时序漏洞：native新增captureInputFence，前台+reading取Android elapsedRealtime；来源选择与运动许可各自在grant边沿捕获栅栏，只有请求起点严格晚于栅栏的中位可武装，同毫秒拒绝，stale/replay重置保留栅栏。缺新API/非法时钟不武装，fresh stop独立可撤销。原模型3组反例全红，修后79项定点JS绿并经独立复核APPROVE_SCOPE。许可名称改启用控制/释放控制，未改变并行UI布局。

最终 `artifacts/release-readiness/20261025-axis-clock-review/verification-1.json` 当前166/166行为、5/5原生检查、全仓typecheck通过；374项产品输入及所测脚本运行期零漂移。原生检查实际编译新增Expo Function及官方SDK接线；本轮无Gradle/APK构建、安装、JNI/设备或真实机器人RPC/SSH/部署操作，不累加为正式设计/整机通过。

时钟结论：Android采集/派发/切换使用同域elapsedRealtime；机器人租约用Stopwatch；JS主要performance.now但仍有Date.now fallback，部分server相对遥测仍用DateTime差值，这两项未实施修改。150ms仅本地派发年龄条件，25ms看门狗与20ms最小间隔不是硬实时或50Hz实测；G20五次GET后至少100ms等待，实际低于10Hz，GET起点不是硬件采样时间证明。横屏屏幕策略入口/当前策略仍缺，仅后端保护及实体策略键接线成立。更多建议、原始合同身份和现场验收边界见同目录README.md；code16仍未出包、真实切换与机身停止待现场独立证据，发布NO-GO。

## 2026-10-25 控制页框选遥测和右工具栏已放大去框

仅调整ControlScreen框选区域：遥测标签18sp、数值24sp，移除下划线；右工具栏图标24dp、桌面横屏文字18sp、触摸目标至少48dp，透明无底框。小于960宽的工具栏复用14sp文字并收紧间距，保持48dp命中区。标题24sp居中、轮盘、底部四操作及品牌字体保持上一版；左返回与竖屏控制权按钮外观保留，原控制/取消/禁用逻辑未改。

最终真实控制页行为51/51、typecheck exit0，未为本轮样式新增实现镜像测试。首次49项后观察到并行Brainstem会话、控制页文案及G20输入源/测试更新，均保留；对合并源码重新冻结，最终23项源/测试核验期间零漂移，阶段数量不累加，不将并行控制逻辑整体计为本轮验证。当前组件1280×720、800×480和753×471含遥控器入口的Web渲染检查通过；首次截图后源变化记录保留，最后重捕16项渲染源零漂移，已包含新的“启用控制”文案。文字实际边界居中、遥测无线框、右侧透明无阴影且命中区至少48、标题/工具栏及轮盘/动作区无重叠。主图离线、遥测未知、动作禁用。

图在artifacts/ui-refresh/20261025-control-borderless-hud/，源身份与核验在artifacts/release-readiness/20261025-control-borderless-hud/。本轮构建0、安装0、机器人/账号/云端修改0；当前UI尚未进入新G20包，Web适配截图不是原生实拍。发布仍NO-GO，正式通过数不增加。

## 2026-10-25 输入链路深审修复完成；当前合并源码验证通过，code16未出包

按森哥“更深入而非更大”要求，从官方SDK字节/静态callback、原始通道与单调时间、真实ControlScreen闭包及原生派发入手，复现并修复四类问题：旧触屏callback跨触屏→实体→触屏ABA仍可调用执行器；G20原始时间丢失、桥接重新计时会延长旧输入；未使用右Y削弱yaw；厂商静态生命周期/GET回调保留已停止会话与ReactContext。现触屏按独立代际和来源/许可/设置同步校验，App使用稳定会话回调；原始Android请求时间贯穿sendControlInputAt，在入口、限流后、dispatchLock和watchdog校验，未来/负值/过期拒绝，旧native不回退；右X独立归一化，普通动作当前回中、stop独立；每次SDK open独立Connection，close先清delegate/pending读回调，只保留applicationContext。未新增业务页或更换视觉体系。

保留修前字节与实际失败：模型/传输新增5组失败、旧触屏4组失败、真实Kotlin旧实现拒绝未来时间的断言失败、真实adapter配fake SDK原5失败/1通过→修后6/6。独立固定seed性质检查4736个合成案例通过，不称G20实采。初始冻结148行为/5原生/typecheck通过；之后并行UI变化与测试修正均保留，最终 `artifacts/release-readiness/20261025-input-depth/verification-3.json` 当前156/156行为与typecheck通过、374项产品输入及测试脚本零漂移。原生源码/配置/测试字节与v1一致，显式复用其5/5（含18项状态机、6项adapter与实际Kotlin/Expo/官方SDK编译），不累加阶段重复数。两条独立审查在输入意图/时间及原生生命周期范围APPROVE_SCOPE。

资源恢复后启动过1次正常code16构建；构建期间发现并行布局与ControlScreen源码变化，负责人主动停止本轮Gradle客户端，daemon随后退出、锁清理成功。脚本原始结果attempt_failed，补充停止原因在build-stop.json；没有可采纳code16 APK，没有再重复启动构建，旧输出不作为新包。当前最后验证已对齐合并源码，但仍需新的正常出包验包。

本轮ADB仍无G20，安装0、厂商JNI/真实杆键采样0、真实机器人RPC/SSH/部署/姿态/电机/策略/运动0；账号、数据及云权限未变。实际SDK启动、稳定采样、机器人端ACK/租约撤销与固定台架物理停止仍待现场独立证据；本地时效检查不等于物理停止时限。发布NO-GO，正式设计/整机通过数不增加。完整原始材料、方法、红绿反例、冻结验证和边界见同目录README.md。

## 2026-10-25 控制页按新标注居中、放大遥测并合并电机开关，源码验证完成

横屏设备名THUNDER-01改为24sp次级文字色，按整个画面真正居中；右侧操作组实测宽度用于两侧对称保留区。速度/信号/电量改为14sp标签及18sp数值。移除圈定的关节快捷图标、策略和通用连接状态行/入口，主画面只保留停止、站立、坐下及一个电机状态开关；圆形操作64dp、文字14sp。真实失败、故障和待确认反馈按需单独显示，终态观察完成后结束待确认文案，没有把停止未确认一并隐藏。

电机开关由已连接的真实runtimeState.motorState决定：使能亮蓝、失能深色、未知或断链灰显禁用。目标动作固定并复用原确认/取消代次/权限/串行门禁，不因点击或ACK自行翻转；请求中禁止重复切换，观察状态变化会撤销旧确认。没有删除后端使能、失能或策略接口。横屏默认轮盘1.35倍、左右x0.08/0.92、y0.8，在1250×650可用画面示例下直径194dp、中心约11.38%/88.62%、垂直59.97%；仍受真实可用区约束。保留横竖屏独立滑条和自定义偏好，读取仅迁移精确匹配未标记旧默认的整对横屏值，新保存带defaultsRevision2区分用户以后显式选择旧位置。

当前联合回归134/134、0跳过，typecheck exit0，23项相关源/测试输入核验期间零漂移；独立范围静态复核通过。实际组件Web渲染16项源零漂移、真实MiSans加载，标题字形中心和遥测尺寸、删减项、四个64dp圆形操作、轮盘/动作区、六滑条及800×480含遥控器入口的短横屏检查通过。电机开关亮暗来自明确标注的本地组件状态夹具，不能当作真机状态。主效果图保持离线、未知遥测、所有动作禁用。

图在artifacts/ui-refresh/20261025-control-centered-toggle/；源码身份、原始检查、最终记录在artifacts/release-readiness/20261025-control-centered-toggle/。本轮构建0、G20安装0、真实机器人RPC/SSH/账号或云端修改0；代码调整未进入新的G20安装包。浏览器图不是G20实拍；发布仍NO-GO，正式整机/设计通过数不增加。

## 2026-10-25 控制页大号浅色 DOSO、圆形动作和布局滑条已进入源码

按森哥最新要求，横屏中央改为响应式大号浅色DOSO水印，移除原短线；保持MiSans、现有品牌蓝与页面语义颜色。底部停止/站立/坐下/使能/失能改为56dp圆形图标加12sp短标签，停止沿用危险色，策略入口仍紧凑透明。摇杆底部预留随字体缩放计算，避免最大圆盘与动作区重叠。水印不拦截触摸并从辅助功能树隐藏。

左右摇杆大小、水平、垂直共六个滑条，44dp触摸区、28dp圆形滑块，无新增依赖。拖动只更新布局，松手保存一次；完成可保存未提交的最后预览，横竖屏配置独立。原有取消、50Hz及控制门禁保留。独立审查发现“拖动中恢复默认可被迟到事件覆盖”，新增反例在旧实现真实失败，修后以同步编辑代次及重挂载撤销旧回调，真实组件指针重置测试亦通过。

最终联合回归126/126、0跳过；typecheck exit0，15项产品输入与该次typecheck快照一致。初始核验期间存在本轮修复及并行G20源/测试更新，旧记录保留，对当前23项源/测试最终冻结重跑后零漂移，不累计阶段数量。独立静态复核通过本轮范围。当前真实组件1280×720 Web适配渲染已逐张查看，16项渲染源零漂移；实际指针拖动、松手单次保存、重载恢复、保持触点恢复默认、最大圆盘和800×480短横屏边界均通过。图在artifacts/ui-refresh/20261025-control-soft-round/，不是G20原生实拍。

本轮构建0、安装0、真实机器人/认证/云权限变更0；本次UI尚未进入新的G20安装包，不能据此称遥控器已升级。并行G20实体输入工作完整保留。本轮源码身份、原始失败和最终验证在artifacts/release-readiness/20261025-control-soft-round/。后续仍需按正常构建门禁出包及保数据原生升级验证，发布NO-GO、正式通过数不增加。

## 2026-10-25 G20 实体输入已接入源码；code16 尚未出包，实机读值待验

新增 DosoG20Input Expo Android 模块，固定云卓官方 RCSDK1.9.2 原字节（SHA256 `e5977ba3292246bcee026defdb8563a18adc9d5573fdfb20a6880ee469f0fde2`）。仅识别设备、本机RC生命周期和GET通道/配置/手型，使用固定版本RC-only进程标志排除默认图传；没有改写通道、手型、自锁、配对或固件。16路原始通道可经桥返回；通道GET前后复读配置，观察到变化则拒绝帧并停流，原生请求起始时间150ms新鲜度、会话代际和序号拒绝延迟/重放。

控制页新增遥控器输入入口，支持只读原始值、会话内四轴方向/范围校验、六种动作键选配及触屏/实体来源互斥。完成回中/释放校验后才能选择实体；双侧杆量作为同一快照接入已有Brainstem会话，控制许可变化后需新鲜中位；设置、后台、离页、超时撤销输入。站立/坐下/使能/失能/策略选择复用原有门禁和确认，停止键在另一键仍按住或确认期间仍可独立请求撤销当前控制，不能称物理急停。校验前需断开机器人接收机，避免遥控器独立无线链路动作。

最终 `artifacts/release-readiness/20261025-g20-input/verification-2.json`：当前362项产品输入零漂移，行为129/129、typecheck通过；原生源码及SDK字节未变，明确复用v1的4/4原生检查（含G20实际18项状态机和真实Kotlin/Expo/官方SDK编译），新增模块元数据检查1/1通过。独立范围审查APPROVE_SCOPE，配置竞态、Maven运行依赖仓库、连续按键停止及并行UI快照问题已闭合；这些数字不增加正式整机/设计通过数。

源码版本准备为code16。首次正常构建因新增模块缺少Expo所需versionName失败，已补versionName/versionCode；真实Gradle配置/qaRuntimeClasspath解析成功、SDK依赖无FAILED。随后正常资格检查记录可用内存3,983,496 KiB，低于4,194,304 KiB，因此停止，Gradle启动0次、未生成code16候选。首错、修复、检查与第二次资格记录保存在同目录qa-code16及qa-code16-attempt2；不采用旧APK冒充新包。

本轮两次ADB清单均无G20，安装0次、实际SDK/JNI/实体杆键采样0次、机器人RPC/SSH/服务部署/姿态/电机/策略/运动0次；没有账号、密码、数据或云权限变更。代码接线完成不等于G20已读到真实数值，也不等于真实机器狗已可控。后续仍需正常出包验包、保数据升级、断开接收机的实体输入验收，再按台架与急停条件验证真实控制。发布保持NO-GO。

## 2026-10-25 摇杆大小/位置配置与策略栏去框已完成，遥测仍为快照和部分未接入

控制页新增摇杆布局设置：左右独立75%–175%大小及半区内水平/垂直位置，实际区域限位；横竖屏分别保存、恢复当前方向默认，专用本地键、串行写入、失败提示/重试。异步旧读取不覆盖新编辑。配置圆盘固定中心，旧无配置浮动方式保留。进入编辑同步阻断旧触屏/实体事件并中断控制，配置页不挂实际动作或运动控件；几何变更退休旧触点/回调，关闭不自动取租约。50Hz、150ms输入年龄及ACK/控制权校验未放宽。圈定策略栏和策略入口底色/外框去除，功能入口保留。

联合回归105/105、typecheck通过，20项相关源/测试输入零漂移，独立静态审查通过限定范围。审查检出的竖屏标签越界有真实失败反例并修复，覆盖放大字体；实际渲染检出的设置画布高度0亦已修复。当前组件浏览器实际点击调整并重载恢复成功；15项产品源码零漂移、真实字体通过、圆盘/设置画布在界内、六项机器人动作均禁用。图在artifacts/ui-refresh/20261025-joystick-layout-config/，是Web适配渲染，非G20实拍。

数据源复核：关节状态入口与16路电机/电压读取已接线，但目前是连接检查快照，非持续实时；Brainstem有IMU流，App桥和页面尚未接入。顶部机身实测速度、Wi-Fi/gRPC信号、BMS电量百分比均缺真实来源；总线电压已有读取和显示，但持续刷新及控制会话与只读快照的遥测合并仍需补齐。不可用值保持未知，未用关节速度、指令速度或BLE广播信号替代。

本轮构建0、安装0、真实机器人RPC/SSH/账号/云权限变更0，ADB无G20；现有code15不含本轮布局及此前50Hz调整。工作区并行G20输入改动已保留，本轮只验证模拟事件在编辑时的阻断，不称原生实体输入已验收。证据与来源边界：artifacts/release-readiness/20261025-joystick-layout-config/。发布NO-GO、正式通过数不增加。

## 2026-10-25 控制动作与界面只读复核：当前端口探测超时，发现状态误标和重复信息

当前已接线停止/站立/坐下/使能/失能/策略切换与触屏WalkChecked流程；动作库PlayGesture/ListGestures及速度档位仍由服务器明确返回unimplemented。地图/图传、任务路线召回、实体摇杆与App完整流式遥测尚未接齐，不能凭动作按钮或proto声明视作可用。

北京时间10:31:16，仅一次3秒TCP探测192.168.66.64:13145超时，未尝试TLS或发送RPC，未使用SSH/客户端凭据；原因未定位，不能断言服务停机或G20另一网络路径同样失败。ADB当前无G20。当前本机展示服务8085两次请求返回503，未重启或重复启动Metro。不能将展示图当实机控制证据。

只读审阅确认：directConnection对象优先级会把已连接控制会话显示成“只读”；所有blocked动作统一标“未接入”会混淆当前状态与实现缺失。连接/门禁/错误说明、多块未知遥测及不可用地图/任务/路线/模式/召回占位存在精简空间，关键控制权/电机/故障与停止未确认仍应可见。本轮仅审阅和生成离线展示材料，未实施产品UI修改、构建、安装、账号/云权限或机器人动作。当前组件web渲染在artifacts/ui-refresh/20261025-current-actions/landscape.png：6项动作可见且禁用，真实字体加载通过，11项产品源码零漂移；使用web adapter，非G20实拍，竖屏局部截图有浏览器裁剪限制。审阅证据：artifacts/release-readiness/20261025-control-capability-review/。50Hz仍为源码调整、code15未包含，发布NO-GO。

## 2026-10-25 触屏采样和原生运动发送上限已改为50 Hz，尚未进入安装包

按森哥要求，ControlJoystick真实持续触摸补采样80 ms→20 ms，ControlSession共用运动RPC间隔50 ms→20 ms。双侧采样合成为同一三轴速度通道，RPC总上限50 Hz；ACK/网络背压仍会降低实际频率，不缓存补发旧输入。150 ms输入年龄、100 ms RPC截止、序号/owner/取消、零速和停止未确认保护保持不变。

新增确定性采样用例在原80 ms实现下3项真实失败；原生实际限流边界用例在旧50 ms实现下真实失败。修后联合回归76/76、实际Java/Kotlin/Expo编译及假通道/安全检查2/2、typecheck通过，独立静态审查无阻断。UI21项已含在76项中，不重复累计。原生测试用固定测试时钟与预中断验证20 ms可发、19 ms仍限流，无产品时钟改造。服务端18 ms到达限频未放宽，网络抖动仍可能触发拒绝，尚无实机50 Hz吞吐或物理停止证明。

本轮构建0、安装0、真实机器人RPC/SSH/账号/云权限变更0；ADB无目标，资源预查未形成有效资格结果，未启动Gradle或重试。现有code15/SHA256 `b58eeef7bf3a4344d0159c85800db6963a16efeb5cfbe9eb7b636b4fd2c0e484`尚不含本次修改，不能称G20已生效。证据与5项修改文件哈希在 `artifacts/release-readiness/20261025-touch-control-50hz/`。后续须正常出包验包、保数据升级及现场频率/松手断链验收；发布NO-GO、正式通过数不增加。

## 2026-10-25 策略切换提交事务与使能竞态已修复；code15客户端已验包，Brainstem未部署

本轮围绕一个更深入的合同收敛：模型、增益、动作库、策略名称和共享记忆一致，加载期间失效的请求不能提交。原始CMS对Standing+StandUp无过渡，原Brain却在切换时reset零目标帧；现取消Standing热切换，App、原生gRPC、服务器与R2均收紧至Grounded，hardware还要求输出关闭且无pending Enable/标零。Brain在加载后、释放旧模型/重置记忆前执行同步校验；按FSM对象、命令排队版本、所有权与安全代际、RPC取消/超时/退出/标零拒绝迟到提交，保留云卓抢占和即时失能。

ProfileManager的增益/gesture/currentName与补偿放在同一同步提交段；未触碰增益时不重写，有限值部分提交失败会恢复两处接收方且保留旧模型，补偿或资源提交不确定则sticky hasFault阻止再操作。六套矩阵统一有限值校验覆盖真实controlDog-only路径；目录reload在await后重查切换状态。RC异步切换错误被处理；H失能不再排队等旧Enable，跨gRPC/RC pending Enable互斥及代际检查阻止迟到使能重新发布true。另修复健康检查返回null被误当“缺少关节控制器”的实际使能阻断。OnnxEnv显式dispose现在detach后实际ReleaseEnv并幂等；独立C计数探针原release0失败，修后create2/release2/invalid0。

本地残缺Dart环境用独立官方3.10.1 SDK验证，未覆盖Flutter或改全局配置。冻结联合验证：服务端/控制器145项、Brain71项、真实ONNX推理1项均通过；16个修改Dart文件严格分析零issue；107项相关源/fixture/协议/原生库输入零漂移。App typecheck、51项会话/传输/ControlScreen回归、2项实际Kotlin/Expo bridge编译及假通道检查通过。原始失败、独立审查提出并闭合的资源/补偿/标零缺口均留证；阶段重复检查不累计成正式整机通过数。证据在 `artifacts/release-readiness/20261025-profile-commit/`。

正常入口单次code15构建成功，源码输入零漂移、锁清理成功；独立验包及SHA留存完成。新包 `releases/20261025/DOSO-0.0.1-qa-code15-b58eeef7.apk`：`com.doso.robot.qa`、code15、`0.0.1-qa`、79,031,477 bytes、SHA256 `b58eeef7bf3a4344d0159c85800db6963a16efeb5cfbe9eb7b636b4fd2c0e484`。与code13/14同签名、arm64-v8a/x86_64双ABI、正常MainActivity/index.ts入口，bundle确认客户端新门禁，原生控制类存在；旧code14重新哈希未变。仅客户端保护进入APK，Brainstem本地源码不在APK内，尚未部署或重启真实机器人服务。

最终ADB仍无G20目标且非unauthorized，本轮安装0次、实机UI检查0次、真实机器人RPC/动作/租约/使能/标零操作0次；没有重复请求USB。账号、密码、原有数据、生产数据库和云权限未修改。原生计数shim证明接口调用次数，真实ORT测试证明所测模型/流/记忆行为，不等于进程全部内存回收、真实机身静止或地形策略安全。后续仍需实际服务/mTLS/路由、固定台架与急停条件下的独立现场证据。发布保持NO-GO，正式设计通过数不增加。

后续stop diff审计标记了Git根同级工具缓存中官方Dart SDK的DevTools inflate状态转换。已核对目标bundle与官方SHA验证的SDK ZIP成员字节完全一致，未修改供应商代码。新增Git根精确忽略规则只排除该SDK解压目录及ZIP，来源README与业务/验证源码保持可见；6项忽略边界检查通过，code15产品输入零漂移、APK哈希未变，无额外构建或安装。证据为同目录 `toolchain-diff-audit.json`，不把缓存误报计为产品安全修复或新增验收。

## 2026-10-25 深度验证补齐真实服务端测试，原生 TLS 联调仍未通过

按森哥“更深入而非更大”的要求，从原始 cms/common.proto、CMS/租约/仲裁、实际 Kotlin/Java 与依赖字节码和 APK 字节入手，新增真实回环 TLS/HTTP2/gRPC 测试工具。独立审查修正了测试服务缺失 direction 也当零速、首非零拒绝码及正常非零 ACK 覆盖不足的问题，并修复子进程创建失败会无限等待、阻止临时证书清理的异常路径；真实 ENOENT 反例通过。临时私钥先限制目录权限，正常结束后清理，本轮未发现残留服务/私钥目录。

一次获取官方 Dart 3.10.1 SDK，205,387,211 bytes，SHA256 与官方公布值一致；仅放独立验证工具目录，未改全局 Flutter、依赖、账号或产品代码。实际运行完整 grpc_tls_test.dart、control_lease_test.dart、unified_cms_server_test.dart，最终当前快照 **51/51 通过、0跳过**，143项源码/配置/测试输入在运行期间零漂移。此前运行后观察到4项并行服务端源/测试变化，旧证据保留，对新快照补跑一次而未累加通过数。真实 TLS 用例证明 Dart 凭据类拒绝无证书并允许受信测试证书完成回环 RPC；其余 CMS 用例使用模拟调用元数据和控制协作者，不是电机动作证明。

真实 JVM ControlSession+grpc-okhttp 基线仍失败：TLS1.2 Finished/ChangeCipherSpec 阶段 Windows SocketException，测试服务收到0条应用 RPC；原因尚未精确归属，不能推断为G20或外部Wi-Fi同一故障。独立生成协议 fixture 契约通过，但依赖原生成功基线的8项证书/身份/ACK用例明确跳过，整套原生真实通信退出码1。没有降低证书校验、禁用主机名检查或把未知状态改为ready。Android KeyChain、G20及真实机器人尚未验收，发布NO-GO。

App既有343项冻结构建输入一致；code14包 SHA256仍为 `c2c86139b1c38b317771e4aa81f9fc4d18d5cf1fdd87332c12b98831c0a9282e`，本轮构建0、安装0、真实机器人RPC0、硬件入口0、SSH0、账号/云权限变更0。证据与验证边界在 `artifacts/release-readiness/20261025-real-transport-depth/README.md`、`checks.json`、`dart-current-results.json` 和 `live-tls-final.txt`。本节替代当前“Dart工具链阻断”的状态，历史记录保留；不把51项服务端测试扩大为原生连通、物理停止或发布通过。

## 2026-10-25 控制取消与停止安全修复已进入 code14 QA APK；G20 USB离线，尚未安装

按“更深入而非扩大功能”追踪原始 Brainstem proto、服务端租约/CMS、JS会话、Expo bridge与Kotlin控制链路。已修复：等待状态期间的旧action/Acquire可能跨连接执行；原生队列旧任务可能越过取消；回拨/非法时间使过期状态保持可用；停止RPC失败被吞掉、重复停止可能因token已清空而假成功。桥接入队、RPC派发与返回均绑定取消代次；本地意图始终撤销，远端未确认则保留失败并阻止后续写入；UI只把“控制权撤销已确认”当完成，不宣称物理静止。

冻结旧实现的3项新增JS反例全部真实失败，修复后的会话/传输/真实ControlScreen回归50/50、实际Kotlin/Expo bridge编译和假通道检查2/2、官方protoc34.0与原始schema双向对照5/5通过。当前登录/游客/只读账户恢复与连接边界61/61、typecheck通过，核验期输入零漂移；旧控制检查按未变源码哈希复用，不把重叠检查累加为正式验收数。独立源码审查通过本轮范围。Dart服务端测试受现成SDK缺少dartdev AOT snapshot阻断，未登记通过；G20原始getevent能力未暴露标准游戏摇杆轴，不能假定普通Gamepad即可接通实体摇杆。

首轮构建的JDK24/Prefab JNA警告被AGP8.12.0作为未知错误抛出，已用现成JBR21做同参数、同生成字节对照并验证正常构建成功；该中间构建因源码变化被门禁拒收，未采用。后续检测已有正常构建时，本线最终尝试在锁阶段停止、构建启动0次；没有重复启动。最终独立采用 `artifacts/release-readiness/20261025-simple-connection-guest-verified/` 的正常构建，核对其全部343项输入与当前资格检查完全一致，源码零漂移、bundle/assemble实际完成、exit0。

新包 `releases/20261025/DOSO-0.0.1-qa-code14-c2c86139.apk`：`com.doso.robot.qa`、code14、`0.0.1-qa`、79,031,529 bytes、SHA256 `c2c86139b1c38b317771e4aa81f9fc4d18d5cf1fdd87332c12b98831c0a9282e`。aapt2/apksigner/实际DEX class_defs与bundle检查通过，签名与code13相同、arm64-v8a和x86_64双ABI、正常启动入口；包内确认本轮取消代次与stop_unconfirmed修复。原code13留存包未变化。最终证据在 `artifacts/release-readiness/20261025-control-depth-code14-final/`，原始缺陷与独立协议证据在 `artifacts/release-readiness/20261025-control-depth/`。

最新ADB清单看不到G20目标，也非unauthorized；已请求森哥重新接好USB。本线安装0次、原生UI检查0次、真实机器人RPC0次，不能说code14已安装或首页/任务/铃铛已实机验收。最近有设备的只读回读仍为code13/SHA23c372ac；恢复USB后再保数据install-r并回读版本、SHA、UID与首次安装时间，随后做冷启动和实际界面核验。没有账号、密码、验证码、数据、生产数据库或云权限变更。上轮现场的路由、Brainstem mTLS部署与配对条件尚未完成验收；真实动作和物理停止仍需固定/硬件急停/电机安全条件及独立实测。发布保持NO-GO，正式设计通过数不增加。

## 2026-10-25 连接页与游客逻辑验证完成，code14 已出包，G20 安装待设备接入

设备连接页默认仅显示机器狗地址、单一连接/取消按钮和状态，其余端口、配对证书/身份、账号/BLE/诊断移入默认折叠的高级设置。缺少配对证书时只引导配置，不派发控制连接；真实 TLS、授权、租约与取消边界保留。登录、普通账号恢复加载和恢复错误页增加“游客使用”；游客是独立的本地浏览状态，不创建 Supabase 匿名账号、不调用退出、不清存储，沿用品牌和五项导航，任务与地图/遥测保持真实空状态或只读模板。游客连接页只允许读取，不能继承后台恢复的缓存账号权限。

进一步故障验证发现设备列表读取复用 accountBusy 会锁住游客入口；现已拆成 deviceBootstrapBusy，只读查询等待时仍可进入游客，而注册/密码/MFA等账号写入进行中继续禁止切换。另将游客切换时的 bootstrap 提交权在渲染时同步撤销，覆盖旧 effect 清理前的竞态。测试执行真实 bootstrap effect 与提交权对象，验证清理前/后迟到成功、失败均不能覆盖设备、型号、错误、导航或完成标记；退出游客可保留原选择并重新准备原账号。定点故障注入能检出两个原缺陷。最终联合回归 **115/115**、TypeScript typecheck、实际 Java/Kotlin/Expo 原生桥编译与假通道测试 **5/5**通过。仅为客户端与本地传输逻辑证据，不是机器人动作验收。

最初的并行 code14 构建失败，后续本轮 JDK21 构建进一步定位到 CMake 复用旧 ccache 发现结果，却在隔离 PATH 中启动裸 ccache，导致找不到程序。现已在项目 CMake 参数显式关闭可选 ccache；使用实际 React Native CMake 检测块的回归能复现旧行为并验证修正（1/1）。最终独立正常入口构建成功、源码输入零漂移、旧包保持不变、锁清理成功。新包 `releases/20261025/DOSO-0.0.1-qa-code14-c2c86139.apk`，`com.doso.robot.qa`、code14、`0.0.1-qa`、79,031,529 bytes，SHA256 `c2c86139b1c38b317771e4aa81f9fc4d18d5cf1fdd87332c12b98831c0a9282e`。包名/版本/启动入口、双 ABI、原生控制标记、游客与精简连接页 bundle 标记已独立检查，签名与 code13 一致，未包含私钥文件。构建后的源码仍与冻结清单完全一致。

G20 本轮尚未升级：初始USB在线、安装code13，后续ADB清单为空，最终包核验时仍无设备。未卸载、未清数据、未读取/保存账号输入值；code13历史安装证据不作code14验收。用户要求优先验证代码，本轮完成可独立执行的逻辑检查与出包，不重复要求USB动作。code14 的 Android 实机布局、游客导航和覆盖升级留待授权设备重新接入后验证。

本轮无凭据、无RPC传输探针到 `192.168.66.64:13145` 未连接；G20最后观察地址 `172.20.10.2`、路由经热点 `172.20.10.1`。未发送真实控制/租约/动力/姿态/策略请求，未改账号、云权限、机器人服务或网络设置。证据：`artifacts/release-readiness/20261025-simple-connection-guest/`。发布NO-GO、正式通过数不增加。

## 2026-10-25 真实控制客户端已补齐并升级 G20 code13；Brainstem 现场接通尚未完成

Android 已新增持久 mTLS 控制会话、端点专用 CA 信任和客户端证书请求证明、Enable / Disable / StandUp / SitDown / SwitchProfile、AcquireControl 与初始零速 WalkChecked ACK。租约 token 只留原生层；序号/owner 核验、150ms 非零输入看门狗、100ms 运动 RPC 截止、后台/离页/取消/失权清除输入，不重放未知结果指令。App 按真实 FSM 开放动力、姿态与策略；调度 ACK 仅表示接受，观察终态后才显示完成。连接中心新增“连接控制台”和配对身份入口；横竖屏都有动作与显式“启用触控”，首个真实触摸才申请短租约，零速 ACK 后下一份新鲜输入才允许移动。云端账号归属与本地配对不混用。旧账号命令执行器仍为空，但直连原生执行器已接线，不能再统称“全部写通道未接入”。

本轮客户端状态机/传输/UI/触摸/连接取消/App wiring 联合回归 **94/94**，Java codec 与实际 Kotlin ControlSession/Expo bridge 编译及假通道测试 **5/5**，typecheck 通过。正常入口单次 QA 构建成功、源码输入零漂移、旧包保持不变；新包 `releases/20261025/DOSO-0.0.1-qa-code13-23c372ac.apk`，`com.doso.robot.qa`、code13、`0.0.1-qa`、79,281,265 bytes、SHA256 `23c372acbbee2d11b6120afeefd2ad0734785d3fa530c0d2adf806395224d2cd`。aapt2/apksigner/DEX/bundle 检查确认双 ABI、正常启动入口和新增控制模块，签名与 code12 相同。已用 `adb install -r` 覆盖升级 G20，未卸载或清数据，系统首次安装时间保持不变；安装后回读 code13，冷启动 Status ok。脱敏原生 UI 检查确认登录页、邮箱/密码、注册与“连接机器狗”入口；未读取/保存输入值、未提交登录或截图含输入内容。

真机阻断仍明确存在：可信 SSH 显示 `thunder-web.service` PID1636 在 loopback13145 跑旧 mixed-CAN stage 二进制；局域网13145由 Python `brainstem-grpc-proxy.service` PID44038 转发，原生 `brainstem.service` 缺失/未启用，预期 `/etc/brainstem` TLS/env 文件和当前服务中的 GRPC 安全配置键缺失。先前 TLS 探测 WRONG_VERSION_NUMBER；本轮对既有代理仅做一次无凭据 GetControlStatus 诊断，3秒 DEADLINE_EXCEEDED。G20 当前地址 `172.20.10.2`，到 `192.168.66.64` 路由经热点网关 `172.20.10.1`，设备端13145 TCP 探针超时。不能把端口开放或 APK 安装扩大为 mTLS/控制成功。

尚需恢复 G20 到机器狗的局域网路由、准备/部署服务器与客户端配对证书、切换原生 Brainstem 后验证真实握手与保护 RPC。新的现场固定/急停/电机未使能条件尚未确认，因此未重启硬件进程或发送任何真实租约、动力、姿态、策略、行走指令。未改账号、密码、数据、Wi-Fi 设置或无线固件。发布仍为 NO-GO，不增加正式通过数。完整证据与源码清单在 `artifacts/release-readiness/20261025-brainstem-production-control/`；该新节补充旧审计的时间点结论，不覆盖历史材料。

## 2026-10-25 APK 能力已核对，三方入口与冗余说明已精简；新包和真实控制仍未验收

本轮直接复核最新留存 code12：`com.doso.robot.qa` / `0.0.1-qa`，79,162,565 bytes，SHA256 `1b3b8f94c50db0a96a53bb9516abc41311b162979f7aa8437dcfdbfabd0e12a8`。aapt2、apksigner v2 和三个 DEX 的 22,066 个 class_defs 确认仅基础 `GetControlStatus` 原生读取已打包，没有新 profile/voltage/motor parser、关节页或本轮入口精简。验证码组件已在旧包，但最新注册不确定结果路由修复未打包。旧 G20 code12 安装证据保留；本轮 ADB 设备为空，没有重新查包或安装。

已修正四项明确源码缺陷：新增只读 RPC 的 native→JS envelope 不一致；16 路关节/足轮标签错排；把 RSStatus 运行状态码误判故障；把离线测量和电压 0 占位当实测。关节电压现在使用单独 GetVoltage 按 id 匹配，离线显示未知，不推断电池 SOC 或机身实测速度。登录、注册页移除三方按钮、分隔条、帮助区及重复欢迎副文案；连接页改为整页滚动、技术详情默认收起，去除重复长说明并保留详情中的固定安全错误原因；品牌、颜色、邮箱认证和账号数据未改。

指定五个稳定产品文件的 UI/只读投影回归通过且零漂移。统一检查中类型检查、38 项连接/控制交互、3 项只读原生合同检查均 exit0，但 App/useBrainstemControl/Control/RobotConnection 在检查期间被并行修改，因此整体验证 `passed=false`，不能计为当前整包通过。并行源码已新增 ControlSession 与 App 直连控制接线；不能再仅凭旧 `PRODUCTION_ROBOT_COMMAND_EXECUTOR=null` 断言所有源码没有写通道，也不能把该新增代码冒充已打包或真实可控。当前本地 Brainstem 的 Enable/Disable/SwitchProfile 已允许来源 allowlist 加匹配客户端证书 principal 的受权远程路径，此项修正覆盖旧“仅回环”能力描述，不表示现场已部署。

本轮资源观察可用 570692 KiB，低于 4194304 KiB，未启动 Gradle；构建0、安装0、真实机器人RPC0、账号/云配置变更0。证据在 `artifacts/release-readiness/20261025-apk-capability-audit/` 的 README、audit.json、checks.json 和 scope-checks.json，历史证据不覆盖。下一步冻结并审查并行控制实现后再正常构建/保数据升级 G20，先做真实只读验收；发布 NO-GO、正式设计通过数不增加。

## 2026-10-24 注册结果不确定时已补齐验证码入口，尚未重新构建 APK

森哥反馈注册后停留在创建账户页，无法输入验证码。根因是注册成功但响应丢失时，Auth 服务抛出 `AuthOperationError(network_unavailable)`，旧 UI 只设置错误文案，没有把邮箱保存到 `pendingVerification`，因此 `EmailOtpScreen` 从未挂载。

实际改动：`App.tsx` 现在在注册结果不确定的网络错误下保留规范化邮箱、切换到 `verify-email` 阶段并显示现有验证码输入页；用户可以直接输入已收到的 6–10 位验证码或使用重发入口，不会再次提交注册。明确的密码错误、注册关闭、用户名冲突等错误仍留在注册页，不会误导到验证码页。验证：`npm run typecheck` 通过；`npm run test:email-otp` 17/17 通过；认证错误与请求回归 56/56 通过。`npm run test:auth-ui` 的既有 `verify-auth-ui.mjs` 文案结构断言失败，与本次 App.tsx 改动无关；未构建或安装新 APK，未改账号/认证配置/数据库。

## 2026-10-24 注册邮件投递链路复核：已生成确认请求，未能证明到达收件箱

森哥要求确认截图中的注册确认邮件是否发出。本轮使用 Supabase 统一日志做脱敏只读查询，没有读取邮箱、用户 ID、验证码、IP 或请求体：`auth_audit_logs` 在 `2026-10-24T14:42:27Z`（北京时间 22:42:27）记录 `user_confirmation_requested`；同一时间窗口的 `auth_logs` 在 `2026-10-24T14:42:30Z` 记录 `/signup` `200`，`error_code` 为空、`msg` 为 request completed。说明注册请求已被 Auth 接受，并触发了确认请求；最近 24 小时没有可见的确认成功或重发动作。

当前证据不能把“确认请求已生成”扩大为 SMTP 已投递到收件箱：统一 Auth 日志没有邮件供应商的 delivered/bounced 事件。应先检查收件箱、垃圾邮件和广告分类；若未收到，需要继续核对项目 SMTP/邮件投递供应商日志或在稳定网络下只重发一次。未修改认证配置、邮件模板、账号或数据库数据。

## 2026-10-24 注册提示复核：请求结果不确定，不等于注册失败

森哥提供的注册页显示“注册请求结果暂时无法确认。请检查邮箱中的确认邮件，或尝试登录后再决定是否重新注册。”源码中的注册请求对 `/auth/v1/signup` 设置了 15 秒有界超时；超时或连接中断时，客户端返回这句保守提示，避免在服务器可能已创建账户的情况下重复提交。Supabase 最近 24 小时的聚合 Auth 日志只读查询显示存在一次 `/signup` `200` 和一次 `/token` `200`，但查询未读取邮箱或用户标识，不能把它单独归因到森哥这次操作，也没有发现对应的 `/verify` 或 `/resend` 聚合记录。

当前正确处理：先查注册邮箱和垃圾邮件文件夹；若收到确认邮件，直接完成确认后登录，不要再次注册。若没有邮件，在已验证可访问 Supabase 的手机热点或其他网络下等待后只重试一次；若仍无邮件，再检查邮件模板/投递日志。未修改账号、密码、认证配置或数据库数据。

## 2026-10-24 Brainstem 只读诊断接入扩展：电机总线电压、16 路电机健康与关节页已接线

森哥要求接入电池电量、速度、模型策略、电机使能/失能和逐关节电机检查。本轮先按真实 proto 能力完成安全只读段，不发送任何控制 RPC。核对 `cms.proto` 后确认：`GetVoltage` 提供 16 路电机总线电压，`GetMotorStatus` 提供在线、状态码、温度、电压、位置、角速度、力矩和错误码；协议没有电池 SOC 百分比，也没有机身实测速度字段，`History.command.walk` 只是目标指令，不能冒充实际速度。

实际改动：Android `DosoBrainstemGrpc` 增加受同一 TLS/mTLS、3 秒截止、前后台和取消门禁保护的 `GetVoltage` 与 `GetMotorStatus` 只读方法；新增有界 protobuf 解析器和测试。连接中心读取状态后会可选读取电压与电机状态，旧 APK/旧 Brainstem/未实现 RPC 时保留已成功的状态与策略，不把可选诊断失败升级成假在线。直连状态层把总线电压作为“电压”诊断（电量百分比仍为未知），将 16 路电机映射到关节页；关节页新增在线、状态码、温度、电压、速度、力矩和错误状态，仍是只读。

策略切换、使能/失能和运动控制仍未开放：`SwitchProfile`、`Enable`、`Disable`、`AcquireControl`、`WalkChecked`、`StandUp`、`SitDown` 仍只在安全合同中登记，App 的生产执行器为空，控制租约、远程 mTLS、ACK/失联清零和硬件急停均未验收。电量 SOC 和机身实测速度继续显示未知，不使用电机总线电压或目标指令推断。验证：`npm run typecheck`、`npm run test:control-ui`（42/42）、Brainstem/直连/控制/关节联合回归（44/44）、`node --test scripts/brainstem-grpc-native.test.mjs`（2/2，含 profile/voltage/motor Java parser）、`git diff --check` 通过。未构建 APK、未安装 G20、未读取真实 Brainstem、未发送任何运动、租约、模式、使能或失能请求；正式设计 0/20、发布 NO-GO 保持。

## 2026-10-24 路由器白名单入口核查：当前固件不支持 Supabase 域名放行

森哥授权检查外部 Wi‑Fi 路由器 `192.168.66.1`，目标是缓解 G20 访问 `vchvqfdlkomlrjenkdhj.supabase.co` 时的 TLS 连接重置。已在路由器后台完成只读菜单核查：`Advanced → Network → Access` 只有 `BlackList / WhiteList` 两个终端访问控制模式；该 WhiteList 针对连接到路由器的设备，不是按域名、SNI 或 URL 放行。System 菜单只有固件、账户、重启、日志和 LED 项，未发现 HTTPS/SNI/URL 过滤或域名白名单入口。

本轮没有切换 BlackList/WhiteList、没有保存任何设置、没有改 Wi‑Fi 密码、端口转发、远程管理或账号数据。路由器状态页显示外网为运营商 5G 在线；因此当前固件不能直接把 Supabase 域名加入白名单。下一步应在上游 CPE/运营商安全策略中关闭针对该域名的 HTTPS/SNI 拦截，或使用手机热点/受信 VPN/代理作为临时网络路径；不要把终端 WhiteList 当作域名白名单，也不能用关闭证书校验绕过 TLS。G20 仍需在网络路径恢复后重新做真实登录验证，当前不能宣称认证已修复。

## 2026-10-24 控制页加入 Brainstem 只读运动模式投影；模式切换仍保持锁定

森哥要求在现有 v3 控制界面显示机器狗当前模式，并预留平地、攀爬、楼梯切换。先核对 `D:\inovxio\brain\brainstem\brainstem_api\brainstem_api\cms.proto`：协议实际提供的是只读 `GetProfile`（当前策略、可用策略和说明）以及写入 `SwitchProfile`，没有“平地/攀爬/楼梯”独立枚举；仓库现有 profile 文件也只有平地类命名。因此本轮不把策略名冒充 terrain enum，也不开放写入 RPC。

实际改动：Android `DosoBrainstemGrpc` 增加受 TLS/mTLS、同一 3 秒截止、前后台生命周期和取消门禁保护的 `GetProfile` 只读方法；新增有界 UTF‑8 `ProfileInfoParser`，只投影 current/available/descriptions/currentDescription，不保留 token、owner、控制权或写入字段。连接中心读取状态后会尝试一次可选 profile 读取；旧 APK、旧 Brainstem 构建或不支持 `GetProfile` 时只显示状态，模式保持“未同步”。直连状态层把可验证的 profile 目录映射为控制页当前策略，并仅对名称明确含 `flat`、`climb`、`stair(s)` 的项投影为“平地模式／攀爬模式／楼梯模式”；切换按钮统一 disabled，原因显示“模式切换通道未接入”，没有 `SwitchProfile`、租约或运动请求。

v3 控制页新增紧凑“运动模式”条，保留 DOSO 原有配色、字号和圆盘摇杆；横屏和竖屏均显示当前模式/未同步状态。验证：`npm run typecheck`、`npm run test:control-ui`（42/42）、`node --test scripts/brainstem-grpc-service.test.mjs scripts/direct-robot-connection.test.mjs scripts/robot-connection-screen.test.mjs scripts/control-screen-interaction.test.mjs`（54/54）、`node --test scripts/brainstem-grpc-native.test.mjs`（2/2，含 Java profile parser）通过，`git diff --check` 通过。未构建 APK、未安装或升级 G20、未连接真实 Brainstem、未调用真实 `GetProfile`，未发送任何运动/租约/模式切换请求；正式设计 0/20、发布 NO-GO 保持。下一步需在 Brainstem 远程监听与 mTLS/设备身份证据完成后，先做一次人工授权的只读 status/profile 验证，再单独评审 `SwitchProfile` 的控制租约和安全门禁。

## 2026-10-24 外部 Wi‑Fi TLS 重置已在电脑直连复现：不是 App Auth 配置

本轮在开发电脑上做了不带账号和 key 的分层探针：项目域名 `vchvqfdlkomlrjenkdhj.supabase.co` DNS 正常解析到 Cloudflare A 记录；直连 IPv4 TCP 443 可建立，但 TLS ClientHello 后收到连接重置；同机直连 `https://supabase.com` 能完成 TLS 并返回 HTTP 200；通过本机已有代理访问项目域名可完成 TLS 并返回预期的 HTTP 401（无 API key）。因此 G20 原外部 Wi‑Fi 的“无法连接认证服务”与电脑直连结果一致，根因优先是 `TopSpeed5GCPE-5525`/上游网络对该 Supabase 项目子域名或 Cloudflare 出口的策略重置，不是 App 的 Supabase URL、Auth API 或账号密码。

当前未修改 App URL、TLS 信任、Supabase 生产配置或云权限。最小修复应在该 CPE/上游网络侧关闭 HTTPS/SNI 过滤或安全拦截，并将 `vchvqfdlkomlrjenkdhj.supabase.co` 加入允许列表；若设备不支持域名白名单，使用已验证的手机热点/受信 VPN/网络代理作为临时路径。不能用改成 `supabase.com`、关闭证书校验或把账号请求转发到不受控代理来绕过。

## 2026-10-24 G20 认证提示与 APK 分享边界

森哥反馈遥控器显示“无法连接认证服务，请检查网络后重试”，并询问如何把 APK 发给他人。本轮当前 ADB 未连接，未重复登录或提交认证请求；沿用最近一次分层证据：G20 在原外部 Wi‑Fi 到 Supabase Auth 的 HTTPS 握手曾在收到 HTTP 响应前被 RST，手机热点对照曾能完成 TLS/证书校验并收到 HTTP 401。该提示首先属于网络路径/HTTPS 可达性，不等同于密码或账号失效；需要在 G20 恢复可达网络后再做一次无账号 health 对照，不能用 APK 分享解决认证服务网络问题。

当前可分享的最近 QA 包为 `releases/20261023/DOSO-0.0.1-qa-code12-1b3b8f94.apk`，包名 `com.doso.robot.qa`、versionCode 12、SHA256 `1b3b8f94c50db0a96a53bb9516abc41311b162979f7aa8437dcfdbfabd0e12a8`。它是内部 QA/debug 签名包，不是 Play 商店或生产签名；同包同签名可覆盖升级并保留本地数据，其他签名/正式包不能直接覆盖。正式外部发布仍需稳定生产签名、真实认证 E2E 和网络验收。

## 2026-10-24 手机对照确认 wlan1 AP 侧故障：厂商 IE 设置返回 -52

森哥用手机对 `DOSOrobotics` 做了对照连接，结果同样失败。机器狗只读复核仍为：`wlan1` AP/信道 1 正常、dnsmasq 进程存在，但 `station dump` 为空、DHCP 租约为空。手机尝试时内核新增 `ieee80211 phy2: brcmf_vif_set_mgmt_ie: vndr ie set error : -52`，表明 BCM43569 AP 在设置厂商管理信息元素阶段失败。由此可排除 G20 特有兼容性和 DOSO 认证，当前阻断明确在 `wlan1` 的 Broadcom USB AP 驱动/固件路径。

本轮没有更改账号、控制、Brainstem 或安全参数；继续使用当前热点不会产生可用客户端。后续应优先更换官方适配的无线模块/外置 AP 网卡，或取得模组厂商针对该驱动的 AP 修复包，不再继续盲调密码。

## 2026-10-24 双网卡职责确认：wlan0 外网与 wlan1 机器狗热点可并行

森哥询问 `wlan1` 是否能在 `wlan0` 连接外网时同时工作。实时状态已经证明可以：当前 `wlan0` 是 Realtek 客户端，连接外部 Wi‑Fi 并使用 `192.168.66.64/24`；`wlan1` 是独立 Broadcom USB 射频，作为 `DOSOrobotics` AP 使用 `192.168.50.1/24`。两者职责分离，不需要二选一。

量产网络建议固定为：机器狗 AP 网关 `192.168.50.1`（Brainstem 本地端点将使用该地址）；G20 作为客户端从 `192.168.50.0/24` DHCP 获取地址，并按设备 MAC 做保留；外部云/维护链路走 `wlan0`，其地址由外部网络固定租约或静态配置。这样不必依赖 G20 动态 IP 来定位机器狗。

`wlan1` 当前不能连接 G20 的原因也不是与 `wlan0` 并行冲突：它能发 beacon，G20 能看到 BSSID，但关联阶段收到 `ASSOCIATION_REJECTION`，机器狗没有 station、没有 DHCP 租约。根因范围仍在 BCM43569 USB 模组/厂商驱动/AP 兼容性；缺少 CLM 是降级异常，但不是已证实的唯一原因。Brainstem 远程监听和 mTLS 仍未完成，不把当前双网卡状态冒充成可控链路。

## 2026-10-24 CLM 不能安全从主固件推算；wlan0 具备 AP 能力但未验证并行

森哥询问是否能逆向生成 `clm_blob`，以及 `wlan0` 是否支持热点。结论：CLM 是 Broadcom 提供的区域/法规二进制映射，`brcmfmac` 将其作为独立 blob 请求并下载；不能从 `brcmfmac43569.bin` 或国家信道表安全推算，错误文件可能造成区域合规、功率和信道风险。本轮不反编译/伪造/替换 CLM，只接受芯片模组供应商或 D‑Robotics 的精确资源。

实时只读能力显示 `wlan0` 的 Realtek `rtw88_8822ce` 驱动在 `iw phy phy0 info` 中声明支持 `AP`，所以它**具备热点模式能力**；当前仍作为外部 Wi‑Fi 客户端连接 `TopSpeed5GCPE-5525`，地址 `192.168.66.64`。尚未证明它支持同一物理射频的 AP+STA 并行，也没有把它切成热点，避免丢失 SSH/外网。若切换 `wlan0` 做热点，必须先确保 `wlan1` 或有线网络能承载外网并保留本地回滚入口。

## 2026-10-24 BCM43569 固件角色厘清：缺少 CLM 不等于驱动必然不能工作

为避免把 `clm_blob` 误当成唯一根因，本轮按 Linux `brcmfmac` 源码复核其语义：`brcmfmac43569.bin` 是芯片初始化所需的主固件，`brcmfmac` 是 Linux 主机侧驱动；`brcmfmac43569.clm_blob` 是后续下载到芯片的法规/区域通道与功率映射。上游驱动在找不到 CLM 时会记录“device may have limited channels available”并继续返回成功，而不是直接停止网卡初始化。因此当前机器能出现 `wlan1`、发出 AP beacon，说明主固件和驱动确实已在工作；缺 CLM 是合规/能力降级异常，但**不能单独证明**它就是 G20 关联拒绝的唯一原因。

当前 G20 的 `ASSOCIATION_REJECTION` 仍需结合 AP 驱动、PSK/握手、PMF、客户端兼容性和厂商 USB 模组支持继续区分。没有匹配 CLM 时可以做开发诊断，但不能把当前组合登记为量产无线方案；不安装其他型号 CLM，不把缺 CLM 直接冒充为已定位的单一根因。

## 2026-10-24 外部固件来源复核：公开仓库只有 BCM43569 主固件，没有区域 blob

继续搜索外部来源后，Linux Wireless 文档和 Linux firmware 公共仓库都只列出 BCM43569 的 `brcmfmac43569.bin`；公共树没有 `brcmfmac43569.clm_blob`。这与机器狗内核日志“缺少 clm_blob”一致，说明网上可直接下载的通用 Linux firmware 不能补齐当前缺口。官方 RDK S100 BSP 也没有该文件，当前只能向 BCM43569 模组供应商或 D‑Robotics 获取专用区域资源，或更换官方支持的 Wi‑Fi 模块/外置 AP 网卡。

本轮没有从第三方站点下载或安装不明二进制，没有改机器狗、账号、Brainstem 或控制功能。

## 2026-10-24 官方 RDK S100 BSP 固件审计：没有 BCM43569 匹配资源

森哥要求继续找匹配的 RDK S100 无线固件。本轮只读取得 D‑Robotics 官方 RDKS100 V4.0.5（20260507）归档目录索引，并用 HTTP Range 读取 ZIP 中央目录和相关小包内容，没有下载 6.26 GB 的完整镜像、没有写机器狗。官方 BSP 目录只有 `product.zip` 和 `deb_rootfs_packages.zip`；后者包含 `hobot-wifi_4.0.5-20260211103824_arm64.deb` 与 `hobot-firmware_4.0.5-20260507202525_arm64.deb`。

逐项检查结果：`hobot-wifi` 的固件是 AIC8800 系列，`hobot-firmware` 含 Cypress/Realtek/XM612 相关资源，但两者都没有 `brcmfmac43569.clm_blob` 或 BCM43569 专用文件。当前机器的 `BCM43569/2` 因此不是这套官方 BSP 的已打包模块。官方 S100 无线调试文档以 AW‑XM612 模块为例，官方网络文档的 Soft AP 命令也假定无线模块驱动已正确匹配；不能把 AIC8800 包改名安装到 BCM43569。

结论：目前没有可安全安装的“匹配 RDK S100 + BCM43569”固件可从官方 BSP 直接取得。继续在现有机器上盲装 `hobot-wifi` 或通用 `linux-firmware` 会造成模块/驱动不匹配，不能作为修复。账号数据、Brainstem、热点当前 profile 和控制功能均未再改动。最快可靠的硬件路径是换用官方支持的 AW‑XM612/XM612 类 PCIe Wi‑Fi 模块，或接入已验证支持 AP 的外置网卡；之后再把热点/DHCP 配置迁移到新接口并验证 G20。

## 2026-10-24 横屏控制页极简稿已落到源码，尚未进行 G20 实机升级

森哥要求恢复原版 DOSO 的轻量控制风格。本轮已将 `src/screens/ControlScreen.tsx` 的横屏控制面收敛为返回、设备名、短连接状态、左右圆盘摇杆和停止/站立/坐下三项动作，移除横屏速度、电量、输入来源、地图、任务、路线、Brainstem 说明和附加动作面板。设计 QA 不再注入机器人画面或“设计示意”徽标。真实动作门禁、无障碍阻断原因和本地预览隔离保持不变，未发送任何机器人控制请求。

本轮证据：`artifacts/ui-refresh/20261024-control-minimal-v1/app-landscape.png`（844 × 390 本地 Web Design QA 截图）及同目录 README。`npm run typecheck`、`npm run test:control-ui`（40/40 控制交互测试）和 `npm run test:design-qa-harness`（请求、浏览和 harness 检查通过）已通过。该截图不是 G20 实机证据，不代表 Brainstem、摇杆、站立或坐下能力已接通；当前发布结论仍为 NO-GO，下一步需森哥确认视觉后再安排 G20 安装包和真机检查。

## 2026-10-24 浮动轮盘、遥测栏和关节状态只读页已加入源码，尚未进行 G20 实机升级

森哥要求按下位置决定轮盘中心，并显示速度、信号、电量，同时增加关节状态查询入口。本轮将横屏 `ControlJoystickPair` 扩展为浮动锚点模式：左右半区任意按下即可定位圆盘，移动时按相对锚点计算输入，松手回到中性值；视觉改为 DOSO 浅蓝表面和双层细环。横屏顶部新增速度、信号、电量紧凑栏，数据缺失显示 `—`，不伪造遥测；芯片图标进入 `JointStatusScreen` 只读页，只有经过设备来源校验的关节记录才会展示，未同步时保持空状态。

本轮证据：`artifacts/ui-refresh/20261024-control-floating-v2/app-landscape.png` 及同目录 README。`npm run typecheck`、`npm run test:control-ui`（42/42 控制交互测试）、`node --test scripts/joint-status-screen.test.mjs`（2/2）已通过。该截图仍是本地 Web Design QA，不代表 G20 已安装、真实速度/信号/电量已读取或关节服务已接入；生产控制门禁、Brainstem gRPC 和账号数据均未改变。

## 2026-10-24 横屏控制页现场控制台 v3 已完成本地设计预览，尚未进行 G20 实机升级

森哥反馈上一版仍然不好看。本轮没有增加新功能，而是重新组织视觉关系：轮盘改成白面深蓝细环和浅色内圈，速度/信号/电量改为无胶囊的细分状态栏，中央 DOSO 标记加横向细线，停止/站立/坐下改成垂直图标按键，停止使用安全红边界。浮动按下定位、关节状态入口、未知遥测保护和真实控制门禁保持不变。

本轮证据：`artifacts/ui-refresh/20261024-control-field-console-v3/app-landscape.png` 及同目录 README。`npm run typecheck` 和 `npm run test:control-ui`（42/42）已通过；截图仍是本地 Web Design QA，不代表 G20 已安装或真实机器人控制、遥测、关节服务已接通。

## 2026-10-24 G20 拒绝原因已复核并回滚诊断参数：仍是 AP 关联层阻断

森哥追问“为什么还是拒绝”。G20 最新记录显示它先对 `DOSOrobotics` 发起关联，约 2.8 秒后得到 `ASSOCIATION_REJECTION`（`statusCode=-1`），再次尝试时变成 `NETWORK_NOT_FOUND`；此前的四次握手超时只发生在更早的配置状态。机器狗侧同一时段没有 station、没有 DHCP 租约，因此 DOSO App、Supabase 认证和账户密码都还没有参与。

为避免把临时诊断配置留在机器狗上，本轮已把 PMF 从 `disable` 恢复为原来的 `default`，并重启 `wlan1` profile；复核显示 `wlan0` 外网 `192.168.66.64/24`、`wlan1` `192.168.50.1/24` 均恢复连接，热点配置未再扩大改动。没有账号/数据变更、Brainstem 重启或控制指令。

结论：当前“拒绝”发生在 Broadcom AP/厂商驱动与 G20 的 802.11 关联层，DHCP 和 App 登录均未开始。单纯改 NetworkManager 的 PMF/WPA 参数没有解决；下一步应取得匹配 RDK S100 的无线 BSP/区域固件，或在明确安全边界后用 hostapd 做一次可回滚的用户态对照，不再继续盲目改密码。

## 2026-10-24 用户态 WPA2 快速诊断已执行；G20 仍被 AP 拒绝关联

森哥要求快速完成用户态修复。本轮没有动内核源码、没有替换固件、没有改账号或 Brainstem，而是把 `dog-hotspot` 的 NetworkManager 安全参数显式收紧为 `wpa-psk` + `rsn` + `ccmp/ccmp`，并将 PMF 从默认值改为 `disable`，随后只重启 `wlan1` 热点 profile；`wlan0` 外网保持 `192.168.66.64/24`。

复核结果：热点仍为 `DOSOrobotics` / 信道 1 / `192.168.50.1/24`，NetworkManager dnsmasq 仍在运行；G20 在 `16:52:00` 的新记录从关联开始约 2.8 秒后以 `ASSOCIATION_REJECTION` 结束，之后再次记录 `NETWORK_NOT_FOUND`，机器狗 `station dump` 仍为空、DHCP 租约仍为空。相较此前的 `FOURWAY_HANDSHAKE_TIMEOUT`，PMF 调整改变了失败阶段，但没有形成客户端关联；不能把这次用户态调整登记为成功。

这说明当前更像 Broadcom AP 驱动/厂商固件或客户端兼容性问题，单靠 NetworkManager 参数不足。PMF 已保留为 `disable` 作为下一次人工重试的诊断状态；若仍失败，应恢复为 `default`，并转向匹配 RDK S100 BSP 的无线固件或 hostapd/厂商驱动方案。未发送控制指令。

## 2026-10-24 厂商无线初始化执行后未改变关联结果；不继续盲改安全参数

森哥授权开始修复。本轮按厂商脚本的内核/驱动指纹门禁执行 `/usr/local/sbin/bcm43569-usb3-init`，随后独立只读复核：`wlan0` 仍为 `192.168.66.64/24`，`wlan1` 仍为 `DOSOrobotics` AP、信道 1、`192.168.50.1/24`；`bcm43569_clm_optional` 与 `brcmfmac` 均已加载，但 G20 仍无 station、无 DHCP 租约。脚本没有提供缺失的 `brcmfmac43569.clm_blob`，内核早期日志仍保留 `ret=-2`/`no clm_blob available`，因此不能把“脚本执行”登记为修复完成。

本轮没有安装通用 `linux-firmware`、没有替换厂商 BSP、没有重启主机或 Brainstem、没有改账号数据和没有发送控制指令。热点安全参数仍为 WPA-PSK/RSN/CCMP、PMF 默认可选；在没有拿到匹配厂商区域文件或新的主机侧 WPA 事件前，不再盲目改成开放热点或反复切换协议。当前结论仍是：连接阻断在 WPA/AP 驱动层，DHCP 尚未开始。

## 2026-10-24 RDK S100 厂商无线初始化已发现；尚未执行

进一步只读核对确认机器狗主机为 D-Robotics RDK S100、内核 `6.1.158-rt58-DR-4.0.5-2603191535-gf29a43-g94bc27`。系统自带厂商目录 `/usr/local/lib/bcm43569-usb3/`，包含 `bcm43569_clm_optional.ko`；`/usr/local/sbin/bcm43569-usb3-init` 会校验指定内核、无线驱动和 helper SHA，并只对 USB BCM43569 接口加载区域补丁，保留原 RTL `wlan0` 优先级。当前没有发现对应 systemd unit；helper 模块虽已加载，但普通用户不能读取其 `apply` 参数，因此不能仅凭 `lsmod` 宣称区域补丁已生效。

本轮没有执行该厂商脚本、没有用 `sudo` 改模块、没有重启无线/主机，也没有改变热点、账号、Brainstem 或控制通道。若继续修复，应先固定并确认急停可用，再安排可回滚的“运行厂商初始化脚本 → 仅重启 wlan1 热点 → 复测 G20 WPA/DHCP”步骤；不得用通用固件覆盖 D-Robotics BSP。

## 2026-10-24 热点驱动固件线索：缺少 BCM43569 区域文件，尚未安装或重启

在 G20 仍无法关联后，本轮继续做只读驱动检查。机器狗内核日志确认无线芯片为 Broadcom `BCM43569/2`，加载 `brcmfmac43569.bin` 时找不到 `brcmfmac43569.clm_blob`，并报告 `no clm_blob available`；随后还出现数条 `brcmf_vif_set_mgmt_ie ... error -52`。这与 G20 能看到 BSSID、但 WPA 握手后断开、机器狗无 station 和无 DHCP 租约的现象相符，当前优先怀疑 AP 驱动/固件兼容性，而不是 App 认证或账号数据。

系统只有 `brcmfmac43569.bin`，没有对应 `clm_blob` 文件；APT 仓库虽有 `linux-firmware` 候选包，但本轮只做了候选包下载/内容检查，没有安装包、替换固件、重启 NetworkManager、重启主机或改变热点安全参数。候选包检查未得到可审核的 `brcmfmac43569.clm_blob` 路径，因此不能直接把通用 `linux-firmware` 当成修复方案。下一步应先取得与该机器 BSP/内核匹配的 Broadcom 区域文件或厂商固件包，并在固定、急停可用且不使能电机的条件下安排可回滚安装；在此之前保持当前 AP 配置与账户数据不变。

## 2026-10-24 G20 修复后重连仍停在 WPA 握手：无客户端关联、无 DHCP 租约

森哥要求继续检查机器狗热点的客户端关联和 DHCP，且不改账号数据、不发送控制指令。本轮对机器狗与 G20 做了新的只读核对：G20 在 `14:29:21` 发起了对 `DOSOrobotics` 的强制连接，看到 BSSID `78:bd:bc:7c:3a:14`、频率 `2412 MHz`、信号约 `-51 dBm`，但在 `14:29:27` 进入断开；G20 的 `dumpsys wifi` 将该次记录标为 `NETWORK_DISCONNECTION`，并更新了 failure count。G20 当前仍回到外部 Wi-Fi `192.168.66.104`，没有 `192.168.50.x` 地址。

同一时间窗口在机器狗侧读取到：`wlan1` 为 AP、SSID `DOSOrobotics`、信道 1、`192.168.50.1/24`；NetworkManager 管理的 dnsmasq 进程仍在运行，DHCP 地址池为 `192.168.50.10-192.168.50.254`；但 `iw dev wlan1 station dump` 为空，租约文件没有产生。因此连接没有进入 DHCP，且机器狗 AP 没有保留 G20 的客户端关联。

非敏感安全参数核对结果：`wpa-psk`、`rsn`、`ccmp/ccmp`、非隐藏、2.4 GHz 信道 1。当前证据更符合 WPA 四次握手或 AP 驱动兼容性问题，而不是 DHCP、DOSO 认证或账号问题；未读取或输出 PSK，未切换成开放热点，未重启外网网卡或 Brainstem。下一步应在保留 WPA 的前提下抓一次主机侧无线驱动事件，或由森哥确认机器狗热点的实际 PSK 后再做一次客户端输入核对；不通过前不把热点作为量产连接方案。

## 2026-10-24 机器狗热点依赖已补齐；G20 仍需一次修复后的人工重连

森哥反馈在 G20 手动输入 `DOSOrobotics` 和密码后仍无法连接。本轮先完成机器狗热点链路的最小授权修复，范围限定在 `wlan1`，没有重启或改动外网 `wlan0`、Brainstem、账号数据或控制通道：安装 `dnsmasq` 作为 NetworkManager 共享 AP 的 DHCP 辅助，禁用独立的系统 dnsmasq 服务以避免与现有端口冲突；将 `dog-hotspot` 固定为 2.4 GHz 信道 1、非隐藏、WPA-PSK/RSN/CCMP、`192.168.50.1/24`，并重启该热点 profile。重启后机器狗侧已出现 NetworkManager 管理的 dnsmasq，地址池为 `192.168.50.10-192.168.50.254`；`wlan0` 仍保持 `192.168.66.64/24`，未影响外网链路。

修复后 G20 的只读状态仍显示外部 Wi-Fi `192.168.66.104`，没有 `192.168.50.x` 租约；最近一组 DOSOrobotics 连接记录发生在 `2026-10-24 14:08`，包含一次关联后 `FOURWAY_HANDSHAKE_TIMEOUT` 和一次 `NETWORK_NOT_FOUND`，同时 `AuthFailure=0`、`ConsecutiveWrongPassword=0`。这证明此前问题不是密码错误，但还没有形成“修复后成功关联 + DHCP 租约”的证据。开发电脑扫描也尚未看到该 SSID，因此不能把本轮配置激活当成量产可用。

下一步只需要森哥在 G20 的 Wi-Fi 页面重新选择 `DOSOrobotics` 并输入原密码一次；成功后只读取 G20 的当前地址和机器狗 DHCP 租约，不发送 Brainstem 或运动指令。若仍失败，再根据“有无客户端关联、是否有 DHCP 租约”分层检查 AP beacon/驱动或 DHCP，不会反复改密码或切换到不安全的开放热点。

## 2026-10-24 G20 扫描不到机器狗热点：AP 配置已激活但尚未证明在空口广播

只读核对结果：机器狗 `dog-hotspot` 配置为 SSID `DOSOrobotics`、AP 模式、非隐藏、WPA-PSK、共享地址 `192.168.50.1/24`；`wlan1` 当前报告 AP/信道 1。开发电脑和 G20 的扫描结果均未出现 `DOSOrobotics`，G20 当前仍连接外部 Wi‑Fi；机器狗 `wlan1` 没有已连接客户端。当前可以确认 NetworkManager 配置和接口状态，不能确认热点 beacon 已被客户端接收，因此暂不把“connected/AP”状态当成量产可用。

量产网络方向：每台机器狗应有唯一 SSID/配对码和独立 mTLS 身份，遥控器更换后通过本地配对恢复控制；不能依赖共享出厂密码或单一固定 IP。短期联调可先修复 2.4GHz 固定信道/广播和 DHCP，再验证 G20 获得 `192.168.50.x`；长期需要把 mTLS 客户端身份作为主授权，不能让动态热点 IP 成为唯一控制门槛。未修改热点配置，未发送控制指令。

## 2026-10-24 机器狗双网卡实时核对：热点链路已就绪，Brainstem 远程监听仍待配置

通过一次性 SSH 只读检查确认当前网络状态：`wlan0` 连接外部 Wi‑Fi，地址 `192.168.66.64/24`，默认路由为 `192.168.66.1`；`wlan1` 连接 `dog-hotspot`，处于 AP 模式，SSID 为 `DOSOrobotics`，地址 `192.168.50.1/24`，2.4GHz 信道 1。两个网段职责分离，适合让 G20 始终通过机器狗热点做本地控制，同时由 `wlan0` 维持云端/外部网络。未修改网络配置，未发送控制指令。

当前还不能把“热点可用”当成 App 已能控制：Brainstem gRPC 仍需独立 `brainstem.service`、远程 mTLS 和来源 allowlist；本次网络检查没有重启或切换服务。

G20 侧的只读 Wi‑Fi 记录显示它确实尝试过 `DOSOrobotics`，但最近一次为 `ConnectFailure=1`、`AuthFailure=0`、`ConsecutiveWrongPassword=0`，且扫描结果没有该 SSID；因此“无法登录”不是密码错误，优先是 AP beacon/关联或共享模式 DHCP 未完成。机器狗侧的 `dog-hotspot` profile 虽报告 activated，但未观察到客户端关联，先修热点广播和 DHCP，再谈 DOSO 连接。

进一步只读检查显示机器狗主机没有 `dnsmasq` 或 `hostapd` 可执行文件；NetworkManager 版本为 1.36.6。当前 `ipv4.method=shared` 需要的 DHCP/NAT 辅助链路并未得到证据，因此量产镜像不能只保存一个 NetworkManager profile，必须把 AP/DHCP 依赖和开机自检一起纳入镜像。未安装软件包，未重启热点。

后续 mTLS allowlist 还要覆盖 G20 在两种网络下的来源地址：外部 Wi‑Fi 模式是 `192.168.66.104`，热点模式会变成 `192.168.50.x`。因为 Brainstem 拒绝通配网段，正式部署前应为 G20 做稳定的热点 DHCP 保留或静态地址，再把该具体地址加入 `--grpc-peer-ip`；不能只把机器狗地址 `192.168.50.1` 写进 allowlist。

## 2026-10-24 控制中心按 UI 准则收敛字体、文案、Radix 色彩与几何

森哥提供了 10 条 UI 准则。本轮针对控制中心与连接相关文案完成第一段收敛：生产 `src/` 内中点分隔扫描为 0；控制中心横屏文字收敛到 12、16、20 三档；短说明改为状态标签和必要安全确认；横屏控制面使用 Radix Gray、Blue、Red、Green 语义角色，摇杆改为 hairline 边框并移除阴影；圆角按容器、控件、胶囊分级。设备身份、控制门禁、未接入原因和真实数据边界保留。

验证：`npm run typecheck` 通过；`npm run test:control-ui` 8/8 布局、40/40 摇杆与控制交互通过；`node --test scripts/control-screen-interaction.test.mjs scripts/robot-connection-screen.test.mjs scripts/device-enrollment-ui.test.mjs` 36/36；UI 审计的 `middleDotCopy` 为 0。全仓库历史页面仍有旧色值和字号，Radix 全 App 迁移尚未完成，不能据此宣称全局达标。预览在 `artifacts/ui-refresh/20261024-control-criteria-v1/`；未构建 APK、未安装 G20、未发送 Brainstem 或机器人请求。

## 2026-10-24 横屏控制中心改用圆盘摇杆；移动/转向语义保持不变

森哥要求把左右十字摇杆换成圆盘。本轮仅将横屏沉浸式控制中心的视觉变体改为圆盘，左盘仍绑定移动、右盘仍绑定转向；触屏/实体输入来源、禁用原因、动作门禁和生命周期保护不变，竖屏原有摇杆样式不变。预览在 `artifacts/ui-refresh/20261024-control-disc-v1/`。

验证：`npm run typecheck` 通过；`npm run test:control-ui` 8/8 布局、40/40 摇杆与控制交互通过；`node --test scripts/control-screen-interaction.test.mjs` 20/20。未构建 APK、未安装 G20、未发送 Brainstem 或机器人请求，正式设计 0/20、发布 NO-GO 保持。

## 2026-10-24 控制中心参考图对齐 v3：设计示意补入现有 THUNDER 素材，生产图传仍为空门禁

森哥反馈上一版“有结构但不像参考图”。本轮继续按 844×390 参考图收敛：横屏控制中心增加圆角画面容器和外层留白，调整顶部 HUD、中央主体比例、右侧圆形工具栏、左右十字摇杆及底部动作坞；Design QA 只在预览层注入项目已有的 THUNDER 透明素材，并明确标注“设计示意 · 非实时图传”。生产 `ControlScreen` 仍不默认渲染设备图片、不伪造在线/速度/距离，真实 `mapContent` 到位后才承载真实内容。

本轮验证：`npm run typecheck` 通过；`npm run test:control-ui` 8/8 布局、40/40 摇杆与控制交互通过；`node --test scripts/control-screen-interaction.test.mjs` 20/20。预览在 `artifacts/ui-refresh/20261024-control-reference-aligned-v3/`，来源为本地 Design QA；未构建 APK、未安装 G20、未发送 Brainstem 或机器人请求，正式设计 0/20、发布 NO-GO 保持。

## 2026-10-24 控制中心按森哥参考图重构横屏首屏；仍不宣称真实图传或控制接通

森哥指出上一版只是压缩卡片，没有参考 844×390 控制中心图。本轮沿参考图重构 `ControlScreen` 横屏分支：全屏媒体层、顶部“手动控制”设备/链路 HUD、速度/电量状态胶囊、右侧状态/地图/任务/路线工具栏、左右十字摇杆、底部停止/站立/坐下/更多动作坞。竖屏原有信息流保留，真实能力细节仍按门禁显示。为保持 DOSO 真实边界，未复制参考图的绿色在线状态、距离、机器狗图片或实时画面；没有 `mapContent` 时只显示“实时画面未接入”，动作仍按现有未接入门禁执行。

实际改动：`src/screens/ControlScreen.tsx` 增加参考图对齐的横屏沉浸式布局；`src/components/ControlJoystick.tsx` 增加只在该布局使用的十字摇杆变体；控制策略、电机动作、输入来源、地图/任务/路线和 Brainstem 详情仍可展开。验证：`npm run typecheck` 通过；`npm run test:control-state` 3/3；`npm run test:control-ui` 8/8 布局、40/40 摇杆与控制交互通过；控制操作与屏幕行为回归 22/22。预览在 `artifacts/ui-refresh/20261024-control-reference-aligned-v1/`，来源为本地 Design QA，不是 G20 实机。未构建 APK、未安装 G20、未发送 Brainstem 或机器人请求；正式设计 0/20、发布 NO-GO 保持。

## 2026-10-24 mTLS 方案已准备；未生成或传输私钥，控制指令保持零

森哥要求在不发送控制指令的前提下准备一套更简单的真实接入方案。本轮新增 [BRAINSTEM_MTLS_BOOTSTRAP.md](docs/runbooks/BRAINSTEM_MTLS_BOOTSTRAP.md)，把证书步骤收敛为一次性设备配对：服务端私钥只留在机器狗主机，G20 客户端私钥只进入 Android KeyChain，DOSO 页面只使用系统证书 alias；允许 G20 与开发电脑两个来源 IP，但控制租约仍保持单一拥有者。当前没有生成证书、没有把私钥写入仓库或聊天、没有修改远端主机、没有发送任何控制请求。

证书不是为了增加日常操作，而是为了证明“发请求的是已配对的 G20”，避免同一局域网内任意设备仅凭 IP 伪装成控制端。证书就绪后，日常连接会收敛为连接中心的一次点击；在此之前继续保持只读和控制门禁。

Brainstem 侧新增 `scripts/prepare_mtls_bundle.py` 和 `docs/MTLS_CERTIFICATE_BUNDLE.md`：默认 dry-run，显式 `--generate` 才创建密钥；输出目录必须是仓库外绝对空目录，私钥/PKCS#12 权限为 `0600`、目录 `0700`，密码只通过隐藏输入进入 OpenSSL；G20 客户端身份必须由用户在本机导入 Android KeyChain，工具禁止 ADB 传输私钥。证书准备测试 `8/8`、服务切换测试 `14/14`、Ruff 均通过；本轮 dry-run 成功且未创建任何证书文件。

## 2026-10-24 控制页信息层简化；保持真实能力门禁

森哥反馈控制页过于复杂。本轮只调整 `src/screens/ControlScreen.tsx` 的默认展示层级，不删动作状态层、不改品牌配色、不添加假遥测或真实控制请求：G20 横屏首屏收敛为设备/链路摘要、站立/坐下/停止、速度、输入来源和摇杆；设备状态详情、Brainstem 诊断、地图/任务/路线、动作未接入原因及电机/策略动作均通过明确的折展入口保留。竖屏同步隐藏长诊断正文，点击“详情”仍可查看。

验证证据：`npm run typecheck` 通过；`npm run test:control-state` 3/3；`npm run test:control-ui` 8/8 布局、39/39 控制/摇杆交互通过；`node --test scripts/control-operations-wiring.test.mjs scripts/control-screen-interaction.test.mjs` 21/21。设计检查预览在 `artifacts/ui-refresh/20261024-control-simplified-v4/`（`app-landscape.png`、`app-light.png`、`app-dark.png`），来源为本地 Design QA，不是 G20 原生实机证据。未构建 APK、未安装 G20、未发送 Brainstem 或机器人请求；正式设计 0/20、发布 NO-GO 保持。

## 2026-10-24 SSH 只读检查确认 Brainstem 根因：服务进程运行但仅回环监听

森哥授权使用临时 SSH 凭据后，本轮通过 `sunrise@192.168.66.64` 做了一次性只读检查；密码未写入文件、源码、日志或发布材料。主机名返回 `ubuntu`；`han_dog` 进程正在运行（PID 1721），但 `ss -lntp` 显示仅监听 `127.0.0.1:13145`。`brainstem.service` 为 `inactive`，`thunder-web.service` 为 `active`，当前进程来自 `thunder-web.service` 管理的历史构建路径。没有停止、重启、替换服务，也没有读取环境变量、证书或私钥内容。

这解释了开发电脑此前对 `192.168.66.64:13145` 的连接失败：当前是 loopback-only h2c，不是远程 mTLS 监听。要开放给 G20，必须先完成受审查的 Brainstem 配置：`HAN_DOG_GRPC_ALLOWED_IPS` 填 G20/网关的源 IP（不是机器狗 IP）、完整 server cert/key/client CA、客户端 leaf principal 映射，并按回滚方案切换服务。切换前仍需保持机器狗固定、急停可用、电机未使能；本轮没有执行任何服务变更或控制 RPC。

进一步的只读单元检查显示，当前 `thunder-web.service` 的 `ExecStart` 指向历史构建目录下的 `han_dog`，使用同目录的 `web_control.env`，运行用户为 `sunrise`；系统中没有已加载的 `brainstem.service` 单元。当前应先整理并审查新 Brainstem 构建、环境文件和回滚单元，再决定是否切换服务，不能直接把旧 `thunder-web` 进程改成公网监听。

本轮还读取了连接侧的非敏感网络状态：G20 ADB 设备 `9f2679cd` 当前 Wi‑Fi 地址为 `192.168.66.104`，开发电脑在同一网段的地址为 `192.168.66.62`；机器狗主机的 `/etc/brainstem/tls` 目录当前不存在，说明远程 mTLS 证书尚未配置。未读取或传输任何证书、私钥或环境变量值，因此暂不能切换到远程服务。

森哥已授权后续修改服务配置；本轮仍未写入远端，因为缺少可审核的 mTLS 证书和客户端 principal。计划中的独立 `brainstem.service` 会保留现有 `thunder-web.service` 回滚路径，并支持 G20 与开发电脑两个来源 IP；没有证书前不会用明文 h2c 或仅改成 `0.0.0.0` 来冒充完成。

本地筹备改动已完成于 `D:\inovxio\brain\brainstem\scripts\setup_brainstem_service.py`：默认把 `thunder-web.service` 和 `han_dog.service` 纳入独立 `brainstem.service` 的冲突、切换和回滚；新增可重复的 `--grpc-peer-ip`（最多 16 个 literal IPv4），同时输出现代 `HAN_DOG_GRPC_ALLOWED_IPS` 与一致的旧别名；`--enable` 仍是唯一会切换服务的开关。其脚本测试 `14/14` 与 Ruff 检查通过，未执行远程部署、重启或控制请求。

这里的“多连接”指多个受信来源可以完成 TLS/只读接入；控制租约仍然是单一拥有者，不能让 G20 与云卓遥控器同时向电机发控制指令。G20 的真实源 IP 已记录为 `192.168.66.104`，开发电脑为 `192.168.66.62`，但两者只有在证书和 principal 配置完成后才会加入远程 allowlist。

## 2026-10-24 控制页完整动作区与状态层按横屏参考补齐；真实动作仍锁定

森哥提供了 844×390 横屏控制中心参考，要求把动作、速度、输入来源和状态层补完整，同时在真实能力未接入时显示原因、不发送假动作。本轮沿 DOSO 现有白底/柔蓝/石墨字体和独立控制页结构实现，不复制参考图的绿色在线状态、假图传或示例速度。

实际改动：`ControlScreen` 增加可折叠动作区（站立、坐下、停止、使能、失能、控制策略模型），每项现在有 `未接入/已提交/已接受/执行中/已完成/失败/超时` 状态标签和固定阻断原因；新增设备身份、连接状态、控制权、故障状态四格摘要。中部新增线速度、横移速度、旋转速度三项，只有受信设备状态或最近指令才可填值，默认显示“未知”；下方新增触屏/实体摇杆来源切换，实体轴/HID 未接入时保持禁用并解释原因，触屏输入也继续受生产控制门禁约束。

`controlOperations.ts` 新增停止动作、动作状态类型、速度/故障/输入来源运行时类型和纯状态机 `transitionControlOperationState`，拒绝非法 ACK 顺序；App 继续将停止、站坐、电机、策略全部设为未接入，无生产 callbacks。未添加假图传、假遥测、假控制权或真实 RPC。

验证证据：`npm run typecheck` 通过；`npm run test:control-state` 3/3；`npm run test:control-ui` 静态/布局/控制/摇杆 39/39；控制操作与交互回归 19/19，归档于 `artifacts/release-readiness/20261024-control-action-surface/README.md`。当前源码的 Web 设计预览（390×844、844×390）在 `artifacts/ui-refresh/20261024-control-action-surface-preview/`，来源为开发期 Design QA，不是 G20 实拍或原生触控证据。尚未构建 APK、安装 G20 或发送机器人请求；本轮只完成源码与本地状态层，正式设计通过 0/20、发布 NO-GO 保持。下一步可在资源和 USB 授权满足时生成新包并做 G20 横屏实机截图，但不能把源码回归替代实机验收。

## 2026-10-24 Brainstem 现场前置检查：主机可达，远程 gRPC 尚未监听

本轮只做网络与源码只读核对，没有重启 Brainstem、修改 `/etc/brainstem`、写入证书或发送任何姿态、电机、租约请求。当前电脑对 `192.168.66.64` 的一次性检查结果为：ICMP 可达，SSH `22/tcp` 可达，Brainstem 默认 gRPC `13145/tcp` 不可达；使用一次无凭据批处理 SSH 检查时返回 `publickey,password`，没有读取远端进程或证书内容。因此不能把“主机在线”当成 Brainstem 已启动，也不能把端口关闭归因于 mTLS 握手失败；当前更早的、已归档证据仍显示服务曾只绑定 `127.0.0.1:13145`。

只读审计已确认 Brainstem 当前源码的安全合同：远程监听必须配置客户端来源 IP allowlist、完整 server cert/key/client CA 和 principal 映射；`AcquireControl`、`RenewControlLease`、`ReleaseControl`、`WalkChecked`、`StandUp`、`SitDown` 经过远程 mTLS 与租约，`Enable`/`Disable` 仍保持 loopback-only；租约超时必须短于仲裁器超时。DOSO Android 原生桥目前只有 `GetControlStatus`，没有真实控制 RPC、租约生命周期或生产执行器，因此站立、坐下、电机使能/失能和策略切换尚未接入，按钮继续保持锁定。

下一步人工前置：请打开机器狗/Brainstem 主机，保持机身固定、急停可用且电机未使能；确认 G20、开发电脑和机器狗在同一可达网络；启动 Brainstem 服务但先不要执行任何运动。收到“已开机、已连网、已固定、急停可用”后，再做一次只读监听和 TLS/证书链核对；未取得现场监听与 mTLS 证据前不部署生产执行器，也不构建宣称已接入真实控制的新包。

本轮本地安全回归：`npm run typecheck`、`npm run test:brainstem-readiness`（4/4）、`npm run test:connection`（34/34）、`npm run test:control-ui`（8 个布局 + 39 个交互）通过；设置 `DOSO_BRAINSTEM_PROTO_ROOT=D:\\inovxio\\brain\\brainstem\\brainstem_api` 后 `npm run test:brainstem-bridge` 通过。未生成 APK，未安装 G20，未发送真机请求。

## 2026-10-24 code13构建前置检查停止：内存与G20授权同时未满足

已将 `app.json` 与 `android/app/build.gradle` versionCode 12→13，准备登录页一页布局的保数据升级。受控构建收到公开配置后，在 Gradle 启动前停止：可用内存 `1,069,756 KiB`，低于最低 `4,194,304 KiB`；`buildStarts=0`，没有生成候选 APK。G20 `9f2679cd` 同时仍报告 `unauthorized`，因此本轮没有安装动作。code12 APK、账户数据与设备均未改动。失败证据在 `artifacts/release-readiness/20261024-login-single-surface-code13/`，不可复用；待森哥释放内存并重新授权 USB 调试后再做新的单次检查。

## 2026-10-24 Brainstem 配置门禁与脱敏预检已补齐；真实控制仍保持锁定

森哥要求把设备连接、绑定和控制相关配置继续补齐。本轮只改 DOSO 客户端的配置投影、控制契约和本地桥接预检，不部署 Brainstem、不改生产证书/allowlist、不修改账号或设备数据，也未向机器狗发送任何请求。

实际改动：新增 `src/services/brainstemIntegrationReadiness.ts`，把 Android 原生模块、端点、只读状态、设备身份、远程监听、mTLS、控制租约、生产执行器以及 ACK/失联清零拆成九个独立门禁；连接中心和控制页现在显示这些门禁的真实状态与首个阻断原因。新增只读协议清单，明确 `AcquireControl`、`RenewControlLease`、`ReleaseControl`、`WalkChecked`、`StandUp`、`SitDown` 的远程 mTLS/租约边界，以及 `Enable`/`Disable` 的 loopback-only 边界；没有把状态读取或按钮存在当成可控。

`iot/brainstem-bridge` 新增 `src/configReport.js` 和 `tools/preflight-config.js`，可在设置环境变量后运行 `npm run preflight:config`。输出仅含端口、传输类型、布尔文件存在性和只读 RPC 名称，不输出目标主机、令牌、证书路径或证书内容；桥接服务仍只实现 `GetControlStatus`，运动、租约、ACK 与 dead-man executor 明确为 false。

验证证据：`npm run typecheck` 通过；`npm run test:brainstem-readiness` 4/4 通过；连接中心屏幕 19/19、`npm run test:connection` 34/34、`npm run test:control-ui` 的静态/布局/交互 45/45 通过；在设置 `DOSO_BRAINSTEM_PROTO_ROOT=D:\inovxio\brain\brainstem\brainstem_api` 后 `npm run test:brainstem-bridge` 66/66 通过。证据归档于 `artifacts/release-readiness/20261024-brainstem-readiness/README.md`。以上是源码和本地协议夹具证据，不是真实 G20、真机 Brainstem、真实 mTLS 或运动控制验收；本轮 APK0、安装0、真实 RPC0，正式设计通过0/20、发布 NO-GO 保持。下一步必须先取得现场服务监听和 mTLS/设备身份的可审核证据，再逐项讨论生产执行器，不能用本地预检直接放行运动。

## 2026-10-24 登录页首屏收敛：移除其他方式，G20横屏保留主流程

森哥确认登录页可先砍掉“其他方式”。本轮源码已让登录页不再渲染第三方登录分隔和卡片；注册页的第三方入口与后端实现保留。横屏紧凑条件下，登录页只保留邮箱、密码、忘记密码、登录和“连接机器狗”，数据隐私与开发诊断不占首屏；普通/竖屏仍保留低频入口。新增G20尺寸契约测试，登录相关12项、横屏认证测试与既有认证外观测试通过，tsc通过。

本轮仅改源码和测试，未构建/安装新包。G20 当前 ADB 返回 `unauthorized`，无法做新的实机截图或覆盖安装；已安装 code12 身份和旧实机证据保持不变。待重新授权 USB 调试后再构建并验证一页显示，不清数据、不卸载。正式0/20与NO-GO保持。

## 2026-10-24 UI准则审计：中点文案已清理，颜色与字号仍待系统收敛

森哥提供十条 UI 准则。本轮先按低风险范围清理生产界面与设计验收界面的中点分隔文案，静态扫描已降为 0 处；连接诊断、账户安全、BLE、设备连接、任务、个人资料、仿真和诊断契约测试同步通过（本轮相关 30 项通过，未与历史批次累计）。G20 code12 登录页截图保存在 `artifacts/ui-audit/20261023-criteria/01-g20-login.png`。

静态审计仍显示 137 个十六进制颜色字面量、19 个字号（最小9px）和 25 组圆角表达，不能声称已完成 Radix UI Colors、四档字号或几何收敛。下一步按 `docs/UI_DESIGN_CRITERIA_AUDIT_20261024.md` 建立 Radix 语义令牌、收敛字号和边框/圆角/阴影后，再对首页、任务页、控制页与 G20 横屏重新截图；本轮未构建、未安装、未改账号或机器人数据。正式通过0/20与NO-GO保持。

## 2026-10-24 真实绑定链路补齐第一段：云端归属与设备身份挑战分离

森哥要求开始推进真实绑定。本轮只修改 DOSO 客户端源码与本地回归，不部署 Supabase、不修改生产数据库/RLS、不操作 G20 账号或机器人。确认原有 `device-binding` 只完成序列号/一次性绑定码的账户归属认领；仓库已有 `device-enrollment` Edge Function 和一次性制造身份挑战，但客户端此前没有调用入口，导致界面容易把“账户已认领”误认为“真实机器人已完成可信绑定”。

本轮新增 `deviceEnrollmentService`：调用现有 `device-enrollment` `begin` 动作，严格校验 UUID、挑战 nonce、会话/权限代次、有效期和阶段；挑战只保存在当前内存，不写入日志或持久化。新增“设备身份验证”页面和“我的 → 设备身份验证”入口；绑定成功文案改为“账户归属已绑定”，明确设备身份仍待验证。页面只显示挑战阶段，不发送 Wi‑Fi、运动或电机指令；没有真实设备签名不会显示完成。

对 `D:/inovxio/brain/brainstem` 的只读核对显示，当前 Brainstem 源码没有发现制造身份/Ed25519/BLE enrollment 接口；远程 gRPC 依赖显式 mTLS 客户端证书、证书 principal 映射和来源 IP allowlist。现有远程边界只允许受保护的 locomotion/站坐路径，电机使能/失能仍是 loopback-only。因此 App 这次新增的是可信挑战入口，不是把账号绑定直接升级成控制权，也不能用 gRPC 端口代替设备身份绑定。

本轮证据：`npm run typecheck` 通过；`npm run test:device-enrollment` 5/5 通过；`npm run test:ui-details` 18/18 通过；`npm run export:android` 命令返回成功，但本轮未生成可安装 APK，不能替代原生安装证据。`test:device-flow-layout`、`test:profile-ui`、`test:robot-lifecycle-ui` 各有既有基线断言失败（旧字号/安全锁文案/“开发诊断”文案与当前源码不一致），未通过的基线不计入本轮成功。真实 BLE/GATT 制造身份证明、`device-enrollment` 托管部署状态、G20 真实请求和 Brainstem 远程监听仍未验收，正式 0/20、NO-GO 保持。

## 2026-10-24 设备连接中心统一入口已接入源码

继续推进连接中心。本轮把原来的 IP 检查页扩展为统一设备连接中心，顶部集中显示连接状态、连接来源、设备身份、最后同步、控制权和当前不可操作原因；下方提供局域网 IP、BLE 设备、云端设备三个切换入口。云端入口可继续进入序列号/绑定码、账号设备和设备身份验证；BLE 入口保留真实扫描/连接流程；IP 入口保留原生 gRPC 只读状态检查。所有状态仍按现有真实数据和能力门禁显示，不把只读状态提升为控制权。

源码与测试：`src/screens/RobotConnectionScreen.tsx`、`App.tsx` 的连接中心参数接线；连接中心回归与原有直连/诊断测试合计 `35/35` 通过，`npm run typecheck` 通过。本轮只改源码和本地测试，未生成可安装 APK、未安装 G20、未发送机器人请求；真实 BLE GATT、云端身份挑战完成、控制租约和 Brainstem 远程 mTLS 仍未通过，正式 0/20、NO-GO 保持。

## 2026-10-23 REA内部功能继续推进：点云网格算法经离线夹具验证，新增BLE与模块注册方法

森哥要求继续逆向内部功能。本轮复用同SHA官方Unitree Go2.0.0 APK与既有REA WAT，没有重启Android、登录或操作G20／机器人。REA/JADX新增5个loadInto方法（3个有注册、2个Provider为空）和对应类库存，证据包32条含旧22／新10；新增确认bleCenter/add_device→DogBluetoothActivity、bleCenter/testRemote→RemoteActivity及A2设置／登录入口，保留路径大小写差异，不将注册当通信实现。另索引20项原manifest组件声明。

对9520字节libvoxel原二进制继续分析，确认LZ4式解压→占用位图扫描→六邻居内部面剔除→U8顶点/UV与U32索引。补充本地限时纯WASM合成回放：全空0面、单体素6面、两相邻体素10面；截断输入解压状态-2而函数仍return0，不能只凭返回0判成功。回放无WASI/网络/机器人接口、单子进程退出0；REA Windows Process Capture不支持，因此单列为补充运行证据而非REA录制。不是G20性能、全输入安全或官方App调用方行为验证。

研究在 `artifacts/research/20261023-unitree-internals/`，含反编译方法、功能索引、夹具和结果；REA会话已关闭，原包与历史证据保留。BLE GATT/绑定、站坐/电机/策略、任务执行及官方RTC业务调用仍未恢复；SwitchSport声明不等同策略模型切换。本研究DOSO源码/构建/安装/账号/实机动作变更0，正式通过数不增加，NO-GO及并行发布记录保持。

## 2026-10-23 正常退出挂起已修复并原位升级 G20 code12；真实登录网络仍未验收

森哥要求安装修复后版本。本轮补齐正常 POST /auth/v1/logout 的15秒传输/正文截止和迟到响应隔离；App新增准确退出中标签、不确定结果通知持久展示。保留code11灯塔图标、原生身份解析及恢复页本机退出；不改SDK/sessionService/AuthProvider退出语义，实际SDK local/global错误会清本机、others保留，仍不宣称云端撤销成功。真实已装SDK合成会话回归及App反馈等根76/76、tsc通过；独立复核15/15重叠不累计。

正常单次构建freeMemoryKiB4248532、326产品输入、inputDrift0，验签/双ABI/正常入口/native类/15档图标通过。新APK79,162,565字节，SHA256 `1b3b8f94c50db0a96a53bb9516abc41311b162979f7aa8437dcfdbfabd0e12a8`；留存 `releases/20261023/DOSO-0.0.1-qa-code12-1b3b8f94.apk`。G20 9f2679cd实际单次-r从11升12，已装SHA相同，UID10173与首次安装时间不变；未卸载/清数据/降级/更改账号业务数据。启动成功且实际识别登录页。

安装前UI读取一次停止、安装后入口点击检查一次在动作前停止，旧证据保留。只读定位登录页连接入口enabled/clickable但首屏bounds为零，需滚动才能点击；一次滚动后测试脚本因邮箱控件离屏裁剪停止，不当产品崩溃。最终按当前可见testID实际完成登录页连接入口→IP页→返回登录页，两次点击目标均验证通过，留有G20实拍；首屏入口可发现性仍待优化，不扩大为全UI通过。两份326输入快照对比仅App、authRequestFetch及两处版本文件变化，无新增/删除。本轮未提交真实凭据或认证请求、未连机器人；认证服务历史HTTPS问题未重新验证，完整真实登录/正常退出/首页任务铃铛未通过，正式0/20与NO-GO保持。证据 `artifacts/release-readiness/20261023-logout-code12/`；旧包与并行研究改动保留。

## 2026-10-23 宇树官方App已在独立Android环境离线启动；观察到保护加载与横屏登录页

森哥明确授权后，新建UNITREE_OFFLINE_20261023／emulator-5580，独立AVD数据在D:/DOSO/android-analysis/unitree-offline-20261023/，复用已有API35 Google APIs镜像，不动既有AVD。实测ARM64 ABI与libndk_translation，安装前验证guest IPv4/IPv6 OUTPUT首条阻断非loopback、ADB重连仍可用、宿主TCP探针接收0且DROP计数28→31；每阶段重查规则，未改宿主防火墙。蜂窝全局设置仍为1、无SIM与IPv6路由，未用状态栏或设置值冒充断网证明。

REA一次新安装、一次launcher启动官方Unitree Go2.0.0/code202；安装快照与设备base.apk SHA均 `7a36e9a847997ebea02d88fde6ccdd6e5c4c8d3f7e57619584b3c6718bfa2cf1`。实际1280×720横屏登录页，捕获libbaiduprotect加载ok、AClassLoader fallback、ARouter扫描与LoginActivity；maps含匿名DEX数据映射但未读取内存字节。启动／登录页812dp宽基准适配有日志证据，不推广到所有控制页。

首次隐私弹窗另获森哥明确同意后仅点一次Agree，再关闭Android全屏教程；未填写／提交账号、未登录、未连接机器人或强行打开内部页面。当前可见页无游客入口；仍无业务WebView、WebRTC和点云执行证据，系统WebView映射不当作业务运行。证据、截图与报告在 `artifacts/research/20261023-unitree-offline/`。已停止本实例App并关闭模拟器，未卸载清数据，保留独立环境；重启必须重新验证隔离。本研究未操作G20或修改DOSO运行代码／安装包，并行code11发布记录保留；正式通过数不增加，完整RTC逆向仍未完成。

## 2026-10-23 灯塔图标与会话退出修复已升级G20 code11；认证服务网络仍未通过

用户新图作为launcher原件保留，adaptive仅技术白边，15档图标资源按AAPT2实际资源映射与冻结输入逐字节核验。新QA包79,162,333字节，SHA256 `e8a394a49b3b7944b919e3be63278b7f0b05433849fa1f9d0f82cfb71f095cc9`，原签名/双ABI/正常入口与native模块检查通过；针对9f2679cd一次-r从code10升code11，UID10173及firstInstallTime不变，未卸载/清App数据。保留包releases/20261023/DOSO-0.0.1-qa-code11-e8a394a4.apk。

本轮确认原生会话解析依赖atob，但已装Expo/RN/Metro初始化链不提供此全局；旧G20实拍“安全状态仍待核对”。改为可移植Base64URL投影并保留身份/服务端准备门禁。恢复页退出新增本机独立路径、忙碌/失败反馈；auth存储代次隔离迟到SDK、仅清本项目session/user/PKCE(含多flow)并保留installation/业务数据，失败保持门禁可重试。account-sessions传输/响应体15秒截止。正常云端终端撤销语义未放宽。

最终UI/存储/反馈11/11、原生身份/Provider/fence65/65及tsc通过；相关工作者151/151与后续64/64批次有重叠不累计。独立真实SDK内存测试确认退出后旧PKCE不能恢复、新flow仍可用。正式0/20、NO-GO保持。

实机code11错误从“安全状态待核对”变为账户会话服务连接失败；实际点击IP入口→返回→退出当前账户三步通过，最后进入登录页。只验证这些入口，未宣称所有页/真实重新登录通过。G20默认系统TLS匿名GET authHealth/accountSessions均SocketException、无HTTP状态，未改TLS信任；该网络阻断仍待解决，不能当密码错误或确认某运营商根因。退出仅清本机认证，云端撤销未确认，未删账户/业务数据。

证据：artifacts/release-readiness/20261023-icon-session-recovery/含前后实拍/native-exercise.json和network/g20-results.json；最终构建/验包/升级在20261023-icon-session-recovery-v2/delivery-g20/。首候选构建成功未装，发现atob后第二候选重新构建；两个均正常单次且各自零输入漂移。验包曾因缺独立manifest导出及AAPT2短路径失败，后从构建器真实前置snapshot导出派生manifest并按资源表核对；首次升级检查因另一模拟器出现而停止(安装0)，明确G20序列号后安装1次。历史和并行改动均保留。

## 2026-10-23 REA已深入Android方法与点云WASM；一个模块与公开RTC解码器逐字节一致

森哥要求继续逆向并包含RTC。本轮复用官方Unitree Go国际版2.0.0/code202原APK，SHA256 `7a36e9a847997ebea02d88fde6ccdd6e5c4c8d3f7e57619584b3c6718bfa2cf1`；仅在新研究目录取得并核验固定JADX0.7.1/WABT1.0.42工具，用进程环境接入REA6.6.0，未改全局MCP/Java/PATH。REA实际恢复ARouter页面和IWebEventService注册方法、StubApplication启动方法，Android证据22条、会话退出0；业务实现仍不在可读顶层类库存中，非完整RTC反编译。

补充检查29个JS均非合法UTF8；两个WASM均经REA验证并完整解码WAT，接口比较完成。9520字节libvoxel-doIu-r8s.wasm SHA `1ba27f065199954dc562b233aa38ea775ac687118cce77b5c71bc14e17e05542` 与固定社区unitree_webrtc_connect提交的LiDAR模块完整字节一致；公开包装可解释11个i32参数及几何输出。另一7410字节模块ABI不同，声明线性内存96MiB vs62.5MiB，均非实测RSS。不将模块一致推成官方信令/通道/控制权相同，社区RTC架构单列为参考。

研究、完整REA证据、WAT、固定公开来源及校验在 `artifacts/research/20261023-unitree-rtc/`。本轮运行源码/构建/安装/账户/机器人连接及动作均0，未执行APK或WASM、未降TLS或绕过浏览器限制；G20 code10身份沿历史记录而非本轮实测。可见入口与点云静态子项完成，官方RTC信令、桥接、控制消息和安全生命周期仍未完成；下一阶段需明确隔离Android运行取证或合法可分析构建范围。正式0/20与NO-GO保持，旧报告与并行工作保留。

## 2026-10-23 已用REA完成宇树官方Unitree Go 2.0.0资源层逆向；未恢复完整动作代码，未改DOSO

森哥要求用REA逆向界面与功能。本轮从官网二维码解析官方国际版APK，HTTP200完整取得191,452,888字节，com.unitree.doggo2／2.0.0／code202，SHA256 `7a36e9a847997ebea02d88fde6ccdd6e5c4c8d3f7e57619584b3c6718bfa2cf1`；SDK验签成功。大陆下载HTTPS两次失败后停止，未降TLS；REA ADB/JADX/apktool缺配置如实保留，未擅改配置或安装分析引擎。

REA归档库存完整2590 occurrences（含根），记录2531节点；全量解压因Windows大小写冲突停止，辅助脚本仅提取110项不冲突资源且逐项哈希匹配REA。用SDK/CSS辅助解码11原生布局、52相关样式：Web摇杆容器148×148 CSS px、拍摄50×50/图标32、速度状态高24/字12、原生遥控Tab16sp；数字资源Roboto Medium与局部CSS字体声明分开，不推断实际中文回退或全App字体。官方宣传图身份与本次2.0.0样本分开。

REA选择HTML＋5JS进行静态分析，5JS全部invalid-utf8、parsed JS=0，未恢复业务调用；33 application unknown和288 semantic unknown保持。功能只确认BLE/AP/STA/绑定/遥控/WebRTC/建图等布局及编程/模拟器等打包资源，不把入口/文件名当成功能成功或完整协议。最终REA证据10条、开放unknown2项，导出后关闭会话。证据与查看页在 `artifacts/research/20261023-unitree-rea/`，README明确观察/推断/未完成边界及DOSO建议。

本轮仅新增研究和发布状态，不修改DOSO运行代码、v20设计、构建/安装/账户/证书/机器人，不启动宇树App或真实动作。资源层研究完成、业务反编译及运行验证未完成；正式0/20与NO-GO保持，历史和并行证据保留。后续设计可据此收紧顶部高亮面积、减轻双杆遮挡并分开连接/绑定/控制权，不据研究自动换框架或传输。

## 2026-10-23 SSH实机根因已确认：han_dog正在运行，但13145只监听127.0.0.1

森哥提供登录信息后已实际登录192.168.66.64做固定只读查询。ss成功确认仅127.0.0.1:13145；监听者PID1749、dart:han_dog、可执行basename han_dog，归属thunder-web.service进程组。不是“根本没启动”，当前确认阻断是没有局域网监听，G20访问192.168.66.64:13145无法连入；不能再把连接拒绝说成已确认TLS或账号问题。brainstem.service/han_dog.service两个名称not-found，不等于无进程。

实机两项源码SHA不同本地；源码特征检查未见目标GetControlStatus及新mTLS/远程peer标记，TLS文件不可读。这是部署目录兼容风险，不证明正在运行二进制必然缺接口；sourceIdentity部分查询exit1保留，不能总称全部通过。未重启thunder-web，避免影响WebUI/硬件子进程及清理。

SSH端点公钥与已有旧地址信任记录完整独立匹配后才输入凭据；未接受新key或改信任。三次成功只读子会话、无认证失败重试，密码经已验证无回显TTY临时输入，队列清理/控制台恢复成功，未进参数/环境/文件/报告，连接均关闭。独立安全审查和实机结果复核完成；证据artifacts/release-readiness/20261023-robot-ssh-status/。本轮产品/部署/服务变更/构建/安装/账号/控制RPC均0，323产品输入仍匹配code10 manifest `7d522e4a4e36c147d8c7ec54ed5b422bb1adde0d251820abf3b697bf73f0647d`。

根因定位完成，实际修复/真实连接仍未完成；下一步先核实当前管理职责、二进制协议和合法证书条件，再明确安全远程接入更新/停机/回滚范围并取得实机变更授权。不得裸开h2c、用隧道冒充原生直连或擅自重启硬件。正式0/20与NO-GO保持；原账号和既有数据无管理操作，历史及并行改动保留。

## 2026-10-23 用户确认Brainstem启动后已复验：G20安全读取失败，PC端口仍拒绝；已直查启动代码

森哥确认“刚刚启动”后，本轮在真实G20 code10重新核对APK SHA `509d8e887bf1bdc20606ca2930dd626256446542eedd746016f3ab768f6efea5`，对192.168.66.64:13145只点击1次GetControlStatus，结果secure_connection_unavailable，无TLS/状态通过。电脑单次同端口TCP仍ECONNREFUSED，TLS未开始/RPC字节0，不把它当证书失败或G20成功。323产品输入仍匹配manifest `7d522e4a4e36c147d8c7ec54ed5b422bb1adde0d251820abf3b697bf73f0647d`，本轮产品/构建/安装/账号/证书选择/运动指令变化0，无自动重试；证据artifacts/release-readiness/20261023-brainstem-started-recheck/。

森哥不能查看启动日志，负责人已直接读本地Brainstem代码并独立复核：部署模板先sleep30秒；真机入口在策略、IMU、PCAN、ONNX和FSM初始化之后545行才开gRPC，失败分支会提前返回；远端peer为空时默认127.0.0.1，远程监听需完整mTLS配置。以上不是实机部署/进程证明，不能断言主进程未启动。未运行部署/重启/真机/CAN工具或改监听/信任。

未发现现成SSH客户端会话或已配置的明确目标/用户；仓库默认sunrise未当登录事实，未猜凭据或创建主机信任。已改为向森哥询问真实SSH用户名或已连接远程终端入口，随后只读查服务状态/监听端口，不再要求其找完整日志。真实连接仍未完成，正式0/20及NO-GO保持；历史证据和并行工作均保留。

## 2026-10-23 实际接入交付补充：code10原生通道已装G20，目标13145仍未连通

本轮实际执行正常单次构建与原位升级，不再停留源码/网页。产品仅两处versionCode9→10，323输入manifest `7d522e4a4e36c147d8c7ec54ed5b422bb1adde0d251820abf3b697bf73f0647d`；资源5017736KiB通过，buildStarts/spawnAttempts均1、bundle/assemble成功、inputDrift0。APK 79,144,769字节，SHA256 `509d8e887bf1bdc20606ca2930dd626256446542eedd746016f3ab768f6efea5`，同QA包/原签名/双ABI/真实Brainstem及gRPC类验证后，单次-r升G20 code10，已装SHA、UID与首次安装时间一致，未卸载/清数据。

G20从正式机型页实际打开IP页，使用192.168.66.64/13145只点击1次原生状态读取，返回secure_connection_unavailable；不是native_module_missing，但没有TLS/真实状态通过。电脑一次TCP亦ECONNREFUSED/应用字节0，不代替G20或确定故障来源。无证书选择、控制权请求、运动指令或自动重试；等待森哥确认Brainstem真实启动/监听，本地默认loopback/远程mTLS代码不能当作实机部署证据。

本目录artifacts/release-readiness/20261023-native-ip-code10/保存完整证据、第一次Junction误拒安装0、独立delivery-2核验及单次安装；19/19构建工具和4/4路径夹具通过，旧460产品测试不累计。发现并行升级确认流程也在同设备取图/返回，停止后续点击以免竞争；已复核其同包IP实拍，布局仍有滚动离屏问题，不判UI通过。原生只读调用/装包子项完成，真实连接/完整code10首页任务铃铛导航/归属/持续状态/图传地图/BLE配网/运动任务策略均未完成；executor=null、正式0/20与NO-GO保持。所有并行与历史条目保留。

## 2026-10-23 G20已核实原位升级code10；IP页实机可见，安全gRPC与会话恢复仍未通过

森哥要求开始升级。检查时发现 `artifacts/release-readiness/20261023-native-ip-code10/delivery-2/` 已完成一次code9→10覆盖安装，因此本轮接续核对而未重复构建/安装。G20实时包信息为com.doso.robot.qa、code10、0.0.1-qa、更新时间2026-10-23 18:30:50；实际base.apk与留存 `releases/20261023/DOSO-0.0.1-qa-code10-509d8e88.apk` SHA256均为 `509d8e887bf1bdc20606ca2930dd626256446542eedd746016f3ab768f6efea5`，79,144,769字节。既有验包证据含同签名、双ABI与Brainstem原生类定义，当前323产品输入重新核对一致。独立只读审查确认IP工作流实现字节与原验证一致，仅两处versionCode9→10差异。

原位安装记录没有卸载/清数据/降级，当前UID10173与首次安装时间保持；不冒称全部账号业务数据已核验。已有open-ip-ui-v2确认IP页打开，read-ip-ui-v2记录对192.168.66.64:13145一次只读请求结果secure_connection_unavailable、运动动作0；本核对未再请求机器狗。新证据 `artifacts/release-readiness/20261023-code10-upgrade-confirmation/` 包含验收/README/verification与1920×1200 IP页实拍。返回检查未得到可验证后续观察，stopped_at_back_navigation原样保留，不算通过；同设备已有UI证据继续生成，未增加后续点击或重试。

升级子项已完成，旧“尚未打包／code9”条目作为历史保留。本轮观察到的会话服务错误仍阻断正常首页/任务/铃铛验收，真实安全gRPC尚未连通；v20控制稿仍未落实运行组件。后续核对真实服务/TLS/网络及会话恢复，不发送运动命令或更改账户。正式0/20与NO-GO保持；本确认新增构建0/安装0/机器人请求0/账号变更0，未重复累计既有构建测试。

## 2026-10-23 IP机器狗连接工作流已接通源码：入口前置、显式选择及状态回传，尚未打包／G20验收

森哥要求实际推进接入并让输入IP入口好找。本轮使用implement/TDD与现有项目改版约束，新增首次机型页“已有机器狗？输入IP连接”、首页独立“连接机器狗／输入IP/添加设备”、Profile明确IP入口；保留原品牌／MiSans／配色／导航和既有dirty工作。IP页三步说明、正常TLS/系统证书选择及一次GetControlStatus保留；成功后显式选择才把短时观察带回首页的独立IP摘要，点击查看状态可显示该端点真实新鲜姿态／电机，不冒用云账号THUNDER、电量、归属或控制权。

新增纯快照白名单／深冻结与15秒严格时效、账号会话owner代次；后台、换账号、安全gate、A→B→A旧回调失效，不自动重连或重放。独立审查发现系统证书picker暂停后父回调可能永久旧owner，已补明确生命周期revision并红绿复现修复；过期latch避免时钟回拨恢复旧状态。首次models进入仍需完整bootstrap gate及existing enter，登录外不提供进入主界面动作，BLE/绑定门禁未放宽。direct Control无云电量/假机型、无地图任务/召回回调和开发摇杆，五动作false与production executor=null保持。

最终fresh run-2：55测试文件460/460、fail/skip0，tsc及10相关契约exit0；323产品输入及验证输入前后漂移0，8产品路径范围内变化、删除0。产品manifest SHA256 `c8ff9172409a9e46988b1dea239624b8552ec60aa9525c632eda76b0674bcd65`。run-1的457/457及旧battery字符串契约失败原样保留，不累加；首次入口/接线/Control呈现新增后最终460。证据 `artifacts/release-readiness/20261023-ip-connection-workflow/` 含验收、TDD、run-1/run-2与说明；本地TSX/生命周期/表达式夹具不是Yoga、真实TLS或G20点击证据。

最终审查后只校正App两行旧注释；最终源码manifest为 `e455c7bb0eeac3271ed1fdda64047e6b5ca3c8ba49ca93ac3c60b653df7b793a`／323输入。补充身份文件核实仅App字节变化、去注释转译字节完全相同；run-2历史不改、不重复累计测试。首次models入口独立只读核查未发现认证/onboarding绕过，BLE/绑定门禁保持。

本轮构建0/APK0/安装0/设备网络探针0/机器人指令0/云账号数据变化0，旧账号及数据未动。安装仍仅沿历史QA code9，未重新验包；不能声称UI已在G20或真实狗已连通。IP只读子流程源码完成，稳定设备身份/归属、持续连接、图传地图、BLE配网、运动/任务/策略与新包原生验收仍未完成，正式0/20与NO-GO不变。下一项正常构建新包、保留数据升级G20并验证真实IP/TLS及生命周期，不发送物理动作。


## 2026-10-23 控制设计v20已重排顶部与底部层级；静态两态及v19前后对比交付

森哥否定v19观感。本轮以现有项目改版与Impeccable布局/产品精修指导，保留真实MiSans/Ionicons和原色板、Control独立返回、手动/任务/路线入口，重新编排为64高浮动工具条、文字模式标签、顶部单层折展五动作条；点云和边缘工具收紧、双杆取消密集刻度/内圈、底部实际速度取消大背景卡并与单位共基线、停止/释放右下独立常驻。未知速度仍为“— m/s”，没有虚构图传、点云、在线或策略。

新增 `artifacts/ui-refresh/20261023-control-refined-v20/` 的BRIEF/REVIEW、绘图脚本、查看页及render-1两张1920×1200图。收起SHA256 `b3e2d2cd51d7a37b12fafbb2b66f2e83aa434e53877c7436db255632116b028a`，展开 `7a4112ea2448cd2efaa020670bffcc75435250b012063cf0add98de79c97bece`。两图49文字/41图标逐字与几何核对通过，登记目标≥48、速度/双杆/停止两态坐标相同；7组主要文字对比度≥4.5:1。17监测产品文件、11个v19历史文件与原资源前后保持，旧稿保留。查看页VM夹具的四组合/折展热点/ARIA及7本地目标检查exit0；不是浏览器、Android或G20验收。

独立视觉复核实际看两图无阻断，用户审美确认仍待审阅。浏览器工具因本地设置禁用而停止尝试；直接展示图片请求仅queued，不宣称右侧已显示。静态设计交付供用户审阅，尚未应用至App/G20，手机与完整任务/路线/动力策略流程仍待后续。本轮运行代码/构建/APK/安装/机器人或设备网络探针/真实动作/云账号数据变化均0；WebRTC迁移仍为既有后续标记。正式0/20与NO-GO保持，不累计历史测试。

## 2026-10-23 v19已将常用操作移至顶部折展、实际速度放到底部正中；仅静态设计与查看页

森哥在v18 G20图上指定“站立这些顶部可折展、机器狗速度下面中间”。本轮按现有项目改版技能局部调整，保留真实MiSans/Ionicons、原色板、模式入口、独立Control返回和双杆。站立/坐下/召回/动力/策略移入顶部小操作条；底部五动作条移除、媒体视区延展，实际速度固定下方正中，停止/释放右下常驻不随折叠隐藏。提供收起/展开两态，查看页可点顶部入口切换图片，不代表App功能已落地。

最终 `artifacts/ui-refresh/20261023-control-top-actions-v19/render-2/` 两张1920×1200，收起SHA256 `42053329c2b02a753183c3ea95896b5c32d8de970b5da7edf59ad20136427006`，展开 `5e73244014d3ec783bd0c7dc6909020c13b1e62032fe296e11c4d112a0b3a23f`；BRIEF/REVIEW/manifest与index记录范围/身份。初稿render-1保留，最终仅将速度未知值与单位排为同一基线。两图49文字/35图标静态检查通过，已登记触控区≥48；速度/停止位置两态一致，展开条与点云/工具间隔28/32。17监测产品输入、14历史v18文件及原资源前后保持。独立视觉复核无阻断；查看页VM夹具检查7链接、两按钮及10轮折展状态通过，不冒称浏览器点击或Yoga/G20验证。

当前gRPC状态投影无实测速度，故“实际速度 — m/s / 速度数据未接入”，不使用指令量/ACK/readyForWalk/姿态推断实测或零速；未来陈旧/断链需清旧数值，不擅定遥测时效阈值。WebRTC四载荷后续标记保持，不改现有传输或身份安全边界。

指定G20静态设计子项完成待审阅，手机折展/动力策略详情/任务路线完整状态、真实速度来源/图传点云/控制、新包与原生验收仍未完成。本轮运行代码/依赖/构建/APK/安装/设备或机器人探针/真实动作/云账号数据变更均0；只读公开Expo57文档。不累计旧测试或正式通过数，0/20及NO-GO保持；历史与他人改动均保留。

## 2026-10-23 连续视野控制稿v18四图已交付；WebRTC四载荷迁移目标已记录，尚未实施

森哥要求继续出稿，并明确后续迁移到WebRTC承载图传/点云/状态/控制。本轮先写验收，用现有项目改版约束复用真实MiSans/Ionicons与原白/单浅底/柔蓝；仅媒体视区使用暗色，不改主App主题/品牌/导航。输出G20主画面+点云小窗、G20分屏、动力策略展开、手机触屏四图；独立Control保持返回，无主导航强加。未接入图传/点云、未知电量/权限和锁定动作如实显示，没有虚构环境/在线/遥测/策略目录。

最终 `artifacts/ui-refresh/20261023-immersive-control-v18/verified/` 四图，G20主图1920×1200、SHA256 `6367102a5fd6952b400916a0bf940db551c4d7c60471627e6e68d229732bff38`；手机1170×2532。index.html可切四图，BRIEF/REVIEW及verified/render-manifest.json记录身份与边界。四图101文字/67图标的字形/几何检查通过，返回及登记hit区至少48；操作面板与外置停止间隔24。17监测产品输入、13历史设计文件和原资源执行前后保持。查看页6本地链接目标/脚本语法通过；都不是浏览器实际点击、Yoga/Android触控/大字/安全区或G20验收。

新增 `docs/design/WEBRTC_MIGRATION_MARKER.md`，明确用户确认的是未来四载荷目标；SDK/通道可靠性与顺序/编码/信令/ICE/STUN/TURN/G20预算待定。gRPC当前只读与生产executor=null保持；单命令出口、禁止双发/自动回退或重连重放、加密不等于授权、身份/租约/序号/ACK/输入时效/后台与机器人失联兜底继续要求。架构只读复核通过，不作为开通服务或实机动作授权。

独立视觉复核无阻断，实际补齐返回触控区记录及当时仍在编写的WebRTC文件；最终PNG与首轮相同，旧输出保留。指定四图/标记子项完成待用户审阅，任务执行/路线编辑/接管完整状态稿仍待后续。运行代码/原生依赖/构建/APK/安装/设备机器人探针/真实动作/云账号数据变化均0；公开Expo57文档只读正常读取。现装身份仍沿历史QA code9非本轮重验，不新增正式通过或重跑累计旧432测试，0/20及NO-GO保持。下一项先确认视觉稿，再补完整状态设计及按授权分阶段验证真实能力；他人改动和历史状态不覆盖。

## 2026-10-23 操控台四张连贯设计图已交付：G20主控、手机触控、路线编辑及任务接管，尚未改App

森哥要求开始出设计稿。本轮使用移动端视觉及内置图像生成技能，沿既有白／单浅底／柔蓝#98D1FF／石墨方向，按已整理的地面操控结构交付四张概念图，未沿用旧三等分控制页。独立Control保留返回与THUNDER 01，主壳导航不改；大地图、辅窗、五常用动作与独立停止可见。手机双杆置于下方两角，路线保存／校验／同步分离，任务接管面板不盖住停止，确认在状态待核验时保持禁用。

最终文件在 `artifacts/ui-refresh/20261023-ground-console-design-images/`：g20-main.png、phone-touch.png、route-editor.png、task-handover.png，README、PROMPTS和OUTPUTS记录范围、完整提示及图片身份。7次串行内置调用（4初稿＋3定点修正），原件保留；手机工具已移开杆盘，路线多余分支及路线／任务矛盾箭头已修。G20/路线/任务图1586×992，手机图1844×853；G20图SHA256 `d109bfc61b6b45853f5e2d3d577509df2f6e1b81694cb1a1ce1f71f58263d02f`，其余完整哈希在OUTPUTS。负责人目视，独立设计复核未发现阻断概念交付的问题，不是正式验收。

地图为示例、第四张任务和执行状态为明确标注的拟议目标态，不能认为真实执行A/v03或已接管。前三张未连接／待同步；实体输入未配置，不宣称接通G20摇杆。字体只是MiSans感生成字形，并非真实字库嵌入；图标、轻微渐变、准确字体字号、禁用一致性及原生触控仍待校准。图片像素不是设备dp/安全区测量，停止图面不证明执行层已实现。

本轮App运行代码／测试／构建／安装／设备或网络探针／机器人命令／云账号数据变更均0，只新增设计和证据并更新本状态。参考截图沿历史ec850b07…d10f7／321产品输入记录，本轮未重新整体验算，不冒称UI已到G20或新APK完成；旧稿和其他执行者修改保留，不累计旧测试，正式0/20、NO-GO不变。四图视觉交付完成，方案待森哥审阅；下一步先逐项确认G20主控布局与字体层级，再确定真实组件实现及原生验证范围。


## 2026-10-23 宇树Go2官方UI参考已核查：连续视图与叠加控制，不据宣传图推断框架或现有能力

森哥提供图传/彩色环境分屏图并要求搜索宇树UI。本轮按搜索/官方依据核查，找到官网同款展示图，读取官方App页、开发者AppStore描述、V4.3图像手册及更新2025-09-03的架构页；独立资料审查证实手册图传主视图+点云小窗和左右分屏。官方明确双摇杆、图传/3D点云、拍摄与模式切换；截图观察只能说明视觉构成，不能确认字体/字号/Flutter/Unity、STOP安全语义或“2D/3D按钮”操作。宣传图对应App版本/发布日期未确认，不称最新实机截图。

研究结论：控制场景可采用连续环境主视图+紧凑状态/双杆/边缘工具，管理页仍保留现有DOSO字体/品牌/色板/导航。点云绿色属于数据画面，不是必须照搬的主题色。宇树官方架构区分WebRTC图传/点云/控制、BLE配网及HTTP绑定；DOSO当前GetControlStatus不含视频/地图，参考外观不能产生相应真实能力，也未据此更换gRPC或复制厂商协议。

证据 `artifacts/research/20261023-unitree-ui/README.md` 与3张来源/SHA可追溯的官方研究参考图，保留原品牌不作为DOSO产品资产。总15个搜索结果名额不冒充15篇全文验证；采用官方来源、排除第三方仿制界面。本轮未改App/既有设计、构建安装、G20或机器人探针、认证/账号数据/云权限/真实动作；不重跑或增加先前测试与正式通过数，0/20及NO-GO不变。下一项为用户确认控制场景结构后再出图，不将研究算实际接通。其他执行者状态和设计资料均保留。

## 2026-10-23 地面机器人操控台结构建议已整理：大主视图、动作条及查看/编辑/执行分离，尚未实施

森哥认可宇树、QGroundControl、DJI参考并要求说明DOSO怎么设计。本轮仅交付 `artifacts/ui-refresh/20261023-ground-control-design-brief/DESIGN.md`，提出顶栏/连续主视图/主辅小窗/紧凑动作条，动力与真实策略目录按需展开；保留现有MiSans、白/单浅底/柔蓝及主界面导航，独立Control保持返回，不增加一套导航。70–80%主视图、触屏约144–160dp与按钮52–56dp为待实测设计目标，不冒充G20新测量或通过。

地图查看、路线草稿编辑和真实执行/接管分离；执行任务版本持续标注，保存/同步不等于开始，实体输入与触屏互斥。独立只读评审要求补足“执行中编辑/明确接管/确认中停止”三流程后才进视觉稿，不允许直接跳真实动作实现。建议已记录停止不被普通互斥/弹窗阻挡、迟到回包不能恢复输入；现有执行层无独立停止/释放、实体轴未验证及真实地图/策略/动作未接通事实保持。

本轮没有生成新图、改App代码、运行构建测试/设备探针、升级安装、改账号云数据或发送机器人命令；旧稿与其他执行者更改保留，不累计旧测试/正式通过数，0/20、NO-GO不变。下一项为四个关键视图及离线/动力/策略状态的视觉确认，不把结构建议算作产品或真机完成。

## 2026-10-23 控制页转真实产品参考调研：取消三等分方向，尚未改代码或生成新稿

森哥否定当前控制界面及操控空间，要求网上找别人的界面。本轮核查宇树Go2官网图传/点云与动作展示、DJI Pilot 2官方手册及教程截图、QGroundControl官方Fly View，明确截图来源与历史版本，不以概念图、旧状态条或无法读取的Spot手册冒充整屏可视证据。建议以连续大主画面＋紧凑边缘操作为骨架，手动/任务/路线按模式切换，状态详情展开，不再三列小卡片摊平。约70–80%主视图为DOSO建议目标，不称参考产品精确实测。

证据 `artifacts/ui-refresh/20261023-control-reference-research/README.md` 保留公开来源/原图URL、访问限制与下一稿建议。G20实体输入未接通事实保持，不因参考图暗示已支持；手机虚拟摇杆需充足触控区，关键停止/危险操作确认保留，不填假图/假遥测。本轮只调研/记证据，App代码/新设计稿/Android构建安装/账号云变更/机器人操作均0，现有其他执行者方案及历史不覆盖，不增加正式通过数，0/20、NO-GO保持。

## 2026-10-23 控制稿v17回归现有DOSO UI；v16不作为实施依据，本轮只交付静态方案

森哥明确否定v16不符合现有UI。本轮按现有项目改版约束，复用v14/v13绘图基元、原MiSans三字重与Ionicons、原白/单浅卡片/柔蓝色板，重新生成控制稿，不再用近似字形或新控制台视觉。独立源码核对纠正v16导航错误：Control是独立stage，main才有AppHeader与BottomNav；主壳五导航保持，控制稿不擅自加导航/头像/通知/新字标。

最终图 `artifacts/ui-refresh/20261023-control-existing-style-v17/revision-3/control-g20.png`，1920×1200，SHA256 `8df11dea3bbcf04b7da7ef524a04a3c0848ab18b38868e5994cf5c9400ecdfdb`；同目录style-continuity.png对照现有首页原稿。保留独立返回/设备身份/连接头、既有圆形L/R双杆与刻度；左侧地图和三浏览入口，右侧白底手动，底部原浅卡片组织姿态/动力/策略。已修召回说明过近；独立复核指出转向标签与召回底色贴边，最终双杆/标签上移12并加入至少8间距断言，旧候选均保留。

静态渲染32文字/16图标，字形覆盖与文字/图标几何检查通过；17项监测产品文件、10项v14历史文件及原字库/图标等资源执行前后哈希保持。此为代码原生设计文档，不是React Native/Yoga或G20实拍；960×600只是示意坐标，没有测量设备dp/大字/安全区/触控。设备离线/电量未知/地图未接入/控制权未知/动作锁定不冒称新鲜机器人观测；无假地图或遥测。

本轮产品运行代码/新包/安装/设备探针/机器人或云账号动作均0；只新增设计产物与查看页、更新状态。仅按仓库要求读取一次公开Expo57文档，无机器人网络探针。未重跑或增加先前432项通过数，现装身份仍沿历史code9而非本轮重验。v17待用户审阅，v16已被否定，不作为落地依据；正式0/20和NO-GO保持。下一项依据森哥确认后的布局落实运行代码及原生验证，真实gRPC动作缺口仍按既有状态处理。其他执行者的当前源码展示及历史状态条目保留，不把本方案混作当前组件截图。

## 2026-10-23 已展示当前首页/任务/控制中心源码效果，未改产品或升级G20

森哥要求“现在界面是什么样子，展示一下”。本轮新增 `artifacts/ui-refresh/20261023-current-source-display/`，直接渲染当前真实组件与MiSans，输出首页/任务横屏、正式禁用参数控制中心、控制左栏下滚及两张手机竖屏，汇总于index.html。Home/Tasks为既有离线样例姓名/日期；Control关闭开发摇杆演示，使用App当前runtimeState及五项false/专用原因，不提供真实操作回调。不是AI重绘、G20实拍、当前账号会话或原生触摸验证；未同步数据仍如实显示未知。

本轮重新核验321项产品摘要仍为上一轮run-2的ec850b07…d10f7，六张最终截图和展示入口有独立哈希清单；仅新增展示文件/证据，产品代码0改动。本地Expo/浏览器渲染不等于Android构建；本轮APK/安装/设备/认证提交/机器人动作均0，不重复累计上一轮432测试或增加正式通过数。前期冷加载不完整/开发演示图保留但不作为最终输出。旧现装code9沿历史不重查；正式0/20、NO-GO及真实接通/新包原生验收未完成判定保持。其他执行者新增的方案与历史状态条目均保留，没有覆盖为本轮截图结论。

## 2026-10-23 G20控制中心方案图v16已生成；核清gRPC动作与实体摇杆缺口，未改运行代码或操作机器人

森哥询问gRPC还缺什么、动作为何未接通、希望看到控制界面并确认能否接摇杆。本轮使用现有项目改版/移动设计图/输入抽象技能，读取当前代码、协议与证据后仅交付设计，不把问答扩大为真实使能/运动授权。独立核查确认Brainstem有AcquireControl/WalkChecked/RenewControlLease/ReleaseControl以及姿态、电机与策略RPC；当前App原生只桥接GetControlStatus，连接页状态未提升到控制中心，生产executor=null、五项操作无callbacks。缺口是执行层尚未实现及新包/部署验证，不是gRPC不支持。

已生成并目视核对横屏图 `artifacts/ui-refresh/20261023-control-workbench-v16/control-g20-concept.png`，1,341,328B，SHA256 `4ad3ec4d5b7db44a80bfa017afb99abd9febc122a06e042a0e8759a76d24b0ef`。保留原白/单浅卡片/#98D1FF/石墨字色与右侧五导航，设备操作/地图任务/手动三工作区，呈现站坐、电机、真实策略列表槽和双杆；全图待连接/未读取/未获取，无假地图/遥测/在线。这是内置图像生成的方案，不是真实MiSans嵌入、Yoga渲染或G20实拍；外部方案标题未按提示生成，由聊天和DESIGN.md明确身份。目标可控态需持续可达“停止并释放”，与失能/硬件急停区分。

实体输入未冒称支持：当前App无Android轴桥接，G20是否暴露MotionEvent/HID/厂商接口未验；触屏已有输入组件但未接production。机器人侧现有源码是Linux SBUS→YUNZHUO仲裁，与App输入不同；YUNZHUO优先于gRPC，App不能冒用来源。后续先断开机器人只观测实体轴；统一输入源经安全限速、身份/租约、首包零速、序号与ACK确认走WalkChecked，陈旧输入不得由独立续租维持。默认300ms只是本地源码配置，不证明部署现状或瞬时物理停止。

本轮运行代码/构建/APK/安装/设备或网络探针/真实RPC/云与账号数据变化均0；仅新增设计图和说明、更新本状态。不重跑432项旧测试或累计通过数。源码身份沿上条ec850b…的先前整体记录，最后安装仍沿历史QA code9/fd8f3626…，不是本轮重新验包。方案展示子项完成；真实动作/策略传输、实体输入、当前服务配置、新包/G20验证仍未完成，正式0/20、发布NO-GO不变。

## 2026-10-23 控制策略/姿态/电机操作区已补齐源码，短横屏密度已调整；生产动作和新G20包尚未接通验收

森哥明确“模型切换”指机器狗运行的控制策略模型，不是设备机型。本轮先定验收，按现有项目UI/模块边界/TDD推进，不再用“只能两个摇杆”的旧断言限制真实操作区；保留原配色、字体、品牌、主导航及用户/其他执行者改动。

实际改动：Control新增站立/坐下、使能/失能、控制策略模型选择，独立呈现云设备状态、直连状态、控制权、姿态、电机与当前策略。只显示真实同步的策略目录；使能/失能/策略切换二次确认，每项独立ready+callback、最终分发再校验，撤销旧意图并与召回/摇杆互斥。请求回调成功仅“请求已处理，状态待确认”，异常只说明无法确认结果，不乐观改状态/断言未执行或自动重试。**App显式五项ready=false、各有未接通原因，无operationCallbacks，生产摇杆executor仍null；本轮未向机器狗发送任何动作。**

短横屏Control采用操作/地图/手动控制三块独立滚动工作区，确认替换侧栏避免挤走地图/双杆；窄地图入口minWidth/minHeight48并换行，大字体/窄屏堆叠。Home压缩装饰区、合并未知遥测且不重复离线；Tasks日期至少48dp宽/短横屏52dp高、模板行至少64dp并保留描述；Profile短横屏设备/设置独立双栏，空间不足回堆叠。无假在线/假图/假遥测填空。

只读核查当前Brainstem实际源码确有GetProfile/SwitchProfile、StandUp/SitDown和Enable/Disable；RobotProfile涉及实际ONNX/行为参数，策略列表应取GetProfile返回。当前actuator采用motion principal匹配，旧文档loopback-only描述不符当前实现；默认loopback可h2c、远端配置要求mTLS，DOSO客户端保持TLS不降级。这些是本地checkout事实，不证明真机已部署/监听/授权，不据此擅自启动或控制硬件。

最终fresh **run-2：51测试文件432/432、fail/skip0，项目tsc及10项相关契约全部exit0；321产品输入、65验证输入与外部proto执行前后漂移0，九项产品路径在范围且删除0**。源码manifest SHA256 `ec850b0710130cab1a0aad8693c5e4b1f3ad6110efb65c41fe711c36c05d10f7`。独立审查APPROVE_SCOPE，实际修复动作挤走地图/摇杆及窄地图入口不足48dp；结果限组件/样式/几何fixture，不冒充Yoga/G20点击实测。run-1的431项为中间快照原样保留、不累加；子证据早期指纹与density中随后变化的App wiring均由最终整体清单覆盖说明。

本轮**构建0/APK0/安装0/设备UI0/网络探针0/机器人RPC及部署0/云及账号数据变更0**。现装仅沿历史com.doso.robot.qa/code9、fd8f3626…/77,779,657B，本轮未重查包，不声称新UI已到G20、登录已恢复或全页完成。证据 `artifacts/release-readiness/20261023-control-operations-refinement/` 的README、run-2、source-identity、review-result及protocol/density/Control子证据。指定源码与本地验证子步骤完成；真实策略/动作传输、地图任务/路线/召回、BLE身份配网、新APK和G20原生验收仍未完成，正式0/20、发布NO-GO不变。下一项先核验真实服务监听/TLS身份并接GetProfile与状态读取，物理动作另按明确安全授权逐项接通，之后正常构建/保留数据升级及原生复验。

## 2026-10-23 已实现显式设备接入、BLE连接与Android直连gRPC只读底座；控制中心布局恢复，尚未构建/真机接通

森哥要求解决scan-only BLE、真实机器狗控制与地图/任务/路线/召回入口，并提供当前机器狗地址。先读双仓库规则、发布证据和相关代码，写验收后分工最小实现，保留既有dirty工作；采用故障定位/模块边界/现有UI审查，将广播发现、物理连接、设备归属和运动权限拆成独立状态，不把连接结果虚报为可控。未更换品牌、主配色、字体体系和主导航。

实际源码：Home设备卡“添加/连接”、Profile“添加/连接机器狗”；Login及账户恢复错误页可打开独立局域网只读连接页，不能进入main/control或发布安全会话。账号BLE/绑定动作继续复用完整deviceBootstrapIntent.canCommit及prepared/MFA/busy/stage门，不绕Apple/用户名/恢复流程。端点显式输入，13145只作默认端口，不硬编码真机IP、不持久化端点/alias。新Android Expo本地模块使用原生TLS gRPC读取实际checkout协议GetControlStatus，正常信任/主机名校验、显式系统KeyChain选择、3秒期限/后台取消；JS仅短期状态投影，motionAuthorized/cloudBindingVerified始终false，无运动或租约RPC。源码/autolinking及JVM解析器验证不等于Android Kotlin编译。

BLE新增connect→retrieveServices→disconnect，候选须显式点击；断开必须匹配真实成功事件，不能把SDK请求ack算释放。force=false、失败/无事件隔离、超时撤监听、取消后迟到connect再次释放；页面重入订阅实际清理状态。扫描层仍无连接/特征读写。未找到机器狗GATT身份/配网合同，因此绑定/Wi-Fi不开放、不收密码或假报成功。Control恢复设备状态、地图数据槽/真实未接入空态、带标签双杆、地图/任务/路线/连接入口及受保护召回；短横屏地图/控制双栏与较小摇杆。生产executor仍null，未发送运动；没有真实地图或任务接口时不补假图/假在线。

负责人fresh run-2：**50测试文件413/413、fail/skip0，项目tsc与10项相关契约全部exit0；320项产品输入执行前后漂移0，无相对code9产品删除**。源码manifest SHA256`85717d0050c8dda91ecc58c300e58a4fa1486046e59cb97413effbbf6ad0af83`。独立审查APPROVE_SCOPE，实际修复召回payload、KeyChain后台拒绝卡忙、BLE ack误算释放；后者独立三场景和20项哈希再次核对。初次runner路径错误（jobs0）及run-1的407/408/两旧契约失败均原样保留，测试host仅补新本地route状态，旧空双杆/scan-only断言改为新真实能力与原安全门，不累计通过数。

真机子项未完成：对森哥指定地址已知默认13145仅一次PC TCP检查，ECONNREFUSED、应用字节0；不能归因成某个部署配置，也不代表G20路径/RPC结果。森哥随后明确“还没启动或不确定”，不能写成实测未启动。未再扫描/重试或擅自启动硬件服务。Brainstem正常fetch成功，HEAD5269881保持，上游1470a9c；local ahead2/behind4、17项dirty路径重叠，未merge/未完成工作代码更新，97个普通文件前后哈希保持（详子证据时点）。

**本轮Gradle0/APK0/安装0**：一次资源观察freeMemoryKiB1940348<4194304，未绕门/杀用户进程。源versionCode仍9，新原生模块未在G20。最后安装身份沿历史code9/fd8f3626…/77,779,657B，本轮未重新查包或假称新实拍；账号与原数据、密码、云权限、机器人部署均未改。证据`artifacts/release-readiness/20261023-robot-grpc-integration/`的README、run-2、source-identity、review-result、BLE最终cleanup-proof、grpc与Brainstem-update。此有证据的本地实现子步骤完成，实际连接/手动控制/地图任务/配网、Brainstem整合及新包原生验收未完成，0/20/NO-GO不变。下一项先取得现有机器人终端访问方式，仅只读核对监听及TLS/mTLS状态，再按资源条件构建验证，不擅自使能或运动。

## 2026-10-23 机器人能力盘点：绑定入口过深，生产控制执行器未接；已找到Brainstem源码而非真机IP

森哥指出支持邮件暂非所需、许多功能未接入、找不到绑定且G20界面宽空。本轮转当前产品只读核查，不再发信或等回信替代本地推进。独立入口审查：主界面“我的”下滚“更多设置”→“绑定真实设备”，仅serialNumber=待绑定显示；已绑定则换解绑，会话恢复失败时main本就不可达。选择机型不等于绑定；表单已调用device-binding/claim但未做当前真机云端成功验收；BLE仅广播扫描，Profile连接仅notify等待网关。

**App.tsx:91生产PRODUCTION_ROBOT_COMMAND_EXECUTOR=null，ControlScreen正式摇杆无真实连接/运动通道。登录恢复不会自动让机器狗可控；云绑定、可信在线、物理连接和运动权限是不同阶段。** 开发只读Brainstem和loopback仿真不能外推正式硬件能力。

实际找到D:/inovxio/brain/brainstem（HEAD5269881、47项tracked既有变更保留），剥离userinfo的origin对应https://github.com/Kitjesen/brainstem，公开页核对成功。默认硬件gRPC13145、远程默认loopback/mTLS与peer边界；这是源码与协议地址，不是已确认真机IP。未读私密env/证书、扫描历史IP、启动服务或发送机器人操作。

UI审查查看code8历史Home/Tasks实拍：短横屏卡片标题偏高、快捷/第三模板推到滚动区，未知状态大卡重复，不能靠假数据填空。Profile退全宽手机长列表、机型固定804、Control仅双杆且部分状态未呈现为源码问题，不称code9实拍。后续应保留品牌/配色/导航，先显式添加设备与分清接入阶段，再按短横屏的信息密度优化，不继续只改颜色。

证据`artifacts/release-readiness/20261023-robot-integration-audit/README.md`；306产品输入重哈希漂移0，无产品实现/测试构建/ADB/绑定解绑/云配置/账号数据或机器人动作。本轮四项事实盘点完成，真机端点与接通、生产控制、新UI收敛仍未完成；0/20/NO-GO保持。下一项需明确机器人现场可用与服务端点，先只读连接方案和显式入口，不擅自运动或更改权限。

## 2026-10-23 已向Supabase官方支持发送脱敏诊断邮件；尚无工单编号或修复结论

森哥明确批准提交指定脱敏材料并继续排查，账号与原数据不动。本轮先写验收/读状态与改动，独立复核合并正文；官方support页指向dashboard/support/new。创建页面和绑定读取各一次30秒超时，库存确认一个tab存在但表单不可核对，Submit0；未清cookie/登录取密/抓隐藏API/换电脑通道绕过限制。按官方“控制台无法加载时邮件support@supabase.com”的公开文档，采用已连接Gmail发送同范围正文。

**2026-10-23 01:05:13UTC（北京09:05:13）唯一一次send成功，message/thread ID 1a1664a627b95369、SENT；随后精确已发送搜索独立找到同ID，metadata再次核对收件人与subject/SENT。** 这证明支持邮件已提交至邮件传输，**不等于Supabase已受理、已投递/阅读或工单已建立**。一次相关支持回信ID检查为空，目前工单号null；未重复发或循环查收。

正文只含项目域/过去UTC/公开目的IP/运行时TLS/匿名对照及热点背景，历史云状态明确标采集时间；不含账号邮箱、密码/key/JWT/验证码、SSID/serial、本地路径或原始trace；无Cc/Bcc/附件。明确仅请求入口TCP/TLS/SNI证书配置诊断，不能修改账号、原数据、凭证或安全策略。新公开status响应仍同旧18:17Z更新时间，只作未变背景，不冒充服务恢复。预检首次误把https当盘符而安全停、send0，精确修正边界后通过；未降低真实隐私约束。

证据`artifacts/release-readiness/20261023-supabase-support-submission/`的ACCEPTANCE、SUBMISSION_BODY、submission-receipt与README。旧10份指定TLS证据SHA漂移0，306产品输入漂移0；包身份沿已装code9/fd8f3626…，本轮不重拉包/构建安装、不点App/提交认证、不改DOSO账号会话/数据库/RLS/网络安全或机器人。唯一外部写入是获授权支持邮件；未读取无关邮箱或保存发件方资料。

支持提交子项完成，受理/具体重置发送方/永久修复与G20真实登录、code9首页任务终验仍未完成，0/20/NO-GO保持。下一项需官方同期入口TLS证据；只对能区分原因的新线索作一次有界验证，任何涉及账号/云权限/入口变更仍需明确范围安全审查，不绕终端校验或重复要求切网。

## 2026-10-23 森哥确认G20当前使用手机热点：热点不是当前已验证解决办法

收到对上一轮上游问题的明确回答“手机热点”。当前G20失败按**用户确认手机热点**补记，系统仍仅识别Wi-Fi/INTERNET/VALIDATED，未独立采集上游身份；不把这条确认外推至PC或全部历史探针，也不声称连续逐请求网络遥测。00:20Z当前失败与历史17:49:54Z热点TLS1.3/401成功同时成立，不能再说切热点必解决/只有原路由器有问题；不能据此判同一手机/运营商/出口、平台全球故障或区域封锁。

本轮验收为保护已哈希原证据、接入人类网络确认并修正下一步；只新增tls-deep-dive目录HOTSPOT_CONFIRMATION.md和SUPPORT_ADDENDUM_HOTSPOT.md及本状态条目，不无痕改写原JSON/README/verification。停止等价重试与反复切网要求，转同期入口TCP/TLS遥测和域名/SNI配置核对。SUPPORT_DRAFT及补充仍仅本地，**未发送工单/消息/附件**；实际向支持方提交需森哥明确同意接收方与材料范围。

无设备/网络探针、App点击、认证提交、产品实现、构建安装或云配置变更。code9/306项身份沿上一轮实际证据，不增加真实认证或原生UI通过数；根因发送方/永久修复仍未完成，0/20/NO-GO不变。故障定位/Supabase技能与独立逻辑复核只用于收紧归因、停止重复动作。

## 2026-10-23 TLS深入定位：电脑与G20均在目标握手阶段reset，未定位具体发送方

森哥要求深挖安全连接重置，本轮先写验收、保留改动，仅进行分层只读诊断与官方依据复核。新鲜UTC00:19–00:20：PC Node24/OpenSSL3.5默认现代TLS及精确TLS1.2均TCP成功后secureConnect前ECONNRESET，293/264ms，正常解析选172.64.149.246；G20系统curl7.80/BoringSSL默认/精确TLS1.2/HTTP1.1均TCP+ClientHello后reset，641/594/624ms，选104.18.38.10，未见ServerHello/证书/HTTP发出。G20 curl本就无h2，HTTP1.1项不算强独立证据。官网控制两客户端正常TLS1.3/校验证书，G20HTTP200；不能替代项目域可用证明。

默认DNS有公开地址且两端均TCP可达，排除本次无DNS答案，不等于核验权威解析。管理面本项目ACTIVE_HEALTHY/us-east-1；官方状态摘要总体operational却仍有API Gateway Request Issues monitoring/backplane demand（10/22 17:01Z开始、18:17Z最后更新），只记平台背景，不能认定与本次pre-ServerHello reset同因。历史17:49:54Z本人确认热点下TLS1.3/401成功，不能当今天热点成功，也未形成紧邻A/B/A；当前Wi-Fi上游仍待森哥确认。

判断收紧为**目标项目域名对应服务边缘及网络路径优先排查，两者未分，不能指认路由/运营商/Cloudflare/国家墙或SNI策略。** 跨客户端与1.2同败明显削弱G20独有/仅TLS1.3解释；本轮失败G20探针未发送HTTP，不支持密码/key/RLS/URL业务作为直接触发，但这些配置并非已全部审核正确。未收到证书不支持CA校验失败，仍不排除边缘证书/SNI配置。App准备阶段先account-sessions终端注册再profile与主界面放行；包装new Error(message)丢底层类别，UI文字本身不能证明TLS，本轮独立系统证据也不能逐条等同App请求。

本地新增`artifacts/release-readiness/20261023-g20-tls-deep-dive/`的双端JSON、README、只读项目/平台摘要及**未发送**SUPPORT_DRAFT，供同期入口TCP/TLS遥测核对；不以缺少HTTP日志证明未到边缘。只在网络实际改变并明确告知后做一次同目标对照，不再同态循环重试。diagnosing-bugs/Supabase技能与独立推断复核用于收紧归因，没有扩大为修复或部署权限。

设备确认仍QA code9，包身份沿前证据fd8f3626…/77,779,657B，本轮未重新拉包；306产品输入重哈希全匹配，产品代码0改动、App点击/认证提交/网络安全配置/构建安装/云变更均0。诊断子项已完成，具体根因/永久修复及code9首页任务原生终验仍未完成；0/20/NO-GO不变。

## 2026-10-23 最新只读网络对照：G20有互联网，DOSO目标域名TLS握手被重置

森哥问“现在联网不行吗”。本轮不改代码/设置/账号、不再点恢复重试，先读最新状态及相关证据再做一次当前系统对照。唯一授权物理设备现装code9；默认网络为Wi-Fi，INTERNET/VALIDATED存在、无CAPTIVE_PORTAL；未读SSID/网络地址，不能据此判定上游是原Wi-Fi还是手机热点。

每路径仅一次、无key/Auth header/账号body、默认DNS/CA/主机名验证、连接5秒/总8秒、不跟随跳转、丢弃响应体与原始trace：G20系统curl到DOSO `/auth/v1/health` 与 `/functions/v1/account-sessions` 均TCP443连接/ClientHello已出，随后connectionReset，exit35/HTTP000；未见ServerHello/证书/SSL建立。相同设备到`https://supabase.com/` HEAD实际exit0/HTTP200、TLS1.3、certificate verify ok。

判定：**当前不能说整台G20没网；至少当前网络到DOSO目标主机的安全连接失败，不仅是App的一条笼统报错。** 重置发生在收到证书之前，不认定证书过期/CA不信任、不据此判账号密码错误或Edge业务HTTP错误；也没有证据确定重置发送方是路由/运营商/服务边缘。系统curl不是RN fetch，控制站成功不等于目标Auth或所有网络永久恢复。

这是新鲜状态，不沿用此前热点成功当今天恢复。旧phase3在本人确认热点后同目标正常TLS/401，仅作为网络切换对照已有价值的背景。当前最小人工动作仍为切到可用手机热点并明确告知；若已是热点先告知，不循环同目标重试、不改安全验证。code9包与安装身份沿上条，产品306输入本轮保持，未重建/安装/提交登录/发信/改密/机器人操作；code9最终UI实拍继续未完成，0/20/NO-GO不变。

新证据：`artifacts/release-readiness/20261023-g20-current-connectivity/result.json`、README.md；每条HTTPS结果与公开官方curl/SDK解释分别记录，不保存凭据或原始响应。两项故障定位/Supabase技能只用于只读分层诊断，未扩大为生产权限变更。

## 2026-10-23 G20已保留数据覆盖升级至QA code9；最终实机验收被会话恢复的Edge Function请求失败阻挡

**资源门已解除，正常构建/独立验包/原位升级已实际完成，不再是“尚未升级”。** code9本轮fresh attempt-4：freeMemoryKiB6455332≥4194304，buildStarts1/spawnAttempts1，真实bundle/assemble/BUILD SUCCESS/exit0，306最终产品输入漂移0，旧f313包保持、锁清理成功。独立核验同com.doso.robot.qa/code9/旧证书fac61745…、两ABI/Hermes/六类原生class_defs/正常index入口与公开配置形态，最终manifest为`attempt-4-bootstrap-navigation/after-inputs-final.json`。旧6/7/8保留包逐项尺寸/SHA不变。

新保留包`releases/20261023/DOSO-0.0.1-qa-code9-fd8f3626.apk`，**77,779,657B / SHA256 fd8f3626f1a2d8d3770837811ac9022e2f27c651060799df63dee059430693e5**。唯一-r --no-streaming从8升9成功，现机base.apk SHA一致；UID10173/首次安装2026-05-20 15:16:08保持，lastUpdateTime2026-10-23 05:35:18，Activity start ok。无卸载/清数据/降级/grant；证明安装连续性，不冒称全部业务数据已逐项核验。

code9仅修本地bootstrap导航意图：同账号重准备/迟到空列表不覆盖已选型号和主Tab；Continue/Skip共享就绪门、原busy覆盖未就绪窗口；退出/换账号/恢复/MFA/用户名/Apple/初始化失败照常阻断，真实bound结果仍权威。独立审查另发现三条真实绑定提交遗漏local意图退役，先取得真实handler RED后仅三处各加clearLocalEntry，取消后迟到claim仍被旧attempt门拒绝；复审APPROVE_SCOPE。最终负责人**39文件341/341、tsc/9契约全部exit0、306产品/验证输入无漂移**。run-1 316/338与修host后run-2 338/338为中间结果原样留存，不累计；测试host仅5处兼容变化、无认证断言删除。相对code8产品仅App/helper/两version文件，无配色/MiSans/品牌/导航/Home/Tasks布局变化。

**code9首页/任务/铃铛/导航原生复验未完成。** 首次UI runner停在fresh_entry、0截图；只读确认正式错误页“无法恢复账户会话”，公开SDK错误为“Failed to send a request to the Edge Function”。不把它断言成DNS/TLS/权限/密码中的某一个根因，也不把安装成功当认证成功。前两分类脚本未匹配而安全停、retries0；确认固定SDK transport错误后，仅一次点击App现有“重新尝试”，之后仍同页同错。没有提交登录/OTP/恢复发信/改密/退出，也未改网络安全配置或用QA入口/假会话绕过。原始UI XML和未知消息不持久化，截图门拒绝非main页面。

最近一次成功显示证据仍是**code8**的五张1920×1200实拍及main-ui-followup：安全区五图标完整，bell正常流不叠导航、持续打开时五导航可切换/可关闭，关闭后Home/Tasks左右独立滚动与disabled开始通过。它们不冒称code9或新鲜登录证明。已请森哥将G20临时切到可上网手机热点并告知（若已是热点也告知），外部网络状态实际改变后再一次正常恢复与最终code9实拍；未再启动构建/安装或循环同故障。

证据：`artifacts/release-readiness/20261023-g20-native-upgrade/attempt-4-bootstrap-navigation/`内SOURCE_VERIFICATION/IMPLEMENTATION、run-3、build-result、package-verification、upgrade-result、main-ui-interaction、entry-page-diagnosis、initialization-retry-edge-transport、entry-after-normal-retry；code8历史目录保持。判定：新包/数据保留方式升级完成，本次最终原生UI/真实认证未完成；正式设计0/20、发布NO-GO不变，无生产迁移/RLS/云权限、真实绑定或机器人/摇杆动作。

## 2026-10-23 G20已升级QA code8；安全区/铃铛/五导航/双侧滚动实测完成，另修启动选型竞态

code8正常单次构建真实bundle/assemble/exit0、freeMemoryKiB8702732、inputDrift0、锁清理成功；独立验包通过同QA/证书/两ABI/Hermes/原生模块/305当前输入。保留`releases/20261023/DOSO-0.0.1-qa-code8-34756258.apk`：77,778,137B / SHA256 347562582064b872e2ba6c8beb82c7699e7d709765a532d698094cfdaffb407b。唯一-r从7升8成功，设备SHA匹配、UID10173/首次安装时间连续，Activity正常启动；无卸载/清数据/降级/grant，不等于逐项业务数据完整核验。

新鲜code8截图已确认五导航全露出，末项下缘安全区修复。第一次原生runner在Continue进入Home/打开bell后回到正式机型页，截图main门拒绝，该停止报告保留；没有截取搜索输入页。随后一次fresh正常Continue检查完成，`main-ui-followup.json`真实记录铃铛不叠导航、持续显示时地图/任务/分析/我的/首页五次selected变化、关闭成功；Home左滑露三快捷/右概览不动，右滑左卡/导航不动；Tasks左滑露第三模板/右流程不动，右滑露流程操作与disabled开始/左模板导航不动。五张1920×1200 PNG是本设备实拍，不是网页/设计稿，未点击开始/召回/控制或发信。

另发现启动导航竞态：唯一写models的device bootstrap成功回调只查active，未保护enterApp本地选型；同账号Auth重准备可经Apple probe状态重启list，晚空列表清型号并送回models；bell仅notify，不据此归咎bell。具体Auth事件/网络返回时刻未留运行证据。一次followup未再跳页不等于竞态消除，负责人已继续attempt-4最小本地导航所有权修复与延迟fixtures，安全门/账号权限不变，**code9现为准备源码，尚无新候选/安装结论**。

code8安装及所列指定UI子项完成，启动稳定性/真实新鲜登录注册/其他全页与机器人能力未完成。证据`artifacts/release-readiness/20261023-g20-native-upgrade/attempt-3-navigation-safearea/README.md`及原始各report/PNG；历史6/7包不变。正式设计0/20、发布NO-GO不变，无云权限/数据库/密码/机器人动作。

## 2026-10-23 新UI已真实升级G20至QA code7；实机发现导航末项裁切，code8修正构建中

森哥确认资源已释放后，首次只读可用约7.72GiB；既有qa-build-once在fresh attempt-2正常复检通过并真实执行一次bundle/assemble，exit0、inputDrift0、旧包保持、锁清理成功。候选独立验com.doso.robot.qa/code7、同公开签名证书fac61745…、ARM64/x86_64、Hermes正常入口/公开配置形态及原生class_defs后，保留新包`releases/20261023/DOSO-0.0.1-qa-code7-ac1b2919.apk`：77,777,985B / SHA256 ac1b291937ec8f6934e868fdac2961349ec1f5f5e0a93774c7f5f84c9261ba64。**本次不是静态图或只改源码，G20已实际一次-r覆盖安装成功、现装code7及base.apk SHA一致，UID10173和firstInstallTime保持。** 未卸载/清数据/降级，安装连续性不等于已逐项核验全部业务数据。

首次安装编排在candidate门因将现有build父Junction与原路径直接比较而误停，installAttempts0；保留该失败证据。最小修正为固定相对输出路径、双方canonical比较、常规文件约束，实际RED→GREEN及2/2路径回归后，fresh upgrade-fixed记录完成唯一安装。未降低签名/输入/资源门禁、未换安全受拒路径。

原生正常入口到本地机型选择页，仅一次已观察THUNDER01继续，进入首页；不是新鲜登录通过证据，未发认证/恢复请求或读取密码。code7真实1920×1200首页/任务截图已取得，紧凑左右双栏ID实测存在。铃铛持续显示时地图→任务→分析→我的→首页五次点击均确认selected变化，提示与导航矩形不交叠、关闭成功。但截图独立复核发现“我的”图标底部被Android系统栏裁切，因此**本轮code7安装与所列点击子项完成，整体UI未完成**。

继续同一缺陷：BottomNav横屏绝对rail按真实SafeArea insets定位，清portrait遗留上下padding；普通手机正常流不双加。原配色/MiSans/品牌/五导航/Home/Tasks内容及动作门禁不变，versionCode7→8标记第二候选。本地17文件116/116、tsc与5项相关契约exit0，305产品输入执行前后不漂移；相对code7仅BottomNav/app.json/Gradle三项改变，无删除，独立审查APPROVE_SCOPE。code8正在fresh attempt-3正常单次构建，**尚无code8安装或实机修复结论**。后续须验包、code7→8-r连续性，再复验完整图标/铃铛/五导航/左右独立滚动。

证据：`artifacts/release-readiness/20261023-g20-native-upgrade/attempt-2-after-resource-release/`的build-result、package-verification、upgrade-fixed-result、main-ui-interaction及g20-home/g20-tasks PNG；code8阶段`attempt-3-navigation-safearea/`的ACCEPTANCE、local-verification和after-inputs。无云权限/数据库/机器人/实体摇杆动作；真实认证/全部页面及正式20页验收未完成，0/20、NO-GO保持，历史证据不覆盖。

## 2026-10-23 已清理本任务5个临时脚本内核；最终可用约2.88GiB，仍不足构建门槛

森哥明确要求帮忙释放资源用于升级。本轮先查进程归属：无Gradle/Metro/模拟器，仓库相关Node/Python/Java/浏览器为0；113 Node、17 WindowsMCP、69 node_repl多为工具设施，不按名称杀。3个孤立父进程的未分类helper也无明确归属，均保留。独立审查确认孤立/低CPU不等于闲置，不影响其他任务。

实际只重置主聊天CUA/Node内核各1次，以及三个已完成子任务各自Node内核1次，共5次均成功，释放临时绑定，已保存源码/证据不动。无应用关闭/进程强杀/共享服务重启/文件缓存删除/设备动作。Windows工具仅发现ChatGPT窗口，随后Computer Use技能禁止自动操作其桌面UI，未关闭也未改走kill；浏览器库存只有Supabase管理页，未擅自关页。

可用内存首次2182740KiB（2.08GiB），根内核释放后3453272KiB（3.29GiB），全部结束最终3017476KiB（2.88GiB）、竞争0/无锁。后台波动不能全归因于reset，仍低4194304KiB；未新建构建attempt或重复启动。最新305输入独立逐项匹配，旧code6包/设备身份沿上一轮fresh证据，本轮不重读。新APK/保留数据升级/首页任务实拍/铃铛导航原生验收均未完成，无新增产品测试或正式通过数。

最小人工动作：本人保存后正常退出暂不用的独立ChatGPT（聚合工作集约3.57GiB）；若它就是当前聊天窗口先不要关闭并告知，避免断开工作。资源实际改变确认后再一次新检查，达标才用fresh release-readiness report正常单次构建，旧attempt不覆盖、不降门槛。证据：artifacts/release-readiness/20261023-g20-native-upgrade/resource-cleanup/README.md、result.json。正式0/20/NO-GO不变。

## 2026-10-23 正常单次构建已实际执行到资源门：内存不足，未启动Gradle；G20旧包身份重验

森哥明确要求按正常流程产新包、保留数据升级G20并实测首页/任务/铃铛/导航。本轮核对最新305项产品输入仍匹配compact after清单；纠正其旧handoff把report-dir放ui-refresh而CLI只允许release-readiness的问题，**本轮合规位置为artifacts/release-readiness/20261023-g20-native-upgrade**，取代旧示例，不削弱路径/资源门禁、不覆盖历史证据。

只读项目现代公开配置经精确无回显marker受控移交一次，值不输出/持久化、编排值已清除；未读私钥/.env或改云配置。正常qa-build-once真实落attempt/build-result，**preflight_stopped；freeMemoryKiB1668800（约1.59GiB）<4194304；唯一blocker insufficient_memory；spawnAttempts=0/buildStarts=0/execution=null/candidate=null；inputDrift0/lockCleanup succeeded**。这是启动Gradle前资源停止，不是编译失败或新APK；未借历史执行拒绝直接推断本次拒绝，也不因launcher可运行就宣称原生任务已放行。

森哥回复“继续推进吧”后仅一次只读资源复查为2898264KiB（约2.76GiB）、竞争0/无锁，仍不足4GiB，未第二次启动构建或反复轮询。工作集只读观察独立ChatGPT最大进程约2210MiB，仅作为最小人工释放建议，不自动终止用户程序/安全服务，不保证关闭后等量释放。需本人保存后退出暂不用的独立ChatGPT、保留Codex/G20 USB并明确告知，之后才新检查/新report；不复用旧attempt或降内存门槛。

G20本轮只读ADB实际确认唯一已授权物理设备/Android33/原平台model/arm64，现装com.doso.robot.qa/code6、base.apk SHA仍f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e，与保留旧包匹配；应用UID/安装时间作后续连续性对照，不读私有账号/输入。无安装/卸载/清数据/launch/tap/UI XML/截图、Auth发信/OTP/改密/云权限/机器人动作。

判定：**合规构建资源门取证和新鲜G20升级前身份完成；新包/原位升级/首页任务实拍/铃铛导航原生检查均未完成。** 最新源码code7仍待构建，未新增产品测试或正式通过数，0/20/NO-GO保持。证据为本轮ACCEPTANCE/README、attempt.json、build-result.json、resource-followup.json与upgrade-baseline.json。下一项在资源实际释放后重验并以新report单次正常构建，验同QA/code7/旧签名/新bundle/native依赖/SHA再保留数据升级；正常认证挡住时由本人登录，不启用假会话或QA根获取截图。

## 2026-10-23 纠正G20“只差打包”：首页/任务紧凑双栏源码现已补齐，新包仍未生成

森哥再次指出G20未升级、未换成所发v13/v14界面。只读核实是两个独立缺口：**实际APK输出仍旧QA code6/f3135f77…；原运行双栏规则也不适用G20估算尺寸**。原要求内宽>=800/剩高>=480，历史物理像素/密度估算约753×471dp、扣壳后示例675×359必回单栏；静态v14的960×600不是RN窗口。此前“只差打包”判断不完整，本条明确更正，不将静态图/源码当作G20交付。

本轮先写验收再依次RED→GREEN，实际只改三个产品输入：adaptiveLayout为Home/Tasks新增608<=实测父宽<880、240<=剩高<480、landscape且0<fontScale<=1.2专用双栏；Home左设备/快捷右任务概览/条件，Tasks左日期/模板右展开流程，左右独立有界滚动并复用同一份内容。紧凑内距/间距12，任务左320/右>=252，按右栏宽度安排操作。不缩字体、不更换原配色/MiSans/品牌/五导航，无详情重复机器人或新增预览标识；召回/模板开始仍锁定。大字/未测/太窄太短单列，其他三主页面及宽平板规则保持。

最终 `artifacts/ui-refresh/20261023-g20-compact-runtime/run-1/` 实际**34文件263/263本地用例、tsc exit0、9项相关契约exit0**，305产品/已记录验证输入执行前后无漂移；产品前后只上述3项变化。新增回归覆盖大字/可用区域变化与任务选择/手动折叠跨模式保留，独立审查APPROVE_SCOPE。早期四文件40/43的旧单栏/默认收起预期已精确适配后43/43，不累计为最终成绩；旧权限断言未删。675×359/627×335/611×300为测试输入，不是本轮G20实测；harness不执行Yoga/原生字体/触摸，不称像素级还原或原生通过。

当前305项源码身份见该目录after-inputs.json，**取代上一轮升级after清单作为新候选接收依据**；原历史证据/交接不覆盖。现有APK输出重哈希仍77,340,265B / f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e，本轮未再读设备包。code7仍只是源码准备。无构建/Metro/模拟器/ADB/安装或Auth/发信/OTP/改密/云权限/机器人动作，历史原生执行限制未绕过。

判定：**紧凑横屏布局缺口的源码修复和本地验证完成；G20新UI安装升级/触控显示/真实认证仍未完成。** 下一项通过正常获准单次流程构建匹配最新清单的候选，验同QA包名/code7/旧签名/新bundle/native依赖/新SHA后保留数据原位升级，再验G20窗口/fontScale、双栏/降级/铃铛/五导航/独立滚动。最新构建交接为本轮目录TRUSTED_BUILD_HANDOFF.md和独立trusted-build-1；没有重复请求安装授权或让用户沿旧manifest打包。正式设计0/20、发布NO-GO不变。

## 2026-10-23 G20非预览UI与code7升级准备完成：尚无新APK，待正常获准构建

森哥明确要求完整同步G20安装包、升级UI且不在App显示“预览”等开发标识。本轮先写验收，实际清理生产机型页CTA/非绑定说明、App进入/解绑提示、Tasks流程标题与无障碍提示；不再把选型号称为开启预览，仍明确尚未绑定。MapScreen新增showExamples默认false，正常App不启用示例图库/分类/执行控件，只显示未接入路线空态；只有独立开发QA显式启用示例并保留风险披露。未剥QA披露、改index.preview入口、绕过Auth、伪造设备或打开运动权限，原色板/MiSans/品牌/五导航保持，铃铛修复保留。

app.json与android/app/build.gradle的versionCode均6→7；基础包名com.doso.robot和QA后缀.qa、既有签名配置不变。**这是升级准备，不是新APK实际version/验签/安装证据。** 本轮305项产品/资源/native输入前后仅7项改变：App、ModelSelect、Tasks、Map、DesignQaRoot、app.json、Gradle。当前App SHA ed41241dcb67ed3e497fb04b2551ceb4196f6e534e0b9a8df5ee9a4eb9fd96f6；完整身份见artifacts/release-readiness/20261023-g20-ui-upgrade/after-inputs.json。旧保留f3135f77… APK前后重哈希保持77,340,265B，本轮未再读设备包，不能称G20已更新。

本地37文件全量run-1实际**276/277，类型检查通过、9项相关契约全部exit0**，305产品输入与验证输入执行前后均不漂移。唯一失败为qa-build-once负向测试硬编码已存在历史attempt目录，误把历史文件当本次副作用；未删除/覆盖历史，将测试改为独立test-owned随机空目录，异常产物不递归删除。该文件随后**7/7补跑exit0**，产品与全量run保持，唯一验证文件变化即该测试；不将run-1改写为277/277或把重复7累加。两项产品及升级身份审查APPROVE_SCOPE，无有证据P1/P2，门禁修复另获只读确认。正常Login/Register始终有onSocialLogin回调，不会因provider未开放而落入独立组件“界面预览”缺省文案；不扩大修改到照片正常预览等无关语义。

构建阻断分开记录：初始独立CIM资源1189MiB不足4096门槛；森哥回复“请开始推进”后负责人仅一次复查为4241MiB、竞争0/锁不存在，**该时间点资源门解除，但不是完整配置预检或未来资源保证**。历史原生导出创建前执行策略拒绝未确认解除，本轮未换命令/工具重试被拒绝结果，实际Android构建0/新包0/安装0/设备操作0。现有C:/doso-build junction目标正确、既有JDK21与实际D:/software/Android SDK工具路径只读存在；主机默认JAVA_HOME为24，不直接用于已审流程，也未改全局环境/装运行时/终止他人程序。

判定：**非预览产品文案/地图默认与code7升级准备、本地验证已完成；整包同步G20、完整UI原生和真实认证未完成。** 已准备正常获准单次QA构建交接及独立trusted-build-1 report目录；只有构建方提供匹配当前源码与标准环境的候选APK/真实bundle及assemble证据后，负责人再验同com.doso.robot.qa、code7、旧公开签名证书SHA fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c、ARM64/native模块/源码/新SHA，通过才保留数据替换升级。不要用旧包、另一个.preview/基础debug包、静态图/Metro或付费云构建顶替；不卸载/清数据/降级。具体最小人工动作与路径见该目录TRUSTED_BUILD_HANDOFF.md。无Auth请求/发信/OTP/改密码、云权限或机器人动作；正式设计0/20、发布NO-GO不变。

## 2026-10-23 铃铛反馈遮挡已修运行源码：本地回归完成，未安装新包

森哥提供的v13手机/v14横屏图是静态设计对照，不能等同于当前G20截图。首页/任务及主壳自适应先前已进入运行代码，但上次设备核验仍为旧QA versionCode6 / SHA f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e，不包含近期UI；本轮没有重新读取设备或换包。最新要求转为点击后的UI异常，账户恢复/发信继续暂停。

先写验收后定位真实调用链：主Header铃铛→notify→旧绝对bottom/z100 AppToast，整卡Pressable可遮挡导航并截走点击，QA铃铛原为noop而未覆盖此路径。本轮最小修复4项产品输入：提示改正常流、主页面放Header后/内容前、非main仅保留一个fallback；独立48×48关闭，正文保留全文并有界滚动；已在SafeArea内部时不重复加系统insets；主动打开的铃铛说明持续显示，一般提示保留原3200ms。生产/QA共享真实“通知服务尚未接入”文案，不假造消息、不请求通知/认证/设备服务。原配色、MiSans、品牌、五项导航与运动/任务策略未改。

本体/QA/生产接线各有实际RED→GREEN证据；最终 `artifacts/ui-refresh/20261023-feedback-layout/run-2/` 实际exit0：**30文件230/230本地回归、tsc --noEmit exit0、8项相关契约全部exit0**。167声明输入执行前后SHA一致；产品前后清单127→128，仅App.tsx、AppToast、DesignQaRoot、新notification-notice四项有变化，无其余受监测产品源码变化或删除。App.tsx SHA155631fff0823971b573b59fd4cab6520980cf089a3befa5b01c7b0781baa1de，完整身份见after-inputs.json和最终local-verification.json。run-1的230/230/类型通过及1项旧日期正则误报原样留存；该项改TS AST逐个检查真实Header固定日期，并补实际Date断言，独立只读复核确认未放宽要求。两条独立源码审查APPROVE_SCOPE、无有证据P1/P2。

判定：**铃铛遮挡的源码修复与本地回归完成；整套UI交互/G20新UI原生验收未完成。** 组件树/AST不执行Yoga、Android字体度量、真实触控滚动或TalkBack；极端有效高度不足64的窗口不在已验证保证内，其他点击异常仍须逐入口核查。无新APK/安装、Metro/模拟器/构建、云权限/账号/机器人动作，未换路径绕过已有原生/导出阻断；正式设计0/20、发布NO-GO保持。下一项通过正常获准构建流程取得匹配当前源码/native依赖的新包，再验G20/手机点击铃铛、关闭、五导航、短横屏/大字滚动与其他弹层入口，不拿旧包或静态图代替。详见该目录ACCEPTANCE.md、IMPLEMENTATION.md及README.md；历史认证证据不覆盖。

## 2026-10-23 “正在恢复连接”位置已确认在G20输入法：不据此改Auth，恢复发送仍待本人确认

森哥明确确认提示位于G20输入法区域；这是人类位置确认，不冒称原生抓到了该提示。负责人只读发现QA前台、IME当前已隐藏，因此未按返回；随后公开页面marker均未命中，不猜测当前页或坐标、不点发送。未将该输入法提示归为DOSO会话恢复缺陷，也未修改输入法/网络设置。后续历史精确快照补证确认旧QA的键盘Send可提交恢复请求、单纯打字不会，因此仍不盲目重发；用户是否键盘提交/邮件是否送达未观察。提示位置确认完成，输入法底层网络原因及账户恢复未完成。

下一项：如注册邮箱已在正式找回页填好，请森哥确认“邮箱已填，可以发送恢复邮件”，再检查可见页面并仅执行一次正式发送；如无法输入，则先协助本地英文键盘，不要求邮箱/验证码/密码进聊天。负责人恢复发送/OTP/改密/输入法设置动作仍均0；无App代码、新包/安装、云权限或机器人动作，旧QA仍f3135f77…、非近期UI，NO-GO/正式设计0/20不变。补充证据：`artifacts/release-readiness/20261023-g20-auth-connectivity/phase-5/input-method-confirmation.json`和`legacy-source-followup.md`；初始提示扫描保留。

## 2026-10-23 输入后“正在恢复连接”归属待确认：暂停恢复请求，未改密码

森哥尚未确认“邮箱已填、可以发送”，而补充每次输入后显示“正在恢复连接”。本阶段暂停所有恢复发送/OTP/改密，仅只读当前G20瞬时UI与源码/旧QA公开文案。G20仍QA前台，1可编辑控件/0密码控件，本次公开白名单页面/通知marker未命中；未捕捉到该句不排除先前短暂提示、遮挡、输入法或电脑聊天窗口。内存解析无raw XML/截图/输入值输出或落盘，无新tap/认证操作。

当前源码未找到精确原文，App相关全屏文案是“正在恢复安全会话…”；普通邮箱onChange不直接设authLoading，AppState仅调native refresh。但当前ForgotPassword邮箱有onSubmitEditing=submit，键盘“发送”也可能提交恢复请求，故**未点页面按钮不证明用户没有发送**。旧f313静态扫描未检出精确“正在恢复连接”、检出安全会话/MFA等文案；初次扫描尚未取得匹配旧源码，后续已从既有App/AuthContext before.snapshot找到与旧构建manifest匹配的两项（见本阶段legacy-source-followup），更新资料限制但尚未确认提示归属/加载根因，不能把当前实现硬套为旧包根因。

判定：**提示根因及账户恢复未完成**。已问森哥提示出现在G20 DOSO、G20输入法还是电脑Codex/聊天窗口；先确认位置，不盲改Auth或重复发信。负责人本轮发送/OTP/改密均0，用户是否键盘提交仍unknown；未访问邮箱或账户。七项受监测产品输入保持、145项既有tracked改动保护，无App代码/构建/换包/安装/云权限变更，旧QA身份仍f3135f77…、非近期UI；NO-GO与正式设计0/20不变。证据：`artifacts/release-readiness/20261023-g20-auth-connectivity/phase-5/restore-notice-triage.json`；既有证据不覆盖。

## 2026-10-23 找回协助已打开G20正式页面：待本人填邮箱，未发送邮件或修改密码

森哥明确要求“你来帮我找回”。本阶段限定先导航官方找回入口、不提交敏感信息；邮箱/验证码/新密码由本人在G20输入，不进聊天。观察到前台为Android Settings后，仅一次正常resume既有QA，确认前台登录页；`exec-out uiautomator dump --compressed /dev/tty`仅内存解析公开白名单控件，不写设备/本地XML或截图。新鲜观察唯一enabled/clickable“忘记密码？”目标并复核前台后，仅tap一次，exit0；随后确认同QA前台、“找回密码”标题和“发送验证码”按钮，未进入OTP/重置页。瞬时XML可能包含输入属性，输出/证据不含输入值，没有读取/展示密码或验证码。

**正式找回页导航完成，账号恢复/真实认证仍未完成。** 已请森哥只在G20填写注册邮箱，先不发送，回复“邮箱已填，可以发送恢复邮件”后才继续一次正式请求；未代填邮箱、发恢复邮件、验证OTP或改密码，也未访问收件箱/后台账户。已提醒密码更新可能使其他终端需重新登录。七项产品输入和phase3两份证据SHA保持，145项既有tracked改动保护；本轮未改App代码、构建/换包/安装或云配置。仍为旧QA `com.doso.robot.qa` versionCode6 / SHA f3135f77…，不是近期UI新包；NO-GO与正式设计0/20不变。证据：`artifacts/release-readiness/20261023-g20-auth-connectivity/phase-4/recovery-navigation.json`；既有网络对照不覆盖。

## 2026-10-23 手机热点对照成功：G20正常TLS1.3/证书校验/HTTPS响应，App真实认证待用户操作

森哥明确确认已切手机热点。负责人复读当前默认Wi-Fi/INTERNET/VALIDATED存在、无portal；热点身份来源为用户确认，不采SSID/地址。仅一次与phase2同host/path/参数、无key/账号、正常校验的公开health GET，实际curl exit0 / HTTP401，TCP、ClientHello、ServerHello、证书、SSL建立和certificate verify ok全报告true，协商TLSv1.3。**热点下系统HTTPS可达子门完成**；无key探针401不代表用户密码错误，也不证明Auth health就绪或App登录成功。未保存响应体/原始trace/标识，没有再提交认证。

同G20、同目标/探针从原Wi-Fi的握手前RST到热点成功，增强原网络路径相关性；但未切回原网络复测，时变服务因素尚未排除，不能确定RST来源、运营商封锁或原Wi-Fi的永久修复。保持热点作为当前已验证的测试网络，不将其作为发布永久方案。森哥记得邮箱能收信但忘记密码，已先问是否由其在G20正式“忘记密码”自助找回；未代发邮件/读取验证码/更改密码。下一项分开验App真实连接、用户收信/恢复、登录进入首页，不猜密码反复提交。

本轮七项产品输入和phase1/2四份指定证据SHA保持，本地旧QA重哈希仍77,340,265B / `f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`，设备包一致性沿用先前安装证据，未再拉包；旧QA仍versionCode6、非最新UI。只读结论审查APPROVE_SCOPE；无App代码/代理/DNS/证书/云权限变更，无新构建/安装、Auth POST或机器人动作；145项既有tracked改动保护，未重跑产品测试或增加通过数。**真实认证、原Wi-Fi长期修复、当前UI原生和发布仍未完成，NO-GO/正式设计0/20不变。** 证据：`artifacts/release-readiness/20261023-g20-auth-connectivity/phase-3/README.md`、`results.json`；既有phase1/2不覆盖。

## 2026-10-23 原Wi-Fi认证HTTPS专项：ClientHello后连接重置，未到证书；修复仍待网络对照

森哥明确要求解决并确认仍原Wi-Fi。本阶段先写明“定位TLS失败步骤、修复后须正常校验收到G20目标HTTPS响应”的验收，再新增一次有阶段信息的公开Auth health GET，而非反复登录：默认DNS/TLS/CA、无key/重定向、5秒连接/8秒总限。G20实际TCP成功、ClientHello已发，未观察到ServerHello/证书/SSL建立，exit35/HTTP000、闭集原因connectionReset。PC另做TLS-only默认DNS/CA、正确SNI对照：认证host公网解析/TCP成功但secureConnect前ECONNRESET；官方control supabase.com授权成功/TLSv1.3。未取得证书，不能称证书过期或CA校验失败；两端结果不确定RST发出方，也不证明云宕机或网络封锁。

旧QA编译manifest与App自有代码安全专项未找到可确证的TLS配置缺陷，usesCleartextTraffic=false不阻止HTTPS；未把默认CA政策当根因。G20六项命名设置只读exit0，未配置全局HTTP代理/私有DNSspecifier/always-on VPN或lockdown，mode返回null；不能排除每网络代理、路由/企业策略或其他VPN。外部web工具同URL取回失败只记工具限制，无第三网络健康结论。官方地区可达性资料仅作一般参考，不能据此认定森哥网络原因。

判定：**TLS重置定位子步骤完成，连接恢复和真实认证仍未完成**。未改App代码/信任链/证书/明文/云权限，无新包/构建/安装、账号/邮件/Auth POST或机器人动作，旧QA身份仍f3135f77…/versionCode6，不含近期UI。明确请求G20临时切手机热点后仅做一次同host无账号HTTPS对照；若可达再定位原网络，若仍失败继续服务入口/官方支持，不自动启用付费域名、代理或迁移。七项产品输入本阶段开始保持，145项既有tracked改动保护，NO-GO与正式设计0/20不变。新证据 `artifacts/release-readiness/20261023-g20-auth-connectivity/phase-2/README.md`、`results.json`；phase1证据未改。

## 2026-10-23 G20认证联网故障已分层取证：Wi-Fi已生效，HTTPS仍失败，待热点对照

森哥报告登录“无法连接认证服务，请检查网络后重试”。首次设备只读检查为Wi-Fi开关开但无默认网络/无当前网络；森哥手动连Wi-Fi后重新读取，已存在唯一WIFI默认网络、INTERNET和VALIDATED均报告、无CAPTIVE_PORTAL，设备epoch与电脑差0秒。不继续用旧离线状态解释新重试。G20按认证域名发起TCP443探测exit0，但系统curl正常证书校验、无key、8秒有界GET `/auth/v1/health` 返回exit35/HTTP000；另控制站example.com的HTTPS HEAD返回exit28/HTTP000，均未获得HTTP响应、响应体不保留。PC独立无key同主机GET也仅得network_error；这些均不证明云宕机或特定证书/封锁/硬件根因。

只读云管理元数据确认本项目ACTIVE_HEALTHY、us-east-1、URL与目标一致，但管理面健康不替代G20数据面/真实认证。已装旧QA的本地APK重新静态核验为 `com.doso.robot.qa` / versionCode6 / 0.0.1-qa、77,340,265B、SHA `f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`，含INTERNET、正确托管host和正常Auth调用；构建证据为index.ts、非design QA入口，不是独立禁网.preview。设备base.apk与该SHA一致性沿用上一轮已保存安装证据，不冒称本轮再拉包；它仍不包含近期新UI。森哥在新网络状态手动重试仍报同句；密码遗忘另一个问题，森哥记得邮箱且能收信，本轮未代输凭据或发送恢复邮件。

判定：**已完成联网/包配置/TCP/系统HTTPS的诊断子步骤；连接恢复、App真实登录/注册/找回密码、弱网及当前UI实机验收未完成。** 系统curl不等同于RN App请求证据；另一次仅目标App/PID、最多500行历史日志的内存分类exit0，七类错误均无匹配，未保存原始日志/账号/PID，缺日志不证明没有错误或该次登录的内部根因。没有证明需要改认证业务代码，不用游客模式、换密码、关闭证书校验或改云权限试错。最小人工动作已提出：G20从当前Wi-Fi切到手机热点（若原本已是热点先说明），网络变化确认后仅做一次同host无账号HTTPS对照。森哥补充普通网络可用，但尚未明确是否换到热点，未据此重复探测。未改App代码/设备网络配置，无新构建/安装、Auth POST、数据库/权限/账号或机器人动作；145项既有tracked改动保留，NO-GO与正式设计0/20不变。证据：`artifacts/release-readiness/20261023-g20-auth-connectivity/ACCEPTANCE.md`、`observations.json`、`FOLLOW_UP.md`；本轮记录是工具结果摘要，不伪称原始响应或原生登录通过。

## 2026-10-23 G20调试接入和旧QA安装基线已验证；控制/紧凑任务布局本地完成，当前UI待匹配新包

森哥已开启USB调试，并明确批准在该G20安装/打开DOSO测试App仅作界面验证。只读发现唯一已授权Android设备，系统报告QUALCOMM / Bengal for arm64、Android13/API33、arm64-v8a等ABI、物理1200×1920、physical density480/既有override408、rotation lock1；通用平台名不独立证明G20产品型号。横屏显示范围据此估算752.94×470.59dp，不是RN窗口；font_scale返回null，未当作有效fontScale1。未修改密度/分辨率/旋转锁/驱动/遥控通道。

运行代码实际继续改Control与Tasks：返回48×48，非法/极小容器不挂载不足48的摇杆；同方向宽高或小数变化也在换几何前中断开发合成输入并归零，重复测量不重复中断。生产DEV/ready/AppState/leaving门禁、后台/旋转/取消/返回保护保留。短横屏Tasks删除重复摘要，标题保留只读/可信任务未同步，模板选择反馈仍保留未同步说明，恢复高度后摘要/选择/手动展开状态正常；原色板、MiSans、品牌、导航、policy均未变。独立只读审查范围限定APPROVE，无P1/P2。

最终 `artifacts/ui-refresh/20261023-g20-runtime-batch3/run-1/` 实际exit0：**24文件194/194组件/helper/policy回归，tsc --noEmit exit0，8相关契约全部exit0**；62声明输入执行前后SHA一致，5原资源保留。当前源码身份、原始TAP和分命令结果均已保存。这些是本地测试，不是194项硬件/原生通过，也不是完整24用户界面定稿。

本地旧debug虽字节版本匹配SDK57/RN0.86.2，但缺SecureStore等必需native模块，未试装或重写入口绕过。森哥批准范围内先安装已说明的旧QA包 `com.doso.robot.qa` / versionCode6 / 0.0.1-qa，77,340,265B、SHA `f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`；设备base.apk SHA完全一致，安装exit0、Activity启动ok，系统该包窗口frame1920×1200。第一次pm path非0预检即停、未发安装；后以pm list exit0无精确包名确认未装，实际只发一次安装，无-r/卸载/降级/清数据/授予权限。

已核对该包前台并取得1920×1200旧注册页实拍，看到系统横屏输入法全屏抽取；确认输入法可见后仅发一次Android返回键收起，前台仍为该包、IME由true变false，再取得旧注册页截图。没有由负责人输入密码/验证码、点击注册/登录、触碰实体摇杆/接收机或发送运动指令；截图不作为真实账号/认证证据。**这仅证明旧QA安装、启动和有限显示/收键盘基线，不含本轮新UI。** RN Dimensions/onLayout/safe-area/有效字体缩放仍未测，不据系统frame或旧截图宣称当前源码适配通过。

判定：调试接入、旧包安装/启动基线及批3本地实现完成；**当前源码G20原生字体/布局/滚动/触控仍未验收，无新APK**。没有启动Metro/模拟器/新构建、改生产权限或换路径绕过历史导出阻断。下一项须通过正常获准构建流程提供包含当前native依赖的debug开发APK或当前源码新测试包，再进行新UI原生验收；旧包保留在G20便于森哥查看、不自动卸载。认证等余下18用户入口继续逐批；正式设计0/20、发布NO-GO保持。

## 2026-10-23 主页面批2运行布局与本地回归完成，G20已接线但调试接口未识别

承接森哥“继续调整，准备接入云卓”的要求，本批实际修改Map/Analysis/Profile运行代码，并收口Home/Tasks剩余高度判定：五个主页面按壳层安全区和导航预留之后的onLayout宽高及fontScale重排，宽高可读才分栏，未测量/窄窗口/短剩余高/大字单列滚动。App与DesignQaRoot的主Header全部进入正常流；地图去99/29偏移及0.82缩放下限，我的去122/49顶部偏移与左安全区回收。Profile主要按钮至少48、长身份/固件/不可用原因可换行；分析只新增真实“数据可用性”待同步分组，不造0值或演示遥测。原配色、MiSans、品牌、导航顺序及任务/路线原子安全策略保留。

最终新目录 `artifacts/ui-refresh/20261022-adaptive-runtime-batch2/run-2/` 实际exit0：**20文件148/148目标组件/helper/policy回归，tsc --noEmit exit0，7项UI/可信数据/QA/主题契约全部exit0**。51项声明输入在统一验证前后SHA一致；最终源码身份与5份原资源保留校验见source-identity.json。第一轮145/148及任务契约失败原样留在run-1；仅补2份旧onLayout测试的height、将Profile精确44高度更新到实际48、将Tasks契约绑定当前viewport宽高，再另启run-2。独立只读审查复核测高修复及4项测试更新，范围限定APPROVE，无剩余P1/P2；最终统一执行结果由负责人日志记录，不冒充审查者重复运行。

森哥报告G20已接USB、没有授权弹窗。负责人只做1次ADB发现（exit0、0设备）及一次Windows当前设备友好名筛选（G20/Skydroid/Android/ADB/MTP，0匹配）；**型号、Android、ABI、尺寸密度、App窗口、安全区及安装包身份均未观测**。未自动装驱动、重启ADB、改USB/显示配置或轮询故障；未启动App、构建、模拟器或服务，未安装APK、操作摇杆/接收机或发送机器人指令。最小人工动作：在G20设置确认USB调试开关；若没有入口，提供设置页截图，不改厂商通道/接收机参数。无提示不能直接判断硬件或线材故障。

判定：**主导航5页的本轮自适应运行代码与本地回归已收口，不是全App/UI视觉定稿或G20实机通过。** 24用户界面中控制、9认证、6设备、3账户隐私入口仍需逐批收口，开发工具另列；不据此增加正式通过数。批1模拟器/导出执行策略阻断未通过换路径绕过；本轮无当前原生截图或新APK，旧QA包仍不包含新布局。正式设计0/20、发布NO-GO不变。下一批先控制页可读横屏/触摸生命周期的本地验证；G20调试连接可读后先采实际参数，再安排目标包安装和原生显示验证，实体输入和运动能力另行授权验收。

## 2026-10-22 完整UI批1已改运行代码：Home/Tasks＋共享布局，本地通过、原生受阻

森哥最新要求已明确推进完整设计及App运行代码，不再限于出图。本轮落实v13手机/v14横屏到真实HomeScreen/TasksScreen：首页实测容器分区、设备/召回同区、去快捷小字、只读任务概览和任务条件三态；任务纵向模板、整块星期日期选中、无详情机器人、宽屏默认展开且可收起。新增共享可读宽度/高度/字号降级helper，Tasks改正常流Header，App/QA一致；侧栏短窗口可滚动不缩小48目标。原配色、MiSans、品牌和导航顺序保留，Map/Profile旧Header兼容分支尚未清理，不将本批宣称全App完成。

完整口径已校正：**24用户界面＋2开发工具＝26入口**；旧25是App路由口径，漏计index.ts独立开发本地仿真。正式manifest仍20项，不新增通过数。更新逐页清单为6批设计/实施/验证，H01/H03标代码和本地回归完成，其余仍待推进。

最终本地统一runner实际exit0：**116/116目标组件/helper/policy回归，tsc --noEmit exit0，Home/Tasks/QA harness/主题横屏4契约exit0**。独立代码审查所发现的QA主题脚本旧断言已精确修复、补系统主题用例，复核APPROVE_SCOPE_ONLY。任务/路线policy无本轮改动，模板unknown/null、召回禁用程序防护保留，Home不从召回推定任务权限。34输入源码/测试SHA、5原资源及原始TAP/分命令退出状态见 `artifacts/ui-refresh/20261022-adaptive-runtime-batch1/`，这些不是原生或正式设计通过。

原生只启动一台DOSO_API_35和一份Metro8130，只读核对既有开发客户端`com.doso.robot`/versionCode6/APK SHA `7493ce7e7d4f4a8db27658958aa3a309d1b121a288d3921d362bb4efe4f5c7c1`；冷启动遇System UI无响应，处理按钮的命令被执行策略拦截，已安全停止、不换路径重试。Android导出启动也被策略拒绝、未实际执行；**本轮无当前App原生截图、G20窗口/触控/实体摇杆通过、无新APK/安装**。任务专属Metro树及模拟器已关闭，未碰用户其他服务。没有云端写入、生产迁移、权限变更、真实账号/数据删除或运动指令。最小人工动作是用户在Android Studio手动打开DOSO_API_35并确认正常进入桌面，再继续原生验证，不要求绕过安全限制。

判定：**批1运行代码与本地回归完成；Android可视验收受阻，全App/G20实施验收未完成。** 下一批地图/分析/我的，随后控制、认证、设备和账户隐私；正式设计0/20、发布NO-GO不变。历史v13/v14图片仍仅为设计参照，不改写为运行实拍。

## 2026-10-22 v14：G20横屏首页/任务设计稿完成，未实施App适配

按森哥“请开始调整”及先出稿方向，本轮在v13手机方案上新增G20横屏首页、任务两页。首页左侧设备与快捷入口、右侧任务和执行条件；任务页左侧日期/三条模板、右侧现有三步只读流程与锁定操作。真实MiSans Regular/Medium/Demibold、原白/石墨/#98D1FF、D头像/通知、原机器人与五项纯图标导航顺序保留，横屏导航置右。快捷卡无小字、星期日期共同选中、任务详情无机器人；离线/待同步/未验证/未接入和锁定召回/开始均保留。

新增 `artifacts/ui-refresh/20261022-g20-landscape-v14/`：两份1920×1200 PNG、横屏总览、手机/横屏静态对照、索引与证据。**960×600仅为设计坐标，不是G20实测dp/DPI或应用窗口。** 两次离线渲染实际exit0；首次目视后收紧控制入口48高及锁定文案。最终74条文字/40图标/17命名组件的字形与静态几何检查完成；负责人和独立设计审阅者均实际看图，未发现设计交付阻断项。11产品输入、v13历史9个顶层文件、原字体/机器人/图标资源渲染前后SHA稳定，完整身份见本轮manifest/REVIEW；静态检查不计入产品测试或正式通过数。

另独立只读核验实际exit0：4PNG真实尺寸/字节/SHA、11当前产品输入、9历史文件与5原资源匹配；含总览/对照外注共80文字与40图标的原SFNT码点及文字FreeType度量、17组件几何/导航选中均通过限定范围检查，没有运行主渲染器或改写图片。设计几何不证明实际触控。

**两页横屏设计稿完成、待森哥视觉确认；App动态适配实施和G20实机验收未完成。** 本轮未改App/src/字体接线/导航/package/原生配置，无构建安装、浏览器/服务、云端写入或运动指令；无新DOSO APK。图片日期/账号/系统栏/不可用状态只是样例，不是实时认证或遥测。正式设计0/20、发布NO-GO不变。下一项先按森哥反馈收敛横屏布局；实施前测实际G20窗口/密度/字体缩放/系统栏，实体摇杆另行只读接入验证，不能将本轮图稿冒充硬件兼容通过。

## 2026-10-20 v13：真实MiSans首页/任务设计稿完成，未实施App

森哥批准按上一轮参考方案先出两页设计，要求真实字体、原配色、品牌/导航保留、先不改代码。本轮仅在 `artifacts/ui-refresh/20261020-realtype-mobile-v13/` 新增设计资料与离线排版脚本。以FreeType直接读取项目MiSans Regular/Medium/Demibold原字库、现有Ionicons和原机器人资产，绘制390×844两页，输出两份1170×2532 PNG及1704×1968总览。不是AI近似字形、浏览器实拍或App截图；未使用Bold/合成字重/系统fallback，所有可见文字/图标码点从原SFNT cmap核对。

原白/石墨/#98D1FF与蓝底深字保持；首页去重复大标题、缩小机器人身份图、设备状态和操作集中，快捷入口无副标题；任务三条纵向模板、星期日期一体选中、详情无机器人，保留只读和锁定开始。D头像/通知铃及五项纯图标导航顺序保留，Home/Tasks分别正确选中。离线、待同步、权限未验证和执行器未接入均为拟议静态不可用样例，不是新的后端查询；日期/账号/系统栏亦非实际登录或遥测。

实际一次离线出图exit0；负责人读总览，独立复核读总览及高清单页，无阻断。69条文字/16组件边界无越界、文字无相交、导航无内容碰撞；独立仅内存重建单页与现PNG逐像素一致。输出/字体/资源SHA、11产品文件前后身份一致；负责人收口再读11项changed为空。全部为静态设计检查，不计入产品用例数。原v11/v12与历史证据不覆盖，未启动浏览器/Metro/构建/模拟器。

**两页真实字体稿已完成，待森哥视觉确认；App实施、原生字体/触控/放大/窄屏/横屏/滚动验收未完成。** 本轮App/src/字体接线/品牌资产/导航组件/package未修改，无新DOSO APK/安装、云端或运动操作；正式设计0/20、发布NO-GO不变。图稿及v11设计对照：本轮 `index.html`、overview.png、home-design.png、tasks-design.png；身份/字阶/边界：render-manifest.json、BRIEF.md、REVIEW.md。后续仅按审图反馈推进，不将设计稿通过冒充实现通过。

## 2026-10-19 REA参考研究：两份官方APK静态取证，未改UI代码

按森哥最新要求，由负责人选DJI Fly、Roborock、Home Assistant研究字体、字号和卡片，先不改代码。本轮真实取得DJI Fly1.21.12/3131451官方APK（719,710,792B，SHA256 `1da8d5b2ee5cdcb6002131b8f6535605e7445080d1ca6f8411067a0d1524ce0b`）及HA2026.8.4-full/24228官方APK（40,625,111B，`ed1ded69472f2fa87c20c975b3e5f628889ec304dc9eb6aa5c52ecb6bd4c4687`），实际REA inventory/inspect并导出Evidence后关闭两次session。HA官方已发布Demo bundle另做REA惰性AST分析；语义覆盖partial、unknown上限等限制保留，未重复producer。未执行第三方APK/脚本或连接设备。

REA缺少Android JADX provider，未安装/配置引擎；以现有aapt2和Python标准库补充读取编译资源与SFNT内部名称，明确不冒称REA Java反编译。DJI包内Roboto/Condensed及font/style引用可确认，部分卡片12/13dp、FPV15dp及大屏变体可读，但不证明具体HUD/中文正文运行时使用。HA Web声明Roboto/Noto/sans-serif、12/14/16/20/24等CSS字阶及12圆角/16内距；原生APK单个字体文件实际是图标字体，Web/Android单位与版本分开。Roborock仅取得官方布局资料，未取得官方APK，字体和精确尺寸保留未知；不称三款完整逆向。

研究与DOSO具体排版提案：`docs/design/DOSO_DEVICE_APP_REFERENCE_STUDY_20261019.md`。证据身份和限制：`artifacts/research/20261019-device-app-typography/PROVENANCE.md`，完整REA records/原APK/发布bundle保留。独立只读复核无阻断，已收窄静态分析措辞。建议先减少过多粗体和重复标题、缩小机器人身份图/卡片尺度，再以同布局MiSans Regular/Medium与Noto候选决定字形；全部DOSO数值标为设计建议，不当成他App实测或用户已批准。

**参考研究与建议完成；Roborock包取证、具体第三方页面运行时字体和DOSO实施/原生验证未完成。** 本轮未修改App/字体接线/品牌/导航/配色/package，未生成新设计图或DOSO APK、构建安装、云端写入或运动指令；正式设计0/20、发布NO-GO不变。下一步先审研究建议，再按现有色板逐页出排版设计，不自动全App换字体。

## 2026-10-19 逐页打磨目录与真实字体样张：25个入口，尚未替换App字库

森哥要求明确全部布局并逐页打磨，颜色不再整套反复切换，先调整字体。本轮按当前路由核对为**25个界面入口：24个面向用户、1个开发诊断**，不是25套独立布局。AppStage共19项，扣除main壳后18项，加5个主Tab、隐私全屏Modal和开发诊断。注册/恢复验证码共用布局，配网/固件当前共用不可用页；同页浅深色、横屏、加载/空态/错误与弹窗不重复计页。正式manifest仍20项，未据此新增验收通过数。

新增 `docs/design/DOSO_PAGE_POLISH_CHECKLIST.md` 全部入口清单与审阅顺序；新增 `artifacts/ui-refresh/20261019-layout-index-type-v12/index.html`，用真实本地字库提供同内容、同字号/行高/配色的三组样张：现有MiSans字重、MiSans标题减轻、Noto Sans SC换字形备选。候选字库仅保存在预览目录，来自Google Fonts官方仓库，原字库与OFL许可保留，未加入App。页面自带字库加载成功/失败提示；不能拿生成图近似字形或系统回退字形当作真实对照。

入口数量、4个字体路径存在、候选SFNT文件头与文件哈希的本地只读检查exit0。浏览器工具因file协议安全策略拒绝打开预览，已停止该路径，无改协议/换浏览器/起服务等绕过；**尚无本轮浏览器实拍或字体成功加载证据**，交付的是可由森哥打开审阅的本地样张和清单。完整源码/样张身份与边界见本轮 `VERIFICATION.md`。本轮未改App源码、FontProvider、package、品牌、导航或原配色，无构建安装、云端或机器人操作。

**清单和样张制作完成；字体选择、首页设计定稿/实施与原生验证未完成。** 下一步由森哥比较字体后，从首页H01开始逐项确认，继而任务H03；已定页不因后续页面任意重画。正式设计0/20、发布NO-GO保持不变，不把本轮样张计成Android或全App通过。

## 2026-10-19 设计稿 v11：从大卡片展示改为手机信息分区，未实施

森哥反馈 v10 内容偏少、不像手机界面。本轮结合移动端图像/现有项目重设计技能、只读设计审查和 Android 官方内容组织参考，重新生成两张独立竖屏图：首页缩短设备卡、主次控制/召回、分组状态和任务概览；任务页区分今日未同步状态、三个通用模板与执行前待确认条件，查看流程为主操作、开始仍禁用。白／石墨／柔蓝、品牌、五项纯图标导航和前两轮删减/日期选中细节保留。

图稿及 v10 对照：`artifacts/ui-refresh/20261019-native-mobile-v11/index.html`，实际提示词和独立设计复核留档。初稿后只对首页做一次定点修正：移除顶端未接线的设备入口、收紧间距使任务概览正文完整露出导航之上；最终展示 home-design-refined.png + tasks-design.png，原稿保留。合计2张初稿+1次编辑，共3次图像调用，无 App 源码/包配置改动、构建安装、云端或机器人操作；新增状态摘要是拟议展示，未接数据接口。图稿不证明精确触控尺寸、原生滚动可达/底部避让；字体/色值/图标等仍有生成近似。不是 Web/Android/正式设计验收，正式0/20、发布NO-GO不变。下一步先审新信息层级，再实施并检验窄屏、字体放大、滚动和安全门，不能把新增内容当作新增能力。

## 2026-10-19 设计图 v10：去除任务流程预览的重复机器人图

按森哥最新标注，从 v9 设计图中移除任务页流程预览右侧的小机器人插图，改为单列编号步骤，整理文字、行距与留白；保留限制说明和禁用开始。首页大机器人、快捷卡去小字、“周一＋31”一体选中、原配色、品牌与五项导航均沿用。新图与 v9 对照：`artifacts/ui-refresh/20261019-layout-proposal-v10/index.html`；原图不覆盖，编辑提示词留存。

本轮仅一次内置图像编辑，已目视核对局部目标和保留项。仍未改 App 源码、未构建安装或访问云端，不是像素精确的实现或正式设计验收；正式0/20和发布NO-GO不变。下一步按森哥审图反馈收敛，再实施真实 Home／Tasks，而非更换颜色。

## 2026-10-18 设计图 v9：快捷卡去小字，星期与日期合并选中

按森哥标注，仅对上一版设计图做两处调整：首页三张快捷卡去掉“查看路线／查看任务／状态与设置”，保留图标、主标题和箭头；任务页用同一柔蓝竖向圆角底包住“周一”与“31”。其他结构、配色、品牌、状态及导航沿用 v8，原图不覆盖。新图与前版对照在 `artifacts/ui-refresh/20261018-layout-proposal-v9/index.html`，编辑提示词一并保存。

已目视核对两处目标，仍仅为 AI 设计图，不是 App 实现或像素精确验收。本轮未改 App 源码、未构建安装或访问云端；不新增正式设计通过数。下一步等待森哥审阅 v9，再实施真实界面。

## 2026-10-18 森哥要求先审图：首页／任务页结构提案，尚未实施

本轮按最新人类指示暂停源码实施，沿用原白／石墨／柔蓝色值、DOSO 品牌与五项纯图标导航，先生成两页同画板设计图。首页拟把电量移到右上角、放大机器人展示、对齐三项指标及快捷卡；任务页拟将三列小卡改为全宽横向模板行、压缩只读摘要、加强步骤预览。离线／待同步／只读／禁用开始保留，不增加虚构遥测或能力。

`artifacts/ui-refresh/20261018-layout-proposal-v8/index.html` 展示已有 v4 原实拍和 AI 生成布局提案；`layout-proposal.png` 是设计稿，不是当前 App 截图，也不是修改后验收。图像中的字体、图标、机器人细节与色值有生成近似，实施仍须复用原资源和精确 token。本轮未改 App/源码/包配置、无构建安装、云端权限或机器人操作，正式设计0/20与发布NO-GO不变。下一步等待森哥对结构布局的反馈，再实施，而不是继续更换颜色。

## 2026-10-18 Auth 三函数权限矩阵完成本地子门禁，未部署云端

按发布主线补齐共享 Auth helper／gate／terminal registration 的有限权限验证。新增 `supabase/verification/local/auth_session_privileges.fixture.sql` 和 `auth_session_privileges.test.sql`，接入现有 `scripts/verify-auth-session-authority.mjs` 的 candidate 路径；**产品迁移、App、包配置和当前 UI 均未改**。候选前先在任务专属合成库设置宽默认 EXECUTE 并用探针证明 PUBLIC／anon／authenticated／service_role 自动授权存在，再加载原样候选，防止空白环境掩盖遗漏 REVOKE。

PostgreSQL **17.11** 同次实际执行 exit 0／**24,103ms**：三个函数共 **12 个 ACL 单元、9 次分角色直接调用**通过，6 个禁止调用严格匹配 42501/function permission denied，3 个允许调用验证有效 gate 或自有 registration。PUBLIC 以 ACL grantee 0 检查，不当作可登录角色；anon 的 private schema USAGE 仅在测试事务临时授予并回滚。完整 terminal／outbox／audit 有序 JSONB 前后相同。在同一 runner 执行中，candidate／foreign-session 所在 psql、avatar recovery psql 与新增 privileges psql 分别 exit 0，并非共用一次 psql。共 157 个监测文件执行前后 SHA256 稳定，14 个 runner 执行输入保持；任务库已停止，独立 `pg_ctl status` exit 3／exitObserved=true。**这是 ACL/调用单元，不是新增 12 或 9 个 pgTAP 测试。**

身份：新权限测试 SHA256 `40ec818dc8a436b8a6c07ba2809c17e5cfd17b775e140db03a74686a256a99f6`／7,321B；runner `f123f7ecfb4acdf3d4fb9f3c5748280a342f4f0299e73f09025a3f6fdaea79dc`／16,849B；原 Auth 候选仍 `c5ebdb05a342c45ebc458617549285f8af47d9d4bc763dc876d19ccbd987dc76`／6,860B，旧 foreign-session 测试原字节不变。仅 1 次 candidate、0 baseline 重跑；独立只读审查无阻断项，仅批准本地合成范围。验收条件、原始 transcript、退出状态、停止及源码绑定见 `artifacts/release-readiness/20261018-auth-privilege-matrix/`；历史证据未改。

完成判定：**三函数本地权限子门禁完成**。未完成：其他共享 helper 与 devices／audit／username／login methods／robot command 等跨域回归、完整 Supabase 升级/pgTAP/advisors、真实 JWT/Auth 与 Storage HTTP/对象、Android 安装认证弱网。合成 service_role 无 BYPASSRLS／继承成员关系，SET ROLE 不是 PostgREST/JWT role switching；事务回滚和行快照不证明 sequence/锁从未触及。生产变更仍须明确范围批准；本轮无云权限动作、真实账号/对象变更、邮件发送或机器人指令，无新 APK/安装/原生通过。旧 QA 包仍 77,340,265B／`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`，不包含近期修复。发布 **NO-GO**，正式设计 **0/20**；下一项继续共享 gate 的跨域安全审查，不重复改颜色或启动构建。

## 2026-10-18 森哥反馈：撤回暖色换肤，结构优化继续

森哥指出暖纸张／信号琥珀只改变了颜色，不是目标。本轮已撤回该实验对生产源码的颜色影响：`src/theme.ts`、`src/appearance.ts`、`src/components/BottomNav.tsx` 和 `src/components/UserAvatar.tsx` 恢复到白／石墨／柔蓝基线；Home／Tasks 的无描边、卡片布局、字号层级、真实状态和导航结构保留。暖色 Web 实拍与对比图作为历史实验留档，不重标为当前版本。

本轮实际验证：暖色撤回后相关 Home／Tasks／Auth／BottomNav／Map 回归 **67/67 pass**；主题方向合同 exit 0；TypeScript `noEmit` exit 0。没有新 APK、Android 安装、云端 SQL/RLS/权限变更或机器人指令。完成判定是“颜色回滚完成，结构优化未停止”；下一项优先做卡片内容／图标板／间距的结构优化，不再只换全局颜色。发布仍 NO-GO，正式设计 0/20。

## 2026-10-18 暖纸张／信号琥珀已完成首个真实源码切片

森哥要求在现有 DOSO 基础上开始调整。本轮将评审原型的推荐方向落到共享 token 和真实 Home／Tasks／BottomNav：浅色 `#FCFAF6` + `#F4F0E9`，深色 `#1C1916` + `#29251F`，主操作／选中态 `#F2B86B`，配对深字 `#3A2A18`；`#98D1FF` 保留为品牌辅助色与 Logo tint。未复制概念图外部 Logo、工业照片或虚构遥测／任务数据，真实机器人图、待同步状态和执行安全门保持不变。

实际改动：`src/theme.ts`、`src/appearance.ts`、`src/components/BottomNav.tsx`、`src/components/UserAvatar.tsx` 及对应外观合同；测试期望更新为暖色语义。真实实拍位于 `artifacts/ui-refresh/20261018-warm-paper-v7/`，Home／Tasks 各浅色、深色、横屏 3 张，尺寸 390×844／844×390。源码／host 回归 **67/67 pass**；主题方向合同 exit 0；TypeScript `noEmit` exit 0。

完成判定：**暖色首个真实 Web 源码切片完成**，可供森哥审阅。未完成：Android 安装／升级、真机认证与弱网、iOS、生产 SQL/RLS/权限、邮件 Logo 云对象一致性、正式设计 20 页验收；本轮无新 APK、无原生安装、无云端写入、无真实账户或机器人指令。发布仍 NO-GO，正式设计仍 0/20。下一步先根据实拍反馈微调暖色明度／文字层级，再按同一 token 扩展到 Map／Profile／Device，其间不重复启动全量构建或模拟器。

## 2026-10-18 蓝灰反馈：暖纸张／信号琥珀方案进入评审，尚未替换生产主题

森哥反馈当前蓝灰卡面偏冷。本轮使用 redesign-existing-projects、expo-design-system、ui-ux-pro-max 的现有项目审查原则，先做了局部评审原型 `artifacts/ui-refresh/20261018-palette-options-v1/index.html`，并没有直接修改生产 `src/theme.ts`／`src/appearance.ts`：

- 推荐 A「暖纸张 + 信号琥珀」：`#FCFAF6` 画布、`#F4F0E9` 卡面、`#F2B86B` 单一 CTA／选中态、`#202A32` 主字；
- B「雾松石 + 石墨」和 C「薰衣草仪器板」作为备选；
- 所有方案都保留白底／单一强调色／无描边、DOSO 机器人素材、五项导航、真实状态与不可执行安全门。

这是视觉方向评审，不是生产换肤、Android 安装或正式设计验收。待森哥选定方向后，再在真实 Home／Tasks 上做最小 token 迁移并重跑深浅色、窄屏、字阶和交互回归；当前发布仍 NO-GO、正式设计 0/20，无新 APK、无云端 SQL/RLS/权限变更。

## 2026-10-18 新参考迁移：分析页层级已收敛，整体发布门仍保持 NO-GO

森哥补充了两组可模仿的移动端界面参考。本轮按“主视觉卡＋信息指标＋趋势／任务层级＋原生图标家族”迁移结构，不复制外部品牌、插画、照片、虚构任务或演示数据，也没有重新引入多种整块底色。Home、Tasks、Auth、Device、Map、Profile 等既有 v5 改动继续保留 DOSO 品牌与五项导航；本轮最小源码修订集中在 `src/screens/AnalysisScreen.tsx`：预览卡、日期、指标和摘要统一使用 `getProductAppearance()` 的中性 `surface` 与 `#98D1FF` 强调，移除残留绿色装饰面，生产空态继续以“尚未同步可信遥测”阻止假历史。

本轮真实证据：`node --test scripts/analysis-appearance.test.mjs` **5/5 pass**；`node --test scripts/unified-pages-appearance.test.mjs scripts/home-appearance.test.mjs scripts/task-screen-interaction.test.mjs` **22/22 pass**；路线页回归 `node --test scripts/map-screen-interaction.test.mjs scripts/map-graph.test.mjs` **15/15 pass**；`node node_modules/typescript/bin/tsc --noEmit` **exit 0**。这些是源码／Web host 层证据，不是 Android 安装、真机认证、完整云端或 iOS 验收；本轮没有新 APK、原生安装、生产数据库／RLS／权限变更或真实机器人指令。现有 v5 多页截图在分析页修订前生成，因此不将旧 `main-analysis` 图冒充本轮最终像素证据；正式设计仍 0/20，发布继续 NO-GO。下一步在不重复启动全量构建的前提下，按同一规则复核其余页面的卡片层级和深色／窄屏表现，再安排必要的局部截图更新。

## 2026-10-18 最新用户反馈：两页底色收敛 v4 已落地，实际 Web 前后对比完成

森哥指出上一版底色种类过多，要求找参考后更改。本轮沿用 redesign-existing-projects、expo-design-system、ui-ux-pro-max，查 Linear 官方改版记录的降噪／基础色与强调色方法及 Primer 语义颜色角色。只改 Home、Tasks、appearance 三源码，保留 v3 字号／字重、MiSans、无描边、品牌导航和全部业务门。首页去掉设备图片区浅蓝内底与离线状态胶囊底；任务选择去灰绿、与操作共用 #98D1FF／#17354D，日期去外层蓝底；阻断说明、查看流程、锁定开始及展开步骤改为透明内层。摘要／详情／未选模板统一同一 surface（浅F4F7FA、深24272D），quiet仅为同值别名。常态内容形成画布＋一种卡片底＋同一强调色，不宣称全App／全部像素仅三色。锁、radio、蓝字／chevron、完整阻断原因及disabled＋handler guard保留。

最终 **65/65 = 58界面／字体／交互＋7任务策略（含新增3，不是65条新增）**，真实exit0，无skip/cancel/todo/timeout。首轮新测试查找对无props的copy节点抛TypeError，57/58；只将新查找改可选链，精确首轮测试源码与失败日志保留，未改产品或放宽断言。任务源码合同及TypeScript noEmit在同一303产品输入下真实exit0（本轮各1次），最终UI／policy重跑各1次，303产品输入哈希完全相同，不把旧版结果冒充新跑。

当前源码Web实拍Home／Tasks各浅色390×844、深色390×844、横屏844×390，共6张，起止303输入稳定；左图在全量v3源码身份核对后复用上一版原字节，合成左v3右v4无损对比6张。独立源码与逐图复核APPROVE_SCOPE_ONLY、0阻断，不代表森哥最终视觉认可。保留首份截图审阅及展示采样疑点／复读更正记录；以原PNG哈希及最终审查为准，不覆盖历史。任务拥有的唯一Metro已停止，无重复构建或模拟器。303App输入仅3目标改变、300保持，20项保护源文件及145既有tracked状态不变。

**本轮两页底色实现／Web对比完成；Android／全App／发布未完成，NO-GO、正式设计0/20不变。** 本轮无新APK、云SQL／RLS／权限／认证或对象写入、真实账户登录与机器人命令。旧QA仍77,340,265B／SHA256 `f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`，不含本轮UI。先交森哥看底色收敛前后；品牌母版、资料头像后端批准及真实接通、邮件Logo真实对象模板、注销隐私、当前源码Android真实认证弱网与iOS条件继续开放。证据：`artifacts/ui-refresh/20261018-single-surface-v4/index.html`、integration.json、checks-final.json、REVIEW.md、before/after原图；既有证据不可变。此节覆盖下方v3灰绿及额外quiet底色方向，保留v3字阶。

## 2026-10-18 字号／字重与互补配色细化已落地，Web 对比待森哥确认

森哥要求继续优化对比右侧新版的字体大小、字重和小字，随后明确颜色不限于蓝色、要求调用 Skills 并查看网上准则。本轮使用 redesign-existing-projects、expo-design-system、ui-ux-pro-max，查 Material3 颜色/字阶角色与WCAG2.2对比/非颜色独占信息，改动限定为 Home、Tasks、appearance、typography 四个源码。沿用MiSans和无描边，20/28/600标题、15/22/500卡题、13/20说明、32/42/500电量数字；任务模板序号降到20/28、标题左对齐、两条卡片说明缩短，不截断隐藏。雾蓝主CTA/导航保留，任务选择改低饱和灰绿（浅DDEBE7/264B43、深314A46/D9ECE6），配radio而非成功勾；只读摘要/离线/阻断/禁用回中性灰。主字与辅助字改石墨/蓝灰，真实未知/离线、全部回调及召回/可信任务门不变。

首轮真实55项中54pass/1fail：新metric32/40不满足原有CJK行高1.3x合同。保留精确执行源码、失败日志和稳定首轮实拍，只修行高至42，不放宽旧断言；因CI不热重载，先停任务拥有的原Metro再启动唯一新实例，最终截图独立另存after/，原图after-first-attempt不覆盖。最终 **62/62 = 55界面/字阶/字体测试（含新增4）+7任务策略**，source guard与noEmit实际exit0、输入稳定、无skip/cancel/todo/timeout，不能与首轮或上轮75重复相加。source guard仅适配解析既有typography角色并将下限12加强到13；任务/导航断言保留。六组实际正常文字前景/背景双主题静态对比均≥4.5:1，不等同全App无障碍认证。

最终当前源码实拍两页浅色390×844、深色390×844、横屏844×390共6张，起止303App输入无漂移；左图在验证全部v2源码身份后原字节复用旧6图，合成左v2右v3无损对比6张。独立源码+逐图审查APPROVE_SCOPE_ONLY、blocker0；Header/Nav仅共享ink/secondary显示受影响，源码/结构不变，Header日期仍12caption，不宣称全App所有小字≥13。AppText/字体、Auth/Logo/导航/后端/包配置未改，303输入仅4目标改变、299原项保持，无新包或原生通过。旧QA仍f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e /77,340,265B，不含本轮UI；NO-GO、正式设计0/20不变。

**本轮细化实现与Web对比完成，视觉最终认可、当前源码Android及整体发布未完成。** 先交森哥看新对比；后端Auth权限矩阵被人类UI要求接管时仍只读、未执行SQL，生产批准/资料头像真实接通、云邮件Logo对象/模板、注销隐私、真实认证弱网/iOS前置保持开放。本轮无SQL/真实账号/云对象或运动操作。审计入口：`artifacts/ui-refresh/20261018-type-color-v3/integration.json`、checks-final.json、REVIEW.md；对比 `index.html` 与原始before/after图，历史证据不可变。

## 2026-10-18 用户反馈修订：无描边浅蓝卡片已落地，透明 Auth Logo 候选已接线

森哥要求去掉深线框、强调蓝采用 `#98D1FF`、优化布局大小和内容，并明确功能图标与 DOSO Logo “两者都调整”。本轮按最新要求继续上一版首页/任务卡，不启动后端、构建或模拟器。已移除首页/任务卡及共享导航/头像的装饰描边和首页功能图标白色托底，功能图标改用既有 Ionicons；共享卡片圆角24、内距16、gap12，首页hero/快捷卡与任务摘要压缩重复层级。浅蓝 CTA/选中卡配 `#17354D` 深字，静态对比7.80:1；独立审查发现的深色选中徽章低对比已最小修复并补合同。原导航、日期/模板选择/展开、未知/离线/待同步及召回/可信任务执行门保留。

新增两份透明 DOSO 品牌候选，横版仅接本地登录/注册头部、深色用sky tint，独立D标未接launcher。旧资产、app.json/原生图标、认证逻辑/原CTA配色和云邮件对象/模板均未改。图像生成工具原图原alpha保留；候选带轻微明暗和广泛partial alpha，**不符合精确扁平色品牌母版门槛**，不能称正式品牌定稿或production app icon。生成prompt、原始路径、拷贝SHA和alpha事实见 `artifacts/brand/20261018-doso-sky-v2/generation.json`。

本轮实际 **75/75 = 68界面/交互host测试（含新增5条v2视觉合同，范围比上轮扩大至Auth）+7任务策略**，不是75条新增；任务/注册源码合同与TypeScript noEmit均exit0，输入稳定，无skip/cancel/todo/timeout。当前源码Web实拍首页/任务/登录各浅色390×844、深色390×844、横屏844×390共9张，起止303项App输入一致；前图只在全量匹配上轮源码后原字节复用上轮6张，不冒称新拍。生成左旧右新无损对比6张，负责人实际读图；源码及Auth接线独立审查均仅APPROVE_SCOPE_ONLY，blocker0，不代表视觉最终认可。短视口继续允许滚动，认证表单焦点/错误线保留，本轮不是全App“零边框”。

**两页UI修订和本地Auth品牌候选接线完成；Logo最终定稿、原生验收及整体发布仍未完成，NO-GO、正式设计0/20不变。** 旧QA仍 `releases/20261016/DOSO-0.0.1-qa-f3135f77.apk` /77,340,265B /SHA256 `f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`，不含本轮改动，无新APK/安装/原生或云端通过。下一步先请森哥看本轮实际对比，确认后再做同源码Android验证与品牌母版收敛；资料头像后端批准、邮件Logo真实对象云模板、注销隐私、真实认证弱网和iOS条件门禁继续保留。证据与可打开对比：`artifacts/ui-refresh/20261018-borderless-sky-v2/index.html`、integration.json、checks.json、before/after原图及capture-after-run.json；历史证据不覆盖。

## 2026-10-17 用户授权 UI 落地：首页设备卡与任务页卡片参考迁移完成

森哥明确要求参考所发两张图实际修改首页设备卡和任务卡片、保留品牌导航并看前后对比。本轮暂停后端权限矩阵在只读阶段，不执行数据库。先冻结当前3个目标源码和301项App输入，保留既有226证据绑定，再用同一离线只读QA fixture实际拍摄修改前两页浅色/深色/横屏共6张；修改后相同helper、尺寸及fixture再拍6张，原图和哈希保留，左before右after无损合图6张，不是生成式效果图。

产品只改 `HomeScreen.tsx`、`TasksScreen.tsx` 和既有 `appearance.ts` 的追加共享卡片几何token。首页采用设备身份/连接状态胶囊、柔蓝电量主视觉、三块遥测摘要；未知电量仍为破折号，仅有限0–100值才展示真实电量条（0不当成未知）。任务页采用大号当前模板序号、明确选中卡、说明/执行状态分区和只读步骤时间线，序号不是完成率。保留DOSO白/石墨/柔蓝、头像/图片、日期、全部导航回调、召回和可信任务门。源码复核补齐按实际onLayout内容宽度堆叠、已连接但召回不可用的中性文案、350宽临界图标布局及大字步骤行高；没有增加假数据/图表/任务或执行能力。

最终 **37/37 = 30卡片/导航/交互host测试（含新增5）+7可信任务策略测试**，实际exit0；任务源码合同检查exit0，TypeScript noEmit exit0/32,186ms，运行输入稳定，无skip/cancel/todo/timeout。首轮通过日志及修正前精确源码另存，不重复加通过数。负责人另在真实Web页面点击设备安全模板并展开说明，AX确认3/3、只读流程01–03及开始仍禁用，未点击开始或发送运动指令。host测试不是Yoga/原生布局；实际截图是开发Web三态，不是Android验收。源码与独立审查、范围保护及截图清单见本轮integration.json，原App/Header/Nav/theme/task policy/package/lock和旧tests不改。

**这两处UI实现和Web前后对比已交付；整体发布仍NO-GO、正式设计0/20。** 旧QA包仍 `f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e` /77,340,265B，不包含本轮UI，无新APK/安装或原生通过。深浅色/横屏已视觉复核，短视口仍使用原ScrollView，需要滚动查看下方操作，不声称所有内容一屏展示。资料头像真实接通、共享Auth权限矩阵/部署批准、Logo云对象模板、注销隐私和真实认证弱网/iOS条件仍开放。证据与可打开对比：`artifacts/ui-refresh/20261017-home-tasks-reference-v1/index.html`、integration.json、checks-final、before/after capture记录及原始PNG；不覆盖历史。下一步先由森哥看本轮视觉结果，再继续已保留的后端/原生门禁，不扩大改版。

## 2026-10-17 本轮：终端登记的 foreign-owner Auth 会话负例已通过隔离 SQL 验证

本轮只补一个共享 Auth 安全门缺失的组合负例：以合成用户A的 claims，携带已存在但属于用户B、且没有终端冲突的 Auth session 调用 `public.register_account_terminal`。在真实本地 PostgreSQL 17.11、synthetic schemas/claims 中，要求精确返回 **42501 / auth_session_inactive**；角色与 claims、会话归属和邮件功能前置均有断言。由 fixture owner 在调用前后比较终端、邮件 outbox、审计三表完整有序 JSONB 行，验证持久行内容不变，不只比较计数，不声明 sequence/lock 从未受影响。

第一次实际 candidate runner 总体 **exit1**：新增负例所在 psql exit0 并到达新旧 marker，但新增数据误用了后续头像恢复 fixture 的 session6，后者在第21行 duplicate sessions_pkey、exit3。首轮 SQL/执行日志/快照和独立停止证明完整保留，不算产品缺陷或组合通过。只将新增块内5处编号改为未占用的 session106并澄清注释，未改原断言、恢复 fixture、runner、业务代码或迁移。第二次变更输入后实际运行 **exit0 / 36,928ms**，candidate 和原头像恢复均 exit0；新旧 candidate marker 在同一个成功退出的 psql 中各一次、顺序正确，12个执行输入复制哈希及起止一致，全部命令成功。两次 owned 集群均由 runner 停止，并分别独立 `pg_ctl status` 得到实际 exit3。本轮实际 candidate 执行2次、baseline重跑0次，新增组合场景1，不报 pgTAP 项数。

当前测试 **13,993B / SHA256 04452f7bfd7a3a4e2ee87e30d8d0cdac60e31a96a3b360e09031f2f3fede7516**；Auth迁移仍 **c5ebdb05a342c45ebc458617549285f8af47d9d4bc763dc876d19ccbd987dc76**。App、package/lock、原测试与既有构建不因本项改变；旧QA仍 **f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e / 77,340,265B**，不含近期App修复，无新构建/安装。范围复核与独立审查以本轮 integration.json/review.json 为准，不把旧15/257等通过数重复相加。

**这一条本地 SQL 负例完成；共享Auth部署、真实资料头像接通及发布仍未完成，NO-GO、正式设计0/20不变。** 这不是JWT签名/真实Auth、Storage HTTP/对象字节、完整Supabase升级/pgTAP/advisors或安卓弱网通过。下一项优先完成共享 helper/session gate/registration 的 public/anon/authenticated/service_role 完整权限矩阵与跨域拒绝检查；生产变更仍须明确涵盖共享影响的批准。Logo真实对象/云模板、注销/正式隐私、当前源码QA与真实Android认证/iOS条件继续保留，不重复未变化换网或环境请求。无云端SQL/RLS/权限/Edge部署、真实账户凭据邮件对象操作、机器人运动或付费商店动作。证据：`artifacts/release-readiness/20261017-register-foreign-session/integration.json`、REPAIR、first-failure-assessment、verification-repaired及两份原始PG transcript；历史证据不可变。

## 2026-10-17 本轮收口：资料安全回归已接入总发布门，共享Auth部署边界明确保留

继续上轮被UI参考讨论打断的同一事项，不启动新构建/模拟器/数据库，也未迁移视觉。先复核AGENTS、现有状态、原验收和既有执行源码。上轮发现总门仅调用profile UI、未调用已有`test:profile-editing`；按三次TDD竖切保留真实RED→GREEN：profile 1/0/1→1/1，upgrade 2/1/1→2/2，自身合同3/2/1→3/3。总门仅新增`test:release-gate-core`、`test:profile-editing`、`test:profile-upgrade-preflight`三stage；package仅新增core/preflight两个入口，旧顺序/逻辑/文案不变，full gate仍要求`test:db`，design-audit仍只显式推迟该DB项、不跳过新本地项。

已有最终联合执行**15/15（新13受控CLI合同+不改的2实际preflight-only子进程测试），actualexit0/9,196ms**，原静态production-baseline exit0/4,695ms，无skip/cancel/todo/timeout且列出的执行输入稳定。独立冻结SHA审查APPROVE_SCOPE_ONLY、blocker0/CLEAR。**本轮仅复核与收口，新增测试/noEmit运行均0次，不重复记通过数**；文档更新后的静态基线复验见`closure-baseline-final.json`，runner绑定修正前的首份结果另存，2次静态检查均不计测试项。没有全release-gate实跑或DB/pgTAP通过。新13仅模拟child-process边界；既有2项实际复制暂存文件且databaseStarted=false，不是“无任何真实子进程”。scope核对exit0：30protected/10SDK/145既有tracked保持，301App输入仅package变、300保持；产品/旧tests/SQL候选/lock不变，所有原RED及精确快照保留。

gate SHA**41023532907e941f61bf63e5c4ad956530fe8073480e965451ca0c9eb088e8aa**/2,938B；newtest**8fb98b8a940d66fa38857093e37e3e8f7c3e650b880a9c57309065565e59e807**/6,196B；service仍246d0182…/21,802B。旧QA仍**f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**/77,340,265B，不含近期修复，无新包/安装/原生云端通过。

后端独立源码审查未确认SQL越权缺陷，但明确**COMMENT_DEPLOYMENT_SCOPE_BLOCK**：Auth候选替换共享会话门和终端登记，影响设备、终端/审计、用户名/登录方式、机器人命令、头像及outbox；不是profile-only部署。不能用“资料头像接通”的窄范围批准代替跨域变更批准，也不为缩范围拆掉安全门。各域有效/删除session拒绝、public registration已有foreign-owner session的42501和三表零副作用、完整权限矩阵、真实Supabase升级/pgTAP/advisors/Storage/JWT/回退仍待。下一项由负责人先补foreign-owner registration本地SQL负例，沿用既有隔离runner，不启动Docker或改主机，不接触真实账户。

**本地发布门接线修复完成，后端上线与发布未完成；NO-GO、正式设计0/20不变。** Logo真实对象云模板、注销/正式隐私、当前源码QA/Android真实认证弱网及iOS条件保留。无生产SQL/RLS/trigger/权限或Edge部署，无真实账户密码OTP邮件对象，无环境网络Logo重复探测/机器人/付费商店动作；历史云观测未重标为本轮。证据：`artifacts/release-readiness/20261017-profile-release-gate/integration.json`、scope/review/backend-scope-review/NOTES及原始RED/GREEN/最终日志；历史不可变。

## 2026-10-17 本轮：新头像保存完整 public SDK 成功链通过本地受控验收

先保存验收并复核139旧绑定、301App输入、旧QA与145tracked状态。新增正常 `profile-save-workflow.test.mjs`，不改产品、旧测试或依赖；package只追加测试入口。实际installed public SDK + production save/journal/coordinator，native存储/UUID/clock/HTTP合成，非真实云对象/RLS。对象与operation使用不同UUID，上传真实Id/Key回包、RPC顶层Profile合同；替换/首次头像/移除/仅文字四路径和cleanup403恢复、无法验证回包、已发RPC超时后迟到commit恢复共7项，严格请求/日志顺序、只清旧对象、无表单/上传/RPC重放。初始7/7源码精确快照保留，其后仅修正select/readback命名与keep诊断，不混用SHA。

**最终11文件257/257（含新增7，不重复相加），actualexit0/86,066ms**，无fail/skip/cancel/todo/timeout，执行绑定稳定。独立当前SHA审查APPROVE_SCOPE_ONLY、blocker0/CLEAR。scope exit0：21protected/10SDK/145tracked保持，301App输入仅package变、其余300一致。产品TS未改，**本轮noEmit0次**，不挪用旧结果。service仍**246d01820357a2d170566b60138efeda141c31a8c5d20232b093b3408024ee42**/21,802B；newtest**5388242549b0a0f261d207e13995cd5702eb1dcd66e66db8ad5f1a0e58edefe6**/17,540B；旧QA仍**f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**/77,340,265B，不含近期修复，无新包/安装或原生云端通过。

**仅本地initialized SDK新保存链完成；真实资料头像接通/发布未完成，NO-GO、正式设计0/20不变。** 全constructor/INITIAL、mounted Provider联合、跨runtime、live后端/Storage/RLS、Logo真实对象云模板、注销/正式隐私、当前源码QA/Android认证弱网仍开放。已发HTTP不自称取消/回滚，request bearer不代表服务器授权/原子退出撤销。本轮无云SQL/RLS/权限部署、真实账户凭据/邮件/对象、环境网络Logo重复探测、构建模拟器或机器人/付费商店动作。下一项回到资料/头像后端待部署范围与既有安全审查/批准清单的精确核对，无清楚批准不执行生产变更；未变人工前置不重问换网、不重跑本切片。证据：`artifacts/release-readiness/20261017-profile-save-workflow/integration.json`、NOTES/review/scope和最终原始日志，历史不可变。

## 2026-10-17 本轮：头像清理三入口认证边界已修复，超时后不再迟发 DELETE

继续上轮4个实际SDK RED，开轮复核前122条绑定、全部301App输入、旧QA和145既有tracked修改，先保存验收/快照；恢复后重新核对工作区，未启动重复构建/模拟器/环境网络探测。按TDD竖切：正常新test retire busy RED1/0/1→GREEN1/1；late DELETE RED1/0/1→删除入口GREEN2/2（caller超时后actualSDK仍owned，迟到DELETE从1降0）；readback busy RED1/0/1→GREEN3/3。busy DELETE补入正常控制，上轮四个缺口均在当前测试关闭，历史诊断不改。

产品仅private request helper增加**absoluteDeadlineMs（默认原20s）**、替换cleanup retire/DELETE/readback三个请求声明并删除cleanup已无消费者的local getter。准备/删除/重试共享原同一absolute3s，读回在前identity完成后取得原独立3s；retain实际getSession，Auth caller超时切断continuation、SDK未settle不释放owner，token后再锁外public Data/Storage+rawfetch/request-local headers。原identity fences、journal/proof/clear、错误/返回合同、5xx最多一次retry及循环预算结构不动；已发HTTP不假取消或回滚。

**最终10文件250/250，包含新增34项不重复相加，actualexit0/106,546ms；当前noEmit exit0/76,872ms，精确ASTscope exit0/5,265ms。** 全部执行输入稳定，无skip/cancel/todo/timeout。34项含完整publicSDK旧债务恢复、三入口迟写owned/Auth超时不迟发/网络不占Auth、1200ms+1800ms共3s、retire预算耗尽不发DELETE、503一次重验/二次DELETE只剩1500ms、remove耗2800ms后readback仍独立3s、late response/会话丢失不clear，以及foreign proof/空ack等；其他malformed proof仍由字节不改的旧71业务测试覆盖。独立当前冻结SHA审查**APPROVE_SCOPE_ONLY、blocker0/CLEAR**，不是整体发布批准。旧71business+8identity及23read/24write测试/facade全部字节不变，未放宽旧断言。

service SHA**246d01820357a2d170566b60138efeda141c31a8c5d20232b093b3408024ee42**、21,802B；newtest **98404e92…**、28,411B。package只追加正常测试入口，无依赖或lock变化；301App输入仅service/package2变，其余299一致，19protected/10SDK/145tracked保持。旧QA仍**f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265B，不含近期修复。无新包/安装/原生云端通过、真实账户密码OTP邮件对象、云SQL/RLS权限部署、依赖升级、环境网络Logo重复探测、机器人/付费商店动作。

**cleanup本地切片完成；资料头像真实云端接通/发布仍未完成，NO-GO、正式设计0/20。** 同runtime initialized publicSDK+合成持久化/HTTP不是live删除/RLS/Android/弱网验收；request bearer不是原子切号/退出撤销，standalone遥测归因header差异记录。完整constructor/INITIAL、跨runtime、mounted Provider与cleanup联合、新头像成功upload→RPC→cleanup完整新保存链仍开放。下一项先验证实际SDK新保存成功全链（区别于本轮已确认旧债务恢复），再按真实后端部署批准/Android前置变化推进；Logo真实对象模板、注销/正式隐私、current-source QA/Android真实认证弱网门禁保留，不重复既有不能切网请求。证据：`artifacts/release-readiness/20261017-profile-cleanup-transport/integration.json`、NOTES/review/scope及三次原始RED/GREEN、最终回归/类型检查日志；历史不可变。

## 2026-10-17 本轮：头像清理隐式认证与超时后迟到 DELETE 已复现，修复未实施

本轮完成诊断子步骤，产品源码/正常tests/package/lock/App/Provider零改动。开轮核对前150条绑定、全部301App输入、旧QA及145既有tracked状态，先保存验收/快照。production save恢复经public journal API建立的committed removal debt，实际installed public SDK2.112.3，仅native存储/UUID/时钟/HTTP受控。初始retire有效RED1/0/1 actualexit1；最终当前夹具**12项=8控制符合预期+4安全断言失败，actualexit1/13,576ms**，稳定执行输入、无skip/cancel/todo/timeout，不能称12pass。独立只读**APPROVE_SCOPE_ONLY仅批准诊断证据，不是产品修复批准**。

retire RPC、Storage DELETE、post-cleanup readback三个入口均在显式getUser owner释放后，foreign仍busy时implicit refresh1/会话写1/目标HTTP1，committed日志保留不清。另一个实际SDK迟写用例更直接：DELETE内部Auth storage set暂停→原3s caller超时返回pending、应用owner不busy→仅释放真实set，等待public TOKEN_REFRESHED后实际出现**late synthetic DELETE1/readback0**；日志仍committed，没有真实云对象删除。这不是生产误删/自然竞态频率或原网络登录故障根因证据。8控制中3个fresh完整恢复是同一条件重复，不夸大独立覆盖；foreign-fresh区分隐式读与过期刷新写。

预算证据保留：removeAvatarBestEffort原共享3s覆盖identity/retire/identity/DELETE及允许的一次returned5xx retry，retire耗3001ms后DELETE0；finish后identity/readback各有原独立3s，remove耗2800ms不消耗readback新3s，迟到读回不能清日志。**不能盲套固定20s helper，也不能仅外包timeout继续让SDK迟到派发。** 下一项用这4个RED接最小修复：只retain/协调actual getSession，并在既有absolute3s预算内切断超时continuation，取得本次token后再锁外构造Data/Storage；原journal/fences/proof/错误与重试规则不改。

service仍**7be750adadc93c4ba6515a0abe1310307b19bb7f891682dca4ed0ad073ddf9eb**、21,399B；artifact fixture **c8389a7f…**、19,919B，非交付App。全部301App输入及正常tests起止不变，17protected/10SDK/145tracked保护，前150绑定除两份状态文档外最终保持。旧QA仍**f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265B，不含近期修复。未重跑/挪用上轮216/noEmit为新通过；无新包/安装/模拟器/原生云端通过、真实账户凭据邮件对象、云SQL/RLS权限部署、依赖升级、环境网络Logo重复探测或机器人/付费商店动作。

**诊断完成，清理产品修复/资料头像云端接通仍未完成；NO-GO、正式设计0/20。** 完整constructor/INITIAL、跨runtime、真实RLS/Android/普通网络与upload成功全链不据此关闭。完整后端/Storage部署批准、Logo对象真实云模板、注销/正式隐私及current-source QA真实安卓门禁保留，不重复未变化人工请求。证据：`artifacts/release-readiness/20261017-profile-cleanup-auth-boundary/integration.json`、NOTES/review与初始RED、11项历史/最终12项矩阵、late-delete原始日志；历史不可变。

## 2026-10-17 本轮：资料 RPC 与头像上传的认证边界本地修复完成

开轮核对前轮131条绑定、全部301项App输入、旧QA及145项既有tracked改动，先保存验收和快照。生产save/journal/coordinator与installed public SDK2.112.3，合成会话/存储/HTTP先得两项独立有效RED：RPC、upload各**1/0/1 actualexit1**，foreign owner仍active时均refresh1/会话写1/POST1；各做最小接线后admission2/2。原private read helper仅中性改名，复用其retain+session-read+单次20s共享deadline；实际SDK未settle前不释放owner，Auth caller超时不迟到发写，网络锁外。请求参数/原错误与结果校验、identity fences、journal及3s清理逻辑不改；上传路径改为同一次UUID的immutable const，避免callback捕获可空值。

**最终9文件216/216，包含新24项不重复相加，actualexit0/66,792ms；当前noEmit exit0/41,865ms，精确ASTscope exit0/2,164ms。** 输入稳定、无skip/cancel/todo/timeout，独立只读**APPROVE_SCOPE_ONLY、blocker0**。覆盖真实refresh迟写owned、Auth超时latePOST0、7s+13s共享原20s、HTTP pending可另读真实Auth、缺/换session/原存储错误、503POST不重放；更换和移除头像arm后Busy/timeout均保留uncertain、不删除日志。先前类型检查TS2345 exit2与修正后旧静态anchor失配215/216 exit1均保留，不冒充最终通过；70旧business+8identity正文不变，唯一静态guard同步新常量并加强upload/RPC存在性，原身份顺序/migration授权断言保留，外部facade只补RPC。

service SHA **7be750adadc93c4ba6515a0abe1310307b19bb7f891682dca4ed0ad073ddf9eb**、21,399B；newtest **36ba9c84…**、24,314B。301App输入仅service/package两项改变，其余299相同；16protected、10SDK、145tracked状态与lock/App/Provider/read套件保持。旧QA仍**f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265B，不含近期修复。无新包/安装/模拟器、原生/云端通过、真实账户密码OTP邮件对象、云SQL/RLS权限部署、依赖升级或环境网络Logo重复探测、机器人/付费商店动作。

**仅两个20s写入口本地完成，资料头像真实云端接通/发布未完成；NO-GO、正式设计0/20。** 新publicSDK upload控制停在受控403，非完整成功上传→RPC→cleanup真实SDK全链；已发HTTP不取消/撤销/自动回滚，session关联不替代服务器授权。完整constructor/INITIAL、跨runtime、mounted Provider/真实RLS/native/普通网络仍开放；standalone遥测归因header非阻断差异记录。下一项先受控复现3s cleanup retire/delete/readback的隐式Auth，保护原共享3s预算和journal，不能盲套20shelper。完整后端/Storage部署批准、Logo对象与真实云模板、注销/正式隐私及current-source QA/Android真实认证弱网门禁保留，不重复未变化人工请求。证据：`artifacts/release-readiness/20261017-profile-write-transport/integration.json`、NOTES/review/scope-complete与所有原始RED/GREEN/失败/最终日志；历史不可变。

## 2026-10-17 本轮：资料首读与头像签名 URL 的认证边界修复已接产品

继续上一轮两项真实SDK RED，开轮核对108条绑定、全部301项App输入、旧QA及145项既有tracked改动，先保存验收和快照。正常publicSDK测试先重现**admission2/0/2 actualexit1**：foreign owner仍active时两入口refresh1/write1/请求1；修复后2/2。产品仅profileEditing的private read helper/imports与首次profiles SELECT、resolveProfileAvatarUrl两处请求声明：session-read lease内retain并限时等实际getSession，缺会话/换号/Busy提前拒绝；Auth caller超时直接终止continuation但SDK未结仍保守持lease，不能迟到建Data。取得本次token后释放owner、检查剩余预算，再创建公共PostgREST/Storage+raw fetch/request-local headers，网络锁外。每个read原20s由Auth+network共享，不是whole-save时限；已发网络不假取消。

最终专项**23/23包含在8文件关联192/192内**，actualexit0/101,849ms；noEmit实际exit0/81,839ms，AST精确scope exit0/4,762ms。最终输入稳定、无skip/todo/cancel/timeout；覆盖真实SDK迟写retain、超时后lateData0、7s+13s共享预算、Data pending时另一真实Auth可读、busy不排队、missing/different session、GET503固定原bearer重试且新增Auth读0、Storage POST错误/不重试。独立只读**APPROVE_SCOPE_ONLY**，非阻断遥测归因header差异记录。首轮legacy79中1项Provider在产品调用前oldKey=null，孤立控制通过，补公开initial setup后最终192通过；不算产品RED。旧71+8项测试正文不改，仅外部SDK/mock/getSession转发与publicINITIAL setup适配；不拿legacy Data stub冒充真实SDK证据。

service SHA **e6604e40590c29106389faaab7fb75bc419052f3360e8bc303d9f4100d6d6686**、21,091字节；test **7c31271e…**。Storage直接pin已安装2.112.3，lock仅根依赖metadata，package追加正常测试入口，无安装升级。301App输入仅service/package/lock3项变，其余298相同；14受保护来源、10SDK输入和145tracked状态保留。原identity/journal/RPC/upload/delete/cleanup及3s清理deadline、App/Provider不改。旧QA仍**f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265字节，不含近期修复；无新构建安装/原生/云端通过、真实账户密码验证码邮件对象、项目云查询/SQL/RLS权限部署、环境网络Logo重复探测、机器人/付费商店动作。

**两个read入口本地修复完成；资料头像云端接通/发布仍未完成，NO-GO、正式设计0/20。** 不覆盖完整constructor/INITIAL、其他RPC/upload/delete/cleanup、跨runtime、真实后端/RLS/React/native/普通弱网。下一项先复现剩余写入/清理的隐式Auth边界，保留journal与3s共享清理预算，不能把20s read helper直接套清理。完整后端/Storage部署批准、Logo真实对象云模板、注销/正式隐私及新QA Android门禁保留，既有不能换网络条件不重复请求。证据：`artifacts/release-readiness/20261017-profile-read-transport/integration.json`、NOTES、scope/review及原始RED/GREEN/最终日志；历史不改。

## 2026-10-17 本轮：资料查询与头像签名 URL 的隐式认证缺口已复现，修复未实施

本轮完成有证据的诊断子步，不改产品：开轮复核前120条绑定、全部301项App输入、旧QA及145项既有tracked修改。production save/journal/coordinator与installed public Supabase/Auth/PostgREST/Storage2.112.3，只控制native持久化/UUID及HTTP；显式getUser结束后public idle observer注入expired合成session和foreign lease。第一项SELECT有效RED1/0/1 actualexit1。最终矩阵**6项=4个健康/未过期控制符合预期+2个安全断言失败，actualexit1/12,803ms**，无skip/cancel/todo/timeout、执行输入稳定，不能称6项通过。

真实profiles SELECT在foreign owner仍active时session读3/refresh1/write1/HTTP1，收到受控403而非AuthBusy；production头像签名URL同样refresh1/write1/signPOST1并返回URL。4控制将隐式读取与过期刷新写回区分，核对真实SDK过滤和签名URL合同。没有模拟内部业务/SDK方法或私有字段；public初始化/INITIAL/freshgetSession在观测前完成，不覆盖启动竞争。初始CJS绑定显式补充实际ESM+Auth实现身份，原日志不改。该干预不证明自然频率、另一个真实SDK并发写入、真实越权/RLS/网络根因或原生验收。

fixture SHA **20ccd4ea69014f12e54b63e41c452206e96bb818f175ba1bac06de7922141310**，12,942字节，非交付App。**所有301项App输入、src/App/package/lock与正常测试零变化**，未重跑/挪用上一轮115项或类型检查为本轮新通过。下一修复须在既有lease内retain并限时等待实际getSession，超时后不能迟到创建Data请求；原Data/Storage网络和cleanup仍在Auth锁外。不扩大为whole-save大锁、永久token cell或第二Auth/Realtime，不把device helper外套timeout当已验证方案；具体合同见DECISION。

独立只读APPROVE_SCOPE_ONLY仅批准诊断证据，未批准产品修复。矩阵的运行哈希稳定只覆盖相关源码/SDK/夹具；全部301输入及前序证据另做最终端点复核，不称全仓库执行期间不可变。**诊断完成，资料头像产品修复/云端接通未完成；发布NO-GO、正式设计0/20。** 旧QA仍f3135f77全SHA及77,340,265字节不变，不含近期修复；无新构建安装/原生/云端通过、真实账户密码验证码邮件对象、云SQL/RLS权限部署、环境/网络/Logo重复探测、机器人/付费商店动作。已有不能换网络及未批准环境/部署条件不重复请求；完整INITIAL、其余profile上传/删除/RPC、真实后端/Storage、Logo云模板与新QA安卓/普通弱网门禁保留。证据：`artifacts/release-readiness/20261017-profile-data-auth-boundary/integration.json`、NOTES、DECISION、review和原始RED/矩阵日志。

## 2026-10-17 本轮：设备设置迟到结果与旧回调隔离已接入 App

本轮完成一个本地发布安全切片：账户/会话/设备上下文已切换或根App已卸载时，旧设备设置请求不能覆盖当前设备、回滚当前界面或弹旧提示；旧A→B→A按钮回调也不能借用新A发请求。同会话JWT刷新不误退役合法保存，同上下文重复保存不排队。只改App设置callback、五处声明、context projection和root lifecycle effect，package仅追加正常测试入口；设备repository/Data/Auth/Provider、bootstrap、退出意图及绑定/解绑未改。

先取得真实提取App callback+production repository/query/coordinator+installed publicSDK的有效RED：HTTP1、迟到write1/toast1并覆盖B。独立审查又找出旧闭包A→B→A缺口，补RED实际HTTP1/writes2/notices1，再以render捕获context对象和entry引用守卫修复。最终专项15/15包含在8文件关联**115/115**内，实际exit0/102,713ms；当前noEmit实际exit0/75,699ms、设备护栏exit0/1,463ms，源码输入稳定、无skip/todo/cancel/timeout。早期host错误RED及修正前14/114日志保留，不当最终通过。受控Auth/React输入、storage/HTTP不是全React挂载、原生、live后端或网络验收；已发HTTP仍可能完成服务器写入，此修复不是取消、撤销、退出原子性或后端授权。

App SHA **054c4ae924c78328d6db37242b573eaf634ad9931823803ebd0ae979fba40d30**，88,006字节；test **f1d5dbba…**。开轮109条绑定/301项App输入已核对，14受保护来源、145项既有tracked修改及旧包保持，301输入仅App/package变动，其余299相同。旧QA仍**f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265字节，不含近期修复；无新构建安装、原生/云端通过、真实账号密码验证码邮件对象、云权限/SQL/RLS部署、环境/网络/Logo重复探测或机器人/付费商店动作。

**设备设置本地切片完成；发布NO-GO、正式设计0/20不变。** 完整constructor/INITIAL、资料头像真实后端/Storage、邮件Logo对象与云模板、注销/正式隐私及新QA真实Android/普通弱网仍开放；不能换网络的条件未变，不重复请求。下一项按已有前置实际变化推进，未变时先核查其余profile/Storage隐式Auth读取，不擅自扩权限。证据：`artifacts/release-readiness/20261017-device-settings-publication/integration.json`、NOTES、scope/review和最终原始日志；历史不可变。

## 2026-10-17 本轮：设备Data令牌读取修复已接入，网络等待不再占用Auth排他

继续上一轮实际SDK RED，开轮复核100条证据、全部300项App输入、旧QA及145项tracked修改，先保存验收和快照，不重复未变化环境/网络/Logo/构建/模拟器阻断。新正常测试以production repository/coordinator和真实public createClient/Auth/PostgREST、合成storage/HTTP先取得**有效admission RED 1/0/1 exit1**：explicit identity结束即被foreign owner占有，旧list仍fulfilled、getter2/refresh1/write1/DataHTTP1。不是普通网络登录失败根因或真实账户越权证明。

**新增小模块deviceDataQuery并接入list/settings**：在查询创建前，session-read owner内等待原共享getSession真正settle，原Auth error直接抛、无会话或身份变化提前拒绝；拿到此次请求凭据后释放owner，再构造公开PostgrestClient，固定request-local bearer/apikey/public schema/raw fetch并等待原query，Data error原样抛。无第二Auth/Realtime构造、永久token cell、私有SDK或全Data网络锁；AuthBusy在builder存在前拒绝，不会进SDK排队/重放。保留默认GET网络重试，重试只用本次凭据、不再次读Auth；PATCH仍不自动重试。原explicit helper、owner/is_demo/order、settings id/owner/payload/single、claim/unbind、App/Provider/client/coordinator及能力开关不变。

**最终六文件关联85/85（含新11项和旧12项device专项，不重复相加）**、TypeScript noEmit实际exit0/37,004ms、设备源码护栏exit0；最终执行输入稳定，无timeout/skip/todo/cancel。覆盖busy前置拒绝、真实延迟refresh写回仍owned、DataHTTP pending时另一真实Auth读可完成、缺会话/切号/原错误对象、真实SDK过滤/headers/payload/返回及503重试新增Auth读0。独立只读**APPROVE_SCOPE_ONLY**；LOW观察为不再携带原Supabase X-Client-Info遥测标识，记录不扩改，非授权/功能阻断。旧identity12项正文不改，host仅适配外部DataSDK stub和实际getSession转发，不把它当完整PostgREST证明。

直接pin已安装transitive **@supabase/postgrest-js2.112.3**，manifest/lock只添根直接依赖及正常测试入口，无安装/升级/registry访问或既有lock包记录变化。模块SHA**6deecce1f7b0b21ce5eaa33f72e6d866ddefff24364f3ef2bfefd37fd16e5314**，repository**a7cfa988…**，新test**d2b13e0a…**；App输入300→301，仅新模块、repository/package/lock变化，其余297原输入及15受保护来源、145tracked路径保持。旧QA仍**f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265字节，不含近期修复；本轮无构建安装、原生/云端新通过、真实账户/密码验证码邮件对象、项目云查询写入/SQL/RLS/部署权限、主机探测或机器人/付费商店动作。

**设备两条Data令牌读取本地切片完成；发布NO-GO、正式设计0/20不变。** 仅同runtime、新鲜受控public初始化后的设备入口，不关闭完整constructor/INITIAL、其他Data/Storage/Functions、跨runtime或backend/RLS/native/network。session.user.id只是相关性一致检查，不替代服务器授权；Data仍可能挂起但不占Auth，挂起Auth存储仍保守持有owner。请求凭据会随已开始query/retry保留，不等于注销撤销/取消/原子切号或迟到UI隔离；下一项核查设备结果在退出/切号后的发布隔离。资料头像真实后端/Storage、Logo云模板、新QA与真实Android/普通弱网门禁保留，不重复未变化人工请求。证据：`artifacts/release-readiness/20261017-device-data-query-seam/integration.json`、NOTES、scope/review及所有原始RED/GREEN/回归日志，历史不可变。

## 2026-10-17 本轮：真实设备查询的隐式Auth缺口已复现，尚未实施修复

继续上一轮明确留下的Data边界，开轮核对104条证据绑定、全部300项App输入、旧QA及145项既有tracked修改。**本轮产品源码、正常scripts/tests、package/lock、配置和依赖全部未改**，仅新增诊断artifact并更新现有状态/门禁文档，不重复未变化环境/网络/Logo/构建/模拟器阻断。按诊断/TDD先写验收，再用production repository/coordinator/authRequestFetch、真实installed public createClient/Auth/PostgREST与合成storage/HTTP复现，不再用fake Data边界。

显式getUser完成后，夹具在第二个生产getter明确注入过期合成会话和另一个owner；真实Data内部getSession仍refresh1/会话写1/DataHTTP1，外部owner始终busy。**干净RED实际1/0/1、exit1；最终矩阵4项=2个健康对照符合预期+2个安全断言失败，actual exit1/12,722ms**，无skip/todo/cancel/timeout、运行输入稳定。list GET和settings PATCH分别复现，后者核验真实SDK生成的owner/id过滤和原settings body；fresh/无干预与foreign但fresh两项控制将隐式读和刷新区分。首个草稿同时出现constructor时record未初始化异常，原日志保留，不算干净RED；最终日志无此异常。独立只读审查**APPROVE_SCOPE_ONLY（仅表征证据）**，不是产品修复批准，不称矩阵通过。

已排除手写Authorization捷径：SDK先无条件取token再检查header。全Data await加owner会把未设deadline的devices HTTP/body等待带进全局Auth排他，未采用；当前共享client直接加accessToken会禁用其Auth API，也未采用。独立Data-only候选还有constructor提前调用token provider、GET自动重试/错误转换等兼容合同，须先表征；不得复制历史额外token-cell方案接真实凭据。下一项收敛无Auth构造副作用的公开Data入口，只协调实际令牌读取并把Data网络留在锁外，同时验证busy不排队重放、错误/身份/过滤不变。

诊断fixture SHA **10cba39d7fe6d2239a09f8e2215312bd5b091d702d4334b3a05627582282b8a0**，非交付App；设备服务仍**11bb33a9…**，全部300项App输入0变化，旧QA仍**f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265字节，不含近期修复。未重跑未变化的常规74项/TypeScript，不挪用历史结果为本轮通过；新增原生/云端通过0，无真实账户/密码验证码邮件对象、云项目查询写入/SQL/RLS/权限部署、主机探测或机器人/付费商店动作。

**诊断子步完成，产品隐式Auth修复未完成；发布NO-GO、正式设计0/20不变。** 合成过期干预不是自然发生频率、真实越权/数据损坏或普通网络登录失败根因证明；完整constructor/INITIAL、跨runtime、其他Data API、真实后端/RLS/Android与网络仍未验收。资料头像真实后端/Storage、Logo真实云模板及新QA门禁保留，不重复未变化人工请求。证据：`artifacts/release-readiness/20261017-device-data-auth-boundary/integration.json`、NOTES、DECISION、review及原始RED/矩阵日志，历史不可变。

## 2026-10-17 本轮：设备列表与设置的显式身份读取纳入认证排他

继续上一轮设备caller事项，开轮复核106条证据绑定、全部300项App输入及旧QA，保护145项既有tracked修改，不重复未变化的网络/环境/Logo/构建/模拟器阻断。先写验收并保存快照，production repository/coordinator+installed public AuthClient2.112.3、合成HTTP/storage/Data复现有效RED：另一owner仍busy时旧list fulfilled，getter2、refresh1、会话写1、Data query1；实际1/0/1、exit1。不是live账户越权或数据损坏证据。

**产品只增加import并包住requireUserId**：先取得既有session-read owner，再进入getter，等待原始getUser真正settle才释放。这里没有caller timeout，不另加retain/timeout/retry，不锁整个Data流程。原owner/is_demo/sort、settings id/owner/payload/返回/错误及claim/unbind保持不变。正常device-flow测试命令追加新套件；无依赖/配置/开关变化。最终5文件关联回归**74/74（含12项新增SDK设备测试，不重复相加）**、设备静态护栏exit0、TypeScript noEmit实际exit0/62,045ms；源码稳定，无超时/skip/todo/cancel。独立只读审查**APPROVE_SCOPE_ONLY**。首轮扩展控制9/12的三项失败仅为VM选项对象prototype比较，修正外部query捕获后已纳入最终通过，原日志保留，不算产品RED。

设备服务SHA **11bb33a9a672501e2356833433f30b51ca3dd83dc2c2a21a8be82f08120d243e**，test **2407853d…**、package **b6f78829…**；300项App输入仅服务和package2项变化，其余298一致，10受保护源码及原145项tracked路径不变。旧QA仍**f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265字节，不含近期修复。无新构建安装、云端项目查询/写入、账号密码验证码邮件对象、SQL/RLS/权限部署、主机网络资源探测或机器人/付费商店动作。

**显式设备身份切片完成；发布NO-GO、正式设计0/20不变。** 不证明完整Provider设备刷新联合场景、Data内部Auth、原子身份/查询、完整constructor/INITIAL或安卓/真实服务。后续只读审查已定位查询的第二次会话入口：PostgREST→authenticated fetch→getSession可再次刷新；这是源码观察，下一轮先用真实public createClient/合成HTTP和存储做受控复现，不能直接扩成whole-flow锁。资料头像完整后端/Storage、邮件Logo对象与真实模板、新QA/真实Android及普通弱网门禁仍开放，不重复未变化人工请求。证据：`artifacts/release-readiness/20261017-device-identity-ownership/integration.json`、NOTES、CALLER_AUDIT、scope/review及原始日志；历史不可变。

## 2026-10-17 本轮：资料身份读取纳入排他，调用方超时不再放行未结束的SDK

继续上一轮未协调getUser事项，开轮核对109条证据绑定、全部300项App输入、旧QA及145项既有tracked修改，不重复环境/网络/Logo/构建/模拟器阻断。按诊断/TDD保存验收与完整快照，真实production save/journal/coordinator+installed AuthClient2.112.3、合成存储/HTTP/Data先做两项有效RED：**busy-red 1/0/1 exit1**，外部owner仍忙时旧save fulfilled，getter3、资料读1/模拟RPC写1、journal读1、SDK refresh1/userGET2/会话写1；**timeout-red 1/0/1 exit1**，原ProfileEditTimeoutError已返回而getUser未settle，coordinator却不busy。不外推为真实账户越权或数据损坏。

**产品仅改profileEditing的显式身份helper及两处早getter顺序**：每次先取得现有session-read owner，在lease.retain内启动原始getUser，再应用原caller timeout；超时可结束调用方等待，但实际SDK刷新/存储/userGET未结束前不释放排他，迟到结果不续跑已拒绝的保存。初始save/cleanup getter移到首个身份检查后；原多次fences、错误对象/账户不匹配、journal和清理proof不删不放宽。不是整个save大锁；读取类型沿用Provider规则，正常read保留prepared key，真实TOKEN_REFRESHED仍失效并重新准备。

最终6文件关联回归 **126/126**（包含新增8项SDK/Provider案例及先前96项资料/journal子集，不重复相加），TypeScript noEmit实际exit0（34,036ms），源码稳定、实际进程退出，无超时/skip/todo/cancel。独立审查 **APPROVE_SCOPE_ONLY**。正常资料测试加载真实coordinator；一项旧prepared retry预期有意改为pending SDK先拒绝→caller timeout仍busy→SDK settle后仅取消旧prepared intent，仍验证upload/RPC/remove全0和最终journal为空。其他旧测试正文不改；package只给test:profile-editing追加新套件。两次新Provider宿主缺Buffer/复用消耗Response的失败原样保留，不算产品RED；最终真实同SDK/同coordinator的Provider控制已纳入126。

服务SHA **05b63c27c60b24ffdb83665adf9122d9f917187131290ce7d2c98ccec4357235**，新test **53725434…**、原test **5ac48e50…**、package **933af9ff…**。300项App输入仅服务及package测试命令2项变化，其余298一致；13受保护来源不变，tracked仍145，既有untracked资料模块工作亦保留。旧QA仍 **f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265字节，不含本轮/近期修复。无新构建安装、项目云查询/写入、真实账号密码验证码邮件对象、SQL/RLS/权限部署、主机探测网络/机器人/付费商店动作。

**显式身份读取切片完成，资料头像云端接通/发布未完成；NO-GO、正式设计0/20。** per-read间隙仍可有其他Auth操作，非原子凭据固定；REST/Storage/RPC内部隐式Auth读取、完整constructor/INITIAL、跨runtime及永久挂起SDK仍开放，不用timer假取消。下一项继续实际caller的设备身份读取/隐式Data Auth边界否证；完整后端/Storage、Logo、新QA和真实Android/普通弱网门禁保留，不重复未变化阻断。证据：`artifacts/release-readiness/20261017-profile-identity-ownership/integration.json`、NOTES、scope/review和全部原始RED/GREEN/最终日志；历史不可变。

## 2026-10-17 本轮：第三方登录 OAuth 准备纳入认证排他，浏览器等待不占锁

本轮继续未完成的认证竞争收口，不重复环境/网络/Logo/构建/模拟器阻断。开轮核对前轮82条证据绑定、全部300项App输入和旧QA身份，保护144项既有tracked修改。独立只读caller审查发现native/default第三方入口直接调用signInWithOAuth；它会写PKCE存储，而不是无副作用的取URL。先保存验收与完整改前快照，逐端测试先行：**有效native-entry-red/default-entry-red各1test/0pass/1fail、actual exit1**，另一owner仍busy时，旧入口getter1、真实SDK存储操作4、verifier已存、browser1，最终fulfilled取消。最初两次错误allowlist/URL query夹具失败原样保留，不作完整产品RED。

**产品仅改两个signInWithOAuth调用：先取得现有session-write owner，再进入getter，等待实际SDK准备Promise settle；浏览器打开和等待仍在锁外**，使收到的认证回调能独立交换会话，不自锁、不排队凭据、不自动重试。default补同一coordinator import；package.json仅将新增行为测试接入既有test:social-auth命令。第三方开关、Provider参数/错误映射、原生Apple换票、App/Provider/client/coordinator及依赖版本均未改。

最终专项**12/12，包含在5文件关联回归53/53内，不重复相加**；三项social/broker/Apple源码护栏exit0，TypeScript noEmit实际exit0（29,590ms），执行输入哈希稳定，无超时/skip/todo/cancel。真实installed SDK2.112.3与生产service/coordinator证明：busy时getter/存储/browser0，延迟PKCE写和存储错误未settle前持续持有owner；浏览器pending时生产URL回调可完成独立PKCE交换，disabled三Provider仍无触达。独立只读审查**APPROVE_SCOPE_ONLY**。这些是合成平台/browser/HTTP/存储，不是第三方配置就绪、真实登录或安卓通过；未挪用历史273项为新通过。

Native/default源码SHA **1910d41e… / 6f3de726…**，新test **1aa8f428…**，package **41cda29f…**；300项App输入仅两服务与package测试命令3项变化，其余297一致。tracked现145项（本轮新增触及原先干净的default服务；不是替换原144项用户工作）。旧QA仍 **f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265字节，不含本轮/近期修复。无新构建安装、项目云查询/写入、真实账号密码验证码邮件对象、SQL/RLS/迁移/权限部署、主机探测网络/机器人/付费商店动作。

**仅SDK准备并发切片完成，发布NO-GO、正式设计0/20不变。** 准备结束后浏览器等待期的其他新flow仍可能替换legacy verifier，不承诺全flow/跨runtime互斥或取消清理；完整constructor/INITIAL与nativeApple早getter仍开放。下一本地项先复现资料编辑assertExpectedUser的未协调getUser/超时边界（本轮只读发现，尚非行为验收），同时保留完整后端、Logo、新包安卓和真实网络门禁。证据：`artifacts/release-readiness/20261017-social-oauth-ownership/integration.json`、NOTES、CALLER_AUDIT、scope/review及原始RED/GREEN/最终日志，历史不可变。

## 2026-10-17 本轮：补齐旧版 Android 蓝牙扫描的位置权限说明

本轮从认证回调收口后切回隐私发布准备。开轮复核前轮84条绑定、全部300项App输入、旧QA身份及144项既有tracked修改；未重复未变化环境/网络/Logo/构建/模拟器阻断。账户删除preview仍是本地planning-only且未接App，现有设备处置/留存/正式政策与部署决定没有擅自接受，也未重复提问。独立窄审确认当前MapScreen使用打包示例图和模板，没有地图provider/GPS采集调用；不为尚未实现的地图编造数据披露。

发现并修复一个真实说明缺口：Android adapter在API<31请求fine-location，API23–30还检查Location Services；manifest plugin将旧权限限定maxSdkVersion30，而原隐私页只说主动扫描广播，没有解释系统位置权限。先保存验收和完整改前快照，**实际渲染组件的缺文案RED为1test/0pass/1fail、exit1**，不是声称蓝牙运行故障。**唯一产品修改是DataPrivacyScreen现有“机器人与连接”body追加一句**：Android11及以下BLE需要位置权限/定位服务，此扫描流程仅检查开关，不读取、保存或上传手机经纬度。主动触发、广播不代表可信连接、注销未接通和非正式隐私政策等原说明保留；无新按钮、样式或功能/权限变化。

文案与只读交互回归 **7/7**（包含新增1项，内部8种theme/compact横竖/fontScale受控host组合，不计作8项原生通过），TypeScript noEmit实际exit0，执行源码哈希稳定、无超时/skip/todo/cancel。独立源码事实/范围复核 **APPROVE（仅此披露）**。11项BLE/地图/配置/Auth/注销runtime来源保持原身份；旧6项组件测试正文不改、页面body字面量之外精确不变。没有触发系统权限、扫描、定位或网络；**不是安卓布局/弹窗/实际扫描、正式隐私政策或商店合规验收**，未重跑/挪用未变化的273项认证回归。

页面SHA **`1a3247e6d6ecd31a00aaa4a99de86e8a749555e45136f12140886cca1c6c1a6f`**，test **`bfb4c35e92b86a0b3fdabb598c9ce7197e7c0c34967484cb9eb80ef74a03912a`**。300项App输入仅该页面变化，其余299一致。旧QA仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，不含本轮/近期修复；无新构建安装、真实账号密码验证码/邮件对象、云SQL/RLS/迁移/权限/部署、主机环境网络/机器人/付费商店动作。

**完成一处权限披露修正；发布NO-GO、正式设计0/20不变。** 完整政策/联系方式/留存、注销执行和web入口、资料头像真实后端、邮件Logo云模板、完整INITIAL/bootstrap及新包Android/普通弱网仍是独立门禁。已有环境/资源条件实际变化后才构建当前源码的新QA，不拿旧包验证新文案，不重复未变化阻断。证据：`artifacts/release-readiness/20261017-ble-privacy-disclosure/integration.json`、NOTES、scope/review及原始RED/7项回归/类型日志；历史证据不可变。

## 2026-10-17 本轮：修复取消回调后仍被 SDK 恢复事件重新带入重置页

开轮复核前轮104条绑定、300项App输入及144项既有tracked修改，未重复未变化的环境/网络/Logo/构建/模拟器阻断。诊断与独立审查发现上一轮直接handler守卫之外还有Provider路径：回调交换未结时点击退出，inbox虽失效，但busy guard使退出未执行；真实SDK迟到的PASSWORD_RECOVERY仍会重建全局恢复提示，再由App另一导航effect打开重置页。先保存验收和完整改前快照，**真实installed SDK2.112.3公开recover生成verifier→PKCE、生产Provider/service/coordinator/inbox+实际提取App入口联合RED**：请求1、真实恢复事件=true、callbackCancelled=true，但ProviderRecovery=true、reset导航=true，实际exit1，无超时/skip/todo/cancel。

**实际只改App退出入口和AuthProvider恢复提示生命周期**：clearRecovery清现有hint/state，并记录当前busy操作的单个非秘密revision；仅同一仍busy的已退役revision的PASSWORD_RECOVERY不能重新建hint，重复旧事件持续屏蔽，idle清除和后续revision不受影响。原invalidate/readFresh/会话与profile准备照常，不篡改SDK状态、不取消网络/写回、不提前释放lease或自动补退出。App在busy guard前清两处恢复提示；若忙，明确显示“退出尚未执行”，提示等待后重试。**这不是已完成退出/撤销或会话回滚**，完成的SDK交换仍可替换当前会话。

最终联合控制**3/3**，包含在同19文件关联回归**273/273**内，不重复相加；TypeScript noEmit实际exit0，执行输入哈希稳定，无超时/skip/todo/cancel。两项真实SDK控制分别覆盖退出发生在恢复事件前/后：初始会话A→取消交换返回同用户新会话B，Provider真实接收并准备B、恢复/重置导航保持false；下一次公开恢复返回C，正常接收并允许恢复。第三项synthetic Provider事件覆盖idle、重复同revision及新revision。旧同会话版本结果保留，最终只采用`final-joint-controls`和`frozen-regressions`绑定加强后的test SHA **`2738c6bdedf141bbe4aacc08f3d92ccba222356df199b17dd5db816e70185a43`**。独立只读复核`APPROVE_RECOVERY_EVENT_RETIREMENT_ONLY`，无阻挡发现。

App SHA **`ee9c68d5cba34f51a91c8ec17aed5d8f2d7243631bb86ab85959e3e764a0189c`**、Provider **`35477b28ac091849b5f3058bbfd465b68e51ef929632e84f29578cd1ebde2fbb`**。300项App输入仅这2项变化，其余298一致；inbox/service/coordinator和既有测试正文不变，normal测试只补SDK边界转发、实际App host与3项控制。真实SDK指本机实现配合受控HTTP/storage/hooks/native边界，**不是全React挂载、live Auth/邮件/RLS/安卓验收**；revision合同限同runtime的owned SDK事件结算，不外推raw未协调事件。完整隐藏INITIAL/bootstrap缺口仍开放。

旧QA仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，不含本轮及近期修复。无新构建/安装、真实账号密码验证码/邮件对象、云SQL/RLS/迁移/权限/部署、主机环境网络/机器人/付费商店操作。**本地迟到恢复事件切片完成；发布NO-GO、正式设计0/20不变。** 下一项继续按实际发布门禁推进；已有环境/资源前置变化后才能为当前源码构建新QA及真实Android联合回归，不拿旧包冒充新验收，不重复索要未变化决定。证据：`artifacts/release-readiness/20261017-recovery-event-retirement/integration.json`、NOTES、scope/review与全部原始RED/控制/回归/type日志；历史不可变。

## 2026-10-17 本轮：首次认证链接不再因恢复忙而丢失，本地回调修复已接入 App

先核对前轮65条绑定、299项App输入及144项既有tracked修改，保护原有工作；按诊断/TDD先写验收并复现真实提取App handler、validation/deduper/service/coordinator：仅一次initialURL在恢复owner忙时碰拒绝，释放后getter/SDK仍0、恢复页未进入，实际RED exit1。不是网页预览或新API缺失冒充已有产品缺陷。

**本轮实际改App及新增`authCallbackInbox.ts`**：仅内存保留一条pending和一条active，重复key共享、不同超量拒绝；恢复/账户流程/实际coordinator都允许后同步进入原service，不用timer重试、不在不确定SDK结果后自动重发。保留来源路径校验与deduper，交换成功后才进入恢复页。一次启动URL promise跨即时effect重放复用，交付/退出后清引用；退出意图先清等待链接再遵守原busy guard，不能冒称已退出。卸载/已知user+session身份替换使等待和迟到UI失效，首次未知恢复及自身精确返回的会话过渡有明确区分，SDK未结束不假释放lease。审查实际发现并补RED/GREEN：通用UI busy会死锁第三方回调、prepared身份失效会提前清掉回调busy；两处均已修正。

**最终专项15/15，关联19文件270/270（包含专项，不重复相加），TypeScript noEmit实际exit0**；实际进程退出、无超时/skip/todo/cancel，最终回归23项执行输入哈希稳定。独立限域复核`APPROVE_CALLBACK_INBOX_ONLY`，无阻挡发现。三次logout草稿执行属夹具缺依赖/捕获旧state问题，原日志保留，不计作产品RED或GREEN。React/Linking/SDK交换边界受控，身份payload只是关联解析，不是签名认证；**不是全React挂载、原生、真实认证/网络/邮件通过，也不关闭完整隐藏INITIAL启动排他缺口**。

App SHA **`887c929621fcdb6e115d29f4cb7e9bf7e633bd3a5c7ae70b90e441e8d211b61a`**，inbox **`583e0462a8facff2e9f36da0bbcee050396a345cbff043535f8513b4427c9c5c`**。App输入300项：仅App改变、新增inbox，其余298项一致；正常测试只新增专项、给既有logout测试加载真实inbox/coordinator。当前旧QA仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，不含本轮及近期修复；无新构建安装、云SQL/RLS/迁移/权限/部署、真实账号密码验证码/邮件对象、主机环境网络/机器人/付费商店操作，不重复未变化阻断。

**完成的是App回调调度本地切片；发布NO-GO、正式设计0/20不变。** 下一项保留完整INITIAL/bootstrap、资料头像真实后端/Storage、邮件Logo云模板及Android/普通弱网验收门禁；仅在已有环境/资源前置实际变化后构建此源码身份的新QA，不用旧包验证新修复，不重复索要同一环境决定。证据：`artifacts/release-readiness/20261017-auth-callback-inbox/integration.json`、NOTES、scope/review及全部原始RED/最终日志；历史证据不可变。

## 2026-10-17 11:25 轮：手动单Auth启动与显式PKCE恢复事件隔离验证3/3，尚未接入App

继续启动门禁，复核前轮70条绑定、全部299项App输入及144项既有tracked修改；不重复环境/Logo/网络/模拟器/changelog阻断。诊断与独立审查把范围收敛到**当前native配置detectSessionInUrl=false**：不声称initialize+INITIAL涵盖隐式web URL恢复timer，也不重复旧split8项的Data/token-cell验证。仅新增artifact，无src、正常scripts、配置或依赖变化。

真实installed AuthClient2.112.3+生产coordinator/fetch/identity parser的三项有界执行实际**3/3、exit0、exitObserved=true、无超时/skip/todo/cancel、9项proof源码稳定**：①skipAutoInitialize standalone构造后一turn，存储/HTTP/events观察0；同栈initialize→唯一listener，延迟真实INITIAL读期间owner busy、getAuth不可用且竞争拒绝；②native初始化结果本身可能无错而INITIAL refresh失败，最终owned getSession继续返回SDK cached AuthRetryableFetchError，HTTP1/写0/原storage保留、不发布ready；③公开resetPasswordForEmail实际生成recovery verifier，再公开exchangeCodeForSession消费，真实事件为INITIAL_SESSION→PASSWORD_RECOVERY且无SIGNED_IN，hold回调期间exchange与owner保持pending，放行后才完成。没有直接写verifier或手发事件，诊断不含code/token/密钥值。

限定独立复核`APPROVE_MANUAL_AUTH_AND_PKCE_FEASIBILITY_ONLY`。**完成的是隔离可行性子步，不是产品模块、完整bootstrap或Android验收。** 重复initialize/listener、失败retry、退役中恢复回调、Data freshness/native storage等仍未验证，禁止直接把fixture复制接线；完整createClient隐藏INITIAL竞争RED仍开放。正常224套件和TypeScript本轮未重跑，不挪用为新通过。另有只读caller观察：App initial/foreground URL处理不等待authLoading，deduper不是队列，存在碰busy后无自动重新派发的代码路径；本轮3项未复现该App缺陷，下一步先对真实提取handler/service/coordinator做单次初始URL受阻的RED，再审查有界内存调度、退出/身份失效、去重与不重发不确定请求的合同。

实验fixture SHA **`c06ad1c6bfef3ffddbc0e0edc03c0c5d5ac14fea7a87126e730b09c58366f7be`**，test **`58f59cea2c3ce0a9c54139b6a87da6308922e7fc4abf98e0df90d566977b84e7`**；两者均非交付App源码身份。299项App输入0变化，前轮70条除两份现有状态/门禁文档有意追加外68项一致，历史artifact不可变。旧QA仍`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`、77,340,265字节，不含近期修复；无新构建安装、真实账号密码验证码/邮件对象、云SQL/RLS/迁移/部署、主机网络/环境或机器人/付费商店操作。**NO-GO、正式设计0/20不变。** 证据：`artifacts/release-readiness/20261017-manual-auth-bootstrap/completion.json`、NOTES、CALLBACK_BOUNDARY、实际targeted日志/审查/验收；既有环境决定不重复提问。

## 2026-10-17 10:54 轮：隔离冷启动夹具时钟，上一轮同范围关联回归恢复224/224

继续上一轮未完成项，开轮复核98条绑定、299项App输入及144项既有tracked修改，未重复环境/网络/Logo/模拟器阻断。诊断技能促使先用同拓扑控制组而不是反复重跑：从完整旧test快照提取真实SDK2.112.3+生产Provider/service/coordinator/fetch夹具，保留真实INITIAL和显式getSession两条读取。两组仅首次在线body是否跨过独立transport deadline不同。健康控制恢复1次请求；受控跨线组首请求abort/reject、SDK再试一次成功，原精确`failedRequests+1`断言仍失败为`3 !== 2`。实际差分2tests/1pass/1expectedfail、exit1，证明该机制足以产生额外请求，**不证明历史偶发失败的唯一原因或INITIAL竞争不存在**；不是产品RED。

**只修改正常`auth-provider-ingestion.test.mjs`的cold recovery单个callback**：健康body立即可buffer、wrapper注入独立固定now，SDK wall-clock仍按31s/61s压缩预算，离线仍由真实10ms timer触发abort，生产wrapper仍重建真实Response。增加闭集phase/ordinal/abort/outcome/busy诊断，不记录秘密。没有改监听/SDK/Provider/drain顺序；scope实际比较原30条assert精确顺序一致、test外byte一致，6项受保护源码不变，全部299项App输入不变。测试SHA **`424c0d91e265558eed9ac83d573c433afe0524a3202159c8ec0cee621a26bc2c`**；产品service仍`6880ea3d…`，otpError仍`d4469cf7…`。

**Provider+fetch62/62、同上一轮范围的关联认证224/224，均实际exit0，无skip/todo/cancel/超时且sourcesStable=true**；62包含在224内，不另加差分控制通过数。最终冷启动诊断为离线abort1、cooldown请求0、恢复请求1、卸载后显式refresh1且Provider读取0。限定独立复核`APPROVE_COLD_RECOVERY_FIXTURE_ONLY`；TypeScript本轮未重跑，不作为新增通过。上一轮223/224及最初INITIAL产品RED原样保留。**关闭测试夹具稳定化和同范围回归缺口，不关闭完整INITIAL启动排他；发布NO-GO、正式设计0/20。**

前轮98条除test及两份现有状态/门禁文档3项有意变化外95项一致；没有产品源码、依赖、权限、原生或真实云端变化。旧QA仍`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`、77,340,265字节，不含近期修复；未新构建安装，未真实账号密码验证码/邮件对象、云SQL/RLS/迁移/部署、主机环境/网络、机器人/付费商店动作。下一项继续有界公开API启动/INITIAL归属检查，真实后端/邮件/Android验收仍受既有前置约束。证据：`artifacts/release-readiness/20261017-cold-recovery-clock/integration.json`、NOTES、differential-red、provider-fetch/auth-regressions原始日志、scope及完整改前快照；不覆写历史证据。

## 2026-10-17 10:43 轮：邮件发送 PKCE 排他修复专项通过，关联冷启动回归仍有一项未定论

开轮复核前轮80条绑定、299项App输入和144项既有tracked修改；未重试或重复询问环境/网络/Logo/模拟器阻断。按诊断/TDD先定义验收，并行只读核对installed AuthClient2.112.3及真实调用点。**本轮产品仅改authService三条发信函数和otpError反馈**：`resendSignupOtp`、旧`forgotPassword`、当前`sendPasswordRecoveryOtp`均先持有现有默认session-write owner，再进入getter、完整SDK PKCE准备/请求/错误清理；这些方法不是隐式session refresh。独立审查要求补上超时/断网的固定“邮件发送结果暂时无法确认，请先检查收件箱和垃圾邮件，稍后再试。”文案，不假成功、不自动重发、不将客户端abort当作服务端取消。旧forgotPassword的返回SDK错误有意统一映射为delivery；配置/getter及抛出的storage错误仍保留原身份，rate-limit优先和verification反馈不变。

五个先行单项RED及对应GREEN均独立保留。**最终专项30/30、TypeScript noEmit实际exit0、旧OTP错误契约6/6**；真实SDK+生产service/coordinator/fetch的合成存储/HTTP证明busy时getter/存储/HTTP均0，成功PKCE保留，错误清理未结仍持有owner且不删除另一pending flow。提取真实App handler逻辑验证失败不跳转/不提示发送成功、重发仍抛原错误及同tick去重；App源码未改，不是全React/Provider或Android验收。三次早期combined运行因测试路径、变量绑定和缺class依赖失败，已修正并留raw，不算产品RED。限定独立审查`APPROVE_MAIL_DELIVERY_OWNERSHIP_ONLY`。

**关联全套实际224项中223通过、1失败、exit1，不能登记全GREEN或整项验收完成。** 失败在既有cold native-config恢复测试393行：请求预期2、实际3；该路径不调用本轮三条邮件函数，getSession/Provider/fetch未改。未改源码的单项复查1/1，但不抵消失败。独立只读诊断认为夹具冻结SDK wall clock、却保留真实10ms HTTP/body截止，可能把健康响应误判timeout并触发SDK重试；现有聚合日志不能排除既有INITIAL双读取竞争，因此保留未定论，不放宽精确次数断言或靠反复重跑求绿。下一项先补受控transport clock/buffer及不含秘密的逐请求诊断，再区分时钟与INITIAL并复跑关联套件。

当前service SHA **`6880ea3d11e14d97e1a57254177f60895fef9716831c25efb51d608ac27c3de5`**，otpError **`d4469cf7d9d9cffe67bec79c770837e4e85fd6a08370ef1f6684b55993449f90`**。299项仅这2项有意变化，其余297一致；前轮80条除service/现有门禁2项有意变化外78项一致，历史artifact不改写。部分PKCE准备失败仍可能留下slot，永久storage挂起和完整constructor/INITIAL排他未修复。**发布NO-GO、正式设计0/20不变**；旧QA仍`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`、77,340,265字节，不含本轮及近期修复。无新构建/安装/原生/真实云邮件通过，无真实账号密码验证码/对象、SQL/RLS/迁移/权限/Edge部署、Docker/WSL/CIM/主机网络/机器人/付费商店动作。证据：`artifacts/release-readiness/20261017-email-delivery-ownership/integration.json`、NOTES、REGRESSION_DIAGNOSIS、全部RED/失败/最终专项/回归/类型日志、review和scope。

## 2026-10-17 10:00 轮：修复改密验证码入口的隐式刷新竞争与断网永久等待

开轮重新核对前轮62条绑定、299项App输入和144项既有tracked修改，保护原有工作，不重复环境/网络/Logo/模拟器阻断。按诊断与TDD先写验收，独立审查指出nonce HTTP原本不受截止保护，不能只加全局owner。本轮实际产品只改`authService.sendReauthenticationNonce`和`authRequestFetch`精确GET `/auth/v1/reauthenticate`分类：完整SDK调用在同一默认session-write owner内，fetch/body/monotonic沿用15秒单请求截止；不改客户端/存储/Provider/权限/依赖或引入token cell。

真实installed AuthClient2.112.3的合成RED证明：无listener健康初始化完成后才换expired存储，外部owner仍busy时raw reauthenticate实际读3/写1、refresh→nonce GET并轮换存储；不是constructor推测。修复后同场景getter/存储/HTTP为0，正常隐式refresh、写回和nonce请求持续持有owner，SDK settle后释放。网络丢失/timeout均固定提示“安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。”，不假成功、不自动重复nonce；refresh在nonce前失败也保守提示结果不确定。非目标错误及getSession反馈不改，客户端abort不代表服务端取消。

最终相关Node回归**177/177**（包括专项39项、不重复相加），实际退出/TypeScript和限定复核绑定在本轮integration；三次先行RED与审查追加的网络丢失RED均独立保留。最初14项中的6个测试夹具失败（TS未转译/错误响应缺版本头）已修正并保留记录，不算产品RED；初次38/176结果不代替最终39/177。生产service SHA **`d8de8be643b612d7eb750b6ef7dd9112ee049228bc9c378b1483ca44f5d06567`**，fetch SHA **`37e83d0982f292081e3f79d3078c3daad85f9bc699d930fa2218bb1df5a67366`**。299项仅这2项有意变化，其他297一致；前轮62条除service/fetch/对应测试/门禁文档4项有意更新外58项不变，历史artifact未覆写。

**改密nonce入口的排他/有界请求/安全反馈切片完成；完整INITIAL启动排他仍未修复，发布NO-GO、正式设计0/20。** 所有JWT/存储/HTTP及handler host为合成，不是实际邮件/验证码投递、RLS、Android或全Provider生命周期通过；永久storage/SDK初始化挂起仍不能用timer假释放。保留QA仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，不含本轮/近期修复。无新构建安装、真实账号/密码验证码/对象、云SQL/RLS/迁移/权限/Edge部署、主机网络/机器人/付费商店操作；现有环境决定不重复提问。下一项继续受控startup与剩余隐式Auth入口，不将单个API修复扩大为bootstrap完成。证据：`artifacts/release-readiness/20261017-reauth-session-ownership/integration.json`、NOTES、全部原始RED/最终日志/审查、快照及scope；现有门禁已追加。

## 2026-10-17 09:23 轮：修复登录与注册先取客户端后申请排他的入口顺序

先核对前轮36条绑定、299项App输入和144项既有tracked修改，并行只读审查调用点、Provider/native/URL生命周期及SDK安全兼容。审查确认不宜直接接入上轮split：当前完整client的Data请求会通过getSession隐式刷新，accessToken-only会移除该语义；未知/刷新结果不确定时不能静默回退公开key请求，现有存储namespace、sanitized chunk adapter、平台刷新、URL/fetch/事件桥等仍需接线门禁。本轮未采用新token cell、未改supabaseClient/Provider或依赖。

选定可独立落地的最小产品修复：`authService.register/login`原先在申请operation之前进入getter，busy竞争调用也可能先构造SDK。两条逐项TDD实际 **RED exit1、getter1而期望0 → GREEN exit0**；现先获取现有coordinator，再进入getter/SDK，busy时两者均0。getter仍在SDK映射try之外，配置及其他构造错误保持原对象，SDK错误映射/输入/返回值兼容；正常SDK未结期间保持owner、竞争拒绝，错误后释放，不排队、不自动重发真实凭据。测试使用真实service/coordinator与替代SDK/native边界，不是安卓或实际网络刷新证明。

最终顺序相关回归 **154/154、TypeScript noEmit exit0**，实际exitObserved=true且无超时、skip/todo/cancelled；service兼容30项包含在154中，不重复累加。最终service SHA **`8044ca6c65a34caa3a840ce8540fdfaca5d810904b8942d4e4f59c98712afc4c`**，测试SHA **`90b66edb07596eca31f97ee0d6c66220f897840ccec78e0f2a7be36a2dcf190a`**。299项App输入仅service1项有意变化，其余298一致；前轮36条绑定除service及门禁文档2项有意更新外34项不变，既有修改保留，历史artifact不覆写。

**登录/注册入口顺序切片完成，完整INITIAL初始化排他缺口仍未修复；发布NO-GO、正式设计0/20。** 本轮没有新构建/安装/原生/真实认证或后台部署通过；保留QA仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，不含本轮及近期修复。未真实账号/密码验证码/对象、云SQL/RLS/迁移/权限/Edge部署、主机网络/机器人/付费商店操作，未重试Docker/WSL/CIM、Logo/浏览器/模拟器阻断，既有环境决定不重复提问。下一项继续受控startup和请求freshness/存储兼容门禁，不能将入口顺序修复当成完成所有隐藏任务。证据：`artifacts/release-readiness/20261017-auth-entry-ownership/integration.json`、RED/GREEN与最终日志/审查、`CALLER_AUDIT.md`；现有初始化门禁已追加本轮范围。

## 2026-10-17 09:00 轮：通过公开 Auth/Data 分离的合成可行性验证，App 修复仍未接线

延续同一认证初始化事项；先定义验收、核对前轮36条绑定及299项App输入，保护144项既有tracked修改。只在独立artifact中实现公开standalone AuthClient/单listener + accessToken-only Data原型，Data回调只读合成内存token cell。没有修改App、正常scripts、依赖或SDK。诊断/验证技能促使本轮保留受控延迟读取、真实子进程退出与反例边界，不以网页或静态检查替代行为。

最终有界顺序验收 **8/8、exit0、exitObserved=true、无执行超时，无skip/todo/cancelled**：延迟唯一INITIAL读取期间保持owner busy/拒绝竞争，放行后refresh在owner内；失败/SDK冷却与同实例显式重试、恢复hint同身份保留/切换清除、单次初始化、销毁及INITIAL中途销毁均通过合成边界。REST/Storage/Functions在初始、显式刷新、切换及退出四阶段共12次请求，Data触发Auth存储读取/refresh均0；唯一refresh来自显式owned Auth动作。退出后不再带用户token，但REST/Storage仍公开key bearer回退、Functions仍含apikey；Realtime只调用公开setAuth且socket构造0，不是服务端权限或联网通过。

独立草稿审查发现dispose保留token/hint/ready的采用阻断，已补同步退役、迟到发布保护和实际初始化收敛两项回归；最终限定复核绑定源码及proof。内存token引用仍是**未批准用于真实凭据的实验设计**，JS清引用不是物理擦除，dispose不删除持久会话、不等于退出/撤销或取消已派发请求。所有JWT/存储/HTTP均合成，identity hint不是签名认证；永久storage挂起不能用timer假释放。结论仅绑定installed SDK2.112.3，未声称成功扫描上游changelog。

**公开接法可行性子步完成；当前App排他缺口仍未修复，发布NO-GO、正式设计0/20。** 299项App输入0变化，前轮除现有门禁文档有意追加外35条绑定不变；产品修复/原生新增通过0，未挪用旧正常套件或TypeScript结果。保留QA仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，不含近期修复；无新构建安装、真实账号/密码验证码/对象、云SQL/RLS/迁移/权限/Edge部署、主机网络/机器人/付费商店操作，未重试Docker/WSL/CIM、Logo/浏览器/模拟器阻断。下一项先审查全部Auth/Data调用点、Provider/native refresh/URL恢复和token清理合同，再决定最小接线，不能直接把实验移入产品。既有环境问题不重复提问。证据：`artifacts/release-readiness/20261017-split-auth-data/integration.json`、NOTES、proof/原始日志及review；历史证据不覆写。

## 2026-10-17 08:28 轮：初始化候选未通过延迟存储门禁，已归档并移出运行源码

继续同一认证事项，先写验收、核对前轮37条绑定和299项App输入，保护144项既有tracked修改。本轮曾测试先行新增显式lease一次性初始化与事件桥候选；首个缺新模块API tracer为exit1（不是已有App行为故障），随后普通成功/超时冷却测试可通过，但补充真实SDK异步存储否证发现 **HIGH阻断**，未接入现有supabaseClient/AuthProvider。

最关键的实际反例：constructor初始监听的第2次session-key读取捕获旧expired快照并gate，bridge INITIAL和显式getSession先完成，候选报告ready、owner已idle；放行旧read后SDK再次refresh。移出前和归档可复跑版本均 **1 test / 0 pass / 1 fail、exit1，无skip/todo/cancelled**；诊断`stateBeforeRelease=ready`、`busyBeforeRelease=false`、`refreshRequests=2`、`refreshBusyStates=[true,false]`。第二次请求进入时直接读取真实生产coordinator，不只是用50ms等待推测完成。使用公开installed SDK2.112.3和公开storage adapter，不改SDK私有字段或合成Auth事件；具体read编号是版本绑定fixture，不是跨版本承诺。

独立审查 **HIGH / REQUEST_CHANGES_DO_NOT_WIRE**：自有INITIAL、initialize及一次新getSession不能join全部内建监听任务，不能用固定延时/微任务/重复读补成“完成”。两份本轮新建候选在完整快照/哈希/失败日志保存后，已精确移出src和正常scripts：**不是产品修复回滚，从未接线**，源码草案和原测试可恢复；归档复现仅适配路径。候选SHA **`9e1b22e8d282051b0f85e522ae940cc6a7d09d00a417328298d688c13c075523`**，原测试SHA **`698287f52f73b9c0c6fe2a39acaf9eed55307a38a7521f5128577991fe2fdc2f`**。

归档候选的独立超时恢复用例 **1/1、exit0**：两次合成timeout后原storage保留/getClient=null；SDK冷却内显式retry零新增请求；虚拟时钟跨61秒后第3次refresh同一client恢复，构造1次。此为局部候选机制通过，**不是App修复/安卓/发布通过，不能抵消HIGH**。恢复事件已用真实verifyOtp合成响应产生，但提示API的完整同身份/切换/退出/跨卸载回归未完成，不计通过；解析出的identity hint不是JWT签名或身份授权验证。永久storage异常可能不发INITIAL，不能因本地超时假释放SDK工作。

**候选实现与否证子步骤已收口，App初始化排他修复仍未完成，发布NO-GO、正式设计0/20不变。** 最终产品源码/299项App输入恢复本轮初始身份，无新APK/安装/安卓通过；现有QA仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，不含近期修复。本轮不重跑未改正常套件/tsc；所有HTTP/JWT/存储均合成，无真实账号密码验证码/邮件/对象、云SQL/RLS/迁移/权限/Edge部署、主机网络/机器人/付费商店操作，未重试Docker/WSL/CIM、Logo/浏览器/构建/模拟器阻断。下一步验证不产生第二个内建初始化入口的公开API接法或上游完成接口，不能继续给已否证候选加计时补丁。既有环境决定仍待答复，不重复提问。证据：`artifacts/release-readiness/20261017-owned-auth-lifecycle/integration.json`、精确快照、前/后归档RED及review、ARCHIVE.md；现有门禁追加本轮结论，历史artifact不改写。

## 2026-10-17 07:51 轮：隔离初始监听的两条刷新入口，验证受控初始化成功路径；产品修复未接线

继续上一项，不重复受阻环境/网络/Logo/构建/模拟器操作。先写验收并冻结源码，前轮32条绑定在开轮时全部一致，299项App输入0变化；只新增独立诊断/机制实验，更新已有修复门禁，未改产品源码、SDK或依赖。Supabase changelog.md单次读取因unsupported content-type失败，未循环请求或声称完成扫描；官方Auth订阅文档已读，结论绑定本机SDK2.112.3，不外推新版本。

因果隔离最终 **3 tests / 1 pass / 2 fail，exit1，无skip/todo/cancelled**：无listener公开AuthClient为0 refresh且存储不变；完整createClient不挂Provider仍在外部owner busy时refresh1次并轮换合成存储；公开AuthClient加真实生产Provider也独立refresh1次并轮换存储。两条入口都成立，解除了上轮的“无法区分单独贡献”限制。只有挂Provider的场景中登记0、资料0、prepared=null才是业务准备门禁证据，另外两组没有Provider，不能算它成功阻挡。控制组通过不是修复通过。夹具已把coordinator依赖建立在SDK构造之前，避免未来调度变化导致host未赋值；初始和加固后实际记录均保留，不计重复通过。

独立候选机制成功路径实验 **1/1、exit0**：从头在同一个真实coordinator owner内construct完整SDK并立即加公开监听，网络与存储提交等待期间竞争操作均拒绝、回调执行0；refresh/write各1，marker为storage-committed→TOKEN_REFRESHED→INITIAL_SESSION→barrier-settled，owner在barrier后释放。显式捕获initialize outcome并分别等INITIAL与outcome，不用Promise.all早拒绝/race提前释放。**不是生产接线**，不证明已有singleton能事后收编或可重建绕过缓存；错误/refresh失败、卸载、恢复事件、原生存储/生命周期尚未验证。独立限定审查 **APPROVE_DIAGNOSTIC_AND_SUCCESS_PATH_FEASIBILITY_ONLY**。

下一实现边界已收敛到共享客户端首次构造/单一事件桥，而非仅延后Provider监听。现有服务有lease内和lease前首次getter两类调用；无参initializer在已有lease内等待idle会自锁。App初始URL/URL事件effect未以authLoading门控，不能靠Loading界面假定冷启动认证链接不会先执行。因此下一轮先补错误和PASSWORD_RECOVERY连续性，再接一次性owned初始化与真实调用链；不抢先替换同步getter而引入登录/恢复回归。

**因果隔离与成功路径可行性子步完成，App排他修复仍未完成，NO-GO、正式设计0/20不变。** 本轮正常套件/TypeScript/安卓未重跑，不挪用历史133/133；两个RED保持未通过。所有存储/HTTP/JWT/RN host均合成，不是实际签名、Auth/RLS、SecureStore或Android验收。保留QA仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，不含近期修复；无新构建安装、云SQL/RLS/迁移/权限/Edge部署、真实账号密码验证码对象、主机网络/机器人/付费商店动作。既有Docker/WSL决定仍待答复，不重复请求。证据：`artifacts/release-readiness/20261017-initial-session-isolation/integration.json`及final日志/分场景观测/review；门禁`docs/runbooks/AUTH_INITIAL_SESSION_OWNERSHIP_GATE.md`新增本轮段落，旧artifact保持不可变。

## 2026-10-17 07:25 轮：确认初始监听读取的本地排他缺口；保留失败回归，修复尚未完成

按上轮未验并发边界继续，不重复Docker/WSL/CIM、构建、模拟器、Logo或浏览器阻断。先写验收，使用installed Auth SDK 2.112.3、真实Provider/authService/coordinator/fence/fetch，Native配置autoRefreshToken=false；React Native host、JWT、存储、HTTP和终端/资料边界为合成夹具，supabaseClient模块由真实SDK auth seam替代，不是安卓/SecureStore、真实Auth、RLS或云端验收。本轮**产品源码未改**，只新增可复跑的独立RED、证据和修复门禁。

实际最终复现 **exit1，0 pass / 1 fail，无skip/todo/cancelled**：SDK initialize完成后先确认refresh=0且存储未变；随后另一operation持有真实协调器，Provider挂载窗口内SDK初始监听读取仍发起refresh **1次**，合成轮换refresh token已写入；外部owner仍busy，终端登记0、资料查询0、prepared key=null。证明同runtime排他约定存在SDK隐式读取入口，业务准备仍被挡住；**不证明真实账号接管、RLS绕过或撤销会话复活**。保留三次逐步加固夹具的原始记录；不把重复RED计为通过。最终夹具SHA **`3c0cc05317ed02cd2f71d2c173c1469af4245f4f37aedaa2966fbd17c0eddf47`**，每次观测独立timestamp+pid/wx，历史证据不覆写；Node语法检查exit0仅是语法，不是行为通过。

独立只读审查 **VALID_BOUNDED_RED_WITH_CAUSAL_WORDING_LIMIT**：完整createClient构造时自身也注册Auth listener，Provider又注册一条，SDK可合并refresh。因此本轮未隔离两者的单独因果贡献，不认定只有Provider callback发起；下一步必须包括共享客户端/内建监听的初始化顺序。简单延后Provider监听可能漏掉一次性的PASSWORD_RECOVERY，不能当成完整修复。门禁明确要求真实初始读取完成前持有排他、恢复事件连续性、卸载/effect重放及竞争操作回归，不改SDK私有字段或用提前race释放lease。

**缺口确认子步骤完成，认证排他修复未完成；发布NO-GO、正式设计0/20不变。** 299项App输入0变化，前轮21条文件绑定均一致；本轮不重跑未改正常套件，不挪用上轮133/133抵消新RED。保留QA仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，不含近期修复；无新包/原生通过、云SQL/RLS/迁移/grant/Edge部署、真实账号/密码验证码/对象、主机网络、机器人或付费商店动作。环境问题仍待既有答复，不重复提问；下一本地子步先加监听路径隔离对照，再实现统一拥有的初始读取与事件生命周期。证据：`artifacts/release-readiness/20261017-initial-session-ownership/integration.json`、final-red/confirmed-red、各observation和review；门禁：`docs/runbooks/AUTH_INITIAL_SESSION_OWNERSHIP_GATE.md`。

## 2026-10-17 06:55 轮：补齐冷启动断网恢复闭环，修正会话恢复的英文错误提示

沿用发布主线，不启动未获批准的Docker/WSL，不重复CIM/内存、构建、模拟器、Logo或浏览器阻断。先定义冷启动验收，补真实installed Auth SDK 2.112.3与生产Provider/getSession/coordinator/fence/fetch的本地闭环；Android配置保持autoRefreshToken=false，SDK实际INITIAL_SESSION读取不由夹具手工发出。session/JWT、存储、HTTP、终端登记/Profile及RN host均为合成边界，不是安卓、签名、真实Auth或RLS验收。

实际RED复现：断网refresh结束后Provider直接显示英文“Authentication request timed out.”。**唯一产品改动**是在authService.getSession只将精确AuthRetryableFetchError且status=0转成固定中文Error“认证服务暂时无法连接，请检查网络并稍后重试。”；其他错误原样，lease、SDK缓存/权限/重试策略未改。负例覆盖相似名称、非0状态及其他Auth错误。保留原始RED，不用未证实的网络可达性诊断替代修复。

新回归通过：过期synthetic storage→挂起refresh截止→loading=false且无session/profile/prepared/登记，原storage未删除；同一SDK客户端在失败缓存期内手动retry新增网络请求0，虚拟wall clock跨过SDK冷却期后retry请求1并恢复；SDK通知未形成请求循环，卸载后再做一次真实SDK合成refresh且error=null，Provider读取/登记/Profile计数均不增长。首次断网请求实测1、abort1；虚拟时钟压缩retry预算和约60秒缓存窗口，**不承诺生产恢复耗时或每次点击立即联网**。Date.now在嵌套finally恢复，SDK dispose；不修改主机时钟或实际账号。

最终相关Auth/Provider/协调/原生刷新调度与fence回归 **133/133、TypeScript noEmit exit0**，两个子进程exitObserved=true且无执行超时；独立限定审查 **APPROVE_COLD_START_RECOVERY_SLICE**。不重跑未变化的头像111项或将历史结果算本轮通过。当前service SHA **`3e87b0849f091e7a8f14e04cfd62a1bd2e0e70f0692352bfded5671f5b094abd`**；299项App输入仅该项有意变化。上轮26条绑定中23条当前一致，service及两份测试共3处有意更新并记录改前后，不改写历史证据。

**本地冷启动恢复/错误反馈切片完成；完整后端/真实Storage、新APK和安卓真实登录未完成，NO-GO、正式设计0/20不变。** 保留QA仍 **f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265字节，不含本轮及近期修复；未构建安装、未云SQL/RLS/迁移/grant/Edge部署、未真实密码验证码/账号对象/机器人/主机网络/付费商店操作。下一本地安全检查是“挂载前已有外部busy时，SDK INITIAL_SESSION内部读取”的独立并发边界，当前仅记录未验证风险，不宣称已发生越权或已全覆盖。环境决定/资源前置变化后再恢复完整后端与新QA流程，生产部署仍需独立明确范围。证据：`artifacts/release-readiness/20261017-cold-start-recovery/integration.json`、feedback-red、targeted-green、auth-recovery/typecheck及regressions/review。

## 2026-10-17 06:30 轮：修复登录后资料请求无限等待；完成本地超时与显式重试闭环

本轮不重复未变化的Docker/WSL、CIM/内存、构建、模拟器或Logo/浏览器阻断；既有主机操作授权仍未收到，不启动环境。按诊断与测试先行定位真实弱网缺口：Auth请求已有15秒截止，但Provider在session准备lease内等待的 `getProfile()` REST读取不受截止限制，挂起时无法走到loading=false或prepared发布。先定义验收并保留资料GET挂起的断言RED，再最小修复；不是通过Provider外层race提前释放含隐式refresh的lease。

`authRequestFetch.ts`复用现有fetch/body buffer/单调截止/abort/迟到结果隔离，仅新增 **exact `/rest/v1/profiles` + 有效GET** 分类，正确处理Request.method及init覆盖。每次匹配HTTP请求/body默认15秒，timeout返回408/request_timeout和固定中文，不带Auth版本头；Auth/refresh语义原样保留，HEAD、POST/PATCH/PUT/DELETE及其他REST旁路。真实PostgREST SDK收到受控结果后query Promise才结束，lease按原逻辑释放；不承诺整个准备含隐式refresh/本机存储总共15秒，也不把客户端abort当服务器取消。**全局资料GET也覆盖profileEditing保存前读取及清理后校验**：前者失败不给保存成功，后者保留pending日志，不虚报清理完成；写请求/权限不变。

新增Provider闭环实际捕获第二个RED：PostgREST plain error到Provider被泛化为“无法恢复DOSO会话”。`authService.getProfile`现仅将exact request_timeout转固定安全Error“账户资料读取超时，请检查网络后重试。”，相似码/其他错误不改分类。真实Provider+service+coordinator+PostgREST SDK/fetch wrapper验证：首次GET挂起→受控错误/loading=false/无profile或prepared/无自动重发→显式retry一次读取新资料并准备完成→首个忽略abort的晚响应不回滚新资料/key/错误状态。Auth/native/transport仍为合成边界，**不是JWT、RLS、云端或安卓验收**。首次fixture错误假设必有signal导致outer timeout，修正fixture后才记录有效产品RED；其中RED命令后接rg导致aggregate exit0，单独测试进程exit未捕获，证据保留真实fail1，不伪写exit1。旧“profiles GET不受限制”断言随合同变更改为其他REST旁路，补精确GET/Request覆盖、所有写/HEAD旁路、body/单调deadline边界；未删除旧Auth约束。

同时修复 `auth-operation-error.test.mjs` 加载器遗漏真实coordinator导致的10项加载失败，保留真实排他逻辑，不用no-op补洞；这10项不是线上产品失败。最终顺序低并发执行 **Auth/Provider/协调/login 95/95、资料头像111/111、TypeScript noEmit exit0**，三个子进程exitObserved=true、无执行超时。111包含1项既有UNSUPPORTED独立native-runtime CAS表征，不表示该能力已支持，不与旧不同范围116混比。独立限定审查APPROVE_PROFILE_READ_DEADLINE_ONLY，无阻挡发现。生产SHA：fetch **`4a4ae7894fb23a67161c6ecd5be57a942c9a67052f291c836cc784de2f3e6dee`**、service **`c165cab1ac025d854e01ce67e98e86a749f5f694fdcb57df437103e47a22afd2`**。299项App输入仅这2项有意变化；Provider/lease/ingestion fence/supabase接线等未改。Supabase/PGREST/Auth installed SDK均2.112.3，无依赖升级；官方signIn文档可读，changelog.md一次浏览返回不支持的content-type，未循环请求或声称完成changelog扫描。

保留QA仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，**不含本轮修复、上轮隐私正文及两处头像修复**。无新构建/安装/原生通过，无云SQL/迁移/RLS/grant/Edge部署、真实账号/密码验证码/对象或机器人/主机网络/付费商店动作。**本地资料读取恢复切片完成；新QA、完整后端/真实Storage、普通弱网和安卓登录仍未完成，NO-GO、正式设计0/20不变。** 下一项在实际环境前置或既有主机决定变化后恢复完整后端验收及资源门控新QA，不能拿旧包验证本轮修复；生产部署仍需独立明确范围。证据：`artifacts/release-readiness/20261017-login-weak-network/integration.json`、regressions、原始失败/RED及三组最终日志；历史证据不覆写。

## 2026-10-17 05:54 轮：补齐退出后的本机记录说明；未改变退出或数据清理行为

完整资料头像验收仍受测试环境门禁约束；上一轮Docker Desktop/WSL有界诊断与安全启动问题尚未收到批准，本轮没有启动或修复主机环境，也没有重复CIM/内存、构建、模拟器、Logo或浏览器探测。转向可独立推进的隐私说明核对，先写验收，再由独立审查定位一个事实披露缺口：普通退出不会删除持久安装标识，也不会丢弃尚未核对/清理完成的owner-scoped头像操作日志，但原“本机保存”段落没有说明退出后的保留差异。

**只改 `DataPrivacyScreen.tsx` 一行现有正文及一个组件测试**：明确“退出登录不会清除全部本机记录：安装标识会保留，未完成核对或清理的头像操作日志也会保留”。保留日志不含密码/图片内容、注销服务未接通、退出不等于删号的说明；不新增按钮、不承诺留存期限或自动清理，不改auth/session/journal/Storage逻辑、不读取或删除真实本机记录。该句是当前行为说明，不是正式隐私政策或完整数据披露/法律商店验收。其他权限、第三方身份及正式留存范围仍需完整发布隐私审查，不能据此宣称全覆盖。

真实组件输出先 **RED（缺少新增说明）**，最小正文修正后 **6/6回归通过、TypeScript noEmit exit0**；新测试覆盖明/暗与横/竖四组合的显示文本、仅返回一个按钮和返回回调。RN/安全区边界为mock，**不是原生布局、安卓操作或真实退出验证**。独立限定审查 `APPROVE_LOCAL_DISCLOSURE_ONLY`，无新增阻挡缺陷。页面SHA **`493a5b24c628749fe4cdee71932a523b1b7a65ae8094d158f682db5dd8cf16ac`**，测试SHA **`2ccb554f64e0c6324e7f419e8bc2a9b240f65933a157f7fae870ce5021f5c5e8`**。299项非私密App输入仅该页面1项有意变化，其余298项一致；上轮12项绑定证据0漂移。未重跑未变化的后端或头像服务用例。

保留QA APK仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，**不含本轮正文和前两处头像修复**；没有新包/安装/原生通过。不执行云端SQL/RLS/权限/部署、真实账号/密码验证码/对象或机器人、付费商店动作；云端缺失仅沿用上轮带时间的观察，本轮未复查。**本机记录说明切片完成；云端接通、安卓与上线未完成，NO-GO、正式设计0/20不变。** 下一道主线仍是取得既有环境决定并在资源/任务门允许后恢复完整隔离baseline/upgrade和真实Storage生命周期验收，再单独审查部署范围；Logo、普通弱网登录、注销处置/留存等独立阻断未消失。不重复发送同一授权问题。证据：`artifacts/release-readiness/20261017-local-data-disclosure/after.json`（其中sourceBehaviorChanged=false仅指未改变功能逻辑，不否认显示文案变化）、before/acceptance、red/green、typecheck及review；历史证据保持不可变。

## 2026-10-17 05:25 轮：补齐头像直写权限的升级回归准备；完整测试环境仍待解锁

未重试既有Docker/内存/构建/模拟器/Logo阻断。只读核对已配置portable PostgreSQL17.11的extension文件：pgcrypto存在、**pgTAP文件0**；原profile套件还依赖完整Supabase Auth/Storage结构、触发器和先行迁移，已审最小fixture不等价。不能通过补假pgTAP/替换平台函数把合成回归提升为完整验收。Supabase testing/pgTAP当前官方文档已读；本轮无数据库或云端执行。

针对上一轮云端仍有avatar_url UPDATE grant的历史观察，补齐真实升级合同的测试准备：pre-profile seed在旧head记录实际avatar/nickname直写权限，未知/false fail-closed，**不制造grant**；post-upgrade新增8个pgTAP断言，分开检查原始ACL、avatar权限撤销/nickname权限保留、3个保护列、active session、昵称实际更新、头像直写42501和原值保留；原RPC、数据/时间戳/provider保护及Auth-session删除断言均未削弱。42501不锁定本地化错误消息。**只改seed/posttest和门禁runbook，生产迁移/App未改。**

实际文件准备/拷贝preflight **2/2通过**，独立源码审查 **APPROVE_TEST_PREPARATION_ONLY**。**正式SQL未执行，pgTAP/完整升级/Storage行为未验证；新增8条断言不计入已通过数。** seed SHA **`627dbc5faa8a60a430aa2d3df33951e72f5d28d48d33b9618b958a9acf80b33d`**，post-test **`3d85f150d8ce10e11b9ba3ddc2743663ae7cd7d05f12bbeb0cbc6f22a3ae71ee`**。当前299项App输入0漂移；前轮40条绑定记录（38个独立文件）0漂移；旧QA仍 **f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265字节，不含两处头像修复。未重跑上轮合成PG或旧baseline，不改写历史通过范围。

已向森哥提出一个具体环境授权问题：允许下一轮**有界只读Docker Desktop/WSL诊断，并仅在资源允许时尝试启动Docker Desktop**？明确不重置、不卸载、不删卷/数据；配置修改、WSL/系统重启仍须另行确认。截至证据整理未收到批准，主机启动/修复、CIM资源复探、PG/Gradle/模拟器、生产SQL/RLS/Edge与真实账号/密码验证码/对象/机器人/付费商店动作均0。**测试准备子项完成；完整验证环境、资料头像云接通与发布仍未完成，NO-GO、正式设计0/20。** 下一道主线是取得该环境决定并在实际资源/任务门允许后恢复完整隔离baseline/upgrade和Storage验收，不继续把准备层当成上线进度；生产部署仍需独立范围批准。证据：`artifacts/release-readiness/20261017-profile-upgrade-acl/integration.json`、staging-preflight.log、environment-observation/review及 `docs/runbooks/PROFILE_UPGRADE_TEST_GATE.md`。

## 2026-10-17 05:01 轮：资料头像云端前置缺失已确认；跨会话清理恢复补充本地SQL通过

遵守上一轮停止条件，本轮**不重复CIM/内存、Gradle、模拟器、Docker或未变化的Logo/浏览器故障**。选择未阻塞的资料头像后端安全核查，先定义结构查询与隔离恢复回归验收。Supabase当前changelog及Storage/RLS文档已读；权限规则要求检查真实结构但不擅自写生产。现有候选窄审未发现已证跨账号越权，最高价值缺口是“旧Auth session删除后，遗留头像清理可否由同owner新会话安全接续”的覆盖，不据此改生产SQL。

**一次当轮云端只读SELECT**仅查固定catalog、ACL和profile-avatars桶配置，不读profiles/Auth sessions/Storage objects业务行、函数体或凭据。明确缺少：3个资料新增字段、4个exact-signature函数（profile update/cleanup/avatar access/Auth-only helper）、5条头像策略及retirement表；桶查询未返回行，保持本查询上下文限制，不推断物理存在性或原因。现有activeSessionGate存在但未读body，不能当新联合Auth门已部署；authenticated的avatar_url直接UPDATE grant=true只是ACL事实，不代表同账号实际可写或跨账号漏洞。**资料头像云端前置未接齐**；云写/迁移/RLS/grant/Edge部署均0。固定查询和缺失/NULL限制获独立限域APPROVE。

新增 `supabase/verification/local/auth_session_avatar_recovery.test.sql`，最小接入现有 `verify-auth-session-authority.mjs` 的candidate模式；baseline分支不变。唯一任务隔离PostgreSQL17.11、127.0.0.1:65440、全部SCRAM、32MB shared buffers，口令仅合成测试内存/命名管道/子进程环境，不进入明文日志/证据。实际执行真实未改的profile/Auth-session候选：session6真实register→upload→prepare retirement并commit；删除并提交其Auth session后，即使terminal仍active，旧claims SELECT/INSERT/prepare/DELETE/attach均拒绝，object/retirement/profile与epoch保留；同owner新session7注册可接续prepare/delete旧对象metadata，退休path不可reupload/attach，新path可upload/attach。**新复合SQL场景首次通过，无新增产品缺陷或行为RED声明。** 单DECLARE标准化是执行前整理，不算修复App缺陷。

根source guards **3/3**、runner syntax exit0；**实际authority与新recovery psql均 exited/code0/exitObserved，两个末尾marker实际出现，12项输入前后哈希全一致**。独立源码及实际转录审查APPROVE local synthetic only；12条命令退出0，最后owned pg_ctl stop退出0/stopped=true。主方补充只读status对exact owned data dir返回3，PG相关进程0；这项补充在本轮execution.json，不追写PG原始报告。未重跑旧baseline或完整pgTAP/upgrade；Storage SQL metadata DELETE**不是**Storage HTTP/S3/物理字节清除，request claims/fixtures**不是**真实JWT/Auth或在途取消/并发验收。

新SQL SHA **`156d7ba034503787158c065552aadd3f72121a8e5b1ec015d3493b36b27d373c`**、runner **`075f23e813530cdb341ec58805bd214db76b804da856f2b75973e2b602670190`**；生产profile候选仍36ecfea0…、Auth候选c5ebdb05…未改未部署。当前299项App输入与前轮0漂移、前轮20项绑定证据0漂移。保留QA仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，仍不含两处头像客户端修复；本轮新APK/安装/原生/真实认证通过项0。未读私人env/签名/密钥，未改真实账号/密码验证码/对象、主机网络、机器人或付费商店。部署指南新增当前门禁，明确不能照通用示例全量db push或倒序部署Edge。

**只读云结构核验与本地恢复覆盖子项完成；资料头像云端接通、完整DB/升级/真实Storage、新QA及上线仍未完成，NO-GO、正式设计0/20。** 下一门是合适隔离Supabase环境中的完整baseline/upgrade及实际Storage生命周期验收，再请求范围明确、有序的SQL/shared-auth部署批准；不以放宽RLS/direct avatar update绕过缺失后端。账号注销仍需要server-only独立账本和获批设备处置/留存。普通弱网、邮件Logo/云模板、健康安卓目标、地图机器人/iOS条件继续开放。证据：`artifacts/release-readiness/20261017-profile-cloud-preflight/integration.json`、cloud-observation/execution/review，及其绑定的 `20261017-auth-session-authority-2026-10-16T20-55-30-852Z-30b99a0a-f4dd-4eb6-878a-a351bf1377a4/verification.json` / transcript；历史证据不改写。

## 2026-10-17 04:31 轮：单次 QA 构建接线已完成；真实尝试在内存门停止

延续包含两处头像客户端修复的新QA事项，新增 `scripts/qa-build-once.mjs`、测试和 `docs/runbooks/QA_SINGLE_BUILD.md`；App/backend源码未改。CLI仅显式 `--build --report-dir`，核对报告目录/仓库真实路径、`C:/doso-build` junction和旧f313精确字节/SHA。沿用公开配置只读来源和raw-TTY不回显递交、既有parser及允许列表子进程环境；禁用dotenv、普通index入口和非标准功能开关，不继承任意host覆盖变量。旧配置工具未改，未读私人环境/凭据/签名文件，公开值/摘要不进文件、命令行或日志，临时工具内存已清空。

launcher固定直接Java执行现有wrapper JAR，不经cmd/bat；QA bundle任务显式 `--rerun` 后assembleQa、双ABI、no-daemon/no-build-cache/no-configuration-cache、2 workers/no-parallel，避免旧bundle环境复用。任意stdout/stderr只进入分离的有界UTF-8扫描器并丢弃，保留固定任务/成功布尔与实际exit；非零/畸形/超时/中断不能采用产物。20分钟上限和本次owned PID/tree有界清理，独占attempt/锁、构建前后非私密manifest和保留包身份校验。即便成功也只标记 `candidate_pending_metadata`，不复制采用或自动安装。

**工具最终19/19（新launcher7+环境5+预检7）、语法通过、独立限域APPROVE。** 包含真实本地Node exit0/exit37/启动失败/owned超时清理，候选字节/资源等其余边界为合成fixture，不是Gradle/APK/安卓测试。审查与测试先行实际发现两处工具缺口：预先替换的旧包曾被接受、锁清理异常仍留pending候选；行为RED后补core精确旧包pin及 `cleanup_unconfirmed`/primary保真，GREEN。初始缺模块/未实现路径RED只是脚手架，不算App缺陷。

**本轮唯一真实CLI尝试**（20:27:35Z）中，当前Supabase公开配置和其余门通过；fresh可用RAM **1,233,624KiB（约1.18GiB）< 4,194,304KiB**，唯一blocker `insufficient_memory`，最终 `preflight_stopped`。**spawnAttempts0/buildStarts0，execution/candidate=null，299项输入前后0漂移，lockCleanup=succeeded且根锁不存在**。不降低门槛、不关闭用户程序、不轮询/重试；Gradle、新APK、安装/模拟器均0，不称“构建失败”。PTY/PowerShell host报告exit1，Node独立exit未捕获，明确保留未知而不改写成2。公开配置传入和CIM成功不是公网/Auth/原生通过。

launcher SHA **`4ef092cc68fd2afe91c1a6241172dd9a668ed429db7c65e811f07c034558b112`**；当前20份文件绑定、前轮20份绑定证据均0漂移；当前299项App输入也与前轮完全一致。保留QA仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，**不含两处头像修复**。工具链/installed依赖/Gradle缓存与私有签名输入未冻结，不宣称hermetic或完整可复现。无生产写/迁移/RLS/部署、真实账号/密码验证码、对象删除、主机网络/机器人/付费商店；未重试Logo/浏览器或Docker。

**单次构建工具本地切片完成，新QA/原生认证/发布仍未完成；NO-GO、正式设计0/20。** 资源条件变化后，使用新证据目录和同一审查身份做一次fresh gate/尝试，再单独验包名/version/ABI/入口/签名/内嵌配置并SHA命名保留，之后才安排健康安卓目标和真实认证。资源未变化时不循环CIM/构建，转向未阻塞的后端安全/隐私核查；完整DB/upgrade/真实Storage及受审查部署批准、Logo标准对象/云模板、注销设备处置与留存、普通弱网、地图机器人/iOS条件继续开放。证据：`artifacts/release-readiness/20261017-single-qa-launcher/integration.json`、`build-result.json`、`actual-observation.json`、`final-tool-tests.log`、`review.json`；历史证据保持不可变。

## 2026-10-17 04:08 轮：公开配置已在真实子进程安全递交，新 QA 构建仍受内存阻断

目标仍是给两处头像客户端修复出一份新 QA 包。按预先验收做**一次**当前预检：可用 RAM **2,201,272KiB（约2.10GiB）< 4,194,304KiB**，公开配置当时未注入，`ready=false/buildStarts=0`。不降低门槛、不轮询、不关闭用户程序；本轮 **Gradle0、新APK0、安装/模拟器0**。后续配置成功不改写这份point-in-time停止记录。

完成同一事项的公开配置递交子步骤：新增 `scripts/qa-build-environment.mjs`、测试和 `docs/runbooks/QA_PUBLIC_BUILD_ENVIRONMENT.md`。当轮只读确认目标Supabase项目唯一可用现代publishable key，内存中经raw-TTY不回显stdin递交，只构造允许列表子进程环境；固定HTTPS项目地址、普通index入口、dotenv关闭、设计/仿真/诊断/第三方provider开关关闭。不继承任意host环境/运行时覆盖变量，不读取私人 `.env.local`、服务端密钥、签名文件；值/摘要不写文件、命令参数、日志，临时工具内存已清空。原先考虑的旧APK提取方案取消，未解析其bundle。

**最终本地工具12/12（新环境5+预检7）、JS语法通过、独立限定APPROVE。真实Node子进程probe exit0**，固定布尔证明配置到位、目标URL正确、dotenv关闭、普通入口及开关正确、无危险变量；`buildStarts=0/resourceProbed=false/filesWritten=0`。测试先行实际捕获终端CR分帧缺陷，合成LF输入实测被传成CR，RED后补CR/LF/CRLF兼容再GREEN。首个真实probe exit1未记录阶段，仍保持unknown，不用后来的合成结果追溯确诊；假SystemRoot导致Node子进程失败属于已修正的测试fixture，不是App/原生缺陷。256字节是接受输入上限，不是瞬时进程内存分配硬上限。

本轮工具SHA **`20a57b2223be08eb7e0ffda5608013f388001c1dc0b5b2cbeec018450e05d0a5`**；20份当前文件绑定、上一轮19份绑定证据及**299项App输入均0漂移**。App/backend源码未改，客户端仍ea3c426f…；旧QA APK仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，**不含两处头像修复**。未重复未变化的App回归，不把工具通过视作产品通过。无云写/SQL/RLS/部署、真实Auth/密码验证码、账号对象删除、主机网络/机器人/付费商店动作；未重试未变化的Logo/浏览器和Docker阻断。

**配置递交本地子步骤完成；尚无Gradle launcher，新包/原生登录/上线未完成，NO-GO、正式设计0/20。** 下一项将已审查递交通道接入有界单次构建launcher，重新通过资源与配置门后才启动，并绑定前后输入、脱敏日志和新包元数据；构建与安卓/真实认证分开验收。完整DB/upgrade/真实Storage及范围明确的部署批准、Logo标准对象/真实云模板、注销设备处置与留存、普通弱网、健康安卓目标、地图机器人和iOS实际条件继续独立开放。证据：`artifacts/release-readiness/20261017-avatar-client-qa-build/integration.json`、`preflight.json`、`config-handoff-result.json`、`final-tool-tests.log`、`review.json`；历史证据保持不可变。

## 2026-10-17 03:29 轮：账户删除只读影响预览已实现本地候选，未部署或接 App

本轮不重复未变化的Logo/浏览器、Docker、构建或模拟器阻断；按新验收选择未阻塞的账户隐私切片。新增 `account-deletion-preview/index.ts` + `preview.ts`，只接受GET、拒绝query/修改方法，OPTIONS沿用现有CORS。production入口注入真实shared `authenticate(request)`默认active account/caller-RLS session门禁，不传bypass。唯一额外查询是userDb下 `devices` 的head/exact count，绑定已验证caller的owner_id并限定is_demo=false；只返回 `hasVisibleBoundPhysicalRobot`，不返回数量、账号/设备/会话/头像/provider标识。scope明确是当前caller-RLS视图，合法count0绝不等于全局无绑定、已解绑或可删除。

固定 `planning_only`、`canSubmit=false`、`requestCreated=false`、`executionAvailable=false`；机器人处置、留存/脱敏、provider撤销、server头像清理、在途命令/登记、独立executor/ledger六项始终阻断，有可见实体机器人仅增加decision blocker，不替森哥选择策略。认证/终端RLS过滤或撤销→固定401/403且不查设备；计数未知/缺error/错误/null/非安全非负整数/throw→固定503，不能当0。成功/错误/OPTIONS/origin拒绝均no-store/no-cache，原始错误不返回也不记录。无request/job/audit/email、freeze/revoke/unbind/delete、Auth Admin/Storage/RPC调用。

测试先行：初始缺入口ENOENT仅脚手架；随后候选宽松error判断对缺error回复实际200/期望503，保留行为RED，严格error===null与count安全整数后GREEN。补真实production index/handler/http/shared auth编排（SDK/env为mock），method/query/CORS、caller-owner/physical过滤、非法/撤销/RLS-filtered会话、fixed schema、secret canary及错误无日志；另runtime forbidden-operation代理+source guard防止被吞掉的best-effort写调用。**根最终Node preview11+shared auth14=25/25；离线固定Deno2.5.6函数全套80/80（新增6）；final index+TS test显式typecheck exit0、Node syntax通过、独立限定APPROVE，无阻挡缺陷。** Deno运行未授allow-net/write，CORS helper只读3个非秘密DOSO_ALLOWED_*进程变量；这些仍不是托管JWT签名/Auth撤销、真实DB/RLS或Storage/原生验收。

App隐私屏幕、SQL/schema/grant、shared auth/http均未改；预览**未部署、未接入生产App**，不是完整数据影响清单、二次认证、App/web注销发起或商店合规证明。部署必须按reviewed SQL依赖/联合Auth-session门禁先安装验收→shared Edge auth→preview的顺序，仍需范围明确的生产批准；本轮无云写/真实账号、密码验证码、撤销删除、对象/网络/机器人/付费商店动作。完整注销执行与所有产品/留存决策继续未完成。

预览核心SHA **`9d75fe49701c6fbfc20955918c351e6525172ff1d36f426e5b289338126cf3f0`**、入口 **`26b877001ac6da338277f92ca25d140990538054697b5114c0787b1a1bad58c6`**；Auth SQL候选仍c5ebdb05…未改。根末次核对**299项App输入0漂移、前轮12项绑定证据0漂移**；保留QA包仍 **f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265字节，不含头像客户端修复，Edge预览也不是靠打APK部署的。README/runbook已区分本地preview候选与尚未实现的request/execution，历史证据不改写。

**只读预览本地切片完成；账户删除整体/新QA/原生登录未完成，NO-GO、正式设计0/20。** 下一项优先在当轮资源/公开配置门允许时继续单次新QA构建，避免反复拿旧包验收；完整DB/upgrade/真实Storage与受审查部署批准先于任何生产预览接线。Logo等补传/浏览器网络前置变化再验；机器人处置/留存未获选择，不推进破坏阶段。证据：`artifacts/release-readiness/20261017-deletion-readonly-preview/integration.json`、strict-count red/green、root-preview-and-auth.log、deno-functions.log、typecheck-result.json、review.json。

## 2026-10-17 02:52 轮：当前构建资源仍不足；邮件标准 Logo 对象确认缺失

先读取AGENTS/最新状态与相关工具/证据，保护144项既有tracked修改。按本轮预先验收执行**一次修正后的预检**：RAM **4,141,656KiB < 4,194,304KiB**，公开配置未注入进程，`ready=false/buildStarts=0`；不降低门槛、不轮询或关用户程序，Gradle/新包/安装/模拟器动作均0。独立复核前轮13份绑定文件、旧APK及299项当前manifest全一致，路径集合无新增/缺失/变化；根最终再次核对299项前后0漂移和前轮13项证据0漂移。当前客户端仍ea3c426f…，旧包仍 **f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e**、77,340,265字节，不含两处头像客户端修复。

资源停止后转到未闭环邮件Logo：**当轮只读SQL**仅查email-assets及两个公开品牌对象的存在布尔，bucket public=true、标准 `doso-robotics-wordmark-email-29dea10fd204.png` **不存在**、旧 `DOSO.png` 存在。唯一一次标准URL匿名GET通过现有 `--logo` 入口执行，7个本地原生模板/2172×724 RGBA/196,202字节本地资产校验通过，但GET网络失败、exit1、**未取得HTTP状态或正文，不冒充404**。另只读generated suite检查13文件一致/exit0。标准本地资产SHA仍 **29dea10fd2048cf016ddc9fa4bc9bafaf30ff891187e6f0fb09a8efea6a0de3c**；不是通过改本地HTML或换旧图可闭环的问题。

延续此前对该标准文件补传的明确授权，有限尝试现有控制台：浏览器选择/库存可用，按URL绑定30秒超时；读documented troubleshooting后按库存确认的同一标签ID再绑定20秒仍超时。**页面正文未读、click/type0、upload未开始**；未新开或关闭用户标签、未绕过控制限制/安全提示，不切换其他控制技术。`--remote`需要Management PAT且会接触raw smtp_pass后仅归一化为presence，故本轮不运行，不读凭据、不查Auth模板、不PATCH/同步/发信/改桶权限。已读Supabase当前changelog和Storage文档；无云写、迁移/RLS/权限或账号动作。

**本轮只读核验子步骤完成；新QA包、邮件Logo恢复、云模板和原生认证未完成，NO-GO、正式设计0/20。** 最小人工动作：在现有DOSOrobotics → Storage → email-assets根目录补传 `C:/doso-build/assets/brand/doso-robotics-wordmark-email-29dea10fd204.png`，保持文件名，不覆盖旧图、不改权限；若提示同名冲突则停。补传或浏览器/网络前置变化后再验证对象及公开MIME/字节/SHA，托管模板和真实收件箱仍分开验收。构建须等资源/配置门满足后单次执行，不能用旧包验收新修复；未变化时不再循环相同Logo/浏览器故障。未改产品/工具源码，不重复83项mock测试或App全套；13生成文件检查不是云端通过。完整DB/Storage与范围明确的部署批准、普通弱网登录、注销隐私、健康安卓目标、地图机器人/iOS条件仍开放。证据：`artifacts/release-readiness/20261017-qa-client-build/integration.json`、同目录preflight/review及 `20261017-email-logo-readonly/observations.json`，历史证据保持不可变。

## 2026-10-17 02:43 轮：新 QA 包在资源门停止，补齐可重复的只读构建预检

本轮优先给前两轮头像客户端修复出新 QA 包；核对没有并行构建/模拟器，确认 `C:/doso-build` 是当前仓库 junction，不能当临时副本清理。正式启动前可用 RAM 降为 **2,464,452KiB**，低于先定义的 **4,194,304KiB（4GiB）** 门槛，因此 **Gradle 启动0、新包0、安装0、设备/网络动作0**，未关闭用户程序或循环重试。转为完成同一构建事项的只读准备子步骤，不声称整项完成。

新增 `scripts/qa-build-preflight.mjs` 与测试：CLI只接受现有证据目录、不提供build入口；一次CIM观察后对未知/低内存、竞争任务、dotenv未禁用、缺少公开配置或非普通入口明确阻断。输入manifest覆盖App/index/src/assets/plugins/锁文件及ignored Android源/Gradle，排除生成输出、`.env*`、keystore、local.properties等私密输入，不读取或hash它们；目录链接或缺失必需输入停止。实际只读预检 **18:35:34Z** 的RAM **3,517,080KiB** 仍低门槛，构建进程也没有注入所需公开配置，`ready=false/buildStarts=0`。此观察不是第二次构建尝试，未等待/轮询资源。Supabase只读确认现代客户端publishable配置存在，仅保存在工具内存，不回显值、不写配置文件或命令行、不读服务端凭据；这不代表App已联网或配置已注入。已读当前changelog和官方API-key文档；未迁移key、部署或改云端。

独立审查发现旧预检谓词可能漏掉命令行不含emulator文字的QEMU子进程。用**真实PowerShell过滤6个合成进程对象**复现RED `[3,4]`，改成emulator/QEMU按名称识别，通用Java/Gradle/Node另按构建命令识别，GREEN `[1,2,3,4]`；生产CLI与测试使用同一常量。最终 **工具7/7、2份JS语法通过、独立限定APPROVE**。旧 `preflight.json` 不覆盖，不把新谓词追溯归给旧观察；独立RAM/config阻断使旧停止结论不受影响。初始模块/函数未实现和证据脚本相对路径错误属于脚手架，不算App缺陷或产品RED。未改产品源码，不重复未变化的App测试/typecheck。

**299项非私密输入前后0漂移**；与旧包manifest排除旧debug.keystore条目后同为299项，仅 `src/services/profileEditing.ts` 一项差异，当前SHA仍 **`ea3c426f81f17c54c4c53b2c31d6493b87c84b94bd2c55978eb49e6e689e7ea9`**。保留旧QA APK仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，**不含两处客户端修复**。manifest不冻结私有签名输入、installed node_modules/缓存或完整工具链，不宣称完整可复现；key格式不能单独证明项目归属。Edge/SQL候选未改、未部署，重打App也不会部署它们。

**只读构建准备完成，新包/安卓/认证未完成；NO-GO、正式设计0/20。** 下一轮先用当前修正工具做一次新的point-in-time预检；资源与公开配置门均通过后，以允许列表子进程环境注入当轮只读确认的公开配置、禁用dotenv，单次构建普通入口QA包，再核对前后输入、package/version/certificate/内嵌bundle并保留旧包。不能用f313验收新修复，也不能把预检/出包算原生通过。完整DB/Storage与范围明确的部署批准、普通弱网真实登录、邮件Logo云模板、注销隐私决策、健康安卓目标、地图机器人及实际iOS条件继续独立保留。证据：`artifacts/release-readiness/20261017-client-fixes-qa/integration.json`、`preflight.json`、`qemu-predicate-red.log`、`qemu-predicate-green.log`、`review.json`。

## 2026-10-17 02:11 轮：共享Edge身份门改走调用者RLS，注销预检尚未实现

原计划推进只读注销预检，检查发现其共享前置 `authenticate` 用service-role查询终端可见性，未显式经过本地Auth+DOSO联合RLS合同；先收窄修此前置，不新增preview/request/job。当前上游Auth的getUser可能已校验session，托管精确版本及真实撤销未验证，**不声称已发生线上绕过或事故**。按最小权限规则选择复用现有caller RLS，不增加public RPC、不授予auth.sessions读取、不暴露private helper、不用有写副作用的heartbeat作校验。

保留原公开authenticate签名/默认值、getUser、账户/role/AAL检查；抽出显式SDK factories的authenticateWithClients可测核心，production wrapper仍仅用真实工厂。先保持旧行为抽取，再实际RED：service terminal模拟active而caller RLS返回null，旧逻辑仍成功；改成一次token-bound userDb查询后同用例GREEN，service terminal query为0。第二实际RED是终端回复缺error字段仍误放行；严格error===null、id非空string、revoked_at===null后GREEN。查询仍绑定getUser确认的user id及JWT session id，错误/过滤/畸形/撤销一律拒绝，无service-role fallback。register的requireActiveSession=false仍不要求预存终端；Auth-only写前门禁仍必须由SQL候选提供，不能归功于此跳过分支。

**最终新增14/14行为检查、既有Deno函数74/74、显式Deno auth.ts typecheck exit0；syntax/diff检查通过，独立窄审限定APPROVE，无阻挡源码缺陷。** Node执行真实auth/http源码，SDK边界在独立VM注入mock，禁止真实env/createClient；不证明JWT签名、托管Auth版本或数据库RLS。Deno为本地单元/源合同检查，不是线上provider/机器人调用。当前changelog.md一次20秒请求超时已停止；官方sessions文档正常读取。CLI只读migration new --help，未生成迁移，未升级依赖。无真实账号/session/密码/验证码/对象操作、云写、迁移/RLS/grant、Docker/模拟器/构建/网络/机器人/付费/商店动作。

**必须作为“SQL候选及依赖先安装并验收→Edge后部署”的有序单元审查**；旧terminal-only RLS不建立新的Auth-session保证，本轮不部署或默许部署。共享auth SHA **`729cdf6b566d5cbd1730af80a7e796e0da256c15ec1e9b78e99847318a0c1f96`**，测试SHA **`2e857fe1e0396c2f38f79aed03f76b5f259963b11dbd93fbc54faed1340849ee`**；Auth候选SQL仍c5ebdb05…未改。客户端仍ea3c426f…；保留QA APK仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，旧包不含前两轮客户端修复，且重打包不会自动部署后端。02:11核对300项构建输入仍仅profileEditing.ts一项漂移、上一轮10份绑定证据0漂移；历史证据不覆盖。

**本地共享门禁窄修完成；注销预检/完整注销、后端上线和原生验收未完成，NO-GO、正式设计0/20。** 下一轮优先检查现有构建任务与源码身份后，构建一份包含前两轮头像修复的新QA包，避免继续验收旧包；不因模拟器阻断重复原实验，也不把APK更新当后端部署。注销preview继续为独立待办，设备处置/留存未获选择；完整DB/升级、Storage HTTP/字节、托管撤销、普通弱网真实登录、安卓、邮件Logo云模板、地图机器人及iOS实际条件继续保留。证据：`artifacts/release-readiness/20261017-edge-auth-caller-gate/integration.json`、两组red/green日志、`root-edge-tests.log`、`deno-auth-typecheck.log`、`final-functions-tests.log`、`review.json`。

## 2026-10-17 01:26 轮：修复头像清理不完整回复误报成功；账户删除仍未实现

按交接检查账户删除/头像先后顺序，确认当前App只有如实标注“尚未接通”的隐私说明，没有产品删除入口、durable job、完整服务端执行链。普通头像cleanup与revoke_all依赖active account/session；先冻结/撤销后再串联这些用户态接口会失权，先删Auth又会CASCADE profile与普通retirement证据。设备owner SET NULL也不是安全解绑或重新认领策略。新增文档明确server-only独立删除账本、限制新写入与已知引用快照的受审查事务/锁协议、在途请求结算与Storage API最终清单；不能先无门禁快照再冻结，也不能把空metadata视作物理字节擦除。机器人处置/留存仍待批准，异步询问了仍绑定机器人的两种产品规则，未假定用户选择，不执行注销。

本轮找到并修复一个现有客户端真实缺陷：Storage remove回复含目标name但缺error字段，旧 `!error` 仍返回removed，可能清掉待核对journal。先新增真实service/journal回归，**RED actual removed / expected pending**；最小改为严格 `error === null`、数组data、精确name，原用例GREEN。再补malformed返回矩阵、已回滚孤儿清理保留原业务错误，以及account/session失效时保留committed debt且不调用Storage DELETE。缺字段/未知不立即重发，已确认profile保存不回滚。不是实际Supabase曾返回该异常形状或线上事故声明；本机SDK类型明确成功形状含error:null。

**根回归116/116、typecheck exit0，独立窄审APPROVE，无新增HIGH/MEDIUM。** 116中115项正向/约束，1项既有UNSUPPORTED独立native-runtime CAS表征，不表示修复该能力。测试执行真实本地service/journal/UI代码，SDK/持久化/RN边界为mock，不冒充Storage HTTP/图片字节、完整DB/升级或原生验收。本轮无真实账号/对象删除、密码/验证码、云写、迁移/RLS/权限、Docker/模拟器/构建重启、网络改动、机器人、付费或商店操作。

源码 `profileEditing.ts` SHA **`ea3c426f81f17c54c4c53b2c31d6493b87c84b94bd2c55978eb49e6e689e7ea9`**；保留QA包仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，未重打包，**不含上轮post-arm身份重检及本轮清理回复修复**。01:20核对300项构建输入仍仅该源文件1项漂移；01:19核对上一轮9份绑定证据0漂移。候选迁移未改未部署。证据：`artifacts/release-readiness/20261017-avatar-cleanup-proof/integration.json`、`targeted-red.log`、`root-regressions.log`、`typecheck-result.json`、`identity.json`、`review.json`；历史证据不覆盖。

**头像清理证明窄修完成；账户删除发布能力未完成，NO-GO、正式设计0/20。** 删除lane下一步先做经审查的server-side request/preview/blocked状态垂直切片，不进入任何未批准的破坏性阶段；设备处置/留存决策、正式DB/升级与真实Storage、普通弱网登录、安卓运行环境、邮件Logo/云模板、地图机器人与iOS实际条件继续独立阻断，不重复未改变前置条件的实验。

## 2026-10-17 01:01 轮：正式会话夹具和资料升级入口已对齐，完整数据库运行仍待验证

沿用资料/头像安全主线，先定义本轮验收，不重跑相同合成PG或安卓构建。5组当前head数据库测试补31个有效合成Auth `(session_id,user_id)` 配对，资料升级seed另补1个，共32个；终端未登记、撤销、账号暂停及故障注入仍进入各自目标分支，不以缺Auth会话遮蔽失败原因。Outbox另加一个明确不seed的登记负例，断言42501 `auth_session_inactive` 且terminal/outbox/audit均零新增。资料测试补当前头像protected-current/不retire、旧对象retire及幂等、missing/foreign、ledger权限、restrictive policy不能被宽松policy绕过、准确删除一次、retired-missing和禁止复用；先释放quota再断言重传拒绝，避免配额错误冒充退役保护。另分开测试active terminal但Auth owner错误/删除，以及登记不能复活已删除Auth会话。

发现并修复原资料升级runner没有装入Auth候选的测试盲点：`--profile-editing-only` 现在按profile→Auth authority顺序装入tail，旧边界已含outbox依赖；升级SQL补删除Auth行后仍有active terminal的拒绝断言。默认username两条历史场景及其SQL未扩张为当前candidate覆盖。真实文件staging preflight输出可核对计划，临时目录递归清理前校验exact direct-child/name/non-symlink/realpath；未启动数据库或执行迁移。脚手架回归先有1个缺计划RED，修复后GREEN，再补默认历史边界回归。**最终11/11源码一致性、安全候选保真和实际文件预检通过；syntax/diff检查通过，独立限定APPROVE，无HIGH/MEDIUM，两处LOW已清晰化。** SQL新增断言未执行，不称SQL RED/GREEN。

**正式Supabase pgTAP、isolated upgrade SQL、Storage HTTP/图片字节、云端部署及安卓均未运行。** 现有Docker运行阻断未重复尝试/修复；Storage配置仍disabled；独立PG不是完整Supabase环境。资料候选和Auth候选迁移未改/未部署，未改生产权限或真实账号。01:00前后核对300项构建输入，仍仅上轮 `profileEditing.ts` 1处既有漂移；59份上一轮绑定证据0漂移。资料正式test SHA **`bc23c52c8027796bcb9be946024e1afc390df320a0ce0edf66ad740cec5ecb02`**，升级runner SHA **`334254a4b2427bc4ecaa2da802be33f111c959f23976c2ae7078d4a627d87159`**。保留QA包仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，旧包仍不含上轮客户端修复；本轮无新App构建输入改动。只移除本轮工具自动生成的合成预检临时目录，无实质用户数据删除。

**本地测试准备切片完成，后端生产接通未完成；NO-GO、正式设计0/20。** 完整运行环境可用后先跑正式数据库与资料升级，不把预检当升级通过。环境未变时下一项转向本地账户删除/头像先后顺序审查与最小实现；真实Storage/部署范围批准、普通弱网登录、安卓、邮件Logo云模板、隐私、地图机器人与实际iOS条件仍独立阻断。未读私有环境/凭据，未操作真实密码/验证码/账号删除、主机网络、机器人、付费或商店。证据：`artifacts/release-readiness/20261017-formal-auth-fixtures/integration.json`、`final-source-and-preflight.log`、`identity.json`、`review.json`；历史证据未覆盖。

## 2026-10-17 00:32 轮：Auth 会话联合门禁完成本地数据库候选验证，未部署

继续资料/头像安全主线；先定义验收，用 CLI2.115 的已查帮助生成新候选 `20261016155923_require_auth_session_authority.sql`，**未改历史迁移、生产RLS/权限或真实账号**。私有 Auth-only helper 同时核对 `auth.sessions.id/user_id`；shared gate 再要求相同用户/会话的 DOSO terminal 未撤销。登记终端只查 Auth helper，避免要求 terminal 预存在；在任何登记/邮件/audit 写入前拒绝缺失会话。新候选完整保留最新本地 outbox 登记函数，source test 证实移除唯一guard后逐字相等；不回退首installation保持、邮件去重/限流及审计。内部 helper 不开放 execute，不给客户端 Auth 表SELECT。

**实际测试先行**：历史helper在真实本地PG17.11接受已删除合成会话，固定断言失败/psql3，保留为 owner-only 逻辑RED，不冒充客户端权限测试。随后新候选在 **authenticated角色** 通过共享门禁，真实登记入口却仍接受缺失会话，命中第二个固定RED；加入3行Auth-only guard后最终 SQL **psql0 / runner0 / stopped=true / 11输入无漂移**。本轮最终运行在schema写入前核对独立data_directory、127.0.0.1:65440及6条SCRAM HBA；00:32独立检查PG进程/端口监听均0。最初 malformed named-pipe 转义错误在initdb前停止，单列为脚手架错误，不算产品RED；第二stage原report保持EXPERIMENT_INCOMPLETE，不改写成整体PASS。

已在本地实际证明：有效会话正常资料读写/头像SQL读写与清理；Auth会话删除提交后的fresh事务拒绝上述操作（DELETE目标已先retired）；另一有效会话不受影响，外来归属/缺失/畸形/终端撤销组合拒绝。无terminal的有效会话可正常首次登记，重复登记保留first installation、outbox仅1、audit2；缺Auth会话固定42501且terminal/outbox/audit计数无新增。**source guards3/3通过，独立限定APPROVE本地候选**。未独立调用revoked-terminal再次登记；audit状态逐项先后/retention布尔未另断言，不能扩大为邮件全行为验收。未变化App源码不重复typecheck/UI全套。

**边界仍严格**：只证明READ COMMITTED删除提交后的新快照，不取消in-flight，也不保证RR旧快照或既有signed URL立即失效。Auth/JWT/GUC/base schema为合成fixture；Storage SQL不等于HTTP/图片字节，outbox前缀不等于邮件worker/投递，非完整Supabase升级或pgTAP。至少8组正式测试手填session但未seed Auth行需逐一对齐，不可机械给负例补有效session。生产门槛继续包括完整升级/真实Storage、安全复审、删除头像与身份的顺序、retirement预算/privileged边界及范围明确的部署批准。

本轮只读云端catalog确认目标Auth表id/user_id均uuid、postgres有SELECT而authenticated无SELECT；shared helper/登记body未见Auth表引用，当前托管登记也未见本地outbox表引用。**这不是实际撤销/线上事故测试，也不允许把新候选单独部署到旧托管合同。** SQL SHA **`c5ebdb05a342c45ebc458617549285f8af47d9d4bc763dc876d19ccbd987dc76`**。保留QA APK仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节；300项构建输入仍仅上轮 `profileEditing.ts` 1处漂移，旧包不含上轮客户端修复。本轮无新包/安卓/SDK/Docker/主机网络/机器人动作，无真实密码、验证码、撤销或删除。

**本地候选切片完成，生产接通未完成；release NO-GO、正式设计0/20。** 下一项收窄到正式Auth-session测试夹具与完整升级/Storage验证准备，不再启动相同数据库实验或安卓构建。普通网络真实认证、邮件Logo/真实模板、注销隐私、安卓运行环境、地图机器人与iOS实际条件仍独立保留。证据入口：`artifacts/release-readiness/20261016-auth-session-authority/integration.json`；最终真实数据库证据：`artifacts/release-readiness/20261017-auth-session-authority-2026-10-16T16-29-32-427Z-0dafd3da-f2b5-4027-988d-bc177cfbb212/verification.json`。历史证据未覆盖。

## 2026-10-16 23:43 轮：修复头像日志等待期间切号仍派发请求的窗口；后端安全审查不批准部署

按上轮交接转回资料/头像安全审查，未重试 SDK create、模拟器、网络或构建。先写本轮验收，再用真实 service/journal core、模拟 SDK/持久化边界复现：replace 在 arm 等待中切号仍 upload 1 次；remove 同样切号仍完成 RPC。两者均实际 RED→GREEN：现在 arm 完成后重新 `getUser` 校验 expected user，成功才置 dispatched 并发请求；切号或重查失败不 upload/RPC/cleanup，保留 uncertain 记录。**这是 user-id 重检，不是 session/token 原子固定**，同账号换会话、隐式 SDK refresh、最后重检到派发之间和其他 runtime 仍有边界；保守保留的 uncertain 记录可能阻止后续编辑，不能擅自清账。

只改 `profileEditing.ts` 和对应测试；新增4例覆盖替换/移除等待切号、两分支重查失败和正常延迟保存。最终 **107/107 本地检查通过，typecheck exit0**；其中106项正向/约束，1项既有 UNSUPPORTED 跨 native runtime CAS 表征，非该能力修复。初次全套103/107的4个旧fixture按 getUser 序号切号，新增重检使触发提前；已改成上传已分发、模拟 RPC 成功、DELETE 应答的明确 SDK 边界切换，保留原断言，无删测试。初次截断输出保留，不作完整日志；最终输出完整。独立窄审 APPROVE 此客户端增量及fixture调整，不代替原生/后端验收。

**后端候选另判 REQUEST CHANGES**：发现 HIGH `P1-PROFILE-AUTH-SESSION-AUTHORITY`，仓库 `private.is_session_active()` 只查 DOSO terminal 未撤销，不查 `auth.sessions`；若 Auth 已退出/删除会话而 terminal 仍active，未到期JWT仍可能被此数据库门禁接受。官方session文档支持检查session_id对应行；这是源码审查风险，**本轮未查托管定义、未实际撤销测试、不是线上事故声明**。还保留账户删除先清头像/再删身份的顺序缺口，以及正式pgTAP未覆盖prepare/retirement和真实Storage HTTP/字节的覆盖缺口；历史12项合成PG并发证明不替代这些。现有增长/限流、旧客户端顺序、privileged直写边界仍开放。SQL/生产权限未改。

Docker Linux engine pipe 本轮只读检查仍不存在，未重启修复；有既有独立PG工具链不等于完整Supabase环境。23:41复核300项构建输入仅 `profileEditing.ts` 1处漂移。源码 SHA **`64ab20a4b8e73c413a94c966475a72ccbbd028b87cc9254c7af146b2b93258c0`**；保留QA包仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节，**不含本修复**，无新包/原生通过。未读私有环境、未操作真实账号/密码/验证码/撤销/删除、生产迁移/RLS/权限、机器人、付费/商店或主机网络。

**客户端窄修完成，资料头像生产接通未完成；发布 NO-GO、正式设计0/20。** 下一项优先给 Auth session 联合门禁补本地数据库反例及最小候选修复，保持 active terminal + 缺失Auth session 拒绝、其他有效会话不受影响；完整升级/pgTAP/Storage API与安全复审通过后才提出范围明确的生产部署批准，不直接修改共享已部署迁移。普通/弱网真实认证、安卓运行环境、邮件Logo/真实模板、注销隐私、地图机器人与iOS实际条件继续独立保留。验收、RED/GREEN、最终根测试、review与源码/包身份：`artifacts/release-readiness/20261016-profile-dispatch-fence/`；历史证据未覆盖。

## 2026-10-16 23:16 轮：独立环境创建一次失败，尚未进入系统或 App 验证

新资源检查 RAM8,741,876KiB，且首个写动作前再次通过资源/磁盘、无设备/模拟器/Gradle、唯一新目标、exact源码/工具/JAR/marker/APK门。仅新建 task-owned空home `D:/DOSO/android-avd/qa-isolated-20261016`，**实际调用 installed avdmanager create 1次**，固定结果 **`avd_create_failed`**；没有第二次创建、补修或删除。调用方未序列化既有异常Data，故 **transportStatus=null、exitCode=null**：因为发送了固定 `no`+CRLF，同一阶段可能是 stdin_failed 或 nonzero_exit，**不能断言已证非零退出，也不能用后续catalog exit1回填**。actual argv及环境观测边界已保存在 `creation-result.json`，根因未知。

**创建失败；OS首启/系统基线/安装/App冷温启动均未到达**，emulator/build/install/App/runner/UI采集/网络配置写入均0。新home保留且entries0，无AVD目录/registry/config；原AVD及其非私密registry/config hash不变，原userdata/encryption/qcow2与私有环境未读/未复制。后续仅各一次help/device/target只读CLI诊断：两条catalog各自证实nonzero1，设备/API存在性仍unknown而非“不存在”；help有固定标记不证明工具健康。原collector的失败时false默认保留，`diagnostic-interpretation.json` 提供权威null/marker-only解释。SDK localPackage正确、Java24.0.1存在都不构成健康或根因证明。本轮不再SDK/设备动作。

新增 **1份纯本地测试+3份无SDK副作用fixture**，生产工具/helper与产品源码未改。根实际表征 **supported4 / knownUnsupported1**：无空格相对BAT入口+普通/分号参数、同入口含空格参数、UTF8无newline输入、fixture非零37保真均通过；带空格BAT入口组合稳定nonzero1。保留最初expected-success RED，最终PASS是**表征断言通过，不是修复了不支持的行为**；真实SDK入口无空格，不能据此归因SDK，fixture也未覆盖Java/SDK或实际 `no`+CRLF输入。PS解析0/Node fixture语法通过；未重跑未变化产品测试。独立限定APPROVE该创建失败/停止及表征证据，不批准SDK根因/原生/发布验收。

23:12:05复核300项构建输入、9项沿用工具/测试源、前10轮203份历史证据均0漂移；模拟器/Gradle/CLI/fixture残留进程均0。QA包仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节；runner **`e795855047413d4ca2e68e3c57878c00a408032cbd87fe8cb18316e51cf8ae15`** 本轮未执行；新表征test SHA **`ace4a7aa70cc00c504e4e91b28f357cae197a614e3fad592a75e0722b3c1d36b`**。

**本轮原生尝试未完成；NO-GO、正式设计0/20，新增完整原生通过0。下一轮优先转回资料/头像后端本地安全审查，不重复create。** SDK共享启动/错误捕获独立留为阻断；未来新创建实验必须先完整捕获固定诊断、另立明确的一次性目标与验收，不在此空home重试。真实认证/普通弱网、完整账号隔离、资料头像接通、邮件Logo/云模板、注销隐私、地图机器人及实际iOS条件仍开放。未操作账号/密码/验证码/因子/撤销/删除、生产迁移/RLS/权限、云端、机器人、付费/商店或主机网络。证据：`artifacts/release-readiness/20261016-native-fresh-validation/integration.json`；实际创建以 `creation-result.json` 为准，本地表征见 `root-cmd-characterization.log`。

## 2026-10-16 22:42 轮：新数据初始化前置已澄清，隔离实验因内存门未执行

**已解决上轮预检假设：`userdata.img` 不是本机唯一合法的初始化来源。** 只读检查实际 CLI classpath 选择的 tools19 `sdklib.core.jar`/`AvdManager.class` 字节码，`createAvdUserdata` 在旧文件缺失时，若 SDK `image/data` 是目录即返回；目录也缺失才抛错。exact API35 google_apis x86_64 SDK 中 `data` 非 reparse 且有官方 **`empty_data_disk`** 标记（107字节、SHA `e4dc7c33a83013f3d9eb9b5a5693c912e83a9c7f978933b5c7600039dbfde903`）。这是 SDK 原生选择标记，**不是107字节磁盘镜像，也不是人工拼造的替代品**；未读取/复制原 AVD 私密数据。

独立审查核对官方 **emu-36-1-release**：从 unpacked data 目录准备 userdata，非 fold 的该标记选择原生空 ext4 创建，并检查产出/空间、传播初始化或加密失败。根直接核对官方 API35 data tree；两条 qemu 文件网页在根通道不可达，采用独立 reviewer 已读取的官方源码证据，不循环重试。**该分支不是本机36.5.11精确源码 tag；二进制 marker 字符串与静态分支均不等于本机已格式化、加密或首启成功。** 本轮只建立初始化准备契约，修正“必须有旧模板”的过严条件，历史未运行事实不改判。SDK 正常启动可能内部使用 host ADB key；自动化未读、输出或哈希密钥内容，不声称 SDK 内部零私密数据访问。

已另写冻结的一次性隔离实验验收：新home/name/path/serial5556、受支持的 native data-dir gate、先OS launcher-only/无aerr双采样；健康后才首次安装精确 f313 QA 包并一次 e795 runner，unsafe即停，保留原 AVD、不 wipe/copy/manual image/download/repair。**但实际创建前命令在 `resource_gate_failed` 停止：22:37:11 可用 RAM 3,554,836KiB，低于5,242,880KiB门槛；emulator/Gradle/ADB设备均0，新home不存在。** New-Item/avdmanager实际调用、模拟器启动、构建、安装、App/runner/UI采集和网络写入均 **0**，未重试资源门或关闭用户程序。这是动态实验 **未执行/未评估**，不是 SDK/AVD/App 失败，也没有原生新增通过项。

22:41:36 复核 **300项持久化构建输入、9项沿用工具/测试源、公有 SDK 契约材料和前9轮195份历史证据均0漂移**；原非私密 registry/config hash不变、私有环境及原userdata/encryption/qcow2未读/未复制。QA APK仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节；runner **`e795855047413d4ca2e68e3c57878c00a408032cbd87fe8cb18316e51cf8ae15`** 未改、本轮未执行。无产品/工具/测试源码修改，不重跑未变化单测。独立限定 APPROVE 只批准静态更正和保守资源停止，不批准启动/产品验收。

**静态初始化契约子项完成；独立环境/原生UI/认证未完成，NO-GO、正式设计0/20。** 下一次原生机会重新检查当时的全部资源、身份、新目标唯一性和无设备门；满足后直接按 `experiment-acceptance.json` 执行，不再重复模板研究。若资源仍不足，转向未阻塞的资料/头像后端本地安全审查，不重复轮询内存。真实认证/普通与弱网、完整账号隔离、资料头像后端接通、邮件Logo/真实模板、注销隐私、地图机器人及实际iOS条件仍开放。未操作账号/密码/验证码/因子/撤销/删除、云端/生产迁移/RLS/权限、主机网络、机器人、付费/商店。本轮证据：`artifacts/release-readiness/20261016-native-userdata-contract/integration.json`、`installed-contract.json`、`resource-stop.json`、`identity-verification.json`。

## 2026-10-16 22:08 轮：独立安卓对照停在新数据初始化前置门，未创建或启动设备

本轮选择独立 fresh-data QA 环境对照，不再重复原 AVD 或扩张窗口标题诊断。已先定义验收与一次性创建目标：新进程局部 `ANDROID_AVD_HOME=D:/DOSO/android-avd/qa-isolated-20261016`、新 AVD `DOSO_API_35_QA_20261016`、serial5556，保留原路径及账号数据；同一已安装 emulator/API35 google_apis x86_64 镜像，先 OS launcher-only/无固定 aerr 基线，再安装精确 f313 包并仅一次 offline runner，unsafe 即停。仓库没有现成的安全 AVD 创建脚本；开发启动脚本需 Metro/adb reverse、旧设计截图脚本可能点错误控件，均不复用。独立只读审查批准此验收边界和保守停止。

资源读取为可用 RAM **8,770,880KiB**、D盘剩余 **975,910,346,752 字节**，emulator/Gradle/ADB设备均 0；已安装 emulator **36.5.11.0/build15261927**、command-line-tools **19.0**、API35镜像 metadata revision9。**实际创建前脚本在 `local_image_missing` 门停止：system.img/vendor.img/ramdisk.img/kernel-ranchu 均存在，但同一 SDK 目录没有 `userdata.img`。** 新 home/path/registry 都未创建，avdmanager 实际调用 **0**、模拟器/构建/安装/App/runner/UI采集/网络写入 **0**；没有复制原 userdata/encryption/qcow2，也没有手造空镜像、下载或修复 SDK。

这是 **precondition_not_met / no device action**，不是新原生测试失败或 App 缺陷，也不能据此称 SDK 损坏/不完整或所有新版本都不能创建数据。官方命令行文档描述初始 userdata 模板；泛化上游 source 中可空 init 路径不足以证明本机版本的格式化/加密/首启契约。首次命令提交的额外括号为整段未执行的 PowerShell parse 脚手架错误，修正后的预检才抵达上述门；不算产品 RED 或第二次创建。诊断和结构化验证流程使本轮在设备动作前停止，而非把存在 metadata 当作可启动证明。

22:06:28 身份复核：300 项持久化构建输入、9 项沿用工具/测试源身份、前八轮 **44+15+19+13+25+20+14+38** 份历史证据均 **0 漂移**；私有环境及原 AVD 的 userdata/encryption/qcow2 未读/未复制，仅只读哈希非私密 registry/config 并核对配置白名单。保留 QA APK 仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265字节；runner **`e795855047413d4ca2e68e3c57878c00a408032cbd87fe8cb18316e51cf8ae15`** 未改、本轮未执行。不重跑未变化的测试，不复用上轮原生观察作为今日通过。

**前置核查子步骤完成，独立对照/原生 UI/认证仍未完成；NO-GO、正式设计0/20，新增原生通过项0。** 下一项收窄为只读核实本机新 userdata 初始化契约：确切 CLI帮助、镜像元数据与对应官方源码，确认缺失模板时创建/格式化/首启的支持及失败语义；证据不足则另立有明确边界的隔离创建实验，不能复制现有数据或直接重试。本轮不再设备动作。真实认证/普通和弱网、完整账户隔离、资料头像后端、邮件 Logo/真实模板、注销隐私、地图机器人及实际 iOS 条件仍开放。未改账号/密码/验证码/因子/撤销/删除、生产迁移/RLS/权限、云端、主机网络、机器人或付费/商店。证据：`artifacts/release-readiness/20261016-native-fresh-avd/integration.json`、`identity-and-precondition.json`。

## 2026-10-16 21:51 轮：窗口标题诊断在安卓运行，未匹配 QA 进程名，原生验收仍阻断

本轮只完善 **QA 诊断工具和测试**，未改产品源码、构建、安装或操作账号。新窗口分类器分别接收一次 `dumpsys window displays` 和一次 `windows` 的当前快照；仅在焦点窗口 ID/完整标题/user0、系统 owner、窗口边界与固定 aerr 标记全部符合时，输出闭集种类和预期标题匹配状态。不读取完整 `-a`/历史 ANR/trace，不保留任意标题、进程名、UID、原始 dump 或其摘要。PowerShell 独立检查并重建固定 schema；读取/分类失败只记 read_failed/unknown，不改变 unsafe 冷启动判定、跳过 warm 或最终清理。**两次快照不是原子的；2MiB 是读取后的解析输入限制，不是进程传输内存硬上限。**

根最终 **窗口分类 14/14、真实 CLI/严格 schema/7 类读取失败或不可用输入、生产动作与清理边界、原 runner 回归均 PASS**；既有错误保真 32 场景、真实本地子进程 6、飞行模式命令契约 7 通过，5 份 PS 解析错误 0、3 份 JS 语法通过。独立源码审查 APPROVE 这一诊断切片。真实 RED 包括遗漏探测、重复/畸形 focus/owner 误收、无关尾窗口导致 false unknown、PS 空数组未落入固定 schema 错误；模块缺失、PS5.1 引擎和采集脚手架错误分别保留，不冒充产品缺陷。以上是工具/合成测试，不算原生或认证通过。

一个保留数据 DOSO_API_35、**一次**运行 runner **`e795855047413d4ca2e68e3c57878c00a408032cbd87fe8cb18316e51cf8ae15`**。设备内 APK 与保留 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265 字节一致；窗口 helper **`5d1618ac73a78c728e81e4838e03e15ababe8ecef599f98bd7199c6d2bb27761`**、CLI **`dfc21531be3a21a601d0ae7594ebec6f00d4c4ce33cbd9e2b16b0cce0bd151b8`** 已绑定在实际 schema5 结果中。verifiedOffline=true 后才冷启动，launch ok/PID present/准确 MainActivity resumed；仍只证明进程/活动子步骤。

**UI 仍 unknown/foreign，framework4、app0/input0，aerr_close+aerr_wait，safeForWarm=false。新增实测窗口诊断为 `captured / anr-title / not-confirmed`**：两个当前快照中观察到格式合格的系统错误窗口，标题形态符合“未响应”类型，但未精确匹配预期 QA 进程名。**不能据此说另一个 App 出错，也不能确诊 DOSO ANR、错误关联的实际进程或根因。** 未点击/输入/继续 HOME/warm，未二次采集或重跑；最终 bounded_incomplete。

临时 XML 删除、最终 force-stop、网络恢复均 succeeded；只读独立核查 App absent/stopped、0/1/1 + default present 与本次 runner 基线一致。首次独立核查的 success-only pidof 包装遇预期非零退出而未产出报告，单独记为采集脚手架错误；随后只读 `ps -A -o NAME` 精确 QA namespace 检查与 package stopped 核验完成，没有再启动 App 或写网络。一次 exact PID/AVD gate 的退出已 ACK；**21:50:14 +08:00 确认本轮拥有进程 0、serial 消失、Gradle 0**。不声称相同网络身份、公网/Supabase/普通或弱网通过。300 项持久化构建输入和前七轮 44+15+19+13+25+20+14 份历史证据于启动前均 0 漂移，私有环境未读；本轮不再设备动作。

**诊断工具及本次窗口观察子项完成；产品/原生 UI/完整生命周期仍未完成。NO-GO、正式设计 0/20，新增完整原生通过项 0。** 下一项先评估独立干净 QA AVD 的对照条件和资源预算，保留现有 AVD/账号数据、不卸载或清空；先定义 OS 健康基线与停止条件，再决定同一 QA 包的有界对照，不继续叠加标题推断或盲点错误按钮。真实登录/会话与普通/弱网仍阻断；资料头像后端、邮件 Logo/真实云模板、注销隐私、地图机器人和 iOS 条件继续开放。未改密码/验证码/因子/撤销/删除、生产迁移/RLS/权限、主机网络、机器人或付费/商店。实际结果：`artifacts/release-readiness/20261016-native-window-attribution/native-run/native-result.json`；工具测试、身份和边界见同轮 `local-verification.json`、`identity-verification.json`、`integration.json`。

## 2026-10-16 20:59 轮：安卓隔离恢复本次通过，首次识别到 framework 错误控件面，UI 仍未验收

本轮未改产品/工具源码、构建、安装或重跑未变化的单测；一个保留数据 DOSO_API_35，**一次**执行已审查 runner **`940d0905e1c58d4b0414f8ed3bd7280719b3cad125091aa68e493c1d29c80a54`**，设备内 QA APK 与保留 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`** 完全相同（77,340,265 字节）。本次移动数据步骤没有复现失败，**verifiedOffline=true** 后才冷启动 App，launch ok、PID present、准确 MainActivity resumed；清理三项均 succeeded，开关和默认网络有无类别恢复到本次 captured baseline。**只证明本次隔离/恢复与冷进程子步骤，不证明移动数据问题普遍修复、公网/Supabase/普通或弱网通过**。schema4 在设备产出，所有 transport diagnostic 为 null；非零退出/超时等失败分支没有在本次设备执行中触发，历史失败仍保留未知退出码。

**新增原生观察：UI unknown / foreign，4 个节点全部为固定 framework 类别，app0/input0；识别出 `android:id/aerr_close`、`android:id/aerr_wait`，safeForWarm=false。** 这首次将原先无法分类的外部节点收窄为“系统 framework 拥有的错误控制面标记”，不是 App 登录页或可交互 UI。**不能据此确认错误关联 DOSO 进程，不能断言 ANR/崩溃类型或根因，更不能归因认证/网络。** 按停止条件未点击/输入、未继续 HOME/前台恢复或第二次采集，最终 bounded_incomplete；原生 UI/完整生命周期仍未通过。

独立只读闭环确认 App 无进程且 stopped=true、0/1/1 + default present 与 runner baseline 一致，额外网络/应用动作 0。仅一次 exact AVD/PID gate 的 owned-stop，20:57:18 确认拥有进程 0、serial 消失、Gradle 0。300 项可持久化构建输入 0 漂移，前六轮 44+15+19+13+25+20 份证据 0 漂移，私有环境未读；本地未保存原始 XML/截图/logcat，远端临时 XML 已删除。独立审查 APPROVE 有界采集和停止边界；不批准产品/UI/认证验收。

发布仍 **NO-GO、正式设计 0/20，新增完整原生通过项 0**。下一项是核验系统错误窗口与 QA 进程的关联：先确认可白名单化的固定窗口/owner 字段，只记录匹配布尔或闭集状态，不保留任意标题/文本、trace、logcat 或私有数据；无法确认就保持 unknown，不点击错误控件或推断根因。本轮不再启动设备。真实登录/会话、普通/弱网、完整账号隔离、资料头像后端、邮件 Logo/云模板、注销隐私、地图机器人及 iOS 条件仍开放。未操作账号/验证码/密码/因子/撤销/删除、云迁移/RLS/权限、机器人、付费/商店或主机网络。实际结果：`artifacts/release-readiness/20261016-native-transport-validation/native-run/native-result.json`；完整身份与边界：上级 `integration.json`。

## 2026-10-16 20:34 轮：子进程错误诊断已在本地补齐，安卓阻断尚未复测

继续上轮移动数据阻断，仅改 **4 份 QA 工具/测试文件**，无产品源码、构建、安装、模拟器、ADB 或网络动作。进程失败现在只附带闭集 **nonzero_exit / timeout / start_failed / stdin_failed**；仅 nonzero_exit 保留真实非零 Int32 退出码，其余为 null。catch 边界要求固定阶段异常、精确两个保留键、精确大小写及合法状态/数值组合，再重建固定对象；伪造或不一致元数据折叠为 null。主错误在 finally 前保留，各清理步骤各记自己的诊断，schema 升至 4；不改变动作、停止、恢复或验收判定，也不保留原始 stdout/stderr、参数、异常内容或这些内容的长度/摘要。

**根最终：真实本地子进程 6 场景 PASS，错误保真/校验 32 场景 PASS，真实 CLI/PS runner 回归 PASS，飞行模式命令契约 7 场景 PASS，5 份 PS 解析错误 0。** 实际覆盖 exit37、负 Int32 exit-7、UTF-8 正常返回、启动失败、超时及其任务拥有子进程关闭、真实 stdin 中断；合成 OS 边界执行生产 catch/freeze/finally/result，证实 primary37 与 cleanup41 独立、不残留旧诊断。日志 canary 命中 0。独立审查先指出固定阶段/键集归属缺口，修复并补反例后最终 APPROVE。真实 RED 为实际子进程退出码丢失、伪造阶段元数据和额外键被接受；`worker-provenance-red.log` 是测试漏导入 getter 的脚手架错误，**不冒充行为或产品 RED**。

候选 runner SHA **`940d0905e1c58d4b0414f8ed3bd7280719b3cad125091aa68e493c1d29c80a54`**，**尚未在设备运行**。保留 QA APK 仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265 字节；300 项可持久化构建输入 0 漂移，前五轮 44+15+19+13+25 份证据 0 漂移，私有环境未读；模拟器/Gradle 进程 0。未重跑未变化的产品测试或构建，不把本地进程测试算作安卓、真实网络或认证验证。

**本工具子项完成；上轮 offline_data_failed / restore_data_failed 仍失败，精确退出码/根因未知，不补写历史；原 unknown UI 未解决。发布 NO-GO、正式设计 0/20，新增原生通过项 0。** 下一项先重新核对当前任务、候选身份和设备基线，再安排后续单次有界采集，离线未确认不启动 App，失败/未知即停；不更换数据命令、不加回退或立即循环重试。真实认证/普通与弱网、完整账号隔离、资料头像后端、邮件 Logo/模板、注销隐私、地图机器人及 iOS 条件仍开放。未操作账号/验证码/密码/因子/撤销/删除、云迁移/RLS/权限、机器人、付费/商店或主机网络。证据：`artifacts/release-readiness/20261016-native-transport-diagnostics/integration.json`。

## 2026-10-16 20:11 轮：非目标窗口诊断工具已补齐，安卓复测在移动数据命令处停止

本轮只改 **4 份 QA 工具/测试文件**，未改产品源码、构建或安装。分类器新增 10 个固定外部节点类别计数，任意包名只折叠为 other；仅保留 exact android/SystemUI 所有的 4 个固定 aerr 控件 ID，不保留任意包名、文本、输入值或其摘要。PowerShell 独立检查精确字段、整数范围、总数、标记白名单/唯一/排序，再重建固定输出；结果 schema 升至 3，历史不改写。**foreign/mixed 仍一律 unsafe**，标记不授权交互，也不单独证明目标 App 崩溃或 ANR。根最终 **分类器 11/11、真实 CLI/PS runner 边界 PASS、错误保真 14 场景 PASS、3 JS 语法及 3 PS 解析通过**；分别保留类别、标记、PS schema/排序 RED→GREEN。独立窄审 APPROVE，仅工具切片。

沿用 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265 字节 QA 包；设备内哈希相同。一个保留数据 DOSO_API_35，**一次**运行新 runner **`14d73a0917726c22a6be8622b5393f75a6aa772383f996eb1e3f405e5447dfdf`**。本次 primary 为 **`offline_data_failed`**，cleanup 独立为 **`restore_data_failed`**，最终 force-stop succeeded；offline=false、cold=null、warm 未到达，**App 启动和 UI 采集均 0 次**，新外部诊断未在设备执行。固定 `svc data` 阶段的 ADB 子进程失败已定位，但没有退出码/错误类别，不能断言权限、服务、能力或根因；不沿用上轮隔离成功当本轮成功。

失败后没有重跑、命令回退或额外网络写入。只读核查 App 无进程且 stopped=true，开关 0/1/1 + default none 与本次 runner baseline 相同；**这不将实际失败的恢复步骤改判成功，也不证明公网/Supabase/普通或弱网通过**。仅一次经 exact AVD/PID 校验的 owned-stop，20:09:55 确认拥有的进程 0、serial 消失、Gradle 0。独立结果审查确认上述边界。300 项可持久化构建输入 0 漂移，之前 44+15+19+13 份证据 0 漂移，未读取私有环境。

**诊断工具子项完成，原生 UI/生命周期仍未完成；发布 NO-GO、正式设计 0/20，新增完整原生通过项 0。** 下一项先在进程边界增加固定 transportStatus 和非零退出码的隐私安全诊断及纯本地测试，分别保留 primary/cleanup；不补写本次未知值、不立即再试，也不未经证据更换移动数据命令。真实认证/会话、普通与弱网、完整账号隔离、资料头像后端、邮件 Logo/云模板、注销隐私、地图机器人和 iOS 条件仍开放。未操作账号/验证码/密码/因子/撤销/删除、云迁移/RLS/权限、机器人、付费/商店或主机网络。证据：`artifacts/release-readiness/20261016-native-foreign-diagnostics/integration.json`；实际失败以 `native-run/native-result.json` 为准。

## 2026-10-16 19:24 轮：系统服务隔离/恢复已在安卓验证，UI 采集仍落在非目标节点

沿用 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`** QA APK（77,340,265 字节），只启动一个保留数据的 DOSO_API_35，**一次**执行 runner **`45828664324395bdde594ff0870c1ac9ee93c2340de040cc4417eb0e74c857d0`**。未改产品/工具源码、未构建/安装或重跑未变化的源码单测。设备内包哈希相同；系统服务飞行模式命令及 radio/default 检查实际达到 **verifiedOffline=true**，才继续 App 冷启动。脚本记录 launch ok、PID present、准确 MainActivity resumed：**网络隔离与冷进程冒烟子步骤已验证**，不等于页面或认证通过。

UI 结果为 **unknown / foreign，4 个总节点、0 个 App 节点、0 个输入节点、无白名单 marker、safeForWarm=false**。按停止条件未点击、未输入、未继续 warm，也未重跑采集器。当前证据不能识别是哪一个外部包/窗口，更不能据此断言系统弹窗、崩溃、键盘或采集模式就是根因。正常非 Preview/Design QA 的 LoginScreen 源码直接包含表单，并无单独的零输入欢迎页；这只排除一种源码猜测，不是原生页面证据。最终 **bounded_incomplete**，完整 UI/生命周期仍未通过。

三次早期只读采样均为 0/1/1 + default none；**runner 启动时重新记录的 baseline 已为 0/1/1 + default present**，不能混用。清理实际完成临时 XML 删除、最终 force-stop 和恢复，runner 核验 exact binary switches 与默认网络有无类别均与其启动 baseline 相同；19:21 独立只读检查再次确认 App 无进程且 stopped=true、0/1/1 + present，无额外网络写入/runner/App 启动。不声称相同网络身份、公网/Supabase/普通或弱网已通过。19:22 确认本轮拥有的模拟器全部退出、serial 消失、Gradle 0。

独立审查 **APPROVE 有界结论**：隔离、恢复和冷进程/活动子步骤成立；页面、认证状态、离线提交反馈和 warm 不成立。300 项构建输入 0 漂移，之前 44+15+19 份证据 0 漂移，未读私有环境；所有历史失败不改判。下一项：**先补隐私安全的固定外部窗口类别/计数诊断，再安排后续一次原生采集**；任意包名/文本必须折叠为固定 other，不输出/哈希；foreign/mixed 继续 safeForWarm=false，不放宽判定或盲点系统窗口。本轮无进一步原生动作。

发布仍 **NO-GO、正式设计 0/20**；新增完整原生验收项 0。真实登录/会话恢复、原生 UI/前后台、普通/弱网、完整账号隔离、资料头像后端、邮件 Logo/模板、注销隐私、地图机器人和 iOS 条件仍开放。未操作账号/密码/验证码/因子/撤销/删除、云迁移/RLS/权限、机器人、付费/商店或主机网络。实际结果：`artifacts/release-readiness/20261016-native-service-mode/native-run/native-result.json`；完整身份与边界：同目录上级 `integration.json`。

## 2026-10-16 18:55 轮：已定位广播步骤失败，系统服务命令候选修复通过本地回归

本轮按新 schema-2 runner **只执行一次**受控诊断：校验并启动一个保留数据的 DOSO_API_35，设备内 `com.doso.robot.qa` APK SHA 与 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`** 相同，77,340,265 字节；无构建/安装/账号操作。实际执行 runner SHA **`fea434d0ff910c6b321abe2a8975305700bebfc0db4b469b7d63613227ceabfb`**。这次 primary 明确保留 **`offline_airplane_broadcast_failed`**，cleanup 独立保留 **`restore_airplane_broadcast_failed`**，最终 force-stop succeeded。证据已定位原函数的广播步骤，但未保存原始 stderr，**不能断言具体 OS 异常/权限错误**。offline=false、cold=null、warm 未执行，本轮 App 启动 0 次、原生通过项 0；旧 unknown UI 仍未复测。

失败后没有回退命令、第二次 runner、额外网络写入或 App 重试。只读核查 App 无进程且 stopped=true、开关 0/1/1 与 baseline 相同，但默认网络类别由初始 none 变为 present；**不能称网络完整恢复，也不能推断类别变化由哪一步造成**。按 owned-stop 要求退出本轮模拟器，后续确认拥有的进程 0、serial 消失、Gradle 0。真实失败与读后核查保留，不被源码修复覆盖。

随后只改工具源码：依据 [AOSP ConnectivityService 固定实现](https://android.googlesource.com/platform/packages/modules/Connectivity/+/a88b07db09/service/src/com/android/server/ConnectivityService.java) 与 [AOSP CTS 用法](https://android.googlesource.com/platform/cts/+/66b49a2d09addaeabed5672fd94d30a430a31f67/tests/tests/location/src/android/location/cts/TestUtils.java)，将手工 settings+broadcast 替换为单一 `cmd connectivity airplane-mode enable|disable`，并无参数回读 exact enabled/disabled。仍由系统服务检查权限，不提权、不修改权限，不加旧路径回退；失败、读失败或状态不符固定报错即停，原有更广的网络状态检查保留。**候选 runner SHA `45828664324395bdde594ff0870c1ac9ee93c2340de040cc4417eb0e74c857d0` 尚未在设备执行**，不将源码测试冒充兼容性通过。

先 RED（实际旧函数发出旧契约命令）再 GREEN。根最终 **7 个 airplane 命令契约场景 + 14 个 provenance 场景 + 原 runner 行为/真实 Node 传输回归 + 分类器 7/7 PASS，4 份 PowerShell 语法错误 0**；独立窄审 APPROVE 源码候选。300 项构建输入 0 漂移、前两轮 44+15 份历史证据 0 漂移；未读私有环境，产品源码及 QA 包未变。下一项只对新候选做一次受控设备验证，先观察 fresh baseline，离线未确认不启动 App；失败/未知 UI 即停，不重复构建或试命令。

发布仍 **NO-GO、正式设计 0/20**。原生 UI/冷温生命周期、真实认证、普通/弱网、完整账号隔离、资料头像后端、邮件 Logo/模板、注销隐私、地图机器人和 iOS 条件仍开放。未操作密码/验证码/账号/因子/撤销/删除、云迁移/RLS/权限、机器人、付费/商店或主机网络。完整执行/源码候选区分见 `artifacts/release-readiness/20261016-native-isolation-diagnosis/integration.json`，原生结论以 `native-run/native-result.json` 为准。

## 2026-10-16 18:24 轮：原生 runner 错误保真已修复，待带新证据做隔离诊断

本轮收口上轮发现的工具缺陷，未启动模拟器、ADB、App、构建或安装，也未改网络隔离命令。主流程的 outcome/phase/verdict 在清理前冻结；临时 UI 删除、最终 force-stop、网络恢复分别保存状态和固定错误码，多项失败不再互相覆盖。任一必需清理失败会令最终结果 failed，主流程的 passed/bounded_incomplete 仅保留在 primary 字段，不再形成假通过；结果 schema 升至 2。网络清理状态明确区分 not_touched/unconfirmed/verified_offline/restored；恢复失败要求外层结束本轮拥有的模拟器，停止 App 未确认时仍不重连，也不再将未验证离线称为已隔离。

先实际复现“主错误被恢复错误覆盖”和“恢复失败未要求结束模拟器”两项 RED，修复后 GREEN。**根最终 14 个 provenance 场景 PASS、原 runner 行为/真实 Node stdin/no-stdin 回归 PASS、分类器 7/7 PASS、3 份 PowerShell 语法错误 0**。新增测试执行真实初始化/catch/冻结/finally/汇总/结果语句，仅以合成动作和 OS 边界替身刺激，不是原生 OS/真实云端验证。最初一次测试参数大小写冲突是 fixture 错误，单独保留，不冒充产品 RED。独立窄审 APPROVE（审查时 13 场景；根另补第 14 个多清理失败的确定性汇总场景），批准范围仅工具修复。

身份：runner SHA **`fea434d0ff910c6b321abe2a8975305700bebfc0db4b469b7d63613227ceabfb`**；保留 QA APK 仍 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**、77,340,265 字节。300 项可持久化构建输入 0 漂移；上轮清单绑定的 44 份历史证据 0 漂移；未读取私有环境；模拟器和 Gradle 进程均 0。源码、测试和证据身份见 `artifacts/release-readiness/20261016-native-error-provenance/identity-verification.json`。

**工具子项完成；真实隔离失败原因、旧 unknown UI 和原生冷/温生命周期仍未解决。** 不修改上轮 network_restore_failed 历史结论；目前仍不能断言广播或哪条命令失败。下一项：先核对任务/设备状态，再用新字段做一次受控隔离诊断，拿到确切 primary 与 cleanup 阶段后选择修复；离线未确认不启动 App，遇失败停止，不添加静默回退。发布仍 **NO-GO、正式设计 0/20**，真实认证/普通网络/弱网、完整账号隔离、资料头像后端、邮件 Logo/云模板、注销隐私、地图机器人及 iOS 条件仍开放。本轮未操作账号/验证码/密码/因子/撤销/删除、云迁移/RLS/权限、机器人、付费/商店。完整证据：`artifacts/release-readiness/20261016-native-error-provenance/integration.json`。

## 2026-10-16 18:10 轮：隐私安全采集工具补齐，原生复测在网络隔离阶段停止

本轮只改安卓 QA 工具，不改产品源码、不构建或重装。新增固定白名单 UI 分类器、UTF-8 stdin CLI 及有超时/清理的原生 runner。登录/注册必须满足完整 QA 包内固定 ID，混合/重复/外包/活动不符/额外敏感输入均不能触发 warm；加载、恢复错误、权限或未知状态仅诊断、不继续操作。**根最终分类测试 7/7 PASS，真实 Node stdin/no-stdin 传输和实际 runner 动作/finally 的 AST 行为测试 PASS，3 份 JS 与 2 份 PowerShell 语法通过。** 这些是工具/合成测试，不是 App 原生验收或产品缺陷修复。早期测试环境/作用域失败日志保留。

实际启动一个已校验、保留数据的 DOSO_API_35 模拟器。首个 runner 在 `device_not_ready`、任何 App/网络动作之前停止；修正传输返回值污染、多 Node 候选和现代 Android `~~` 安装路径识别后，经只读检查、完整本地回归和独立复审，才继续尚未执行的首次冷启动流程。两次 runner 证据分目录保留，没有重启模拟器或盲目重试 App。

续行确认设备内 APK SHA 为 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**，与保留的 `releases/20261016/DOSO-0.0.1-qa-f3135f77.apk` 相同，**77,340,265 字节**；此前 300 项可持久化构建输入 0 漂移，不读取/保存私有环境摘要。随后初始 force-stop/网络隔离流程失败，最终记录 **`network_restore_failed`、verifiedOffline=false、cold=null、warm 未执行**。**本轮实际 App 冷启动 0 次，不能声称定位了旧 unknown、UI/前后台/离线反馈通过。** 原始执行失败阶段被清理失败覆盖，是 runner 的证据缺口；不能凭最终阶段断定具体系统命令根因。下一轮需先分别保留主错误与清理错误，再据明确的失败阶段选择并验证 API 35 兼容命令，不增加静默兼容回退。

失败后未再启动 App 或改网络。18:09 的只读复查确认 App 无进程且 package stopped=true，airplane/wifi/data 为 **0/1/1**，与本轮初始值相同；默认网络**有无类别**同为 present。此为失败后的独立核查，不改写 runner 的失败结论，也不代表相同网络身份、Supabase/公网/普通网络/弱网已通过。本轮 baseline 与上轮 none 不同，旧网络结论不能沿用。18:10 确认已退出本轮拥有的模拟器、serial 消失、拥有的进程 0、Gradle 进程 0。

发布仍 **NO-GO、正式设计 0/20**。真实认证、完整账号隔离、原生 UI/前后台、普通网络/弱网、资料头像后端、邮件 Logo/真实模板、注销隐私、地图机器人和 iOS 条件仍开放。本轮未操作真实账号/验证码/密码/因子/撤销/删除、云迁移/RLS/权限、机器人、付费/商店或主机网络。下一项限于修复上述隔离与错误保真问题，再做有边界的原生验证，不重复构建。证据：`artifacts/release-readiness/20261016-native-ui-classification/integration.json`；实际运行以 `native-run-transport-fixed/native-result.json` 为准。

## 2026-10-16 17:08 轮：新 QA APK 已构建并覆盖安装，原生离线界面尚未确认

已把前几轮认证源码修复纳入**一个新的真实安卓 QA 包**：`releases/20261016/DOSO-0.0.1-qa-f3135f77.apk`，**77,340,265 字节**，SHA-256 **`f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e`**。16:58:06 +08:00 `:app:assembleQa` 成功，Gradle 报告 **3 分 41 秒**；正常 `index.ts`/AuthProvider 入口、内置 JS bundle 2,786,568 字节，不是网页、Preview 或 Design QA。包为 `com.doso.robot.qa`、versionCode 6、`0.0.1-qa`，arm64-v8a/x86_64，INTERNET 存在、cleartext=false；apksigner v2 通过，沿用 Android Debug 证书 `fac61745…1033b9c`。**这是内部 QA 制品，不是生产签名/商店候选。**

301 个构建输入在构建前后核对一致，包含旧包缺少的 5 个 auth runtime 模块。本轮审查指出不宜长期保存私有环境摘要，故新清单只留 **300 个可持久化输入**；另 1 个 `.env.local` 仅在内存比较，已移除本轮清单中的摘要，历史清单不改写。不声称这一私有输入可由证据独立复现。构建日志环境值回显扫描计数 0。启动 wrapper 的耗时字段因变量笔误给出 0，未用于验收；保留 Gradle 真实耗时，无第二次构建。本轮无产品源码修改；此前 14+191 本地测试为上轮证据，不冒充本轮新测。

启动一个已校验、保留数据的 DOSO_API_35 模拟器（API 35/x86_64），未 wipe/恢复快照。17:02:13 **`install -r` Success**，设备 base.apk SHA 与交付包相同，firstInstallTime 仍为 `2026-08-28 20:16:07`；未卸载、清数据或读取私有存储，**不等于会话恢复通过**。旧 APK 保留。

原生执行的最高完成项是**受控离线冷进程冒烟**：wifi/data 关闭、飞行模式开启、active default network=none；`am start -W` Status ok / COLD / 1676ms，PID 3464 在等待 20 秒后仍存活，MainActivity resumed，按 PID 过滤的 fatal 计数 0。但采集器仅识别到 **unknown UI、0 输入节点**，不能判断是页面状态还是采集规则不足，**未验证登录态/离线反馈，也没有前后台切换通过**。按停止条件不再操作 App，不进入任何账号、MFA、资料或控制页面；未进行普通网络/弱网/真实认证。没有保存 raw UI、截图、raw logcat 或账号内容。

App 在恢复网络前已 force-stop，模拟器 airplane/wifi/data 已精确恢复为原值 **0/1/1**，前后 active default network 都是 none，不能声称普通网络可用。dumpsys 中出现的 VALIDATED 只是诊断文本 token，不算 active validation。17:06:56 向本轮拥有的模拟器发送一次退出；17:07:58 确认 serial 消失、原模拟器进程均结束、Gradle 进程 0。首个退出校验只因控制台额外空行保守拒绝，核实 AVD 与父子 PID 后才发送退出，没有第二模拟器或广泛杀进程。

独立操作审查 **APPROVE 限定证据**：300 项清单重新核对 0 漂移，安装与冷启动元数据可信；完整原生验收仍 **INCOMPLETE**。采集只保留脱敏自报告 JSON，缺少 raw 活动/网络/日志与 runner，不能完整独立复原所有运行时判断；原生结果文件优先于原先计划。发布仍 **NO-GO、正式设计 0/20**。普通网络/弱网、真实登录、原生 UI/前后台、完整账号隔离、资料头像后端、邮件 Logo/模板、注销隐私、地图机器人和 iOS 条件仍开放。

下一项：先完善隐私安全的原生界面状态识别/证据方式，定位这次 unknown，再做一次有边界的离线 UI 与前后台验证，不盲目重复构建或联网登录。完整身份/执行/不足见 `artifacts/release-readiness/20261016-auth-lifecycle-qa/integration.json` 和 `native-result.json`。本轮未操作真实账号/验证码/密码/撤销/删除/因子、云迁移/RLS/权限、机器人、付费或商店，未改变主机网络。

## 2026-10-16 16:38 轮：验证器注册已绑定身份与页面有效性，本地增量通过，下一步新 QA 包

先写验收并保留 RED→GREEN：旧 enrollTotp 在调用方已失效时仍进入 SDK，worker **1 FAIL → 1 PASS**。现在入口要求捕获的有效 user/session 与活跃回调，SDK 前取得 `factor-write`，retain 注册前会话读取、实际注册及注册后读取；异步预检结束紧邻派发再次检查页面，返回设置材料前再次检查身份。同一会话 token refresh 可继续，身份缺失/变化不返回因子 ID、二维码、密钥或 URI。不新增凭据队列/自动重试/持久化。注册后的会话错误提示已另经 RED→GREEN 改为中性措辞，不再错误声称“未创建验证器”。

设置页在初始清理、状态读取、每个旧因子清理及注册阶段之间检查 mounted/generation；请求已发后退出、身份仍相同时，仅尝试原身份 best-effort 清理，不显示晚到材料。真实认证事件换为 B 后旧注册结果不显示，也不以 B 清理。复审最初提出重复加载 HIGH，但根执行效果清理/重建及同一时刻连续 Retry **2/2 PASS**；每次 load 必先 await 初始 discard，旧 generation 在进入 SDK 前已失效。审查据实际微任务顺序**撤回该发现**，不是将它宣称为已修复缺陷；没有增加无证据的 scheduler/ref。最终独立窄审 **APPROVE、0 确定缺陷**，仅同 runtime 范围。

**根最终：14 项布局/源码护栏 + 191 项本地行为 PASS，TypeScript exit 0**；账户流程 **7/7**、MFA 源码护栏 **5/5**、存储 sanitizer、三份测试语法和作用域 diff check 通过。根实际 Provider/设置页/service/coordinator host **7/7**；新 service 边界 **8/8**；真实已安装 SDK **2/2** 已接入正常 security 命令，成功请求 `refresh,enroll` 均 busy/factor-write，刷新后页面失效仅 `refresh`、不发 POST，公共 SDK 清理完成。全部是合成会话、内存存储及传输 stub，不是原生或实际云端创建/删除。早期 SDK 日志保留：一次旧未互斥表征、一次超时 fixture，以及根错误 PNG/SVG 和取消时序断言，后经修正 fixture 由最终统一回归覆盖；不算成产品修复。`root-stale-phase-red.log` 实际 exit 0，文件名不代表 RED。

16:38:59 +08:00 核对 mfaService SHA `1bd195798b713aa3cdfd441f0632e9bb5cd9dc21240e8a6b1ca640f53d1064ef`、设置页 SHA `df07da64e04c54cad1ab8e5f52aa3c7f177f94affafd3e79a310df1aa5f2f810`。旧 QA `releases/20261015/DOSO-0.0.1-qa-cef4c3b8.apk` 仍 77,309,513 字节、SHA `cef4c3b86e0c909b293b9059c4b37faea611182b8701fb20043e40b4f8d2d8c7`，旧 296 输入清单仍 10 项漂移、另 5 个 runtime 模块缺席。**本轮只改 2 个生产源码文件与测试接线，无新包/模拟器/原生通过项。**

边界：身份重查不是原子凭据固定或服务端授权，raw SDK/其他 runtime 在重查后仍可切换。派发后身份/读取失败可能已创建未托管因子，不能用 B 清理或声称回滚；晚到清理可能因 Provider 恢复 busy 而失败，未确认删除，不自动重试。其他 getUser/重认证/隐式 token getter、已进入刷新、raw SDK/CAS、跨 runtime/重启恢复及此前 known-RED 仍未关闭。普通网络/弱网、资料头像后端、邮件 Logo/真实模板、注销隐私、地图机器人和 iOS 发布条件未因此通过。

发布仍 **NO-GO、正式设计 0/20**。未操作真实账号/验证码/密码/撤销/删除/因子、云迁移/RLS/权限、机器人、付费或商店，未重试已阻塞网络。下一项转入**一个新本地 QA 源码快照/构建与安卓认证生命周期、离线回归**，先检查现有任务，避免重复启动；测试包不等于发布批准，普通网络和其余安全门槛保留。完整验收/失败与通过证据/源码包身份：`artifacts/release-readiness/20261016-mfa-enrollment/integration.json`；最后完整性核对见同目录 `final-verification.json`。

## 2026-10-16 16:03 轮：未完成验证器清理已绑定身份并保持互斥，注册入口仍待收口

本轮只收口 MFA 清理子步骤，不宣称完整认证 P0 完成。先写验收，实际 Provider/设置页/service 的隔离 host 复现两项 RED：`factor-write` 开始即令 Provider loading、可能卸载请求页；A 的设置页退出后改用当前 B 会话执行一次清理。现清理必须传原用户与 session_id，进入 SDK 前取得同 runtime 互斥，读取因子前、删除前两次核验身份，并 retain 实际 getSession/list/unenroll。身份缺失/变化安全拒绝，只处理指定且列表中仍为 unverified 的 TOTP，不处理 verified/其他类型/缺失因子。同一 session 的 token refresh 可继续。

新增 `factor-write` 观察者语义，不伪装为只读：协调通知本身不清空准备状态；真实 SDK 认证事件仍立即失效并在实际 idle 后恢复，native 自动刷新调度仍因 busy 暂停。App 将身份交给以 user/session 为 key 的设置页，所有清理路径沿用原身份。另复现并修复连续两次返回丢失最终导航、缺少身份仍开始状态读取/注册两项问题；返回现在同步防重入、等待清理结束，不显示假成功。

**根最终：14 项布局/源码护栏 + 174 项本地行为 PASS，TypeScript exit 0**；账户流程 **7/7**、MFA 源码护栏 **5/5**、存储 sanitizer、四份测试语法与作用域 diff check 通过。根 host 定向 **5/5**；新 cleanup service 套件扩展至 **9/9**，含二次读取挂起/身份变化/错误、删除失败不重放；真实已安装 SDK **2/2**，请求为 `refresh,user,delete-pending`，均在 busy/factor-write 下，DELETE 未结束时竞争操作拒绝，未预期请求 0、公共清理完成。全部为合成会话、内存存储和传输 stub，不是安卓或实际因子删除。两个新套件已接入正常 security 命令。独立窄审 **APPROVE、0 确定缺陷**，范围仅本同 runtime 协作切片。

16:03:48 +08:00 身份核对：mfaService SHA `511eee18a023dffdd32fa90e845e4bb7fe13afdc60061a5a834e63980c116c0c`，Provider SHA `c2af4822d6637557e95aa12817843e431047e085fc06c76a927e5cc1950be188`，设置页 SHA `eba1acd4b2fdc62fb767c10a6a7381c7a94a62bee68e1f6e7c17d34cb92ecbd6`。旧 QA `releases/20261015/DOSO-0.0.1-qa-cef4c3b8.apk` 仍 77,309,513 字节、SHA `cef4c3b86e0c909b293b9059c4b37faea611182b8701fb20043e40b4f8d2d8c7`，旧 296 输入清单有 10 项漂移、另 5 个 runtime 模块缺席。**本轮改 5 个生产源码文件和测试接线，无新包、模拟器或原生通过。**

重要边界：二次身份检查**不是原子凭据固定**，绕过协调器的 raw SDK/其他 runtime 仍可在重查后或 SDK 内切换；认证事件失效不取消已经发出的清理。因子列表之后的外部状态变化仍以真实后端授权为准。卸载清理仍 best-effort，错误被吞不等于删除成功，也没有自动重试。注册入口本身仍未协调，其他 getUser/重认证/隐式 token getter、已进入刷新、raw SDK/CAS、跨 runtime/重启恢复未完成；此前 known-RED 不改判。普通网络/弱网、资料头像后端、邮件 Logo/模板、注销隐私、地图机器人和 iOS 条件不因本轮通过。

发布仍 **NO-GO、正式设计 0/20**。未操作真实账号/验证码/改密/撤销/删除/因子、云迁移/RLS/权限、机器人、付费或商店，未重试已阻塞网络。下一项：注册入口预期身份与完成生命周期，避免 loading→卸载→重复注册；安全边界收口后再新 QA 包及安卓认证回归。验收、失败/通过日志、完整源码/包身份见 `artifacts/release-readiness/20261016-mfa-cleanup/integration.json`；最后完整性核对见同目录 `final-verification.json`。

## 2026-10-16 15:45 轮：MFA 验证完成由 App 持有，卸载竞态已修，尚未入包

继续同一认证 P0，先写验收，再复现实际 Provider + MFA service + 设置页的 host 边界竞态：验证仍在执行时，认证 loading 卸载设置页，触发一次未完成因子删除，**1 FAIL → 1 PASS**。现在 App 持有不含验证码/私有错误的单次验证状态，设置页仅在父层通过身份/准备检查并接受后交出因子清理所有权；双击只派发一次 challenge。验证码仍只用于当前 service 调用，不进入控制器或持久化。

完成必须等待实际请求结束、协调器空闲、同一 user/session、更新后的会话准备 epoch、有效授权及 AAL2；切换身份或离开页面使结果失效，不假称取消 SDK 工作。保留原 loading 门槛，暂停验证期间的设备 bootstrap，防止覆盖返回路径。独立复审先发现 HIGH（恢复检查失败被 pending 永久遮挡）和 MEDIUM（父层拒绝前过早交出清理所有权），均增加测试并修正；最终 **APPROVE 本增量、0 剩余确定缺陷**。当前恢复检查出错会退出验证等待并让原重试入口可见，不自动重试验证。

**最终根回归：14 项布局/源码护栏 + 157 项本地行为 PASS**；定向合并 **33/33 PASS**，TypeScript exit 0、账户流程 **7/7**、MFA 源码护栏 **5/5**、存储 sanitizer、测试语法及作用域 diff 检查通过。执行了实际 App handler/reconciliation/context/hardware-back 回调的 AST，但未渲染完整 App 树或原生 OS。最初 loader 扩展名错误、新 helper 缺失只属 harness/scaffolding 失败，不冒充产品 RED；首次合并的两条旧源码正则护栏已按真实新接线修正，全部失败日志保留。

15:45:28 +08:00 身份：App SHA `e15c2f97b5e1fe8fbfc4332b0ac45247755750ed1a8a481e2374c3c83b3dc76f`，MfaSetup SHA `67ad27ddaf38f31b35dbb51cc44ae90aa6b29dddf2614704732b8937b205b3b3`，新 flow SHA `b920847f413c1df97500a6ff4f00a03a793c0b68c9df1294b80a827a19597747`。保留 QA `releases/20261015/DOSO-0.0.1-qa-cef4c3b8.apk` 为 77,309,513 字节、SHA `cef4c3b86e0c909b293b9059c4b37faea611182b8701fb20043e40b4f8d2d8c7`；旧 296 输入清单现 10 项漂移、5 个新增 runtime 模块缺席。**无新包、无模拟器/原生通过项。**

发布仍 **NO-GO、正式设计 0/20**。本轮仅本地合成认证/存储/SDK 传输边界测试，未操作真实 MFA、账号、验证码、密码、撤销/删除、云迁移/RLS/权限、机器人、付费或商店；未重试已阻塞网络。注册验证器/未完成因子清理的一般入口仍需身份与互斥保护；profile/device/getUser、重认证、隐式 token getter、已进入自动刷新、raw SDK/CAS、跨 runtime/重启恢复仍未关闭。此前 known-RED 不改判。普通网络/弱网、资料头像后端、邮件 Logo/真实模板、注销隐私、地图机器人和 iOS 条件未因此验收。

下一项：收口 MFA 注册/未完成因子清理的预期身份及实际请求互斥，再在安全边界和普通网络条件允许时构建新 QA、进行安卓认证回归。完整验收/日志/源码与包身份：`artifacts/release-readiness/20261016-mfa-completion/integration.json`；最终完整性核对：同目录 `final-verification.json`。

## 2026-10-16 15:01 轮：MFA 状态读取已协调，安全页不再因普通查询触发恢复界面

继续认证 P0，先写本轮验收并保留三次 RED→GREEN。旧 `getMfaStatus()` 在其他会话操作忙碌时仍进入 SDK，**1 FAIL**；接入协调后通过。只 retain 外层 Promise.all 会在一项 reject 时提前释放、留下另一项仍在执行，另 **1 FAIL**；现在两个 SDK 子读取分别 retain，外层先失败也要等实际子请求结束。`verifyTotpFactor` 复用原有 write lease 做状态回读，既不嵌套获取，也不降级成 read。

第三个 RED 是集成副作用：把普通状态查询按默认会话写入处理，会令 AuthProvider loading=true，App 的 LoadingScreen 门槛可能卸载请求它的安全页，反复挂载又再次查询。实际 Provider + AccountSecurityScreen + MFA service 的 host 测试 **1 FAIL**；随后协调器新增仅供观察者使用的 `session-read/session-write` 语义，默认仍是 write。Provider 只忽略 read 的协调通知，不因纯查询丢弃已准备会话；**真正的 SDK 认证事件照常失效并在 idle 后重新摄入**。read 仍然 busy，竞争操作仍被拒绝，native 自动刷新仍暂停。这不是授权能力、取消保证或全局忽略会话变化。

**根最终合并：14 项布局/源码护栏 + 140 项本地行为 PASS**；四个相关套件 **52/52 PASS**。新增真实已安装 SDK 测试 **2/2** 已接入正常 security 命令：独立状态查询的请求恰为 `refresh,user`，均在 busy/read 下；验证流程为 `challenge,verify,user`，均保持同一个 busy/write，意外请求 0，公共 SDK 清理完成且 idle。worker 首次 2/2 日志保留；其后精确 write-kind 断言收紧由根最终合并覆盖，没有覆盖历史日志。全部会话、存储和网络是合成/内存/stub，不是实际 MFA 或安卓验收。TypeScript exit 0、账户流程 **7/7**、MFA 源码流程护栏 **5/5**、sanitizer、5 份测试语法及作用域 diff check 通过。独立窄审 **APPROVE、0 新确定缺陷**，仅批准本增量。

15:01:54 +08:00 身份核对：mfaService SHA **`de9e9f294e3272a4b2dafc4f65a06fc99ab0dfb0b1e26baf393978ed01773573`**，协调器 SHA **`e930d6b09da70d8fb03b96dfc5103a8fd8e792311be52e79fa5089b2ada32e5c`**，AuthContext SHA **`66a3538eeaf05d0c605e97a6edaf63b4a9193937d271de030c64a347f6bdb89e`**。旧 QA `DOSO-0.0.1-qa-cef4c3b8.apk` 保持 77,309,513 字节，SHA **`cef4c3b86e0c909b293b9059c4b37faea611182b8701fb20043e40b4f8d2d8c7`**；旧 296 输入清单仍有 8 项漂移，另 4 个 runtime 模块缺席。**本轮改 3 个生产源码文件和测试命令，无新 APK、模拟器或原生通过项。**

发布仍 **NO-GO、正式设计 0/20**。独立审查另指出既有验证流程风险：write 操作可触发全局恢复门槛而卸载 MfaSetupScreen，后端成功后可能不再调用 onCompleted；本轮没有原生复现或修复它。注册/取消未完成验证器仍未协调，清理错误不代表因子已删除。profile/device/getUser、重认证、Data API token getter、已进入自动刷新、raw SDK/CAS 与跨 runtime/重启恢复仍未关闭；此前 known-RED 日志未重跑/未改判。普通网络、资料头像后端、邮件 Logo/托管模板、注销隐私、地图机器人和 iOS 条件仍未完成。本轮无真实账号/验证码/密码/撤销/删除、云配置/迁移/RLS/权限、机器人、付费、商店或网络重试操作。

下一项优先复现并修正 MFA 验证完成/返回页面的生命周期，保留 write 互斥，不重复 challenge 或展示假成功；再推进验证器注册/清理及其他读取入口。完整验收、RED/GREEN、审查范围、源码/包身份：`artifacts/release-readiness/20261016-mfa-status-read/integration.json`。

## 2026-10-16 14:29 轮：App 会话恢复读取已协调，隐式刷新期间排除竞争操作

继续同一认证 P0，先记录验收再做最小修复。新 raw SDK 隔离诊断确认 `autoRefreshToken:false` 不阻止近过期 `getSession()` 发出刷新并写回会话；worker 与根均 **0 PASS / 1 FAIL、exit 1**，观测 busy 期间 1 次刷新、1 次写入、1 个 TOKEN_REFRESHED，随后读取和清理完成，无意外请求。此文件保留 `.verification.mjs` 且禁止反转/跳过断言造绿；它绕过 App 协调入口，不是本次修复后的 App 通过项。

实际 App 缺口另有确定性 RED：`authService.getSession()` 已开始且 SDK storage read 挂起时，竞争操作仍被接受，**1 FAIL**。现在该入口无 lease 时同步取得同 runtime 协调，有现有 lease 时复用并 retain 实际 SDK promise；busy 在进入 SDK 前 typed 拒绝，读取/隐式刷新实际结束前不释放。仅包装 service 会让 Provider 的恢复读取使自己的 ticket 失效，原有恢复测试另 **1 FAIL**；随后给 Provider 读取使用既有 observer owner，并以释放后的当前 revision 准备会话，两个切片均 GREEN。外部操作/认证事件仍使旧 ticket 失效，未重放捕获的旧会话。没有把无 await 的同步 busy 检查与调用之间凭空描述成已复现的跨任务窗口；真实 RED 是已经进行中的读取未持有互斥。

**根最终验证：14 项布局/源码护栏 + 129 项本地行为 PASS**；两个相关套件 **23/23 PASS**，含 4 项新增真实 SDK service 测试、2 项新增 Provider host 测试及无事件稳定性强化。覆盖 busy 拒绝、挂起读取/隐式刷新、外层失败仍 retain、TOKEN_REFRESHED 只补做一次 fresh read 后稳定、卸载后不补做准备。中间 **20/21** 的唯一失败是 fixture 把 Functions host 当成还会运行 SDK token getter、误期待第 3 次读取；核对实际登记代码后改为正确的 2 次，原失败日志保留。busy-initial fixture 现在先取得外部 lease 再挂载；读已开始后不再允许新竞争操作。TypeScript exit 0、账户流程 **7/7**、sanitizer、测试语法及作用域 diff check 通过。独立窄审 **APPROVE、0 确定缺陷**，不批准完整 P0。

14:29:37 +08:00 核对 authService SHA **`ec8e8857b177a3f027a52a90eec6aef75e6840d1a58df2450dc08d57a55cdbc9`**，AuthContext SHA **`e57e25a1c3e66930d6f900e541b6f8ef5d8a6d86cb210bcd530e264a4e104391`**。旧 QA `DOSO-0.0.1-qa-cef4c3b8.apk` 仍 77,309,513 字节，SHA **`cef4c3b86e0c909b293b9059c4b37faea611182b8701fb20043e40b4f8d2d8c7`**；旧 296 输入清单有 8 项漂移、另 4 个新 runtime 模块缺席。**本轮只改 2 个生产源码文件，未新建包、启动模拟器或增加原生通过项。**

发布仍 **NO-GO、正式设计 0/20**。MFA 状态/因子、device/profile 的 getUser、重认证及 Data API token getter 等其他读取尚未协调；已进入自动刷新、SDK 初始化/通知、raw signOut 原子身份保护、跨 runtime/重启恢复也仍未关闭。上轮 entered-tick/raw-identity 失败证据未重跑、未改判。真正挂起的 read 会持续 busy，是保守边界，不是取消或恢复成功。普通网络、资料头像后端、邮件 Logo/真实模板、注销/隐私、地图机器人与 iOS 发布条件未因此完成。未触碰真实账号/验证码/密码/撤销/删除、云迁移/RLS/权限、机器人、付费或商店，也未重试相同网络故障。

下一项：单独验证并接入 MFA 状态读取，必须复用 challenge-and-verify 已持有的 lease，避免嵌套加锁或并行子请求提前释放；之后再按证据处理 profile/device/隐式 token getter。验收、RED/GREEN 根日志、独立审查范围、完整源码与包身份：`artifacts/release-readiness/20261016-nominal-session-read/integration.json`。

## 2026-10-16 14:03 轮：首次原生刷新等待核心初始化，本地增量通过，未入安装包

继续同一认证 P0，完成上轮指定的最小收敛点。先以实际 client/helper/coordinator 的隔离 host 测试复现“核心初始化未完成就 startAutoRefresh”，**1 项 RED、exit 1**；修复后首个 App 自有 native start 必须等 public initialize() 成功，随后重新检查当前前台/idle/未清理状态。完成初始化会主动继续调度，不依赖另一个事件；等待期间进入 busy、后台或清理不能重放之前的启动条件。初始化返回 error 或 reject 均固定无秘密诊断、关闭自动启动，不循环重试；等待本身不占用会话操作互斥。Web 行为未改。

**根最终验证：14 项布局/源码护栏 + 123 项本地行为 PASS**，包括扩展后的 **17 项 lifecycle host 测试**和 **1 项真实已安装 SDK 集成**。后者使用合成内存会话与拒绝网络的 fetch stub，暂停构造器首次 storage read，验证初始化结束但 lease 仍 busy 时不启动，idle 后恰好启动一次，并完成 stop/取消订阅/dispose；网络请求 0。它不等于安卓或真实服务测试。TypeScript 重新确认 exit 0，存储 sanitizer、两份测试语法及作用域 diff check 通过。独立窄审批准这一源码增量、0 确定缺陷；审查时为 11 项快照，根随后补齐其要求的状态/错误矩阵至 17 项，不冒称扩大矩阵已再获独立复审。

边界仍明确：public initialize 观察的是 SDK 已存在的核心 promise，**不是再做一次初始化、取消构造过程，或等待所有通知排空**。已进入的 tick/读取/网络刷新、名义 getSession 触发刷新、raw SDK signOut 原子身份保护和跨 runtime/重启恢复尚未关闭。上轮 entered-refresh **0 PASS / 1 FAIL**、raw identity **2 PASS / 1 FAIL** 日志保留，本轮未重跑也未改判。初始化/控制异常后自动启动被锁住是保守可用性取舍；失败 stop 不代表已经停止。

14:03:27 +08:00 核对 nativeAuthRefresh SHA **`d26631645cd1161b349a02cbdc791573a8bfd7f9b1db12bfc597e8bdd0b7f1f9`**。旧 QA `releases/20261015/DOSO-0.0.1-qa-cef4c3b8.apk` 仍为 77,309,513 字节，SHA **`cef4c3b86e0c909b293b9059c4b37faea611182b8701fb20043e40b4f8d2d8c7`**；旧 296 输入清单有 8 项漂移、另 4 个新增 runtime 模块缺席。**本轮仅源码候选，未构建、未启动模拟器，没有新增原生通过项。**

发布仍 **NO-GO、正式设计 0/20**。未操作真实认证/验证码/改密/撤销/删除、云迁移/RLS/权限或机器人；未付费/提交商店/重试已阻塞网络。普通网络与弱网、资料头像后端、邮件 Logo/真实模板、注销/隐私及 iOS 条件均未因此完成。下一步只做名义 getSession 在保留操作互斥期间触发刷新的隔离 SDK 表征，再依据可复现的 App 路径修复；不凭这一增量抢跑宣告认证 P0 完成。验收、根日志、审查范围和完整源码/包身份：`artifacts/release-readiness/20261016-refresh-initialization/integration.json`。

## 2026-10-16 13:32 轮：原生自动刷新启动调度已收口，已进入的 SDK 刷新仍未隔离

继续同一认证 P0。实际旧 native client + 协调器在隔离 SDK/AppState 边界下复现“忙碌时回到前台仍调用 startAutoRefresh”，1 项 RED；修复后通过。Android/iOS 客户端创建改为 autoRefreshToken:false，由新的 nativeAuthRefresh 单一生命周期调度；web 保留 SDK 自动刷新/可见性行为。只在最新前台且协调器 idle 时请求 start；busy/后台要求 stop，公开 start/stop promise 串行、晚到状态重查，异常固定无秘密诊断并锁住自动 start，清理时取消订阅并 best-effort stop。此合同是**App 启动调度控制，不是所有刷新互斥或取消保证**。

根最终 test:security-ui **14 项布局/源码护栏 + 115 项本地行为 PASS**，新增 10 项实际 client/helper/coordinator 的 SDK/native-host 桩测试，覆盖当前 AppState、busy 中创建、单监听、延迟 start、后台释放不恢复、保留 SDK 操作未结束不恢复、失败与 cleanup。平台名是 fixture，不是安卓/iOS 原生通过。TypeScript、作用域 diff check PASS；存储 sanitizer 检查 PASS，认证请求 fetch **12/12 PASS**。独立窄审 APPROVE 此增量、0 新确定缺陷，另报 21 项组合定向回归 PASS。

**新的真实 SDK 限制证据保持 RED**：public startAutoRefresh 启动的 tick 已进入并停在存储读取，public stopAutoRefresh 返回后释放读取，仍发出 1 次刷新；根最终手动验证 **0 PASS / 1 FAIL、exit 1**。实际等待 TOKEN_REFRESHED 完成后停止、取消订阅并 dispose，completion/cleanup 均观测为 true；无 private SDK 调用或真实网络。原 worker/根日志不覆盖，禁止反转断言造绿。原始身份手动诊断本轮重跑仍 **2 PASS / 1 FAIL**（raw signOut A 晚到删除 B）。因此不能宣布 P0 完成。

SDK 已进入的 tick（含等待 initializePromise）、存储读取、网络刷新和名义 getSession 刷新仍可能继续；控制器不会取消它们。失败后不自动重启，不意味着已成功停止 SDK；失败 stop 的状态仍未知。初次 native start 等待 public initialize() 后再重查，是下一可证实的收敛点；名义读取/完整刷新隔离仍须独立实现与验收。

本次身份核对：supabaseClient SHA `a068b0861ce0a623a1f4d2b054e7d2c5e705c29cba49eb40471046c6fb8486bc`，nativeAuthRefresh SHA `c3a2925f043214a63254b4d219b746444f14a75fed6d9dba58df75b1fd18da00`。旧 QA `releases/20261015/DOSO-0.0.1-qa-cef4c3b8.apk` 保持 77,309,513 字节，SHA `cef4c3b86e0c909b293b9059c4b37faea611182b8701fb20043e40b4f8d2d8c7`；旧 296 输入清单现 8 项漂移，另 4 个新增 runtime 模块不在旧清单。**源码未入新包，本轮未构建/启动模拟器。**

发布仍 **NO-GO、正式设计 0/20**。未操作真实账号/验证码/密码/会话撤销/数据删除、生产迁移/RLS/访问权限或机器人；未付费/提交商店/重试浏览器网络。普通网络与弱网、资料头像后端、邮件 Logo/托管模板、注销/隐私、地图机器人和 iOS 发布条件均未因此完成。验收、源码/包身份及根通过/失败证据：`artifacts/release-readiness/20261016-native-refresh/integration.json`。

## 2026-10-16 11:57 记录：撤销派发不再换用 B 的凭据，本地增量通过

继续同一认证 P0，没有重复启动构建或真实认证。使用已安装 Supabase 2.112.3、实际生产 service/协调器、内存合成会话与全 fetch stub，逐项 RED→GREEN 修正 current list(A)→storage B、specific list(A)→storage B、直接 Edge 的 SDK token getter 晚读 B、应急 RPC 的晚读 B 四个边界。原失败日志均保留。

四个 Edge 入口及其前置 list 固定**每请求的 Authorization**；两个应急 RPC 使用公开的单请求 `.setHeader()`，不改共享 client header。current/specific 在 list 返回后要求 user ID 与 session ID 同时不变；不同用户、同用户新 session、空/非法会话、SDK 错误或重查超时均 typed `identity-unavailable`，不派发撤销、不退出新 B。正常同 session 的 token refresh 可继续并使用新 token。token 仅在调用/请求头中暂存，不进入 fence、metadata、body、持久化或错误输出。实际 App logout 回调的本地测试另确认身份拒绝不会触发应急 fallback。

契约明确区分：重查发现 B 时安全拒绝；仅在成功检查后由协调器外换成 B 时，SDK 仍可能读取 B，但 wire 请求保持已确认的 A，而非声称原子取消。新增身份重查 15 秒边界测试确认：未派发时释放 pending ticket，但底层 SDK read 未结束则继续持有互斥；晚到读取只能释放互斥，不能补发撤销。派发后 unknown/超时防重放规则保留。

**根最终回归**：`test:security-ui` **14 项布局/源码护栏 + 105 项本地行为 PASS**，含 **16 项实际 SDK 的派发前测试**；账户流程 **7/7 PASS**；TypeScript、作用域 diff check 和最终测试语法检查 exit 0。首次合并 100/100 日志保留；根将五种非法重查扩展到 current/specific 两入口后重跑为 105/105。独立窄审 **APPROVE 本增量、0 新确定缺陷**；原生/真实服务通过数不增加。

**完整身份诊断仍 exit 1：2 PASS / 1 FAIL**。上轮 list 后错用 B 的路径现安全拒绝，剩余为绕过 App 协调器的 public SDK `signOut(A)` 晚到删除 `setSession(B)`；未反转/跳过断言造绿。请求固定凭据不证明服务端授权，也不解决名义读取刷新副作用、自动刷新、signOut 原子 CAS、跨 runtime 或耐重启恢复。自动 heartbeat 忙碌时派发仅属待验证假设，Provider 清除 live refs 可能已阻断，未当成确定缺陷。

11:57:43 +08:00 重算 sessionService SHA **`9380ce1ce23bd7f323b11fac9fa29ea045d09111cfb03274bb7d4d0307644105`**。保留 QA `releases/20261015/DOSO-0.0.1-qa-cef4c3b8.apk` 仍为 77,309,513 字节，SHA **`cef4c3b86e0c909b293b9059c4b37faea611182b8701fb20043e40b4f8d2d8c7`**。旧 296 输入清单仍有 7 项漂移、另 3 个新 runtime 模块不在旧包清单。**修复仅在源码候选，未构建新包或启动模拟器。**

发布仍 **NO-GO、正式设计 0/20**。本项跨后续同内容定时触发继续收尾，没有另开重复任务；未改生产迁移/RLS/权限/账号/密码/验证码，未撤销真实会话、删除数据、发机器人运动指令、付费或提交商店。普通网络/弱网、资料头像后端、邮件 Logo 与托管模板、注销/隐私、地图/机器人和 iOS 条件未因此完成。

下一项：先为自动刷新/名义读取在长撤销 lease 期间的行为建立确定性验证，再按证据做最小修复；不在真实账号上制造未知结果或重复要求用户换网。验收细化、完整源码/包身份、失败与通过证据：`artifacts/release-readiness/20261016-predispatch-identity/integration.json`。

## 2026-10-16 04:51 轮：同 runtime 会话摄入与登记竞态已修，本地增量通过，完整隔离仍未通过

继续同一认证 P0，没有改视觉风格、反复发码或构建新包。按有效 user/session ID 建立共享内存 fence：六个撤销入口先获取身份并记录 pending，派发后结果未知或清理失败保持 unknown，确认撤销本人/全部保持 revoked；前置失败只释放自己的 pending。相同 fenced 身份再次撤销会在派发前 typed 拒绝，B 的新会话不会清除 A 的未确认结果。JWT 解析仅分区本地状态，不是验证签名或服务端授权；没有增加公开清除/reset。

AuthProvider 不再直接发布忙碌期间捕获的事件或旧恢复结果；外部会话操作使旧摄入/准备失效，空闲后从 SDK 重新读取并检查 fence。准备过程在安装标识读取前取得同一互斥，登记前再次核对 ticket，在实际派发 thunk 再检查；已发 SDK promise 即使 UI 15 秒超时也保留互斥直到真正结束。自己的 preparation 用本地 owner 标识避免自失效，不代表授权能力。卸载使 ticket 失效，不能补发旧登记。

独立复审先后找出两项 HIGH，均在本轮修正：登记等待/进行中与撤销并发；安全页重复 register 导致 Provider loading→卸载→重挂循环。账户安全页 mount/reload 现在只读取已由 Provider 准备的终端，不再重复登记。真实 Provider + 真实安全页 + 生产 service/coordinator 共用模块缓存的 host 测试确认 register 保持 1 次、list 1 次、loading 保持 false、prepared key 不变。此为隔离 host/SDK 边界，不是 Android 或真实服务证明。

**根最终验证**：`npm run test:security-ui` 为 **14 项布局/源码护栏 + 86 项本地行为 PASS**；账户流程护栏 **7/7 PASS**；TypeScript exit 0；作用域 diff check exit 0。原四项 Provider 有效合成会话测试先 **0/4**，修复后加入扩展到 **12 项**的正常回归；新 fence/service **15 项**覆盖同 runtime 重挂、身份隔离、未知不重派、延迟/超时登记保留互斥。手动 Provider 脚本已可恢复重命名为 `scripts/auth-provider-ingestion.test.mjs` 并加入正常安全命令，历史路径/日志不改写。一次登记 RED host 错误在卸载后仍渲染、留下 interval；该部分日志只算三项断言失败观察，不声称完整运行，已修测试收尾并仅关闭本轮两个经 PID/命令核对的测试进程。独立最终窄审 **APPROVE 增量、0 新确定缺陷**。

**完整 P0 仍 FAIL**：根重跑安装 SDK 的手动身份诊断为 **1 PASS / 2 FAIL、exit 1**。A 的撤销 ack 晚到时已不会清理新 B；但 A 的终端 list 后由协调器外替换为 B，后续 revoke 仍可能携 B 身份派发；raw SDK `signOut(A)` 晚到仍能删除绕过协调器建立的 B。桩请求不证明真实服务会授权/提交。身份重查不是原子 CAS。名义读取/自动刷新写入、跨 runtime 和进程重启/持久化恢复仍未闭环，内存 fence 不得被称为耐重启。

源码身份：AuthContext `f293a70ca87a9e0bf036a606ac25e128bfd96e72ec20487697e1e91366e663b3`，sessionService `d54e8e3ca7b8a343bbde892c59cce2f7240b40a262010c2f7b7605842637544b`；完整输入/测试身份在新汇总。04:51:35 +08:00 重算保留 QA 包仍为 `releases/20261015/DOSO-0.0.1-qa-cef4c3b8.apk`，77,309,513 字节，SHA **`cef4c3b86e0c909b293b9059c4b37faea611182b8701fb20043e40b4f8d2d8c7`**。旧 296 输入清单已有 7 项漂移，另 3 个新增 runtime 模块不在旧清单；**本轮修复尚未入包，没有新增原生通过项**。

发布仍 **NO-GO、正式设计 0/20**。未重查/修改云权限或真实账号，未发验证码、改密、撤销会话、删除数据、发机器人指令、启动模拟器或构建；用户暂不能换网，不循环要求换网。普通网络/弱网、邮件 Logo 与真实模板、资料头像后端、账户删除/隐私及 iOS 条件仍保持未完成事实。

下一项：先为“list 后身份改变→再次派发”及可刷新会话的名义读取/自动刷新补确定性 RED 与保护，不在真实账号上制造未知撤销；重启持久恢复和后端幂等另设验收。证据：`artifacts/release-readiness/20261016-ingestion-fence/integration.json`；历史证据与安装包均保留。

## 2026-10-16 01:53 轮：Apple/MFA 会话写入已接同一互斥，Provider 摄入仍实际失败

继续同一 P0，不改变 UI 风格或构建新包。新增两处生产接入：native Apple 仅在 Supabase `signInWithIdToken` 交换阶段获取同一 `runAuthSessionOperation`，系统授权提示在锁外；MFA 的 `challengeAndVerify` 与紧随的 `getMfaStatus` 状态刷新放在同一获取中，不嵌套加锁。成功/错误释放、busy 原样传递，原有授权取消、错误映射及资料暂存逻辑保留。没有宣称 Apple/微信/QQ Provider 或真实 MFA 已上线可用。

worker 记录 Apple 与 MFA 分别真实 RED→GREEN 的本地摘要；根最终合并 `test:security-ui` **14 项布局/源码护栏 + 57 项本地行为 PASS**（新增 6 项 SDK/native-host 边界桩测试），`typecheck` exit 0、作用域 diff check exit 0。worker 另报 social guard PASS、Apple core 57 断言 PASS、MFA 流程 5/5、typecheck PASS；这些不是根重新执行或原生/真实服务验收。测试 fixture 由根改为不继承宿主环境变量，并加每例 10 秒 timeout，原 worker 证据及原测试哈希保留不改。MFA SHA `e5b186f40dda547d0ead2797a375714ffe7b04d347d1aece6710f9d15bddbe43`；native social SHA `a3b079aa2a371fc6290b852d0973de722244d156a619dad9574f83351ebd52f4`。

**没有冒充完成 Provider 修复。** 新手动 `.verification.mjs` 加载实际 AuthProvider、auth/session services、tracker 和原协调器，仅 React hooks/native host/SDK 是隔离边界。根将发布与准备分开验收并实际排空 Provider 定时器，最终 **4 tests / 0 pass / 4 fail、exit 1**：busy auth event 仍发布捕获的 B，并新增一次终端登记与 profile 读取；busy 时初始恢复仍发布 A，同样登记/读取各一次。最初只有发布断言的 2/2 失败日志保留，扩展记录不覆盖。不是原生渲染、真实 SDK 事件次序或真实服务越权证明；Provider 源码本轮未改，SHA `fc8a4f7f769c96bb54d795cd993f2d6bc9cf7323cefb4f45ca6e652b7f85c02a`。

只读本地后端合同确认：同一 `auth_session_id` 的 revoked terminal，register 的 conflict guard 不允许恢复；但成功读取/重新登记也不能证明之前未知撤销未提交，且不能凭本地 SQL 声称托管部署一致。故暂不增加泛化“锁空闲→自动读取/重登记”的恢复循环。下一步须先建立共享、账号/session 分区的 pending/unknown 摄入隔离规则，不能用 fresh read 或新页面挂载清除未知债务；再接 Provider busy 抑制与安全 fresh 摄入，分别验证发布和准备。可刷新/清除 session 的名义读取、自动刷新、其他 runtime、进程重启仍待验收。

独立审查：Apple/MFA 新包装未发现新增确定缺陷；**整体 P0 为 REQUEST CHANGES，仍有 HIGH 的 Provider 摄入缺口**。root 扩展四例正是保留该未关闭事实，不把测试失败包装为通过。正式设计仍 **0/20**、release **NO-GO**。本轮无云查询/迁移/权限变更、真实认证/验证码/改密/撤销、机器人指令、浏览器重试、构建或模拟器；旧 QA `cef4c3b8` 保留且不含本次及前两轮源码修复。普通网络、邮件 Logo/托管模板、资料后端、注销/隐私与 iOS 条件均未在本轮重查。

验收、原 worker 摘要、根通过/失败日志、源码/包身份及只读后端审查：`artifacts/release-readiness/20261016-provider-session-slice/integration.json`；原证据与安装包未覆盖。

## 2026-10-16 01:00 轮：邮箱认证与撤销序列已接入同 runtime 互斥，本地候选未入包

继续上一轮身份隔离事项，验收明确限定首个合作入口切片，不宣布完整 P0 修复。先运行实际生产 `sessionService` + `authService`、已安装 Supabase SDK、内存存储与全 fetch stub：A 撤销挂起时 B 的公开 login 仍成功，**1 项真实 RED、exit 1**。随后新增 `authSessionOperation.ts`，同步获取互斥，竞争操作立即固定 busy 拒绝，不排队保存密码/OTP、不自动重放。`authService` 的 signup、两个 OTP 验证、login、updateUser、PKCE exchange、logout 均接入；URL 外层不重复加锁，login/register 保留 busy 类型。

六个 service 撤销入口在任何前置读/派发前取得同一边界，完整持有到 SDK signOut 真正结束。busy 转为 typed `operation-busy`，不触发主 App 的应急撤销 fallback。**UI 15 秒超时不等于底层 SDK 结束**：当前终端读取、Edge Functions 和应急 RPC 通过显式 lease 保留底层 promise，实际未结束时仍拒绝新邮箱会话写入；晚到响应不重放 signOut。SDK 真挂起会持续 busy，这是 fail-closed 代价，不是取消成功或重启恢复；底层 settle 后释放互斥也不等于未知撤销债务已核对。

核心实际行为已 GREEN：A 等待服务端/随后等待 native logout 的两个阶段均拒绝 B；A 结束后重新发起 B login 成功且 session 为 B。反方向已有 login 时，六个撤销入口全部在派发前 typed busy；邮箱 writer 各入口在锁内均未进入 SDK；Functions 和两个实际 SDK RPC 的 UI deadline 后仍持锁，迟到完成不触发本地退出。全部数据/令牌合成且仅内存，传输完全 stub，没有真实登录、验证码、撤销或服务端提交。

根最终 `test:security-ui` **14 项布局/源码护栏 + 51 项本地服务/页面/协调器行为 PASS**（含新增 10 项）；`test:account-flow-screens` **7/7 PASS**；`typecheck` exit 0。已把新测试接入日常 security 命令并设置默认 15 秒测试超时，不把测试 timeout 当成底层 SDK 取消或绝对进程退出保证。首次旧测试工具因未加载新实际依赖/假定固定 microtask 深度失败并挂起，已中断，仅修测试 loader 的实际模块缓存/依赖与调度 drain 后通过；中间非法 fixture callback URL 的 7/8 失败也保留，改用真实生产 redirect builder 后通过，未放宽来源校验。

独立最终窄审 **APPROVE 仅此局部增量**，未发现新增确定回归，不批准整体 P0。根离线生产基线 **10/10 PASS** 只检查结构/版本合同；更新诊断 loader 以执行新增的真实依赖后，原 storage/raw-SDK 表征再次实际 **3/3 FAIL、exit 1**，确认不能把它或完整隔离改判为 PASS。新协调器 SHA `e613e66593196ab4f7bb1816d5859f9b1743534e5c0681ead178b11a9449d6de`，service SHA `63b3a2c86f1061be55100318e9728e8109abfec569e448273878ee2d2eb2c470`。

**完整隔离仍未解决，P0 仍 FAIL、release NO-GO、正式设计 0/20。** Native Apple ID-token、MFA 验证、AuthProvider 初始/事件两个摄入口、会刷新/清除 session 的 getSession/getUser/MFA 查询、自动刷新、原始 SDK/外部存储写入、其他 runtime 与进程重启尚未接齐。原始 SDK 表征不能因邮箱切片通过改判。下一项继续同一事项：native Apple/MFA 写入与 Provider busy 抑制、空闲后 fresh 摄入及真实 Provider 行为测试；不按本次局部通过抢跑打包。

本轮没有新 APK、安卓验证、云端/权限/SQL 或真实账号操作，既有 `DOSO-0.0.1-qa-cef4c3b8.apk` 保留，不含上轮派发错误修复和本轮协调器。普通网络、邮件 Logo/托管模板、头像后端与 Storage HTTP、账户注销/隐私和设备处置选择、iOS 条件仍保留未闭环，未重试相同外部故障。证据、源码/包身份、审查状态及验收判定见 `artifacts/release-readiness/20261016-session-operation-slice/integration.json`；历史证据不覆盖。

## 2026-10-16 00:21 轮：真实 SDK 复现旧账号迟到请求清除新会话，尚未修复

本轮继续上一轮选定的身份隔离事项，先写验收、再执行隔离复现；发现简单前置比较不足以修复，因此交付可复查的故障表征子步骤，没有提交会造成错误安全感的生产补丁。**这是确定缺陷的定位，不是完成修复；release 仍 NO-GO、正式设计仍 0/20。** 森哥暂不能切网的约束保持，未再次真实登录/发码、打开失败浏览器、构建 APK 或启动模拟器。

实际使用安装的 `@supabase/supabase-js` / `@supabase/auth-js` **2.112.3**、真实 public Auth client 与实际生产 `sessionService`；存储只在内存、两个账号与令牌均为合成 fixture、所有请求均被 fetch stub 拦截，没有真实凭据或云端提交。根命令 `node --test scripts/session-service-identity.verification.mjs` 实际 **exit 1，3 tests / 0 pass / 3 fail**。三个安全断言失败：A 的撤销等待时把 fixture storage 切 B，后续 SDK logout 使用 B；A 的终端读取等待时切 B，后续撤销带 B 身份与 A 列表选中项；public SDK logout(A) 等待时 public setSession(B) 已成功，A 迟到响应仍删除 B 的共享 session。第二项只证明外发身份混用，不证明真实后端会批准或提交。

SDK 源码与第三项共同证明：`getSession → compare → signOut` 不是事务，甚至 signOut 已读取 A 后的网络等待也仍有清理 B 的窗口。只固定 Edge/RPC JWT 不能解决本地清理；不使用 SDK 私有方法、移动端 admin API 或被弃用的锁选项冒充完整修复。下一实现必须盘点并协调全部会话写入、完整撤销/退出序列及 AuthProvider 两个摄入口，测试安全提前拒绝或 B 排队后建立；单 JS runtime 保护与重启/跨 runtime 恢复仍分开验收。

新增诊断脚本已从 `.test.mjs` 恢复性移动为 `.verification.mjs`，不混入普通绿色测试发现；加了明确边界说明和每例 10 秒测试 timeout。原 worker RED 文件及原哈希不改写。前两项直接替换合成内存存储，第三项直接调用 raw SDK，**它们不是未来 App 修复的全绿放行合同**；后续须增加真实生产协调器/Provider 的安全结果测试，不反转、跳过旧断言制造通过。发布矩阵新增 P0 `AUTH-SESSION-ISOLATION-001`：已知本地 FAIL；原生未验收，不能以环境 BLOCKED 覆盖该 FAIL。

根端 `npm run test:production-baseline` **10 项离线结构检查 PASS、exit 0**，只说明矩阵/版本/静态合同合法，不能覆盖上面 3 个失败。独立窄审 **APPROVE 仅故障表征资产**，确认真实 SDK、全部 fetch stub、无真实凭据输出及边界说明；不是批准产品修复。诊断脚本 SHA `e486aee3da49f5a952dd2d424c63772a4e1c6aaee4974a064cffa3bf041e1939`。

本轮没有改变生产源码、依赖、SQL、云配置、真实账号或设备。service SHA 仍 `670dc645bfd3d209264dd23d52ec17c07c012a8b9581ff97dfa0a6362484c51a`；保留 QA `DOSO-0.0.1-qa-cef4c3b8.apk`，完整 SHA `cef4c3b86e0c909b293b9059c4b37faea611182b8701fb20043e40b4f8d2d8c7`，不包含上一轮派发错误修复，也无新增安卓通过项。资料/头像真实部署与 Storage API、邮件 Logo/托管模板、普通网络认证、账户注销/隐私与设备处置选择、iOS 条件仍未闭环，本轮未重查这些外部状态。

验收与 SDK/测试/制品身份：`artifacts/release-readiness/20261016-session-identity/integration.json`；原 worker 记录、根失败日志与原始 acceptance 同目录。已更新 `docs/runbooks/ACCOUNT_SESSION_REVOCATION_RECOVERY.md`，历史证据与包均保留。

## 2026-10-15 23:49 轮：已派发撤销的普通错误不再自动降级重放（本地候选，未入包）

原计划推进未知结果跨重挂载/重启恢复；先读当前服务、App 回调与 AuthProvider 后，发现更靠前的确定控制流缺陷：服务仅把 deadline 转为 typed unknown，SDK 普通错误、响应体错误、缺少/畸形 `revoked` 仍是 generic Error。App logout 和密码更新后的 generic catch 会继续 withoutAudit RPC，甚至再次 SDK logout。**先关闭同一次调用链自动重放，不把它冒充跨 mount 已解决。** 验收已先写入本轮 evidence；原记录时间估计错误另存 correction，实际文件创建元数据为 23:37:16，原证据不改写。

**三个真实本地 RED→GREEN**：普通 Edge 错误后实际 App logout 回调的 fallback 计数为 1（期望 0）；空 ack 后同为 1；前置读降级后应急 RPC 未确认，SDK logout 计数为 1（期望 0）。先失败 exit 1，再最小修复。仅改 `src/services/sessionService.ts` 与对应测试：已派发的四类 Edge revoke 请求，其 SDK/响应/throw/超时及伪装读取超时统一固定 `revocation-unconfirmed`；空/畸形 ack 与两类直接 RPC 撤销失败同样 typed。主 App 原有 typed 分支因此停止 fallback，测试观察额外调用为 0。未改 App/AuthContext、原生工程、存储格式、依赖、SQL 或云权限。

真正 current-terminal list 前置读仍在撤销派发前，保留 ordinary/read-timeout 边界；明确 0 与正数确认仍合法，原 local/others/global scopes 不变；确认撤销后 SDK 清理失败仍为独立 `session-cleanup-unconfirmed`。安全代价是无法证明未提交的 Edge 错误不再自动降级，不凭 HTTP/SDK 错误文字猜测“服务器没改”。以后需要权威的派发前失败合同才能安全恢复这一类自动降级。

**根最终检查**：`test:security-ui` **14 项布局/源码护栏 + 41 项本地服务/页面行为 PASS**，`test:account-flow-screens` **7 项护栏 PASS**，`typecheck` exit 0，service diff check exit 0。独立窄审 APPROVE 此局部增量，无新增确定 P0/P1。测试执行真实 service、实际 App 回调提取，SDK/host/time 为隔离边界；没有真实密码更改、撤销或后端提交。service SHA **`670dc645bfd3d209264dd23d52ec17c07c012a8b9581ff97dfa0a6362484c51a`**；测试 SHA **`c60151b6da7028acdcfa2234a80565d489e745cc5f8a74bfad4347b9bccee7cf`**。

**没有新 APK/安卓通过项**。23:49:27 再核对既有 `DOSO-0.0.1-qa-cef4c3b8.apk` 完整 SHA 仍为 `cef4c3b86e0c909b293b9059c4b37faea611182b8701fb20043e40b4f8d2d8c7`；296 个输入仅 sessionService 一处变化，旧包**不含本修复**。未重复启动构建、模拟器、真实登录/发码或失败浏览器；未操作云端、Docker/WSL、真实账号/数据或机器人。

**重要未解决项不变**：新调用、页面/Provider 重挂载、进程重启仍无共享/持久撤销 fence；服务没有固定开始时 user/session 身份并在 SDK signOut 前重核对，旧操作可能影响切换后的账号，这一高影响身份隔离风险仍需隔离用例与修复。AuthProvider 两个 session 摄入口、并发、多端幂等、SDK/安装标识存储挂起尚未关闭。已写 `docs/runbooks/ACCOUNT_SESSION_REVOCATION_RECOVERY.md` 与只读接缝审计，不新增能清除未知债务的假按钮。

下一项先验证**旧请求不能退出新账号**的身份绑定，再推进同 runtime 共享 fence 与 AuthProvider 入口，持久重启恢复单独验收。普通网络认证、资料完整升级/实际 Storage API/部署批准、邮件 Logo/托管模板、账户注销/正式隐私与设备处置选择、系统字体切换 stage 保留、iOS 仍独立保留；本轮没有重新核验这些云/原生条件。正式设计 **0/20**、release **NO-GO**。

本轮汇总：`artifacts/release-readiness/20261015-session-dispatch-outcome/integration.json`；同目录保存 acceptance/时间勘误、`readonly-seam-audit.json`、worker RED/GREEN 与根端三份测试日志。此前原生截图、旧安装包与历史证据均保留。

## 2026-10-15 23:29 轮：数据与隐私入口已进入真实 Android QA；注销服务仍未实现

本轮选择账户删除/隐私发布准备这一可执行项。验收先限定为：实际登录、注册、个人页提供有效只读入口；打开/关闭不卸载表单、不保存或恢复过期 stage；无虚假注销/同意/云部署承诺；长文、安全区、44 单位返回目标可用；本地检查后在唯一一次新 QA 构建中验证真实安卓公开路径。森哥暂不能切网的约束不变，未重试真实登录、发码、浏览器、Docker 或迁移部署。

**实际交付**：新增 `DataPrivacyScreen`，沿用现有 MiSans/主题与原生全屏 Modal。Login/Register/Profile 的可选入口只有提供回调才渲染；认证忙碌和同 tick 请求均受保护。App 打开先收键盘，关闭/Android Back 只隐藏 Modal，不写 stage，原表单保持挂载。页面明确是当前代码功能的数据范围，不替代正式隐私政策；账户删除尚未接通，本页不会提交注销/解绑，退出登录不等于删账户。没有新增框架、外链占位、假成功按钮或服务端操作。注销数据顺序、设备归属、Storage/会话/邮件/第三方提供方的真实缺口已记入 `docs/runbooks/ACCOUNT_DELETION_READINESS.md`。

**本轮云端只读库存**：没有 `account_deletion_requests`；按名称搜索未找到相关公开/私有注销 RPC，四个已部署 Edge slug 中没有专用注销函数；`profile-avatars` bucket 仍不存在。相关 FK 的 CASCADE/SET NULL 不等于安全注销、设备重新认领或图片字节清理已完成。此为目录/部署元数据核对，不是所有托管代码的语义证明；未读用户/会话记录，未部署迁移/RLS/权限或改真实数据。资料头像候选后端仍**未接通生产**。

**根端最终检查**：新页面与 Login/Register/Profile 组件行为 **29/29 PASS**，账户流程源码护栏 **7/7 PASS**，`npm run typecheck` exit 0；独立窄审 APPROVE 本次增量，无新增确定 P0/P1。测试执行真实组件和生产 App 回调的 host/AST 边界，不是原生或后端注销验收。App SHA `6fea03f0251546f1e39fdb1cecc19fbc7379ebacb37a06c3f2699a5ab75992ae`，隐私页 SHA `0867c6379dc816e6ce347378afbc3cd96cd16ad98e354d474f099533105bbb45`；完整身份在汇总证据。

**一次真实安卓构建/安装完成**：23:16:34 +08:00 `assembleQa` 成功，284.7 秒；交付 `releases/20261015/DOSO-0.0.1-qa-cef4c3b8.apk`，77,309,513 字节，完整 SHA-256 **`cef4c3b86e0c909b293b9059c4b37faea611182b8701fb20043e40b4f8d2d8c7`**。296 个构建输入在构建前后、安装前和 23:27 再核对无变化，正常 `index.ts`/AuthProvider、JS 内置，非 Preview/Design QA 入口。包含上一轮头像客户端修复，**不意味着其后端已部署**。包为 `com.doso.robot.qa`、versionCode 6、0.0.1-qa、arm64-v8a/x86_64；apksigner v2 与原 Android Debug 证书 SHA `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` 一致，非生产批准签名。

`adb install -r` 同版本替换成功，设备 base.apk 与交付包完整哈希一致，首次安装时间未变；没有卸载/清数据，也没有读取私有数据，故**不宣称私有数据或登录会话恢复**。ActivityManager COLD Total 4,686ms、Wait 4,896ms，仅启动观察，不是 TTI/登录成功。唯一一次启动既有 DOSO_API_35，无 wipe/snapshot/代理；构建与启动期间可用内存短时约 650 MiB，后恢复到约 3.1 GiB，未开第二模拟器或杀其他应用。

**真实安卓有限通过项**：Login→隐私页、完整页尾滚动、页面返回→Login、重开后 Android Back→Login；Register→隐私→Android Back 后未提交的非秘密测试用户名保留，随后已清空，没有输入邮箱/密码或提交注册；配置 1.3 倍字体后重新打开的竖屏长文可读，入口滚动后完整 44px；使用 WindowManager `lock 1` 实际得到 844×390 横屏，1.3 倍长文页尾完整可见、返回目标 44×44，页面返回到 Login。5 张真实截图及脱敏节点保存，不把这些有限 UI 项算成整套设计通过。

**未通过/保留的配置边界**：第一次同时修改系统 font_scale 与 user_rotation 后，立即读取未找到隐私页，随后实际看到相同 PID 的 Login、字体 1.3、rotation 0；恢复标准字体的立即探针也曾未找到 Login 字段，稍后新观察确认恢复。系统配置切换时的 stage 保留**没有通过**，不能用后续布局成功覆盖失败。Manifest 未处理 fontScale 与 Activity 重建解释相容，但未采生命周期日志，**不归因成已证实的 App crash 或会话问题**，更没有为此持久化密码。普通横屏切换的 Modal 与页尾观察另有证据，两个场景分开记录。

23:28:08 最终确认空输入 Login、390×844、fontScale 1.0、lock 0、浅色、HTTP proxy null、PID 4164；随后仅正常关闭本轮自启的 headless 模拟器以释放资源，原安装/用户数据和本地证据保留。首次有界 stop 尚未观察退出的记录不改写；23:28:49 的另一次只读确认已无设备及 emulator/qemu/java 匹配进程。没有实际认证提交、恢复邮件、改密、注销/解绑、生产变更或机器人指令；AuthProvider 启动后台读取不被声称为零网络。

**发布仍 NO-GO、正式设计 0/20**。登录后个人页入口、资料保存/Storage HTTP、真实普通网络认证/弱网、账户删除、正式隐私政策与公开网页删除资源、iOS 均未因本轮完成。注销时设备处置方向已向森哥提出二选一，尚无答复，不默认接受。邮件 Logo/托管模板仍保留 22:29 未闭环事实，本轮没有重查或冒充已修复。

下一可安全推进项：账户安全未知结果在重挂载/重启后的恢复与防重放，本地隔离测试先行、不撤销真实会话；同时待设备归属/留存规则确认，完成真正注销的安全合同与后端门禁。资料完整升级/实际 Storage API 与生产部署批准另行处理，不把本次定时安排当作批准。

根汇总：`artifacts/release-readiness/20261015-data-privacy-entry/integration.json`；云只读 `root-cloud.json`、worker RED/GREEN `worker-verification.json` 同目录。构建/签名/输入身份：`artifacts/release-readiness/20261015-data-privacy-qa/`；安装、截图、表单保留、配置限制及收尾：`artifacts/release-readiness/20261015-data-privacy-native/`。原有包与历史证据未覆盖。

## 2026-10-15 22:29 轮：公开邮件 Logo 可独立只读核验；线上 Logo 与模板仍未闭环

选择邮件 Logo 这一未闭环发布项，先验收：公开图片检查不要求管理令牌、不读取 Auth 配置、不进入 PATCH/快照/文件写入；固定 URL 禁重定向；缺失/偏小 Content-Length 不能绕过实际读取大小限制；局部图片通过不能冒充托管模板与安卓认证通过。未重复登录、发码、构建或模拟器操作。

**当前云事实已重新核对**：Supabase MCP 只读查询项目为 `ACTIVE_HEALTHY`；公开 `email-assets` bucket 仍仅有 `DOSO.png`（元数据报告 223,619 字节），固定 `doso-robotics-wordmark-email-29dea10fd204.png` **没有元数据行**。当前进程管理 PAT/ref 均未注入，仅检查有无，未读取凭据库。浏览器能列出已有控制台标签，但绑定页面在 20 秒超时并重置，立即停止，没有读到托管模板、上传或绕过通道限制。

**实际改动仅本地核验工具与测试**：新增 `node scripts/manage-auth-email-templates.mjs --logo`，原有本地模板/Logo 预检通过后只 GET 批准的公开 URL，不取 PAT、不访问 Management/Auth API。与 remote/sync/rollback/snapshot 组合在任何请求前失败。公开 Logo 从先读完 arrayBuffer 再判大小，改为逐块累计；超过 256 KiB 即调用 cancel、不再继续 read，声明超限则预先拒绝。请求禁重定向、保留 20 秒 AbortSignal，成功仍须完整长度与 SHA-256 一致。该限制是应用读取循环边界，不宣称网络预取/单块/进程内存绝对不超过 256 KiB。帮助文案明确这**不是托管 Auth 模板验收**。

实际测试先行 RED→GREEN（未知模式、读取超限未取消、重定向选项缺失及 scope 文案），最终根复验 **83/83 PASS、exit 0**；`npm run email:check` exit 0，13 个生成文件未漂移、7 个原生模板与本地配置匹配。所有同步/回滚测试为 mock，未真实写云。独立窄审 APPROVE 本地只读工具，未发现本增量新 P0/P1。工具 SHA **`63f2fdc9aaed5c09140e98e7bd4694d099171df9255045d7b6578ace15da9f38`**，测试 **`b24984bea43780d6456c0b5a3cc0c68de44cc1fc8da897c54d04a94e7baa2a63`**。

**唯一一次真实 `--logo` GET 在约 2.4 秒后 exit 1：公开 Logo 请求失败／网络连接失败**。没有取得 HTTP 状态，不能描述为已观察到 404，更没有通过公网 MIME/字节哈希。没有重试、发邮件或把 MCP 成功当普通网络成功。标准本地 PNG 仍为 196,202 字节、SHA **`29dea10fd2048cf016ddc9fa4bc9bafaf30ff891187e6f0fb09a8efea6a0de3c`**；线上 Logo 仍未修复，实际托管 HTML/主题/开关与收件箱渲染仍未验收。

22:27:23 重新核对 APK `e4d7aa34` 完整 SHA 仍为 `e4d7aa347aaca1d9f188e707ecd17d172803c87fe4db253812c222ef5cc8664e`；295 个输入仍仅上一轮 profileEditing、journalCore、api 三处差异。没有新包、App 运行时/画面改动或新安卓通过项；没有重复 App typecheck，上一轮对应源码检查作为历史保留。正式设计 **0/20**，release **NO-GO**。

后续 Logo 所需最小动作仍是**不覆盖地补传固定文件名**，再核对公开字节及安全读取真实 Auth 配置；不重复当前失败浏览器/GET，不以再次提出相同动作算进展。下一可执行本地发布事项转向**账户删除与隐私发布准备**；资料后端完整升级/Storage API、安全部署批准、普通网络真实认证及 iOS 条件仍独立保留。

本轮完整根输出：`artifacts/release-readiness/20261015-public-logo-check/integration.json`；开发测试摘要 `verification.json`、只读云证据 `cloud-readonly.json`、浏览器有限尝试 `browser-readonly-attempt.json` 均在同目录，旧证据未覆盖。

## 2026-10-15 22:10 轮：头像并发与删除超时恢复已通过本地候选验证，未部署、未进安卓包

本轮沿用“暂不能切换网络”的约束，推进可执行的资料/头像后端安全事项。验收限定为：已确认的清理预约在权限探测回滚后仍有效；保存与清理的两种执行顺序在 RC/RR 均不产生悬空引用；未知清理准备不删除；删除已完成但响应超时后可以安全核对并恢复后续编辑。不重复真实登录、发码、APK 构建、模拟器或 Docker/WSL 操作。

**实际实现**：现有未部署迁移加入私有、不可复用的头像清理预约，鉴权/owner/path/session 校验的 `prepare_my_profile_avatar_cleanup` RPC，以及同一 profile 行锁和服务端 lifecycle epoch。严格 INSERT/DELETE guard 防止其他 permissive policy 放行退役路径；资料 RPC 拒绝重新绑定，provider metadata 不能注入私有路径。客户端 DELETE 前必须取得明确匹配的预约，并重新核对账户；未知/畸形/超时保持 pending，不重放资料写入。准备与删除共用单调时钟 3 秒预算，不代表整个资料操作只有 3 秒。新 RPC 类型已补齐。

独立复审发现的真实恢复缺口已 RED→GREEN：已删除元数据的预约现在明确返回 `retired-missing`；客户端以 `already-absent` 区分它与删除应答，fresh auth→profile→auth 后仅按严格日志决策终结，不再发送 DELETE。该结果**不证明物理图片字节已删除**。复审最初提出的“protected-current 永久阻塞”经状态机与行为测试反证后撤回：原逻辑保留记录，下次从最新资料重新选择真正孤立的 candidate 清理；不能直接清日志漏掉孤儿。

**最终证据**：真实本地 PostgreSQL 17.11 用 3 个 backend、实际 `pg_blocking_pids` 等待，**12/12 PASS**，包括 RC/RR 两种锁顺序、同路径并发/幂等重试、权限探测回滚、当前头像保护、元数据缺失恢复、不可重绑/重传、宽松 policy 不能绕过、混合批次、其他 bucket 与 provider 注入。最终于 **2026-10-15 22:03:41 +08:00** 完成 exit 0、`stopped=true`，6 个输入末尾哈希一致；22:07:56 只读核对无数据库进程及 65439 LISTEN。此次恢复新增断言曾在旧候选实际失败，RED 记录保留，非把中间版本通过冒充最终版本。客户端最终 **103/103 本地行为/边界模拟/源码护栏 PASS**，typecheck 最终 exit 0；最初 TS2345 失败也保留。独立窄审最终 APPROVE 仅本地集成，无新增确定 P0/P1。

当前迁移 SHA-256 **`36ecfea0e5a2f6c528dc1f978a82b5db42037ceb0a9c416c136eff10a3491f31`**，客户端 **`bbf6a6ab091b3b62f4c0614dbeb0f262530ac52d2df5139e1c7fbdfa009a1ced`**。其他身份/完整输出见汇总证据。已保留 APK `e4d7aa34` 完整 SHA 仍为 `e4d7aa347aaca1d9f188e707ecd17d172803c87fe4db253812c222ef5cc8664e`，295 个构建输入仅 profileEditing、journalCore、api 三处不同；**旧包不含本修复，无新安卓通过项**。

**尚未完成生产资料接通**。官方上游 Storage 的权限探测会回滚，不能依赖探测中的临时行锁；已据此调整候选，但云端实际 Storage 版本未查验。本地 JWT/account/session/base schema 明确为合成 fixture，SQL 元数据操作不是 Storage HTTP/对象字节测试，完整升级/pgTAP、安全与账户删除顺序未验收。永久预约记录的增长/限流预算、旧客户端最小版本与迁移顺序、privileged service-role/admin 直写边界仍为生产门槛。没有部署迁移/RLS、改云配置、删真实数据、改密或发运动指令。

下一项先补完整升级/实际 Storage API 安全门禁和版本配套，再提出范围清楚的生产迁移批准；若完整环境仍被既有权限阻断，不循环重启，推进未阻塞发布项。普通网络真实认证、邮件 Logo/云模板、账户删除/隐私与 iOS 条件不变。正式设计 **0/20**，release **NO-GO**。

汇总：`artifacts/release-readiness/20261015-avatar-retirement-candidate/verification.json`；最终原生数据库证据：`artifacts/release-readiness/20261015-avatar-concurrency-2026-10-15T14-03-19-327Z/verification.json`；上游版本/链接及限制：`artifacts/release-readiness/20261015-avatar-retirement-candidate/storage-upstream-review.md`。历史证据与安装包未覆盖。

## 2026-10-15 20:50 轮：头像并发测试工具阻断已关闭；产品并发缺陷仍未修复

继续上一事项，未叠加 App UI、认证或数据库迁移改动。验收条件限定为：真实命令退出不受继承输出管道拖延；真正超时可以有界返回并明确终止状态；加固 runner 从固定 SQL 快照跑通 RC/RR 并停止自己创建的数据库。森哥暂不能切网络的约束保持，不重复登录、请求切网、构建 APK、启动安卓模拟器或修复 Docker。

把本地命令执行边界提取到 `scripts/helpers/bounded-command.mjs`：统一以子进程 **exit** 判定进程结果，不再将 **close/输出管道关闭** 当成命令完成；执行时限在 exit 后停止，输出只做短时有界采集；真正超时只终止该子进程，再有界等待退出，仍未知就明确保留 PID/unknown，不把 `null` 或 stdout 的 Success 当成功。分别记录 spawn error、非零退出、信号退出和超时，以及 PID、code/signal、exitObserved、streamsClosed、事件与时长。runner 同时快照 helper/测试并核对输入身份；initdb 结束或失败后关闭本轮自己的密码管道 socket，防止管道清理无限等待。未在输出/文件中加入测试明文密码。

回归先行：加强后的真实 Node 父进程/有限子进程 IPC fixture 实际复现旧 close 等待把已退出父进程标成 timedOut=true（2,077ms）；修复后不再误超时。最终 **5/5 PASS**：继承诊断管道、真正超时且观察到退出、Success 文本伴随 exit7、ENOENT、kill 返回 false 后有界 unknown。最后一项仅在 OS 边界替换 kill 返回值，测试负责停止其精确 task-owned 子进程；不是物理/安卓或 Storage 验收。相关 JS 语法检查未报错，App TypeScript 未变，本轮没有重复全套 UI/typecheck。

**仅一次本轮 native PostgreSQL 联测，20:45:11 +08:00 完成 exit 0，`stopped=true`**。实际 initdb 在 **13,212ms exit0，streamsClosed=true**；pg_ctl start 在 exit0 后仍有继承输出管道，记录 `streamsClosed=false` 后正常结束有界采集，随后数据库实际查询和 `-w` 就绪均通过。此结果关闭当前 runner 的已验证正常路径阻断，**不能反推上轮 initdb 的具体挂起根因已经查明**。

当前迁移仍是上一轮语法修复候选 **`6c255505df12e632ae53985d2586d356c3ecdfee0a09c509d083af04ff7868e0`**，没有新锁/RLS 行为修复。新 runner SHA **`fbde49dba5b7a41c21b2b8c518018269825707b879ce4a2c52959462806dc7dd`**、helper **`1c1fd28491fb27d4666fa011bd1143df0a0914d8504a5242fe6fb2a3ffd9762d`**、测试 **`e5abb8679401fed5aadbd93ed0d5822f73b13e9fbd7b985803b869a585234224`**，全部 5 个输入运行末尾及 20:49 复核一致。三个实际 backend A71648/B62444/observer60836，在 RC/RR 均观测 B 被 A 的真实 transactionid lock 阻塞后才放行，最终仍为 **RPC 成功、头像路径保留、对象元数据缺失、审计一行**。这验证的是失败基线可稳定复查，不是头像并发安全通过；Auth/base-schema stub、admin 行锁屏障及 SQL 元数据非 Storage API 的限制不变。

独立窄审 **APPROVE 已执行的正常/native 路径**，不要求重复跑库。保留两个 LOW 工具边界：未确认终止分支返回的诊断对象可能被晚事件修改；该分支只能按记录 PID/owned-cluster 操作人工核对清理，不能声明保证终止。此次成功运行没有进入 unknown 分支；硬终止/断电的 finally 不受保证。20:49 只读复核无 postgres/initdb/psql/pg_ctl，65439 无 LISTEN。历史失败记录/快照未覆盖；合成簇保留且停止，没有删除用户账号或数据。

**本轮完成的是测试工具阻断，不是产品并发修复。** 下一项直接推进头像引用/清理的最小生命周期修复，用现有 RC/RR 实例验证，并单独查验真实 Storage API 的删除顺序；不再因 runner 正常路径反复启动环境，也不把 advisory lock 单独当 RR 安全证明。未部署生产迁移、改访问权限、改密、发邮件或发机器人指令。保留 APK `e4d7aa34` 的完整 SHA-256 仍为 `e4d7aa347aaca1d9f188e707ecd17d172803c87fe4db253812c222ef5cc8664e`，没有新包或新安卓通过项。普通网络真实认证、Logo/云模板、账户删除/隐私及 iOS 条件仍阻断；正式设计 **0/20**，release **NO-GO**。

真实数据库证据：`artifacts/release-readiness/20261015-avatar-concurrency-2026-10-15T12-44-52-800Z/verification.json`。本轮源码/RED→GREEN/原生命令观察和审查汇总：**`artifacts/release-readiness/20261015-avatar-command-boundary/verification.json`**。Node 官方事件语义：<https://nodejs.org/api/child_process.html#event-close>、<https://nodejs.org/api/child_process.html#event-exit>。

## 2026-10-15 20:35 轮：普通网络暂不能切换；头像迁移语法已修正，数据库并发缺陷已实证、尚未修复

森哥明确回复**暂时不能切换网络**。本轮不再请求切换、不重复提交真实登录或恢复邮件，也不重复构建/安装已有安卓 QA 包。普通直连认证仍为阻断；邮件 Logo/云模板沿用 16:44 的未闭环证据，本轮没有重新查询云端或声称修复。Docker 待批准目录未动，未启动 Docker/WSL 或改全局设置。

改走已授权、隔离的本地验证：从 PostgreSQL 官方 Windows 下载页指向的 EDB HTTPS ZIP 获取 **PostgreSQL 17.11** 便携运行时，放在工作区相邻 `.local-toolchains`，没有安装 Windows 服务或修改系统 PATH。归档 SHA-256 `80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f` 是本地下载字节身份，**未取得独立的厂商公布校验值，EXE 为 NotSigned，不能声称独立签名/供应链校验通过**。测试只绑定 `127.0.0.1:65439`，SCRAM 鉴权，随机测试密码只在内存、命名管道与子进程环境传递，未显示或写入明文文件；没有真实账号、密钥或生产数据库连接。官方入口：<https://www.postgresql.org/download/windows/>。

**本轮实际修复一个更早的本地阻断**：未部署的 `20261012090000_add_profile_editing.sql` 原 SHA `a6b472d96ac988d871ca346218278c53ce4ba55bc6e0d2e2948c0e576ef599ac` 被真实 PG17 拒绝解析，原因是 `pg_catalog.substring(p_avatar_path from ...)` 不能使用该限定名关键字语法。仅将这一处改为等价逗号参数形式；新 SHA **`6c255505df12e632ae53985d2586d356c3ecdfee0a09c509d083af04ff7868e0`**。真实数据库随后成功载入并执行 RPC，构成此处语法缺陷 RED→GREEN；没有修改锁、RLS 或授权语义，**没有部署到云端**。原始失败字节、错误、差异和新字节分别保存，不把原始未解析版本说成已跑过并发。

**并发缺陷实证仍是 RED / NOT FIXED**：20:27 的成功实验用了语法修复后的候选、三个不同真实 backend（A 41376 / B 78504 / observer 23052），分别在 READ COMMITTED 与 REPEATABLE READ 下，让 A 持有仅用于测试的 owner 行锁、以 `authenticated` 真正通过原 DELETE policy 删除候选对象；B 以同角色调用真实 `update_my_profile`，先看到旧对象、再被 A 阻塞。`pg_blocking_pids(B)` 实际包含 A 后才提交 A。两种隔离级别最终均为 **RPC 成功、资料引用该路径、对象元数据不存在、审计一行**，成功实验退出 0 且 `stopped=true`，输入末尾哈希一致。实验有明确的 Auth/account/session/base-schema stub，不是 JWT 校验、Storage API、图片字节、完整 Supabase、完整升级或安卓端到端验收。真正 Storage 表操作只能走 Storage API，不能以此合成 SQL 实验授权生产元数据删除或自定义触发器。成功证据：`artifacts/release-readiness/20261015-avatar-concurrency-2026-10-15T12-27-00-637Z/verification.json`。

新增 runner/fixture 将实验保存为可复查资产；随后收紧了固定候选哈希、不可变 SQL 快照执行、角色/隔离级别断言、signal 处理和 task-owned stop 记录。**最新加固 runner 的集成没有通过**：最后一次 `initdb` 到 90 秒进程时限，退出 null（其 stdout 已含 Success，不能仅凭文字判成功），没有进入 `pg_ctl start` 或并发用例。未继续循环重试。该失败记录为 `...12-29-25-858Z/verification.json`；不能拿此前 runner 的成功替最新 wrapper 验收。独立静态窄审的批准条件依赖最新集成通过，因此该条件未满足。最初一次 Windows 继承输出句柄等待故障已用精确 data directory 外部 stop 收尾；原始 `stopped=false` 记录未重写。20:34 最终只读确认无 postgres/initdb/psql/pg_ctl 进程、65439 无 LISTEN；未删除任何现有账号、用户数据或历史证据，合成簇保留为停止状态。

最后 `node --test scripts/profile-editing.test.mjs` **58/58 PASS**（本地行为边界模拟 + SQL/源码护栏，不是并发安全通过）；当前 runner `node --check` exit 0。App TypeScript 未改，未重复 typecheck、原生构建或假计原生通过。已安装/保留 APK `DOSO-0.0.1-qa-e4d7aa34.apk` 完整 SHA-256 仍为 `e4d7aa347aaca1d9f188e707ecd17d172803c87fe4db253812c222ef5cc8664e`，本轮没有新原生测试。总证据与源码身份：**`artifacts/release-readiness/20261015-avatar-concurrency-summary/verification.json`**。

**下一项**：先解决本地 runner 进程边界可靠性，再以已复现用例验证头像引用/清理的最小服务端生命周期修复，覆盖 RC/RR；不得将单加 advisory lock 当作 RR 安全证明。之后仍需完整 Supabase Storage/升级/安全审查，再提出范围明确的生产迁移批准，联网条件可用后接回真实安卓认证。资料后端尚未接通；未知会话撤销跨 mount/重启、防挂起、Logo、账户删除/隐私、真实地图/设备与 iOS 条件不变。正式设计 **0/20**，release **NO-GO**。

## 2026-10-15 19:13 轮：安全反馈修复已进入新 Android QA 包；覆盖安装与有限原生回归通过

没有继续叠加产品源码改动。本轮将上一轮安全页修复（SHA-256 `5c3c73399374a478ad1c1f85746ddeca236f40042729fb5db11057ed066e2ffe`）纳入一次新的真实 App `assembleQa`：**19:21:39 +08:00 成功，273.5 秒**。交付 **`releases/20261015/DOSO-0.0.1-qa-e4d7aa34.apk`**，77,303,965 字节，完整 SHA-256 **`e4d7aa347aaca1d9f188e707ecd17d172803c87fe4db253812c222ef5cc8664e`**。新清单扩展纳入原生 Kotlin、资源、Gradle wrapper、plugins 等共 **295 个输入**，构建前后及 19:36 再核对全部一致；数量增加不是新增了 295 个功能。正常 `index.ts`/AuthProvider 入口，JS 已内置，不是网页、Design QA 或 Preview；`C:/doso-build` 的 Junction 指向同一仓库已校验。只有一个构建，复用原模拟器，没有重新生成原生工程或启动第二模拟器。旧包与旧证据保留。

APK 本体经 apksigner v2 和 aapt 确认：`com.doso.robot.qa`、versionCode 6、0.0.1-qa、arm64-v8a/x86_64；实际证书 DN 为 Android Debug，证书 SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` 与旧 QA 一致，**不是批准的生产签名**。19:25 `adb install -r` 同版本覆盖安装成功，设备 base.apk 与交付包完整哈希一致，无卸载/清数据命令。PackageManager 首次安装时间仍为 2026-08-28 20:16:07；但 run-as/private inode 读取被权限拒绝，未提权，故**私有数据保留与会话恢复均未验证**，不凭时间戳宣称成功。ActivityManager 观测 COLD 4,220ms、Wait 4,258ms；首次 UI 为恢复会话，随后到 Login，不能将该数值当 TTI、首屏性能或登录成功。

实际完成的新包有限原生 smoke：空密码显示/隐藏往返；空表单同时提示邮箱/密码、聚焦邮箱、键盘 Back 后表单可操作；找回密码可见返回→Login、注册空表单硬件返回→Login；第三方说明可展开、滚动到邮箱替代路径并收起，Apple/微信/QQ 均观测为 disabled，未触发授权。4 张原生截图及脱敏节点/哈希已保存；最终停在浅色竖屏 390×844、fontScale 1.0、说明收起、输入为空的真实登录页，PID 9553，HTTP proxy 为 null，任务临时采集文件已清理。未填凭据、未提交真实登录/注册、未请求恢复邮件、未撤销会话；不宣称 AuthProvider 后台零网络。

上一轮 57 项本地检查/typecheck 的源码身份仍匹配，本轮没有重复执行，也不将其算作原生通过。**账号安全新反馈逻辑的原生异常/撤销中返回路径仍 NOT_RUN**：没有已认证会话，不以真实账号撤销制造故障。普通直连网络切换、Docker 目录修复确认仍未收到，未重试；未操作云端、改密码、删除数据或发机器人指令。当前阶段是“当前源码 QA 包已构建、精确安装、有限本地 UI smoke 通过”，不是 clean install、版本升级、完整认证/弱网或商店发布验收。未知结果跨 mount/重启防重放、SDK/存储挂起、资料后端并发/部署、邮件 Logo/云模板、注销/隐私与 iOS 条件仍未完成。正式设计 **0/20**，默认 release gate 未通过，release **NO-GO**。下一项仍为网络恢复后的真实登录与账户安全回归。证据 `artifacts/release-readiness/20261015-security-feedback-qa/verification.json`。

## 2026-10-15 17:14 轮：安全页错误脱敏与未知撤销防重放（本地候选通过，尚未进入 APK）

先有限尝试已授权的标准邮件 Logo 补传：浏览器 inventory 能列出已登录 Supabase 素材页，但实际 `getTab` 连续在 30 秒、20 秒超时并重置通道；随后停止，**没有上传、覆盖、权限或模板变更**。不能把“能列出 tab”写成可操作成功，云端 Logo 仍沿用前轮缺失结论，未在本轮重新查询。普通网络切换和 Docker 最小修复批准也未收到新答复，未重复登录、构建或启动环境。

转向未阻塞的明确客户端缺陷：`AccountSecurityScreen` 的普通 Error 原文此前直接进入界面；服务返回普通网络/Edge 错误时，旧确认闭包还可在下一次渲染前再次撤销，不能证明服务端未提交。现对终端、登录方式读取分别给固定刷新提示，仅服务层 typed outcome 保留其固定安全文案。所有无法证明为只读前置超时的撤销异常（含普通 Error、字符串、对象、null）都会同步设置本 mount 的结果未知锁，禁用三类再次撤销；刷新与返回仍可用，刷新不清锁。未完成的 typed `read-timeout` 仍可重试；撤销已确认后再遇刷新/回调失败则继续锁住。没有修改 `sessionService`、`AuthContext` 或 App 的 session_revoked/降级合同。

两个行为实际 RED→GREEN：内部 SDK sentinel 曾显示在页面；旧确认闭包曾使 mutation 调用次数为 2，修复后为 1。新关键用例执行真实 screen 与真实 session/auth service，仅 SDK、SecureStore、React/host 边界模拟；既有页面用例继续保留其服务 fixture。最终 `test:security-ui` 为 **14 项布局/源码护栏 + 36 项服务/页面行为 PASS**，`test:account-flow-screens` **7 PASS**，合计 **57 项本地检查**；`typecheck` exit 0，改动文件 diff check exit 0。独立实际窄审 APPROVE，本增量无新增确定 P0/P1，**不是 Android 原生、真实撤销或整体上线通过**。

19:09 源码核对：安全页 SHA-256 `5c3c73399374a478ad1c1f85746ddeca236f40042729fb5db11057ed066e2ffe`，行为测试 `c338d291e539e01c077e4e2a32b30c014c2d0a12d1a24cff152970d8e5ae2ce8`。旧 QA 包 `88666b71` 完整 SHA-256 仍为 `88666b7132ac96037a20caaa538f88abb64d5d111655ff9bef8661e789e13c0f`，246 个构建输入中**仅安全页 1 个不同**；本轮没有新 APK，旧包不含本修复，不能沿用成新原生证据。

**保留 P1**：未知结果锁仅覆盖当前组件挂载，离开重进/进程重启/跨设备仍无持久消歧或服务端幂等；普通前置错误可能被保守锁住，当前服务合同尚不能证明派发阶段。SDK signOut/installation-id 存储挂起、真实普通网络认证、资料后端并发与部署、邮件 Logo、账户删除/隐私及 iOS 条件均未因此完成。下一项仍是网络切换确认后的真实 Android 登录/安全回归，并在下一次必要 QA 构建纳入本页改动。正式设计 **0/20**，release **NO-GO**。证据 `artifacts/release-readiness/20261015-security-safe-feedback/verification.json`；旧证据未覆盖，无真实撤销、改密、账号/数据删除或机器人运动。

## 2026-10-15 16:44 轮：邮件 Logo 缺图误通过已修正；线上对象仍缺失

本轮验收限定为生成邮件模板的缺图/图片源检查，不重启构建、模拟器或真实登录。测试先行复现了“删掉图片只留网址”“图片藏在 HTML 注释”“alt 属性内伪 src”仍被本地检查放行的问题；现要求排除完整/未闭合注释后有两处 `<img>`，每图按生成器约定以唯一、带引号的真实 `src` 开头，只允许批准的固定 URL，并拒绝 `srcset`/`picture`/`source`。无效模板在任何远端请求、快照和 PATCH 前停止。未改模板设计、Logo、App 运行时或生产配置；这是有限的生成模板检查，不是通用 HTML 安全清洗、CSS 可见性或真实邮件渲染证明。

最终 `npm run email:check` 成功（13 个生成文件未漂移，7 个原生模板与本地配置匹配）；`npm run email:test` **74/74**，包含坏模板 local/remote/direct-sync 零请求与无快照回归。测试中的同步/回滚全部使用 mock，**没有真实云写入**。只读复审批准本轮窄修增量。工具/测试 SHA-256 分别为 `d0d52a12d0921c629c43c0a43e01334fd49124a2e48948c7e55d21dad7918acd` / `a467585ae78261643b7dff2a3a52d70eb16fb437ccab85b51750c64c89ac1cb8`。

本轮 Supabase 只读对象查询仍显示：`email-assets/doso-robotics-wordmark-email-29dea10fd204.png` **不存在**，`DOSO.png` 存在；未下载公网文件、未回读线上 Auth 模板，更未上传覆盖或同步。因此 **线上 Logo 未修复、真实云模板一致性未通过**。后续仍须禁止覆盖地补传标准文件，并核对公网 MIME/长度/完整哈希与托管模板；不能以本地 74 项测试替代。

17:09 再核对交付包 `releases/20261015/DOSO-0.0.1-qa-88666b71.apk` SHA-256 仍为 `88666b7132ac96037a20caaa538f88abb64d5d111655ff9bef8661e789e13c0f`，246 个构建输入全部未变；本轮未新增原生通过项。正式设计 **0/20**、release **NO-GO**。普通直连网络切换与 Docker 最小修复授权尚未收到答复，未重复尝试；下一优先项仍是网络恢复后的真实 Android 登录/账户安全回归。资料后端并发、注销/隐私和 iOS 条件仍未因此完成。新增证据 `artifacts/release-readiness/20261015-email-logo-guard/verification.json`；此前证据不变。

## 2026-10-15 16:14 轮：当前源码 QA 包已构建安装；真实登录被直连链路阻塞

本轮不再只停留于源码测试：唯一一次 `:app:assembleQa` 已于 **16:23:22 +08:00** 成功，耗时 **239.3 秒**，产出 **`releases/20261015/DOSO-0.0.1-qa-88666b71.apk`**，**77,303,897 字节**，SHA-256 **`88666b7132ac96037a20caaa538f88abb64d5d111655ff9bef8661e789e13c0f`**。arm64-v8a/x86_64，versionCode 6、0.0.1-qa；真实 `index.ts`/AuthProvider 入口，JS 已打包，不是静态 Design QA/Preview。246 个源码/配置/资源输入在构建前后及 16:40 再核对均一致，包含新 journal、返回保护与请求 deadline。没有改产品源码或重生成原生工程；新增的本轮构建/启动/采集 helper 位于 `../.local-tools`。

`apksigner` v2 验证通过，证书 SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` 与旧 QA 一致。16:25 用 `adb install -r` 覆盖安装成功，无卸载、无清数据；CE/DE inode 377557/90799、首次安装时间保持不变。`am start -W` 观测 COLD Activity 启动 **4,059ms**（等待 4,154ms）。设备内 base.apk 的 SHA-256 与交付包完全相同。这是 QA/debug 证书包，同版本替换验证，**不是生产签名、商店升级流程或 release-ready 制品**。

复用 DOSO_API_35 原数据，仅启动一次无代理子环境的 headless 模拟器，未 wipe/snapshot/reset。首次出现的是 **System UI isn't responding**，不是已证实的 DOSO ANR；留图后只点一次系统 Wait，随后页面可读取，DOSO PID 3978 持续存在。不能凭 Activity 启动结果宣称系统稳定无 ANR。数据保留不等于会话恢复：本轮实际到达 Login，旧会话**没有观测到恢复**，原因未归因于升级或密码。

使用此前存在的 Windows Credential Manager 记录完成掩码填入（仅 LoginFill，未生成/显示/写入新密码）并提交 **1 次真实登录**。App 返回“无法连接认证服务，请检查网络后重试”，没有进入已认证页面，不能判密码错误或登录成功。主机 Node 直连三个匿名探针均 network_error，项目 health 的 cause 为 **ECONNRESET**；Supabase 官网同客户端 200。Windows curl 使用既有代理环境可得到项目 health **401 / TLS verify=0**，但显式 `--noproxy '*'` 则 exit 35 / connection reset。Android 无 HTTP proxy、无 ADB reverse，项目 DNS 能解析、TCP 443 可通，但 App HTTPS 登录失败；TCP 成功不证明 TLS/Auth 成功，代理响应不证明普通直连通过。本轮没有新增代理、绕过证书校验或用代理成功冒充直连。

完成的有限原生回归：Wi-Fi/移动数据关闭后提交登录，观测网络错误且表单恢复可操作；约 2.7 秒是从点击到采集到结果的时间，**不是精确请求时长，也不是 Edge 撤销 15 秒超时/晚回包通过**。finally 已恢复 Wi-Fi/data 为 1/1。登录凭据从表单清空并校验后才采集登录错误截图。另完成真实 App 的 Register→Android Back→Login，以及 Forgot password→可见 Back/Android Back→Login 三条空闲返回路径，未提交注册、邮件验证码或密码重置。

**仍未通过**：真实普通网络登录；登录后的 AccountSecurityScreen；撤销进行中的硬件返回、未知结果/已确认后刷新失败的原生状态。当前没有安全服务注入 fixture，禁止点真实撤销“确认”制造测试；静态 Preview 安全壳不能替代真实组件。前轮 49 项本地检查/typecheck 仅保留其匹配源码的历史证据，本轮未重复跑，更未把它们算原生通过。正式设计 **0/20**，release NO-GO。

最小人工动作已提出：将电脑切到另一条网络（如手机热点）后告知，不发送密码或验证码；环境不变时不重复构建/登录。后续优先恢复真实认证与安全页原生回归；等待期间可推进其他未阻塞本地发布事项。资料后端并发/未部署迁移、邮件 Logo、账户删除与隐私、SDK/存储挂起、iOS/商店均未因此完成。无真实撤销、改密、删账号/数据或机器人运动；Docker 待批准目录未触碰。当前交接为浅色竖屏、fontScale 1.0、已清空输入的真实登录页。证据：`artifacts/release-readiness/20261015-client-security-qa/verification.json`，旧证据/旧包保留。

## 2026-10-15 15:44 轮：终端请求时限与部分完成反馈（限定本地候选通过）

本轮实际为 `sessionService` 的每次 Edge invoke（包含响应正文解析）及备用 RPC 增加 15 秒时限。超时或 JS 线程繁忙导致响应/错误过期时，抛固定安全文案的 typed 结果；晚 Edge/RPC 回包不能继续到 native signOut，不自动重放。显式确认的撤销计数、正常零计数和原 local/others/global scopes 均保留。SDK signOut 返回错误或 throw 则单独表示“终端访问已撤销，但登录会话清理结果未确认”，不泄露原始错误，也不把已确认撤销报成全失败。

同时修复调用方的必要边界：App 普通退出与密码更新后撤销原有的两级 fallback，遇到 typed 未确认/部分完成结果立即停止，不继续备用撤销或 logout；密码已经更新的场景转到账号安全并明确提示，不能留在可重复提交密码的表单。安全页收到未知结果后先同步设 ref 再释放 activeAction，当前 mount 内禁用再次撤销；刷新/返回仍可用，刷新不会凭一次列表读取自动解锁。禁用与 loading 分开，不把等待核对画成持续旋转。

独立初审发现本轮 P1：撤销成功后的列表刷新/after 回调失败会重新开放旧操作。已用失败回归复现同一撤销调用两次，再修复为 `actionCompleted` 分段记录：后续任意异常都明确提示“撤销已确认，但页面状态更新未完成”，同步锁住再次撤销，保留返回与刷新。复审 COMMENT：本增量未发现新增确定 P0/P1，可保留候选，非上线 GO。

最终 `test:security-ui` **14 项布局/源码护栏 + 17 项服务/App 回调 + 11 项页面/返回行为 PASS**，`test:account-flow-screens` **7 项护栏 PASS**，合计 **49 项本地检查**；`typecheck` exit 0（session 41112），diff check 无错误。6 个关键行为实际 RED→GREEN，初次 47 项检查日志与复审修复后最终日志分别保留。这些测试使用真实服务/生产 App 回调、模拟 SDK/hooks/host 和 fake clock，不是 Android、真实云撤销或真实密码更改通过。

**未完成边界**：15 秒是每次 Edge/RPC 时限，不是整个登录/安全操作总时限；没有将 SDK signOut 外层 race，因为它晚完成仍可能修改认证存储。因此 SDK 挂起与 SecureStore installation-id 预检挂起仍无界，整项“认证全链路有界”未通过。没有声称取消网络等于服务端回滚；未知请求仍可能远端完成。安全页防重放只维持本 mount，离开重进/进程重启/跨设备尚无持久消歧。普通非 typed 服务错误安全映射、终端项 schema、资料后端并发、邮件 Logo、账户删除和隐私发布条件仍保留。AuthContext 定期 heartbeat 轮询不变，不把“此调用无自动重试”扩大为整个 App 不再轮询。

16:10:31 +08:00 身份核对：App SHA-256 `7ace71a9949c9d147fc98edf04d010e03be1a19952db4460bf3e9b86a2d8e28d`，sessionService `aedfb77a913343835a6eabb88b18b1a9e737804ed86bf3308dd5802872a51089`。没有新 APK，旧 `e58df5af` 包 SHA 一致，237 历史输入仍有 App/package/AccountSecurityScreen/profileEditing/sessionService **5 个不同**，不能拿旧包当当前修复验收。未云写入、真实撤销、修改密码、删除数据或发机器人指令；未启动 Docker/模拟器或重试待批准的目录修复。正式设计仍 **0/20**，release NO-GO。证据：`artifacts/release-readiness/20261015-session-request-deadline/verification.json`。

**下一轮优先合并一次当前客户端 Android QA 构建**，校验源码/包身份并覆盖安装，做启动、返回与弱网反馈原生回归；不继续仅因资料后端/SDK 边界未全清而无限推迟可测试 QA 包。SDK/存储有界化与生产后端阻断独立保留，QA 包不冒充生产签名或上线制品。

## 2026-10-15 15:14 轮：账户安全内部动作的 Android 返回保护（本地候选通过）

本轮实际修复内部终端撤销尚在执行时，App 的 Android 返回分支直接退出安全页的问题。`AccountSecurityScreen` 注册统一 `requestBack`：同步检查 mounted、外部 busy 和 `activeActionRef`，可见返回与硬件返回使用同一处理器。App 保留原 accountBusy/OTP 门槛，再委派给页面，而不直接跳回个人页；导航目标不变。ref 在第一个 await 前已写入，因此不依赖 React 下一次渲染才锁住返回。锁覆盖撤销、后续终端列表刷新及全部终端退出回调；成功/失败后 finally 恢复，卸载会注销回调，旧回调与晚完成不能再触发页面导航。

测试先行：新套件修复前 1/8 通过、7 项因注册/委派缺失失败，修复后 **8/8 通过**；这不是 7 个独立原生缺陷的声明。最终 `test:security-ui` 为 **14 项布局/源码护栏 + 8 项服务边界 + 8 项页面/App 回调行为 PASS**，`test:account-flow-screens` **7 项源码护栏 PASS**，`typecheck` exit 0（session 65577）。共 37 项本地检查，不是页面数。新测试执行真实页面处理器与从 App AST 抽出的生产 BackHandler 回调，React hooks/host/SDK 边界为模拟；**不是 Android 原生事件、完整 React 渲染或真实云端撤销通过**。独立窄审 COMMENT：未发现本增量新增确定 P0/P1，可保留候选，不是整页或发布 GO。

**超时未完成，不能掩盖锁住过久风险**：审查确认不能在页面 runAction 外包 Promise.race，否则超时解锁后，底层晚响应仍可能继续 auth.signOut。下一独立切片应在 sessionService 内限制 Edge invoke 与后续 signOut 各阶段，明确“结果未知/撤销已确认但本机会话清理未确认”，不自动重放；用 deferred 回归证明晚 Edge 响应不进入 signOut。再合并一次当前源码 Android QA 构建，验收返回键/手势、普通网络及弱网，不把本轮 VM 测试当原生证据。

15:28:01 +08:00 身份核对：App SHA-256 `e134faad8b686deb1c0696ca8e2bb08934e4af130c94d30fb3c1e85f1940b2aa`；没有新 APK。旧 `e58df5af` 包哈希仍一致，237 历史输入已有 **5 个不同**（App/package/AccountSecurityScreen/profileEditing/sessionService），另有旧包未包含的新 journal。Docker 目录修复仍等待原用户确认，本轮未触碰或重启；未云端写入、真实撤销、删除账号/数据、修改密码或发运动指令。资料后端并发、邮件 Logo、账户删除与隐私条件仍保留；正式设计 **0/20**，release NO-GO。证据：`artifacts/release-readiness/20261015-security-back-lock/verification.json`，旧证据未覆盖。

## 2026-10-15 14:44 轮：终端管理不再误报空列表/撤销成功（本地候选通过）

Docker 全局运行目录修复仍未获确认，本轮未触碰它、未重启引擎或重复跑数据库。按已授权主线转向未阻塞的账户安全/隐私发布准备。代码核对确认当前“账号与安全”没有账户删除入口或执行服务；退出终端不是删除账户。本轮没有伪造注销按钮、删除结果、保留期限或隐私主体信息。Apple App 内发起删除与 Google Play 的 App 内/网页请求入口要求分别见官方文档，仍是发布待办，不因已有退出登录而完成：<https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion>、<https://support.google.com/googleplay/android-developer/answer/13327111>。

实际修复 `sessionService.ts` 的明确安全完整性问题：缺少/null/非数组的 `terminals` 不再自动变成空列表；只有显式 `[]` 才是可信空结果。所有 Edge 撤销入口与两个 WithoutAudit 原始 RPC 降级入口都必须先取得非负 safe integer 的明确 `revoked` 计数，缺失、null、字符串、负数、小数、NaN/Infinity/不安全整数等不能继续到后续 `auth.signOut` 或返回成功。明确的 0 保留为幂等合法结果。current/others/all/specific 及降级路径原有 sign-out scopes 不变，降级安全警告契约不变，不因服务异常自动绕到别的权限路径。

3 个关键行为实际 RED→GREEN；新增 8 项服务边界回归（含 11 类非法计数×4 个 Edge 入口、降级 RPC、显式 0/正数、原 scope 和 native sign-out SDK 错误）。`test:security-ui` 已纳入新套件，最终 **14 项布局/源码护栏 + 8 项模拟 SDK 服务测试 PASS**；`test:account-flow-screens` **7 项源码护栏 PASS**；`typecheck` exit 0，`git diff --check` 无错误，仅既有 CRLF 提示。这些 29 项不是 29 页，也不是 Android、真实云端撤销或账户删除通过。未知响应只表示“结果无法确认”，不表示服务端一定没执行；用户提示要求刷新核对而非声称未撤销。

独立实际窄修复审结论 COMMENT：本增量未发现新增确定 P0/P1，当前 Edge 显式输出数值计数、SQL RPC 返回 integer，与现有合同相容；原 false-empty/false-success 在此源码范围内已关闭，不是整页/上线 GO。后续仍需补终端列表项完整 schema/敏感字段 allowlist、服务端错误原文安全映射、内部安全动作与 Android 硬件返回锁关联，以及请求超时。尤其 activeAction 未上报 App，硬件返回可能卸载尚在执行的安全页；已登记下一项，不以当前 visible back 源码 guard 当硬件实测。

15:06:04 +08:00 身份核对：没有新 APK；旧 `e58df5af` 包 SHA-256 仍为 `e58df5afd3578f53500acc32ca5b1491c6aead3b4221bfb3a29fd8ff5dbc7374`。237 历史输入现有 **4 个不同**（App/package/profileEditing/sessionService），旧包不含本轮修复和新 journal。未修改云端、未真实撤销会话、未删除账号/数据、未修改密码、未发机器人指令。正式设计仍 **0/20**，release NO-GO。证据：`artifacts/release-readiness/20261015-session-response-integrity/verification.json`。下一批优先补安全页硬件返回/超时反馈，再合并一次 Android QA 构建；Docker 批准、资料后端并发缺陷、邮件 Logo、账户删除与隐私发布条件仍独立保留。

## 2026-10-15 14:14 轮：后端阻断根因定位（只读审查完成；无新功能/部署）

本轮不继续叠加客户端推断。实际完成 Supabase 只读存在性预检、本机 Docker/WSL 诊断和未部署资料迁移的独立并发审查。云端当前 `profile_rpc_exists=false`、`avatar_bucket_exists=false`、`canonical_email_logo_exists=false`；没有读取账号明文或写云端。所以真实资料保存和邮件 Logo 仍未接通，不能用上一轮 97 项客户端/模拟边界测试替代。

数据库验证环境的直接故障点已定位：14:17 诊断时 Docker Desktop/backend 无进程、engine pipe 不存在；WSLService/vmcompute/hns 运行，两个 WSL2 发行版停止，Docker client 可用但没有 Server。日志显示 11:56 启动后，Inference manager 在处理 `C:/Users/99563/AppData/Local/Docker/run/dockerInference` 时遇到不可访问的 reparse socket，随后 backend crash / exit 150。当前 run 目录只有 `dockerInference` 与 `userAnalyticsOtlpHttp.sock` 两项，均为 0 字节 Archive/ReparsePoint，日期为 8 月 29 日。日志记录过一次 factory reset，但这两项仍在；本轮没有再次 reset、启动 Docker/WSL/数据库或修改全局配置。日志仅提取安全摘要与 SHA，不复制可能包含秘密的完整日志。

**等待范围明确的用户确认**：建议在 Docker 完全停止时，把精确目录 `C:/Users/99563/AppData/Local/Docker/run` 可恢复改名为 `run.stale-20261015-1414`，再仅启动一次 Docker Desktop，让其重建运行目录。14:25 目标目录已只读确认不存在，源目录本身不是 junction；该操作涉及全局 Docker 运行目录，不能将定时安排当作授权，故本轮未执行。不得删除/重置镜像、容器、数据卷或 WSL 发行版；若遇权限/不可访问错误，停止而非自动提权或重复重试。后续顺序为 Desktop running→engine pipe→docker Server→隔离数据库测试，不提前跑生产库。

新增明确部署阻断 **P1-PROFILE-AVATAR-DELETE-RACE**：未部署候选 `20261012090000_add_profile_editing.sql:357` 的普通对象 EXISTS 检查与 `:369` 之后的 profile 锁/更新没有共同互斥。事务 T1 看到非当前候选 C 存在后暂停；T2 的 DELETE policy 因 C 尚非当前引用而允许删除并提交；T1 再锁/更新 profile 并提交 C，可能形成悬空引用。现有 `profile_editing.test.sql:239` 只覆盖已引用后删除的单会话，不覆盖该交错。独立窄审结论 REQUEST CHANGES / HIGH，属于代码级完整性缺陷，**没有执行 PostgreSQL 并发实验，也不是线上事故声明**。

待数据库可用后，先双会话复现该缺陷，再验证统一 owner advisory lock、Storage BEFORE DELETE 当前引用锁读等最小候选修复；不能只前移 profile 锁或加对象锁后即宣称修复，需验证两种先后顺序、无死锁、Repeatable Read 安全拒绝与账户删除锁顺序。用户未批准生产迁移，本轮既未改 SQL，也未部署或为绕过条件安装另一套数据库。

14:29:33 +08:00 身份检查：上一轮 7 个源码/测试/package 输入全部匹配，故本轮未重跑未变更的测试或构建；97/97 只是上一轮历史结果（含 1 项负向边界证明），不是本轮原生或数据库通过。旧 `e58df5af` APK SHA-256 仍为 `e58df5afd3578f53500acc32ca5b1491c6aead3b4221bfb3a29fd8ff5dbc7374`，不含新 journal。无新 APK、真实数据删除、密码变更或机器人指令；正式设计仍 **0/20**，release NO-GO。证据：`artifacts/release-readiness/20261015-profile-backend-unblock-audit/verification.json`。下一步取决于上述 Docker 运行目录修复确认；未获确认前不得重试启动，可转向未阻塞的账户/隐私发布准备，不重复索要同一授权。

## 2026-10-15 13:44 轮：未派发头像操作可撤销（限定本地候选；整项未通过）

本轮完成上轮恢复阻断的一个可证明子项：新增 `prepared` 阶段，资料保存先 `beginPrepared` 持久化与回读；上传前或 remove-owned 的 RPC 前再在同一存储锁内执行一次性 `arm`，只有 prepared→uncertain 写入且确认成功才创建网络请求，中间没有其他 await。上传前身份校验失败可留下 prepared，而不是误记为已派发。下次保存只原子撤销匹配的 prepared 记录并停止本次表单，不会顺带重放；若旧调用已 arm，则取消被拒绝并保留记录。旧 v1 uncertain/terminal 记录继续可读，不推断旧不确定操作已回滚。

`cancelPrepared` 与 `arm` 都在 owner 锁中重读 operation/phase，并确认写入或移除结果；arm 不是可重试的派发许可，确认丢失后即使实际上已写 uncertain，也不发请求、不重复 arm、不取消。移除头像分支在认证/arm 失败时不误记 rolled-back。取消确实成功但确认丢失时，本次仍不提交，下次可重新读取空记录。通过暂停原调用、重试先取消、原调用 arm 失败的交错，验证零 upload/RPC/DELETE。

最终 `test:profile-editing` 执行 **97/97**、`typecheck` exit 0。其中 **96 项正向/约束回归，1 项是明确复现不支持边界的负向证据**，不能把后者算为跨 native runtime 能力 PASS。比上轮增加 13 项（12 项正向/护栏、1 项负向），3 个新行为实际 RED→GREEN。96 项初次运行与 97 项最终运行日志分开保留。独立实际增量审查为 COMMENT：在单 UI JS runtime 合同内未发现新增确定 P0/P1，候选可保留，但不是生产/功能 GO；审查者没有自行运行测试，最终命令结果由主代理记录。

**硬边界**：SecureStore 没有跨 JS runtime CAS，native 模块锁仅限当前 UI runtime。双独立 VM adapter 负向测试确实构造出了 arm 后被另一运行域 stale cancel 删账的 P1，因此禁止把服务放入 headless/background/extension/第二 native runtime。当前运行时代码引用只有 App→profileEditing→adapter，增加 AST 来源护栏（含禁止运行时代码调用旧 `begin`），但它不代替原生原子存储或运行时安全证明。Web 使用共享 Web Locks 的双 context 两种竞争顺序通过模拟边界测试，不是实际多标签原生验收。

仍未解决：arm 实际落盘但确认失败、arm 后请求未创建即崩溃、真正派发后的上传/RPC 未知结果、DELETE 晚成功后空响应、服务端操作确认与自动启动恢复。上述仍会阻止保存，头像配额/恢复 P1 不清零。真实 SecureStore kill/relaunch、Storage、跨设备并发、PostgreSQL/RLS 和云端资料保存仍待验；测试没有触及真实账号或对象。13:46:14 +08:00 只读检查 Docker Linux engine pipe 不存在，没有再次启动或循环重试。

没有云端写入、真实数据删除、构建或模拟器操作。13:59:05 +08:00 身份复核：旧 `e58df5af` APK 哈希仍为 `e58df5afd3578f53500acc32ca5b1491c6aead3b4221bfb3a29fd8ff5dbc7374`，237 历史输入仍有 App/package/profileEditing 3 个差异，另两个新 journal 模块不在旧包；不以旧包冒充当前逻辑验收。正式设计未新增通过，仍 **0/20**。下一项是服务端安全消歧及数据库验证条件收敛，不能继续用客户端“未引用/过了一段时间”猜测清账；之后才打包进行真实安卓恢复验证。证据：`artifacts/release-readiness/20261015-avatar-prepared-recovery/verification.json`。

## 2026-10-15 13:14 轮：头像记录接入保存服务（本地 84/84；发布仍 NO-GO）

本轮继续同一资料保存事项，实际将持久 journal 接入 `saveProfileEdits`，不再只是独立模块。入口先验证账号、读取记录与最新头像字段；存在旧记录时，本次只能保守核对旧操作，并始终停止当前表单重放。候选头像被最新资料正向引用时可以恢复 committed；非当前引用不推断 rollback。替换或移除自有头像都必须在 upload/RPC 前完成 begin 与回读，记录读取、写入或确认失败时不开始网络写入。未解决的记录目前会阻止所有资料保存，包括纯文字修改，这是明确保留的发布可用性限制。

已完成且 `error === null` 的 RPC 先记录 committed；返回 profile 形状/值未验证时不清理，缺失 error 字段不视为成功。确定回滚先持久化 rolled-back 再清理；上传/RPC 超时及不确定错误保留 uncertain，不删除候选对象。终态标记失败不清理；已验证的资料提交仍返回成功与 cleanup pending。实际 Storage 删除确认后还必须再次验证账号、fresh profile 引用与账号，再由 `clearResolved` 验证证明并清账；清理、后读或清账失败继续保留记录。

最终 `npm run test:profile-editing` **84/84 PASS**（比前轮新增 19 项服务集成回归），`npm run typecheck` exit 0。5 个新增行为实际 RED→GREEN，另补 deferred RPC 晚提交后只恢复不重放、deferred DELETE 晚成功后空响应不清账、两个并发 service save 仅一个产生 upload/RPC、begin 后账号切换零写入等回归。独立实际增量审查结论 COMMENT / candidate retain，未发现本增量新增确定 P0/P1；它未自行运行测试，不是生产安全 GO。80/80 初次日志与 84/84 最终日志分开保留。

**整项仍未通过，不能打发布勾**：begin 后认证失败/上传报错可能留下无对象但无法消歧的 uncertain；DELETE 超时但服务端晚成功后，后续空响应也不能证明已清理，终态记录可能持续阻塞。没有自动启动恢复或服务端操作确认出口，真实 Android SecureStore kill/relaunch、真实 Storage、跨设备并发、PostgreSQL/RLS 和云端资料保存均未验证。本轮测试使用真实服务/journal core 与外部持久化、SDK 的模拟边界，不是原生或真实云端测试。原头像配额/恢复 P1 仍保留，下一步优先补安全消歧与可恢复出口，不扩大到其他风格或算法。

13:38:53 +08:00 只读检查 Docker Linux engine pipe 仍不存在，本轮未再次启动 Docker/模拟器、未重复构建、未运行生产迁移或删除真实对象。没有新 APK；旧 `e58df5af` 包 SHA-256 仍为 `e58df5afd3578f53500acc32ca5b1491c6aead3b4221bfb3a29fd8ff5dbc7374`。237 个历史构建输入有 3 个不同（App、profileEditing、package），另两个新增 journal 模块现已由服务引入，但不在旧包内。旧包仅保留其历史原生证据；正式设计仍 **0/20**，邮件 Logo、默认 release gate、iOS 和商店状态未因此通过。证据：`artifacts/release-readiness/20261015-avatar-journal-save-integration/verification.json`。

## 2026-10-15 12:44 轮：持久头像操作记录基础（模块回归通过，尚未接入保存）

本轮完成一个有边界的实现子步骤：新增 `profileAvatarJournalCore.ts`、`profileAvatarJournal.ts` 和 15 项独立回归，已纳入 `test:profile-editing`。每账号单槽记录只含 owner/op UUID、候选/前一个私有对象路径与 uncertain/committed/rolled-back 状态，限制 1KB；不记录邮箱、昵称、图片、密码或令牌。严格拒绝跨 owner 路径、额外字段、损坏/超限数据、覆盖已有操作、错 operationId 修改和终态反转；写入/清除均读回确认，存储失败不退化成内存成功。

Native 适配使用现有 SecureStore API、单 App JS runtime 锁；Web 必须使用跨上下文 Web Locks，缺少锁则拒绝，不仅依赖 localStorage。纯恢复判断不执行网络：uncertain 非当前引用不推断 rollback；候选对象被当前资料正向引用时可建议 committed；已提交的记录按当前引用选择清理 previous 或 candidate，若两者都不匹配则保留。删除前与删除后的 fresh 账号/引用验证、RLS 与真实 cleanup 结果仍必须由后续集成负责，记录不是权限证明。

首次 API 审查发现裸 `clear` 容易让调用方在清理未完成时丢账，现已取消，改为 `clearResolved`：锁内重读并核对 operationId、终态、清理目标、结果证据与清理后当前引用；缺证据、pending 或目标过期时拒绝清除。planner 也改为只使用验证后的普通数据副本。此类本地证据约束不能代替服务端权限或实际删除验证。

最终 `npm run test:profile-editing` **65/65 PASS**（其中新 journal 15 项）、`typecheck` exit 0。实际执行了 4 个新接口的 RED→GREEN；其余回归覆盖损坏/跨账号数据、两客户端并发 begin、写成功但确认失败、终态写/清除失败、模拟双网页 Web Locks 竞争及无锁拒绝。最终独立窄审结论为 COMMENT：可保留候选基础，未发现本增量确定新增 P0/P1，不是功能 PASS 或部署 GO。测试使用模拟 Store/SecureStore/Web Locks 和 VM 上下文，不是安卓原生持久化、真实双浏览器标签页或真实云 Storage 通过。

**本轮尚未完成整项**：新模块还没有接入 `saveProfileEdits` 或 App，所以实际保存入口尚未获得“记账失败零上传/RPC”的保护，也不声称 App 已能重启后恢复清理。未做云端写入、真实数据删除、Docker/模拟器重启或新包构建。下一项必须接入上传前 begin、确定/不确定结果转移与保守恢复，并测试持久化失败时网络调用为零；未知结果的恢复出口、真实并发/存储与配额 P1 继续保留，不能登记清零。

13:05:42 +08:00 身份复核：旧 `e58df5af` APK 哈希仍为 `e58df5afd3578f53500acc32ca5b1491c6aead3b4221bfb3a29fd8ff5dbc7374`。237 个历史构建输入已有 3 个不同（App、profileEditing、package 的测试入口），另两个新 journal 模块未接入 App；旧包仅保留历史证据，不代表当前源码。本轮正式设计仍 **0/20**，原生、数据库、生产迁移和上线状态没有因此通过。证据：`artifacts/release-readiness/20261015-avatar-journal-foundation/verification.json`。

## 2026-10-15 12:06 轮：头像清理错误与真实保存反馈（源码候选通过，未打包）

本轮实际修改 `src/services/profileEditing.ts`、`App.tsx` 与对应测试，修复旧头像清理忽略 SDK `{error}`、等待无界及跨账号继续清理的问题。资料保存服务现在返回已验证 profile 和独立 cleanup 状态；已提交资料的清理 pending 不再抛成保存失败，App 刷新/退出编辑页后用 info 明示“旧头像清理尚未确认”。若并发使目标重新成为当前头像，则保护它并提示“已保留服务器当前头像”，不臆测另一设备的动作或声称替换完成。确定回滚/提交前孤儿清理失败保留原业务错误并附上清理未确认，不能静默丢失该事实。

每次清理前校验 owner 路径、当前账号、fresh profile 字段合法性、目标非当前头像，并在 DELETE 前重查账号；空/不匹配的删除结果不记成功。两次尝试共享总 3 秒预算，返回 500/502/503/504 时最多重试一次并完整重新校验；throw 或 timeout 不立即重复可能仍在运行的 DELETE。RPC 超时、网关错误或无法验证提交结果时，仍不删除新上传对象。此处是客户端保护，不代替服务端 RLS/事务并发安全验证。

最终 `test:profile-editing` **50/50 PASS**、`typecheck` exit 0；服务边界回归覆盖 SDK error/throw/timeout、跨账号、当前引用保护、重试上限/共享时间预算、确定提交与清理 pending 分离、确定回滚业务错误及未知 RPC 不删除。4 个新增行为用例实际 RED→GREEN；App 两条反馈检查为源码 guard，不是原生交互测试。独立复审未发现窄修新增 P0/P1，指出的 protected-current 提示 P2 已修复。初次 49/49 与最终 50/50 日志分别保留。

**未完成部分不掩盖**：跨重启持久清理记录、上传/RPC 不确定结果的安全核对尚未实现，孤儿对象重启后仍可能失去追踪，因此原头像配额耗尽 P1 不清零。真实 Storage、PostgreSQL 升级/RLS 及原生资料保存未通过；本轮无云端写入或真实数据删除，未再次启动 Docker、模拟器或数据库，也未应用迁移。

12:39:25 +08:00 复核旧 QA 包哈希仍为 `e58df5afd3578f53500acc32ca5b1491c6aead3b4221bfb3a29fd8ff5dbc7374`，但 237 个构建输入已有 **2 个与包不同**（`App.tsx`、`src/services/profileEditing.ts`）。因此 `e58df5af` 只保留其历史安装/认证证据，**不代表当前源码，也不含本轮新逻辑**；没有新 APK 或新原生验收。正式设计仍 **0/20**。证据：`artifacts/release-readiness/20261015-avatar-cleanup-feedback/verification.json`。下一项在同一资料保存主线补持久清理记录和不确定结果的保守核对；整合后再构建一次 Android 候选并复验，不能以本轮 JS 回归替代原生通过。

## 2026-10-15 11:36 轮：历史资料保护与升级用例（候选/预检通过，数据库未验证）

承接上一轮来源保护风险，本轮完成本地候选修复：同一个 `ALTER TABLE` 先用 `true` 保护迁移前所有昵称/头像值，再把未来插入默认值设为 `false`，让新建 provider 资料继续同步。旧资料来源未知时不从用户可编辑 metadata 猜测；旧 NULL 头像也保留，不因 provider 回传而复活。这项保守策略会停止历史资料自动跟随 provider，但仍允许用户主动编辑；并不声称历史资料确实都由用户编辑。

11:39:07 +08:00 云端只读聚合确认只有 1 个 Auth / Profile，昵称与头像均和当前 metadata 相同、没有 `profile.updated` 审计记录。这些事实不能证明历史来源，所以没有据此放松保护；查询只返回聚合数量，未提取账号资料明文或秘密。没有任何云端写入。

新增独立升级场景，复用现有隔离栈 harness 的 `--profile-editing-only` 模式：只应用 profile 迁移前版本→seed 三类历史资料及 snapshot→只读聚合报告→应用候选 profile 迁移→pgTAP 比对旧资料保护、新资料同步与主动编辑。三类历史资料包括手动修改、NULL 头像删除、和 metadata 同值但来源未知。专用 profile 报告与原 pre-G002 username 报告分开，原两个 username 场景默认行为不变。此本地场景使用仓库迁移链，不等于云端历史漂移已调和。

最终本地 `test:profile-editing` **35/35 PASS**、`typecheck` exit 0、Node harness 语法检查通过；profile 升级预检 1 个场景及原 username 预检 2 个场景均通过。独立复审未发现本次窄修新增 P0/P1。**预检只检查资产与隔离工程组装，不执行 SQL；PostgreSQL 升级、pgTAP 和真实资料云端保存仍未通过。** 新增 SQL 源码 guard 为 RED 1/1 失败→修复后相关 guard 3/3 通过，不冒充数据库行为测试。

为推进数据库验证，11:56:42 +08:00 在约 6.7GB 可用内存条件下尝试了一次隐藏启动 Docker Desktop（PID 37728）；11:59:05 Linux engine pipe 仍不存在，因此没有启动隔离栈、没有重置已有数据库，也未反复启动或绕过权限/许可限制。已请求用户打开 Docker Desktop 并反馈 Engine running 或错误。Docker 未就绪期间转向同一资料保存事项中未阻塞的头像清理错误/不确定结果处理，不循环跑失败数据库测试。

12:00:07 +08:00 包身份复核：现有 `releases/20261014/DOSO-0.0.1-qa-e58df5af.apk` SHA-256 仍为 `e58df5afd3578f53500acc32ca5b1491c6aead3b4221bfb3a29fd8ff5dbc7374`，237 个 App 构建输入全部匹配；本轮没有新 APK 或原生验收。正式设计仍 **0/20**，邮件 Logo、迁移历史调和、完整安全审查/生产批准、默认 release gate、iOS 和商店状态未因此通过。本轮证据：`artifacts/release-readiness/20261015-profile-upgrade-preservation/verification.json`。前一轮证据及当时源码哈希保留为历史，不覆盖。

## 2026-10-15 资料保存候选迁移兼容修复（本地回归通过；未部署）

本轮只推进资料/头像保存的一个可审核子项，没有再次改视觉、构建或启动模拟器。候选迁移原来一律保留资料，破坏了未手动编辑资料的登录服务同步。现改为服务端分别记录昵称/头像的用户编辑来源：用户明确设置的值不被 provider 覆盖，未编辑的字段仍同步；兼容旧 Apple 昵称确认入口；同步计算后的昵称为空串、或 provider 未携带头像时，保留对应已有值。客户端不能通过直接更新或认证 metadata 伪造来源标志。变更仅在本地未部署 SQL 与测试中。

最终 `npm run test:profile-editing` **34/34 通过**，`npm run typecheck` exit 0。两条新增 SQL 源码 guard 分别经历 RED/GREEN；这些 guard 不是数据库行为测试。独立复审确认本次窄修代码语义已处理，未发现该窄修新增 P0/P1，**不等于整个迁移安全通过**。`npm run test:db` 实际尝试后因 `127.0.0.1:54322 ECONNREFUSED` 退出 1，本机 Docker engine 也不可用；pgTAP 尚未执行，未以生产库代跑测试。

**暂不可部署**：历史资料可能包含用户手动修改，不能直接把新来源标志全部设为 provider 管理。须先完成历史资料只读审计、保护/回填决策及存量升级测试；另外头像清理错误与不确定提交结果处理、签名 URL 撤销契约，以及本地/远程迁移版本漂移仍待收敛。上述事项完成后还需范围明确的生产部署批准及安全 GO；本轮没有生产数据库、RLS、认证触发器或权限写入，也不申请提前部署。

今日 11:14:14 +08:00 云端只读预检仍为 `update_my_profile=false`、`profile-avatars=false`、邮件正式 Wordmark 对象 `false`。所以**真实资料/头像云端保存与邮件 Logo 未通过**，不沿用“已上传”作为验证结果。此查询只确认对象存在性，不代表邮件云模板已回读。

11:30:44 +08:00 复核现有 QA 包 **`releases/20261014/DOSO-0.0.1-qa-e58df5af.apk`**：SHA-256 `e58df5afd3578f53500acc32ca5b1491c6aead3b4221bfb3a29fd8ff5dbc7374` 一致，237 个 App 构建输入全部匹配。没有新 APK 或本轮原生验收；10 月 14 日的安装、普通网络真实重登录和资料卡原生容纳结果继续作为该包历史证据，不扩展为本轮资料保存 PASS。正式设计 **0/20**，默认 release gate、iOS 和商店发布状态不变。

本轮证据：`artifacts/release-readiness/20261015-profile-provider-provenance/verification.json`，最终源码/包身份见同目录 `source-and-package-final.json`；初次 33/33 日志与最终 34/34 日志分别保留。下一步优先做历史资料保护的只读升级审计与升级测试设计；本地数据库不可用期间不循环重试，不触碰生产迁移。

## 2026-10-14 网络、资料与邮件收敛（Android 网络与 Profile 修复通过；邮件 Logo 阻塞）

Profile 设备卡 ownership 修复已完成源码回归：修复前 11/12、修复后 12/12，`typecheck` 与 trusted-device-data UI guard 通过。新 APK 的浅色、深色、横屏和 1.3 大字体四个配置均完成局部原生卡片容纳/尺寸检查：浅深色 390×844 卡片高度 250dp、底部间距 24dp；横屏 844×390 滚动后卡片高度 198dp、底部间距 18dp、导航不重叠；1.3 大字体卡片随内容自然增高到 274dp、底部间距 24dp。相关编辑资料/控制入口均为 44dp。该四项不是全页或 Figma PASS，未覆盖真实设备长遥测、横屏 1.3、物理设备和全 App 可访问性。

新 APK **`releases/20261014/DOSO-0.0.1-qa-e58df5af.apk`** 已于 10:35:18 +08:00 完成 `assembleQa`：77,275,349 字节，SHA-256 `e58df5afd3578f53500acc32ca5b1491c6aead3b4221bfb3a29fd8ff5dbc7374`，耗时 295.4 秒，237 个构建输入一致，`apksigner` 通过。11:06:17 使用 `install -r` 覆盖安装成功且未清用户数据，约 7,382ms 冷启动后恢复真实会话。它仍是 QA 包，不是生产签名或 release-ready 制品。

主机普通网络下，Node 直连 Supabase health 与 Auth settings 今日均返回 200，REST 无 apikey 探针返回预期 404，`host-network-check.log` 为 `ok=true` 且未输出 key。昨日 `ECONNRESET` 今日未复现，但不能据此宣称链路永久修复。模拟器 HTTP proxy 的 host / port / exclusion / global 四项已全部撤销为 null，ADB reverse 7890 已移除，emulator console proxy 已 clear，新进程未继承 HTTP(S)/ALL_PROXY 或代理启动参数；其他 41899 / 1981 / 8558 reverse 保留。

11:14:52 提交退出后 6 秒的早期检查仍为 `loginPageReached=false`，但云端只读审计确认 `terminal.revoke` 于 11:14:57 +08:00 成功，active terminal 为 0。随后原生页到达真实 Login，安全填入邮箱和已保存的 20 位账号密码并提交；服务端 `last_sign_in_at` 更新为 11:23:56 +08:00，active terminal 为 1。原生进入真实机型选择，跳过未绑定设备后到达 Profile。因此本轮 Android 模拟器在无 Android/emulator HTTP proxy、无 7890 reverse 条件下的退出/账号密码重登录闭环 PASS；本轮没有修改密码，未记录秘密，也未绕过证书校验。一次成功不证明网络永久可靠，物理 Android Wi-Fi/4G、弱网和 captive portal 仍待测试。大字体导致 Activity 重建时真实会话恢复到机型选择，跳过后继续 Profile；最终已恢复 fontScale 1.0、浅色、竖屏并回到已认证首页，未绑定设备、未发机器人指令。11:17:04 的源码复核为 237 个输入匹配本包。

托管只读配置确认 `profile-avatars` bucket、`public.update_my_profile` 以及三条账户删除函数均不存在；本轮不部署数据库迁移。模板期待的正式 Wordmark 对象仍不存在，云端仍只有 `DOSO.png`（223,619 字节），它已正确上传但不是模板引用文件。浏览器 Storage 页面可读，但输入/操作通道反复 CDP 超时；本轮未上传正式文件、未修改云模板，也不把工具超时写成用户上传失败。**因此本批结论是 Android 网络及 Profile 修复通过、邮件 Logo 明确阻塞，不是整 App 或发布全部通过。**

为缓解系统盘空间风险，`android/app/build` 的 1,275 个生成文件（1,126,246,131 字节）已可恢复地迁移至 `D:/DOSO/build-cache/20261014/profile-network-mail/app-build`，原路径以 junction 保持兼容，APK 哈希一致；源码、安装包和证据未移动或删除。Android 系统 ANR 与磁盘阻塞还通过迁移任务 AVD 数据恢复：193 个文件、8,259,710,297 字节移至 `D:/DOSO/android-avd/DOSO_API_35.avd`，原 C 路径保留 junction，userdata / encryption 哈希一致，无 wipe 或删除，新进程 cold boot 完成。这些只是可恢复的任务环境治理，不是产品完成或永久无 ANR 证明。

当前继续以封闭 Android 内测的“可安装、可登录、可测试”为主线。DOSO 作为机器人 App，不建议把纯账号 + 静态模板壳直接作为最终商店送审范围；Apple 4.2 Minimum Functionality 风险要求保留并最终证明真实设备产品核心。本轮不扩大到新迁移、付费上架或机器人运动。证据目录：`artifacts/release-readiness/20261014-network-profile-mail/`。正式设计仍为 **0/20**，默认 release gate、iOS、商店与真实硬件状态不变。

## 2026-10-13 认证后数据真实性候选包（限定原生 6/6 通过）

已构建并覆盖安装 **`releases/20261013/DOSO-0.0.1-qa-1b8375ed.apk`**：77,275,385 字节，SHA-256 `1b8375edcf97989d17833ab8ab7b87ee34a88340446cc3459e10fef1c0d75165`，`assembleQa` 耗时 486.5 秒，237 个源码输入验证一致。相同证书覆盖安装成功且未清用户数据；已有真实会话恢复至无绑定设备的机型选择页。该包不是生产签名包，也未标记 release ready。

本轮仅收敛两个已发现的数据真实性 P1：生产 Analysis 在没有可信历史时不再启用静态演示预览；Profile 对缺失、空值和纯空白固件版本显示待同步，真实 `v` 前缀版本只移除展示前缀。限定数据逻辑源码复审 P0/P1/P2 = 0，相关静态测试与 typecheck 通过；该审查不包含随后从原生截图发现的布局问题，不代表全 App P1/P2 清零，也不代表绑定机器人真实固件已验证。

新 APK 保留了真实会话；升级后无需登录，进入无绑定设备的机型选择页，跳过后回到主界面。Analysis / Profile 两页在浅色、深色、横屏共 6 个原生状态中均 `truthCheckPass=true`，限定数据真实性回归为 **6/6 PASS**。横屏 Profile 的固件区域位于首屏下方，最终通过滚动定位，`scrolledToFirmware=true`；不宣称首屏完整可见。第一轮 Fabric flatten matcher 误判与横屏 below-fold 失败保留为诊断证据，不删除、不冒充最终标准图。

目视复核另发现独立 P2：`profile-landscape.png` 滚动后设备卡底部的固件版本与上次同步数值落到圆角边界外，浅色 Profile 同一区域底部也偏紧。数据内容正确，但卡片高度或间距仍需下一批 UI 修复；因此 6/6 不能写成视觉、整页或 Figma PASS。本轮不再改源码，`1b8375ed` 保留为可安装账户内测包。

证据目录为 `artifacts/release-readiness/20261013-authenticated-data-truth/`，237 个输入在 22:10:14 +08:00 重新确认与构建一致。该 6/6 只覆盖真实认证、无绑定设备下 Analysis / Profile 的数据真实性，不是全 App、Figma、页面功能或真实硬件版本 PASS。上一版 `artifacts/release-readiness/20261013-account-completion/` 继续作为 `87ba6628` APK 的不可变真实认证历史，不用旧截图替代本包验证，也不把本包结果回写给旧包。

最终交接于 22:14:06 +08:00 恢复浅色竖屏 Home，`authenticated=true`、`homeReady=true`，没有清除用户数据，也没有发送运动指令；`handoff-home.png` 与 `handoff-result.json` 绑定本包。网络仍使用 `127.0.0.1:7890` 临时代理，不能登记普通网络通过。

网络仍依赖临时代理和 ADB reverse；正式邮件 Wordmark 仍缺失，正式设计仍为 **0/20**，默认 release gate、iOS 和商店发布状态不变。

## 2026-10-13 Android 真实账户恢复闭环（前一包认证历史，已确认）

前一 Android QA 包 **`releases/20261013/DOSO-0.0.1-qa-87ba6628.apk`** 已在原生环境完成真实账户闭环：`995632531@qq.com` 的恢复邮件 OTP 验证成功，进入重置页设置新密码，完成全终端撤销，随后使用新密码重新登录；用户再通过原生界面手动认领用户名 `kitjesen`，账户状态为 `active`，最后进入首页。密码仅保存在 Windows Credential Manager；本文和证据均不记录密码或 OTP。本节是前一包的不可变历史，不代表当前已安装包版本。

- 账户资料 `updated_at` 为 `2026-10-13T13:12:55.108792Z`。`terminal.revoke_all` 于 `2026-10-13T13:13:01.5792Z` 成功，随后 active terminal 为 0；新密码登录于 `2026-10-13T13:15:46.638202Z` 成功，随后 active terminal 为 1。
- 用户名 `kitjesen` 于 `2026-10-13T13:18:50.151053Z` 以 `manual_claim` 成功认领；该动作来自 App 原生界面，不是管理员接口代填。
- 冷启动能够恢复已有 Supabase 会话，无需重新输入登录信息；但账户当前没有绑定设备，因此仍会再次出现“选择机器人”，用户点击跳过后进入 Home。此结果证明会话恢复，不登记为“冷启动直接进入 Home”。
- 截图和结构化结果位于 `artifacts/release-readiness/20261013-account-completion/`：包括重置就绪、OTP 验证、改密提交、登录、用户名认领、首页与冷启动记录。5 个主导航入口已完成原生切换与唯一选中态 smoke（5/5），但这不是页面功能或设计 PASS。正常退出于 `2026-10-13T13:43:02.716783Z` 成功撤销当前终端，active terminal 为 0；新密码于 `2026-10-13T13:48:42.014475Z` 重新登录成功，active terminal 为 1，没有重复用户名流程，跳过无绑定设备的机型选择后进入 Home。旧密码拒绝和成功 Toast 均未测试或捕获，不登记通过。
- `03-tab-analysis.png` 显示 Analysis 仍有演示遥测，`03-tab-profile.png` 显示 Profile 仍有不可信固件信息，均记为该包的 P1。本目录和五页截图严格对应 `87ba6628` APK；这些问题随后已在顶部记录的 `1b8375ed` 包完成限定数据真实性修复与原生复验，但不能反向改写本历史包。`source-revalidation.json` 在 21:45:20 +08:00 确认该构建当时 237/237 个输入匹配。
- 模拟器当前仍依赖 `127.0.0.1:7890` 临时代理和 ADB reverse；仅代理网络链路通过，普通网络直连未通过。该临时条件不能作为正式联网验收。
- 邮件模板引用的正式对象 `email-assets/doso-robotics-wordmark-email-29dea10fd204.png` 仍不存在，公开 URL 返回 HTTP 400。用户上传的 `DOSO.png` 虽可公开读取，但内容、尺寸和哈希均不是模板引用的正式 Wordmark；云端邮件模板也尚未受控回读，因此邮件 Logo 与模板同步仍未通过。
- 正式设计验收仍为 **0/20**；默认 release gate、iOS 构建/真机、商店签名与提交均未通过。当前成果是 Android QA 真实账户内测闭环，不等同于正式上线。

## 2026-10-13 真实恢复邮件阻断修复（历史过程，已由上节闭环取代）

> 本节保留恢复过程证据。下文“密码仍未更改”“等待验证码”“成功登录仍未完成”等描述只代表当时的中间状态，不再代表当前账户进度；当前事实以上一节为准。

20:02 补充核验：用户新上传的对象实际是 `email-assets/DOSO.png`（223,619 bytes，1067×372 RGB），公开 GET 返回 200，SHA-256 为 `15fbbbeb897db0f56f29e4d9eaff1deb3c9b0f9a6fe3a03468d03f2136f309fd`。它不是模板引用的版本化字标文件；目标对象仍不存在、目标 URL 返回 400。因此确认“用户上传成功”，但不登记“邮件 Logo 已修复”，也不以重命名不同内容伪造版本哈希。已请用户补传仓库内精确文件，保留现有两个对象。通过真实 Android App 重新发起恢复，服务端发送记录为 20:01:05 +08:00；等待本机新验证码验证，密码仍未更改。证据见 `artifacts/release-readiness/20261013-email-logo-followup/verification.json`。

用户已实际收到 QQ 密码恢复邮件，确认投递成功，但发现两个阻断：邮件品牌图片破图；真实邮件为 8 位验证码，旧 Android QA 包只接受 6 位。用不提交的合成测试数字在旧包复现了 8 位输入被截成 6 位，证据为 `artifacts/release-readiness/20261013-email-otp-repair/native-red.json`。此前“未提交注册/未发邮件”的记录仅描述之前构建阶段，不再代表当前账户进度。

- 账户邮箱已有已验证的历史账号；不重复创建，也没有通过管理员接口绕过验证码改密。新密码尚未赋给账号，真实改密和成功登录仍未完成。
- App 已统一注册、恢复与邮箱安全验证码输入和服务校验，支持完整 6–10 位邮箱验证码，实际邮件为 8 位；移除原生层提前截断，保留前导零，非法/过长内容保持无效。身份验证器和手机 MFA 的 6 位规则保持不变。
- 邮件模板引用的 `doso-robotics-wordmark-email-29dea10fd204.png` 尚未出现在 `email-assets`。公开地址返回 HTTP 400，而旧图片返回 200。待上传正式资源后必须校验公开 PNG 的长度和 SHA-256，再用新邮件确认 QQ 显示。未上传前不能登记线上 Logo 已修复。
- 新包 `releases/20261013/DOSO-0.0.1-qa-87ba6628.apk` 已构建、验签、覆盖安装并冷启动成功；237 个打包输入文件校验一致。模拟器 6/6 输入用例通过（8 位、前导零、6/10 位、含空格、5/11 位阻断），合成数字未提交服务器。剪贴板粘贴兼容有组件/服务测试，原生本轮验证的是键输入，二者不混称。
- 新恢复请求已通过 App 发起，服务端 `recovery_sent_at` 为 2026-10-13 18:07:26 +08:00。界面已清空并交给用户输入最新验证码；密码尚未修改。模拟器为本轮账户验证暂留 `127.0.0.1:7890` 代理及 ADB reverse，不算普通网络通过，恢复依据保存在前一轮 `proxy-before.json`。
- 邮箱 OTP 17 项、账户页面 7 项、MFA 5 项、邮件管理 56 项及 typecheck 通过。正式设计仍 0/20，商店上线状态不变。证据与当前 APK 见 `artifacts/release-readiness/20261013-email-otp-repair/README.md`。

## 2026-10-13 上线主线收敛：当前源码 Android 联网内测包

按用户最新优先级，当前先交付可独立安装、无需 Metro 的 Android QA 包并打通真实账户测试；暂停新增算法研究和大范围视觉重做。地图、设备连接、真实控制仍是产品待完成项，不因暂缓算法工作而从正式发布条件中删除。iOS 仍保留为目标平台，不把 Android 内测等同于 iOS 或商店上线。

- 修复地图模块留下的 6 个 TypeScript 错误：`npm run typecheck` exit 0，`test:map-graph` 3/3 通过。
- 本轮默认 `test:release-gate` 在设计验收处失败：正式设计证据仍为 0/20，未放宽门槛或登记通过。
- 原 `android/` 已完整保存至 `C:/doso-native-backups/20261013-current-source-qa/android`，重新生成当前原生工程并补齐蓝牙权限。使用 JDK 21、SDK 36，构建 `assembleQa`（arm64-v8a / x86_64）。构建和安装结果以本轮证据目录为准，不能复用 9 月的旧 APK。
- QA 入口为真实 `index.ts` / AuthProvider，不是 `index.preview.ts`。开发仿真和 Design QA 门禁不因此开放，生产运动 executor 仍未接通。
- Supabase 项目只读确认 `ACTIVE_HEALTHY`，邮箱注册开启且必须确认邮箱。本机 Node 直连出现 `ECONNRESET`，另一路 PowerShell 请求 Auth settings 返回 200；这不等于普通网络或 Android 真正登录已通过。
- 用户已提供真实测试邮箱；密码和 OTP 由用户在本机 App 内输入。本轮未创建账号或发邮件。托管 SMTP、精确回调白名单和真实投递仍需核实。
- 本地 QA 使用 `.env.local` 的公开后端配置。云端 EAS 未查到对应公开变量；正式认证链接域名也未解析成功，后续云包和正式回调另行修复，不向当前 QA 强填失效域名。

本轮已交付并覆盖安装 **`releases/20261013/DOSO-0.0.1-qa-0d58dc0a.apk`**（SHA256 `0d58dc0a0979919c78591ff023ab62f8b2e9958fe76af9f314a8dfc23a017957`，77,275,009 bytes，236 个源码输入校验一致）。这是 Debug 签名的 standalone QA 包，不是商店包。

原生实测发现并修复登录在断网时无限 loading；最终包的直连失败提示、按钮恢复、重试和输入保留通过，临时代理下真实服务的无效凭据错误解析通过。代理已撤销，不将代理结果当作普通网络通过。Auth 请求边界 12 项、认证错误 19 项、认证页面 33 项、storage 和 typecheck 通过；新增回归加入默认 release gate。真实邮箱注册未提交，成功登录和原生有效会话恢复仍待验收。

当前证据目录：`artifacts/release-readiness/20261013-current-source-android-qa/README.md`。下一步优先普通网络、真实收信/OTP 和会话回归，再推进全页、权限和设备验收。以下为历史工作，不覆盖本节优先级。

## 2026-10-13 Boston Dynamics 能力参考与自有算法升级（新增）

Boston Dynamics 只作为公开能力和工程方法的参考，不作为 DOSO 产品设备目标。代码审查显示当前 Brainstem 没有地图、定位、waypoint、route、mission 或 navigation 合同；现有双摇杆只覆盖 locomotion 仿真。当前生产 executor 继续为 `null`。

下一步借鉴公开 GraphNav 的图地图、定位初始化、路线反馈、任务分层和安全控制思想，先为自有 Brainstem 定义 `MapSnapshot`、`LocalizationState`、`RouteDraft`、`ValidatedRoute` 和 `NavigationFeedback`，再做 MuJoCo 地图回放和只读设备地图服务。不能把 Spot API 直接接入 DOSO，也不能把“开机”登记成地图或运动可用。

算法参考、实施批次和验收出口见 `docs/algorithms/BOSTON_DYNAMICS_REFERENCE_PLAN.md`；自有地图数据闭环见 `docs/runbooks/MAP_INTEGRATION_READINESS.md`。当前只完成 Brainstem 本地仿真双摇杆验收；地图、BLE/网络、生产权限和正式 Figma 20 页验收仍未通过。

## 2026-10-13 地图接入审查（新增）

当前 `MapScreen` 是三条静态模板路线，`routeId=null`、几何状态 `unknown`、来源 `template`；路线启动策略因此正确阻断。Supabase 现有公开 schema 只有设备与账号资料，没有地图、waypoint、edge、路线或执行记录；Brainstem 仓库没有地图/导航 RPC。地图不能通过替换 Figma PNG 完成。

地图接入应先由自有 Brainstem 提供地图元数据和定位状态，再建立 `MapSnapshot` 与地图版本、路线草稿、设备校验和导航反馈。GraphNav 仅作为公开算法和状态设计参考。完整数据合同、页面状态、版本失效和验收出口见 `docs/runbooks/MAP_INTEGRATION_READINESS.md` 与 `docs/algorithms/BOSTON_DYNAMICS_REFERENCE_PLAN.md`。当前没有发送地图、导航或机器人运动指令。

## 2026-10-13 Brainstem 本地双摇杆实际控制（最新增量）

**Android 原生双摇杆 → App 控制器 → loopback WebSocket → 真实 Brainstem UnifiedCmsServer → ONNX mini policy / MuJoCo 的控制流程已通过。运动跟踪性能尚未验收。** 不再只是 UI 演示或只读协议 fixture；没有连接真机或启用生产运动 executor。

API35 / x86_64 原生实测通过前进、转向指令与姿态响应、双指组合及独立松手、静止按住、取消和后台停止共 5 组场景。实际前进约 0.295m，松手后约 107ms 在服务侧观测到零指令，物理速度随后衰减至近零。该时间不是物理瞬停或真机延迟保证。转向目标约 -0.33rad/s，而实际转角仅约 -0.40°，跟踪明显偏弱，必须继续校准策略/仿真，不能登记运动性能完成。

另有当前 App 控制器的 5 组真实本地链路检查通过；最终原生记录的 10 个源码 SHA 与当前源码一致。补齐原生触摸取消向父容器传播时的停止保护，避免 20Hz ACK 引起摇杆整页重绘；输入改为串行 WebSocket，不放宽 180ms 输入截止时间或 250ms 服务失活保护。跨端 ACK 身份/序号/状态验证、绝对截止时间、迟到 acquire 与关闭/停止竞态已修正，限定传输与关闭边界独立复审 P0/P1/P2=0。

最终 typecheck、38 项控制 UI/输入/布局测试、25 项仿真会话/流测试、34 项连接回归、30 项生产命令执行器回归、49 项网关/流/启动器测试及 Android release JS/Hermes/资源导出通过。仍使用既有 Expo Android 开发包加载当前源码，**没有新 APK/IPA**。生产 executor 为 null；Design QA 离线；真实认证、BLE/配网/真机和正式 Figma 三态验收不因此通过，正式设计仍 0/20。

证据：`artifacts/release-readiness/20261013-brainstem-simulation-control/README.md`。当前开发入口：`http://127.0.0.1:8130/?local-simulation=1`；安卓开发启动器普通 URL 为 `http://127.0.0.1:8130`。仿真端口 13147/13148、控制网关 8122，均限定 loopback。下一步优先运动跟踪与停止性能标定；随后才进入真机权限、保护链路与受限控制。以下为历史增量，不覆盖本节。

## 2026-10-12 Android 原生双摇杆验收与手柄细节（前一轮）

当前 ControlScreen 已在 API 35 / x86_64 安卓模拟器的 `com.doso.robot`（versionCode 6）中载入最终源码。使用既有原生开发包与 Metro 8130 的开发 QA 入口；本轮未构建新 APK。界面保留两杆与返回，增加细刻度、同心定位圈、L/R 标记及拇指帽中心点。

实测发现并修复 Android Fabric 在首个触点抬起时提前触发共享 responder release、使另一个摇杆一并归零的问题。现在按触点分别释放，安卓补充原始触摸事件处理；剩余手指继续反向移动也已验证。该补偿限定安卓，Web 的 TouchList 不再进入原生数组处理。

最终 10 项原生场景通过：双指同时输入、静止按住、两种独立松手顺序、松开后持续零值、取消、越界限幅、后台恢复、触摸中旋转和系统深色切换。截图与 UI XML 均为当前源码；8 个关键源码 SHA 已绑定，模拟器旋转与主题设置已恢复。无障碍输入改为 220ms 短脉冲自动归零；触点丢失清零且不把正常持续按住视为无操作。

30 项控制 UI/布局/输入测试、typecheck、30 项命令执行器测试及 Web 多指回归通过，Web 开发导出完成。原生证据与复现方式：`artifacts/release-readiness/20261012-joystick-native/README.md`；实际截图/日志：`D:/DOSO/ui-review/20261012-joystick-native-final/`；预览仍为 `http://127.0.0.1:8109/`。

本轮验收针对原生摇杆操作。生产运动 executor 仍为 null，Figma 三态基准与正式设计通过数未变。冷启动时模拟器 System UI 出现等待对话框，恢复后通过原生开发启动器普通连接入口加载；不据此宣称旧深链接启动路径已全部修复。

## 2026-10-12 纯双摇杆修订（前一轮）

按用户最新标注，控制页仅保留两个摇杆和 44dp 返回入口。移除设备摘要、模式栏、演示切换、输入读数、动作按钮、开发诊断及可见摇杆文字，不增加卡片或其他面板。左杆前后/横移，右杆仅转向；无障碍名称仍保留。

开发预览进入即可拖动，不再要求开启演示；输入回调为空，不接传输层。生产 `__DEV__` 硬门关闭，能力参数不能解锁摇杆，生产 executor 仍为 null。单指松开独立归中、取消/旋转/后台/返回归零保留。设备诊断通过独立开发入口进行，不在这页显示。

最终 11 项命令全部通过：typecheck、25 项控制 UI/布局/输入测试、连接/权限/执行器/G008/可信数据/QA 回归，以及 Web 和 Android JS/Hermes/资源导出、实际浏览器双指验证。当前源码 390×844 浅/深色、844×390 横屏和 320×568 小屏均已复拍。证据：`artifacts/release-readiness/20261012-dual-stick-minimal/README.md`；预览：`http://127.0.0.1:8109/`。

本轮没有新 APK、原生多点触控或真实运动控制证据，也未更新 Figma；不登记正式设计通过。下面带状态栏/模式/动作区的版本为历史，不代表最新界面。

## 2026-10-12 双摇杆控制台（前一版，已由纯双摇杆修订取代）

用户指出旧控制页缺少双摇杆、图片裁切、大片留白和不规范文案，本轮已更换真实 ControlScreen：顶部设备摘要、手动/巡航/任务切换、左杆前后与横移、右杆转向、本地输入读数、复位和折叠开发诊断。小屏扣除卡片内边距，横屏采用紧凑顶栏和横向动作区，不再缩放旧竖屏状态卡。沿用 MiSans 与现有蓝白主题，无新增依赖。

本地演示需主动开启，且仅开发入口可用。单一父级 responder 按触点 identifier 管理两杆；单指松开独立归零，取消/禁用/尺寸变化/旋转归零，后台/返回/模式切换退出演示。停止/站立/趴下无执行回调；生产 executor 仍为 null。没有运动指令、假遥测或假控制权。

25 项控制布局/输入/页面测试、连接与权限回归、typecheck 和 Web/Android JS/Hermes/资源导出通过。实际浏览器双指操作、单指释放、取消、模式切换与 390×844 / 844×390 / 320×568 布局已验证。浅/深色截图均来自当前源码；浏览器热切系统主题未通过（冷加载与显式主题预览不等于动态系统切换验收），原生主题仍待测。

**未构建新 APK，未完成本轮 Android 原生双指测试，未接通真实运动控制，未同步新版 Figma。正式设计仍 0/20。** 旧原生开发包启动器故障与真实认证闭环仍未解决，不用 Web 截图替代原生验收。证据与下一步：`artifacts/release-readiness/20261012-dual-stick-console/README.md`。预览：`http://127.0.0.1:8108/`。

## 2026-10-12 Android 原生 Brainstem 本地联调（前一轮记录）

用户确认暂无机器人，先做本地联调。本轮 **Android App → 本机只读 HTTP 网关 → Brainstem 实际 `UnifiedCmsServer.GetControlStatus`** 已贯通；不是仅网页预览。API35 原生截图显示初始化、控制来源为空，明确“本地联调 · 未验证真机 / 本 App 未获取控制权”。实际服务内部 Brain/FSM 为 mock，未运行 ONNX/MuJoCo 或接触 CAN；simulation 的电机使能值不是物理输出证据。生产 executor 仍为 null。

原生同时通过独立协议 fixture 的成功、错误令牌、15 秒过期清除、后台清除令牌和恢复重试，以及登录空提交、无效邮箱、注册空提交校验。快速请求的取消/晚到响应由自动化测试覆盖，不声称原生取消点击已测。发现旧启动链接/端口问题，新增预检启动脚本，但再次启动的 UI 验证仍失败（开发启动器 NPE / 冷启动返回桌面），**可重复启动尚未通过**；旧绿色 Anny 页面与上游停机时的失败图不算成功证据。

Supabase 再次确认 ACTIVE_HEALTHY，两条获授权迁移的字段/RPC/RLS/权限及账号数量只读复核通过；连接脚本已适配匿名 OpenAPI 访问变化，代理网络下公共 Auth/Data API 连通。**真实注册、邮件/OTP、登录会话与普通网络直连仍未通过**，未创建账号、发邮件或继续部署其他迁移。

typecheck、34 项连接测试、19 项认证错误 + 33 项认证页面测试、30 项命令执行器测试、16 项网关测试及控制 UI 合同/布局检查通过；Android JS/Hermes/资源导出通过，未构建新 APK/IPA。限定代码独立复审 P1/P2=0 不代表全 App 上线通过；正式设计仍 **0/20**。

证据：`artifacts/release-readiness/20261012-brainstem-local/README.md`、`D:/DOSO/ui-review/20261012-brainstem-local/`。一次限定旧包 dex 优化超时后中止等待；唯一后续冷启动仍报 DevLauncherController NPE，未登记修复。下一步优先重建匹配当前原生依赖的 Android 开发包并验证稳定冷启动，再继续本地仿真控制会话的获取/续租/零速度 ACK/释放/超时；并行用授权测试邮箱完成真实认证。控制接入阶段与安全边界见 `docs/runbooks/BRAINSTEM_LOCAL_INTEGRATION.md`。以下为较早记录，不覆盖本节。

## 2026-10-12 Supabase 恢复与认证最小迁移（较早记录）

Supabase 已成功连接。实际项目为 doso / DOSOrobotics（`vchvqfdlkomlrjenkdhj`），原状态 INACTIVE，已恢复为 ACTIVE_HEALTHY；原 App 地址正确，不需重建项目或更换密钥。使用电脑既有代理，Auth health/settings 均返回 200；邮箱注册开启且需确认邮箱。Android API35 当前认证源码也在临时代理下通过只读健康检查，直连仍失败；模拟器临时网络设置已恢复，不能把此结果当作普通网络或真实登录通过。

用户明确同意后，已部署用户名认领与来源两条最小认证迁移。原 1 个账号、1 条资料的 ID/邮箱/用户名核验不变；旧账户按已告知规则需确认用户名，updated_at 随回填更新。新字段/RPC/RLS/权限检查通过，真实匿名 RPC 请求被 401/42501 拒绝。未创建账号、发邮件、改密码或调用机器人。没有运行迁移回滚演练及完整 pgTAP，真实账户闭环仍未测。

远端 receipt 为 `20261012064356`、`20261012064428`，分别对应源 `20260823130000`、`20260824100000`，内容已校验一致。**后续 CLI db push 前必须先核对迁移版本映射，不得重复执行源文件或假登记其余迁移。** 外部身份/登录方式、资料编辑/头像迁移仍未部署；安全 advisors 未完全清零。后续同日增量已修正 `network:check`：不再探测禁止匿名读取的 OpenAPI 根接口，改为不读取行数据的 PostgREST 存活检查；未向客户端添加 secret key。

完整证据与发布限制：`artifacts/release-readiness/20261012-supabase-reactivation/README.md`；安卓实测：`D:/DOSO/ui-review/20261012-auth-network-android/`。下一步是可收信测试账号的邮件/OTP/登录/退出重登和普通网络验收，不是继续增加预览。未构建新 APK；正式设计仍为 **0/20**。以下条目保留为恢复前历史。

## 2026-10-12 认证错误处理与云端连接核查（最新增量）

登录/注册已增加安全的 Supabase 错误映射：官方错误码优先，区分凭据错误、邮箱待确认、限流、服务故障与网络故障；注册超时提示结果待确认，不自动重试、不伪造失败或成功。数据库 500 不再被误报为用户名占用，原始响应、SQL、令牌和未知错误码不进入用户提示。本地校验、密码原值与配置错误专用处理保持不变。

`npm run test:auth-ui` 已通过：19 项认证错误/服务边界测试、认证 UI 合同检查与 33 项页面/布局测试；`typecheck`、注册 UI 和用户名流程检查通过。这些是本地测试，不代表真实邮件、云端账号或机器人链路已通过。

用户提供的控制台截图在组织 `doso` 的 Active 筛选下显示 **No active projects found**；Active 是筛选条件，不能据此确认某个项目正在运行。当前配置的 `vchvqfdlkomlrjenkdhj.supabase.co` Auth/REST 只读探针仍为 DNS 失败。浏览器控制通道启动故障，未实际读取登录会话；已找到 Supabase 集成并请求打开安装入口，尚无安装/授权成功证据。没有猜测或替换项目 ref，没有改云端认证设置、部署数据库或创建账号。

安卓 API 35 模拟器连接已恢复，原生当前源码测试正在独立进行；在取得结果前不登记为原生验收通过。正式设计仍为 **0/20**。

## 2026-10-12 蓝牙与 Brainstem 连接（最新代码增量）

已定位真实 Brainstem 仓库 `D:/inovxio/brain/brainstem`：现有接口是 gRPC/Protobuf，不是 BLE 配网协议。新增独立 `iot/brainstem-bridge` 只读网关与 App 开发用连接诊断页；实际仅调用 `RobotControl.GetControlStatus`，不获取控制权、不发运动指令、不注入生产遥测。远程链路需 HTTPS/mTLS；令牌不落盘，取消会传到 gRPC，过期状态清除，Design QA 保持离线，生产入口不启用诊断页。

本地已通过 26 项连接/预检/iOS BLE 测试、12 项真实 proto + mock gRPC 网关测试、32 项登录/资料/预览回归（其中 6 项 iOS BLE 与前述重合）、12 项 BLE 合同检查与原生权限 introspection。编译后的 Web 实际交互 9 项通过，覆盖 CORS/鉴权/回传/取消/配置失效/QA 隔离。上述 gRPC 服务是明确标注的本机 fixture，不是机器人。typecheck 与 Web/Android JS/资源导出成功；未构建新的 APK/IPA，也未取得本轮原生或硬件证据。

iOS 新增原生扫描适配与权限说明，Android 扫描保留；仅“发现候选广播”，不是绑定、身份认证或 Wi-Fi 配网。真机权限与扫描仍待验收，固件 GATT 服务/特征、身份挑战和凭据传输合同仍缺失。

云端只读探针：Web/iOS/Android 配置地址 `vchvqfdlkomlrjenkdhj.supabase.co` 在本机均 DNS 失败，Auth/REST 不可达。用户确认项目还在，但尚未核对 Active/Paused 状态与当前项目 ref；不能据此断言项目已删除或已恢复。Supabase 管理 CLI 未登录，本轮未恢复/重建项目、部署迁移或创建账号。

开发入口：http://127.0.0.1:8105/?connection-check=1 。该页可不经云端登录进行用户主动的只读诊断，并非绕过产品认证。证据与浏览器脚本：`D:/DOSO/ui-review/20261012-connectivity/`；网关接入说明：`iot/brainstem-bridge/README.md`。正式设计 **0/20** 与真实运动控制未完成的状态不变。

## 2026-10-12 控制入口与个人资料编辑（上一批代码增量）

已接入首页/我的设备的“控制中心”入口、顶部头像与“编辑资料”入口；资料表单支持用户名、昵称、头像选择/移除、失败保留草稿和取消确认。新增私有头像存储与自助资料编辑迁移，尚未部署。改名不继承旧名字的管理员验证标记；头像直接列更新已收口到受保护接口，模糊超时不显示成功。

路线页已区分“我的路线 / 示例路线”，修正模板永久限制的产品规划。真实地图、航点编辑、路线存储与 Brainstem 生产执行器依然未完成；示例不可下发。后续顺序与边界见 `docs/PRODUCT_COMPLETION_PLAN_20261012.md`。

本轮源码 Web 交互预览：http://127.0.0.1:8104/?design-qa=1&qa-browse=1&qa-stage=main-profile&qa-theme=light 。截图与离线验证：`D:/DOSO/ui-review/20261012-profile-control/`。这是实际产品组件的只读开发入口，不会保存真实账户或发送控制命令。

typecheck 和 Web/Android 代码导出已跑通；Android 导出不是新 APK。ADB 8 秒探测超时；本机数据库未运行，pgTAP 与真实账户存储验证未完成；新增相册模块需重新构建原生包。服务端图片字节校验及头像超时孤儿的 Storage API 清理运维仍待发布前完成。正式设计强证据保持 **0/20**，本轮未改变门槛。

## 2026-10-11 全部 20 页当前外观展示（最新预览）

按用户要求展示每个入口，采集同一当前源码批次的 Web 浅色 / 深色 / 横屏共 60 张图，按主界面 6、账户 9、设备 5 分组。地址 <http://localhost:8101/>；离线文件 `D:/DOSO/ui-review/20261011-all-pages-current/index.html`。原 7 页认证 / 38 状态总览保留在 <http://localhost:8101/auth-batch/>。本次没有修改产品源码，没有混入昨日旧图。

采集前后 201 项源码 / 素材 / 主要配置哈希一致，聚合 SHA 为 `c49680b25e1046843d675b19475fc646f0d3186a29032e9a4b92d892a5530448`。17 个入口使用产品组件；MFA、BLE、账户安全 3 个入口仍是 QA 占位说明，不能当作真实完整页面。图片哈希、尺寸、目录 / 筛选 / 主题逻辑及 HTTP 访问已核对；不增加原生 / Figma / 发布验收 PASS。资源不足曾中断预览服务，静态服务已恢复；8099 交互预览是独立服务。

## 2026-10-11 认证 UI 第一批收敛（最新增量）

完成登录、注册、邮箱验证码、找回密码、重设密码、用户名设置、显示名确认共 7 页的共享视觉调整。沿用已确认的白蓝 / 石墨灰方向，统一输入框与按钮、文字层级、错误提示和次级操作；横屏登录 / 注册减少多余纵向间距，保留完整社交入口和至少 44dp 的操作区域。没有改变真实认证门禁、OAuth 可用性、OTP 过期 / 重发保护或机器人控制权限。

当前源码 Web 预览共保存 38 张截图：7 页浅色 / 深色 / 横屏 21 张，加 17 张加载、错误、过期、无效链接、空邮箱等状态。总览为 <http://localhost:8101/>，离线文件及截图在 `D:/DOSO/ui-review/20261011-auth-workflow-ui/`。清单冻结并核对 18 个直接 / 共享源码文件和全部截图；这不是整个仓库的依赖闭包。正式 Figma / Android / iOS 视觉验收不因这些 Web 截图自动通过，正式计数仍为 **0/20**。

本轮认证 UI 33 项、OTP 11 项、认证布局 3 项、账户流程 6 项、安全 14 项及设备不可用态 6 项测试通过。typecheck、Android Expo JS / Hermes / 资源导出、本地 `test:release-gate:design-audit` 和任务文件 diff 检查成功。design-audit 不含数据库集成，不替代默认完整 release gate；Android export 不是 APK，没有新建可安装发布包。

当前未补拍 Android / iOS 原生截图，也未完成真实邮件、OAuth 或真机端到端测试。C 盘空间不足仍阻碍本机 Android 模拟器复验。本节之后共享导航与认证源码已变化，下面 2026-10-10 及更早原生截图仅保留为历史，不代表当前源码已验收。下一批优先处理机型选择、分析及控制页，再补齐 MFA / 安全 / BLE 真正组件的交互覆盖；发布缺口不以只读演示替代。

## 2026-10-10 Android 原生任务页修复（历史增量）

按用户圈出的任务页裁切、重复机器人和反馈叠压直接修改产品源码。停用整片图片 UI 和透明热点，三张原生模板卡唯一选中；机器人只在详情出现一次，蓝白/石墨统一；日期反馈和步骤展开为真实控件，反馈不再覆盖内容/导航。模板仍是只读且启动禁用，不伪造可信任务或设备能力。

最终当前源码 Android API35 开发客户端三态截屏成功（390×844 / 844×390），实际浅色竖屏 6 项点击检查通过；7 项策略、9 项组件交互、typecheck、Android Expo export 和本地 design-audit 均通过。三态复核未发现裁切/重叠/不可读阻断。证据、截图和 35 个源码/资源 SHA 在 `artifacts/design-acceptance/20261010-android-tasks-native-ui-r4/`。没有重建 APK；现有安装包不会自动包含该修复。design-audit 不含数据库集成，也不能替代默认完整 release gate。

正式设计仍为 **0/20**（13 in_progress / 5 needs_revalidation / 2 stale）。任务页改为修复候选进行中，不能用旧绿色 Figma PASS 更新 SHA 恢复通过。浏览器虽已登录，Codex Figma 连接器仍要求重新认证；本轮未读取/修改最新云端稿，缺最新三态原生导出、全帧/关键区域和布局规范比较。跨午夜日期刷新、大字/深色横屏完整原生交互矩阵、真实服务/设备及发布包均未完成。下一闭环：连接器恢复 → 定点同步冻结任务三节点蓝白真实状态标准 → 原生导出/比较并清零问题 → 真正登记通过，再进入路线/首页。

## 2026-10-10 Android 正式设计第一轮收敛（历史增量）

按用户要求先在 Android 解决 0/20。已在本机 API 35 模拟器运行匹配 Expo 57 / RN 0.86.2 的开发客户端，加载当前 Metro 源码，重拍首页、路线、任务浅色/深色/横屏共 9 张；任务修复后另行复拍。旧 Debug APK 仅是原生开发壳，不是当前正式候选包，没有重建 APK。

修复任务默认选中卡片箭头点击无反馈：真实 RN 按钮显示模板说明、不发机器人指令，策略 7 项与交互 3 项通过；Android 390×844 实际点击可见说明，保存前后完整截图。typecheck、Android JS/Hermes/资源导出和本地 design-audit 模式发布审计通过；此审计不运行数据库集成，也不能替代默认完整 release gate。

正式设计仍为 **0/20**，并非页面被删除。新截图对历史 Figma 原生导出的 SSIM：首页 `0.5843 / 0.3606 / 0.5591`，路线 `0.6488 / 0.7213 / 0.7825`，任务 `0.6140 / 0.4493 / 0.8263`；只有任务横屏全帧过线，不能算整页通过。基准还保留旧绿色，而用户选定的是蓝白；当前 Figma design context 返回需要重新认证，未核验或更新云端标准。关键区域、字体/间距/点击区、图片 UI 和其余交互仍未清零。

本轮同时修复验收刷新工具与强证据校验：直接重算三态全帧/关键区域，强制精确尺寸、布局/字号/点击区报告与 Android/Figma 来源绑定；真实执行验证并前后复核源码，登记双文件失败回滚、并发变化拒绝覆盖。中央证据 36 项、manifest 25 项、finalizer 15 项、比较器 4 项定测通过。不使用旧 PASS 更新 SHA 恢复通过；长期复验只因绑定源码/证据变化失效，不因无关文档提交自动清空。最新证据、失败矩阵及下一闭环见 `artifacts/design-acceptance/20261010-android-revalidation-a01/README.md`；实际任务反馈见相邻 `20261010-android-task-feedback/`。下一顺序为同步蓝白真实状态标准 → 冻结共享壳层 → 路线/任务/首页逐页补齐并真正通过。

## 2026-10-10 native-sim 首轮试跑（最新增量）

Appetize 不再作为唯一测试入口。已安装 native-sim npm 0.2.2，并在独立私有仓库 `Kitjesen/doso-native-sim-pilot` 运行现有 iOS Simulator 只读预览包；没有上传 DOSO 产品源码，没有重新编译或修改产品能力。GitHub Actions run `37962162592` 最终为 **success**，`stream` job 实际运行 12 分 44 秒：启动 iPhone 17 Pro / iOS 26.2、包 SHA 校验、安装、启动 `com.doso.robot` 和 10 分钟流服务健康检查成功。会话于北京时间 2026-10-10 01:04:33 自动结束，旧临时链接已失效，不能继续当作活动测试入口。

浏览器已连接到模拟器，DOM 显示 live 与 DOSO 包身份；结束后留存画面可辨认 DOSO 首页，但带有 Connecting 遮罩。该图片仅为结束状态记录，不作为浅色原生截图、无崩溃持续运行或页面交互通过证据。后续点击受浏览器自动化响应慢影响，本轮控制页、其他导航、键盘、主题、横屏、大字体和 VoiceOver 均未完成原生验证，不登记 PASS。

本轮本地 gate 授权/空 token 拒绝测试 **2/2 通过**；209 个构建归档文件重新逐一核对当前源码一致，源码聚合 SHA 仍为 `03a4925563c7d88a8daa69a7a556d5b5a589409c2cb9f0dfbdfb040814a7cff1`。源码强设计证据仍为 **0/20**（12 in_progress / 5 needs_revalidation / 3 stale）；未重跑完整 release gate，也不继承历史功能通过为本次测试结果。GitHub 用量页仅显示时长，最终现金费用未核定，不宣称免费。没有改套餐或启动第二轮。

证据、限制和下一轮最小用例见 `artifacts/release-readiness/20261010-native-sim-pilot/README.md`。测试通道部分通过不等于可上线；真实认证、账户删除、iOS BLE、Brainstem 实际命令、Apple 签名与 TestFlight 仍是独立缺口。

## 2026-10-09 iOS 交互测试与审计（最新增量）

在同一 Build `948d1cf2-c94f-4842-a7b2-b50edabae1bf` 的 iPhone 14 Pro Max / iOS 17.2 原生模拟器补测五个主导航、登录默认态及空提交错误焦点、首页深色和横屏重排。任务页亮绿色箭头无反馈已复现；剩余页面、异常态、VoiceOver、200% 字体、真实认证与硬件流程未完成全量验证。Appetize 免费会话明确限制为 3 分钟，后续浏览器控制连续超时；登录→注册尝试与字体选择均不登记通过，也不将主机中断记为 App 崩溃。

54 个安全本地命令组与 typecheck 通过；在线认证预检因缺 SUPABASE_URL 未执行。正式设计证据仍为 **0/20**（12 in_progress / 5 needs_revalidation / 3 stale）；strict design-evidence 正常阻断，完整 release gate 本轮未运行。209 个构建归档文件逐一与当前源码核对一致，源码聚合 SHA 为 `03a4925563c7d88a8daa69a7a556d5b5a589409c2cb9f0dfbdfb040814a7cff1`。本轮没有修改产品源码、开放能力或付费升级。

发现 4 项产品 P1 + 1 项 QA-only P1、4 项产品 P2：图片 UI/透明热点、任务反馈、Dynamic Type、破坏性确认、QA VoiceOver 分组、触控区/小字、tab/返回语义、错误焦点。完整 20 页矩阵与按 Apple 指南的修改清单见 `docs/IOS_INTERACTION_AUDIT_20261009.md`；截图、逐项原生记录、本地日志在 `artifacts/release-readiness/20261009-ios-full-test/`。账户删除、iOS BLE adapter、Brainstem 生产 executor、签名在线包与 TestFlight 仍是独立发布缺口，不以只读预览替代。

## 2026-10-09 iOS 原生浏览器内测（上一轮）

已将当前源码的独立只读预览构建并上传至用户的 Appetize 账号。EAS Build `948d1cf2-c94f-4842-a7b2-b50edabae1bf` 已 FINISHED；包为 DOSO 0.0.1 (5)、`com.doso.robot`、arm64/x86_64 iOS Simulator，最低 iOS 16.4。通过真实源码归档核验：209 个文件、29,394,519 bytes，不包含本地环境文件、凭据或历史安装包。新增 Windows 路径规范化与归档一致性保护，13 项构建检查、8 项离线预览检查、typecheck 和独立入口 iOS Hermes 导出通过。

在 Appetize 的 iPhone 14 Pro / iOS 17.2 会话中，已观察到原生冷启动直接进入浅色首页、首页进入控制页、控制页返回首页。已保存完整浏览器运行截图。这是原生模拟器运行证据，不是 Web 预览；但后续地图导航检查遇到浏览器控制连续超时，会话回到 Tap to Start。其余导航、主题、横屏和键盘未完成本轮原生验证，不登记通过，也不把基础设施超时登记为 App 用例失败。

测试入口：<https://appetize.io/app/ios/com.doso.robot?device=iphone14pro&osVersion=17.2&toolbar=true>。点 Tap to Start 后从首页开始；顶部“页面”可进入认证等预览。正式 `index.ts` 和认证门禁不变，本包使用 `index.preview.ts`，无 AuthProvider，不发送邮件或机器人指令。MFA、账户安全、BLE 等部分入口仍是只读安全壳，不能当作功能实现完成。

构建包、源码 SHA、静态核验、运行截图和未测项见 `artifacts/release-readiness/20261009-appetize/README.md`。设计正式通过仍为 **0/20**；真实认证、账户删除、物理 iPhone BLE、真实机器人链路、Apple 签名与 TestFlight 仍未验收。未付费、改套餐或提交商店。下文为历史，不覆盖本节。

## 2026-10-05 Android 候选版本推进（历史）

本轮目标：生成与当前源码一致的可安装 QA 候选包，先进行真实 Android 设备验收，再把同一源码基线用于 iOS TestFlight 准备。已完成本地发布审计的第一轮：认证/注册/OTP/首页/QA 浏览/设备不可用页/iOS 构建配置/云构建保护共 **54 项测试通过**；Profile、Tasks、Routes、Control、Model Select、Security 及账户流程回归也已通过，当前 `typecheck` 为 **TSC_EXIT=0**。正式设计总清单仍为 **0/20**，不能将这些行为测试误写成视觉通过。

最新 Android QA 云构建已完成，Build ID：`17223279-31e4-4763-9e32-7a4682bdb0be`，包名 `com.doso.robot.qa`，QA profile，版本 `0.0.1-qa` / build `6`。这是修正共享主题、安全区、深色导航和 TypeScript 配置后的候选包。APK 已下载到 `artifacts/release-readiness/20261005-android-qa-v2/DOSO-0.0.1-qa-build6-v2.apk`，SHA-256 为 `039323c86baa08ec3c0690d24d846ce8ff987df66bf4089dfd076f744e0c8596`，包身份和 APK v2 签名已用 Android build-tools 核对。下载地址和逐步真机测试表见该目录 README；当前没有已连接 Android 设备，所以尚未完成安装/启动实测。构建成功也不代表真实认证、BLE 或机器人能力已接通。旧候选 `fa46e6ff-9f2e-4b9b-a581-b172b5721b79` 仅保留为历史，不再作为当前包。

Windows 本地 Gradle 失败属于环境问题：Java 24 触发 Android lint/Prefab 兼容错误；切换 JDK 17 后，带空格工作区路径又触发 CMake 找不到 `react-native-safe-area-context`，无空格盘符构建还受到 Expo 自动链接命令环境影响。本地失败日志保留在 `android/build-qa-current.log`，未为绕过环境问题修改产品逻辑；EAS 使用干净 Linux 构建环境作为候选包来源。

本轮不做的事情：不提交商店、不购买 EAS 套餐、不伪造真实账号/蓝牙/机器人成功、不把历史 APK 当作当前候选包。

## 2026-09-18 iOS 首发主线（历史）

当前运行验收阻塞：EAS Maestro 手动工作流已通过官方 schema 与本地保护测试，但提交时被免费套餐拒绝（需要 paid plan），没有创建测试任务、没有执行 iOS 启动/页面测试。没有付费或更改套餐。下一外部条件为用户批准并开通 EAS 支持的套餐，或提供可用 Mac；不要将这一基础设施阻塞统计成 App 功能失败。

构建结果更新：iOS simulator 任务 `ca1d0d14-e5e6-48e9-8a39-fa26b6e71a61` 已 FINISHED。已下载并静态核验 DOSO 0.0.1 (5) 的 universal simulator 产物，x86_64/arm64，最低 iOS 16.4。详见 `artifacts/release-readiness/20260918-ios-cloud/artifact-verification.json`。正在推进 EAS 云端 Maestro 启动/认证页导航测试；无本地 Mac 不再一概视为无法做模拟器自动测试，但物理 iPhone/BLE/Apple 真实认证仍有独立阻塞。页面最终验收仍为 0/20。

最新增量：Expo 浏览器授权成功，已连接用户指定的 `@kitjesens-team/hongsen`（project ID `090f78b1-5b6b-4ba8-9207-1e0c21c52f62`），提交首个 iOS simulator Release 云构建 `ca1d0d14-e5e6-48e9-8a39-fa26b6e71a61`，提交命令退出 0。此时仅确认上传/提交，不能算编译或安装成功。App 名称和包名不变；云环境无后端参数，不能进行真实认证。官方 Expo 插件已安装；构建归档安全检查、3 项构建测试、38 项共享行为测试、Apple 核心/资料恢复测试和 typecheck 通过。详情：`artifacts/release-readiness/20260918-ios-cloud/README.md`。下文未登录状态已被本段替代，Apple/Mac/iPhone 条件仍未具备。

用户明确首发推进目标为 iOS。已建立 `docs/IOS_RELEASE_ACCEPTANCE_CHECKLIST.md`，包括 15 项推进门禁、20 页 iOS 三态台账、认证/注销/设备/发布行为用例与责任依赖。

本轮 typecheck 和 iOS JS/Hermes/资源 export 成功，证据见 `artifacts/release-readiness/20260918-ios-preflight/README.md`；不等于 Xcode archive、IPA、iPhone 安装或服务 E2E。当前页面最终验收仍为 0/20；Android v12 只保留为此前内测证据，不迁移为 iOS PASS。

用户确认目前没有 Apple Developer、Mac、iPhone。正式签名/TestFlight 与原生真机验收阻塞；可采用 EAS 云构建代替自有 Mac 编译，但仍需 Apple Developer 和可用 iPhone。源码整改继续可做。iOS BLE 当前通用 adapter 为 unsupported；App 内完整账户删除链路未定位，需补齐并实测；真实设备通信、20 页证据、隐私与商店材料仍未完成。本轮未购买服务、开户、部署、上传或提交商店。

## 2026-09-09 原生离线预览 v12（当前内测产物；非正式发布）

新增独立 DOSO Preview 包 `com.doso.robot.preview`，直接进只读首页，可切换五个主导航、20 页目录和浅/深色，系统返回键可关闭目录或返回首页。正式 index.ts 的认证和 __DEV__ 门槛不变；preview 通过独立入口打包，并在最终 Android 清单移除联网、BLE 扫描/连接、位置权限和生产认证回调。

已生成 ARM64 手机包和 x86_64 模拟器包，签名与包身份/权限检查通过。ARM64 转译在模拟器出现 SoLoader 架构加载失败，改用原生 x86_64 后安装、冷启动、控制页进入/系统返回、主题切换、注册入口与横屏滚动实测通过；重复冷启动 1781ms。ARM64 手机包尚无 ARM 真机启动证据。所有日志、截图、包和 SHA 记录位于 `artifacts/release-readiness/20260909-native-preview-v12/`。

新增预览隔离与 Android 返回测试，修复设备不可执行页面测试 harness 缺少 React Context 模拟的兼容问题；14 项相关测试及 typecheck 通过。默认发布门槛前 29 组通过，第 30 组因设计强证据 0/20 停止，后续未执行。不放宽门槛，不把离线预览当成认证/设备成功结果。

仍需：收敛原生安全区与横屏工具栏占用、全量 20 页当前源码三态验收、真实认证 E2E、生产签名和渠道包、真机 BLE 与产品能力验证。此次提供的是可安装的 UI 内测，不是可上线版本。

## 2026-09-09 首页 Figma 结构回归 v11（历史）

首页恢复原稿的设备卡层级、横排指标、居中短 CTA、召回胶囊及带缺口的快捷卡；共享导航恢复深色栏和单一选中背景，Header 字级收敛为 18/25。保留白底蓝色、单处机器人和真实离线能力边界。复用 Figma 原始图标，不把整张卡片作为图片。

Figma 连接器授权过期，本轮基于已保存的 Figma 原生三态导出，未核验线上最新节点。Web 浅/深/横屏、小屏滚动和快捷跳转已验证；证据在 `artifacts/design-acceptance/20260909-home-figma-v11/`。未重建 APK，未拍 Android 三态，未登记像素验收通过；当前强证据仍为 0/20。

## 2026-09-09 直接浏览测试 v10（历史；未重新打包）

开发预览地址：`http://127.0.0.1:8099/?design-qa=1&qa-browse=1&qa-stage=main-home&qa-theme=light`。直接进入首页，五个导航页和首页快捷入口可跳转；顶部“页面”提供 20 个页面入口，“首页”可随时退出子页，“深色/浅色”覆盖仅作用于浏览预览，默认浅色。认证、绑定、命令提交仍是无副作用回调，浏览分析页不展示示例遥测。此模式受原有 `__DEV__` 与显式 QA query 保护，不是生产免登录。

认证深色改为中性石墨，产品外观与导航统一白/灰/蓝，移除偏绿底色。本次浏览器已验证五个主页、控制页返回、页面目录和主题切换。新增 4 项浏览行为回归；typecheck、认证 20 项行为测试及 QA 门禁检查通过。最终回归记录在 `artifacts/design-acceptance/20260909-browse-v10/`。

v9 APK 是已签名校验的历史内测包，不含本次浏览工具或最新颜色；当前没有重打 v10 APK，没有真机/真实服务验收，设计强证据仍为 0/20。下方 v9 的源码哈希与截图保留为历史，不代表 v10 通过。

## 2026-09-09 纯色认证实装 v9（已交付历史内测包）

登录/注册已落实纯白底、纯浅灰输入框、蓝色主 CTA 和局部浅蓝产品卡；首页与导航移除雾化背景。后续账户认证主按钮/焦点/验证码重发链接同步蓝色，保留能力门禁和错误恢复。修复小屏标题/机器人重叠风险及旧密码框忙碌时仍可切换可见性的行为；删除两个已失效的类型错误抑制注释。

15 组当前源码检查通过（含 typecheck、登录/注册、OTP、账户流程与布局、能力真实性）。390×844、844×390、320×568 Web 运行检查及截图在 `artifacts/design-acceptance/20260909-solid-auth-v9/`；黄色提示是开发验收入口安全提示，不是生产 UI。Web 截图不是 Android 证据，更不是 Figma 像素验收。

Android ARM64 内测 APK 已于 2026-09-09 06:27 构建成功，交付文件 `artifacts/design-acceptance/20260909-solid-auth-v9/DOSO-0.0.1-qa-arm64-v9.apk`；包名 `com.doso.robot.qa`，版本 `0.0.1-qa`，签名校验通过（内测 Debug 证书，不是生产签名），未连接真机，未完成安装/启动验收。默认 release gate 已执行并被设计验收 0/20 阻断；生产签名、真实认证 E2E、Figma 对齐和全量 20 页验收仍未完成。本节覆盖下方历史状态，包 SHA、构建日志与交付边界见 v9 的 `release-note.md`。

## 2026-09-08 Soft Air 新外观（历史）

用户新要求按 Overlay 参考升级风格，本轮在实际 RN 源码更新登录/注册、首页和共享 Header/导航：白色轻层次、柔和天蓝、圆形选择反馈，首页仅保留一处产品图。保留 Figma 原始图标与真实能力边界，不把未配置的第三方登录或离线召回伪装为可用。

认证同帧锁、错误恢复、输入焦点及密码显隐继续保留；新增首页/导航行为与布局回归，修复旧首页横屏 Header 遮挡和重复侧栏预留。证据与限制见 `artifacts/design-acceptance/20260908-soft-air-v8/`。新样式只覆盖上述页面，其余 17 页主体仍待迁移。

当前设计验收仍为 **0/20 当前源码有效通过**。Figma 同步、真实账户 E2E、其余页面视觉/交互和生产签名仍未完成。前一版 Android 导出成功，但 QA APK 构建因 JVM 内存不足失败；不得把旧 APK 或 JS 导出称作本轮可上线安装包。

下方所有页数和“本轮”描述均为历史记录，不覆盖本节与机器清单。

## 2026-09-08 上线主线恢复（最新）

停止首页概念稿微调；用户否定“直接去重后太空”的候选，不将其写入 App。本轮未改变首页布局、素材或机器人能力开关。

本轮实际代码修复：邮箱 OTP 使用绝对重发截止时间，回到前台立即刷新；验证、重发与页面返回共享同步请求锁；App 的注册/恢复验证也使用已有 OTP 锁，关闭同一帧 Android 返回与重复请求的竞态。11 项新增行为测试通过，并将认证 UI、OTP、账户流程和错误分类检查接入默认发布门槛。

修改前默认发布门槛执行到设计验收后失败（3/20），并未执行其后的数据库/函数等步骤。修复共享 `App.tsx` 后原 3 页证据失效，当前为 **0/20 当前源码有效通过，3 页保留历史通过证据**；这不是页面被删掉，也没有降低验收门槛。修改前与修改后的 Android JS/资源导出分别归档，导出不等于正式签名包。

上线仍需：真实邮箱注册/恢复与托管身份迁移验收；当前源码页面回归；稳定生产签名与渠道包；物理 BLE、GATT/Wi-Fi、OTA 和真实命令链路的独立验收。当前进程未配置四项 Android 生产签名变量和正式认证链接变量（未读取或输出密钥）。未创建签名、部署迁移、发送真实认证邮件或提交商店。

本轮修复后 typecheck 与 Android 导出成功，验证码页已完成 Android 模拟器浅/深/横三态采集；仅为开发入口运行证据，不是实际邮件 E2E 或 Figma 像素通过。本轮证据目录：`artifacts/release-readiness/20260908-launch-focus/`。

## 2026-09-08 注册页视觉更新

用户已确定白底、深石墨和柔和蓝的新方向，规范见 `docs/design/DOSO_VISUAL_DIRECTION.md`。注册页源码样板已完成 Android 三态与 Web 交互检查；保留真实认证回调，未开放未配置 Provider。证据：`artifacts/design-acceptance/20260908-register-soft-blue-v6/auth-register/`，完整检查说明见上级目录 `qa-progress.md`。

当前新样板仍未完成 Figma 云端同步或真实注册 E2E，不记录最终设计通过。此前登录、机型与分析的机器通过因目视遗漏回到复验；当前清单保留 3/20，旧文中 7/20 仅为历史。

> 核对日期：2026-08-25

## 结论

`package.json` 与 `app.json` 的当前版本均为 `0.0.1`。这是项目尚未正式发布时的源码开发基线，不表示已经完成生产上线；历史 `1.2.x` APK 仅作为 QA 证据保留。

当前托管 Supabase 与四个 Edge Functions 已承载邮箱认证、终端管理、设备绑定、RLS、管理员 MFA 和审计的基础能力。最新源码又加入了社交登录、首次用户名认领和外部身份展示，但对应的托管数据库迁移与线上 Provider 尚未完成部署和真机验收。

### 2026-09-07 UI 增量

- 绑定页改为用户语言，补齐输入焦点与键盘下一项，并修复横屏说明裁切、占位文字字距和深色按钮对比度。
- 生产配网/固件入口与 Design QA 统一使用 `DeviceUnavailableScreen`。此组件只接收设备名称、能力类型和返回回调，不导入模拟网关、读取设备或提供执行入口；开发演示页继续与生产隔离。
- 不可用信息页允许查看和返回设备设置，真实 GATT/Wi-Fi、OTA/回滚执行仍关闭。不能把“入口可进入”登记为“能力已开放”。
- Figma 连接已能读取副本，但当前 Starter 配额阻止写入；本轮未修改云端节点。旧 `2026-09-04.20` 生成器尚不包含上述新产品界面，恢复编辑后需在冻结节点上逐页更新。

## 当前产品推进顺序

1. **蓝牙/Wi-Fi 安全配网**：P0 第一主线。先定义机器人身份、临时配网会话、Wi-Fi 凭据保护、取消/超时/断网恢复和恢复出厂后的重配流程。
2. **固件升级与回滚**：P0 第二主线。建立签名固件清单、型号与硬件兼容约束、下载/校验/安装/重启状态机，以及中断恢复和失败回滚。
3. **命令 ACK、可信遥测与故障通知**：依赖前两条设备生命周期合同，再推进路线、任务、召回与控制。

前两条的纯 TypeScript 领域模型、Node 模拟器、gateway 行为测试和静态 wiring guard 已经实现。Android 还新增了真实 BLE discovery 依赖、权限/config、扫描 adapter，并已把“我的设备 → 开发诊断 → 附近 BLE 设备”接入为独立诊断入口；它只读取广播，不连接、不绑定、不写 Wi-Fi，也不会改变配网、OTA 或运动能力门禁。生产 App 可进入配网和 OTA 的不可用信息页，但执行能力仍按独立门禁关闭。当前源码快照已通过原生预构建、四 ABI debug APK 编译、Android 模拟器安装与 App JS 启动。这不包含物理 BLE 扫描或身份验证；GATT/Wi-Fi、Hosted OTA、机器人 bootloader 与 A/B/等价回滚仍为 `BLOCKED/尚未实现`。

## 功能状态

| 范围 | 当前状态 | 上线前还需要 |
| --- | --- | --- |
| 邮箱注册、OTP、密码恢复、账户邮件 | Auth 邮件已有基础实现；账户邮件 outbox/DirectMail Worker 的本地 6 态状态机、原子终端注册、named-secret Cron 鉴权和 30 天脱敏资产已完成，`new_device_login` 默认关闭且未部署 | 先在 staging 部署 migration/Worker/Vault/Cron 并验收 unknown 告警与 rollback；再完成生产 OTP、Gmail/Outlook/QQ/163 投递与邮件原文鉴权后开启 flag |
| 终端、设备绑定、RLS、管理员 MFA/审计 | 托管基础能力在线 | 用当前源码重新跑托管端回归测试 |
| Apple 登录 | UI 与客户端流程已写；Provider/功能开关关闭 | 配置 Apple Developer 与 Supabase，正式签名真机验收后启用 |
| 微信、QQ 登录 | UI 与 Custom OIDC 客户端流程已写；Provider/功能开关关闭 | 完成开放平台、OIDC broker、Supabase Custom Provider 与真机验收 |
| 首次用户名认领 | 页面、门禁、`claim_username` RPC 和迁移已写 | 先部署托管迁移，再发布依赖该字段的客户端 |
| 外部身份展示 | 注册表、`list_my_login_methods` RPC 与 UI 已写 | 部署托管迁移并验证 RLS/RPC 返回契约 |
| 蓝牙/Wi-Fi 安全配网 | 模拟领域模型/gateway 与 `react-native-ble-manager` discovery adapter 保留为开发/离线测试资产；App 已提供独立 BLE 广播诊断入口，但候选始终标记为身份未验证，生产配网只开放不可用说明与返回，执行保持禁用 | 在物理 Android 手机完成广播扫描；再冻结 GATT/身份/分片合同，实现一次性 Wi-Fi 写入、签名联网确认与测试 AP/机器人验收 |
| 固件升级与回滚 | `SIMULATED` 领域模型/gateway 的 `7/7` 行为合同保留为开发/离线测试资产；生产 App 的 OTA 仅显示不可用说明与返回，不连接模拟 gateway | 部署 Hosted OTA 签名/制品/作业服务，并在具备 bootloader 与 A/B/等价回滚的机器人上完成断网、断电和坏镜像验收 |
| 机器人控制、任务、路线与告警 | G008 仅完成 `diagnostics.health_check` 非运动模拟闭环；七项能力已拆分独立门禁，App 现已接入命令协调器，覆盖去重、15 秒 deadline、权限复核、取消、迟到/错误 ACK 隔离与可信终态订阅。生产 executor 明确为 `null`，demo 诊断不会解锁实体运动，任务/路线仍为模板预览 | 分能力接入 MQTT/mTLS、生产持久化/worker、真实 executor、可信 ACK/遥测与机器人证据；路线、任务、召回、手动控制继续 `BLOCKED` |

`.env.example` 中 Apple、微信和 QQ 的功能开关均为 `false`。未配置线上 Provider 时，灰色禁用入口是预期行为。

## 历史 APK 与源码对应关系

- `DOSO-1.2.3-pure-social-icons-qa.apk` 与 `DOSO-1.2.3-pure-social-icons-universal-qa.apk` 构建于最后一轮用户名门禁和外部身份代码之前，只能代表当时的社交图标 QA 状态。
- `DOSO-1.2.3-quiet-auth-identity-qa.apk` 是后续生成的较新 QA 包；目前仅能确认构建产物存在，不能替代托管迁移、Provider 配置或真实登录验收。
- 所有现有 APK 均使用 Android debug 签名。生产上线需要稳定的生产签名密钥、生产环境值和重新构建的 AAB/APK。

## 已有验证证据

2026-08-25 在当前工作树重新运行：

- `npm run typecheck`：通过。
- `npm run test:provisioning-ui`：当前证据口径为领域模型 + `provisioningGateway` 行为测试 + 页面源码静态 UI/wiring guard，`11/11` 通过；不属于组件交互、E2E 或真机测试。
- `npm run test:firmware-update-ui`：当前证据口径为领域模型 + `firmwareUpdateGateway` 行为测试 + 页面源码静态 UI/wiring guard，`7/7` 通过；不属于组件交互、E2E 或真机测试。
- `npm run test:ble-discovery`：`13/13` 通过，覆盖候选模型、命名保留、Android 新旧权限/定位服务分支、正常/超时/失败停止码、取消/后台清理、平台 fallback、原生权限 introspection、config plugin、独立 App 诊断路由和无连接/无写入边界；这是行为 + 代码门禁，不是物理扫描。
- `npm run test:robot-simulator`：`SIMULATED PASS`。聚合验证机器人协议 `28/28`、安全配网 `24/24`、G008 命令投递 `18/18`、G008 诊断 UI `9/9`、lifecycle/trusted-data UI guard，以及 canonical verified ACK log→DTO/遥测过期合同。总计 `79/79` focused assertions + 3 guards；无 MQTT、无硬件、无生产 Supabase 证据。
- `npm run test:robot-capability-readiness`：验证七项能力独立放行；当前 physical 默认全部为 `false`，demo 仅允许非运动诊断，连接状态与安全锁只会在对应能力已有可信证据后继续约束。
- `npm run test:robot-command-executor`：`30/30` 通过，覆盖 capability + executor 双门、不可变 JSON-like payload/权限快照与非法输入 fail-closed、ACK 自有数据字段归一化和状态转移白名单、同能力在途去重、dispatch/终态权限复核、精确超时、取消、旧 attempt/迟到成功隔离、观察者异常隔离、authority 切换统一取消及 `cancelAll` 重入阻断。App 只有收到当前设备的认证 `succeeded` 终态后才显示完成；执行器故障只显示固定安全文案，当前生产 executor 仍为空。
- `npm run test:release-gate`：顺序执行生产基线、唯一的 `test:robot-simulator` 聚合、独立能力门禁、命令协调器、固件生命周期、BLE discovery 代码门禁、邮件/Edge Function、其余 lifecycle UI/可信数据显示和 TypeScript 检查；任一步失败即阻断。该门禁不能把 MQTT/mTLS、GATT/Wi-Fi、Hosted OTA、bootloader、物理机器人、运动、路线、任务或召回改为 `PASS`。
- `npm run export:web` 与 `npm run export:android`：Metro 均成功打包（Web 最新复核为 425 模块；Android 最新复核为 803 模块）。
- `expo prebuild` + Gradle `:app:assembleDebug`：JDK 21 和短路径下四 ABI 编译成功；APK 安装到 `emulator-5554` 并通过 Metro 冷启动加载 DOSO 登录页。该证据证明原生链接和 App 启动，不证明物理 BLE 射频扫描。
- `npm run test:config`：40 项配置检查通过。
- `npm run test:account-email-db`：账户邮件 outbox 目标 pgTAP 覆盖默认关闭、原子注册/去重、lease/dispatch fencing、unknown/manual retry、dead-letter 和 PII 脱敏；仅为本地数据库证据。
- `npm run test:account-email-ops`：验证 `verify_jwt=false` + named secret `apikey`、Vault/Cron 安装/停用、无业务幂等键声明、rollback 顺序及 release-gate 接线；不代表已部署生产资源。
- `npm run test:social-auth`：社交认证静态 wiring guard 通过；脚本明确说明这不是行为或安全测试。
- `npm run test:username-onboarding`：用户名门禁静态契约通过。
- `node scripts/verify-account-identities-ui.mjs`：登录方式 UI 静态 wiring guard 通过；未证明托管 RPC 或 Provider 可用。
- `npx expo-doctor`：本次因 Expo API TLS 网络连接失败，未获得完整结果；不能把这次运行记为通过。

尚不能据此声明完成的项目：托管迁移部署、Apple/微信/QQ 真机登录、生产 SMTP 全矩阵（目前只有一封 DirectMail 注册模板在 QQ 手机客户端真实到达）、数据库/Edge Function 完整回归、生产签名商店包，以及 MQTT/mTLS、真实 GATT/Wi-Fi 配网、Hosted OTA、机器人 bootloader 与 A/B/等价回滚、物理机器人、运动、路线、任务、召回与手动控制。
# 2026-10-29 G20 code33 控制会话修复候选

code32 电脑模拟器记录收到 141/141 条 WalkChecked，Disable 为 0；控制权多次退出，旧日志不足以确定具体触发原因。已确定原生桥 Promise 发布和忙状态所有权存在竞态，修复后保留取消代次及中断；输入仅对本地未派发的 busy 保留单槽最新目标，保留原始时间、150ms 期限、ACK、租约和停止保护。新增固定白名单诊断，不记录凭据或原始错误内容。针对性原生、会话/调度/控制页和传输测试通过，类型检查通过。

code33 正常构建一次完成，输入漂移 0；包名 com.doso.robot.qa、签名与 code32 一致，APK SHA256 `1feaa4644b717a3d7a26ed3b0a733e4bab959919a0f47abf3e6f9cf84dbc18e9`。已保留数据覆盖安装并验证设备包哈希、UID 和首次安装时间。电脑模拟器测试时 App 各发出一次 Enable 和 StandUp；6 秒慢拖收到 3 条零目标、全部接收后 Release 1，Disable 0。App 日志为 timeout、armed、序号 2；具体超时方法及原因未确认，慢拖不能代替快速推出保持，持续控制和 50Hz 均未通过。测试结束后停止 App 和模拟器，移除本次 USB 转发；真实机器人未操作。


## 2026-10-29 code44 屏幕圆盘直接控制

已构建并覆盖安装G20 code44。触屏去除“启用控制”手动步骤，新的触点准备控制，非零样本申请租约，申请前输入不重放；最后触点松开即中断/释放。运动期间状态来自WalkChecked回执，避免状态轮询竞争串行通道。运动超时只有在释放确认后保留状态连接，停止未确认仍失败关闭。保留原100ms/150ms、序号与租约保护。

211项相关测试及TypeScript通过；构建inputDrift=0，原签名、设备APK哈希、UID10173及首次安装时间核对一致。正常入口自动连接真实机器狗，显示52.1V及0.0m/s，触屏启用按钮已消失。尚未完成用户实际拖动和长期稳定性验收，不宣称掉线问题完全解决。证据：artifacts/release-readiness/20261029-touch-control-44/PLAN.md。机器人程序和电机状态未修改，实体输入滴声工作暂挂。

## 2026-10-29 code46 本地测试入口漏接修复（替代code44/45）

用户实测仍无法拖动后查明：DeviceTestScreen未传入新touchReady/onTouchBegin/onTouchEnd，而ControlScreen已经移除触屏启用按钮，使本地入口仍等待旧准备状态；code44/45对此入口验收不完整。现补齐该入口与阻止原因接线，普通App入口保持一致。正常松手发零且保留健康租约，取消/异常及未确认停止仍撤销保护。

226项相关测试及TypeScript通过。code46原签名覆盖安装，inputDrift=0，设备SHA c1772937d9db8e4f094ce3ef740a84d040a504c858bf393854c658b4d806599a，UID10173和首次安装时间保留。G20真实本地入口已显示“请先站立”。只读gRPC仍报告Grounded且电机已使能，与用户观察物理站姿存在不一致，已请用户站立后复测；不得宣称实机圆盘控制完成。证据：artifacts/release-readiness/20261029-touch-control-46/PLAN.md。

### code46 用户实机反馈补充（2026-10-29）
森哥明确确认“站立后圆盘能控制”，将本地入口站立后屏幕圆盘实机控制标为用户验证通过。松手归零、持续稳定性及断线停止不随此反馈一并宣告通过。随后一次电脑GetControlStatus只读请求3秒超时；G20近期缓冲日志出现连接阶段GetControlStatus超时/不可用。当前在线状态未确认，不能把连接阶段日志认作运动失败，也不能把此前成功当作长期可靠性结论。详情见artifacts/release-readiness/20261029-touch-control-46/PLAN.md。

## 2026-10-29 code47 候选：空闲触控租约保活（未安装）
用户反馈运动中持续中断。G20保留窗口记录11次WalkChecked约101–103ms超时、2次ReleaseControl超时、7次cancelled和1次unauthorized；用户确认当前机器人已关机/断网，当前不可达不算此前运动失败。取消日志的inputAge含错误处理时间，不足以确定JS卡顿。

本机用真实控制会话和300ms模拟租约复现code46松手后不续期、350ms后复用过期租约导致拒绝并关闭连接。补齐正常触屏松手后100ms零目标保活，取消/异常/动作/运动切换仍清除保活；不重放非零目标，不放宽任何截止或新鲜度限制。227项回归、TypeScript和租约对照通过。code47正常构建成功、inputDrift=0，原签名，SHA d2818513e02727901187611cd23da286d2b6c0e0942302cbd2d752847c309595。

安装时G20 USB设备9f2679cd已断开，ADB device not found；code47尚未安装，最后确认的设备版本仍code46。其余运动RPC超时/取消原因及新包实机表现待两端联调。证据与包：artifacts/release-readiness/20261029-motion-interruption-47/。

### code47 已安装（用户重新接回USB后）
覆盖安装成功，设备versionCode47，设备APK SHA256 d2818513e02727901187611cd23da286d2b6c0e0942302cbd2d752847c309595，UID10173与首次安装时间保留。正常入口已打开。G20 wlan0仍192.168.66.94，三次到192.168.66.64 ping均返回Destination Host Unreachable；这是当前网络可达性证据，不是运动RPC超时的定位。待用户确认机器狗重新开机联网后继续只读核对。未发送运动或使能。

### code47 网络已恢复并重新连接
机器狗旧IP192.168.66.64已恢复响应，MAC及SSH主机身份一致。brainstem.service PID1804 active/running、NRestarts0，仍为已核对正常程序SHA adb8c51b0174f1a15961b22e86a3b1e83bdf2c0e43c5e92863a6c23fac22dfff；启动日志实读租约300ms。PC30次只读gRPC全部成功，中位8.535ms、最大27.28ms；G20 20包ping全部成功，平均22.677ms、最大41.622ms。App之前5次重连耗尽，经返回前台触发只读重连，G20已显示已连接、当前电机失能。已请求用户短时现场控制对照，尚无新运动验收结果。SSH只读检查会话已收尾；未发送运动或使能。

## 2026-10-29 用户指定hip KD10现场调整
用户明确要求hip KD增至10，已解释并按当前平地Walking四个hip执行。用户先确认失能，gRPC实读Grounded/未使能/无租约后修改现场profile的inferKd下标0,3,6,9：6.93→10。JSON语义对比确认其他字段及其他关节未变；hip KP80，站立/坐下KP200/KD8均保持。备份在机器人/home/sunrise/doso_backups/20261029-hip-kd10/profile-before.json。

现场ProfileManager不热替换current及operator slot，故仅修改文件不足以应用；失能状态再次确认后重启brainstem.service一次，现PID11408 active/running、NRestarts0，gRPC恢复，GetProfile仍为flat_w5_model89999_kp80_policy_zero_20260929，GetControlStatus落地/未使能。配置SHA f87ec29fc1b6550b35bcb9eaa6e8ae17ec22133270da510449ae34efe7a1f2e2。服务二进制未修改。未重新使能或发动作，实际运动输出KD10及震荡改善尚未验收。证据：artifacts/release-readiness/20261029-app-robot-control-01/hip-kd10/。

## 2026-10-29 hip KP73 / KD6.93
用户反馈KD10后震荡加重，要求降低KD并指定KP73；明确按四hip行走KP80→73、KD10→原6.93执行，用户已确认失能。两次gRPC复核落地/失能/无租约后原子修改当前平地profile，仅inferKp/inferKd下标0,3,6,9共8个数值变化；其他关节、站立/坐下、模型、限位未改。原KD10文件备份于/home/sunrise/doso_backups/20261029-hip-kp73-kd693/profile-before.json。

因当前operator profile不热替换，重启brainstem.service一次，PID14032、active/running、NRestarts0；gRPC恢复、GetProfile仍flat_w5_model89999_kp80_policy_zero_20260929（策略ID保留历史名称，实际hip KP已73）。重启后再次确认落地/失能/无租约。配置SHA d19c76b817e95a2801fd47237050a53440ef5caaae57f417eee2344557ab0d00。未自动使能或执行动作，震荡改善待实测。证据：artifacts/release-readiness/20261029-app-robot-control-01/hip-kp73-kd693/。

## 2026-10-29 控制中断与圆盘只读排查

G20 当前只读确认安装 code47；本地 APK SHA256 d2818513e02727901187611cd23da286d2b6c0e0942302cbd2d752847c309595。设备日志再次出现 WalkChecked 约102–103ms grpc_deadline，直接触发保护；原因未能区分服务端、网络和调度。当前 G20 对机器狗 8 次 ping 全通、最大11.127ms，不代表运动时网络。现有圆盘仅可在圆内起触，短横屏尺寸还受可用高度限制，用户具体“难滑”症状待区分。当前工作树124项控制/圆盘定向测试通过，仅是本地证据，不代表当前安装包的长期实机控制通过。本轮未改变控制代码、超时、机器人或电机状态。详情见 artifacts/release-readiness/20261029-control-interruption-investigation/RESULT.md。

### 用户反馈追加
森哥确认圆盘按下不跟随并显示运动回执超时。新增圆盘视觉跟随与松手回中模拟回归，当前工作树125项相关测试通过，未复现设备触摸症状。G20到机器人短测曾有一次102.534ms，后续12次最大35.039ms；不能当作运动RPC根因或稳定性验收。需在断开实机运动链路的安全测试环境采集原生触摸事件和画面，同时对照服务端及网络。未修改控制门禁或机器人状态。证据见 artifacts/release-readiness/20261029-control-interruption-investigation/RESULT.md。

### 离线圆盘用户反馈
森哥反馈在失能或断电时圆盘能跟随；具体页面入口与连接状态未取证，不能推断所有禁用状态。G20当前到机器人IP 4次ping全通，无法据此判断电机状态。源码核对发现Android正常运动请求在前一ACK后至少间隔20ms，网络与处理延时会降低端到端发送频率；真实稳定50Hz仍未经实机验证。进一步排查须保持失联停止、服务端限速及租约保护。

### 同期只读采样
用户要求继续定位回执超时；已连接实际机器狗，brainstem.service PID1615、active、重启0，二进制SHA adb8c51b0174f1a15961b22e86a3b1e83bdf2c0e43c5e92863a6c23fac22dfff。只读状态为电机失能、无租约。同一空闲窗口G20→机器人16次最大36.8ms，PC状态gRPC 16次最大89.132ms，机器狗系统CPU空闲95–98%；均无错误。不同来源与协议不可直接相减，未复现运动超时，尚不能定位服务内部或无线根因。未修改控制程序、安装包或安全门槛。原始时间序列及服务采样见 artifacts/release-readiness/20261029-control-interruption-investigation/synchronized-idle-01/。

### 控制超时客户端诊断候选
原生控制在现有超时日志增加响应头和响应消息到达相对时间，不记录控制内容或凭据，也不调整截止和停止策略。ControlSession.kt SHA256 5e95b1c5d09eb2a365fa12f511b13f6b8bd1489dcb1b69dfc2f3ddd2ed2a7ca8；原生编译与3项本地套件、121项JS回归通过。候选未构建安装，G20仍code47；尚未证明根因修复或实机稳定。详情见 artifacts/release-readiness/20261029-control-interruption-investigation/RESULT.md。

## 2026-10-30 输入修复与独立热刷新开发包

新增并安装 DOSO Dev（com.doso.robot.dev，debuggable，保留 QA code47/UID10173）。开发包 SHA256 d134b029d4f5ff5c0ad611daeea11d5a9a5c6dfae6bac44e4c3211fa0efd99f4，构建输入无漂移、原调试签名。USB Metro 127.0.0.1:8084 真机加载及修改文字/恢复的 Fast Refresh 已验证，不需要重新安装 APK。Kotlin/SDK/原生权限变更仍需增量构建。

修复保存布局覆盖浮动圆盘、触屏状态被实体输入门禁重置；原始通道移到校准前方。控制订阅与 React 数字显示节流分开。实测发现原生新序号取代已排队事件导致 JS 拒收，以及观察看门狗先于通知执行；新增只读原生最新观察槽，以原生请求时间检查150ms年龄及会话归属。仅通道观察使用，不绕过校准，不变更运动截止/租约。

最终短测约11秒：原生533帧约48.6Hz，JS接纳184个不同样本16.76Hz，UI显示全部16通道，已停止读取。debug数据不代表QA性能或控制50Hz通过。24项JS输入/桥接、10项面板、111项圆盘/控制页/工具测试通过，42个原生生命周期用例及适配器编译通过，TypeScript通过。实体校准/按键/长期运动、guarded读取提示音及频率仍未完成；本轮未连接机器人、未使能或运动。清单与证据：artifacts/release-readiness/20261029-input-dev-loop/PLAN.md。

### 2026-10-30 G20 极简控制布局
按用户标注，底部去文字保留图标，模型/姿态入口移右上角，圆盘实测约505px。DOSO Dev已热刷新并实拍，109项回归及类型检查通过。QA code47未重建；没有发送机器人动作。证据见artifacts/release-readiness/20261029-input-dev-loop/icon-layout-final.png及PLAN.md。

### 2026-10-30 控制页底部空白
已删除SafeAreaView测量后再次减去隐藏导航栏固定高度的逻辑。实机47.843dp重复预留产生122px底部空白；修复后画布填满实际可用高度，底部图标保留16dp边距。G20实际点击y1098的诊断入口成功并返回，109项回归和TypeScript通过。DOSO Dev已热刷新，QA47未更新，未发送机器人指令。证据bottom-gap-final.png及input-dev-loop/PLAN.md。

### 2026-10-30 浅色控制页纯白
移除视频占位层硬编码灰色底，使用父页面主题背景；G20三个背景取样点均#FFFFFF。5项视频组件行为测试通过，DOSO Dev已热刷新，QA47未更新。进一步设计稿位于designs/control-console/index.html，A/B两种样式待评审，与当前App实现分别记录。

### 2026-10-30 C 刻度控制界面
按用户选择将 C 刻度圆盘接入横屏控制页，保留浮动触点、松手归零和原有控制保护；按住时显示输入幅度，底部保留图标、右上角提供模型/姿态与更多设置。更多菜单打开时撤销旧触屏输入并阻断其他动作，停止仍可用。修复菜单 Android 无障碍节点被顶部容器截断；修复后两个菜单入口均有有效坐标并在 G20 实际打开。G20 DOSO Dev 显示未连接，模式、姿态、布局、遥控器输入及诊断入口已检查，未读取实体输入或发送机器人动作。119 项相关测试及 TypeScript 通过，截图为 artifacts/release-readiness/20261029-input-dev-loop/c-final.png。QA code47 未重建或更新，Dev 依赖电脑 Metro。

稳定 50 Hz 下发、运动中断根因、实体摇杆校准及长期控制、真实断线停止和遥测新鲜度均未完成实机验收。UIAutomator 对底部控件的 bounds 仍被窗口底边截短，普通触摸诊断已验证，TalkBack 需另行核验。详见 input-dev-loop/PLAN.md。

### 2026-10-30 参考图圆盘与离线试用
按用户提供的参考图调整横屏圆盘材质：半透明底、蓝色上弧、浅色圆心及方向标，保留输入幅度显示。未连接时可本地试用屏幕圆盘，不调用运动、获取控制权或运动采样回调；连接状态变化会废弃旧触点，连接信息冲突时真实运动不开放。229 项相关回归及 TypeScript 通过。Metro Web Design QA 已展示真实组件且不连接后端；G20 当前未连接，原生显示及手感尚未实测，QA code47 未更新。实际图传背景对比度、真实控制和稳定 50 Hz 尚未验收。

### 2026-10-30 G20 横屏预览对齐
用户反馈电脑预览与 App 不同；已确认侧栏 734×936 导致组件切换到竖屏。新增本地横屏预览，使用同一控制页组件并将画布设为近似 G20 上次实测的 753×447 dp，窄侧栏及拖动归中已验证。预览隔离后端，不能代替 G20 原生画面及真实输入验收；当前 G20 USB 未连接，QA code47 未更新。详见 input-dev-loop/PLAN.md。

### 2026-10-31 参考图整体布局调整（本地源码）
按参考图将横屏控制页调整为视频与点云提示分区、顶部状态、悬浮双圆盘和右上软件停止入口；浅色占位保持纯白。未接入的点云明确提示，真实视频接入时暂以全宽显示。窄屏、大字号或实体遥控器入口下状态会分行。电脑隔离预览验证双圆盘拖动和回中、模式/设置/姿态入口；`test:control-ui`、99 项视频与控制会话及输入测试、TypeScript 通过。

G20 本轮未连接，原生画面、真实视频和点云对比度及实机控制未验证；QA code47 未重建。软件停止受原有状态门禁约束，不是硬件急停。本轮未修改机器人或运动控制参数。详见 artifacts/release-readiness/20261029-input-dev-loop/PLAN.md。

### 2026-10-31 16 关节状态与编号修正

App 源码增加四腿×四电机总览、逐项详情、已上报/在线/离线/已报故障统计及原始错误码；缺失、离线及未知来源不显示残留测量。机型图使用项目选定的静态素材并标明示意。G20 USB 已识别，独立 DOSO Dev 使用 8085 的设计验收入口、明确标注模拟数据；原生屏幕确认 16 个总览节点，详情滚动、异常码及单位显示可见，截图见 artifacts/release-readiness/20261031-joint-status/。没有请求机器狗、发送动作或更改 QA code47；该测试不证明真实遥测。

本地 Brainstem `thunder` 将硬件 `ListenJoint` 的 leg-major 编号转换为协议 Matrix4 索引，保留内部数据及控制行为；覆盖全部 16 个编号和越界，Dart 分析零 issue、相关 71 项测试通过。该修改没有部署或连接到机器狗。本地 `GetMotorStatus` 仅上报基础状态与部分原始错误；健康分级、事件历史、恢复状态、稳定错误码合同和目标/实际数据时间对齐仍待补齐。App 关节/UI/隔离验收与连接导航相关测试通过，TypeScript 通过；G20 的真实 16 关节数据及 50 Hz 控制不在本轮验收范围。

### 2026-10-31 四腿线图调整
关节状态页去掉机型图片，改用前方朝上的静态俯视线图，标明按机器人自身方向的四腿名称；保留16电机总览、详情与离线/故障区分。G20 DOSO Dev 的 8085 隔离 QA 预览使用模拟数据，截图为 artifacts/release-readiness/20261031-joint-status/g20-leg-diagram-qa.png；可滚动查看全部四腿及详情，首屏最后一行需下滑。关节、设备、隔离预览和连接布线测试 51 项通过，类型检查通过。QA code47 未重建；未连接或操作真实机器狗。

### 2026-10-31 关节状态页紧凑布局
按反馈压缩标题及空白，将四腿示意与16项状态合并为一张横屏面板，使用共享关节表头和较大状态字；保留逐关节详情及未知、离线、故障区分。G20 DOSO Dev 8085隔离预览实拍见 artifacts/release-readiness/20261031-joint-status/g20-compact-joint-qa.png，16个状态节点均在首屏；示例数据非真实遥测。相关51项测试和类型检查通过。QA code47未更新，本轮未连接或操作机器狗；窄屏和大字体未做实体设备验证。

### 2026-10-31 关节故障查看与系统栏
优化四腿线图，16个电机状态支持点击查看所选电机的状态、已上报测量和原始错误码，故障状态以文字及颜色突出；未上报的原因不作猜测。横屏关节页复用现有Android窗口接口隐藏底部导航，离开/后台/竖屏恢复；系统状态栏保留。G20 Dev 8085截图模式隐藏QA大横幅，页面及详情仍标注模拟数据：实拍 g20-fault-overview.png、g20-fault-detail.png；实测打开ID 3模拟故障并关闭返回总览。54项相关测试、typecheck和QA harness通过。未验证真实故障、错误码含义、实体竖屏及实际后台导航恢复；QA code47未更新。

### 2026-10-31 Thunder V4 关节页模型线稿
左侧使用Thunder V4 MJCF/STL的名义站姿正交俯视可见轮廓，前朝上、机器人自身左侧在画面左边；为静态图而非实时姿态，也不包含robostl近期V078/R06头壳迭代。THUNDER机型和本地测试/隔离QA使用线稿，其他机型保留通用示意。G20 Dev模拟预览实拍 g20-v4-model-qa.png，实测16项表格完整、模拟故障详情可打开。56项相关测试、typecheck、QA harness通过。源模型再分发许可未明确；QA code47未更新，真实机器人数据未验证。

### 2026-11-01 App WHEP 接收候选（未装包）
新增 react-native-webrtc@155.0.1 的 WHEP 只读接收、SDP 协商、实际解码帧推进检查、冻结撤图、退避重连、后台与切设备资源释放；明确选择的 LingTu origin 只在当前直连目标与网关同主机且选择代次一致时接到控制页，本地设备测试入口也支持显式关联。该同主机关联不代表设备身份认证；不同主机的分体部署暂不支持。设计QA不连接网络。124项定向测试与TypeScript通过；Expo autolinking识别WebRTCModulePackage，单独Android模块compileDebugJavaWithJavac成功，未构建完整APK。G20 USB设备未连接，未安装、未验证真实WHEP/相机/RTCView与解码帧率；现场网关鉴权/TLS尚未确认。原生org.jitsi:webrtc使用上游155.+动态版本，需在正式出包前固定并复验。没有操作机器人或发送控制。

### 2026-11-01 Camera delivery / read-only video candidate
LingTu local source adds device camera/video overrides, consolidated read-only diagnostics and an opt-in shared live-viewer Bearer guard. DOSO App source adds in-memory HTTPS-only viewer credentials, authorization failure feedback, and a separate video-only local test entry with no motion control; Android WebRTC resolves to 155.0.1 through a config plugin. The shared token is not per-App identity, cannot immediately revoke an established peer, does not cover recordings, and needs verified TLS and client/compatibility work. On 2026-11-13 the Sunrise Orbbec edge video Gateway and Go2RTC sidecar were deployed; the G20 Debug APK was built but not installed because this workstation has no adb/platform-tools. NX and the formal Brainstem control Gateway remain outside this deployment.
On Go2/NX .97, a bounded D435i capture succeeded (five frame sets, discarded); an isolated real camera/SHM/x264/WHEP readiness smoke observed fresh sequences 1,34,65 and local OPTIONS 200, with no SDP/viewer or image saved. Processes and temporary SHM were removed, managed camera/video/host remained inactive. This proves source/pipeline readiness for the sampled configuration, not decoded G20 video, latency, auth, long-term stability or motion readiness. See D:/inovxio/brain/lingtu/build/camera-video-smoke-20261101/RESULTS.md.

Go2/NX additional isolated tests: real D435i → SHM → x264 H.264 → local FFmpeg null decoded 103 frames with exit 0; no picture was saved or sent over a network. A later loopback-only Firefox 110 WHEP probe did not obtain an SDP answer or decoded frames; browser offered no H.264 and the isolated namespace supplied no ICE candidate, and its local proxy 502 is not attributed to upstream. All temporary processes/resources were removed, and the managed camera/video/host services remained inactive. See D:/inovxio/brain/lingtu/build/camera-video-smoke-20261101/RESULTS.md.

### 2026-11-01 Go2/NX → G20 video acceptance and scoped release candidate
NX compiled the shared RecordWriter/RealSense capture candidate and verified D435i → existing .97 bridge → x264. A bounded LAN WHEP run reached G20 Chrome: H.264 553 frames decoded, 549 presented in 30 seconds; the session was deleted and the server consumer count returned to zero. Browser timer binding was fixed in the Web adapter and covered by regression tests. This browser count is not a native App measurement.

The separate `com.doso.robot.videotest` APK was built and installed without replacing Dev or QA. With the real NX camera and isolated Gateway it reported `receiving` only after native decoded-frame progression and mounted a nonzero RTCView. The 60-second timeout and a separate background/return check removed the view; NX recorded two POST 201 / DELETE 200 pairs and consumers returned to zero. No native frame count or picture was retained. Temporary processes, listeners and SHM were cleaned. Evidence: artifacts/release-readiness/20261101-native-video-test-build-jbr21/RESULTS.md and D:/inovxio/brain/lingtu/build/nx-camera-adapter-20261101/RESULTS.md.

An isolated `.97`-based, camera-scoped NX release candidate passed the standard installer dry-run; only RealSense capture differs in the native artifact manifest. It is not activated: `/opt` installation requires NX administrator access. The installed current release remains `.97`; the test Gateway is not a production Product and no persistent video service was started. Normal control-page playback, long-term stability, network recovery, production HTTPS/viewer authorization and actual release activation remain unverified. See D:/inovxio/brain/lingtu/build/nx-camera-adapter-20261101/release-candidate/README.md.

### 2026-11-02 正式 App 视频入口与关节页候选
正式连接中心增加明确标示来源的“仅查看视频（不控制）”，复用已在 G20 独立原生测试中使用的接收器；跨设备观看不绑定机器人控制目标，控制页原有同主机关联仍保留。共享关节页同步最新右侧预览：运行圆点保留无障碍文字，异常显示状态与详情入口，全部详情可折叠；左侧机器狗线图不变。视频及接线 122 项、关节页与连接联动 51 项及 TypeScript 通过。未在正式 App 包或真实视频源上验证。

独立 `com.doso.robot.localtest` 完整 App 无云验收变体和精确 debug 身份门禁已实现；现有 QA/Dev 合同保留，25 项构建合同测试及原生门禁测试通过。尚未构建或安装：最近可用内存低于 4 GiB 门槛。Go2/NX 本轮连接超时，用户确认暂时未开机或未联网；没有重复尝试或请求机器人动作。完整账号服务、正式控制页播放及生产发布仍待验证。

### 2026-11-04 控制权分工与对标规划
在现有 Brainstem 对接清单补充机器狗端三种控制权状态、App 内两种输入来源、双端职责、对标能力优先级和验收顺序。核对会议版 v2 共 16 页：已有整机概览与能力对照，但未包含本次逐项分工清单；未修改 PPT。仅源码和 PPT 文本核查，未连接机器狗、验证 G20 安装包或发送动作；实际部署、双客户端互斥及稳定控制仍待现场验证。

### 2026-11-04 控制来源展示候选
App 控制会话按新鲜的 Brainstem owner、租约与本机会话匹配结果派生控制来源，横屏标题及竖屏状态区展示本设备、远程端、机器人侧遥控、无人控制或未知；不显示其他客户端身份。新增状态投影及页面行为回归，未变更运动、仲裁、租约或停止路径。源码候选未构建安装；未核对当前机器狗部署、G20 原生布局和多客户端实机互斥。

### 2026-11-04 控制来源复核与互斥验证准备
上轮最终 TypeScript 检查退出码 0；补充 App 投影反例测试，服务端 owner 与租约状态不一致时显示未知，定向 1 项通过。检查本地 Brainstem 仲裁与 LAN 开发测试覆盖，尝试运行相关 Dart 测试，但 Windows Flutter 启动器缺失引擎信息，仓库未发现本机 Dart 包配置；WSL 未发现独立 Dart SDK，因此测试未运行，不能记为通过。D:/Android/sdk/platform-tools/adb.exe 当前未列出设备；未构建、安装、访问机器人或发送指令。下一步恢复可用 Dart SDK/依赖或使用现成已配置环境，完成互斥测试，再进行 G20 与真实部署只读核验。

### 2026-11-04 Brainstem 本地控制权互斥测试
使用独立官方 Dart SDK 3.10.1（保存在 Brainstem 的 .local-test-sdk-3.10.1，未覆盖 Flutter），复用工作区依赖，运行 control_arbiter_test.dart 与 grpc_lan_development_test.dart 首轮 29 项通过。新增 mock 服务端双客户端用例：第二客户端申请被拒、不能用第一客户端 token 释放，第一客户端释放后第二客户端可申请；该用例通过。随后与 control_lease_test.dart 联合执行时，该互斥用例通过，但现有 h2c 监听器用例在 HTTP/2 连接关闭时断言失败，整轮失败；单独重跑监听器 1 项通过，原因尚未确定。另单独运行服务端已有重复申请与 YUNZHUO 抢占用例，2 项通过。不要把这些结果相加为正式整机通过数。
源码 SHA256：control_arbiter 47cb7c7788d4017ef005ffd3ad57012bee1ecbdd0d27e1acd6e3cdd0e2feff14；control_lease f2db429d36e1df54c32fac2995fb238776f27d66e795fb2494d3a6226f33db1e；unified_cms_server d3a13de95bbb6e8d2a42e022897f0bdd0107e3bd8fbf51a2e9afda0196cdaef9；新增测试文件 bbe2378602192de05dcdd8fdca7ef359109fad9c04e5d0164db5440161e86c24。仅本地 mock/loopback，未连接机器狗或 G20，未证明现场部署一致、真实停止、网络稳定或控制性能。需继续查 HTTP/2 偶发断言并在现场核对版本与多客户端行为。

### 2026-11-04 HTTP/2 断言排查与隔离候选
独立测试基线连续 6 次运行 grpc_lan_development_test.dart 与 control_lease_test.dart 均通过，没有复现此前失败；历史一次联合运行失败仍保留。核对锁定 grpc 5.1.0/http2 2.3.1：grpc 的拒绝分支在暂停请求订阅后调用 _sinkIncoming，但该函数不恢复订阅；Dart HTTP/2 上游 issue 2021 记录同一断言和未排空流的可能路径。与本次现象高度吻合，但现场失败尚未稳定复现，不能断言根因已经证实。
隔离候选仅在 .local-test-sdk-3.10.1/grpc-candidate 的 _sinkIncoming 中对暂停订阅执行 resume；原缓存、工作区生产依赖、锁文件与部署均未更改。通过 Isolate.resolvePackageUri 核对测试加载候选，并以候选配置运行 grpc_lan_development_test.dart 连续 6 次通过；原版 handler SHA256 01230f67ff88de3797848aa7bca32c63e4dab8e17c29aff17bb9ae25ddfb9ab1，候选 78c7b35bfb6b76c6d51dde2cf788f77a81d3a6c58d100ceb06fb339704d68ff2。由于基线也未复现，候选不是修复完成证据；需构造可重复拒绝及关闭时序的回归，检查其他错误/流式场景，再决定生产依赖变更。每轮输出保存在该临时目录 before-1..6.log 和 candidate-1..6.log。
当次 192.168.66.64 的 SSH 22 和 Brainstem 13145 均不可达，未能核对真实部署版本；未向机器狗发送控制或改动服务。请恢复机器狗开机和网络后再进行只读版本核验。

### 2026-11-04 Brainstem gRPC 拒绝请求排空修复（本地候选）
构造可控服务端传输测试：拦截器先返回 permissionDenied，客户端随后结束输入流。原 grpc 5.1.0 订阅仍暂停，测试失败；隔离补丁恢复暂停订阅，回归通过。该测试验证确定的流排空缺陷，但不是对历史 HTTP/2 队列断言的直接重现，不能据此宣称所有连接终止竞态已消失。
Brainstem 本地工作区加入 vendor/grpc 5.1.0（保留上游许可证，仅 _sinkIncoming 加暂停状态检查及 resume），根 pubspec 用路径覆盖，Dockerfile.sim 复制该目录；thunder 增加 http2 测试依赖和 grpc_rejection_drain_test.dart。原缓存未改，离线重新解析后锁文件与原版仅 grpc 来源条目变化。拒绝回归、LAN、仲裁、租约联合 33 项通过；unified_cms_server 48 项通过；TLS 与拒绝回归 2 项通过；受影响两份测试静态分析零问题。数目不累加为正式整机通过数。修复 handler SHA256 78c7b35bfb6b76c6d51dde2cf788f77a81d3a6c58d100ceb06fb339704d68ff2，回归测试 SHA256 5950b5c6d1d8ae570e505d9d1f304ea2a6f1e046ca218b4a4ece907fa1e86e3f，根 pubspec SHA256 a8750d4dee6bf4bd57fc87b8026fcb818b0fe0805400f49d4f5e32ec971cd0ae。Docker 镜像及机器狗二进制未构建或部署；需验证生产拒绝/流式与异常关闭下的稳定性及上游替代方案。
本轮 192.168.66.64 的 22、13145 端口仍不可达，未读取当前部署版本；未发送机器人运动指令。

### 2026-11-04 HTTP/2 回环压力及 Brainstem 远端核对
新增长连接拒绝后延迟结束输入并正常关闭，以及拒绝后立即强制断开两个本机 HTTP/2 回环测试；在补丁版本上，前者 5 轮各 20 次、后者 3 轮各 20 次通过，定向联合仲裁/租约/LAN 测试 35 项通过，测试文件静态分析零 issue。更早一版测试以客户端 finish 后立即 socket.destroy 的清理顺序运行 5 轮：前 4 轮通过，第 5 轮服务端 shutdown 在 5 秒后超时（证据 .local-test-sdk-3.10.1/http2-close-5.log）；该超时仍未确定属于应用、依赖或测试清理竞态，不能因后续其他方式通过而视为解决。以上仅回环与 mock，不证明生产网络稳定。
本地 Git HEAD 5269881（2026-08-12），只读 ls-remote 核对远端 master 为 1470a9cc3238ce3e223d69877f35859bdd2ff12a；本地基点较该远端落后 4 个提交、独有 2 个提交。工作区有大量未提交修改，不能仅据提交数判断有效代码版本。只读比较发现远端包含 RS02 轮电机配置和压缩反馈三相电流故障修复，本地当前 motor_config.dart 不存在、error.dart 位 17 映射不同；控制相关修复是否已由其他方式实现和实机适配尚需逐项审查。未 fetch/merge/reset，未改机器人。机器人 192.168.66.64 的 22/13145 端口不可达，当前部署身份未核对。

### 2026-11-04 App 控制来源朗读
控制页横屏设备连接区域的无障碍标签现在包含同一控制来源文字，避免 TalkBack 只读连接状态；沿用现有新鲜度与租约派生结果，不改控制门禁或运动路径。控制页与会话联合测试 167 项通过；G20 未被 ADB 检测，未做 TalkBack 实机验证、构建或安装。源码和测试哈希以本轮记录为准，正式控制与发布结论不变。
ControlScreen.tsx SHA256 093f9d49cafa7b07a65fd88485aa017c01c37ea249762b1eafcd9738e43f4404；control-screen-interaction.test.mjs SHA256 98f3c55da9e9e8bbafbcea0aad70fb1252f549df6f09416dc78129baded8c0f5。
本轮最终 npm run typecheck 退出码 0。

### 2026-11-04 App 控制来源一致性与本地链路
修复控制来源显示：机器人来源与租约状态矛盾、无服务端租约但本机会话仍声称持有、或本地持有租约但归属未匹配时显示未知；不改变控制门禁、运动指令或停止路径。App 控制会话/调度/页面本地测试 183 项通过，传输/恢复/模拟会话 47 项通过，typecheck 退出码 0。上述模拟与单元测试不能证明 Android 原生、真实网络或 50 Hz；原生桥接组合测试有 2 项子进程超时失败，部分原生生命周期用例输出通过，须资源恢复后单独重跑，不将失败归因认定为内存。
本轮 ADB 未检测到 G20，系统可用内存低于项目构建 4 GiB 门槛；没有启动 Gradle、没有新 APK 或安装。用户要求先调整本地链路，设备与资源恢复后再完成原生验证、正常构建、核对签名及保数据覆盖升级。未发送机器狗动作。
brainstemControlSession.ts SHA256 5beec2d4467954bae103879c708d129f1c4027f32a3dcb0e63933f21e8fb5b11；brainstem-control-session.test.mjs SHA256 0d200de23590b2a8001ec7a1f4ea77879145da53e0325ae4c539c5a74be77c00。

### 2026-11-05 控制页毛玻璃与文案精简（本地源码）

横屏控制页加入共享毛玻璃材质，统一设备状态、遥测及菜单；删除未接入点云占位和重复说明，普通 G20 尺寸使用单行顶部布局，避免挤小圆盘。竖屏重复状态与动作不可用原因收进详情，仍直接显示已知姿态、电机状态、执行进度、失败和超时。圆盘、急停、电机开关、确认及运动保护调用保持原有语义。

expo-blur 锁定安装为 57.0.3（依赖范围 ~57.0.2）。Android API 31+ 使用高效模糊路径，旧系统/缺少原生模块的已装 APK 回退半透明；iOS 减少透明度设置使用不透明材质。129 项定向行为测试、TypeScript 与控制页源合同检查通过；753×447、844×390 横屏及390×844竖屏 Web截图已检查，模式/设置菜单打开和顶部边界自动核验通过。材质测试背景明确标注非图传。

证据及源码哈希：artifacts/ui-refresh/20261105-control-glass/README.md、source-hashes.json。本轮未构建或安装新 APK、未连接机器人；G20 原生画面、真实视频模糊兼容性与性能未验证，不能用本轮 UI 测试证明稳定 50 Hz。历史实机控制与发布结论不变。

### 2026-11-05 毛玻璃控制页版式纠偏（本地源码）

用户指出排版与参考不符；恢复连续顶部工具栏和底部动作组，统一16dp外距、8dp组内间距及工具按钮中心线，诊断按钮与底部动作组对齐。默认圆盘移至下方左右操作区；保留布局滑条及已存配置，不重写用户数据。反馈在两圆盘之间浮动，不再横跨整个操作区；输入区域不会因反馈出现而变动。

129项相关回归、TypeScript、控制源合同检查通过。753×447与844×390浏览器几何检查覆盖顶部越界/重叠、默认圆盘对称与按钮避让、动作组居中、诊断中心线；浅深色及菜单截图已检查。证据：artifacts/ui-refresh/20261105-control-spacing/README.md。仅默认布局完成上述几何验收；未装G20、未操作机器人，实机效果及用户最终视觉验收仍待完成。

### 2026-11-05 参考图风格迁移（横屏控制页源码）

依据用户新提供的能源仪表盘参考，控制页采用近白底、白色半透明面板、深浅对比速度块；统一12dp工具栏内距，28/16dp嵌套圆角，24dp读数、18dp设备名、14dp标签/单位。保留DOSO蓝色、现有圆盘布局与控制语义，未加入参考图中的能源业务、装饰摄影或虚构遥测。

129项定向回归、TypeScript、源合同检查通过；IAB验证浅/深横屏、短横屏、竖屏、模式和布局菜单，753px顶部边界无越界重叠，未捕获浏览器console error。最后仅将文字最小缩放调至0.86以保持单位至少12dp。证据：artifacts/ui-refresh/20261105-control-reference-style/README.md及evidence.json；根design-qa.md记录本轮样式对照。尚未构建/安装G20或验证真实视频、机器人控制，网页样式通过不代表用户审美已确认或原生验收完成。

### 2026-11-05 账号全面迁移前核对（未迁移）

森哥要求保留旧账号并全面迁往阿里云。G20 ADB在线，QA实际code47；电脑及G20当次对新域名与旧Supabase认证健康路径均完成可信HTTPS并收到无凭证401，新会话函数公网无凭证401且响应含Envoy上游时序；不证明真实登录、资料或设备绑定通过。上海实例控制台显示运行中，Workbench旧会话过期，控制台远程连接操作工具超时；本机既有SSH密钥被拒，当前无旧Supabase管理连接，未取得双方账号基线、备份或迁移数据。

客户端按主机名区分会话存储，原生持久保存并按前后台管理续期；切换后旧服务令牌不能假设适用于新服务，通常首次需重新登录。104项会话恢复/操作与构建配置测试通过；首跑103/104因App新增localUseMode而旧测试夹具缺少变量，补齐夹具后104/104，产品逻辑未改。新环境构建脚本目标域名已配置，但本轮未取得并核对该部署的公开客户端密钥，未构建或安装。完整状态及后续顺序见artifacts/release-readiness/20261105-account-migration-preflight/README.md；旧账号、资料和设备关系仍待安全迁移与端到端验收。

### 2026-11-05 森哥决定新账号从零开始

用户明确不迁旧账号/数据；保留原Supabase和已存在的上海测试账号，不执行清库。更新国内后端部署文档，迁移旧账号步骤仅留历史。核对到较新的11月4日证据：上海可信HTTPS、11层服务模型及账户/设备API已发布，旧“仅十层/备案403”是历史状态。本机新环境公开配置完成严格TLS只读验证：Auth health/settings 200，REST不存在表404/PGRST205；不证明真实注册登录。

首次新QA构建在环境校验阶段失败、Gradle启动0、锁清理成功：文档中的protoc路径失效。已核对Scoop protobuf34.0的真实编译器；随后可用内存低于4GiB门槛，等待释放资源再以新目录执行正常构建。G20仍为code47，未安装、未修改原数据或云账号；真实注册、邮箱码、登录、资料、重开和退出尚未验收。参见artifacts/release-readiness/20261105-account-migration-preflight/README.md与20261105-domestic-fresh-build-01/build-result.json。

路径修正后新目录第二次正式资源门测得4,030,248 KiB，低于4,194,304 KiB；buildStarts0、inputDrift0、锁清理成功，未启动Gradle。构建配置/资源/启动器24项测试通过。等待用户释放资源后用新目录正常构建，不复用旧尝试。证据20261105-domestic-fresh-build-02/build-result.json。

### 2026-11-05 国内账号实施续查

用户要求按计划从新账号开始，保留旧数据。G20连接，使用正常TLS和当前国内公开客户端配置访问新Auth health实际200；密钥经stdin传递且不输出，不含用户登录。电脑同配置的Auth health/settings 200，REST不存在表探针404/PGRST205。此项证明当前两个设备可到达公开服务，不证明注册、资料、会话或重开成功。账号恢复/原生续期与构建守卫关联47项测试通过；另恢复页面4项通过。机器狗13145 TCP本机可达，仅网络探测，不申请租约或发送动作。

本轮电脑最新可用内存3,554,516 KiB，低于4GiB；未启动新Gradle、未安装新包。等待用户释放内存后按新证据目录构建并核验签名、配置及数据保留，再在G20进行真实注册/验证码/登录/重启/退出和网络恢复。EAS生产环境、服务器备份恢复演练和真实设备控制均未完成。G20探测工具保存在20261105-account-migration-preflight/probe-g20-public.mjs。

### 2026-11-05 复用G20已有开发包热刷新

按森哥要求优先热加载：G20已装独立 `com.doso.robot.dev` code47（2026-10-30更新），曾在同设备验证Fast Refresh；本轮未重建或覆盖。开发Metro使用当前阿里云公开配置，正常资源门实测4,233,140 KiB，已启动8084；G20通过USB reverse访问 `/status` 返回 `packager-status:running`。启动证据 `artifacts/release-readiness/20261105-domestic-dev-metro-01/`。当前G20前台是独立 localtest，未切换或强停以免打断用户；本轮尚未在Dev中加载bundle或确认真实登录。

开发包可热刷新JS/样式；新增原生模块、原生代码、权限等需要重建开发包。当前毛玻璃有旧包无ExpoBlur模块的半透明回退，不假称原生模糊已就绪；其他新原生模块需实际核对。Metro依赖电脑及USB，重启会话与真实运动尚未验收；独立QA仍需后续构建及保数据安装。

### 2026-11-05 姿态菜单源码接入

横屏控制页增加姿态菜单，站立、坐下复用现有控制操作和设备状态反馈；摔倒恢复保留禁用入口，地形模式独立。打开菜单时撤销旧输入，软件停止和实体停止路径保留。控制界面、动作状态与摇杆相关测试 127 项通过，类型检查及界面源码契约检查通过；隔离 Web 预览核对姿态及地形菜单，截图见 artifacts/ui-refresh/20261105-posture-menu/posture-menu.jpg。此次未更新 G20 安装包，也未对当前 Brainstem 或真机发送动作，不能以本地测试认定真机控制通过。

### 2026-11-05 设置页参考图接入进度与停止键纠正

按参考图开始调整设置入口：接入现有圆盘布局、遥控器输入、设备连接和电机诊断，尚非参考图的 1:1 完成版。视频流、录像、视频清晰度、音频、速度限制等功能未接入，不伪造开关。REA 静态分析控制页源码，覆盖范围有限，不能证明运行行为。新增测试发现上一条关于姿态菜单实体停止测试已通过的记录不准确：打开菜单瞬间停止输入会被拦截；已修复并补充回归测试。控制相关 129 项测试、类型检查及界面源码检查通过；仅完成隔离 Web 预览，尚未在 G20 和机器狗实测。

### 2026-11-05 按两张参考图重做横屏控制与设置

替换白色顶栏及小设置弹窗，改为全屏媒体背景、居中设备状态、左右毛玻璃圆盘、四个姿态位置和六块设置面板。站立/坐下沿用原操作链路，电机、地形、控制权和诊断通过设置进入；未实现动作与设置保持禁用。新增隔离设计预览，示例状态及重建背景仅用于视觉验收，不注入生产。控制相关130项测试、类型检查和设计验收入口检查通过；浏览器确认关闭设置不触发动作。未构建、未升级G20、未发真机指令，原生毛玻璃及性能未实机验收。证据 artifacts/ui-refresh/20261105-reference-replica/README.md。

### 2026-11-06 控制相关设置页延伸

设备连接、圆盘布局、G20输入页统一深色半透明配色与间距；默认IP192.168.66.64、原有连接/取消/过期及校准/布局保存逻辑保留。横屏六个布局滑条分左右两列，输入页优先四轴数据，16路原始通道按8列排列。新增设计连接预览隔离保护，不连接真实设备、不取消原生配对。相关194项测试及类型检查通过，末次G20/布局排版调整12项定向测试通过。浏览器已验证滑条调整后重开编辑器保留数值；没有G20原生或真机控制验收。证据 artifacts/ui-refresh/20261106-control-setup/README.md。仍不声称像素级1:1或所有设备功能已接入。

### 2026-11-06 修正设置子页的毛玻璃风格偏差

用户明确要求参考图的透景毛玻璃，而非纯深蓝底。废弃上一轮设置子页渐变底方案，连接页、圆盘布局及G20输入页共用玻璃材质与DOSO顶栏；控制中心打开的布局/输入页传递现有视频呈现及中断回调，生产连接页不凭空启动视频。无画面时明确显示无实时画面；示例风景仅在隔离设计预览中传入。新增布局编辑页急停与顶栏返回保存回归，其他动作的编辑门禁保留。183项相关测试、类型检查、控制源码契约及设计隔离检查通过。G20尺寸Web截图在artifacts/ui-refresh/20261106-glass-continuity/，尚未安装或实测原生模糊/真机控制。

### 2026-11-06 去除预览条并调整控制页字体与动效

按用户要求移除黄色静态预览条，保留显式设计入口、隔离回调、无障碍预览标识及浏览器标题。控制相关标题/正文改用MiSans实际中等/常规字重，数字使用等宽排版设置；小屏收起重复说明。设置、分类内容、姿态/地形菜单及设置子页增加180ms透明度与6px位移进入动效，关闭即时，急停和摇杆处理不等待动画；支持减少动态效果并清理退出后的异步结果。177项相关测试、类型检查、控制/设计隔离检查通过，浏览器确认全屏无黄条与实际字体。证据artifacts/ui-refresh/20261106-control-motion-type/。保留localhost:8103交互预览供查看动效；未升级G20或发送真机指令。

### 2026-11-06 控制设置八页统一设计

按用户参考图生成通用、操控、视频、音频、网络、机器人、安全、关于八个独立页面，移除分类间重复总览，统一玻璃卡片、MiSans、间距与180ms切页动效。连接/布局/输入/模式/姿态/诊断复用原入口；网络页分别展示机器人端控制者与App输入来源，G20显式租约操作和触屏按需请求语义保留。未知能力保持禁用。修复模式选择/待确认状态误禁用软件急停：撤销未提交意图后仍调用原授权与停止路径，不修改服务端协议或并发约束。

八页分别导出1280×720和753×447两组共16张图，默认字体下紧凑尺寸均一页显示、完整关闭区域可达；详细规划在docs/design/CONTROL_SETTINGS_SUITE_20261106.md。126项相关测试、4项QA请求测试、类型检查和源码检查通过。证据在artifacts/ui-refresh/20261106-settings-suite/，包含画册、并排参考、布局数据和源文件指纹。浏览器交互为隔离夹具，没有构建APK、覆盖G20或向真机发送指令；全产品/原生/硬件验收状态不由这次设计验收覆盖。
