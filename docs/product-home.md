# 产品首页

实现位于 src/screens/HomeScreen.tsx、src/components/HomeFeatures.tsx 和 BottomNav.tsx；App.tsx 接入现有连接、设备详情、地图、任务与受权限约束的视频入口。

参考图：exec-a5ad6e1e-c3b7-450e-91ff-4ca6df688082.png。按图片对齐布局，图片不提供可验证的原始字体或像素参数。

设计预览：http://localhost:4311/phone.html；新用户加 ?state=empty。QA 数据仅在设计入口，未连接时隐藏电量、位置和更新时间。预览不代表真机联网。

验证：TypeScript 检查及四组首页/导航测试共 22 项通过；浏览器通知和指南开关通过，320px 竖屏与 844px 横屏无横向溢出。原生安装包字体与触控尚未验收。

REA 修改前：ev_0b4ca70dabfa65cc1db53c05771e08c5ca7b045bc8d6f1d191f089a3c4a871c3
REA 修改后：ev_836adff484ac161c9d9e764e041f9c85a5067bdeb450b7588a6ad09d25830420

2026-11-12 精修：竖屏外边距 22，390px 屏幕卡片总宽 346；统一 App 系统字体栈，柔化双层卡片阴影，透明底栏。390×844 动态卡片底部 748，底栏起点 788，无重叠。320px 竖屏/844px 横屏无横向溢出。类型检查与 22 项相关测试通过。

2026-11-12 定稿素材复刻：HomeArtwork 使用随项目保存的 home-reference.png，原生裁切显示纯装饰区域；文本、状态、按钮仍为独立组件。首页改用已授权的 MiSans Regular/Bold 静态字体，HomeText 选择字形以避免合成粗体。卡片恢复宽扁比例，390px 下单卡约181×108，动态卡片底部768、导航起点788。两种状态、窄屏与横屏检查通过；类型检查及22项相关测试通过。原生安装包与深色主题素材尚未做视觉验收。

2026-11-12 石墨主题实现：业务主界面通过 ThemePreferenceContext 固定深色，登录注册保留原主题。机器狗透明素材 assets/figma/thunder-cutout.png 来自用户提供图片的背景移除。HomeFeatures 改为无装饰轻量入口；ProfileHub 分开个人中心和设备详情；AnalysisScreen 为真实组件图表（仅 QA fixture，生产空状态）；CloudVideoScreen 保留观看授权，增加逐路与全部关闭，手机保持16:9画面。REA evidence ev_ed8f087a4c8d95086801dc5c9c4c9e282fca095cb87a133e3a0450693c08e35c。
截图总览 http://localhost:4311/charcoal-review.html。预览含示例任务和统计；任务新建仍是原流程模板，不代表完成排程保存/下发。地图展示现有预览地图，真实入口保持原有能力。未验收原生安装包或真实视频。

指定稿结构复刻（2026-11-12）：以用户再次提供的两张六页设计图为准。ProductHeader 统一品牌和设备入口；首页重排为问候、抠图、指标、当前任务、快捷入口、两条动态。ProfileHub 添加真实设备列表与通知/外观/帮助/关于面板；外观仅在本次使用生效。任务编辑 TaskEditor 支持四步骤与会话草稿，未配置真实发布回调时保存任务禁用；详情展示传入检查点与事件。地图采用大主体加路线面板，静态几何仅用于 QA。CloudVideoPreview 与实际视频共用框架但不调用接收器，静态样张仅在 src/design-qa/VideoFixture.tsx。正式视频保留授权、4路上限及单接收器全屏。
REA evidence: ev_fed043877225158fdc2136136647498bbf9005182e63438b928301852ff8aa7d。类型检查通过；本轮汇总30项相关测试通过；首页/个人/地图320竖屏与844横屏无横向溢出，任务编辑草稿保存重开已实测。截图对照 http://localhost:4311/reference-review.html。未验收原生安装包、实时视频或任务后台保存/下发。
