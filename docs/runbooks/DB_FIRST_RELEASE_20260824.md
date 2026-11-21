# DOSO DB-first 生产发布 Runbook（2026-08-24）

本 runbook 只覆盖用户名 provenance、登录方式 RPC 合同、审计日志最小权限和四个现有 Edge Functions 的受控发布。Apple、微信、QQ Provider 与客户端功能开关必须继续关闭。机器人控制不在本次发布范围。

## 当前已知事实

- 仓库目标迁移顺序止于 `20260824102000_harden_audit_log_privileges.sql`。
- Supabase 控制台/connector 已确认目标为项目 `DOSOrobotics` 的 `main` Production，状态 `ACTIVE_HEALTHY`，区域 `us-east-1`，套餐为 Free；项目 ref 为 `vchvqfdlkomlrjenkdhj`。发布时仍要把当前控制台目标与该记录再次核对，防止误操作其他项目。
- 线上 migration history 精确为 8 条：`20260822185808`、`20260822185822`、`20260822185835`、`20260822185849`、`20260822185907`、`20260822190119`、`20260823110629`、`20260823111035`。每条线上 SQL 的去空白 MD5 已与仓库对应内容一致；仓库文件已保字节重命名对齐真实版本，不需要也不得执行 `migration repair`。
- 待部署 tail 精确为 `20260823130000`、`20260824090000`、`20260824100000`、`20260824101000`、`20260824102000`。生产只读核对已确认当前 `service_role` 对 `audit_logs` 仍有 `UPDATE/DELETE/TRUNCATE`；这是已知待修复漂移，不是可接受的最终权限。`1020` 会清零表/sequence ACL，并只恢复 `service_role` 的表 `SELECT, INSERT` 与 identity sequence `USAGE`。
- 线上当前有 1 个 Auth user、1 个 Profile、1 个 email identity；terminal、device、audit 均为 0。完整性、用户名格式与唯一性聚合检查均为 0 异常。托管报告必须保留硬不变量和总量；用户名来源、provider 分布、anonymous anomaly samples 因小样本只输出固定 `suppressed (minimum_group_size=5)` 标记，不能把当前小数据量当作跳过验证的理由。
- 四个 Edge Functions 均为 `ACTIVE` 且 `verify_jwt=true`。`account-sessions`、`device-binding`、`admin-devices` 的远端源码 canonical hash 与本地精确相同；`admin-users` 的共享文件 trim 后一致，但入口文件因 G002 用户名管理能力而不同。因此数据库迁移后只部署 `admin-users`，再重新核对四函数状态和源码 hash，不为未变化函数制造无意义版本。
- Dashboard 显示 `Last backup = No backups`，项目也没有 PITR。Supabase 官方说明 Free 项目不提供自动每日备份，应自行定期 logical dump。当前有 0 个 branch；短时 preview branch 的已显示价格为 `$0.01344/hour`，创建前必须取得用户对付费的明确确认。Preview branch 是无生产数据的隔离验证环境，不是生产数据备份。
- 2026-08-25 使用仓库 `.env.local` 中的 publishable 配置，对固定目标 `vchvqfdlkomlrjenkdhj.supabase.co` 执行无 Bearer session 的公开 schema-cache 探针：`heartbeat_current_terminal` 返回精确 PostgreSQL function ACL denial，`claim_username` 与 `list_my_login_methods` 均返回 `PGRST202`。这与五条 tail 尚未部署一致；该旁证不读取业务数据、不替代 migration history、digest、只读 SQL 报告或 dry-run。

## 放行与停止条件

只有以下条件全部满足才允许执行生产 `db push`：

1. 本地 full-backlog 与 `0900 -> 1020` 两种升级演练、fresh reset、pgTAP、lint、Auth、RLS、真实 RPC/审计 ACL 合同全部通过；旧客户端的静态/构建兼容检查通过，并已有真实设备 smoke 证据。
2. 发布负责人再次核对组织、项目名 `DOSOrobotics`、`main` Production、`us-east-1`、ref `vchvqfdlkomlrjenkdhj` 和 `ACTIVE_HEALTHY`，并记录确认时间。
3. `migration list --linked` 与上述 8 条真实 history 严格同序，SQL digest 证据仍匹配；其他 head、缺号、重复或远端独有迁移均为 `STOP`。不得使用 `migration repair`。
4. 对精确 `20260823111035` 起点运行 `hosted_pre_username_report.sql`。缺 Profile/orphan、重复或非法用户名、identity 跨账号所有权冲突、约束/格式破坏等硬不变量必须通过；硬不变量、总量和三类固定 suppression 标记必须完整落盘。报告未输出的小样本分类不得猜测或写入发布证据。
5. `db push --dry-run --linked --skip-vault` 只列出 `130000/24090000/24100000/24101000/24102000`，不得包含 seed、Vault、未知迁移或 history 修复。
6. 生产写入前必须存在实际可恢复的 logical/physical backup 或 PITR restore point，并已在隔离环境完成恢复演练；production-private snapshot 只能作诊断证据，preview branch 只能作 staging 验证，二者都不能满足恢复门。当前 Free 项目没有 backup/PITR；若还没有数据库密码生成并演练 logical dump，立即 `STOP`。
7. Apple、微信、QQ Provider 和 `EXPO_PUBLIC_*_AUTH_ENABLED` 均为关闭状态。
8. 发布负责人明确批准 canary 会创建并删除临时 Auth 用户、终端和设备测试数据。

任一硬条件不满足立即 `STOP`。特别是 history/digest drift、远端不是精确 `20260823111035` head、没有实际 backup/PITR 或恢复演练、旧 `1.2.1` 真实设备 smoke 失败或缺失、托管合同测试无法运行、硬不变量失败、缺少总量或固定 suppression 标记、PGRST202 或持续 5xx 时，不得继续。被抑制的分类不能作为放行或失败依据。

## 证据目录

在 `doso-app` 根目录开始。目录已被 `.gitignore` 排除，不得放入凭据。

```powershell
$ErrorActionPreference = 'Stop'

function Invoke-NativeEvidenceStep {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)] [string] $EvidencePath,
    [Parameter(Mandatory)] [scriptblock] $Command,
    [switch] $DoNotPersistOutput
  )

  $PSNativeCommandUseErrorActionPreference = $false
  if ($DoNotPersistOutput) {
    $nativeOutput = & $Command 2>&1
    $nativeExitCode = $LASTEXITCODE
  } else {
    & $Command 2>&1 | Tee-Object -FilePath $EvidencePath
    $nativeExitCode = $LASTEXITCODE
  }
  Add-Content -LiteralPath $EvidencePath -Value "EXIT_CODE=$nativeExitCode"
  if ($nativeExitCode -ne 0) {
    throw "native step failed with exit code $nativeExitCode; see $EvidencePath"
  }
  if ($DoNotPersistOutput) { return $nativeOutput }
}

$gitShaOutput = & git rev-parse HEAD 2>&1
$gitShaExit = $LASTEXITCODE
if ($gitShaExit -ne 0) { throw "git rev-parse failed with exit code $gitShaExit" }
$gitSha = ($gitShaOutput | Out-String).Trim()
$runId = "$(Get-Date -Format 'yyyyMMdd-HHmm')-$($gitSha.Substring(0, 8))"
$evidenceRoot = "artifacts/production-verification/$runId/DB-FIRST-20260824"
New-Item -ItemType Directory -Force -Path $evidenceRoot | Out-Null
Add-Content -LiteralPath "$evidenceRoot/00-git-head.txt" -Value "GIT_SHA=$gitSha`nEXIT_CODE=$gitShaExit"
```

后续所有 native 命令都必须通过 `Invoke-NativeEvidenceStep` 串行执行。Helper 在 native 命令返回后立即捕获 `$LASTEXITCODE`，把 `EXIT_CODE=<n>` 追加到对应 evidence，并对任何非零值抛出异常；因此前一步失败不会继续，外层 `finally` 完成凭据清理后异常仍会传播。Helper 只接收 scriptblock，不把命令文本或环境变量值写入 evidence；`-DoNotPersistOutput` 专用于必须在内存中解析的 secret-bearing 输出，只落盘退出码。每一步另行记录开始/结束时间、操作者、Git SHA、App 版本、目标环境和脱敏摘要。禁止记录 access token、service-role key、数据库 URL/密码、OTP、邮箱、用户 UUID、原始 Provider subject、JWT 或可长期关联用户的哈希。

## 1. 本地真实升级演练

`test:db-upgrade` 使用匿名 fixture 创建隔离 Supabase 项目，覆盖两个场景：full-release 从真实线上 head `20260823111035` 应用完整五迁移 tail；corrective 场景从 `0900` 直接应用 `1000/1010/1020`。每个场景都执行升级 pgTAP 并清理隔离环境。`test:db` 只运行 `supabase/tests/database`，不会把 predeploy/postdeploy verification SQL 混入 fresh-schema 测试。

```powershell
Invoke-NativeEvidenceStep "$evidenceRoot/01-local-upgrade.txt" { npm run test:db-upgrade }
Invoke-NativeEvidenceStep "$evidenceRoot/02-fresh-reset.txt" { npm run db:reset }
Invoke-NativeEvidenceStep "$evidenceRoot/03-pgtap.txt" { npm run test:db }
Invoke-NativeEvidenceStep "$evidenceRoot/04-db-lint.txt" { npx supabase db lint --local --schema private,public --level error --fail-on error }
```

将本地 Supabase 状态映射到测试脚本要求的进程变量，值不写入证据：

```powershell
$localStatusOutput = Invoke-NativeEvidenceStep "$evidenceRoot/04a-local-status-exit.txt" -DoNotPersistOutput { npx supabase status -o env }
$localStatus = ($localStatusOutput | Out-String) | ConvertFrom-StringData
$env:SUPABASE_URL = $localStatus.API_URL.Trim('"')
$env:SUPABASE_PUBLISHABLE_KEY = $localStatus.PUBLISHABLE_KEY.Trim('"')
$env:SUPABASE_SERVICE_ROLE_KEY = $localStatus.SERVICE_ROLE_KEY.Trim('"')
try {
  Invoke-NativeEvidenceStep "$evidenceRoot/05-auth.txt" { npm run test:auth }
  Invoke-NativeEvidenceStep "$evidenceRoot/06-network-rls.txt" { npm run test:network }
  Invoke-NativeEvidenceStep "$evidenceRoot/07-identity-rpc.txt" { npm run test:identity-hosted }
} finally {
  Remove-Item Env:SUPABASE_URL,Env:SUPABASE_PUBLISHABLE_KEY,Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
}
```

放行要求：两个升级起点和 fresh reset 都迁移到 `1020`；数据库测试 0 失败；lint 只检查应用 schema `private,public`，输出 `No schema errors`，且任何 error 都以非零退出码失败；RPC 返回 `registry_id` 和 `provider_last_sign_in_at`；`service_role` 对 `audit_logs` 仅有 `SELECT/INSERT`、对其 identity sequence 仅有 `USAGE`，anon/authenticated 无权限且 policy 数量为 0；越权、跨用户、失效终端和暂停账户均被拒绝。

先运行旧客户端兼容门禁：

```powershell
Invoke-NativeEvidenceStep "$evidenceRoot/08-old-client-gate.txt" { npm run test:old-client-compatibility }
```

该脚本固定检查历史 ref `2f7ba59`（DOSO `1.2.1`）的合同、一次性 build 和当前 schema 的静态兼容面；这些结果不能替代真实设备。未设置 `DOSO_OLD_CLIENT_REAL_DEVICE_EVIDENCE` 时，`real-device-smoke` 必须返回 `BLOCKED`、进程退出码为 2；helper 会把 `EXIT_CODE=2` 写入 evidence 后抛出异常，绝不把 `BLOCKED` 当成功。只有精确 `1.2.1` 二进制在受控账户/设备上完成 OTP、登录/恢复、profile/home、终端、设备绑定/解绑、退出/重启，并提供脚本要求的 JSON 证据，才算 smoke 通过。

## 2. 托管只读预检

先执行不需要 service-role、Management API token 或数据库密码的公开旁证。脚本固定校验 production project ref/hostname，只发送 publishable `apikey`，不带用户 Bearer session；只有目标函数名对应的精确 PostgreSQL EXECUTE ACL denial 才证明“存在但未进入函数体”。任何 2xx、函数体 `P0001/42501`、无结构 401 或 5xx 都会失败。发布前必须看到旧基线 heartbeat 为精确 ACL denial、两个 release RPC 仍缺失：

```powershell
Invoke-NativeEvidenceStep "$evidenceRoot/08a-public-rpc-preflight.txt" { npm run db:hosted-public-preflight }
```

该检查只回答 PostgREST schema cache 中公开 RPC 名称是否出现，不能证明 migration history、函数返回列、RLS、权限或数据迁移正确。网络、项目或 key 错误也必须停止调查，不能跳过。

凭据只从受控 secret store 注入当前终端。先由发布负责人把经过 Dashboard 核对的 ref 填入 `DOSO_SUPABASE_PROJECT_REF`，再执行：

```powershell
Invoke-NativeEvidenceStep "$evidenceRoot/09-link.txt" { npx supabase link --project-ref $env:DOSO_SUPABASE_PROJECT_REF }
Invoke-NativeEvidenceStep "$evidenceRoot/09-remote-migrations.txt" { npx supabase migration list --linked }
```

linked history 必须精确结束于 `20260823111035`，然后运行唯一适用的托管报告：

```powershell
# 仅当 exact head = 20260823111035，且 8 条 digest 证据匹配
Invoke-NativeEvidenceStep "$evidenceRoot/10-read-only-report.txt" { npx supabase test db supabase/verification/predeploy/hosted_pre_username_report.sql --linked }
Invoke-NativeEvidenceStep "$evidenceRoot/11-db-dry-run.txt" { npx supabase db push --dry-run --linked --skip-vault }
```

该报告会验证 read-only 事务、8 条版本/name/SQL digest 和精确 schema。`username_provenance_report.sql` 仅用于本地/其他已经精确到 `0900` 的环境，不适用于当前生产。history 或 digest 不符必须停止调查，不能换报告或使用 `migration repair`。

报告输出分为两类。当前生产只有 1 个用户/Profile/email identity，低于 `minimum_group_size=5`；脚本不会输出用户名来源、provider 分布或 anonymous anomaly ordinal/count，而会为这三类分别固定输出 `suppressed (minimum_group_size=5)`。证据只落盘硬不变量、总量和这些 suppression 标记。

- 硬停止：Auth 用户缺 Profile、orphan Profile、重复/非法用户名、identity subject 或 registry 跨账号冲突、迁移必需约束/格式破坏。
- 抑制属性：用户名来源、provider 分布和 anonymous anomaly samples 不提供 ordinal 或小样本计数，也不要求负责人解释报告没有输出的分类。若迁移判断确实需要分类，只能在受控、不落盘的会话中处理，或等相关分组达到至少 5 后按报告合同复核；不得把会话中的小样本属性转写到发布证据。

## 3. 恢复能力与生产确认门

当前 Free Production 明确没有自动 backup/PITR。生产写操作前必须建立真实恢复点、完成恢复演练并记录结果；风险接受不能替代这一硬门。

### 3.1 必须满足的恢复门

允许的恢复基础仅限以下两类之一：

1. 使用数据库密码在生产变更前按 Supabase 官方流程分别导出 roles、schema、data，并单独保留 `supabase_migrations` 的 schema/data，形成实际 logical backup；或
2. 已启用并核实可覆盖本次变更窗口的 physical backup/PITR restore point。

无论采用哪类，都必须先在隔离项目完成实际恢复演练，核对恢复后的 migration history、Auth/Profile/identity 数据和应用合同。当前项目为 Free、Dashboard 显示 `No backups`、未启用 PITR，因此眼下只有 logical dump 路径可行；没有数据库密码或无法完成 dump/恢复演练时就是 `STOP`，不得执行生产写入。

logical dump 命令如下；`DOSO_PRODUCTION_DB_URL` 默认使用 Dashboard **Connect** 面板给出的 Session pooler 连接串，只有当前网络明确支持 IPv6 或项目已启用 IPv4 add-on 时才使用 direct connection。连接串必须是完整 percent-encoded URI，尤其用户名/密码中的 `@:/?#[]%` 等字符必须先用 `[Uri]::EscapeDataString(...)` 编码；不得把未编码密码拼入 URI。文件写入加密、访问受控的仓库外目录，并记录结构化 filename/length/SHA-256、完成时间、操作者和恢复演练结果。CLI 已核对支持下列 flags。

先实际验证六个输出路径。所有路径必须是已存在私有目录下的绝对文件路径，彼此不同，且不能落在仓库、evidence 或公开同步目录；校验失败立即停止：

```powershell
try {
$repositoryRoot = (Resolve-Path -LiteralPath '.').Path
$evidenceFullPath = (Resolve-Path -LiteralPath $evidenceRoot).Path

function Assert-PrivateArtifactPath {
  param([Parameter(Mandatory)][string]$PathValue, [Parameter(Mandatory)][string]$Label)
  if (-not [IO.Path]::IsPathFullyQualified($PathValue)) { throw "$Label must be an absolute path" }
  $full = [IO.Path]::GetFullPath($PathValue)
  $parent = Split-Path -Parent $full
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw "$Label parent does not exist" }
  if (Test-Path -LiteralPath $full) { throw "$Label already exists; refusing to overwrite a recovery artifact" }
  $blockedRoots = @($repositoryRoot,$evidenceFullPath,$env:OneDrive,$env:OneDriveCommercial,$env:Dropbox) |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    ForEach-Object { [IO.Path]::GetFullPath($_) }
  foreach ($blockedRoot in $blockedRoots) {
    $prefix = $blockedRoot.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if ($full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw "$Label is inside a blocked root" }
  }
  return $full
}

$artifactVariables = @(
  'DOSO_DUMP_ROLES_PATH','DOSO_DUMP_SCHEMA_PATH','DOSO_DUMP_DATA_PATH',
  'DOSO_DUMP_HISTORY_SCHEMA_PATH','DOSO_DUMP_HISTORY_DATA_PATH','DOSO_DUMP_CUSTOM_DDL_PATH'
)
$resolvedArtifacts = foreach ($variableName in $artifactVariables) {
  $value = (Get-Item -LiteralPath "Env:$variableName" -ErrorAction Stop).Value
  $resolved = Assert-PrivateArtifactPath $value $variableName
  Set-Item -LiteralPath "Env:$variableName" -Value $resolved
  $resolved
}
if (($resolvedArtifacts | Sort-Object -Unique).Count -ne $resolvedArtifacts.Count) { throw 'backup artifact paths must be distinct' }

$triggerHashSql = @"
select md5(string_agg(
  tgname || ':' || regexp_replace(pg_get_triggerdef(oid, true), '\s+', '', 'g'),
  E'\n' order by tgname
))
from pg_trigger
where not tgisinternal
  and tgname in ('on_auth_user_created','sync_auth_identity_projection');
"@

try {
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-dump-roles.txt" -DoNotPersistOutput { npx supabase db dump --db-url $env:DOSO_PRODUCTION_DB_URL --file $env:DOSO_DUMP_ROLES_PATH --role-only } | Out-Null
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-dump-schema.txt" -DoNotPersistOutput { npx supabase db dump --db-url $env:DOSO_PRODUCTION_DB_URL --file $env:DOSO_DUMP_SCHEMA_PATH } | Out-Null
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-dump-data.txt" -DoNotPersistOutput { npx supabase db dump --db-url $env:DOSO_PRODUCTION_DB_URL --file $env:DOSO_DUMP_DATA_PATH --data-only --use-copy --exclude storage.buckets_vectors --exclude storage.vector_indexes } | Out-Null
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-dump-history-schema.txt" -DoNotPersistOutput { npx supabase db dump --db-url $env:DOSO_PRODUCTION_DB_URL --file $env:DOSO_DUMP_HISTORY_SCHEMA_PATH --schema supabase_migrations } | Out-Null
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-dump-history-data.txt" -DoNotPersistOutput { npx supabase db dump --db-url $env:DOSO_PRODUCTION_DB_URL --file $env:DOSO_DUMP_HISTORY_DATA_PATH --schema supabase_migrations --data-only --use-copy } | Out-Null

  # Supabase CLI 的普通 schema dump 会排除 managed auth/storage schema。无条件保存并哈希仓库评审过的最小 custom-DDL artifact；发布前 8-migration head 只有 on_auth_user_created，0900 才会创建 sync_auth_identity_projection；当前没有自定义 storage object。
  Copy-Item -LiteralPath 'supabase/rollback/20260824_auth_storage_custom_ddl.sql' -Destination $env:DOSO_DUMP_CUSTOM_DDL_PATH
  $productionTriggerHashOutput = Invoke-NativeEvidenceStep "$evidenceRoot/recovery-production-trigger-hash-exit.txt" -DoNotPersistOutput {
    # URL is sent over stdin, never placed in docker/psql argv or daemon metadata.
    $env:DOSO_PRODUCTION_DB_URL | docker run --rm -i -e DOSO_TRIGGER_HASH_SQL="$triggerHashSql" public.ecr.aws/supabase/postgres:17.6.1.159 `
      sh -lc 'IFS= read -r url; exec psql "$url" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align --command "$DOSO_TRIGGER_HASH_SQL"'
  }
  $productionTriggerHash = ($productionTriggerHashOutput | Out-String).Trim()
  if ($productionTriggerHash -notmatch '^[0-9a-f]{32}$') { throw 'production custom trigger hash is missing or malformed' }

  $artifactEvidence = foreach ($artifactPath in $resolvedArtifacts) {
    $item = Get-Item -LiteralPath $artifactPath
    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $artifactPath
    [pscustomobject]@{ fileName=$item.Name; length=$item.Length; sha256=$hash.Hash.ToLowerInvariant() }
  }
  if ($artifactEvidence.Where({ $_.length -le 0 }).Count -ne 0) { throw 'one or more backup artifacts are empty' }
  [pscustomobject]@{
    createdAt=(Get-Date).ToUniversalTime().ToString('o')
    artifacts=$artifactEvidence
    productionCustomTriggerDefinitionMd5=$productionTriggerHash
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath "$evidenceRoot/recovery-artifacts.json" -Encoding utf8
} catch {
  Remove-Item Env:DOSO_DUMP_ROLES_PATH,Env:DOSO_DUMP_SCHEMA_PATH,Env:DOSO_DUMP_DATA_PATH,Env:DOSO_DUMP_HISTORY_SCHEMA_PATH,Env:DOSO_DUMP_HISTORY_DATA_PATH,Env:DOSO_DUMP_CUSTOM_DDL_PATH -ErrorAction SilentlyContinue
  throw
} finally {
  Remove-Item Env:DOSO_PRODUCTION_DB_URL -ErrorAction SilentlyContinue
}
} finally {
  Remove-Item Env:DOSO_PRODUCTION_DB_URL -ErrorAction SilentlyContinue
}
```

随后自动创建一次性隔离 Supabase baseline stack。**禁止使用当前仓库的已迁移本地 stack**：它已经有 13 条应用迁移，导入生产前 8-migration backup 会造成 schema/history 冲突。当前 host 没有 `psql`，但 Docker 已可用且本地已有 `public.ecr.aws/supabase/postgres:17.6.1.159`；因此临时目录只运行 `supabase init` 生成零 application migration 的 config，分配唯一 project id/ports，启动仅 DB 所需的 baseline，再使用其 DB container 内置 `psql`。baseline 必须仍含 Supabase 初始化的 `auth.users` 和 `storage.objects` managed relations。恢复顺序为：第一事务 `roles -> schema -> SET session_replication_role=replica -> data`，第二事务 history schema/data，第三事务 custom DDL。`docker cp` 只复制六个已校验文件；无论成功失败，`finally` 都停栈并只在严格验证临时路径后递归清理：

```powershell
$temporaryBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$restoreLeaf = "doso-restore-$([guid]::NewGuid().ToString('N'))"
$restoreWorkdir = [IO.Path]::GetFullPath((Join-Path $temporaryBase $restoreLeaf))
$temporaryPrefix = $temporaryBase.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $restoreWorkdir.StartsWith($temporaryPrefix,[StringComparison]::OrdinalIgnoreCase) -or $restoreLeaf -notmatch '^doso-restore-[0-9a-f]{32}$') {
  throw 'refusing unsafe restore workdir'
}

$restoreProjectId = "dosorestore$([guid]::NewGuid().ToString('N').Substring(0,16))"
$restoreContainer = "supabase_db_$restoreProjectId"
$restoreRoot = '/tmp/doso-release-restore'
$stackAttempted = $false
$primaryFailure = $null
$cleanupFailure = $null

try {
  New-Item -ItemType Directory -Path $restoreWorkdir -ErrorAction Stop | Out-Null
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-baseline-init.txt" { npx supabase init --workdir $restoreWorkdir }

  $migrationRoot = Join-Path $restoreWorkdir 'supabase/migrations'
  if ((Test-Path -LiteralPath $migrationRoot) -and (Get-ChildItem -LiteralPath $migrationRoot -Filter '*.sql' -File).Count -ne 0) {
    throw 'restore baseline unexpectedly contains application migrations'
  }

  $reservedPorts = [Collections.Generic.HashSet[int]]::new()
  while ($reservedPorts.Count -lt 20) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
    try { $listener.Start(); [void]$reservedPorts.Add(([Net.IPEndPoint]$listener.LocalEndpoint).Port) }
    finally { $listener.Stop() }
  }
  $portQueue = [Collections.Generic.Queue[int]]::new([int[]]$reservedPorts)
  $configPath = Join-Path $restoreWorkdir 'supabase/config.toml'
  $config = Get-Content -LiteralPath $configPath -Raw
  $config = [regex]::Replace($config, '^project_id\s*=\s*"[^"]*"', "project_id = `"$restoreProjectId`"", 'Multiline')
  $config = [regex]::Replace($config, '^(\s*(?:port|shadow_port|inspector_port)\s*=\s*)\d+(\s*(?:#.*)?)$', {
    param($match)
    if ($portQueue.Count -eq 0) { throw 'restore config has more port fields than reserved ports' }
    return $match.Groups[1].Value + $portQueue.Dequeue() + $match.Groups[2].Value
  }, 'Multiline')
  Set-Content -LiteralPath $configPath -Value $config -Encoding utf8

  $stackAttempted = $true
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-baseline-start.txt" {
    npx supabase start --workdir $restoreWorkdir --exclude gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
  }
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-baseline-container.txt" { docker inspect $restoreContainer --format '{{.Name}}' }
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-baseline-managed-schema.txt" {
    docker exec $restoreContainer psql --no-psqlrc --set ON_ERROR_STOP=1 --username postgres --dbname postgres --command "do `$`$ begin if to_regclass('auth.users') is null or to_regclass('storage.objects') is null then raise exception 'managed_schema_missing'; end if; end `$`$;"
  }

  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-restore-mkdir.txt" { docker exec $restoreContainer mkdir -p $restoreRoot }
  $copyMap = @(
    @($env:DOSO_DUMP_ROLES_PATH,'roles.sql'), @($env:DOSO_DUMP_SCHEMA_PATH,'schema.sql'),
    @($env:DOSO_DUMP_DATA_PATH,'data.sql'), @($env:DOSO_DUMP_HISTORY_SCHEMA_PATH,'history-schema.sql'),
    @($env:DOSO_DUMP_HISTORY_DATA_PATH,'history-data.sql'), @($env:DOSO_DUMP_CUSTOM_DDL_PATH,'custom-ddl.sql')
  )
  foreach ($entry in $copyMap) {
    Invoke-NativeEvidenceStep "$evidenceRoot/recovery-copy-$($entry[1]).txt" { docker cp $entry[0] "${restoreContainer}:${restoreRoot}/$($entry[1])" }
  }
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-restore-application.txt" {
    docker exec $restoreContainer psql --no-psqlrc --set ON_ERROR_STOP=1 --username postgres --dbname postgres --single-transaction `
      --file "$restoreRoot/roles.sql" --file "$restoreRoot/schema.sql" `
      --command 'set session_replication_role = replica' --file "$restoreRoot/data.sql"
  }
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-restore-history.txt" {
    docker exec $restoreContainer psql --no-psqlrc --set ON_ERROR_STOP=1 --username postgres --dbname postgres --single-transaction `
      --file "$restoreRoot/history-schema.sql" --file "$restoreRoot/history-data.sql"
  }
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-restore-custom-ddl.txt" {
    docker exec $restoreContainer psql --no-psqlrc --set ON_ERROR_STOP=1 --username postgres --dbname postgres --single-transaction `
      --file "$restoreRoot/custom-ddl.sql"
  }
  $restoredTriggerHashOutput = Invoke-NativeEvidenceStep "$evidenceRoot/recovery-restored-trigger-hash-exit.txt" -DoNotPersistOutput {
    docker exec $restoreContainer psql --no-psqlrc --set ON_ERROR_STOP=1 --username postgres --dbname postgres --tuples-only --no-align --command $triggerHashSql
  }
  $restoredTriggerHash = ($restoredTriggerHashOutput | Out-String).Trim()
  if ($restoredTriggerHash -ne $productionTriggerHash) { throw 'restored custom Auth trigger definitions differ from production' }
  [pscustomobject]@{ productionMd5=$productionTriggerHash; restoredMd5=$restoredTriggerHash; match=$true } |
    ConvertTo-Json | Set-Content -LiteralPath "$evidenceRoot/recovery-trigger-restore.json" -Encoding utf8
  Invoke-NativeEvidenceStep "$evidenceRoot/recovery-restored-hosted-baseline.txt" {
    Get-Content -LiteralPath 'supabase/verification/predeploy/hosted_pre_username_report.sql' -Raw |
      docker exec -i $restoreContainer psql --no-psqlrc --set ON_ERROR_STOP=1 --username postgres --dbname postgres --file -
  }
} catch {
  $primaryFailure = $_
} finally {
  if ($stackAttempted) {
    try { Invoke-NativeEvidenceStep "$evidenceRoot/recovery-baseline-stop.txt" { npx supabase stop --no-backup --workdir $restoreWorkdir } }
    catch { $cleanupFailure = $_ }
  }
  try {
    if (Test-Path -LiteralPath $restoreWorkdir) {
      $resolvedCleanup = (Resolve-Path -LiteralPath $restoreWorkdir).Path
      if (-not $resolvedCleanup.StartsWith($temporaryPrefix,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolvedCleanup) -ne $restoreLeaf) {
        throw 'refusing unsafe recursive restore-workdir cleanup'
      }
      Remove-Item -LiteralPath $resolvedCleanup -Recurse -Force
    }
  } catch {
    if ($cleanupFailure) { $cleanupFailure = [AggregateException]::new('restore cleanup failed', @($cleanupFailure.Exception,$_.Exception)) }
    else { $cleanupFailure = $_ }
  }
  Remove-Item Env:DOSO_RESTORE_DB_CONTAINER,Env:DOSO_RESTORE_DB_URL,Env:DOSO_DUMP_ROLES_PATH,Env:DOSO_DUMP_SCHEMA_PATH,Env:DOSO_DUMP_DATA_PATH,Env:DOSO_DUMP_HISTORY_SCHEMA_PATH,Env:DOSO_DUMP_HISTORY_DATA_PATH,Env:DOSO_DUMP_CUSTOM_DDL_PATH -ErrorAction SilentlyContinue
}
if ($primaryFailure -and $cleanupFailure) { throw [AggregateException]::new('restore drill and cleanup failed', @($primaryFailure.Exception,$cleanupFailure.Exception)) }
if ($primaryFailure) { throw $primaryFailure }
if ($cleanupFailure) { throw $cleanupFailure }
```

该备份在生产写入前生成，因此恢复后的 migration history 必须精确为发布前 `8` 条，并运行 `hosted_pre_username_report.sql` 的 `17/17` 基线检查；不能要求此时通过发布后 postflight。此时 custom DDL/生产 hash 集合精确只有 `on_auth_user_created`；`sync_auth_identity_projection` 由 `0900` 在应用五迁移 tail 时创建。生产发布成功后，正常线上 history 才必须为 `13` 条并通过 `35/35` postflight。若事故后增加 forward-fix，则期望 history 是这 `13` 条加经评审的更大 timestamp 迁移，不能继续硬套 `13` 条。恢复演练还必须确认 Auth/Profile/identity 数据、生产实际 custom trigger 集合、无自定义 storage object 的声明和应用合同。任何 artifact 缺失、为空、哈希不匹配、trigger 定义不匹配或恢复事务失败，均为 `STOP`。

### 3.2 可选的付费 preview staging

当前为 0 branches。用户明确批准当前显示的 `$0.01344/hour` 费用后，可以创建短时 preview branch，在其上应用并验证五迁移 tail、35 项 postflight、合同测试与 changed `admin-users`。Branch 默认无生产数据，只用于隔离 schema/配置的 staging 验证，绝不是生产备份，也不能替代 3.1 的恢复门。验证完成后按批准窗口删除并记录实际费用。

### 3.3 production-private snapshot 仅作诊断证据

可以由受控 Supabase connector/控制台生成 production-private snapshot，保存 8 条 migration version/name/order/digest、schema/RPC/函数 canonical hash、Provider 开关、报告总量和三类固定 suppression 标记；不得包含 token、密码、邮箱、UUID、原始 identity subject、provider 分布、用户名来源属性或 anonymous anomaly samples。

该 snapshot 只能帮助确认原状态和设计 forward-fix。它不能还原 `auth` 内部数据、用户密码/会话、用户级行或任意时间点数据库，不是 logical/physical backup 或 PITR，不能满足 3.1 的生产恢复门。

完成恢复门后，项目所有者与发布负责人还要共同记录：

- Dashboard 中的组织、项目名、区域、ref、URL 截图或导出；
- `migration list` 与 dry-run 的精确迁移清单；
- 实际 logical/physical backup 或 PITR 的证据路径、覆盖窗口、限制与恢复演练结果；logical dump 还要记录 SHA-256；
- 若另存 private snapshot，明确标为 `diagnostic only`，不得写成恢复点；
- Provider flags 仍关闭的截图或配置摘要；
- canary 会创建/删除临时账户和测试数据的明确批准；
- 生产变更窗口、观察人和停止联系人。

确认记录缺任何一项，不执行下一节。控制台已经确认的 ref 仍需在本次窗口再次核对，避免终端 link 被切到其他项目。

官方依据：[Database Backups](https://supabase.com/docs/guides/platform/backups)、[Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)、[Branching](https://supabase.com/docs/guides/deployment/branching)。

## 4. 生产执行顺序

一次只执行一个阶段，读完输出再继续。禁止 `db reset`、`migration repair`、手工改迁移历史或在生产执行 seed。

### 4.1 数据库

```powershell
Invoke-NativeEvidenceStep "$evidenceRoot/12-db-push.txt" { npx supabase db push --linked --skip-vault }
Invoke-NativeEvidenceStep "$evidenceRoot/13-postflight-migrations.txt" { npx supabase migration list --linked }
Invoke-NativeEvidenceStep "$evidenceRoot/14-postflight-35.txt" { npx supabase test db supabase/verification/postdeploy/username_identity_postflight.sql --linked }
Invoke-NativeEvidenceStep "$evidenceRoot/15-postflight-dry-run.txt" { npx supabase db push --dry-run --linked --skip-vault }
Invoke-NativeEvidenceStep "$evidenceRoot/15a-public-rpc-postflight.txt" { npm run db:hosted-public-postflight }
```

postflight migration 证据必须精确匹配以下 13 条记录的 `version/name/order/digest`，不得只检查最新 head 或 tail：

| Order | Version | Name | 去空白 MD5 digest |
| ---: | --- | --- | --- |
| 1 | `20260822185808` | `create_doso_accounts_and_devices` | `b5edb16ee251624850f959dbe96f307b` |
| 2 | `20260822185822` | `grant_service_role_access` | `a0d5728aef6ff30c178d0e33dd098541` |
| 3 | `20260822185835` | `add_account_terminal_security` | `556fc0d748a1571f8c775507d83c1059` |
| 4 | `20260822185849` | `harden_network_backend` | `328d8c93ba189a553767e7be1740452f` |
| 5 | `20260822185907` | `add_admin_account_consistency` | `b74e8af42f5b19092c74b62ee0f2ef28` |
| 6 | `20260822190119` | `enable_private_claims_rls` | `c7a7b819f478a3c0b50baad81abb3411` |
| 7 | `20260823110629` | `add_unique_usernames` | `8f574decc66e6f9996913fb26b1bf381` |
| 8 | `20260823111035` | `inline_username_constraint` | `a7022548c34aede959def4620f60166f` |
| 9 | `20260823130000` | `add_one_time_username_claim` | `9dc20503cf47971617cc30ffa4d5cc4a` |
| 10 | `20260824090000` | `add_external_identity_registry` | `84bb557311647d71066a5d1bf689ae9e` |
| 11 | `20260824100000` | `add_username_provenance` | `eeba323cd9188cd8e60c1666e3621be8` |
| 12 | `20260824101000` | `canonicalize_login_method_contract` | `b8c362141a329cfd51ef9d1916b28a27` |
| 13 | `20260824102000` | `harden_audit_log_privileges` | `708e3582c625e062eacf8288028c9272` |

放行要求：上述 13 条精确匹配；postflight 的 35 项 schema、权限、RPC、数据一致性检查全部 `ok`，其中审计表与 sequence 最小权限及零 policy 必须通过；随后 dry-run 没有待部署迁移，绑定 production project 的公开 schema-cache 旁证确认两个 release RPC 已出现并返回精确 EXECUTE ACL denial；没有 migration error、锁超时或 schema drift。不能用公开旁证、migration list 或 dry-run 替代 13 条 digest 比对或 35 项 postflight。

### 4.2 四函数对齐与 changed function 部署

```powershell
Invoke-NativeEvidenceStep "$evidenceRoot/16-admin-users-deploy.txt" { npx supabase functions deploy admin-users --project-ref $env:DOSO_SUPABASE_PROJECT_REF }
```

不要加 `--no-verify-jwt`，不要加 `--prune`。生产前证据已证明 `account-sessions`、`device-binding`、`admin-devices` 与本地 canonical hash 一致，不重新部署；`admin-users` 是唯一 changed function。部署后用 Supabase connector/控制台重新列出四函数，确认全部 `ACTIVE`、`verify_jwt=true`，并重新取得远端源码 canonical hash：前三个保持原 hash，`admin-users` 必须与本地新入口及共享文件一致。缺少 post-deploy list/hash 证据时不得进入 canary。

### 4.3 托管合同 canary

在受控进程中注入已确认目标的 `SUPABASE_URL`、publishable key 和 service-role key；不要把值写入命令、历史或证据。以下脚本会创建临时 canary 账户并在 `finally` 中尝试清理：

```powershell
$env:VERIFY_EDGE_FUNCTIONS = 'true'
try {
  Invoke-NativeEvidenceStep "$evidenceRoot/17-identity-hosted.txt" { npm run test:identity-hosted }
  Invoke-NativeEvidenceStep "$evidenceRoot/18-network-functions.txt" { npm run test:network }
} finally {
  Remove-Item Env:SUPABASE_URL,Env:SUPABASE_PUBLISHABLE_KEY,Env:SUPABASE_SERVICE_ROLE_KEY,Env:VERIFY_EDGE_FUNCTIONS -ErrorAction SilentlyContinue
}
```

放行要求：临时数据清理成功；真实 PostgREST 合同字段、RLS、管理员权限、终端撤销和四函数授权全部通过；日志中没有 PGRST202、未处理 5xx、token 或用户标识。清理失败也记为 `FAIL` 并人工清理专用 canary 数据，不能忽略。

### 4.4 旧/新客户端 smoke

进入旧客户端构建或验证前，必须确认 4.3 的 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`VERIFY_EDGE_FUNCTIONS` 均已从进程环境删除。旧 `1.2.1` production gate 必须在新的专用终端中使用独立最小环境，只注入 `DOSO_OLD_CLIENT_SUPABASE_URL`、`DOSO_OLD_CLIENT_PUBLISHABLE_KEY`、只读 `DOSO_OLD_CLIENT_ACCESS_TOKEN`、`DOSO_OLD_CLIENT_PROJECT_REF`、`DOSO_OLD_CLIENT_ARTIFACT_PATH` 和 `DOSO_OLD_CLIENT_REAL_DEVICE_EVIDENCE`；绝不注入 service-role key。

真实设备证据 JSON 必须绑定实际安装的 `1.2.1` artifact、实际 SHA-256、平台工具验证的真实签名身份、项目 ref `vchvqfdlkomlrjenkdhj`、当前 40 字符 Git SHA、精确 production URL 和 UTC `checkedAt`。`checkedAt` 必须位于脚本允许的当前 14 天发布窗口内；历史 ref `2f7ba59`、版本和六项 smoke 结果也必须完全匹配。只有描述或截图、没有可读取 artifact/哈希/签名/项目/current Git/时间绑定的证据均为 `BLOCKED`。

```powershell
$forbiddenProductionVars = 'SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','VERIFY_EDGE_FUNCTIONS'
$leakedProductionVars = $forbiddenProductionVars | Where-Object { Test-Path "Env:$_" }
if ($leakedProductionVars) { throw "production credentials remain in process environment: $($leakedProductionVars -join ', ')" }

try {
  Invoke-NativeEvidenceStep "$evidenceRoot/19-old-client-compatibility.txt" { npm run test:old-client-compatibility -- --production }
} finally {
  Remove-Item Env:DOSO_OLD_CLIENT_SUPABASE_URL,Env:DOSO_OLD_CLIENT_PUBLISHABLE_KEY,Env:DOSO_OLD_CLIENT_ACCESS_TOKEN,Env:DOSO_OLD_CLIENT_PROJECT_REF,Env:DOSO_OLD_CLIENT_ARTIFACT_PATH,Env:DOSO_OLD_CLIENT_REAL_DEVICE_EVIDENCE -ErrorAction SilentlyContinue
}
```

脚本总体必须为 `PASS`，且 `real-device-smoke` 必须为 `PASS`。只有 historical build/static 为 `PASS`、runtime 为 `SKIP` 或真实设备为 `BLOCKED` 时，旧客户端仍未放行。

1. `1.2.1`：邮箱登录、会话恢复、终端列表/撤销、设备列表、退出登录；不得崩溃、白屏或因新增列/RPC 合同失效。
2. 当前发布候选（以 manifest `appVersion` 与实际构建为准）：重复上述流程；验证显式注册用户名不被错误拦截，历史推导/社交 provisional 必须进入首次用户名设置；登录方式页只展示 canonical 字段，不泄露 subject/token。
3. 观察 Auth、PostgREST、Edge Function 日志；PGRST202、持续 5xx、跨用户数据、错误用户名门禁或旧客户端失败均为 `STOP`。

完成 smoke 之前不发布新客户端，不启用 Apple/微信/QQ Provider。DB-first 完成只代表账号后端具备发布条件，不代表社交登录或机器人控制已上线。

## 5. 证据 manifest

将下列结构保存为 `$evidenceRoot/manifest.json`；只能填写真实执行结果，未执行项用 `BLOCKED`，不能预填 `PASS`。

```json
{
  "runId": "<run-id>",
  "gitSha": "<40-char-sha>",
  "appVersion": "<current-app-version>",
  "target": {
    "projectName": "DOSOrobotics",
    "branch": "main",
    "environment": "Production",
    "region": "us-east-1",
    "projectRef": "vchvqfdlkomlrjenkdhj",
    "projectUrl": "https://vchvqfdlkomlrjenkdhj.supabase.co",
    "confirmationRecord": "<relative-evidence-path>"
  },
  "recovery": {
    "method": "logical-dump|physical-backup|pitr",
    "automaticBackup": false,
    "backupEvidence": "<relative-evidence-path>",
    "artifactSha256": "<sha256-or-not-applicable>",
    "restoreDrill": "PASS|FAIL|BLOCKED",
    "riskAcceptance": "<relative-evidence-path>"
  },
  "providerFlags": {
    "apple": false,
    "wechat": false,
    "qq": false
  },
  "results": {
    "fullBacklogUpgrade": "PASS|FAIL|BLOCKED",
    "g002Upgrade": "PASS|FAIL|BLOCKED",
    "hostedPreflight": "PASS|FAIL|BLOCKED",
    "databasePush": "PASS|FAIL|BLOCKED",
    "postflight35": "PASS|FAIL|BLOCKED",
    "functionAlignment": "PASS|FAIL|BLOCKED",
    "adminUsersDeploy": "PASS|FAIL|BLOCKED",
    "hostedContracts": "PASS|FAIL|BLOCKED",
    "oldClientSmoke": "PASS|FAIL|BLOCKED",
    "newClientSmoke": "PASS|FAIL|BLOCKED"
  },
  "startedAt": "<ISO-8601>",
  "finishedAt": "<ISO-8601>",
  "operators": ["<name>"],
  "notes": "<sanitized-notes>"
}
```

发生异常时立即停止后续阶段，并使用 `supabase/rollback/20260824_username_identity_recovery.md`。数据库已写入后不得自行编写 down migration；当前 Free 项目没有 PITR/自动备份，只能按生产写入前已经验证并演练的实际 backup/PITR 恢复路径处置。Private snapshot 只供诊断和 forward-fix 设计，不能执行数据恢复。
