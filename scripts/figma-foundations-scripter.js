// DOSO Phase 1 foundations sync. Run in the editable DOSO Figma copy with Scripter.
await (async () => {
  const COLLECTIONS = {
    light: 'DOSO / Source Sync Theme / 2026-08-30.1 / 1788030368833',
    dark: 'DOSO / Source Sync Theme / 2026-08-30.1 / Dark / 1788030368833',
  };
  const TOKENS = {
    background: ['#FFFFFF', '#0E1116', ['FRAME_FILL']],
    surface: ['#F5F7FB', '#1A2028', ['FRAME_FILL', 'SHAPE_FILL']],
    surfaceStrong: ['#EAEDF8', '#25303A', ['FRAME_FILL', 'SHAPE_FILL']],
    ink: ['#050808', '#F7F9FC', ['TEXT_FILL']],
    inkSoft: ['#373737', '#D8DEE7', ['TEXT_FILL']],
    muted: ['#7B7B7B', '#96A1AD', ['TEXT_FILL']],
    line: ['#E2E6F0', '#65707C8C', ['STROKE_COLOR']],
    navStart: ['#0B2026', '#071719', ['FRAME_FILL', 'SHAPE_FILL']],
    navEnd: ['#154726', '#0D4328', ['FRAME_FILL', 'SHAPE_FILL']],
    mint: ['#3FFFDF', '#3FFFDF', ['FRAME_FILL', 'SHAPE_FILL']],
    green: ['#56FD5E', '#56FD5E', ['FRAME_FILL', 'SHAPE_FILL']],
    greenStrong: ['#2FEA6D', '#37F28A', ['FRAME_FILL', 'SHAPE_FILL']],
    greenDark: ['#043026', '#043026', ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL']],
    successText: ['#157A4F', '#59E8A0', ['TEXT_FILL']],
    danger: ['#FF6F78', '#FF7F89', ['FRAME_FILL', 'SHAPE_FILL']],
    dangerText: ['#B52E42', '#FF9BA4', ['TEXT_FILL']],
    dangerSurface: ['#FFF2F3', '#381D23', ['FRAME_FILL', 'SHAPE_FILL']],
    authBackground: ['#FCFCFD', '#0E1116', ['FRAME_FILL']],
    authBorder: ['#D0D5DD', '#65707C', ['STROKE_COLOR']],
    authFocus: ['#187454', '#63DFAF', ['STROKE_COLOR']],
    authPrimary: ['#63DFAF', '#63DFAF', ['FRAME_FILL', 'SHAPE_FILL']],
  };
  const LEGACY_NAMES = {
    surfaceStrong: 'color/subtle',
    ink: 'color/text',
    line: 'color/border',
    green: 'color/accent',
    successText: 'color/accentText',
    greenDark: 'color/accentInk',
  };
  const rgba = (hex) => {
    const clean = hex.slice(1);
    return {
      r: parseInt(clean.slice(0, 2), 16) / 255,
      g: parseInt(clean.slice(2, 4), 16) / 255,
      b: parseInt(clean.slice(4, 6), 16) / 255,
      a: clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1,
    };
  };
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const localVariables = await figma.variables.getLocalVariablesAsync();
  const touched = [];

  for (const [scheme, collectionName] of Object.entries(COLLECTIONS)) {
    const collection = collections.find((candidate) => candidate.name === collectionName);
    if (!collection) throw new Error(`Missing exact DOSO collection: ${collectionName}`);
    if (collection.modes.length !== 1) throw new Error(`${collectionName} must keep one Starter-plan mode`);
    const modeId = collection.modes[0].modeId;
    const byName = new Map(localVariables
      .filter((variable) => variable.variableCollectionId === collection.id)
      .map((variable) => [variable.name, variable]));

    for (const [name, [light, dark, scopes]] of Object.entries(TOKENS)) {
      const canonicalName = `color/${name}`;
      let variable = byName.get(canonicalName);
      if (!variable && LEGACY_NAMES[name]) variable = byName.get(LEGACY_NAMES[name]);
      if (!variable) variable = figma.variables.createVariable(canonicalName, collection, 'COLOR');
      if (variable.resolvedType !== 'COLOR') throw new Error(`${canonicalName} is not COLOR`);
      variable.name = canonicalName;
      variable.scopes = scopes;
      variable.setValueForMode(modeId, rgba(scheme === 'dark' ? dark : light));
      variable.setVariableCodeSyntax('WEB', `var(--doso-${name})`);
      variable.setVariableCodeSyntax('ANDROID', `theme.${name}`);
      variable.setVariableCodeSyntax('iOS', `theme.${name}`);
      touched.push(`${scheme}:${canonicalName}`);
    }
    const warning = byName.get('color/warning');
    if (warning) {
      warning.scopes = ['TEXT_FILL'];
      warning.setVariableCodeSyntax('WEB', 'var(--doso-warning)');
      warning.setVariableCodeSyntax('ANDROID', 'theme.warning');
      warning.setVariableCodeSyntax('iOS', 'theme.warning');
    }
  }

  const available = await figma.listAvailableFontsAsync();
  const family = ['Inter', 'Noto Sans SC', 'Roboto'].find((name) => available.some((item) => item.fontName.family === name))
    || available[0]?.fontName.family;
  if (!family) throw new Error('No usable Figma font available');
  const familyFonts = available.filter((item) => item.fontName.family === family).map((item) => item.fontName);
  const font = (pattern) => familyFonts.find((item) => pattern.test(item.style)) || familyFonts[0];
  const regular = font(/regular|normal|book/i);
  const semibold = font(/semi.?bold|medium/i);
  const bold = font(/bold|heavy/i);
  await Promise.all([regular, semibold, bold].map((item) => figma.loadFontAsync(item)));

  const textDefinitions = [
    ['DOSO/Title', bold, 30, 38, -0.6],
    ['DOSO/Body', regular, 14, 20, 0],
    ['DOSO/Label', semibold, 12, 16, 0],
  ];
  const textStyles = await figma.getLocalTextStylesAsync();
  for (const [name, fontName, size, lineHeight, letterSpacing] of textDefinitions) {
    let style = textStyles.find((candidate) => candidate.name === name);
    if (!style) style = figma.createTextStyle();
    style.name = name;
    style.fontName = fontName;
    style.fontSize = size;
    style.lineHeight = { value: lineHeight, unit: 'PIXELS' };
    style.letterSpacing = { value: letterSpacing, unit: 'PIXELS' };
  }

  const effectStyles = await figma.getLocalEffectStylesAsync();
  let cardShadow = effectStyles.find((candidate) => candidate.name === 'DOSO/Card');
  if (!cardShadow) cardShadow = figma.createEffectStyle();
  cardShadow.name = 'DOSO/Card';
  cardShadow.effects = [{
    type: 'DROP_SHADOW',
    color: { r: 27 / 255, g: 82 / 255, b: 64 / 255, a: 0.08 },
    offset: { x: 0, y: 10 },
    radius: 18,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL',
  }];

  const verifyCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const verifyVariables = await figma.variables.getLocalVariablesAsync();
  const verification = Object.entries(COLLECTIONS).map(([scheme, collectionName]) => {
    const collection = verifyCollections.find((candidate) => candidate.name === collectionName);
    const variables = verifyVariables.filter((variable) => variable.variableCollectionId === collection.id);
    const missing = Object.keys(TOKENS).filter((name) => !variables.some((variable) => variable.name === `color/${name}`));
    const invalid = variables.filter((variable) => variable.name.startsWith('color/') && (!variable.scopes.length || !variable.codeSyntax.WEB));
    return { scheme, collectionId: collection.id, variableCount: variables.length, missing, invalid: invalid.map((item) => item.name) };
  });
  if (verification.some((item) => item.missing.length || item.invalid.length)) throw new Error(JSON.stringify(verification));
  console.log(JSON.stringify({ status: 'DOSO_FOUNDATIONS_PASS', touched: touched.length, verification }, null, 2));
})();
