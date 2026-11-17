import type { VideoProbePeer, VideoProbeRuntime } from './whepVideoSession';

type DebugModule = { disable: () => string; enable: (namespaces: string) => void };
type WebRtcModule = {
  RTCPeerConnection: new (configuration?: { iceServers?: unknown[] }) => VideoProbePeer;
};

function quietLibraryLogs(): void {
  try {
    const debugModule = require('debug') as DebugModule;
    const previous = debugModule.disable();
    const kept = previous.split(',').map(item => item.trim()).filter(item => item && !item.includes('rn-webrtc'));
    debugModule.enable(kept.length ? kept.join(',') : '-rn-webrtc:*');
  } catch {
    // A logging preference must not block playback.
  }
}

/** Loaded only while a probe session starts, so a binary without the native module still opens. */
export function createVideoProbeRuntime(): VideoProbeRuntime | null {
  try {
    const webrtc = require('react-native-webrtc') as WebRtcModule;
    if (typeof webrtc.RTCPeerConnection !== 'function') return null;
    quietLibraryLogs();
    return {
      createPeerConnection(configuration) {
        const iceServers = configuration.iceServers.map(server => ({
          ...server,
          urls: Array.isArray(server.urls) ? [...server.urls] : server.urls,
        }));
        return new webrtc.RTCPeerConnection({ iceServers });
      },
      fetch: (input, init) => fetch(input, init),
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
  } catch {
    return null;
  }
}
