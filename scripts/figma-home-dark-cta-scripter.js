(async () => {
  const root = await figma.getNodeByIdAsync('139:4126');
  if (!root || !('findAll' in root) || !root.absoluteBoundingBox) throw new Error('Missing Home Dark root');
  const rootBox = root.absoluteBoundingBox;
  const candidates = root.findAll((node) => {
    if (!['COMPONENT', 'FRAME', 'GROUP', 'INSTANCE', 'RECTANGLE'].includes(node.type)) return false;
    if (!node.visible || !node.absoluteBoundingBox || !('resize' in node)) return false;
    const box = node.absoluteBoundingBox;
    const x = box.x - rootBox.x;
    const y = box.y - rootBox.y;
    return x >= 130 && x <= 150 && y >= 370 && y <= 405
      && box.width >= 105 && box.width <= 125 && box.height >= 38 && box.height <= 48;
  }).sort((a, b) => (b.absoluteBoundingBox.width * b.absoluteBoundingBox.height)
    - (a.absoluteBoundingBox.width * a.absoluteBoundingBox.height));

  const button = candidates[0];
  if (!button) throw new Error('Missing oversized Home Dark CTA');
  const before = { id: button.id, x: button.absoluteBoundingBox.x - rootBox.x, y: button.absoluteBoundingBox.y - rootBox.y, width: button.width, height: button.height };
  button.x += 8;
  button.resize(94, button.height);
  const bytes = await root.exportAsync({ format: 'PNG' });
  const response = await fetch('http://127.0.0.1:4182/export/main-home-dark.png', { method: 'POST', body: bytes });
  if (!response.ok) throw new Error(`Home Dark export failed: ${response.status}`);
  console.log(JSON.stringify({ status: 'DOSO_HOME_DARK_CTA_PASS', before, after: { x: button.absoluteBoundingBox.x - rootBox.x, width: button.width } }, null, 2));
})();
