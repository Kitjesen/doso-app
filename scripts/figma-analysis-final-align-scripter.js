const frames = [
  { id: '139:6953', dark: false, landscape: false },
  { id: '139:4440', dark: true, landscape: false },
  { id: '139:10757', dark: false, landscape: true },
];
const icons = ['home', 'map', 'tasks', 'analysis', 'profile'];
const imageHashes = {};
for (const icon of icons) {
  const response = await fetch(`http://127.0.0.1:4182/asset/nav-${icon}.png`);
  if (!response.ok) throw new Error(`Missing nav-${icon}.png`);
  imageHashes[icon] = figma.createImage(new Uint8Array(await response.arrayBuffer())).hash;
}
for (const scheme of ['light', 'dark']) {
  const response = await fetch(`http://127.0.0.1:4182/asset/analysis-chart-${scheme}.png`);
  if (!response.ok) throw new Error(`Missing analysis-chart-${scheme}.png`);
  imageHashes[`chart-${scheme}`] = figma.createImage(new Uint8Array(await response.arrayBuffer())).hash;
}

const hex = (value) => ({
  r: parseInt(value.slice(1, 3), 16) / 255,
  g: parseInt(value.slice(3, 5), 16) / 255,
  b: parseInt(value.slice(5, 7), 16) / 255,
});
const solid = (value) => ({ type: 'SOLID', color: hex(value) });
const nodeDate = (value) => /^今天 ·/.test(value);

function addTintedIcon(root, icon, x, y, color) {
  const name = `DOSO Nav / ${icon} / Source PNG`;
  if (root.findOne((node) => node.name === name)) return;
  const mask = figma.createRectangle();
  mask.name = `${name} / Mask`;
  mask.resize(22, 22);
  mask.fills = [{ type: 'IMAGE', imageHash: imageHashes[icon], scaleMode: 'FIT' }];
  mask.isMask = true;
  const tint = figma.createRectangle();
  tint.name = `${name} / Tint`;
  tint.resize(22, 22);
  tint.fills = [solid(color)];
  const group = figma.group([mask, tint], root);
  group.name = name;
  group.x = x;
  group.y = y;
}

for (const frame of frames) {
  const root = await figma.getNodeByIdAsync(frame.id);
  if (!root || !('findAll' in root)) throw new Error(`Missing analysis frame ${frame.id}`);
  for (const oldIcon of root.findAll((node) => node.width < 30 && node.height < 30 && /Home-two|Map-draw|Align-text|Workbench|Frame 1618872684/.test(node.name))) oldIcon.opacity = 0;
  const positions = frame.landscape
    ? [[784, 79], [784, 140], [784, 201], [784, 262], [784, 323]]
    : [[49, 778], [117, 778], [184, 778], [252, 778], [320, 778]];
  icons.forEach((icon, index) => addTintedIcon(root, icon, positions[index][0], positions[index][1], icon === 'analysis' ? '#49F58B' : frame.dark ? '#F7F9FC' : '#728078'));
  for (const node of root.findAll((candidate) => candidate.type === 'TEXT' && candidate.characters === '你好，Anny')) {
    if (node.fontName && typeof node.fontName.family === 'string') await figma.loadFontAsync(node.fontName);
    node.characters = '你好，DOSO Demo';
  }
  for (const node of root.findAll((candidate) => candidate.type === 'TEXT' && nodeDate(candidate.characters))) {
    if (node.fontName && typeof node.fontName.family === 'string') await figma.loadFontAsync(node.fontName);
    node.characters = '今天 · 8 月 31 日';
  }
  const chart = root.findAll((node) => node.type === 'FRAME' && node.name === 'Container' && node.findAll((child) => child.type === 'TEXT').length === 7).find((node) => ['周一', '周二', '周三', '周四', '周五', '周六', '周日'].every((day) => node.findAll((child) => child.type === 'TEXT' && child.characters === day).length));
  if (chart && !chart.findOne((node) => node.name === 'DOSO Analysis Chart / Source PNG')) {
    for (const child of chart.children) if (!('findAll' in child) || child.findAll((node) => node.type === 'TEXT').length === 0) child.visible = false;
    const image = figma.createRectangle();
    image.name = 'DOSO Analysis Chart / Source PNG';
    image.resize(chart.width, 98);
    image.fills = [{ type: 'IMAGE', imageHash: imageHashes[frame.dark ? 'chart-dark' : 'chart-light'], scaleMode: 'FILL' }];
    chart.appendChild(image);
    image.x = 0;
    image.y = 10;
  }
  root.setPluginData('dosoNavSourcePng', '2026-09-01.1');
}

const darkRoot = await figma.getNodeByIdAsync('139:4440');
if (darkRoot && 'findAll' in darkRoot && darkRoot.getPluginData('dosoDarkWeekAlign') !== '2026-09-01.1') {
  const monthly = darkRoot.children.find((node) => 'findAll' in node && node.findAll((child) => child.type === 'TEXT' && child.characters === '四月').length > 0);
  const week = monthly && 'children' in monthly ? monthly.children.find((node) => node.name === 'Resting heart rate- week') : null;
  const date = week && 'children' in week ? week.children.find((node) => node.name === 'Date') : null;
  const chart = week && 'children' in week ? week.children.find((node) => node.name === 'Container') : null;
  if (date && 'children' in date) {
    const dateRow = date.children.find((node) => 'findAll' in node && !node.findAll((child) => child.type === 'TEXT' && child.characters === '四月').length && node.findAll((child) => child.type === 'TEXT').length >= 10);
    if (dateRow) { dateRow.x -= 8; dateRow.resizeWithoutConstraints(dateRow.width + 16, dateRow.height); }
    for (const child of date.children) if (child.x > 200 && child.y < 70) child.x += 10;
  }
  if (chart) chart.resizeWithoutConstraints(328, chart.height);
  darkRoot.setPluginData('dosoDarkWeekAlign', '2026-09-01.1');
}

figma.currentPage.selection = (await Promise.all(frames.map((frame) => figma.getNodeByIdAsync(frame.id)))).filter(Boolean);
figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection);
if (typeof figma.commitUndo === 'function') figma.commitUndo();
console.log('DOSO_ANALYSIS_FINAL_ALIGN_PASS');
