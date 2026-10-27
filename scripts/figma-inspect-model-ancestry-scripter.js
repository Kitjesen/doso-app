const root = await figma.getNodeByIdAsync('139:7848');
if (!root || !('findAll' in root)) throw new Error('Missing model-select landscape frame');
const result = root.findAll((node) => node.type === 'TEXT' && node.characters === 'THUNDER MINI').map((node) => {
  const chain = [];
  let current = node;
  while (current && current.id !== root.id) {
    chain.push({ id: current.id, name: current.name, type: current.type, width: current.width, height: current.height });
    current = current.parent;
  }
  return chain;
});
console.log(`DOSO_MODEL_ANCESTRY ${JSON.stringify(result)}`);
