# 模拟设备身份增量

基于已部署 video-access 十三层栈，仅替换 admin-devices 和 remote-state 两个 handler，以及库存模拟身份 SQL。其余函数及共享模块逐文件 SHA256 保持原快照。第十四层仅更新 functions 挂载及明确的 http://localhost:8081 Web 来源；不改 API 网关、Nginx、媒体服务和私有环境文件。

生成：在 App 根目录运行 `node deploy/backend/simulated-device-20261107/package.mjs`。

部署：归档展开至 `/opt/doso-backend-shadow/runtime-20261027/docker/doso/simulated-device-20261107`，执行 `sudo -n python3 deploy.py`。执行前验证十三层和原快照，备份数据库及配置，SQL 事务提交后只重建 functions。数据库新增身份字段和 DTO 会保留，运行时失败自动恢复原 functions 配置。数据库提交与旧 handler 存在短暂切换窗口；恢复原运行时后应尽快重新完成发布。

成功输出 `simulated_device_ready`。原五个其他容器 ID、启动时间和 .env 字节应保持一致。备份写入 root 私有目录，不包含在本归档。

2026-11-07 已发布，部署记录为 `deployment.json`；私有备份 `/opt/doso-backend-shadow/env/simulated-device-l7mc34_q`。Functions 已健康，其余五个容器 ID 与启动时间不变，私有环境文件字节不变。公网 TLS 探测见 `verification.json`：允许 localhost:8081 后，无凭据正常返回 401；其他来源实际请求返回 403 origin_not_allowed。原有 Envoy 提前处理 OPTIONS 并反射来源，因此不能单凭预检 200 判断请求已获得业务权限。
