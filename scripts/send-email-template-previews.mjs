#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tls from "node:tls";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_ROOT = resolve(PROJECT_ROOT, "supabase/templates");
const DEFAULT_HOST = "smtpdm.aliyun.com";
const DEFAULT_PORT = 465;
const DEFAULT_SENDER = "no-reply@auth.dosorobotics.com";
const PREVIEW_RECIPIENT = "preview-recipient@example.test";
const DEFAULT_DELAY_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;
const MAX_DELAY_MS = 15_000;

const SAMPLE_CONTEXT = Object.freeze({
  accountEmail: PREVIEW_RECIPIENT,
  oldEmail: "old-email@example.com",
  newEmail: "new-email@example.com",
  eventTime: formatEventTime(new Date()),
  location: "Shanghai, China（模拟数据）",
  device: "Windows · Chrome（客户端报告，模拟数据）",
  securityUrl: "https://dosorobotics.com/account/security",
  deletionConfirmationUrl: "https://dosorobotics.com/account/delete/confirm",
});

const TEMPLATE_PREVIEWS = [
  nativePreview("confirmation", "注册验证", "confirmation.html", { Token: "246810" }),
  nativePreview("magic_link", "登录验证码", "magic_link.html", { Token: "296184" }),
  nativePreview("recovery", "重置密码", "recovery.html", { Token: "753968" }),
  nativePreview("reauthentication", "敏感操作确认", "reauthentication.html", { Token: "618204" }),
  nativePreview("email_change", "验证新邮箱", "email_change.html", {
    Token: "184290",
    NewEmail: SAMPLE_CONTEXT.newEmail,
  }),
  nativePreview("password_changed", "密码已修改通知", "password_changed_notification.html", {
    Email: SAMPLE_CONTEXT.accountEmail,
  }),
  nativePreview("email_changed", "邮箱已修改通知", "email_changed_notification.html", {
    OldEmail: SAMPLE_CONTEXT.oldEmail,
    Email: SAMPLE_CONTEXT.accountEmail,
  }),
  customPreview("anomalous_login", "异常登录提醒", "custom/anomalous_login.html", {
    account_email: SAMPLE_CONTEXT.accountEmail,
    event_time: SAMPLE_CONTEXT.eventTime,
    location: SAMPLE_CONTEXT.location,
    device: SAMPLE_CONTEXT.device,
    security_url: SAMPLE_CONTEXT.securityUrl,
  }, ["security_url"]),
  customPreview("new_device_login", "新安装登录提醒", "custom/new_device_login.html", {
    event_time: SAMPLE_CONTEXT.eventTime,
    device: SAMPLE_CONTEXT.device,
    security_url: SAMPLE_CONTEXT.securityUrl,
  }, ["security_url"]),
  customPreview("account_deletion_confirmation", "注销账户确认", "custom/account_deletion_confirmation.html", {
    deletion_confirmation_url: SAMPLE_CONTEXT.deletionConfirmationUrl,
  }, ["deletion_confirmation_url"]),
  customPreview("account_deleted", "账户注销完成", "custom/account_deleted.html", {
    account_email: SAMPLE_CONTEXT.accountEmail,
    event_time: SAMPLE_CONTEXT.eventTime,
  }),
];

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }
  if (options.error) {
    fail(options.error);
  }

  const selected = options.only
    ? TEMPLATE_PREVIEWS.filter((preview) => preview.id === options.only)
    : TEMPLATE_PREVIEWS;
  if (selected.length === 0) {
    fail(`未知模板 id：${options.only}`);
  }

  const smtp = smtpConfiguration(options.mode === "send");
  const rendered = await Promise.all(selected.map((preview, index) => renderPreview(
    preview,
    options.to,
    smtp.user,
    index + 1,
    selected.length,
  )));

  if (options.mode === "dry-run") {
    for (const message of rendered) {
      console.log(
        `READY ${pad(message.index)}/${pad(message.total)} ${message.id} — ${message.bytes} 字节 · SHA-256 ${message.sha256.slice(0, 12)}`,
      );
    }
    if (options.outputDir) {
      await writeRenderedPreviews(rendered, options.outputDir);
      console.log(`PASS  已写入本地预览：${options.outputDir}`);
    }
    console.log(`PASS  ${rendered.length} 封模板预览已完成变量替换、HTML 与 MIME 静态校验；未连接 SMTP。`);
    return;
  }

  const session = await SmtpSession.connect(smtp);
  try {
    console.log(`PASS  SMTP TLS — ${smtp.host}:${smtp.port} · ${session.protocol} · 证书 ${session.certificateName}`);
    if (options.mode === "probe") {
      console.log(`PASS  SMTP EHLO — ${session.capabilities.length} 行能力响应；未认证、未发送邮件。`);
      return;
    }

    await session.authenticate(smtp.user, smtp.password);
    console.log(`PASS  SMTP AUTH — ${smtp.user} 已认证（密码不回显）`);
    const confirmed = [];
    let currentMessage;
    try {
      for (const message of rendered) {
        currentMessage = message;
        const response = await session.sendMessage({
          from: smtp.user,
          to: options.to,
          content: message.mime,
        });
        confirmed.push(message);
        console.log(
          `SENT  ${pad(message.index)}/${pad(message.total)} ${message.id} — SMTP ${response.code} · Message-ID ${message.messageId}`,
        );
        if (message.index < message.total) {
          await delay(options.delayMs);
        }
      }
    } catch (error) {
      const notAttempted = rendered.slice(confirmed.length + 1).map((message) => message.id).join(", ") || "无";
      console.error(
        `STOP  已确认 ${confirmed.length}/${rendered.length}；当前 ${currentMessage?.id ?? "未知"} 状态不确定；尚未尝试：${notAttempted}。请先查 DirectMail 发送详情，再用 --only 精确重试。`,
      );
      throw error;
    }
    console.log(`PASS  已顺序提交 ${rendered.length} 封模板预览到 ${options.to}；请以收件箱和 DirectMail 发送详情为最终投递证据。`);
  } finally {
    await session.quit();
  }
}

function nativePreview(id, label, file, variables) {
  return { id, label, file, variables, urlVariables: [], syntax: "supabase" };
}

function customPreview(id, label, file, variables, urlVariables = []) {
  return { id, label, file, variables, urlVariables, syntax: "custom" };
}

function parseArguments(args) {
  const result = {
    mode: "dry-run",
    to: PREVIEW_RECIPIENT,
    recipientProvided: false,
    only: undefined,
    delayMs: DEFAULT_DELAY_MS,
    outputDir: undefined,
    help: false,
    error: undefined,
  };
  const modes = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") {
      result.help = true;
    } else if (arg === "--dry-run") {
      modes.push("dry-run");
    } else if (arg === "--probe") {
      modes.push("probe");
    } else if (arg === "--send") {
      modes.push("send");
    } else if (["--to", "--only", "--delay-ms", "--output-dir"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        result.error = `${arg} 缺少值。`;
        break;
      }
      index += 1;
      if (arg === "--to") {
        result.to = value;
        result.recipientProvided = true;
      }
      if (arg === "--only") result.only = value;
      if (arg === "--delay-ms") result.delayMs = Number(value);
      if (arg === "--output-dir") result.outputDir = resolve(PROJECT_ROOT, value);
    } else {
      result.error = `未知参数：${arg}`;
      break;
    }
  }
  if (!result.error && modes.length > 1) {
    result.error = "--dry-run、--probe 与 --send 只能选择一个。";
  }
  result.mode = modes[0] ?? "dry-run";
  if (!result.error && result.mode === "send" && !result.recipientProvided) {
    result.error = "--send 必须显式提供 --to 收件邮箱；源码不保存真实收件人。";
  }
  if (!result.error && !isEmail(result.to)) {
    result.error = "--to 必须是格式有效的邮箱地址。";
  }
  if (!result.error && (!Number.isInteger(result.delayMs) || result.delayMs < 500 || result.delayMs > MAX_DELAY_MS)) {
    result.error = `--delay-ms 必须是 500 至 ${MAX_DELAY_MS} 的整数。`;
  }
  if (!result.error && result.help && args.length > 1) {
    result.error = "--help 不能与其他参数组合。";
  }
  if (!result.error && result.outputDir && result.mode !== "dry-run") {
    result.error = "--output-dir 只能与 --dry-run 一起使用。";
  }
  return result;
}

function printHelp() {
  console.log(`DOSO 邮件模板真实投递测试

用法：
  node scripts/send-email-template-previews.mjs --dry-run
  node scripts/send-email-template-previews.mjs --probe
  node scripts/send-email-template-previews.mjs --send --to recipient@example.com
  node scripts/send-email-template-previews.mjs --send --only confirmation --to recipient@example.com

可选参数：
  --only <id>       只处理一份模板
  --delay-ms <ms>   顺序发送间隔，默认 ${DEFAULT_DELAY_MS}，范围 500-${MAX_DELAY_MS}
  --output-dir <dir> 在 dry-run 时写入可浏览 HTML 与 .eml 文件

SMTP 环境变量：
  DIRECTMAIL_SMTP_PASSWORD   --send 必填；绝不输出
  DIRECTMAIL_SMTP_USER       可选，默认 ${DEFAULT_SENDER}
  DIRECTMAIL_SMTP_HOST       可选，默认 ${DEFAULT_HOST}
  DIRECTMAIL_SMTP_PORT       可选，默认 ${DEFAULT_PORT}

--probe 只验证 TLS 和 EHLO，不认证、不发送。所有邮件主题都带“DOSO 模板测试”，
正文顶部也标记为模拟数据，避免被误认为真实安全事件。`);
}

async function renderPreview(preview, recipient, sender, index, total) {
  const path = resolve(TEMPLATE_ROOT, preview.file);
  let html = await readFile(path, "utf8");
  const variables = Object.fromEntries(Object.entries(preview.variables).map(([name, value]) => [
    name,
    value === PREVIEW_RECIPIENT ? recipient : value,
  ]));
  const expectedVariables = Object.keys(variables).sort();
  const foundVariables = preview.syntax === "supabase"
    ? [...html.matchAll(/\{\{\s*\.([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g)].map((match) => match[1]).sort()
    : [...html.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/g)].map((match) => match[1]).sort();
  if (expectedVariables.join("\0") !== foundVariables.join("\0")) {
    throw new Error(`${preview.id} 的模板变量与测试 allowlist 不一致；未发送任何邮件。`);
  }

  for (const [name, rawValue] of Object.entries(variables)) {
    const value = String(rawValue);
    const renderedValue = preview.urlVariables.includes(name)
      ? escapeAttribute(assertSafeHttpsUrl(value, name))
      : escapeHtml(value);
    const pattern = preview.syntax === "supabase"
      ? new RegExp(`\\{\\{\\s*\\.${escapeRegExp(name)}\\s*\\}\\}`, "g")
      : new RegExp(`\\{\\{${escapeRegExp(name)}\\}\\}`, "g");
    html = html.replace(pattern, renderedValue);
  }
  if (/\{\{[\s\S]*?\}\}/.test(html)) {
    throw new Error(`${preview.id} 渲染后仍包含模板变量；未发送任何邮件。`);
  }
  html = injectPreviewBanner(html, index, total, preview.label, recipient);
  if (!/<html\b/i.test(html) || !/<body\b/i.test(html) || !/<\/html>/i.test(html)) {
    throw new Error(`${preview.id} 不是完整 HTML 邮件；未发送任何邮件。`);
  }
  const subject = `[DOSO 模板测试 ${pad(index)}/${pad(total)}] ${preview.label}`;
  const messageId = `<doso-preview-${Date.now()}-${index}-${randomBytes(6).toString("hex")}@auth.dosorobotics.com>`;
  const mime = createMimeMessage({
    from: sender,
    to: recipient,
    subject,
    html,
    messageId,
    templateId: preview.id,
  });
  return {
    ...preview,
    index,
    total,
    subject,
    messageId,
    html,
    mime,
    bytes: Buffer.byteLength(mime, "utf8"),
    sha256: createHash("sha256").update(mime, "utf8").digest("hex"),
  };
}

function injectPreviewBanner(html, index, total, label, recipient) {
  const banner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fff8df" style="width:100%;border-collapse:collapse;background:#fff8df"><tr><td align="center" style="padding:10px 16px;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;font-size:13px;line-height:20px;font-weight:700;color:#7a5510">DOSO 模板预览 ${pad(index)}/${pad(total)} · ${escapeHtml(label)} · 以下均为模拟数据 · 收件人 ${escapeHtml(recipient)}</td></tr></table>`;
  return html.replace(/(<body\b[^>]*>)/i, `$1\n${banner}`);
}

function createMimeMessage({ from, to, subject, html, messageId, templateId }) {
  const encodedSubject = encodeMimeHeaderValue(subject);
  const boundary = `doso-alt-${randomBytes(12).toString("hex")}`;
  const plainText = htmlToPlainText(html);
  const plainBody = wrapBase64(Buffer.from(plainText, "utf8").toString("base64"));
  const htmlBody = wrapBase64(Buffer.from(html, "utf8").toString("base64"));
  return [
    `Date: ${new Date().toUTCString()}`,
    `From: DOSO <${from}>`,
    `To: <${to}>`,
    `Subject:\r\n ${encodedSubject}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "X-DOSO-Template-Preview: true",
    `X-DOSO-Template-ID: ${templateId}`,
    "Auto-Submitted: auto-generated",
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    plainBody,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    htmlBody,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function writeRenderedPreviews(rendered, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const links = [];
  for (const message of rendered) {
    const basename = `${pad(message.index)}-${message.id}`;
    await writeFile(resolve(outputDir, `${basename}.html`), message.html, "utf8");
    await writeFile(resolve(outputDir, `${basename}.eml`), message.mime, "utf8");
    links.push(`<li><a href="${basename}.html">${pad(message.index)}/${pad(message.total)} ${escapeHtml(message.label)}</a></li>`);
  }
  const index = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>DOSO 邮件模板预览</title></head><body><h1>DOSO 邮件模板预览</h1><ol>${links.join("")}</ol></body></html>`;
  await writeFile(resolve(outputDir, "index.html"), index, "utf8");
}

function htmlToPlainText(html) {
  return html
    .replace(/<head\b[\s\S]*?<\/head>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<a\b[^>]*\bhref\s*=\s*(["'])(https?:\/\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, _quote, href, label) =>
        `${label.replace(/<[^>]+>/g, "")} (${href})`,
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h1|td|tr|table|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&zwnj;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#96;/gi, "`")
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\r\n");
}

function smtpConfiguration(requirePassword) {
  const host = process.env.DIRECTMAIL_SMTP_HOST?.trim() || DEFAULT_HOST;
  const portText = process.env.DIRECTMAIL_SMTP_PORT?.trim() || String(DEFAULT_PORT);
  const port = Number(portText);
  const user = process.env.DIRECTMAIL_SMTP_USER?.trim() || DEFAULT_SENDER;
  const password = process.env.DIRECTMAIL_SMTP_PASSWORD?.trim() || "";
  if (!/^[A-Za-z0-9.-]+$/.test(host) || host.startsWith(".") || host.endsWith(".")) {
    fail("DIRECTMAIL_SMTP_HOST 格式无效。");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("DIRECTMAIL_SMTP_PORT 格式无效。");
  }
  if (!isEmail(user)) {
    fail("DIRECTMAIL_SMTP_USER 必须是格式有效的发信地址。");
  }
  if (requirePassword && !password) {
    fail("--send 需要在当前终端设置 DIRECTMAIL_SMTP_PASSWORD；未连接 SMTP，密码不得粘贴到聊天。 ");
  }
  return { host, port, user, password };
}

class SmtpSession {
  static async connect(config) {
    const socket = tls.connect({
      host: config.host,
      port: config.port,
      servername: config.host,
      rejectUnauthorized: true,
    });
    socket.setEncoding("utf8");
    socket.setTimeout(SOCKET_TIMEOUT_MS);
    const session = new SmtpSession(socket);
    try {
      await session.waitForSecureConnect();
      const greeting = await session.readResponse();
      expectCode(greeting, [220], "SMTP greeting");
      const ehlo = await session.command("EHLO dosorobotics.com", [250], "EHLO");
      session.capabilities = ehlo.lines;
      const certificate = socket.getPeerCertificate();
      session.certificateName = certificate.subject?.CN || certificate.subjectaltname || "已验证";
      session.protocol = socket.getProtocol() || "TLS";
      return session;
    } catch (error) {
      socket.destroy();
      throw error;
    }
  }

  constructor(socket) {
    this.socket = socket;
    this.buffer = "";
    this.responses = [];
    this.waiters = [];
    this.current = undefined;
    this.closed = false;
    this.capabilities = [];
    socket.on("data", (chunk) => this.consume(chunk));
    socket.on("timeout", () => socket.destroy(new Error("SMTP 连接 20 秒超时")));
    socket.on("error", (error) => this.rejectWaiters(new Error(safeSocketMessage(error))));
    socket.on("close", () => {
      this.closed = true;
      this.rejectWaiters(new Error("SMTP 连接已关闭"));
    });
  }

  async waitForSecureConnect() {
    if (this.socket.secureConnecting === false) return;
    await new Promise((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => rejectPromise(new Error("SMTP TLS 握手 20 秒超时")), SOCKET_TIMEOUT_MS);
      this.socket.once("secureConnect", () => {
        clearTimeout(timeout);
        resolvePromise();
      });
      this.socket.once("error", (error) => {
        clearTimeout(timeout);
        rejectPromise(new Error(safeSocketMessage(error)));
      });
    });
  }

  consume(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      const match = line.match(/^(\d{3})([ -])(.*)$/);
      if (!match) continue;
      const [, codeText, separator] = match;
      const code = Number(codeText);
      if (!this.current) this.current = { code, lines: [] };
      this.current.lines.push(line);
      if (separator === " " && code === this.current.code) {
        this.enqueueResponse(this.current);
        this.current = undefined;
      }
    }
  }

  enqueueResponse(response) {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(response);
    else this.responses.push(response);
  }

  rejectWaiters(error) {
    for (const waiter of this.waiters.splice(0)) waiter.reject(error);
  }

  readResponse() {
    const queued = this.responses.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closed) return Promise.reject(new Error("SMTP 连接已关闭"));
    return new Promise((resolvePromise, rejectPromise) => {
      const waiter = {
        resolve: (response) => {
          clearTimeout(timeout);
          resolvePromise(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          rejectPromise(error);
        },
      };
      const timeout = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        rejectPromise(new Error("等待 SMTP 响应 20 秒超时"));
      }, SOCKET_TIMEOUT_MS);
      this.waiters.push(waiter);
    });
  }

  async command(line, expectedCodes, operation, sensitive = false) {
    if (this.closed) throw new Error("SMTP 连接已关闭");
    this.socket.write(`${line}\r\n`);
    const response = await this.readResponse();
    try {
      expectCode(response, expectedCodes, operation);
    } catch {
      throw new Error(`${operation} 失败：SMTP ${response.code}${sensitive ? "（敏感响应已隐藏）" : ""}`);
    }
    return response;
  }

  async authenticate(user, password) {
    await this.command("AUTH LOGIN", [334], "SMTP AUTH");
    await this.command(Buffer.from(user, "utf8").toString("base64"), [334], "SMTP 用户名", true);
    await this.command(Buffer.from(password, "utf8").toString("base64"), [235], "SMTP 密码", true);
  }

  async sendMessage({ from, to, content }) {
    await this.command(`MAIL FROM:<${from}>`, [250], "MAIL FROM");
    await this.command(`RCPT TO:<${to}>`, [250, 251], "RCPT TO");
    await this.command("DATA", [354], "DATA");
    const normalized = content.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..").replace(/\r\n$/, "");
    this.socket.write(`${normalized}\r\n.\r\n`);
    const response = await this.readResponse();
    expectCode(response, [250], "邮件提交");
    return response;
  }

  async quit() {
    if (this.closed) return;
    try {
      await this.command("QUIT", [221], "QUIT");
    } catch {
      // Closing an already-terminated SMTP session is best effort only.
    } finally {
      this.socket.end();
    }
  }
}

function expectCode(response, expectedCodes, operation) {
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`${operation} 失败：SMTP ${response.code}`);
  }
}

function formatEventTime(value) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type) => parts.find((candidate) => candidate.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")} (GMT+8，模拟数据)`;
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function assertSafeHttpsUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} 必须是有效的 HTTPS 绝对地址。`);
  }
  const hostname = url.hostname.toLowerCase();
  const isDosoHost = hostname === "dosorobotics.com" || hostname.endsWith(".dosorobotics.com");
  const expectedPath = name === "security_url"
    ? "/account/security"
    : name === "deletion_confirmation_url"
    ? "/account/delete/confirm"
    : undefined;
  if (
    url.protocol !== "https:" || !isDosoHost || url.username || url.password ||
    (url.port && url.port !== "443") || !expectedPath ||
    url.pathname !== expectedPath || url.hash
  ) {
    throw new Error(`${name} 必须使用受控的 DOSO HTTPS 路由。`);
  }
  return url.href;
}

function wrapBase64(value) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function encodeMimeHeaderValue(value) {
  const chunks = [];
  let current = "";
  for (const character of value) {
    if (current && Buffer.byteLength(current + character, "utf8") > 45) {
      chunks.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  if (current) chunks.push(current);
  return chunks
    .map((chunk) => `=?UTF-8?B?${Buffer.from(chunk, "utf8").toString("base64")}?=`)
    .join("\r\n ");
}

function isEmail(value) {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && !/[\r\n]/.test(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeSocketMessage(error) {
  if (error instanceof Error && error.message.includes("timeout")) return "SMTP 网络超时";
  if (error && typeof error === "object" && "code" in error) return `SMTP 网络错误 ${String(error.code)}`;
  return "SMTP 网络连接失败";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exit(1);
}

try {
  await main();
} catch (error) {
  console.error(`FAIL  ${error instanceof Error ? error.message : "邮件发送失败"}`);
  process.exitCode = 1;
}
