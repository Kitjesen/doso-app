(async () => {
  const root = await figma.getNodeByIdAsync('139:6636');
  if (!root || !('findAll' in root)) throw new Error('Missing Home Light root');

  const rootBox = root.absoluteBoundingBox;
  if (!rootBox) throw new Error('Home Light root has no bounds');

  const targets = [
    ['metric-1', 35, 310, 78, 370],
    ['metric-2', 145, 310, 185, 370],
    ['metric-3', 245, 310, 286, 370],
    ['battery', 42, 270, 72, 310],
    ['recall', 330, 520, 370, 575],
    ['quick-1', 30, 615, 78, 665],
    ['quick-2', 150, 615, 199, 665],
    ['quick-3', 270, 615, 320, 665],
  ];
  const candidates = root.findAll((node) => {
    if (!['BOOLEAN_OPERATION', 'COMPONENT', 'FRAME', 'GROUP', 'INSTANCE', 'VECTOR'].includes(node.type)) return false;
    if (!node.visible || !node.absoluteBoundingBox || !('exportAsync' in node)) return false;
    const box = node.absoluteBoundingBox;
    const x = box.x - rootBox.x;
    const y = box.y - rootBox.y;
    return box.width <= 40 && box.height <= 40
      && targets.some(([, left, top, right, bottom]) => x >= left && x <= right && y >= top && y <= bottom);
  });

  const chosen = targets.map(([key, left, top, right, bottom]) => [key, candidates
    .filter((node) => {
      const x = node.absoluteBoundingBox.x - rootBox.x;
      const y = node.absoluteBoundingBox.y - rootBox.y;
      return x >= left && x <= right && y >= top && y <= bottom;
    })
    .sort((a, b) => (b.absoluteBoundingBox.width * b.absoluteBoundingBox.height)
      - (a.absoluteBoundingBox.width * a.absoluteBoundingBox.height))[0]]);

  const exported = [];
  for (let index = 0; index < chosen.length; index += 1) {
    const [key, node] = chosen[index];
    if (!node) throw new Error(`Missing Home icon ${key}`);
    const filename = `home-${key}.png`;
    const bytes = await node.exportAsync({ format: 'PNG' });
    const response = await fetch(`http://127.0.0.1:4182/export/${filename}`, { method: 'POST', body: bytes });
    if (!response.ok) throw new Error(`${filename} export failed: ${response.status}`);
    const box = node.absoluteBoundingBox;
    exported.push({ filename, id: node.id, name: node.name, type: node.type, width: box.width, height: box.height });
  }

  console.log(JSON.stringify({ status: 'DOSO_HOME_METRIC_EXPORT_PASS', exported }, null, 2));
})();
