// DOSO social-auth state specification for Figma Scripter.
// Idempotent: it preserves non-generated nodes and safely updates its owned section.

async function main() {
  const SECTION_NAME = 'DOSO · Auth Social UX · Source Sync';
  const SOURCE = 'doso-app/scripts/figma-social-auth-ux-scripter.js';
  const providers = [
    {
      id: 'apple',
      label: 'Apple',
      color: '#111111',
      darkBorder: '#F7F9FC',
      path: 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04c-2.04.027-3.91 1.183-4.961 3.014c-2.117 3.675-.546 9.103 1.519 12.09c1.013 1.454 2.208 3.09 3.792 3.039c1.52-.065 2.09-.987 3.935-.987c1.831 0 2.35.987 3.96.948c1.637-.026 2.676-1.48 3.676-2.948c1.156-1.688 1.636-3.325 1.662-3.415c-.039-.013-3.182-1.221-3.22-4.857c-.026-3.04 2.48-4.494 2.597-4.559c-1.429-2.09-3.623-2.324-4.39-2.376c-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83c-1.207.052-2.662.805-3.532 1.818c-.78.896-1.454 2.338-1.273 3.714c1.338.104 2.715-.688 3.559-1.701',
    },
    {
      id: 'wechat',
      label: '微信',
      color: '#07C160',
      darkBorder: '#07C160',
      path: 'M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213c0 .163.13.295.29.295a.33.33 0 0 0 .167-.054l1.903-1.114a.86.86 0 0 1 .717-.098a10.2 10.2 0 0 0 2.837.403c.276 0 .543-.027.811-.05c-.857-2.578.157-4.972 1.932-6.446c1.703-1.415 3.882-1.98 5.853-1.838c-.576-3.583-4.196-6.348-8.596-6.348M5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178a1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18m5.34 2.867c-1.797-.052-3.746.512-5.28 1.786c-1.72 1.428-2.687 3.72-1.78 6.22c.942 2.453 3.666 4.229 6.884 4.229c.826 0 1.622-.12 2.361-.336a.72.72 0 0 1 .598.082l1.584.926a.3.3 0 0 0 .14.047c.134 0 .24-.111.24-.247c0-.06-.023-.12-.038-.177l-.327-1.233a.6.6 0 0 1-.023-.156a.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983a.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983a.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982',
    },
    {
      id: 'qq',
      label: 'QQ',
      color: '#12B7F5',
      darkBorder: '#12B7F5',
      path: 'M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673c.54.065 2.103-2.472 2.103-2.472c0 1.469.756 3.387 2.394 4.771c-.612.188-1.363.479-1.845.835c-.434.32-.379.646-.301.778c.343.578 5.883.369 7.482.189c1.6.18 7.14.389 7.483-.189c.078-.132.132-.458-.301-.778c-.483-.356-1.233-.646-1.846-.836c1.637-1.384 2.393-3.302 2.393-4.771c0 0 1.563 2.537 2.103 2.472c.251-.03.581-1.39-.438-4.673',
    },
  ];

  if (figma.editorType !== 'figma') throw new Error('请在 Figma Design 文件中运行。');
  const existing = figma.currentPage.children.find((node) => node.type === 'SECTION' && node.name === SECTION_NAME);
  if (existing) {
    const owned = existing.getPluginData('source') === SOURCE
      && existing.getPluginData('createdFrameCount') === '4'
      && existing.children.length === 4
      && existing.children.every((node) => node.type === 'FRAME' && node.getPluginData('source') === SOURCE);
    if (!owned) throw new Error(`已存在同名 Section，但不是可安全更新的 DOSO 社交状态节点：${existing.id}`);
  }

  const available = await figma.listAvailableFontsAsync();
  if (!available.length) throw new Error('Figma 未返回可用字体。');
  const preferred = ['Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Roboto', 'Inter'];
  const family = preferred.find((candidate) => available.some((item) => item.fontName.family === candidate)) || available[0].fontName.family;
  const familyFonts = available.filter((item) => item.fontName.family === family).map((item) => item.fontName);
  const pick = (pattern) => familyFonts.find((font) => pattern.test(font.style)) || familyFonts[0];
  const fonts = { regular: pick(/regular|normal|book/i), semibold: pick(/semi.?bold|medium/i), bold: pick(/bold|heavy/i) };
  await Promise.all([...new Map(Object.values(fonts).map((font) => [`${font.family}/${font.style}`, font])).values()].map((font) => figma.loadFontAsync(font)));

  const hex = (value) => ({
    r: parseInt(value.slice(1, 3), 16) / 255,
    g: parseInt(value.slice(3, 5), 16) / 255,
    b: parseInt(value.slice(5, 7), 16) / 255,
  });
  const solid = (value, opacity = 1) => ({ type: 'SOLID', color: hex(value), opacity });
  const palette = {
    light: { bg: '#FCFCFD', surface: '#FFFFFF', subtle: '#F2F4F7', text: '#111827', muted: '#667085', border: '#E4E7EC' },
    dark: { bg: '#0E1116', surface: '#171D25', subtle: '#252D38', text: '#F7F9FC', muted: '#A8B1BD', border: '#394451' },
  };

  const frame = (name, direction, width, height, fill) => {
    const node = figma.createFrame();
    node.name = name;
    node.resize(width, height);
    node.layoutMode = direction;
    node.primaryAxisSizingMode = 'FIXED';
    node.counterAxisSizingMode = 'FIXED';
    node.clipsContent = true;
    node.fills = fill ? [fill] : [];
    return node;
  };
  const text = (name, value, size, weight, color, width, lineHeight = Math.round(size * 1.45)) => {
    const node = figma.createText();
    node.name = name;
    node.fontName = fonts[weight] || fonts.regular;
    node.fontSize = size;
    node.lineHeight = { unit: 'PIXELS', value: lineHeight };
    node.textAutoResize = 'HEIGHT';
    node.resize(width, lineHeight);
    node.characters = value;
    node.fills = [solid(color)];
    return node;
  };
  const append = (parent, child) => { parent.appendChild(child); return child; };
  const statusRow = (label, value, width, theme) => {
    const row = frame(`Status / ${label}`, 'VERTICAL', width, 62, solid(theme.subtle));
    row.cornerRadius = 14;
    row.paddingLeft = row.paddingRight = 14;
    row.paddingTop = row.paddingBottom = 9;
    row.itemSpacing = 2;
    append(row, text('Label', label, 10, 'semibold', theme.muted, width - 28, 14));
    append(row, text('Value', value, 12, 'regular', theme.text, width - 28, 18));
    return row;
  };
  const providerButton = (provider, selected, unavailable, dark) => {
    const selectedColor = dark ? provider.darkBorder : provider.color;
    const selectedFill = provider.id === 'apple'
      ? solid(dark ? '#FFFFFF' : '#F2F3F5', dark ? 0.12 : 1)
      : solid(provider.color, dark ? 0.18 : 0.10);
    const outer = frame(`Social / ${provider.label} / ${selected ? 'Selected Busy' : unavailable ? 'Unavailable' : 'Available'}`, 'NONE', 56, 56, selected ? selectedFill : null);
    outer.cornerRadius = 18;
    outer.strokes = selected ? [solid(selectedColor)] : [];
    outer.strokeWeight = selected ? 2 : 0;
    const plate = frame('Brand Mark / 44', 'NONE', 44, 44, solid('#FFFFFF'));
    plate.cornerRadius = 12;
    plate.opacity = unavailable && !selected ? 0.28 : 1;
    outer.appendChild(plate); plate.x = 6; plate.y = 6;
    const iconColor = unavailable && !selected ? '#111111' : provider.color;
    const icon = figma.createNodeFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><path fill="${iconColor}" d="${provider.path}"/></svg>`);
    icon.name = `${provider.label} / Simple Icons`;
    icon.resize(28, 28);
    plate.appendChild(icon); icon.x = 8; icon.y = 8;
    if (selected) {
      const spinnerBackdrop = figma.createEllipse();
      spinnerBackdrop.name = 'Pending Indicator / Backdrop';
      spinnerBackdrop.resize(16, 16);
      spinnerBackdrop.fills = [solid(dark ? '#171D25' : '#FFFFFF')];
      outer.appendChild(spinnerBackdrop); spinnerBackdrop.x = 38; spinnerBackdrop.y = 38;
      const spinner = figma.createEllipse();
      spinner.name = 'Pending Indicator';
      spinner.resize(12, 12);
      spinner.fills = [];
      spinner.strokes = [solid(selectedColor)];
      spinner.strokeWeight = 2;
      outer.appendChild(spinner); spinner.x = 40; spinner.y = 40;
    }
    return outer;
  };
  const socialRow = (selectedProvider, busy, dark) => {
    const row = frame('Social Provider Row / gap 20', 'HORIZONTAL', 208, 56, null);
    row.itemSpacing = 20;
    providers.forEach((provider) => append(row, providerButton(provider, busy && provider.id === selectedProvider, !busy || provider.id !== selectedProvider, dark)));
    return row;
  };
  const portrait = ({ name, dark, selectedProvider, busy, stateLabel, truth }) => {
    const theme = dark ? palette.dark : palette.light;
    const root = frame(name, 'VERTICAL', 390, 844, solid(theme.bg));
    root.paddingLeft = root.paddingRight = 24;
    root.paddingTop = 50;
    root.paddingBottom = 34;
    root.itemSpacing = 18;
    append(root, text('Eyebrow', 'AUTH · SOCIAL LOGIN UX', 11, 'bold', '#157A4F', 342, 16));
    append(root, text('Title', busy ? `${stateLabel}授权中` : '第三方登录入口', 28, 'bold', theme.text, 342, 38));
    append(root, text('Subtitle', '三个入口共用 56px 点击区、44px 光学画布与一致的状态语义。', 13, 'regular', theme.muted, 342, 20));
    const card = frame('State Card', 'VERTICAL', 342, 442, solid(theme.surface));
    card.cornerRadius = 24;
    card.paddingLeft = card.paddingRight = 20;
    card.paddingTop = card.paddingBottom = 20;
    card.itemSpacing = 15;
    card.strokes = [solid(theme.border)]; card.strokeWeight = 1;
    append(card, text('State Label', busy ? 'SELECTED + BUSY' : 'PRODUCTION DEFAULT', 10, 'bold', busy ? '#157A4F' : theme.muted, 302, 15));
    append(card, socialRow(selectedProvider, busy, dark));
    append(card, text('Provider Status', busy ? `${stateLabel} · 已选中 · 正在打开授权` : 'Apple / 微信 / QQ · 当前均未配置', 12, 'semibold', busy ? (selectedProvider === 'qq' ? '#12B7F5' : selectedProvider === 'wechat' ? '#07C160' : dark ? '#F7F9FC' : '#111111') : theme.muted, 302, 18));
    append(card, statusRow('视觉合同', '外框 56×56 · 图标画布 44×44 · 间距 20', 302, theme));
    append(card, statusRow('可访问性', busy ? 'selected=true · busy=true · disabled=true' : 'selected=false · busy=false · disabled=true', 302, theme));
    append(card, text('Truth Contract', truth, 11, 'regular', theme.muted, 302, 18));
    append(root, card);
    append(root, text('Source Note', '状态示例用于设计与 QA；只有 provider readiness=true 时，产品才可进入选中/授权中状态。', 11, 'regular', theme.muted, 342, 18));
    root.setPluginData('source', SOURCE);
    root.setPluginData('socialAuthState', busy ? `pending:${selectedProvider}` : 'unavailable');
    root.setPluginData('truthContract', truth);
    return root;
  };
  const landscape = () => {
    const theme = palette.light;
    const root = frame('auth-social · Apple Selected Busy · Landscape', 'NONE', 844, 390, solid(theme.bg));
    const left = frame('Landscape / Context', 'VERTICAL', 392, 350, solid('#EAFBF1'));
    left.cornerRadius = 24; left.paddingLeft = left.paddingRight = 24; left.paddingTop = left.paddingBottom = 24; left.itemSpacing = 16;
    append(left, text('Eyebrow', 'LANDSCAPE · 20 / 392 / 20 / 392 / 20', 10, 'bold', '#157A4F', 344, 15));
    append(left, text('Title', 'Apple 授权中', 30, 'bold', theme.text, 344, 40));
    append(left, text('Description', '横屏保持双栏结构，不缩放竖屏稿；左右物理安全区各 20px。', 13, 'regular', theme.muted, 344, 20));
    append(left, statusRow('并发合同', '同一时刻仅允许一个 OAuth 操作', 344, theme));
    root.appendChild(left); left.x = 20; left.y = 20;
    const right = frame('Landscape / Component', 'VERTICAL', 392, 350, solid(theme.surface));
    right.cornerRadius = 24; right.paddingLeft = right.paddingRight = 24; right.paddingTop = right.paddingBottom = 24; right.itemSpacing = 18;
    right.strokes = [solid(theme.border)]; right.strokeWeight = 1;
    append(right, text('State', 'SELECTED + BUSY', 10, 'bold', '#157A4F', 344, 15));
    append(right, socialRow('apple', true, false));
    append(right, text('Provider Status', 'Apple · 已选中 · 正在打开授权', 13, 'semibold', '#111111', 344, 20));
    append(right, statusRow('安全边界', '取消、错误、回调完成后必须清除选中态', 344, theme));
    append(right, text('Truth Contract', '静态状态稿不代表 Apple 登录已在当前环境开放。', 11, 'regular', theme.muted, 344, 18));
    root.appendChild(right); right.x = 432; right.y = 20;
    root.setPluginData('source', SOURCE);
    root.setPluginData('socialAuthState', 'pending:apple');
    root.setPluginData('landscapeGrid', 'safe 20 / 392 / gap 20 / 392 / safe 20');
    return root;
  };

  let section = existing;
  const updatedExistingSection = Boolean(section);
  if (section) {
    [...section.children].forEach((child) => child.remove());
  } else {
    let rightEdge = 0;
    for (const child of figma.currentPage.children) rightEdge = Math.max(rightEdge, child.x + child.width);
    section = figma.createSection();
    section.x = rightEdge + 240;
    section.y = 0;
  }
  section.name = SECTION_NAME;
  section.resizeWithoutConstraints(1370, 1390);
  section.fills = [solid('#E8F0F7', 0.55)];
  section.setPluginData('source', SOURCE);
  section.setPluginData('contractVersion', '2026-08-28.2');
  section.setPluginData('contract', 'default unavailable + provider selected/busy + dark + landscape');

  const frames = [
    portrait({ name: 'auth-social · Production Default · Light', dark: false, selectedProvider: null, busy: false, stateLabel: '', truth: '真实产品当前 provider readiness=false，全部保持不可用且不得伪造可执行状态。' }),
    portrait({ name: 'auth-social · WeChat Selected Busy · Light', dark: false, selectedProvider: 'wechat', busy: true, stateLabel: '微信', truth: '仅 readiness=true 且操作进行中时显示；取消、错误或完成后立即清除。' }),
    portrait({ name: 'auth-social · QQ Selected Busy · Dark', dark: true, selectedProvider: 'qq', busy: true, stateLabel: 'QQ', truth: '深色模式使用品牌描边与暗色选中底，不保留孤立浅色页面区域。' }),
    landscape(),
  ];
  const positions = [[40, 50], [470, 50], [900, 50], [40, 940]];
  frames.forEach((item, index) => {
    section.appendChild(item);
    item.x = positions[index][0];
    item.y = positions[index][1];
  });
  section.setPluginData('createdFrameCount', String(frames.length));
  figma.currentPage.selection = [section];
  figma.viewport.scrollAndZoomIntoView([section]);
  if (typeof figma.commitUndo === 'function') figma.commitUndo();
  return { sectionId: section.id, createdFrameCount: frames.length, updatedExistingSection, frameIds: frames.map((item) => item.id), fontFamily: family };
}

try {
  print(await main());
} catch (error) {
  print(error);
  throw error;
}
