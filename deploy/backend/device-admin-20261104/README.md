# 设备管理业务发布候选

> 2026-11-06 发布：已在业务服务器执行数据库与运行时发布，脚本均返回 ready，核心服务保持运行。以 `list_devices` 为请求体的未授权及无效凭据请求均返回 401；GET 返回 405，OPTIONS 实测返回 200。真实管理员 AAL2 调用与设备登记尚未验收。

本次补齐管理员设备管理入口，并将设备创建、绑定码更新、强制解绑与各自的操作记录放入同一数据库事务。操作记录写入失败时，业务变更也回滚，前端不会收到“失败”却留下已完成的变更。

已执行线上迁移和接口发布，尚未创建真实库存或安装机器狗程序。源代码在 `supabase/functions/` 和 `supabase/migrations/`，本目录的 `functions/`、配置及迁移副本由准备脚本生成。

## 支持的接口

`POST /functions/v1/admin-devices`，请求体通过 `action` 指定操作：

| action | 功能 | 结果 |
| --- | --- | --- |
| `list_devices` | 分页、搜索设备库存 | 设备列表及分页信息 |
| `create_inventory` | 创建未归属用户的实体设备 | HTTP 201；重复序列号为 409 |
| `rotate_binding_code` | 更新短期认领码 | 明文只返回一次，数据库只保存摘要 |
| `issue_factory_claim` | 为未归属的实体库存签发认领二维码内容 | 调用方明确指定有效期；认领密钥只返回一次 |
| `unbind` | 管理员强制解绑 | 保留既有授权代次、远程状态撤销逻辑 |

入口要求有效管理员账号、有效登录会话和 AAL2 多因素认证。普通用户、已撤销会话及无认证请求不能操作。内部数据库 RPC 仅授予 `service_role`，并再次核对管理员角色；App 不持有服务密钥。绑定码及其摘要不写入操作记录。

## 生成与检查

在 App 工程根目录执行：

```powershell
node deploy/backend/device-admin-20261104/prepare.mjs
node deploy/backend/device-admin-20261104/verify.mjs
node deploy/backend/device-admin-20261104/package.mjs
```

归档为本目录 `device-admin-20261104.tar.gz`。它包含五个当前业务函数、现有主路由器和共享模块、Envoy/Nginx 配置、增量部署脚本及三份新迁移。安装凭据和私钥不进入归档。既有部署 helper 从其维护源生成 `runtime_base.py`、`database_base.py`，发布时不依赖线上旧 helper 拥有新增参数。

本次同时纳入 `20261104090000_claim_device_by_uuid.sql`：当前设备认领代码已调用 UUID RPC，需要与数据库配套。`20261104100000_create_device_inventory.sql` 提供三个管理员事务 RPC，`20261104110000_issue_factory_claim.sql` 提供实体库存认领凭证签发 RPC。旧的远程状态、多设备迁移不重复执行。

## 部署入口

新目录 `/opt/doso-backend-shadow/runtime-20261027/docker/doso/device-admin-20261104` 应为独立候选目录，文件权限沿用现有发布流程。当前线上基线是十一层 Compose；不要重跑旧的十层首次升级脚本。

```sh
cd /opt/doso-backend-shadow/runtime-20261027/docker/doso/device-admin-20261104
python3 deploy.py database
python3 deploy.py runtime
```

`database` 先验证基线、备份数据库并检查备份可读，再以单事务应用三份新迁移。成功标记为 `device_admin_database_ready`。它只创建或更新数据库函数及权限，不生成设备、账号、认领码或证书。

`runtime` 先只读检查数据库依赖，再追加第十二层，仅更新 Functions 和 API 网关的候选文件挂载。私有环境配置保持不变，原四个核心服务的实例与挂载在前后检查中核对。Nginx 保留现有 HTTP/ACME 段，只扩展管理员精确路径；配置检查失败恢复原文件，reload 失败恢复并重载原配置。成功标记为 `device_admin_runtime_ready`，仍需公网接口验收。

每步输出阶段及私有备份路径，原始 Docker 输出、环境和密钥不打印。失败后先按阶段核对现场，不能直接重复运行一次性升级：SQL 提交状态不明时先运行 `sql/postflight.sql`；运行时部分更新时，使用保存的十一层清单及配置恢复或继续处理 Functions、API 网关和 Nginx。不要删除设备记录来回退代码。

## 验证范围

2026-11-05：本次 10 项部署脚本测试通过；现有多设备 PostgreSQL 检查共 21 组通过，其中三组覆盖工厂认领的管理员与库存限制、有效期、摘要、审计、重新签发和单次认领。完整三迁移发布事务在独立 PostgreSQL 的 `postgres` 库原样执行，postflight 通过；重复 apply 被拒绝且函数与权限保持不变，独立只读 postflight 通过。两个验证集群均已确认停止。证据为 `artifacts/multi-device/2026-11-05T10-38-26-456Z/verification.json` 和 `artifacts/device-admin-release/20261105T104441Z/verification.json`。

本次使用项目原有版本 Deno 2.5.6，通过官方 npm 包与隔离缓存运行。管理员接口 13 项、共享认证逻辑 15 项及认领 6 项，共 34 项测试通过；管理员入口和对应测试的 Deno check、管理员文件的 lint/fmt --check 通过。没有修改全局工具或项目依赖。重跑命令（工程根目录）：

```powershell
npm exec --yes --package=deno@2.5.6 --cache D:/DOSO/npm-cache -- deno test --frozen --node-modules-dir=none --allow-read --allow-env --config supabase/functions/deno.json supabase/functions/tests/admin_devices_test.ts supabase/functions/tests/shared_test.ts supabase/functions/tests/device_binding_test.ts
```

汇总与归档校验和见 `artifacts/device-admin/20261105-release-result.json`。以上属于本地代码和候选归档验证；生产发布、管理员真实 AAL2 会话及创建实际设备仍需各自验收。

历史验证（2026-11-04）：Deno 管理员、共享逻辑及认领测试合计 31 项通过；新旧发布脚本合计 17 项通过。真实本地 PostgreSQL 完成管理员事务 10 组和多设备认领 18 组验证，包含审计失败回滚、独立后端并发争用、在隔离 `postgres` 库原样执行发布 apply/postflight，以及重复 apply 拒绝且既有函数保持。两套临时数据库均已停止。Deno check/lint/fmt、Python 静态检查与 29 文件归档检查通过。

汇总在 App 工程 `artifacts/device-admin/build-result.json`，其中链接到逐组数据库证据。本地测试身份、认证和设备均为隔离测试数据；本地检查不代表生产 Docker、Envoy、Nginx 或管理员真实会话已验收。

发布后的不写业务数据探测：精确路径 OPTIONS 实测为 200、GET 为 405，带有效 action 但无 Bearer 或无效 Bearer 的 POST 为 401。真正的管理员创建、更新认领码和解绑验收需要有效管理员 AAL2 会话。运维 Shell 权限不代替管理员业务登录。

本包保持每设备远程管理默认关闭；设备登记不会自动打开状态上传、地图、视频或运动功能。
