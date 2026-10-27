import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMapSnapshot, validateRouteDraft } from '../src/features/routes/mapGraph.ts';

const validSnapshot = () => /** @type {const} */ ({
  mapId: 'warehouse-a',
  mapVersion: '2026-10-13T01:00:00Z',
  coordinateFrame: 'map',
  units: 'meters',
  checksum: 'sha256:map-a',
  waypoints: [
    { id: 'start', name: '起点', x: 0, y: 0, yaw: 0 },
    { id: 'dock', name: '充电座', x: 2, y: 1, yaw: 1.57 },
  ],
  edges: [{ from: 'start', to: 'dock', lengthM: 2.24 }],
});

test('accepts a finite, connected map snapshot with a stable version', () => {
  const result = validateMapSnapshot(validSnapshot());
  assert.deepEqual(result, { valid: true });
});

test('accepts a route whose waypoint sequence follows directed map edges', () => {
  const result = validateRouteDraft(validSnapshot(), {
    name: '到充电座',
    waypointIds: ['start', 'dock'],
  });
  assert.deepEqual(result, { valid: true, geometryHash: 'start>dock' });
});

test('rejects a route that crosses an unverified edge', () => {
  const result = validateRouteDraft(validSnapshot(), {
    name: '未验证路线',
    waypointIds: ['dock', 'start'],
  });
  assert.deepEqual(result, {
    valid: false,
    code: 'route-edge-missing',
    reason: '路线中存在未验证的 waypoint 连接。',
  });
});
