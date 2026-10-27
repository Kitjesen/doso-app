import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [app, screen, service] = await Promise.all([
  readFile(new URL('../App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/DeviceEnrollmentScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/deviceEnrollmentService.ts', import.meta.url), 'utf8'),
]);

test('device enrollment is reachable only for a bound physical device', () => {
  assert.match(app, /onOpenDeviceEnrollment=\{device && !device\.is_demo/);
  assert.match(app, /stage === 'device-enrollment' && user && device && !device\.is_demo/);
  assert.match(app, /beginDeviceEnrollment\(currentDevice\.id/);
  assert.match(screen, /账户绑定：已完成/);
  assert.match(screen, /不会在此页面发送 Wi-Fi 密码、运动指令或电机命令/);
});

test('enrollment client keeps the challenge in memory and validates the server envelope', () => {
  assert.match(service, /never persisted or logged/);
  assert.match(service, /parseDeviceEnrollmentResponse/);
  assert.match(service, /action: 'begin', deviceId/);
  assert.doesNotMatch(service, /SecureStore|AsyncStorage|console\.log/);
});
