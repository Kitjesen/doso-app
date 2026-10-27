await (async () => {
  const pages = {
    'auth-login': ['139:5200', '139:2728', '139:7722'],
    'auth-register': ['139:5247', '139:2773', '139:7784'],
    'model-select': ['139:5298', '139:2821', '139:7848'],
    'main-analysis': ['139:6953', '139:4440', '139:10757'],
    'main-profile': ['139:7104', '139:4589', '139:10918'],
    'robot-control': ['139:6520', '139:4019', '139:8596'],
  };
  const states = ['light', 'dark', 'landscape'];
  const exported = [];
  for (const [page, nodeIds] of Object.entries(pages)) {
    for (let index = 0; index < nodeIds.length; index += 1) {
      const nodeId = nodeIds[index];
      const filename = `${page}-${states[index]}.png`;
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node || !('exportAsync' in node)) throw new Error(`Missing exportable Figma node ${nodeId}`);
      const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
      const response = await fetch(`http://127.0.0.1:4182/export/${filename}`, { method: 'POST', body: bytes });
      if (!response.ok) throw new Error(`${filename} export failed: ${response.status} ${await response.text()}`);
      exported.push({ filename, nodeId, bytes: bytes.length });
    }
  }
  console.log(`DOSO_BATCH_B_FIGMA_EXPORT_PASS ${JSON.stringify(exported)}`);
})();
