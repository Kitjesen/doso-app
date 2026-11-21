# 阿里云业务 HTTPS

目标：上海业务服务器47.103.89.137，api-test.dosorobotics.com。本目录不用于MQTT服务器8.153.169.177。

本轮现场读取确认Nginx配置有效，当前只有inovxio.com/www.inovxio.com的80默认站点；没有443、证书配置、Certbot或/etc/letsencrypt/live证书。后端外部URL已经配置为api-test HTTPS，API网关仅发布127.0.0.1:18000。

两份配置新增独立API域名站点，保留原网站。HTTP仅提供ACME挑战并将其他请求转向HTTPS；HTTPS只转发Auth、REST及四个明确函数。数据库、Studio、MCP和未接入的Storage/Realtime没有公网入口。访问日志只记方法、状态和耗时，不记录URL、查询参数或令牌。

## 实际执行顺序

1. 备份当前Nginx站点配置，在新的文件路径安装http-acme.conf并建立`/var/lib/doso-acme/.well-known/acme-challenge`；`nginx -t`通过后reload。先用实际挑战文件验证该域名的HTTP路径，不修改旧网站。
2. 从Ubuntu官方源安装Certbot，使用webroot方式为这个域名申请免费公开证书。申请前确认CA服务条款及账号联系人；私钥只保存在服务器。不要停掉原网站或使用自签名证书冒充可信HTTPS。
3. 签发成功后安装https.conf，`nginx -t`通过后reload，配置证书续期成功后的Nginx reload，并验证续期流程。公网只需443；数据库端口及18000保持私有。
4. 在Windows电脑使用正常系统证书验证访问最终HTTPS域名，验证Auth入口和服务鉴权。HTTP200首页不代表API通过，禁止关闭证书验证。
5. 配合`../device-cloud-20261103/`的业务增量及三份SQL发布，最后使用真实登录会话验收设备列表、绑定/解绑和远程状态开关。没有真实登录/设备时如实保留未验收项。

## 本次实际发布

2026-11-03 UTC 15:03：已按用户接通业务服务器的授权，通过上海实例Workbench执行`deploy.sh prepare`和`activate`，均成功。先备份原Nginx配置，再新增API域名站点。Let's Encrypt证书已签发，2027-02-01到期；`certbot.timer`及成功续期后的Nginx reload hook已配置，`deploy.sh renew-test`真实调用CA测试环境并退出0。

Windows外网不经过代理、正常校验证书访问`/auth/v1/health`返回401（本次未携带apikey），`/functions/v1/account-sessions`返回缺少Bearer的401，`/studio/`返回404。以上证明公网TLS、反向代理及拒绝未登录访问生效，不等于真实账号/机器狗业务验收。私钥保留在服务器，没有复制到本机或聊天。

CA账号未配置联系邮箱；续期依赖服务器timer，需在日常运维中监测证书到期与timer失败。当前保留原网站配置；独立检查inovxio.com公网响应403，不能在这里宣称原网站公网可用。
