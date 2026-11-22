import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { g20Input } from '../../services/g20Input';
import { beginG20Calibration, G20_INPUT_MAX_AGE_MS, isG20Calibrated, learnG20Axis, learnG20Button,
  parseG20Sample, projectG20Input, type G20Axis, type G20ButtonAction, type G20Calibration, type G20Frame, type G20Sample } from './g20InputModel';

export type G20InputEvent = Readonly<{ sample: G20Sample | null; frame: G20Frame | null }>;
type Snapshot = Readonly<{
  status: string; reading: boolean; available: boolean; message: string | null;
  sample: G20Sample | null; calibration: G20Calibration | null; calibrating: boolean;
}>;
const initial = (): Snapshot => ({ status: 'stopped', reading: false, available: g20Input.available,
  message: null, sample: null, calibration: null, calibrating: false });
let requestSequence = 0;

function inputFailureMessage(reason: unknown): string {
  switch (reason) {
    case 'connect_timeout': return '连接 G20 输入服务超时，请重新读取';
    case 'read_timeout': return '读取 G20 通道超时，请重新读取';
    case 'read_failed': return '读取 G20 输入失败，请重新读取';
    case 'sdk_unavailable': return 'G20 输入 SDK 不可用，请检查安装包';
    case 'unsupported_device': return '当前设备未被识别为 G20';
    case 'unsupported_abi': return '当前设备架构不支持 G20 输入 SDK';
    case 'rc_connect_failed': return '无法连接 G20 输入服务，请重新读取';
    case 'disconnected': return 'G20 输入连接已断开，请重新读取';
    case 'configuration_unavailable': return '无法读取 G20 通道配置，请重新读取';
    case 'configuration_changed': return 'G20 通道配置已变化，请重新校验';
    case 'invalid_channels': return 'G20 通道数据无效，请重新读取';
    case 'background': return 'G20 输入已暂停，请在应用前台重新读取';
    case 'destroyed': return 'G20 输入模块已停止，请重新进入控制页';
    default: return '无法读取 G20 输入，请检查安装包与设备';
  }
}

/** Local input observation never acquires control or writes remote-controller settings. */
export function useG20Input(active: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const state = useRef(snapshot);
  const lastUiAt = useRef(-Infinity);
  const live = useRef(active);
  live.current = active;
  const owner = useRef<{ requestId: string; generation: number | null; sequence: number; observedAt: number; observation: boolean; beginCalibration: boolean } | null>(null);
  const listeners = useRef(new Set<(event: G20InputEvent) => void>());
  const timing = useRef<{ count: number; first: number; last: number; maxGap: number } | null>(null);
  const reportTiming = useCallback(() => {
    const measured = timing.current; timing.current = null;
    if (!measured) return;
    const span = measured.last - measured.first;
    try { console.info(`DOSO_G20_JS_TIMING samples=${measured.count} spanMs=${span.toFixed(2)} hz=${measured.count > 1 && span > 0 ? ((measured.count - 1) * 1000 / span).toFixed(2) : '-1'} maxGapMs=${measured.maxGap.toFixed(2)}`); }
    catch { /* Timing diagnostics must not delay input revocation. */ }
  }, []);
  const publish = useCallback((next: Snapshot, updateUi = true) => {
    state.current = next;
    if (updateUi) { lastUiAt.current = performance.now(); setSnapshot(next); }
  }, []);
  const emit = useCallback((sample: G20Sample | null, frame: G20Frame | null) => {
    for (const listener of listeners.current) listener({ sample, frame });
  }, []);
  const stop = useCallback(() => {
    reportTiming();
    owner.current = null;
    emit(null, null);
    publish(state.current.status === 'error' ? { ...initial(), status: 'error', message: state.current.message } : initial());
    void g20Input.stop();
  }, [emit, publish, reportTiming]);
  const fail = useCallback((message: string) => {
    reportTiming();
    owner.current = null;
    emit(null, null);
    publish({ ...state.current, reading: false, calibration: null, calibrating: false, status: 'error', message });
    void g20Input.stop();
  }, [emit, publish, reportTiming]);
  const freshSample = useCallback(() => {
    if (owner.current?.observation) throw Error('当前仅观察通道，实体控制未开放');
    const sample = state.current.sample;
    if (!live.current || AppState.currentState !== 'active' || !owner.current || !sample
      || sample.requestId !== owner.current.requestId || !g20Input.isFresh(sample.generation, sample.sequence)) throw Error('请先读取最新输入');
    return sample;
  }, []);
  const beginReading = useCallback((observation: boolean, beginCalibration = false) => {
    if (!live.current || AppState.currentState !== 'active' || owner.current) return;
    const requestId = `g20-${++requestSequence}`;
    const request = { requestId, generation: null as number | null, sequence: 0, observedAt: performance.now(), observation, beginCalibration };
    owner.current = request;
    emit(null, null);
    publish({ ...initial(), status: 'starting' });
    void (observation ? g20Input.observe(requestId) : g20Input.start(requestId)).then(result => {
      if (owner.current !== request || !live.current) return;
      if (result.requestId !== requestId || !Number.isSafeInteger(result.generation) || result.generation < 1) { fail('输入会话不匹配'); return; }
      if (request.generation !== null && request.generation !== result.generation) { fail('输入会话不匹配'); return; }
      request.generation = result.generation;
      if (result.status === 'error' || result.status === 'unavailable' || result.status === 'stopped') fail(inputFailureMessage(result.reason));
    }, () => { if (owner.current === request) fail(observation && !g20Input.observationAvailable
      ? '请升级安装包以读取 G20 通道' : '无法读取 G20 输入，请检查安装包与设备'); });
  }, [emit, fail, publish]);
  const start = useCallback(() => beginReading(false), [beginReading]);
  const observe = useCallback(() => beginReading(true), [beginReading]);
  useEffect(() => {
    const consumeSample = (value: unknown) => {
      const request = owner.current;
      if (!request || !live.current || AppState.currentState !== 'active') return;
      const useLatestObservation = request.observation && g20Input.latestObservationAvailable;
      const sample = parseG20Sample(useLatestObservation ? g20Input.latestObservation(request.requestId) : value);
      if (!sample || sample.requestId !== request.requestId) return;
      if (request.observation && (sample.configurationReady || sample.channelSettings !== null || sample.controlMode !== null)) {
        fail('通道观察状态无效，请重新读取'); return;
      }
      if (request.generation !== null && sample.generation !== request.generation || sample.sequence <= request.sequence) return;
      if (!useLatestObservation && !g20Input.isFresh(sample.generation, sample.sequence)) {
        if (request.observation) return;
        if (request.sequence === 0 && state.current.status === 'starting' && !state.current.reading) return;
        fail('G20 当前采样已失效，请重新读取'); return;
      }
      request.generation = sample.generation; request.sequence = sample.sequence; request.observedAt = performance.now();
      const previous = timing.current, at = request.observedAt;
      if (Number.isFinite(at) && at >= 0) timing.current = previous && at >= previous.last
        ? { count: previous.count + 1, first: previous.first, last: at, maxGap: Math.max(previous.maxGap, at - previous.last) }
        : { count: 1, first: at, last: at, maxGap: 0 };
      let calibration = state.current.calibration;
      let message: string | null = request.observation ? '仅观察通道，实体控制未开放' : sample.configurationReady ? null : '通道配置未读取';
      let frame: G20Frame | null = null;
      let beginCalibration = false;
      if (request.beginCalibration) {
        request.beginCalibration = false;
        try { calibration = beginG20Calibration(sample); beginCalibration = true; }
        catch { fail('无法验证通道配置，请重新校验'); return; }
      }
      if (calibration && isG20Calibrated(calibration)) {
        try { frame = projectG20Input(calibration, sample); }
        catch { calibration = null; message = '输入配置已变化，请重新校验'; }
      }
      const calibrating = calibration ? beginCalibration || state.current.calibrating : false;
      // Control subscribers receive every sample; channel labels do not need a 50 Hz React render.
      const updateUi = !state.current.reading || calibration !== state.current.calibration
        || message !== state.current.message || at - lastUiAt.current >= 100;
      publish({ ...state.current, status: 'reading', reading: true, sample, calibration, calibrating, message }, updateUi);
      emit(sample, calibrating ? null : frame);
    };
    const sampleSubscription = g20Input.subscribe('onSample', consumeSample);
    const stateSubscription = g20Input.subscribe('onState', value => {
      const request = owner.current;
      if (!request || !value || typeof value !== 'object') return;
      const next = value as Record<string, unknown>;
      if (next.requestId !== request.requestId) return;
      if (next.status === 'error' || next.status === 'unavailable' || next.status === 'stopped') fail(inputFailureMessage(next.reason));
    });
    const lifecycle = AppState.addEventListener('change', next => { if (next !== 'active' && owner.current) stop(); });
    const watchdog = setInterval(() => {
      const request = owner.current;
      if (!request) return;
      // Observation liveness comes from the native slot, not delivery order of JS notifications.
      if (request.observation && g20Input.latestObservationAvailable) consumeSample(null);
      const age = performance.now() - request.observedAt;
      if (!live.current) { stop(); return; }
      if (state.current.reading && (!Number.isFinite(age) || age < 0 || age > G20_INPUT_MAX_AGE_MS)) {
        const ageMs = Number.isFinite(age) && age >= 0 ? Math.floor(age) : -1;
        try { console.info(`DOSO_G20_WATCHDOG sequence=${request.sequence} ageMs=${ageMs}`); } catch { /* Diagnostic must not block stop. */ }
        fail('G20 输入更新中断，请重新读取');
      }
      else if (!state.current.reading && age > 3000) fail('读取 G20 输入超时');
    }, 25);
    return () => {
      reportTiming();
      owner.current = null; emit(null, null);
      sampleSubscription.remove(); stateSubscription.remove(); lifecycle.remove(); clearInterval(watchdog);
      void g20Input.stop();
    };
  }, [emit, fail, publish, stop, reportTiming]);
  useEffect(() => { if (!active && owner.current) stop(); }, [active, stop]);
  const changeCalibration = useCallback((change: (sample: G20Sample, calibration: G20Calibration | null) => G20Calibration, calibrating = true) => {
    emit(null, null);
    try {
      const sample = freshSample();
      const calibration = change(sample, state.current.calibration);
      publish({ ...state.current, calibration, calibrating, message: null });
    } catch (error) {
      publish({ ...state.current, message: error instanceof Error ? error.message : '校验失败' });
    }
  }, [emit, freshSample, publish]);
  const beginCalibration = useCallback(() => {
    if (owner.current?.observation) { stop(); beginReading(false, true); return; }
    changeCalibration(sample => beginG20Calibration(sample));
  }, [beginReading, changeCalibration, stop]);
  const learnAxis = useCallback((axis: G20Axis) => changeCalibration((sample, calibration) => {
    if (!calibration) throw Error('请先开始校验');
    return learnG20Axis(calibration, axis, sample);
  }), [changeCalibration]);
  const learnButton = useCallback((action: G20ButtonAction) => changeCalibration((sample, calibration) => {
    if (!calibration) throw Error('请先开始校验');
    return learnG20Button(calibration, action, sample);
  }), [changeCalibration]);
  const finishCalibration = useCallback(() => changeCalibration((sample, calibration) => {
    if (!calibration || !projectG20Input(calibration, sample).neutral) throw Error('请松开摇杆和已设置的按键');
    return calibration;
  }, false), [changeCalibration]);
  const clearCalibration = useCallback(() => {
    emit(null, null); publish({ ...state.current, calibration: null, calibrating: false, message: null });
  }, [emit, publish]);
  const subscribe = useCallback((listener: (event: G20InputEvent) => void) => {
    listeners.current.add(listener); return () => { listeners.current.delete(listener); };
  }, []);
  let vector = null;
  let pressed: readonly G20ButtonAction[] = [];
  if (snapshot.calibration && snapshot.sample && isG20Calibrated(snapshot.calibration)) {
    try { const projected = projectG20Input(snapshot.calibration, snapshot.sample); vector = projected.vector; pressed = projected.pressed; } catch { /* Unverified mapping. */ }
  }
  return { state: { ...snapshot, axes: snapshot.calibration?.axes ?? {}, buttons: snapshot.calibration?.buttons ?? {},
    calibrated: isG20Calibrated(snapshot.calibration), vector, pressed },
    start, observe, stop, beginCalibration, learnAxis, learnButton, finishCalibration, clearCalibration, subscribe,
    isFresh: g20Input.isFresh.bind(g20Input), captureFence: g20Input.captureFence.bind(g20Input) };
}
export type G20InputController = ReturnType<typeof useG20Input>;
