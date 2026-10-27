# 用户名与登录身份发布恢复说明（2026-08-24）

本文处理从真实生产 head `20260823111035` 应用 `20260823130000`、`20260824090000`、`20260824100000`、`20260824101000`、`20260824102000`，以及部署 changed `admin-users` 后的异常。线上 8 条既有 migration 的 version/name/SQL digest 已与本地完全一致，不需要也不得执行 `migration repair`。本文不是自动回滚脚本；仓库没有安全 down migration，生产禁止 `db reset`、删除迁移历史或手工把 provenance 改回旧状态。

## 为什么不能直接降级数据库

`130000` 新增一次性用户名认领和 claimed marker；`0900` 新增外部身份 registry/投影；`1000` 分类并约束历史用户名，可能把旧的 `username_claimed_at = created_at` 修正为 `NULL`，同时新增 `username_provenance` enum、约束、写入 trigger 和受审计管理员 RPC；`1010` 替换登录方式 RPC 的返回列为 `registry_id` 与 `provider_last_sign_in_at`；`1020` 清除 `audit_logs` 及其 identity sequence 的默认宽权限，只恢复 `service_role` 表 `SELECT/INSERT` 和 sequence `USAGE`。这些变更同时影响数据含义、权限和客户端合同；删除列、enum、registry 或 trigger 不能恢复变更前的事实，也可能让新旧客户端和函数同时失配。

## 立即动作

1. 停止客户端发布和后续 Edge Function/Provider 变更；Apple、微信、QQ 保持关闭。
2. 记录故障开始时间、Git SHA、项目 `DOSOrobotics` / ref `vchvqfdlkomlrjenkdhj`、迁移输出、受影响范围和发布前选择的恢复证据。日志先脱敏再保存。
3. 如果存在未授权写入、跨用户数据或持续 5xx，冻结相关写路径；不要删除用户、identity、profile 或 audit 数据来“清理”。
4. 由事件负责人选择下表中的唯一恢复路径。

## 决策表

| 状态 | 处理 | 禁止 |
| --- | --- | --- |
| `db push` 尚未执行 | 取消窗口，修复后重新走完整 preflight | 不得把 dry-run 当作已部署 |
| 某个迁移失败且数据库证明已事务回滚 | 保存错误，检查锁/history/schema，修复为新的迁移后重试 | 不执行 `migration repair` 掩盖失败 |
| 预期 tail 已成功，数据一致但 RPC、RLS、trigger、审计 ACL 或函数合同有缺陷 | 停止客户端 rollout，保持 Provider 关闭；新增时间戳更大的 forward-fix migration，并重新运行 pgTAP、35 项 postflight、hosted contract 和旧/新客户端 smoke | 不修改已应用迁移，不做 down SQL |
| 只有 Edge Function 回归 | 暂停受影响函数流量；仅在旧函数与当前 `1010` schema 合同时重部署上一个已验证函数版本，否则 forward-fix 函数 | 不为迁就旧函数回退数据库 |
| 用户名/identity 硬不变量已损坏、发生跨账号/越权写入，或无法用确定性 forward-fix 恢复 | 冻结写入并升级为生产事故；若发布前已生成受控 logical dump，先在隔离项目演练完整恢复，再由项目所有者另行批准切换/重建 | 不在生产直接导入，不声称 Free 项目存在 PITR |
| 只有 production-private snapshot，没有实际 backup/PITR | 这表示生产恢复门此前未满足；snapshot 仅可辅助诊断和设计确定性 forward-fix。无法安全 forward-fix 时保持冻结并升级事故 | snapshot 不是灾备，不可用于恢复 Auth 密码、会话、用户级行或任意时间点数据 |
| 旧 `1.2.1` 客户端失败但数据正确 | 停止新客户端发布，forward-fix 数据库/RPC/函数兼容性，再重跑旧/新 smoke | 不强迫用户升级来掩盖兼容回归 |

## Forward-fix 边界

Forward-fix 适用于数据仍正确、问题可通过向前兼容的 schema/RPC/函数修改确定性解决的情况。

- 创建新的时间戳迁移；本次已经应用的 tail 保持不变。
- 保留 canonical RPC 字段，兼容调整必须同时覆盖 SQL、TypeScript、UI 与四函数。
- 修复前先在本地复现并添加 pgTAP/合同回归；随后执行 local upgrade、fresh reset、hosted dry-run 和 canary。
- 不把 `legacy_inferred` 或 `social_provisional` 批量改成可信 claimed 状态；无法证明来源时保持未认领。
- predeploy 报告中的 timestamp fingerprint、claimed-social、metadata/source mismatch 是分类证据。非零值需人工解释和接受，但不能仅因非零就做 destructive repair 或 PITR。
- 不删除 audit log、identity projection 或用户名冲突证据。

## Edge Function 恢复边界

四个函数为 `account-sessions`、`device-binding`、`admin-users`、`admin-devices`。生产前 hash 证据表明前三个与本地完全一致，只有 `admin-users` 入口包含 G002 变更。因此本次正常发布和函数级恢复都只部署 `admin-users`；不得为了“整齐”重部署未变化的三个函数。恢复版本必须与当前数据库 schema/RPC 合同兼容。部署后重新 list/hash 四函数，确认全部 `ACTIVE`、`verify_jwt=true`，再运行：

```powershell
$env:VERIFY_EDGE_FUNCTIONS = 'true'
try {
  npm run test:network
  npm run test:identity-hosted
} finally {
  Remove-Item Env:SUPABASE_URL,Env:SUPABASE_PUBLISHABLE_KEY,Env:SUPABASE_SERVICE_ROLE_KEY,Env:VERIFY_EDGE_FUNCTIONS -ErrorAction SilentlyContinue
}
```

这些测试会创建并删除临时 canary 数据，仍需要生产 canary 批准和受控 service-role 凭据。任何清理失败都必须记录并处理。`finally` 完成并确认四个变量均不存在后，才能进入旧客户端构建/production gate；旧客户端只可在新的专用终端注入独立的 `DOSO_OLD_CLIENT_*` 最小环境，不得继承 service-role key。

## 当前 Free 项目的恢复边界

控制台已确认 `Last backup = No backups`，当前套餐为 Free，未启用 PITR。Supabase 官方说明自动每日备份面向 Pro/Team/Enterprise，Free 项目应自行定期导出 logical dump。因此本次事故处理中不存在可直接选择的 Dashboard backup/PITR restore point。

官方依据：[Database Backups](https://supabase.com/docs/guides/platform/backups)、[Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)、[Branching](https://supabase.com/docs/guides/deployment/branching)。

生产写入前必须具备以下一种真实恢复基础，并把限制与恢复演练结果写入证据：

1. **logical dump**：在生产变更前用 percent-encoded DB URL 生成受控 roles/schema/data dump（data 用两个独立 `--exclude` 排除 `storage.buckets_vectors`、`storage.vector_indexes`），单独导出 `supabase_migrations` schema/data，并无条件保存受版本控制的 `20260824_auth_storage_custom_ddl.sql`；六个不存在的新 artifact path 必须位于仓库外，禁止覆盖旧恢复点，并记录结构化 filename/length/SHA-256。隔离恢复按第一事务 `roles + schema + session_replication_role=replica + data`、第二事务 `history schema + history data`、第三事务 custom DDL 执行，并比对生产/恢复的 custom trigger 集合 definition hash。发布前 8-migration head 只有 `on_auth_user_created`；`sync_auth_identity_projection` 由 `0900` tail 创建，不能强迫预发布恢复库提前拥有它。所有 DB URL/密码输出不得持久化；dump 失败时清理路径变量，恢复结束时在 `finally` 清理全部变量。
2. **physical backup/PITR**：核实 restore point 覆盖本次变更窗口，并先在隔离环境完成实际恢复演练。

当前 Free 项目没有 backup/PITR；若生产写入前也没有数据库密码完成 logical dump 和恢复演练，发布必须 `STOP`。用户对风险的接受、`$0.01344/hour` 的无数据 preview branch 或 production-private snapshot 都不能替代此门。Preview branch 仅用于 staging 验证；private snapshot 仅可保存 schema/hash/匿名聚合等诊断事实。当前仅 1 个用户/Profile/email identity，snapshot 和 hosted preflight 证据必须抑制 provider distribution 与 legacy username source 属性。

任何导入都必须先在隔离项目演练，不能直接覆盖生产。生产写入前生成的 logical dump 恢复后应精确回到发布前 `8` 条 history，并运行 `17/17` hosted baseline；正常发布完成后的线上 history 才应精确为 `13` 条并通过 `35/35` postflight。若事故处置增加 forward-fix，期望 history 为这 `13` 条加更大 timestamp 的已评审迁移，不能继续硬套 `13`。只核对 head 或 tail 不足以关闭事故。恢复还必须无条件应用并哈希比对 `20260824_auth_storage_custom_ddl.sql`，证明发布前实际存在的 `on_auth_user_created` 与生产定义一致；普通 CLI schema dump 排除 auth/storage，不能代替该 artifact。`sync_auth_identity_projection` 必须在随后应用 `0900` 后出现。随后核对四函数 hash，仅部署兼容的 changed `admin-users`，运行 Auth/RLS/identity contracts，最后在无 `SUPABASE_*` 生产凭据残留的独立最小环境中，以 `--production` 运行 `scripts/verify-old-client-compatibility.mjs`。旧 `1.2.1` 证据必须绑定实际 artifact、SHA-256、真实签名身份、项目 ref、当前 Git SHA 和脚本允许的 14 天 UTC 时间窗口，再完成当前发布候选 smoke；候选版本以 manifest `appVersion` 与实际构建为准。

## 严禁操作

- 在生产运行 `supabase db reset`。
- 用 `supabase migration repair` 把失败伪装成成功。
- 编辑或删除已经应用的迁移记录。
- 直接删除 `username_provenance`、identity registry、trigger、RPC 或 audit 数据。
- 用 CSV/局部表覆盖代替一致性恢复。
- 声称 Free 项目当前存在自动 backup/PITR，或把 preview branch/private snapshot 当成灾备。
- 在没有实际 logical/physical backup 或 PITR restore point、或未完成恢复演练时执行生产写入。
- 未在隔离环境完成恢复演练就把 logical dump 导入生产。
- 把 access token、service-role key、数据库密码、JWT、OTP、邮箱、UUID 或原始 Provider subject 写入事故证据。

## 关闭事故的条件

只有以下结果全部为 `PASS` 才能关闭事故并恢复发布：正常发布基线的 13 条 migration（或明确记录的 13+forward-fix history）的 version/name/order/digest 与仓库精确一致；full-backlog、`0900 -> 1020`、fresh reset/pgTAP/lint 通过；托管 35 项 postflight、审计最小权限与 identity/network 合同通过；无 PGRST202 和持续 5xx；临时数据清理完成且生产凭据已清除；旧 `1.2.1` 的实际 artifact/hash/signature/project ref/current Git/time-window 证据和 `real-device-smoke` 与当前发布候选 smoke 通过，候选版本以 manifest `appVersion` 与实际构建为准；Provider flags 仍为关闭；证据和审批记录可由另一人复核。旧客户端 static/build PASS 不能替代真实设备。
