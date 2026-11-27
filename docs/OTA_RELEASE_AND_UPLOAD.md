# DOSO OTA 发布与上传指南（Android App + 机器狗本体）

本文说明如何将新版本 **Android App 安装包** 与 **机器狗固件 / RL 策略包** 上传到私有 OSS 并发布到正式 OTA 服务（`https://api.dosorobotics.com/ota`），以及如何部署前端已对接的云端代理函数。

> **安全边界**：发布与 OSS 上传依赖阿里云私有凭据，统一通过离线环境变量传入（`DOSO_RELEASE_API_TOKEN`、`DOSO_OSS_ACCESS_KEY_ID`、`DOSO_OSS_ACCESS_KEY_SECRET`），严禁将密钥写入 Git 仓库或打包进客户端 App。

---

## 一、如何上传并发布新的 Android App 更新

App 客户端会向 `https://api.dosorobotics.com/ota/v1/apps/android/latest?channel=<channel>&version_code=<当前versionCode>` 查询最新版本（可通过构建环境变量 `EXPO_PUBLIC_OTA_BASE_URL` / `EXPO_PUBLIC_OTA_CHANNEL` 覆盖）：

- **QA 测试包（`com.doso.robot.qa`）**：通过 `qa-build-environment.mjs` 或 `EXPO_PUBLIC_OTA_CHANNEL=qa` 构建，固定查询 **`--channel qa`**。
- **正式生产包（`com.doso.robot`，正式签名）**：默认查询 **`--channel prod`**，避免 QA 调试签名包混入正式用户通道。

### 1. 递增版本号

> 当前发布基线已重置为 `0.0.1`（`versionCode = 1`）。曾安装历史 QA `code56` 的设备因 Android 禁止低版本号覆盖高版本号，首次换装 `code1` 前需先卸载旧包一次；此后 `1 -> 2 -> 3` 可正常覆盖安装与 OTA 升级。

1. 修改 [app.json](../app.json)：
   - `expo.version`（如 `"0.0.2"`）
   - `expo.android.versionCode`（如 `2`，当前基线为 `1`，每次发布严格递增）
   - `expo.ios.buildNumber`（按发布节奏同步递增）
2. 同步更新 [src/features/app-update/appVersion.ts](../src/features/app-update/appVersion.ts)：
   - `INSTALLED_APP_VERSION_NAME` 与 `INSTALLED_APP_VERSION_CODE` 必须与 `app.json` 完全一致（单测会强制校验）。
3. 若本机未重新执行 `expo prebuild` 直接运行 Gradle，请同步更新 [android/app/build.gradle](../android/app/build.gradle) 中的 `versionCode`。

### 2. 构建并签名 Release APK

在 `doso-app` 根目录构建 Android Release 安装包（例如本地 Gradle `assembleRelease` 或 EAS Build），产物记为 `dist/doso-app-<versionName>.apk`。

### 3. 一键上传并发布到正式 OTA（推荐）

使用 `robot-cloud/tools/deploy/doso-ota-ops.py` 写入阿里云私有 OSS 凭据与 OTA 发布令牌后一键完成上传、注册与校验：

```powershell
$env:DOSO_OSS_ACCESS_KEY_ID = "<your-oss-ak>"
$env:DOSO_OSS_ACCESS_KEY_SECRET = "<your-oss-sk>"
$env:DOSO_RELEASE_API_TOKEN = "<your-ota-release-bearer-token>"

python D:\DOSO\robot-cloud\tools\deploy\doso-ota-ops.py publish-android `
  --apk dist\doso-app-0.0.2.apk `
  --channel prod `
  --version-name 0.0.2 `
  --version-code 2 `
  --min-supported-code 1 `
  --object-key apps/android/prod/0.0.2/doso-0.0.2.apk `
  --changelog "优化操控与版本更新体验"
```

### 4. 分步上传与发布（可选）

如需拆开执行，也可先上传 OSS 再发布 APK 元数据：

```powershell
python D:\DOSO\robot-cloud\tools\deploy\doso-ota-ops.py oss-upload `
  --file dist\doso-app-0.0.2.apk `
  --object-key apps/android/prod/0.0.2/doso-0.0.2.apk `
  --content-type application/vnd.android.package-archive

python D:\DOSO\robot-cloud\tools\deploy\doso-ota-ops.py android-publish `
  --channel prod `
  --version-name 0.0.2 `
  --version-code 2 `
  --min-supported-code 1 `
  --object-key apps/android/prod/0.0.2/doso-0.0.2.apk `
  --apk dist\doso-app-0.0.2.apk `
  --changelog "优化操控与版本更新体验"
```

> 如需强制所有低于 `min-supported-code` 的旧版升级，可保持 `--min-supported-code` 高于旧版或额外传入 `--mandatory`。

### 5. 验证接口与 App 端拉取

```powershell
curl.exe -sS "https://api.dosorobotics.com/ota/v1/apps/android/latest?channel=prod&version_code=1"
```

确认返回 `updateAvailable: true`、`downloadUrl` 为签名 HTTPS 地址且 `apkSha256` 一致后，在手机 App「关于与隐私 → 检查更新」或设置页点击「检查更新」，即可弹出下载提示或点击「下载更新」拉起下载安装。

---

## 二、如何上传并发布新的机器狗本体更新（固件 / 策略 / 组件）

机器狗端升级包统一经过 `doso-ota-release` 签发 Ed25519 Manifest 与短时效 OSS URL，机器狗上的 `doso-ota.service` 自动校验签名、安全状态与 `brainstem :5054/health` 后落盘安装。

### 1. 打包不可变 `.tar.gz`

- **RL 策略包（`policy_package`，零重启热更新）**：先由 `DOSO-SDK/tools/export_doso_policy.py pack` 生成策略目录，再打包：
  ```bash
  python3 tools/deploy/doso-ota-ops.py package \
    --type policy_package \
    --source-dir ./dist/flat_v0_0_4 \
    --output ./dist/flat_v0_0_4.tar.gz
  ```
- **底座或组件包（`brainstem_release` / `component_release`）**：
  ```bash
  python3 tools/deploy/doso-ota-ops.py package \
    --type component_release \
    --component cloud-link \
    --source-dir ./dist/cloud-link-0.1.2 \
    --output ./dist/cloud-link-0.1.2.tar.gz
  ```

### 2. 上传到私有 OSS 并生成发布模板

```bash
python3 tools/deploy/doso-ota-ops.py oss-upload \
  --file ./dist/flat_v0_0_4.tar.gz \
  --object-key policies/20261127/flat_v0_0_4.tar.gz

python3 tools/deploy/doso-ota-ops.py render-template \
  --release-id rel-flat-20261127-v004 \
  --version 0.0.4 \
  --sequence 203 \
  --channel policy_package \
  --type policy_package \
  --object-key policies/20261127/flat_v0_0_4.tar.gz \
  --artifact ./dist/flat_v0_0_4.tar.gz \
  --policy-slot flat \
  --no-activate \
  --output /var/lib/doso-ota-release/releases/rel-flat-20261127-v004/manifest.template.json
```

> 生产推荐对 `policy_package` 默认加 `--no-activate` 先静默预热到目标 slot，再按状态激活；底座升级（`brainstem_release`）需设置 `--systemd-unit doso-brainstem.service --health-url http://127.0.0.1:5054/health`。

### 3. 触发单机或灰度推送

- **单台研发机/测试狗验证**：
  ```bash
  python3 tools/deploy/doso-ota-ops.py job start \
    --device-id <device-uuid-v4> \
    --release-id rel-flat-20261127-v004 \
    --idempotency-key roll-20261127-01
  ```
- **全量灰度发布（自动熔断保护）**：
  ```bash
  python3 tools/deploy/doso-ota-ops.py rollout create \
    --rollout-id ro-flat-20261127 \
    --release-id rel-flat-20261127-v004 \
    --model "THUNDER 01" \
    --hardware-revision rdk-s100p
  ```

---

## 三、云端代理函数部署说明（`supabase/functions/firmware-ota`）

仓库已接入 [supabase/functions/firmware-ota/handler.ts](../supabase/functions/firmware-ota/handler.ts)、客户端 [src/services/firmwareOta.ts](../src/services/firmwareOta.ts) 与固件升级页 [src/screens/FirmwareUpdateScreen.tsx](../src/screens/FirmwareUpdateScreen.tsx)，用于在服务端校验登录用户对目标机器狗的归属权及管理员权限后再代理访问 `doso-ota-release`（剥离签发信封与 OSS 链接，隔离管理员 Bearer Token）。

部署到云端 Supabase Edge Runtime 前，必须在服务端配置以下两条环境变量（不要写入前端 `.env` 或源码）：

- `DOSO_OTA_RELEASE_URL=https://api.dosorobotics.com/ota`
- `DOSO_OTA_RELEASE_TOKEN=<与 SWAS /etc/doso/ota-release/ota-release.env 一致的 DOSO_RELEASE_API_TOKEN>`
