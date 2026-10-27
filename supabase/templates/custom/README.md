# DOSO 自定义账户邮件

这些模板由应用后端或 Edge Function 渲染和发送，不属于 Supabase Auth 原生模板。变量值必须在插入 HTML 前完成转义，URL 必须是经过校验的 HTTPS 绝对地址。`new_device_login` 的可信语义是“首次出现的 App installation ID 或浏览器安装”，不等价于识别真实物理设备。`anomalous_login` 在接入可信风控信号前不得启用；账户注销流程在数据处理清单与外部身份撤销适配完成前必须保持关闭。

| 模板 | 应用变量 |
| --- | --- |
| `anomalous_login.html` | `account_email`, `event_time`, `location`, `device`, `security_url` |
| `new_device_login.html` | `event_time`, `device`, `security_url` |
| `account_deletion_confirmation.html` | `deletion_confirmation_url` |
| `account_deleted.html` | `account_email`, `event_time` |

`event_time` 应包含明确时区。新安装提醒不展示客户端可伪造的位置或 IP，并明确把设备值标为“客户端报告”；异常登录功能将来启用时，地点和设备必须来自可信风控信号，无法可靠判断时传入清晰的“未知”文案。`security_url` 和 `deletion_confirmation_url` 只能由服务端生成，禁止直接采用客户端提交的 URL。渲染器分别只允许 `/account/security` 与 `/account/delete/confirm` 两条受控路径，可携带服务端生成的查询参数，但不接受 URL fragment。
