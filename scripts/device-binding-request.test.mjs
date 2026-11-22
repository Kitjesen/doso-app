import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const id = '8f7e1c62-0a4d-4b89-96e2-6c47b03db1a5';

function repository(response) {
  const calls = [];
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../src/services/deviceRepository.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Error, Response,
    require(name) {
      if (name === './supabaseClient') return { getSupabaseClient: () => ({
        functions: { async invoke(name, options) { calls.push({ name, ...options }); return response; } },
      }) };
      if (['./authSessionOperation', './deviceDataQuery', './deviceEnrollmentService'].includes(name)) return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { ...module.exports, calls };
}

test('claim sends the normalized robot UUID and preserves cancellation options', async () => {
  const device = { id, owner_id: 'owner' };
  const subject = repository({ data: { device }, error: null });
  const controller = new AbortController();
  assert.equal(await subject.claimDevice(` ${id.toUpperCase()} `, ' CLAIM01 ', {
    signal: controller.signal, timeoutMs: 15000,
  }), device);
  const [call] = subject.calls;
  assert.equal(call.name, 'device-binding');
  assert.deepEqual(JSON.parse(JSON.stringify(call.body)), { action: 'claim', deviceId: id, code: 'CLAIM01' });
  assert.equal(call.signal, controller.signal);
  assert.equal(call.timeout, 15000);
});

test('claim keeps backend rejection visible and never resubmits', async () => {
  const subject = repository({ data: { error: { code: 'claim_rejected', message: 'Binding code rejected' } }, error: null });
  await assert.rejects(subject.claimDevice(id, 'CLAIM01'), /claim_rejected: Binding code rejected/);
  assert.equal(subject.calls.length, 1);
});

test('unbind uses the same robot UUID', async () => {
  const subject = repository({ data: { unbound: true }, error: null });
  await subject.unbindDevice(id);
  assert.deepEqual(JSON.parse(JSON.stringify(subject.calls[0].body)), {
    action: 'unbind', deviceId: id, reason: 'user_request',
  });
});
