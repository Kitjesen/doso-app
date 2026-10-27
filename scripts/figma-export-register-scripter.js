(async () => {
  const exports = [
    ['figma-light.png', '139:5247'],
    ['figma-dark.png', '139:2773'],
    ['figma-landscape.png', '139:7784'],
  ];
  const exported = [];
  for (const [filename, nodeId] of exports) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node?.absoluteBoundingBox) throw new Error(`Missing register root ${nodeId}`);
    const bytes = await node.exportAsync({ format: 'PNG' });
    const response = await fetch(`http://127.0.0.1:4183/export/${filename}`, { method: 'POST', body: bytes });
    if (!response.ok) throw new Error(`${filename} export failed: ${response.status}`);
    exported.push(filename);
  }
  console.log(JSON.stringify({ status: 'DOSO_REGISTER_EXPORT_PASS', exported }, null, 2));
})();
