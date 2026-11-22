# DOSO 账户邮件 Outbox 生产 Runbook

> 目标项目：`vchvqfdlkomlrjenkdhj`（DOSOrobotics）
> 运行时范围：仅 `new_device_login`，数据库默认关闭
> 当前状态：本地资产与行为测试完成；未部署、未发送生产邮件。

## 语义和安全边界

- `accepted` 只表示阿里云 DirectMail API 接受请求，并不表示投递或入箱。
- DirectMail `SingleSendMail` 没有业务幂等键。确定性的 `Message-ID` 和
  `X-User-Notify-Doso-ID` 只用于关联和人工去重，不能阻止 Provider 重复接受。
- `dispatching` 超时只能进入 `delivery_unknown`；绝不自动重新发送。
- `delivery_unknown` 和 `dead` 必须触发告警并由运维人员处理。未知结果只有在
  核实 Provider 后才能 resolve；手动 retry 必须填写原因并接受“可能重复”。
- Worker 日志仅记录计数、worker ID 和状态；不得记录邮箱、IP、地点、HTML、
  payload、AccessKey、Supabase key 或 Vault 内容。
- Outbox payload 不保存第二份账户邮箱，也不采信客户端或转发头中的 IP/地点。
  installation ID 仍是客户端报告值；服务端只保留同一认证会话首次上报值，并对同一
  用户串行限制 24 小时最多 3 封新 installation 通知，它不是硬件证明或风控结论。
  默认 30 天后通过清理 RPC 脱敏 recipient、payload 和 error summary；保留
  固定长度 dedupe 摘要、Provider RequestId/EnvId 和状态供审计。超过保留期的
  `delivery_unknown` 同样强制脱敏，脱敏后不再允许重试，只能记录最终人工结论。

## 外部上线门禁

以下全部完成前，保持 `new_device_login=false`：

1. Supabase named secret key `automations` 已创建；它不是 publishable key。
2. 阿里云专用 RAM 身份仅拥有 `dm:SingleSendMail`，发信地址
   `no-reply@auth.dosorobotics.com` 已验证。
3. Edge Secrets 已保存 `ALIYUN_DM_ACCESS_KEY_ID`、
   `ALIYUN_DM_ACCESS_KEY_SECRET`；仓库和客户端不含真实 Secret。
4. `https://dosorobotics.com/account/security` 已部署且 TLS/DNS 正常。
5. 邮件专用字标已上传到批准的 Supabase Storage URL，公网 Content-Type、长度和
   SHA-256 与仓库资产一致，`npm run email:verify` 不再报告模板/SMTP 差异。
6. 本 Runbook 的验证、停用和 forward-fix 演练已在 staging 完成。
7. Gmail、Outlook、QQ、163 邮箱的真实投递与退信/告警负责人已经登记。

## Vault 与 Cron 安装资产

在 SQL Editor 中用实际值替换尖括号内容；不要把实际值保存到 SQL snippet、聊天
或工单。Vault 只保存调用 URL 和 named secret key：

```sql
select vault.create_secret(
  'https://vchvqfdlkomlrjenkdhj.supabase.co/functions/v1/account-email-worker',
  'doso_account_email_worker_url',
  'Account email worker URL'
)
where not exists (
  select 1 from vault.decrypted_secrets
  where name = 'doso_account_email_worker_url'
);

select vault.create_secret(
  '<SUPABASE_NAMED_SECRET_KEY_AUTOMATIONS>',
  'doso_account_email_worker_apikey',
  'Named Supabase secret key for Cron only'
)
where not exists (
  select 1 from vault.decrypted_secrets
  where name = 'doso_account_email_worker_apikey'
);
```

安装或更新任务前先按名字取消旧任务，再调官方 `cron.schedule`；不直接修改
`cron.job`：

```sql
select cron.unschedule(jobid)
from cron.job
where jobname = 'doso-account-email-worker';

select cron.schedule(
  'doso-account-email-worker',
  '* * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'doso_account_email_worker_url'
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'doso_account_email_worker_apikey'
      )
    ),
    body := '{"limit":10}'::jsonb,
    timeout_milliseconds := 50000
  );
  $cron$
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'doso-account-email-pii-redaction';

select cron.schedule(
  'doso-account-email-pii-redaction',
  '17 3 * * *',
  $$select public.redact_account_email_outbox(now() - interval '30 days', 500);$$
);
```

Worker 的 `verify_jwt=false` 是有意配置：Supabase 平台 JWT gate 不能验证 opaque
named secret。函数在任何数据库 claim 之前，从平台提供的 `SUPABASE_SECRET_KEYS`
中取指定名字并以常量时间比较 `apikey`。无 key、错误 key 或 publishable key
返回 401；仅正确的 `automations` secret 执行。真正没有请求体时使用默认批量 10；
存在但不是合法 JSON 对象、缺少 `limit`、或 `limit` 不在 1–25 的整数范围时返回
400，且不会执行任何数据库 claim。Provider 错误摘要在写入 outbox 前会去除
AccessKey ID、AccessKey Secret、发件地址与收件地址。

## 部署顺序

1. 创建 RAM、DirectMail sender、Supabase named secret 与 Edge Secrets。
2. 做可恢复数据库快照并记录 migration head。
3. 部署 `20260825070607_add_account_email_outbox.sql`；确认 feature 为 false。
4. 部署 `account-email-worker`，确认 `verify_jwt=false`。
5. 安装 Vault/Cron；错误或 publishable `apikey` 应为 401，named secret 空批次为 200。
6. 部署新的 `account-sessions`；注册 RPC 已原子写 terminal/outbox/audit。
7. 用 staging 测试用户开启 flag，注册一个全新 installation，验证一条 queued。
8. 验证 `leased → dispatching → accepted`、RequestId/EnvId 和四类真实收件箱。
9. 验证告警、unknown resolve/manual retry 和 30 天脱敏演练后才开启生产 flag。

启用命令：

```sql
update public.account_email_features
set enabled = true, updated_at = now()
where kind = 'new_device_login';
```

## 无 PII 的验证和告警查询

```sql
select kind, enabled from public.account_email_features order by kind;

select status, count(*) as message_count,
       min(updated_at) as oldest_state_at
from public.account_email_outbox
group by status
order by status;

select id, status, attempt_count, provider_request_id, provider_env_id,
       dispatch_started_at, unknown_at, dead_at, updated_at
from public.account_email_outbox
where status in ('delivery_unknown', 'dead')
order by updated_at;
```

告警至少覆盖：`delivery_unknown > 0`、新 dead、queued 最老时间超过 5 分钟、
Cron 连续两次非 2xx。告警正文不得包含 recipient 或 payload。

人工处理示例：

```sql
-- 已在 DirectMail 确认 Provider 接受：
select public.resolve_account_email_unknown(
  '<OUTBOX_UUID>', 'accepted', 'DirectMail console confirmed EnvId at <UTC time>'
);

-- Provider 明确未接受，业务决定承担重复风险后才可执行：
select public.manual_retry_account_email_unknown(
  '<OUTBOX_UUID>', 'DirectMail confirmed no accepted request; ticket SEC-123 approved retry'
);
```

这些 RPC 的 service-role 调用只能证明受信服务执行并保存了理由，不能单独证明具体
人类运维员身份。生产操作必须从带管理员登录的后台或审批工单发起，把操作者 ID、
票据号和复核证据写入理由；不要直接把 SQL Editor 当作完整的人员审计系统。

## 停用、回滚与恢复

顺序是不可交换的：**flag off → unschedule → 等待/检查 dispatching 与 unknown →
snapshot → 回滚 Edge Function → DB forward-fix**。

```sql
update public.account_email_features
set enabled = false, updated_at = now()
where kind = 'new_device_login';

select cron.unschedule(jobid)
from cron.job
where jobname in ('doso-account-email-worker', 'doso-account-email-pii-redaction');
```

停用后等待当前 45 秒 Worker 墙钟预算结束，检查所有 `dispatching`。过期项让 claim
维护步骤转为 unknown，逐项核实，不能批量重发。随后导出无 PII 状态快照。先回滚
`account-email-worker` 和 `account-sessions` 到上一已知版本；数据库不做破坏性
down migration，不删除 outbox。数据库修复使用新的 forward-fix migration，并在
staging 恢复相同快照验证后再重新安排 Cron、最后开启 flag。

## 本地验证

```bash
npm run email:check
npm run test:functions
npm run test:db
npm run test:config
npm run test:account-email-ops
npm run typecheck
npm run test:release-gate
git diff --check
```

这些检查不发送真实邮件、不访问生产、不部署任何资源。
