import assert from 'node:assert/strict';
import test from 'node:test';

import { transitionControlOperationState, getControlTerrainPolicies } from '../src/features/control/controlOperations.ts';

test('terrain modes bind exact advertised profile IDs, not similar filenames or descriptions', () => {
  const state = { policyCatalogStatus: 'synced', currentPolicy: { id: 'platform', label: 'device' }, policyOptions: [
    { id: 'flat', label: 'A' }, { id: 'platform', label: 'B' },
    { id: 'stairs_candidate', label: '楼梯' }, { id: 'climb', label: '高台' },
  ] };
  const result = getControlTerrainPolicies(state);
  assert.deepEqual(result.map(x => x.profileId), ['flat', null, 'platform']);
  assert.deepEqual(result.map(x => x.selected), [false, false, true]);
  assert.ok(getControlTerrainPolicies({ ...state, policyCatalogStatus: 'unknown' }).every(x => x.profileId === null && !x.selected));
});

test('action state follows submitted → accepted → executing → completed', () => {
  let state = { status: 'idle' };
  for (const next of ['submitted', 'accepted', 'executing', 'completed']) {
    const result = transitionControlOperationState(state, next, `fixture:${next}`);
    assert.equal(result.accepted, true);
    state = result.state;
    assert.equal(state.status, next);
  }
});

test('failed and timeout are terminal until a fresh submission, and invalid ACK order is ignored', () => {
  const submitted = transitionControlOperationState({ status: 'idle' }, 'submitted').state;
  const failed = transitionControlOperationState(submitted, 'failed').state;
  assert.equal(failed.status, 'failed');
  const invalid = transitionControlOperationState(failed, 'executing');
  assert.equal(invalid.accepted, false);
  assert.equal(invalid.state.status, 'failed');
  const retry = transitionControlOperationState(failed, 'submitted');
  assert.equal(retry.accepted, true);
  const timeout = transitionControlOperationState(retry.state, 'timeout');
  assert.equal(timeout.accepted, true);
  assert.equal(timeout.state.status, 'timeout');
});

test('blocked UI can return to idle or submit only after readiness changes', () => {
  const blocked = transitionControlOperationState({ status: 'blocked', detail: '未接入' }, 'executing');
  assert.equal(blocked.accepted, false);
  const idle = transitionControlOperationState(blocked.state, 'idle');
  assert.equal(idle.accepted, true);
  const submitted = transitionControlOperationState(idle.state, 'submitted');
  assert.equal(submitted.accepted, true);
});
