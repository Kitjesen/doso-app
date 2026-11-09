# 登顶之后

AI 品牌概念画面，由内置 image_gen 生成，并非机器狗实际登山记录。
外观参考为 DOSO App 的 assets/figma/home-02.png；四轮足结构需要在正式宣传素材发布前按实机再次核对。

竖屏构图：上方留出深蓝天空放白色字标和宣传语；机器狗与山脊位于画面中部，表单在下方云海上。

横屏构图：左侧品牌与完整机器狗，右侧亮云海承托表单。通过 picture 按方向选择横版照片，不拉伸竖图。适配844×390、1024×768、1000×900、1366×768；切换方向保留已输入内容。

动效是静态概念图的分层动画：图片最大3%的慢推近与轻微横移，底部淡雾漂移，右侧晨光透明度缓变。既不模拟腿部运动，也不当成实拍视频。支持暂停/继续、后台暂停和系统减少动态效果；用户暂停不会被前后台切换覆盖。

素材：assets/summit-dawn.png、assets/summit-landscape.png。预览：summit.html。本目录保存 2026-11-10 已确认的定稿，未修改正式 App 登录页面。

## 横版背景生成提示摘要

由内置 image_gen 参考已认可竖图重新构图。16:9横版，同一白色DOSO机器狗和清晨山景，严格四个轮脚。完整主体位于左侧x10%—47%、y34%—77%内，左上0—29%留深蓝天空承托品牌，右42%留亮而低对比的云海与晨光，避免裁切轮脚和右侧字段被复杂山石干扰。不加入人物、旗帜、文字、UI、水印。

## 生成提示摘要

以参考图的白色 DOSO 轮足四足机器狗为唯一产品身份，保留长方形白色机身、黑色关节与四个独立轮脚。机器狗平稳站在清晨山顶，三分之四侧面视角，望向远处山脊。暖色晨光勾勒机身边缘，蓝灰群山、银白云海。竖版背景，上部0—22%留深色天空，完整机器狗位于27—44%，山脊在43—49%，下半部留低对比亮云雾承托黑色登录文字。无人物、旗帜、界面文字或水印。

## 最后一次构图修正提示（原文）

Refine ONLY the composition of this beautiful portrait robot-on-summit image for a mobile login background. Preserve the same photorealistic white DOSO wheeled quadruped, EXACTLY FOUR articulated legs and four tires, proportions, color, dawn rim lighting, blue-gray mountains, pale clouds and quiet sense of reaching the summit. Preserve the current sky and natural realism. Do not add text, logo overlays, people, flags, UI or borders.

Specific layout repair: the current robot and rock platform are too large and too low for interface space. Make the robot and summit platform approximately 70 percent of their current size. Move that whole subject grouping UP, so the robot body begins about 27 percent down the portrait and the lowest wheel finishes by 44 percent down. Robot centered slightly right, total robot width about 58 percent of the image. All FOUR wheels must be fully visible and firmly grounded on the rock. The narrow rock summit occupies roughly 43-49 percent of the picture and comes in from the right. Leave the entire lower half (from 52 to 100 percent) as low-contrast bright silver-white mist and a distant atmospheric cloud sea, with no foreground dark rocks, so black login labels can be placed there later. No split-panel composition: make the cloud transition continuous and natural. Keep upper 0-22 percent as clear mid-dark blue-gray sky. Same tall portrait aspect ratio, same nuanced cinematic dawn light and premium product photography.
