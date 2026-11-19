import { createElement, useEffect, useRef, useState } from 'react';

import type { VideoRuntime, VideoStream } from './whepReceiver';

export function videoRuntime(): VideoRuntime | null {
  if (typeof RTCPeerConnection === 'undefined') return null;
  return {
    fetch: (url, init) => fetch(url, init),
    createPeer: configuration => new RTCPeerConnection(configuration) as unknown as ReturnType<VideoRuntime['createPeer']>,
    makeStream: track => new MediaStream([track as MediaStreamTrack]),
    now: () => performance.now(),
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: handle => clearTimeout(handle),
  };
}

export function VideoPlayer({ stream, rotation }: { stream: VideoStream; rotation: number }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const resize = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    player.srcObject = stream as MediaStream;
    void player.play().catch(() => undefined);
    return () => { player.pause(); player.srcObject = null; };
  }, [stream]);
  const sideways = rotation === 90 || rotation === 270;
  const width = sideways ? size.height : size.width;
  const height = sideways ? size.width : size.height;
  return createElement('div', { ref: container, style: { position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' } },
    createElement('video', { ref, autoPlay: true, muted: true, playsInline: true, 'aria-label': '机器人摄像头画面',
      style: { position: 'absolute', left: (size.width - width) / 2, top: (size.height - height) / 2, width, height, objectFit: 'cover', transform: `rotate(${rotation}deg)` } }));
}
