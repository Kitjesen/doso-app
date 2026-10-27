await (async () => {
  const recallSource = await fetch('http://127.0.0.1:4182/figma-home-recall-disabled-scripter.js?v=20260901a').then((response) => response.text());
  await eval(`(async()=>{${recallSource}})()`);
  const nodes = {
    'main-routes-light.png': '139:7397',
    'main-routes-dark.png': '139:4784',
    'main-routes-landscape.png': '139:10680',
    'main-tasks-light.png': '139:6722',
    'main-tasks-dark.png': '139:4209',
    'main-tasks-landscape.png': '139:11041',
    'main-home-light.png': '139:6636',
    'main-home-dark.png': '139:4126',
    'main-home-landscape.png': '139:10575',
  };
  const exported = [];
  for (const [filename, nodeId] of Object.entries(nodes)) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || !('exportAsync' in node)) throw new Error(`Missing exportable Figma node ${nodeId}`);
    const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
    const response = await fetch(`http://127.0.0.1:4182/export/${filename}`, { method: 'POST', body: bytes });
    if (!response.ok) throw new Error(`${filename} export failed: ${response.status} ${await response.text()}`);
    exported.push({ filename, nodeId, bytes: bytes.length });
  }
  const homeLandscape = await figma.getNodeByIdAsync('139:10575');
  if (!homeLandscape || homeLandscape.type !== 'FRAME') throw new Error('Missing main-home landscape frame');
  const arrowCenter = { x: 477.5, y: 353 };
  const arrowCandidates = homeLandscape.findAll((node) => {
    if (!('width' in node) || node.width > 24 || node.height > 24 || !('exportAsync' in node)) return false;
    const x = node.absoluteTransform[0][2] - homeLandscape.absoluteTransform[0][2] + node.width / 2;
    const y = node.absoluteTransform[1][2] - homeLandscape.absoluteTransform[1][2] + node.height / 2;
    return Math.abs(x - arrowCenter.x) <= 12 && Math.abs(y - arrowCenter.y) <= 12;
  }).sort((a, b) => b.width * b.height - a.width * a.height);
  const arrow = arrowCandidates[0];
  if (!arrow) throw new Error('Missing main-home quick-arrow vector');
  const arrowBytes = await arrow.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
  const arrowResponse = await fetch('http://127.0.0.1:4182/export/home-quick-arrow.png', { method: 'POST', body: arrowBytes });
  if (!arrowResponse.ok) throw new Error(`home-quick-arrow.png export failed: ${arrowResponse.status} ${await arrowResponse.text()}`);
  exported.push({ filename: 'home-quick-arrow.png', nodeId: arrow.id, bytes: arrowBytes.length });
  console.log(`DOSO_BATCH_A_FIGMA_EXPORT_PASS ${JSON.stringify(exported)}`);
})();
