# DOSO 快速部署路径

更新日期为 2026-11-13，时区为 Asia/Shanghai。

目标是让小改动只触发必要的部署步骤。开发热加载、调试安装包、QA包和正式发布包分别使用自己的入口，不能把其中一个的验证结果当作另一个的发布证据。

## 先按改动范围分流

| 改动范围 | 使用入口 | 是否构建 APK | 是否重启机器狗 | 适合什么 |
| --- | --- | --- | --- | --- |
| 纯 JS/TS 页面、文案、状态展示和控制页布局 | `node scripts/android-dev.mjs --metro <evidence-dir>` | 否 | 否 | G20 已安装开发客户端，快速看界面和本地逻辑 |
| JS/TS 加原生桥调用，但不改变原生模块结构 | `node scripts/android-local-test.mjs --build <fresh-evidence-dir>` | 是，localtest | 視功能而定 | 需要把改动装到 G20 并做本地验收 |
| Android 原生模块、权限、网络实现、包配置或签名 | QA 构建入口 `qa-build` | 是，QA | 視功能而定 | 需要真实安装包和完整原生验证 |
| Brainstem 环境变量、systemd drop-in、NetworkManager配置 | 备份配置、变更、回读、必要时 `daemon-reload`/重启 | 否 | 是，服务级 | 网络和服务配置调整 |
| Brainstem/LingTu 二进制或协议代码 | 目标架构构建、校验、版本化安装 | 否，除非 App 同时改变 | 是，相关服务 | 机器狗端程序变更 |
| 账号、云端函数、数据库迁移 | 只部署后端变更 | 否 | 否 | App 已使用兼容接口时 |

判断只看实际调用链。改动触及 Android 原生、生成代码、权限、签名、App 配置或网络原生模块时，不能使用 Metro 代替构建。

## 最快的 App 调试流程

前提是 G20 已安装同一分支的开发客户端，电脑和 G20 已连接，机器狗保持当前稳定网络。流程如下。

```powershell
$evidence = "artifacts/release-readiness/20261113-metro-<topic>"
New-Item -ItemType Directory -Force $evidence | Out-Null
node scripts/android-dev.mjs --metro $evidence
```

Metro 只更新 JS bundle。它不改变 APK 中的原生模块、权限、签名、服务地址和设备数据。退出 Metro 后，G20 恢复使用已安装包中的 bundle。

需要安装一次调试包时，使用本地构建入口。

```powershell
node scripts/android-local-test.mjs --build artifacts/release-readiness/20261113-localtest-<topic>
```

这个入口已有内存门禁、输入快照、构建锁、bundle 与 APK 校验。构建成功后只安装 localtest 包，保留设备数据。它不能替代 QA 包的签名和发布验收。

## 机器狗端快速流程

机器狗端也按改动范围分三档。

### 网络配置

适用于热点接口、固定地址、允许网段和外部 Wi-Fi 配置。流程是备份当前配置、修改一个 NetworkManager profile、回读属性、记录地址，再决定是否激活。热点切换前必须保留 SSH 或有线恢复路径。

```text
读取当前服务与监听
→ 备份配置
→ 修改单个 profile 或 drop-in
→ 回读配置
→ 必要时重载服务
→ 只读 RPC 验收
→ 失败时恢复备份
```

网络配置没有通过客户端加入热点和真实状态读取前，不设置为开机自动启用。

### 服务配置

适用于 Brainstem 的监听地址、允许网段、功能开关和 systemd drop-in。只需要配置变更时，不重新构建二进制。每次操作保留以下记录。

- 变更前后的 systemd 配置摘要。
- 服务实际监听地址和 PID。
- `systemctl is-active`、启动时间和最近启动日志。
- 四个只读 RPC 的结果。
- 失败回滚结果。

### 二进制和协议

只有源码、依赖或协议生成结果改变时才构建目标二进制。目标机使用版本目录和 `current` 链接，先放入新目录、校验 manifest，再切换链接，健康检查失败就切回旧目录。安装二进制不等于通过运动验收。

## 机器狗服务的最小健康检查

每次机器狗端部署只读执行这些检查。

1. NetworkManager、BlueZ、Brainstem 及目标 LingTu 服务的 active/running 状态。
2. 当前无线接口、地址、热点 profile 和客户端 DHCP 状态。
3. Brainstem 实际监听地址、端口和允许访问范围。
4. `GetControlStatus`、`GetProfile`、`GetVoltage`、`GetMotorStatus`。
5. 电机仍为失能状态，控制租约为空，未产生运动指令。

热点切换通过后，再增加一次重启恢复检查。触屏、G20 实体摇杆、使能和运动单独执行现场验收。

## 证据和版本规则

每次快速部署建立新的 evidence 目录，不覆盖历史记录。目录至少包含：

```text
change.json       改动范围、目标设备和是否允许重启
preflight.json    构建或部署前检查
manifest.json     App/Brainstem/LingTu/配置版本与哈希
result.json       命令、状态、监听地址和只读回执
rollback.json     回退位置和回退结果
```

版本分为四种。`metro` 只代表开发客户端的 JS 热加载，`localtest` 代表本地调试包，`qa` 代表可安装测试包，`release` 才代表正式发布候选。四者不能互相替代。

## 本项目当前建议顺序

1. 纯 UI 或状态文案先走 Metro，不构建、不切机器狗网络。
2. App 原生接线变更走 localtest，完成 G20 安装和离线回归。
3. 机器狗热点与 Brainstem 监听先走配置快速路径，成功后再做 G20 加入热点和只读 RPC。
4. Brainstem 或 LingTu 源码变更再构建目标二进制并版本化安装。
5. 只有本地链路稳定后，才做 QA 构建、保数据升级和正式发布检查。

这样可以避免一次小的 UI 调整触发 Gradle、机器狗重启和完整真机流程，同时保留需要原生构建和现场验收的边界。
