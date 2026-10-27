// Static audit for the ten UI criteria supplied by the product owner.
// It intentionally reports evidence; it does not rewrite UI or infer visual success.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoots = ['App.tsx', 'src'];
const files = [];
function walk(path) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const name of readdirSync(path).sort()) {
      if (!['node_modules', '.git', 'artifacts'].includes(name)) walk(join(path, name));
    }
  } else if (/\.(?:tsx?|jsx?)$/.test(path)) files.push(path);
}
for (const entry of sourceRoots) if (existsSync(join(root, entry))) walk(join(root, entry));

const rows = files.map(file => ({ path: relative(root, file).replaceAll('\\', '/'), text: readFileSync(file, 'utf8') }));
const matching = (pattern) => rows.flatMap(row => [...row.text.matchAll(pattern)].map(match => ({ path: row.path, value: match[0] })));
const middleDots = matching(/·/g);
const hexColors = matching(/#[0-9A-Fa-f]{3,8}\b/g);
const rgbaColors = matching(/rgba?\([^)]*\)/g);
const fontSizes = [...new Set(matching(/fontSize\s*:\s*([0-9]+(?:\.[0-9]+)?)/g).map(x => x.value.match(/([0-9]+(?:\.[0-9]+)?)/)?.[1]).filter(Boolean))].map(Number).sort((a, b) => a - b);
const borderWidths = [...new Set(matching(/borderWidth\s*:\s*([^,}]+)/g).map(x => x.value.replace(/^.*borderWidth\s*:\s*/, '').trim()))];
const borderRadii = [...new Set(matching(/borderRadius\s*:\s*([^,}]+)/g).map(x => x.value.replace(/^.*borderRadius\s*:\s*/, '').trim()))];
const shadows = matching(/shadow(?:Color|Opacity|Radius|Offset)|elevation\s*:/g);
const report = {
  generatedAt: new Date().toISOString(),
  scope: 'App.tsx and src production/design-qa TypeScript UI sources',
  criteria: {
    middleDotCopy: { status: middleDots.length ? 'needs_follow_up' : 'pass', count: middleDots.length, examples: middleDots.slice(0, 20) },
    redundantCopy: { status: 'manual_review_required', note: 'Static scan cannot decide whether a description is redundant without the flow context.' },
    copyAudienceFit: { status: 'manual_review_required', note: 'Review copy by screen and user goal.' },
    radixColors: { status: hexColors.length || rgbaColors.length ? 'needs_follow_up' : 'pass', hexLiteralCount: hexColors.length, rgbaLiteralCount: rgbaColors.length, examples: [...hexColors, ...rgbaColors].slice(0, 30) },
    opticalAlignment: { status: 'manual_review_required', note: 'Requires accepted screenshots at portrait and G20 landscape sizes.' },
    hairlineBorders: { status: borderWidths.some(x => !/hairline|0\.5/.test(x)) ? 'needs_follow_up' : 'pass', distinctValues: borderWidths },
    restrainedMotion: { status: 'manual_review_required', note: 'Review animation declarations and interaction timing separately.' },
    typeScale: { status: fontSizes.length > 4 ? 'needs_follow_up' : 'pass', distinctFontSizes: fontSizes, count: fontSizes.length, minimum: Math.min(...fontSizes) },
    interactionHierarchy: { status: 'manual_review_required', note: 'Requires task-flow review, not a token scan.' },
    restrainedShape: { status: borderRadii.length > 6 || shadows.length > 0 ? 'needs_follow_up' : 'pass', distinctRadii: borderRadii.slice(0, 60), shadowTokenCount: shadows.length },
  },
};
const reportDir = join(root, 'artifacts', 'ui-audit', '20261024-criteria');
writeFileSync(join(reportDir, 'criteria-audit.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'w' });
console.log(JSON.stringify({
  middleDotCopy: report.criteria.middleDotCopy,
  radixColors: report.criteria.radixColors,
  typeScale: report.criteria.typeScale,
  hairlineBorders: report.criteria.hairlineBorders,
  restrainedShape: report.criteria.restrainedShape,
  evidencePath: 'artifacts/ui-audit/20261024-criteria/criteria-audit.json',
}));
