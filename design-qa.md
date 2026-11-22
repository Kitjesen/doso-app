# DOSO App — Design QA

## Latest scoped review: 2026-11-06 eight control settings pages

Scope: 通用、操控、视频、音频、网络、机器人、安全、关于 only. The historical whole-product acceptance status below is unchanged.

- Source: `C:/Users/99563/.codex/attachments/5cdb2b30-06a1-4f81-abcf-54355ccc5ee6/image-1.jpg`, 1280 × 720 settings overview.
- Implementation: `artifacts/ui-refresh/20261106-settings-suite/01-general-wide.jpg` through `08-about-wide.jpg`, plus all eight `*-g20.jpg` images. Wide captures are 1280 × 720; compact captures are 753 × 447, one image pixel per CSS pixel.
- State: isolated static-media fixture; preview data is not physical-device evidence. Seven category pages extend the source's visual language; pixel-identical eight-page fidelity is not claimed.
- Same-input comparison: `artifacts/ui-refresh/20261106-settings-suite/reference-comparison.png`. Individual full-size and compact captures were also opened for readable typography/card detail; a separate crop was unnecessary.
- Fixed: duplicated category contents; compact close-target overflow; safety and robot card clipping; stop incorrectly disabled by a mode picker/confirmation.
- Verified: eight distinct pages and consistent material/type/navigation; no default-font compact overflow; shared overlay state; layout and read-only connection navigation; local mode-stop cancellation with stale intent rejection; 126 related tests, 4 QA-request tests, typecheck and source checks.
- Console: no errors; existing pointerEvents deprecation warning retained. Native G20 rendering, large system fonts, actual media services and robot control remain outside this review.
- Detailed report, comparison history, planned interfaces, remaining acceptance work and hashes: `artifacts/ui-refresh/20261106-settings-suite/design-qa.md`, `docs/design/CONTROL_SETTINGS_SUITE_20261106.md`, `artifacts/ui-refresh/20261106-settings-suite/evidence.json`.

final result: passed

## Latest scoped review: 2026-11-05 reference-inspired control style

- Source visual: `artifacts/ui-refresh/20261105-control-reference-style/reference.jpg` (user-provided energy dashboard).
- Implementation: `artifacts/ui-refresh/20261105-control-reference-style/control-light.jpg`, `control-dark.jpg`, `control-short.jpg`, `control-mode.jpg`, `control-settings.jpg`, `control-portrait.jpg`.
- Target: style and spacing adaptation for the existing landscape control screen, not a 1:1 copy of the source's content or grid.
- Viewports: 753×501, including a 54 px QA banner and 753×447 product canvas; 844×444 short landscape; 390×844 portrait. Browser screenshots use one output pixel per CSS pixel. Source dimensions and artifact hashes are recorded in `evidence.json`.
- State: offline, unknown telemetry, no actuator permission. Screenshot numbers were not fabricated to resemble the energy dashboard.
- Full-view comparison: original reference and rendered light/short screenshots were opened together in a single image inspection input. Different source/product states and aspect ratios are intentional. The top-card typography and toolbar details are legible at the supplied full resolutions; separate raster focus crops are unnecessary for this scoped style review.

### Findings and comparison history

The requested adaptation was implemented before the first combined visual review. That review found no actionable P0/P1/P2 issue within the scoped style transfer. The 753 px header bounds fit and its groups do not overlap. The saved full-resolution views show consistent outer margins, lower left/right input zones and a centered action group. The later 0.86 minimum font-scale adjustment protects small units without changing the captured unknown-reading state.

- Fonts/typography: existing MiSans retained, 24 dp readout/18 dp identity/14 dp label hierarchy. Units use a smaller inline run. Using the reference's thin English display face would disrupt the current Chinese product system and is deliberately excluded.
- Spacing/layout: 16 dp outer margins, 12 dp header inner spacing, 28/16 dp nested radii. The robot screen retains a wide observation/control area rather than copying the dashboard's stacked charts.
- Colors/tokens: white surfaces over near-white neutral canvas, contrasting speed tile, existing blue operation emphasis and red stop semantics. Dark theme inverts the metric contrast. Strong orange gradients are intentionally excluded.
- Image quality/assets: source reference saved intact; no source photography or synthetic camera frame was inserted into the App. Existing vector icons remain crisp. Screenshots include the QA disclosure and are not device photographs.
- Copy/content: real Chinese robot-control terms, unknown readings and unavailable actions retained; energy-dashboard copy is not carried into the product.

### Interaction and validation

Mode menu open/close, settings menu, layout settings entry/return, dark/light theme, header bounds and browser error logs were checked through IAB. 129 targeted tests, typecheck and the control source contract passed. No console errors were captured. Local-file preview navigation was blocked by browser URL policy; the supported localhost App was used, with no workaround for file access.

final result: passed

This result covers the scoped browser style adaptation only. Native G20 readability, touch feel, video compositing/performance and the user's visual acceptance remain outstanding; there is no new APK or robot-control acceptance claim.

## 最新：2026-09-09 v9 纯色认证实装

状态：候选，未登记视觉通过。用户纠正全页渐变后，移除登录/注册、首页及导航中的雾化底图。认证改为纯白/纯蓝黑画布、纯浅灰输入框、品牌蓝操作；原始产品图只出现一处。小屏重新排图，大字优先文字。

已验证：15 组自动化检查、Android JS/资源导出、登录/注册 Web 浅/深/横截图，以及 320dp 注册页无横向溢出。真实渲染截图和源码哈希：`artifacts/design-acceptance/20260909-solid-auth-v9/verification.json`。Web 安全提示条保留，不裁掉冒充原生证据。

未验证：最新 Android 原生三态、Figma 同尺寸像素、真实邮箱/社交授权 E2E、正式签名包、20 页总验收。未创建真实账号、发送验证码或触发机器人指令。内测 APK 的构建状态见该目录 release-note.md。

## 历史：2026-09-08 v8 实装观感复审

final result: blocked

用户查看当前注册页后明确质疑实装效果。当前源码设计有效通过仍是 **0/20**；下方所有通过页数均为历史，不代表现在通过。v8 暂停向其他页面推广。

本次只审注册入口的视觉，不宣称完整账户链路或无障碍审计通过。实际 Android 采集与参考同输入核对：`artifacts/design-acceptance/20260908-soft-air-v8/reference-vs-register.png`；原始截图在同目录 `android/auth-register/`，Web 当前开发预览也已检查空提交焦点及密码显隐。

1. 注册默认画面：视觉不合格。源参考靠明确蓝/奶油色材质块、白色层和产品光影建立重点；实装把这些压成近白表单，只有圆角，没有同等层次。主 CTA 被改成偏灰的深蓝，缺少已选 DOSO 源蓝活力。
2. 顶部构图：待返修。主标题、裁切的机器人和底部账户标题未形成一个紧凑的完整构图；产品图的边缘清晰度也需在最终设备尺寸核查。不可直接将另一产品的英文字体字号照搬中文。
3. 表单与社交：功能检查有进展，但不构成视觉通过。标签/占位符/说明层级偏平；社交图标静默禁用，虽然真实门禁正确，仍有发现性风险。应采用不假装授权可用的清晰交互方案。

改进顺序：先冻结一张注册页的可实现标准稿（含字体、材质、图像裁切、色彩和各状态），再按同尺寸原生截图逐项还原；在目视通过前不复制到其余 17 页。Figma 云端未同步，真实认证 E2E 与生产签名包仍未验收。

## 以下为历史记录

## 2026-09-08 注册页视觉更新

用户已确定白底、深石墨和柔和蓝的新方向，规范见 `docs/design/DOSO_VISUAL_DIRECTION.md`。注册页源码样板已完成 Android 三态与 Web 交互检查；保留真实认证回调，未开放未配置 Provider。证据：`artifacts/design-acceptance/20260908-register-soft-blue-v6/auth-register/`，完整检查说明见上级目录 `qa-progress.md`。

当前新样板仍未完成 Figma 云端同步或真实注册 E2E，不记录最终设计通过。此前登录、机型与分析的机器通过因目视遗漏回到复验；当前清单保留 3/20，旧文中 7/20 仅为历史。

## Current acceptance status — in progress (1/20)

- `main-routes` now has current-source strong evidence in `artifacts/design-acceptance/20260901-main-routes-final-v5/main-routes/`; all three visual states, P0/P1/P2, source hashes and the page design-audit pass.
- Historical accepted runs below remain audit history only unless the machine-readable manifest points to a current evidence directory.
- Shared shell, tracked Figma navigation assets and the machine pixel gate are frozen; dynamic Android system bars are the only masked pixels.
- Current-source Batch A work has restored `main-routes`; `main-tasks` and `main-home` still fail at least one full-frame threshold and are not accepted.
- The editable Figma copy now contains 11 product pages × 3 states under Section `3444:2680`; native exports are in `artifacts/design-acceptance/20260831-source-sync-11-figma-export/`.
- Current-source 11-page Android captures and comparisons are in `artifacts/design-acceptance/20260831-source-sync-11-v1/`; all remain rework evidence, not accepted evidence.
- Next gate: continue `main-tasks`, then `main-home`, using the same Figma-native export and Android three-state loop.

## Latest accepted page: model selection

- Acceptance run: `20260826-201500-model-select-pass1`
- Figma file: `Y9BYG8ctEXdLeW3yXwfzpY`
- Nodes: light `139:5298`, dark `139:2821`, landscape `139:7848`
- Implementation: `src/screens/ModelSelectScreen.tsx`, `src/screens/modelSelectLayout.ts`
- Evidence: `artifacts/design-acceptance/20260826-201500-model-select-pass1/model-select/`
- Comparison sizes: portrait 390 × 844 px; landscape 844 × 390 px. Each final App image came from the rebuilt local Android QA package and was placed beside the same-size Figma source.
- Result: light portrait, dark portrait and landscape passed independent visual review with P0/P1/P2 = 0; independent final code review returned APPROVE with P0/P1/P2/P3 = 0. Product imagery, source-badge masking, cards, dark surfaces, fixed CTA and the wide split layout are accepted; the focused original-resolution crop confirms the dark CTA label.
- Responsive and interaction fixes: header progress and wide controls derive from measured post-safe-area width; 390/360/320 portrait, 360/320 stacked landscape and wide landscape-cutout contracts keep every header, control, card and column contained. Search or filtering that hides the selection disables Continue, and only a visible selected model can be submitted. Small text meets WCAG AA normal-text contrast across screen, field and card surfaces.
- Product truth: four unique catalog records replace the Figma-only repeated twelve-card fixture. The unsupported `兼容优先` claim was removed. Visible copy and accessibility semantics disclose that this is a control-center preview, not physical configuration or device saving.
- Verification: model-select responsive/state/contrast 12/12, robot capability readiness 25/25, trusted-device/lifecycle/theme guards and TypeScript passed. Android production export bundled 817 modules/34 assets; the signed x86_64 QA evidence APK bundled 685 modules/33 assets. The temporary capture entry and QA package were removed and the emulator restored.
- Boundary: this UI acceptance does not mean GATT authentication, Wi-Fi provisioning, MQTT transport, OTA/rollback or physical robot movement has passed; the production executor remains unavailable and all physical gates remain closed.

## Historical accepted page: robot control

- Acceptance run: `20260826-190500-control-pass1`
- Figma file: `Y9BYG8ctEXdLeW3yXwfzpY`
- Nodes: light `139:6520`, dark `139:4019`, landscape `139:8596`
- Implementation: `src/screens/ControlScreen.tsx`, `src/screens/controlLayout.ts`, `src/features/robot-lifecycle/robotDiagnosticsPanel.tsx`
- Evidence: `artifacts/design-acceptance/20260826-190500-control-pass1/robot-control/`
- Comparison sizes: portrait 390 × 844 px; landscape 844 × 390 px. Each final image came from the rebuilt local Android QA package and was placed with its Figma source in the same comparison input.
- Result: light portrait, dark portrait and landscape passed independent visual review with P0/P1/P2/P3 = 0. Portrait hierarchy, quick-status row and cards align to the source; dark mode uses the accepted `#25303A` / `#1A2028` layers; landscape is a true 330 / 39 / 435 two-column composition before physical side insets contract it.
- Responsive and accessibility fixes: 360/320 dp mode cards stack the selector and map before overlap; all state summaries are semantic; interactive header and mode targets remain at least 44 pt; all four safe-area edges remain protected without negative margin or inset reclaim.
- Product truth: distance, runtime, health and map data remain `待同步` or `—`; Figma fixtures are not presented as telemetry. Manual, route and task modes retain independent capability/executor gates and selecting a mode is not dispatch. Physical diagnostics remains unavailable and cannot unlock movement.
- Verification: control static/layout behavior 6/6, diagnostics 9/9, capability readiness 25/25, command executor 30/30, trusted-device/lifecycle/theme guards and TypeScript passed. Android export bundled 816 modules/34 assets; the signed x86_64 QA evidence APK bundled 684 modules/33 assets, installed successfully and produced the final three-state evidence. The temporary capture entry and package were removed and the emulator restored.
- Boundary: this UI acceptance does not mean GATT authentication, Wi-Fi provisioning, MQTT transport, OTA/rollback or physical robot movement has passed; the production executor remains unavailable and all physical gates remain closed.

## Historical accepted page: main profile

- Acceptance run: `20260826-134500-profile-pass3`
- Figma file: `Y9BYG8ctEXdLeW3yXwfzpY`
- Nodes: light `139:7104`, dark `139:4589`, landscape `139:10918`
- Implementation: `App.tsx`, `src/screens/ProfileScreen.tsx`
- Evidence: `artifacts/design-acceptance/20260826-134500-profile-pass3/main-profile/`
- Comparison sizes: portrait 390 × 844 px; landscape 844 × 390 px. Source and normalized implementation images use identical pixel dimensions at 1× comparison density; raw Android screenshots are retained beside the normalized evidence.
- Result: light portrait, dark portrait and landscape passed same-input combined comparisons and independent visual review with P0/P1/P2/P3 = 0. Portrait evidence came from the current `com.doso.robot` debug package; the dark comparison used a stable cold start. After the final safe-area repair, landscape was regenerated from a locally signed release-mode `com.doso.robot.qa` artifact built from the same source and real App chrome; its temporary capture entry was removed before verification and commit.
- Visual convergence: portrait preserves the source hierarchy and device/settings rhythm; dark mode uses the real app theme; the 844 × 390 no-side-inset baseline renders the source 330/340 two-column composition with a 39 px gap. The shell protects all four safe-area edges and Profile always lays out inside the measured post-safe-area width. Physical side insets contract the columns instead of being reclaimed; narrower content scales to defined readable minima and then stacks instead of clipping.
- Required fidelity surfaces: typography hierarchy, spacing/layout rhythm, light/dark color tokens, source icons/assets and visible copy were checked in the combined comparison images. Focused crops were not needed because all device, connection, settings and navigation details remain legible at the normalized full-frame sizes.
- Interaction and accessibility: connection/status/disconnect controls, setting rows and switches expose button or switch semantics, disabled state and readable hints; interactive targets retain the app's 44 pt contract.
- Product truth: missing battery, runtime, firmware and sync data remain `—`, `待同步` or `尚未同步`. Physical connection, secure provisioning, OTA and safety-lock actions remain unavailable unless their real capabilities are injected; the UI does not present a simulated result as a real device state.
- Verification: profile static and layout behavior contracts 7/7, route UI/policy 3/3, task UI/policy 7/7, trusted-device and theme/orientation guards, TypeScript and Android/Web export passed. Android exported 814 Metro modules/34 assets; Web exported 441 modules/35 assets; the production debug bundle loaded 944 modules and the final QA evidence bundle loaded 686 modules/33 assets. Both the Android debug APK and local x86_64 QA evidence APK built and installed successfully. Product-wide service/database counts are intentionally excluded from this page-specific evidence.
- Boundary: this UI acceptance does not mean GATT authentication, Wi-Fi provisioning, MQTT transport, OTA/rollback or physical robot movement has passed; the production executor remains unavailable and all physical gates remain closed.

## Historical accepted page: main tasks

- Acceptance run: `20260826-121733-tasks-pass5`
- Figma file: `Y9BYG8ctEXdLeW3yXwfzpY`
- Nodes: light `139:6722`, dark `139:4209`, landscape `139:11041`
- Implementation: `src/screens/TasksScreen.tsx`, `src/features/tasks/taskStartPolicy.ts`
- Evidence: `artifacts/design-acceptance/20260826-121733-tasks-pass5/main-tasks/`
- Comparison sizes: portrait 390 × 844 px; landscape 844 × 390 px
- Result: light portrait, dark portrait and landscape all passed independent visual review with P0/P1/P2 = 0; final independent code review returned APPROVE with P0/P1/P2 = 0.
- Visual convergence: real transparent Figma robot rasters replace rectangular-background variants; portrait summary, heading, carousel baselines and side-card proportions align to the source; landscape uses a true two-column composition with three complete cards and vertical-navigation clearance; dark navigation has no external green glow.
- Interaction and accessibility: date and template selection remain interactive; circular start controls retain real 44 pt minimum touch targets and expose a readable disabled reason.
- Product truth: every visible task remains a disclosed, non-executable template with `taskId: null` and an unverified plan. Starting a real task requires explicit control and executor availability, an own-property trusted source, a normalized trusted task ID and a validated plan, followed by atomic revalidation. Inherited fields, accessors, malformed values and post-binding mutation fail closed.
- Verification: task UI/policy 7/7, robot capability readiness 25/25, trusted-device and theme/orientation guards, typecheck, Android/Web export, QA APK build/install/smoke and the complete 27-step release gate all passed. The gate included Functions 59/59, database 461/461 and account-email operations 42/42. Android exported 814 Metro modules/34 assets; Web exported 441 modules/35 assets; the final QA APK bundled 686 modules/33 assets, installed successfully and produced no ANR.
- Boundary: this UI acceptance does not mean GATT authentication, Wi-Fi provisioning, MQTT transport, OTA/rollback or physical robot movement has passed; the production task executor remains unavailable and physical gates remain closed.

## Historical accepted page: main routes

- Acceptance run: `20260826-102717-e6e671f-final`
- Figma file: `Y9BYG8ctEXdLeW3yXwfzpY`
- Nodes: light `139:7397`, dark `139:4784`, landscape `139:10680`
- Implementation: `src/screens/MapScreen.tsx`
- Evidence: `artifacts/design-acceptance/20260826-102717-e6e671f-final/main-routes/`
- Comparison sizes: portrait 390 × 844 px; landscape 844 × 390 px
- Result: light, dark and landscape same-input comparisons all passed independent visual review with P0/P1/P2 = 0; independent code review returned APPROVE with P0/P1/P2 = 0.
- Accessibility: route filters now provide a real 44 pt touch target while retaining the 36 pt Figma visual rail and capsule.
- Product truth: visible routes remain non-executable templates with no trusted route ID or validated geometry. Starting a route requires explicit control/executor availability, a trusted source, a normalized trusted route ID and validated geometry, followed by atomic policy revalidation.
- Verification: route UI contract and route policy 3/3, typecheck, target UI/auth/social/capability 25/25/trusted/theme gates, Android export, QA APK build/install/smoke and the complete 26-step release gate all passed. Android export bundled 813 Metro modules and 34 assets; QA APK bundled 686 modules and 33 assets, installed successfully and produced no ANR.
- Boundary: this UI acceptance does not mean GATT authentication, Wi-Fi provisioning, MQTT transport, OTA/rollback or physical robot movement has passed; all real physical gates remain closed.

## Historical accepted page: main home

- Acceptance run: `20260826-063348-a49a8b4`
- Figma nodes: light `139:6636`, dark `139:4126`, landscape `139:10575`
- Implementation: `src/screens/HomeScreen.tsx`
- Evidence: `artifacts/design-acceptance/20260826-063348-a49a8b4/main-home/`
- Result: the three same-input comparisons and independent visual review passed with no remaining P0/P1/P2. Unknown battery and unavailable telemetry remain visibly unknown, and recall stays blocked without a trusted executor.

## Historical accepted flow: authentication

- Acceptance run: `20260826-032343-a49a8b4`
- Figma file: `Y9BYG8ctEXdLeW3yXwfzpY`
- Login nodes: light `139:5200`, dark `139:2728`, landscape `139:7722`
- Registration nodes: light `139:5247`, dark `139:2773`, landscape `139:7784`
- Implementations: `src/screens/LoginScreen.tsx`, `src/screens/RegisterScreen.tsx`
- Evidence: `artifacts/design-acceptance/20260826-032343-a49a8b4/auth-login/` and `artifacts/design-acceptance/20260826-032343-a49a8b4/auth-register/`
- Comparison sizes: portrait 390 × 844 px; landscape 844 × 390 px
- Tested states: Android emulator QA build in light portrait, dark portrait and light landscape

## Authentication review history

1. Pass 1 — P1: the light primary action used a mint solid fill rather than the Figma dark gradient, and the dark primary action did not use the bright green/cyan gradient. Fixed by switching the button treatment with the active theme.
2. Pass 1 — P1: registration content was compressed upward and the landscape identity fields were stacked. Fixed by restoring the password-recovery row, portrait spacing and the Figma two-column landscape composition.
3. Pass 1 — P2: landscape robot placement, title wrapping, button height and footer rhythm differed from the reference. Fixed with landscape-specific artwork geometry, registration typography, 42 px actions and independent social/footer spacing.
4. Pass 2 — P2: the landscape username hint was truncated. Fixed with the complete compact hint `字母数字_ · 3-24` and re-captured on the rebuilt APK.
5. Final pass — all six same-input comparisons passed independent review with no remaining P0, P1 or P2 visual defects.

## Authentication focused findings

- Layout: both flows now use the Figma gradient hero and bottom sheet in portrait, and the two-panel form card in landscape.
- Theme: hero, form surface, inputs, copy, icons and primary actions switch together in dark mode.
- Interaction: email/password validation, registration rules, password visibility, password recovery, login/register switching and all three social entry points remain wired to the existing application flow.
- Responsive behavior: registration places username and email side by side in landscape; actions and hints remain readable without clipping.
- Assets: the real robot asset and official DOSO brand artwork are used; social actions use the existing icon implementation.
- Accepted product/platform differences: Chinese localization, three icon-only social providers requested by the user, official DOSO logo artwork, correct registration copy in landscape, and Android/iOS system-bar differences.

## Authentication verification

- `npm run typecheck`: passed
- `npm run test:auth-ui`: passed
- `npm run test:ui`: passed
- Android QA APK build: passed; 810 Metro modules bundled
- Final light, dark and landscape same-input comparisons: passed
- Independent final visual reviewer: PASS, no P0/P1/P2

## Historical accepted page: data analysis

- Acceptance run: `20260826-0044-a49a8b4`
- Figma nodes: light `139:6953`, dark `139:4440`, landscape `139:10757`
- Implementation: `src/screens/AnalysisScreen.tsx`
- Evidence: `artifacts/design-acceptance/20260826-0044-a49a8b4/main-analysis/`
- Result: the three same-input comparisons and independent visual review passed with no remaining P0/P1/P2. Preview telemetry remains visibly disclosed and isolated from trusted physical-device data.

final result: blocked — current machine-valid acceptance is 1/20
