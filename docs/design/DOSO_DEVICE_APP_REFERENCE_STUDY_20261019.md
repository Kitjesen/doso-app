# DOSO：机器人与智能设备 App 排版/卡片参考研究

日期：2026-10-19。森哥明确要求：由负责人选样，用REA研究字体、字号、卡片布局，先不修改代码。

## 结论

选取 **DJI Fly、Roborock、Home Assistant**。本轮实际取得DJI Fly和Home Assistant两份官方APK，完成REA归档inventory/inspect静态分析；另对Home Assistant官方已发布Demo的Web bundle做REA惰性AST分析。Roborock只取得官方布局资料，未拿到官方APK，所以其精确字体、字号保持未知。

**DOSO最值得学习的是文字角色分工、紧凑且有主次的卡片，而不是复制别人的字库和色板。** 目前不建议仅凭这些结果就把MiSans替换为Roboto：中文实际回退尚不清楚，DJI包内字体也不等于某个实拍页面的正文。建议先把MiSans的Regular/Medium层级做好，保留Noto Sans SC作同布局字形备选，颜色、品牌、导航都不动。这里是设计建议，不是森哥已选定字体。

## 1. 哪些已查到，哪些仍未知

| 样本 | 字体事实 | 尺寸事实 | 卡片/信息组织 | 证据边界 |
|---|---|---|---|---|
| DJI Fly 1.21.12 Android | SFNT内部名称证实Roboto Regular/Medium/Bold/Black和Condensed等；有font XML和TextStyle资源引用 | 部分主页面卡片资源12dp正文/13dp标题；FPV检查项15dp，副题13dp；存在large/xlarge变体 | 官方帮助图把状态、遥测、画面、边缘操作分区；包内普通fly卡和设置卡尺度不同 | 只读归档+aapt2/SFNT补充；没有Java调用链或运行时证据，不能确认具体HUD正文/中文字体 |
| Home Assistant | 官方已发布Web bundle声明 `Roboto, Noto, sans-serif`；原生APK唯一按常见字体后缀识别出的文件是图标字体 | Web默认scale=1，含12/14/16/20/24等CSS px、400/500/700等字重；ha-card默认header24 CSS px/400 | 默认ha-card圆角12 CSS px、内容内距16 CSS px，样式可覆盖；状态/控制按卡片组织 | Web Demo不是APK内置前端，也未证明与APK同版本；CSS px不能直接当Android sp；中文回退与实机最终样式未知 |
| Roborock | 未取得官方APK，字体未知 | 官方图未给原生字号，未知 | 地图优先、顶部紧凑指标、区域选择、底部主操作，任务/routine与设备状态分层 | 官方宣传/帮助图支持结构参考，不能反推精确字体、字号或当前版本原生卡高 |

证据等级在本报告中始终分开：**包内内容 → 静态样式引用 → 页面实际渲染**。本轮到前两层，没有任何第三方App原生运行实测。截图内容也不当作代码声明。

## 2. DJI Fly：值得学的是操作信息分区，不是照搬飞行HUD

### 实际包与方法

官方APK `dji.go.v5`，versionName `1.21.12`，versionCode `3131451`。719,710,792B，SHA256 `1da8d5b2ee5cdcb6002131b8f6535605e7445080d1ca6f8411067a0d1524ce0b`。

REA静态清单记录16,161个occurrences（包含root；ZIP实际16,160个成员）。按常见字体后缀识别出45个文件：43 TTF、2 OTF；aapt2 font类型有49个资源项，**资源项数量不等于字体文件数**。未整包解压、安装或运行。

SFNT与aapt2补充取证（不是REA Java反编译）：

| APK成员/资源 | 实际观察 | 能说明什么 |
|---|---|---|
| `res/Fss.ttf` | SFNT family/subfamily：Roboto / Regular | 字体确实被打包，非按混淆文件名猜测 |
| `res/fA0.ttf` | Roboto / Medium | 同上 |
| `res/wgH.ttf` | Roboto / Bold | 同上 |
| `res/m7C.ttf` | Roboto / Black | 同上，不代表应拿来做整个DOSO标题 |
| `res/Lr1.ttf`、`res/8Zz.ttf` | Roboto Condensed Regular/Bold | 存在紧凑字形资源；未确认某个HUD的实际用途 |
| `res/RVa.ttf` | 内部Roboto Medium / Regular，资源名 `roboto_medium_numbers` | 有数字相关命名；名字本身不是页面使用证据 |
| `res/kq9.ttf` | 内部family为icomoon | 图标字体，不能误当正文 |
| `@font/font_roboto`，`0x7f090023` → `res/xwt.xml` | family显式连接Regular 400与Bold 700 | 已有静态字体族声明 |
| `@font/font_roboto_medium`，`0x7f090026` → `res/7m4.xml` | 显式连接Medium字形 | XML中权重400与字形内部Medium并非同一概念，不混写 |
| `TextStyleRobotoMedium` / `TextStyleRobotoRegular` | `0x7f1402ee` / `0x7f1402ef` 引用上述字体族 | 存在样式层引用；仍未连到某个当前实拍控件 |

包内另有媒体/装饰字体、31个 `fly_uav*` 等资源，部分内部名称为WM/WA/ZA；用途尚未确认，不把它们当正文方案。没有证据证明DJI中文正文全用Roboto，也不能从这些资源认定完整字体系统。

### 能读到的尺寸不是全App统一规格

| 编译资源 | 默认声明 | 变体与限制 |
|---|---|---|
| MainPage卡正文 `0x7f1401bf` | `s_12_dp`；v28变体另声明weight400 | 12dp；large16dp / xlarge18dp；未确认当前页面命中 |
| MainPage卡标题 `0x7f1401c0` | `s_13_dp`、bold | 13dp；large17dp / xlarge20dp |
| FPV检查主文 `0x7f140183` | `s_15_dp`、bold | 15dp；large20dp / xlarge23dp |
| FPV副题 `0x7f140187` | `s_13_dp`、normal | 与主文分层，不是全部加粗 |
| `fly_cardview_radius`，`0x7f070501` | `s_4_dp` | 4dp / large5dp / xlarge6dp；不泛指所有卡片 |
| 手持设置param-card radius，`0x7f070c4a` | `s_12_dp` | 不同场景卡片具有不同尺度 |
| 手持设置param-card height，`0x7f070c54` | `s_56_dp` | 56dp / large73dp / xlarge84dp；不是DOSO应复制的固定高度 |

这里的单位是资源实际声明的 **dp**，不是反推sp，也不是截图像素。不能据此建议DOSO把主要正文做成12。静态资源可以是遗留/备用样式，缺少调用链时不能当成当前屏幕实测。

### 可迁移 / 不照搬

- 可迁移：重要状态固定位置；数字、单位、说明不同层级；按操作紧急程度分区，不给每个指标独立大色块。
- 可迁移：首页展示设备概况，控制页才进入更高密度控制信息；不要把飞行HUD搬进设备首页。
- 不照搬：深色底、发光选中边框、小圆角、飞行专用操作，以及未经许可的品牌/媒体字库。森哥已明确不再加深描边、不整套换色。

官方结构参考：[DJI Fly页面说明](https://repair.dji.com/help/content?customId=01700006562&lang=en&paperDocType=ARTICLE&re=US&spaceId=17)。该帮助图未与本轮APK逐页建立版本对应，不是当前APK的原生截图证据。

## 3. Home Assistant：一套清楚的字阶，比满屏粗体更重要

### Web已发布字节中的确定事实

研究对象为官方Demo入口直接引用的 `main.eb421c6e1bb51948.js`，779,614B，SHA256 `d03f95e445f05516c9049e937193a57c5923236816327b8c140a905b918aa1d6`。这是发布后的bundle，不是把GitHub源代码分析冒充逆向；REA仅惰性解析，没有执行脚本。

以下偏移为Node字符串的**零起点UTF-16字符偏移**，不是原生地址或文件字节偏移：

| 声明 | 静态默认值 | bundle偏移 |
|---|---|---:|
| body font stack | Roboto, Noto, sans-serif | 378458 |
| scale | 1；可被覆盖 | 378600 |
| s / m / l / xl / 2xl | 12 / 14 / 16 / 20 / 24 CSS px × scale | 378680起 |
| normal / medium / bold | 400 / 500 / 700 | 379164起 |
| condensed / normal / expanded行高 | 1.2 / 1.6 / 2 | 379450附近 |
| ha-card圆角 | 覆盖值优先，缺省lg=12 CSS px | 113207；lg定义375495 |
| ha-card header | 缺省24 CSS px，weight400；上下左右padding为20/16/24/16 CSS px | 113628起 |
| ha-card content | padding16 CSS px | 114100附近 |

完整字阶还包括10/28/32/40，不能概括成全App“只用五个字号”。不同heading有不同角色；普通card-header的400也不意味着所有标题都用400。root另有14px声明，主题和具体控件可覆盖默认值。

HTML只在非Android UA下预加载Roboto Regular/Medium；这是**预加载条件**，不是确认字体注入条件，更不是实机加载成功。`Noto`这个family字符串也不等于精确的 `Noto Sans SC`；特定手机的中文回退未知。

### 原生APK中不要把图标字体当正文

官方APK `2026.8.4-full` / versionCode24228，40,625,111B，SHA256 `ed1ded69472f2fa87c20c975b3e5f628889ec304dc9eb6aa5c52ecb6bd4c4687`。REA归档包含2,668 occurrences（含root）。常见字体后缀文件只有 `res/9B.ttf`，SFNT family/fullname/PostScript name均为 **Community-Material-Design-Icons**，字节1,305,768，SHA256 `cbfb8ffc5961513f8c93f84674751d2dcbbc560c2d844d142ab6de1ca64a88e0`；aapt2对应 `font/community_material_design_icons_font_v7_0_96`，`0x7f090000`。

原生资源中能读到MaterialComponents通用TextAppearance，例如20sp/14sp与sans-serif-medium。但这类依赖资源不能证明某个当前页面在使用。Web CSS、原生样式、实际中文字体必须分开；本轮没有得出原生全局正文确切字体的结论。

可迁移：少量稳定字号角色、普通正文不加粗、卡片内距一致、按状态和控制分组。**不照搬它默认的1px卡边线**，DOSO保留已确认的无装饰描边方向。

官方来源：[Dashboard说明](https://www.home-assistant.io/dashboards/)、[发布后的Demo bundle](https://demo.home-assistant.io/frontend_latest/main.eb421c6e1bb51948.js)、[Android release](https://github.com/home-assistant/android/releases/tag/2026.8.4)。Demo和APK是独立样本，不声称同版本。

## 4. Roborock：借鉴地图与任务分层，不编造字体结论

官方[App介绍](https://global.roborock.com/pages/roborock-app)与[下载支持页](https://support.roborock.com/hc/en-us/articles/10752008947609-Download-links-and-QR-code-of-Roborock-App)说明地图、房间/区域、routine等能力。本次可见的官方地图控制宣传参考图中，可见顶部三项紧凑指标、居中的地图画布、Full/Rooms/Zones选择和底部主动作。

可迁移到DOSO的是：地图留给地图页，设备概况留在首页；任务卡直接表达模板、状态、下一步，而不是大面积插画。顶部指标不再每项套大卡片。

官方图不是当前APK实拍，页面亦说明界面可能变化。本轮有限检查官方全球支持、中国支持和说明书，未取得原生APK直链；没有登录Play、下载镜像包或执行安装。**字体、sp字号、圆角、卡高都保持未知。** 这部分仅是官方布局参考，不是REA已逆向该App。

## 5. 给DOSO的具体方案（全部是设计建议值，尚未实施）

### 字体先定角色，不急着全局换库

建议主方案仍使用当前有许可/接线的MiSans：正文Regular、卡题与按钮Medium，只有页面主标题/必要区标题使用Demibold，首页与任务页不使用Bold。Noto Sans SC保留为真正换字形的备选，在相同布局下看字形后再选；不从DJI包提取字体拿来用，也不把HA的Roboto英文栈当成DOSO中文方案。

以下为DOSO自身拟议 `fontSize / lineHeight / weight`，**不是参考App实测，不把CSS px/dp直接换成sp**；后续落地需跟随系统字体缩放并做安卓/iOS分别验证：

| 角色 | 当前共享role | 建议审图起点 | 使用原则 |
|---|---|---|---|
| 页面标题 | 24/32/600 | 22/30/600 | 一屏一个主标题；不再添加与THUNDER 01重复的大标题 |
| 区块标题 | 18/26/600 | 17/24/600 | 只用于必要区块，不与页面标题等权 |
| 卡题/标签 | 16/24/600；label15/22/500 | 15/22/500 | 模板名、快捷入口、设备字段 |
| 正文 | 16/24/400 | 15/23/400 | 说明、步骤，保持可读，不全局粗体 |
| 状态/辅助 | supporting13/20/400 | 13/20/400 | 待同步、限制说明；不再新增密集12号小字 |
| 数字 | 32/42/500 | 30/38/500 | 只放大关键值，未知保留破折号/待同步，不补假百分比 |
| 按钮 | 17/24/600 | 16/22/500 | 清楚但不过重，触控区不随字号变小 |

“当前共享role”来自本轮只读 `src/typography.ts`；实际Home/Tasks有局部role/override，不能把此表当全App当前字号清单。生成图v11的字体和像素比例也不能代表App真实字体。

### 卡片与首页

正常字号下的审图目标：页面边距16；卡内距14–16；行间距8；区块间距20–24。普通卡圆角16，紧凑行14，仅设备大卡20。沿用白/石墨/柔蓝，不新增每卡独立底色，不加深描边或堆渐变。

首页设备大卡目标高约236–260；机器人图作为身份缩略图，约占卡宽44–48%、高88–96，不再作为海报占满上半屏。机器人名、连接状态、电量优先；传感器/温度/电机放入同一紧凑信息组；控制中心与召回在同一操作行，权限/禁用门保持。快捷卡目标84–92高，只保留图标、标题和必要方向提示，**不恢复森哥已要求删掉的副标题**。任务概览用64–72高单行状态卡，不虚构任务数量。

### 任务页

日期条目标56–64高，星期与日期在同一选中容器；今日/只读状态64–72高。竖屏模板采用三条72–80高的纵向行：图标、标题、必要一行说明、radio。横屏再考虑并列，不让三张窄卡挤中文。

详情不恢复已删的重复机器人图；默认突出模板名、阻断原因和下一步，完整步骤通过“查看流程”展开。步骤行48–52高，主“查看流程”与禁用“开始”同排；禁用原因邻近按钮，文字/锁图标保留，不仅靠灰色表达。

所有高度都是**正常字号的设计目标，不硬锁高度**。大字、窄屏、长错误文案时卡片应增长/滚动；不得截断安全说明。触控目标至少44，Android目标优先48；不靠缩小可点击区域换密度。当前不可执行的动作仍不可执行，不以排版提案新增真实能力。

## 6. 本轮完成与未完成

- 完成：3个样本选取；2份官方APK与1份官方已发布Web bundle静态研究；REA证据导出与session关闭；字体/单位/布局边界区分；DOSO具体审图提案。
- 未完成：Roborock APK取证；DJI具体控件字体调用链；全部第三方App原生渲染/中文回退测量。这些保持未知，不把本轮称为“三款App完整逆向”。
- 未改：DOSO App、字体接线、品牌、导航、配色、package。未生成设计图或实施UI，未构建安装、登录、云端写入或控制机器人；正式设计0/20、发布NO-GO不变。
- 下一步建议：保持现有色板，仅以本提案制作首页/任务同布局真实字体审图，再逐页确认。先不全App替换字体。

完整材料身份、REA Evidence与限制见 [PROVENANCE](../../artifacts/research/20261019-device-app-typography/PROVENANCE.md)，本轮验收边界见 [ACCEPTANCE](../../artifacts/research/20261019-device-app-typography/ACCEPTANCE.md)。
