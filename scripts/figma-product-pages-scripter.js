// DOSO product-page upgrade for the Figma community "Scripter" plugin.
// Run after figma-foundations-scripter.js in the editable DOSO copy.
await (async () => {
  const SECTION_NAME = 'DOSO · Source Sync · 11 Pages × 3 States';
  const SOURCE = 'doso-app/scripts/figma-product-pages-scripter.js';
  const VERSION = '2026-09-04.20';
  const COLLECTIONS = {
    light: 'DOSO / Source Sync Theme / 2026-08-30.1 / 1788030368833',
    dark: 'DOSO / Source Sync Theme / 2026-08-30.1 / Dark / 1788030368833',
  };
  const PORTRAIT = { width: 390, height: 844 };
  const LANDSCAPE = { width: 844, height: 390 };
  const COMPONENT_FAMILIES = ['Page Shell', 'Input', 'Primary Button', 'Status', 'Social Entry', 'Navigation'];
  const pages = [
    { id: 'auth-email-otp', title: '输入验证码', subtitle: '验证邮箱，完成 DOSO 账户注册', status: '等待输入邮件中的验证码', tone: 'Neutral', fields: [['验证码', '••••••']], action: '验证并继续', disabled: true },
    { id: 'auth-forgot-password', title: '找回密码', subtitle: '输入注册邮箱，我们会发送邮箱验证码', status: '等待填写邮箱', tone: 'Neutral', fields: [['邮箱', '请输入注册邮箱']], action: '发送验证码', disabled: false },
    { id: 'auth-reset-password', title: '重置密码', subtitle: '设置一个新的安全密码', status: '等待有效的恢复会话', tone: 'Warning', fields: [['新密码', '至少 10 位，含大小写字母和数字'], ['确认新密码', '再次输入新密码']], action: '更新密码', disabled: false },
    { id: 'auth-username', title: '设置用户名', subtitle: '用于 DOSO 设备与账户识别，设置后不可修改', status: '尚未认领用户名', tone: 'Neutral', fields: [['用户名', '3-24 位小写字母、数字或下划线']], action: '确认用户名', disabled: false },
    { id: 'auth-display-name', title: '确认显示名称', subtitle: '显示名称用于个人资料展示，可与不可修改的 DOSO 用户名不同', status: 'Apple 首次登录资料待确认', tone: 'Neutral', fields: [['显示名称', '请输入用于展示的名称']], action: '保存显示名称', disabled: false },
    { id: 'auth-mfa', title: '管理员双重验证', subtitle: '为 DOSO 管理端准备 TOTP AAL2 验证', status: '正在读取账户安全状态', tone: 'Neutral', fields: [], action: '读取中', disabled: true, loading: true },
    { id: 'device-bind', title: '绑定机器人', subtitle: '序列号确认设备身份，一次性绑定码证明你持有这台设备。绑定码只会在后端以摘要形式保存。', status: '尚未提交绑定凭据', tone: 'Neutral', fields: [['设备序列号', '例如 DOSO-TH-000001'], ['一次性绑定码', '6–32 位字母或数字']], action: '绑定设备', disabled: false },
    { id: 'device-ble-discovery', title: '查找附近机器人', subtitle: '候选设备处于身份未验证状态，待固件 GATT 握手协议接入后才能继续配网', status: '扫描尚未开始', tone: 'Neutral', fields: [], action: '开始查找附近设备', disabled: false },
    { id: 'device-provisioning', title: '安全配网', subtitle: '为 THUNDER 01 验证身份，再通过临时安全通道演示凭据发送，最后等待云端在线确认。', status: '硬件连接尚未开放', tone: 'Unavailable', fields: [], action: null, disabled: true, unavailable: true },
    { id: 'device-firmware', title: '固件更新', subtitle: '更新包会先校验，再写入备用分区；安装、重启和恢复阶段请勿关闭机器人电源。', status: '硬件连接尚未开放', tone: 'Unavailable', fields: [], action: null, disabled: true, unavailable: true },
    { id: 'account-security', title: '账号与安全', subtitle: '管理密码、邮箱验证与登录终端', status: '正在同步真实账户状态', tone: 'Neutral', fields: [], action: '读取中', disabled: true, loading: true },
  ];

  if (figma.editorType !== 'figma') throw new Error('请在 Figma Design 文件中运行。');
  if (!figma.variables || !figma.createComponent || !figma.combineAsVariants || !figma.createSection) {
    throw new Error('当前 Figma Plugin API 缺少变量、组件或 Section 能力。');
  }

  const existing = figma.currentPage.children.find((node) => node.type === 'SECTION' && node.name === SECTION_NAME);
  if (existing && existing.getPluginData('source') === SOURCE && existing.getPluginData('contractVersion') === VERSION) {
    const mapping = JSON.parse(existing.getPluginData('nodeMapping') || '{}');
    const frames = existing.findAll((node) => node.type === 'FRAME' && Boolean(node.getPluginData('dosoPageId')));
    const families = existing.findAll((node) => node.type === 'COMPONENT_SET' && node.name.startsWith('DOSO/'));
    if (frames.length !== 33 || families.length !== 6) throw new Error('已生成 Section 的节点映射失效，请先检查文件。');
    console.log(JSON.stringify({ status: 'DOSO_PRODUCT_PAGES_ALREADY_CURRENT', sectionId: existing.id, mapping }, null, 2));
    return;
  }
  if (existing) {
    const oldSource = existing.getPluginData('source');
    const oldFrames = existing.findAll((node) => node.type === 'FRAME' && Boolean(node.getPluginData('dosoPageId')));
    const owned = oldFrames.length === 33 && [SOURCE, 'doso-app/scripts/figma-source-sync-scripter-min.js'].includes(oldSource);
    if (!owned) throw new Error(`同名 Section 不是可安全替换的 DOSO 节点：${existing.id}`);
  }

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  const themes = {};
  for (const [scheme, name] of Object.entries(COLLECTIONS)) {
    const collection = collections.find((item) => item.name === name);
    if (!collection) throw new Error(`Missing exact DOSO collection: ${name}`);
    if (collection.modes.length !== 1) throw new Error(`${name} must keep one Starter-plan mode`);
    const byName = new Map(variables.filter((item) => item.variableCollectionId === collection.id).map((item) => [item.name, item]));
    const get = (canonical, fallback) => byName.get(`color/${canonical}`) || (fallback && byName.get(`color/${fallback}`));
    themes[scheme] = {
      collection,
      modeId: collection.modes[0].modeId,
      background: get('background'), surface: get('surface'), surfaceStrong: get('surfaceStrong', 'subtle'),
      ink: get('ink', 'text'), inkSoft: get('inkSoft', 'text'), muted: get('muted'), line: get('line', 'border'),
      navStart: get('navStart', 'accentInk'), navEnd: get('navEnd', 'accentInk'), green: get('green', 'accent'),
      greenStrong: get('greenStrong', 'accent'), greenDark: get('greenDark', 'accentInk'), successText: get('successText', 'accentText'),
      dangerText: get('dangerText'), dangerSurface: get('dangerSurface'), authBackground: get('authBackground', 'background'),
      authBorder: get('authBorder', 'border'), authFocus: get('authFocus', 'accentText'), authPrimary: get('authPrimary', 'accent'),
    };
    const missing = Object.entries(themes[scheme]).filter(([key, value]) => !['collection', 'modeId'].includes(key) && !value).map(([key]) => key);
    if (missing.length) throw new Error(`${name} missing foundations: ${missing.join(', ')}`);
  }

  const available = await figma.listAvailableFontsAsync();
  const family = ['Noto Sans SC', 'Roboto', 'Microsoft YaHei', 'Inter'].find((name) => available.some((item) => item.fontName.family === name)) || available[0]?.fontName.family;
  if (!family) throw new Error('Figma 未返回可用字体。');
  const familyFonts = available.filter((item) => item.fontName.family === family).map((item) => item.fontName);
  const pick = (pattern) => familyFonts.find((font) => pattern.test(font.style)) || familyFonts[0];
  const fonts = { regular: pick(/regular|normal|book/i), semibold: pick(/semi.?bold|medium/i), bold: pick(/bold|heavy/i) };
  await Promise.all([...new Map(Object.values(fonts).map((font) => [`${font.family}/${font.style}`, font])).values()].map((font) => figma.loadFontAsync(font)));

  const created = [];
  const track = (node) => { created.push(node); return node; };
  const append = (parent, child) => { parent.appendChild(child); return child; };
  const paint = (variable) => figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', variable);
  const fill = (node, variable) => { node.fills = [paint(variable)]; };
  const stroke = (node, variable) => { node.strokes = [paint(variable)]; node.strokeWeight = 1; };
  const text = (parent, name, value, size, weight, variable, x, y, width, lineHeight = Math.round(size * 1.4)) => {
    const node = append(parent, track(figma.createText()));
    node.name = name; node.fontName = fonts[weight]; node.fontSize = size; node.lineHeight = { unit: 'PIXELS', value: lineHeight };
    node.characters = value; node.textAutoResize = 'HEIGHT'; node.resize(width, lineHeight); node.x = x; node.y = y; node.fills = [paint(variable)];
    return node;
  };
  const frame = (parent, name, width, height, variable, x = 0, y = 0, radius = 0) => {
    const node = append(parent, track(figma.createFrame()));
    node.name = name; node.resize(width, height); node.x = x; node.y = y; node.clipsContent = true; node.cornerRadius = radius; node.fills = variable ? [paint(variable)] : [];
    return node;
  };
  const svgIcon = (parent, name, svg, variable, x, y, size = 22) => {
    const node = append(parent, track(figma.createNodeFromSvg(svg)));
    node.name = name; node.resize(size, size); node.x = x; node.y = y;
    const shapes = node.findAll((child) => 'fills' in child || 'strokes' in child);
    for (const shape of shapes) {
      if ('fills' in shape && shape.fills !== figma.mixed && shape.fills.length) shape.fills = [paint(variable)];
      if ('strokes' in shape && shape.strokes !== figma.mixed && shape.strokes.length) shape.strokes = [paint(variable)];
    }
    return node;
  };
  const component = (parent, name, width, height, variable) => {
    const node = append(parent, track(figma.createComponent()));
    node.name = name; node.resize(width, height); node.clipsContent = true; node.fills = variable ? [paint(variable)] : [];
    return node;
  };
  const overrideText = (instance, name, value) => {
    const node = instance.findOne((child) => child.type === 'TEXT' && child.name === name);
    if (!node) throw new Error(`${instance.name} missing ${name}`);
    node.characters = value;
  };
  const createSet = (library, familyName, variants) => {
    const nodes = variants.map((variant) => variant());
    const set = figma.combineAsVariants(nodes, library);
    set.name = `DOSO/${familyName}`;
    set.description = `DOSO shared ${familyName}. Generated by ${SOURCE}; edit the component family, not individual screens.`;
    return { set, nodes };
  };

  let staging = null;
  try {
    staging = track(figma.createSection());
    staging.name = `${SECTION_NAME} · staging`;
    staging.x = existing?.x ?? Math.max(0, ...figma.currentPage.children.filter((node) => node !== staging).map((node) => node.x + node.width)) + 160;
    staging.y = existing?.y ?? 0;
    staging.resizeWithoutConstraints(1748, 9950);
    const library = frame(staging, 'DOSO · Shared Components', 1, 1, null);
    library.visible = false;

    const families = {};
    families.pageShell = createSet(library, 'Page Shell', ['light', 'dark'].map((scheme) => () => {
      const t = themes[scheme];
      const node = component(library, `Theme=${scheme === 'light' ? 'Light' : 'Dark'}`, 390, 844, t.authBackground);
      text(node, 'System Time', '9:41', 12, 'semibold', t.ink, 24, 14, 80, 18).constraints = { horizontal: 'MIN', vertical: 'MIN' };
      return node;
    }));
    families.input = createSet(library, 'Input', ['light', 'dark'].flatMap((scheme) => ['Regular', 'Compact', 'Device'].flatMap((density) => ['Default', 'Focused'].map((state) => () => {
      const t = themes[scheme];
      const compact = density === 'Compact';
      const device = density === 'Device';
      const node = component(library, `Theme=${scheme === 'light' ? 'Light' : 'Dark'}, State=${state}, Density=${density}`, compact ? 440 : device ? 314 : 342, compact ? 54 : device ? 69 : 74, null);
      text(node, 'FieldLabel', '字段', device ? 11 : 12, 'semibold', t.ink, 0, 0, node.width, compact || device ? 15 : 18).constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
      const box = frame(node, 'Input Surface', node.width, compact ? 38 : device ? 52 : 48, device ? t.background : t.authBackground, 0, compact ? 16 : device ? 17 : 26, compact ? 22 : device ? 18 : 14); stroke(box, state === 'Focused' ? t.authFocus : device ? t.line : t.authBorder);
      box.constraints = { horizontal: 'STRETCH', vertical: 'MAX' };
      text(box, 'FieldValue', '请输入', compact ? 12 : 14, 'regular', t.muted, device ? 16 : 14, compact ? 11 : device ? 15 : 13, node.width - (device ? 32 : 28), compact ? 16 : device ? 20 : 20).constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
      return node;
    }))));
    families.button = createSet(library, 'Primary Button', ['light', 'dark'].flatMap((scheme) => ['Auth', 'Bright', 'DarkAction'].flatMap((style) => ['Default', 'Disabled'].map((state) => () => {
      const t = themes[scheme];
      const disabled = state === 'Disabled';
      const bright = style === 'Bright';
      const darkAction = style === 'DarkAction';
      const node = component(library, `Theme=${scheme === 'light' ? 'Light' : 'Dark'}, State=${state}, Style=${style}`, 342, bright ? 56 : darkAction ? 50 : 52, disabled ? t.surfaceStrong : bright ? null : darkAction ? t.greenDark : t.authPrimary);
      if (bright && !disabled) node.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[1, 0, 0], [0, 1, 0]], gradientStops: [{ position: 0, color: { r: 0.337, g: 0.992, b: 0.369, a: 1 } }, { position: 1, color: { r: 0.247, g: 1, b: 0.875, a: 1 } }] }];
      node.cornerRadius = bright ? 28 : darkAction ? 25 : 12;
      const label = text(node, 'ButtonLabel', '继续', bright ? 17 : darkAction ? 14 : 16, bright || darkAction ? 'bold' : 'semibold', disabled ? t.muted : t.ink, 18, bright ? 16 : darkAction ? 14 : 15, 306, 22);
      if (darkAction && !disabled) label.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      label.textAlignHorizontal = 'CENTER'; label.constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
      return node;
    }))));
    families.status = createSet(library, 'Status', ['light', 'dark'].flatMap((scheme) => ['Neutral', 'Warning', 'Unavailable'].map((tone) => () => {
      const t = themes[scheme];
      const unavailable = tone === 'Unavailable';
      const node = component(library, `Theme=${scheme === 'light' ? 'Light' : 'Dark'}, Tone=${tone}`, 342, 48, unavailable ? t.dangerSurface : t.surface);
      node.cornerRadius = 14; stroke(node, unavailable ? t.dangerText : t.line);
      text(node, 'StatusLabel', '状态', 12, 'semibold', unavailable ? t.dangerText : t.inkSoft, 14, 14, 314, 20).constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
      return node;
    })));
    families.social = createSet(library, 'Social Entry', ['light', 'dark'].flatMap((scheme) => ['Default', 'Selected', 'Authorizing', 'Unavailable'].map((state) => () => {
      const t = themes[scheme];
      const unavailable = state === 'Unavailable';
      const selected = state === 'Selected' || state === 'Authorizing';
      const node = component(library, `Theme=${scheme === 'light' ? 'Light' : 'Dark'}, State=${state}`, 342, 54, selected ? t.surfaceStrong : t.authBackground);
      node.cornerRadius = 14; stroke(node, selected ? t.authFocus : t.authBorder); node.opacity = unavailable ? 0.5 : 1;
      text(node, 'SocialLabel', state === 'Authorizing' ? '授权中…' : '社交登录', 13, 'semibold', unavailable ? t.muted : t.inkSoft, 14, 17, 314, 20).constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
      return node;
    })));
    families.navigation = createSet(library, 'Navigation', ['light', 'dark'].map((scheme) => () => {
      const t = themes[scheme];
      const node = component(library, `Theme=${scheme === 'light' ? 'Light' : 'Dark'}`, 342, 44, null);
      const back = frame(node, 'Back Target', 44, 44, null, 0, 0, 22);
      svgIcon(back, 'icon/arrow-back', '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2Z"/></svg>', t.ink, 10, 10, 24);
      const title = text(node, 'NavTitle', 'DOSO', 15, 'bold', t.ink, 58, 12, 226, 22);
      title.textAlignHorizontal = 'CENTER'; title.constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
      return node;
    }));

    const variant = (family, scheme, state) => family.nodes.find((node) => node.name.includes(`Theme=${scheme === 'light' ? 'Light' : 'Dark'}`) && (!state || node.name.includes(state)));
    const instance = (parent, family, scheme, state, name, x, y, width, height) => {
      const source = variant(family, scheme, state);
      if (!source) throw new Error(`Missing ${name} variant: ${scheme}/${state || ''}`);
      const node = append(parent, track(source.createInstance()));
      node.name = name; node.resize(width, height); node.x = x; node.y = y;
      return node;
    };
    const mapping = { components: {}, frames: {} };
    for (const [key, family] of Object.entries(families)) mapping.components[key] = family.set.id;

    const buildScreen = (page, scheme, orientation, rowIndex) => {
      const landscape = orientation === 'landscape';
      const size = landscape ? LANDSCAPE : PORTRAIT;
      const t = themes[scheme];
      const root = frame(staging, `${page.id} · ${scheme} · ${orientation}`, size.width, size.height, t.authBackground);
      root.setPluginData('dosoPageId', page.id); root.setPluginData('theme', scheme); root.setPluginData('orientation', orientation);
      root.setPluginData('safeAreaInsets', landscape ? '20,48,20,48' : '44,24,24,24');
      root.setExplicitVariableModeForCollection(t.collection, t.modeId);
      root.x = orientation === 'light' ? 0 : 0;
      const column = orientation === 'landscape' ? 2 : scheme === 'light' ? 0 : 1;
      root.x = [0, 430, 860][column]; root.y = rowIndex * 900;
      instance(root, families.pageShell, scheme, '', 'Page Shell', 0, 0, size.width, size.height);
      const navX = landscape ? 48 : 24; const navY = landscape ? 12 : 42; const navW = landscape ? 748 : 342;
      const nav = instance(root, families.navigation, scheme, '', 'Navigation', navX, navY, navW, 44); overrideText(nav, 'NavTitle', page.title);

      if (page.id === 'auth-email-otp') {
        overrideText(nav, 'NavTitle', '');
        nav.y = landscape ? 52 : 64;
        const helper = '完整邮箱验证码已发送至 de******@example.invalid。验证码会在一段时间后失效，请及时输入。';
        if (landscape) {
          text(root, 'Title', page.title, 30, 'bold', t.ink, 72, 130, 240, 38);
          text(root, 'Subtitle', page.subtitle, 16, 'regular', t.inkSoft, 72, 174, 240, 24);
          text(root, 'Delivery Helper', helper, 13, 'regular', t.muted, 352, 56, 440, 42, 20);
          const input = instance(root, families.input, scheme, 'State=Focused', 'Input / 验证码', 352, 112, 440, 74);
          overrideText(input, 'FieldLabel', '验证码');
          overrideText(input, 'FieldValue', '••••••');
          const code = input.findOne((child) => child.type === 'TEXT' && child.name === 'FieldValue');
          if (code) { code.fontSize = 26; code.lineHeight = { unit: 'PIXELS', value: 36 }; code.letterSpacing = { unit: 'PIXELS', value: 18 }; code.textAlignHorizontal = 'CENTER'; code.y = 6; }
          const button = instance(root, families.button, scheme, 'State=Disabled', 'Primary Button', 352, 218, 440, 56);
          overrideText(button, 'ButtonLabel', page.action);
          text(root, 'Resend Prompt', '没有收到邮件？', 14, 'regular', t.muted, 470, 311, 102, 20);
          text(root, 'Resend Action', '60 秒后重发', 14, 'semibold', t.muted, 572, 311, 120, 20);
        } else {
          text(root, 'Title', page.title, 30, 'bold', t.ink, 24, 150, 342, 38);
          text(root, 'Subtitle', page.subtitle, 16, 'regular', t.inkSoft, 24, 194, 342, 24);
          text(root, 'Delivery Helper', helper, 13, 'regular', t.muted, 24, 252, 342, 42, 20);
          const input = instance(root, families.input, scheme, 'State=Focused', 'Input / 验证码', 24, 310, 342, 74);
          overrideText(input, 'FieldLabel', '验证码');
          overrideText(input, 'FieldValue', '••••••');
          const code = input.findOne((child) => child.type === 'TEXT' && child.name === 'FieldValue');
          if (code) { code.fontSize = 26; code.lineHeight = { unit: 'PIXELS', value: 36 }; code.letterSpacing = { unit: 'PIXELS', value: 18 }; code.textAlignHorizontal = 'CENTER'; code.y = 6; }
          const button = instance(root, families.button, scheme, 'State=Disabled', 'Primary Button', 24, 415, 342, 56);
          overrideText(button, 'ButtonLabel', page.action);
          text(root, 'Resend Prompt', '没有收到邮件？', 14, 'regular', t.muted, 92, 508, 102, 20);
          text(root, 'Resend Action', '60 秒后重发', 14, 'semibold', t.muted, 194, 508, 120, 20);
          const backToLogin = text(root, 'Back To Login', '返回登录', 14, 'semibold', t.inkSoft, 24, 571, 342, 20);
          backToLogin.textAlignHorizontal = 'CENTER';
        }
        root.setPluginData('productState', 'default-empty-cooldown');
        root.setPluginData('interactionStates', 'loading,error,expired,resend-ready');
        return root;
      }

      if (page.id === 'auth-forgot-password') {
        overrideText(nav, 'NavTitle', '');
        nav.y = landscape ? 52 : 64;
        const privacyCopy = '为了保护账户安全，无论邮箱是否已注册，我们都会显示相同的发送结果。';
        if (landscape) {
          text(root, 'Title', page.title, 30, 'bold', t.ink, 72, 130, 240, 38);
          text(root, 'Subtitle', page.subtitle, 16, 'regular', t.inkSoft, 72, 174, 240, 48, 24);
          const input = instance(root, families.input, scheme, 'State=Default, Density=Compact', 'Input / 邮箱', 352, 54, 440, 54);
          overrideText(input, 'FieldLabel', '邮箱');
          overrideText(input, 'FieldValue', '请输入注册邮箱');
          text(root, 'Privacy Helper', privacyCopy, 13, 'regular', t.muted, 352, 120, 440, 42, 20);
          const button = instance(root, families.button, scheme, 'State=Default', 'Primary Button', 352, 178, 440, 56);
          overrideText(button, 'ButtonLabel', page.action);
        } else {
          text(root, 'Title', page.title, 30, 'bold', t.ink, 24, 150, 342, 38);
          text(root, 'Subtitle', page.subtitle, 16, 'regular', t.inkSoft, 24, 194, 342, 24);
          const input = instance(root, families.input, scheme, 'State=Default', 'Input / 邮箱', 24, 251, 342, 74);
          overrideText(input, 'FieldLabel', '邮箱');
          overrideText(input, 'FieldValue', '请输入注册邮箱');
          text(root, 'Privacy Helper', privacyCopy, 13, 'regular', t.muted, 24, 350, 342, 42, 20);
          const button = instance(root, families.button, scheme, 'State=Default', 'Primary Button', 24, 404, 342, 56);
          overrideText(button, 'ButtonLabel', page.action);
        }
        root.setPluginData('productState', 'default-empty');
        root.setPluginData('interactionStates', 'validation-error,loading,delivery-result');
        return root;
      }

      if (page.id === 'auth-reset-password') {
        overrideText(nav, 'NavTitle', '');
        nav.y = landscape ? 52 : 64;
        const eyeSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" stroke="#000" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" stroke="#000" stroke-width="1.8"/></svg>';
        const addPasswordField = (label, value, x, y, width, compact = false) => {
          const density = compact ? 'State=Default, Density=Compact' : 'State=Default, Density=Regular';
          const input = instance(root, families.input, scheme, density, `Input / ${label}`, x, y, width, compact ? 54 : 74);
          overrideText(input, 'FieldLabel', label);
          overrideText(input, 'FieldValue', value);
          svgIcon(root, `icon/eye-outline/${label}`, eyeSvg, t.muted, x + width - 34, y + (compact ? 25 : 40), 20);
          return input;
        };
        if (landscape) {
          text(root, 'Title', page.title, 30, 'bold', t.ink, 72, 130, 240, 38);
          text(root, 'Subtitle', page.subtitle, 16, 'regular', t.inkSoft, 72, 174, 240, 24);
          addPasswordField('新密码', '至少 10 位，含大小写字母和数字', 352, 54, 440, true);
          addPasswordField('确认新密码', '再次输入新密码', 352, 124, 440, true);
          const button = instance(root, families.button, scheme, 'State=Default', 'Primary Button', 352, 208, 440, 56);
          overrideText(button, 'ButtonLabel', page.action);
        } else {
          text(root, 'Title', page.title, 30, 'bold', t.ink, 24, 150, 342, 38);
          text(root, 'Subtitle', page.subtitle, 16, 'regular', t.inkSoft, 24, 194, 342, 24);
          addPasswordField('新密码', '至少 10 位，含大小写字母和数字', 24, 251, 342);
          addPasswordField('确认新密码', '再次输入新密码', 24, 349, 342);
          const button = instance(root, families.button, scheme, 'State=Default', 'Primary Button', 24, 445, 342, 56);
          overrideText(button, 'ButtonLabel', page.action);
        }
        root.setPluginData('productState', 'recovery-session-ready');
        root.setPluginData('interactionStates', 'validation-error,loading,nonce-required');
        return root;
      }

      if (page.id === 'auth-username') {
        nav.visible = false;
        const addUsernameField = (x, y, width, compact = false) => {
          const density = compact ? 'State=Default, Density=Compact' : 'State=Default, Density=Regular';
          const input = instance(root, families.input, scheme, density, 'Input / 用户名', x, y, width, compact ? 54 : 74);
          overrideText(input, 'FieldLabel', '用户名');
          overrideText(input, 'FieldValue', '3-24 位小写字母、数字或下划线');
          const surface = input.findOne((child) => child.type === 'FRAME' && child.name === 'Input Surface');
          if (surface) surface.cornerRadius = 28;
          return input;
        };
        if (landscape) {
          text(root, 'Title', page.title, 30, 'bold', t.ink, 72, 58, 240, 38);
          text(root, 'Subtitle', page.subtitle, 16, 'regular', t.inkSoft, 72, 102, 240, 48, 24);
          addUsernameField(352, 54, 440, true);
          const button = instance(root, families.button, scheme, 'State=Default', 'Primary Button', 352, 115, 440, 56);
          overrideText(button, 'ButtonLabel', page.action);
          const logout = text(root, 'Logout Action', '退出当前账户', 14, 'semibold', t.inkSoft, 352, 194, 440, 20);
          logout.textAlignHorizontal = 'CENTER';
        } else {
          text(root, 'Title', page.title, 30, 'bold', t.ink, 24, 111, 342, 38);
          text(root, 'Subtitle', page.subtitle, 16, 'regular', t.inkSoft, 24, 153, 342, 48, 24);
          addUsernameField(24, 212, 342);
          const button = instance(root, families.button, scheme, 'State=Default', 'Primary Button', 24, 306, 342, 56);
          overrideText(button, 'ButtonLabel', page.action);
          const logout = text(root, 'Logout Action', '退出当前账户', 14, 'semibold', t.inkSoft, 24, 386, 342, 20);
          logout.textAlignHorizontal = 'CENTER';
        }
        root.setPluginData('productState', 'username-unclaimed');
        root.setPluginData('interactionStates', 'validation-error,claiming,logging-out');
        return root;
      }

      if (page.id === 'auth-display-name') {
        overrideText(nav, 'NavTitle', '');
        const fieldState = landscape ? 'State=Default, Density=Compact' : 'State=Default, Density=Regular';
        if (landscape) {
          nav.x = 72; nav.y = 48;
          text(root, 'Title', page.title, 30, 'bold', t.ink, 72, 120, 240, 38);
          text(root, 'Subtitle', page.subtitle, 16, 'regular', t.inkSoft, 72, 164, 240, 48, 24);
          const input = instance(root, families.input, scheme, fieldState, 'Input / 显示名称', 352, 48, 440, 54);
          overrideText(input, 'FieldLabel', '显示名称');
          overrideText(input, 'FieldValue', '请输入用于展示的名称');
          const button = instance(root, families.button, scheme, 'State=Default', 'Primary Button', 352, 115, 440, 56);
          overrideText(button, 'ButtonLabel', page.action);
          const skip = text(root, 'Skip Display Name', '跳过显示名称确认', 14, 'semibold', t.inkSoft, 352, 190, 440, 44, 20);
          skip.textAlignHorizontal = 'CENTER'; skip.textAlignVertical = 'CENTER';
        } else {
          nav.y = 80;
          text(root, 'Title', page.title, 30, 'bold', t.ink, 24, 152, 342, 38);
          text(root, 'Subtitle', page.subtitle, 16, 'regular', t.inkSoft, 24, 196, 342, 48, 24);
          const input = instance(root, families.input, scheme, fieldState, 'Input / 显示名称', 24, 280, 342, 74);
          overrideText(input, 'FieldLabel', '显示名称');
          overrideText(input, 'FieldValue', '请输入用于展示的名称');
          const button = instance(root, families.button, scheme, 'State=Default', 'Primary Button', 24, 378, 342, 56);
          overrideText(button, 'ButtonLabel', page.action);
          const skip = text(root, 'Skip Display Name', '跳过显示名称确认', 14, 'semibold', t.inkSoft, 24, 462, 342, 44, 20);
          skip.textAlignHorizontal = 'CENTER'; skip.textAlignVertical = 'CENTER';
        }
        root.setPluginData('productState', 'apple-display-name-confirmation');
        root.setPluginData('interactionStates', 'validation-error,saving,skipping');
        root.setPluginData('dataContract', 'prefill comes only from the current Apple authentication recovery session');
        return root;
      }

      if (page.id === 'auth-mfa') {
        nav.visible = false;
        const headerX = landscape ? 68 : 24;
        const headerY = 32;
        const contentWidth = landscape ? 708 : 342;
        const back = frame(root, 'Back Button', 42, 42, t.surface, headerX, headerY, 21);
        svgIcon(back, 'icon/arrow-back', '<svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2Z"/></svg>', t.ink, 10, 10, 22);
        text(root, 'Title', page.title, 27, 'bold', t.ink, headerX + 52, headerY, contentWidth - 52, 33, 33);
        text(root, 'Subtitle', page.subtitle, 12, 'regular', t.muted, headerX + 52, headerY + 35, contentWidth - 52, 18, 18);
        const loadingY = landscape ? 104 : 108;
        const loadingCard = frame(root, 'Loading Account Security', contentWidth, 150, t.surface, headerX, loadingY, 24);
        svgIcon(loadingCard, 'icon/loading', '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3a9 9 0 1 1-8.3 5.5" stroke="#000" stroke-width="2.2" stroke-linecap="round"/></svg>', t.greenStrong, contentWidth / 2 - 12, 48, 24);
        const loadingText = text(loadingCard, 'Loading Label', '正在读取账户安全状态…', 12, 'regular', t.muted, 24, 83, contentWidth - 48, 18, 18);
        loadingText.textAlignHorizontal = 'CENTER';
        root.setPluginData('productState', 'loading-account-security');
        root.setPluginData('interactionStates', 'loading,error,enrollment,step-up,aal2');
        root.setPluginData('dataContract', 'never show QR, secret, factor status, or executable verification before getMfaStatus and enrollTotp succeed');
        return root;
      }

      if (page.id === 'account-security') {
        nav.visible = false;
        const safeX = landscape ? 68 : 24;
        const columnWidth = landscape ? 344 : 342;
        const secondaryX = landscape ? safeX + columnWidth + 20 : safeX;
        const back = frame(root, 'Back Button', 44, 44, t.surface, safeX, 32, 22);
        svgIcon(back, 'icon/arrow-back', '<svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2Z"/></svg>', t.ink, 11, 11, 22);
        text(root, 'Title', page.title, 27, 'bold', t.ink, safeX + 54, 32, columnWidth - 54, 33, 33);
        text(root, 'Subtitle', page.subtitle, 12, 'regular', t.muted, safeX + 54, 67, columnWidth - 54, 18, 18);

        const addSectionHeader = (name, titleValue, x, y, width, refresh = false) => {
          text(root, `${name} Title`, titleValue, 16, 'bold', t.ink, x, y, width - 52, 22, 22);
          if (refresh) {
            const refreshLabel = text(root, `${name} Refresh`, '刷新', 12, 'semibold', t.successText, x + width - 44, y - 11, 44, 44, 18);
            refreshLabel.textAlignHorizontal = 'CENTER'; refreshLabel.textAlignVertical = 'CENTER'; refreshLabel.opacity = 0.45;
          }
        };
        const addLoadingCard = (name, label, x, y, width, height) => {
          const card = frame(root, name, width, height, t.surface, x, y, 24);
          svgIcon(card, 'icon/loading', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3a9 9 0 1 1-8.3 5.5" stroke="#000" stroke-width="2.2" stroke-linecap="round"/></svg>', t.greenStrong, Math.max(18, width / 2 - 84), height / 2 - 10, 20);
          text(card, 'Loading Label', label, 11, 'regular', t.muted, Math.max(44, width / 2 - 54), height / 2 - 8, Math.min(196, width - 68), 16, 16);
          return card;
        };
        const addBadge = (parent, name, label, x, y, width = 54) => {
          const badge = frame(parent, name, width, 26, t.surfaceStrong, x, y, 13);
          const badgeText = text(badge, 'Status Label', label, 10, 'bold', t.muted, 4, 5, width - 8, 16, 16);
          badgeText.textAlignHorizontal = 'CENTER';
          return badge;
        };
        const addSecurityRow = (parent, name, titleValue, detail, iconSvg, y, width, showBadge = false) => {
          if (y > 0) frame(parent, `${name} Divider`, width, 1, t.line, 0, y, 0);
          const icon = frame(parent, `${name} Icon Surface`, 40, 40, t.surfaceStrong, 13, y + 15, 20);
          svgIcon(icon, `icon/${name}`, iconSvg, t.muted, 10, 10, 20);
          text(parent, `${name} Title`, titleValue, 14, 'bold', t.ink, 64, y + 15, width - 142, 20, 20);
          text(parent, `${name} Detail`, detail, 11, 'regular', t.muted, 64, y + 38, width - 142, 16, 16);
          if (showBadge) addBadge(parent, `${name} Status`, '读取中', width - 72, y + 22, 59);
        };

        addSectionHeader('Login Methods', '登录方式', safeX, 112, columnWidth, true);
        addLoadingCard('Login Methods Loading', '正在同步登录方式…', safeX, 147, columnWidth, 84);
        addSectionHeader('Account Security', '账户安全', safeX, 253, columnWidth);
        const securityCard = frame(root, 'Account Security Card', columnWidth, 210, t.surface, safeX, 288, 24);
        addSecurityRow(securityCard, 'mail-outline', '安全邮箱', '正在确认邮箱登录方式…', '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z"/></svg>', 0, columnWidth, true);
        addSecurityRow(securityCard, 'key-outline', '修改密码', '等待登录方式同步完成', '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M7 14a5 5 0 1 1 4.58-7H22v4h-2v2h-2v2h-6.42A5 5 0 0 1 7 14Zm0-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>', 70, columnWidth);
        addSecurityRow(securityCard, 'shield-checkmark-outline', '管理端身份验证器', '正在读取服务端身份验证状态…', '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3 4.5 6v5.3c0 4.8 3.2 8.3 7.5 9.7 4.3-1.4 7.5-4.9 7.5-9.7V6L12 3Z" stroke="#000" stroke-width="1.8"/><path d="m8.4 12 2.2 2.2 5-5" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>', 140, columnWidth, true);

        if (landscape) {
          addSectionHeader('Login Terminals', '登录终端', secondaryX, 54, columnWidth, true);
          addLoadingCard('Login Terminals Loading', '正在同步登录终端…', secondaryX, 89, columnWidth, 110);
        } else {
          addSectionHeader('Login Terminals', '登录终端', secondaryX, 522, columnWidth, true);
          addLoadingCard('Login Terminals Loading', '正在同步登录终端…', secondaryX, 557, columnWidth, 110);
        }
        root.setPluginData('productState', 'loading-real-account-state');
        root.setPluginData('interactionStates', 'loading,login-methods-error,mfa-error,terminal-error,confirmation,busy,empty');
        root.setPluginData('dataContract', 'login methods, password capability, MFA assurance, and terminals remain non-executable until their independent service reads succeed');
        return root;
      }

      if (page.id === 'device-bind') {
        nav.visible = false;
        const backSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m15 18-6-6 6-6" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const linkSvg = '<svg width="27" height="27" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.14M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.14-1.14" stroke="#000" stroke-width="2" stroke-linecap="round"/></svg>';
        const shieldSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3 4.5 6v5.3c0 4.8 3.2 8.3 7.5 9.7 4.3-1.4 7.5-4.9 7.5-9.7V6L12 3Z" stroke="#000" stroke-width="1.8"/><path d="m8.4 12 2.2 2.2 5-5" stroke="#000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const addIntro = (x, backY, iconY, eyebrowY, titleY, subtitleY, noteY, width) => {
          const back = frame(root, 'Back Button', 44, 44, t.surface, x, backY, 22);
          svgIcon(back, 'icon/chevron-back', backSvg, t.ink, 11, 11, 22);
          const icon = frame(root, 'Binding Icon', 56, 56, t.surfaceStrong, x, iconY, 28);
          svgIcon(icon, 'icon/link-outline', linkSvg, t.greenStrong, 15, 15, 27);
          text(root, 'Eyebrow', 'DOSO SECURE BINDING', 11, 'bold', t.successText, x, eyebrowY, width, 16, 16).letterSpacing = { unit: 'PIXELS', value: 1.3 };
          text(root, 'Title', page.title, 31, 'bold', t.ink, x, titleY, width, 43, 43);
          text(root, 'Subtitle', page.subtitle, 13, 'regular', t.muted, x, subtitleY, width, landscape ? 42 : 63, 21);
          const note = frame(root, 'Gateway Truth Note', width, landscape ? 76 : 68, t.surfaceStrong, x, noteY, 22);
          svgIcon(note, 'icon/shield-checkmark-outline', shieldSvg, t.greenStrong, 16, 16, 18);
          text(note, 'Gateway Truth Copy', '绑定成功后，设备状态和控制指令仍需由可信机器人网关上报与执行；App 不能自行伪造在线状态。', 11, 'regular', t.inkSoft, 44, 14, width - 60, landscape ? 54 : 42, 18);
        };
        const addBindingCard = (x, y, width) => {
          const card = frame(root, 'Binding Form Card', width, landscape ? 278 : 279, t.surface, x, y, 30);
          const innerWidth = width - 36;
          const serial = instance(card, families.input, scheme, 'State=Default, Density=Device', 'Input / 设备序列号', 18, 20, innerWidth, 69);
          overrideText(serial, 'FieldLabel', '设备序列号'); overrideText(serial, 'FieldValue', '例如 DOSO-TH-000001');
          const code = instance(card, families.input, scheme, 'State=Default, Density=Device', 'Input / 一次性绑定码', 18, 113, innerWidth, 69);
          overrideText(code, 'FieldLabel', '一次性绑定码'); overrideText(code, 'FieldValue', '6–32 位字母或数字');
          const codeValue = code.findOne((child) => child.type === 'TEXT' && child.name === 'FieldValue');
          if (codeValue) { codeValue.fontSize = 20; codeValue.fontName = fonts.bold; codeValue.letterSpacing = { unit: 'PIXELS', value: 5 }; }
          const button = instance(card, families.button, scheme, 'State=Default, Style=Bright', 'Primary Button', 18, 211, innerWidth, 56);
          overrideText(button, 'ButtonLabel', page.action);
          return card;
        };
        if (landscape) {
          addIntro(68, 50, 112, 190, 217, 270, 323, 330);
          addBindingCard(420, 51, 356);
        } else {
          addIntro(24, 70, 150, 228, 256, 307, 361, 342);
          addBindingCard(24, 505, 342);
        }
        root.setPluginData('productState', 'unsubmitted-binding-credentials');
        root.setPluginData('interactionStates', 'validation-error,submitting,repository-error,reconciled-success');
        root.setPluginData('dataContract', 'binding success never implies online status; all success and conflict states come from the real binding repository');
        return root;
      }

      if (page.id === 'device-ble-discovery') {
        nav.visible = false;
        const backSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m15 18-6-6 6-6" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const bluetoothSvg = '<svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m6 8 12 10-6 6V2l6 6L6 18" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const searchSvg = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="7" stroke="#fff" stroke-width="2"/><path d="m16.5 16.5 4 4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';
        const addLiveBanner = (x, y, width) => {
          const banner = frame(root, 'Live BLE Banner', width, landscape ? 96 : 84, t.surfaceStrong, x, y, 20);
          svgIcon(banner, 'icon/bluetooth-outline', bluetoothSvg, t.successText, 14, 14, 21);
          text(banner, 'Live Title', '真机蓝牙发现 · DEVELOPMENT BUILD', 12, 'bold', t.successText, 45, 14, width - 59, 18, 18);
          text(banner, 'Live Copy', '此页面读取真实 BLE 广播，但不会写入 Wi-Fi 信息，也不会连接设备或声称身份已验证。', 12, 'regular', t.inkSoft, 45, 35, width - 59, landscape ? 54 : 36, 18);
          return banner;
        };
        const addIntro = (x, width, backY, bannerY, eyebrowY, titleY, subtitleY) => {
          const back = frame(root, 'Back Button', 44, 44, t.surface, x, backY, 22);
          svgIcon(back, 'icon/chevron-back', backSvg, t.ink, 11, 11, 22);
          addLiveBanner(x, bannerY, width);
          text(root, 'Eyebrow', 'DOSO BLE DISCOVERY', 11, 'bold', t.successText, x, eyebrowY, width, 16, 16).letterSpacing = { unit: 'PIXELS', value: 1.2 };
          text(root, 'Title', page.title, 31, 'bold', t.ink, x, titleY, width, 43, 43);
          text(root, 'Subtitle', `为 THUNDER 01 查找附近候选设备。${page.subtitle}。`, 13, 'regular', t.muted, x, subtitleY, width, landscape ? 84 : 63, 21);
        };
        const addActionCard = (x, y, width) => {
          const card = frame(root, 'BLE Scan Action', width, 169, t.surface, x, y, 28);
          text(card, 'Action Title', '附近设备扫描', 17, 'bold', t.ink, 18, 18, width - 36, 24, 24);
          text(card, 'Action Copy', '扫描约 8 秒；列表不会自动连接，也不会把最强信号当作 DOSO 身份。', 12, 'regular', t.inkSoft, 18, 52, width - 36, 38, 19);
          const button = instance(card, families.button, scheme, 'State=Default, Style=DarkAction', 'Primary Button', 18, 105, width - 36, 50);
          overrideText(button, 'ButtonLabel', page.action);
          const searchIcon = append(card, track(figma.createNodeFromSvg(searchSvg)));
          searchIcon.name = 'icon/search-outline'; searchIcon.resize(19, 19); searchIcon.x = 18 + Math.max(18, button.width / 2 - 104); searchIcon.y = 120;
          return card;
        };
        if (landscape) {
          addIntro(68, 310, 50, 110, 230, 256, 305);
          addActionCard(398, 50, 378);
        } else {
          addIntro(24, 342, 70, 130, 238, 264, 313);
          addActionCard(24, 405, 342);
        }
        root.setPluginData('productState', 'idle-real-ble-discovery');
        root.setPluginData('interactionStates', 'permission-denied,permission-blocked,bluetooth-off,location-off,scanning,interrupted,empty,candidate-list,scan-failed,unsupported');
        root.setPluginData('dataContract', 'BLE discovery reads broadcasts only; candidates stay identity-unverified and never auto-connect, bind, or provision');
        return root;
      }

      if (page.id === 'device-provisioning') {
        nav.visible = false;
        const backSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m15 18-6-6 6-6" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const flaskSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6M10 3v5l-5.3 9.2A2.5 2.5 0 0 0 6.9 21h10.2a2.5 2.5 0 0 0 2.2-3.8L14 8V3" stroke="#000" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 15h9" stroke="#000" stroke-width="1.7" stroke-linecap="round"/></svg>';
        const chipSvg = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="12" height="12" rx="1.5" stroke="#000" stroke-width="1.6"/><rect x="9" y="9" width="6" height="6" stroke="#000" stroke-width="1.4"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" stroke="#000" stroke-width="1.6" stroke-linecap="round"/></svg>';
        const addDemoBanner = (x, y, width) => {
          const banner = frame(root, 'Development Demo Banner', width, landscape ? 70 : 70, t.dangerSurface, x, y, 20);
          svgIcon(banner, 'icon/flask-outline', flaskSvg, t.dangerText, 14, 15, 20);
          text(banner, 'Demo Title', '开发演示', 13, 'bold', t.dangerText, 44, 13, width - 58, 18, 18);
          text(banner, 'Demo Copy', '此流程不会连接蓝牙，也不会发送真实 Wi-Fi 密码。', 12, 'regular', t.inkSoft, 44, 35, width - 58, 20, 19);
          return banner;
        };
        const addBlockedCard = (x, y, width) => {
          const card = frame(root, 'Hardware Unavailable Card', width, landscape ? 159 : 160, t.surface, x, y, 28);
          svgIcon(card, 'icon/hardware-chip-outline', chipSvg, t.muted, width / 2 - 13, 27, 26);
          const titleNode = text(card, 'Unavailable Title', page.status, 18, 'bold', t.ink, 24, 66, width - 48, 25, 25);
          titleNode.textAlignHorizontal = 'CENTER';
          const copy = text(card, 'Unavailable Copy', '当前版本不能连接真实机器人，也不会进入模拟成功路径。', 13, 'regular', t.muted, 24, 101, width - 48, 42, 20);
          copy.textAlignHorizontal = 'CENTER';
          return card;
        };
        if (landscape) {
          const introX = 68; const introWidth = 310; const flowX = 398; const flowWidth = 378;
          const back = frame(root, 'Back Button', 44, 44, t.surface, introX, 50, 22);
          svgIcon(back, 'icon/chevron-back', backSvg, t.ink, 11, 11, 22);
          addDemoBanner(introX, 110, introWidth);
          text(root, 'Eyebrow', 'DOSO SECURE PROVISIONING', 11, 'bold', t.successText, introX, 210, introWidth, 16, 16).letterSpacing = { unit: 'PIXELS', value: 1.2 };
          text(root, 'Title', page.title, 31, 'bold', t.ink, introX, 247, introWidth, 43, 43);
          text(root, 'Subtitle', page.subtitle, 13, 'regular', t.muted, introX, 303, introWidth, 42, 21);
          addBlockedCard(flowX, 62, flowWidth);
        } else {
          const x = 24; const width = 342;
          const back = frame(root, 'Back Button', 44, 44, t.surface, x, 70, 22);
          svgIcon(back, 'icon/chevron-back', backSvg, t.ink, 11, 11, 22);
          addDemoBanner(x, 130, width);
          text(root, 'Eyebrow', 'DOSO SECURE PROVISIONING', 11, 'bold', t.successText, x, 230, width, 16, 16).letterSpacing = { unit: 'PIXELS', value: 1.2 };
          text(root, 'Title', page.title, 31, 'bold', t.ink, x, 269, width, 43, 43);
          text(root, 'Subtitle', page.subtitle, 13, 'regular', t.muted, x, 324, width, 63, 21);
          addBlockedCard(x, 493, width);
        }
        root.setPluginData('productState', 'hardware-unavailable');
        root.setPluginData('interactionStates', 'unavailable');
        root.setPluginData('availableActions', 'none');
        root.setPluginData('dataContract', 'no BLE connection, no Wi-Fi credential transmission, and no simulated success path');
        return root;
      }

      if (page.id === 'device-firmware') {
        nav.visible = false;
        const backSvg = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m15 18-6-6 6-6" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const flaskSvg = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6M10 3v5l-5.3 9.2A2.5 2.5 0 0 0 6.9 21h10.2a2.5 2.5 0 0 0 2.2-3.8L14 8V3" stroke="#000" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 15h9" stroke="#000" stroke-width="1.7" stroke-linecap="round"/></svg>';
        const chipSvg = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="12" height="12" rx="1.5" stroke="#000" stroke-width="1.6"/><rect x="9" y="9" width="6" height="6" stroke="#000" stroke-width="1.4"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" stroke="#000" stroke-width="1.6" stroke-linecap="round"/></svg>';
        const addTopBar = (x, y, width) => {
          const back = frame(root, 'Back Button', 44, 44, t.surface, x, y, 22);
          svgIcon(back, 'icon/chevron-back', backSvg, t.ink, 11, 11, 22);
          const topTitle = text(root, 'Top Bar Title', page.title, 17, 'bold', t.inkSoft, x + 44, y + 11, width - 88, 24, 24);
          topTitle.textAlignHorizontal = 'CENTER';
          frame(root, 'Top Bar End Spacer', 44, 44, t.surface, x + width - 44, y, 22);
        };
        const addDemoBanner = (x, y, width) => {
          const banner = frame(root, 'Development Demo Banner', width, landscape ? 65 : 67, t.dangerSurface, x, y, 20);
          svgIcon(banner, 'icon/flask-outline', flaskSvg, t.dangerText, 14, 14, 19);
          text(banner, 'Demo Title', '开发演示', 13, 'bold', t.dangerText, 43, 12, width - 57, 18, 18);
          text(banner, 'Demo Copy', '此页面只演示 OTA 流程，不会更新真实机器人。', 11, 'regular', t.dangerText, 43, 34, width - 57, 19, 17);
          return banner;
        };
        const addBlockedCard = (x, y, width) => {
          const card = frame(root, 'Hardware Unavailable Card', width, 159, t.surface, x, y, 28);
          svgIcon(card, 'icon/hardware-chip-outline', chipSvg, t.muted, width / 2 - 14, 25, 28);
          const titleNode = text(card, 'Unavailable Title', page.status, 16, 'bold', t.ink, 24, 66, width - 48, 23, 23);
          titleNode.textAlignHorizontal = 'CENTER';
          const copy = text(card, 'Unavailable Copy', '当前客户端没有连接真实机器人，因此不能启动真实 OTA，也不会显示模拟成功。', 12, 'regular', t.muted, 24, 101, width - 48, 42, 19);
          copy.textAlignHorizontal = 'CENTER';
          return card;
        };
        if (landscape) {
          const introX = 68; const introWidth = 310; const flowX = 398; const flowWidth = 378;
          addTopBar(introX, 35, introWidth);
          addDemoBanner(introX, 95, introWidth);
          text(root, 'Eyebrow', 'DOSO OTA PREVIEW', 11, 'bold', t.successText, introX, 189, introWidth, 16, 16).letterSpacing = { unit: 'PIXELS', value: 1.3 };
          text(root, 'Title', '安全更新 THUNDER 01', 30, 'bold', t.ink, introX, 218, introWidth, 42, 42);
          text(root, 'Subtitle', page.subtitle, 13, 'regular', t.muted, introX, 265, introWidth, 42, 20);
          addBlockedCard(flowX, 52, flowWidth);
        } else {
          const x = 24; const width = 342;
          addTopBar(x, 55, width);
          addDemoBanner(x, 114, width);
          text(root, 'Eyebrow', 'DOSO OTA PREVIEW', 11, 'bold', t.successText, x, 209, width, 16, 16).letterSpacing = { unit: 'PIXELS', value: 1.3 };
          text(root, 'Title', '安全更新 THUNDER 01', 30, 'bold', t.ink, x, 239, width, 42, 42);
          text(root, 'Subtitle', page.subtitle, 13, 'regular', t.muted, x, 284, width, 42, 20);
          addBlockedCard(x, 479, width);
        }
        root.setPluginData('productState', 'hardware-unavailable');
        root.setPluginData('interactionStates', 'unavailable');
        root.setPluginData('availableActions', 'none');
        root.setPluginData('dataContract', 'no real OTA, no simulated success or result, and no fake version, battery, or online state');
        return root;
      }

      if (landscape) {
        text(root, 'Title', page.title, 28, 'bold', t.ink, 48, 92, 292, 38);
        text(root, 'Subtitle', page.subtitle, 13, 'regular', t.muted, 48, 140, 292, 44, 21);
        const status = instance(root, families.status, scheme, `Tone=${page.tone}`, 'Status', 48, 212, 292, 48); overrideText(status, 'StatusLabel', page.status);
        const card = frame(root, 'Content Panel', 422, 280, t.surface, 374, 78, 24); stroke(card, t.line);
        let y = 20;
        if (page.social) {
          const social = instance(card, families.social, scheme, 'State=Default', 'Social Entry', 20, y, 382, 54); overrideText(social, 'SocialLabel', page.social); y += 66;
        }
        for (const [label, value] of page.fields) {
          const input = instance(card, families.input, scheme, 'State=Default', `Input / ${label}`, 20, y, 382, 66); overrideText(input, 'FieldLabel', label); overrideText(input, 'FieldValue', value); y += 76;
        }
        if (!page.fields.length && !page.social) {
          text(card, 'State Title', page.unavailable ? '当前不可执行' : page.loading ? '正在安全读取' : '准备扫描附近广播', 18, 'bold', page.unavailable ? t.dangerText : t.ink, 24, 36, 374, 28);
          text(card, 'State Copy', page.unavailable ? '没有模拟成功按钮；能力接入前保持禁用。' : page.loading ? '完成读取前不会展示或执行账户操作。' : '扫描只读取广播，结果不会自动连接设备。', 13, 'regular', t.muted, 24, 78, 374, 60, 21);
          y = 160;
        }
        const button = instance(card, families.button, scheme, `State=${page.disabled ? 'Disabled' : 'Default'}`, 'Primary Button', 20, Math.min(208, y + 8), 382, 52); overrideText(button, 'ButtonLabel', page.action);
      } else {
        text(root, 'Title', page.title, 30, 'bold', t.ink, 24, 112, 342, 42);
        text(root, 'Subtitle', page.subtitle, 13, 'regular', t.muted, 24, 158, 342, 44, 21);
        const status = instance(root, families.status, scheme, `Tone=${page.tone}`, 'Status', 24, 218, 342, 48); overrideText(status, 'StatusLabel', page.status);
        const card = frame(root, 'Content Panel', 342, 500, t.surface, 24, 286, 24); stroke(card, t.line);
        let y = 24;
        if (page.social) {
          const social = instance(card, families.social, scheme, 'State=Default', 'Social Entry', 20, y, 302, 54); overrideText(social, 'SocialLabel', page.social); y += 70;
        }
        for (const [label, value] of page.fields) {
          const input = instance(card, families.input, scheme, 'State=Default', `Input / ${label}`, 20, y, 302, 74); overrideText(input, 'FieldLabel', label); overrideText(input, 'FieldValue', value); y += 90;
        }
        if (!page.fields.length && !page.social) {
          text(card, 'State Title', page.unavailable ? '当前不可执行' : page.loading ? '正在安全读取' : '准备扫描附近广播', 20, 'bold', page.unavailable ? t.dangerText : t.ink, 24, 42, 294, 30);
          text(card, 'State Copy', page.unavailable ? '真实能力接入前保持禁用，也不会进入模拟成功路径。' : page.loading ? '完成读取前不会展示或执行账户操作。' : '扫描只读取附近 BLE 广播，不会自动连接、绑定或配网。', 14, 'regular', t.muted, 24, 92, 294, 72, 22);
          y = 210;
        }
        const button = instance(card, families.button, scheme, `State=${page.disabled ? 'Disabled' : 'Default'}`, 'Primary Button', 20, Math.min(424, y + 18), 302, 52); overrideText(button, 'ButtonLabel', page.action);
      }
      return root;
    };

    pages.forEach((page, rowIndex) => {
      const light = buildScreen(page, 'light', 'portrait', rowIndex);
      const dark = buildScreen(page, 'dark', 'portrait', rowIndex);
      const landscape = buildScreen(page, 'light', 'landscape', rowIndex);
      mapping.frames[page.id] = { light: light.id, dark: dark.id, landscape: landscape.id };
    });

    const acceptanceFrames = staging.findAll((node) => node.type === 'FRAME' && Boolean(node.getPluginData('dosoPageId')));
    const componentSets = staging.findAll((node) => node.type === 'COMPONENT_SET' && node.name.startsWith('DOSO/'));
    const criticalLayoutNode = (node) => node.visible !== false && (
      node.name.startsWith('Input /')
      || node.name === 'Primary Button'
      || node.name === 'Privacy Helper'
      || node.name === 'Delivery Helper'
      || node.name === 'Resend Prompt'
      || node.name === 'Resend Action'
      || node.name === 'Logout Action'
      || node.name === 'Skip Display Name'
    );
    const rectanglesOverlap = (left, right) => left.x < right.x + right.width
      && left.x + left.width > right.x
      && left.y < right.y + right.height
      && left.y + left.height > right.y;
    if (acceptanceFrames.length !== 33) throw new Error(`Expected 33 product frames, got ${acceptanceFrames.length}`);
    if (componentSets.length !== COMPONENT_FAMILIES.length) throw new Error(`Expected 6 component families, got ${componentSets.length}`);
    for (const page of pages) {
      const variants = acceptanceFrames.filter((node) => node.getPluginData('dosoPageId') === page.id);
      if (variants.length !== 3) throw new Error(`${page.id} expected 3 states, got ${variants.length}`);
      const sizes = new Set(variants.map((node) => `${node.width}x${node.height}`));
      if (!sizes.has('390x844') || !sizes.has('844x390')) throw new Error(`${page.id} has invalid frame sizes`);
    }
    for (const productFrame of acceptanceFrames) {
      const critical = productFrame.children.filter(criticalLayoutNode);
      for (let left = 0; left < critical.length; left += 1) {
        for (let right = left + 1; right < critical.length; right += 1) {
          if (rectanglesOverlap(critical[left], critical[right])) {
            throw new Error(`${productFrame.name} overlaps: ${critical[left].name} / ${critical[right].name}`);
          }
        }
      }
      const pageId = productFrame.getPluginData('dosoPageId');
      const orientation = productFrame.getPluginData('orientation');
      const horizontalBounds = orientation === 'landscape' ? { left: 48, right: 796 } : { left: 24, right: 366 };
      const safeContent = productFrame.children.filter((node) => node.visible !== false && node.name !== 'Page Shell');
      for (const node of safeContent) {
        if (node.x < horizontalBounds.left || node.x + node.width > horizontalBounds.right) {
          throw new Error(`${pageId} ${orientation} safe-area overflow: ${node.name} (${node.x}..${node.x + node.width}, expected ${horizontalBounds.left}..${horizontalBounds.right})`);
        }
      }
    }
    const visibleCopy = staging.findAll((node) => node.type === 'TEXT' && node.visible !== false).map((node) => node.characters).join('\n');
    if (/SAFE AREA|真实状态合同|truth contract/i.test(visibleCopy)) throw new Error('Visible developer annotations remain in product screens.');

    mapping.section = staging.id;
    staging.setPluginData('source', SOURCE);
    staging.setPluginData('contractVersion', VERSION);
    staging.setPluginData('createdFrameCount', '33');
    staging.setPluginData('componentFamilyCount', '6');
    staging.setPluginData('themeCollections', JSON.stringify(COLLECTIONS));
    staging.setPluginData('nodeMapping', JSON.stringify(mapping));
    staging.setPluginData('futureUpdatePolicy', 'Use nodeMapping for targeted in-place edits; preserve mapped frame IDs.');
    staging.name = SECTION_NAME;
    if (existing) existing.remove();
    figma.currentPage.selection = [staging];
    figma.viewport.scrollAndZoomIntoView([staging]);
    figma.commitUndo();
    console.log(JSON.stringify({ status: 'DOSO_PRODUCT_PAGES_PASS', sectionId: staging.id, frames: 33, componentFamilies: 6, mapping }, null, 2));
  } catch (error) {
    for (const node of created.reverse()) {
      try { if (!node.removed) node.remove(); } catch (_cleanupError) { /* best effort */ }
    }
    throw error;
  }
})();
