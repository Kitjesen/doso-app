const ids = {
  analysis: ['139:6953', '139:4440', '139:10757'],
  profile: ['139:7104', '139:4589', '139:10918'],
  control: ['139:6520', '139:4019', '139:8596'],
};

const neutralLight = { r: 0.55, g: 0.59, b: 0.64 };
const neutralDark = { r: 0.68, g: 0.72, b: 0.77 };
const dangerLight = { r: 0.84, g: 0.22, b: 0.24 };
const dangerDark = { r: 1, g: 0.55, b: 0.56 };
const solid = (color, opacity = 1) => ({ type: 'SOLID', color, opacity });
const isGreen = (paint) => paint && paint.type === 'SOLID' && paint.color.g > 0.55 && paint.color.g > paint.color.r * 1.3 && paint.color.g > paint.color.b * 1.15;

function repaintGreen(root, color) {
  const nodes = [root, ...root.findAll(() => true)];
  for (const node of nodes) {
    if ('fills' in node && Array.isArray(node.fills) && node.fills.some(isGreen)) node.fills = node.fills.map((paint) => isGreen(paint) ? solid(color, paint.opacity ?? 1) : paint);
    if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.some(isGreen)) node.strokes = node.strokes.map((paint) => isGreen(paint) ? solid(color, paint.opacity ?? 1) : paint);
  }
}

function directChildContaining(root, value) {
  return root.children.find((child) => 'findAll' in child && child.findAll((node) => node.type === 'TEXT' && node.characters === value).length > 0);
}

async function setText(root, from, to) {
  for (const node of root.findAll((candidate) => candidate.type === 'TEXT' && candidate.characters === from)) {
    if (node.fontName && typeof node.fontName.family === 'string') await figma.loadFontAsync(node.fontName);
    node.characters = to;
  }
}

for (const id of ids.analysis) {
  const root = await figma.getNodeByIdAsync(id);
  if (!root || !('findAll' in root)) throw new Error(`Missing analysis frame ${id}`);
  await setText(root, '正常', '预览 · 正常');
  await setText(root, '任务活动 · 预览', '任务活动');
  await setText(root, '已完成任务趋势', '预览数据，不代表真实设备记录');
  await setText(root, '预览任务趋势', '预览数据，不代表真实设备记录');
  await setText(root, '—', '6.4 小时');
  await setText(root, '待同步', '32℃');
  await setText(root, '12.8 km', '12.8 公里');
  if (root.width > 800 && root.getPluginData('dosoSafeAreaShift') !== '48') {
    const performance = directChildContaining(root, '总距离');
    const monthly = directChildContaining(root, '四月');
    if (performance) performance.x += 48;
    if (monthly) monthly.x += 48;
    root.setPluginData('dosoSafeAreaShift', '48');
  }
  if (root.width > 800 && root.getPluginData('dosoLandscapeHeaderShift') !== '-48') {
    const left = root.children.find((node) => node.name === '左侧规范');
    if (left && 'children' in left) {
      for (const child of left.children) if (child.name !== 'Container') child.x -= 48;
      root.setPluginData('dosoLandscapeHeaderShift', '-48');
    }
  }
  if (id === '139:4440' && root.getPluginData('dosoDarkMonthlyAlign') !== '2026-09-01.1') {
    const monthly = directChildContaining(root, '四月');
    const week = monthly && 'children' in monthly ? monthly.children.find((node) => node.name === 'Resting heart rate- week') : null;
    if (week && 'children' in week) {
      const date = week.children.find((node) => node.name === 'Date');
      const chart = week.children.find((node) => node.name === 'Container');
      if (date) { date.x -= 4; date.y -= 9; }
      if (chart) { chart.x -= 6; chart.y -= 1; }
      root.setPluginData('dosoDarkMonthlyAlign', '2026-09-01.1');
    }
  }
  root.setPluginData('dosoVisualTruth', 'analysis/2026-09-01.1');
}

for (let index = 0; index < ids.profile.length; index += 1) {
  const id = ids.profile[index];
  const dark = index === 1;
  const root = await figma.getNodeByIdAsync(id);
  if (!root || !('findAll' in root)) throw new Error(`Missing profile frame ${id}`);
  await setText(root, '当前离线', '连接说明');
  const connectionLabels = root.findAll((node) => node.type === 'TEXT' && ['连接说明', '状态说明'].includes(node.characters));
  if (connectionLabels.length > 1) {
    const last = connectionLabels[connectionLabels.length - 1];
    if (last.fontName && typeof last.fontName.family === 'string') await figma.loadFontAsync(last.fontName);
    last.characters = '当前离线';
  }
  const deviceCard = directChildContaining(root, '序列号 · 待绑定');
  if (deviceCard) repaintGreen(deviceCard, dark ? neutralDark : neutralLight);
  for (const label of root.findAll((node) => node.type === 'TEXT' && ['连接说明', '状态说明', '当前离线'].includes(node.characters))) {
    if (!label.parent || !('fills' in label.parent)) continue;
    const danger = label.characters === '当前离线';
    label.parent.fills = [solid(danger ? (dark ? dangerDark : dangerLight) : (dark ? neutralDark : neutralLight), danger ? 0.1 : 0.08)];
    label.fills = [solid(danger ? (dark ? dangerDark : dangerLight) : (dark ? neutralDark : neutralLight))];
  }
  root.setPluginData('dosoVisualTruth', 'profile/2026-09-01.1');
}

for (let index = 0; index < ids.control.length; index += 1) {
  const id = ids.control[index];
  const dark = index === 1;
  const root = await figma.getNodeByIdAsync(id);
  if (!root || !('findAll' in root)) throw new Error(`Missing control frame ${id}`);
  repaintGreen(root, dark ? neutralDark : neutralLight);
  root.setPluginData('dosoVisualTruth', 'control/2026-09-01.1');
}

figma.currentPage.selection = (await Promise.all(ids.analysis.map((id) => figma.getNodeByIdAsync(id)))).filter(Boolean);
figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection);
if (typeof figma.commitUndo === 'function') figma.commitUndo();
console.log('DOSO_BATCH_B_VISUAL_TRUTH_PASS');
