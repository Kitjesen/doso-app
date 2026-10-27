import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = resolve(PROJECT_ROOT, "scripts/manage-auth-email-templates.mjs");
const PROJECT_REF = "vchvqfdlkomlrjenkdhj";
const OTHER_PROJECT_REF = "abcdefghijklmnopqrst";
const LOGO_PATH = resolve(PROJECT_ROOT, "assets/brand/doso-robotics-wordmark-email-29dea10fd204.png");
const TEMPLATE_DEFINITIONS = [
  {
    key: "confirmation",
    subject: "验证你的 DOSO robotics 邮箱",
    subjectField: "mailer_subjects_confirmation",
    contentField: "mailer_templates_confirmation_content",
    variables: ["Token"],
  },
  {
    key: "recovery",
    subject: "重置你的 DOSO robotics 密码",
    subjectField: "mailer_subjects_recovery",
    contentField: "mailer_templates_recovery_content",
    variables: ["Token"],
  },
  {
    key: "reauthentication",
    subject: "确认你的 DOSO robotics 账户操作",
    subjectField: "mailer_subjects_reauthentication",
    contentField: "mailer_templates_reauthentication_content",
    variables: ["Token"],
  },
  {
    key: "magic_link",
    subject: "登录 DOSO robotics",
    subjectField: "mailer_subjects_magic_link",
    contentField: "mailer_templates_magic_link_content",
    variables: ["Token"],
  },
  {
    key: "email_change",
    subject: "验证你的 DOSO robotics 新邮箱",
    subjectField: "mailer_subjects_email_change",
    contentField: "mailer_templates_email_change_content",
    variables: ["Token", "NewEmail"],
  },
  {
    key: "password_changed",
    file: "password_changed_notification",
    subject: "你的 DOSO robotics 密码已修改",
    subjectField: "mailer_subjects_password_changed_notification",
    contentField: "mailer_templates_password_changed_notification_content",
    enabledField: "mailer_notifications_password_changed_enabled",
    variables: ["Email"],
  },
  {
    key: "email_changed",
    file: "email_changed_notification",
    subject: "你的 DOSO robotics 邮箱已修改",
    subjectField: "mailer_subjects_email_changed_notification",
    contentField: "mailer_templates_email_changed_notification_content",
    enabledField: "mailer_notifications_email_changed_enabled",
    variables: ["OldEmail", "Email"],
  },
];
const LEGACY_TEMPLATE_DEFINITIONS = TEMPLATE_DEFINITIONS.slice(0, 3);

const AUTH_SETTINGS = {
  external_email_enabled: true,
  mailer_autoconfirm: false,
  mailer_secure_email_change_enabled: true,
  smtp_host: "smtpdm.aliyun.com",
  smtp_port: "465",
  smtp_user: "no-reply@auth.dosorobotics.com",
  smtp_admin_email: "no-reply@auth.dosorobotics.com",
  smtp_sender_name: "DOSO",
  smtp_max_frequency: "60",
  mailer_otp_length: "8",
  mailer_otp_exp: "600",
  smtp_pass: "SMTP_CONFIGURED_SENTINEL_DO_NOT_PRINT",
};

test("email:check succeeds for the committed local templates", async () => {
  const result = await runScript([], { mockFetch: false });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS  本地校验/);
  assert.match(result.stdout, /PASS  本地 Logo — 2172×724 RGBA PNG · 196202 字节 · SHA-256 29dea10fd204/);
});

test("email:check rejects a Logo whose dimensions no longer match the approved email wordmark", async (t) => {
  const fixtureRoot = await createProjectFixture();
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const logoPath = resolve(fixtureRoot, "assets/brand/doso-robotics-wordmark-email-29dea10fd204.png");
  const logo = Buffer.from(await readFile(logoPath));
  logo.writeUInt32BE(724, 16);
  await writeFile(logoPath, logo);

  const result = await runScript([], {
    scriptPath: resolve(fixtureRoot, "scripts/manage-auth-email-templates.mjs"),
    mockFetch: false,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /必须是 2172×724 8-bit RGBA PNG/);
});

test("local validation rejects a template with no Logo images even when the approved URL remains as text", async (t) => {
  const fixtureRoot = await createProjectFixture();
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const templatePath = resolve(fixtureRoot, "supabase/templates/confirmation.html");
  const html = await readFile(templatePath, "utf8");
  const logoUrl = "https://vchvqfdlkomlrjenkdhj.supabase.co/storage/v1/object/public/email-assets/doso-robotics-wordmark-email-29dea10fd204.png";
  await writeFile(templatePath, html.replace(/<img\b[^>]*>/gi, "").replace("</body>", `${logoUrl}</body>`), "utf8");
  const result = await runScript([], { scriptPath: resolve(fixtureRoot, "scripts/manage-auth-email-templates.mjs"), mockFetch: false });
  assert.equal(result.status, 1, 'A URL in text is not a rendered Logo reference');
  assert.match(result.stderr, /页眉与页脚.*Logo/);
  assert.equal(result.calls.length, 0);
});

test("local validation does not count Logo images inside HTML comments", async (t) => {
  const fixtureRoot = await createProjectFixture();
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const templatePath = resolve(fixtureRoot, "supabase/templates/confirmation.html");
  const html = await readFile(templatePath, "utf8");
  await writeFile(templatePath, html.replace(/<img\b[^>]*>/gi, (tag) => `<!-- ${tag} -->`), "utf8");

  const result = await runScript([], {
    scriptPath: resolve(fixtureRoot, "scripts/manage-auth-email-templates.mjs"),
    mockFetch: false,
  });

  assert.equal(result.status, 1, "Commented-out images cannot satisfy the Logo requirement");
  assert.match(result.stderr, /页眉与页脚.*Logo/);
  assert.equal(result.calls.length, 0);
});

test("invalid Logo markup blocks remote verification and direct sync before requests or snapshots", async (t) => {
  const cases = [
    ["missing one Logo", (html) => html.replace(/<img\b[^>]*>/i, ""), /页眉与页脚.*Logo/],
    ["commented Logos", (html) => html.replace(/<img\b[^>]*>/gi, (tag) => `<!-- ${tag} -->`), /页眉与页脚.*Logo/],
    ["unterminated comment", (html) => html.replace(/<img\b/, "<!-- <img"), /页眉与页脚.*Logo/],
    ["alternate source", (html) => html.replace("<img ", '<img srcset="https://example.com/logo.png 2x" '), /不含备用图片源/],
    ["source text inside alt", (html) => html.replace(/\bsrc="([^"]+)"/g, 'alt=" src=\'$1\'"'), /每个 <img>.*唯一.*src/],
  ];

  for (const [label, mutate, expected] of cases) {
    for (const mode of ["--remote", "--sync"]) {
      await t.test(`${label}: ${mode}`, async () => {
        const fixtureRoot = await createProjectFixture();
        t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
        const templatePath = resolve(fixtureRoot, "supabase/templates/confirmation.html");
        await writeFile(templatePath, mutate(await readFile(templatePath, "utf8")), "utf8");
        const snapshotPath = await createExternalSnapshotPath(t);
        const args = mode === "--sync" ? [mode, "--snapshot", snapshotPath] : [mode];
        const result = await runScript(args, {
          scriptPath: resolve(fixtureRoot, "scripts/manage-auth-email-templates.mjs"),
          scenario: await createMatchingScenario(),
          env: {
            DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
            SUPABASE_ACCESS_TOKEN: "pat_logo_guard_test_only",
          },
        });

        assert.equal(result.status, 1);
        assert.match(result.stderr, expected);
        assert.deepEqual(result.calls, []);
        await assert.rejects(readFile(snapshotPath), { code: "ENOENT" });
      });
    }
  }
});

test("email:sync is gated by the generated-suite check before any remote request", async (t) => {
  const packageJson = JSON.parse(await readFile(resolve(PROJECT_ROOT, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts["email:sync"],
    "node scripts/build-email-template-suite.mjs --check && node scripts/manage-auth-email-templates.mjs --sync",
  );

  const fixtureRoot = await createProjectFixture();
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const templatePath = resolve(fixtureRoot, "supabase/templates/confirmation.html");
  await writeFile(templatePath, `${await readFile(templatePath, "utf8")}\n<!-- non-generated drift -->\n`, "utf8");
  const result = await runScript(["--check"], {
    scriptPath: resolve(fixtureRoot, "scripts/build-email-template-suite.mjs"),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /OUTDATED confirmation\.html/);
  assert.equal(result.calls.length, 0);
});

test("--sync creates an allow-listed v2 snapshot, PATCHes exactly 16 fields, and verifies readback", async (t) => {
  const scenario = await createMatchingScenario();
  scenario.remote.mailer_subjects_confirmation = "同步前主题";
  const snapshotPath = await createExternalSnapshotPath(t);
  const result = await runScript(["--sync", "--snapshot", snapshotPath], {
    scenario,
    env: {
      DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
      SUPABASE_ACCESS_TOKEN: "pat_sync_test_only",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const patch = result.calls.find((call) => call.method === "PATCH");
  const expectedPayload = Object.fromEntries(
    TEMPLATE_DEFINITIONS.flatMap((definition) => [
      [definition.subjectField, definition.subject],
      [definition.contentField, scenario.remote[definition.contentField]],
      ...(definition.enabledField ? [[definition.enabledField, true]] : []),
    ]),
  );
  assert.deepEqual(Object.keys(patch.body).sort(), Object.keys(expectedPayload).sort());
  assert.deepEqual(patch.body, expectedPayload);
  assert.match(result.stdout, /PASS  远端校验/);

  const snapshotText = await readFile(snapshotPath, "utf8");
  const snapshot = JSON.parse(snapshotText);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "created_at_utc",
    "html",
    "notifications",
    "project_ref",
    "schema_version",
    "snapshot_sha256",
    "subjects",
  ].sort());
  assert.equal(snapshot.schema_version, 2);
  assert.equal(snapshot.project_ref, PROJECT_REF);
  assert.equal(snapshot.subjects.confirmation, "同步前主题");
  assert.deepEqual(Object.keys(snapshot.subjects).sort(), TEMPLATE_DEFINITIONS.map(({ key }) => key).sort());
  assert.deepEqual(Object.keys(snapshot.html).sort(), TEMPLATE_DEFINITIONS.map(({ key }) => key).sort());
  assert.deepEqual(snapshot.notifications, { email_changed: true, password_changed: true });
  assert.doesNotMatch(snapshotText, /smtp_pass|oauth_client_secret|personal_access_token|service_role/i);
  assert.doesNotMatch(snapshotText, /SMTP_CONFIGURED_SENTINEL_DO_NOT_PRINT/);
});

test("remote GET secrets never appear in stdout or stderr", async () => {
  const scenario = await createMatchingScenario();
  const sentinels = [
    "PAT_SENTINEL_DO_NOT_PRINT",
    "SMTP_PASS_SENTINEL_DO_NOT_PRINT",
    "OAUTH_SECRET_SENTINEL_DO_NOT_PRINT",
  ];
  Object.assign(scenario.remote, {
    personal_access_token: sentinels[0],
    smtp_pass: sentinels[1],
    oauth_client_secret: sentinels[2],
  });
  const result = await runScript(["--remote"], {
    scenario,
    env: { SUPABASE_ACCESS_TOKEN: sentinels[0] },
  });

  assert.equal(result.status, 0, result.stderr);
  for (const sentinel of sentinels) {
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(sentinel));
  }
});

test("--remote requires a non-empty smtp_pass without leaking its sentinel", async () => {
  const scenario = await createMatchingScenario();
  scenario.remote.smtp_pass = "";
  scenario.remote.oauth_client_secret = "OAUTH_MISSING_PASSWORD_SENTINEL";
  const result = await runScript(["--remote"], {
    scenario,
    env: { SUPABASE_ACCESS_TOKEN: "PAT_MISSING_PASSWORD_SENTINEL" },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DIFF  SMTP 密码 — 远端字段缺失/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /(?:PAT|OAUTH)_MISSING_PASSWORD_SENTINEL/);
});

test("--sync refuses to PATCH when smtp_pass is missing", async (t) => {
  const scenario = await createMatchingScenario();
  scenario.remote.smtp_pass = "";
  const snapshotPath = await createExternalSnapshotPath(t);
  const result = await runScript(["--sync", "--snapshot", snapshotPath], {
    scenario,
    env: {
      DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
      SUPABASE_ACCESS_TOKEN: "PAT_SYNC_MISSING_PASSWORD_SENTINEL",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DIFF  SMTP 密码 — 远端字段缺失/);
  assert.match(result.stderr, /线上同步预检失败/);
  assert.equal(result.calls.some((call) => call.method === "PATCH"), false);
  await assert.rejects(readFile(snapshotPath, "utf8"), { code: "ENOENT" });
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /PAT_SYNC_MISSING_PASSWORD_SENTINEL/);
});

test("--sync preflight rejects every unexpected Auth prerequisite before snapshot or PATCH", async (t) => {
  for (const [field, invalidValue] of [
    ["external_email_enabled", false],
    ["mailer_autoconfirm", true],
    ["mailer_secure_email_change_enabled", false],
    ["smtp_host", "smtp.example.com"],
    ["smtp_port", "587"],
    ["smtp_user", "wrong@auth.dosorobotics.com"],
    ["smtp_admin_email", "wrong@auth.dosorobotics.com"],
    ["smtp_sender_name", "Wrong Sender"],
    ["smtp_max_frequency", "120"],
    ["mailer_otp_length", "6"],
    ["mailer_otp_exp", "3600"],
  ]) {
    await t.test(field, async () => {
      const scenario = await createMatchingScenario();
      scenario.remote[field] = invalidValue;
      const snapshotPath = await createExternalSnapshotPath(t);
      const result = await runScript(["--sync", "--snapshot", snapshotPath], {
        scenario,
        env: {
          DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
          SUPABASE_ACCESS_TOKEN: "pat_prerequisite_mismatch_test_only",
        },
      });

      assert.equal(result.status, 1);
      assert.match(result.stderr, /线上同步预检失败/);
      assert.equal(result.calls.some((call) => call.method === "PATCH"), false);
      await assert.rejects(readFile(snapshotPath, "utf8"), { code: "ENOENT" });
    });
  }
});

test("--sync preflight rejects a non-approved public Logo before snapshot or PATCH", async (t) => {
  const scenario = await createMatchingScenario();
  scenario.logoBase64 = Buffer.concat([
    Buffer.from(scenario.logoBase64, "base64"),
    Buffer.from("unapproved-logo"),
  ]).toString("base64");
  const snapshotPath = await createExternalSnapshotPath(t);
  const result = await runScript(["--sync", "--snapshot", snapshotPath], {
    scenario,
    env: {
      DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
      SUPABASE_ACCESS_TOKEN: "pat_logo_mismatch_test_only",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DIFF  公开 Logo — 与本地不一致/);
  assert.match(result.stderr, /线上同步预检失败/);
  assert.equal(result.calls.some((call) => call.method === "PATCH"), false);
  await assert.rejects(readFile(snapshotPath, "utf8"), { code: "ENOENT" });
});

test("--remote exits with status 1 when a hosted template differs", async () => {
  const scenario = await createMatchingScenario();
  scenario.remote.mailer_subjects_confirmation = "不同的线上主题";
  const result = await runScript(["--remote"], {
    scenario,
    env: { SUPABASE_ACCESS_TOKEN: "pat_diff_test_only" },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /DIFF  注册验证 — 主题与本地不一致/);
});

test("--remote reports unexpected auth settings without echoing their actual values", async () => {
  const scenario = await createMatchingScenario();
  Object.assign(scenario.remote, {
    mailer_autoconfirm: true,
    mailer_otp_length: "6",
    smtp_max_frequency: "120",
  });
  const result = await runScript(["--remote"], {
    scenario,
    env: { SUPABASE_ACCESS_TOKEN: "pat_auth_diff_test_only" },
  });

  assert.equal(result.status, 1);
  for (const label of ["邮箱验证", "邮件重发间隔", "验证码长度"]) {
    assert.match(result.stderr, new RegExp(`DIFF  ${label} — 不符合 DOSO 预期配置（实际值不回显）`));
  }
  assert.doesNotMatch(result.stderr, /邮箱验证[^\n]*(?:true|=\s*true)/i);
  assert.doesNotMatch(result.stderr, /邮件重发间隔[^\n]*(?:120|=\s*120)/);
  assert.doesNotMatch(result.stderr, /验证码长度[^\n]*(?:8|=\s*8)/);
});

test("BOM, CRLF, and trailing blank lines normalize to the same hosted template", async (t) => {
  const fixtureRoot = await createProjectFixture();
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const scenario = await createMatchingScenario();

  for (const definition of TEMPLATE_DEFINITIONS) {
    const path = resolve(fixtureRoot, `supabase/templates/${definition.file ?? definition.key}.html`);
    const original = await readFile(path, "utf8");
    await writeFile(path, `\uFEFF${normalizeContent(original).replace(/\n/g, "\r\n")}\r\n\r\n`, "utf8");
  }

  const result = await runScript(["--remote"], {
    scriptPath: resolve(fixtureRoot, "scripts/manage-auth-email-templates.mjs"),
    scenario,
    env: { SUPABASE_ACCESS_TOKEN: "pat_normalization_test_only" },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS  远端校验/);
});

test("--sync without DOSO_SUPABASE_PROJECT_REF fails before any fetch", async (t) => {
  const scenario = await createMatchingScenario();
  const snapshotPath = await createExternalSnapshotPath(t);
  const result = await runScript(["--sync", "--snapshot", snapshotPath], {
    scenario,
    env: { SUPABASE_ACCESS_TOKEN: "pat_no_ref_test_only" },
    unsetEnv: ["DOSO_SUPABASE_PROJECT_REF"],
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /写操作要求显式设置 DOSO_SUPABASE_PROJECT_REF/);
  assert.deepEqual(result.calls, []);
});

test("--sync rejects unsafe snapshot paths before GET or PATCH", async (t) => {
  const scenario = await createMatchingScenario();
  const environment = {
    DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
    SUPABASE_ACCESS_TOKEN: "pat_unsafe_snapshot_test_only",
  };

  await t.test("relative path", async () => {
    const result = await runScript(["--sync", "--snapshot", "relative-snapshot.json"], {
      scenario,
      env: environment,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /快照路径必须是显式绝对路径/);
    assert.equal(result.calls.some((call) => call.method === "PATCH"), false);
  });

  await t.test("repository path", async () => {
    const result = await runScript(["--sync", "--snapshot", resolve(PROJECT_ROOT, "unsafe-snapshot.json")], {
      scenario,
      env: environment,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /快照路径不得位于仓库内/);
    assert.equal(result.calls.some((call) => call.method === "PATCH"), false);
  });

  await t.test("parent worktree path outside doso-app", async () => {
    const result = await runScript(
      ["--sync", "--snapshot", resolve(PROJECT_ROOT, "..", "unsafe-parent-snapshot.json")],
      { scenario, env: environment },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /快照路径不得位于仓库内/);
    assert.equal(result.calls.some((call) => call.method === "PATCH"), false);
  });

  await t.test("existing file", async () => {
    const snapshotPath = await createExternalSnapshotPath(t);
    await writeFile(snapshotPath, "do-not-overwrite", "utf8");
    const result = await runScript(["--sync", "--snapshot", snapshotPath], {
      scenario,
      env: environment,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /快照文件已存在/);
    assert.equal(result.calls.some((call) => call.method === "PATCH"), false);
    assert.equal(await readFile(snapshotPath, "utf8"), "do-not-overwrite");
  });
});

test("sync failure can be rolled back from the allow-listed snapshot with exact readback", async (t) => {
  const scenario = await createMatchingScenario();
  const originalValues = Object.fromEntries(
    TEMPLATE_DEFINITIONS.flatMap((definition) => [
      [definition.subjectField, `原主题-${definition.key}`],
      [definition.contentField, `原 HTML-${definition.key}`],
      ...(definition.enabledField ? [[definition.enabledField, true]] : []),
    ]),
  );
  Object.assign(scenario.remote, originalValues);
  scenario.tamperAfterPatchCount = 1;
  const snapshotPath = await createExternalSnapshotPath(t);
  const environment = {
    DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
    SUPABASE_ACCESS_TOKEN: "PAT_ROUNDTRIP_SENTINEL_DO_NOT_PRINT",
  };

  const sync = await runScript(["--sync", "--snapshot", snapshotPath], { scenario, env: environment });
  assert.equal(sync.status, 1);
  assert.match(sync.stderr, /同步后回读仍不一致/);

  scenario.tamperAfterPatchCount = 0;
  const rollback = await runScript(["--rollback", snapshotPath], { scenario, env: environment });
  assert.equal(rollback.status, 0, rollback.stderr);
  assert.match(rollback.stdout, /PASS  回滚校验/);
  assert.deepEqual(
    Object.fromEntries(Object.entries(scenario.remote).filter(([key]) => templateFieldNames().includes(key))),
    originalValues,
  );
  const rollbackPatch = rollback.calls.find((call) => call.method === "PATCH");
  assert.deepEqual(Object.keys(rollbackPatch.body).sort(), templateFieldNames().sort());
  assert.doesNotMatch(`${sync.stdout}\n${sync.stderr}\n${rollback.stdout}\n${rollback.stderr}`, /PAT_ROUNDTRIP_SENTINEL_DO_NOT_PRINT/);
});

test("a strict v1 snapshot rolls back only the legacy six fields", async (t) => {
  const scenario = await createMatchingScenario();
  const legacyValues = Object.fromEntries(
    LEGACY_TEMPLATE_DEFINITIONS.flatMap((definition) => [
      [definition.subjectField, `v1主题-${definition.key}`],
      [definition.contentField, `v1 HTML-${definition.key}`],
    ]),
  );
  const core = {
    schema_version: 1,
    project_ref: PROJECT_REF,
    created_at_utc: new Date().toISOString(),
    subjects: Object.fromEntries(LEGACY_TEMPLATE_DEFINITIONS.map((definition) => [
      definition.key,
      legacyValues[definition.subjectField],
    ])),
    html: Object.fromEntries(LEGACY_TEMPLATE_DEFINITIONS.map((definition) => [
      definition.key,
      legacyValues[definition.contentField],
    ])),
  };
  const snapshotPath = await createExternalSnapshotPath(t);
  await writeFile(snapshotPath, `${JSON.stringify({
    ...core,
    snapshot_sha256: createHash("sha256").update(JSON.stringify(core), "utf8").digest("hex"),
  }, null, 2)}\n`, "utf8");
  const nonLegacyBefore = Object.fromEntries(
    Object.entries(scenario.remote).filter(([key]) => templateFieldNames().includes(key) && !legacyTemplateFieldNames().includes(key)),
  );

  const result = await runScript(["--rollback", snapshotPath], {
    scenario,
    env: {
      DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
      SUPABASE_ACCESS_TOKEN: "pat_v1_rollback_test_only",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const patch = result.calls.find((call) => call.method === "PATCH");
  assert.deepEqual(Object.keys(patch.body).sort(), legacyTemplateFieldNames().sort());
  assert.deepEqual(patch.body, legacyValues);
  assert.deepEqual(
    Object.fromEntries(Object.entries(scenario.remote).filter(([key]) => key in nonLegacyBefore)),
    nonLegacyBefore,
  );
});

test("notification enabled flags are booleans in PATCH and must read back true", async (t) => {
  const scenario = await createMatchingScenario();
  scenario.remote.mailer_notifications_password_changed_enabled = false;
  const remote = await runScript(["--remote"], {
    scenario,
    env: { SUPABASE_ACCESS_TOKEN: "pat_notification_flag_test_only" },
  });
  assert.equal(remote.status, 1);
  assert.match(remote.stderr, /安全通知开关未启用/);

  const snapshotPath = await createExternalSnapshotPath(t);
  const sync = await runScript(["--sync", "--snapshot", snapshotPath], {
    scenario,
    env: {
      DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
      SUPABASE_ACCESS_TOKEN: "pat_notification_sync_test_only",
    },
  });
  assert.equal(sync.status, 0, sync.stderr);
  const patch = sync.calls.find((call) => call.method === "PATCH");
  assert.equal(patch.body.mailer_notifications_password_changed_enabled, true);
  assert.equal(typeof patch.body.mailer_notifications_password_changed_enabled, "boolean");
});

test("local validation enforces exact Go-template allowlists and hosted image assets", async (t) => {
  const cases = [
    ["unknown variable", "confirmation", (html) => html.replace("{{ .Token }}", "{{ .Unknown }}"), /模板变量仅允许/],
    ["duplicate token", "confirmation", (html) => html.replace("{{ .Token }}", "{{ .Token }} {{ .Token }}"), /仅包含一个/],
    ["unsupported Go-template action", "confirmation", (html) => html.replace("{{ .Token }}", "{{ if .Unknown }}{{ .Token }}{{ end }}"), /所有 Go 模板块/],
    ["credential link", "recovery", (html) => html.replace("</body>", '<a href="https://example.com">x</a></body>'), /不含 <a> 标签/],
    ["embedded image", "confirmation", (html) => html.replace("https://vchvqfdlkomlrjenkdhj.supabase.co/storage/v1/object/public/email-assets/doso-robotics-wordmark-email-29dea10fd204.png", "data:image/png;base64,AAAA"), /不含嵌入式图片资源/],
    ["relative image", "confirmation", (html) => html.replace("https://vchvqfdlkomlrjenkdhj.supabase.co/storage/v1/object/public/email-assets/doso-robotics-wordmark-email-29dea10fd204.png", "./logo.png"), /版本化 HTTPS URL/],
    ["third-party image", "confirmation", (html) => html.replace("https://vchvqfdlkomlrjenkdhj.supabase.co/storage/v1/object/public/email-assets/doso-robotics-wordmark-email-29dea10fd204.png", "https://example.com/logo.png"), /DOSO 批准的版本化 HTTPS URL/],
    ["alternate image source", "confirmation", (html) => html.replace("<img ", '<img srcset="https://example.com/logo.png 2x" '), /不含备用图片源/],
    ["lazy source without src", "confirmation", (html) => html.replace(/\bsrc=/g, "data-src="), /每个 <img>.*唯一.*src/],
    ["duplicate src", "confirmation", (html) => html.replace("<img ", '<img src="https://example.com/logo.png" '), /每个 <img>.*唯一.*src/],
    ["unquoted src", "confirmation", (html) => html.replace(/\bsrc="([^"]+)"/g, "src=$1"), /每个 <img>.*唯一.*src/],
    ["source text inside alt", "confirmation", (html) => html.replace(/\bsrc="([^"]+)"/g, 'alt=" src=\'$1\'"'), /每个 <img>.*唯一.*src/],
    ["missing NewEmail", "email_change", (html) => html.replace("{{ .NewEmail }}", "new@example.com"), /NewEmail/],
    ["missing Email", "password_changed_notification", (html) => html.replace("{{ .Email }}", "account@example.com"), /Email/],
    ["missing OldEmail", "email_changed_notification", (html) => html.replace("{{ .OldEmail }}", "old@example.com"), /OldEmail/],
  ];

  for (const [label, file, mutate, expected] of cases) {
    await t.test(label, async () => {
      const fixtureRoot = await createProjectFixture();
      t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
      const templatePath = resolve(fixtureRoot, `supabase/templates/${file}.html`);
      await writeFile(templatePath, mutate(await readFile(templatePath, "utf8")), "utf8");
      const result = await runScript([], {
        scriptPath: resolve(fixtureRoot, "scripts/manage-auth-email-templates.mjs"),
        mockFetch: false,
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, expected);
      assert.deepEqual(result.calls, []);
    });
  }
});

test("--rollback rejects wrong ref, schema, hash, and tampering before PATCH", async (t) => {
  const scenario = await createMatchingScenario();
  const snapshotPath = await createExternalSnapshotPath(t);
  const environment = {
    DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
    SUPABASE_ACCESS_TOKEN: "pat_invalid_rollback_test_only",
  };
  const sync = await runScript(["--sync", "--snapshot", snapshotPath], { scenario, env: environment });
  assert.equal(sync.status, 0, sync.stderr);
  const pristine = JSON.parse(await readFile(snapshotPath, "utf8"));

  const cases = [
    ["wrong project ref", { ...pristine, project_ref: OTHER_PROJECT_REF }, /project ref 与显式目标不一致/],
    ["wrong schema", { ...pristine, schema_version: 3 }, /schema 版本无效/],
    ["wrong hash", { ...pristine, snapshot_sha256: "0".repeat(64) }, /SHA-256 校验失败/],
    [
      "tampered HTML",
      { ...pristine, html: { ...pristine.html, recovery: `${pristine.html.recovery}tampered` } },
      /SHA-256 校验失败/,
    ],
    [
      "notification flag is not boolean",
      withSnapshotHash({
        ...pristine,
        notifications: { ...pristine.notifications, password_changed: "true" },
      }),
      /必须是布尔值/,
    ],
  ];

  for (const [label, value, expectedError] of cases) {
    await t.test(label, async () => {
      const invalidPath = await createExternalSnapshotPath(t);
      await writeFile(invalidPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      const result = await runScript(["--rollback", invalidPath], { scenario, env: environment });
      assert.equal(result.status, 1);
      assert.match(result.stderr, expectedError);
      assert.equal(result.calls.some((call) => call.method === "PATCH"), false);
    });
  }
});

test("--rollback rejects a relative snapshot path before any request", async () => {
  const scenario = await createMatchingScenario();
  const result = await runScript(["--rollback", "relative-snapshot.json"], {
    scenario,
    env: {
      DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
      SUPABASE_ACCESS_TOKEN: "pat_relative_rollback_test_only",
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /快照路径必须是显式绝对路径/);
  assert.deepEqual(result.calls, []);
});

test("--rollback is independent of local templates, Logo, and smtp_pass and performs only PATCH then GET", async (t) => {
  const scenario = await createMatchingScenario();
  const snapshotPath = await createExternalSnapshotPath(t);
  const environment = {
    DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
    SUPABASE_ACCESS_TOKEN: "PAT_EMERGENCY_ROLLBACK_SENTINEL_DO_NOT_PRINT",
  };
  const sync = await runScript(["--sync", "--snapshot", snapshotPath], { scenario, env: environment });
  assert.equal(sync.status, 0, sync.stderr);

  for (const field of templateFieldNames()) scenario.remote[field] = `drift-${field}`;
  scenario.remote.smtp_pass = "";
  const fixtureRoot = await createProjectFixture({ insideWorktree: true });
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  await writeFile(resolve(fixtureRoot, "supabase/config.toml"), "invalid local config", "utf8");
  await writeFile(resolve(fixtureRoot, "supabase/templates/confirmation.html"), "invalid local template", "utf8");
  await rm(resolve(fixtureRoot, "assets/brand/doso-robotics-wordmark-email-29dea10fd204.png"), { force: true });

  const rollback = await runScript(["--rollback", snapshotPath], {
    scriptPath: resolve(fixtureRoot, "scripts/manage-auth-email-templates.mjs"),
    scenario,
    env: environment,
  });
  assert.equal(rollback.status, 0, rollback.stderr);
  assert.deepEqual(rollback.calls.map((call) => call.method), ["PATCH", "GET"]);
  assert.equal(rollback.calls.some((call) => call.url.includes("doso-robotics-wordmark-email-29dea10fd204.png")), false);
  assert.doesNotMatch(rollback.stdout, /本地校验|本地 Logo|SMTP 密码/);
  assert.doesNotMatch(`${rollback.stdout}\n${rollback.stderr}`, /PAT_EMERGENCY_ROLLBACK_SENTINEL_DO_NOT_PRINT/);
});

test("write operations fail closed when the real Git worktree root cannot be determined", async (t) => {
  const scenario = await createMatchingScenario();
  const fixtureRoot = await createProjectFixture();
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const snapshotPath = await createExternalSnapshotPath(t);
  const result = await runScript(["--sync", "--snapshot", snapshotPath], {
    scriptPath: resolve(fixtureRoot, "scripts/manage-auth-email-templates.mjs"),
    scenario,
    env: {
      DOSO_SUPABASE_PROJECT_REF: PROJECT_REF,
      SUPABASE_ACCESS_TOKEN: "pat_no_git_root_test_only",
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /无法确定真实 Git worktree root；写操作已拒绝/);
  assert.equal(result.calls.some((call) => call.method === "PATCH"), false);
});

test("public Logo mock is accepted only with image/png and matching length and hash", async () => {
  const scenario = await createMatchingScenario();
  const logo = Buffer.from(scenario.logoBase64, "base64");
  const hash = createHash("sha256").update(logo).digest("hex");
  const result = await runScript(["--remote"], {
    scenario: { ...scenario, logoContentType: "image/png" },
    env: { SUPABASE_ACCESS_TOKEN: "pat_logo_test_only" },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    new RegExp(`PASS  公开 Logo — HTTP 200 · image/png · ${logo.length} 字节 · SHA-256 ${hash.slice(0, 12)}`),
  );
});

test("--logo validates only the approved public Logo without a Management API token", async () => {
  const scenario = await createMatchingScenario();
  const result = await runScript(["--logo"], {
    scenario,
    unsetEnv: ["SUPABASE_ACCESS_TOKEN", "DOSO_SUPABASE_PROJECT_REF"],
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [{
    url: "https://vchvqfdlkomlrjenkdhj.supabase.co/storage/v1/object/public/email-assets/doso-robotics-wordmark-email-29dea10fd204.png",
    method: "GET",
  }]);
  assert.match(result.stdout, /PASS  本地 Logo/);
  assert.match(result.stdout, /PASS  公开 Logo/);
  assert.doesNotMatch(result.stdout, /线上注册验证|SMTP 密码|远端校验/);
});

test("--help says the Logo-only check is not hosted Auth template acceptance", () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--help"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--logo/);
  assert.match(result.stdout, /不是云端 Auth 模板验收/);
});

test("--logo is mutually exclusive with remote, write, rollback, and snapshot modes before any request", async (t) => {
  const snapshotPath = await createExternalSnapshotPath(t);
  const cleanEnvironment = { ...process.env };
  delete cleanEnvironment.SUPABASE_ACCESS_TOKEN;
  delete cleanEnvironment.DOSO_SUPABASE_PROJECT_REF;
  const fetchBlocker = 'data:text/javascript,globalThis.fetch=async()=>{throw new Error("UNEXPECTED_FETCH")}';
  const cases = [
    ["--logo", "--remote"],
    ["--logo", "--sync", "--snapshot", snapshotPath],
    ["--logo", "--rollback", snapshotPath],
    ["--logo", "--snapshot", snapshotPath],
  ];

  for (const args of cases) {
    const result = spawnSync(process.execPath, ["--import", fetchBlocker, SCRIPT_PATH, ...args], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      env: cleanEnvironment,
    });
    assert.equal(result.status, 1, `${args.join(" ")} must fail`);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /UNEXPECTED_FETCH/);
  }
  await assert.rejects(readFile(snapshotPath), { code: "ENOENT" });
});

test("--remote without a token still fails before any request", async () => {
  const result = await runScript(["--remote"], {
    scenario: await createMatchingScenario(),
    unsetEnv: ["SUPABASE_ACCESS_TOKEN"],
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /远端操作需要 SUPABASE_ACCESS_TOKEN/);
  assert.deepEqual(result.calls, []);
});

test("--logo refuses redirects away from the fixed approved public Logo URL", async () => {
  const logo = await readFile(LOGO_PATH);
  let redirectOption;
  const result = await runScript(["--logo"], {
    unsetEnv: ["SUPABASE_ACCESS_TOKEN", "DOSO_SUPABASE_PROJECT_REF"],
    fetch: async (_url, init) => {
      redirectOption = init.redirect;
      return new Response(logo, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(logo.length) },
      });
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(redirectOption, "error");
});

test("public Logo verification rejects an invalid response", async (t) => {
  await t.test("rejects a missing public object", async () => {
    const result = await runScript(["--logo"], {
      unsetEnv: ["SUPABASE_ACCESS_TOKEN", "DOSO_SUPABASE_PROJECT_REF"],
      fetch: async () => new Response(null, { status: 404, statusText: "Not Found" }),
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /公开 Logo 返回 HTTP 404 Not Found/);
    assert.equal(result.calls.length, 1);
  });

  await t.test("rejects a non-PNG Content-Type", async () => {
    const scenario = await createMatchingScenario();
    scenario.logoContentType = "image/jpeg";
    const result = await runScript(["--logo"], {
      scenario,
      unsetEnv: ["SUPABASE_ACCESS_TOKEN", "DOSO_SUPABASE_PROJECT_REF"],
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /公开 Logo Content-Type 应为 image\/png，实际为 image\/jpeg/);
  });

  await t.test("rejects PNG bytes whose length and hash differ from the local Logo", async () => {
    const scenario = await createMatchingScenario();
    const tamperedLogo = Buffer.concat([
      Buffer.from(scenario.logoBase64, "base64"),
      Buffer.from("tampered-logo"),
    ]);
    scenario.logoBase64 = tamperedLogo.toString("base64");
    const result = await runScript(["--logo"], {
      scenario,
      unsetEnv: ["SUPABASE_ACCESS_TOKEN", "DOSO_SUPABASE_PROJECT_REF"],
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /DIFF  公开 Logo — 与本地不一致/);
  });
});

test("public Logo streaming stops and cancels as soon as an undeclared body exceeds 256 KiB", async () => {
  const chunks = [
    Buffer.alloc(128 * 1024),
    Buffer.alloc(128 * 1024),
    Buffer.alloc(1),
    Buffer.from("must-not-be-read"),
  ];
  let readCount = 0;
  let cancelled = false;
  const result = await runScript(["--logo"], {
    unsetEnv: ["SUPABASE_ACCESS_TOKEN", "DOSO_SUPABASE_PROJECT_REF"],
    fetch: async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "image/png" }),
      body: {
        getReader() {
          return {
            async read() {
              const value = chunks[readCount];
              readCount += 1;
              return value ? { done: false, value } : { done: true, value: undefined };
            },
            async cancel() {
              cancelled = true;
            },
          };
        },
      },
      async arrayBuffer() {
        return Buffer.concat(chunks);
      },
    }),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /超过 256 KiB/);
  assert.equal(cancelled, true);
  assert.equal(readCount, 3, "the chunk after the limit must not be read");
});

test("public Logo streaming ignores a forged undersized Content-Length and stops at the real byte limit", async () => {
  const chunks = [Buffer.alloc(256 * 1024), Buffer.alloc(1), Buffer.from("must-not-be-read")];
  let readCount = 0;
  let cancelled = false;
  const result = await runScript(["--logo"], {
    unsetEnv: ["SUPABASE_ACCESS_TOKEN", "DOSO_SUPABASE_PROJECT_REF"],
    fetch: async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "image/png", "content-length": "1" }),
      body: {
        getReader() {
          return {
            async read() {
              const value = chunks[readCount];
              readCount += 1;
              return value ? { done: false, value } : { done: true, value: undefined };
            },
            async cancel() {
              cancelled = true;
            },
          };
        },
      },
    }),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /超过 256 KiB/);
  assert.equal(cancelled, true);
  assert.equal(readCount, 2, "the chunk after the real limit must not be read");
});

test("public Logo rejects a declared oversized body before reading any chunk", async () => {
  let readCount = 0;
  let cancelled = false;
  const result = await runScript(["--logo"], {
    unsetEnv: ["SUPABASE_ACCESS_TOKEN", "DOSO_SUPABASE_PROJECT_REF"],
    fetch: async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({
        "content-type": "image/png",
        "content-length": String(256 * 1024 + 1),
      }),
      body: {
        async cancel() {
          cancelled = true;
        },
        getReader() {
          return {
            async read() {
              readCount += 1;
              return { done: true, value: undefined };
            },
          };
        },
      },
    }),
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /超过 256 KiB/);
  assert.equal(cancelled, true);
  assert.equal(readCount, 0);
});

async function createMatchingScenario() {
  const remote = { ...AUTH_SETTINGS };
  for (const definition of TEMPLATE_DEFINITIONS) {
    const content = await readFile(
      resolve(PROJECT_ROOT, `supabase/templates/${definition.file ?? definition.key}.html`),
      "utf8",
    );
    remote[definition.subjectField] = definition.subject;
    remote[definition.contentField] = normalizeContent(content);
    if (definition.enabledField) remote[definition.enabledField] = true;
  }

  return {
    remote,
    logoBase64: (await readFile(LOGO_PATH)).toString("base64"),
    logoContentType: "image/png",
  };
}

async function runScript(args, options = {}) {
  const scriptPath = options.scriptPath ?? SCRIPT_PATH;
  const calls = [];
  const stdout = [];
  const stderr = [];
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalError = console.error;
  const changedEnvironment = new Map();
  const environmentNames = new Set([
    ...Object.keys(options.env ?? {}),
    ...(options.unsetEnv ?? []),
  ]);

  for (const name of environmentNames) {
    changedEnvironment.set(name, process.env[name]);
  }

  try {
    process.argv = [process.execPath, scriptPath, ...args];
    process.exitCode = undefined;
    Object.assign(process.env, options.env ?? {});
    for (const name of options.unsetEnv ?? []) delete process.env[name];
    console.log = (...values) => stdout.push(values.map(String).join(" "));
    console.error = (...values) => stderr.push(values.map(String).join(" "));
    if (options.fetch) {
      globalThis.fetch = async (url, init = {}) => {
        const method = init.method ?? "GET";
        const call = { url: String(url), method };
        if (init.body) call.body = JSON.parse(init.body);
        calls.push(call);
        return options.fetch(url, init);
      };
    } else if (options.mockFetch !== false) {
      globalThis.fetch = createMockFetch(options.scenario, calls);
    }

    await import(`${pathToFileURL(scriptPath).href}?test=${Date.now()}-${Math.random()}`);
    return {
      status: process.exitCode ?? 0,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
      calls,
    };
  } finally {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.error = originalError;
    for (const [name, value] of changedEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function createMockFetch(scenario, calls) {
  return async (url, init = {}) => {
    const method = init.method ?? "GET";
    const call = { url: String(url), method };
    if (init.body) call.body = JSON.parse(init.body);
    calls.push(call);

    if (String(url).includes("api.supabase.com")) {
      if (method === "PATCH") {
        scenario.patchCount = (scenario.patchCount ?? 0) + 1;
        Object.assign(scenario.remote, call.body);
        if (scenario.tamperAfterPatchCount === scenario.patchCount) {
          scenario.remote.mailer_subjects_confirmation = "故障注入：PATCH 后回读差异";
        }
        return new Response(null, { status: 200 });
      }
      return new Response(JSON.stringify(scenario.remote), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (String(url).includes("doso-robotics-wordmark-email-29dea10fd204.png")) {
      const bytes = Buffer.from(scenario.logoBase64, "base64");
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type": scenario.logoContentType ?? "image/png",
          "content-length": String(bytes.length),
        },
      });
    }

    throw new Error(`unexpected fetch URL: ${url}`);
  };
}

async function createExternalSnapshotPath(t) {
  const root = await mkdtemp(join(tmpdir(), "doso-email-snapshot-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return resolve(root, `snapshot-${Date.now()}-${Math.random()}.json`);
}

function templateFieldNames() {
  return TEMPLATE_DEFINITIONS.flatMap((definition) => [
    definition.subjectField,
    definition.contentField,
    ...(definition.enabledField ? [definition.enabledField] : []),
  ]);
}

function legacyTemplateFieldNames() {
  return LEGACY_TEMPLATE_DEFINITIONS.flatMap((definition) => [definition.subjectField, definition.contentField]);
}

function withSnapshotHash(snapshot) {
  const { snapshot_sha256: _ignored, ...core } = snapshot;
  return {
    ...core,
    snapshot_sha256: createHash("sha256").update(JSON.stringify(core), "utf8").digest("hex"),
  };
}

async function createProjectFixture(options = {}) {
  const root = options.insideWorktree
    ? await mkdtemp(resolve(PROJECT_ROOT, ".doso-email-fixture-"))
    : await mkdtemp(join(tmpdir(), "doso-email-fixture-"));
  const copies = [
    ["scripts/manage-auth-email-templates.mjs", "scripts/manage-auth-email-templates.mjs"],
    ["scripts/build-email-template-suite.mjs", "scripts/build-email-template-suite.mjs"],
    ["supabase/config.toml", "supabase/config.toml"],
    ["supabase/functions/_shared/generatedAccountEmailTemplates.ts", "supabase/functions/_shared/generatedAccountEmailTemplates.ts"],
    ["assets/brand/doso-robotics-wordmark-email-29dea10fd204.png", "assets/brand/doso-robotics-wordmark-email-29dea10fd204.png"],
    ...TEMPLATE_DEFINITIONS.map((definition) => [
      `supabase/templates/${definition.file ?? definition.key}.html`,
      `supabase/templates/${definition.file ?? definition.key}.html`,
    ]),
    ...[
      "custom/README.md",
      "custom/anomalous_login.html",
      "custom/new_device_login.html",
      "custom/account_deletion_confirmation.html",
      "custom/account_deleted.html",
    ].map((path) => [`supabase/templates/${path}`, `supabase/templates/${path}`]),
  ];
  for (const [source, destination] of copies) {
    const target = resolve(root, destination);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(PROJECT_ROOT, source), target);
  }
  return root;
}

function normalizeContent(content) {
  return content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trimEnd() + "\n";
}
