// Read-only live verifier for the canonical figma-source-sync-scripter-min.js output.
// Paste into the community Figma "Scripter" plugin after generation.

await (async () => {
const SECTION_NAME = 'DOSO · Source Sync · 11 Pages × 3 States';
const COLLECTION_PREFIX = 'DOSO / Source Sync Theme / 2026-08-30.1';
const PAGES = [
  ['auth-email-otp', '邮箱验证码'],
  ['auth-forgot-password', '找回密码'],
  ['auth-reset-password', '重置或修改密码'],
  ['auth-username', '设置用户名'],
  ['auth-display-name', '确认显示名称'],
  ['auth-mfa', '管理员双重验证'],
  ['device-bind', '绑定机器人'],
  ['device-ble-discovery', '附近 BLE 设备'],
  ['device-provisioning', '蓝牙或 Wi-Fi 安全配网', true],
  ['device-firmware', '固件更新与回滚', true],
  ['account-security', '账号与安全'],
];
const REQUIRED_VARIABLES = [
  'background', 'surface', 'subtle', 'text', 'muted', 'border',
  'accent', 'accentText', 'accentInk', 'warning', 'dangerSurface', 'dangerText',
];
const errors = [];
const fail = (message) => errors.push(message);

const sections = figma.currentPage.children.filter((node) => node.type === 'SECTION' && node.name === SECTION_NAME);
if (sections.length !== 1) throw new Error(`Expected one ${SECTION_NAME} Section; found ${sections.length}`);
const section = sections[0];

if (section.width !== 1784 || section.height !== 10330 || section.y !== 0) fail('section geometry');
if (section.children.length !== 33 || section.children.some((node) => node.type !== 'FRAME')) fail('33 direct frames');
if (new Set(section.children.map((node) => node.id)).size !== 33) fail('duplicate child IDs');
if (section.getPluginData('source') !== 'doso-app/scripts/figma-source-sync-scripter-min.js') fail('section source');
if (section.getPluginData('contractVersion') !== '2026-08-30.1') fail('section contractVersion');
if (section.getPluginData('createdFrameCount') !== '33') fail('section count pluginData');

const fallback = section.getPluginData('themeModeFallback') === 'true';
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const lightCollectionId = section.getPluginData('themeCollectionId');
const darkCollectionId = section.getPluginData('darkThemeCollectionId');
let historicalThemeCollectionIds = [];
try {
  historicalThemeCollectionIds = JSON.parse(section.getPluginData('historicalThemeCollectionIds') || '[]');
} catch (_error) {
  fail('historical theme collection IDs JSON');
}
if (!Array.isArray(historicalThemeCollectionIds) || historicalThemeCollectionIds.some((value) => typeof value !== 'string')) {
  fail('historical theme collection IDs shape');
  historicalThemeCollectionIds = [];
}
const lightCollection = collections.find((collection) => collection.id === lightCollectionId);
const darkCollection = collections.find((collection) => collection.id === darkCollectionId);
if (!lightCollection || !lightCollection.name.startsWith(`${COLLECTION_PREFIX} / `)) fail('owned Light collection');
if (!darkCollection || !darkCollection.name.startsWith(`${COLLECTION_PREFIX} / `)) fail('owned Dark collection');
if (fallback && lightCollectionId === darkCollectionId) fail('fallback collection identity');
if (!fallback && lightCollectionId !== darkCollectionId) fail('shared collection identity');
const lightMode = lightCollection && lightCollection.modes.find((mode) => mode.name === 'Light');
const darkMode = darkCollection && darkCollection.modes.find((mode) => mode.name === 'Dark');
if (!lightMode || !darkMode) fail('Light/Dark modes');

async function variablesFor(collection) {
  const variables = collection
    ? await Promise.all(collection.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)))
    : [];
  return variables.filter(Boolean);
}

const lightVariables = await variablesFor(lightCollection);
const darkVariables = darkCollection === lightCollection
  ? lightVariables
  : await variablesFor(darkCollection);
for (const [label, variables] of [['light', lightVariables], ['dark', darkVariables]]) {
  if (variables.length !== 12) fail(`${label} variable count ${variables.length}`);
  for (const key of REQUIRED_VARIABLES) {
    if (!variables.find((variable) => variable.name === `color/${key}`)) fail(`${label} missing color/${key}`);
  }
}

function fillVariableId(node) {
  const paint = node.fills && node.fills[0];
  return paint && paint.boundVariables && paint.boundVariables.color
    ? paint.boundVariables.color.id
    : '';
}

function variableId(variables, key) {
  const variable = variables.find((item) => item.name === `color/${key}`);
  return variable ? variable.id : '';
}

function textValue(frame, nodeName) {
  if (!frame) return '';
  const node = frame.findOne((candidate) => candidate.type === 'TEXT' && candidate.name === nodeName);
  return node && node.type === 'TEXT' ? node.characters : '';
}

const frameNodes = [];
for (let index = 0; index < PAGES.length; index += 1) {
  const [pageId, title, unavailable = false] = PAGES[index];
  const y = 50 + index * 930;
  const variants = [
    ['Light', 40, 390, 844],
    ['Dark', 470, 390, 844],
    ['Landscape', 900, 844, 390],
  ];
  for (const [variant, x, width, height] of variants) {
    const name = `${pageId} · ${title} · ${variant}`;
    const frame = section.children.find((node) => node.name === name);
    if (!frame) {
      fail(`missing ${name}`);
      continue;
    }
    frameNodes.push({ id: frame.id, pageId, variant });
    if (frame.x !== x || frame.y !== y || frame.width !== width || frame.height !== height) fail(`geometry ${name}`);
    if (
      frame.getPluginData('dosoPageId') !== pageId
      || frame.getPluginData('dosoVariant') !== variant
      || !frame.getPluginData('truthContract')
    ) fail(`pluginData ${name}`);

    const collection = variant === 'Dark' ? darkCollection : lightCollection;
    const mode = variant === 'Dark' ? darkMode : lightMode;
    const variables = variant === 'Dark' ? darkVariables : lightVariables;
    if (collection && mode && frame.explicitVariableModes[collection.id] !== mode.modeId) fail(`explicit mode ${name}`);
    if (fillVariableId(frame) !== variableId(variables, 'background')) fail(`background binding ${name}`);

    if (variant === 'Landscape') {
      if (frame.getPluginData('landscapeGrid') !== 'safe 20 / 392 / gap 20 / 392 / safe 20') fail(`grid pluginData ${name}`);
      const primary = frame.children.find((node) => node.name === 'Content / Landscape Primary');
      const detail = frame.children.find((node) => node.name === 'Landscape / Detail');
      if (
        !primary || !detail
        || primary.x !== 20 || primary.y !== 20 || primary.width !== 392 || primary.height !== 350
        || detail.x !== 432 || detail.y !== 20 || detail.width !== 392 || detail.height !== 350
      ) fail(`landscape structure ${name}`);
    } else {
      if (
        frame.paddingLeft !== 20 || frame.paddingRight !== 20
        || frame.paddingTop !== 44 || frame.paddingBottom !== 34
      ) fail(`safe padding ${name}`);
      if (frame.children.map((node) => node.name).join('|') !== 'Safe Area / Top|Content / Portrait|Safe Area / Bottom') {
        fail(`portrait structure ${name}`);
      }
    }
    if (unavailable) {
      if (frame.getPluginData('productState') !== 'unavailable') fail(`unavailable pluginData ${name}`);
      if (!frame.findOne((node) => node.type === 'FRAME' && node.name === 'Demo Banner')) fail(`Demo Banner ${name}`);
      const blockedState = frame.findOne((node) => node.type === 'FRAME' && node.name === 'Blocked State');
      if (!blockedState) fail(`Blocked State ${name}`);
      if (variant === 'Landscape' && blockedState && (blockedState.width !== 392 || blockedState.height !== 160)) fail(`landscape blocked card ${name}`);
      if (frame.findAll((node) => node.type === 'FRAME' && (node.name.indexOf('Field / ') === 0 || node.name.indexOf('Action / ') === 0)).length) {
        fail(`unavailable controls ${name}`);
      }
    }
  }
}

const lightFrame = (pageId) => section.children.find((node) => node.getPluginData('dosoPageId') === pageId && node.getPluginData('dosoVariant') === 'Light');
if (textValue(lightFrame('auth-email-otp'), 'Subtitle') !== '验证邮箱，继续当前 DOSO 账户流程') fail('OTP purpose copy');
if (textValue(lightFrame('auth-forgot-password'), 'Subtitle') !== '提交后进入验证码页，不泄露账户是否存在') fail('recovery transition copy');
if (textValue(lightFrame('auth-mfa'), 'Truthful Status') !== '会话权限与 MFA 状态读取中') fail('MFA loading copy');
if (textValue(lightFrame('account-security'), 'Truthful Status') !== '真实账户状态读取中 · 操作禁用') fail('account loading copy');
if (textValue(lightFrame('device-provisioning'), 'Demo Title') !== '开发演示') fail('provisioning demo banner');
if (textValue(lightFrame('device-firmware'), 'Blocked Title') !== '硬件连接尚未开放') fail('firmware blocked state');

const fields = section.findAll((node) => node.type === 'FRAME' && node.name.indexOf('Field / ') === 0);
const actions = section.findAll((node) => node.type === 'FRAME' && (node.name === 'Action / Disabled' || node.name === 'Action / Available'));
if (fields.length !== 81) fail(`field rows ${fields.length}`);
if (
  actions.length !== 27
  || actions.filter((node) => node.name === 'Action / Disabled').length !== 6
  || actions.filter((node) => node.name === 'Action / Available').length !== 21
) fail('actions');

const report = {
  pass: errors.length === 0,
  errors,
  section: {
    id: section.id,
    name: section.name,
    size: [section.width, section.height],
    children: section.children.length,
    pluginData: {
      source: section.getPluginData('source'),
      contractVersion: section.getPluginData('contractVersion'),
      themeCollectionId: lightCollectionId,
      darkThemeCollectionId: darkCollectionId,
      historicalThemeCollectionIds,
      themeModeFallback: section.getPluginData('themeModeFallback'),
      createdFrameCount: section.getPluginData('createdFrameCount'),
    },
  },
  counts: {
    frames: section.children.length,
    fields: fields.length,
    disabledActions: actions.filter((node) => node.name === 'Action / Disabled').length,
    availableActions: actions.filter((node) => node.name === 'Action / Available').length,
  },
  frameNodes,
  historicalCollections: historicalThemeCollectionIds.map((id) => {
    const collection = collections.find((item) => item.id === id);
    return { id, name: collection ? collection.name : '已由维护者删除' };
  }),
  collections: [lightCollection, darkCollection]
    .filter((collection, index, list) => collection && list.findIndex((item) => item && item.id === collection.id) === index)
    .map((collection) => ({
      id: collection.id,
      name: collection.name,
      modes: collection.modes.map((mode) => mode.name),
      variableCount: collection.variableIds.length,
    })),
};
if (typeof print === 'function') print(report);
return report;
})();
