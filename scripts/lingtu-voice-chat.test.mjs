import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

const hudSource = await readFile(new URL('../src/components/controlLandscapeHud.tsx', import.meta.url), 'utf8');
const panelSource = await readFile(new URL('../src/components/ControlVoiceChatPanel.tsx', import.meta.url), 'utf8');
const hookSource = await readFile(new URL('../src/features/control/useRobotVoiceChat.ts', import.meta.url), 'utf8');
const serviceSource = await readFile(new URL('../src/services/lingtuVoiceChat.ts', import.meta.url), 'utf8');
const bridgeSource = await readFile(new URL('../iot/brainstem-bridge/src/devLanBridge.js', import.meta.url), 'utf8');
const controlSource = await readFile(new URL('../src/screens/ControlScreen.tsx', import.meta.url), 'utf8');
const referenceUiSource = await readFile(new URL('../src/components/ControlReferenceUi.tsx', import.meta.url), 'utf8');

function loadVoiceService() {
  const mod = { exports: {} };
  const compiled = ts.transpileModule(serviceSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    __DEV__: false,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    require(name) {
      if (name === 'react-native') return { Platform: { OS: 'ios' } };
      if (name === './brainstemGrpc') {
        return {
          isNativeVoiceInputAvailable: async () => false,
          recognizeNativeVoiceOnce: async () => '',
          speakNativeVoiceText: async () => false,
          stopNativeVoiceSpeech: () => {},
        };
      }
      if (name === './brainstemWebDevBridge') {
        return { resolveWebDevBridgeOrigin: () => 'http://127.0.0.1:8121' };
      }
      if (name === './lingtuReadOnly') {
        return {
          validateLingtuOrigin(value, allowLocalHttp = false) {
            const parsed = new URL(String(value).trim());
            if (parsed.protocol === 'https:') return parsed.origin;
            if (allowLocalHttp && parsed.protocol === 'http:') return parsed.origin;
            throw new Error('config');
          },
        };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return mod.exports;
}

const voiceService = loadVoiceService();

test('HUD and Portrait ControlScreen expose live voice presence, 4-tab workspace, style drawer, and Wave 2 controls', () => {
  assert.ok(hudSource.includes('testID="control-hud-voice-toggle"'));
  assert.ok(hudSource.includes('testID="control-hud-voice-presence-dot"'));
  assert.ok(panelSource.includes('testID="control-hud-voice-panel"'));
  assert.ok(panelSource.includes('testID="control-voice-presence-pill"'));
  assert.ok(panelSource.includes('testID="control-voice-style-drawer"'));
  assert.ok(panelSource.includes('testID={`control-voice-tab-${tab.key}`}'));
  assert.ok(panelSource.includes("{ key: 'chat', label: '对话' }"));
  assert.ok(panelSource.includes("{ key: 'memory', label: '记忆' }"));
  assert.ok(panelSource.includes("{ key: 'reminders', label: '提醒' }"));
  assert.ok(panelSource.includes("{ key: 'moments', label: '时光' }"));
  assert.ok(panelSource.includes('testID="control-voice-quick-rail"'));
  assert.ok(panelSource.includes('testID="control-voice-quick-scenes"'));
  assert.ok(panelSource.includes('testID="control-voice-quick-briefing"'));
  assert.ok(panelSource.includes('testID="control-voice-quick-photo"'));
  assert.ok(panelSource.includes('testID="control-voice-quick-combos"'));
  assert.ok(panelSource.includes('testID="control-voice-broadcast-toggle"'));
  assert.ok(panelSource.includes('testID="control-voice-ambient-row"'));
  assert.ok(panelSource.includes('testID="control-voice-idle-life-toggle"'));
  assert.ok(panelSource.includes('testID="control-voice-speakers-section"'));
  assert.ok(panelSource.includes('testID="control-voice-timer-bar"'));
  assert.ok(panelSource.includes('testID="control-voice-reminder-repeat-row"'));
  assert.ok(panelSource.includes('testID="control-voice-moments-view"'));
  assert.ok(panelSource.includes('testID="control-voice-companion-strip"'));
  assert.ok(panelSource.includes('testID="control-voice-photos-section"'));
  assert.ok(panelSource.includes('testID="control-voice-diaries-section"'));
  assert.ok(panelSource.includes('testID="control-voice-mic-btn"'));
  assert.ok(panelSource.includes('testID="control-voice-input"'));
  assert.ok(panelSource.includes('testID="control-voice-send-btn"'));
  assert.ok(panelSource.includes('testID="control-voice-memory-search"'));
  assert.ok(panelSource.includes('testID="control-voice-memory-add-pin"'));
  assert.ok(panelSource.includes('testID="control-voice-reminder-add"'));
  assert.ok(controlSource.includes('useRobotVoiceChat('));
  assert.ok(controlSource.includes('testID="control-portrait-voice-toggle"'));
  assert.ok(controlSource.includes('testID="control-portrait-voice-dot"'));
  assert.ok(referenceUiSource.includes("id: 'control-setting-dog-volume'"));
  assert.ok(referenceUiSource.includes("'control-setting-quiet-mode'"));

  // Consumer-friendly unified 4-char memory category labels (zero raw keys rendered).
  for (const label of ['人物画像', '业务知识', '过往记录', '交互规范']) {
    assert.ok(panelSource.includes(`'${label}'`), `missing unified memory room label ${label}`);
    assert.ok(Object.values(voiceService.VOICE_MEMORY_ROOM_LABELS).includes(label), `missing VOICE_MEMORY_ROOM_LABELS ${label}`);
  }
  assert.ok(panelSource.includes('testID="control-voice-drawer-tabs"'));
  assert.ok(panelSource.includes('testID="control-voice-drawer-tab-style"'));
  assert.ok(panelSource.includes('testID="control-voice-drawer-tab-capabilities"'));
  assert.ok(panelSource.includes('testID="control-voice-cap-reset"'));
  assert.equal(voiceService.formatVoiceToolLabel('move_robot'), '运动控制');
});

test('Zero-jargon, zero-lecturing, zero-parenthetical, and zero-fake-wall sweep across voice modules', () => {
  const forbiddenVoiceCopy = /暂未接入|仅作预览|暂不可用|清空上下文|MemPalace|AskMe|记忆宫殿|8770|8780|当前版本暂不支持|点击麦克风说话|对话服务未就绪|语音输入不可用/;
  assert.doesNotMatch(panelSource, forbiddenVoiceCopy, 'forbidden copy found in ControlVoiceChatPanel.tsx');
  assert.doesNotMatch(panelSource, /5050|LingTu|SSE|SpeechRecognition|TTS|ASR|EOT|RPC|HTTP|ONNX|Opus|Qwen|sherpa/);
  assert.doesNotMatch(serviceSource, /AskMe|当前浏览器不支持语音输入|暂未接入|仅作预览|暂不可用|清空上下文/);
  assert.doesNotMatch(hookSource, /语音输入不可用|清空上下文|暂未接入|仅作预览/);
});

test('LingTu & Xiaosuan voice service wires every pinned :8770 and :5050 endpoint (Wave 1 + Wave 2)', () => {
  for (const route of [
    "'/api/v1/agent/options'",
    '/api/v1/agent/conversations',
    "'/api/status'",
    "'/api/capabilities'",
    "'/api/chat'",
    "'/api/transcript'",
    "'/api/stop'",
    "'/api/wake'",
    "'/api/quiet_mode'",
    "'/api/volume'",
    "'/api/persona'",
    "'/api/reminders'",
    "'/api/reminders/add'",
    "'/api/reminders/delete'",
    "'/api/reminders/snooze'",
    "'/api/memory/palace'",
    "'/api/memory/add'",
    "'/api/memory/update'",
    "'/api/memory/delete'",
    "'/api/memory/clear-session'",
    "'/api/v1/instruction'",
    '/approvals/',
    '/cancel',
    "'/api/photos'",
    "'/api/photos/capture'",
    "'/api/photos/delete'",
    '/api/photos/',
    "'/api/speakers'",
    "'/api/speakers/enroll'",
    "'/api/speakers/delete'",
    "'/api/ambient'",
    "'/api/scenes'",
    "'/api/scenes/run'",
    "'/api/combos'",
    "'/api/combos/play'",
    "'/api/combos/stop'",
    "'/api/briefing'",
    "'/api/timers'",
    "'/api/timers/start'",
    "'/api/timers/pause'",
    "'/api/timers/resume'",
    "'/api/timers/cancel'",
    "'/api/diary'",
    "'/api/diary/generate'",
    "'/api/diary/read'",
    "'/api/broadcast'",
    "'/api/idle_life'",
  ]) {
    assert.ok(serviceSource.includes(route), `missing route ${route}`);
  }
  assert.ok(bridgeSource.includes("url.pathname === '/api/v1/dev-lan/lingtu'"));
});

test('fetchXiaosuanStatus parses additive Wave 1 + Wave 2 live fields and degrades gracefully for legacy firmware and offline hosts', async () => {
  const fullTarget = {
    origin: 'http://192.168.66.64:5050',
    allowLocalHttp: true,
    fetchImpl: async url => {
      assert.equal(url, 'http://192.168.66.64:8770/api/status');
      return {
        status: 200,
        json: async () => ({
          ok: true,
          live_state: 'speaking',
          emotion: 'wink',
          quiet_mode: true,
          volume: 25,
          role: 'companion',
          role_name: '温暖陪伴',
          voice: 'gentle',
          voice_name: '温柔女声思思',
          pending_reminders: 3,
          ambient: {
            active: true,
            sound: 'rain',
            sound_label: '雨声',
            remaining_sec: 900,
            sounds: [
              { id: 'rain', label: '雨声' },
              { id: 'ocean', label: '海浪' },
            ],
          },
          active_timer: {
            id: 'tmr_1',
            kind: 'pomodoro',
            label: '专注',
            duration_sec: 1500,
            remaining_sec: 1452,
            state: 'running',
            auto_quiet: true,
          },
          companion: {
            days_together: 7,
            streak_days: 5,
            mood: 'happy',
            mood_label: '开心',
            speaker_tier: '默契',
          },
          idle_life_enabled: true,
          speakers_available: true,
          speakers_count: 2,
          photos_count: 4,
        }),
      };
    },
  };
  const full = await voiceService.fetchXiaosuanStatus(fullTarget);
  assert.equal(full.ok, true);
  assert.equal(full.liveState, 'speaking');
  assert.equal(full.emotion, 'wink');
  assert.equal(full.quietMode, true);
  assert.equal(full.volume, 25);
  assert.equal(full.role, 'companion');
  assert.equal(full.roleName, '陪伴');
  assert.equal(full.voice, 'gentle');
  assert.equal(full.voiceName, '思思');
  assert.equal(full.pendingReminders, 3);
  assert.equal(full.ambient.active, true);
  assert.equal(full.ambient.sound, 'rain');
  assert.equal(full.ambient.soundLabel, '雨声');
  assert.equal(full.ambient.remainingSec, 900);
  assert.deepEqual({ ...full.activeTimer }, {
    id: 'tmr_1',
    kind: 'pomodoro',
    label: '专注',
    durationSec: 1500,
    remainingSec: 1452,
    state: 'running',
    autoQuiet: true,
  });
  assert.deepEqual({ ...full.companion }, {
    daysTogether: 7,
    streakDays: 5,
    mood: 'happy',
    moodLabel: '开心',
    speakerTier: '默契',
  });
  assert.equal(full.idleLifeEnabled, true);
  assert.equal(full.speakersAvailable, true);
  assert.equal(full.speakersCount, 2);
  assert.equal(full.photosCount, 4);

  // Older firmware returning only { ok: true } degrades with safe Wave 1 + Wave 2 defaults.
  const legacy = await voiceService.fetchXiaosuanStatus({
    origin: 'http://192.168.66.64:8770',
    allowLocalHttp: true,
    fetchImpl: async () => ({ status: 200, json: async () => ({ ok: true }) }),
  });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.liveState, 'idle');
  assert.equal(legacy.emotion, 'neutral');
  assert.equal(legacy.quietMode, false);
  assert.equal(legacy.volume, null);
  assert.equal(legacy.roleName, '伙伴');
  assert.equal(legacy.voiceName, '小何');
  assert.equal(legacy.pendingReminders, 0);
  assert.equal(legacy.ambient.active, false);
  assert.equal(legacy.ambient.sound, 'off');
  assert.equal(legacy.activeTimer, null);
  assert.equal(legacy.companion, null);
  assert.equal(legacy.idleLifeEnabled, false);
  assert.equal(legacy.speakersAvailable, false);
  assert.equal(legacy.speakersCount, 0);
  assert.equal(legacy.photosCount, 0);

  // Offline network rejection surfaces short clean error.
  await assert.rejects(
    () => voiceService.fetchXiaosuanStatus({
      origin: 'http://192.168.66.64:8770',
      allowLocalHttp: true,
      fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
    }),
    err => err.code === 'unavailable' && err.message === '未就绪',
  );
});

test('Hardware audio, quiet mode, persona, and reminder endpoints send pinned payloads and parse responses', async () => {
  const calls = [];
  const target = {
    origin: 'http://192.168.66.64:5050',
    allowLocalHttp: true,
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(url);
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ method: init.method ?? 'GET', origin: parsed.origin, path: parsed.pathname, body });

      if (parsed.pathname === '/api/stop') return { status: 200, json: async () => ({ ok: true }) };
      if (parsed.pathname === '/api/wake') return { status: 200, json: async () => ({ ok: true, live_state: 'listening', emotion: 'happy' }) };
      if (parsed.pathname === '/api/quiet_mode' && (init.method ?? 'GET') === 'GET') {
        return { status: 200, json: async () => ({ ok: true, enabled: false, volume: 65 }) };
      }
      if (parsed.pathname === '/api/quiet_mode' && init.method === 'POST') {
        return { status: 200, json: async () => ({ ok: true, enabled: body.enabled, volume: body.enabled ? 25 : 65 }) };
      }
      if (parsed.pathname === '/api/volume') {
        return { status: 200, json: async () => ({ ok: true, volume: body.volume ?? 50, quiet_mode: false }) };
      }
      if (parsed.pathname === '/api/persona' && (init.method ?? 'GET') === 'GET') {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            role: { key: 'xiaosuan', name: '小算伙伴' },
            roles: [
              { key: 'xiaosuan', name: '小算伙伴', active: true },
              { key: 'companion', name: '温暖陪伴', active: false },
            ],
            voice: { key: 'xiaosuan', name: '小何' },
            voices: [
              { key: 'xiaosuan', name: '小何', active: true },
              { key: 'gentle', name: '温柔女声思思', active: false },
            ],
          }),
        };
      }
      if (parsed.pathname === '/api/persona' && init.method === 'POST') {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            role: { key: body.role || 'xiaosuan', name: body.role === 'companion' ? '温暖陪伴' : '小算伙伴' },
            voice: { key: body.voice || 'xiaosuan', name: body.voice === 'gentle' ? '思思' : '小何' },
          }),
        };
      }
      if (parsed.pathname === '/api/reminders') {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            reminders: [
              { id: 'rem_1', content: '喝水', time_expr: '10分钟后', trigger_at: 1700000600, trigger_at_local: '2026-11-24 18:30:00', status: 'pending' },
            ],
          }),
        };
      }
      if (parsed.pathname === '/api/reminders/add') {
        return { status: 200, json: async () => ({ ok: true, reminder: { id: 'rem_2', content: body.content, time_expr: body.time_expr, status: 'pending' } }) };
      }
      if (parsed.pathname === '/api/reminders/snooze') {
        return { status: 200, json: async () => ({ ok: true, message: '已延后' }) };
      }
      if (parsed.pathname === '/api/reminders/delete') {
        return { status: 200, json: async () => ({ ok: true, message: '已删除' }) };
      }
      return { status: 404, json: async () => ({ ok: false }) };
    },
  };

  assert.equal((await voiceService.stopXiaosuanVoice(target)).message, '已停止');
  const wakeRes = await voiceService.wakeXiaosuanVoice(target);
  assert.equal(wakeRes.status.liveState, 'listening');
  assert.equal((await voiceService.fetchXiaosuanQuietMode(target)).enabled, false);
  const quietOn = await voiceService.setXiaosuanQuietMode(target, true);
  assert.equal(quietOn.enabled, true);
  assert.equal(quietOn.volume, 25);
  assert.equal(quietOn.message, '轻声已开');

  const volRes = await voiceService.setXiaosuanVolume(target, { volume: 120 });
  assert.equal(volRes.volume, 100);
  assert.equal(calls.find(c => c.path === '/api/volume').body.volume, 100);

  const persona = await voiceService.fetchXiaosuanPersona(target);
  assert.equal(persona.roleId, 'xiaosuan');
  assert.equal(persona.roles[1].shortName, '陪伴');
  assert.equal(persona.voices[1].shortName, '思思');

  const switchedRole = await voiceService.updateXiaosuanPersona(target, { role: 'companion' });
  assert.equal(switchedRole.roleName, '陪伴');
  assert.equal(switchedRole.message, '已切陪伴');
  const switchedVoice = await voiceService.updateXiaosuanPersona(target, { voice: 'gentle' });
  assert.equal(switchedVoice.voiceName, '思思');
  assert.equal(switchedVoice.message, '已切思思');

  const list = await voiceService.fetchVoiceReminders(target);
  assert.equal(list.length, 1);
  assert.equal(list[0].content, '喝水');
  const added = await voiceService.addVoiceReminder(target, { content: '开会', timeExpr: '今晚8点' });
  assert.equal(added.ok, true);
  assert.equal(added.message, '已设提醒');
  const snoozed = await voiceService.snoozeVoiceReminder(target, { id: 'rem_1', minutes: 10 });
  assert.equal(snoozed.message, '已延后10分钟');
  const deleted = await voiceService.deleteVoiceReminder(target, 'rem_1');
  assert.equal(deleted.message, '已删除');

  assert.ok(calls.every(c => c.origin === 'http://192.168.66.64:8770'), 'all Xiaosuan calls must resolve to :8770');
});

test('readXiaosuanVoiceTranscript merges chunked replies by turn_id, preserves source/tool badges, and extracts status', async () => {
  const snap = await voiceService.readXiaosuanVoiceTranscript({
    origin: 'http://192.168.66.64:8770',
    allowLocalHttp: true,
    fetchImpl: async () => ({
      status: 200,
      json: async () => ({
        ok: true,
        live_state: 'speaking',
        emotion: 'happy',
        quiet_mode: false,
        volume: 65,
        pending_reminders: 1,
        events: [
          { seq: 1, turn_id: 't1', event: 'stt', role: 'user', text: '看看前面', source: 'voice', ts: 100 },
          { seq: 2, turn_id: 't1', event: 'tts', role: 'assistant', text: '前面有一张桌子，', source: 'voice', emotion: 'happy', tools: ['look_around'], ts: 101 },
          { seq: 3, turn_id: 't1', event: 'tts', role: 'assistant', text: '上面放着水杯。', source: 'voice', emotion: 'happy', ts: 102 },
          { seq: 4, turn_id: 'rem_turn', event: 'tts', role: 'assistant', text: '记得喝水啦！', source: 'reminder', emotion: 'surprised', ts: 103 },
        ],
      }),
    }),
  });

  assert.equal(snap.status.liveState, 'speaking');
  assert.equal(snap.status.emotion, 'happy');
  assert.equal(snap.status.pendingReminders, 1);
  assert.equal(snap.messages.length, 3, 'two TTS chunks sharing turn_id t1 must aggregate into one bubble');
  assert.equal(snap.messages[0].source, 'voice');
  assert.equal(snap.messages[1].text, '前面有一张桌子，上面放着水杯。');
  assert.deepEqual([...snap.messages[1].tools], ['观察周围']);
  assert.equal(snap.messages[2].source, 'reminder');
});

test('Wave 2 :8770 client methods cover photos, speakers, ambient, scenes, combos, briefing, timers, repeat, diary, broadcast, and idle life', async () => {
  const calls = [];
  const validPhotoId = 'pho_0123456789ab';
  const target = {
    origin: 'http://192.168.66.64:5050',
    allowLocalHttp: true,
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(url);
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ method: init.method ?? 'GET', origin: parsed.origin, path: parsed.pathname, body });

      if (parsed.pathname === '/api/photos') {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            photos: [
              {
                id: validPhotoId,
                caption: '窗台阳光',
                emotion: 'wink',
                speaker_id: '方总',
                created_at: '2026-11-24T02:15:00+00:00',
                local_time: '2026-11-24 10:15:00',
                created_ts: 1795400100,
              },
              {
                id: 'pho_001122334455',
                caption: '傍晚微风',
                emotion: 'happy',
                created_at: '2026-11-24T10:30:00Z',
                created_at_local: '2026-11-24 18:30:00',
                created_ts: 1795429800,
              },
              { id: '../evil', caption: 'bad' },
            ],
          }),
        };
      }
      if (parsed.pathname === '/api/photos/capture') {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            photo: { id: 'pho_abcdef012345', caption: '新拍照片', emotion: 'wink', speaker_id: '方总', created_at: '2026-11-24 12:00:00' },
          }),
        };
      }
      if (parsed.pathname === '/api/photos/delete') return { status: 200, json: async () => ({ ok: true }) };
      if (parsed.pathname === '/api/speakers') {
        return { status: 200, json: async () => ({ ok: true, available: true, speakers: [{ name: '方总', samples: 3 }] }) };
      }
      if (parsed.pathname === '/api/speakers/enroll') {
        return { status: 200, json: async () => ({ ok: true, name: body.name, samples: 1 }) };
      }
      if (parsed.pathname === '/api/speakers/delete') return { status: 200, json: async () => ({ ok: true }) };
      if (parsed.pathname === '/api/ambient' && (init.method ?? 'GET') === 'GET') {
        return { status: 200, json: async () => ({ ok: true, active: false, sound: 'off', sound_label: '关闭', remaining_sec: null }) };
      }
      if (parsed.pathname === '/api/ambient' && init.method === 'POST') {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            active: body.sound !== 'off',
            sound: body.sound,
            sound_label: body.sound === 'rain' ? '雨声' : '关闭',
            remaining_sec: body.duration_min ? body.duration_min * 60 : null,
          }),
        };
      }
      if (parsed.pathname === '/api/scenes') {
        return { status: 200, json: async () => ({ ok: true, scenes: [{ id: 'morning', label: '早安' }, { id: 'focus', label: '专注' }] }) };
      }
      if (parsed.pathname === '/api/scenes/run') return { status: 200, json: async () => ({ ok: true, id: body.id }) };
      if (parsed.pathname === '/api/combos') {
        return { status: 200, json: async () => ({ ok: true, combos: [{ id: 'new_year', label: '拜年' }, { id: 'cute', label: '卖萌' }] }) };
      }
      if (parsed.pathname === '/api/combos/play') return { status: 200, json: async () => ({ ok: true, id: body.id }) };
      if (parsed.pathname === '/api/combos/stop') return { status: 200, json: async () => ({ ok: true }) };
      if (parsed.pathname === '/api/briefing') return { status: 200, json: async () => ({ ok: true, script: '早上好，今天晴朗。' }) };
      if (parsed.pathname === '/api/timers') {
        return { status: 200, json: async () => ({ ok: true, active_timer: { id: 't1', kind: 'pomodoro', label: '专注', duration_sec: 1500, remaining_sec: 1452, state: 'running', auto_quiet: true } }) };
      }
      if (parsed.pathname === '/api/timers/start') {
        return { status: 200, json: async () => ({ ok: true, active_timer: { id: 't2', kind: body.kind, label: body.label || '专注', duration_sec: body.duration_sec, remaining_sec: body.duration_sec, state: 'running', auto_quiet: Boolean(body.auto_quiet) } }) };
      }
      if (parsed.pathname === '/api/timers/pause') {
        return { status: 200, json: async () => ({ ok: true, active_timer: { id: 't2', kind: 'pomodoro', label: '专注', duration_sec: 1500, remaining_sec: 1400, state: 'paused', auto_quiet: true } }) };
      }
      if (parsed.pathname === '/api/timers/resume') {
        return { status: 200, json: async () => ({ ok: true, active_timer: { id: 't2', kind: 'pomodoro', label: '专注', duration_sec: 1500, remaining_sec: 1400, state: 'running', auto_quiet: true } }) };
      }
      if (parsed.pathname === '/api/timers/cancel') return { status: 200, json: async () => ({ ok: true }) };
      if (parsed.pathname === '/api/reminders/add') {
        return { status: 200, json: async () => ({ ok: true, reminder: { id: 'rem_rep', content: body.content, time_expr: body.time_expr, repeat: body.repeat || '', status: 'pending' } }) };
      }
      if (parsed.pathname === '/api/diary') {
        return { status: 200, json: async () => ({ ok: true, diaries: [{ date: '2026-11-24', text: '今天陪主人散步很开心。', mood: 'happy', mood_label: '开心', photo_ids: [validPhotoId] }] }) };
      }
      if (parsed.pathname === '/api/diary/generate') {
        return { status: 200, json: async () => ({ ok: true, diary: { date: '2026-11-24', text: '刚写好的今天日记。', mood: 'happy', mood_label: '开心', photo_ids: [] } }) };
      }
      if (parsed.pathname === '/api/diary/read') return { status: 200, json: async () => ({ ok: true }) };
      if (parsed.pathname === '/api/broadcast') return { status: 200, json: async () => ({ ok: true }) };
      if (parsed.pathname === '/api/idle_life') return { status: 200, json: async () => ({ ok: true, enabled: body.enabled }) };
      if (parsed.pathname === '/api/transcript') {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            events: [
              { seq: 1, turn_id: 'spk1', event: 'stt', role: 'user', text: '我是谁', source: 'voice', speaker_id: '方总', ts: 10 },
              { seq: 2, turn_id: 'bcast1', event: 'tts', role: 'user', text: '外卖到了', source: 'broadcast', ts: 11 },
            ],
          }),
        };
      }
      return { status: 404, json: async () => ({ ok: false }) };
    },
  };

  // Photo URL guard against path traversal.
  assert.equal(voiceService.getPhotoUrl(target, validPhotoId), `http://192.168.66.64:8770/api/photos/${validPhotoId}.jpg`);
  assert.equal(voiceService.getPhotoUrl(target, '../secret'), '');
  await assert.rejects(() => voiceService.deletePhoto(target, '../secret'), err => err.code === 'config');

  const photos = await voiceService.listPhotos(target);
  assert.equal(photos.length, 2, 'invalid photo IDs must be filtered out');
  assert.equal(photos[0].url, `http://192.168.66.64:8770/api/photos/${validPhotoId}.jpg`);
  assert.equal(photos[0].speakerId, '方总');
  assert.equal(photos[0].createdAt, '2026-11-24 10:15:00', 'must prefer local_time over UTC created_at');
  assert.equal(photos[0].ts, 1795400100, 'must parse created_ts into ts');
  assert.equal(photos[1].createdAt, '2026-11-24 18:30:00', 'must prefer created_at_local over UTC created_at');
  assert.equal(photos[1].ts, 1795429800);
  const cap = await voiceService.capturePhoto(target);
  assert.equal(cap.message, '已拍照');
  assert.equal(cap.photo.id, 'pho_abcdef012345');
  assert.equal((await voiceService.deletePhoto(target, validPhotoId)).message, '已删除');

  const spk = await voiceService.listSpeakers(target);
  assert.equal(spk.available, true);
  assert.equal(spk.speakers[0].name, '方总');
  assert.equal((await voiceService.enrollSpeaker(target, '小李')).message, '已录声纹');
  assert.equal((await voiceService.deleteSpeaker(target, '小李')).message, '已删除');

  assert.equal((await voiceService.getAmbient(target)).active, false);
  const ambOn = await voiceService.setAmbient(target, 'rain', 30);
  assert.equal(ambOn.ambient.active, true);
  assert.equal(ambOn.ambient.sound, 'rain');
  assert.equal(ambOn.ambient.remainingSec, 1800);
  assert.equal(ambOn.message, '已播雨声');
  assert.equal((await voiceService.setAmbient(target, 'off')).message, '已关白噪音');

  assert.equal((await voiceService.listScenes(target)).length, 2);
  assert.equal((await voiceService.runScene(target, 'focus', 25)).message, '已切专注');
  assert.equal((await voiceService.listCombos(target)).length, 2);
  assert.equal((await voiceService.playCombo(target, 'new_year')).message, '表演拜年');
  assert.equal((await voiceService.stopCombo(target)).message, '已停表演');
  const brief = await voiceService.runBriefing(target, { city: '上海', speak: true });
  assert.equal(brief.message, '已播早报');
  assert.match(brief.text, /晴朗/);

  assert.equal((await voiceService.getTimers(target)).remainingSec, 1452);
  assert.equal(voiceService.formatTimerCountdown(1452), '24:12');
  const started = await voiceService.startTimer(target, { kind: 'pomodoro', durationSec: 1500, label: '专注', autoQuiet: true });
  assert.equal(started.message, '开始专注');
  assert.equal((await voiceService.pauseTimer(target)).timer.state, 'paused');
  assert.equal((await voiceService.resumeTimer(target)).timer.state, 'running');
  assert.equal((await voiceService.cancelTimer(target)).message, '已结束');

  const repRem = await voiceService.addVoiceReminder(target, { content: '吃药', timeExpr: '早8点', repeat: 'weekdays' });
  assert.equal(repRem.reminder.repeat, 'weekdays');
  assert.equal(calls.find(c => c.path === '/api/reminders/add').body.repeat, 'weekdays');

  const diaries = await voiceService.listDiaries(target);
  assert.equal(diaries.length, 1);
  assert.equal(diaries[0].moodLabel, '开心');
  assert.equal((await voiceService.generateDiary(target, { force: true })).message, '已写日记');
  assert.equal((await voiceService.readDiary(target, '2026-11-24')).message, '朗读中');
  assert.equal((await voiceService.sendBroadcast(target, '外卖到了')).message, '已传话');
  assert.equal((await voiceService.setIdleLife(target, true)).message, '待机微动开');

  const tx = await voiceService.readXiaosuanVoiceTranscript(target);
  assert.equal(tx.messages[0].speakerId, '方总');
  assert.equal(tx.messages[1].source, 'broadcast');
  assert.equal(voiceService.formatTranscriptSourceBadge('broadcast'), '传话');
  assert.ok(calls.every(c => c.origin === 'http://192.168.66.64:8770'));
});

function mountVoicePanelHarness({ fetchImpl }) {
  const slots = [];
  const effects = [];
  const pendingEffects = [];
  const timers = new Map();
  const intervals = new Set();
  let timerId = 0;
  let now = 0;
  let cursor = 0;
  let dirty = false;
  let unmounted = false;
  let nodes = [];
  let latestController = null;

  const changed = (prev, next) => !prev || !next || prev.length !== next.length || next.some((v, i) => !Object.is(v, prev[i]));
  const react = {
    useState(initial) {
      const idx = cursor++;
      if (!(idx in slots)) slots[idx] = typeof initial === 'function' ? initial() : initial;
      return [slots[idx], value => {
        if (unmounted) return;
        const next = typeof value === 'function' ? value(slots[idx]) : value;
        if (!Object.is(next, slots[idx])) {
          slots[idx] = next;
          dirty = true;
        }
      }];
    },
    useRef(initial) {
      const idx = cursor++;
      return slots[idx] ??= { current: initial };
    },
    useMemo(factory, deps) {
      const idx = cursor++;
      if (changed(slots[idx]?.deps, deps)) slots[idx] = { deps, value: factory() };
      return slots[idx].value;
    },
    useCallback(cb, deps) {
      const idx = cursor++;
      if (changed(slots[idx]?.deps, deps)) slots[idx] = { deps, value: cb };
      return slots[idx].value;
    },
    useEffect(effect, deps) {
      const idx = cursor++;
      if (changed(slots[idx]?.deps, deps)) {
        pendingEffects.push(() => {
          slots[idx]?.cleanup?.();
          const cleanup = effect();
          slots[idx] = { cleanup, deps };
          effects[idx] = slots[idx];
        });
      }
    },
  };

  const schedSetTimeout = (cb, delay) => { const id = ++timerId; timers.set(id, { cb, due: now + delay }); return id; };
  const schedClearTimeout = id => timers.delete(id);
  const schedSetInterval = (cb, delay) => {
    const id = ++timerId;
    intervals.add(id);
    const step = () => {
      if (!intervals.has(id) || unmounted) return;
      cb();
      if (intervals.has(id) && !unmounted) timers.set(id, { cb: step, due: now + delay });
    };
    timers.set(id, { cb: step, due: now + delay });
    return id;
  };
  const schedClearInterval = id => { intervals.delete(id); timers.delete(id); };

  const rnHost = {
    Image: 'Image',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    TextInput: 'TextInput',
    View: 'View',
    Platform: { OS: 'ios' },
    StyleSheet: { create: v => v },
  };

  const svcMod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(serviceSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: svcMod,
    exports: svcMod.exports,
    __DEV__: false,
    URL,
    AbortController,
    fetch: fetchImpl,
    setTimeout: schedSetTimeout,
    clearTimeout: schedClearTimeout,
    require(name) {
      if (name === 'react-native') return rnHost;
      if (name === './brainstemGrpc') {
        return {
          isNativeVoiceInputAvailable: async () => false,
          recognizeNativeVoiceOnce: async () => '',
          speakNativeVoiceText: async () => false,
          stopNativeVoiceSpeech: () => {},
        };
      }
      if (name === './brainstemWebDevBridge') return { resolveWebDevBridgeOrigin: () => 'http://127.0.0.1:8121' };
      if (name === './lingtuReadOnly') {
        return {
          validateLingtuOrigin(value, allowLocalHttp = false) {
            const parsed = new URL(String(value).trim());
            if (parsed.protocol === 'https:') return parsed.origin;
            if (allowLocalHttp && parsed.protocol === 'http:') return parsed.origin;
            throw new Error('config');
          },
        };
      }
      throw new Error(`Unexpected service dependency: ${name}`);
    },
  });

  const hookMod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(hookSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: hookMod,
    exports: hookMod.exports,
    AbortController,
    setTimeout: schedSetTimeout,
    clearTimeout: schedClearTimeout,
    setInterval: schedSetInterval,
    clearInterval: schedClearInterval,
    require(name) {
      if (name === 'react') return react;
      if (name === '../../services/lingtuVoiceChat') return svcMod.exports;
      throw new Error(`Unexpected hook dependency: ${name}`);
    },
  });

  const panelMod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(panelSource, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: panelMod,
    exports: panelMod.exports,
    require(name) {
      if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
      if (name === 'react-native') return rnHost;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === './AppText') return { Text: 'Text', TextInput: 'TextInput' };
      throw new Error(`Unexpected panel dependency: ${name}`);
    },
  });

  function render() {
    let passes = 0;
    do {
      assert.ok(++passes < 30, 'voice panel effects must settle');
      cursor = 0;
      dirty = false;
      nodes = [];
      latestController = hookMod.exports.useRobotVoiceChat({
        appActive: true,
        connected: true,
        endpoint: 'http://192.168.66.64:8770',
        allowLocalHttp: true,
        volumePercent: 65,
        voiceReplyEnabled: false,
        onToggleVoiceReply: () => {},
      });
      const root = latestController.open
        ? panelMod.exports.ControlVoiceChatPanel({
            controller: latestController,
            onClose: () => latestController.setOpen(false),
            maxHeight: 240,
            surfaceTone: 'dark',
          })
        : null;
      const walk = node => {
        if (node == null || typeof node === 'boolean') return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node !== 'object') {
          nodes.push({ type: 'copy', value: String(node) });
          return;
        }
        nodes.push(node);
        walk(node.props?.children);
      };
      walk(root);
      while (pendingEffects.length) pendingEffects.shift()();
    } while (dirty);
  }

  render();
  return {
    get controller() { return latestController; },
    get copy() { return nodes.filter(n => n.type === 'copy').map(n => n.value).join(' ').replace(/\s+/g, ' ').trim(); },
    find: id => nodes.find(n => n.props?.testID === id),
    render,
    async settle() { await new Promise(r => setImmediate(r)); render(); },
    advance(ms) {
      const target = now + ms;
      while (true) {
        let nextEntry = null;
        for (const entry of timers) {
          if (entry[1].due <= target && (!nextEntry || entry[1].due < nextEntry[1].due)) nextEntry = entry;
        }
        if (!nextEntry) break;
        const [id, t] = nextEntry;
        now = Math.max(now, t.due);
        timers.delete(id);
        t.cb();
      }
      now = target;
      if (!unmounted) render();
    },
    get activeIntervals() { return intervals.size; },
    unmount() {
      unmounted = true;
      for (const eff of effects) eff?.cleanup?.();
    },
  };
}

test('Wave 2 hook & panel drive 1s local timer ticker, conditional voiceprints, moments tab, broadcast, scenes, combos, and ambient', async () => {
  const calls = [];
  let speakersAvailable = false;
  let speakers = [];
  let ambient = { active: false, sound: 'off', sound_label: '关闭', remaining_sec: null };
  let activeTimer = null;
  let idleLifeEnabled = false;
  let photos = [
    {
      id: 'pho_111122223333',
      caption: '客厅阳光',
      emotion: 'wink',
      speaker_id: '方总',
      created_at: '2026-11-24T01:30:00+00:00',
      local_time: '2026-11-24 09:30:00',
      created_ts: 1795397400,
    },
  ];
  let diaries = [
    { date: '2026-11-24', text: '今天和方总玩得很开心，还拍了一张照。', mood: 'happy', mood_label: '开心', photo_ids: ['pho_111122223333'] },
  ];
  let reminders = [
    { id: 'rem_1', content: '吃早饭', time_expr: '早8点', repeat: 'daily', trigger_at_local: '2026-11-25 08:00:00', status: 'pending' },
  ];
  let events = [
    { seq: 1, turn_id: 'v1', event: 'stt', role: 'user', text: '早上好', source: 'voice', speaker_id: '方总', ts: 10 },
    { seq: 2, turn_id: 'b1', event: 'tts', role: 'user', text: '快递到了', source: 'broadcast', ts: 11 },
  ];

  const statusBody = () => ({
    ok: true,
    live_state: 'idle',
    emotion: 'happy',
    quiet_mode: false,
    volume: 65,
    role: 'xiaosuan',
    role_name: '小算伙伴',
    voice: 'xiaosuan',
    voice_name: '小何',
    pending_reminders: reminders.length,
    ambient,
    active_timer: activeTimer,
    companion: { days_together: 7, streak_days: 7, mood: 'happy', mood_label: '开心', speaker_tier: '默契' },
    idle_life_enabled: idleLifeEnabled,
    speakers_available: speakersAvailable,
    speakers_count: speakers.length,
    photos_count: photos.length,
  });

  const ui = mountVoicePanelHarness({
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(url);
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ method: init.method ?? 'GET', path: parsed.pathname, body });

      if (parsed.pathname === '/api/v1/agent/options') return { status: 404, json: async () => ({}) };
      if (parsed.pathname === '/api/status') return { status: 200, json: async () => statusBody() };
      if (parsed.pathname === '/api/transcript') return { status: 200, json: async () => ({ ok: true, live_state: 'idle', emotion: 'happy', events }) };
      if (parsed.pathname === '/api/persona') return { status: 200, json: async () => ({ ok: true, role: 'xiaosuan', voice: 'xiaosuan', roles: [], voices: [] }) };
      if (parsed.pathname === '/api/ambient' && (init.method ?? 'GET') === 'GET') return { status: 200, json: async () => ({ ok: true, ...ambient }) };
      if (parsed.pathname === '/api/ambient' && init.method === 'POST') {
        ambient = { active: body.sound !== 'off', sound: body.sound, sound_label: body.sound === 'rain' ? '雨声' : '关闭', remaining_sec: body.duration_min ? body.duration_min * 60 : null };
        return { status: 200, json: async () => ({ ok: true, ...ambient }) };
      }
      if (parsed.pathname === '/api/idle_life') {
        idleLifeEnabled = Boolean(body.enabled);
        return { status: 200, json: async () => ({ ok: true, enabled: idleLifeEnabled }) };
      }
      if (parsed.pathname === '/api/speakers') return { status: 200, json: async () => ({ ok: true, available: speakersAvailable, speakers }) };
      if (parsed.pathname === '/api/speakers/enroll') {
        speakers = [...speakers, { name: body.name, samples: 1 }];
        return { status: 200, json: async () => ({ ok: true, name: body.name, samples: 1 }) };
      }
      if (parsed.pathname === '/api/speakers/delete') {
        speakers = speakers.filter(s => s.name !== body.name);
        return { status: 200, json: async () => ({ ok: true }) };
      }
      if (parsed.pathname === '/api/scenes') return { status: 200, json: async () => ({ ok: true, scenes: [{ id: 'morning', label: '早安' }, { id: 'focus', label: '专注' }, { id: 'bedtime', label: '睡前' }, { id: 'welcome', label: '迎宾' }] }) };
      if (parsed.pathname === '/api/scenes/run') return { status: 200, json: async () => ({ ok: true, id: body.id }) };
      if (parsed.pathname === '/api/combos') return { status: 200, json: async () => ({ ok: true, combos: [{ id: 'new_year', label: '拜年' }, { id: 'welcome', label: '迎宾' }, { id: 'cute', label: '卖萌' }, { id: 'warmup', label: '热身' }] }) };
      if (parsed.pathname === '/api/combos/play') return { status: 200, json: async () => ({ ok: true, id: body.id }) };
      if (parsed.pathname === '/api/combos/stop') return { status: 200, json: async () => ({ ok: true }) };
      if (parsed.pathname === '/api/briefing') return { status: 200, json: async () => ({ ok: true, script: '今日晴朗。' }) };
      if (parsed.pathname === '/api/broadcast') {
        events = [...events, { seq: events.length + 1, turn_id: `b_${events.length}`, event: 'tts', role: 'user', text: body.text, source: 'broadcast', ts: 20 }];
        return { status: 200, json: async () => ({ ok: true }) };
      }
      if (parsed.pathname === '/api/photos') return { status: 200, json: async () => ({ ok: true, photos }) };
      if (parsed.pathname === '/api/photos/capture') {
        const nextPhoto = { id: 'pho_999988887777', caption: '刚拍的画面', emotion: 'wink', speaker_id: '', created_at: '2026-11-24 12:10:00' };
        photos = [nextPhoto, ...photos];
        return { status: 200, json: async () => ({ ok: true, photo: nextPhoto }) };
      }
      if (parsed.pathname === '/api/photos/delete') {
        photos = photos.filter(p => p.id !== body.id);
        return { status: 200, json: async () => ({ ok: true }) };
      }
      if (parsed.pathname === '/api/diary') return { status: 200, json: async () => ({ ok: true, diaries }) };
      if (parsed.pathname === '/api/diary/generate') {
        const nextDiary = { date: '2026-11-24', text: '重新整理的温暖日记。', mood: 'happy', mood_label: '开心', photo_ids: [] };
        diaries = [nextDiary];
        return { status: 200, json: async () => ({ ok: true, diary: nextDiary }) };
      }
      if (parsed.pathname === '/api/diary/read') return { status: 200, json: async () => ({ ok: true }) };
      if (parsed.pathname === '/api/reminders') return { status: 200, json: async () => ({ ok: true, reminders }) };
      if (parsed.pathname === '/api/reminders/add') {
        reminders = [...reminders, { id: 'rem_new', content: body.content, time_expr: body.time_expr, repeat: body.repeat || '', trigger_at_local: '2026-11-25 09:00:00', status: 'pending' }];
        return { status: 200, json: async () => ({ ok: true }) };
      }
      if (parsed.pathname === '/api/timers') return { status: 200, json: async () => ({ ok: true, active_timer: activeTimer }) };
      if (parsed.pathname === '/api/timers/start') {
        activeTimer = { id: 'tmr_focus', kind: body.kind, label: body.label || '专注', duration_sec: body.duration_sec, remaining_sec: body.duration_sec, state: 'running', auto_quiet: Boolean(body.auto_quiet) };
        return { status: 200, json: async () => ({ ok: true, active_timer: activeTimer }) };
      }
      if (parsed.pathname === '/api/timers/pause') {
        activeTimer = { ...activeTimer, state: 'paused' };
        return { status: 200, json: async () => ({ ok: true, active_timer: activeTimer }) };
      }
      if (parsed.pathname === '/api/timers/resume') {
        activeTimer = { ...activeTimer, state: 'running' };
        return { status: 200, json: async () => ({ ok: true, active_timer: activeTimer }) };
      }
      if (parsed.pathname === '/api/timers/cancel') {
        activeTimer = null;
        return { status: 200, json: async () => ({ ok: true }) };
      }
      return { status: 404, json: async () => ({ ok: false }) };
    },
  });

  await ui.settle();
  ui.controller.setOpen(true);
  ui.render();
  await ui.settle();

  // 1. Chat tab: speaker_id chip + 传话 badge + broadcast toggle + quick rail (情景/早报/拍照/才艺).
  assert.ok(ui.find('control-voice-speaker-xs_user_v1'), 'voice bubble must display speaker_id chip');
  assert.ok(ui.find('control-voice-source-xs_user_b1'), 'broadcast bubble must display 传话 badge');
  assert.match(ui.copy, /方总/);
  assert.match(ui.copy, /传话/);

  ui.find('control-voice-broadcast-toggle').props.onPress();
  ui.render();
  ui.find('control-voice-input').props.onChangeText('准备开饭啦');
  ui.render();
  ui.find('control-voice-send-btn').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/broadcast' && c.body?.text === '准备开饭啦'));

  ui.find('control-voice-quick-scenes').props.onPress();
  ui.render();
  assert.ok(ui.find('control-voice-scene-bar'));
  ui.find('control-voice-scene-focus').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/scenes/run' && c.body?.id === 'focus'));

  ui.find('control-voice-quick-briefing').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/briefing'));

  ui.find('control-voice-quick-combos').props.onPress();
  ui.render();
  ui.find('control-voice-combo-new_year').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/combos/play' && c.body?.id === 'new_year'));
  ui.find('control-voice-combo-stop').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/combos/stop'));

  // 2. Style drawer: 白噪音 + 待机微动 + CONDITIONAL 声纹 HIDDEN when !speakersAvailable && speakers.length === 0!
  ui.find('control-voice-style-toggle').props.onPress();
  ui.render();
  await ui.settle();
  assert.ok(ui.find('control-voice-ambient-row'));
  assert.ok(ui.find('control-voice-idle-life-toggle'));
  assert.equal(ui.find('control-voice-speakers-section'), undefined, '声纹 section MUST stay hidden when unavailable and empty (zero fake wall)');

  ui.find('control-voice-ambient-rain').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/ambient' && c.body?.sound === 'rain' && c.body?.duration_min === 30));

  ui.find('control-voice-idle-life-toggle').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/idle_life' && c.body?.enabled === true));

  // 3. Reminders tab: live Pomodoro 1-second local countdown ticker + pause/resume/cancel + repeat picker.
  ui.find('control-voice-tab-reminders').props.onPress();
  ui.render();
  await ui.settle();
  assert.ok(ui.find('control-voice-timer-bar'));
  assert.ok(ui.find('control-voice-reminder-repeat-badge-rem_1'));

  ui.find('control-voice-timer-start-pomodoro').props.onPress();
  await ui.settle();
  assert.equal(ui.find('control-voice-timer-readout').props.children, '专注 25:00');
  const timerCallsBeforeTick = calls.filter(c => c.path === '/api/timers').length;
  ui.advance(3_000);
  assert.equal(ui.find('control-voice-timer-readout').props.children, '专注 24:57', '1s local ticker must count down without polling :8770');
  assert.equal(calls.filter(c => c.path === '/api/timers').length, timerCallsBeforeTick, 'local ticker must not hammer /api/timers');

  ui.find('control-voice-timer-pause').props.onPress();
  await ui.settle();
  ui.advance(2_000);
  assert.ok(ui.find('control-voice-timer-resume'));
  ui.find('control-voice-timer-cancel').props.onPress();
  await ui.settle();
  assert.equal(ui.find('control-voice-timer-readout'), undefined);

  ui.find('control-voice-reminder-repeat-weekdays').props.onPress();
  ui.render();
  ui.find('control-voice-reminder-content-input').props.onChangeText('晨会');
  ui.render();
  ui.find('control-voice-reminder-add').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/reminders/add' && c.body?.content === '晨会' && c.body?.repeat === 'weekdays'));

  // 4. Moments tab (时光): companion bond, 2-col photo grid, tap-to-preview modal + delete, diary generate + read.
  ui.find('control-voice-tab-moments').props.onPress();
  ui.render();
  await ui.settle();
  assert.ok(ui.find('control-voice-moments-view'));
  assert.equal(ui.find('control-voice-companion-days').props.children, '陪伴第7天');
  assert.match(ui.copy, /开心/);
  assert.ok(ui.find('control-voice-photo-item-pho_111122223333'));

  ui.find('control-voice-photo-item-pho_111122223333').props.onPress();
  ui.render();
  assert.ok(ui.find('control-voice-photo-preview'));
  assert.equal(ui.find('control-voice-photo-preview-image').props.source.uri, 'http://192.168.66.64:8770/api/photos/pho_111122223333.jpg');
  assert.match(ui.copy, /11-24 09:30/, 'photo preview must display local_time instead of UTC created_at');
  assert.doesNotMatch(ui.copy, /11-24 01:30/);
  ui.find('control-voice-photo-preview-delete').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/photos/delete' && c.body?.id === 'pho_111122223333'));
  assert.equal(ui.find('control-voice-photo-preview'), undefined);
  assert.ok(ui.find('control-voice-photos-empty'));

  ui.find('control-voice-moments-capture').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/photos/capture'));
  assert.ok(ui.find('control-voice-photo-item-pho_999988887777'));

  ui.find('control-voice-diary-generate').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/diary/generate'));
  ui.find('control-voice-diary-read-2026-11-24').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/diary/read' && c.body?.date === '2026-11-24'));

  // Zero-jargon rendered copy sweep across Wave 2 UI.
  assert.doesNotMatch(ui.copy, /暂未接入|仅作预览|暂不可用|清空上下文|AskMe|MemPalace|8770|8780|ONNX|Opus|TTS|ASR|EOT/);
  ui.unmount();
  assert.equal(ui.activeIntervals, 0, 'all intervals including 1s timer ticker must clean up on unmount');
});

test('Style drawer shows conditional 声纹 enroll/delete controls ONLY when speakersAvailable or speakers exist', async () => {
  const calls = [];
  let speakers = [{ name: '方总', samples: 2 }];
  const ui = mountVoicePanelHarness({
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(url);
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ method: init.method ?? 'GET', path: parsed.pathname, body });

      if (parsed.pathname === '/api/v1/agent/options') return { status: 404, json: async () => ({}) };
      if (parsed.pathname === '/api/status') {
        return { status: 200, json: async () => ({ ok: true, live_state: 'idle', speakers_available: true, speakers_count: speakers.length }) };
      }
      if (parsed.pathname === '/api/transcript') return { status: 200, json: async () => ({ ok: true, events: [] }) };
      if (parsed.pathname === '/api/persona') return { status: 200, json: async () => ({ ok: true, roles: [], voices: [] }) };
      if (parsed.pathname === '/api/ambient') return { status: 200, json: async () => ({ ok: true, active: false, sound: 'off' }) };
      if (parsed.pathname === '/api/speakers') return { status: 200, json: async () => ({ ok: true, available: true, speakers }) };
      if (parsed.pathname === '/api/speakers/enroll') {
        speakers = [...speakers, { name: body.name, samples: 1 }];
        return { status: 200, json: async () => ({ ok: true, name: body.name, samples: 1 }) };
      }
      if (parsed.pathname === '/api/speakers/delete') {
        speakers = speakers.filter(s => s.name !== body.name);
        return { status: 200, json: async () => ({ ok: true }) };
      }
      return { status: 404, json: async () => ({ ok: false }) };
    },
  });

  await ui.settle();
  ui.controller.setOpen(true);
  ui.render();
  await ui.settle();
  ui.find('control-voice-style-toggle').props.onPress();
  ui.render();
  await ui.settle();

  assert.ok(ui.find('control-voice-speakers-section'));
  assert.ok(ui.find('control-voice-speaker-item-方总'));
  ui.find('control-voice-speaker-input').props.onChangeText('小王');
  ui.render();
  ui.find('control-voice-speaker-enroll').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/speakers/enroll' && c.body?.name === '小王'));
  assert.ok(ui.find('control-voice-speaker-item-小王'));

  ui.find('control-voice-speaker-delete-方总').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/speakers/delete' && c.body?.name === '方总'));
  assert.equal(ui.find('control-voice-speaker-item-方总'), undefined);
  ui.unmount();
});

test('readXiaosuanCapabilities, updateXiaosuanCapabilities, and additive /api/status capabilities parse cleanly with legacy fallback', async () => {
  const calls = [];
  let state = {
    profile: 'assistant',
    profile_name: '日常助手',
    profiles: [
      { id: 'assistant', name: '日常助手' },
      { id: 'host', name: '展厅迎宾' },
      { id: 'companion', name: '家庭陪伴' },
    ],
    modules: {
      robot_control: true,
      memory: true,
      info_reminders: true,
      vision_nav: false,
      companion: false,
    },
    hardware: {
      camera: false,
      navigation: false,
      voiceprint: false,
      brainstem: true,
    },
    module_list: [
      { id: 'robot_control', name: '语音控狗', enabled: true, available: true, status_label: '已开' },
      { id: 'memory', name: '长期记忆', enabled: true, available: true, status_label: '已开' },
      { id: 'info_reminders', name: '联网与提醒', enabled: true, available: true, status_label: '已开' },
      { id: 'vision_nav', name: '视觉与导航', enabled: false, available: false, status_label: '未接硬件' },
      { id: 'companion', name: '陪伴与娱乐', enabled: false, available: true, status_label: '已关' },
    ],
    memory_acl: {
      read_rooms: ['user_long_term', 'customer_knowledge', 'episodic_events', 'robot_behavior'],
      write_rooms: ['user_long_term', 'customer_knowledge', 'episodic_events', 'robot_behavior'],
      allow_voice_write: true,
    },
    overrides: {},
    has_overrides: false,
  };

  const target = {
    origin: 'http://192.168.66.64:5050',
    allowLocalHttp: true,
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(url);
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ method: init.method ?? 'GET', origin: parsed.origin, path: parsed.pathname, body });

      if (parsed.pathname === '/api/status') {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            live_state: 'idle',
            profile: state.profile,
            profile_name: state.profile_name,
            capabilities: {
              profile: state.profile,
              profile_name: state.profile_name,
              modules: state.modules,
              hardware: state.hardware,
              memory_acl: state.memory_acl,
              has_overrides: state.has_overrides,
            },
          }),
        };
      }
      if (parsed.pathname === '/api/capabilities' && (init.method ?? 'GET') === 'GET') {
        return { status: 200, json: async () => ({ ok: true, ...state }) };
      }
      if (parsed.pathname === '/api/capabilities' && init.method === 'POST') {
        if (body?.reset) {
          state = {
            ...state,
            modules: { robot_control: true, memory: true, info_reminders: true, vision_nav: false, companion: false },
            overrides: {},
            has_overrides: false,
          };
        } else if (body?.profile === 'host') {
          state = {
            ...state,
            profile: 'host',
            profile_name: '展厅迎宾',
            modules: { robot_control: true, memory: true, info_reminders: false, vision_nav: false, companion: false },
            memory_acl: {
              read_rooms: ['customer_knowledge', 'robot_behavior'],
              write_rooms: [],
              allow_voice_write: false,
            },
            overrides: {},
            has_overrides: false,
          };
        } else if (body?.overrides) {
          const nextMods = { ...state.modules, ...body.overrides };
          state = {
            ...state,
            modules: nextMods,
            overrides: { ...state.overrides, ...body.overrides },
            has_overrides: true,
          };
        }
        state.module_list = [
          { id: 'robot_control', name: '语音控狗', enabled: state.modules.robot_control, available: true, status_label: state.modules.robot_control ? '已开' : '已关' },
          { id: 'memory', name: '长期记忆', enabled: state.modules.memory, available: true, status_label: state.modules.memory ? '已开' : '已关' },
          { id: 'info_reminders', name: '联网与提醒', enabled: state.modules.info_reminders, available: true, status_label: state.modules.info_reminders ? '已开' : '已关' },
          { id: 'vision_nav', name: '视觉与导航', enabled: false, available: false, status_label: '未接硬件' },
          { id: 'companion', name: '陪伴与娱乐', enabled: state.modules.companion, available: true, status_label: state.modules.companion ? '已开' : '已关' },
        ];
        return { status: 200, json: async () => ({ ok: true, ...state }) };
      }
      return { status: 404, json: async () => ({ ok: false }) };
    },
  };

  // Compact /api/status synthesizes moduleList & hardware availability cleanly.
  const statusSnap = await voiceService.fetchXiaosuanStatus(target);
  assert.equal(statusSnap.profile, 'assistant');
  assert.equal(statusSnap.profileName, '日常助手');
  assert.ok(statusSnap.capabilities);
  assert.equal(statusSnap.capabilities.modules.vision_nav, false);
  assert.equal(statusSnap.capabilities.modules.companion, false);
  const statusVision = statusSnap.capabilities.moduleList.find(m => m.id === 'vision_nav');
  assert.equal(statusVision.available, false);
  assert.equal(statusVision.statusLabel, '未接硬件');

  // Full GET /api/capabilities
  const fullCaps = await voiceService.readXiaosuanCapabilities(target);
  assert.equal(fullCaps.profile, 'assistant');
  assert.equal(fullCaps.profiles.length, 3);
  assert.equal(fullCaps.hasOverrides, false);
  assert.deepEqual([...fullCaps.memoryAcl.readRooms], ['user_long_term', 'customer_knowledge', 'episodic_events', 'robot_behavior']);

  // POST /api/capabilities profile switch -> host
  const switched = await voiceService.updateXiaosuanCapabilities(target, { profile: 'host' });
  assert.equal(switched.message, '已切迎宾');
  assert.equal(switched.capabilities.profile, 'host');
  assert.equal(switched.capabilities.profileName, '展厅迎宾');
  assert.equal(switched.capabilities.modules.info_reminders, false);
  assert.deepEqual([...switched.capabilities.memoryAcl.readRooms], ['customer_knowledge', 'robot_behavior']);
  assert.equal(switched.capabilities.memoryAcl.allowVoiceWrite, false);

  // POST /api/capabilities override -> companion ON
  const toggled = await voiceService.updateXiaosuanCapabilities(target, { overrides: { companion: true } });
  assert.equal(toggled.message, '陪伴与娱乐开');
  assert.equal(toggled.capabilities.modules.companion, true);
  assert.equal(toggled.capabilities.hasOverrides, true);

  // POST /api/capabilities reset
  const resetRes = await voiceService.updateXiaosuanCapabilities(target, { reset: true });
  assert.equal(resetRes.message, '已恢复默认');
  assert.equal(resetRes.capabilities.hasOverrides, false);
  assert.equal(resetRes.capabilities.modules.companion, false);

  // Empty mutation rejected
  await assert.rejects(() => voiceService.updateXiaosuanCapabilities(target, {}), err => err.code === 'config');

  // Legacy firmware without capabilities degrades with capabilities === null
  const legacyStatus = await voiceService.fetchXiaosuanStatus({
    origin: 'http://192.168.66.64:8770',
    allowLocalHttp: true,
    fetchImpl: async () => ({ status: 200, json: async () => ({ ok: true }) }),
  });
  assert.equal(legacyStatus.capabilities, null);
  assert.equal(legacyStatus.profile, 'assistant');
  assert.equal(legacyStatus.profileName, '日常助手');
  assert.ok(calls.every(c => c.origin === 'http://192.168.66.64:8770'));
});

test('3-role + 5-switch dynamic UI hides disabled tabs/rail/drawer sections, enforces host memory ACL & HUD reminder isolation, and skips disabled polling', async () => {
  const calls = [];
  const profileDefaults = {
    assistant: {
      name: '日常助手',
      modules: { robot_control: true, memory: true, info_reminders: true, vision_nav: false, companion: false },
      acl: {
        read_rooms: ['user_long_term', 'customer_knowledge', 'episodic_events', 'robot_behavior'],
        write_rooms: ['user_long_term', 'customer_knowledge', 'episodic_events', 'robot_behavior'],
        allow_voice_write: true,
      },
    },
    host: {
      name: '展厅迎宾',
      modules: { robot_control: true, memory: true, info_reminders: false, vision_nav: false, companion: false },
      acl: {
        read_rooms: ['customer_knowledge', 'robot_behavior'],
        write_rooms: [],
        allow_voice_write: false,
      },
    },
    companion: {
      name: '家庭陪伴',
      modules: { robot_control: true, memory: true, info_reminders: true, vision_nav: false, companion: true },
      acl: {
        read_rooms: ['user_long_term', 'customer_knowledge', 'episodic_events', 'robot_behavior'],
        write_rooms: ['user_long_term', 'customer_knowledge', 'episodic_events', 'robot_behavior'],
        allow_voice_write: true,
      },
    },
  };

  let activeProfile = 'assistant';
  let overrides = {};
  let hardware = { camera: false, navigation: false, voiceprint: false, brainstem: true };

  const buildCapPayload = () => {
    const def = profileDefaults[activeProfile];
    const visionAvail = hardware.camera || hardware.navigation;
    const rawMods = { ...def.modules, ...overrides };
    const effective = {
      robot_control: Boolean(rawMods.robot_control),
      memory: Boolean(rawMods.memory),
      info_reminders: Boolean(rawMods.info_reminders),
      vision_nav: visionAvail ? Boolean(rawMods.vision_nav) : false,
      companion: Boolean(rawMods.companion),
    };
    const module_list = [
      { id: 'robot_control', name: '语音控狗', enabled: effective.robot_control, available: true, status_label: effective.robot_control ? '已开' : '已关' },
      { id: 'memory', name: '长期记忆', enabled: effective.memory, available: true, status_label: effective.memory ? '已开' : '已关' },
      { id: 'info_reminders', name: '联网与提醒', enabled: effective.info_reminders, available: true, status_label: effective.info_reminders ? '已开' : '已关' },
      { id: 'vision_nav', name: '视觉与导航', enabled: effective.vision_nav, available: visionAvail, status_label: visionAvail ? (effective.vision_nav ? '已开' : '已关') : '未接硬件' },
      { id: 'companion', name: '陪伴与娱乐', enabled: effective.companion, available: true, status_label: effective.companion ? '已开' : '已关' },
    ];
    return {
      ok: true,
      profile: activeProfile,
      profile_name: def.name,
      profiles: [
        { id: 'assistant', name: '日常助手' },
        { id: 'host', name: '展厅迎宾' },
        { id: 'companion', name: '家庭陪伴' },
      ],
      modules: effective,
      hardware: { ...hardware },
      module_list,
      memory_acl: def.acl,
      overrides: { ...overrides },
      has_overrides: Object.keys(overrides).length > 0,
    };
  };

  const memories = [
    { id: 'm_user', text: '主人喝黑咖啡', room: 'user_long_term', pinned: true, updated_at: '2026-11-24T01:00:00Z' },
    { id: 'm_biz', text: '展厅营业时间早九晚六', room: 'customer_knowledge', pinned: false, updated_at: '2026-11-24T01:01:00Z' },
    { id: 'm_epi', text: '昨晚十点散步回家', room: 'episodic_events', pinned: false, updated_at: '2026-11-24T01:02:00Z' },
    { id: 'm_rule', text: '接待客人礼貌微笑', room: 'robot_behavior', pinned: false, updated_at: '2026-11-24T01:03:00Z' },
  ];

  const ui = mountVoicePanelHarness({
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(url);
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ method: init.method ?? 'GET', path: parsed.pathname, body });

      if (parsed.pathname === '/api/v1/agent/options') return { status: 404, json: async () => ({}) };
      if (parsed.pathname === '/api/status') {
        const cap = buildCapPayload();
        return {
          status: 200,
          json: async () => ({
            ok: true,
            live_state: 'idle',
            emotion: 'happy',
            quiet_mode: false,
            volume: 65,
            pending_reminders: 3,
            photos_count: 2,
            profile: cap.profile,
            profile_name: cap.profile_name,
            capabilities: {
              profile: cap.profile,
              profile_name: cap.profile_name,
              modules: cap.modules,
              hardware: cap.hardware,
              memory_acl: cap.memory_acl,
              has_overrides: cap.has_overrides,
            },
          }),
        };
      }
      if (parsed.pathname === '/api/capabilities' && (init.method ?? 'GET') === 'GET') {
        return { status: 200, json: async () => buildCapPayload() };
      }
      if (parsed.pathname === '/api/capabilities' && init.method === 'POST') {
        if (body?.reset) {
          overrides = {};
        } else if (body?.profile && profileDefaults[body.profile]) {
          activeProfile = body.profile;
          overrides = {};
        } else if (body?.overrides) {
          overrides = { ...overrides, ...body.overrides };
        }
        return { status: 200, json: async () => buildCapPayload() };
      }
      if (parsed.pathname === '/api/transcript') return { status: 200, json: async () => ({ ok: true, events: [] }) };
      if (parsed.pathname === '/api/persona') return { status: 200, json: async () => ({ ok: true, role: 'xiaosuan', voice: 'xiaosuan', roles: [], voices: [] }) };
      if (parsed.pathname === '/api/memory/palace') {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            memories,
            room_counts: { user_long_term: 1, customer_knowledge: 1, episodic_events: 1, robot_behavior: 1 },
          }),
        };
      }
      if (parsed.pathname === '/api/reminders') return { status: 200, json: async () => ({ ok: true, reminders: [] }) };
      if (parsed.pathname === '/api/timers') return { status: 200, json: async () => ({ ok: true, active_timer: null }) };
      if (parsed.pathname === '/api/photos') {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            photos: [{ id: 'pho_aaaa11112222', caption: '前视快照', emotion: 'happy', local_time: '2026-11-24 14:00:00', created_ts: 1795413600 }],
          }),
        };
      }
      if (parsed.pathname === '/api/diary') {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            diaries: [{ date: '2026-11-24', text: '今天心情很好。', mood: 'happy', mood_label: '开心', photo_ids: [] }],
          }),
        };
      }
      if (parsed.pathname === '/api/ambient') return { status: 200, json: async () => ({ ok: true, active: false, sound: 'off' }) };
      if (parsed.pathname === '/api/speakers') return { status: 200, json: async () => ({ ok: true, available: false, speakers: [] }) };
      return { status: 404, json: async () => ({ ok: false }) };
    },
  });

  await ui.settle();
  ui.controller.setOpen(true);
  ui.render();
  await ui.settle();

  // 1. Default assistant (日常助手): 3 tabs (对话/记忆/提醒), 时光 hidden, vision/companion quick chips hidden.
  assert.equal(ui.find('control-voice-role-pill-label').props.children, '日常助手');
  assert.equal(ui.find('control-voice-override-dot'), undefined);
  assert.ok(ui.find('control-voice-tab-chat'));
  assert.ok(ui.find('control-voice-tab-memory'));
  assert.ok(ui.find('control-voice-tab-reminders'));
  assert.equal(ui.find('control-voice-tab-moments'), undefined, '时光 tab must be hidden when vision_nav & companion are OFF');
  assert.equal(ui.controller.pendingRemindersCount, 3);

  assert.ok(ui.find('control-voice-quick-查看状态'));
  assert.ok(ui.find('control-voice-quick-打招呼'));
  assert.ok(ui.find('control-voice-quick-坐下'));
  assert.ok(ui.find('control-voice-quick-今天天气'));
  assert.ok(ui.find('control-voice-quick-briefing'));
  assert.equal(ui.find('control-voice-quick-photo'), undefined, '拍照 must be hidden when vision_nav is OFF');
  assert.equal(ui.find('control-voice-quick-看看前面'), undefined, '看看前面 must be hidden when vision_nav is OFF');
  assert.equal(ui.find('control-voice-quick-scenes'), undefined, '情景 must be hidden when companion is OFF');
  assert.equal(ui.find('control-voice-quick-combos'), undefined, '才艺 must be hidden when companion is OFF');

  // 2. Open Drawer -> 样式 tab shows 3 role pills, hides 白噪音/待机微动/声纹, and SKIPS /api/ambient & /api/speakers polling!
  ui.find('control-voice-style-toggle').props.onPress();
  ui.render();
  await ui.settle();
  assert.ok(ui.find('control-voice-drawer-tabs'));
  assert.ok(ui.find('control-voice-profile-assistant'));
  assert.ok(ui.find('control-voice-profile-host'));
  assert.ok(ui.find('control-voice-profile-companion'));
  assert.equal(ui.find('control-voice-ambient-row'), undefined, '白噪音 hidden when companion is OFF');
  assert.equal(ui.find('control-voice-idle-life-row'), undefined, '待机微动 hidden when companion is OFF');
  assert.equal(ui.find('control-voice-speakers-section'), undefined, '声纹 hidden when companion is OFF');
  assert.equal(calls.filter(c => c.path === '/api/ambient' || c.path === '/api/speakers').length, 0, 'must skip ambient/speakers polling when companion is OFF');

  // 3. Switch Drawer to 能力 tab -> 5 modules; vision_nav shows 未接硬件 badge (NO fake toggle!); 恢复默认 hidden.
  ui.find('control-voice-drawer-tab-capabilities').props.onPress();
  ui.render();
  assert.ok(ui.find('control-voice-drawer-capabilities-view'));
  assert.ok(ui.find('control-voice-cap-toggle-robot_control'));
  assert.ok(ui.find('control-voice-cap-toggle-memory'));
  assert.ok(ui.find('control-voice-cap-toggle-info_reminders'));
  assert.ok(ui.find('control-voice-cap-toggle-companion'));
  assert.equal(ui.find('control-voice-cap-toggle-vision_nav'), undefined, 'unavailable vision_nav must NOT render a fake toggle');
  assert.equal(ui.find('control-voice-cap-status-vision_nav').props.children.props.children, '未接硬件');
  assert.equal(ui.find('control-voice-cap-reset'), undefined, '恢复默认 must stay hidden when hasOverrides is false');

  // 4. Unified 4-char memory labels + writable add/edit/pin/delete controls in 日常助手 mode.
  ui.find('control-voice-tab-memory').props.onPress();
  ui.render();
  await ui.settle();
  assert.match(ui.copy, /人物画像/);
  assert.match(ui.copy, /业务知识/);
  assert.match(ui.copy, /过往记录/);
  assert.match(ui.copy, /交互规范/);
  assert.ok(ui.find('control-voice-memory-item-m_user'));
  assert.ok(ui.find('control-voice-memory-item-m_biz'));
  assert.ok(ui.find('control-voice-memory-add-bar'), 'writable assistant mode must show add bar');
  assert.ok(ui.find('control-voice-memory-pin-m_biz'));
  assert.ok(ui.find('control-voice-memory-edit-m_biz'));
  assert.ok(ui.find('control-voice-memory-delete-m_biz'));

  // 5. Switch to 展厅迎宾 (host) -> hides 提醒 tab, zeroes pendingRemindersCount (HUD privacy!), filters memory ACL to 业务知识 + 交互规范 ONLY, and hides write controls when writeRooms=[].
  ui.find('control-voice-drawer-tab-style').props.onPress();
  ui.render();
  ui.find('control-voice-profile-host').props.onPress();
  await ui.settle();
  assert.equal(ui.find('control-voice-role-pill-label').props.children, '展厅迎宾');
  assert.equal(ui.controller.pendingRemindersCount, 0, 'host mode must expose pendingRemindersCount = 0 so no private badge leaks on HUD');
  assert.equal(ui.find('control-voice-tab-reminders'), undefined, '提醒 tab hidden in host mode');
  assert.equal(ui.find('control-voice-tab-moments'), undefined, '时光 tab hidden in host mode');
  assert.equal(ui.find('control-voice-memory-filter-user_long_term'), undefined, 'host mode must hide 人物画像 filter');
  assert.equal(ui.find('control-voice-memory-filter-episodic_events'), undefined, 'host mode must hide 过往记录 filter');
  assert.ok(ui.find('control-voice-memory-filter-customer_knowledge'));
  assert.ok(ui.find('control-voice-memory-filter-robot_behavior'));
  assert.equal(ui.find('control-voice-memory-item-m_user'), undefined, 'host mode must filter out private user_long_term items');
  assert.equal(ui.find('control-voice-memory-item-m_epi'), undefined, 'host mode must filter out private episodic_events items');
  assert.ok(ui.find('control-voice-memory-item-m_biz'));
  assert.ok(ui.find('control-voice-memory-item-m_rule'));
  assert.equal(ui.find('control-voice-memory-add-bar'), undefined, 'read-only host mode must hide add bar when writeRooms=[]');
  assert.equal(ui.find('control-voice-memory-pin-m_biz'), undefined, 'read-only host mode must hide pin button');
  assert.equal(ui.find('control-voice-memory-edit-m_biz'), undefined, 'read-only host mode must hide edit button');
  assert.equal(ui.find('control-voice-memory-delete-m_biz'), undefined, 'read-only host mode must hide delete button');
  assert.equal(ui.find('control-voice-memory-pin-m_rule'), undefined);
  assert.equal(ui.find('control-voice-memory-edit-m_rule'), undefined);
  assert.equal(ui.find('control-voice-memory-delete-m_rule'), undefined);
  assert.equal(ui.find('control-voice-memory-count').props.children.props.children, '2', 'memory count badge must exclude hidden private rooms');
  assert.equal(calls.filter(c => c.path === '/api/reminders' || c.path === '/api/timers').length, 0, 'must never poll reminders/timers when info_reminders is OFF');

  // 6. Switch to 家庭陪伴 (companion) -> restores memory write controls, 时光 tab appears with 陪伴 + 日记 (NO 相册 since vision_nav=F), 白噪音/待机微动 appear in 样式 drawer!
  ui.find('control-voice-profile-companion').props.onPress();
  await ui.settle();
  assert.equal(ui.find('control-voice-role-pill-label').props.children, '家庭陪伴');
  assert.ok(ui.find('control-voice-memory-add-bar'), 'writable companion mode restores add bar');
  assert.ok(ui.find('control-voice-memory-edit-m_biz'), 'writable companion mode restores per-card actions');
  assert.ok(ui.find('control-voice-ambient-row'), '白噪音 visible when companion is ON');
  assert.ok(ui.find('control-voice-idle-life-row'), '待机微动 visible when companion is ON');
  assert.ok(calls.some(c => c.path === '/api/ambient'), 'ambient loads on demand once companion is enabled');
  assert.ok(ui.find('control-voice-tab-moments'));
  assert.ok(ui.find('control-voice-tab-reminders'));

  ui.find('control-voice-tab-moments').props.onPress();
  ui.render();
  await ui.settle();
  assert.ok(ui.find('control-voice-companion-strip'));
  assert.ok(ui.find('control-voice-diaries-section'));
  assert.equal(ui.find('control-voice-photos-section'), undefined, '相册 hidden inside 时光 when vision_nav is OFF');
  assert.equal(calls.filter(c => c.path === '/api/photos').length, 0, 'must skip /api/photos polling when vision_nav is OFF');
  assert.ok(calls.some(c => c.path === '/api/diary'), 'diary fetches when companion is ON');

  // 7. Turn OFF companion switch while viewing 时光 tab -> auto-fallback activeTab to chat, override dot + 恢复默认 appear!
  ui.find('control-voice-drawer-tab-capabilities').props.onPress();
  ui.render();
  ui.find('control-voice-cap-toggle-companion').props.onPress();
  await ui.settle();
  assert.equal(ui.controller.activeTab, 'chat', 'disabling active tab module must auto-fallback to chat');
  assert.equal(ui.find('control-voice-tab-moments'), undefined);
  assert.ok(ui.find('control-voice-override-dot'), 'header must show subtle override dot when custom overrides exist');
  assert.ok(ui.find('control-voice-cap-reset'), '恢复默认 must appear when hasOverrides is true');

  // 8. Reset overrides -> restores companion default and clears override dot + 恢复默认.
  ui.find('control-voice-cap-reset').props.onPress();
  await ui.settle();
  assert.equal(ui.find('control-voice-override-dot'), undefined);
  assert.equal(ui.find('control-voice-cap-reset'), undefined);
  assert.ok(ui.find('control-voice-tab-moments'));

  // 9. Hardware attached (camera=true) + enable vision_nav while turning companion OFF -> 时光 shows 相册 ONLY and polls /api/photos!
  hardware = { camera: true, navigation: false, voiceprint: false, brainstem: true };
  ui.find('control-voice-cap-toggle-companion').props.onPress();
  await ui.settle();
  assert.ok(ui.find('control-voice-cap-toggle-vision_nav'), 'camera attached exposes real vision_nav toggle');
  assert.equal(ui.find('control-voice-cap-status-vision_nav'), undefined);
  ui.find('control-voice-cap-toggle-vision_nav').props.onPress();
  await ui.settle();
  assert.ok(ui.find('control-voice-quick-photo'));
  assert.ok(ui.find('control-voice-quick-看看前面'));
  ui.find('control-voice-tab-moments').props.onPress();
  ui.render();
  await ui.settle();
  assert.ok(ui.find('control-voice-photos-section'));
  assert.equal(ui.find('control-voice-companion-strip'), undefined);
  assert.equal(ui.find('control-voice-diaries-section'), undefined);
  assert.ok(calls.some(c => c.path === '/api/photos'));

  // 10. Turn OFF all 5 switches -> auto-fallback to chat, segmented tabs collapse cleanly, empty quick rail hides cleanly.
  ui.find('control-voice-cap-toggle-vision_nav').props.onPress();
  await ui.settle();
  ui.find('control-voice-cap-toggle-memory').props.onPress();
  await ui.settle();
  ui.find('control-voice-cap-toggle-info_reminders').props.onPress();
  await ui.settle();
  ui.find('control-voice-cap-toggle-robot_control').props.onPress();
  await ui.settle();
  assert.equal(ui.controller.activeTab, 'chat');
  assert.equal(ui.find('control-voice-tab-memory'), undefined);
  assert.equal(ui.find('control-voice-tab-reminders'), undefined);
  assert.equal(ui.find('control-voice-tab-moments'), undefined);
  assert.equal(ui.find('control-voice-tab-chat'), undefined, 'single-tab segmented track collapses cleanly');
  assert.equal(ui.find('control-voice-quick-rail'), undefined, 'empty quick rail hides cleanly when all action modules are OFF');

  // 11. Strict zero-jargon / zero-fake-wall check across rendered copy.
  assert.doesNotMatch(ui.copy, /暂未接入|仅作预览|暂不可用|清空上下文|AskMe|MemPalace|8770|8780|ONNX|Opus|TTS|ASR|EOT|ACL/);
  ui.unmount();
  assert.equal(ui.activeIntervals, 0);
});

test('Memory tab restricts add/edit room pickers and per-card write actions strictly to memoryAcl.writeRooms', async () => {
  const calls = [];
  const cap = {
    ok: true,
    profile: 'host',
    profile_name: '展厅迎宾',
    profiles: [
      { id: 'assistant', name: '日常助手' },
      { id: 'host', name: '展厅迎宾' },
      { id: 'companion', name: '家庭陪伴' },
    ],
    modules: { robot_control: true, memory: true, info_reminders: false, vision_nav: false, companion: false },
    hardware: { camera: false, navigation: false, voiceprint: false, brainstem: true },
    module_list: [
      { id: 'robot_control', name: '语音控狗', enabled: true, available: true, status_label: '已开' },
      { id: 'memory', name: '长期记忆', enabled: true, available: true, status_label: '已开' },
      { id: 'info_reminders', name: '联网与提醒', enabled: false, available: true, status_label: '已关' },
      { id: 'vision_nav', name: '视觉与导航', enabled: false, available: false, status_label: '未接硬件' },
      { id: 'companion', name: '陪伴与娱乐', enabled: false, available: true, status_label: '已关' },
    ],
    memory_acl: {
      read_rooms: ['customer_knowledge', 'robot_behavior'],
      write_rooms: ['customer_knowledge'],
      allow_voice_write: false,
    },
    overrides: {},
    has_overrides: false,
  };
  const ui = mountVoicePanelHarness({
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(url);
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ method: init.method ?? 'GET', path: parsed.pathname, body });
      if (parsed.pathname === '/api/v1/agent/options') return { status: 404, json: async () => ({}) };
      if (parsed.pathname === '/api/status') {
        return { status: 200, json: async () => ({ ok: true, live_state: 'idle', profile: 'host', profile_name: '展厅迎宾', capabilities: cap }) };
      }
      if (parsed.pathname === '/api/capabilities') return { status: 200, json: async () => cap };
      if (parsed.pathname === '/api/transcript') return { status: 200, json: async () => ({ ok: true, events: [] }) };
      if (parsed.pathname === '/api/persona') return { status: 200, json: async () => ({ ok: true, roles: [], voices: [] }) };
      if (parsed.pathname === '/api/memory/palace') {
        return {
          status: 200,
          json: async () => ({
            ok: true,
            memories: [
              { id: 'm_biz', text: '产品参数表', room: 'customer_knowledge', pinned: false, updated_at: '2026-11-24T01:00:00Z' },
              { id: 'm_rule', text: '保持微笑', room: 'robot_behavior', pinned: false, updated_at: '2026-11-24T01:01:00Z' },
            ],
            room_counts: { user_long_term: 0, customer_knowledge: 1, episodic_events: 0, robot_behavior: 1 },
          }),
        };
      }
      if (parsed.pathname === '/api/memory/add') return { status: 200, json: async () => ({ ok: true, message: '已记住' }) };
      return { status: 404, json: async () => ({ ok: false }) };
    },
  });

  await ui.settle();
  ui.controller.setOpen(true);
  ui.render();
  await ui.settle();

  ui.find('control-voice-tab-memory').props.onPress();
  ui.render();
  await ui.settle();

  // Writable room card shows pin/edit/delete; read-only room card hides them.
  assert.ok(ui.find('control-voice-memory-item-m_biz'));
  assert.ok(ui.find('control-voice-memory-pin-m_biz'));
  assert.ok(ui.find('control-voice-memory-edit-m_biz'));
  assert.ok(ui.find('control-voice-memory-delete-m_biz'));
  assert.ok(ui.find('control-voice-memory-item-m_rule'));
  assert.equal(ui.find('control-voice-memory-pin-m_rule'), undefined);
  assert.equal(ui.find('control-voice-memory-edit-m_rule'), undefined);
  assert.equal(ui.find('control-voice-memory-delete-m_rule'), undefined);

  // Add bar room selector stays locked to writable rooms only (业务知识).
  assert.ok(ui.find('control-voice-memory-add-bar'));
  assert.equal(ui.find('control-voice-memory-room-select').props.accessibilityLabel, '分类 业务知识');
  ui.find('control-voice-memory-room-select').props.onPress();
  ui.render();
  assert.equal(ui.find('control-voice-memory-room-select').props.accessibilityLabel, '分类 业务知识');
  ui.find('control-voice-memory-input').props.onChangeText('新品发布会');
  ui.render();
  ui.find('control-voice-memory-add').props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.path === '/api/memory/add' && c.body?.room === 'customer_knowledge' && c.body?.text === '新品发布会'));

  // Edit room picker also stays restricted to writeRooms only.
  ui.find('control-voice-memory-edit-m_biz').props.onPress();
  ui.render();
  assert.equal(ui.find('control-voice-memory-edit-room').props.accessibilityLabel, '分类 业务知识');
  ui.find('control-voice-memory-edit-room').props.onPress();
  ui.render();
  assert.equal(ui.find('control-voice-memory-edit-room').props.accessibilityLabel, '分类 业务知识');
  ui.unmount();
});

test('voice_walk safety lock contract defaults false, parses safety_lock & status labels, and returns concise walk toasts', async () => {
  assert.deepEqual([...voiceService.CAPABILITY_MODULE_ORDER], [
    'robot_control',
    'voice_walk',
    'memory',
    'info_reminders',
    'vision_nav',
    'companion',
  ]);
  assert.equal(voiceService.CAPABILITY_MODULE_LABELS.voice_walk, '语音走动');
  assert.equal(voiceService.DEFAULT_LEGACY_CAPABILITIES.modules.voice_walk, false);
  const legacyWalk = voiceService.DEFAULT_LEGACY_CAPABILITIES.moduleList[1];
  assert.equal(legacyWalk.id, 'voice_walk');
  assert.equal(legacyWalk.name, '语音走动');
  assert.equal(legacyWalk.enabled, false);
  assert.equal(legacyWalk.statusLabel, '已锁定');
  assert.equal(legacyWalk.safetyLock, true);

  for (const profile of ['assistant', 'host', 'companion']) {
    const parsed = voiceService.parseRobotCapabilitiesPayload({ profile });
    assert.equal(parsed.modules.voice_walk, false, `${profile} must default voice_walk to false`);
    const entry = parsed.moduleList[1];
    assert.equal(entry.id, 'voice_walk');
    assert.equal(entry.enabled, false);
    assert.equal(entry.available, true);
    assert.equal(entry.statusLabel, '已锁定');
    assert.equal(entry.safetyLock, true);
  }

  // When robot_control is OFF, voice_walk MUST remain locked & unavailable with crisp 需开控狗 label.
  const lockedByRobotOff = voiceService.parseRobotCapabilitiesPayload({
    profile: 'assistant',
    modules: { robot_control: false, voice_walk: true },
    module_list: [
      { id: 'robot_control', name: '语音控狗', enabled: false, available: true, status_label: '已关' },
      { id: 'voice_walk', name: '语音走动', enabled: false, available: false, status_label: '需开控狗', safety_lock: true },
    ],
  });
  assert.equal(lockedByRobotOff.modules.robot_control, false);
  assert.equal(lockedByRobotOff.modules.voice_walk, false);
  assert.equal(lockedByRobotOff.moduleList[1].available, false);
  assert.equal(lockedByRobotOff.moduleList[1].enabled, false);
  assert.equal(lockedByRobotOff.moduleList[1].statusLabel, '需开控狗');
  assert.equal(lockedByRobotOff.moduleList[1].safetyLock, true);

  const calls = [];
  let walkArmed = false;
  const target = {
    origin: 'http://192.168.66.64:5050',
    allowLocalHttp: true,
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(url);
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ method: init.method ?? 'GET', path: parsed.pathname, body });
      if (parsed.pathname === '/api/capabilities' && init.method === 'POST') {
        if (typeof body?.overrides?.voice_walk === 'boolean') {
          walkArmed = body.overrides.voice_walk;
        }
        return {
          status: 200,
          json: async () => ({
            ok: true,
            profile: 'assistant',
            profile_name: '日常助手',
            modules: {
              robot_control: true,
              voice_walk: walkArmed,
              memory: true,
              info_reminders: true,
              vision_nav: false,
              companion: false,
            },
            module_list: [
              { id: 'robot_control', name: '语音控狗', enabled: true, available: true, status_label: '已开' },
              { id: 'voice_walk', name: '语音走动', enabled: walkArmed, available: true, status_label: '', safety_lock: true },
              { id: 'memory', name: '长期记忆', enabled: true, available: true, status_label: '已开' },
              { id: 'info_reminders', name: '联网与提醒', enabled: true, available: true, status_label: '已开' },
              { id: 'vision_nav', name: '视觉与导航', enabled: false, available: false, status_label: '未接硬件' },
              { id: 'companion', name: '陪伴与娱乐', enabled: false, available: true, status_label: '已关' },
            ],
            overrides: {},
            has_overrides: false,
          }),
        };
      }
      return { status: 404, json: async () => ({ ok: false }) };
    },
  };

  const armedRes = await voiceService.updateXiaosuanCapabilities(target, { overrides: { voice_walk: true } });
  assert.equal(armedRes.message, '走动已开启');
  assert.equal(armedRes.capabilities.modules.voice_walk, true);
  assert.equal(armedRes.capabilities.moduleList[1].enabled, true);
  assert.equal(armedRes.capabilities.moduleList[1].statusLabel, '已解锁');
  assert.equal(armedRes.capabilities.moduleList[1].safetyLock, true);

  const lockedRes = await voiceService.updateXiaosuanCapabilities(target, { overrides: { voice_walk: false } });
  assert.equal(lockedRes.message, '走动已锁定');
  assert.equal(lockedRes.capabilities.modules.voice_walk, false);
  assert.equal(lockedRes.capabilities.moduleList[1].enabled, false);
  assert.equal(lockedRes.capabilities.moduleList[1].statusLabel, '已锁定');
  assert.equal(calls.length, 2);
});

test('voice_walk safety lock UI renders under 语音控狗, toggles 已锁定/已解锁 with toast, auto-disarms on status update/profile switch, and hides cleanly when robot_control is OFF', async () => {
  const calls = [];
  let activeProfile = 'assistant';
  let robotControlOn = true;
  let voiceWalkArmed = false;
  let forceWalkUnavailable = false;
  const profileNames = { assistant: '日常助手', host: '展厅迎宾', companion: '家庭陪伴' };

  const buildCap = () => {
    const walkAvail = robotControlOn && !forceWalkUnavailable;
    const walkEnabled = walkAvail && voiceWalkArmed;
    return {
      ok: true,
      profile: activeProfile,
      profile_name: profileNames[activeProfile],
      profiles: [
        { id: 'assistant', name: '日常助手' },
        { id: 'host', name: '展厅迎宾' },
        { id: 'companion', name: '家庭陪伴' },
      ],
      modules: {
        robot_control: robotControlOn,
        voice_walk: walkEnabled,
        memory: true,
        info_reminders: activeProfile !== 'host',
        vision_nav: false,
        companion: activeProfile === 'companion',
      },
      hardware: { camera: false, navigation: false, voiceprint: false, brainstem: true },
      module_list: [
        { id: 'robot_control', name: '语音控狗', enabled: robotControlOn, available: true, status_label: robotControlOn ? '已开' : '已关' },
        { id: 'voice_walk', name: '语音走动', enabled: walkEnabled, available: walkAvail, status_label: walkAvail ? '' : '需开控狗', safety_lock: true },
        { id: 'memory', name: '长期记忆', enabled: true, available: true, status_label: '已开' },
        { id: 'info_reminders', name: '联网与提醒', enabled: activeProfile !== 'host', available: true, status_label: activeProfile !== 'host' ? '已开' : '已关' },
        { id: 'vision_nav', name: '视觉与导航', enabled: false, available: false, status_label: '未接硬件' },
        { id: 'companion', name: '陪伴与娱乐', enabled: activeProfile === 'companion', available: true, status_label: activeProfile === 'companion' ? '已开' : '已关' },
      ],
      memory_acl: {
        read_rooms: ['user_long_term', 'customer_knowledge', 'episodic_events', 'robot_behavior'],
        write_rooms: ['user_long_term', 'customer_knowledge', 'episodic_events', 'robot_behavior'],
        allow_voice_write: true,
      },
      overrides: robotControlOn ? {} : { robot_control: false },
      has_overrides: !robotControlOn,
    };
  };

  const ui = mountVoicePanelHarness({
    fetchImpl: async (url, init = {}) => {
      const parsed = new URL(url);
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ method: init.method ?? 'GET', path: parsed.pathname, body });

      if (parsed.pathname === '/api/v1/agent/options') return { status: 404, json: async () => ({}) };
      if (parsed.pathname === '/api/status') {
        const cap = buildCap();
        return {
          status: 200,
          json: async () => ({
            ok: true,
            live_state: 'idle',
            emotion: 'neutral',
            profile: cap.profile,
            profile_name: cap.profile_name,
            capabilities: {
              profile: cap.profile,
              profile_name: cap.profile_name,
              modules: cap.modules,
              hardware: cap.hardware,
              module_list: cap.module_list,
              memory_acl: cap.memory_acl,
              has_overrides: cap.has_overrides,
            },
          }),
        };
      }
      if (parsed.pathname === '/api/transcript') {
        const cap = buildCap();
        return {
          status: 200,
          json: async () => ({
            ok: true,
            live_state: 'idle',
            emotion: 'neutral',
            events: [],
            profile: cap.profile,
            profile_name: cap.profile_name,
            capabilities: {
              profile: cap.profile,
              profile_name: cap.profile_name,
              modules: cap.modules,
              hardware: cap.hardware,
              module_list: cap.module_list,
              memory_acl: cap.memory_acl,
              has_overrides: cap.has_overrides,
            },
          }),
        };
      }
      if (parsed.pathname === '/api/capabilities' && (init.method ?? 'GET') === 'GET') {
        return { status: 200, json: async () => buildCap() };
      }
      if (parsed.pathname === '/api/capabilities' && init.method === 'POST') {
        if (body?.reset) {
          robotControlOn = true;
          voiceWalkArmed = false;
        } else if (body?.profile && profileNames[body.profile]) {
          activeProfile = body.profile;
          robotControlOn = true;
          voiceWalkArmed = false;
        } else if (body?.overrides) {
          if (typeof body.overrides.robot_control === 'boolean') {
            robotControlOn = body.overrides.robot_control;
            if (!robotControlOn) voiceWalkArmed = false;
          }
          if (typeof body.overrides.voice_walk === 'boolean') {
            voiceWalkArmed = robotControlOn ? body.overrides.voice_walk : false;
          }
        }
        return { status: 200, json: async () => buildCap() };
      }
      if (parsed.pathname === '/api/persona') return { status: 200, json: async () => ({ ok: true, roles: [], voices: [] }) };
      return { status: 404, json: async () => ({ ok: false }) };
    },
  });

  await ui.settle();
  ui.controller.setOpen(true);
  ui.render();
  await ui.settle();

  // 1. Open drawer -> 能力 tab: 语音走动 appears right beneath 语音控狗 and starts 已锁定.
  ui.find('control-voice-style-toggle').props.onPress();
  ui.render();
  ui.find('control-voice-drawer-tab-capabilities').props.onPress();
  ui.render();
  await ui.settle();

  const capListNode = ui.find('control-voice-drawer-capabilities-view');
  const rowIds = capListNode.props.children[0].filter(Boolean).map(n => n.props.testID);
  assert.equal(rowIds[0], 'control-voice-cap-row-robot_control');
  assert.equal(rowIds[1], 'control-voice-cap-row-voice_walk', '语音走动 must render directly beneath 语音控狗');
  assert.equal(ui.controller.capabilities.modules.voice_walk, false);
  const walkToggleInitial = ui.find('control-voice-cap-toggle-voice_walk');
  assert.equal(walkToggleInitial.props.accessibilityState.checked, false);
  assert.equal(walkToggleInitial.props.children.props.children, '已锁定');
  assert.equal(ui.find('control-voice-walk-unlocked-indicator'), undefined);

  // 2. Toggle voice_walk ON -> POST /api/capabilities, amber indicator + 已解锁 + 走动已开启 toast.
  walkToggleInitial.props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.method === 'POST' && c.path === '/api/capabilities' && c.body?.overrides?.voice_walk === true));
  assert.equal(ui.controller.capabilities.modules.voice_walk, true);
  assert.equal(ui.controller.noticeText, '走动已开启');
  const walkToggleOn = ui.find('control-voice-cap-toggle-voice_walk');
  assert.equal(walkToggleOn.props.accessibilityState.checked, true);
  assert.equal(walkToggleOn.props.children.props.children, '已解锁');
  assert.ok(ui.find('control-voice-walk-unlocked-indicator'), 'amber unlocked indicator must show when voice_walk is ON');

  // 3. Toggle voice_walk OFF -> POST /api/capabilities, 已锁定 + 走动已锁定 toast.
  walkToggleOn.props.onPress();
  await ui.settle();
  assert.ok(calls.some(c => c.method === 'POST' && c.path === '/api/capabilities' && c.body?.overrides?.voice_walk === false));
  assert.equal(ui.controller.capabilities.modules.voice_walk, false);
  assert.equal(ui.controller.noticeText, '走动已锁定');
  assert.equal(ui.find('control-voice-cap-toggle-voice_walk').props.children.props.children, '已锁定');
  assert.equal(ui.find('control-voice-walk-unlocked-indicator'), undefined);

  // 4. Auto-disarm on profile switch: unlock voice_walk, switch to host -> immediately locked.
  ui.find('control-voice-cap-toggle-voice_walk').props.onPress();
  await ui.settle();
  assert.equal(ui.controller.capabilities.modules.voice_walk, true);
  ui.find('control-voice-drawer-tab-style').props.onPress();
  ui.render();
  ui.find('control-voice-profile-host').props.onPress();
  await ui.settle();
  assert.equal(ui.controller.capabilities.modules.voice_walk, false, 'profile switch must auto-disarm voice_walk');
  assert.equal(ui.find('control-voice-walk-unlocked-indicator'), undefined);
  ui.find('control-voice-drawer-tab-capabilities').props.onPress();
  ui.render();
  await ui.settle();
  assert.equal(ui.find('control-voice-cap-toggle-voice_walk').props.children.props.children, '已锁定');

  // 5. Auto-disarm reflected on foreground transcript poll (e.g. server-side estop).
  ui.find('control-voice-cap-toggle-voice_walk').props.onPress();
  await ui.settle();
  assert.equal(ui.controller.capabilities.modules.voice_walk, true);
  voiceWalkArmed = false; // Simulate estop disarm on robot
  ui.advance(1_200);
  await ui.settle();
  assert.equal(ui.controller.capabilities.modules.voice_walk, false, 'status update on poll must reflect estop auto-disarm');
  assert.equal(ui.find('control-voice-cap-toggle-voice_walk').props.children.props.children, '已锁定');
  assert.equal(ui.find('control-voice-walk-unlocked-indicator'), undefined);

  // 6. Auto-disarm reflected on background /api/status poll while panel is collapsed.
  ui.find('control-voice-cap-toggle-voice_walk').props.onPress();
  await ui.settle();
  assert.equal(ui.controller.capabilities.modules.voice_walk, true);
  ui.controller.setOpen(false);
  ui.render();
  voiceWalkArmed = false; // Simulate estop disarm while collapsed
  ui.advance(2_500);
  await ui.settle();
  assert.equal(ui.controller.capabilities.modules.voice_walk, false, 'collapsed /api/status poll must reflect auto-disarm');

  // 7. Turning robot_control OFF auto-disarms & cleanly hides 语音走动 (zero fake toggle wall!).
  ui.controller.setOpen(true);
  ui.render();
  await ui.settle();
  ui.find('control-voice-style-toggle').props.onPress();
  ui.render();
  ui.find('control-voice-drawer-tab-capabilities').props.onPress();
  ui.render();
  await ui.settle();
  ui.find('control-voice-cap-toggle-voice_walk').props.onPress();
  await ui.settle();
  assert.equal(ui.controller.capabilities.modules.voice_walk, true);

  ui.find('control-voice-cap-toggle-robot_control').props.onPress();
  await ui.settle();
  assert.equal(ui.controller.capabilities.modules.robot_control, false);
  assert.equal(ui.controller.capabilities.modules.voice_walk, false);
  assert.equal(ui.find('control-voice-cap-row-voice_walk'), undefined, '语音走动 must hide cleanly when robot_control is OFF');
  assert.equal(ui.find('control-voice-cap-toggle-voice_walk'), undefined);
  assert.equal(ui.find('control-voice-walk-unlocked-indicator'), undefined);
  assert.equal(ui.controller.capabilities.moduleList.find(m => m.id === 'voice_walk').statusLabel, '需开控狗');

  // Re-enabling robot_control brings 语音走动 back in locked state (never auto-re-arms!).
  ui.find('control-voice-cap-toggle-robot_control').props.onPress();
  await ui.settle();
  assert.equal(ui.controller.capabilities.modules.robot_control, true);
  assert.equal(ui.controller.capabilities.modules.voice_walk, false);
  assert.ok(ui.find('control-voice-cap-row-voice_walk'));
  assert.equal(ui.find('control-voice-cap-toggle-voice_walk').props.children.props.children, '已锁定');

  // 8. If backend explicitly marks voice_walk unavailable while robot_control is ON, render crisp 4-char 需开控狗 badge with NO toggle.
  forceWalkUnavailable = true;
  ui.advance(1_200);
  await ui.settle();
  assert.equal(ui.find('control-voice-cap-toggle-voice_walk'), undefined, 'unavailable voice_walk must never render a fake toggle');
  assert.equal(ui.find('control-voice-cap-status-voice_walk').props.children.props.children, '需开控狗');

  // 9. Strict zero-jargon / zero-lecturing copy sweep.
  assert.doesNotMatch(ui.copy, /暂未接入|仅作预览|暂不可用|清空上下文|AskMe|MemPalace|8770|8780|ONNX|Opus|TTS|ASR|EOT|ACL|（|）|\(|\)/);
  ui.unmount();
  assert.equal(ui.activeIntervals, 0);
});
