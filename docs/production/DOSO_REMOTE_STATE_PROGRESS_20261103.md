# 远程状态实现与本地验收

## 2026-11-08 当前核对

2026-11-07已使用正常账号、已登记模拟库存、实际DOSO Web App和真实业务数据库完成状态流程：正常API绑定、开启、离开页面后后台继续续期、断网恢复和关闭停采。正式Rust机器狗端程序使用模拟Brainstem，本机TLS MQTT经公网SSH隧道接ECS隔离Gateway。该轮不是机器狗、G20、手机摄像头扫码、独立公网MQTT或5G验收，详见 [SIMULATED_FLOW.md](D:/DOSO/robot-cloud/docs/SIMULATED_FLOW.md)。

关闭后状态读取已停止，但联系/同步时间仍可变化；完全断云尚未完成。机器狗端已有持久化选择文件读取及本地关闭后退出的代码，还缺可信的本地开启/重新开启入口，以及远程明确关闭后持久化关闭并断连的完整接线。当前云端进度与下一阶段以 [PROGRESS.md](D:/DOSO/robot-cloud/PROGRESS.md) 为准，测试记录统一见 [TESTING.md](D:/DOSO/robot-cloud/TESTING.md)。下面按日期保留原验证记录。

## 2026-11-04：云连接开关进度

当前 App 的远程状态开关控制云端状态采集，不控制狗端 MQTT 连接。云连接服务运行时，状态关闭后仍可能发送设备标识和联系时间；界面说明已更新，避免把停采显示成断网。App 组件与服务的 20 项检查及 TypeScript 静态检查通过，网络与界面环境是测试替身；尚未在真实账号或 G20 上验收此文案。

用户已选择完全断网，规则列入 `D:/DOSO/robot-cloud/CONTRACT.md`：默认不连接；用户经本地授权后开启；关闭时停采、保存选择并断开；断网保留开启选择。云端收到停采确认不等于已确认设备断网，设备不可达时必须显示待确认。完全断开后需通过授权的本地入口重新开启。

当时尚缺本地授权入口、持久化选择与服务启停的接线。后续已实现选择文件读取与本地关闭退出，可信写入、重新开启和远程持久化断云仍缺失。签名单次查询的许可限制及其发布范围应按具体部署记录核对；本段不判断2026-11-08线上二进制版本。尚无真实机器狗完成该流程的验收记录。

本轮 Windows 公网只读探测：`https://api-test.dosorobotics.com/functions/v1/remote-state` TLS 验证通过、无凭据返回 401；`8.153.169.177:8883` TCP 可达。这些结果不证明设备认证、MQTT 通信或状态上报成功。

同日后续更新：按森哥要求移除验收工具的逐文件源码哈希、复核失效及重渲染入口，保留执行时间、范围、退出结果和日志。地图文件完整性与设备身份/签名校验不变。多设备修复和真实线上检查见[多设备与实际服务进度](DOSO_MULTI_DEVICE_PROGRESS_20261103.md)；下方早期测试记录保留当时范围。

2026-11-03。App、业务接口、PostgreSQL已实现本地候选；未部署、未安装到机器狗、未进行5G验收。用户每设备默认关闭；主动开启一次后，由业务后端与Gateway自动处理许可和续期，不要求App保持打开。地图与视频权限独立。

## 用户现在得到什么

| 使用过程 | 已实现行为 | 负责位置 |
| --- | --- | --- |
| 进入已绑定实体设备的个人页 | 显示远程状态面板，读取当前用户的选择 | `App.tsx`、`src/screens/ProfileScreen.tsx`、`src/components/RemoteStatePanel.tsx` |
| 主动开启 | 保存选择，显示等待设备确认；收到有效ACK后才显示已开启 | App服务、用户handler、PG事务、Rust Gateway/Agent |
| 持续使用 | App前台已开启时每秒读，未开启或设置未知时每4秒；后台每2秒同步，当前完整许可ACK满足条件才续到30秒 | `remote-state-sync`、PG、Rust自动同步循环 |
| 退出App或设备重连 | App退出保留选择；后台负责后续许可与恢复，不让用户手动续租 | App生命周期与后台同步 |
| 查看状态 | 实际运行姿态、切换、控制来源、电机输出及严重故障；显示原始采集时间 | 状态面板、业务状态投影 |
| 网络异常或数据变旧 | 显示过期/读取失败；保留上次成功状态的原始时间，不能冒充实时 | App与PG状态投影 |
| 主动关闭 | 关闭事务立即拒收旧状态，页面区分云端停收和设备确认停止 | 用户handler、PG、Gateway/Agent |

本批合同没有电量来源，面板不编造电量。关闭时不继续向用户呈现新在线信息。用户历史状态的保留/删除是单独规则；当前关闭不隐式删除历史成功状态。设备绑定是否支持多台取决于现有账号/设备流程，不能仅凭同步批量接口判断。

## 查看界面与测试流程

打开[本地验收看板](../../artifacts/cloud-acceptance/index.html)，查看“功能与链路”“测试流程”“工程目录”。它是工程验收界面，显示实际测试记录，不连接或展示真实设备实时状态。App内产品界面已接线，但本轮没有原生安装包和视觉验收。

从App仓库运行：

```powershell
node tools/cloud-acceptance/run.mjs
```

固定顺序执行9项检查，保存独立结果/日志。测试代码在原项目目录；页面不复制后端逻辑、不执行点击复制的命令。报告只代表对应时间和范围的执行结果。目录规范见[运行说明](../../tools/cloud-acceptance/README.md)。

## 已完成的验证

统一运行：`2026-11-03T07-34-58-941Z-cf165241`，北京时间15:37:25完成。9项全部通过，关键源码哈希一致；2026-11-03恢复任务时再次逐文件核对无变化，日志完整。两个隔离PG实例均确认停止。

| 验证 | 实际结果 | 边界 |
| --- | --- | --- |
| App远程状态服务、面板、个人页接线 | 21/21 | 执行实际处理逻辑，模拟网络与React Native环境；不是原生布局验收 |
| 用户与后台同步handler | 21/21 | 实际handler，合成认证与RPC；边界/时间/消息校验 |
| PostgreSQL远程状态迁移 | 7/7组 | 真实PG权限、事务、行锁；合成账号、会话与设备观察 |
| App TypeScript | 通过 | 全App静态调用检查 |
| 三个Edge入口类型 | 通过 | 地图、用户状态、后台同步入口 |
| 既有地图回归 | App17项、PG5组、handler16项、SDK2项 | 延续各自模拟边界；未访问真实OSS |
| 验收工具自身 | 18/18 | 9项运行器防护、9项离线DOM交互；不是浏览器排版验收 |

PG7组包括：默认关闭与权限；启用/ACK/续期/读取错误；重放与畸形报告；会话与租期等待；换主/账户/数据库授权；独立后端关闭/报告竞争；**等待设备行锁期间会话被撤销或账户停用，获得锁后再核验并拒绝**。租期阈值测试调整fixture时钟状态，没有冒充真实等待30秒。

证据：

- [统一结果](../../artifacts/cloud-acceptance/2026-11-03T07-34-58-941Z-cf165241/result.json)
- [远程状态PG结果](../../artifacts/remote-state/2026-11-03T07-36-45-225Z/verification.json)
- [地图PG结果](../../artifacts/map-catalog/2026-11-03T07-35-01-723Z/verification.json)

## 跨工程验证

Rust侧已有 `D:\DOSO\artifacts\robot-cloud\auto-sync-result.json`：真实Gateway、MQTT TLS Broker和Agent，业务API及Brainstem为模拟。记录默认关闭零采集、一次开启后自动续期、重连自动恢复、业务源失败到期停采、一次关闭后拒收和停采。实验租期8秒，生产合同30秒；不能将其表述为真实业务数据库或真实机器人验收。

实际捕获的五阶段报文已通过Edge handler回放：defaultOff、enabled、confirmed、renewed、closed，5/5通过。每条以捕获的observedAt固定测试时钟；断言HTTP200、no-store、单次RPC的完整参数和响应一致。专用服务密钥、RPC为合成替身；不是实时Rust→Edge→PG联调。

证据：[回放结果](../../artifacts/remote-state-wire/2026-11-03T08-28-01-366Z/verification.json)、[回放日志](../../artifacts/remote-state-wire/2026-11-03T08-28-01-366Z/wire-replay.log)。原始报文SHA256为 `ea00fb31bd08be6f00c6c777a19343784b58cb9744dcf55f7e39a25b1ea1ce6b`。

实际两个handler与独立PostgreSQL已串联验证，6/6阶段通过，共16次真实数据库RPC：默认关闭隐藏在线信息；跨用户/错误服务密钥拒绝；主动开启与并发版本控制；设备ACK及状态保存后读取；重复序号不刷新采样时间；关闭拒收旧状态并保留原始历史。接口消息和数据库DTO之间未发现不兼容。

固定入口为 `node scripts/verify-remote-state-handler.mjs`。它严格复用既有fixture的基础部分和真实迁移，使用合成用户及psql传输适配，不启动HTTP服务。当前只证明 **实际业务处理函数→实际数据库函数→实际状态记录**，不包含Supabase Auth/PostgREST、Rust实时请求或App二进制。Node语法与Deno类型检查均通过；启动失败清理分支已加保护，正常status→stop→status实际通过，异常恢复未故障注入。

最终证据：[实际接口与PG串联结果](../../artifacts/remote-state-handler/2026-11-03T08-58-52-934Z-6f4eb4ab/verification.json)。该轮输入哈希一致、`stopped=true`，只监听127.0.0.1，退出码0；完整命令记录在同目录`transcript.json`。清理失败会将总结果标为FAIL，不能留下功能PASS冒充整轮完成。

## 多台设备的现有限制

以下为2026-11-03早期只读核查时的“一账户一台实体设备”限制。后续迁移及App改动见[多设备进度](DOSO_MULTI_DEVICE_PROGRESS_20261103.md)，解除限制的迁移已有2026-11-04部署记录；下列内容保留当时问题，不代表当前源码限制：

- `20260822185849_harden_network_backend.sql` 的部分唯一索引限制 `owner_id`；`claim_device_with_digest` 在认领时主动拒绝第二台，并处理并发唯一冲突。未发现后续迁移移除此限制。
- `supabase/functions/device-binding/index.ts` 将该拒绝映射成 HTTP409 / `physical_device_limit`。
- `src/services/deviceRepository.ts` 虽返回设备数组，`App.tsx` 仅存一个 `device`，初始化选择 `devices[0]`；个人页已绑定时只有解绑入口。
- 状态表与权限按 `device_id` 隔离，App面板身份包含用户/会话/设备；现有fixture仍限制一账户一台，因此同账户多台独立启停尚未验收。

最小完整改动需包含：新迁移放开索引并更新认领RPC、调整既有数据库测试/fixture、App设备列表与当前设备选择、添加/切换/解绑流程及文案、同账户两台设备分别启停与状态隔离测试。仅删唯一索引会留下RPC拒绝和App无法选择的问题。

## 下一步的职责与界限

1. 本聊天维护App、业务接口、SQL和本地验收证据；RM500U-CNV维护Rust协议、Gateway、Agent与联调工具，避免双重修改。
2. 本地实际handler与隔离PG串联已通过。后续实时Rust lab可复用handler并适配loopback HTTP入口，由主线维护Rust请求端；正式托管Auth/PostgREST仍单独验收。
3. 多台设备绑定/选择现已进入授权实施，结果以[后续进度](DOSO_MULTI_DEVICE_PROGRESS_20261103.md)为准。
4. 获准后才进入托管Auth/Edge/数据库、实际App与设备链路；本轮无部署操作。

未验收：托管认证/PostgREST、真实App安装包、浏览器视觉布局、真实机器狗/5G；地图传输执行器和真实OSS仍属于地图后续工作。统一运行器异常PG强制终止恢复仅有防护测试，未执行真实故障注入。
