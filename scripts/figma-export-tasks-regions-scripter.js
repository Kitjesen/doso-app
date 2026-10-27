(async () => {
  const exports = [
    ['tasks-summary-light.png', '139:6722', 20, 237, 350, 87],
    ['tasks-summary-dark.png', '139:4209', 20, 237, 350, 87],
    ['tasks-date-dark.png', '139:4209', 18, 128, 354, 96],
    ['tasks-heading-dark.png', '139:4209', 43, 351, 304, 104],
    ['tasks-cards-light.png', '139:6722', 0, 485, 390, 254],
    ['tasks-cards-dark.png', '139:4209', 0, 485, 390, 254],
    ['tasks-nav-light.png', '139:6722', 20, 759, 352, 62],
    ['tasks-nav-dark.png', '139:4209', 20, 759, 352, 62],
    ['tasks-summary-landscape.png', '139:11041', 20, 234, 330, 134],
    ['tasks-cards-landscape.png', '139:11041', 389, 180, 365, 180],
    ['tasks-nav-landscape.png', '139:11041', 766, 59, 59, 309],
  ];
  const exported = [];
  for (const [filename, nodeId, x, y, width, height] of exports) {
    const root = await figma.getNodeByIdAsync(nodeId);
    if (!root?.absoluteBoundingBox) throw new Error(`Missing tasks root ${nodeId}`);
    const slice = figma.createSlice();
    slice.x = root.absoluteBoundingBox.x + x;
    slice.y = root.absoluteBoundingBox.y + y;
    slice.resize(width, height);
    try {
      const bytes = await slice.exportAsync({ format: 'PNG' });
      const response = await fetch(`http://127.0.0.1:4182/export/${filename}`, { method: 'POST', body: bytes });
      if (!response.ok) throw new Error(`${filename} export failed: ${response.status}`);
      exported.push(filename);
    } finally {
      slice.remove();
    }
  }
  console.log(JSON.stringify({ status: 'DOSO_TASKS_REGION_EXPORT_PASS', exported }, null, 2));
})();
