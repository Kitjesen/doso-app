import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const output = path.resolve(process.argv[3] || 'artifacts/design-acceptance/20260908-register-redesign-web');
mkdirSync(output, { recursive: true });
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser = await chromium.launch({ executablePath, headless: true });
const results = [];
const url = state => 'http://127.0.0.1:8085/?design-qa=1&qa-stage=auth-register&qa-state=' + state;
try {
  const context = await browser.newContext();
  // Local UI verification must never contact a real account/provider service.
  await context.route('**/*', route => {
    const requested = new URL(route.request().url());
    return requested.hostname === '127.0.0.1' || requested.hostname === 'localhost' ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  for (const [mode, width, height, colorScheme] of [
    ['light', 390, 844, 'light'], ['dark', 390, 844, 'dark'],
    ['landscape', 844, 390, 'light'], ['small', 320, 568, 'light'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme });
    await page.goto(url('default'), { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.getByTestId('register-submit').waitFor({ timeout: 180000 });
    await page.evaluate(() => document.fonts.ready);
    const fields = await page.locator('input').all();
    assert.equal(fields.length, 3);
    for (const field of fields) {
      const rect = await field.boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width + 1, mode + ': input fits horizontally');
      assert.ok(rect.height >= 44, mode + ': input touch height');
    }
    const submit = await page.getByTestId('register-submit').boundingBox();
    if (mode !== 'small') assert.ok(submit.y >= 0 && submit.y + submit.height <= height, mode + ': main action visible on first screen');
    const intro = await page.getByTestId('register-intro').boundingBox();
    const form = await page.getByTestId('register-form').boundingBox();
    if (mode === 'landscape') assert.ok(intro.x + intro.width + 24 <= form.x, 'landscape has separate non-overlapping columns');
    for (const id of ['apple', 'wechat', 'qq']) assert.equal(await page.getByTestId('register-social-' + id).getAttribute('aria-disabled'), 'true');
    await page.screenshot({ path: path.join(output, 'app-' + mode + '.png') });
    results.push({ mode, status: 'PASS', inputCount: fields.length, submit, intro, form });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url('default'));
  await page.getByTestId('register-submit').click();
  await page.getByText('请输入邮箱地址', { exact: true }).waitFor();
  assert.equal(await page.getByTestId('register-username').evaluate(element => document.activeElement === element), true);
  await page.screenshot({ path: path.join(output, 'app-validation-error.png') });
  await page.getByTestId('register-username').fill('explorer_01');
  await page.getByTestId('register-username').press('Enter');
  assert.equal(await page.getByTestId('register-email').evaluate(element => document.activeElement === element), true);
  await page.getByTestId('register-email').fill('design.qa@example.invalid');
  await page.getByTestId('register-email').press('Enter');
  assert.equal(await page.getByTestId('register-password').evaluate(element => document.activeElement === element), true);
  await page.getByTestId('register-password').fill('StrongPass123');
  assert.equal(await page.getByTestId('register-password').getAttribute('type'), 'password');
  await page.getByTestId('register-password-visibility').click();
  assert.equal(await page.getByTestId('register-password').evaluate(element => element.type), 'text');
  await page.getByTestId('register-password-visibility').click();
  await page.getByTestId('register-submit').click();
  await page.screenshot({ path: path.join(output, 'app-filled.png') });
  results.push({ state: 'local-validation-focus-visibility', status: 'PASS', backend: 'QA no-op, no real signup' });
  for (const state of ['error', 'loading']) {
    await page.goto(url(state));
    await page.getByTestId('register-submit').waitFor();
    if (state === 'loading') {
      assert.equal(await page.getByTestId('register-submit').getAttribute('aria-disabled'), 'true');
      assert.equal(await page.getByTestId('register-login').getAttribute('aria-disabled'), 'true');
      for (const field of await page.locator('input').all()) assert.equal(await field.isEditable(), false);
    } else await page.getByText('设计验收示例错误：当前操作未连接真实服务。', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'app-' + state + '.png') });
    results.push({ state, status: 'PASS' });
  }
  assert.deepEqual(runtimeErrors, [], 'no browser runtime exception');
  writeFileSync(path.join(output, 'browser-verification.json'), JSON.stringify({ source: 'development-web-design-qa', results, runtimeErrors }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
