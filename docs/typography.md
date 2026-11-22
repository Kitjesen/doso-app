# 界面字体与排版

参考 Codex 官方 Appearance 中系统 UI 字体与代码字体分离的方式，不声称复制其私有实现。

- iOS、Android：使用原生 Text 的系统字体与中文回退。
- Web：system-ui、Apple 系统字体、Segoe UI、Roboto，再由中文回退覆盖缺字。
- AppText 保留原有 fontWeight、斜体、嵌套继承、ref、输入回调与系统缩放。显式等宽字体不覆盖。
- 正文 16/24，辅助 14/22，说明 13/20；页面标题 24/32、区块标题 18/26；按钮 16/24、500 字重。
- 数据读数使用 tabular-nums；不将全屏文字改成代码等宽字体。
- FontProvider 保留入口容器，直接显示内容，不再加载 MiSans 或等待字体超时。
- 历史 MiSans 素材和许可保留；现有素材许可入口不再宣称它是界面字体。

依据：https://learn.chatgpt.com/docs/reference/settings#appearance
未完成：iOS / Android 真机排版验收与新安装包发布。
