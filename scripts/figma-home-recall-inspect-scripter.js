await (async () => {
  const root = await figma.getNodeByIdAsync('139:10575');
  if (!root || root.type !== 'FRAME') throw new Error('Missing landscape home frame');
  const centers = [[477.5, 353], [595.5, 353], [713.5, 353]];
  const output = centers.map(([centerX, centerY]) => root.findAll((node) => {
    if (!('width' in node) || node.width > 24 || node.height > 24) return false;
    const x = node.absoluteTransform[0][2] - root.absoluteTransform[0][2] + node.width / 2;
    const y = node.absoluteTransform[1][2] - root.absoluteTransform[1][2] + node.height / 2;
    return Math.abs(x - centerX) <= 12 && Math.abs(y - centerY) <= 12;
  }).map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    width: Math.round(node.width * 10) / 10,
    height: Math.round(node.height * 10) / 10,
    x: Math.round((node.absoluteTransform[0][2] - root.absoluteTransform[0][2]) * 10) / 10,
    y: Math.round((node.absoluteTransform[1][2] - root.absoluteTransform[1][2]) * 10) / 10,
    rotation: 'rotation' in node ? node.rotation : null,
    fills: 'fills' in node && Array.isArray(node.fills) ? node.fills : null,
    strokes: 'strokes' in node && Array.isArray(node.strokes) ? node.strokes : null,
  })));
  throw new Error(`DOSO_HOME_QUICK_ARROW_INSPECT ${JSON.stringify(output)}`);
})();
