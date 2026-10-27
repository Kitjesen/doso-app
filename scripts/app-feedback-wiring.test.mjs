import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function all(predicate, root = ast) {
  const found = [];
  function visit(node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(root); return found;
}
const name = node => node.tagName?.getText(ast);
const attribute = (node, key) => node.attributes.properties.find(item => item.name?.text === key);

test('production feedback is between the main header and body, not a global overlay over navigation', () => {
  const main = all(ts.isJsxElement).find(node => name(node.openingElement) === 'SafeAreaView'
    && node.children.some(child => ts.isJsxSelfClosingElement(child) && name(child) === 'AppHeader'));
  assert.ok(main);
  const children = main.children.filter(node => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node));
  const tags = children.map(node => name(node.openingElement ?? node));
  assert.deepEqual(tags, ['AppHeader', 'AppToast', 'View', 'BottomNav']);
  const feedback = children[1];
  assert.ok(attribute(feedback, 'withinSafeArea'), 'main shell already applies safe area insets');
  const fallback = all(ts.isConditionalExpression).find(node => node.condition.getText(ast) === "stage !== 'main'"
    && all(ts.isJsxSelfClosingElement, node.whenTrue).some(node => name(node) === 'AppToast'));
  assert.ok(fallback, 'non-main feedback remains available without a second main toast');
});

test('user-opened bell information persists while ordinary feedback retains its existing expiry', () => {
  const notify = all(ts.isVariableDeclaration).find(node => node.name.getText(ast) === 'notify');
  const callback = notify.initializer.arguments[0];
  const compiled = ts.transpileModule(`(${callback.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const timer = { current: null }, cleared = [], scheduled = [], notices = [];
  const invoke = vm.runInNewContext(compiled, {
    noticeTimer: timer, setNotice: value => notices.push(value),
    clearTimeout: id => cleared.push(id),
    setTimeout: (callback, milliseconds) => { scheduled.push({ callback, milliseconds }); return scheduled.length; },
  });
  invoke('保存成功', '资料已保存');
  assert.equal(scheduled[0].milliseconds, 3200);
  invoke('通知服务尚未接入', '当前不能确认是否存在新的设备告警。', 'info', null);
  assert.deepEqual(cleared, [1]);
  assert.equal(scheduled.length, 1, 'opening bell must not expire long information in 3.2 seconds');
  assert.equal(timer.current, null);
  assert.equal(notices.at(-1).tone, 'info');
  const header = all(ts.isJsxSelfClosingElement).find(node => name(node) === 'AppHeader' && attribute(node, 'flow'));
  const handler = attribute(header, 'onNotifications').initializer.expression;
  let bellArguments;
  vm.runInNewContext(ts.transpileModule(`(${handler.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    notify: (...args) => { bellArguments = args; },
    notificationUnavailableNotice: { title: '通知服务尚未接入', message: '当前不能确认是否存在新的设备告警。', tone: 'info' },
  })();
  assert.equal(bellArguments[3], null);
});
