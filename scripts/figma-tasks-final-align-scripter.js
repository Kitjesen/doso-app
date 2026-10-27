// Final in-place alignment for Batch A / main-tasks.
// Run in the Scripter plugin inside ZDueCh91PDy5oyLKicv0zR.

(async () => {
  const TARGETS = [
    ['light', '139:6722', 390, 844],
    ['dark', '139:4209', 390, 844],
    ['landscape', '139:11041', 844, 390],
  ].map(([state, id, width, height]) => ({ state, id, width, height }));
  const PREFIX = 'DOSO QA / Tasks Final /';

  if (figma.editorType !== 'figma') throw new Error('请在 Figma Design 文件中运行。');

  const roots = [];
  for (const target of TARGETS) {
    const node = await figma.getNodeByIdAsync(target.id);
    if (!node || node.type !== 'FRAME') throw new Error(`缺少 main-tasks 根 Frame：${target.id}`);
    roots.push({ ...target, node });
  }
  const pages = new Set(roots.map(({ node }) => node.parent?.type === 'PAGE' ? node.parent : node.parent?.parent).filter(Boolean));
  if (pages.size !== 1) throw new Error('main-tasks 三帧不在同一页面。');
  await figma.setCurrentPageAsync([...pages][0]);

  const available = await figma.listAvailableFontsAsync();
  const preferred = ['Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', 'Roboto', 'Inter'];
  const family = preferred.find((name) => available.some(({ fontName }) => fontName.family === name))
    || available[0]?.fontName.family;
  const familyFonts = available.filter(({ fontName }) => fontName.family === family).map(({ fontName }) => fontName);
  const pick = (pattern) => familyFonts.find(({ style }) => pattern.test(style)) || familyFonts[0];
  const fonts = {
    regular: pick(/regular|normal|book/i),
    medium: pick(/medium|semi.?bold|demi.?bold/i),
    bold: pick(/bold|heavy|black/i),
  };
  if (!fonts.regular) throw new Error('Figma 未返回可用字体。');

  const currentFonts = new Map();
  for (const { node: root } of roots) {
    for (const text of root.findAllWithCriteria({ types: ['TEXT'] })) {
      for (const segment of text.getStyledTextSegments(['fontName'])) {
        currentFonts.set(`${segment.fontName.family}\u0000${segment.fontName.style}`, segment.fontName);
      }
    }
  }
  await Promise.all([...currentFonts.values(), ...Object.values(fonts)].map((font) => figma.loadFontAsync(font)));

  const rgb = (hex) => {
    const value = hex.replace('#', '');
    return {
      r: parseInt(value.slice(0, 2), 16) / 255,
      g: parseInt(value.slice(2, 4), 16) / 255,
      b: parseInt(value.slice(4, 6), 16) / 255,
    };
  };
  const solid = (hex) => ({ type: 'SOLID', color: rgb(hex) });
  const absBox = (node, root) => ({
    x: node.absoluteTransform[0][2] - root.absoluteTransform[0][2],
    y: node.absoluteTransform[1][2] - root.absoluteTransform[1][2],
    width: node.width,
    height: node.height,
  });
  const mutated = new Set();
  const created = new Set();

  const moveTo = (node, root, x, y) => {
    const box = absBox(node, root);
    node.x += x - box.x;
    node.y += y - box.y;
    mutated.add(node.id);
  };

  const ownText = (root, key, value, x, y, width, size, color, weight = 'regular', align = 'LEFT', lineHeight = Math.round(size * 1.35)) => {
    const name = `${PREFIX}${key}`;
    let node = root.findOne((child) => child.type === 'TEXT' && child.name === name);
    if (!node) {
      node = figma.createText();
      root.appendChild(node);
      node.name = name;
      created.add(node.id);
    }
    node.fontName = fonts[weight];
    node.fontSize = size;
    node.lineHeight = { unit: 'PIXELS', value: lineHeight };
    node.characters = value;
    node.textAutoResize = 'HEIGHT';
    node.resize(width, Math.max(lineHeight, node.height));
    node.textAlignHorizontal = align;
    node.fills = [solid(color)];
    node.visible = true;
    node.x = x;
    node.y = y;
    mutated.add(node.id);
    return node;
  };

  const adjustExistingShapes = (root, landscape, dark) => {
    const byName = (name) => root.findOne((node) => node.name === `DOSO QA / ${name}`);
    const specs = landscape ? [
      ['Task Date Strip', 20, 112, 330, 86],
      ['Task Date Selected', 73, 114, 48, 74],
      ['Task Date Selected Day', 80, 143, 34, 34],
      ['Task Summary Copy Surface', 91, 248, 244, 104],
    ] : [
      ['Task Date Strip', 18, 128, 354, 96],
      ['Task Date Selected', 57, 134, 50, 79],
      ['Task Date Selected Day', 65, 171, 34, 34],
      ['Task Summary Copy Surface', 91, 248, 244, 64],
    ];
    for (const [name, x, y, width, height] of specs) {
      const node = byName(name);
      if (!node) continue;
      node.visible = true;
      node.resize(width, height);
      node.x = x;
      node.y = y;
      mutated.add(node.id);
    }
    const surface = byName('Task Summary Copy Surface');
    if (surface) surface.fills = [solid(dark ? '#25303A' : '#E9EDF8')];
  };

  const alignTaskCards = (root, landscape) => {
    const circles = root.findAllWithCriteria({ types: ['ELLIPSE'] })
      .map((node) => ({ node, box: absBox(node, root) }))
      .filter(({ box }) => box.width >= 130 && box.width <= 230 && box.height >= 130 && box.height <= 230)
      .filter(({ box }) => landscape ? box.y >= 180 : box.y >= 470)
      .sort((a, b) => a.box.x - b.box.x);
    if (landscape) {
      const side = circles.filter(({ box }) => box.width < 170);
      if (side[0]) moveTo(side[0].node, root, 395, 239);
      if (side[1]) moveTo(side[1].node, root, 643, 239);
      const main = circles.find(({ box }) => box.width >= 170);
      if (main) moveTo(main.node, root, 492, 209);
    } else {
      for (const { node, box } of circles) moveTo(node, root, box.x, box.y - 7);
    }

    const images = root.findAll((node) => (
      'fills' in node && Array.isArray(node.fills)
      && node.fills.some((paint) => paint.type === 'IMAGE')
      && node.width >= 45 && node.height >= 28
    )).map((node) => ({ node, box: absBox(node, root) }))
      .filter(({ box }) => landscape
        ? box.y >= 170 && box.y <= 330
        : box.y >= 470 && box.y <= 680)
      .sort((a, b) => a.box.x - b.box.x);
    const targets = landscape
      ? [[406, 250, 58, 38], [531, 203, 70, 45], [658, 248, 58, 38]]
      : [[-25, 564, 82, 56], [146, 503, 100, 66], [322, 564, 78, 52]];
    images.slice(0, 3).forEach(({ node }, index) => {
      const [x, y, width, height] = targets[index];
      node.resize(width, height);
      moveTo(node, root, x, y);
    });

    for (const node of root.findAllWithCriteria({ types: ['ELLIPSE'] })) {
      const box = absBox(node, root);
      const inTaskArea = landscape ? box.y >= 200 : box.y >= 470;
      if (!inTaskArea || box.width < 28 || box.width > 70 || box.height < 28 || box.height > 70) continue;
      const green = Array.isArray(node.fills) && node.fills.some((paint) => (
        paint.type === 'SOLID' && paint.color.g > 0.65 && paint.color.r < 0.55
      ));
      if (!green) continue;
      node.opacity = 0.58;
      mutated.add(node.id);
    }
    return { circles: circles.length, images: images.length };
  };

  const addCopy = (root, state) => {
    const landscape = state === 'landscape';
    const dark = state === 'dark';
    const ink = dark ? '#F4F6F8' : '#101214';
    const muted = dark ? '#9CA4AE' : '#7A8088';
    const green = '#2DF59C';
    const red = dark ? '#FF9BA4' : '#E26A7B';
    const add = (...args) => ownText(root, ...args);
    const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const days = ['30', '31', '1', '2', '3', '4', '5'];

    if (landscape) {
      add('header-title', '你好，DOSO Demo', 64, 53, 210, 16, ink, 'bold');
      add('header-date', '今天 · 8 月 31 日', 64, 75, 210, 10, muted);
      for (let index = 0; index < 7; index += 1) {
        const x = 24 + index * 47;
        add(`week-${index}`, weeks[index], x, 121, 40, 10, muted, 'medium', 'CENTER');
        add(`day-${index}`, days[index], x, 153, 40, 12, index === 1 ? '#0B3A27' : ink, 'bold', 'CENTER');
      }
      add('summary-title', '任务模板预览', 96, 274, 150, 13, ink, 'bold');
      add('summary-body', '巡检与充电任务均为界面预览', 96, 300, 172, 9, muted);
      add('summary-count', '1/3', 270, 268, 58, 28, ink, 'bold', 'CENTER');
      add('summary-progress', '模板数据 · 33%', 267, 316, 70, 9, green, 'bold', 'CENTER');
      add('hero-title', '准备好执行今天的\n任务了吗？', 484, 52, 244, 27, ink, 'bold', 'CENTER', 32);
      add('hero-subtitle', 'THUNDER 01 尚未同步可信任务', 469, 129, 290, 15, muted, 'medium', 'CENTER');
      add('primary-badge', '模板预览', 523, 259, 70, 8, green, 'bold', 'CENTER');
      add('primary-title', '巡检', 523, 277, 70, 11, ink, 'bold', 'CENTER');
      add('primary-body', '检查设备系统与周边环境', 497, 296, 122, 8, muted, 'regular', 'CENTER');
      add('left-badge', '模板预览', 398, 288, 72, 7, green, 'bold', 'CENTER');
      add('left-title', '回充模板', 398, 304, 72, 9, ink, 'bold', 'CENTER');
      add('right-badge', '模板预览', 646, 288, 72, 7, green, 'bold', 'CENTER');
      add('right-title', '设备安全', 646, 304, 72, 9, ink, 'bold', 'CENTER');
      add('blocked', '生产控制与任务执行器未接入', 541, 340, 194, 9, red, 'medium', 'CENTER');
    } else {
      add('header-title', '你好，DOSO Demo', 72, 64, 240, 16, ink, 'bold');
      add('header-date', '今天 · 8 月 31 日', 72, 85, 240, 10, muted);
      for (let index = 0; index < 7; index += 1) {
        const x = 12 + index * 51;
        add(`week-${index}`, weeks[index], x, 139, 38, 10, muted, 'medium', 'CENTER');
        add(`day-${index}`, days[index], x, 174, 38, 12, index === 1 ? '#0B3A27' : ink, 'bold', 'CENTER');
      }
      add('summary-title', '任务模板预览', 99, 257, 150, 13, ink, 'bold');
      add('summary-body', '巡检与充电任务均为界面预览', 99, 282, 172, 9, muted);
      add('summary-count', '1/3', 267, 255, 62, 28, ink, 'bold', 'CENTER');
      add('summary-progress', '模板数据 · 33%', 258, 294, 82, 9, green, 'bold', 'CENTER');
      add('hero-title', '准备好执行今天的\n任务了吗？', 55, 351, 280, 27, ink, 'bold', 'CENTER', 34);
      add('hero-subtitle', 'THUNDER 01 尚未同步可信任务', 43, 436, 304, 15, muted, 'medium', 'CENTER');
      add('primary-badge', '模板预览', 154, 580, 82, 8, green, 'bold', 'CENTER');
      add('primary-title', '巡检', 154, 598, 82, 12, ink, 'bold', 'CENTER');
      add('primary-body', '检查设备系统与周边环境', 119, 619, 152, 8, muted, 'regular', 'CENTER');
      add('blocked', '生产控制与任务执行器未接入', 104, 723, 182, 9, red, 'medium', 'CENTER');
    }
  };

  const report = [];
  for (const { node: root, state, id, width, height } of roots) {
    root.resize(width, height);
    root.clipsContent = true;
    root.name = `DOSO / main-tasks / ${state}`;
    root.setPluginData('dosoTasksFinalAlignVersion', '2026-09-01.1');
    mutated.add(root.id);

    for (const text of root.findAllWithCriteria({ types: ['TEXT'] })) text.visible = text.name.startsWith(PREFIX);
    for (const node of root.findAll((child) => child.name.startsWith(PREFIX))) node.visible = false;

    const landscape = state === 'landscape';
    adjustExistingShapes(root, landscape, state === 'dark');
    const assets = alignTaskCards(root, landscape);
    addCopy(root, state);

    const visibleOwnTexts = root.findAllWithCriteria({ types: ['TEXT'] })
      .filter((text) => text.visible && text.name.startsWith(PREFIX));
    report.push({
      id,
      state,
      size: `${Math.round(root.width)}x${Math.round(root.height)}`,
      preservedRootId: root.id === id,
      visibleOwnTexts: visibleOwnTexts.length,
      assets,
    });
  }

  const forbidden = /Ready for today|3 missions|33% complete|已完成 33%|SAFE AREA|SOURCE SYNC|真实状态合同/i;
  const leaks = roots.flatMap(({ node: root, id }) => root.findAllWithCriteria({ types: ['TEXT'] })
    .filter((text) => text.visible && forbidden.test(text.characters))
    .map((text) => ({ rootId: id, textId: text.id, value: text.characters })));
  if (leaks.length) throw new Error(`仍有假状态或开发注释：${JSON.stringify(leaks)}`);
  if (report.some((item) => !item.preservedRootId || item.visibleOwnTexts < 20 || item.assets.images < 2)) {
    throw new Error(`main-tasks 结构校验失败：${JSON.stringify(report)}`);
  }

  figma.currentPage.selection = roots.map(({ node }) => node);
  figma.viewport.scrollAndZoomIntoView(roots.map(({ node }) => node));
  const result = {
    marker: 'DOSO_TASKS_FINAL_ALIGN_PASS',
    fileKey: 'ZDueCh91PDy5oyLKicv0zR',
    mutatedNodeIds: [...mutated],
    createdNodeIds: [...created],
    roots: report,
  };
  console.log(`DOSO_TASKS_FINAL_ALIGN_PASS ${JSON.stringify(result)}`);
})();
