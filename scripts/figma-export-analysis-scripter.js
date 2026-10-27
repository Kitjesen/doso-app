await (async () => {
  const nodes = {
    'main-analysis-light.png': '139:6953',
    'main-analysis-dark.png': '139:4440',
    'main-analysis-landscape.png': '139:10757',
  };
  const exported = [];
  for (const [filename, nodeId] of Object.entries(nodes)) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || !('exportAsync' in node)) throw new Error(`Missing exportable Figma node ${nodeId}`);
    const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
    const response = await fetch(`http://127.0.0.1:4182/export/${filename}`, { method: 'POST', body: bytes });
    if (!response.ok) throw new Error(`${filename} export failed: ${response.status}`);
    exported.push({ filename, nodeId, bytes: bytes.length });
  }
  console.log(`DOSO_ANALYSIS_FIGMA_EXPORT_PASS ${JSON.stringify(exported)}`);
})();
