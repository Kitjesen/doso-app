import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  readBrainstemGrpcMotorStatus, readBrainstemGrpcProfile, readBrainstemGrpcStatus, readBrainstemGrpcVoltage,
  type BrainstemGrpcEndpoint,
} from '../../services/brainstemGrpc';
import {
  createDirectRobotConnectionSnapshot, describeDirectRobotConnection, isDirectRobotConnectionFresh,
  type DirectRobotConnectionSnapshot,
} from '../../services/directRobotConnection';

type Owner = Readonly<{ ownerKey: string | null; endpoint: BrainstemGrpcEndpoint | null; active: boolean }>;
type Reading = Readonly<{ owner: Owner; snapshot: DirectRobotConnectionSnapshot | null; error: string | null; refreshing: boolean }>;
let requestSequence = 0;
const requestId = () => `telemetry-${Date.now()}-${++requestSequence}`;

/** Read-only telemetry belongs to the explicitly selected endpoint and foreground account. */
export function useBrainstemTelemetry({ ownerKey, endpoint, active }: Owner) {
  const owner = useRef<Owner>({ ownerKey, endpoint: endpoint && { ...endpoint }, active });
  if (owner.current.ownerKey !== ownerKey || owner.current.active !== active
    || owner.current.endpoint?.host !== endpoint?.host || owner.current.endpoint?.port !== endpoint?.port
    || owner.current.endpoint?.transport !== endpoint?.transport
    || owner.current.endpoint?.clientIdentityAlias !== endpoint?.clientIdentityAlias) {
    owner.current = { ownerKey, endpoint: endpoint && { ...endpoint }, active };
  }
  const captured = owner.current;
  const mounted = useRef(true);
  const pending = useRef<{ owner: Owner; controller: AbortController } | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [, render] = useState(0);
  const valid = () => mounted.current && owner.current === captured && !!captured.ownerKey
    && !!captured.endpoint && captured.active && AppState.currentState === 'active';
  const refresh = async () => {
    if (!valid() || pending.current) return;
    const request = { owner: captured, controller: new AbortController() };
    pending.current = request;
    setReading(value => ({ owner: captured,
      snapshot: value?.owner === captured && value.snapshot && isDirectRobotConnectionFresh(value.snapshot) ? value.snapshot : null,
      error: null, refreshing: true }));
    try {
      const options = () => ({ endpoint: captured.endpoint!, requestId: requestId(), signal: request.controller.signal });
      const observation = await readBrainstemGrpcStatus(options());
      if (!valid() || request.controller.signal.aborted) return;
      let enriched = observation;
      let partial = false;
      // The oldest timestamp bounds the whole cycle, including a clock change between reads.
      for (const read of [readBrainstemGrpcProfile, readBrainstemGrpcVoltage, readBrainstemGrpcMotorStatus]) {
        try {
          const result = await read(options());
          if (!valid() || request.controller.signal.aborted) return;
          if ('profile' in result) enriched = { ...enriched, profile: result.profile };
          if ('voltage' in result) enriched = { ...enriched, voltage: result.voltage };
          if ('motors' in result) enriched = { ...enriched, motors: result.motors };
          if (Date.parse(result.observedAt) < Date.parse(enriched.observedAt)) enriched = { ...enriched, observedAt: result.observedAt };
        } catch {
          if (!valid() || request.controller.signal.aborted) return;
          partial = true;
        }
      }
      const snapshot = createDirectRobotConnectionSnapshot(captured.endpoint!, enriched);
      if (valid()) setReading({ owner: captured, snapshot, error: partial ? '部分遥测未读取，请刷新重试。' : null, refreshing: false });
    } catch {
      if (valid() && !request.controller.signal.aborted) setReading({ owner: captured, snapshot: null, error: '遥测读取失败，请检查连接后重试。', refreshing: false });
    } finally {
      if (pending.current === request) pending.current = null;
    }
  };

  useEffect(() => {
    mounted.current = true;
    const lifecycle = AppState.addEventListener('change', () => {
      owner.current = { ...owner.current };
      pending.current?.controller.abort(); pending.current = null;
      setReading(null); render(value => value + 1);
    });
    return () => { mounted.current = false; lifecycle.remove(); pending.current?.controller.abort(); pending.current = null; };
  }, []);
  useEffect(() => {
    void refresh();
    const timer = valid() ? setInterval(() => { void refresh(); }, 5000) : null;
    return () => {
      if (timer !== null) clearInterval(timer);
      if (pending.current?.owner === captured) { pending.current.controller.abort(); pending.current = null; }
    };
  }, [captured]);
  const current = valid() && reading?.owner === captured ? reading : null;
  const snapshot = current?.snapshot && isDirectRobotConnectionFresh(current.snapshot) ? current.snapshot : null;
  useEffect(() => {
    if (!snapshot) return;
    const timer = setTimeout(() => {
      if (valid()) setReading(value => value?.snapshot === snapshot ? { ...value, snapshot: null } : value);
    }, Math.max(0, Date.parse(snapshot.observation.observedAt) + 15000 - Date.now()));
    return () => clearTimeout(timer);
  }, [snapshot, captured]);
  return { snapshot, presentation: snapshot ? describeDirectRobotConnection(snapshot) : null,
    error: current?.error ?? null, refreshing: current?.refreshing ?? false, refresh };
}
