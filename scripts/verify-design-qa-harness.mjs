import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const indexSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const rootSource = readFileSync(new URL('../src/design-qa/DesignQaRoot.tsx', import.meta.url), 'utf8');
const requestSource = readFileSync(new URL('../src/design-qa/request.ts', import.meta.url), 'utf8');
const captureSource = readFileSync(new URL('./capture-design-qa.mjs', import.meta.url), 'utf8');
const androidCaptureSource = readFileSync(new URL('./capture-design-qa-android.mjs', import.meta.url), 'utf8');
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8');

assert.match(indexSource, /const useDesignQa = __DEV__\s*&&/, '所有验收入口必须受 __DEV__ 保护');
assert.match(indexSource, /Platform\.OS === 'web'[\s\S]*isDesignQaRequested\(webDesignQaSearch\)/, 'Web 入口必须同时要求 Web 平台与显式 query');
assert.match(indexSource, /Platform\.OS !== 'web'[\s\S]*EXPO_PUBLIC_DESIGN_QA === '1'[\s\S]*EXPO_PUBLIC_DESIGN_QA_STAGE/, '原生验收入口必须同时要求非 Web、显式开关与页面 ID');
assert.match(indexSource, /EXPO_PUBLIC_DESIGN_QA_BROWSE === '1' \? '&qa-browse=1' : ''/, '原生交互浏览必须另有显式开关');
assert.match(indexSource, /isDesignQaRequested\(webDesignQaSearch\)/, 'Web 入口必须由 URL query 明确启用');
assert.match(requestSource, /get\('design-qa'\)\s*===\s*'1'/, '只接受 design-qa=1');

const stages = [
  'auth-login',
  'auth-register',
  'auth-email-otp',
  'auth-forgot-password',
  'auth-reset-password',
  'auth-username',
  'auth-display-name',
  'auth-mfa',
  'model-select',
  'main-home',
  'main-routes',
  'main-tasks',
  'main-analysis',
  'main-profile',
  'robot-control',
  'device-bind',
  'device-ble-discovery',
  'device-provisioning',
  'device-firmware',
  'account-security',
];

for (const stage of stages) {
  assert.match(requestSource, new RegExp(`'${stage}'`), `缺少 ${stage}`);
  assert.match(rootSource, new RegExp(`case '${stage}'`), `${stage} 未接入渲染分支`);
}

for (const disclosure of ['设计验收预览', '不连接真实后端', '不发送邮件', '不修改账号', '不发送机器人命令']) {
  assert.match(rootSource, new RegExp(disclosure), `缺少持续风险标识：${disclosure}`);
}

assert.doesNotMatch(rootSource, /from ['"]\.\.\/services\//, '验收根组件不得导入真实服务');
assert.doesNotMatch(rootSource, /<MfaSetupScreen/, 'MFA 验收不得挂载会触发真实 enrollment 的组件');
assert.match(rootSource, /example\.invalid/, '验收邮箱必须使用保留的无效域名，避免看起来像真实账户');
assert.match(rootSource, /MFA|双重验证/, 'MFA 不可用壳必须明确存在');
assert.match(rootSource, /canRecall=\{false\}/, '首页验收壳必须让召回保持禁用');
assert.match(rootSource, /const DESIGN_QA_REFERENCE_DATE = new Date\(2026, 7, 31, 12\)/, '验收日期必须固定，避免每日证据漂移');
const rootAst = ts.createSourceFile('DesignQaRoot.tsx', rootSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const headers = [];
function collectHeaders(node) {
  if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(rootAst) === 'AppHeader') headers.push(node);
  ts.forEachChild(node, collectHeaders);
}
collectHeaders(rootAst);
assert.ok(headers.length > 0, '主页面必须包含验收头部');
for (const header of headers) {
  const date = header.attributes.properties.find(attribute => attribute.name?.getText(rootAst) === 'referenceDate');
  assert.ok(date?.initializer && ts.isJsxExpression(date.initializer)
    && date.initializer.expression?.getText(rootAst) === 'DESIGN_QA_REFERENCE_DATE', '主页面头部必须使用固定验收日期');
}
assert.match(rootSource, /<TasksScreen[\s\S]*referenceDate=\{DESIGN_QA_REFERENCE_DATE\}/, '任务周历必须使用同一固定验收日期');
assert.match(rootSource, /batteryPercent=\{null\}/, '首页验收壳不得伪造可信电量');
assert.match(rootSource, /<MapScreen[\s\S]*controlAvailable=\{false\}[\s\S]*executorAvailable=\{false\}[\s\S]*onStartRoute=\{noop\}/, '路线验收壳必须保持真实执行能力关闭');
assert.match(rootSource, /<TasksScreen[\s\S]*controlAvailable=\{false\}[\s\S]*executorAvailable=\{false\}[\s\S]*onStartTask=\{noop\}/, '任务验收壳必须保持真实执行能力关闭');
assert.match(rootSource, /previewMode=\{!browsing && state !== 'trusted-empty'\}/, '截图可显示明确示例，交互浏览默认保持可信遥测空态');
assert.match(rootSource, /params.get\('qa-browse'\) === '1'/, '交互浏览需要显式开关');
assert.match(rootSource, /if \(!browsing\) return;[\s\S]*setSelectedStage\(stage\)/, '截图模式不能被点击改变页面');
assert.match(rootSource, /onChange=\{tab => onNavigate\(tabStages\[tab\]\)\}/, '底部导航需要接通浏览跳转');
assert.match(rootSource, /value=\{browsing && !hideDisclosure \? theme : null\}/, '主题覆盖仅限可见交互测试栏，隐藏捕获栏时跟随系统主题');
assert.match(rootSource, /diagnosticsDeviceClass="physical"/, '控制页验收壳必须使用真实硬件不可用态，不能启用诊断模拟器');
assert.match(rootSource, /canUseManualControl=\{false\}[\s\S]*canUseRouteMode=\{false\}[\s\S]*canUseTaskMode=\{false\}/, '控制页三种执行能力必须全部关闭');
assert.match(rootSource, /canOpenFirmwareUpdate=\{false\}[\s\S]*canOpenProvisioning=\{false\}/, '个人页配网与固件执行能力必须关闭');
assert.match(rootSource, /serialNumber="待绑定"/, '个人页不得伪造真实设备序列号');
assert.match(rootSource, /<BindDeviceScreen[\s\S]*onBind=\{noop\}/, '绑定页验收必须使用无副作用回调');
assert.doesNotMatch(rootSource, /BleDiscoveryScreen/, 'BLE 验收不得静态加载会初始化原生扫描模块的页面');
assert.match(rootSource, /不会请求附近设备权限或启动扫描/, 'BLE 不可用壳必须说明权限和扫描均未启动');
assert.match(rootSource, /<DeviceUnavailableScreen capability="provisioning" deviceName="THUNDER 01" onBack=\{\(\) => onNavigate\('main-profile'\)\}/, '配网页只允许返回个人页，不提供执行操作');
assert.match(rootSource, /<DeviceUnavailableScreen capability="firmware" deviceName="THUNDER 01" onBack=\{\(\) => onNavigate\('main-profile'\)\}/, '固件页只允许返回个人页，不提供执行操作');
assert.doesNotMatch(rootSource, /from ['"][^'"]*(?:provisioningGateway|firmwareUpdateGateway)/, '配网和固件验收不得导入包含模拟器的生命周期模块');
assert.doesNotMatch(rootSource, /simulatedProvisioningGateway|simulatedFirmwareUpdateGateway/, '验收根组件不得启用配网或固件模拟执行器');
assert.doesNotMatch(rootSource, /<AccountSecurityScreen/, '账号安全验收不得挂载会读取真实账户服务的组件');
assert.match(rootSource, /不会注册终端、发送心跳或读取真实登录方式/, '账号安全不可用壳必须说明被关闭的数据访问');
assert.match(requestSource, /allowedStates/, 'qa-state 必须使用有限白名单');
assert.doesNotMatch(requestSource, /'auth-forgot-password': \[[^\]]*'sent'/, '找回密码不得保留真实产品不可达的 sent 预览状态');
assert.doesNotMatch(rootSource, /sent=\{state === 'sent'\}/, '验收根组件不得向找回密码页注入不可达 sent 状态');
assert.match(rootSource, /testID="design-qa-disclosure"/, '截图工具必须能稳定隐藏持续风险标识，而不是依赖脆弱的文本遍历');
assert.match(rootSource, /testID="design-qa-preview"/, '截图工具必须等待显式预览根节点');
assert.match(rootSource, /<View\s+accessible\s+accessibilityLabel=\{`design-qa-preview:/, '原生预览根节点必须显式加入 Android 无障碍树');
assert.match(rootSource, /importantForAccessibility="yes"/, '原生预览就绪标记必须声明 Android 无障碍优先级');
assert.match(rootSource, /accessibilityLabel=\{`design-qa-preview:\$\{request\.stage \?\? 'invalid'\}:\$\{request\.state \?\? 'invalid'\}`\}/, '原生截图工具必须能核对精确页面与状态，不能只接受任意 QA 预览');
assert.match(captureSource, /width:\s*390[\s\S]*height:\s*844|height:\s*844[\s\S]*width:\s*390/, '截图工具必须生成 390x844 竖屏证据');
assert.match(captureSource, /width:\s*844[\s\S]*height:\s*390|height:\s*390[\s\S]*width:\s*844/, '截图工具必须生成 844x390 横屏证据');
assert.match(captureSource, /prefers-color-scheme/, '截图工具必须显式模拟浅色与深色主题');
assert.match(captureSource, /captureBeyondViewport:\s*false/, '截图工具不得截取基准 viewport 以外内容');
assert.match(captureSource, /querySelectorAll\('\*'\)[\s\S]*scrollTop = 0/, '截图前必须归零内部滚动容器，避免浏览器恢复位置造成伪缺失');
assert.match(captureSource, /overflowAnchor = 'none'/, '截图前必须禁用浏览器滚动锚定，避免异步布局改变证据裁切');
assert.match(captureSource, /child\.id !== 'root'[\s\S]*display = 'none'/, '截图必须排除 Expo 等开发期 body 浮层');
assert.match(captureSource, /\.__expo_fast_refresh/, '截图必须显式隐藏 Expo Web fast-refresh 浮层');
assert.match(captureSource, /new MutationObserver\(hideDevelopmentOverlays\)/, '截图必须持续隐藏 HMR 重新挂载的 Expo 浮层');
assert.match(captureSource, /app-capture\.json/, '截图工具必须记录尺寸和 SHA-256，供最终强证据绑定');
assert.match(captureSource, /createHash\('sha256'\)/, '截图元数据必须使用 SHA-256');
assert.match(androidCaptureSource, /previewDumpMatches\(options, stageSpec, lastXml\)/, 'Android 截图工具必须消费精确 stage/state 与 package readiness 条件');
assert.match(androidCaptureSource, /match\(\/<node\\b\[\^>\]\*>\/gi\)[\s\S]*nodePackage === options\.packageName && nodeDescription === expectedMarker/, 'Android 截图工具必须把 package 与 marker 绑定到同一个 UI 节点');
assert.match(androidCaptureSource, /stableMatches\s*>=\s*2/, 'Android 截图工具必须连续两次确认精确 readiness，拒绝过期 UI dump');
assert.match(androidCaptureSource, /decodePng\(screenshotPath\)/, 'Android 截图工具必须完整解码 PNG，不能只检查文件头');
assert.match(androidCaptureSource, /waitForPortClosedFn\(options\.port\)[\s\S]*childHasExited\(child\)/, 'Android 截图工具必须同时确认 Metro 端口关闭和子进程退出');
assert.match(androidCaptureSource, /restoreDeviceState[\s\S]*readDeviceStateFn\(options\)[\s\S]*displayStatesEqual/, 'Android 截图工具必须重读并核对显示状态恢复');
assert.match(packageSource, /"design-qa:capture"\s*:/, 'package.json 必须提供可重复执行的截图入口');
assert.match(packageSource, /"design-qa:capture:android"\s*:/, 'package.json 必须提供可重复执行的 Android 截图入口');
assert.match(packageSource, /"test:design-qa-android-capture"\s*:/, 'Android 截图生命周期必须纳入可重复单测入口');
assert.match(packageSource, /verify-design-qa-request\.mts/, 'QA query 必须运行行为测试，而非只做源码正则检查');

console.log('Design QA harness verification PASS');
console.log(`${stages.length} safe stages are gated by __DEV__ plus explicit Web query or native capture env; request parser and exact viewport capture are reproducible.`);
