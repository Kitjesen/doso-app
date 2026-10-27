import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const screen = await readFile(new URL('../src/screens/ModelSelectScreen.tsx', import.meta.url), 'utf8');
const models = await readFile(new URL('../src/models.ts', import.meta.url), 'utf8');

assert.match(screen, /useAppTheme\(\)/, 'model selection uses the shared dynamic theme');
assert.match(screen, /useWindowDimensions\(\)/, 'model selection responds to the live viewport');
assert.match(screen, /const isLandscape = width > height;/, 'model selection has an explicit orientation boundary');
assert.match(screen, /onLayout=\{handleLayout\}/, 'model selection measures the post-safe-area viewport');
assert.match(screen, /getModelSelectLayoutMetrics\(\{ containerWidth, isLandscape, largeText \}\)/, 'responsive layout and large text fallback are delegated to a pure helper');
assert.match(screen, /edges=\{\['top', 'left', 'right', 'bottom'\]\}/, 'portrait and landscape both respect every physical safe-area edge');
assert.match(screen, /layout\.usesColumns \? \(/, 'wide landscape has a dedicated two-column branch');
assert.match(screen, /leftColumn:[^\n]*width: leftColumnWidth/, 'landscape left column uses the measured width');
assert.match(screen, /rightColumn:[^\n]*width: rightColumnWidth/, 'landscape right column uses the measured width');
assert.match(screen, /landscapeGrid:[\s\S]*?flexDirection: 'row'[\s\S]*?gap: gridGap/, 'landscape uses a real measured two-column grid');
assert.doesNotMatch(screen, /margin(?:Left|Right|Top|Bottom)\s*:\s*-|translate[XY]\s*:\s*-/i, 'layout never bypasses physical safe-area insets');

assert.doesNotMatch(screen, /modelGrid(?:Light|Dark|Landscape)|modelControls(?:Light|Dark|Landscape)/, 'the screen no longer renders full-page Figma control bitmaps');
assert.doesNotMatch(screen, /reference(?:Grid|ModelHit|Controls)/, 'the screen has no transparent reference-image hotspot path');
assert.doesNotMatch(screen, /useReferenceGrid|referenceRects/, 'the default state cannot switch into a second visual implementation');
assert.match(screen, /filteredModels\.map\(\(model\) =>/, 'all states render the same native model-card tree');
assert.match(screen, /source=\{model\.image\}/, 'native cards retain the original robot artwork');
assert.match(screen, /selected \? \([\s\S]*?styles\.selectedBadge[\s\S]*?\) : null/, 'only the selected model renders a check badge');
assert.doesNotMatch(screen, /unselectedBadge/, 'unselected models never imply selection with a check');
assert.match(screen, /const selectedCardSurface = p\.action/, 'selected cards use the shared sky emphasis');
assert.match(screen, /cardSelected: \{ backgroundColor: selectedCardSurface \}/, 'selected cards have no decorative outline');
assert.match(screen, /filterChipActive: \{ backgroundColor: p\.action/, 'active filters use the shared sky emphasis');
assert.match(screen, /continueButton: \{[^\n]*backgroundColor: p\.action/, 'the primary action uses the shared product token');
assert.match(screen, /selectedText: \{ color: p\.actionInk \}/, 'text on the sky selection uses its dark paired ink');
assert.match(screen, /continueLabel: \{ \.\.\.typography\.label, color: p\.actionInk/, 'the primary action also uses paired ink');
assert.doesNotMatch(screen, /LinearGradient|#56FD5E|#3FFFDF|#43F2A5|#28BC85/, 'model selection no longer mixes legacy green gradients into the blue product system');

assert.match(screen, /step === 0 && styles\.progressActive/, 'only the first progress segment is active');
assert.doesNotMatch(screen, /step < 2/, 'the page does not falsely render two completed steps');
assert.match(screen, /roundButton:[\s\S]*?height: 48[\s\S]*?width: 48/, 'back action has a 48dp touch target');
assert.match(screen, /skipButton:[^\n]*minHeight: 48[^\n]*minWidth: 48/, 'skip action has a 48dp touch target');
assert.match(screen, /clearButton:[^\n]*height: 48[^\n]*width: 48/, 'clear-search action has a 48dp touch target');
assert.match(screen, /filterHitBox:[^\n]*minHeight: 48/, 'each visually compact filter retains a 48dp hit box');
assert.match(screen, /continueButton:[^\n]*height: 52/, 'primary action exceeds the cross-platform minimum touch target');
assert.match(screen, /searchInput:[^\n]*typography\.label/, 'search input uses the readable 15/22 product label role');
assert.match(screen, /numberOfLines=\{2\}[\s\S]*?style=\{\[styles\.modelName, selected && styles\.selectedText\]\}/, 'model names may wrap instead of becoming indistinguishable ellipses');
assert.match(screen, /modelName:[^\n]*typography\.label[^\n]*minHeight: 44/, 'model names reserve two 22dp lines without shrinking');
assert.doesNotMatch(screen, /adjustsFontSizeToFit|minimumFontScale/, 'model names are never shrunk to preserve a cramped column count');
assert.match(screen, /modelDescription:[\s\S]*?typography\.supporting/, 'descriptions use the same readable 13/20 role in both orientations');
assert.match(screen, /previewNotice:[\s\S]*?typography\.supporting/, 'non-binding model-selection disclosure remains legible');
assert.match(screen, /card: \{[\s\S]*?borderRadius: cardLayout\.radius,[\s\S]*?minHeight: cardHeight/, 'cards keep the responsive minimum and shared geometry');
assert.doesNotMatch(screen, /height: largeText \? undefined : cardHeight/, 'content growth is not clipped by the old fixed card height');

assert.match(screen, /accessibilityState=\{\{ disabled: busy, selected \}\}/, 'cards expose busy and selected states');
assert.match(screen, /disabled=\{busy\}/, 'busy interactions are actually disabled');
assert.match(screen, /const continueDisabled = busy \|\| visibleSelectedModel === null/, 'continue fails closed when the selection is filtered out');
assert.match(screen, /disabled=\{continueDisabled\}/, 'continue is disabled for busy, hidden-selection and empty-result states');
assert.match(screen, /const busyRef = useRef\(busy\)/, 'the latest busy state is retained across stale press handlers');
assert.match(screen, /if \(!busyRef\.current && visibleSelectedModel\)[\s\S]*?onContinue\(visibleSelectedModel\)/, 'continue can submit only a visible model while the current screen is idle');
assert.match(screen, /const continueLabel = busy \? '正在进入…' : '继续'/, 'busy state preserves the normal product action contract');
assert.match(screen, /visibleSelectedModel \? continueLabel : '请选择机型'/, 'hidden or empty selections have an honest disabled label');
assert.match(screen, /bakedBadgeMask:[\s\S]*?position: 'absolute'/, 'the source-art check embedded in THUNDER PRO is masked inside the native card');
assert.match(screen, /selected && styles\.bakedBadgeMaskSelected/, 'the THUNDER PRO mask follows the selected card surface');
assert.match(screen, /没有找到匹配机型/, 'search and filter empty state remains visible');
assert.match(screen, /normalizedQuery/, 'model search behavior remains implemented');
assert.match(screen, /setActiveFilter\(filter\)/, 'category filtering remains implemented');

assert.match(screen, /可选 \{filteredModels\.length\} 款机型/, 'availability count is derived from real filtered models');
assert.match(screen, /当前显示 \$\{filteredModels\.length\} 款真实机型/, 'model-grid semantics state the real result count');
assert.doesNotMatch(screen, /兼容优先/, 'the UI makes no unsupported compatibility-ranking claim');
assert.match(screen, /<Text style=\{styles\.previewNotice\}>仅选择机型，不会绑定或配置机器人<\/Text>/, 'visible safety copy preserves the non-binding selection boundary');
assert.match(screen, /accessibilityHint=\{visibleSelectedModel\s*\? '仅选择机型，不会绑定或配置机器人'/, 'primary action exposes the non-binding boundary to assistive technology');
assert.doesNotMatch(screen, /['"][^'"\n]*预览[^'"\n]*['"]|>[^<\n]*预览[^<\n]*</, 'product model selection has no development-preview copy');
assert.doesNotMatch(screen, /12\s*款|12\s*models|Array\([^)]*12|\.concat\(/i, 'the UI does not copy the Figma-only twelve-model fixture');

const modelIds = [...models.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);
assert.equal(modelIds.length, 4, 'the catalog currently exposes exactly four real model records');
assert.equal(new Set(modelIds).size, 4, 'the catalog contains no duplicated model records');
assert.match(screen, /robotModels\.filter/, 'the rendered catalog comes directly from the real four-model source');

console.log('DOSO model-select native UI contract PASS — one card tree, blue brand states, safe-area and touch-safe, selection does not bind');
