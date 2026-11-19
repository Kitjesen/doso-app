// DOM interaction checks execute generated page scripts with synthetic reports.
// LinkeDOM provides the DOM. Clipboard, focus and selection are controlled host APIs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { renderDashboard } from './run.mjs';

const template = await readFile(new URL('./dashboard.html', import.meta.url), 'utf8');
const STAMP = '2026-11-03T00:00:03.000Z';
const checks = [
  ['app-maps', 'App 地图目录与入口', 17, 'tests'],
  ['postgres-maps', '地图数据库权限与事务', 5, 'groups'],
  ['edge-handler', '地图业务 API', 16, 'tests'],
  ['oss-sdk', '官方 OSS SDK 签名', 2, 'tests'],
  ['typescript', 'App TypeScript'],
  ['edge-types', '地图 Edge 入口类型'],
  ['remote-app', 'App 远程状态', 20, 'tests'],
  ['postgres-remote', '远程状态数据库权限与许可', 6, 'groups'],
  ['remote-handler', '远程状态业务与同步接口', 22, 'tests'],
].map(([id, label, count, countUnit]) => ({
  id, label, count, countUnit, status: 'passed', source: 'executed', scope: '合成报告夹具，仅用于 DOM 测试',
  command: `node synthetic-${id}.mjs`, workdir: 'C:/synthetic/doso-app', startedAt: '2026-11-03T00:00:00.000Z',
  finishedAt: STAMP, durationMs: 3000, exitCode: 0, logPath: `logs/${id}.log`, details: ['synthetic fixture only'],
}));
const fixture = (patch = {}) => ({
  schemaVersion: 1, runId: 'synthetic-dashboard-fixture', mode: 'local', generatedAt: STAMP,
  startedAt: '2026-11-03T00:00:00.000Z', finishedAt: STAMP, artifactDirectory: 'C:/synthetic/artifacts',
  boundaries: ['合成报告仅供 DOM 交互测试，不代表真实执行结果。'],
  checks: [...checks, {
    id: 'rust-reporting', label: 'Rust 历史证据夹具', source: 'imported', status: 'passed',
    count: 30, countUnit: 'reported unit tests', workdir: 'D:/synthetic/robot-cloud', command: '',
    evidence: { path: 'D:/synthetic/reporting-result.json', modifiedAt: '2026-11-02T10:00:00.000Z' },
    details: ['历史只读导入，本次未执行 Rust 检查。', '8 项模拟实验结果，合成报告夹具。'],
  }], ...patch,
});

function mount(report = fixture()) {
  const html = renderDashboard(template, report);
  const { document, window } = parseHTML(html);
  const networkAttempts = [];
  const host = { focused: null, selected: null };
  // LinkeDOM has no browser focus or text selection implementation.
  window.HTMLElement.prototype.focus = function () { host.focused = this; };
  window.HTMLTextAreaElement.prototype.select = function () { host.selected = this.value; };
  const denyNetwork = (...args) => { networkAttempts.push(args); throw new Error('Network is disabled in DOM tests.'); };
  const context = vm.createContext({
    document, navigator: { clipboard: { writeText: async () => { throw new Error('Synthetic clipboard denial.'); } } },
    fetch: denyNetwork, XMLHttpRequest: denyNetwork, WebSocket: denyNetwork,
    Intl, Date, console,
  });
  const scripts = [...document.querySelectorAll('script')].filter(script => script.getAttribute('type') !== 'application/json');
  assert.equal(scripts.length, 1);
  new vm.Script(scripts[0].textContent, { filename: 'generated-dashboard-inline.js' }).runInContext(context);
  const click = selector => {
    const node = document.querySelector(selector);
    assert.ok(node, `Missing interaction target ${selector}`);
    node.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
    return node;
  };
  const key = (selector, value) => {
    const event = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', { value });
    document.querySelector(selector).dispatchEvent(event);
  };
  return { document, html, context, networkAttempts, host, click, key };
}

test('generated tabs respond to click and keyboard with correct panels and focus targets', () => {
  const page = mount();
  assert.equal(page.document.querySelector('#panel-overview').hidden, false);
  page.click('#tab-tests');
  assert.equal(page.document.querySelector('#tab-tests').getAttribute('aria-selected'), 'true');
  assert.equal(page.document.querySelector('#panel-overview').hidden, true);
  assert.equal(page.document.querySelector('#panel-tests').hidden, false);
  page.key('#tab-tests', 'ArrowRight');
  assert.equal(page.document.querySelector('#panel-engineering').hidden, false);
  assert.equal(page.host.focused.id, 'tab-engineering');
  page.key('#tab-engineering', 'Home');
  // LinkeDOM 0.18.12 reads tabIndex=0 as -1, while the reflected DOM attribute is correct.
  assert.equal(page.document.querySelector('#tab-overview').getAttribute('tabindex'), '0');
  page.key('#tab-overview', 'End');
  assert.equal(page.document.querySelector('#tab-engineering').getAttribute('aria-selected'), 'true');
  assert.equal(page.document.querySelector('#panel-tests').hidden, true);
});

test('map and status selectors rebuild real stage buttons and display selected capability boundaries', () => {
  const page = mount();
  assert.equal(page.document.querySelectorAll('[data-stage]').length, 6);
  page.click('#map-import');
  assert.equal(page.document.querySelector('#map-import').getAttribute('aria-pressed'), 'true');
  assert.match(page.document.querySelector('#stage-detail').textContent, /SHA-256/);
  assert.match(page.document.querySelector('#stage-detail').textContent, /执行器|尚待完成/);
  page.click('#flow-status');
  assert.equal(page.document.querySelector('#flow-map').getAttribute('aria-pressed'), 'false');
  assert.equal(page.document.querySelector('#flow-status').getAttribute('aria-pressed'), 'true');
  assert.equal(page.document.querySelector('#map-import'), null);
  page.click('#status-report');
  assert.match(page.document.querySelector('#stage-detail').textContent, /模拟 Brainstem/);
  assert.match(page.document.querySelector('#stage-detail').textContent, /本轮运行未重跑|导入/);
  page.click('#flow-map');
  assert.equal(page.document.querySelector('#map-catalog').getAttribute('aria-pressed'), 'true');
});

test('executed and imported checks keep separate results, commands, counts and local logs', () => {
  const page = mount();
  assert.equal(page.document.querySelectorAll('#executed-checks details').length, 9);
  assert.equal(page.document.querySelectorAll('#imported-checks details').length, 1);
  const app = page.document.querySelector('[data-check-id="app-maps"]');
  assert.match(app.querySelector('summary').textContent, /17 tests/);
  assert.match(app.textContent, /node synthetic-app-maps\.mjs/);
  assert.match(app.textContent, /C:\/synthetic\/doso-app/);
  assert.match(app.textContent, /退出码 0/);
  assert.equal(app.querySelector('a').getAttribute('href'), 'logs/app-maps.log');
  const rust = page.document.querySelector('[data-check-id="rust-reporting"]');
  assert.match(rust.querySelector('summary').textContent, /此前结果 · 本轮未执行/);
  assert.match(rust.textContent, /D:\/synthetic\/reporting-result\.json/);
  assert.equal(rust.querySelector('[data-copy-command]'), null);
  assert.equal(rust.querySelector('a'), null);
  assert.match(page.document.querySelector('#report-summary').textContent, /9 个该次检查项9 项通过0 项失败1 份既有记录/);
  assert.doesNotMatch(page.document.querySelector('#report-summary').textContent, /%/);
});

test('failed, absent and malformed report results never produce verified green badges', () => {
  const page = mount(fixture({ checks: [
    { ...checks[0], status: 'failed', exitCode: 1 },
    { ...checks[2], status: 'not-run' },
  ] }));
  assert.equal(page.document.querySelector('#badge-app').textContent, '存在失败结果');
  assert.ok(page.document.querySelector('#badge-app').classList.contains('failed'));
  assert.equal(page.document.querySelector('#badge-map').textContent, '等待验收记录');
  assert.equal(page.document.querySelector('#badge-remote').textContent, '等待验收记录');
  assert.equal(page.document.querySelector('#badge-rust').textContent, '等待验收记录');
  assert.equal(page.document.querySelectorAll('.card .pill.passed').length, 0);
  const missing = mount({ schemaVersion: 2, checks: [] });
  assert.match(missing.document.querySelector('#report-summary').textContent, /尚无验收数据/);
  assert.equal(missing.document.querySelectorAll('.card .pill.passed').length, 0);
});

test('new remote capabilities derive verification from current checks and keep old Rust evidence separate', () => {
  const passed = mount();
  assert.equal(passed.document.querySelector('#badge-remote').textContent, '该次本地验证通过');
  passed.click('#flow-status');
  for (const id of ['status-consent', 'status-grant', 'status-latest', 'status-app', 'status-stop']) {
    passed.click('#' + id);
    assert.match(passed.document.querySelector('#stage-detail').textContent, /本地代码已实现/);
    assert.equal(passed.document.querySelector('[data-stage-verification]').textContent, '该次本地验证通过');
  }
  passed.click('#status-grant');
  assert.match(passed.document.querySelector('#stage-detail').textContent, /完整联调|完整联调通过/);
  passed.click('#status-report');
  assert.match(passed.document.querySelector('#stage-detail').textContent, /旧报告|此前导入/);
  assert.equal(passed.document.querySelector('[data-stage-verification]'), null);
  const failed = mount(fixture({ checks: checks.map(check => check.id === 'remote-handler' ? { ...check, status: 'failed' } : check) }));
  failed.click('#flow-status');
  assert.equal(failed.document.querySelector('#badge-remote').textContent, '存在失败结果');
  assert.ok(failed.document.querySelector('[data-stage-verification]').classList.contains('failed'));
  assert.doesNotMatch(failed.document.querySelector('[data-stage-verification]').textContent, /验证通过/);
  const missing = mount(fixture({ checks: checks.slice(0, 6) }));
  missing.click('#flow-status');
  assert.equal(missing.document.querySelector('#badge-remote').textContent, '等待验收记录');
  assert.equal(missing.document.querySelector('[data-stage-verification]').textContent, '等待验收记录');
});

test('snapshot time uses report evidence in Asia Shanghai and is stable across renders', () => {
  const first = mount(), second = mount();
  const time = first.document.querySelector('#snapshot-time');
  assert.match(time.textContent, /2026\/11\/03.*08:00:03.*北京时间/);
  assert.equal(time.getAttribute('datetime'), STAMP);
  assert.equal(second.document.querySelector('#snapshot-time').textContent, time.textContent);
  assert.equal(first.document.querySelector('#run-id').textContent, 'synthetic-dashboard-fixture');
  assert.match(first.document.body.textContent, /本地验收记录 · 非实时设备状态/);
});

test('injected markup stays inert and unsafe or nonlocal log links are omitted', () => {
  const attack = '</script><img src=x onerror="globalThis.executed=true"><script>globalThis.executed=true</script>';
  const unsafe = ['javascript:alert(1)', 'https://example.test/logs/x.log', 'file:///C:/secret.log', '../logs/x.log',
    'logs/../secret.log', 'logs/%2e%2e/secret.log', '//example.test/x.log'];
  const page = mount(fixture({ checks: [
    { ...checks[0], label: attack, command: attack, details: [attack], logPath: unsafe[0] },
    ...unsafe.slice(1).map((logPath, index) => ({ ...checks[1], id: `unsafe-${index}`, logPath })),
    { ...checks[2], id: 'safe-nested', logPath: '2026-11-03T00-00-00-000Z-abcd1234/logs/edge-handler.log' },
  ] }));
  assert.equal(page.document.querySelectorAll('img').length, 0);
  assert.equal(page.document.querySelectorAll('script').length, 2);
  assert.equal(page.context.executed, undefined);
  assert.ok(page.document.querySelector('[data-check-id="app-maps"]').textContent.includes(attack));
  assert.equal(page.document.querySelectorAll('[data-log-for]').length, 1);
  assert.equal(page.document.querySelector('[data-log-for]').getAttribute('href'), '2026-11-03T00-00-00-000Z-abcd1234/logs/edge-handler.log');
});

test('clipboard denial reveals selected readonly fallback and interaction attempts no network', async () => {
  const page = mount();
  page.click('#tab-tests');
  page.click('[data-copy-command="app-maps"]');
  await new Promise(resolve => setImmediate(resolve));
  const row = page.document.querySelector('[data-check-id="app-maps"]');
  const fallback = row.querySelector('textarea');
  assert.equal(fallback.hidden, false);
  assert.equal(fallback.readOnly, true);
  assert.equal(fallback.value, checks[0].command);
  assert.equal(page.host.focused, fallback);
  assert.equal(page.host.selected, checks[0].command);
  assert.match(row.querySelector('[role="status"]').textContent, /已选中命令/);
  page.click('#tab-overview');
  page.click('#flow-status');
  page.click('#status-stop');
  assert.equal(page.networkAttempts.length, 0);
  assert.equal(page.document.querySelectorAll('script[src],link[href],img[src],iframe').length, 0);
  assert.doesNotMatch(page.document.querySelector('style').textContent, /@import|url\(/i);
  assert.match(page.document.querySelector('[http-equiv="Content-Security-Policy"]').getAttribute('content'), /connect-src 'none'/);
});

test('historical reports show their execution time and scope without checking current source', () => {
  const page = mount(fixture({ generatedAt: '2026-11-03T00:10:00.000Z', sourceSnapshot: {
    currentMatches: false, verifiedAt: '2026-11-03T00:10:00.000Z',
    changedFeatureFiles: ['src/services/cloudMaps.ts'],
  } }));
  assert.equal(page.document.querySelector('#snapshot-time').getAttribute('datetime'), STAMP);
  assert.match(page.document.body.textContent, /通过结果仅反映记录时间与执行范围/);
  assert.match(page.document.body.textContent, /查看报告不会验证当前源码/);
  assert.equal(page.document.querySelector('#badge-app').textContent, '该次本地验证通过');
  assert.equal(page.document.querySelector('#source-warning'), null);
  const row = page.document.querySelector('[data-check-id="app-maps"]');
  assert.match(row.textContent, /合成报告夹具，仅用于 DOM 测试/);
  assert.match(row.textContent, /08:00:00/);
  assert.match(row.textContent, /退出码 0/);
  const running = mount(fixture({ finishedAt: null, generatedAt: '2026-11-03T00:10:00.000Z' }));
  assert.equal(running.document.querySelector('#snapshot-time').getAttribute('datetime'), '2026-11-03T00:00:00.000Z');
});
