// DOSO one-shot source-sync script for the community Figma "Scripter" plugin.
// Paste the whole file into Scripter and run once in a Figma Design file.
// Existing non-generated canvas nodes are preserved. This script creates, or
// safely updates in place, one owned section with 33 editable acceptance frames.

await (async () => {
async function main() {
  const SECTION_NAME = 'DOSO · Source Sync · 11 Pages × 3 States';
  const COLLECTION_NAME = 'DOSO / Source Sync Theme / 2026-08-30.1';
  const PORTRAIT = { width: 390, height: 844 };
  const LANDSCAPE = { width: 844, height: 390 };

  const pages = [
    ['auth-email-otp', '邮箱验证码', 'EMAIL VERIFICATION', '验证邮箱，继续当前 DOSO 账户流程', '注册 / 密码恢复用途由真实流程决定 · 完整邮箱验证码 · 未输入 · 60s', '验证并继续', [['账户邮箱', '使用当前认证会话邮箱'], ['验证码', '等待输入完整邮箱验证码 · 不预填示例值'], ['重新发送', '60 秒倒计时结束后才可执行']], '注册和密码恢复用途隔离；不得使用示例数字等假验证码；过期、错误与重发来自真实认证状态。'],
    ['auth-forgot-password', '找回密码', 'ACCOUNT RECOVERY', '提交后进入验证码页，不泄露账户是否存在', '尚未发送 · 合法邮箱格式', '发送验证码', [['邮箱', '请输入合法邮箱格式'], ['后续页面', '统一进入邮箱验证码'], ['返回路径', '返回登录']], '无论账户是否存在，界面与时序均进入同一验证码流程；发送失败和重试使用真实状态。'],
    ['auth-reset-password', '重置或修改密码', 'SECURE RECOVERY', '验证恢复凭据并设置新的安全密码', '恢复凭据或 reauthentication nonce 由真实入口决定', '更新密码', [['安全门禁', '按入口校验 recovery 会话或 nonce'], ['新密码', '至少 10 位，含大写、小写与数字'], ['确认新密码', '必须与新密码一致']], '恢复验证码或重新认证 nonce 必须真实校验；覆盖失效、错误、成功和退出路径。'],
    ['auth-username', '设置用户名', 'ACCOUNT IDENTITY', '用于设备与账户识别，认领后不可修改', '唯一性待确认 · 认领后不可修改', '确认用户名', [['DOSO 用户名', '未设置'], ['认领规则', '唯一且不可抢占（unclaimable）'], ['修改规则', '认领成功后不可修改（immutable）']], '服务端必须同时执行唯一且不可抢占、认领后不可修改两道门禁；冲突与错误状态不得伪造。'],
    ['auth-display-name', '确认显示名称', 'APPLE SIGN-IN', '显示名称用于个人资料展示', '仅 Apple 首次登录恢复条件显示', '保存显示名称', [['显示名称', '使用真实 Apple 首次资料'], ['会话隔离', '仅当前认证会话'], ['取消', '不写入账户资料']], '仅在 Apple 首次登录恢复条件成立时显示；保存和取消使用真实状态。'],
    ['auth-mfa', '管理员双重验证', 'TOTP · AAL2', '仅管理员或支持人员可管理 TOTP AAL2', '会话权限与 MFA 状态读取中', '正在读取 MFA 状态', [['MFA 状态', '待读取未启用 / AAL1 / AAL2'], ['二维码', '未生成 · 不展示假二维码'], ['动态码', '真实 factor 可用后才可输入']], '仅真实管理员或支持会话开放；主题稿保持禁用加载态，实际页面按未启用、AAL1 step-up、AAL2 与错误状态渲染。', true],
    ['device-bind', '绑定机器人', 'SECURE DEVICE BINDING', '使用机器人标签上的序列号和一次性激活码', '未绑定 · 凭据未提交', '绑定设备', [['设备序列号', '未输入'], ['一次性激活码', '未输入'], ['在线状态', '绑定成功不代表设备在线']], '格式错误、冲突、失败和成功来自真实绑定仓库；绑定关系与在线状态严格分离。'],
    ['device-ble-discovery', '附近 BLE 设备', 'DEVELOPMENT BUILD · BLE DISCOVERY', '只读附近 BLE 广播，不连接、不绑定、不配网', 'DEVELOPMENT BUILD · 扫描未开始', '开始扫描广播', [['扫描范围', '附近 BLE 广播'], ['候选广播', '0 · 未验证 · 只读'], ['后续能力', '不连接、不绑定、不配网']], '发现只证明收到未验证广播；权限拒绝、蓝牙关闭、扫描、空结果和停止状态必须真实。'],
    ['device-provisioning', '蓝牙或 Wi-Fi 安全配网', 'DOSO SECURE PROVISIONING', '生产入口关闭；真实安全通道尚未接入', '网络配网不可用', '网络配网不可用', [['真实 GATT', '未接入'], ['一次性 Wi-Fi 写入', '未接入'], ['开发演示', '必须明确标记为模拟']], '生产主状态必须是“网络配网不可用”；不得把模拟演示描述为真实连接或凭据写入。', true, { topTitle: '', title: '安全配网', subtitle: '为 THUNDER 01 验证身份，再通过临时安全通道演示凭据发送，最后等待云端在线确认。', demo: '此流程不会连接蓝牙，也不会发送真实 Wi-Fi 密码。', blocked: '当前版本不能连接真实机器人，也不会进入模拟成功路径。' }],
    ['device-firmware', '固件更新与回滚', 'DOSO OTA PREVIEW', '真实机器人 OTA、健康检查与回滚尚未接入', '固件更新不可用', '固件更新不可用', [['真实机器人连接', '未接入'], ['当前版本', '未知'], ['更新资格', '无法校验']], '生产主状态必须是“固件更新不可用”；不得提供可执行更新或把预览称为真实升级。', true, { topTitle: '固件更新', title: '安全更新 THUNDER 01', subtitle: '更新包会先校验，再写入备用分区；安装、重启和恢复阶段请勿关闭机器人电源。', demo: '此页面只演示 OTA 流程，不会更新真实机器人。', blocked: '当前客户端没有连接真实机器人，因此不能启动真实 OTA，也不会显示模拟成功。' }],
    ['account-security', '账号与安全', 'ACCOUNT SECURITY', '从真实服务加载密码、邮箱验证、MFA 与登录终端', '真实账户状态读取中 · 操作禁用', '正在读取账户状态', [['登录方式与邮箱', '等待服务端真实摘要'], ['MFA', '待读取未启用 / AAL1 / AAL2'], ['登录终端', '待读取 · 撤销需取消/确认']], '登录方式、邮箱、MFA 与终端必须来自真实服务；主题稿使用禁用加载态，不伪造可执行的刷新、修改密码、MFA 或撤销结果。', true],
  ].map(([id, title, eyebrow, subtitle, status, action, rows, truth, disabled = false, unavailable = null]) => ({
    id, title, eyebrow, subtitle, status, action, rows, truth, disabled, unavailable,
  }));

  if (figma.editorType !== 'figma') throw new Error('请在 Figma Design 文件中运行。');
  if (!figma.variables || !figma.createSection || !figma.listAvailableFontsAsync) {
    throw new Error('当前 Figma Plugin API 缺少变量、Section 或字体发现能力。');
  }

  const duplicate = figma.currentPage.children.find((node) => node.type === 'SECTION' && node.name === SECTION_NAME);
  const historicalThemeCollectionIds = new Set();
  if (duplicate) {
    const owned = duplicate.getPluginData('source') === 'doso-app/scripts/figma-source-sync-scripter-min.js'
      && duplicate.getPluginData('createdFrameCount') === '33'
      && duplicate.children.length === 33
      && duplicate.children.every((node) => node.type === 'FRAME' && Boolean(node.getPluginData('dosoPageId')));
    if (!owned) throw new Error(`已存在同名 Section，但不是可安全更新的 DOSO 生成节点：${duplicate.id}`);
    for (const key of ['themeCollectionId', 'darkThemeCollectionId']) {
      const collectionId = duplicate.getPluginData(key);
      if (collectionId) historicalThemeCollectionIds.add(collectionId);
    }
    const storedHistory = duplicate.getPluginData('historicalThemeCollectionIds');
    if (storedHistory) {
      let parsedHistory;
      try { parsedHistory = JSON.parse(storedHistory); } catch (_error) {
        throw new Error('旧 Section 的历史主题集合记录不是有效 JSON。');
      }
      if (!Array.isArray(parsedHistory) || parsedHistory.some((value) => typeof value !== 'string')) {
        throw new Error('旧 Section 的历史主题集合记录格式无效。');
      }
      parsedHistory.filter(Boolean).forEach((collectionId) => historicalThemeCollectionIds.add(collectionId));
    }
  }

  // Discover and load real available fonts before creating or editing any text.
  const available = await figma.listAvailableFontsAsync();
  if (!available.length) throw new Error('Figma 未返回可用字体。');
  const preferred = ['Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Roboto', 'Inter'];
  const family = preferred.find((candidate) => available.some((item) => item.fontName.family === candidate))
    || available[0].fontName.family;
  const familyFonts = available.filter((item) => item.fontName.family === family).map((item) => item.fontName);
  const pickFont = (pattern) => familyFonts.find((font) => pattern.test(font.style))
    || familyFonts.find((font) => /regular|normal|book/i.test(font.style))
    || familyFonts[0];
  const fonts = {
    regular: pickFont(/regular|normal|book/i),
    semibold: pickFont(/semi.?bold|demi.?bold|medium/i),
    bold: pickFont(/bold|heavy/i),
  };
  const uniqueFonts = [...new Map(Object.values(fonts).map((font) => [`${font.family}/${font.style}`, font])).values()];
  await Promise.all(uniqueFonts.map((font) => figma.loadFontAsync(font)));

  const createdCollections = [];
  const createdSceneNodes = [];
  let stagingSection = null;
  let committed = false;
  try {

  const trackSceneNode = (node) => {
    createdSceneNodes.push(node);
    if (
      typeof DOSO_SOURCE_SYNC_TEST !== 'undefined'
      && DOSO_SOURCE_SYNC_TEST.failAfterSceneCreateAt === createdSceneNodes.length
    ) throw new Error(`Injected scene-node failure after create at ${createdSceneNodes.length}`);
    return node;
  };

  const tokens = {
    background: { scopes: ['FRAME_FILL'], light: '#FFFFFF', dark: '#0E1116' },
    surface: { scopes: ['FRAME_FILL', 'SHAPE_FILL'], light: '#F5F7FB', dark: '#1A2028' },
    subtle: { scopes: ['FRAME_FILL', 'SHAPE_FILL'], light: '#EAEDF8', dark: '#25303A' },
    text: { scopes: ['TEXT_FILL'], light: '#050808', dark: '#F7F9FC' },
    muted: { scopes: ['TEXT_FILL'], light: '#7B7B7B', dark: '#96A1AD' },
    border: { scopes: ['STROKE_COLOR'], light: '#E2E6F0', dark: '#65707C', darkAlpha: 0.55 },
    accent: { scopes: ['FRAME_FILL', 'SHAPE_FILL'], light: '#56FD5E', dark: '#56FD5E' },
    accentText: { scopes: ['TEXT_FILL'], light: '#157A4F', dark: '#56FD5E' },
    accentInk: { scopes: ['TEXT_FILL'], light: '#043026', dark: '#043026' },
    warning: { scopes: ['TEXT_FILL'], light: '#9A6700', dark: '#FFD166' },
    dangerSurface: { scopes: ['FRAME_FILL', 'SHAPE_FILL'], light: '#FFF0F1', dark: '#3A1D22' },
    dangerText: { scopes: ['TEXT_FILL'], light: '#B52E42', dark: '#FF6F78' },
  };
  const rgba = (hex, alpha = 1) => ({
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
    a: alpha,
  });

  // Each run builds a fresh, uniquely owned variable set. Existing collections
  // are not mutated until the new 33-frame Section has been fully validated.
  const runId = Date.now();
  const lightCollection = figma.variables.createVariableCollection(`${COLLECTION_NAME} / ${runId}`);
  createdCollections.push(lightCollection);
  lightCollection.renameMode(lightCollection.modes[0].modeId, 'Light');
  const lightMode = lightCollection.modes.find((mode) => mode.name === 'Light');
  if (!lightMode) throw new Error('无法创建 Light 主题 mode。');

  // Preferred path: one collection with Light/Dark modes. Figma Free may reject
  // addMode(); in that case, use a second one-mode collection for Dark.
  let darkCollection = lightCollection;
  let darkMode = null;
  let modeFallback = false;
  try {
    const darkModeId = lightCollection.addMode('Dark');
    darkMode = { name: 'Dark', modeId: darkModeId };
  } catch (_error) {
    modeFallback = true;
    darkCollection = figma.variables.createVariableCollection(`${COLLECTION_NAME} / Dark / ${runId}`);
    createdCollections.push(darkCollection);
    darkCollection.renameMode(darkCollection.modes[0].modeId, 'Dark');
    darkMode = darkCollection.modes[0];
  }

  const ensureVariables = async (collection, valuesByToken, modeId) => {
    const found = await Promise.all(collection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)));
    const byName = new Map(found.filter(Boolean).map((variable) => [variable.name, variable]));
    const result = {};
    for (const [name, spec] of Object.entries(tokens)) {
      const variableName = `color/${name}`;
      let variable = byName.get(variableName);
      if (variable && variable.resolvedType !== 'COLOR') throw new Error(`${variableName} 不是 COLOR 变量。`);
      if (!variable) variable = figma.variables.createVariable(variableName, collection, 'COLOR');
      variable.scopes = spec.scopes; // Never leave ALL_SCOPES implicit.
      const alpha = valuesByToken === 'dark'
        ? (spec.darkAlpha == null ? 1 : spec.darkAlpha)
        : (spec.lightAlpha == null ? 1 : spec.lightAlpha);
      variable.setValueForMode(modeId, rgba(spec[valuesByToken], alpha));
      result[name] = variable;
    }
    return result;
  };

  let lightVars;
  let darkVars;
  if (lightCollection.id === darkCollection.id) {
    lightVars = await ensureVariables(lightCollection, 'light', lightMode.modeId);
    darkVars = lightVars;
    for (const [name, spec] of Object.entries(tokens)) {
      darkVars[name].setValueForMode(
        darkMode.modeId,
        rgba(spec.dark, spec.darkAlpha == null ? 1 : spec.darkAlpha),
      );
    }
  } else {
    lightVars = await ensureVariables(lightCollection, 'light', lightMode.modeId);
    darkVars = await ensureVariables(darkCollection, 'dark', darkMode.modeId);
  }

  const paint = (variable) => figma.variables.setBoundVariableForPaint(
    { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', variable,
  );
  const bindFill = (node, variable) => { node.fills = [paint(variable)]; };
  const bindStroke = (node, variable) => { node.strokes = [paint(variable)]; node.strokeWeight = 1; };
  const makeFrame = (name, direction, width, height, fillVariable) => {
    const node = trackSceneNode(figma.createFrame());
    node.name = name;
    node.layoutMode = direction;
    node.primaryAxisSizingMode = 'FIXED';
    node.counterAxisSizingMode = 'FIXED';
    node.resize(width, height);
    node.clipsContent = true;
    if (fillVariable) bindFill(node, fillVariable);
    else node.fills = [];
    return node;
  };
  const makeText = (name, value, size, weight, variable, width, lineHeight = Math.round(size * 1.45)) => {
    const node = trackSceneNode(figma.createText());
    node.name = name;
    node.fontName = fonts[weight] || fonts.regular;
    node.fontSize = size;
    node.lineHeight = { unit: 'PIXELS', value: lineHeight };
    node.characters = value;
    node.textAutoResize = 'HEIGHT';
    node.resize(width, lineHeight);
    node.fills = [paint(variable)];
    return node;
  };
  const append = (parent, child) => { parent.appendChild(child); return child; };
  const makeRow = (label, value, width, vars) => {
    const row = makeFrame(`Field / ${label}`, 'VERTICAL', width, 58, vars.subtle);
    row.cornerRadius = 12;
    row.paddingLeft = row.paddingRight = 14;
    row.paddingTop = row.paddingBottom = 8;
    row.itemSpacing = 2;
    append(row, makeText('Label', label, 10, 'semibold', vars.muted, width - 28, 14));
    append(row, makeText('Value', value, 12, 'regular', vars.text, width - 28, 18));
    return row;
  };
  const makeCard = (page, width, height, vars, compact = false) => {
    const card = makeFrame(compact ? 'Content / Landscape Primary' : 'Content / Portrait', 'VERTICAL', width, height, vars.surface);
    card.cornerRadius = 20;
    card.paddingLeft = card.paddingRight = 20;
    card.paddingTop = card.paddingBottom = 20;
    card.itemSpacing = compact ? 9 : 13;
    bindStroke(card, vars.border);
    append(card, makeText('Eyebrow', page.eyebrow, 10, 'bold', vars.accentText, width - 40, 15));
    append(card, makeText('Title', page.title, compact ? 24 : 30, 'bold', vars.text, width - 40, compact ? 32 : 40));
    append(card, makeText('Subtitle', page.subtitle, 12, 'regular', vars.muted, width - 40, 18));
    const toneVar = page.disabled ? vars.dangerText : /待|未|尚|加载/.test(page.status) ? vars.warning : vars.accentText;
    append(card, makeText('Truthful Status', page.status, 11, 'semibold', toneVar, width - 40, 18));
    if (!compact) page.rows.forEach(([label, value]) => append(card, makeRow(label, value, width - 40, vars)));
    const button = makeFrame(page.disabled ? 'Action / Disabled' : 'Action / Available', 'HORIZONTAL', width - 40, 48, page.disabled ? vars.subtle : vars.accent);
    button.cornerRadius = 24;
    button.paddingLeft = button.paddingRight = 18;
    button.paddingTop = button.paddingBottom = 13;
    append(button, makeText('Action Label', page.action, 13, 'bold', page.disabled ? vars.muted : vars.accentInk, width - 76, 20));
    append(card, button);
    return card;
  };
  const makeTopBar = (page, width, vars) => {
    const topBar = makeFrame('Top Bar', 'HORIZONTAL', width, 44, vars.background);
    topBar.itemSpacing = 5;
    topBar.counterAxisAlignItems = 'CENTER';
    const back = makeFrame('Back Button', 'HORIZONTAL', 44, 44, vars.surface);
    back.cornerRadius = 22;
    back.primaryAxisAlignItems = 'CENTER';
    back.counterAxisAlignItems = 'CENTER';
    const backGlyph = makeText('Back', '‹', 28, 'regular', vars.text, 44, 40);
    backGlyph.textAlignHorizontal = 'CENTER';
    append(back, backGlyph);
    append(topBar, back);
    const topTitle = makeText('Top Title', page.unavailable.topTitle, 17, 'bold', vars.text, width - 98, 26);
    topTitle.textAlignHorizontal = 'CENTER';
    append(topBar, topTitle);
    const trailing = makeFrame('Trailing Slot', 'HORIZONTAL', 44, 44, page.unavailable.topTitle ? vars.surface : vars.background);
    trailing.cornerRadius = 22;
    append(topBar, trailing);
    return topBar;
  };
  const makeDemoBanner = (page, width, vars) => {
    const banner = makeFrame('Demo Banner', 'HORIZONTAL', width, 66, vars.dangerSurface);
    banner.cornerRadius = 20;
    banner.paddingLeft = banner.paddingRight = 14;
    banner.paddingTop = banner.paddingBottom = 12;
    banner.itemSpacing = 10;
    banner.counterAxisAlignItems = 'CENTER';
    const mark = makeText('Demo Mark', '!', 16, 'bold', vars.dangerText, 20, 22);
    mark.textAlignHorizontal = 'CENTER';
    append(banner, mark);
    const copy = makeFrame('Demo Copy Group', 'VERTICAL', width - 58, 42, null);
    copy.itemSpacing = 2;
    append(copy, makeText('Demo Title', '开发演示', 13, 'bold', vars.dangerText, width - 58, 18));
    append(copy, makeText('Demo Copy', page.unavailable.demo, 11, 'regular', vars.dangerText, width - 58, 17));
    append(banner, copy);
    return banner;
  };
  const makeUnavailableIntro = (page, name, width, height, vars, compact = false) => {
    const intro = makeFrame(name, 'VERTICAL', width, height, vars.background);
    intro.itemSpacing = compact ? 8 : 12;
    append(intro, makeTopBar(page, width, vars));
    append(intro, makeDemoBanner(page, width, vars));
    append(intro, makeText('Eyebrow', page.eyebrow, 11, 'bold', vars.accentText, width, 17));
    append(intro, makeText('Title', page.unavailable.title, compact ? 27 : 30, 'bold', vars.text, width, compact ? 36 : 40));
    append(intro, makeText('Subtitle', page.unavailable.subtitle, 13, 'regular', vars.muted, width, 20));
    return intro;
  };
  const makeBlockedState = (page, width, height, vars) => {
    const blocked = makeFrame('Blocked State', 'VERTICAL', width, height, vars.surface);
    blocked.cornerRadius = 28;
    blocked.paddingLeft = blocked.paddingRight = 24;
    blocked.paddingTop = blocked.paddingBottom = 24;
    blocked.itemSpacing = 10;
    blocked.primaryAxisAlignItems = 'CENTER';
    blocked.counterAxisAlignItems = 'CENTER';
    const icon = makeText('Blocked Icon', '▣', 20, 'regular', vars.muted, width - 48, 24);
    const title = makeText('Blocked Title', '硬件连接尚未开放', 16, 'bold', vars.text, width - 48, 24);
    const body = makeText('Blocked Copy', page.unavailable.blocked, 12, 'regular', vars.muted, width - 48, 19);
    icon.textAlignHorizontal = 'CENTER';
    title.textAlignHorizontal = 'CENTER';
    body.textAlignHorizontal = 'CENTER';
    append(blocked, icon);
    append(blocked, title);
    append(blocked, body);
    return blocked;
  };
  const makeUnavailablePortrait = (page, width, height, vars) => {
    const content = makeFrame('Content / Portrait', 'VERTICAL', width, height, vars.background);
    content.itemSpacing = 24;
    append(content, makeUnavailableIntro(page, 'Unavailable / Intro', width, 406, vars));
    append(content, makeBlockedState(page, width, 160, vars));
    return content;
  };
  const makeUnavailableDetail = (page, width, height, vars) => {
    const detail = makeFrame('Landscape / Detail', 'VERTICAL', width, height, vars.background);
    detail.primaryAxisAlignItems = 'CENTER';
    detail.counterAxisAlignItems = 'CENTER';
    append(detail, makeBlockedState(page, width, 160, vars));
    return detail;
  };
  const setTheme = (frame, mode, collection, modeId) => {
    frame.setExplicitVariableModeForCollection(collection, modeId);
    frame.setPluginData('dosoVariant', mode);
  };
  const portrait = (page, mode, vars, collection, modeId) => {
    const frame = makeFrame(`${page.id} · ${page.title} · ${mode}`, 'VERTICAL', PORTRAIT.width, PORTRAIT.height, vars.background);
    frame.paddingLeft = frame.paddingRight = 20;
    frame.paddingTop = 44;
    frame.paddingBottom = 34;
    frame.itemSpacing = 14;
    const safeTop = makeText('Safe Area / Top', 'SAFE AREA · TOP 44', 9, 'semibold', vars.muted, 350, 14);
    if (page.unavailable) safeTop.opacity = 0;
    append(frame, safeTop);
    append(frame, page.unavailable
      ? makeUnavailablePortrait(page, 350, 690, vars)
      : makeCard(page, 350, 690, vars));
    const safeBottom = makeText('Safe Area / Bottom', 'SAFE AREA · BOTTOM 34', 9, 'semibold', vars.muted, 350, 14);
    if (page.unavailable) safeBottom.opacity = 0;
    append(frame, safeBottom);
    setTheme(frame, mode, collection, modeId);
    frame.setPluginData('dosoPageId', page.id);
    frame.setPluginData('truthContract', page.truth);
    if (page.unavailable) frame.setPluginData('productState', 'unavailable');
    return frame;
  };
  const landscape = (page) => {
    const vars = lightVars;
    const frame = trackSceneNode(figma.createFrame());
    frame.name = `${page.id} · ${page.title} · Landscape`;
    frame.resize(LANDSCAPE.width, LANDSCAPE.height);
    frame.clipsContent = true;
    bindFill(frame, vars.background);
    const left = page.unavailable
      ? makeUnavailableIntro(page, 'Content / Landscape Primary', 392, 350, vars, true)
      : makeCard(page, 392, 350, vars, true);
    frame.appendChild(left); left.x = 20; left.y = 20;
    const right = page.unavailable
      ? makeUnavailableDetail(page, 392, 350, vars)
      : makeFrame('Landscape / Detail', 'VERTICAL', 392, 350, vars.surface);
    if (!page.unavailable) {
      right.cornerRadius = 20;
      right.paddingLeft = right.paddingRight = 20;
      right.paddingTop = right.paddingBottom = 20;
      right.itemSpacing = 10;
      bindStroke(right, vars.border);
      append(right, makeText('Section Title', '真实状态合同', 16, 'bold', vars.text, 352, 24));
      page.rows.forEach(([label, value]) => append(right, makeRow(label, value, 352, vars)));
      append(right, makeText('Truth Contract', page.truth, 11, 'regular', vars.muted, 352, 17));
    }
    frame.appendChild(right); right.x = 432; right.y = 20;
    setTheme(frame, 'Landscape', lightCollection, lightMode.modeId);
    frame.setPluginData('dosoPageId', page.id);
    frame.setPluginData('landscapeGrid', 'safe 20 / 392 / gap 20 / 392 / safe 20');
    frame.setPluginData('truthContract', page.truth);
    if (page.unavailable) frame.setPluginData('productState', 'unavailable');
    return frame;
  };

  let rightEdge = 0;
  for (const child of figma.currentPage.children) {
    if (child !== duplicate) rightEdge = Math.max(rightEdge, child.x + child.width);
  }
  stagingSection = figma.createSection();
  const section = stagingSection;
  section.x = duplicate ? duplicate.x : rightEdge + 240;
  section.y = duplicate ? duplicate.y : 0;
  section.name = `${SECTION_NAME} · staging · ${runId}`;
  section.resizeWithoutConstraints(1784, pages.length * 930 + 100);
  section.fills = [{ type: 'SOLID', color: { r: 0.91, g: 0.94, b: 0.97 }, opacity: 0.5 }];
  section.setPluginData('source', 'doso-app/scripts/figma-source-sync-scripter-min.js');
  section.setPluginData('contractVersion', '2026-08-30.1');
  section.setPluginData('themeCollectionId', lightCollection.id);
  section.setPluginData('darkThemeCollectionId', darkCollection.id);
  section.setPluginData('themeModeFallback', String(modeFallback));
  section.setPluginData('historicalThemeCollectionIds', JSON.stringify([...historicalThemeCollectionIds]));

  const frameIds = [];
  const maybeFailForTest = (frameNumber) => {
    if (typeof DOSO_SOURCE_SYNC_TEST !== 'undefined' && DOSO_SOURCE_SYNC_TEST.failAtFrame === frameNumber) {
      throw new Error(`Injected acceptance-frame failure at ${frameNumber}`);
    }
  };
  pages.forEach((page, index) => {
    const y = 50 + index * 930;
    maybeFailForTest(frameIds.length + 1);
    const light = portrait(page, 'Light', lightVars, lightCollection, lightMode.modeId);
    section.appendChild(light); light.x = 40; light.y = y; frameIds.push(light.id);
    maybeFailForTest(frameIds.length + 1);
    const dark = portrait(page, 'Dark', darkVars, darkCollection, darkMode.modeId);
    section.appendChild(dark); dark.x = 470; dark.y = y; frameIds.push(dark.id);
    maybeFailForTest(frameIds.length + 1);
    const wide = landscape(page);
    section.appendChild(wide); wide.x = 900; wide.y = y; frameIds.push(wide.id);
  });

  const stagedFields = section.findAll((node) => node.type === 'FRAME' && node.name.indexOf('Field / ') === 0);
  const stagedActions = section.findAll((node) => node.type === 'FRAME' && (node.name === 'Action / Disabled' || node.name === 'Action / Available'));
  const stagedDemoBanners = section.findAll((node) => node.type === 'FRAME' && node.name === 'Demo Banner');
  const stagedBlockedStates = section.findAll((node) => node.type === 'FRAME' && node.name === 'Blocked State');
  const stagedUnavailableFrames = section.children.filter((node) => node.getPluginData('productState') === 'unavailable');
  if (
    frameIds.length !== pages.length * 3
    || section.children.length !== pages.length * 3
    || section.children.some((node) => node.type !== 'FRAME' || !node.getPluginData('dosoPageId'))
    || stagedFields.length !== 81
    || stagedActions.filter((node) => node.name === 'Action / Disabled').length !== 6
    || stagedActions.filter((node) => node.name === 'Action / Available').length !== 21
    || stagedDemoBanners.length !== 6
    || stagedBlockedStates.length !== 6
    || stagedUnavailableFrames.length !== 6
    || stagedUnavailableFrames.some((frame) => frame.findAll((node) => node.type === 'FRAME' && (node.name.indexOf('Field / ') === 0 || node.name.indexOf('Action / ') === 0)).length !== 0)
  ) throw new Error('临时 Section 未形成完整的 11 页 × 3 状态结构。');

  section.setPluginData('createdFrameCount', String(frameIds.length));
  section.name = SECTION_NAME;
  const updatedExistingSection = Boolean(duplicate);
  if (duplicate) duplicate.remove();
  committed = true;

  try { figma.currentPage.selection = [section]; } catch (_selectionError) {}
  try { figma.viewport.scrollAndZoomIntoView([section]); } catch (_viewportError) {}
  try { if (typeof figma.commitUndo === 'function') figma.commitUndo(); } catch (_undoError) {}
  try {
    figma.notify(`DOSO Source Sync 完成：已${updatedExistingSection ? '更新' : '创建'} ${frameIds.length} 个 Frame`, { timeout: 8000 });
  } catch (_notifyError) {}
  return {
    sectionId: section.id,
    createdFrameCount: frameIds.length,
    updatedExistingSection,
    modeFallback,
    fontFamily: family,
    frameIds,
  };
  } catch (error) {
    if (!committed) {
      try { if (stagingSection) stagingSection.remove(); } catch (_sectionCleanupError) {}
      for (const node of [...createdSceneNodes].reverse()) {
        try {
          if (!node.removed && node.parent === figma.currentPage) node.remove();
        } catch (_nodeCleanupError) {}
      }
      for (const collection of [...createdCollections].reverse()) {
        try { collection.remove(); } catch (_collectionCleanupError) {}
      }
    }
    throw error;
  }
}

try {
  const result = await main();
  if (typeof print === 'function') print(result);
} catch (error) {
  try {
    figma.notify(`DOSO Source Sync 失败：${error && error.message ? error.message : String(error)}`, { error: true, timeout: 12000 });
  } catch (_notifyError) {
    // Keep the original error as the failure signal when notifications are unavailable.
  }
  if (typeof print === 'function') print(error);
  throw error;
}
})();
