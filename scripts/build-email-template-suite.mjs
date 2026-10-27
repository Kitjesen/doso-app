#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_DIR = resolve(ROOT, 'supabase/templates');
const LOGO_URL = 'https://vchvqfdlkomlrjenkdhj.supabase.co/storage/v1/object/public/email-assets/doso-robotics-wordmark-email-29dea10fd204.png';
const CHECK = process.argv.includes('--check');

const files = new Map();
const normalizeGeneratedFile = (value) => value
  .replace(/^\uFEFF/, '')
  .replace(/\r\n?/g, '\n')
  .replace(/[ \t]+$/gm, '');

const p = (copy, extra = '') => `<p style="margin:0;font-size:17px;line-height:30px;color:#22314d;${extra}">${copy}</p>`;
const heading = (title, color = '#0b1f3f') => `
<h1 class="title" style="margin:0;font-size:36px;line-height:46px;font-weight:700;color:${color}">${title}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border-collapse:collapse"><tr><td width="36" height="4" bgcolor="#0b5fff" style="width:36px;height:4px;font-size:0;line-height:0;background:#0b5fff">&nbsp;</td></tr></table>`;

function section(title, copy, border = false) {
  return `<tr><td class="main-pad" style="padding:${border ? '28px' : '34px'} 48px 0">
    ${border ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-top:1px solid #d8e5f6"><tr><td style="padding-top:27px">' : ''}
    <p style="margin:0;font-size:18px;line-height:27px;font-weight:700;color:#0b1f3f">${title}</p>
    <p class="notice-copy" style="margin:6px 0 0;font-size:15px;line-height:26px;color:#526581">${copy}</p>
    ${border ? '</td></tr></table>' : ''}
  </td></tr>`;
}

function otpPanel(label, token = '{{ .Token }}', prefix = '') {
  return `<tr><td class="main-pad" style="padding:26px 48px 0">
    ${prefix}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f9ff" style="width:100%;border-collapse:separate;table-layout:fixed;background:#f5f9ff;border:1px solid #d8e5f6;border-radius:16px"><tr><td class="otp-panel" align="center" style="padding:30px 24px 24px">
      <p style="margin:0 0 14px;font-size:16px;line-height:24px;font-weight:700;color:#526581">${label}</p>
      <p class="otp-code" style="margin:0;font-family:'Courier New',Courier,monospace;font-size:56px;line-height:64px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:5px;white-space:nowrap;word-break:keep-all;color:#0b5fff">${token}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:24px;border-collapse:collapse;border-top:1px solid #d8e5f6"><tr>
        <td align="right" width="50%" style="padding:18px 18px 0 0;font-size:14px;line-height:22px;color:#526581;white-space:nowrap">10 分钟内有效</td>
        <td align="left" width="50%" style="padding:18px 0 0 18px;border-left:1px solid #d8e5f6;font-size:14px;line-height:22px;color:#526581;white-space:nowrap">仅可使用一次</td>
      </tr></table>
    </td></tr></table>
  </td></tr>`;
}

function infoPanel(rows) {
  const body = rows.map((row, index) => `<tr>
    <td width="31%" style="padding:18px 18px;font-size:15px;line-height:24px;font-weight:700;color:#0b1f3f;${index ? 'border-top:1px solid #d8e5f6;' : ''}">${row.label}</td>
    <td style="padding:18px 18px;font-size:15px;line-height:24px;color:#22314d;word-break:break-word;${index ? 'border-top:1px solid #d8e5f6;' : ''}">${row.value}</td>
  </tr>`).join('');
  return `<tr><td class="main-pad" style="padding:26px 48px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f9ff" style="width:100%;border-collapse:separate;table-layout:fixed;background:#f5f9ff;border:1px solid #d8e5f6;border-radius:16px"><tbody>${body}</tbody></table></td></tr>`;
}

function dangerPanel(title, bullets) {
  return `<tr><td class="main-pad" style="padding:28px 48px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fff6f7" style="width:100%;border-collapse:separate;background:#fff6f7;border:1px solid #ffd5da;border-radius:16px"><tr><td style="padding:25px 28px">
    <p style="margin:0;font-size:20px;line-height:30px;font-weight:700;color:#f12635">${title}</p>
    ${bullets.map((item) => `<p style="margin:14px 0 0;font-size:15px;line-height:26px;color:#22314d">•&nbsp;&nbsp;${item}</p>`).join('')}
  </td></tr></table></td></tr>`;
}

function button(label, href, danger = false) {
  const color = danger ? '#f12635' : '#0b5fff';
  return `<tr><td class="main-pad" align="center" style="padding:30px 48px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${color}" style="border-radius:10px;background:${color}"><a href="${href}" style="display:inline-block;padding:16px 32px;font-size:17px;line-height:24px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${label}</a></td></tr></table></td></tr>`;
}

function shell({ title, preheader, intro, body, after = '', titleColor }) {
  return `<!doctype html>
<html lang="zh-CN" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${title}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @media screen and (max-width:680px) {
      .outer-pad{padding:14px 8px!important}.email-shell{width:100%!important}.main-pad{padding-left:24px!important;padding-right:24px!important}.top-pad{padding-top:28px!important}.title{font-size:30px!important;line-height:39px!important}.otp-panel{padding:26px 14px 22px!important}.otp-code{font-size:39px!important;line-height:48px!important;letter-spacing:2px!important}.notice-copy{font-size:14px!important;line-height:24px!important}.footer-left,.footer-right{display:block!important;width:100%!important;text-align:left!important}.footer-right{padding-top:16px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f7fc;background-image:linear-gradient(135deg,#f3f7fc 0%,#eef5ff 50%,#f3f7fc 100%);color:#0a1831;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif">
  <div style="display:none!important;width:0;height:0;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;mso-hide:all">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f7fc" style="width:100%;border-collapse:collapse;background:#f3f7fc;background-image:linear-gradient(135deg,#f3f7fc 0%,#eef5ff 50%,#f3f7fc 100%)"><tr><td class="outer-pad" align="center" valign="top" style="padding:28px 12px">
  <!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table class="email-shell" role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:640px;border-collapse:separate;table-layout:fixed;background:#ffffff;border:1px solid #d8e5f6;border-radius:12px">
    <tr><td class="main-pad top-pad" style="padding:38px 48px 0"><img src="${LOGO_URL}" width="180" height="60" alt="DOSO robotics" style="display:block;width:180px;height:60px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic" /></td></tr>
    <tr><td class="main-pad" style="padding:30px 48px 0">${heading(title, titleColor)}<div style="height:24px;line-height:24px">&nbsp;</div>${intro}</td></tr>
    ${body}
    ${after}
    <tr><td class="main-pad" style="padding:38px 48px 34px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-top:1px solid #d8e5f6"><tr>
      <td class="footer-left" width="50%" valign="bottom" style="width:50%;padding-top:26px;text-align:left"><img src="${LOGO_URL}" width="120" height="40" alt="" style="display:block;width:120px;height:40px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic" /><p style="margin:7px 0 0;font-size:12px;line-height:20px;color:#526581">Robotics for the real world.</p></td>
      <td class="footer-right" width="50%" valign="bottom" align="right" style="width:50%;padding-top:26px;text-align:right"><p style="margin:0;font-size:12px;line-height:21px;color:#526581">© 2026 DOSO Robotics<br />此邮件由系统自动发送，请勿回复。</p></td>
    </tr></table></td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
  </td></tr></table>
</body>
</html>
`;
}

function otp({ file, title, preheader, intro, label, extra = '', noAction }) {
  files.set(file, shell({
    title,
    preheader,
    intro: p(intro),
    body: otpPanel(label, '{{ .Token }}', extra),
    after: section('安全提示', 'DOSO 不会通过电话、短信或即时通讯工具向你索取验证码。本邮件不包含任何操作链接，请勿向任何人分享验证码。') + section('不是你本人操作？', noAction, true),
  }));
}

otp({ file: 'confirmation.html', title: '验证你的邮箱', preheader: '使用验证码完成 DOSO 账户注册。', intro: '欢迎加入 DOSO robotics。<br />请输入以下验证码完成账户注册。', label: '验证码', noAction: '如果你没有注册 DOSO 账户，请直接忽略此邮件，你的账户不会受到影响。' });
otp({ file: 'recovery.html', title: '重置你的密码', preheader: '使用验证码重置 DOSO 账户密码。', intro: '我们收到了重置 DOSO 账户密码的请求。<br />请输入以下验证码继续设置新密码。', label: '验证码', noAction: '如果你没有发起密码重置，请不要输入验证码，你的密码不会改变。' });
otp({ file: 'reauthentication.html', title: '确认账户操作', preheader: '使用验证码确认 DOSO 账户敏感操作。', intro: '你正在进行一项需要重新验证身份的账户操作。<br />请输入以下验证码继续。', label: '验证码', noAction: '如果不是你本人发起，请立即停止操作，并检查 DOSO 账户和邮箱的近期活动。' });
otp({ file: 'magic_link.html', title: '登录 DOSO', preheader: '使用验证码登录 DOSO App。', intro: '你正在尝试登录 DOSO App。<br />请输入以下验证码完成登录。', label: '验证码', noAction: '如果你没有尝试登录 DOSO 账户，请忽略此邮件，你的账户不会受到影响。' });
otp({ file: 'email_change.html', title: '验证新的邮箱地址', preheader: '使用验证码确认 DOSO 账户的新邮箱地址。', intro: '你正在修改 DOSO 账户的邮箱地址。', label: '验证码', extra: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f9ff" style="width:100%;margin-bottom:22px;border-collapse:separate;background:#f5f9ff;border:1px solid #d8e5f6;border-radius:12px"><tr><td align="center" style="padding:18px;font-size:17px;line-height:26px;font-weight:700;color:#0b5fff;word-break:break-word">{{ .NewEmail }}</td></tr></table>`, noAction: '如果这不是你发起的操作，请忽略此邮件，并检查 DOSO 账户的安全设置。' });

files.set('password_changed_notification.html', shell({
  title: '你的密码已修改成功',
  preheader: 'DOSO 账户密码已修改。',
  intro: p('你的 DOSO 账户密码已成功修改。'),
  body: infoPanel([{ label: '账户', value: '{{ .Email }}' }]),
  after: section('不是你本人操作？', '请立即通过 DOSO App 发起密码重置，并检查账户和邮箱的安全设置。'),
}));

files.set('email_changed_notification.html', shell({
  title: '你的邮箱已修改',
  preheader: 'DOSO 账户邮箱地址已修改。',
  intro: p('你的 DOSO 账户邮箱地址已成功修改。'),
  body: infoPanel([{ label: '原邮箱', value: '{{ .OldEmail }}' }, { label: '当前邮箱', value: '{{ .Email }}' }]),
  after: section('不是你本人操作？', '请立即检查 DOSO 账户和邮箱的安全设置，并联系 DOSO 客服。'),
}));

files.set('custom/anomalous_login.html', shell({
  title: '异常登录安全提醒',
  titleColor: '#f12635',
  preheader: '我们检测到你的 DOSO 账户存在异常登录尝试。',
  intro: p('我们检测到你的账户存在异常登录尝试。'),
  body: infoPanel([{ label: '账户', value: '{{account_email}}' }, { label: '时间', value: '{{event_time}}' }, { label: '地点', value: '{{location}}' }, { label: '设备', value: '{{device}}' }]) + button('立即保护账户', '{{security_url}}', true),
  after: section('如何处理', '如果这是你本人操作，可以忽略此邮件。如果不是，请立即修改密码、检查账户安全设置并联系 DOSO 客服。'),
}));

files.set('custom/new_device_login.html', shell({
  title: '新安装登录提醒',
  preheader: 'DOSO 收到一次来自新 App 安装或浏览器的登录登记。',
  intro: p('DOSO 收到一次来自新 App 安装或浏览器的登录登记。'),
  body: infoPanel([{ label: '时间', value: '{{event_time}}' }, { label: '客户端报告的安装或浏览器', value: '{{device}}' }]) + button('检查账户安全', '{{security_url}}'),
  after: section('不是你本人操作？', '如果你不认识这次登录，请立即修改密码，并检查账户安全设置和近期活动。'),
}));

files.set('custom/account_deletion_confirmation.html', shell({
  title: '确认注销你的账户',
  preheader: '请确认 DOSO 账户注销请求。',
  intro: p('我们收到了你的 DOSO 账户注销请求。<br />如需继续，请打开受保护的确认页面核对处理范围。'),
  body: dangerPanel('请先核对处理范围', ['最终注销完成后，你将无法继续使用该账户登录 DOSO App', '实体设备不会被删除；设备绑定及其他数据将按确认页面列明的范围处理']) + button('查看并确认注销', '{{deletion_confirmation_url}}'),
  after: section('不是你本人操作？', '请忽略此邮件并检查账户安全。此确认链接将在 24 小时后失效。'),
}));

files.set('custom/account_deleted.html', shell({
  title: '你的账户已注销',
  preheader: '你的 DOSO 账户已注销。',
  intro: p('你的 DOSO 账户已注销成功。'),
  body: infoPanel([{ label: '账户', value: '{{account_email}}' }, { label: '时间', value: '{{event_time}}' }]),
  after: section('感谢使用 DOSO robotics', '如果仍有任何问题，请联系 DOSO 客服。'),
}));

files.set('custom/README.md', `# DOSO 自定义账户邮件

这些模板由应用后端或 Edge Function 渲染和发送，不属于 Supabase Auth 原生模板。变量值必须在插入 HTML 前完成转义，URL 必须是经过校验的 HTTPS 绝对地址。\`new_device_login\` 的可信语义是“首次出现的 App installation ID 或浏览器安装”，不等价于识别真实物理设备。\`anomalous_login\` 在接入可信风控信号前不得启用；账户注销流程在数据处理清单与外部身份撤销适配完成前必须保持关闭。

| 模板 | 应用变量 |
| --- | --- |
| \`anomalous_login.html\` | \`account_email\`, \`event_time\`, \`location\`, \`device\`, \`security_url\` |
| \`new_device_login.html\` | \`event_time\`, \`device\`, \`security_url\` |
| \`account_deletion_confirmation.html\` | \`deletion_confirmation_url\` |
| \`account_deleted.html\` | \`account_email\`, \`event_time\` |

\`event_time\` 应包含明确时区。新安装提醒不展示客户端可伪造的位置或 IP，并明确把设备值标为“客户端报告”；异常登录功能将来启用时，地点和设备必须来自可信风控信号，无法可靠判断时传入清晰的“未知”文案。\`security_url\` 和 \`deletion_confirmation_url\` 只能由服务端生成，禁止直接采用客户端提交的 URL。渲染器分别只允许 \`/account/security\` 与 \`/account/delete/confirm\` 两条受控路径，可携带服务端生成的查询参数，但不接受 URL fragment。
`);

const accountEmailTemplates = {
  anomalous_login: {
    subject: 'DOSO 异常登录安全提醒',
    html: files.get('custom/anomalous_login.html'),
    variables: ['account_email', 'event_time', 'location', 'device', 'security_url'],
    urlVariables: ['security_url'],
  },
  new_device_login: {
    subject: 'DOSO 新安装登录提醒',
    html: files.get('custom/new_device_login.html'),
    variables: ['event_time', 'device', 'security_url'],
    urlVariables: ['security_url'],
  },
  account_deletion_confirmation: {
    subject: '确认注销你的 DOSO 账户',
    html: files.get('custom/account_deletion_confirmation.html'),
    variables: ['deletion_confirmation_url'],
    urlVariables: ['deletion_confirmation_url'],
  },
  account_deleted: {
    subject: '你的 DOSO 账户已注销',
    html: files.get('custom/account_deleted.html'),
    variables: ['account_email', 'event_time'],
    urlVariables: [],
  },
};

files.set('../functions/_shared/generatedAccountEmailTemplates.ts', `// Generated by scripts/build-email-template-suite.mjs. Do not edit by hand.
export const ACCOUNT_EMAIL_TEMPLATES = ${JSON.stringify(accountEmailTemplates, null, 2)} as const;

export type AccountEmailTemplateId = keyof typeof ACCOUNT_EMAIL_TEMPLATES;
`);

let mismatches = 0;
for (const [relativePath, content] of files) {
  const target = resolve(TEMPLATE_DIR, relativePath);
  const normalized = normalizeGeneratedFile(content);
  if (CHECK) {
    let current = '';
    try { current = await readFile(target, 'utf8'); } catch {}
    if (normalizeGeneratedFile(current) !== normalized) {
      console.error(`OUTDATED ${relativePath}`);
      mismatches += 1;
    }
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, normalized, 'utf8');
    console.log(`WROTE ${relativePath}`);
  }
}

if (CHECK) {
  if (mismatches) {
    console.error(`${mismatches} generated template file(s) are missing or outdated.`);
    process.exitCode = 1;
  } else {
    console.log(`OK ${files.size} generated email suite file(s) are current.`);
  }
}
