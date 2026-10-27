(async () => {
  const replacements = new Map([
    ['Thunder', 'THUNDER 01'],
    ['THUNDER', 'THUNDER 01'],
    ['Ready to Control', '设备已离线 · 运动协议未接入'],
    ['34', '—'],
    ['34%', '—'],
    ['%', ''],
    ['Battery', '电量'],
    ['12/12', '待同步'],
    ['Sensors', '传感器'],
    ['32°C', '待同步'],
    ['Temperature', '温度'],
    ['Running', '待同步'],
    ['Motor', '电机'],
    ['Control', '控制预览'],
    ['Quick actions', '快捷操作'],
    ['Recall', '召回'],
    ['Return to base station', '待可信执行通道'],
    ['Start Patrol', '巡航模板'],
    ['Begin autonomous patrol mode', '预览路线与环境模板'],
    ['Run Mission', '任务模板'],
    ['Execute a assigned mission', '预览任务编排模板'],
    ['Device Safety', '设备安全'],
    ['Check system health & locks', '查看系统状态与安全'],
  ]);

  const normalize = (value) => value.replace(/\s+/g, ' ').trim();
  const relativeBox = (node, frame) => ({
    x: node.absoluteTransform[0][2] - frame.absoluteTransform[0][2],
    y: node.absoluteTransform[1][2] - frame.absoluteTransform[1][2],
    width: node.width,
    height: node.height,
  });

  const frames = figma.currentPage.findAll((node) => {
    if (node.type !== 'FRAME') return false;
    const size = `${Math.round(node.width)}x${Math.round(node.height)}`;
    if (size !== '390x844' && size !== '844x390') return false;
    return Boolean(node.findOne((child) => child.type === 'TEXT' && replacements.has(normalize(child.characters))));
  });
  if (frames.length === 0) throw new Error('未找到首页三态 Frame');

  const texts = frames.flatMap((frame) => frame.findAll((node) => node.type === 'TEXT'));
  const fonts = new Map();
  for (const text of texts) {
    for (const segment of text.getStyledTextSegments(['fontName'])) {
      fonts.set(`${segment.fontName.family}\u0000${segment.fontName.style}`, segment.fontName);
    }
  }
  await Promise.all([...fonts.values()].map((font) => figma.loadFontAsync(font)));

  const mutated = [];
  for (const text of texts) {
    const next = replacements.get(normalize(text.characters));
    if (next === undefined || next === text.characters) continue;
    text.characters = next;
    mutated.push(text.id);
  }

  for (const frame of frames) {
    if (Math.round(frame.width) === 844 && Math.round(frame.height) === 390) {
      const candidates = frame.findAll((node) => 'width' in node && 'height' in node && 'x' in node);
      const statusCard = candidates.find((node) => {
        const box = relativeBox(node, frame);
        return box.x >= 10 && box.x <= 35 && box.y >= 90 && box.y <= 115
          && box.width >= 315 && box.width <= 340 && box.height >= 250 && box.height <= 280;
      });
      if (statusCard) {
        statusCard.x += 48;
        statusCard.y += 6;
        if ('resize' in statusCard) statusCard.resize(327, statusCard.height);
        mutated.push(statusCard.id);
      }

      const recallSurface = candidates.find((node) => {
        const box = relativeBox(node, frame);
        return box.x >= 370 && box.x <= 410 && box.y >= 105 && box.y <= 135
          && box.width >= 330 && box.width <= 350 && box.height >= 65 && box.height <= 90;
      });
      if (recallSurface) {
        recallSurface.x += 48;
        if ('resize' in recallSurface) recallSurface.resize(321, recallSurface.height);
        mutated.push(recallSurface.id);
      }

      const quickCards = candidates
        .filter((node) => {
          const box = relativeBox(node, frame);
          return box.x >= 370 && box.x <= 650 && box.y >= 225 && box.y <= 265
            && box.width >= 90 && box.width <= 115 && box.height >= 115 && box.height <= 135;
        })
        .sort((a, b) => relativeBox(a, frame).x - relativeBox(b, frame).x)
        .slice(0, 3);
      const targetXs = [437, 549, 660];
      const targetWidths = [98, 97, 98];
      quickCards.forEach((card, index) => {
        const box = relativeBox(card, frame);
        card.x += targetXs[index] - box.x;
        if ('resize' in card) card.resize(targetWidths[index], card.height);
        mutated.push(card.id);
      });

      const quickHeading = frame.findOne((node) => node.type === 'TEXT' && node.characters === '快捷操作');
      if (quickHeading) {
        const box = relativeBox(quickHeading, frame);
        if (box.x >= 370 && box.x <= 410) {
          quickHeading.x += 47;
          mutated.push(quickHeading.id);
        }
      }
    }

    const recallText = frame.findOne((node) => node.type === 'TEXT' && node.characters === '召回');
    let recallCard = recallText?.parent ?? null;
    while (recallCard && recallCard !== frame) {
      if ('width' in recallCard && recallCard.width >= 250 && recallCard.height >= 60 && recallCard.height <= 110) break;
      recallCard = recallCard.parent;
    }
    if (!recallCard || recallCard === frame || !('opacity' in recallCard)) continue;
    recallCard.opacity = 0.66;
    mutated.push(recallCard.id);
    if (!('findAll' in recallCard)) continue;
    for (const node of recallCard.findAll((child) => (
      'width' in child
      && child.width >= 38
      && child.width <= 48
      && child.height >= 38
      && child.height <= 48
      && 'fills' in child
      && Array.isArray(child.fills)
    ))) {
      node.fills = [{ type: 'SOLID', color: { r: 0.78, g: 0.82, b: 0.8 } }];
      mutated.push(node.id);
    }
  }

  figma.currentPage.selection = frames;
  figma.viewport.scrollAndZoomIntoView(frames);
  figma.notify(`首页产品真值已同步：${frames.length} 帧，${mutated.length} 个节点`, { timeout: 8000 });
})();
