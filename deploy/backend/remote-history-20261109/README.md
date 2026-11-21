# 位置历史与遥测导出发布包

基于 device-location-20261108 已发布的第15层 Functions 快照，新增 remote-history 与 telemetry-export。既有21个文件逐字节校验，remote-state validators 和 shared robotIngress 与源码一致，沿用发布版本。网关从已发布 video-access 第13层相同的生成方式恢复，再增加两条精确路径。候选第16层更新 Functions 与 api-gw。

2026-11-09已在测试业务ECS完成数据库与运行时发布，随后完成真实HTTPS401鉴权及正常账号历史读取。Rust投递程序在ECS临时运行，ThingsBoard仍使用开发机隔离实例。部署阶段原始记录与分段App验收见 [acceptance.json](D:/DOSO/artifacts/robot-cloud/20261109-track-flow/acceptance.json)；这是模拟设备联调，不是独立常驻历史平台交付。不要重跑已提交的database步骤。

## 本地准备

```powershell
node deploy/backend/remote-history-20261109/package.mjs
python deploy/backend/remote-history-20261109/deploy_test.py
node scripts/verify-multi-device-ownership.mjs
```

归档为 remote-history-20261109.tar.gz。package-verification.json 记录归档摘要与快照保留结果。函数验证使用现有 Deno，supabase/functions/tests/remote-history.test.ts 覆盖分页、严格输入、授权重读、GNSS原时间、无定位中断、响应体上限和3秒超时。

## 发布阶段

展开目录必须为 `/opt/doso-backend-shadow/runtime-20261027/docker/doso/remote-history-20261109`。主执行线负责发布与平台隧道。数据库阶段复用 database_base.py，先备份并验证 pg_restore 可读，再在同一事务内应用 telemetry-export 与 history-access 两个迁移和只读 postflight。重复 apply 会拒绝，已提交状态可单独运行只读 postflight 确认。

```sh
sudo -n python3 deploy.py database
sudo -n python3 deploy.py runtime
```

runtime 前由主执行线准备 `/opt/doso-backend-shadow/env/remote-history.env`，属主 root，权限0600。私有文件需要 DOSO_THINGSBOARD_URL 和 DOSO_THINGSBOARD_KEY。可提供 SUPABASE_SECRET_KEYS JSON，现有命名key必须保持原值。脚本读取当前有效环境的命名key，合并 telemetry-export，缺少时创建独立随机key。私有文件通过 Compose env_file 注入 Functions，主 `.env` 发布前后逐字核验。

本轮 DOSO_THINGSBOARD_URL 使用 `http://127.0.0.1:28080`。主执行线需让 Functions 网络命名空间的loopback端口可达临时SSH反向隧道。Functions 重建会改变容器网络命名空间，应在runtime更新后重建对应relay。服务key与relay生命周期由主执行线持有，凭据通过私有文件交付。

## 路由与恢复

remote-history 使用原账号Bearer鉴权。telemetry-export 使用独立命名apikey，精确路由在移除客户端sb-api-key后跳过Lua opaque-key转换，由handler验证。已有路由、CORS、状态校验与Nginx规则以快照为基线。Nginx仅扩展函数白名单。

运行时失败会恢复原私有history环境、Nginx配置，以及Functions原15层、API网关原13层清单。数据库已提交时保留遥测映射与投递状态，历史仍归ThingsBoard保存。备份目录包含数据库归档、主环境、容器与Compose模型、层清单及原Nginx/私有history环境。私有备份目录权限由发布入口限制为0700。

准备包的本地验证和发布后实测分别记录。deploy.py在runtime执行时校验有效Compose差异、Envoy引导配置、核心服务身份、Nginx配置与数据库只读postflight；后续真实会话、平台relay和App检查以顶部链接的证据为准。
