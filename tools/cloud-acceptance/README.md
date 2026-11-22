# 云端功能验收入口

这个目录维护本地验收工具。看板回答三件事：**功能支持什么、怎么测试、证据在哪里**。它读取本轮测试结果与明确标注的历史联调产物，不连接实际机器狗，也不显示实时设备状态。

2026-11-08 文档核对：本工具的九项检查保留各自执行时间与范围。2026-11-07已登记模拟设备、实际Web App和真实云业务数据库的状态流程是独立证据，见 [SIMULATED_FLOW.md](D:/DOSO/robot-cloud/docs/SIMULATED_FLOW.md)，不会因打开本看板自动重跑或计入本轮通过数。当前云端状态与后续工作见 [PROGRESS.md](D:/DOSO/robot-cloud/PROGRESS.md)，Rust测试入口见 [TESTING.md](D:/DOSO/robot-cloud/TESTING.md)。

## 使用

在 `doso-app` 根目录打开 PowerShell：

```powershell
node tools/cloud-acceptance/run.mjs
```

运行完成后，打开 `artifacts/cloud-acceptance/index.html`。页面可切换功能链路、测试流程和工程目录；测试行可展开查看命令、范围和日志。浏览器里的“复制命令”只复制文本，不执行系统命令。

每次运行创建独立目录，保存结果和日志；`index.html` 是最近一次生成的查看入口。旧运行记录保留，不自动删除。失败、缺少工具或无法确认进程结束，都不能显示通过。

报告保留运行ID、执行时间、命令、退出状态、范围与日志。通过结果只反映该次执行，查看报告不会自动验证当前源码。历史产物保留原样。

## 测试顺序

1. **App地图行为**：执行实际服务/页面处理函数，使用模拟认证和网络，验证目录、账号切换、超时与取消。
2. **地图数据库**：创建独立本地PostgreSQL实例，加载最小基础fixture与真实地图迁移，检查RLS、事务、换主及取消/完成竞争；结束时关闭该实例。
3. **地图业务接口**：执行真实handler，认证、数据库和对象存储边界用替身，验证授权、分片、完成、失败与取消。
4. **OSS签名**：用合成密钥运行官方SDK，验证对象/分片/长度/过期约束；不发送真实OSS请求。
5. **App类型检查**：检查完整App TypeScript调用关系。
6. **Edge入口检查**：检查地图、远程状态用户接口、后台同步三个实际入口、依赖与类型。
7. **App远程状态**：验证用户主动开关、前台自动读取、后台停止页面请求但保留选择、保存结果不确定时自动核对、过期状态和原始采集时间。
8. **远程状态数据库**：另一独立PostgreSQL实例加载实际迁移，验证默认关闭、ACK后续期、撤销拒收、换主、乱序、行锁竞争，以及等待锁期间会话撤销/账户停用后再次检查授权；结束时关闭实例。租期阈值用fixture时钟状态调整，不能当作真实等待30秒的验收。
9. **远程状态业务接口**：真实用户handler与同步handler，认证/RPC用替身，验证调用身份、消息边界、并发版本、大小和时间限制。

这九项是固定执行清单，不把历史报告计入本轮执行数。最新一轮执行记录位于 `artifacts/cloud-acceptance/latest.json` 指向的目录。额外的Rust报文回放和接口/数据库串联证据独立保留，范围见[远程状态进度](../../docs/production/DOSO_REMOTE_STATE_PROGRESS_20261103.md)。

实际状态handler与本地PG串联另用固定入口：

```powershell
node scripts/verify-remote-state-handler.mjs
```

它只加载既有fixture的基础账号/设备结构及真实候选迁移，经psql适配调用真实RPC，验证六个场景后停止所属实例。不启动HTTP服务，身份认证为合成测试用户；不替代Supabase Auth/PostgREST或实时Rust链路验收。入口仅使用已缓存Deno，缺失时失败，不自动安装。

Rust持续状态证据来自 `D:\DOSO\artifacts\robot-cloud\reporting-result.json`，只读取有效且符合预期结构的结果，标注来源和时间。这份记录中的模拟Brainstem联调不会因打开看板而重跑。Rust的正式测试流程仍由 `D:\DOSO\robot-cloud\TESTING.md` 维护。

测试程序、PostgreSQL二进制和Node依赖须已安装。首次执行固定版本Deno时，npm可能下载运行工具；下载工具不等于访问机器人或对象存储。原生PostgreSQL工具路径与现有 `scripts/verify-device-map-catalog.mjs` 保持一致。

数据库测试会记录当前子进程PID和本轮验收ID。异常退出后的恢复只允许操作同时匹配这些标记、时间、固定工具链和精确目录的实例，并使用 `pg_ctl status` 确认停止；不能证明归属时只记录未确认，不停止其他实例，也不删除目录。

## 验收工具自身的检查

```powershell
npm ci --ignore-scripts --prefix tools/cloud-acceptance
npm test --prefix tools/cloud-acceptance
```

唯一额外依赖是锁定的、仅供离线页面测试的LinkeDOM，安装在本工具目录，不进入App或机器人运行包。测试直接执行生成页面的脚本，检查页签、流程节点、状态显示、日志路径和复制失败回退；它不模拟浏览器排版，不能替代视觉验收。

## 目录边界

| 位置 | 唯一职责 |
| --- | --- |
| `src/screens`、`src/components`、`src/services` | App页面、远程状态面板和客户端调用 |
| `supabase/functions/map-library` | 地图业务接口与OSS适配 |
| `supabase/functions/remote-state`、`remote-state-sync` | 用户选择/读取和Gateway后台同步；复用共享认证 |
| `supabase/migrations` | 数据库变更，使用新迁移推进 |
| `supabase/verification/local` | 隔离数据库fixture |
| `scripts`、`supabase/functions/tests` | 复用已有测试，不复制到看板 |
| `tools/cloud-acceptance` | 验收运行器、页面模板、工具自测与本说明 |
| `artifacts/cloud-acceptance/<runId>` | 自动生成的本次结果、日志、页面；不手工修改 |
| `artifacts/map-catalog/<runId>` | 数据库测试自身的详细证据，保留原入口 |
| `artifacts/remote-state/<runId>` | 远程状态真实PG权限、事务与竞争证据 |
| `artifacts/remote-state-wire/<runId>` | 已捕获Rust报文的handler兼容回放；RPC为替身 |
| `artifacts/remote-state-handler/<runId>` | 实际handler与隔离PG的串联证据；范围以该次报告为准 |
| `../.local-toolchains/postgresql-17.11-5/synthetic-map-catalog-*` | 沿用现有数据库测试的数据目录；实例停止后保留现场，按所属运行记录核对后才清理 |
| `../.local-toolchains/postgresql-17.11-5/synthetic-remote-state-*` | 状态测试的独立数据库目录，同样按运行归属管理 |
| `../.local-toolchains/postgresql-17.11-5/synthetic-remote-handler-*` | 实际handler与PG串联的独立数据库目录；结果记录精确路径与停止状态 |
| `docs/production` | 功能合同、交接与范围记录 |
| `D:\DOSO\robot-cloud` | `robot/`机器狗程序、`cloud/`云服务器程序、`shared/`共享协议、`tools/`联调与部署工具；由RM500U主线维护 |

不复制Rust工程到App；不移动共享工作树里其他任务的文件；不把凭据、证书、真实地图或用户会话放入看板。生成产物沿用现有 `/artifacts/` Git忽略规则。需要验证当前源码时，重新执行相应测试并查看新记录。

## 验收层级

- **本轮执行**：本工具实际运行并记录退出结果。
- **读取已有证据**：导入其他工程的历史产物，明确日期与模拟边界。
- **未验收**：真实OSS字节传输、真实机器狗、G20/手机App、独立公网MQTT和5G的完整流程；必须有对应实验才能改变状态。已登记模拟设备与实际Web App、真实业务数据库的结果单列在本页顶部的模拟流程记录，不覆盖这些范围。

业务合同：[地图接口](../../docs/production/DOSO_MAP_LIBRARY_API.md)、[远程状态接口](../../docs/production/DOSO_REMOTE_STATE_API.md)。功能记录：[地图进度](../../docs/production/DOSO_MAP_MANAGEMENT_PROGRESS_20261103.md)、[远程状态进度](../../docs/production/DOSO_REMOTE_STATE_PROGRESS_20261103.md)。协作边界：[云端分工](../../docs/production/DOSO_CLOUD_COLLABORATION.md)。
