import { useEffect, useMemo, useRef, useState } from 'react';
import type { BrainstemGrpcEndpoint } from '../../services/brainstemGrpc';
import { normalizeRememberedBrainstemConnection, rememberedBrainstemConnectionStore,
  type RememberedBrainstemConnection } from './rememberedBrainstemConnection';

export type RememberedBrainstemConnectionState = Readonly<{
  connection: RememberedBrainstemConnection | null;
  loaded: boolean;
  error: string | null;
  remember(endpoint: BrainstemGrpcEndpoint, principal: string): void;
  forget(): void;
}>;

export function useRememberedBrainstemConnection(ownerKey: string | null, ready: boolean): RememberedBrainstemConnectionState {
  const mounted = useRef(true);
  const owner = useRef({ ownerKey, ready, revision: 0 });
  if (owner.current.ownerKey !== ownerKey || owner.current.ready !== ready) owner.current = { ownerKey, ready, revision: 0 };
  const captured = owner.current;
  const [selection, setSelection] = useState<{ owner: typeof captured; connection: RememberedBrainstemConnection | null } | null>(null);
  const [failure, setFailure] = useState<{ owner: typeof captured; revision: number; message: string } | null>(null);
  const callbacks = useMemo(() => {
    const current = () => mounted.current && owner.current === captured && !!captured.ownerKey && captured.ready;
    const failed = (revision: number, message: string) => {
      if (current() && captured.revision === revision) setFailure({ owner: captured, revision, message });
    };
    return {
      remember(endpoint: BrainstemGrpcEndpoint, principal: string) {
        if (!current()) return;
        const connection = normalizeRememberedBrainstemConnection({ endpoint: { ...endpoint, transport: endpoint.transport ?? 'tls' }, principal });
        if (!connection) return;
        const revision = ++captured.revision;
        setSelection({ owner: captured, connection });
        void rememberedBrainstemConnectionStore.save(captured.ownerKey!, connection).catch(() =>
          failed(revision, '连接信息未能保存，重新打开 App 后可能需要手动连接。'));
      },
      forget() {
        if (!current()) return;
        const revision = ++captured.revision;
        setSelection({ owner: captured, connection: null });
        void rememberedBrainstemConnectionStore.forget(captured.ownerKey!).catch(() =>
          failed(revision, '未能清除自动连接记录，重新打开 App 后仍可能尝试连接，请重试。'));
      },
    };
  }, [captured]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    const revision = captured.revision;
    if (captured.ownerKey && captured.ready) {
      void rememberedBrainstemConnectionStore.load(captured.ownerKey).catch(() => null).then(connection => {
        if (active && mounted.current && owner.current === captured && captured.revision === revision) {
          setSelection({ owner: captured, connection });
        }
      });
    }
    return () => { active = false; mounted.current = false; };
  }, [captured]);

  const loaded = !!ownerKey && ready && selection?.owner === captured;
  const error = ready && failure?.owner === captured && failure.revision === captured.revision ? failure.message : null;
  return { connection: loaded ? selection.connection : null, loaded, error, ...callbacks };
}
