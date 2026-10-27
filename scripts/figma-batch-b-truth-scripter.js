// Targeted, idempotent Batch B truth sync. Preserves all bound frame IDs.
const frames = {
  'auth-login': ['139:5200', '139:2728', '139:7722'],
  'auth-register': ['139:5247', '139:2773', '139:7784'],
  'model-select': ['139:5298', '139:2821', '139:7848'],
  'main-analysis': ['139:6953', '139:4440', '139:10757'],
  'main-profile': ['139:7104', '139:4589', '139:10918'],
  'robot-control': ['139:6520', '139:4019', '139:8596'],
};

const replacements = new Map(Object.entries({
  'Forgot password?': '忘记密码？',
  'Email ': '邮箱',
  'person@example.invalid': '请输入邮箱',
  'Log in': '登录',
  'Password': '密码',
  '**************': '请输入密码',
  'or': '或使用其他方式继续',
  'Continue with Apple': '第三方登录暂不可用',
  'New to DOSO?': '还没有账户？',
  'Create account': '创建账户',
  'Sign in to connect and control your robot.': '登录你的 DOSO 账户',
  'Welcome back ': '欢迎回来',
  'Full Name': '用户名',
  'Enter your name': '3-24 位字母、数字或下划线',
  'Email Address': '电子邮箱',
  'Enter your email address': '请输入电子邮箱',
  'Create a password': '创建密码',
  'Already have an account?': '已有账户？',
  'Enter your details to connect and control your robot.': '填写信息，开始连接你的机器人',
  'Create your DOSO account': '创建 DOSO 账户',
  'Skip': '跳过',
  'Choose your robot': '选择机器人',
  'Find your model by name or category.': '按名称或类别查找机型',
  'Search model name': '搜索机型名称',
  '搜索机型名称': '搜索机器人型号',
  'All': '全部',
  'Quadruped': '四足',
  'Wheeled': '轮式',
  'Indoor': '室内',
  'Outdoor': '室外',
  '12 models available': '可预览 4 款机型',
  '可选 12 款机型': '可预览 4 款机型',
  'Compatible first': '兼容优先',
  '兼容优先': '按当前筛选',
  'All-terrain inspection robot': '全地形轮足巡检机器人',
  '全地形巡检机器人': '全地形轮足巡检机器人',
  'Compact indoor patrol robot': '轻量灵活的室内机器人',
  '紧凑型室内巡逻机器人': '轻量灵活的室内机器人',
  'Heavy-duty security robot': '专业级复杂地形作业',
  '重型安防机器人': '专业级复杂地形作业',
  'SCOUT S1': 'SCOUT',
  'Quiet mapping and patrol robot': '紧凑型智能侦察伙伴',
  '静音建图巡航机器人': '紧凑型智能侦察伙伴',
  'Continue': '进入预览',
  '继续': '进入预览',
  'Sun': '周日',
  'Mon': '周一',
  'Tue': '周二',
  'Wed': '周三',
  'Thu': '周四',
  'Fri': '周五',
  'Sat': '周六',
  'April': '四月',
  'Performance': '性能',
  'Mission Activity': '任务活动 · 预览',
  'Completed mission trend': '预览任务趋势',
  'vs previous period': '较上一周期',
  'Nominal': '预览 · 正常',
  'Total Distance': '总距离',
  'Missions': '任务',
  'Uptime': '运行时长',
  'Avg Temp': '平均温度',
  'Today 25 Now\n': '今天 · 25 日',
  'Hello，Anny': '你好，Anny',
  'My Device': '我的设备',
  'Manage Thunder-07 connection and settings.': '管理 THUNDER 01 的连接与设备设置',
  'Manage Thunder-07 connection and settings': '管理 THUNDER 01 的连接与设备设置',
  'Firmware': '固件',
  'v2.4.1': '待同步',
  '6.4 h': '—',
  '6.4 小时': '—',
  'Last Sync': '上次同步',
  '2 min ago': '尚未同步',
  '2 分钟前': '尚未同步',
  'Online': '离线',
  '在线': '离线',
  'Thunder-07': 'THUNDER 01',
  'Wheeled Quadruped Robot': '室外四足机器人',
  '轮式四足机器人': '室外四足机器人',
  'SN · DS07-8E4F-A912': '序列号 · 待绑定',
  '序列号 · DS07-8E4F-A912': '序列号 · 待绑定',
  '50%': '—',
  'Connection': '连接',
  'Connected': '当前离线',
  '已连接': '当前离线',
  'Retry': '状态说明',
  '重试': '状态说明',
  'Disconnect': '当前离线',
  '断开连接': '当前离线',
  'Settings': '设置',
  'Connection Management': '连接管理',
  'Scan, pair and manage devices': '真实安全配网能力未接入',
  '扫描、配对和管理设备': '真实安全配网能力未接入',
  'Safety Lock': '安全锁',
  'Enabled - motion commands blocked': '只读 · 实体执行器尚未接入',
  '已启用 · 已阻止移动指令': '只读 · 实体执行器尚未接入',
  'Status Alerts': '状态警报',
  'Offline, low battery & anomaly alerts': '偏好已开启 · 通知服务待接入',
  '接收离线、低电量与异常警报': '偏好已开启 · 通知服务待接入',
  '120 m': '待同步',
  '120 米': '待同步',
  '34%': '—',
  '60%': '—',
  'Robot Health': '机器人状态',
  '12 / 12 sensors online': '设备离线，可信遥测尚未接入',
  '12 / 12 个传感器在线': '设备离线，可信遥测尚未接入',
  '• All systems ready': '实时状态不可用',
  '所有系统运行正常': '实时状态不可用',
  '94%': '—',
  'Control Mode': '控制模式',
  'Choose operation mode': '选择操作模式',
  'Manual': '手动',
  'Patrol': '巡航',
  'Mission': '任务',
  'Control Center': '控制中心',
}));

const iconPaths = [
  ['Apple', '#111111', 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04c-2.04.027-3.91 1.183-4.961 3.014c-2.117 3.675-.546 9.103 1.519 12.09c1.013 1.454 2.208 3.09 3.792 3.039c1.52-.065 2.09-.987 3.935-.987c1.831 0 2.35.987 3.96.948c1.637-.026 2.676-1.48 3.676-2.948c1.156-1.688 1.636-3.325 1.662-3.415c-.039-.013-3.182-1.221-3.22-4.857c-.026-3.04 2.48-4.494 2.597-4.559c-1.429-2.09-3.623-2.324-4.39-2.376c-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83c-1.207.052-2.662.805-3.532 1.818c-.78.896-1.454 2.338-1.273 3.714c1.338.104 2.715-.688 3.559-1.701'],
  ['WeChat', '#07C160', 'M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213c0 .163.13.295.29.295a.33.33 0 0 0 .167-.054l1.903-1.114a.86.86 0 0 1 .717-.098a10.2 10.2 0 0 0 2.837.403c.276 0 .543-.027.811-.05c-.857-2.578.157-4.972 1.932-6.446c1.703-1.415 3.882-1.98 5.853-1.838c-.576-3.583-4.196-6.348-8.596-6.348'],
  ['QQ', '#12B7F5', 'M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673c.54.065 2.103-2.472 2.103-2.472c0 1.469.756 3.387 2.394 4.771c-.612.188-1.363.479-1.845.835c-.434.32-.379.646-.301.778c.343.578 5.883.369 7.482.189c1.6.18 7.14.389 7.483-.189c.078-.132.132-.458-.301-.778c-.483-.356-1.233-.646-1.846-.836c1.637-1.384 2.393-3.302 2.393-4.771c0 0 1.563 2.537 2.103 2.472c.251-.03.581-1.39-.438-4.673'],
];

async function replaceText(root) {
  const nodes = root.findAll((node) => node.type === 'TEXT' && replacements.has(node.characters));
  const fonts = nodes.map((node) => node.fontName).filter((font) => font && typeof font.family === 'string' && typeof font.style === 'string');
  await Promise.all([...new Map(fonts.map((font) => [`${font.family}/${font.style}`, font])).values()].map((font) => figma.loadFontAsync(font)));
  for (const node of nodes) {
    const next = replacements.get(node.characters);
    if (next !== undefined) node.characters = next;
  }
}

function addUnavailableSocialRow(root) {
  if (root.findOne((node) => node.name === 'DOSO Social Providers / Unavailable')) return;
  const anchor = root.findOne((node) => node.type === 'TEXT' && node.characters === '第三方登录暂不可用');
  if (!anchor || !anchor.parent || !('appendChild' in anchor.parent)) return;
  anchor.visible = false;
  const row = figma.createFrame();
  row.name = 'DOSO Social Providers / Unavailable';
  row.resize(132, 40);
  row.layoutMode = 'HORIZONTAL';
  row.primaryAxisAlignItems = 'SPACE_BETWEEN';
  row.counterAxisAlignItems = 'CENTER';
  row.fills = [];
  row.opacity = 0.38;
  if ('layoutMode' in anchor.parent && anchor.parent.layoutMode !== 'NONE') row.layoutPositioning = 'ABSOLUTE';
  anchor.parent.appendChild(row);
  row.x = Math.max(0, (anchor.parent.width - row.width) / 2);
  row.y = Math.max(0, (anchor.parent.height - row.height) / 2);
  for (const [name, color, path] of iconPaths) {
    const icon = figma.createNodeFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><path fill="${color}" d="${path}"/></svg>`);
    icon.name = `${name} / Unavailable`;
    icon.resize(28, 28);
    row.appendChild(icon);
  }
}

async function hideDuplicateLandscapeModels(root) {
  const names = ['THUNDER 01', 'THUNDER MINI', 'THUNDER PRO', 'SCOUT'];
  const seen = new Set();
  const modelNames = root.findAll((node) => node.type === 'TEXT' && names.includes(node.characters));
  for (const label of modelNames) {
    let card = label.parent;
    while (card && card.parent && card.parent.id !== root.id && Math.abs(card.parent.width - card.width) < 1 && Math.abs(card.parent.height - card.height) < 1) card = card.parent;
    if (!card) continue;
    if (label.characters === 'SCOUT' && 'findAll' in card) {
      for (const category of card.findAll((node) => node.type === 'TEXT' && node.characters === '轮式')) {
        if (category.fontName && typeof category.fontName.family === 'string') await figma.loadFontAsync(category.fontName);
        category.characters = '四足';
      }
    }
    if (root.width < 800) continue;
    if (seen.has(label.characters)) card.visible = false;
    else seen.add(label.characters);
  }
}

for (const [page, ids] of Object.entries(frames)) {
  for (const id of ids) {
    const root = await figma.getNodeByIdAsync(id);
    if (!root || !('findAll' in root)) throw new Error(`Missing Batch B frame ${page}/${id}`);
    await replaceText(root);
    if (page === 'auth-login' || page === 'auth-register') addUnavailableSocialRow(root);
    if (page === 'model-select') await hideDuplicateLandscapeModels(root);
    if (page === 'robot-control') {
      for (const label of root.findAll((node) => node.type === 'TEXT' && ['手动', '巡航', '任务'].includes(node.characters))) {
        if (label.parent && 'opacity' in label.parent) label.parent.opacity = 0.55;
      }
    }
    root.setPluginData('dosoTruthSync', 'batch-b/2026-09-01.1');
  }
}

figma.currentPage.selection = (await Promise.all(frames['auth-login'].map((id) => figma.getNodeByIdAsync(id)))).filter(Boolean);
figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection);
if (typeof figma.commitUndo === 'function') figma.commitUndo();
console.log(JSON.stringify({ status: 'DOSO_BATCH_B_TRUTH_PASS', preservedFrameIds: Object.values(frames).flat() }));
