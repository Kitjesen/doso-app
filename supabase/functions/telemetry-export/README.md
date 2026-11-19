# 云端遥测投递入口

此函数仅供云端 Rust telemetry 程序使用，不提供 App 用户接口。需在 `SUPABASE_SECRET_KEYS` 配置专用 `telemetry-export` 命名服务密钥；可由 `DOSO_TELEMETRY_EXPORT_SECRET_NAME` 改名。请求使用 `apikey`，用户 bearer、remote-state-sync 密钥和机器人密钥不能替代。

新增迁移为 `20261108020000_add_telemetry_export.sql`，须排在现有 remote-state、simulated devices 和 remote-location 迁移之后应用。所有表私有，RPC 仅授予 service_role；入口默认无任何启用设备。部署时另将 `telemetry-export` 加入现有 Functions 路由白名单并按此函数内置服务鉴权关闭平台 JWT 验证，不能仅部署函数目录就声称公网已可用。

## HTTP 合同

`POST` JSON，响应都带 `v:1`。不接受 query、额外字段或超过 4 KiB 的请求。

| action | 请求字段（除 v/action） | 响应 |
| --- | --- | --- |
| claim | 无 | `items`：最多一个 `{id,leaseToken,deviceId,ownerId,authorizationEpoch,consentVersion,tbDeviceId,simulated,received}` |
| check | `id,leaseToken,tbDeviceId`，平台 ID 可 null | `allowed:boolean`，非空平台 ID 会按设备授权期间幂等保存 |
| finish | `id,leaseToken,outcome`，outcome 为 delivered/retry/conflict | `accepted:boolean` |

`received` 是完整已接受报告和 `receivedAt`，包含有效可选字段。租约 120 秒，同一设备授权期间最多一条在途，领取失败达到 20 次或积压一天后明确进入 failed。单设备最多保留 10,000 条待投递记录；超过时 `dropped_count` 增加，不伪装成完整历史。已结束记录不占待投递容量，超过一天后随该设备后续入队清理。

每次外发前调用 check。当前机主、授权代次、许可版本、enabled 和账号有效性必须匹配；原采集 session 的三十秒租约过期不会取消已接受历史。用户关闭或归属重置会取消待投递记录。已开始的外部 HTTP 可能完成，需要将停止采集与在途投递完成区分。

## 服务端启停与积压核查

以下只由已有可信服务角色或数据库运维执行；UUID 替换为已登记设备，不创建新客户编号。

```sql
select public.configure_telemetry_export('设备UUID'::uuid,true);
select public.configure_telemetry_export('设备UUID'::uuid,false);
```

运维角色可读私有表检查，不向 App 授予表权限：

```sql
select device_id,authorization_epoch,state,count(*),min(created_at),max(attempts)
from private.telemetry_outbox group by device_id,authorization_epoch,state;
select device_id,authorization_epoch,enabled,tb_device_id,dropped_count
from private.telemetry_devices;
```

回退先 configure false，再停止 Rust telemetry。保留原实时状态和平台已有历史，不删除用户或设备。该目录代码和迁移不代表线上已部署或真实机器狗已经上报。
