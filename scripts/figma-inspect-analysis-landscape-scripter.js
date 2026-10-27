const root = await figma.getNodeByIdAsync('139:10757');
if (!root || !('children' in root)) throw new Error('Missing analysis landscape frame');
const output = root.children.map((node) => ({
  id: node.id,
  name: node.name,
  type: node.type,
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
  texts: 'findAll' in node ? node.findAll((child) => child.type === 'TEXT').map((child) => child.characters) : [],
}));
const left = root.children.find((node) => node.name === '左侧规范');
const leftChildren = left && 'children' in left ? left.children.map((node) => ({
  id: node.id,
  name: node.name,
  type: node.type,
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
  texts: 'findAll' in node ? node.findAll((child) => child.type === 'TEXT').map((child) => child.characters) : [],
})) : [];
const darkRoot = await figma.getNodeByIdAsync('139:4440');
const darkMonthly = darkRoot && 'children' in darkRoot
  ? darkRoot.children.find((node) => 'findAll' in node && node.findAll((child) => child.type === 'TEXT' && child.characters === '四月').length > 0)
  : null;
const darkMonthlyChildren = darkMonthly && 'children' in darkMonthly ? darkMonthly.children.map((node) => ({
  id: node.id,
  name: node.name,
  type: node.type,
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
  texts: 'findAll' in node ? node.findAll((child) => child.type === 'TEXT').map((child) => child.characters) : [],
})) : [];
const week = darkMonthly && 'children' in darkMonthly ? darkMonthly.children.find((node) => node.name === 'Resting heart rate- week') : null;
const weekChildren = week && 'children' in week ? week.children.map((node) => ({
  id: node.id,
  name: node.name,
  type: node.type,
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
  texts: 'findAll' in node ? node.findAll((child) => child.type === 'TEXT').map((child) => child.characters) : [],
})) : [];
console.log(`DOSO_ANALYSIS_STRUCTURE ${JSON.stringify({ output, leftChildren, darkMonthly: darkMonthly ? { id: darkMonthly.id, name: darkMonthly.name, x: darkMonthly.x, y: darkMonthly.y, width: darkMonthly.width, height: darkMonthly.height } : null, darkMonthlyChildren, weekChildren })}`);
