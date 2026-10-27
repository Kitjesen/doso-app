import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, analysis, analysisPreview, capabilityReadiness, control, header, home, map, profile, tasks] = await Promise.all([
  readFile(new URL('../App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/AnalysisScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/features/analysis/analysisPreview.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/features/robot-lifecycle/robotCapabilityReadiness.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/ControlScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AppHeader.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/HomeScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/MapScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/ProfileScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/TasksScreen.tsx', import.meta.url), 'utf8'),
]);

assert.doesNotMatch(home, /batteryPercent = 34|12\/12|32°C/, 'Home must not invent trusted-looking telemetry');
assert.match(home, /batteryPercent\?: number \| null;/, 'Home accepts an explicit unknown battery state');
assert.match(home, /hasTrustedBattery/, 'Home distinguishes unknown battery from zero percent');
assert.match(home, />待同步<\/Text>/, 'unavailable sensor, temperature and motor telemetry is disclosed');

assert.doesNotMatch(profile, /batteryPercent = (?:50|0)/, 'Profile must not invent a battery value');
assert.match(profile, /batteryPercent\?: number \| null;/, 'Profile accepts an explicit unknown battery state');
assert.match(profile, /batteryPercent == null \? '—'/, 'Profile renders unknown battery as an empty-state glyph');
assert.match(profile, /safetyLock: boolean \| null;/, 'Profile accepts an explicit unknown safety-lock state');
assert.match(profile, /safetyLock == null[\s\S]*?label: connected \? '待同步' : '未连接'/, 'Profile never presents unknown safety telemetry as enabled');

assert.match(app, /const displayBatteryPercent = device\?\.battery_percent \?\? null;/, 'App preserves the difference between unknown and zero battery');
assert.match(app, /const trustedSafetyLock = readTrustedSafetyLock\(device\);/, 'App derives presentation state only from a trusted boolean');
assert.match(app, /const safetyLock = trustedSafetyLock \?\? true;/, 'command gates still fail closed when the safety-lock display state is unknown');
assert.match(app, /<ProfileScreen[\s\S]*?batteryPercent=\{displayBatteryPercent\}/, 'Profile receives only repository-backed battery data');
assert.match(app, /<ProfileScreen[\s\S]*?safetyLock=\{trustedSafetyLock\}/, 'Profile receives unknown instead of an invented enabled value');
assert.match(app, /<HomeScreen[\s\S]*?batteryPercent=\{displayBatteryPercent\}/, 'Home receives only repository-backed battery data');
assert.match(capabilityReadiness, /PHYSICAL_ROBOT_CAPABILITY_EVIDENCE = EMPTY_EVIDENCE/, 'physical capabilities remain fail-closed until real per-capability evidence exists');
assert.match(capabilityReadiness, /if \(!hasTrustedEvidence\)/, 'device status alone cannot enable a physical capability');
assert.match(app, /<ControlScreen[\s\S]*?batteryPercent=\{controlTarget === 'direct' \? null : displayBatteryPercent\}/, 'Direct IP has no battery contract; account Control receives only repository-backed battery data');

assert.doesNotMatch(control, /batteryPercent = 60|120 米|6\.4 h|12 \/ 12|94%|所有系统运行正常/, 'Control must not invent telemetry or health');
assert.match(control, /batteryPercent\?: number \| null;/, 'Control preserves the caller-compatible data contract');
assert.match(control, /typeof batteryPercent === 'number' && Number\.isFinite\(batteryPercent\) && batteryPercent >= 0 && batteryPercent <= 100/, 'Control only renders finite in-range caller-backed battery');
assert.match(control, /'电量未知'/, 'Control does not turn unknown battery into zero');
assert.match(control, /connected \? '设备在线' : '设备离线'/, 'Control cloud device presence must not be labelled as a local gRPC/control lease');
assert.ok(control.includes('runtimeState?.controlLink') && control.includes('runtimeState?.controlAuthority'), 'Control renders link and authority separately from device presence');
assert.match(control, /mapContent \?\?/, 'Control accepts an actual map source separately from its empty state');
assert.match(control, /设备地图尚未接入/, 'Control never presents missing map data as a live map');
assert.match(app, /PRODUCTION_ROBOT_COMMAND_EXECUTOR: RobotCommandExecutor \| null = null/, 'status presentation does not grant production motion');
assert.doesNotMatch(control, /control-route-map|miniMapImage/, 'Control no longer presents design map imagery as device position');

assert.match(analysis, /previewMode: boolean;/, 'Analysis requires an explicit preview-mode decision');
assert.match(app, /<AnalysisScreen previewMode=\{false\}/, 'Production App keeps static analysis preview data disabled');
assert.match(analysis, /if \(!previewMode\)/, 'Analysis keeps the physical-device empty state as the fail-closed branch');
assert.match(analysis, /尚未同步可信遥测/, 'Analysis preserves an honest empty state for physical devices without trusted history');
assert.match(analysis, /预览数据/, 'Analysis visibly labels design-only performance values as preview data');
assert.match(analysis, /不代表真实设备记录/, 'Analysis discloses that preview values are not real device records');
assert.doesNotMatch(analysis, /12\.8 公里|8 \/ 10|6\.4 小时|32°C/, 'Preview values must stay isolated from the trusted-data screen logic');
assert.match(analysisPreview, /12\.8 公里[\s\S]*8 \/ 10[\s\S]*6\.4 小时[\s\S]*32°C/, 'Explicit preview fixtures keep the Figma values together');

const firmwareExpression = app.match(/const firmwareVersion = ([^;]+);/)?.[1];
assert.ok(firmwareExpression, 'App defines the firmware presentation value');
const readFirmwareVersion = new Function('device', `return (${firmwareExpression});`);
assert.equal(readFirmwareVersion(undefined), '待同步', 'missing devices do not receive invented firmware');
assert.equal(readFirmwareVersion({ firmware_version: null }), '待同步', 'null firmware remains unknown');
assert.equal(readFirmwareVersion({ firmware_version: '' }), '待同步', 'empty firmware remains unknown');
assert.equal(readFirmwareVersion({ firmware_version: '   ' }), '待同步', 'blank firmware remains unknown');
assert.equal(readFirmwareVersion({ firmware_version: 'v1.2.3' }), '1.2.3', 'a leading firmware v is presentation-only');

assert.doesNotMatch(tasks, /按计划进行|已完成 33%|有 3 个待执行任务/, 'Tasks must not present templates as trusted schedules or progress');
assert.match(tasks, /<Text style=\{styles\.summaryTitle\}>尚未同步可信任务<\/Text>/, 'Tasks visibly discloses the missing trusted source in its summary');
assert.match(tasks, /<Text style=\{styles\.summarySubtitle\}>当前可查看通用模板<\/Text>/, 'Tasks labels its non-device-backed content as generic templates');
assert.match(tasks, /<Text style=\{styles\.summarySubtitle\}>只读<\/Text>/, 'Tasks explicitly labels the summary as read-only');
assert.match(tasks, /尚未同步可信任务/, 'Tasks discloses the missing task source');
assert.match(tasks, /controlAvailable: boolean;/, 'Tasks receives its own fail-closed task capability');
assert.match(tasks, /executorAvailable: boolean;/, 'Tasks receives independent production-executor readiness');
assert.match(tasks, /createTaskStartHandler\(taskStartInput, onStartTask\)/, 'Tasks creates its click handler through the trusted task policy boundary');
assert.match(tasks, /onPress=\{taskStartHandler\}/, 'Tasks binds the real start control to the trusted task policy handler');

assert.doesNotMatch(map.replaceAll('不是设备地图或已保存路线', '').replaceAll('尚无已保存路线', ''), /已保存路线|15 分钟 · 120 米|可从当前位置开始/, 'Map must not present placeholder routes or position as trusted data; explicit negative disclaimers and empty states are not positive claims');
assert.match(map, /<Text style=\{styles\.previewNotice\} testID="route-preview-notice">以下是界面示例，不是设备地图或已保存路线。<\/Text>/, 'Map visibly discloses example content rather than relying on template metadata');
assert.match(map, /不是设备地图或已保存路线/, 'Map separates examples from device maps and saved routes');
assert.match(map, /设备地图与路线编辑器尚在接入中/, 'Map discloses the missing route integration');
assert.match(map, /controlAvailable: boolean;/, 'Map receives its own fail-closed route capability');
assert.match(map, /executorAvailable: boolean;/, 'Map receives independent production-executor readiness');
assert.match(map, /attemptRouteStart\(routeStartInput, onStartRoute\)/, 'Map re-derives trusted route readiness at the dispatch boundary');

assert.match(app, /<MapScreen[\s\S]*?controlAvailable=\{routeControlAvailable\}[\s\S]*?executorAvailable=\{routeExecutorAvailable\}/, 'Map receives separate fail-closed capability and executor gates');
assert.match(app, /<TasksScreen[\s\S]*?controlAvailable=\{taskControlAvailable\}[\s\S]*?executorAvailable=\{taskExecutorAvailable\}/, 'Tasks receives separate fail-closed capability and executor gates');
assert.doesNotMatch(app, /当前没有新的设备异常|没有新的异常告警|路线已启动|任务已下发|召回指令已发送/, 'App must not claim unobserved alerts or command success');
assert.match(app, /通知服务尚未接入/, 'notification actions disclose that alert querying is unavailable');
assert.match(app, /isRecentDeviceStatus/, 'online state requires a freshness check');

assert.doesNotMatch(profile, /runtimeHours = 0|运行时长.*0\.0/, 'Profile must not invent zero runtime');
assert.match(profile, /runtimeHours\?: number \| null;/, 'Profile accepts unknown runtime');
assert.match(profile, /通知服务待接入/, 'Profile separates notification preference from delivery capability');

assert.doesNotMatch(header, /displayName = 'Anny'|今天 · 25 日/, 'Header must not invent a user or calendar date');
assert.match(header, /new Date\(\)/, 'Header derives the displayed date at runtime');

console.log('DOSO trusted device-data UI guard PASS — unknown telemetry stays unknown');
