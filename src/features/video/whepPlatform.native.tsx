import { createElement } from 'react';
import { fetch as expoFetch } from 'expo/fetch';
import { NativeModules, StyleSheet, View } from 'react-native';

import type { VideoRuntime, VideoStream } from './whepReceiver';

// Existing installations can open control before a new native binary is installed.
function nativeRtc(): typeof import('react-native-webrtc') | null {
  if (!NativeModules.WebRTCModule) return null;
  try { return require('react-native-webrtc') as typeof import('react-native-webrtc'); } catch { return null; }
}

export function videoRuntime(): VideoRuntime | null {
  const rtc = nativeRtc();
  if (!rtc) return null;
  return {
    // Expo fetch disables redirects in the native HTTP client; RN's legacy fetch cannot guarantee this.
    fetch: expoFetch as unknown as typeof fetch,
    createPeer: configuration => new rtc.RTCPeerConnection(configuration) as unknown as ReturnType<VideoRuntime['createPeer']>,
    makeStream: track => new rtc.MediaStream([track as import('react-native-webrtc').MediaStreamTrack]),
    now: () => performance.now(), setTimeout, clearTimeout,
  };
}

export function VideoPlayer({ stream, rotation }: { stream: VideoStream; rotation: number }) {
  const rtc = nativeRtc();
  return createElement(View, { style: [{ flex: 1, height: '100%', width: '100%' }, { backgroundColor: '#000', overflow: 'hidden' }] },
    rtc && stream.toURL ? createElement(rtc.RTCView, { streamURL: stream.toURL(), objectFit: 'cover', mirror: false,
      style: [StyleSheet.absoluteFill, { height: '100%', width: '100%' }, rotation ? { transform: [{ rotate: `${rotation}deg` }] } : null], zOrder: 1, testID: 'whep-native-player' }) : null);
}
