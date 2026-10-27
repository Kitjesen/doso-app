# DOSO App

DOSO 是用于管理和控制机器人的 React Native / Expo 应用。本仓库是 Android App、原生连接模块和相关后端的开发源码快照；请先阅读 [Brainstem 与 App 的对接清单](docs/BRAINSTEM_APP_INTEGRATION.md)。

当前源码包含机器人 gRPC 连接、状态读取、控制会话以及 G20 本地输入适配。机器人侧服务、设备绑定、物理动作和所有机型尚未完成全面验收。实时图传、音频、点云和控制未来计划迁移到 WebRTC，当前不能视为已经接通。

## 运行前准备

需要 Node.js 22.13 或以上、Android Studio、JDK 及 Android SDK。源码包含 Android 工程和两个 Expo 原生模块，原生能力需要 Android 构建；普通 Expo Go 无法替代原生模块。

```sh
npm ci
npm run typecheck
```

将 `.env.example` 复制为 `.env.local`，按本地开发环境配置公开客户端参数。不要提交真实 `.env.local`、密码、验证码、私钥、服务端密钥或签名文件。无需账户即可先运行协议和状态机的离线测试；不要对生产后端运行会创建或删除测试数据的验证脚本。

## 取得第三方文件

公开仓库不单独分发第三方 SDK 二进制或 MiSans 字体。自行阅读上游许可并从官方来源取得，文件放到以下位置。它们被 `.gitignore` 忽略，不能提交到仓库。

1. 从[云卓固定版本 RCSDK 示例](https://gitee.com/skydroid/rcsdk-demo/raw/d9c6bcab8bb9993cd16f117c01a7601dce10ea6a/app/libs/rcsdk-v1.9.2.aar)取得 AAR，存为 `modules/g20-input/vendor/maven/com/skydroid/rcsdk/1.9.2/rcsdk-1.9.2.aar`。SHA-256 应为 `e5977ba3292246bcee026defdb8563a18adc9d5573fdfb20a6880ee469f0fde2`。见 [SDK 来源及限制](modules/g20-input/vendor/README.md)。
2. 从[小米 MiSans 官方页面](https://hyperos.mi.com/font/zh/download)取得字体，将 Regular、Medium、Demibold、Bold 四个原始 OTF 放入 `assets/fonts/`；准确名称及 SHA-256 见 [字体清单](assets/fonts/manifest.json)，保留随附许可与软件内署名。
3. 为本机调试准备 `android/app/debug.keystore`。此文件不会提交；使用 Android SDK 标准调试密钥，并勿用于正式签名。不同签名的 APK 不能直接覆盖用户设备上已有的同包名安装。

`android/app/build.gradle` 中的调试签名配置预期本地文件名为 `debug.keystore`。若已有 Android 默认调试密钥，可自行安全复制到该位置；否则按 Android 官方方式生成。SDK、字体和本地调试密钥准备完成后，再使用 `npx expo run:android` 进行本机开发。

## 面向接口联调的离线测试

```sh
node --test scripts/brainstem-grpc-service.test.mjs scripts/brainstem-control-session.test.mjs
node --test scripts/g20-input-hook.test.mjs scripts/g20-input-native.test.mjs
```

原生 G20 测试需要上面的 SDK AAR、现有 Android SDK、Java 与 Gradle 缓存。脚本默认使用项目原开发机的工具链路径，其他机器请设置 `DOSO_G20_JAVA_HOME` 和 `ANDROID_HOME` 为各自安装目录；其中模拟 SDK 的断言不等于物理设备通过。配置测试及其他脚本可能需要额外环境，运行前先阅读脚本和目标环境。

## 版本与源码边界

此快照来自 2026-10-27 的本地工作区，包含已安装 code24 之后的 G20 输入超时回调修复；该修复尚未打入已安装的 code24 包。版本号相同不代表二进制或源码相同，交付 APK 时应记录其 SHA-256。`docs/design` 中的设计文档按原日期保留，作为设计背景，当前对接状态以本仓库的 Brainstem 清单和实测为准。

本仓库未声明整个 DOSO 项目的开源许可证；各第三方依赖、字体和 SDK 适用各自许可。这里不包含账号数据、密钥、真实设备运行记录、签名文件或历史安装包。
