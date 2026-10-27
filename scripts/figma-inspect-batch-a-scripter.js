await (async () => {
  const ids = ['139:7397', '139:4784', '139:10680'];
  const keys = /巡航路线|全部路线|可用路线模板|A 区巡航模板|仓库环线模板|充电座外围模板|路线控制不可用|自定义|Hello|你好/;
  const box = (node, root) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    x: Math.round(node.absoluteTransform[0][2] - root.absoluteTransform[0][2]),
    y: Math.round(node.absoluteTransform[1][2] - root.absoluteTransform[1][2]),
    width: Math.round(node.width),
    height: Math.round(node.height),
  });
  const output = [];
  for (const id of ids) {
    const root = await figma.getNodeByIdAsync(id);
    if (!root || root.type !== 'FRAME') throw new Error(`Missing frame ${id}`);
    output.push({
      id,
      hits: root.findAllWithCriteria({ types: ['TEXT'] }).filter((node) => keys.test(node.characters)).map((node) => {
        const chain = [];
        let current = node;
        while (current && current !== root) {
          chain.push(box(current, root));
          current = current.parent;
        }
        return { value: node.characters, chain };
      }),
    });
  }
  console.log(`DOSO_BATCH_A_INSPECT ${JSON.stringify(output)}`);
})();
