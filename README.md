# DOSO App

DOSO 是用于管理和控制机器人的 React Native / Expo Android 应用。本仓库包含该应用、原生连接模块和相关后端。实机控制使用 Android 原生 Brainstem gRPC 模块 [`modules/brainstem-grpc`](modules/brainstem-grpc)。网页预览不能代替这条实机控制链路。对接背景见 [Brainstem 与 App 的对接清单](docs/BRAINSTEM_APP_INTEGRATION.md)。

对外合同是独立仓库 <https://github.com/Kitjesen/brainstem_api>，包名 `brainstem.api.v1`。`RobotControl.GetProfile` 与 `RobotControl.SwitchProfile` 定义在该仓库的 [`brainstem_api/cms.proto`](https://github.com/Kitjesen/brainstem_api/blob/main/brainstem_api/cms.proto)。本仓库在 [`contracts/brainstem_api`](contracts/brainstem_api) 保留一份副本。

当前源码包含机器人 gRPC 连接、状态读取、控制会话以及 G20 本地输入适配。机器人侧服务、设备绑定、物理动作和所有机型尚未完成全面验收。实时图传、音频、点云和控制未来计划迁移到 WebRTC，当前不能视为已经接通。

## 运动模式

地形 / 运动模式切换使用已有的标准 RPC：`RobotControl.GetProfile` 与 `RobotControl.SwitchProfile`。支持运动能力目录的机器狗，`ProfileRequest.name`直接传槽位`flat`、`stairs`或已配置的`high_platform`；机器人从自己的配置解析具体模型，App不维护W5／CTS模型名称对应表。这两个 RPC 属于现有 `RobotControl` 服务。摔倒恢复是单独的 `RobotRecovery` 服务，见本仓库副本 [`contracts/brainstem_api/recovery.proto`](contracts/brainstem_api/recovery.proto)，与 `SwitchProfile` 分开。

优先从`GetProfile.mode_capabilities`读取`kind=LOCOMOTION_PROFILE`且可用、ID唯一的槽位，界面和TS／Android校验均使用槽位ID。`high_platform`仅在界面归入“高台”，网络请求仍原样传`high_platform`。`profile_id`只作诊断，`current`／`available`仍保留模型名语义；切换通过`active_mode_id`确认，不能用模型名或说明猜测当前槽位。没有运动能力目录的旧／自定义服务保留既有完整profile ID切换路径；现代目录不可用或重复的槽位不会回退成模型名请求。

机器人端能力返回见[Brainstem PR #4](https://github.com/Kitjesen/brainstem/pull/4)。需要先合并并部署相应运行时才能使用槽位目录路径；仅合并App不代表实机已升级。App切换后不会自动使能、站起、趴下或运动。源码中的通用入口仍是`session.action('switch-profile', slotId)`和`operationCallbacks.switchPolicy(slotId)`，无需另建gRPC通道；本次没有新增名为`switchMotionPolicy`的导出函数。

切换只在机器狗站立或趴地（Grounded）时允许。行走中不可切换。摔倒恢复处于选中状态时也不可切换。活动 gRPC 控制租约、姿态切换中、云卓占用或关键电机故障时，App 也不会发出 `SwitchProfile`。

2026-11-17，对实验室机器人 `192.168.66.64:13145` 做了只读的 `GetProfile`、`GetControlStatus` 与 `GetCmsState`。当时机器狗为 Grounded（趴地）；当前 profile 为 `flat_w5_model89999_kp80_policy_zero_20260929`（说明以 `flat:` 开头）；另一条可用 profile 为 `cts_v39_model61128_inherited_pd_20261023`（说明以 `stairs:` 开头）。目录中没有 platform / 高台 profile。目录和上述接口已经就位。实机尚未执行 `SwitchProfile`，平地与楼梯的切换还没有端到端验证。

高台暂不开放。请勿切换到高台模式。

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

本仓库保存 DOSO Android App 的开发源码。版本号相同不代表二进制或源码相同，交付 APK 时应记录其 SHA-256。`docs/design` 中的设计文档按原日期保留，作为设计背景。运动模式的当前说明以上文为准：2026-11-17 的实验室结果只覆盖只读目录和状态。平地 / 楼梯切换与高台仍须按实测验收，不能凭源码或网页预览视为已在真机通过。

本仓库未声明整个 DOSO 项目的开源许可证；各第三方依赖、字体和 SDK 适用各自许可。这里不包含账号数据、密钥、真实设备运行记录、签名文件或历史安装包。
