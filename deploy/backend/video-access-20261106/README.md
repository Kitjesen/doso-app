# 视频授权业务发布候选

此增量基于已上线的十二层 device-admin 栈，增加单设备观看凭据签发、撤销与验证。已有五个函数直接取自 device-admin 发布快照，新包保留其文件内容。视频媒体服务的部署由独立 Rust 工程管理。

## 生成

在 App 工程根目录运行以下命令。

```powershell
node deploy/backend/video-access-20261106/package.mjs
```

归档包含七个业务函数、既有主路由器与共享模块、增量 SQL、Envoy/Nginx 配置和独立部署入口。准备脚本使用现有部署实现生成视频版本，验证十二层基线、只变更两个服务的发布挂载、备份数据库和配置，并保留原有 Nginx 检查与失败恢复。

`video-access` 使用正常账号 Bearer，由现有 authenticate 核对用户会话与设备归属。`video-authorize` 使用 64 位十六进制观看凭据，由函数本身验证摘要。现有运行时 `VERIFY_JWT=false` 和 Envoy 透传行为已适用，两条精确路径才会被公开。观看凭据不存入配置或日志。

## 安装与执行

将归档展开到一个新目录，再依次执行数据库和运行时阶段。

```sh
cd /opt/doso-backend-shadow/runtime-20261027/docker/doso/video-access-20261106
python3 deploy.py database
python3 deploy.py runtime
```

数据库阶段先备份并验证可读，事务内应用 `20261105110000_add_video_grants.sql` 和只读 postflight。重复执行时先检查现有状态，并使用 `sql/postflight.sql` 确认提交情况。运行时阶段追加第十三层，只更新 Functions 和 API 网关候选挂载，再扩展 Nginx 精确允许路径。输出分别为 `video_access_database_ready` 和 `video_access_runtime_ready`。

SQL 的 RPC 权限分别授予 authenticated 和 service_role，私有凭据摘要表拒绝客户端直接访问。新表保存短期观看凭据，应用请求与设备推流仍由现有各端逻辑执行。

## 验收与回退

公开接口应使用正常 TLS 校验。`video-access` 无 Bearer 请求应返回 401。`video-authorize` 无观看凭据请求应返回 401，格式有效但未知的 64hex 凭据加 `{"action":"video.view"}` 应返回 403。后者能确认请求抵达观看凭据 handler，需额外核实有效客户凭据的真实观看流程。

每阶段输出私有备份目录，包含原环境、完整十二层清单和配置。运行时部分失败后，按记录检查 Functions、API 网关与 Nginx，使用备份的十二层清单恢复两个服务及原 Nginx 配置。SQL 已提交时保留表和函数，回退运行时不会清除设备或观看数据。私有环境文件在发布前后逐字核验。

2026-11-06 已完成业务数据库和运行时发布，两阶段均返回 ready、原核心服务保持运行；数据库备份位于 `/opt/doso-backend-shadow/env/video-access-database-gspcjmuk`，运行时备份位于 `/opt/doso-backend-shadow/env/video-access-runtime-oel7xivm`。通过正常 TLS 请求实测：video-access 无凭据 401，video-authorize 无凭据 401、未知观看凭据 403；admin-devices 和 remote-state-sync 的未授权请求仍为 401。真实用户签发观看凭据、Rust 媒体服务调用和 App 播放尚未验收。

## 本地验证

2026-11-06，快照与精确路由检查、配置渲染和四项部署边界测试通过。原样发布 SQL 在隔离 PostgreSQL 的 `postgres` 库成功提交，只读 postflight 通过。重复 apply 被拒绝，已有函数权限保持通过 postflight。既有验证入口共 34 组通过，集群已停止，证据位于 `artifacts/multi-device/2026-11-05T20-08-26-835Z/verification.json`。

```powershell
node deploy/backend/video-access-20261106/verify.mjs
python deploy/backend/video-access-20261106/deploy_test.py
node scripts/verify-multi-device-ownership.mjs
```

部署脚本由前一版本生成，沿用其 Nginx 失败恢复和核心服务检查。实际 Docker Compose、Envoy 容器校验及线上 TLS 仍须在发布阶段确认。
