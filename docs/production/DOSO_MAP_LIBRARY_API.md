# 云地图目录与文件能力接口

2026-11-03，本地实现合同；未部署。业务端沿用 Supabase Edge Functions 的 `/functions/v1/map-library` 入口。机器人 MQTT 合同仍以 `D:\DOSO\robot-cloud\CONTRACT.md` 为准，本接口不代替机器人任务执行器。

## 权限和状态

所有请求使用现有 Supabase Bearer 会话，服务端验证账户和当前终端会话。`owner_id` 从认证结果取得。用户不能直接修改地图表；服务端事务检查设备当前归属和 `robot_authorization_epoch`。地图永久归属创建账户，出售来源设备不转交旧地图。

目录：`GET`，返回 `{versions:[...]}`，最多最新 100 条。字段包含 `id,device_id,name,source_map_id,source_content_epoch,frame_id,format,schema_version,archive_format,size_bytes,sha256,crc64,status,created_at,ready_at`。不返回 OSS object key、upload ID、长期密钥或签名 URL。

状态：`uploading → verifying → ready`；大小/CRC64不符会保存为 `failed`，重新上传须建新版本。取消为 `cancelled`，不允许迟到结果将其恢复。准备上传使用同一 `requestId` 重试；相同 ID 不得用于不同地图内容。并发初始化保留先保存的OSS上传会话，终止多余会话。ready 文件不重新签发上传权限。设备换主后，原创建者仍可取消自己未完成的上传。

## POST 操作

| action | 请求 | 结果 |
| --- | --- | --- |
| prepare-upload | deviceId、requestId（UUID）、metadata | 版本和上传准备结果 |
| upload-part | versionId、partNumber（从1起） | 固定对象/上传任务/分片的 HTTPS PUT 能力，5分钟有效 |
| complete-upload | versionId、parts（number/etag数组） | 完成分片、读取 OSS 属性并事务确认，返回版本 |
| cancel-upload | versionId | 先取消数据库版本，再尽力终止OSS分片任务 |
| download | versionId | 仅本人 ready 版本的5分钟 HTTPS GET 能力；不代表已向机器人下发任务 |

`metadata`：`name,source_map_id,source_content_epoch,frame_id,format:'lingtu-map-package-v1',schema_version,archive_format:'tar.gz',size_bytes,sha256,crc64`。最大归档20GiB，每片8MiB（最后一片为余量）。归档内保留原生 package manifest，云字段不写入原 manifest。大小/校验值必须来自本次导出快照。

`upload-part` 返回 `{url,partNumber,sizeBytes,headers:{"content-length":"..."},expiresInSeconds:300}`。签名使用OSS V4，将对象、uploadId、分片编号和准确长度绑定；Rust客户端必须按返回长度发送请求体和请求头，不能改成分块传输编码。下载返回 `{version,url,expiresInSeconds:300}`。这些URL不包含长期密钥，但本身是短期能力，不得交给未授权设备。

## 校验的准确含义

服务端完成 multipart 后，读取 **OSS 实际保存对象的大小和 CRC64-ECMA**，与上传前记录比较；不使用 ETag 冒充 SHA-256。ready 表示文件存储及该项传输完整性检查通过，不表示地图语义有效、已导入或可定位。

SHA-256 在此阶段是上传方声明值。目标机器狗仍须下载完整归档，计算 SHA-256，检查归档路径与原生地图格式，再导入新本地 ID。云端未复算 SHA-256；CRC64 不是密码学认证。这避免将数百 MB 地图重新下载进短时 Edge Function 作全文件哈希。后续若需要云端密码学内容认证，须接可信流式验证任务后增加单独验证状态，不能改变现有字段的含义。

临时链接是持有者能力，不能记录到普通日志或目录。数据库取消会阻止新的授权和ready提交，但不能收回已下载的数据；已签链接受有效期及OSS multipart终止结果限制。

## 本批交付与后续边界

App 只接目录查看/刷新和空态、失败态。机器人导出、HTTPS传输、MQTT异步调度、下载后的解包/导入、单独激活，均须后续接线。没有执行器前不放出假成功的传输按钮。

环境使用后端专用 `DOSO_MAP_OSS_REGION`、`DOSO_MAP_OSS_BUCKET`、`DOSO_MAP_OSS_ACCESS_KEY_ID`、`DOSO_MAP_OSS_ACCESS_KEY_SECRET`。私有 bucket 尚未创建，不在此轮开通服务或部署。没配OSS时目录仍可读，文件操作明确返回不可用。

后续接机器人时，由业务后端授权并交付受限能力，不把App用户的长期会话或OSS AccessKey放进机器人。当前接口要求用户会话，尚未实现机器人专用的异步任务领取入口。归档下载完成后的SHA256、路径安全和MapStore导入仍由待接的机器人执行器负责。

生产启用前还须验证官方 `ali-oss@6.23.0` 在托管Edge运行时的兼容性、真实OSS上传/HEAD/下载、未完成分片与取消/完成竞争造成的孤立文件回收、账号删除后的对象清理。SDK已延迟加载，读取目录和未配置状态不依赖其Node系统调用。上述回收尚未实现，不宣称取消会删除全部已落盘字节。
