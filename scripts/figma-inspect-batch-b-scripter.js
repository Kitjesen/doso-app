const ids = {
  'auth-login': ['139:5200', '139:2728', '139:7722'],
  'auth-register': ['139:5247', '139:2773', '139:7784'],
  'model-select': ['139:5298', '139:2821', '139:7848'],
  'main-analysis': ['139:6953', '139:4440', '139:10757'],
  'main-profile': ['139:7104', '139:4589', '139:10918'],
  'robot-control': ['139:6520', '139:4019', '139:8596'],
};

const result = {};
for (const [page, nodeIds] of Object.entries(ids)) {
  result[page] = [];
  for (const id of nodeIds) {
    const root = await figma.getNodeByIdAsync(id);
    if (!root) {
      result[page].push({ id, missing: true });
      continue;
    }
    const texts = 'findAll' in root
      ? root.findAll((node) => node.type === 'TEXT' && node.visible !== false).map((node) => node.characters)
      : [];
    const images = 'findAll' in root
      ? root.findAll((node) => 'fills' in node && Array.isArray(node.fills) && node.fills.some((fill) => fill.type === 'IMAGE')).map((node) => ({ id: node.id, name: node.name }))
      : [];
    result[page].push({
      id: root.id,
      name: root.name,
      type: root.type,
      size: `${root.width}x${root.height}`,
      childCount: 'children' in root ? root.children.length : 0,
      texts,
      images,
    });
  }
}

console.log(JSON.stringify(result));
