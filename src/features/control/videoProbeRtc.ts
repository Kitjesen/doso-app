import type { VideoProbeRuntime } from './whepVideoSession';

/** Web preview has no robot video decoder. Native playback lives in the platform file. */
export function createVideoProbeRuntime(): VideoProbeRuntime | null {
  return null;
}
