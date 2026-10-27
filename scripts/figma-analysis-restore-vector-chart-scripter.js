for (const id of ['139:6953', '139:4440', '139:10757']) {
  const root = await figma.getNodeByIdAsync(id);
  if (!root || !('findAll' in root)) throw new Error(`Missing analysis frame ${id}`);
  for (const chart of root.findAll((node) => node.type === 'FRAME' && node.name === 'Container' && node.findAll((child) => child.type === 'TEXT').length === 7)) {
    for (const child of chart.children) {
      if (child.name === 'DOSO Analysis Chart / Source PNG') child.visible = false;
      else child.visible = true;
    }
  }
  root.setPluginData('dosoChartSource', 'vector-restored/2026-09-01.1');
}
if (typeof figma.commitUndo === 'function') figma.commitUndo();
console.log('DOSO_ANALYSIS_VECTOR_CHART_RESTORED');
