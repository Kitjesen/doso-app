#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { open, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const DEFAULT_PROJECT_REF = "vchvqfdlkomlrjenkdhj";
const API_ORIGIN = "https://api.supabase.com";
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = resolve(PROJECT_ROOT, "supabase/config.toml");
const LOGO_PATH = resolve(PROJECT_ROOT, "assets/brand/doso-robotics-wordmark-email-29dea10fd204.png");
const LOGO_URL = "https://vchvqfdlkomlrjenkdhj.supabase.co/storage/v1/object/public/email-assets/doso-robotics-wordmark-email-29dea10fd204.png";
const MAX_LOGO_BYTES = 256 * 1024;
const APPROVED_LOGO_WIDTH = 2172;
const APPROVED_LOGO_HEIGHT = 724;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const SNAPSHOT_SCHEMA_VERSION = 2;
const execFileAsync = promisify(execFile);

const TEMPLATES = [
  {
    key: "confirmation",
    label: "注册验证",
    subject: "验证你的 DOSO robotics 邮箱",
    contentPath: "./supabase/templates/confirmation.html",
    remoteSubject: "mailer_subjects_confirmation",
    remoteContent: "mailer_templates_confirmation_content",
    requiredVariables: ["Token"],
    allowedVariables: ["Token"],
    credentialTemplate: true,
  },
  {
    key: "recovery",
    label: "密码重置",
    subject: "重置你的 DOSO robotics 密码",
    contentPath: "./supabase/templates/recovery.html",
    remoteSubject: "mailer_subjects_recovery",
    remoteContent: "mailer_templates_recovery_content",
    requiredVariables: ["Token"],
    allowedVariables: ["Token"],
    credentialTemplate: true,
  },
  {
    key: "reauthentication",
    label: "账户确认",
    subject: "确认你的 DOSO robotics 账户操作",
    contentPath: "./supabase/templates/reauthentication.html",
    remoteSubject: "mailer_subjects_reauthentication",
    remoteContent: "mailer_templates_reauthentication_content",
    requiredVariables: ["Token"],
    allowedVariables: ["Token"],
    credentialTemplate: true,
  },
  {
    key: "magic_link",
    label: "登录验证",
    subject: "登录 DOSO robotics",
    contentPath: "./supabase/templates/magic_link.html",
    remoteSubject: "mailer_subjects_magic_link",
    remoteContent: "mailer_templates_magic_link_content",
    requiredVariables: ["Token"],
    allowedVariables: ["Token"],
    credentialTemplate: true,
  },
  {
    key: "email_change",
    label: "新邮箱验证",
    subject: "验证你的 DOSO robotics 新邮箱",
    contentPath: "./supabase/templates/email_change.html",
    remoteSubject: "mailer_subjects_email_change",
    remoteContent: "mailer_templates_email_change_content",
    requiredVariables: ["Token", "NewEmail"],
    allowedVariables: ["Token", "NewEmail"],
    credentialTemplate: true,
  },
  {
    key: "password_changed",
    configSection: "auth.email.notification.password_changed",
    label: "密码修改通知",
    subject: "你的 DOSO robotics 密码已修改",
    contentPath: "./supabase/templates/password_changed_notification.html",
    remoteSubject: "mailer_subjects_password_changed_notification",
    remoteContent: "mailer_templates_password_changed_notification_content",
    remoteEnabled: "mailer_notifications_password_changed_enabled",
    requiredVariables: ["Email"],
    allowedVariables: ["Email"],
  },
  {
    key: "email_changed",
    configSection: "auth.email.notification.email_changed",
    label: "邮箱修改通知",
    subject: "你的 DOSO robotics 邮箱已修改",
    contentPath: "./supabase/templates/email_changed_notification.html",
    remoteSubject: "mailer_subjects_email_changed_notification",
    remoteContent: "mailer_templates_email_changed_notification_content",
    remoteEnabled: "mailer_notifications_email_changed_enabled",
    requiredVariables: ["OldEmail", "Email"],
    allowedVariables: ["OldEmail", "Email"],
  },
];

const LEGACY_TEMPLATES = TEMPLATES.slice(0, 3);

const REMOTE_AUTH_EXPECTATIONS = [
  { field: "external_email_enabled", label: "邮箱登录", expected: true, display: "已启用" },
  { field: "mailer_autoconfirm", label: "邮箱验证", expected: false, display: "需要验证码确认" },
  {
    field: "mailer_secure_email_change_enabled",
    label: "邮箱变更确认",
    expected: true,
    display: "旧邮箱与新邮箱均需确认",
  },
  { field: "smtp_host", label: "SMTP 主机", expected: "smtpdm.aliyun.com", display: "smtpdm.aliyun.com" },
  { field: "smtp_port", label: "SMTP 端口", expected: "465", display: "465" },
  {
    field: "smtp_user",
    label: "SMTP 用户",
    expected: "no-reply@auth.dosorobotics.com",
    display: "no-reply@auth.dosorobotics.com",
  },
  {
    field: "smtp_admin_email",
    label: "发件地址",
    expected: "no-reply@auth.dosorobotics.com",
    display: "no-reply@auth.dosorobotics.com",
  },
  { field: "smtp_sender_name", label: "发件名称", expected: "DOSO", display: "DOSO" },
  { field: "smtp_max_frequency", label: "邮件重发间隔", expected: "60", display: "60 秒" },
  { field: "mailer_otp_length", label: "验证码长度", expected: "8", display: "8 位" },
  { field: "mailer_otp_exp", label: "验证码有效期", expected: "600", display: "600 秒" },
];

const options = parseArguments(process.argv.slice(2));

if (options.help) {
  console.log(`DOSO Supabase Auth 邮件模板管理

用法：
  node scripts/manage-auth-email-templates.mjs           仅执行本地静态校验
  node scripts/manage-auth-email-templates.mjs --logo    仅校验批准的公开 Logo（不是云端 Auth 模板验收）
  node scripts/manage-auth-email-templates.mjs --remote  读取线上配置并与本地比对
  node scripts/manage-auth-email-templates.mjs --sync --snapshot <绝对路径>
                                                        创建安全快照后同步并回读校验
  node scripts/manage-auth-email-templates.mjs --rollback <绝对快照路径>
                                                        严格校验快照后恢复快照内字段

云端 Auth 配置操作需要：
  SUPABASE_ACCESS_TOKEN       Supabase Personal Access Token
  DOSO_SUPABASE_PROJECT_REF   --remote 可选（默认 ${DEFAULT_PROJECT_REF}）；写操作必填

--sync 的 v2 快照路径必须是仓库外尚不存在的绝对路径。快照只包含七个主题、七份 HTML、
两个通知开关、项目 ref、UTC 时间、schema 版本和校验哈希，不包含 SMTP/OAuth 等秘密。
旧 v1 快照仍可严格回滚，但只恢复原有三个主题和三份 HTML。
脚本不会输出访问令牌、SMTP 密码、完整远端响应或完整 HTML。`);
  process.exit(0);
}

if (options.error) {
  fail(options.error);
  process.exit(1);
}

const shouldSync = options.mode === "sync";
const shouldRollback = options.mode === "rollback";
const shouldCheckLogo = options.mode === "logo";
const shouldReadRemote = options.mode === "remote" || shouldSync;

await run();

async function run() {
  try {
    if (shouldRollback) {
      const projectRef = getProjectRef(true);
      const accessToken = getAccessToken();
      const snapshot = await loadSnapshot(options.rollbackPath, projectRef);
      await patchRemoteTemplateValues(projectRef, accessToken, snapshot.templateValues);
      pass("线上回滚", `PATCH 已接受；正在回读 ${Object.keys(snapshot.templateValues).length} 个邮件字段`);

      const remoteTemplateValues = await getRemoteTemplateValues(projectRef, accessToken);
      if (!compareTemplateValues(snapshot.templateValues, remoteTemplateValues, "回滚")) {
        process.exitCode = 1;
      }
      return;
    }

    const local = await loadAndValidateLocalTemplates();
    const localLogo = await loadLocalLogo();
    printLocalSummary(local);
    pass(
      "本地 Logo",
      `${localLogo.width}×${localLogo.height} RGBA PNG · ${localLogo.length} 字节 · SHA-256 ${shortHash(localLogo.sha256)}`,
    );

    if (shouldCheckLogo) {
      const remoteLogo = await getRemoteLogo();
      if (!compareLocalAndRemoteLogo(localLogo, remoteLogo)) {
        process.exitCode = 1;
      }
      return;
    }

    if (shouldReadRemote) {
      const projectRef = getProjectRef(shouldSync);
      const accessToken = getAccessToken();

      if (shouldSync) {
        const previousRemote = await getRemoteState(projectRef, accessToken);
        const previousRemoteLogo = await getRemoteLogo();
        assertSyncPreflight(previousRemote, localLogo, previousRemoteLogo);
        await createSnapshot(options.snapshotPath, projectRef, previousRemote.templateValues);
        await patchRemoteTemplates(projectRef, accessToken, local);
        pass("线上同步", "PATCH 已接受；正在回读校验");
      }

      const remote = await getRemoteState(projectRef, accessToken);
      const remoteLogo = await getRemoteLogo();
      const settingsMatch = printRemoteAuthSettings(remote.authSettings);
      const templatesMatch = compareLocalAndRemote(local, remote.templates);
      const logoMatches = compareLocalAndRemoteLogo(localLogo, remoteLogo);
      const matches = settingsMatch && templatesMatch && logoMatches;
      if (!matches) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function parseArguments(args) {
  const result = {
    mode: "local",
    help: false,
    snapshotPath: undefined,
    rollbackPath: undefined,
    error: undefined,
  };
  const modes = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      result.help = true;
    } else if (argument === "--logo") {
      modes.push("logo");
    } else if (argument === "--remote") {
      modes.push("remote");
    } else if (argument === "--sync") {
      modes.push("sync");
    } else if (argument === "--snapshot") {
      if (result.snapshotPath !== undefined || !args[index + 1] || args[index + 1].startsWith("--")) {
        result.error = "--snapshot 必须且只能提供一个绝对路径。";
        break;
      }
      result.snapshotPath = args[index + 1];
      index += 1;
    } else if (argument === "--rollback") {
      if (result.rollbackPath !== undefined || !args[index + 1] || args[index + 1].startsWith("--")) {
        result.error = "--rollback 必须且只能提供一个绝对快照路径。";
        break;
      }
      modes.push("rollback");
      result.rollbackPath = args[index + 1];
      index += 1;
    } else {
      result.error = `未知参数：${argument}`;
      break;
    }
  }

  if (!result.error && result.help && args.length > 1) {
    result.error = "--help 不能与其他参数组合。";
  }
  if (!result.error && new Set(modes).size !== modes.length) {
    result.error = "同一操作参数不能重复。";
  }
  if (!result.error && modes.length > 1) {
    result.error = "--logo、--remote、--sync 与 --rollback 只能选择一个。";
  }
  if (!result.error && result.snapshotPath && modes[0] !== "sync") {
    result.error = "--snapshot 只能与 --sync 一起使用。";
  }
  if (!result.error && modes[0] === "sync" && !result.snapshotPath) {
    result.error = "--sync 必须提供 --snapshot <仓库外绝对路径>；未发送任何写请求。";
  }

  result.mode = modes[0] ?? "local";
  return result;
}

async function loadAndValidateLocalTemplates() {
  const config = await readFile(CONFIG_PATH, "utf8");
  const results = [];
  let valid = true;

  for (const template of TEMPLATES) {
    const configured = readTemplateSection(config, template);
    const absolutePath = resolve(PROJECT_ROOT, template.contentPath.replace(/^\.\//, ""));
    const content = await readFile(absolutePath, "utf8");
    const normalized = normalizeContent(content);
    const checks = [
      [configured.subject === template.subject, `config 主题为“${template.subject}”`],
      [configured.contentPath === template.contentPath, `config 路径为 ${template.contentPath}`],
      [configured.enabled === undefined || configured.enabled === true, "安全通知已启用"],
      ...templateVariableChecks(template, normalized),
      ...assetChecks(normalized),
      [extractTitle(normalized).length > 0, "HTML 包含非空 <title>"],
    ];

    const failedChecks = checks.filter(([passed]) => !passed).map(([, description]) => description);
    if (failedChecks.length > 0) {
      valid = false;
      for (const description of failedChecks) {
        failLine(template.label, description);
      }
    }

    results.push({
      ...template,
      content: normalized,
      length: normalized.length,
      sha256: sha256(normalized),
      valid: failedChecks.length === 0,
    });
  }

  if (!valid) {
    throw new Error("本地邮件模板校验失败；未执行任何远端操作。");
  }

  return results;
}

async function loadLocalLogo() {
  const bytes = await readFile(LOGO_PATH);
  if (bytes.length === 0) {
    throw new Error("本地 Logo 文件为空。");
  }
  const png = readPngHeader(bytes);
  if (
    png.width !== APPROVED_LOGO_WIDTH
    || png.height !== APPROVED_LOGO_HEIGHT
    || png.bitDepth !== 8
    || png.colorType !== 6
  ) {
    throw new Error(
      `本地 Logo 必须是 ${APPROVED_LOGO_WIDTH}×${APPROVED_LOGO_HEIGHT} 8-bit RGBA PNG。`,
    );
  }
  const digest = sha256(bytes);
  const expectedFilename = `doso-robotics-wordmark-email-${shortHash(digest)}.png`;
  const urlFilename = basename(new URL(LOGO_URL).pathname);
  if (basename(LOGO_PATH) !== expectedFilename || urlFilename !== expectedFilename) {
    throw new Error("本地 Logo 与公开 URL 必须使用匹配内容哈希的版本化文件名。");
  }
  return { length: bytes.length, sha256: digest, width: png.width, height: png.height };
}

function readPngHeader(bytes) {
  const pngSignature = Buffer.from("89504e470d0a1a0a", "hex");
  if (
    bytes.length < 29
    || !bytes.subarray(0, 8).equals(pngSignature)
    || bytes.subarray(12, 16).toString("ascii") !== "IHDR"
  ) {
    throw new Error("本地 Logo 不是有效的 PNG 文件。");
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
  };
}

function readTemplateSection(config, template) {
  const sectionName = template.configSection ?? `auth.email.template.${template.key}`;
  const escapedSection = escapeRegExp(sectionName);
  const sectionPattern = new RegExp(
    `^\\[${escapedSection}\\]\\s*$([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`,
    "m",
  );
  const section = config.match(sectionPattern)?.[1];
  if (!section) {
    throw new Error(`config.toml 缺少 [${sectionName}]`);
  }

  return {
    subject: readTomlString(section, "subject", template.key),
    contentPath: readTomlString(section, "content_path", template.key),
    enabled: template.remoteEnabled ? readTomlBoolean(section, "enabled", template.key) : undefined,
  };
}

function readTomlBoolean(section, field, key) {
  const match = section.match(new RegExp(`^${escapeRegExp(field)}\\s*=\\s*(true|false)\\s*$`, "m"));
  if (!match) {
    throw new Error(`config.toml 的 ${key}.${field} 缺失或不是布尔值`);
  }
  return match[1] === "true";
}

function readTomlString(section, field, key) {
  const match = section.match(new RegExp(`^${escapeRegExp(field)}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")\\s*$`, "m"));
  if (!match) {
    throw new Error(`config.toml 的 ${key}.${field} 缺失或不是双引号字符串`);
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error(`config.toml 的 ${key}.${field} 无法解析`);
  }
}

function printLocalSummary(local) {
  for (const template of local) {
    pass(template.label, `${template.contentPath} · ${template.length} 字符 · SHA-256 ${shortHash(template.sha256)}`);
  }
  pass("本地校验", "7 个原生模板、14 个主题/HTML 字段与 2 个通知开关均与 config.toml 一致");
}

function getProjectRef(requireExplicit) {
  const configuredProjectRef = process.env.DOSO_SUPABASE_PROJECT_REF?.trim();
  if (requireExplicit && !configuredProjectRef) {
    throw new Error("写操作要求显式设置 DOSO_SUPABASE_PROJECT_REF；未发送任何写请求。");
  }

  const projectRef = configuredProjectRef || DEFAULT_PROJECT_REF;
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error("DOSO_SUPABASE_PROJECT_REF 格式无效（应为 20 位小写字母或数字）。");
  }
  return projectRef;
}

function getAccessToken() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("远端操作需要 SUPABASE_ACCESS_TOKEN；未发送任何请求。请在当前终端设置后重试。");
  }
  return token;
}

async function getRemoteState(projectRef, accessToken) {
  const response = await managementRequest("GET", projectRef, accessToken);
  const raw = await parseJsonResponse(response, "读取线上 Auth 配置");

  // The complete response is parsed only briefly. Sensitive fields such as
  // smtp_pass are never copied into the returned allow-listed summary or logs.
  const authSettings = REMOTE_AUTH_EXPECTATIONS.map((expectation) => {
    const value = raw[expectation.field];
    const present = value !== undefined && value !== null && value !== "";
    return {
      label: expectation.label,
      display: expectation.display,
      present,
      matches: present && String(value) === String(expectation.expected),
    };
  });
  const smtpPasswordConfigured = typeof raw.smtp_pass === "string" && raw.smtp_pass.trim().length > 0;
  authSettings.push({
    label: "SMTP 密码",
    display: "已配置（值不回显）",
    present: smtpPasswordConfigured,
    matches: smtpPasswordConfigured,
  });

  const templates = TEMPLATES.map((template) => {
    const subject = typeof raw[template.remoteSubject] === "string" ? raw[template.remoteSubject] : "";
    const content = typeof raw[template.remoteContent] === "string"
      ? normalizeContent(raw[template.remoteContent])
      : "";
    return {
      key: template.key,
      label: template.label,
      subject,
      length: content.length,
      sha256: sha256(content),
      enabled: template.remoteEnabled ? raw[template.remoteEnabled] === true : undefined,
    };
  });
  const templateValues = extractTemplateValues(raw);

  return { authSettings, smtpPasswordConfigured, templates, templateValues };
}

async function getRemoteTemplateValues(projectRef, accessToken) {
  const response = await managementRequest("GET", projectRef, accessToken);
  const raw = await parseJsonResponse(response, "回读线上邮件模板");
  return extractTemplateValues(raw);
}

function extractTemplateValues(raw) {
  return Object.fromEntries(TEMPLATES.flatMap((template) => [
      [template.remoteSubject, typeof raw[template.remoteSubject] === "string" ? raw[template.remoteSubject] : ""],
      [template.remoteContent, typeof raw[template.remoteContent] === "string" ? raw[template.remoteContent] : ""],
      ...(template.remoteEnabled ? [[template.remoteEnabled, raw[template.remoteEnabled] === true]] : []),
    ]));
}

function assertSyncPreflight(remote, localLogo, remoteLogo) {
  const settingsMatch = printRemoteAuthSettings(remote.authSettings);
  const logoMatches = compareLocalAndRemoteLogo(localLogo, remoteLogo);
  if (!settingsMatch || !logoMatches) {
    throw new Error(
      "线上同步预检失败：远端 Auth/SMTP 前置配置或公开 Logo 不符合 DOSO 批准值；未创建快照，未发送任何写请求。",
    );
  }
  pass("线上同步预检", "Auth/SMTP 前置配置、SMTP 密码与公开 Logo 均符合 DOSO 批准值");
}

async function patchRemoteTemplates(projectRef, accessToken, local) {
  const payload = Object.fromEntries(
    local.flatMap((template) => [
      [template.remoteSubject, template.subject],
      [template.remoteContent, template.content],
      ...(template.remoteEnabled ? [[template.remoteEnabled, true]] : []),
    ]),
  );

  await patchRemoteTemplateValues(projectRef, accessToken, payload);
}

async function patchRemoteTemplateValues(projectRef, accessToken, payload) {
  assertPatchFieldSet(payload);
  for (const [field, value] of Object.entries(payload)) {
    const isNotificationFlag = notificationFieldNames().includes(field);
    if ((isNotificationFlag && typeof value !== "boolean")
      || (!isNotificationFlag && (typeof value !== "string" || value.length === 0))) {
      throw new Error(
        isNotificationFlag
          ? `邮件模板 PATCH 字段 ${field} 必须是布尔值。`
          : `邮件模板 PATCH 字段 ${field} 必须是非空字符串。`,
      );
    }
  }

  const response = await managementRequest("PATCH", projectRef, accessToken, payload);
  if (!response.ok) {
    throw new Error(`同步线上 Auth 模板失败：HTTP ${response.status} ${response.statusText || "请求失败"}`);
  }

  await response.body?.cancel();
}

async function createSnapshot(requestedPath, projectRef, templateValues) {
  const snapshotPath = await resolveExternalSnapshotPath(requestedPath, false);
  const core = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    project_ref: projectRef,
    created_at_utc: new Date().toISOString(),
    subjects: Object.fromEntries(TEMPLATES.map((template) => [template.key, templateValues[template.remoteSubject]])),
    html: Object.fromEntries(TEMPLATES.map((template) => [template.key, templateValues[template.remoteContent]])),
    notifications: Object.fromEntries(
      TEMPLATES.filter((template) => template.remoteEnabled)
        .map((template) => [template.key, templateValues[template.remoteEnabled]]),
    ),
  };
  validateSnapshotCore(core, projectRef);
  const snapshot = { ...core, snapshot_sha256: snapshotHash(core) };
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES) {
    throw new Error("快照超过 2 MiB 安全上限；未发送任何写请求。");
  }

  let handle;
  try {
    handle = await open(snapshotPath, "wx", 0o600);
    await handle.writeFile(serialized, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      throw new Error("快照文件已存在；为避免覆盖审计证据，未发送任何写请求。");
    }
    throw new Error("无法安全创建快照；未发送任何写请求。");
  } finally {
    await handle?.close();
  }

  await loadSnapshot(snapshotPath, projectRef);
  pass("回滚快照", `已安全创建 · schema v${SNAPSHOT_SCHEMA_VERSION} · SHA-256 ${shortHash(snapshot.snapshot_sha256)}`);
}

async function loadSnapshot(requestedPath, projectRef) {
  const snapshotPath = await resolveExternalSnapshotPath(requestedPath, true);
  const metadata = await stat(snapshotPath);
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > MAX_SNAPSHOT_BYTES) {
    throw new Error("快照必须是 1 字节至 2 MiB 的普通文件；未发送任何写请求。");
  }

  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  } catch {
    throw new Error("快照不是有效 JSON；未发送任何写请求。");
  }
  assertPlainObject(snapshot, "快照");
  assertExactKeys(
    snapshot,
    snapshot.schema_version === 1
      ? ["schema_version", "project_ref", "created_at_utc", "subjects", "html", "snapshot_sha256"]
      : ["schema_version", "project_ref", "created_at_utc", "subjects", "html", "notifications", "snapshot_sha256"],
    "快照",
  );
  const { snapshot_sha256: storedHash, ...core } = snapshot;
  validateSnapshotCore(core, projectRef);
  if (typeof storedHash !== "string" || !/^[a-f0-9]{64}$/.test(storedHash) || storedHash !== snapshotHash(core)) {
    throw new Error("快照 SHA-256 校验失败；文件可能已被篡改，未发送任何写请求。");
  }

  const snapshotTemplates = core.schema_version === 1 ? LEGACY_TEMPLATES : TEMPLATES;
  return {
    templateValues: Object.fromEntries(snapshotTemplates.flatMap((template) => [
        [template.remoteSubject, snapshot.subjects[template.key]],
        [template.remoteContent, snapshot.html[template.key]],
        ...(template.remoteEnabled ? [[template.remoteEnabled, snapshot.notifications[template.key]]] : []),
      ])),
  };
}

function validateSnapshotCore(core, projectRef) {
  assertPlainObject(core, "快照核心");
  if (core.schema_version !== 1 && core.schema_version !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`快照 schema 版本无效；仅接受 v1 或 v${SNAPSHOT_SCHEMA_VERSION}，未发送任何写请求。`);
  }
  const snapshotTemplates = core.schema_version === 1 ? LEGACY_TEMPLATES : TEMPLATES;
  assertExactKeys(
    core,
    core.schema_version === 1
      ? ["schema_version", "project_ref", "created_at_utc", "subjects", "html"]
      : ["schema_version", "project_ref", "created_at_utc", "subjects", "html", "notifications"],
    "快照核心",
  );
  if (core.project_ref !== projectRef) {
    throw new Error("快照 project ref 与显式目标不一致；未发送任何写请求。");
  }
  if (typeof core.created_at_utc !== "string"
    || !core.created_at_utc.endsWith("Z")
    || Number.isNaN(Date.parse(core.created_at_utc))
    || new Date(core.created_at_utc).toISOString() !== core.created_at_utc) {
    throw new Error("快照 UTC 时间格式无效；未发送任何写请求。");
  }
  for (const [groupName, group] of [["subjects", core.subjects], ["html", core.html]]) {
    assertPlainObject(group, `快照 ${groupName}`);
    assertExactKeys(group, snapshotTemplates.map((template) => template.key), `快照 ${groupName}`);
    for (const [key, value] of Object.entries(group)) {
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`快照 ${groupName}.${key} 必须是非空字符串；未发送任何写请求。`);
      }
    }
  }
  if (core.schema_version === 2) {
    assertPlainObject(core.notifications, "快照 notifications");
    const notificationTemplates = TEMPLATES.filter((template) => template.remoteEnabled);
    assertExactKeys(core.notifications, notificationTemplates.map((template) => template.key), "快照 notifications");
    for (const [key, value] of Object.entries(core.notifications)) {
      if (typeof value !== "boolean") {
        throw new Error(`快照 notifications.${key} 必须是布尔值；未发送任何写请求。`);
      }
    }
  }
}

async function resolveExternalSnapshotPath(requestedPath, mustExist) {
  if (typeof requestedPath !== "string" || !isAbsolute(requestedPath)) {
    throw new Error("快照路径必须是显式绝对路径；未发送任何写请求。");
  }
  const absolutePath = resolve(requestedPath);
  const rootPath = await getGitWorktreeRoot();
  let checkedPath;
  try {
    checkedPath = mustExist
      ? await realpath(absolutePath)
      : join(await realpath(dirname(absolutePath)), basename(absolutePath));
  } catch {
    throw new Error("快照路径或其父目录不存在；未发送任何写请求。");
  }
  if (isPathInside(rootPath, checkedPath)) {
    throw new Error("快照路径不得位于仓库内；未发送任何写请求。");
  }
  return checkedPath;
}

async function getGitWorktreeRoot() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
    });
    const worktreeRoot = await realpath(stdout.trim());
    const projectRoot = await realpath(PROJECT_ROOT);
    if (!isPathInside(worktreeRoot, projectRoot)) {
      throw new Error("project root is outside resolved worktree");
    }
    return worktreeRoot;
  } catch {
    throw new Error("无法确定真实 Git worktree root；写操作已拒绝。");
  }
}

function isPathInside(parent, candidate) {
  const segment = relative(parent, candidate);
  return segment === "" || (!segment.startsWith("..") && !isAbsolute(segment));
}

function snapshotHash(core) {
  return sha256(JSON.stringify(core));
}

function templateFieldNames() {
  return TEMPLATES.flatMap((template) => [
    template.remoteSubject,
    template.remoteContent,
    ...(template.remoteEnabled ? [template.remoteEnabled] : []),
  ]);
}

function legacyTemplateFieldNames() {
  return LEGACY_TEMPLATES.flatMap((template) => [template.remoteSubject, template.remoteContent]);
}

function notificationFieldNames() {
  return TEMPLATES.flatMap((template) => template.remoteEnabled ? [template.remoteEnabled] : []);
}

function assertPatchFieldSet(payload) {
  try {
    assertExactKeys(payload, templateFieldNames(), "邮件模板 PATCH");
  } catch {
    assertExactKeys(payload, legacyTemplateFieldNames(), "邮件模板 PATCH");
  }
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} 必须是普通 JSON 对象；未发送任何写请求。`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} 字段不符合 allowlist；未发送任何写请求。`);
  }
}

async function getRemoteLogo() {
  let response;
  try {
    response = await fetch(LOGO_URL, {
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(`公开 Logo 请求失败：${safeNetworkMessage(error)}`);
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`公开 Logo 返回 HTTP ${response.status} ${response.statusText || "请求失败"}`);
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
  if (contentType !== "image/png") {
    await response.body?.cancel();
    throw new Error(`公开 Logo Content-Type 应为 image/png，实际为 ${contentType || "缺失"}`);
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_LOGO_BYTES) {
    await response.body?.cancel();
    throw new Error("公开 Logo 超过 256 KiB 邮件资源上限。");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("公开 Logo 响应缺少可读取的正文。");
  }
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    length += chunk.length;
    if (length > MAX_LOGO_BYTES) {
      await reader.cancel();
      throw new Error("公开 Logo 超过 256 KiB 邮件资源上限。");
    }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks, length);
  return { length: bytes.length, sha256: sha256(bytes) };
}

async function managementRequest(method, projectRef, accessToken, payload) {
  const url = `${API_ORIGIN}/v1/projects/${encodeURIComponent(projectRef)}/config/auth`;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(payload ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(`Supabase Management API 请求失败：${safeNetworkMessage(error)}`);
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Supabase Management API 返回 HTTP ${response.status} ${response.statusText || "请求失败"}`);
  }
  return response;
}

async function parseJsonResponse(response, operation) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${operation}失败：服务端没有返回有效 JSON。`);
  }
}

function compareLocalAndRemote(local, remote) {
  let matches = true;
  for (const localTemplate of local) {
    const remoteTemplate = remote.find((candidate) => candidate.key === localTemplate.key);
    const subjectMatches = remoteTemplate?.subject === localTemplate.subject;
    const contentMatches = remoteTemplate?.sha256 === localTemplate.sha256
      && remoteTemplate?.length === localTemplate.length;
    const enabledMatches = localTemplate.remoteEnabled ? remoteTemplate?.enabled === true : true;

    if (subjectMatches && contentMatches && enabledMatches) {
      pass(
        `线上 ${localTemplate.label}`,
        `主题一致 · ${remoteTemplate.length} 字符 · SHA-256 ${shortHash(remoteTemplate.sha256)}`,
      );
      continue;
    }

    matches = false;
    if (!subjectMatches) {
      diff(localTemplate.label, "主题与本地不一致");
    }
    if (!contentMatches) {
      diff(
        localTemplate.label,
        `HTML 摘要不一致（本地 ${localTemplate.length}/${shortHash(localTemplate.sha256)}，线上 ${remoteTemplate?.length ?? 0}/${shortHash(remoteTemplate?.sha256)}）`,
      );
    }
    if (!enabledMatches) {
      diff(localTemplate.label, "安全通知开关未启用");
    }
  }

  if (matches) {
    pass("远端校验", "线上 7 个主题、7 个模板和 2 个通知开关与本地完全一致");
  } else {
    diff("远端校验", shouldSync ? "同步后回读仍不一致" : "线上配置与本地存在差异；未执行写入");
  }
  return matches;
}

function compareTemplateValues(expected, actual, operation) {
  let matches = true;
  for (const field of Object.keys(expected)) {
    if (actual[field] !== expected[field]) {
      matches = false;
      diff(operation, `回读字段 ${field} 不一致（实际内容不回显）`);
    }
  }
  if (matches) {
    pass(`${operation}校验`, `${Object.keys(expected).length} 个快照字段回读完全一致`);
  }
  return matches;
}

function printRemoteAuthSettings(settings) {
  let matches = true;
  for (const setting of settings) {
    if (setting.matches) {
      pass(setting.label, setting.display);
      continue;
    }

    matches = false;
    diff(setting.label, setting.present ? "不符合 DOSO 预期配置（实际值不回显）" : "远端字段缺失");
  }
  return matches;
}

function compareLocalAndRemoteLogo(local, remote) {
  if (local.length === remote.length && local.sha256 === remote.sha256) {
    pass("公开 Logo", `HTTP 200 · image/png · ${remote.length} 字节 · SHA-256 ${shortHash(remote.sha256)}`);
    return true;
  }

  diff(
    "公开 Logo",
    `与本地不一致（本地 ${local.length}/${shortHash(local.sha256)}，线上 ${remote.length}/${shortHash(remote.sha256)}）`,
  );
  return false;
}

function normalizeContent(content) {
  return content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trimEnd() + "\n";
}

function extractTitle(content) {
  return content.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function templateVariableChecks(template, content) {
  const variables = [...content.matchAll(/\{\{\s*\.([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g)].map((match) => match[1]);
  const templateBlocks = [...content.matchAll(/\{\{[\s\S]*?\}\}/g)];
  const checks = [];
  for (const required of template.requiredVariables) {
    checks.push([
      variables.filter((variable) => variable === required).length === 1,
      `仅包含一个 {{ .${required} }}`,
    ]);
  }
  checks.push([
    variables.every((variable) => template.allowedVariables.includes(variable)),
    `模板变量仅允许 ${template.allowedVariables.map((variable) => `{{ .${variable} }}`).join("、")}`,
  ]);
  checks.push([
    variables.length === template.requiredVariables.length,
    "模板变量数量与精确 allowlist 一致",
  ]);
  checks.push([
    templateBlocks.length === variables.length,
    "所有 Go 模板块均为 allowlist 中的 {{ .Variable }} 变量",
  ]);
  if (template.credentialTemplate) {
    checks.push([!(/ConfirmationURL/i.test(content)), "不含 ConfirmationURL"]);
    checks.push([!(/TokenHash/i.test(content)), "不含 TokenHash"]);
    checks.push([!(/<\s*a(?:\s|>)/i.test(content)), "不含 <a> 标签"]);
    checks.push([!(/\bhref\s*=/i.test(content)), "不含 href 属性"]);
  }
  return checks;
}

function assetChecks(content) {
  const markup = content.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  const imageTags = [...markup.matchAll(/<img\b[^>]*>/gi)];
  const sourcesByImage = imageTags.map(([tag]) =>
    [...tag.matchAll(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
  );
  // Generated images start with src; anchoring prevents attribute text from impersonating it.
  const hasLeadingSource = imageTags.every(([tag]) =>
    /^<img\s+src\s*=\s*(?:"[^"]*"|'[^']*')(?=\s|\/?>)/i.test(tag)
  );
  const imageSources = sourcesByImage.flat().map((match) => match[1] ?? match[2] ?? match[3]);
  return [
    [!(/<\s*svg\b/i.test(content)), "不含内嵌 SVG"],
    [!(/(?:data:image|cid:|file:)/i.test(content)), "不含嵌入式图片资源"],
    [imageTags.length === 2, "包含页眉与页脚两处 Logo <img>"],
    [hasLeadingSource && sourcesByImage.every((sources) => sources.length === 1 && sources[0][3] === undefined), "每个 <img> 均以唯一且带引号的 src 作为首属性（生成模板约定）"],
    [!(/\ssrcset\s*=|<\s*(?:picture|source)\b/i.test(markup)), "不含备用图片源（srcset、picture、source）"],
    [imageSources.every((source) => source === LOGO_URL), "所有图片均只引用 DOSO 批准的版本化 HTTPS URL"],
  ];
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function shortHash(value) {
  return value ? value.slice(0, 12) : "缺失";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeNetworkMessage(error) {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "20 秒超时";
  }
  return "网络连接失败";
}

function pass(label, message) {
  console.log(`PASS  ${label} — ${message}`);
}

function diff(label, message) {
  console.error(`DIFF  ${label} — ${message}`);
}

function failLine(label, message) {
  console.error(`FAIL  ${label} — ${message}`);
}

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}
