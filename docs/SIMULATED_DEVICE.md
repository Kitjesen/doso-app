# 模拟设备接入

模拟设备使用业务库存中的永久 UUID，正常账号通过设备绑定码绑定。它不是 App 的本地演示记录：`is_demo=false`，`is_simulated=true`。`is_simulated` 在创建后不可更改，设备发来的状态不能覆盖这个身份。

管理员沿用正常登录、有效终端与 MFA，调用 `POST /functions/v1/admin-devices`：

```json
{
  "action": "create_inventory",
  "serialNumber": "DOSO-SIM-001",
  "modelCode": "Thunder",
  "displayName": "模拟机器狗 001",
  "simulated": true
}
```

随后通过原有 `rotate_binding_code` 操作签发绑定码，使用正常账号的 `device-binding` 接口认领 UUID 和绑定码。库存创建不会自动分配归属，也不代替绑定。模拟程序的设备 ID、证书和 MQTT 权限须对应这个返回的 UUID。

App 沿用现有设备列表、远程状态开关和后台同步机制。远程状态 API 的 `simulated` 字段取自库存；App 设备选择项、设备说明和状态面板都标明模拟。面板退到后台只停止界面轮询，不关闭用户已保存的状态上报许可。

## 部署差异

1. 数据库应用 `supabase/migrations/20261107100000_add_simulated_devices.sql`。前置为已有库存、设备绑定和远程状态迁移。
2. 发布源码 `supabase/functions/admin-devices` 和 `supabase/functions/remote-state`。不要使用旧发布包内的 handler 副本。
3. 发布更新的 App。`remote-state` 响应新增必填布尔字段 `simulated`；先部署数据库，再部署函数，最后更新 App。旧 App 会忽略新增字段。

八参数库存 RPC 保留，默认创建真实设备；新九参数 RPC 显式选择模拟身份，没有可选默认参数造成的重载歧义。

## 本地验证

- `node --test scripts/remote-state-service.test.mjs scripts/remote-state-panel.test.mjs`
- `node scripts/verify-multi-device-ownership.mjs`：隔离 PostgreSQL 中验证模拟库存、正常绑定、身份不可变和正常账号状态 API。
- Deno 运行 `supabase/functions/tests/admin_devices_test.ts` 与 `supabase/functions/tests/remote-state-user.test.ts`。

这些检查证明代码行为；公网 MQTT 上报、业务数据库时间持续更新和实际 App 联调以真实部署时的运行记录为准。
