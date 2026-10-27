(async () => {
  const light = await figma.getNodeByIdAsync('139:5247');
  const dark = await figma.getNodeByIdAsync('139:2773');
  const landscape = await figma.getNodeByIdAsync('139:7784');
  const socialSource = await figma.getNodeByIdAsync('139:7842');
  if (!light || !dark || !landscape || !socialSource) throw new Error('Missing register source node');

  const loadFonts = async (node) => {
    const fonts = node.getStyledTextSegments(['fontName']).map((segment) => segment.fontName);
    for (const font of fonts) await figma.loadFontAsync(font);
  };
  const replaceText = async (root, from, to) => {
    const matches = root.findAll((node) => node.type === 'TEXT' && node.characters === from);
    for (const node of matches) {
      await loadFonts(node);
      node.characters = to;
    }
    return matches.map((node) => node.id);
  };

  const mutatedNodeIds = [];
  for (const [from, to] of [
    ['填写信息后，即可连接并控制机器人', '填写信息，开始连接你的机器人'],
    ['姓名', '用户名'],
    ['输入姓名', '3-24 位字母、数字或下划线'],
    ['邮箱地址', '电子邮箱'],
    ['输入邮箱地址', '请输入电子邮箱'],
    ['设置密码', '创建密码'],
  ]) mutatedNodeIds.push(...await replaceText(light, from, to));
  mutatedNodeIds.push(...await replaceText(landscape, '欢迎回来', '创建 DOSO 账户'));
  mutatedNodeIds.push(...await replaceText(landscape, '登录你的 DOSO 账户', '填写信息，开始连接你的机器人'));

  const appleText = light.findOne((node) => node.type === 'TEXT' && node.characters === '使用 Apple 继续');
  let oldSocial = appleText;
  while (oldSocial?.parent && oldSocial.parent !== light) {
    if ('width' in oldSocial && oldSocial.width > 300 && oldSocial.height >= 40 && oldSocial.height <= 80) break;
    oldSocial = oldSocial.parent;
  }
  const social = socialSource.clone();
  light.appendChild(social);
  social.rescale(344 / 312);
  social.x = 23;
  social.y = 728;
  social.name = 'DOSO Social Providers / Unavailable';
  if (oldSocial && oldSocial !== light && 'remove' in oldSocial) oldSocial.remove();
  mutatedNodeIds.push(social.id);

  const exports = [
    ['figma-light.png', light, 0, 0, 390, 844],
    ['figma-dark.png', dark, 0, 0, 390, 844],
    ['figma-landscape.png', landscape, 0, 0, 844, 390],
    ['register-hero-light.png', light, 0, 48, 390, 152],
    ['register-hero-dark.png', dark, 0, 48, 390, 152],
    ['register-hero-landscape.png', landscape, 20, 39, 433, 327],
  ];
  const exported = [];
  for (const [filename, root, x, y, width, height] of exports) {
    const slice = figma.createSlice();
    slice.x = root.absoluteBoundingBox.x + x;
    slice.y = root.absoluteBoundingBox.y + y;
    slice.resize(width, height);
    try {
      const bytes = await slice.exportAsync({ format: 'PNG' });
      const response = await fetch(`http://127.0.0.1:4183/export/${filename}`, { method: 'POST', body: bytes });
      if (!response.ok) throw new Error(`${filename} export failed: ${response.status}`);
      exported.push(filename);
    } finally {
      slice.remove();
    }
  }
  console.log(JSON.stringify({ status: 'DOSO_REGISTER_FIGMA_FIX_PASS', mutatedNodeIds, exported }, null, 2));
})();
