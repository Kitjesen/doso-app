# 设备定位状态增量

基于已上线 simulated-device-20261107 第14层 Functions 快照，仅替换 remote-state handler，支持可选 WGS84 Status.location。其它函数与共享文件保持 SHA256 一致；第15层只替换 Functions 目录挂载，保留 localhost:8081 来源与所有原配置。API 网关仍运行第13层配置，发布按各自真实层数检查。

生成：`node deploy/backend/device-location-20261108/package.mjs`。

安装目录：`/opt/doso-backend-shadow/runtime-20261027/docker/doso/device-location-20261108`。执行 `sudo -n python3 deploy.py` 前，必须完成本轮 Deno 与隔离 PostgreSQL 验证并由主执行线确认发布时机。

部署沿用数据库备份与事务机制，只替换 private.remote_received、private.remote_sample_dto，无设备数据修改。只读 postflight 行为检查覆盖旧状态兼容、合法定位和 accuracyM:null 保留、非法WGS84/精度/时间拒绝。只重建 Functions；数据库、Auth、REST、邮件和 API 网关容器 ID/启动时间及私有 .env 字节应保持。媒体服务不在变更范围。

运行时失败时恢复原14层 Functions；SQL新增兼容可选字段，不清除现有数据。成功记录为 deployment.json，公网探测另存 verification.json。

2026-11-08 已上线：`device_location_ready`，记录见 `deployment.json`；备份 `/opt/doso-backend-shadow/env/device-location-2tkvsz58`。生产只读 postflight 前后均通过；Functions 与其余五个容器全部健康，其它容器 ID/启动时间与私有环境保持。公网TLS边界检查见 `verification.json`：允许的localhost来源未鉴权返回401，未允许来源返回403 origin_not_allowed。该结果证明后端发布及边界保持；实际模拟GNSS经MQTT入库和App地图显示由主线另行验收。
