await (async () => {
  const targets = [
    { id: '139:7104', state: 'light', neutral: { r: 0.55, g: 0.59, b: 0.64 }, danger: { r: 0.84, g: 0.22, b: 0.24 } },
    { id: '139:4589', state: 'dark', neutral: { r: 0.68, g: 0.72, b: 0.77 }, danger: { r: 1, g: 0.55, b: 0.56 } },
    { id: '139:10918', state: 'landscape', neutral: { r: 0.55, g: 0.59, b: 0.64 }, danger: { r: 0.84, g: 0.22, b: 0.24 } },
  ];

  const solid = (color, opacity = 1) => ({ type: 'SOLID', color, opacity });
  const isGreen = (color) => color && color.g > 0.5 && color.g > color.r * 1.2 && color.g > color.b * 1.08;
  const neutralizePaint = (paint, color) => {
    if (paint.type === 'SOLID' && isGreen(paint.color)) return solid(color, paint.opacity ?? 1);
    if (paint.type.startsWith('GRADIENT_') && paint.gradientStops.some((stop) => isGreen(stop.color))) {
      return { ...paint, gradientStops: paint.gradientStops.map((stop) => isGreen(stop.color) ? { ...stop, color: { ...color, a: stop.color.a } } : stop) };
    }
    return paint;
  };

  for (const target of targets) {
    const root = await figma.getNodeByIdAsync(target.id);
    if (!root || !('findAll' in root) || !('exportAsync' in root)) throw new Error(`Missing profile frame ${target.id}`);

    const textChanges = new Map([
      ['你好，Anny', '你好，DOSO Demo'],
      ['今天 · 25 日', '今天 · 8 月 31 日'],
    ]);
    for (const node of root.findAll((candidate) => candidate.type === 'TEXT' && textChanges.has(candidate.characters))) {
      if (node.fontName && typeof node.fontName.family === 'string') await figma.loadFontAsync(node.fontName);
      node.characters = textChanges.get(node.characters);
    }

    const deviceCard = root.findAll((node) => node.type === 'TEXT' && node.characters === '序列号 · 待绑定')[0]?.parent?.parent?.parent;
    if (deviceCard && 'findAll' in deviceCard) {
      for (const node of [deviceCard, ...deviceCard.findAll(() => true)]) {
        if ('fills' in node && Array.isArray(node.fills)) node.fills = node.fills.map((paint) => neutralizePaint(paint, target.neutral));
        if ('strokes' in node && Array.isArray(node.strokes)) node.strokes = node.strokes.map((paint) => neutralizePaint(paint, target.neutral));
      }
    }

    for (const label of root.findAll((node) => node.type === 'TEXT' && ['连接说明', '状态说明', '当前离线'].includes(node.characters))) {
      const danger = label.characters === '当前离线';
      if (label.parent && 'fills' in label.parent) label.parent.fills = [solid(danger ? target.danger : target.neutral, danger ? 0.1 : 0.08)];
      label.fills = [solid(danger ? target.danger : target.neutral)];
    }

    root.setPluginData('dosoProfileAlignment', '2026-09-04.1');
    const bytes = await root.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
    const filename = `main-profile-${target.state}.png`;
    const response = await fetch(`http://127.0.0.1:4189/export/${filename}`, { method: 'POST', body: bytes });
    if (!response.ok) throw new Error(`${filename} export failed: ${response.status} ${await response.text()}`);
  }

  if (typeof figma.commitUndo === 'function') figma.commitUndo();
  console.log('DOSO_PROFILE_ALIGN_EXPORT_PASS');
})();
