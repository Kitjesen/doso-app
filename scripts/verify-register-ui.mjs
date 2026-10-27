import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const register = await readFile(new URL('../src/screens/RegisterScreen.tsx', import.meta.url), 'utf8');
const entry = await readFile(new URL('../src/components/AuthEntry.tsx', import.meta.url), 'utf8');
const authService = await readFile(new URL('../src/services/authService.ts', import.meta.url), 'utf8');

// Rendering and handler behavior run in register-screen.test.mjs. These checks
// retain service contracts and explicitly reject the retired screenshot shell.
assert.match(register, /label="用户名"/, 'registration keeps a persistent username label');
assert.match(register, /normalizeRegistrationUsername\(username\)/, 'registration uses the shared DOSO username validator');
assert.match(register, /trim\(\)\.toLowerCase\(\)/, 'registration normalizes usernames before submission');
assert.match(authService, /\^\[a-z0-9_\]\{3,24\}\$/, 'signup accepts only normalized DOSO usernames');
assert.match(authService, /用户名需为 3-24 位，只能包含小写字母、数字和下划线/, 'signup explains the username rules in Chinese');
assert.match(authService, /'account'.*'accounts'.*'admin'.*'administrator'.*'api'.*'auth'.*'doso'.*'help'/s, 'signup rejects the database reserved username set');
assert.match(authService, /'login'.*'me'.*'moderator'.*'null'.*'official'.*'register'.*'robot'.*'robotics'/s, 'signup keeps the middle of the reserved username set in sync');
assert.match(authService, /'root'.*'security'.*'signup'.*'staff'.*'support'.*'system'.*'undefined'/s, 'signup keeps the end of the reserved username set in sync');
assert.match(authService, /该用户名不可使用，请更换一个/, 'signup explains reserved usernames in Chinese');
assert.match(register, /maxLength=\{24\}/, 'registration prevents usernames longer than 24 characters');
assert.match(authService, /data: \{ username, display_name: username \}/, 'signup sends canonical and compatibility username metadata');
assert.match(register, /label="邮箱"/, 'registration keeps a persistent email label');
assert.match(register, /label="密码"/, 'registration keeps a persistent password label');
assert.doesNotMatch(register, /label="姓名"|placeholder="请输入姓名"/, 'registration does not call the username a personal name');
assert.doesNotMatch(register, /confirmPassword|确认密码|再次输入密码/, 'registration does not add a non-Figma confirmation field');
assert.doesNotMatch(register, /不等同于创建新的邮箱收件箱|注册即表示你同意/, 'registration removes the long implementation/legal paragraph');

assert.match(register, /<AuthEntry mode="register"/, 'registration uses the selected reference layout');
assert.match(entry, /accessibilityRole="header"/);
assert.match(entry, /background: appearance.canvas/, 'registration shares the established product canvas');
assert.match(entry, /getRegistrationLayout\(containerWidth/);
assert.match(entry, /onLayout=\{\(\{ nativeEvent \}\) => setContainerWidth\(nativeEvent.layout.width\)\}/);
assert.match(entry, /edges=\{\['top', 'left', 'right', 'bottom'\]\}/);
assert.doesNotMatch(register, /AuthPage|resizeMode="stretch"|position: 'absolute'/, 'form fields remain native flow layout');
assert.match(entry, /resizeMode="contain" source=\{images.thunderHero\}/, 'reuse the original Figma artwork, not rasterized UI');
assert.match(entry, /doso-auth-lockup-sky-v2\.png/);
assert.match(entry, /返回登录/);
assert.doesNotMatch(register, /忘记密码/);
assert.doesNotMatch(register, /AuthEntrySocial|onSocialLogin|activeSocialProvider/, 'registration temporarily offers email only');
assert.doesNotMatch(entry, />暂不可用<|>暂未开放<|下一步：邮箱验证/, 'availability stays semantic without unwanted visible subtext');
assert.match(register, /requestInFlightRef.current/, 'email submission and navigation share a same-tick lock');
assert.match(register, /if \(mountedRef.current\) setPending\(null\)/, 'async cleanup respects unmount');
assert.match(register, /registrationPasswordChecks\(password\)/, 'visible hints and validation share the same password rules');
assert.match(entry, /minHeight: 48/, 'email controls stay above the 44dp minimum');
console.log('DOSO redesigned registration structure and service contract PASS');
