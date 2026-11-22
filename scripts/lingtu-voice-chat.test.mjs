import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const hudSource = await readFile(new URL('../src/components/controlLandscapeHud.tsx', import.meta.url), 'utf8');
const panelSource = await readFile(new URL('../src/components/ControlVoiceChatPanel.tsx', import.meta.url), 'utf8');
const serviceSource = await readFile(new URL('../src/services/lingtuVoiceChat.ts', import.meta.url), 'utf8');
const bridgeSource = await readFile(new URL('../iot/brainstem-bridge/src/devLanBridge.js', import.meta.url), 'utf8');
const controlSource = await readFile(new URL('../src/screens/ControlScreen.tsx', import.meta.url), 'utf8');

test('HUD and Portrait ControlScreen expose 1-click voice dialogue entry and mutual exclusion', () => {
  assert.ok(hudSource.includes('testID="control-hud-voice-toggle"'));
  assert.ok(panelSource.includes('testID="control-hud-voice-panel"'));
  assert.ok(panelSource.includes('testID="control-voice-mic-btn"'));
  assert.ok(panelSource.includes('testID="control-voice-input"'));
  assert.ok(panelSource.includes('testID="control-voice-send-btn"'));
  assert.ok(controlSource.includes('useRobotVoiceChat('));
  assert.ok(controlSource.includes('testID="control-portrait-voice-toggle"'));
  assert.doesNotMatch(panelSource, /5050|LingTu|SSE|SpeechRecognition|暂未接入|仅作预览/);
});

test('LingTu voice service targets /api/v1/agent/conversations, auto-discovers :8770 xiaosuan dialogue, and supports /api/v1/instruction fallback', () => {
  assert.ok(serviceSource.includes("'/api/v1/agent/options'"));
  assert.ok(serviceSource.includes('/api/v1/agent/conversations'));
  assert.ok(serviceSource.includes("'/api/status'"));
  assert.ok(serviceSource.includes("'/api/chat'"));
  assert.ok(serviceSource.includes("'/api/transcript'"));
  assert.ok(serviceSource.includes("'/api/v1/instruction'"));
  assert.ok(serviceSource.includes('/approvals/'));
  assert.ok(serviceSource.includes('/cancel'));
  assert.ok(bridgeSource.includes("url.pathname === '/api/v1/dev-lan/lingtu'"));
});
