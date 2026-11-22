import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, stubs = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    assert.ok(name in stubs, `unexpected dependency ${name}`);
    return stubs[name];
  } }, { filename: path });
  return module.exports;
}

const plain = value => JSON.parse(JSON.stringify(value));
const rules = load('src/features/robot-lifecycle/robotHotspotRules.ts');

test('legacy hotspot rule keeps DOSOrobotics mapped to 192.168.50.1:13145 without lab constants', () => {
  assert.equal(rules.ROBOT_HOTSPOT_RULES.map(rule => `${rule.ssid}|${rule.host}|${rule.port}`).join(','), 'DOSOrobotics|192.168.50.1|13145');
  const source = readFileSync(new URL('../src/features/robot-lifecycle/robotHotspotRules.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /192\.168\.66\.64|5050|5052|rssi|RSSI/);
});

test('matches legacy DOSOrobotics (exact case) and multi-robot DOSO-* prefix while preserving exact SSID', () => {
  const match = rules.matchRobotHotspot;

  const legacy = match('"DOSOrobotics"');
  assert.deepEqual(plain(legacy), {
    ssid: 'DOSOrobotics',
    host: '192.168.50.1',
    port: 13145,
    label: '机器狗热点',
  });
  assert.equal(match('  DOSOrobotics  ')?.ssid, 'DOSOrobotics');

  const prod = match('DOSO-AB12CD');
  assert.deepEqual(plain(prod), {
    ssid: 'DOSO-AB12CD',
    host: '192.168.50.1',
    port: 13145,
    label: '机器狗 AB12CD',
  });

  const lowerPrefix = match('"doso-ab12_01"');
  assert.deepEqual(plain(lowerPrefix), {
    ssid: 'doso-ab12_01',
    host: '192.168.50.1',
    port: 13145,
    label: '机器狗 ab12_01',
  });

  assert.equal(match('DOSO-01')?.label, '机器狗 01');
  assert.equal(match(`DOSO-${'A'.repeat(24)}`)?.ssid, `DOSO-${'A'.repeat(24)}`);
});

test('rejects shared lab routers, placeholders, wrong legacy case, and invalid DOSO-* suffixes', () => {
  const match = rules.matchRobotHotspot;
  for (const ssid of [
    'dosorobotics',
    'DOSOROBOTICS',
    'DOSOrobotics-guest',
    'TopSpeed5GCPE-5525',
    '<unknown ssid>',
    'unknown ssid',
    '0x',
    '',
    '   ',
    'DOSO-',
    'DOSO-A',
    `DOSO-${'A'.repeat(25)}`,
    'DOSO-AB 12',
    'DOSO-AB.12',
    'DOSO-AB/12',
    'MY-DOSO-AB12',
    null,
    undefined,
  ]) {
    assert.equal(match(ssid), null, String(ssid));
  }
});

test('sortRobotHotspots puts the currently connected SSID first and sorts the rest alphabetically', () => {
  const list = ['DOSOrobotics', 'DOSO-XY99', 'DOSO-AB12'].map(ssid => rules.matchRobotHotspot(ssid));
  assert.deepEqual(
    plain(rules.sortRobotHotspots(list, null).map(item => item.ssid)),
    ['DOSO-AB12', 'DOSO-XY99', 'DOSOrobotics'],
  );
  assert.deepEqual(
    plain(rules.sortRobotHotspots(list, '"DOSO-XY99"').map(item => item.ssid)),
    ['DOSO-XY99', 'DOSO-AB12', 'DOSOrobotics'],
  );
  assert.deepEqual(
    plain(rules.sortRobotHotspots(list, 'TopSpeed5GCPE-5525').map(item => item.ssid)),
    ['DOSO-AB12', 'DOSO-XY99', 'DOSOrobotics'],
  );
});

test('a typed lab address is not replaced, while an empty address is filled', () => {
  const rule = rules.ROBOT_HOTSPOT_RULES[0];
  assert.equal(rules.autoApplyHotspot('', '13145', rule), rule);
  assert.equal(rules.autoApplyHotspot('192.168.66.64', '13145', rule), null);
  assert.equal(rules.autoApplyHotspot('192.168.50.1', '13145', rule), null);
  assert.equal(rules.autoApplyHotspot('192.168.50.1', '80', rule), rule);
  assert.equal(rules.autoApplyHotspot('robot.example.test', '13145', rule), null);
});
