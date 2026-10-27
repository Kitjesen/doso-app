const frameIds = ['139:7104', '139:4589', '139:10918'];
const frames = await Promise.all(frameIds.map((id) => figma.getNodeByIdAsync(id)));

const missingFrameIds = frameIds.filter((_, index) => !frames[index]);
if (missingFrameIds.length > 0) {
  throw new Error(`Missing profile frames: ${missingFrameIds.join(', ')}`);
}

const results = frames.map((frame, index) => {
  if (!('findAllWithCriteria' in frame)) {
    throw new Error(`Profile target ${frameIds[index]} cannot be traversed`);
  }

  const textNodes = frame.findAllWithCriteria({ types: ['TEXT'] });
  const instanceNodes = frame.findAllWithCriteria({ types: ['INSTANCE'] });
  const allNodes = [frame, ...frame.findAll(() => true)];
  const componentMap = new Map();
  const boundVariableIds = new Set();
  const textStyleIds = new Set();
  const effectStyleIds = new Set();
  const fontMap = new Map();

  for (const textNode of textNodes) {
    for (const segment of textNode.getStyledTextSegments(['fontName'])) {
      const fontName = segment.fontName;
      fontMap.set(`${fontName.family}\u0000${fontName.style}`, fontName);
    }
    if (textNode.textStyleId && textNode.textStyleId !== figma.mixed) {
      textStyleIds.add(textNode.textStyleId);
    }
  }

  for (const instance of instanceNodes) {
    const main = instance.mainComponent;
    const owner = main?.parent?.type === 'COMPONENT_SET' ? main.parent : main;
    if (owner?.key) {
      componentMap.set(owner.key, {
        key: owner.key,
        name: owner.name,
        type: owner.type,
      });
    }
  }

  for (const node of allNodes) {
    for (const binding of Object.values(node.boundVariables ?? {})) {
      const bindings = Array.isArray(binding) ? binding : [binding];
      for (const item of bindings) {
        if (item?.id) boundVariableIds.add(item.id);
      }
    }
    if ('effectStyleId' in node && node.effectStyleId && node.effectStyleId !== figma.mixed) {
      effectStyleIds.add(node.effectStyleId);
    }
  }

  return {
    frame: {
      id: frame.id,
      name: frame.name,
      type: frame.type,
      width: frame.width,
      height: frame.height,
    },
    texts: textNodes.map((node) => ({ id: node.id, name: node.name, characters: node.characters })),
    fonts: [...fontMap.values()],
    components: [...componentMap.values()],
    boundVariableIds: [...boundVariableIds],
    textStyleIds: [...textStyleIds],
    effectStyleIds: [...effectStyleIds],
  };
});

return {
  fileKey: figma.fileKey,
  editorType: figma.editorType,
  frameResults: results,
};
