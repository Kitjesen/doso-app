const EXPECTED_PROCESS = 'com.doso.robot.qa';
const MAX_DUMP_BYTES = 2 * 1024 * 1024;
const ALLOWED_MARKERS = new Set([
  'android:id/aerr_wait',
  'android:id/aerr_close',
  'android:id/aerr_restart',
  'android:id/aerr_report',
]);

const unknown = () => ({
  windowKind: 'unknown',
  expectedTitleMatch: 'unknown',
  rawValuesRetained: false,
});

export function classifyErrorWindow(input) {
  try {
    return classifyValidated(input);
  } catch {
    return unknown();
  }
}

function classifyValidated(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return unknown();
  if (Object.keys(input).sort().join(',') !== 'displayDump,expectedProcessKnown,markerIds,windowDump') return unknown();
  if (typeof input.displayDump !== 'string' || typeof input.windowDump !== 'string' || !Array.isArray(input.markerIds)
    || typeof input.expectedProcessKnown !== 'boolean' || !input.expectedProcessKnown) return unknown();
  if ([input.displayDump, input.windowDump].some(dump => Buffer.byteLength(dump, 'utf8') > MAX_DUMP_BYTES
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(dump))) return unknown();
  if (input.markerIds.some(marker => typeof marker !== 'string' || !ALLOWED_MARKERS.has(marker))
    || new Set(input.markerIds).size !== input.markerIds.length) return unknown();

  const displayLines = input.displayDump.split(/\r?\n/u);
  const windowLines = input.windowDump.split(/\r?\n/u);
  const displayHeaders = indexesOf(displayLines, /^WINDOW MANAGER DISPLAY CONTENTS \(dumpsys window displays\)$/u);
  const windowHeaders = indexesOf(windowLines, /^WINDOW MANAGER WINDOWS \(dumpsys window windows\)$/u);
  if (displayHeaders.length !== 1 || windowHeaders.length !== 1
    || displayLines.some(line => (/^WINDOW MANAGER /u.test(line)
      && !/^WINDOW MANAGER DISPLAY CONTENTS \(dumpsys window displays\)$/u.test(line)) || /^\s*Window #/u.test(line))
    || windowLines.some(line => /^WINDOW MANAGER DISPLAY CONTENTS/u.test(line) || /^\s*mCurrentFocus=/u.test(line))) return unknown();

  const focusPattern = /^  mCurrentFocus=Window\{([0-9A-Fa-f]+) u(\d+) (.+)\}$/u;
  if (displayLines.filter(line => /^\s*mCurrentFocus=/u.test(line)).length !== 1) return unknown();
  const focusMatches = displayLines.map((line, index) => ({ index, match: focusPattern.exec(line) }))
    .filter(entry => entry.match);
  if (focusMatches.length !== 1 || focusMatches[0].index <= displayHeaders[0]
    || focusMatches[0].match[2] !== '0') return unknown();
  const [, focusedId, , focusedTitle] = focusMatches[0].match;

  const windowsEnd = windowLines.findIndex((line, index) => index > windowHeaders[0] && /^WINDOW MANAGER (?!WINDOWS)/u.test(line));
  const windowsLines = windowLines.slice(windowHeaders[0] + 1, windowsEnd === -1 ? windowLines.length : windowsEnd + 1);
  const blockPattern = /^  Window #\d+ Window\{([0-9A-Fa-f]+) u(\d+) (.+)\}:$/u;
  if (windowsLines.some(line => /^\s*Window #/u.test(line) && !blockPattern.test(line))) return unknown();
  const blocks = [];
  for (let index = 0; index < windowsLines.length; index += 1) {
    const header = blockPattern.exec(windowsLines[index]);
    if (!header) continue;
    let end = index + 1;
    while (end < windowsLines.length && !blockPattern.test(windowsLines[end])
      && !/^WINDOW MANAGER /u.test(windowsLines[end])) end += 1;
    blocks.push({
      id: header[1],
      user: header[2],
      title: header[3],
      lines: windowsLines.slice(index + 1, end),
      terminated: end < windowsLines.length,
    });
  }
  const matchingBlocks = blocks.filter(block => block.id === focusedId && block.title === focusedTitle);
  const sameIdBlocks = blocks.filter(block => block.id === focusedId);
  if (matchingBlocks.length !== 1 || sameIdBlocks.length !== 1 || matchingBlocks[0].user !== '0'
    || !matchingBlocks[0].terminated) return unknown();
  const ownerPattern = /^    mOwnerUid=1000 showForAllUsers=(?:true|false) package=android appop=(?:NONE|[A-Z][A-Z_]*)$/u;
  const ownerLines = matchingBlocks[0].lines.filter(line => /^\s*mOwnerUid=/u.test(line));
  if (ownerLines.length !== 1 || !ownerPattern.test(ownerLines[0])) return unknown();

  const title = classifyTitle(focusedTitle);
  if (!title) return unknown();
  const markers = new Set(input.markerIds);
  if (title.windowKind === 'anr-title' && (!markers.has('android:id/aerr_wait') || markers.has('android:id/aerr_restart'))) return unknown();
  if (title.windowKind === 'app-error-title' && (!markers.has('android:id/aerr_restart') || markers.has('android:id/aerr_wait'))) return unknown();
  return title;
}

function indexesOf(lines, pattern) {
  const indexes = [];
  lines.forEach((line, index) => { if (pattern.test(line)) indexes.push(index); });
  return indexes;
}

function classifyTitle(title) {
  const match = /^(Application Not Responding|Application Error): ([A-Za-z0-9_.:]+)$/u.exec(title);
  if (!match) return null;
  return {
    windowKind: match[1] === 'Application Not Responding' ? 'anr-title' : 'app-error-title',
    expectedTitleMatch: match[2] === EXPECTED_PROCESS ? 'match' : 'not-confirmed',
    rawValuesRetained: false,
  };
}
