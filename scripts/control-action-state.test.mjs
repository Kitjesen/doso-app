import assert from 'node:assert/strict';
import test from 'node:test';

import { transitionControlOperationState, getControlTerrainPolicies, controlTerrainMotionBlock, controlTerrainSwitchBlock } from '../src/features/control/controlOperations.ts';

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

test('terrain switching stays available while standing or prone and closes while walking', () => {
  const standing = { posture: 'standing', speed: { linearMps: 0, lateralMps: 0, yawRps: 0, source: 'device' } };
  const prone = { posture: 'sitting', speed: { linearMps: 0, lateralMps: 0, yawRps: 0, source: 'device' } };
  assert.equal(controlTerrainSwitchBlock(standing), null);
  assert.equal(controlTerrainSwitchBlock(prone), null);
  assert.match(controlTerrainSwitchBlock({ posture: 'standing', speed: { linearMps: 0.4, lateralMps: 0, yawRps: 0, source: 'device' } }) ?? '', /行走中不可切换/);
  assert.match(controlTerrainSwitchBlock({ posture: 'unknown', speed: { linearMps: null, lateralMps: null, yawRps: null, source: 'unknown' } }) ?? '', /站立或趴地/);
  assert.equal(controlTerrainMotionBlock({ posture: 'unknown' }), null);
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

test('slot bindings keep the actual model ID and reject ambiguous bindings', () => {
  const state = { policyCatalogStatus: 'synced', currentPolicy: { id: 'w5_89999', label: 'W5' }, policyOptions: [
    { id: 'w5_89999', label: 'flat: W5', terrainModeId: 'flat' },
    { id: 'cts_v39_61128', label: 'stairs: CTS', terrainModeId: 'stairs' },
  ] };
  assert.deepEqual(getControlTerrainPolicies(state).map(x => x.profileId), ['w5_89999', 'cts_v39_61128', null]);
  assert.equal(getControlTerrainPolicies(state)[0].selected, true);
  assert.equal(getControlTerrainPolicies({ ...state, policyOptions: [...state.policyOptions,
    { id: 'other', label: 'flat: duplicate', terrainModeId: 'flat' }] })[0].profileId, null);
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

