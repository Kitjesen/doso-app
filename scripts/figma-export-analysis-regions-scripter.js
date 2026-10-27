(async () => {
  const exports = [
    ['analysis-performance-light.png', '139:6953', 20, 120, 350, 235],
    ['analysis-monthly-light.png', '139:6953', 20, 362, 350, 399],
    ['analysis-nav-light.png', '139:6953', 20, 759, 350, 62],
    ['analysis-performance-dark.png', '139:4440', 20, 120, 350, 235],
    ['analysis-monthly-dark.png', '139:4440', 20, 362, 350, 399],
    ['analysis-nav-dark.png', '139:4440', 20, 759, 350, 62],
    ['analysis-performance-landscape.png', '139:10757', 72, 111, 325, 258],
    ['analysis-monthly-landscape.png', '139:10757', 436, 51, 340, 339],
    ['analysis-nav-landscape.png', '139:10757', 766, 59, 59, 309],
  ];
  const exported = [];
  for (const [filename, nodeId, x, y, width, height] of exports) {
    const root = await figma.getNodeByIdAsync(nodeId);
    if (!root?.absoluteBoundingBox) throw new Error(`Missing analysis root ${nodeId}`);
    const slice = figma.createSlice();
    slice.x = root.absoluteBoundingBox.x + x;
    slice.y = root.absoluteBoundingBox.y + y;
    slice.resize(width, height);
    try {
      const bytes = await slice.exportAsync({ format: 'PNG' });
      const response = await fetch(`http://127.0.0.1:4188/export/${filename}`, { method: 'POST', body: bytes });
      if (!response.ok) throw new Error(`${filename} export failed: ${response.status}`);
      exported.push(filename);
    } finally {
      slice.remove();
    }
  }
  console.log(JSON.stringify({ status: 'DOSO_ANALYSIS_REGION_EXPORT_PASS', exported }, null, 2));
})();
