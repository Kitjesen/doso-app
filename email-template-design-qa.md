# DOSO Email Suite Design QA

## Visual sources

- `C:/Users/99563/AppData/Local/Temp/codex-clipboard-5c49d9d2-e05b-467f-9ab6-5603d91f7604.png` — 异常登录提醒
- `C:/Users/99563/AppData/Local/Temp/codex-clipboard-3b478b18-5493-4b45-944d-09cc1c4b17d3.png` — 邮箱修改通知
- `C:/Users/99563/AppData/Local/Temp/codex-clipboard-c03353cf-4a97-4d0c-827e-d725b08dd441.png` — 注销确认
- `C:/Users/99563/AppData/Local/Temp/codex-clipboard-f4a79cfa-6b18-4b8c-855b-af68211d41df.png` — 密码修改成功
- `C:/Users/99563/AppData/Local/Temp/codex-clipboard-43480f62-9b7b-4625-a84e-ba845df856b9.png` — 验证新邮箱
- `C:/Users/99563/AppData/Local/Temp/codex-clipboard-5dfa3a56-0a4c-46f5-9ce6-a641a5c24060.png` — 登录验证码
- `C:/Users/99563/AppData/Local/Temp/codex-clipboard-0bfda77e-9695-4ef6-9154-d018fbd74557.png` — 新设备登录
- `C:/Users/99563/AppData/Local/Temp/codex-clipboard-a8e2e56b-8ba1-438c-90e1-6a06e290456d.png` — 重置密码
- `C:/Users/99563/AppData/Local/Temp/codex-clipboard-686ec017-396b-4d55-b410-09667d79db08.png` — 注销完成

## Implementation under review

- Generator: `scripts/build-email-template-suite.mjs`
- Supabase-native output: 7 HTML templates under `supabase/templates/`
- DOSO backend output: 4 HTML templates under `supabase/templates/custom/`
- Shared target: 640px white card, pale-blue canvas, approved versioned DOSO logo URL, navy/blue palette, large OTP panel, responsive table layout and two-column footer.

## Static evidence

- Generator `--check`: all 13 generated suite files current.
- Config/static tests: all 11 HTML files use one approved pending Storage URL and the 640px card contract; no inline SVG, base64 images or unhosted icon dependency. The new URL is intentionally not treated as hosted evidence until upload/hash verification succeeds.
- Five OTP templates contain exactly one `{{ .Token }}` and no `ConfirmationURL`, `TokenHash` or clickable credential link.
- Native security notifications do not invent time, device, location or IP fields unavailable from Supabase.

## Real delivery evidence — 2026-08-25

- Channel: Aliyun DirectMail SMTP preview sender → QQ Mail mobile client on iOS.
- Template: `confirmation` / 注册验证；主题和正文都明确标记为 DOSO 模板测试与模拟数据。
- Recipient evidence was supplied by the account owner in two mobile screenshots. The screenshots contain a personal mailbox address and a sample OTP, so they remain conversation evidence and are not copied into the repository.
- PASS: the message reached the inbox; Chinese subject and sender label render correctly; hosted DOSO logo loads; the 640px card scales to the mobile viewport; heading, body copy, six-digit OTP panel, validity/one-time labels, anti-phishing copy and footer remain readable without horizontal clipping.
- LIMITATION: this proves one preview message in one QQ mobile client. It does not prove Supabase production Auth triggering, OTP expiry/replay enforcement, SPF/DKIM/DMARC header alignment, DirectMail delivery events, the other ten templates, or Gmail/Outlook/163 rendering.

## Visual comparison status

The source references have been reviewed together and translated into one reusable email design system. The confirmation template now has one real QQ Mail mobile rendering pass. The other ten generated templates still lack same-state recipient-client evidence, and the previously captured Supabase Dashboard images cannot prove their full-height spacing, mobile wrapping or cross-client rendering.

The reference set contains ten distinct visual examples while the repository contains eleven templates. `reauthentication` has no standalone reference image and intentionally reuses the OTP design language used by registration, login and recovery.

The implementation is design-system consistent, not pixel-identical. The 2026-08-26 pass reduced several visible gaps while preserving conservative email fallbacks:

- A transparent horizontal `DOSO robotics` email wordmark was extracted from the approved company asset and reduced from 866,228 to 196,202 bytes. It removes the oversized Chinese line and is displayed at 180×60 in the header, but it is still horizontal rather than the reference's stacked lockup. The local asset and pending Storage URL use immutable content-hash filename `doso-robotics-wordmark-email-29dea10fd204.png`; it has not yet been uploaded, so production fidelity is not claimed.
- A restrained blue canvas gradient is now progressive enhancement over the existing solid-color fallback. Reference line icons, the anomalous-login wave decoration and blur remain omitted because no approved hosted icon/decorative asset set exists and Outlook/QQ/163 support is uneven.
- Reference OTPs are visually grouped as `123 456`; Supabase supplies one six-digit `{{ .Token }}` string, so the current implementation keeps selectable text and uses letter spacing instead of fabricating a split value.
- Password/email-change and new-install references contain event fields that Supabase does not provide or that the client cannot supply trustworthily. The implementation intentionally omits or narrows these fields; new-install copy now labels the device value as client-reported and its database trigger is capped at three distinct notifications per user per 24 hours.

Pixel-level and cross-client QA therefore remain open. The next comparison should place each remaining reference beside a full rendered email at the same effective width, then repeat for mobile. Gmail, Outlook/Hotmail and 163 still require real-message passes; QQ still requires the remaining ten templates after hosted sync.

## Intentional compatibility differences

- Reference icons and decorative waves are omitted until DOSO-hosted PNG icon assets are available; the templates do not depend on third-party image tracking or weak SVG support.
- Gradient-capable clients receive a restrained canvas gradient; solid colors and borders remain the fallback, while blur is omitted.
- OTP remains selectable text, not an image.
- Destructive and security details are reduced when Supabase does not provide trustworthy event fields.

Local dry-run now writes all 11 rendered HTML files plus multipart/alternative `.eml` files under ignored `artifacts/email-previews/`. This is useful for content inspection but is not recipient-client evidence.

final result: partial — template assets 11/11; static/MIME render 11/11; QQ Mail client preview 1/11; production Supabase/worker event trigger 0/11; production matrix remains BLOCKED
