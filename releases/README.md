# DOSO Android builds

## Current QA baseline

The canonical UI and runtime source is `D:\DOSO\app-workspace\doso-app`. The current QA configuration is package `com.doso.robot.qa`, app version `0.0.1-qa`, Android `versionCode` 54, and target SDK 36.

The latest local QA artifact contains the Control, Status and Settings tabs. Its SHA-256 is `10022c6fc55f01199e45c04a5818e3af98ff27967df29b5469a8e3170f0db0ea`. The most recent verified G20 installation is code52. [DOSO QA code54](20261120/DOSO-0.0.1-qa-code54-10022c6f.apk)

The previous GitHub baseline is code53, SHA-256 `9991b71fc9b59996b7ac67e8d0a7c531027ec32dfea05e0f4c8f12daeb2322cd`. [Merged source](https://github.com/Kitjesen/doso-app/pull/10) · [DOSO QA code53](20261119/DOSO-0.0.1-qa-code53-9991b71f.apk)

## Historical 1.2.3 QA builds

| File | Size | SHA-256 | Scope |
| --- | ---: | --- | --- |
| `DOSO-1.2.3-pure-social-icons-qa.apk` | 34,143,066 bytes | `28B2783E9C4459366C63C97E9082305E8D57BC79239E98ECAFF269DA5FB3B0CB` | 社交图标 UI QA；早于最后的用户名门禁和外部身份代码 |
| `DOSO-1.2.3-pure-social-icons-universal-qa.apk` | 49,659,886 bytes | `FEA1860CD97D43BC2DAA82A710D3E5E86107470AA0E4ECEF58DF3AE9A5394BDA` | 通用架构社交图标 UI QA；同样不代表最新身份代码 |
| `DOSO-1.2.3-quiet-auth-identity-qa.apk` | 49,674,206 bytes | `CE9A9DF4C53CB6B423D6CC36B77CD40072B0E1018202867F71A8ACF1E134673F` | 较新的认证/身份 QA 构建；尚未完成托管迁移或真实 Provider 验收 |

当前源码配置为 package `com.doso.robot`、version `0.0.1`、Android `versionCode` 54、minimum SDK 24、target SDK 36。QA 变体使用 `.qa` 后缀，用户可见版本为 `0.0.1-qa`。本地 QA 包使用调试签名。

Apple、微信和 QQ 的代码与入口存在，但线上 Provider 和客户端功能开关仍关闭。用户名认领与外部身份的最新 hosted migrations 尚未完成部署验收，所以安装 QA APK 不代表这些功能已经上线。

## Older QA and preview files

- `DOSO-1.0.0-preview.apk`：不含真实认证的独立 UI 预览。
- `DOSO-1.0.0-debug.apk`：依赖 Metro 的开发构建。
- `DOSO-1.1.0-auth-local.apk`：早期本地认证 QA 构建。
- `DOSO-1.2.0-network-local.apk`：本地 Supabase 与 Edge Functions 联网 QA 构建。
- `DOSO-1.2.1-hosted-qa.apk`：早期托管后端 QA 构建。
- `DOSO-1.2.2-auth-foundation-qa.apk`：认证基础能力 QA 构建。

生产发布仍需要：部署并验证最新托管迁移、启用并真机验收第三方 Provider、配置正式回跳与生产环境值、使用受保护的生产签名密钥重新构建 AAB/APK。完整状态见 [DOSO 0.0.1 当前发布状态](../docs/CURRENT_RELEASE_STATUS.md)。
