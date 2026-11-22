# 首次管理员引导

适用于森哥明确授权的唯一现有账号。两份 SQL 通过可信运维连接运行，只修改该账号的产品角色并追加审计。MFA、Auth 会话和终端注册仍由现有 App 完成。

## 执行前

先确认目标是既有业务数据库。以下命令沿用设备管理发布流程的备份方式，适用于已确认的 Linux 运维 Shell。备份失败或无法读取时终止。

```sh
set -eu
umask 077
backup_dir=$(mktemp -d /root/doso-admin-bootstrap.XXXXXXXX)
docker exec supabase-db pg_dump -U postgres -d postgres -Fc > "$backup_dir/postgres.dump"
test -s "$backup_dir/postgres.dump"
docker exec -i supabase-db pg_restore --list < "$backup_dir/postgres.dump" > /dev/null
sha256sum "$backup_dir/postgres.dump"
```

目录权限为 `0700`，备份文件权限为 `0600`。执行记录保存输出中的备份路径与文件 SHA256。

现有实现位于 `deploy/backend/device-admin-20261104/database_base.py` 的 `release`，负责备份和校验。它同时会应用发布迁移，不能单独用来执行本次角色引导。首次管理员 SQL 与库存迁移各自独立执行。

## 引导

使用已确认的数据库容器和运维身份，将 `apply.sql` 通过标准输入交给 `psql`。例子适用于现有容器名称，运行前须验证容器所属项目和数据库目标。

```sh
docker exec -i supabase-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < apply.sql
```

成功输出 `PASS admin_bootstrap_committed`。事务锁定账号、profile 和审计表，要求账号及 profile 均恰好一条、相互对应、账号 active、角色为 user，且没有历史管理员引导记录。角色变更与审计一起提交。失败时事务回滚，排查后再执行。

脚本输出不包含账号标识。执行后只读确认 admin 数量为一且本次审计存在。管理员业务接口仍需本人正常登录、注册 DOSO 终端并完成 MFA，取得 AAL2 会话。

## 回滚

```sh
docker exec -i supabase-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < rollback.sql
```

回滚从本次审计定位同一账号，将 admin 恢复为 user，并追加回滚审计。如果已记录后续角色变更或账号角色已经变化，事务拒绝执行。回滚后引导脚本仍保持一次性，后续管理员管理走正式授权流程。

2026-11-06：经森哥明确确认唯一现有账号属于本人并授权作为管理员，已在业务数据库执行上述引导。受限备份位于 `/root/doso-admin-bootstrap.ZsQbeybE/postgres.dump`，`pg_restore --list` 校验通过，SHA256 为 `51fcace97de0005c1a59f5b004a0d3e23bc5825516274a4b0f545967ea1cf96a`。事务提交后只读检查得到 active admin 1 个、本次审计 1 条。未改 MFA、Auth 会话或终端；管理员业务登录及库存接口仍待上线验收。

## 本地验证

在 App 工程根目录运行 `node scripts/verify-multi-device-ownership.mjs`。2026-11-06 在独立 PostgreSQL 验证了备份可读、账号数量和资格拒绝、审计失败回滚、两个并发引导仅一个提交、身份字段保持，以及回滚审计失败时角色不变和重复执行拒绝。新增五组检查通过，整轮共 32 组通过，测试集群已停止。证据位于 `artifacts/multi-device/2026-11-05T19-48-33-566Z/verification.json`，目录时间采用 UTC。
