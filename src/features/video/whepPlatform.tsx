import { createElement, useEffect, useRef, useState } from 'react';

import {
  LoopbackSimVideoReceiver,
  isDevLoopbackSimVideoConfig,
  type DecodedSimFrame,
  type LoopbackSimVideoStream,
} from './devLoopbackSimVideo';
import type { VideoConfiguration, VideoRuntime, VideoSnapshot, VideoStream } from './whepReceiver';

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

async function decodeWebSimFrame(blob: Blob): Promise<DecodedSimFrame> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Failed to decode simulation frame'));
    image.src = objectUrl;
  });
  return {
    source: image,
    width: image.naturalWidth || 640,
    height: image.naturalHeight || 360,
    close: () => URL.revokeObjectURL(objectUrl),
  };
}

export function createLoopbackSimVideoReceiver(
  config: VideoConfiguration,
  runtime: VideoRuntime | null,
  publish: (snapshot: VideoSnapshot) => void,
  createWhep: (cfg: VideoConfiguration, pub: (snapshot: VideoSnapshot) => void) => { start(): void; stop(): Promise<boolean> },
): LoopbackSimVideoReceiver | null {
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__ === true;
  if (!runtime || !isDevLoopbackSimVideoConfig(config, isDev)) return null;
  return new LoopbackSimVideoReceiver(
    config,
    {
      fetch: runtime.fetch,
      now: runtime.now,
      setTimeout: runtime.setTimeout,
      clearTimeout: runtime.clearTimeout,
      decodeFrame: decodeWebSimFrame,
      createWhepReceiver: createWhep,
    },
    publish,
    { isDev },
  );
}

function SimCanvasVideoPlayer({ stream, rotation }: { stream: LoopbackSimVideoStream; rotation: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      const frame = stream.getLatestFrame();
      if (!canvas || !frame) return;

      const srcW = Math.max(1, frame.width);
      const srcH = Math.max(1, frame.height);
      const sideways = rotation === 90 || rotation === 270;
      const targetW = sideways ? srcH : srcW;
      const targetH = sideways ? srcW : srcH;
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (!rotation) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(frame.source as CanvasImageSource, 0, 0, srcW, srcH);
        return;
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, targetW / 2, targetH / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(frame.source as CanvasImageSource, -srcW / 2, -srcH / 2, srcW, srcH);
      ctx.restore();
    };

    draw();
    return stream.subscribe(draw);
  }, [stream, rotation]);

  return createElement(
    'div',
    { style: { position: 'absolute', inset: 0, overflow: 'hidden', background: '#0A0D0C' } },
    createElement('canvas', {
      ref: canvasRef,
      'aria-label': '机器人仿真摄像头画面',
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        objectFit: 'cover',
      },
    }),
  );
}

function WhepVideoElementPlayer({ stream, rotation }: { stream: VideoStream; rotation: number }) {
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

export function VideoPlayer({ stream, rotation }: { stream: VideoStream; rotation: number }) {
  if ((stream as Partial<LoopbackSimVideoStream>)?.kind === 'doso-dev-sim-canvas') {
    return createElement(SimCanvasVideoPlayer, {
      stream: stream as LoopbackSimVideoStream,
      rotation,
    });
  }
  return createElement(WhepVideoElementPlayer, { stream, rotation });
}
