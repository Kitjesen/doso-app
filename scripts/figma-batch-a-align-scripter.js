// DOSO Batch A in-place alignment for the community Figma "Scripter" plugin.
// Targets the editable copy ZDueCh91PDy5oyLKicv0zR and preserves all nine root IDs.
// Existing robot, map, avatar and vector/icon layers stay in place and editable.

(async () => {
  const TARGETS = [
    ['main-routes', 'light', '139:7397', 390, 844],
    ['main-routes', 'dark', '139:4784', 390, 844],
    ['main-routes', 'landscape', '139:10680', 844, 390],
    ['main-tasks', 'light', '139:6722', 390, 844],
    ['main-tasks', 'dark', '139:4209', 390, 844],
    ['main-tasks', 'landscape', '139:11041', 844, 390],
    ['main-home', 'light', '139:6636', 390, 844],
    ['main-home', 'dark', '139:4126', 390, 844],
    ['main-home', 'landscape', '139:10575', 844, 390],
  ].map(([page, state, id, width, height]) => ({ page, state, id, width, height }));

  if (figma.editorType !== 'figma') throw new Error('请在 Figma Design 文件中运行。');

  const roots = [];
  for (const target of TARGETS) {
    const node = await figma.getNodeByIdAsync(target.id);
    if (!node || node.type !== 'FRAME') throw new Error(`缺少 Batch A 根 Frame：${target.id}`);
    roots.push({ ...target, node });
  }
  const pages = new Set(roots.map(({ node }) => node.parent?.type === 'PAGE' ? node.parent : node.parent?.parent).filter(Boolean));
  if (pages.size !== 1) throw new Error('Batch A 九帧不在同一 Figma 页面，拒绝跨页原位修改。');
  await figma.setCurrentPageAsync([...pages][0]);

  const available = await figma.listAvailableFontsAsync();
  const preferred = ['Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', 'Roboto', 'Inter'];
  const family = preferred.find((name) => available.some(({ fontName }) => fontName.family === name))
    || available[0]?.fontName.family;
  if (!family) throw new Error('Figma 未返回可用字体。');
  const familyFonts = available.filter(({ fontName }) => fontName.family === family).map(({ fontName }) => fontName);
  const pick = (pattern) => familyFonts.find(({ style }) => pattern.test(style)) || familyFonts[0];
  const fonts = {
    regular: pick(/regular|normal|book/i),
    medium: pick(/medium|semi.?bold|demi.?bold/i),
    bold: pick(/bold|heavy|black/i),
  };

  const allTexts = roots.flatMap(({ node }) => node.findAllWithCriteria({ types: ['TEXT'] }));
  const currentFonts = new Map();
  for (const text of allTexts) {
    for (const segment of text.getStyledTextSegments(['fontName'])) {
      currentFonts.set(`${segment.fontName.family}\u0000${segment.fontName.style}`, segment.fontName);
    }
  }
  await Promise.all([...currentFonts.values(), ...Object.values(fonts)].map((font) => figma.loadFontAsync(font)));

  const normalize = (value) => value.replace(/[·•]/g, '·').replace(/\s+/g, ' ').trim();
  const rgb = (hex) => {
    const value = hex.replace('#', '');
    return {
      r: parseInt(value.slice(0, 2), 16) / 255,
      g: parseInt(value.slice(2, 4), 16) / 255,
      b: parseInt(value.slice(4, 6), 16) / 255,
    };
  };
  const solid = (hex, opacity = 1) => ({ type: 'SOLID', color: rgb(hex), opacity });
  const absBox = (node, root) => ({
    x: node.absoluteTransform[0][2] - root.absoluteTransform[0][2],
    y: node.absoluteTransform[1][2] - root.absoluteTransform[1][2],
    width: node.width,
    height: node.height,
  });
  const topChild = (node, root) => {
    let current = node;
    while (current.parent && current.parent !== root) current = current.parent;
    return current;
  };
  const ancestor = (node, root, predicate) => {
    let current = node.parent;
    while (current && current !== root) {
      if ('width' in current && predicate(current, absBox(current, root))) return current;
      current = current.parent;
    }
    return null;
  };
  const unique = (items) => [...new Map(items.filter(Boolean).map((item) => [item.id, item])).values()];
  const mutated = new Set();
  const created = new Set();
  const report = [];

  const setText = (text, value, weight) => {
    if (weight) text.fontName = fonts[weight];
    text.characters = value;
    mutated.add(text.id);
  };
  const replaceText = (root, replacements) => {
    let count = 0;
    for (const text of root.findAllWithCriteria({ types: ['TEXT'] })) {
      const next = replacements.get(normalize(text.characters));
      if (next === undefined || next === text.characters) continue;
      setText(text, next);
      count += 1;
    }
    return count;
  };
  const imageAssetCount = (root) => root.findAll((node) => (
    ['VECTOR', 'BOOLEAN_OPERATION', 'INSTANCE'].includes(node.type)
    || ('fills' in node && Array.isArray(node.fills) && node.fills.some((fill) => fill.type === 'IMAGE'))
  )).length;

  const HEADER = new Map([
    ['Hello, Anny', '你好，DOSO Demo'],
    ['Hello， Anny', '你好，DOSO Demo'],
    ['Hello，Anny', '你好，DOSO Demo'],
    ['你好，Anny', '你好，DOSO Demo'],
    ['你好， Anny', '你好，DOSO Demo'],
    ['Today 25 Nov', '今天 · 8 月 31 日'],
    ['Today · 25 Nov', '今天 · 8 月 31 日'],
    ['今天 · 25 日', '今天 · 8 月 31 日'],
  ]);

  const ROUTES = new Map([
    ['Patrol Routes', '巡航路线'],
    ['Choose a saved route for Thunder-07.', '为 THUNDER 01 选择路线模板 · 尚未同步真实地图和路线'],
    ['Choose a saved route for Thunder.', '为 THUNDER 01 选择路线模板 · 尚未同步真实地图和路线'],
    ['为 Thunder-07 选择一条已保存路线', '为 THUNDER 01 选择路线模板 · 尚未同步真实地图和路线'],
    ['All routes', '全部路线'], ['Recent', '最近'], ['Favorites', '收藏'],
    ['Available routes', '可用路线模板'], ['可用路线', '可用路线模板'],
    ['SELECTED', '已选择'], ['● SELECTED', '● 已选择'],
    ['Zone A Patrol', 'A 区巡航模板'], ['A 区巡航', 'A 区巡航模板'],
    ['Warehouse Loop', '仓库环线模板'], ['仓库环线', '仓库环线模板'],
    ['Dock Perimeter', '充电座外围模板'], ['充电座外围', '充电座外围模板'],
    ['Route-A001', '路线界面预览'], ['Route-B004', '路线界面预览'], ['Route-C012', '路线界面预览'],
    ['North entrance perimeter', '时长、距离与检查点待同步'],
    ['3 checkpoints', '时长、距离与检查点待同步'],
    ['15 min · 120 m', '时长、距离与检查点待同步'],
    ['24 min · 280 m · 5 stops', '时长、距离与检查点待同步'],
    ['18 min · 190 m · 4 stops', '时长、距离与检查点待同步'],
    ['北入口外圈', '时长、距离与检查点待同步'],
    ['共 3 个检查点', '时长、距离与检查点待同步'],
    ['15 分钟 · 120 米', '时长、距离与检查点待同步'],
    ['24 分钟 · 280 米 · 5 站', '时长、距离与检查点待同步'],
    ['18 分钟 · 190 米 · 4 站', '时长、距离与检查点待同步'],
    ['Start Zone A Patrol', '路线控制不可用'], ['开始 A 区巡航', '路线控制不可用'],
    ['Custom', '自定义'],
  ]);

  const TASKS = new Map([
    ['TODAY’S MISSIONS', '任务模板预览'], ["TODAY'S MISSIONS", '任务模板预览'], ['今日任务', '任务模板预览'],
    ['Inspection and charging missions are on schedule.', '巡检与充电任务均为界面预览'],
    ['巡检与充电任务均按计划进行。', '巡检与充电任务均为界面预览'],
    ['33% complete', '模板数据 · 33%'], ['已完成 33%', '模板数据 · 33%'],
    ['Ready for today’s missions?', '准备好执行今天的任务了吗？'],
    ["Ready for today's missions?", '准备好执行今天的任务了吗？'],
    ['准备好执行今天的任务了吗？', '准备好执行今天的任务了吗？'],
    ['3 missions are waiting for Thunder', 'THUNDER 01 尚未同步可信任务'],
    ['Thunder 有 3 个待执行任务', 'THUNDER 01 尚未同步可信任务'],
    ['Return to Dock', '回充模板'], ['返回充电座', '回充模板'],
    ['Inspection', '巡检'], ['巡检', '巡检'],
    ['Device Safety', '设备安全'],
    ['Safely return and recharge', '安全返回充电座并补充电量'],
    ['Check systems and surroundings', '检查设备系统与周边环境'],
    ['Run diagnostics and updates', '运行诊断与安全检查'],
  ]);

  const HOME = new Map([
    ['Thunder', 'THUNDER 01'], ['THUNDER', 'THUNDER 01'],
    ['Ready to Control', '设备已离线 · 实体运动协议尚未接入'],
    ['设备已离线 · 运动协议未接入', '设备已离线 · 实体运动协议尚未接入'],
    ['设备在线，可开始控制', '设备已离线 · 实体运动协议尚未接入'],
    ['34', '—'], ['34%', '—'], ['%', ''], ['Battery', '电量'],
    ['12/12', '待同步'], ['Sensors', '传感器'], ['32°C', '待同步'],
    ['Temperature', '温度'], ['Running', '待同步'], ['Motor', '电机'],
    ['Control', '控制预览'], ['Quick actions', '快捷操作'],
    ['Recall', '召回'], ['Return to base station', '待可信执行通道'], ['返回基站', '待可信执行通道'],
    ['Start Patrol', '巡航模板'], ['开始巡航', '巡航模板'],
    ['Begin autonomous patrol mode', '预览路线与环境模板'], ['启动自主巡航模式', '预览路线与环境模板'],
    ['Run Mission', '任务模板'], ['执行任务', '任务模板'],
    ['Execute a assigned mission', '预览任务编排模板'], ['执行分配的任务', '预览任务编排模板'],
    ['Device Safety', '设备安全'], ['Check system health & locks', '查看系统状态与安全'],
  ]);

  const alignTaskDates = (root) => {
    const weekValues = new Set(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', '周日', '周一', '周二', '周三', '周四', '周五', '周六']);
    const weekTexts = root.findAllWithCriteria({ types: ['TEXT'] }).filter((text) => weekValues.has(normalize(text.characters)));
    const items = unique(weekTexts.map((text) => ancestor(text, root, (_node, box) => box.width >= 34 && box.width <= 62 && box.height >= 60 && box.height <= 105)));
    if (items.length !== 7) return { count: 0, selectedMoved: false };
    items.sort((a, b) => absBox(a, root).x - absBox(b, root).x);
    const greenScore = (item) => item.findAll((node) => 'fills' in node && Array.isArray(node.fills)).reduce((score, node) => {
      return score + node.fills.filter((fill) => fill.type === 'SOLID' && fill.color.g > 0.75 && fill.color.r < 0.45).length;
    }, 0);
    const selectedIndex = items.map(greenScore).indexOf(Math.max(...items.map(greenScore)));
    let selectedMoved = false;
    if (selectedIndex >= 0 && selectedIndex !== 1 && items[selectedIndex].parent === items[1].parent) {
      const parent = items[selectedIndex].parent;
      const selected = items[selectedIndex];
      const monday = items[1];
      const selectedChildIndex = parent.children.indexOf(selected);
      const mondayChildIndex = parent.children.indexOf(monday);
      parent.insertChild(mondayChildIndex, selected);
      parent.insertChild(selectedChildIndex, monday);
      mutated.add(parent.id);
      mutated.add(selected.id);
      mutated.add(monday.id);
      selectedMoved = true;
      items.sort((a, b) => absBox(a, root).x - absBox(b, root).x);
    }
    const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const days = ['30', '31', '1', '2', '3', '4', '5'];
    items.forEach((item, index) => {
      const texts = item.findAllWithCriteria({ types: ['TEXT'] }).sort((a, b) => absBox(a, root).y - absBox(b, root).y);
      if (texts[0]) setText(texts[0], weeks[index], 'medium');
      if (texts[1]) setText(texts[1], days[index], 'medium');
    });
    return { count: items.length, selectedMoved };
  };

  const taskText = (root, value, x, y, width, size, color, weight = 'regular', align = 'LEFT', lineHeight = Math.round(size * 1.35)) => {
    const node = figma.createText();
    root.appendChild(node);
    node.name = 'DOSO QA / Task Copy';
    node.fontName = fonts[weight];
    node.fontSize = size;
    node.lineHeight = { unit: 'PIXELS', value: lineHeight };
    node.characters = value;
    node.textAutoResize = 'HEIGHT';
    node.resize(width, lineHeight);
    node.x = x;
    node.y = y;
    node.textAlignHorizontal = align;
    node.fills = [solid(color)];
    mutated.add(node.id);
    created.add(node.id);
    return node;
  };

  const taskRect = (root, name, x, y, width, height, color, radius = 0) => {
    const node = figma.createRectangle();
    root.appendChild(node);
    node.name = `DOSO QA / ${name}`;
    node.resize(width, height);
    node.x = x;
    node.y = y;
    node.cornerRadius = radius;
    node.fills = [solid(color)];
    mutated.add(node.id);
    created.add(node.id);
    return node;
  };

  const rebuildTaskCopy = (root, isDark) => {
    for (const node of root.findAll((child) => child.name.startsWith('DOSO QA / Task'))) node.visible = false;
    for (const node of root.findAllWithCriteria({ types: ['TEXT'] })) node.visible = false;
    const landscape = root.width > root.height;
    const ink = isDark ? '#F4F6F8' : '#101214';
    const muted = isDark ? '#9CA4AE' : '#7A8088';
    const background = isDark ? '#0C1016' : '#FFFFFF';
    const card = isDark ? '#25303A' : '#E9EDF8';
    const green = '#2DF59C';

    if (landscape) {
      taskText(root, '你好，DOSO Demo', 64, 53, 210, 16, ink, 'bold');
      taskText(root, '今天 · 8 月 31 日', 64, 75, 210, 10, muted, 'regular');
      taskRect(root, 'Task Date Strip', 20, 112, 330, 86, background);
      taskRect(root, 'Task Date Selected', 73, 114, 48, 74, isDark ? '#26323A' : '#E9EDF8', 24);
      taskRect(root, 'Task Date Selected Day', 80, 143, 34, 34, green, 17);
      const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const days = ['30', '31', '1', '2', '3', '4', '5'];
      for (let index = 0; index < 7; index += 1) {
        const x = 24 + index * 47;
        taskText(root, weeks[index], x, 121, 40, 10, muted, 'medium', 'CENTER');
        taskText(root, days[index], x, 153, 40, 12, index === 1 ? (isDark ? '#10251D' : '#0B3A27') : ink, 'bold', 'CENTER');
      }
      taskRect(root, 'Task Summary Copy Surface', 91, 248, 244, 104, card, 0);
      taskText(root, '任务模板预览', 96, 274, 150, 13, ink, 'bold');
      taskText(root, '巡检与充电任务均为界面预览', 96, 300, 172, 9, muted, 'regular');
      taskText(root, '1/3', 270, 268, 58, 28, ink, 'bold', 'CENTER');
      taskText(root, '模板数据 · 33%', 267, 316, 70, 9, green, 'bold', 'CENTER');
      taskText(root, '准备好执行今天的\n任务了吗？', 438, 52, 290, 27, ink, 'bold', 'CENTER', 32);
      taskText(root, 'THUNDER 01 尚未同步可信任务', 438, 129, 290, 15, muted, 'medium', 'CENTER');
      taskText(root, '模板预览', 523, 259, 70, 8, green, 'bold', 'CENTER');
      taskText(root, '巡检', 523, 277, 70, 11, ink, 'bold', 'CENTER');
      taskText(root, '检查设备系统与周边环境', 497, 296, 122, 8, muted, 'regular', 'CENTER');
      taskText(root, '模板预览', 635, 288, 72, 7, green, 'bold', 'CENTER');
      taskText(root, '回充模板', 635, 304, 72, 9, ink, 'bold', 'CENTER');
      taskText(root, '模板预览', 744, 288, 72, 7, green, 'bold', 'CENTER');
      taskText(root, '设备安全', 744, 304, 72, 9, ink, 'bold', 'CENTER');
      taskText(root, '生产控制与任务执行器未接入', 541, 340, 194, 9, '#E26A7B', 'medium', 'CENTER');
    } else {
      taskText(root, '你好，DOSO Demo', 72, 64, 240, 16, ink, 'bold');
      taskText(root, '今天 · 8 月 31 日', 72, 85, 240, 10, muted, 'regular');
      taskRect(root, 'Task Date Strip', 18, 128, 354, 96, background);
      taskRect(root, 'Task Date Selected', 57, 134, 50, 79, isDark ? '#26323A' : '#E9EDF8', 25);
      taskRect(root, 'Task Date Selected Day', 65, 171, 34, 34, green, 17);
      const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const days = ['30', '31', '1', '2', '3', '4', '5'];
      for (let index = 0; index < 7; index += 1) {
        const x = 12 + index * 51;
        taskText(root, weeks[index], x, 139, 38, 10, muted, 'medium', 'CENTER');
        taskText(root, days[index], x, 174, 38, 12, index === 1 ? (isDark ? '#10251D' : '#0B3A27') : ink, 'bold', 'CENTER');
      }
      taskRect(root, 'Task Summary Copy Surface', 91, 248, 244, 64, card, 0);
      taskText(root, '任务模板预览', 99, 257, 150, 13, ink, 'bold');
      taskText(root, '巡检与充电任务均为界面预览', 99, 282, 172, 9, muted, 'regular');
      taskText(root, '1/3', 267, 255, 62, 28, ink, 'bold', 'CENTER');
      taskText(root, '模板数据 · 33%', 258, 294, 82, 9, green, 'bold', 'CENTER');
      taskText(root, '准备好执行今天的任务了吗？', 50, 357, 290, 27, ink, 'bold', 'CENTER', 34);
      taskText(root, 'THUNDER 01 尚未同步可信任务', 43, 440, 304, 15, muted, 'medium', 'CENTER');
      taskText(root, '模板预览', 154, 587, 82, 8, green, 'bold', 'CENTER');
      taskText(root, '巡检', 154, 605, 82, 12, ink, 'bold', 'CENTER');
      taskText(root, '检查设备系统与周边环境', 119, 626, 152, 8, muted, 'regular', 'CENTER');
      taskText(root, '生产控制与任务执行器未接入', 104, 730, 182, 9, '#E26A7B', 'medium', 'CENTER');
    }
    return 1;
  };

  const rebuildHomeCopy = (root, isDark) => {
    for (const node of root.findAll((child) => child.name.startsWith('DOSO QA / Home Copy'))) node.visible = false;
    const landscape = root.width > root.height;
    for (const node of root.findAllWithCriteria({ types: ['TEXT'] })) {
      const box = absBox(node, root);
      if ((box.y >= 45 && box.y <= 100) || (box.x < (landscape ? 370 : 390) && box.y >= (landscape ? 100 : 125) && box.y <= (landscape ? 370 : 440))) {
        node.visible = false;
      }
    }
    const ink = isDark ? '#F4F6F8' : '#1B2738';
    const muted = isDark ? '#929AA5' : '#818793';
    const green = '#2DF59C';
    const add = (...args) => {
      const node = taskText(root, ...args);
      node.name = 'DOSO QA / Home Copy';
      return node;
    };
    if (landscape) {
      add('你好，DOSO Demo', 64, 53, 210, 16, ink, 'bold');
      add('今天 · 8 月 31 日', 64, 75, 210, 10, muted, 'regular');
      add('THUNDER 01', 38, 126, 180, 17, green, 'bold');
      add('设备已离线 · 实体运动协议尚未接入', 40, 153, 206, 9, muted, 'regular');
      add('—', 41, 185, 90, 38, green, 'bold');
      add('电量', 42, 230, 90, 9, muted, 'medium');
      add('待同步', 66, 263, 72, 14, ink, 'bold');
      add('传感器', 66, 282, 72, 8, muted, 'regular');
      add('待同步', 166, 263, 72, 14, ink, 'bold');
      add('温度', 166, 282, 72, 8, muted, 'regular');
      add('待同步', 264, 263, 72, 14, ink, 'bold');
      add('电机', 264, 282, 72, 8, muted, 'regular');
      add('控制预览', 141, 318, 92, 15, '#0A3D2B', 'bold', 'CENTER');
    } else {
      add('你好，DOSO Demo', 72, 64, 230, 16, ink, 'bold');
      add('今天 · 8 月 31 日', 72, 85, 230, 10, muted, 'regular');
      add('THUNDER 01', 52, 162, 190, 18, green, 'bold');
      add('设备已离线 · 实体运动协议尚未接入', 52, 189, 208, 9, muted, 'regular');
      add('—', 52, 244, 90, 40, green, 'bold');
      add('电量', 52, 285, 90, 9, muted, 'medium');
      add('待同步', 80, 331, 76, 15, ink, 'bold');
      add('传感器', 80, 351, 76, 9, muted, 'regular');
      add('待同步', 183, 331, 76, 15, ink, 'bold');
      add('温度', 183, 351, 76, 9, muted, 'regular');
      add('待同步', 280, 331, 76, 15, ink, 'bold');
      add('电机', 280, 351, 76, 9, muted, 'regular');
      add('控制预览', 148, 387, 94, 16, '#0A3D2B', 'bold', 'CENTER');
    }
    return 1;
  };

  const rebuildRouteCopy = (root, isDark) => {
    for (const node of root.findAll((child) => child.name.startsWith('DOSO QA / Route Copy'))) node.visible = false;
    const landscape = root.width > root.height;
    for (const node of root.findAllWithCriteria({ types: ['TEXT'] })) {
      const box = absBox(node, root);
      const header = box.y >= 45 && box.y <= 100;
      const selectedCopy = landscape
        ? box.x >= 570 && box.x <= 770 && box.y >= 65 && box.y <= 195
        : box.x >= 150 && box.x <= 365 && box.y >= 295 && box.y <= 465;
      if (header || selectedCopy) node.visible = false;
    }
    const ink = isDark ? '#F4F6F8' : '#111820';
    const muted = isDark ? '#8F98A3' : '#808791';
    const add = (...args) => {
      const node = taskText(root, ...args);
      node.name = 'DOSO QA / Route Copy';
      return node;
    };
    if (landscape) {
      add('你好，DOSO Demo', 65, 56, 210, 16, ink, 'bold');
      add('今天 · 8 月 31 日', 65, 78, 210, 10, muted, 'regular');
      add('• 已选择', 584, 98, 150, 9, ink, 'bold');
      add('A 区巡航模板', 584, 118, 160, 12, ink, 'bold');
      add('路线界面预览', 584, 142, 160, 9, muted, 'regular');
      add('时长、距离与检查点待同步', 584, 162, 164, 8, muted, 'regular');
    } else {
      add('你好，DOSO Demo', 72, 64, 220, 16, ink, 'bold');
      add('今天 · 8 月 31 日', 72, 85, 220, 10, muted, 'regular');
      add('• 已选择', 176, 346, 170, 9, ink, 'bold');
      add('A 区巡航模板', 176, 368, 174, 15, ink, 'bold');
      add('路线界面预览', 176, 394, 174, 10, muted, 'regular');
      add('时长、距离与检查点待同步', 176, 416, 174, 9, muted, 'regular');
    }
    return 1;
  };

  const disableRouteAction = (root, isDark) => {
    const label = root.findOne((node) => node.type === 'TEXT' && normalize(node.characters) === '路线控制不可用');
    if (!label) return false;
    const button = ancestor(label, root, (_node, box) => box.width >= 190 && box.width <= 250 && box.height >= 44 && box.height <= 66);
    if (!button) return false;
    button.opacity = isDark ? 0.68 : 0.58;
    mutated.add(button.id);
    for (const node of [button, ...button.findAll((child) => 'fills' in child && Array.isArray(child.fills))]) {
      if (!('fills' in node) || !Array.isArray(node.fills) || node.fills.length === 0) continue;
      node.fills = isDark
        ? [solid('#2D393D')]
        : [solid('#D2DFDC')];
      mutated.add(node.id);
    }
    return true;
  };

  const disableHomeRecall = (root, isDark) => {
    const text = root.findOne((node) => node.type === 'TEXT' && normalize(node.characters) === '召回');
    if (!text) return false;
    const card = ancestor(text, root, (_node, box) => box.width >= 280 && box.height >= 60 && box.height <= 110);
    if (!card) return false;
    card.opacity = 0.66;
    mutated.add(card.id);
    for (const node of card.findAll((child) => (
      'fills' in child && Array.isArray(child.fills)
      && child.width >= 38 && child.width <= 48 && child.height >= 38 && child.height <= 48
    ))) {
      node.fills = [solid(isDark ? '#35453F' : '#CCD8D3')];
      mutated.add(node.id);
    }
    return true;
  };

  const addStatusText = (root, page, state) => {
    const landscape = Math.round(root.width) > Math.round(root.height);
    const specs = page === 'main-routes'
      ? [{ name: 'Product state / route blocked', value: '生产控制与路线执行器未接入', x: landscape ? 82 : 43, y: landscape ? 348 : 718, width: landscape ? 172 : 184, color: '#B52E42', size: 8.5 }]
      : page === 'main-tasks'
        ? [
          { name: 'Product state / template badge', value: '模板预览', x: landscape ? 522 : 174, y: landscape ? 258 : 587, width: 52, color: state === 'dark' ? '#59E8A0' : '#157A4F', size: 8 },
          { name: 'Product state / task blocked', value: '生产控制与任务执行器未接入', x: landscape ? 499 : 124, y: landscape ? 340 : 728, width: landscape ? 180 : 170, color: state === 'dark' ? '#FF9BA4' : '#B52E42', size: 8.5 },
        ]
        : [];
    for (const spec of specs) {
      let text = root.findOne((node) => node.type === 'TEXT' && (
        node.name === spec.name || normalize(node.characters) === spec.value
      ));
      if (!text) {
        text = figma.createText();
        root.appendChild(text);
        text.name = spec.name;
        created.add(text.id);
      }
      text.fontName = fonts.medium;
      text.characters = spec.value;
      text.fontSize = spec.size;
      text.lineHeight = { unit: 'AUTO' };
      text.textAlignHorizontal = 'CENTER';
      text.textAutoResize = 'HEIGHT';
      text.resize(spec.width, Math.max(12, text.height));
      text.x = spec.x;
      text.y = spec.y;
      text.fills = [solid(spec.color)];
      text.visible = true;
      mutated.add(text.id);
    }
    return specs.length;
  };

  const alignRoutesLandscapeSafeArea = (root) => {
    if (Math.round(root.width) !== 844) return { intro: false, list: false, moved: false };
    const title = root.findOne((node) => node.type === 'TEXT' && normalize(node.characters) === '巡航路线');
    const selected = root.findOne((node) => node.type === 'TEXT' && normalize(node.characters) === 'A 区巡航模板');
    const intro = title && ancestor(title, root, (_node, box) => box.width >= 280 && box.width <= 360 && box.x < 80);
    const selectedRoute = selected && ancestor(selected, root, (_node, box) => box.width >= 320 && box.width <= 350 && box.height >= 120 && box.height <= 150);
    const list = selected && ancestor(selected, root, (_node, box) => box.width >= 320 && box.width <= 380 && box.height >= 280 && box.x >= 350);
    const filters = root.findOne((node) => node.name === 'Route Selection / Filters');
    const heading = root.findOne((node) => node.name === 'Available Routes Heading');
    const cta = root.findOne((node) => node.name === 'Route Selection / CTA');
    const customLabel = root.findOne((node) => node.type === 'TEXT' && normalize(node.characters) === '自定义');
    const custom = customLabel && ancestor(customLabel, root, (_node, box) => box.width >= 90 && box.width <= 120 && box.y > 300);
    if (filters) {
      filters.resize(309, filters.height);
      moveToAbsolute(filters, root, 69, 204);
    }
    if (heading) moveToAbsolute(heading, root, 69, 286);
    if (cta) {
      cta.resize(202, cta.height);
      moveToAbsolute(cta, root, 69, 318);
    }
    if (custom) {
      custom.resize(98, custom.height);
      moveToAbsolute(custom, root, 280, 318);
    }
    const selectedMap = selectedRoute && selectedRoute.findAll((node) => (
      'fills' in node && Array.isArray(node.fills) && node.fills.some((paint) => paint.type === 'IMAGE')
    )).sort((left, right) => (right.width * right.height) - (left.width * left.height))[0];
    if (selectedMap) {
      selectedMap.resize(138, 119);
      moveToAbsolute(selectedMap, root, 424, 72);
    }
    return { intro: Boolean(intro), list: Boolean(list), moved: Boolean(filters && heading && cta && custom) };
  };

  const moveToAbsolute = (node, root, x, y) => {
    const box = absBox(node, root);
    node.x += x - box.x;
    node.y += y - box.y;
    mutated.add(node.id);
  };

  const alignRoutesPortrait = (root) => {
    if (root.width > root.height) return false;
    const targets = new Map([
      ['Route Selection / Intro', 128],
      ['Route Selection / Filters', 201],
      ['Available Routes Heading', 258],
      ['Available Routes Card', 287],
      ['Route Selection / CTA', 689],
    ]);
    let count = 0;
    for (const [name, y] of targets) {
      const node = root.findOne((child) => child.name === name);
      if (!node) continue;
      moveToAbsolute(node, root, absBox(node, root).x, y);
      count += 1;
    }
    const card = root.findOne((child) => child.name === 'Available Routes Card');
    if (card) {
      card.resize(card.width, 384);
      mutated.add(card.id);
    }
    for (const [name, y] of [['Route / Warehouse Loop', 472], ['Route / Dock Perimeter', 568]]) {
      const row = root.findOne((child) => child.name === name);
      if (!row) continue;
      moveToAbsolute(row, root, absBox(row, root).x, y);
      count += 1;
    }
    for (const map of root.findAll((child) => (
      'fills' in child && Array.isArray(child.fills)
      && child.fills.some((paint) => paint.type === 'IMAGE')
      && absBox(child, root).x >= 30 && absBox(child, root).x <= 45
      && absBox(child, root).y >= 280 && absBox(child, root).y <= 680
    ))) {
      moveToAbsolute(map, root, 37, absBox(map, root).y);
      count += 1;
    }
    const custom = root.findOne((child) => child.name === 'Frame 1618872752' && absBox(child, root).y > 600);
    if (custom) {
      moveToAbsolute(custom, root, absBox(custom, root).x, 689);
      count += 1;
    }
    return count > 0;
  };

  const alignRouteMapOpacity = (root, isDark) => {
    if (!isDark) return 0;
    let count = 0;
    for (const node of root.findAll((child) => (
      'fills' in child && Array.isArray(child.fills)
      && child.fills.some((paint) => paint.type === 'IMAGE')
      && absBox(child, root).x < (root.width > root.height ? 590 : 170)
    ))) {
      const box = absBox(node, root);
      if (root.width > root.height ? box.x < 400 || box.y > 360 : box.y < 280 || box.y > 680) continue;
      node.opacity = 0.9;
      mutated.add(node.id);
      count += 1;
    }
    return count;
  };

  const alignSelectedNavigationState = (root) => {
    if (root.width > root.height) return false;
    const selected = root.findOne((child) => child.name === 'Rectangle 34632161' && absBox(child, root).y > 730);
    if (!selected) return false;
    selected.resize(selected.width, 56);
    selected.cornerRadius = 28;
    moveToAbsolute(selected, root, absBox(selected, root).x, 762);
    return true;
  };

  const imageNodes = (root) => root.findAll((node) => (
    'fills' in node && Array.isArray(node.fills)
    && node.fills.some((fill) => fill.type === 'IMAGE')
    && node.width >= 70 && node.height >= 45
  ));

  const alignHomeRobots = (root) => {
    for (const node of root.findAll((child) => child.name.startsWith('DOSO QA / Home Robot'))) node.visible = false;
    const landscape = Math.round(root.width) > Math.round(root.height);
    const candidates = imageNodes(root)
      .filter((node) => !node.name.startsWith('DOSO QA / Home Robot'))
      .map((node) => ({ node, box: absBox(node, root) }));
    const main = candidates
      .filter(({ box }) => box.y >= 90 && box.y <= 260 && box.x < (landscape ? 360 : 260))
      .sort((a, b) => (b.box.width * b.box.height) - (a.box.width * a.box.height))[0];
    const recall = candidates
      .filter(({ box }) => landscape
        ? box.x >= 340 && box.y >= 85 && box.y <= 210
        : box.y >= 440 && box.y <= 620)
      .sort((a, b) => (b.box.width * b.box.height) - (a.box.width * a.box.height))[0];
    const reuse = (source, name, x, y, width, height) => {
      if (!source) return null;
      source.node.visible = false;
      const node = figma.createRectangle();
      root.appendChild(node);
      node.name = `DOSO QA / Home Robot / ${name}`;
      node.resize(width, height);
      node.x = x;
      node.y = y;
      node.fills = source.node.fills.map((paint) => paint.type === 'IMAGE' ? { ...paint, scaleMode: 'FIT' } : paint);
      node.strokes = [];
      mutated.add(source.node.id);
      mutated.add(node.id);
      created.add(node.id);
      return node;
    };
    const mainNode = reuse(main, 'Main', landscape ? 170 : 170, landscape ? 135 : 150, landscape ? 180 : 215, landscape ? 120 : 145);
    const recallNode = reuse(recall, 'Recall', landscape ? 389 : 18, landscape ? 108 : 500, landscape ? 125 : 145, landscape ? 82 : 88);
    return {
      main: mainNode ? { id: mainNode.id, ...absBox(mainNode, root) } : null,
      recall: recallNode ? { id: recallNode.id, ...absBox(recallNode, root) } : null,
    };
  };

  const hideDeveloperAnnotations = (root) => {
    let count = 0;
    for (const text of root.findAllWithCriteria({ types: ['TEXT'] })) {
      if (!/SAFE AREA|SOURCE SYNC|真实状态合同|DEVELOPER NOTE/i.test(text.characters)) continue;
      text.visible = false;
      mutated.add(text.id);
      count += 1;
    }
    return count;
  };

  for (const target of roots) {
    const { node: root, page, state, width, height } = target;
    if (imageAssetCount(root) === 0) throw new Error(`${target.id} 未发现可复用图像或矢量素材。`);
    root.resize(width, height);
    root.clipsContent = true;
    root.name = `DOSO / ${page} / ${state}`;
    root.setPluginData('dosoBatchAAlignVersion', '2026-08-31.1');
    root.setPluginData('dosoBatchAOriginalRootId', target.id);
    mutated.add(root.id);

    const commonCount = replaceText(root, HEADER);
    let pageCount = 0;
    let dateResult = { count: 0, selectedMoved: false };
    let stateFix = false;
    let safeAreaFix = null;
    let robotFix = null;
    if (page === 'main-routes') {
      pageCount = replaceText(root, ROUTES);
      pageCount += rebuildRouteCopy(root, state === 'dark');
      pageCount += alignRouteMapOpacity(root, state === 'dark');
      stateFix = disableRouteAction(root, state === 'dark');
      safeAreaFix = width > height ? alignRoutesLandscapeSafeArea(root) : { portrait: alignRoutesPortrait(root) };
    } else if (page === 'main-tasks') {
      pageCount = replaceText(root, TASKS);
      pageCount += rebuildTaskCopy(root, state === 'dark');
    } else {
      pageCount = replaceText(root, HOME);
      pageCount += rebuildHomeCopy(root, state === 'dark');
      stateFix = disableHomeRecall(root, state === 'dark');
      robotFix = alignHomeRobots(root);
    }
    const statusTexts = addStatusText(root, page, state);
    const navigationStateAligned = alignSelectedNavigationState(root);
    const hiddenAnnotations = hideDeveloperAnnotations(root);
    report.push({
      id: target.id,
      page,
      state,
      size: `${Math.round(root.width)}x${Math.round(root.height)}`,
      preservedRootId: root.id === target.id,
      reusedEditableAssetCount: imageAssetCount(root),
      textMutations: commonCount + pageCount,
      dateItems: dateResult.count,
      selectedDateMoved: dateResult.selectedMoved,
      stateFix,
      safeAreaFix,
      robotFix,
      statusTexts,
      navigationStateAligned,
      hiddenAnnotations,
    });
  }

  const forbidden = [
    /Ready to Control/i, /\bRunning\b/i, /32°C/, /12\/12/, /^34%?$/,
    /Route-[ABC]\d+/, /\b(?:15|18|24) min\b/i, /33% complete/i, /已完成 33%/,
    /3 missions are waiting for Thunder/i, /设备在线.*可开始控制/, /SAFE AREA|SOURCE SYNC|真实状态合同/i,
  ];
  const leaks = [];
  for (const { node: root, id } of roots) {
    for (const text of root.findAllWithCriteria({ types: ['TEXT'] })) {
      if (!text.visible || !forbidden.some((pattern) => pattern.test(normalize(text.characters)))) continue;
      leaks.push({ rootId: id, textId: text.id, value: text.characters });
    }
  }
  if (leaks.length) throw new Error(`仍有假状态或开发注释：${JSON.stringify(leaks)}`);
  if (report.some((item) => !item.preservedRootId || item.reusedEditableAssetCount === 0)) {
    throw new Error(`结构校验失败：${JSON.stringify(report)}`);
  }

  figma.currentPage.selection = roots.map(({ node }) => node);
  figma.viewport.scrollAndZoomIntoView(roots.map(({ node }) => node));
  const result = {
    marker: 'DOSO_BATCH_A_ALIGN_PASS',
    fileKey: 'ZDueCh91PDy5oyLKicv0zR',
    mutatedNodeIds: [...mutated],
    createdNodeIds: [...created],
    roots: report,
  };
  console.log(`DOSO_BATCH_A_ALIGN_PASS ${JSON.stringify(result)}`);
  figma.notify(`Batch A 已原位对齐：9/9 根 Frame，${mutated.size} 个节点`, { timeout: 8000 });
})();
