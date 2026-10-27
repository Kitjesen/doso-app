(async () => {
  const roots = [
    ['light', '139:6636'],
    ['dark', '139:4126'],
  ];
  const cards = [[20, 608], [141, 608], [262, 608]];
  const exported = [];

  for (const [theme, id] of roots) {
    const root = await figma.getNodeByIdAsync(id);
    if (!root || !root.absoluteBoundingBox) throw new Error(`Missing Home ${theme} root`);
    for (let index = 0; index < cards.length; index += 1) {
      const [x, y] = cards[index];
      const slice = figma.createSlice();
      slice.x = root.absoluteBoundingBox.x + x;
      slice.y = root.absoluteBoundingBox.y + y;
      slice.resize(107, 127);
      const filename = `home-quick-card-${index + 1}-${theme}.png`;
      try {
        const bytes = await slice.exportAsync({ format: 'PNG' });
        const response = await fetch(`http://127.0.0.1:4182/export/${filename}`, { method: 'POST', body: bytes });
        if (!response.ok) throw new Error(`${filename} export failed: ${response.status}`);
        exported.push(filename);
      } finally {
        slice.remove();
      }
    }
  }
  console.log(JSON.stringify({ status: 'DOSO_HOME_QUICK_CARD_EXPORT_PASS', exported }, null, 2));
})();
