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

const rules = load('src/features/robot-lifecycle/robotHotspotRules.ts');

test('the only hotspot rule is the planned DOSOrobotics Brainstem address', () => {
  assert.equal(rules.ROBOT_HOTSPOT_RULES.map(rule => `${rule.ssid}|${rule.host}|${rule.port}`).join(','), 'DOSOrobotics|192.168.50.1|13145');
  const source = readFileSync(new URL('../src/features/robot-lifecycle/robotHotspotRules.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /192\.168\.66\.64|5050|5052|rssi|RSSI/);
});

test('SSID matching is exact after quote trimming and ignores router names', () => {
  const match = rules.matchRobotHotspot;
  assert.equal(match('DOSOrobotics')?.host, '192.168.50.1');
  assert.equal(match('"DOSOrobotics"')?.port, 13145);
  assert.equal(match('  DOSOrobotics  ')?.ssid, 'DOSOrobotics');
  for (const ssid of ['dosorobotics', 'DOSOrobotics-guest', 'TopSpeed5GCPE-5525', '<unknown ssid>', '', '0x', null]) {
    assert.equal(match(ssid), null, String(ssid));
  }
});

test('a typed lab address is not replaced, while an empty address is filled', () => {
  const rule = rules.ROBOT_HOTSPOT_RULES[0];
  assert.equal(rules.autoApplyHotspot('', '13145', rule), rule);
  assert.equal(rules.autoApplyHotspot('192.168.66.64', '13145', rule), null);
  assert.equal(rules.autoApplyHotspot('192.168.50.1', '13145', rule), null);
  assert.equal(rules.autoApplyHotspot('192.168.50.1', '80', rule), rule);
  assert.equal(rules.autoApplyHotspot('robot.example.test', '13145', rule), null);
});
