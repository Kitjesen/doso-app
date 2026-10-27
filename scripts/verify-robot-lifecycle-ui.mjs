import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, appTypes, profile] = await Promise.all([
  readFile(new URL('../App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/types.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/ProfileScreen.tsx', import.meta.url), 'utf8'),
]);

// Static navigation/wiring guard only. Public model tests cover behavior; this
// script does not claim a native BLE build, Wi-Fi, hosted OTA or physical robot evidence.
assert.match(appTypes, /\| 'provisioning'/, 'AppStage exposes the provisioning flow');
assert.match(appTypes, /\| 'firmware-update'/, 'AppStage exposes the firmware update flow');
assert.match(appTypes, /\| 'ble-discovery'/, 'AppStage exposes BLE discovery as an independent diagnostic flow');

assert.doesNotMatch(app, /simulatedProvisioningGateway|simulatedFirmwareUpdateGateway|<ProvisioningScreen|<FirmwareUpdateScreen/, 'product App must not expose simulator lifecycle gateways');
assert.match(app, /canOpenProvisioning=\{robotCapabilityReadiness\.provisioning\.available\}/, 'Profile receives the provisioning capability gate');
assert.match(app, /canOpenFirmwareUpdate=\{robotCapabilityReadiness\.ota\.available\}/, 'Profile receives the OTA capability gate');
assert.match(app, /onOpenProvisioning=\{\(\) => setStage\('provisioning'\)\}/, 'provisioning details remain reachable when the production adapter is unavailable');
assert.match(app, /onOpenFirmwareUpdate=\{\(\) => setStage\('firmware-update'\)\}/, 'OTA details remain reachable when the production adapter is unavailable');
assert.match(app, /stage === 'provisioning'[\s\S]*?<DeviceUnavailableScreen\s+capability="provisioning"\s+deviceName=\{deviceName\}\s+onBack=\{returnToDeviceSettings\}\s*\/>/, 'deep provisioning state renders only unavailable information and a back action');
assert.match(app, /stage === 'firmware-update'[\s\S]*?<DeviceUnavailableScreen\s+capability="firmware"\s+deviceName=\{deviceName\}\s+onBack=\{returnToDeviceSettings\}\s*\/>/, 'deep OTA state renders only unavailable information and a back action');
assert.match(app, /if \(stage === 'bind-device'\) \{[\s\S]*?cancelBindDeviceAttempt\(\)[\s\S]*?return true/, 'Android back safely cancels the visible bind attempt before returning');
assert.match(app, /if \(stage === 'account-security'\) \{[\s\S]*?returnToDeviceSettings\(\)[\s\S]*?return true/, 'Android back returns account security to device settings after honoring its busy guard');
assert.match(app, /stage === 'ble-discovery' \|\| stage === 'provisioning' \|\| stage === 'firmware-update'[\s\S]*?returnToDeviceSettings\(\)[\s\S]*?return true/, 'Android back returns lifecycle and BLE diagnostic flows to device settings');
assert.match(app, /stage === 'ble-discovery'[\s\S]*?<BleDiscoveryScreen[\s\S]*?onBack=\{returnToDeviceSettings\}/, 'BLE discovery renders as a standalone diagnostic stage');
assert.match(app, /onOpenBleDiscovery=\{\(\) => setStage\('ble-discovery'\)\}/, 'BLE diagnostics navigation is independent from capability gates');
assert.doesNotMatch(app, /iot\/simulator|node:crypto/, 'the Expo application never imports Node robot simulators');

assert.match(profile, /canOpenProvisioning: boolean;/, 'Profile receives explicit provisioning readiness');
assert.match(profile, /canOpenFirmwareUpdate: boolean;/, 'Profile receives explicit OTA readiness');
assert.match(profile, /onOpenProvisioning: \(\) => void;/, 'Profile exposes the provisioning action');
assert.match(profile, /onOpenFirmwareUpdate: \(\) => void;/, 'Profile exposes the firmware update action');
assert.match(profile, /onOpenBleDiscovery: \(\) => void;/, 'Profile exposes BLE discovery independently');
assert.match(profile, /title="网络与配网"/, 'device settings name provisioning in user language');
assert.match(profile, /title="固件更新"/, 'device settings expose firmware update');
assert.match(profile, /sectionTitle}>开发诊断</, 'BLE discovery lives in a distinct diagnostic section');
assert.match(profile, /title="附近 BLE 设备"/, 'diagnostics expose nearby BLE advertisements');
assert.match(profile, /只扫描广播 · 不连接、不绑定、不配网/, 'BLE entry states its non-mutating boundary');
assert.doesNotMatch(profile, /disabled=\{!canOpenProvisioning\}/, 'provisioning information remains reachable even when execution is unavailable');
assert.doesNotMatch(profile, /disabled=\{!canOpenFirmwareUpdate\}/, 'OTA information remains reachable even when execution is unavailable');
assert.match(profile, /safetyLock: boolean \| null;/, 'Profile models a missing safety-lock report explicitly');
assert.match(profile, /safetyLock == null[\s\S]*?connected \? '待同步' : '未连接'/, 'unknown safety-lock state stays visibly unknown');
assert.match(profile, /statusLabel=\{safetyLockStatus\.label\}/, 'safety lock is rendered as a read-only status');
assert.doesNotMatch(profile, /onToggleSafety|value=\{safetyLock\}/, 'Profile exposes no safety-lock actuator callback or writable toggle');
assert.match(app, /const trustedSafetyLock = readTrustedSafetyLock\(device\);[\s\S]*?const safetyLock = trustedSafetyLock \?\? true;/, 'missing safety-lock data remains fail-closed for capability gates');
assert.doesNotMatch(profile, /firmwareVersion = 'v2\.4\.1'/, 'Profile does not invent a firmware version');

console.log('SIMULATED LIFECYCLE CONTRACTS + BLE DISCOVERY CODE PASS — PRODUCT ENTRY / GATT AUTH / WIFI PROVISIONING BLOCKED');
