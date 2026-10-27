await (async () => {
  const ids = ['139:4784', '139:4126'];
  const output = [];
  for (const id of ids) {
    const root = await figma.getNodeByIdAsync(id);
    if (!root || root.type !== 'FRAME') throw new Error(`Missing frame ${id}`);
    const nodes = root.findAll((node) => {
      if (!('width' in node) || !('absoluteTransform' in node)) return false;
      const x = node.absoluteTransform[0][2] - root.absoluteTransform[0][2];
      const y = node.absoluteTransform[1][2] - root.absoluteTransform[1][2];
      return y >= 735 && x >= 0 && x <= 380 && node.width >= 8 && node.width <= 90 && node.height >= 8 && node.height <= 90;
    }).map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      x: Math.round(node.absoluteTransform[0][2] - root.absoluteTransform[0][2]),
      y: Math.round(node.absoluteTransform[1][2] - root.absoluteTransform[1][2]),
      width: Math.round(node.width),
      height: Math.round(node.height),
    }));
    output.push({ id, nodes });
  }
  console.log(`DOSO_NAV_INSPECT ${JSON.stringify(output)}`);
})();
