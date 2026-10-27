# DOSO 地形模式接口

2026-10-25：App接口约定与门禁已准备，未部署策略模型、未进行真机切换。

| App名称 | Brainstem RobotProfile.name / ProfileRequest.name |
| --- | --- |
| 平地模式 | flat |
| 楼梯模式 | stairs |
| 高台模式 | platform |

这三个ID是此次约定，不代表当前机器狗已注册这些配置。模型文件名可以不同；服务端须将对应的实际模型、姿态、增益、缩放和限位作为完整RobotProfile注册。不能只给同一未知模型换三个名字就声称三种地形能力。climb、stairs_candidate、含中文描述或文件名片段均不自动映射。

## 通信流程

沿用已配置的Brainstem gRPC/mTLS连接（项目服务端口13145），不新增HTTP控制接口。

1. 读取真实策略目录/当前策略。协议GetProfile返回ProfileInfo，包含current、available、descriptions、current_description。
2. App的getControlTerrainPolicies只把同步目录中完整匹配的flat/stairs/platform绑定到三个界面选项。界面仅显示“平地、楼梯、高台”，不显示待同步/未配置尾注；目录未知或缺少对应ID仍保持禁用，原因保留在辅助功能提示中。
3. 用户选模式并确认后，现有operationCallbacks.switchPolicy(id)进入session.action('switch-profile', id)，Android DosoBrainstemGrpc发送SwitchProfile(ProfileRequest{name: id})。
4. 保留现有权限与状态复检：连接和身份有效、坐下/grounded、电机失能、无活动控制租约，且目标仍存在于最新目录。当前不能在行走中热切换。
5. 以设备回报的current确定当前模式；点击、请求发出或本地选中均不改成已生效。来源失效会撤销旧确认。

## 实现位置

- src/features/control/controlOperations.ts：三个标准模式、严格目录匹配。
- src/screens/ControlScreen.tsx：模式面板、未配置/待同步、原确认流程。
- src/features/control/useBrainstemControl.ts / brainstemControlSession.ts：实际策略调用及状态门禁。
- modules/brainstem-grpc/android/src/main/java/expo/modules/brainstemgrpc/ControlSession.kt：原生gRPC发送。
- Brainstem brainstem_api/brainstem_api/cms.proto：ProfileRequest/ProfileInfo/SwitchProfile/GetProfile。

首页独立“连接机器狗”入口已移除；控制页设备身份入口仍打开现有连接设置。动作库与地形模式是不同能力，PlayGesture/ListGestures的未实现状态未被此次接口约定改变。

后续设备验收应逐一确认实际注册目录、模型加载成功、回读current、错误/缺失策略拒绝、切换期间输入取消；本地测试不代替真实楼梯或高台通过能力。
