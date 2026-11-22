# DOSO 国内 OTA 正式部署

这套正式入口由两个阿里云组件组成。

```text
api.dosorobotics.com
  ↓ HTTPS
上海 ECS：doso-ota-release
  ↓ OSS signed URL
上海 OSS 私有 Bucket：doso-ota-prod-shanghai
  ↓ HTTPS + Range
机器狗：doso-ota
```

## ECS 发布 API

Rust 服务位于 `D:/DOSO/robot-cloud/cloud/release`，程序名是
`doso-ota-release`，默认只监听 `127.0.0.1:8140`。公网访问应由 ECS 上的
Nginx 或阿里云 API 网关提供 HTTPS，不直接暴露 8140。

服务提供：

```text
GET  /health
GET  /v1/devices/{deviceId}/firmware/releases
POST /v1/devices/{deviceId}/firmware/jobs
GET  /v1/devices/{deviceId}/firmware/jobs/{jobId}
POST /v1/devices/{deviceId}/firmware/jobs/{jobId}/cancel
```

发布服务读取设备兼容登记和 release template。创建作业时，服务为 OSS
对象生成短时签名 URL，把 URL 写入最终 manifest，再用 release 私钥签名。
App 和机器狗都不会拿到 OSS AccessKey Secret 或 release 私钥。

## OSS 私有 Bucket

正式 Bucket 规划为 `doso-ota-prod-shanghai`，地域为 `cn-shanghai`，读写权限
保持私有。对象路径为：

```text
firmware/{channel}/{model}/{version}/{releaseId}/manifest.json
firmware/{channel}/{model}/{version}/{releaseId}/brainstem.bundle
```

第一阶段由 ECS API 生成 OSS 预签名 URL。设备端直接下载制品，不需要 OSS
向公网开放目录。设备量增加后，可以在这个私有 Bucket 前面增加 CDN 私有回源。

## 发布资料

ECS 的 `DOSO_RELEASE_ROOT` 目录保存：

```text
releases/{releaseId}/manifest.template.json
jobs/{jobId}.json
```

模板中的 `objectKey` 指向 OSS 对象，最终下载 URL 在创建作业时动态生成。
每个 release 仍然使用不可复用的 `releaseId`、递增的 `sequence`、SemVer
`version` 和 `dev / qa / stable` channel。

## 当前部署状态

代码和 systemd 单元已经准备好，本机测试通过。ECS `x86_64` Linux 发布制品
已经构建，位于 `D:/DOSO/robot-cloud/artifacts/robot-cloud/releases/20261114-ota-release-x86_64`，制品 SHA-256 记录在同目录的 `build-evidence.json`。
真实 OSS Bucket、ECS 上的发布 API、`api.dosorobotics.com` HTTPS 和备案接入尚未完成。
用户已确认右侧阿里云会话已登录，但当前自动化读取不到该侧栏页面，Bucket 状态仍待页面核对。
