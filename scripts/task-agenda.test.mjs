import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const module = { exports: {} };
const source = readFileSync(new URL('../src/components/TaskAgenda.tsx', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
  { module, exports: module.exports, require: () => ({}) });
const { agendaItems, dayKey } = module.exports;
test('timeline filters by local date, orders times, and never mutates input', () => {
  const rows = [{ id: 'b', date: '2026-11-11', time: '15:30', status: 'pending' },
    { id: 'a', date: '2026-11-11', time: '09:12', status: 'completed' },
    { id: 'c', date: '2026-11-12', time: '14:00', status: 'running' }];
  assert.equal(agendaItems(rows, '2026-11-11', false).map(x => x.id).join(','), 'a,b');
  assert.equal(rows[0].id, 'b');
  assert.equal(agendaItems(rows, '2026-11-11', true).map(x => x.id).join(','), 'a');
  assert.equal(agendaItems(rows, '2026-11-13', false).length, 0);
  assert.equal(dayKey(new Date(2026, 10, 11)), '2026-11-11');
});
