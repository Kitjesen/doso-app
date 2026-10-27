(async () => {
  const root = await figma.getNodeByIdAsync('139:4126');
  if (!root || !root.absoluteBoundingBox) throw new Error('Missing Home Dark root');
  const slice = figma.createSlice();
  slice.x = root.absoluteBoundingBox.x + 20;
  slice.y = root.absoluteBoundingBox.y + 759;
  slice.resize(352, 62);
  try {
    const bytes = await slice.exportAsync({ format: 'PNG' });
    const response = await fetch('http://127.0.0.1:4182/export/home-nav-dark.png', { method: 'POST', body: bytes });
    if (!response.ok) throw new Error(`home-nav-dark.png export failed: ${response.status}`);
  } finally {
    slice.remove();
  }
})();
