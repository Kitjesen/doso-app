import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [taskPolicy, tasks, typographySource] = await Promise.all([
  readFile(new URL('../src/features/tasks/taskStartPolicy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/TasksScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/typography.ts', import.meta.url), 'utf8'),
]);

assert.match(tasks, /useProductAppearance\(\)/, 'Tasks consumes the shared dynamic light/dark appearance');
assert.match(tasks, /useWindowDimensions\(\)/, 'Tasks reads the runtime viewport and font scale');
assert.match(tasks, /const isLandscape = width > height/, 'Tasks has an explicit landscape branch');
assert.match(tasks, /getAdaptivePageLayout\(\{/, 'Tasks consumes the shared measured-container layout contract');
assert.match(tasks, /containerWidth: viewport\.width/, 'Tasks does not assume the full display is its available width');
assert.match(tasks, /windowHeight: viewport\.height/, 'Tasks uses remaining content height, not the full display height');
assert.match(tasks, /compactLandscape = isLandscape && viewport\.width > 0 && viewport\.height > 0 && layout\.isCompactHeight/, 'Compact summary removal requires a measured short landscape');
assert.match(tasks, /!layout\.useColumns && !compactLandscape \? summary : null/, 'Only compact landscape or wide columns omit the duplicate summary');
assert.match(tasks, /!taskFeedback \|\| compactLandscape \? <Text style=\{styles\.subheading\}>\{robotName\} 尚未同步可信任务/, 'Compact template feedback preserves the trusted-task disclosure');
assert.match(tasks, /onLayout=\{\(\{ nativeEvent: \{ layout: measured \} \}\) => \{[\s\S]*?width: Math\.floor\(measured\.width\), height: Math\.floor\(measured\.height\)/, 'Tasks measures actual parent-constrained width and height together');
assert.match(tasks, /layout\.useColumns && styles\.pageColumns/, 'Only a sufficiently wide and tall measured container enables two columns');
assert.match(tasks, /<ScrollView[\s\S]*contentContainerStyle=/, 'The task page uses scrollable content for short screens and landscape');
assert.match(tasks, /taskRow:\s*\{ flexDirection: 'column'/, 'Templates remain full-width vertical selection rows');
assert.doesNotMatch(tasks, /paddingTop:\s*90|width:\s*370/, 'Tasks no longer reserves a fixed absolute header rectangle');

assert.doesNotMatch(tasks, /TaskArtwork|tasksCards(?:Light|Dark|Landscape)/, 'The obsolete monolithic task-card artwork is removed');
assert.doesNotMatch(tasks, /tasks(?:Summary|Heading|Date)(?:Light|Dark|Landscape)?/, 'Summary, heading, and date controls are native UI rather than full-section bitmaps');
assert.doesNotMatch(tasks, /resizeMode="stretch"/, 'Native task UI never stretches a screenshot to fit');
assert.doesNotMatch(tasks, /marginTop:\s*-\d+|\{\s*scale:\s*[\d.]+\s*\}/, 'Task cards do not crop enlarged robots with negative margins or scale transforms');
assert.doesNotMatch(tasks, /#56FD5E|#3FFFDF|rgba\(45,245,156/, 'Task UI no longer mixes hard-coded legacy green with the active theme');

assert.match(tasks, /planValidation: 'unknown', source: 'template', taskId: null/g, 'Every visible template stays fail-closed');
assert.equal((tasks.match(/planValidation: 'unknown', source: 'template', taskId: null/g) ?? []).length, 3, 'All three templates stay fail-closed');
assert.match(tasks, /const \[selectedTask, setSelectedTask\] = useState\(1\)/, 'The inspection template is selected by default');
assert.match(tasks, /testID=\{`task-template-\$\{index\}`\}/, 'Every native selector exposes a deterministic test ID');
assert.match(tasks, /accessibilityLabel=\{`查看\$\{task\.title\}任务模板`\}/, 'Every selector describes its truthful preview action');
assert.match(tasks, /accessibilityState=\{\{ selected:/, 'Selectors expose their selected state');
assert.match(tasks, /setSelectedTask\(index\)/, 'Selecting a template changes the selected native card');
assert.match(tasks, /setPreviewExpanded\(null\)/, 'Changing templates restores the current phone/wide default detail state');
assert.match(tasks, /const previewVisible = previewExpanded \?\? layout\.useColumns/, 'Wide details default open, phone details default closed until explicitly selected');
assert.match(tasks, /testID="task-preview-toggle"/, 'The selected template exposes one read-only detail toggle');
assert.match(tasks, /accessibilityState=\{\{ expanded:/, 'The detail toggle exposes its expanded state');

assert.equal((tasks.match(/<Image\b/g) ?? []).length, 0, 'Task details do not repeat robot imagery');
assert.match(tasks, /\{taskTemplates\.length\}/, 'The template count derives from the actual three-template source');
assert.match(tasks, /尚未同步可信任务/, 'Summary truthfully labels unsynced task data');
assert.match(tasks, /通用模板，不是已同步的任务计划/, 'Details distinguish view-only templates from trusted task plans');
assert.match(tasks, /dateItemSelected:\s*\{ backgroundColor: appearance\.action \}/, 'Weekday and day are selected together in one accent container');
assert.doesNotMatch(tasks, /33%|已完成|按计划进行/, 'Summary does not present preview data as real progress');

assert.match(taskPolicy, /Object\.getOwnPropertyDescriptor\(value, key\)/, 'Task policy snapshots own data properties without invoking accessors');
assert.match(taskPolicy, /if \(!snapshot\.controlAvailable\)/, 'Task start fails closed unless control is explicitly available');
assert.match(taskPolicy, /if \(!snapshot\.executorAvailable\)/, 'Task start fails closed unless the executor is explicitly available');
assert.match(taskPolicy, /snapshot\.candidateSource !== 'trusted'/, 'Only trusted task sources may execute');
assert.match(taskPolicy, /TRUSTED_TASK_ID_PATTERN\.test\(trustedTaskId\)/, 'Trusted task IDs are format validated');
assert.match(taskPolicy, /snapshot\.candidatePlanValidation !== 'validated'/, 'Only validated task plans may execute');
assert.match(taskPolicy, /const readiness = deriveTaskStartReadiness\(currentInput\)/, 'Task start atomically re-derives current readiness');
assert.match(taskPolicy, /onStart\(readiness\.trustedTaskId\)/, 'Only the revalidated trusted task ID reaches the callback');

assert.match(tasks, /deriveTaskStartReadiness\(taskStartInput\)/, 'The selected template action uses the shared readiness policy');
assert.match(tasks, /createTaskStartHandler\(taskStartInput, onStartTask\)/, 'The selected template action uses the atomic start handler');
assert.equal((tasks.match(/testID="task-start"/g) ?? []).length, 1, 'The selected detail contains exactly one real start target');
assert.match(tasks, /accessibilityState=\{\{ disabled: !taskCanStart \}\}/, 'Start exposes its fail-closed state');
assert.match(tasks, /disabled=\{!taskCanStart\}/, 'Start cannot dispatch without complete trusted evidence');
assert.match(tasks, /onPress=\{taskStartHandler\}/, 'Start dispatches only through the policy handler');
assert.doesNotMatch(tasks, /onPress=\{\(\) => onStartTask\(/, 'Tasks never directly dispatches a display name or selection index');

assert.match(tasks, /accessibilityLiveRegion="polite"/, 'Preview feedback is announced');
assert.match(tasks, /taskFeedback:\s*\{/, 'Preview feedback has a native style');
const feedbackStyle = tasks.match(/taskFeedback:\s*\{([\s\S]*?)\n\s*\},/)?.[1] ?? '';
assert.doesNotMatch(feedbackStyle, /position:\s*'absolute'|bottom:/, 'Preview feedback participates in normal layout flow');

const dateItemStyle = tasks.match(/dateItem:\s*\{([^\n]+)\}/)?.[1] ?? '';
assert.ok(Number(dateItemStyle.match(/minWidth:\s*(\d+)/)?.[1]) >= 48, 'Every date selector keeps at least a 48-point width, with horizontal scrolling when seven do not fit');
const dateHeights = dateItemStyle.match(/minHeight:\s*compact\s*\?\s*(\d+)\s*:\s*(\d+)/);
assert.ok(dateHeights && Number(dateHeights[1]) >= 48 && Number(dateHeights[2]) >= 48, 'Compact and regular date selectors keep 48-point minimum heights without fixing text height');
const fontSizes = [...tasks.matchAll(/fontSize:\s*(\d+)/g)].map(([, size]) => Number(size));
const textRoles = [...new Set([...tasks.matchAll(/\.\.\.typography\.(\w+)/g)].map(([, role]) => role))];
for (const role of textRoles) {
  const declared = typographySource.match(new RegExp(`^\\s*${role}:\\s*\\{[^\\n]*fontSize:\\s*(\\d+)`, 'm'));
  assert.ok(declared, `Task typography role must resolve: ${role}`);
  fontSizes.push(Number(declared[1]));
}
assert.ok(textRoles.length > 0 && fontSizes.length > 0 && Math.min(...fontSizes) >= 13, 'Native task text, including imported roles, never drops below 13sp');
assert.match(tasks, /const key = `\$\{date\.getFullYear\(\)\}-\$\{String\(date\.getMonth\(\) \+ 1\)/, 'Date keys include the full calendar date');
assert.match(tasks, /key=\{date\.key\}/, 'Week controls use collision-free date keys');
assert.match(tasks, /onPress=\{\(\) => setSelectedDate\(date\.key\)\}/, 'Week dates remain interactive');

console.log('DOSO native responsive tasks UI + trusted start contract PASS');
