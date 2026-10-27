import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const control = await readFile(new URL('../src/screens/ControlScreen.tsx', import.meta.url), 'utf8');
const controlOperations = await readFile(new URL('../src/features/control/controlOperations.ts', import.meta.url), 'utf8');
const app = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');

for (const text of [
  'useAppTheme()',
  'useWindowDimensions()',
  "edges={__DEV__ && developmentInput ? ['left', 'right'] : ['top', 'left', 'right', 'bottom']}",
  '<ControlJoystickPair',
  'floating',
  "axis: 'xy', label: '移动'",
  "axis: 'x', label: '转向'",
  'allowInteractionPreview = false',
  'previewControlsEnabled = __DEV__ && allowInteractionPreview && appActive && !leaving',
  'disabled={!controlsEnabled || selectedInputSource !== \'touch\'}',
  'showLabels={true}',
  'onChange: productionInput || developmentInput ? handleDrive : ignoreLocalInput',
  "if (state !== 'active')",
  'setLeaving(true)',
  'testID="control-back"',
  'getProductAppearance(isDark)',
  'testID="control-manual-status"',
  'testID="control-manual-reason"',
  'testID="control-map-unavailable"',
  '地图未接入',
  'testID="control-open-connection"',
  'testID={`control-open-${entry.id}`}',
  'testID="control-task-status"',
  'testID="control-route-status"',
  'testID="control-recall"',
  'testID="control-telemetry"',
  'testID="control-open-diagnostics"',
  'onOpenJointStatus',
  'testID="control-terrain-mode"',
  '模式切换通道未接入',
]) assert.ok(control.includes(text), text);
for (const text of ['平地模式', '楼梯模式', '高台模式']) assert.ok(controlOperations.includes(text), text);

assert.ok(app.includes("allowInteractionPreview={controlTarget !== 'direct' && __DEV__}"));
assert.match(app, /PRODUCTION_ROBOT_COMMAND_EXECUTOR[^=]*= null/);
assert.match(control, /export function ControlScreen\(\{\s+allowInteractionPreview = false, developmentInput, productionInput, controlSession, onBack,/);
assert.match(control, /if \(__DEV__ && developmentInput\?\.ready && appActive && !leaving\) developmentInput\.onDrive\(value\)/);
assert.match(control, /if \(__DEV__ && developmentInput\?\.ready && appActive && !leaving\) developmentInput\.onTurn\(value\)/);
assert.match(control, /const ignoreLocalInput = \(_value: JoystickVector\) => \{\};/);
assert.match(control, /back:[^\n]*height: 48[^\n]*width: 48/);
// "enableMotor" is now an action key. A direct transport call remains forbidden.
assert.doesNotMatch(control, /sendCommand|acquireControl|\benableMotor\s*\(|dispatchRobot|fetch\(|\.rpc\(|\bNativeModules\b/);
assert.doesNotMatch(control, /RobotDiagnosticsPanel|control-brainstem-connection|developerSection/);
assert.doesNotMatch(control, /<Image|miniMapImage|videoSource|mockCoordinates/);
assert.doesNotMatch(control, /control-route-map|miniMapImage|healthValue|modeSelector|inputReadout|actionRow/);
assert.match(control, /Number\.isFinite\(batteryPercent\) && batteryPercent >= 0 && batteryPercent <= 100/);
assert.match(control, /mapContent \?\? <View[^>]*testID="control-map-unavailable"/);
assert.match(control, /const recallEnabled = canRecall === true && typeof onRecall === 'function' && appActive && !leaving/);
assert.match(control, /const current = recallRef\.current;\s+if \(current\.canRecall !== true \|\| typeof current\.onRecall !== 'function' \|\| !current\.appActive \|\| current\.leaving\) return;/);

for (const compatibilityProp of [
  'batteryPercent?: number | null;',
  'canUseManualControl: boolean;',
  'canUseRouteMode: boolean;',
  'canUseTaskMode: boolean;',
  'connected: boolean;',
  'diagnosticsGateway: RobotDiagnosticsGateway;',
  'mapContent?: ReactNode;',
  'onOpenMap?: () => void;',
  'onOpenTasks?: () => void;',
  'onOpenRoutes?: () => void;',
  'onOpenJointStatus?: () => void;',
  'onOpenConnection?: () => void;',
  'canRecall?: boolean;',
  'recallBlockedReason?: string;',
  'onRecall?: () => void | Promise<void>;',
  'runtimeState?: ControlRuntimeState;',
  'operationReadiness?: Partial<Record<ControlOperation, ControlActionReadiness>>;',
  'operationCallbacks?: ControlOperationCallbacks;',
]) assert.ok(control.includes(compatibilityProp), `missing compatibility prop ${compatibilityProp}`);

for (const operationContract of [
  'testID="control-runtime-summary"', 'testID="control-operation-groups"',
  'testID={`control-action-${action}`}', 'testID="control-confirm-action"',
  'testID="control-cancel-action"', 'testID="control-policy-selection"',
  'operationGeneration.current++', 'expectedGeneration !== operationGeneration.current',
  'if (inFlightRef.current || !mountedRef.current) return;',
  '可能失去支撑', '请求已接受，状态待确认', 'testID={`control-action-status-${action}`}',
]) assert.ok(control.includes(operationContract), `missing operation guard/content: ${operationContract}`);

console.log('Control center source contract PASS — truthful status/map, guarded native production input and isolated local development input; not formal native acceptance');
