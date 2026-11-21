# 视频观看授权候选

文档核对：2026-11-08。业务观看授权已有2026-11-06部署记录；媒体程序、实际摄像头、手机/G20播放及公网媒体链路分别验收。服务器侧媒体源码位于 `D:\DOSO\robot-cloud\cloud\media/`，机器狗端视频源启停由 `robot/` 管理，媒体帧通过MediaMTX/WebRTC传输。当前部署与验收状态以 [媒体说明](D:/DOSO/robot-cloud/cloud/media/README.md) 和 [云端进度](D:/DOSO/robot-cloud/PROGRESS.md) 为准，状态上报联调不作为视频通过证据。

2026-11-06 业务接口已部署，未授权与未知凭据拒绝检查通过；真实设备与 App 观看尚未验收。App 使用现有账号会话调用 `video-access`，明确为一台设备打开观看：`POST {"action":"open","deviceId":"UUID"}`。业务端核对活跃账号、终端、Auth 会话、真实设备归属和授权代次，生成 256 位随机观看凭据，仅将摘要保存在私有数据库。返回 `viewerToken`、`viewerId`、`deviceId` 和 Unix 毫秒 `expiresAt`；凭据有效期固定为 60 秒。

App 将 `viewerToken` 交给现有 WHEP receiver。Rust 媒体适配器向 `video-authorize` 发送 `Authorization: Bearer <viewerToken>` 和 `{"action":"video.view"}`，得到现有适配协议要求的 `viewerId/deviceId/expiresAt`。观看凭据只允许单设备观看，不是用户 JWT，不用于设备登录或推流。业务函数内部保管 Supabase service-role 密钥，Rust 无需持有它或另一份服务密钥。

`video-access` 的 `POST {"action":"close","deviceId":"UUID"}` 撤销当前账号、当前终端会话对此设备的凭据。到期、关闭、账号停用、终端撤销、Auth 会话删除、设备解绑或授权代次改变后，新的验证请求均被拒绝。重新打开会替换同一账号、终端、设备的旧凭据，不延长已有媒体会话。

许可与运行状态开关分开：开启远程状态不产生视频许可，视频许可也不修改状态采集选择。该接口只证明账号允许请求观看，不能证明设备本地云开关已打开、摄像头就绪或已经开始推流。推流和本地授权仍须分别接通。

已建立的媒体会话不会因数据库撤销自动消失。App 释放 WHEP 会话后关闭业务许可；当前候选最迟随当前 60 秒期限关闭，不可将新请求拒绝宣传成活动会话即时撤销。本地 App 已加入四路入口、取得和释放凭据、观看中续期及暂时断网后恢复；视频源按需启停已通过模拟 MQTT 联调，公网传输及真机验收尚未完成。

业务服务已应用 `20261105110000_add_video_grants.sql` 并发布 `video-access` 与 `video-authorize`。`video-authorize` 使用非 JWT 凭据，平台 JWT 校验关闭，由函数自行验证。所有响应禁止缓存，凭据不得放入 URL、日志或设备配置。该发布不是完整视频功能的上线验收。

2026-11-05 本地验证：6 项 Deno 接口测试、入口类型检查、lint 和 fmt 通过。隔离 PostgreSQL 共 27 组通过，其中新增视频 6 组覆盖权限边界、跨账号、凭据替换、到期、账号/终端/Auth 会话撤销、解绑和授权代次、隔离状态拒绝及最小状态 schema 兼容。完整生命周期列存在时仅允许 owned 设备；状态最小部署不因此依赖运动命令迁移。证据位于 `artifacts/multi-device/2026-11-05T11-17-34-795Z/verification.json`，集群已停止。Auth 传输与账号数据为测试替身，未完成在线部署、App 或真实媒体端到端验收。
