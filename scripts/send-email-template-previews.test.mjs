import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = resolve(PROJECT_ROOT, "scripts/send-email-template-previews.mjs");
const POWERSHELL_WRAPPER = resolve(PROJECT_ROOT, "scripts/send-email-template-previews.ps1");

function run(args = [], extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  delete env.DIRECTMAIL_SMTP_PASSWORD;
  delete env.DIRECTMAIL_SMTP_USER;
  delete env.DIRECTMAIL_SMTP_HOST;
  delete env.DIRECTMAIL_SMTP_PORT;
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
}

function decodePlainTextPart(mime) {
  const match = mime.match(
    /Content-Type: text\/plain; charset=UTF-8\r?\nContent-Transfer-Encoding: base64\r?\n\r?\n([\s\S]*?)\r?\n--doso-alt-/,
  );
  assert.ok(match, "text/plain MIME part was not found");
  return Buffer.from(match[1].replace(/\s+/g, ""), "base64").toString("utf8");
}

test("secure preview wrapper parses in Windows PowerShell 5.1", {
  skip: process.platform !== "win32",
}, () => {
  const escapedPath = POWERSHELL_WRAPPER.replaceAll("'", "''");
  const command = [
    "$tokens = $null",
    "$parseErrors = $null",
    `[System.Management.Automation.Language.Parser]::ParseFile('${escapedPath}', [ref]$tokens, [ref]$parseErrors) | Out-Null`,
    "if ($parseErrors.Count -gt 0) { $parseErrors | ForEach-Object { Write-Error $_.Message }; exit 1 }",
  ].join("; ");
  const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
});

test("dry-run renders all 11 templates without connecting to SMTP", () => {
  const result = run(["--dry-run", "--to", "qa-recipient@example.test"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout.match(/^READY /gm) ?? []).length, 11);
  assert.match(result.stdout, /01\/11 confirmation/);
  assert.match(result.stdout, /11\/11 account_deleted/);
  assert.match(result.stdout, /未连接 SMTP/);
  assert.doesNotMatch(result.stdout + result.stderr, /@qq\.com|old-email@example\.com/);
});

test("--only renders exactly one selected template", () => {
  const result = run(["--dry-run", "--only", "new_device_login", "--to", "preview@example.com"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout.match(/^READY /gm) ?? []).length, 1);
  assert.match(result.stdout, /01\/01 new_device_login/);
});

test("dry-run can persist browser HTML and multipart alternative MIME", async () => {
  const outputDir = await mkdtemp(resolve(tmpdir(), "doso-email-preview-"));
  try {
    const result = run(["--dry-run", "--to", "preview@example.com", "--output-dir", outputDir]);
    assert.equal(result.status, 0, result.stderr);
    const html = await readFile(resolve(outputDir, "01-confirmation.html"), "utf8");
    const mime = await readFile(resolve(outputDir, "01-confirmation.eml"), "utf8");
    const securityMime = await readFile(resolve(outputDir, "09-new_device_login.eml"), "utf8");
    const deletionMime = await readFile(resolve(outputDir, "10-account_deletion_confirmation.eml"), "utf8");
    const index = await readFile(resolve(outputDir, "index.html"), "utf8");
    assert.match(html, /DOSO 模板预览 01\/11/);
    assert.match(index, /01-confirmation\.html/);
    assert.match(mime, /Content-Type: multipart\/alternative/);
    assert.match(mime, /Content-Type: text\/plain; charset=UTF-8/);
    assert.match(mime, /Content-Type: text\/html; charset=UTF-8/);
    assert.match(decodePlainTextPart(securityMime), /https:\/\/dosorobotics\.com\/account\/security/);
    assert.match(decodePlainTextPart(deletionMime), /https:\/\/dosorobotics\.com\/account\/delete\/confirm/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("--send fails before network access when the SMTP password is absent", () => {
  const result = run(["--send", "--only", "confirmation", "--to", "qa-recipient@example.test"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DIRECTMAIL_SMTP_PASSWORD/);
  assert.doesNotMatch(result.stdout + result.stderr, /SMTP TLS|SMTP AUTH|SENT/);
});

test("--send requires an explicit recipient instead of a source-code default", () => {
  const result = run(["--send", "--only", "confirmation"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /显式提供 --to/);
  assert.doesNotMatch(result.stdout + result.stderr, /SMTP TLS|SMTP AUTH|SENT/);
});

test("invalid recipient and unsafe delay are rejected", () => {
  const invalidRecipient = run(["--dry-run", "--to", "not-an-email"]);
  assert.equal(invalidRecipient.status, 1);
  assert.match(invalidRecipient.stderr, /邮箱地址/);

  const invalidDelay = run(["--dry-run", "--delay-ms", "100"]);
  assert.equal(invalidDelay.status, 1);
  assert.match(invalidDelay.stderr, /500 至 15000/);

  const connectionBreakingDelay = run(["--dry-run", "--delay-ms", "20000"]);
  assert.equal(connectionBreakingDelay.status, 1);
  assert.match(connectionBreakingDelay.stderr, /500 至 15000/);

  const outputWhileSending = run(["--send", "--only", "confirmation", "--to", "preview@example.com", "--output-dir", "artifacts/email-previews"]);
  assert.equal(outputWhileSending.status, 1);
  assert.match(outputWhileSending.stderr, /只能与 --dry-run/);
});
