const targets = [
  {
    id: '139:6520',
    state: 'light',
    neutral: { r: 0.48, g: 0.48, b: 0.48 },
    badgeSurface: { r: 1, g: 1, b: 1 },
  },
  {
    id: '139:4019',
    state: 'dark',
    neutral: { r: 0.58, g: 0.62, b: 0.67 },
    badgeSurface: { r: 0.08, g: 0.1, b: 0.13 },
  },
  {
    id: '139:8596',
    state: 'landscape',
    neutral: { r: 0.48, g: 0.48, b: 0.48 },
    badgeSurface: { r: 1, g: 1, b: 1 },
  },
];
const requestedState = 'all';
const selectedTargets = requestedState === 'all'
  ? targets
  : targets.filter((target) => target.state === requestedState);
if (selectedTargets.length === 0) throw new Error(`Unknown control state: ${requestedState}`);

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

const textChanges = new Map([
  ['Control Center', '控制中心'],
  ['Thunder-07', 'THUNDER 01'],
  ['Wheeled Quadruped Robot', '室外四足机器人'],
  ['120 m', '待同步'],
  ['120 米', '待同步'],
  ['34%', '—'],
  ['50%', '—'],
  ['60%', '—'],
  ['6.4 h', '—'],
  ['Robot Health', '机器人状态'],
  ['12 / 12 sensors online', '设备离线，可信遥测尚未接入'],
  ['12 / 12 个传感器在线', '设备离线，可信遥测尚未接入'],
  ['• All systems ready', '实时状态不可用'],
  ['所有系统运行正常', '实时状态不可用'],
  ['94%', '—'],
  ['Control Mode', '控制模式'],
  ['Choose operation mode', '选择操作模式'],
  ['Manual', '手动'],
  ['Patrol', '巡航'],
  ['Mission', '任务'],
]);
const canonicalCopy = [
  '控制中心',
  'THUNDER 01',
  '室外四足机器人',
  '待同步',
  '—',
  '机器人状态',
  '设备离线，可信遥测尚未接入',
  '实时状态不可用',
  '控制模式',
  '选择操作模式',
  '手动',
  '巡航',
  '任务',
];
const targetFonts = {
  black: { family: 'Noto Sans SC', style: 'Black' },
  bold: { family: 'Noto Sans SC', style: 'Bold' },
  medium: { family: 'Noto Sans SC', style: 'Medium' },
  regular: { family: 'Noto Sans SC', style: 'Regular' },
};
const getTargetFont = (node) => {
  const current = node.getStyledTextSegments(['fontName'])[0]?.fontName;
  const style = current && typeof current.style === 'string' ? current.style : 'Regular';
  if (style.includes('Extra Bold') || style.includes('Black')) return targetFonts.black;
  if (style.includes('Semi Bold') || style.includes('Bold')) return targetFonts.bold;
  if (style.includes('Medium')) return targetFonts.medium;
  return targetFonts.regular;
};

const frames = await Promise.all(selectedTargets.map((target) => figma.getNodeByIdAsync(target.id)));
const missingFrameIds = selectedTargets.filter((_, index) => !frames[index]).map((target) => target.id);
if (missingFrameIds.length > 0) throw new Error(`Missing control frames: ${missingFrameIds.join(', ')}`);

const currentFonts = new Map();
for (let index = 0; index < frames.length; index += 1) {
  const frame = frames[index];
  if (!('findAllWithCriteria' in frame)) throw new Error(`Control target ${selectedTargets[index].id} cannot be traversed`);
  for (const node of frame.findAllWithCriteria({ types: ['TEXT'] })) {
    for (const segment of node.getStyledTextSegments(['fontName'])) {
      currentFonts.set(`${segment.fontName.family}\u0000${segment.fontName.style}`, segment.fontName);
    }
  }
}
await Promise.all([
  ...currentFonts.values(),
  ...Object.values(targetFonts),
].map((fontName) => figma.loadFontAsync(fontName)));

const createdNodeIds = [];
const mutatedNodeIds = new Set();
const summaries = [];

for (let index = 0; index < selectedTargets.length; index += 1) {
  const target = selectedTargets[index];
  const root = frames[index];
  const rootTexts = root.findAllWithCriteria({ types: ['TEXT'] });

  for (const node of rootTexts) {
    const replacement = textChanges.get(node.characters) ?? textChanges.get(node.characters.trim());
    if (!replacement) continue;
    node.characters = replacement;
    node.fontName = getTargetFont(node);
    mutatedNodeIds.add(node.id);
  }

  const missingCopy = canonicalCopy.filter((copy) => !rootTexts.some((node) => node.characters === copy));
  if (missingCopy.length > 0) {
    throw new Error(`Incomplete truthful copy in ${target.state} control: ${missingCopy.join(' | ')}`);
  }
  const canonicalSet = new Set(canonicalCopy);
  for (const node of rootTexts.filter((candidate) => canonicalSet.has(candidate.characters))) {
    const families = new Set(node.getStyledTextSegments(['fontName']).map((segment) => segment.fontName.family));
    if (families.size === 1 && families.has('Noto Sans SC')) continue;
    node.fontName = getTargetFont(node);
    mutatedNodeIds.add(node.id);
  }

  const gradientBatteries = root.findAll((node) => node.name === 'Status / Battery'
    && 'fills' in node
    && Array.isArray(node.fills)
    && node.fills.some((paint) => paint.type.startsWith('GRADIENT_') && paint.gradientStops.some((stop) => isGreen(stop.color))));
  if (gradientBatteries.length === 0) throw new Error(`Missing fake battery overlay in ${target.state} control`);
  for (const overlay of gradientBatteries) {
    overlay.visible = false;
    mutatedNodeIds.add(overlay.id);
  }

  const healthValue = root.findAll((node) => node.name === 'Health Gauge / Value')[0];
  if (!healthValue) throw new Error(`Missing health value arc in ${target.state} control`);
  healthValue.visible = false;
  mutatedNodeIds.add(healthValue.id);

  const selector = root.findAll((node) => node.name === 'Control Mode / Selector')[0];
  const manualActive = root.findAll((node) => node.name === 'Mode / Manual Active')[0];
  if (!selector || !manualActive || !('fills' in selector) || !('fills' in manualActive)) {
    throw new Error(`Missing control mode selector in ${target.state} control`);
  }
  manualActive.fills = Array.isArray(selector.fills) ? [...selector.fills] : [];
  manualActive.opacity = 0.55;
  mutatedNodeIds.add(manualActive.id);

  const unavailableText = rootTexts.find((node) => node.characters === '实时状态不可用');
  if (!unavailableText) throw new Error(`Missing unavailable health label in ${target.state} control`);
  unavailableText.fills = [solid(target.neutral)];
  mutatedNodeIds.add(unavailableText.id);

  const liveRouteMap = root.findAll((node) => node.name === 'Live Route Map')[0];
  if (!liveRouteMap || !('findAll' in liveRouteMap)) throw new Error(`Missing route map in ${target.state} control`);
  for (const node of [liveRouteMap, ...liveRouteMap.findAll(() => true)]) {
    if ('fills' in node && Array.isArray(node.fills)) {
      const nextFills = node.fills.map((paint) => neutralizePaint(paint, target.neutral));
      if (JSON.stringify(nextFills) !== JSON.stringify(node.fills)) {
        node.fills = nextFills;
        mutatedNodeIds.add(node.id);
      }
    }
    if ('strokes' in node && Array.isArray(node.strokes)) {
      const nextStrokes = node.strokes.map((paint) => neutralizePaint(paint, target.neutral));
      if (JSON.stringify(nextStrokes) !== JSON.stringify(node.strokes)) {
        node.strokes = nextStrokes;
        mutatedNodeIds.add(node.id);
      }
    }
  }

  const mapCard = root.findAll((node) => node.name === 'Control Mode / Live Route')[0];
  if (!mapCard || !('appendChild' in mapCard)) throw new Error(`Missing route card in ${target.state} control`);
  let badge = mapCard.findAll((node) => node.name === 'Map / Unavailable')[0];
  if (!badge) {
    badge = figma.createFrame();
    badge.name = 'Map / Unavailable';
    badge.layoutMode = 'HORIZONTAL';
    badge.primaryAxisSizingMode = 'AUTO';
    badge.counterAxisSizingMode = 'AUTO';
    badge.counterAxisAlignItems = 'CENTER';
    badge.primaryAxisAlignItems = 'CENTER';
    badge.itemSpacing = 3;
    badge.paddingLeft = 8;
    badge.paddingRight = 8;
    badge.paddingTop = 6;
    badge.paddingBottom = 6;
    badge.cornerRadius = 15;
    badge.fills = [solid(target.badgeSurface, target.state === 'dark' ? 0.88 : 0.9)];
    const label = figma.createText();
    label.fontName = targetFonts.medium;
    label.fontSize = 9;
    label.characters = '地图待同步';
    label.fills = [solid(target.neutral)];
    badge.appendChild(label);
    mapCard.appendChild(badge);
    if ('layoutMode' in mapCard && mapCard.layoutMode !== 'NONE') badge.layoutPositioning = 'ABSOLUTE';
    badge.x = Math.max(0, mapCard.width - badge.width - 8);
    badge.y = Math.max(0, mapCard.height - badge.height - 8);
    createdNodeIds.push(badge.id, label.id);
  } else {
    badge.fills = [solid(target.badgeSurface, target.state === 'dark' ? 0.88 : 0.9)];
    mutatedNodeIds.add(badge.id);
  }

  const unexpectedFonts = rootTexts.filter((node) => canonicalSet.has(node.characters))
    .flatMap((node) => node.getStyledTextSegments(['fontName']))
    .filter((segment) => segment.fontName.family !== 'Noto Sans SC')
    .map((segment) => `${segment.fontName.family} ${segment.fontName.style}`);
  if (unexpectedFonts.length > 0) {
    throw new Error(`Unexpected control fonts after alignment: ${[...new Set(unexpectedFonts)].join(', ')}`);
  }

  mutatedNodeIds.add(root.id);
  summaries.push({
    id: root.id,
    state: target.state,
    hiddenBatteryOverlays: gradientBatteries.length,
    routeBadgeId: badge.id,
  });
}

return {
  success: true,
  alignmentVersion: '2026-09-04.2',
  createdNodeIds,
  mutatedNodeIds: [...mutatedNodeIds],
  summaries,
};
