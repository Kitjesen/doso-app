await (async () => {
  const targets = [
    { rootId: '139:6636', state: 'light', surfaceId: '139:6710' },
    { rootId: '139:4126', state: 'dark', surfaceId: '139:4197' },
    { rootId: '139:10575', state: 'light', surfaceId: '139:10581' },
  ];
  const resolved = [];

  for (const target of targets) {
    const root = await figma.getNodeByIdAsync(target.rootId);
    const surface = await figma.getNodeByIdAsync(target.surfaceId);
    if (!root || root.type !== 'FRAME') throw new Error(`Missing main-home frame ${target.rootId}`);
    if (!surface || surface.type !== 'ELLIPSE' || surface.width !== 42 || surface.height !== 42) {
      throw new Error(`Missing recall control surface ${target.surfaceId}`);
    }
    resolved.push({ root, state: target.state, surface });
  }

  const mutatedNodeIds = new Set();
  for (const { root, state, surface } of resolved) {
    root.setPluginData('dosoRecallStateVersion', '2026-09-01.1');
    surface.opacity = 1;
    const disabledStops = state === 'dark'
      ? [[49, 65, 60], [62, 80, 74]]
      : [[216, 227, 222], [197, 210, 204]];
    surface.fills = [{
      type: 'GRADIENT_LINEAR',
      gradientTransform: [[1, 0, 0], [0, 1, 0]],
      gradientStops: disabledStops.map(([r, g, b], position) => ({
        position,
        color: { r: r / 255, g: g / 255, b: b / 255, a: 1 },
      })),
    }];
    mutatedNodeIds.add(root.id);
    mutatedNodeIds.add(surface.id);

    const surfaceCenter = {
      x: surface.absoluteTransform[0][2] + surface.width / 2,
      y: surface.absoluteTransform[1][2] + surface.height / 2,
    };
    const iconColor = state === 'dark'
      ? { r: 150 / 255, g: 161 / 255, b: 173 / 255 }
      : { r: 123 / 255, g: 123 / 255, b: 123 / 255 };
    for (const node of root.findAll((candidate) => (
      'width' in candidate
      && candidate.width <= 30
      && candidate.height <= 30
      && Math.abs(candidate.absoluteTransform[0][2] + candidate.width / 2 - surfaceCenter.x) <= 10
      && Math.abs(candidate.absoluteTransform[1][2] + candidate.height / 2 - surfaceCenter.y) <= 10
    ))) {
      if ('fills' in node && Array.isArray(node.fills) && node.fills.length) {
        node.fills = node.fills.map((paint) => paint.type === 'SOLID' ? { ...paint, color: iconColor } : paint);
        mutatedNodeIds.add(node.id);
      }
      if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.length) {
        node.strokes = node.strokes.map((paint) => paint.type === 'SOLID' ? { ...paint, color: iconColor } : paint);
        mutatedNodeIds.add(node.id);
      }
    }
  }

  const result = {
    marker: 'DOSO_HOME_RECALL_DISABLED_PASS',
    mutatedNodeIds: [...mutatedNodeIds],
    roots: resolved.map(({ root, surface }) => ({ rootId: root.id, surfaceId: surface.id })),
  };
  console.log(`DOSO_HOME_RECALL_DISABLED_PASS ${JSON.stringify(result)}`);
  figma.notify('DOSO_HOME_RECALL_DISABLED_PASS', { timeout: 8000 });
  return result;
})();
