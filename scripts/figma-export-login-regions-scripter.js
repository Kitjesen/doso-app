(async () => {
  const exports = [
    ['login-hero-light.png', '139:5200', 0, 48, 390, 209],
    ['login-hero-dark.png', '139:2728', 0, 48, 390, 209],
    ['login-hero-landscape.png', '139:7722', 20, 39, 433, 327],
    ['login-form-light.png', '139:5200', 0, 257, 390, 587],
    ['login-form-dark.png', '139:2728', 0, 257, 390, 587],
    ['login-form-landscape.png', '139:7722', 471, 39, 353, 327],
  ];
  const exported = [];
  for (const [filename, nodeId, x, y, width, height] of exports) {
    const root = await figma.getNodeByIdAsync(nodeId);
    if (!root?.absoluteBoundingBox) throw new Error(`Missing login root ${nodeId}`);
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
  console.log(JSON.stringify({ status: 'DOSO_LOGIN_REGION_EXPORT_PASS', exported }, null, 2));
})();
