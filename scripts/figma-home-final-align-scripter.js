// Final in-place cleanup for Batch A / main-home.
// Run in the Scripter plugin inside ZDueCh91PDy5oyLKicv0zR.

(async () => {
  const TARGETS = [
    ['light', '139:6636'],
    ['dark', '139:4126'],
    ['landscape', '139:10575'],
  ].map(([state, id]) => ({ state, id }));
  const NAME = 'DOSO QA / Home Final / Quick Heading';

  const roots = [];
  for (const target of TARGETS) {
    const node = await figma.getNodeByIdAsync(target.id);
    if (!node || node.type !== 'FRAME') throw new Error(`缺少 main-home 根 Frame：${target.id}`);
    roots.push({ ...target, node });
  }
  const pages = new Set(roots.map(({ node }) => node.parent?.type === 'PAGE' ? node.parent : node.parent?.parent).filter(Boolean));
  if (pages.size !== 1) throw new Error('main-home 三帧不在同一页面。');
  await figma.setCurrentPageAsync([...pages][0]);

  const available = await figma.listAvailableFontsAsync();
  const font = available.find(({ fontName }) => fontName.family === 'Noto Sans SC' && /bold/i.test(fontName.style))?.fontName
    || available.find(({ fontName }) => /bold/i.test(fontName.style))?.fontName
    || available[0]?.fontName;
  if (!font) throw new Error('Figma 未返回可用字体。');
  await figma.loadFontAsync(font);

  const mutated = new Set();
  const created = new Set();
  for (const { node: root, state } of roots) {
    root.setPluginData('dosoHomeFinalAlignVersion', '2026-09-01.1');
    mutated.add(root.id);

    for (const text of root.findAllWithCriteria({ types: ['TEXT'] })) {
      if (!/(?:Check system|system health|locks|Begin autonomous|Execute a|Quick actions)/i.test(text.characters)) continue;
      text.visible = false;
      mutated.add(text.id);
    }

    const landscape = root.width > root.height;
    let heading = root.findOne((node) => node.type === 'TEXT' && node.name === NAME);
    if (!landscape) {
      if (heading) {
        heading.visible = false;
        mutated.add(heading.id);
      }
      continue;
    }
    if (!heading) {
      heading = figma.createText();
      root.appendChild(heading);
      heading.name = NAME;
      created.add(heading.id);
    }
    heading.fontName = font;
    heading.fontSize = 20;
    heading.lineHeight = { unit: 'PIXELS', value: 28 };
    heading.characters = '快捷操作';
    heading.textAutoResize = 'HEIGHT';
    heading.resize(180, 28);
    heading.x = 389;
    heading.y = 55;
    heading.fills = [{ type: 'SOLID', color: state === 'dark' ? { r: 244 / 255, g: 246 / 255, b: 248 / 255 } : { r: 17 / 255, g: 24 / 255, b: 32 / 255 } }];
    heading.visible = true;
    mutated.add(heading.id);
  }

  const leaks = roots.flatMap(({ node: root, id }) => root.findAllWithCriteria({ types: ['TEXT'] })
    .filter((text) => text.visible && /(?:Check system|system health|locks|Begin autonomous|Execute a|Quick actions)/i.test(text.characters))
    .map((text) => ({ rootId: id, textId: text.id, value: text.characters })));
  if (leaks.length) throw new Error(`main-home 仍有英文重复文案：${JSON.stringify(leaks)}`);
  const landscapeHeading = roots.find(({ state }) => state === 'landscape')?.node
    .findOne((node) => node.type === 'TEXT' && node.name === NAME && node.visible && node.characters === '快捷操作');
  if (!landscapeHeading) throw new Error('main-home 横屏缺少快捷操作标题。');

  figma.currentPage.selection = roots.map(({ node }) => node);
  figma.viewport.scrollAndZoomIntoView(roots.map(({ node }) => node));
  const result = {
    marker: 'DOSO_HOME_FINAL_ALIGN_PASS',
    fileKey: 'ZDueCh91PDy5oyLKicv0zR',
    mutatedNodeIds: [...mutated],
    createdNodeIds: [...created],
    roots: roots.map(({ id, node, state }) => ({ id, state, preservedRootId: node.id === id, size: `${Math.round(node.width)}x${Math.round(node.height)}` })),
  };
  console.log(`DOSO_HOME_FINAL_ALIGN_PASS ${JSON.stringify(result)}`);
})();
