(async () => {
  const exports = [
    ['model-controls-light.png', '139:5298', 0, 48, 390, 274],
    ['model-controls-dark.png', '139:2821', 0, 48, 390, 274],
    ['model-controls-landscape.png', '139:7848', 20, 52, 359, 314],
    ['model-grid-light.png', '139:5298', 22, 322, 346, 437],
    ['model-grid-dark.png', '139:2821', 22, 322, 346, 437],
    ['model-grid-landscape.png', '139:7848', 416, 62, 408, 304],
  ];
  const exported = [];
  for (const [filename, nodeId, x, y, width, height] of exports) {
    const root = await figma.getNodeByIdAsync(nodeId);
    if (!root?.absoluteBoundingBox) throw new Error(`Missing model-select root ${nodeId}`);
    const slice = figma.createSlice();
    slice.x = root.absoluteBoundingBox.x + x;
    slice.y = root.absoluteBoundingBox.y + y;
    slice.resize(width, height);
    try {
      const bytes = await slice.exportAsync({ format: 'PNG' });
      const response = await fetch(`http://127.0.0.1:4185/export/${filename}`, { method: 'POST', body: bytes });
      if (!response.ok) throw new Error(`${filename} export failed: ${response.status}`);
      exported.push(filename);
    } finally {
      slice.remove();
    }
  }
  console.log(JSON.stringify({ status: 'DOSO_MODEL_SELECT_REGION_EXPORT_PASS', exported }, null, 2));
})();
