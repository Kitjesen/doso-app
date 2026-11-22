# 阿里云 device-cloud 发布候选

2026-11-04状态：本目录增量已在上海业务实例实际发布，SQL事务提交，Functions/Envoy更新成功。当前为十一层配置；下述脚本用于此次十层基线的一次性升级，不能把成功后的再次执行当作普通重启。现场发布与公网检查见[部署记录](../../../docs/production/DOSO_BACKEND_DEPLOYMENT.md)。

2026-11-04 UUID 认领更新处于本地候选状态。准备脚本现在同时复制 `_shared/deviceBinding.ts` 和 `sql/20261104090000_claim_device_by_uuid.sql`。新 App 使用 `deviceId`，已安装 App 的 `serialNumber` 由同一 UUID 认领事务承接。在已运行十一层的实例上，发布顺序为备份数据库、单事务应用这份 UUID 迁移、校验新旧 RPC 的 service-role 权限，再按现有十一层 Compose 配置刷新 Functions。下述 `deploy-database.py` 与 `deploy.py` 继续保留十层基线首次升级的执行约束。此 UUID 候选的线上发布仍待单独执行与验收。

本目录用于现有阿里云自建后端的增量发布。先运行准备与校验，再将本目录配置和生成的 `functions/` 一起复制到服务器 `docker/doso/device-cloud-20261103/`。

```powershell
node deploy/backend/device-cloud-20261103/prepare.mjs
node deploy/backend/device-cloud-20261103/verify.mjs
node deploy/backend/device-cloud-20261103/package.mjs
```

`supabase/functions/` 是业务函数与共享模块的唯一维护源。准备脚本复制四个入口所需源码，沿用已部署 account-sessions 候选的主路由器和 import map。`functions/` 是被 Git 忽略的发布产物，每次发版前重新生成。修改业务逻辑后必须重新准备和校验。

`package.mjs` 重新准备并校验后，用显式文件名单生成本目录的 `device-cloud-20261103.tar.gz`。上传包包含被 Git 忽略的 `functions/`、三个运行配置、两个部署脚本、六份 `sql/` 文件和本说明，排除开发校验脚本和本地测试。

## 远端执行

先完成 SQL 前置检查。将上传包放到服务器私有暂存路径，例如 `/root/device-cloud-20261103.tar.gz`，由部署负责人执行以下命令。上传包解包路径应为新建目录，保留现有 account-sessions 发布目录。

```sh
set -eu
umask 077
release=/opt/doso-backend-shadow/runtime-20261027/docker/doso/device-cloud-20261103
test ! -e "$release"
mkdir -m 0755 "$release"
tar --no-same-owner -xzf /root/device-cloud-20261103.tar.gz -C "$release"
find "$release" -type d -exec chmod 0755 {} +
find "$release" -type f -exec chmod 0644 {} +
chmod 0600 "$release/compose.device-cloud.yml" "$release/deploy.py" "$release/deploy-database.py"
```

先单独执行数据库步骤，要求退出码为零且返回 `device_cloud_database_committed`。

```sh
python3 /opt/doso-backend-shadow/runtime-20261027/docker/doso/device-cloud-20261103/deploy-database.py
```

数据库脚本核对 `supabase-db` 属于现有自建项目且健康，在 `env/` 下新建 0700 备份目录，将 `pg_dump -U postgres -d postgres -Fc` 输出流写入 0600 的 `postgres.dump`，再用容器内 `pg_restore --list` 验证。成功后才将五份 SQL 复制到唯一容器临时目录，并执行 `psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f apply.sql`。所有数据库输出被捕获，失败时立即停止。`apply.sql` 自带单事务与 postflight，重复应用明确拒绝。若提交状态不明，先按 SQL 交付执行只读 postflight。

数据库步骤确认成功后，由部署负责人单独执行运行时步骤。

```sh
python3 /opt/doso-backend-shadow/runtime-20261027/docker/doso/device-cloud-20261103/deploy.py
```

执行前确认目录为空或此次新建，避免覆盖其他人在同名目录准备的工作。脚本固定核对现有十层路径和 Functions 的实际 Compose labels，只支持本次十层到十一层增量。

脚本只导入现有 `/opt/doso-backend-shadow/tools/otp-six-20261027/start-shadow-core.py` 的私有 Docker 客户端与 env 锁，复用其 Unix socket、输出捕获和超时行为。它先核对六个 running 服务及适用的健康检查、现有镜像/env/bind，再把私有 env、十层配置、有效 Compose 模型和容器元数据备份到 `env/device-cloud-20261103-*`。备份目录为 0700，文件为 0600。

脚本在远端生成并原子写入缺失的同步命名 key，保留其他 env 和命名 key。随后比较合并模型、运行现有 Envoy validator，只更新 `functions` 与 `api-gw`，最后验证六服务 running 与适用的健康检查与四个 core 服务的容器身份、配置、挂载和启动时间。所有 Docker 输出均被捕获，stdout 仅报告固定状态和私有备份路径。

如果脚本失败，按输出的 `stage` 和备份路径检查当前状态。`private_environment` 之后私有 env 可能已更新，`functions_update` 之后函数容器可能已更新，`gateway_update` 之后网关可能已更新。脚本保留现场，部署负责人用备份 env 与原十层参数对照恢复需要的两个服务，再确认健康状态。已成功完成或部分更新后，先核对实际 Compose labels 和挂载，再决定恢复或继续。

## 接口与鉴权

保留精确路径 `/functions/v1/account-sessions`，增加三个精确路径。各路径重写后保留函数名，子路径、尾斜杠及其他函数继续走已有 404。

| 路径 | 方法 | 实际认证 |
| --- | --- | --- |
| `/functions/v1/device-binding` | POST、OPTIONS | 用户 Bearer、Auth getUser、有效 profile、当前 Auth session 与 terminal RLS |
| `/functions/v1/remote-state` | GET、POST、OPTIONS | 同上，RPC 使用用户 RLS 客户端 |
| `/functions/v1/remote-state-sync` | POST、OPTIONS | handler 校验 `SUPABASE_SECRET_KEYS` 中 `remote-state-sync` 独立密钥 |

现有 Functions Lua 会拒绝未注册的 `sb_` 密钥。候选仅在该过滤器移除客户端 `sb-api-key` 后，对精确路由名 `doso-remote-state-sync-only` 提前返回，保留原始 `apikey` 供 handler 校验。其他 Functions 路径的密钥转换和 Auth/REST API 认证保留现行逻辑。同步密钥仅放 `apikey` 请求头，handler 不接受 query 或 Bearer 作为替代。

在现有自建后端的私有环境文件中显式配置 `SUPABASE_SECRET_KEYS` JSON 对象，其中必须包含 `remote-state-sync`。用独立随机值，避免复用 anon、service-role 或网关主 secret。Compose 将该值传入 functions，固定 `DOSO_REMOTE_SYNC_SECRET_NAME=remote-state-sync`。配置缺失会阻止 Compose 启动，JSON 或命名项无效时 handler 返回 503，错误密钥返回 401。实际密钥由部署人员在私有环境中生成和保存。

## 部署顺序与边界

1. 先读取线上实际六个服务的状态、镜像、挂载和生效的十层 Compose 参数，确认与当前运行的 account-sessions 层相符。使用当前运行配置追加本层 `doso/device-cloud-20261103/compose.device-cloud.yml`。旧安装器会建立历史环境，本次增量发布直接使用已运行项目。
2. 先按数据库交付审阅并应用 remote-state 与多设备 SQL，以及当前共享认证依赖的 Auth-session/terminal 权限。确认已部署能力满足当前四个源码入口，再更新 API。
3. 保留现有私有 env 全部配置与密钥，仅增加上述专用命名项。先在内存验证合并后的 Compose，确认只有 `api-gw` 和 `functions` 的允许字段变化。CDS 与现有 account-sessions 字节一致，网关 bootstrap 和 validator 继续复用既有挂载。
4. 在服务器用现有缓存的固定 edge-runtime 镜像与 Deno cache 验证全部函数的依赖导入和候选 Envoy 配置。先只重建 `functions`，再只重建 `api-gw`，使用 `--no-deps --pull never`。其他四个 core 服务的容器、env、数据卷及启动时间应保持现状。
5. 由主部署流程配置可信 HTTPS，并通过最终 HTTPS 域名验证接口。核对 account-sessions 原功能、合法用户多设备读写、跨账户拒绝、撤销会话拒绝、同步接口合法/非法专用 key、其余 API 对专用 key 的拒绝，以及额外函数路径 404。同步测试选择空 batch 或专用测试设备，保留现有业务数据。

此候选的本地检查覆盖配置差异、源码复制一致性与 Deno 入口类型。实际 Envoy 启动、依赖缓存、SQL 权限、HTTPS 和线上端到端结果由部署流程提供证据。
