const targets = [
  { id: '139:7104', state: 'light', neutral: { r: 0.55, g: 0.59, b: 0.64 }, danger: { r: 0.84, g: 0.22, b: 0.24 } },
  { id: '139:4589', state: 'dark', neutral: { r: 0.68, g: 0.72, b: 0.77 }, danger: { r: 1, g: 0.55, b: 0.56 } },
  { id: '139:10918', state: 'landscape', neutral: { r: 0.55, g: 0.59, b: 0.64 }, danger: { r: 0.84, g: 0.22, b: 0.24 } },
];
const requestedState = 'all';
const selectedTargets = requestedState === 'all'
  ? targets
  : targets.filter((target) => target.state === requestedState);
if (selectedTargets.length === 0) throw new Error(`Unknown profile state: ${requestedState}`);

const solid = (color, opacity = 1) => ({ type: 'SOLID', color, opacity });
const isGreen = (color) => color
  && color.g > 0.5
  && color.g > color.r * 1.2
  && color.g > color.b * 1.08;
const neutralizePaint = (paint, color) => {
  if (paint.type === 'SOLID' && isGreen(paint.color)) {
    return solid(color, paint.opacity ?? 1);
  }
  if (paint.type.startsWith('GRADIENT_') && paint.gradientStops.some((stop) => isGreen(stop.color))) {
    return {
      ...paint,
      gradientStops: paint.gradientStops.map((stop) => isGreen(stop.color)
        ? { ...stop, color: { ...color, a: stop.color.a } }
        : stop),
    };
  }
  return paint;
};

const frames = await Promise.all(selectedTargets.map((target) => figma.getNodeByIdAsync(target.id)));
const missingFrameIds = selectedTargets.filter((_, index) => !frames[index]).map((target) => target.id);
if (missingFrameIds.length > 0) {
  throw new Error(`Missing profile frames: ${missingFrameIds.join(', ')}`);
}

const textNodes = frames.flatMap((frame, index) => {
  if (!('findAllWithCriteria' in frame)) {
    throw new Error(`Profile target ${selectedTargets[index].id} cannot be traversed`);
  }
  return frame.findAllWithCriteria({ types: ['TEXT'] });
});
const fontMap = new Map();
for (const node of textNodes) {
  for (const segment of node.getStyledTextSegments(['fontName'])) {
    const fontName = segment.fontName;
    fontMap.set(`${fontName.family}\u0000${fontName.style}`, fontName);
  }
}
await Promise.all([...fontMap.values()].map((fontName) => figma.loadFontAsync(fontName)));
const targetFonts = {
  black: { family: 'Noto Sans SC', style: 'Black' },
  bold: { family: 'Noto Sans SC', style: 'Bold' },
  medium: { family: 'Noto Sans SC', style: 'Medium' },
  regular: { family: 'Noto Sans SC', style: 'Regular' },
};
await Promise.all(Object.values(targetFonts).map((fontName) => figma.loadFontAsync(fontName)));

const getTargetFont = (node) => {
  const current = node.getStyledTextSegments(['fontName'])[0]?.fontName;
  const style = current && typeof current.style === 'string' ? current.style : 'Regular';
  if (style.includes('Extra Bold') || style.includes('Black')) return targetFonts.black;
  if (style.includes('Semi Bold') || style.includes('Bold')) return targetFonts.bold;
  if (style.includes('Medium')) return targetFonts.medium;
  return targetFonts.regular;
};

const mutatedNodeIds = new Set();
const summaries = [];
const textChanges = new Map([
  ['你好，Anny', '你好，DOSO Demo'],
  ['Hello，Anny', '你好，DOSO Demo'],
  ['今天 · 25 日', '今天 · 8 月 31 日'],
  ['Today 25 Now', '今天 · 8 月 31 日'],
  ['My Device', '我的设备'],
  ['Manage Thunder-07 connection and settings.', '管理 THUNDER 01 的连接与设备设置'],
  ['管理 Thunder-07 的连接与设备设置', '管理 THUNDER 01 的连接与设备设置'],
  ['Firmware', '固件'],
  ['v2.4.1', '待同步'],
  ['Uptime', '运行时长'],
  ['6.4 h', '—'],
  ['6.4 小时', '—'],
  ['Last Sync', '上次同步'],
  ['2 min ago', '尚未同步'],
  ['2 分钟前', '尚未同步'],
  ['Online', '离线'],
  ['在线', '离线'],
  ['Thunder-07', 'THUNDER 01'],
  ['Wheeled Quadruped Robot', '室外四足机器人'],
  ['轮式四足机器人', '室外四足机器人'],
  ['SN · DS07-8E4F-A912', '序列号 · 待绑定'],
  ['序列号 · DS07-8E4F-A912', '序列号 · 待绑定'],
  ['50%', '—'],
  ['Battery', '待同步'],
  ['电量', '待同步'],
  ['Connection', '连接'],
  ['Connected', '连接说明'],
  ['已连接', '连接说明'],
  ['Retry', '状态说明'],
  ['重试', '状态说明'],
  ['Disconnect', '当前离线'],
  ['断开连接', '当前离线'],
  ['Settings', '设置'],
  ['Connection Management', '连接管理'],
  ['Scan, pair and manage devices', '真实安全配网能力未接入'],
  ['扫描、配对和管理设备', '真实安全配网能力未接入'],
  ['Safety Lock', '安全锁'],
  ['Enabled - motion commands blocked', '只读 · 实体执行器尚未接入'],
  ['已启用 · 已阻止移动指令', '只读 · 实体执行器尚未接入'],
  ['Status Alerts', '状态警报'],
  ['Offline, low battery & anomaly alerts', '偏好已开启 · 通知服务待接入'],
  ['接收离线、低电量与异常警报', '偏好已开启 · 通知服务待接入'],
]);

for (let index = 0; index < selectedTargets.length; index += 1) {
  const target = selectedTargets[index];
  const root = frames[index];
  const rootTexts = root.findAllWithCriteria({ types: ['TEXT'] });
  let changedTextCount = 0;
  let neutralizedPaintCount = 0;

  for (const node of rootTexts) {
    const replacement = textChanges.get(node.characters) ?? textChanges.get(node.characters.trim());
    if (!replacement) continue;
    node.characters = replacement;
    node.fontName = getTargetFont(node);
    mutatedNodeIds.add(node.id);
    changedTextCount += 1;
  }

  const serialAnchor = rootTexts.find((node) => node.characters.includes('序列号'));
  if (!serialAnchor) throw new Error(`Missing serial anchor in ${target.state} profile`);
  let deviceCard = serialAnchor;
  for (let depth = 0; deviceCard && depth < 3; depth += 1) {
    deviceCard = deviceCard.parent;
  }
  if (deviceCard && 'findAll' in deviceCard) {
    for (const node of [deviceCard, ...deviceCard.findAll(() => true)]) {
      if ('fills' in node && Array.isArray(node.fills)) {
        const nextFills = node.fills.map((paint) => neutralizePaint(paint, target.neutral));
        if (JSON.stringify(nextFills) !== JSON.stringify(node.fills)) {
          node.fills = nextFills;
          mutatedNodeIds.add(node.id);
          neutralizedPaintCount += 1;
        }
      }
      if ('strokes' in node && Array.isArray(node.strokes)) {
        const nextStrokes = node.strokes.map((paint) => neutralizePaint(paint, target.neutral));
        if (JSON.stringify(nextStrokes) !== JSON.stringify(node.strokes)) {
          node.strokes = nextStrokes;
          mutatedNodeIds.add(node.id);
          neutralizedPaintCount += 1;
        }
      }
    }
  } else {
    throw new Error(`Missing device card in ${target.state} profile`);
  }

  const actionLabels = rootTexts.filter((node) => ['连接说明', '状态说明', '当前离线'].includes(node.characters));
  if (actionLabels.length !== 3) {
    throw new Error(`Expected three truthful connection actions in ${target.state} profile, found ${actionLabels.length}`);
  }
  for (const label of actionLabels) {
    const isDanger = label.characters === '当前离线';
    const color = isDanger ? target.danger : target.neutral;
    const parent = label.parent;
    if (parent && 'fills' in parent) {
      parent.fills = [solid(color, isDanger ? 0.1 : 0.08)];
      mutatedNodeIds.add(parent.id);
    }
    label.fills = [solid(color)];
    mutatedNodeIds.add(label.id);
  }

  const requiredCopy = [
    '你好，DOSO Demo',
    '今天 · 8 月 31 日',
    '我的设备',
    '管理 THUNDER 01 的连接与设备设置',
    '固件',
    '待同步',
    '运行时长',
    '—',
    '上次同步',
    '尚未同步',
    '离线',
    'THUNDER 01',
    '室外四足机器人',
    '序列号 · 待绑定',
    '连接',
    '连接说明',
    '状态说明',
    '当前离线',
    '设置',
    '连接管理',
    '真实安全配网能力未接入',
    '安全锁',
    '只读 · 实体执行器尚未接入',
    '状态警报',
    '偏好已开启 · 通知服务待接入',
  ];
  const missingCopy = requiredCopy.filter((copy) => !rootTexts.some((node) => node.characters === copy));
  if (missingCopy.length > 0) {
    throw new Error(`Incomplete truthful copy in ${target.state} profile: ${missingCopy.join(' | ')}`);
  }
  const canonicalCopy = new Set(requiredCopy);
  for (const node of rootTexts.filter((candidate) => canonicalCopy.has(candidate.characters))) {
    const families = new Set(node.getStyledTextSegments(['fontName']).map((segment) => segment.fontName.family));
    if (families.size === 1 && families.has('Noto Sans SC')) continue;
    node.fontName = getTargetFont(node);
    mutatedNodeIds.add(node.id);
  }
  const changedNodes = rootTexts.filter((node) => mutatedNodeIds.has(node.id));
  const unexpectedFonts = changedNodes.flatMap((node) => node.getStyledTextSegments(['fontName']))
    .filter((segment) => segment.fontName.family !== 'Noto Sans SC')
    .map((segment) => `${segment.fontName.family} ${segment.fontName.style}`);
  if (unexpectedFonts.length > 0) {
    throw new Error(`Unexpected profile fonts after alignment: ${[...new Set(unexpectedFonts)].join(', ')}`);
  }

  summaries.push({
    id: root.id,
    state: target.state,
    changedTextCount,
    neutralizedPaintCount,
    foundDeviceCard: Boolean(deviceCard && 'findAll' in deviceCard),
  });
}

return {
  success: true,
  alignmentVersion: '2026-09-04.3',
  mutatedNodeIds: [...mutatedNodeIds],
  summaries,
  loadedFonts: [...fontMap.values(), ...Object.values(targetFonts)],
};
