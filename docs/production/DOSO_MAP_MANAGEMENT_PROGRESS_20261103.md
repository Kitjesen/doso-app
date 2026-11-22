# 地图管理首批实现与验证

2026-11-03。本轮按Ponytail方式并行实现App、业务接口和数据库，复用现有账号、会话与设备归属。所有新内容为本地候选，没有迁移托管数据库、部署函数、开通OSS或接触机器狗。

后续已提供[本地验收看板](../../artifacts/cloud-acceptance/index.html)和[统一运行说明](../../tools/cloud-acceptance/README.md)。2026-11-03北京时间14:18:44完成统一复验：App17项、数据库5组、Handler16项、SDK签名2项及两项类型检查通过，所选关键源码末尾哈希复核一致。原始日志与结果位于 `artifacts/cloud-acceptance/2026-11-03T06-15-30-093Z-46387e86/`。工具自身9项runner测试与8项离线DOM交互测试通过；DOM测试不代表浏览器视觉验收，异常数据库强制终止的恢复未进行实机故障注入。

## 实际功能

| 功能 | 代码已支持的行为 | 本轮证据 |
| --- | --- | --- |
| App地图入口 | 本地/云端切换；打开云端后才请求目录；当前只读 | 导航处理函数测试2项 |
| 云地图页面与会话 | 最近100个版本、大小、来源、坐标系、状态；刷新/取消；切账号与进入后台丢弃迟到结果 | 页面5项、服务10项，含账号变化、超时、非法响应和Unicode名称 |
| PostgreSQL目录 | 固定创建者、RLS、有效会话、服务端RPC；设备换主不转交地图；来源授权代次校验 | PostgreSQL17.11实际迁移、权限与事务测试，5组通过 |
| 上传准备与分片能力 | 固定对象key、请求幂等；8MiB分片/最后余量；5分钟HTTPS URL签名绑定对象/上传会话/分片编号/长度 | Handler模拟边界测试；官方SDK实际生成合成签名 |
| 完成、失败与取消 | OSS大小/CRC64匹配才ready；不符保存failed；迟到完成不能复活cancelled；丢失完成响应可复核对象 | Handler测试；真实独立PG后端取消/完成行锁竞争 |
| 下载授权 | 仅地图创建者的ready版本获取5分钟HTTPS下载能力；不要求仍拥有来源设备 | Handler与RLS测试；未实际下载OSS对象 |

`ready`只表示存储校验通过。云端未复算SHA256；地图格式、SHA256、解包安全、导入及导航可用性须由接收端进一步验证。完整接口见 [DOSO_MAP_LIBRARY_API.md](DOSO_MAP_LIBRARY_API.md)。

## 验证命令

```powershell
node --test scripts/cloud-maps-service.test.mjs scripts/cloud-maps-screen.test.mjs scripts/map-library-navigation.test.mjs
# 17 passed, 0 failed

npm run typecheck
# tsc --noEmit, exit 0

node scripts/verify-device-map-catalog.mjs
# 5 groups passed; real PostgreSQL17.11, isolated cluster stopped

npx --yes deno@2.5.6 test --node-modules-dir=none --allow-read --allow-env --config supabase/functions/deno.json supabase/functions/tests/map-library.test.ts
# 16 passed, 0 failed; mocked Auth/RPC/OSS boundaries

npx --yes deno@2.5.6 test --node-modules-dir=none --allow-read --allow-env --allow-sys=osRelease,networkInterfaces --config supabase/functions/deno.json supabase/functions/map-library/oss_test.ts
# 2 passed, 0 failed; real SDK, synthetic credentials, no OSS requests

npx --yes deno@2.5.6 check --node-modules-dir=none --config supabase/functions/deno.json supabase/functions/map-library/index.ts
# exit 0
```

数据库机器可读证据：[verification.json](../../artifacts/map-catalog/2026-11-03T05-10-42-680Z/verification.json)。测试使用真实候选迁移和PG锁/RLS，Auth用户/会话/设备基表为明确的隔离fixture，不能代替托管Supabase验收。

## 审查后修正

- 同一上传请求并发初始化时返回已有获胜会话，取消多余multipart；测试替身与真实SQL一致。
- 校验不符保存为failed，避免目录长期错误显示“校验中”。
- 原创建者在设备解绑/换主后仍能取消自己的未完成上传，新主人无权操作。
- 服务端拒绝名称/来源ID/坐标系中的ASCII控制字符，App按PostgreSQL的Unicode字符数量限制解析，避免一条版本破坏整个目录读取。
- 分片URL绑定Content-Length，且签发后、返回前再核验会话及设备归属。

## 同日协同更新：持续状态主线本地完成

RM500U-CNV已回传Rust持续状态实现完成，合同位于 `D:\DOSO\robot-cloud\CONTRACT.md` 的Reporting extension。主线报告Agent14、Gateway12、shared4，共30项单测，以及build/fmt/Clippy通过。本聊天读取核对了 `D:\DOSO\artifacts\robot-cloud\reporting-result.json` 与 `reporting-check.log`：8个联调检查均PASS，结果明确 `deployed:false`，Brainstem是模拟服务，Broker、Gateway和Agent是真实运行的程序。

已验证的模拟链路包括：原有按需状态查询和鉴权、设备确认许可后周期上报、GROUNDED到STANDING更新、读取失败保留上次成功时间、关闭后停报与拒绝旧许可、许可到期停报、重连更换connectionId且不自动采集。新API为 `PUT /api/v1/robots/{id}/reporting` 和 `GET /api/v1/robots/{id}/status/latest`；202只代表受理，设备确认单独表达；采集许可最多30秒，业务后端须显式续租。

当前未部署本批新代码。后续业务用户开关、事务权限校验、后台续期和App展示已在本地实现，统一9项检查通过；详细证据与模拟边界见[远程状态进度](DOSO_REMOTE_STATE_PROGRESS_20261103.md)。这不构成真实机器狗验收，也不包含地图执行器。

## 未完成的闭环

1. 机器人地图执行器：唯一导出快照、打包与校验、直传OSS、断点记录、异步任务回执；MQTT字段继续由Rust主线统一。
2. 指定机器人下载：业务任务授权领取、SHA256校验、路径安全解包、导入新本地ID；之后单独经ProductControl选择使用。当前download API只生成文件能力。
3. App选图上传、目标机器人选择和实际传输进度。当前页面只有云目录查看，未放出假传输按钮。
4. 远程状态业务代码已本地完成；仍需后续获准部署后的托管服务与实际App/设备闭环，见[远程状态进度](DOSO_REMOTE_STATE_PROGRESS_20261103.md)。
5. 获准启用服务后验证OSS/托管Edge与实际设备。官方SDK使用Node系统API，托管运行时兼容性尚未实测；取消/完成竞争的孤立对象、残留multipart和删账号后的OSS清理须在生产前补齐。

此前本地地图活动图覆盖保护已通过Windows CTest1/1，本轮未改动或重复执行该C++测试。真实机器狗、5G、原生App布局、Linux地图导入与生产量产闭环均未验收。
