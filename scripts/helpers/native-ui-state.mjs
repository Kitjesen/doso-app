// UI values are transient inputs. Only fixed categories/allowlisted markers leave this boundary.
const QA_PACKAGE = 'com.doso.robot.qa';
const FOREIGN_PACKAGES = new Map([
  ['android', 'framework'], ['com.android.systemui', 'systemUi'],
  ['com.android.permissioncontroller', 'permissionController'], ['com.google.android.permissioncontroller', 'permissionController'],
  ['com.android.inputmethod.latin', 'inputMethod'], ['com.google.android.inputmethod.latin', 'inputMethod'],
  ['com.android.launcher3', 'launcher'], ['com.google.android.apps.nexuslauncher', 'launcher'],
  ['com.android.settings', 'settings'], ['com.android.shell', 'shell'], ['com.doso.robot', 'dosoNamespace'], ['', 'missingPackage'],
]);
const emptyForeignCounts = () => ({ framework: 0, systemUi: 0, permissionController: 0,
  inputMethod: 0, launcher: 0, settings: 0, shell: 0, dosoNamespace: 0, missingPackage: 0, other: 0 });
const SYSTEM_ERROR_MARKERS = new Set(['android:id/aerr_wait', 'android:id/aerr_close',
  'android:id/aerr_restart', 'android:id/aerr_report']);
const LOGIN = ['auth-entry-header', 'login-form', 'login-email', 'login-password', 'login-submit', 'login-register'];
const REGISTER = ['auth-entry-header', 'register-form', 'register-username', 'register-email', 'register-password', 'register-submit', 'register-login'];
export const NATIVE_UI_MARKER_IDS = Object.freeze([...new Set([...LOGIN, ...REGISTER,
  'login-intro', 'register-intro', 'font-loading', 'app-font-misans', 'app-font-system-fallback',
  'design-qa-disclosure', 'design-qa-preview', 'home-device-card', 'home-control', 'main-navigation'])].sort());
export function invalidNativeUi() {
  return { state: 'invalid-input', scope: 'invalid', nodeCount: 0, appNodeCount: 0,
    inputNodeCount: 0, markerIds: [], foreignNodeCounts: emptyForeignCounts(), foreignMarkerIds: [],
    safeForWarm: false, rawValuesRetained: false };
}
export function classifyNativeUi(input) {
  try { return classifyValidated(input); } catch { return invalidNativeUi(); }
}
function classifyValidated(input) {
  if (!input || !Array.isArray(input.nodes) || input.nodes.length > 10000 || typeof input.expectedPackage !== 'string'
    || typeof input.expectedActivityResumed !== 'boolean' || input.nodes.some(node => !node || typeof node !== 'object'
      || ['packageName', 'resourceId', 'className', 'text', 'description'].some(key => typeof node[key] !== 'string' || node[key].length > 4096)
      || typeof node.password !== 'boolean')) return invalidNativeUi();
  const app = input.nodes.filter(node => node.packageName === QA_PACKAGE);
  const idFor = node => node.resourceId.startsWith(`${QA_PACKAGE}:id/`) ? node.resourceId.slice(`${QA_PACKAGE}:id/`.length) : node.resourceId;
  const isInput = node => node.password || node.className === 'android.widget.EditText';
  const inputIds = app.filter(isInput).map(idFor);
  const ids = app.map(idFor)
    .filter(id => NATIVE_UI_MARKER_IDS.includes(id));
  const markerIds = [...new Set(ids)].sort();
  const exactOnce = required => required.every(id => ids.filter(value => value === id).length === 1);
  const has = id => ids.includes(id);
  const blocked = ['font-loading', 'design-qa-disclosure', 'design-qa-preview', 'home-device-card', 'home-control', 'main-navigation'].some(has);
  const loginSafe = exactOnce(LOGIN) && !REGISTER.filter(id => !LOGIN.includes(id)).some(has)
    && inputIds.every(id => ['login-email', 'login-password'].includes(id));
  const registerSafe = exactOnce(REGISTER) && !LOGIN.filter(id => !REGISTER.includes(id)).some(has)
    && inputIds.every(id => ['register-username', 'register-email', 'register-password'].includes(id));
  const safe = input.expectedPackage === QA_PACKAGE && input.expectedActivityResumed === true && app.length === input.nodes.length
    && !blocked && (loginSafe || registerSafe);
  let state = safe ? loginSafe ? 'signed-out-login' : 'signed-out-register' : 'unknown';
  const foreign = input.nodes.filter(node => node.packageName !== QA_PACKAGE);
  const foreignNodeCounts = emptyForeignCounts();
  for (const node of foreign) foreignNodeCounts[FOREIGN_PACKAGES.get(node.packageName) ?? 'other']++;
  const foreignMarkerIds = [...new Set(foreign.filter(node => ['android', 'com.android.systemui'].includes(node.packageName)
    && SYSTEM_ERROR_MARKERS.has(node.resourceId)).map(node => node.resourceId))].sort();
  // Only diagnostic, never sufficient for authorizing an action. Merged labels may be comma/newline separated.
  const segments = new Set(app.filter(node => !isInput(node)).flatMap(node => [node.text, node.description])
    .filter(value => typeof value === 'string').flatMap(value => value.split(/[,，\r\n]+/u).map(segment => segment.trim())));
  const fontReady = has('app-font-misans') || has('app-font-system-fallback');
  if (!safe && input.expectedPackage === QA_PACKAGE && input.expectedActivityResumed === true) {
    if (foreign.some(node => ['com.android.permissioncontroller', 'com.google.android.permissioncontroller'].includes(node.packageName))) state = 'permission-dialog';
    else if (foreign.some(node => node.packageName === 'com.android.systemui')) state = 'system-ui';
    else if (has('design-qa-preview') || has('design-qa-disclosure')) state = 'design-qa';
    else if (['home-device-card', 'home-control', 'main-navigation'].some(has)) state = 'authenticated-or-main';
    else if (has('font-loading')) state = 'font-loading';
    else if (fontReady && segments.has('DOSO SERVICE') && ['无法恢复账户会话', '无法恢复 Apple 登录资料'].some(label => segments.has(label)) && segments.has('重新尝试')) state = 'auth-recovery-error';
    else if (fontReady && ['正在恢复安全会话…', '正在核对双重验证结果…', '正在检查 Apple 登录资料…'].some(label => segments.has(label))) state = 'auth-restoring';
    else if (input.nodes.length === 0) state = 'native-splash-or-empty';
  }
  return { state, scope: app.length ? app.length === input.nodes.length ? 'app' : 'mixed' : input.nodes.length ? 'foreign' : 'empty',
    nodeCount: input.nodes.length, appNodeCount: app.length,
    inputNodeCount: app.filter(node => node.password || node.className === 'android.widget.EditText').length,
    markerIds, foreignNodeCounts, foreignMarkerIds, safeForWarm: safe, rawValuesRetained: false };
}
