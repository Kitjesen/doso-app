import { type ReactNode, useEffect, useState } from 'react';

import type { ControlVideoPresentation } from '../../components/ControlVideoSurface';
import { RobotVideoFrame } from './RobotVideoFrame';
import { readVideoProbeViewerToken } from './videoProbeAccess';
import { createVideoProbeRuntime } from './videoProbeRtc';
import { videoProbeBaseUrl } from './videoProbeUrl';
import { startVideoProbe, type VideoProbeView } from './whepVideoSession';

export function useControlRobotVideo({ host, enabled }: { host: string | null; enabled: boolean }): {
  presentation?: ControlVideoPresentation;
  surface?: ReactNode;
  stream?: unknown;
  rotation?: number;
} {
  const baseUrl = videoProbeBaseUrl(host);
  const [view, setView] = useState<VideoProbeView | null>(null);

  useEffect(() => {
    if (!enabled || !baseUrl) return undefined;
    let stopped = false;
    const runtime = createVideoProbeRuntime();
    if (!runtime) {
      setView({ id: 'video-probe-runtime', phase: 'error', stream: null, rotationDegrees: 0 });
      return undefined;
    }
    const probe = startVideoProbe({
      baseUrl,
      runtime,
      authorization: readVideoProbeViewerToken,
      onView: next => { if (!stopped) setView(next); },
    });
    return () => {
      stopped = true;
      setView(null);
      void probe.stop();
    };
  }, [baseUrl, enabled]);

  if (!enabled || !baseUrl) return {};
  if (!view) return { presentation: { id: 'video-probe-opening', phase: 'connecting' } };
  const streamUrl = view.phase === 'receiving' && view.stream && typeof view.stream.toURL === 'function'
    ? view.stream.toURL()
    : '';
  const phase = view.phase === 'receiving' && !streamUrl ? 'connecting' : view.phase;
  return {
    presentation: { id: view.id, phase },
    surface: streamUrl ? <RobotVideoFrame rotationDegrees={view.rotationDegrees} streamUrl={streamUrl} /> : undefined,
    stream: phase === 'receiving' ? view.stream : null,
    rotation: view.rotationDegrees,
  };
}
