import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createForestSkyTexture, createForestWorld } from './forestWorld';

export type Standby3dSceneId = 'forest' | 'charcoal' | 'gallery' | 'hangar';
export type Standby3dAccentTone = 'graphite' | 'fsdBlue';

export type Standby3dCameraState = Readonly<{
  theta: number;
  phi: number;
  radius: number;
  scene: Standby3dSceneId;
  accentTone: Standby3dAccentTone;
  ready: boolean;
  userMoved: boolean;
  robotX: number;
  robotY: number;
  robotZ: number;
  robotYaw: number;
  speed: number;
  wheelSpinFL: number;
  kneeDeltaFL: number;
  articulated16Dof: boolean;
  discoveredBeacons: number;
  totalBeacons: number;
}>;

export type Standby3dController = Readonly<{
  setScene: (scene: Standby3dSceneId) => void;
  setAccentTone: (tone: Standby3dAccentTone) => void;
  setInteractive: (enabled: boolean) => void;
  setPaused: (paused: boolean) => void;
  setBodyHeight: (heightM: number | null | undefined) => void;
  setDriveInput: (driveX: number, driveY: number, turnX: number) => void;
  resetView: () => void;
  resetRobot: () => void;
  resize: (width?: number, height?: number) => void;
  getState: () => Standby3dCameraState;
  dispose: () => void;
}>;

export type Standby3dMountOptions = Readonly<{
  glbUrl?: string;
  glbBase64?: string;
  glbGzipBase64?: string;
  forestKitUrl?: string;
  forestKitBase64?: string;
  forestSkyUrl?: string;
  forestHdrUrl?: string;
  forestHdrBase64?: string;
  scene?: Standby3dSceneId;
  accentTone?: Standby3dAccentTone;
  interactive?: boolean;
  paused?: boolean;
  performanceTier?: 'high' | 'low';
  bodyHeightM?: number | null;
  onReady?: () => void;
  onError?: (message: string) => void;
  onUserMovedChange?: (moved: boolean) => void;
}>;

type ThemePalette = Readonly<{
  bgHex: number;
  fogDensity: number;
  floorHex: number;
  floorRoughness: number;
  floorMetalness: number;
  floorGridColor: string;
  floorFineColor: string;
  ringPrimary: string;
  ringSecondary: string;
  ringGlowHex: number;
  accentEmissiveHex: number;
  spotColor: number;
  spotIntensity: number;
  rimColor: number;
  rimIntensity: number;
  fillColor: number;
  fillIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  envIntensity: number;
  exposure: number;
  showGalleryWalls: boolean;
  showHangarRibs: boolean;
}>;

const THEME_PALETTES: Record<Standby3dSceneId, ThemePalette> = {
  forest: {
    bgHex: 0x32403a,
    fogDensity: 0.036,
    floorHex: 0x1e2c22,
    floorRoughness: 0.90,
    floorMetalness: 0.03,
    floorGridColor: 'rgba(160, 212, 184, 0.08)',
    floorFineColor: 'rgba(130, 180, 152, 0.03)',
    ringPrimary: 'rgba(196, 245, 224, 0.84)',
    ringSecondary: 'rgba(232, 206, 148, 0.48)',
    ringGlowHex: 0x9de8cc,
    accentEmissiveHex: 0x6ce8be,
    spotColor: 0xffecd0,
    spotIntensity: 0.0,
    rimColor: 0xa2c6c2,
    rimIntensity: 0.36,
    fillColor: 0x8ea69a,
    fillIntensity: 0.0,
    hemiSky: 0xb2c8c0,
    hemiGround: 0x2a3320,
    hemiIntensity: 0.42,
    envIntensity: 0.95,
    exposure: 1.00,
    showGalleryWalls: false,
    showHangarRibs: false,
  },
  charcoal: {
    bgHex: 0x06090d,
    fogDensity: 0.165,
    floorHex: 0x0e131b,
    floorRoughness: 0.76,
    floorMetalness: 0.10,
    floorGridColor: 'rgba(148, 190, 228, 0.095)',
    floorFineColor: 'rgba(120, 155, 192, 0.038)',
    ringPrimary: 'rgba(222, 242, 255, 0.96)',
    ringSecondary: 'rgba(146, 200, 244, 0.56)',
    ringGlowHex: 0x98ccff,
    accentEmissiveHex: 0x8cc8ff,
    spotColor: 0xeef5ff,
    spotIntensity: 27.0,
    rimColor: 0x82bfff,
    rimIntensity: 1.65,
    fillColor: 0x8498b2,
    fillIntensity: 0.42,
    hemiSky: 0x546880,
    hemiGround: 0x06090d,
    hemiIntensity: 0.20,
    envIntensity: 0.50,
    exposure: 1.04,
    showGalleryWalls: false,
    showHangarRibs: false,
  },
  gallery: {
    bgHex: 0x141920,
    fogDensity: 0.105,
    floorHex: 0x262d36,
    floorRoughness: 0.62,
    floorMetalness: 0.08,
    floorGridColor: 'rgba(205, 222, 242, 0.14)',
    floorFineColor: 'rgba(180, 200, 224, 0.05)',
    ringPrimary: 'rgba(235, 246, 255, 0.96)',
    ringSecondary: 'rgba(176, 212, 242, 0.62)',
    ringGlowHex: 0xc2e0ff,
    accentEmissiveHex: 0xd0e4fa,
    spotColor: 0xffffff,
    spotIntensity: 42.0,
    rimColor: 0xc2dcfa,
    rimIntensity: 1.45,
    fillColor: 0xb6c4d4,
    fillIntensity: 0.72,
    hemiSky: 0x92a2b4,
    hemiGround: 0x161b22,
    hemiIntensity: 0.48,
    envIntensity: 0.64,
    exposure: 1.10,
    showGalleryWalls: true,
    showHangarRibs: false,
  },
  hangar: {
    bgHex: 0x050a10,
    fogDensity: 0.12,
    floorHex: 0x111a26,
    floorRoughness: 0.48,
    floorMetalness: 0.28,
    floorGridColor: 'rgba(92, 216, 255, 0.16)',
    floorFineColor: 'rgba(72, 184, 226, 0.06)',
    ringPrimary: 'rgba(156, 240, 255, 0.98)',
    ringSecondary: 'rgba(80, 198, 238, 0.68)',
    ringGlowHex: 0x4ee0ff,
    accentEmissiveHex: 0x52e0ff,
    spotColor: 0xdcf4ff,
    spotIntensity: 36.0,
    rimColor: 0x44d2ff,
    rimIntensity: 2.35,
    fillColor: 0x6c9ab8,
    fillIntensity: 0.56,
    hemiSky: 0x4c88ae,
    hemiGround: 0x060d15,
    hemiIntensity: 0.34,
    envIntensity: 0.58,
    exposure: 1.05,
    showGalleryWalls: false,
    showHangarRibs: true,
  },
};

// Default camera around robot target frames hero 3/4 front-left view + towering forest vista
const DEFAULT_THETA = -0.68;
const DEFAULT_PHI_STUDIO = 1.24;
const DEFAULT_PHI_FOREST = 1.44; // Lower cinematic horizon angle reveals towering pines, sky & golden god-rays!
const DEFAULT_RADIUS_STUDIO = 2.02;
const DEFAULT_RADIUS_FOREST = 2.28;
const MIN_PHI = 0.34;
const MAX_PHI = 1.50;
const MIN_RADIUS = 1.18;
const MAX_RADIUS = 4.6;
const TARGET_Y_OFFSET_STUDIO = 0.255;
const TARGET_Y_OFFSET_FOREST = 0.38;
const NOMINAL_BODY_HEIGHT_M = 0.50;
const WHEEL_RADIUS_M = 0.095;
const TRACK_HALF_M = 0.265;
const ARENA_RADIUS_M = 6.35;

// Exact 2-link sagittal geometry of Thunder V4 / R50 in rest stand pose
const LEG_L1 = 0.255;
const LEG_L2 = 0.247;
const LEG_REST_DROP = 0.3891; // thigh pivot y (0.4838) -> wheel axle y (0.0947)

type LegId = 'FL' | 'FR' | 'RL' | 'RR';

type LegRig = {
  id: LegId;
  isFront: boolean;
  isLeft: boolean;
  hip: THREE.Object3D;
  thigh: THREE.Object3D;
  calf: THREE.Object3D;
  wheel: THREE.Object3D;
  hipRestQ: THREE.Quaternion;
  thighRestQ: THREE.Quaternion;
  calfRestQ: THREE.Quaternion;
  wheelRestQ: THREE.Quaternion;
  hipAxis: THREE.Vector3;
  pitchAxis: THREE.Vector3;
  // Nominal wheel footprint relative to robot root (X=forward, Z=right)
  footOffsetX: number;
  footOffsetZ: number;
  restX: number;
  restThighAbs: number;
  restCalfRel: number;
  wheelAngle: number;
  currentDeltaY: number;
  currentDeltaX: number;
  currentHipRoll: number;
  lastKneeDelta: number;
};

type SlalomBollard = Readonly<{ x: number; z: number; r: number }>;

// Proving-ground obstacles & terrain geometry (strictly clear of default hero framing around origin)
const RAMP_CENTER_X = 2.85;
const RAMP_CENTER_Z = -1.65;
const RAMP_YAW = -0.25;
const RAMP_FLAT_HALF_W = 0.72;
const RAMP_SIDE_SLOPE = 0.65;
const RAMP_FLAT_HALF_L = 0.78;
const RAMP_SLOPE_L = 1.05;
const RAMP_HEIGHT = 0.19;

const RIPPLE_CENTER_X = -3.15;
const RIPPLE_CENTER_Z = -2.35;
const RIPPLE_YAW = 0.42;
const RIPPLE_HALF_W = 0.85;
const RIPPLE_HALF_L = 1.15;
const RIPPLE_HEIGHT = 0.048;

const BOLLARDS: readonly SlalomBollard[] = [
  { x: 2.35, z: 1.95, r: 0.11 },
  { x: -0.35, z: -3.05, r: 0.11 },
  { x: -2.95, z: -1.65, r: 0.11 },
  { x: 0.55, z: 3.15, r: 0.11 },
];

function normalizeSceneId(value: unknown): Standby3dSceneId {
  if (value === 'forest' || value === 'charcoal' || value === 'gallery' || value === 'hangar') return value;
  return 'forest';
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function wrapAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const fromBase64 = (Uint8Array as unknown as { fromBase64?: (input: string) => Uint8Array }).fromBase64;
  if (typeof fromBase64 === 'function') {
    const bytes = fromBase64(base64);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function decodeGzipBase64ToArrayBuffer(base64: string): Promise<ArrayBuffer> {
  const compressed = decodeBase64ToArrayBuffer(base64);
  if (typeof DecompressionStream !== 'function') {
    throw new Error('DecompressionStream unavailable');
  }
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([compressed]).stream().pipeThrough(ds);
  return new Response(stream).arrayBuffer();
}

function sampleRampLocalHeight(lx: number, lz: number): number {
  const totalHalfL = RAMP_FLAT_HALF_L + RAMP_SLOPE_L;
  const totalHalfW = RAMP_FLAT_HALF_W + RAMP_SIDE_SLOPE;
  const absX = Math.abs(lx);
  const absZ = Math.abs(lz);
  if (absX >= totalHalfL || absZ >= totalHalfW) return 0;
  const tx = absX <= RAMP_FLAT_HALF_L ? 1 : clamp(1 - (absX - RAMP_FLAT_HALF_L) / RAMP_SLOPE_L, 0, 1);
  const tz = absZ <= RAMP_FLAT_HALF_W ? 1 : clamp(1 - (absZ - RAMP_FLAT_HALF_W) / RAMP_SIDE_SLOPE, 0, 1);
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  return RAMP_HEIGHT * sx * sz;
}

function sampleTerrainHeight(wx: number, wz: number): number {
  let h = 0;

  // 1. 4-sided smooth beveled driveable test deck (zero vertical cliff from any approach angle!)
  const rdx = wx - RAMP_CENTER_X;
  const rdz = wz - RAMP_CENTER_Z;
  const rCos = Math.cos(-RAMP_YAW);
  const rSin = Math.sin(-RAMP_YAW);
  const lx = rdx * rCos - rdz * rSin;
  const lz = rdx * rSin + rdz * rCos;
  h = Math.max(h, sampleRampLocalHeight(lx, lz));

  // 2. Suspension test speed-bump ripples
  const sdx = wx - RIPPLE_CENTER_X;
  const sdz = wz - RIPPLE_CENTER_Z;
  const sCos = Math.cos(-RIPPLE_YAW);
  const sSin = Math.sin(-RIPPLE_YAW);
  const sx = sdx * sCos - sdz * sSin;
  const sz = sdx * sSin + sdz * sCos;
  if (Math.abs(sz) <= RIPPLE_HALF_W && Math.abs(sx) <= RIPPLE_HALF_L) {
    const wave = 0.5 * (1 + Math.cos((sx / RIPPLE_HALF_L) * Math.PI * 5));
    const envelope = Math.cos((sx / RIPPLE_HALF_L) * (Math.PI / 2));
    h = Math.max(h, RIPPLE_HEIGHT * wave * Math.max(0, envelope));
  }

  return h;
}

function solveTwoLinkLeg(
  isFront: boolean,
  xTarget: number,
  yTarget: number,
): { thighAbs: number; calfRel: number } {
  const maxReach = LEG_L1 + LEG_L2 - 0.012;
  const minReach = 0.135;
  let dist = Math.hypot(xTarget, yTarget);
  if (dist > maxReach) {
    const scale = maxReach / dist;
    xTarget *= scale;
    yTarget *= scale;
    dist = maxReach;
  } else if (dist < minReach) {
    dist = minReach;
  }

  const cosBeta = clamp((LEG_L1 * LEG_L1 + LEG_L2 * LEG_L2 - dist * dist) / (2 * LEG_L1 * LEG_L2), -0.999, 0.999);
  const beta = Math.acos(cosBeta);
  const cosAlpha = clamp((LEG_L1 * LEG_L1 + dist * dist - LEG_L2 * LEG_L2) / (2 * LEG_L1 * dist), -0.999, 0.999);
  const alpha = Math.acos(cosAlpha);
  const gamma = Math.atan2(xTarget, -yTarget); // 0 = straight down, + = forward (+X)

  if (isFront) {
    // Front legs bend backward at the knee (X-stance)
    return { thighAbs: gamma - alpha, calfRel: Math.PI - beta };
  }
  // Rear legs bend forward at the knee (symmetrical X-stance)
  return { thighAbs: gamma + alpha, calfRel: -(Math.PI - beta) };
}

function createFloorGridTexture(gridColor: string, fineColor: string): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    // Subtle dark satin studio surface noise variation (keeps floor organic, never flat plastic)
    for (let i = 0; i < 1800; i += 1) {
      const rx = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const ry = (Math.sin(i * 78.233) * 43758.5453) % 1;
      const px = Math.abs(rx) * size;
      const py = Math.abs(ry) * size;
      const r = 1 + (i % 3);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.025)';
      ctx.fillRect(px, py, r, r);
    }

    // Fine 0.5m sub-grid
    ctx.strokeStyle = fineColor;
    ctx.lineWidth = 1;
    const half = size / 2;
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(half, size);
    ctx.moveTo(0, half);
    ctx.lineTo(size, half);
    ctx.stroke();

    // Major 1.0m architectural tile border
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

    // Crisp corner fiducial crosshairs
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 2;
    const tick = 14;
    ctx.beginPath();
    ctx.moveTo(0, tick);
    ctx.lineTo(0, 0);
    ctx.lineTo(tick, 0);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createPedestalTexture(ringPrimary: string, ringSecondary: string, isHangar: boolean): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    ctx.clearRect(0, 0, size, size);

    // Subtle soft stage glow pool right inside the DOSO ring
    const baseGrad = ctx.createRadialGradient(cx, cy, size * 0.04, cx, cy, size * 0.47);
    baseGrad.addColorStop(0, isHangar ? 'rgba(84, 178, 222, 0.16)' : 'rgba(148, 178, 210, 0.15)');
    baseGrad.addColorStop(0.70, isHangar ? 'rgba(54, 128, 168, 0.09)' : 'rgba(116, 146, 178, 0.08)');
    baseGrad.addColorStop(0.94, 'rgba(60, 90, 120, 0.02)');
    baseGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.47, 0, Math.PI * 2);
    ctx.fill();

    // Inner luminous main ring (signature DOSO cockpit pedestal)
    ctx.save();
    ctx.shadowColor = ringPrimary;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = ringPrimary;
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.365, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Outer thin precision halo ring
    ctx.save();
    ctx.shadowColor = ringSecondary;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = ringSecondary;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.445, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Four cardinal hairline floor ticks
    ctx.strokeStyle = ringSecondary;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i += 1) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * size * 0.448, cy + Math.sin(a) * size * 0.448);
      ctx.lineTo(cx + Math.cos(a) * size * 0.480, cy + Math.sin(a) * size * 0.480);
      ctx.stroke();
    }

    // Right-side-up tracked DOSO wordmark facing the default front-left hero camera (-0.68 rad)
    ctx.save();
    ctx.translate(cx - size * 0.14, cy - size * 0.25);
    ctx.rotate(-2.25);
    ctx.fillStyle = isHangar ? 'rgba(186, 240, 255, 0.78)' : 'rgba(226, 236, 248, 0.72)';
    ctx.font = '700 42px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letters = ['D', 'O', 'S', 'O'];
    const spacing = 44;
    const startX = -((letters.length - 1) * spacing) / 2;
    letters.forEach((ch, idx) => {
      ctx.fillText(ch, startX + idx * spacing, 0);
    });
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function createHeadlightPoolTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const grad = ctx.createRadialGradient(size * 0.16, size * 0.5, 4, size * 0.45, size * 0.5, size * 0.5);
    grad.addColorStop(0, 'rgba(210, 238, 255, 0.42)');
    grad.addColorStop(0.45, 'rgba(155, 210, 255, 0.16)');
    grad.addColorStop(1, 'rgba(120, 190, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(size * 0.08, size * 0.44);
    ctx.lineTo(size * 0.96, size * 0.08);
    ctx.lineTo(size * 0.96, size * 0.92);
    ctx.lineTo(size * 0.08, size * 0.56);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    ctx.clearRect(0, 0, size, size);
    const bodyGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, size * 0.46);
    bodyGrad.addColorStop(0, 'rgba(2, 4, 8, 0.62)');
    bodyGrad.addColorStop(0.55, 'rgba(2, 4, 8, 0.24)');
    bodyGrad.addColorStop(1, 'rgba(2, 4, 8, 0)');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.44, size * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createStudioSkyTexture(topHex: string, midHex: string, horizonHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, topHex);
    grad.addColorStop(0.46, midHex);
    grad.addColorStop(0.60, horizonHex);
    grad.addColorStop(1.0, topHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildProvingGroundProps(): {
  propsGroup: THREE.Group;
  accentMats: THREE.MeshBasicMaterial[];
  galleryGroup: THREE.Group;
  hangarGroup: THREE.Group;
} {
  const propsGroup = new THREE.Group();
  const accentMats: THREE.MeshBasicMaterial[] = [];

  const accentMat = new THREE.MeshBasicMaterial({
    color: 0x8cc8ff,
    transparent: true,
    opacity: 0.85,
  });
  accentMats.push(accentMat);

  const subtleHaloMat = new THREE.MeshBasicMaterial({
    color: 0x8cc8ff,
    transparent: true,
    opacity: 0.32,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  accentMats.push(subtleHaloMat);

  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x181f28,
    roughness: 0.62,
    metalness: 0.25,
  });

  // 1. 4-sided smooth beveled driveable test deck + glowing top-deck edge guides
  const rampGroup = new THREE.Group();
  rampGroup.position.set(RAMP_CENTER_X, 0, RAMP_CENTER_Z);
  rampGroup.rotation.y = RAMP_YAW;

  const totalL = (RAMP_FLAT_HALF_L + RAMP_SLOPE_L) * 2;
  const totalW = (RAMP_FLAT_HALF_W + RAMP_SIDE_SLOPE) * 2;
  const rampGeo = new THREE.PlaneGeometry(totalL, totalW, 44, 28);
  rampGeo.rotateX(-Math.PI / 2);
  const posAttr = rampGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i += 1) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, sampleRampLocalHeight(x, z) + 0.002);
  }
  rampGeo.computeVertexNormals();
  const rampTopMesh = new THREE.Mesh(rampGeo, darkMetalMat);
  rampTopMesh.receiveShadow = true;
  rampTopMesh.castShadow = true;
  rampGroup.add(rampTopMesh);

  for (const sideZ of [-RAMP_FLAT_HALF_W, RAMP_FLAT_HALF_W]) {
    // Thin luminous guide strip along the flat top deck edges
    const edgeStrip = new THREE.Mesh(new THREE.BoxGeometry(RAMP_FLAT_HALF_L * 2, 0.010, 0.020), accentMat);
    edgeStrip.position.set(0, RAMP_HEIGHT + 0.006, sideZ * 0.98);
    rampGroup.add(edgeStrip);
  }
  propsGroup.add(rampGroup);

  // 2. Suspension ripple test pad (smooth sinusoidal bumps)
  const rippleGroup = new THREE.Group();
  rippleGroup.position.set(RIPPLE_CENTER_X, 0, RIPPLE_CENTER_Z);
  rippleGroup.rotation.y = RIPPLE_YAW;
  const ripGeo = new THREE.PlaneGeometry(RIPPLE_HALF_L * 2, RIPPLE_HALF_W * 2, 48, 1);
  ripGeo.rotateX(-Math.PI / 2);
  const rPos = ripGeo.attributes.position;
  for (let i = 0; i < rPos.count; i += 1) {
    const x = rPos.getX(i);
    const wave = 0.5 * (1 + Math.cos((x / RIPPLE_HALF_L) * Math.PI * 5));
    const env = Math.max(0, Math.cos((x / RIPPLE_HALF_L) * (Math.PI / 2)));
    rPos.setY(i, RIPPLE_HEIGHT * wave * env + 0.002);
  }
  ripGeo.computeVertexNormals();
  const ripMesh = new THREE.Mesh(ripGeo, darkMetalMat);
  ripMesh.receiveShadow = true;
  ripMesh.castShadow = true;
  rippleGroup.add(ripMesh);

  for (const sideZ of [-RIPPLE_HALF_W, RIPPLE_HALF_W]) {
    const border = new THREE.Mesh(new THREE.BoxGeometry(RIPPLE_HALF_L * 2, 0.008, 0.018), subtleHaloMat);
    border.position.set(0, 0.006, sideZ);
    rippleGroup.add(border);
  }
  propsGroup.add(rippleGroup);

  // 3. Sleek architectural slalom bollards with luminous top halo rings
  const bollardGeo = new THREE.CylinderGeometry(0.088, 0.105, 0.42, 24);
  const bollardRingGeo = new THREE.TorusGeometry(0.092, 0.009, 10, 28);
  bollardRingGeo.rotateX(Math.PI / 2);
  const bollardFloorHaloGeo = new THREE.RingGeometry(0.14, 0.165, 28);
  bollardFloorHaloGeo.rotateX(-Math.PI / 2);

  for (const b of BOLLARDS) {
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    const body = new THREE.Mesh(bollardGeo, darkMetalMat);
    body.position.y = 0.21;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    const topRing = new THREE.Mesh(bollardRingGeo, accentMat);
    topRing.position.y = 0.37;
    g.add(topRing);

    const floorRing = new THREE.Mesh(bollardFloorHaloGeo, subtleHaloMat);
    floorRing.position.y = 0.003;
    g.add(floorRing);

    propsGroup.add(g);
  }

  // 4. Outer arena distance ring (subtle 6.4m architectural boundary)
  const boundaryRing = new THREE.Mesh(new THREE.RingGeometry(ARENA_RADIUS_M - 0.02, ARENA_RADIUS_M, 96), subtleHaloMat);
  boundaryRing.rotation.x = -Math.PI / 2;
  boundaryRing.position.y = 0.003;
  propsGroup.add(boundaryRing);

  // 5. Distant Gallery architectural walls & light slits (for gallery theme)
  const galleryGroup = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x20262f, roughness: 0.88, metalness: 0.05 });
  const slitMat = new THREE.MeshBasicMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.68 });
  const wallRadius = 8.4;
  for (let i = 0; i < 10; i += 1) {
    const angle = ((i + 0.5) / 10) * Math.PI * 2;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.2, 0.18), wallMat);
    panel.position.set(Math.cos(angle) * wallRadius, 2.05, Math.sin(angle) * wallRadius);
    panel.lookAt(0, 2.05, 0);
    galleryGroup.add(panel);

    const slitAngle = angle + Math.PI / 10;
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 3.2), slitMat);
    slit.position.set(Math.cos(slitAngle) * (wallRadius - 0.14), 1.65, Math.sin(slitAngle) * (wallRadius - 0.14));
    slit.lookAt(0, 1.65, 0);
    galleryGroup.add(slit);
  }
  galleryGroup.visible = false;

  // 6. Distant Hangar bay ribs & cyan strips (for hangar theme)
  const hangarGroup = new THREE.Group();
  const ribMat = new THREE.MeshStandardMaterial({ color: 0x0c131d, roughness: 0.62, metalness: 0.36 });
  const cyanStripMat = new THREE.MeshBasicMaterial({ color: 0x6ce4ff, transparent: true, opacity: 0.78 });
  const hangarRadius = 8.2;
  for (let i = 0; i < 10; i += 1) {
    const angle = ((i + 0.35) / 10) * Math.PI * 2;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 4.4, 0.42), ribMat);
    pillar.position.set(Math.cos(angle) * hangarRadius, 2.15, Math.sin(angle) * hangarRadius);
    pillar.lookAt(0, 2.15, 0);
    hangarGroup.add(pillar);

    const barAngle = angle + Math.PI / 10;
    for (const barY of [0.72, 1.56]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(3.6, barY < 1 ? 0.065 : 0.036), cyanStripMat);
      strip.position.set(Math.cos(barAngle) * (hangarRadius - 0.1), barY, Math.sin(barAngle) * (hangarRadius - 0.1));
      strip.lookAt(0, barY, 0);
      hangarGroup.add(strip);
    }
  }
  hangarGroup.visible = false;

  return { propsGroup, accentMats, galleryGroup, hangarGroup };
}

export function mountStandby3dScene(
  canvas: HTMLCanvasElement,
  options: Standby3dMountOptions = {},
): Standby3dController {
  let sceneId: Standby3dSceneId = normalizeSceneId(options.scene);
  let accentTone: Standby3dAccentTone = options.accentTone === 'fsdBlue' ? 'fsdBlue' : 'graphite';
  let interactive = options.interactive !== false;
  let paused = Boolean(options.paused);
  const lowPerf = options.performanceTier === 'low';
  let disposed = false;
  let ready = false;
  let userMoved = false;
  let targetBodyHeightOffset = 0;
  let currentBodyHeightOffset = 0;

  // Offline joystick driving inputs (driveY < 0 = forward, driveX > 0 = strafe right, turnX > 0 = turn right)
  let inputDriveX = 0;
  let inputDriveY = 0;
  let inputTurnX = 0;

  // Dynamic robot state in proving ground
  let robotX = 0;
  let robotY = 0;
  let robotZ = 0;
  let robotYaw = 0; // 0 = facing +X (identical to default studio pose!)
  let velFwd = 0;
  let velLat = 0;
  let velYaw = 0;
  let prevVelFwd = 0;
  let accelPitch = 0;
  let turnRoll = 0;
  let terrainPitch = 0;
  let terrainRoll = 0;
  let gaitPhase = 0;
  let hasDrivenAway = false;
  let userOrbitOverrideTimer = 0;

  const setUserMoved = (next: boolean) => {
    if (userMoved === next) return;
    userMoved = next;
    options.onUserMovedChange?.(next);
  };

  const applyBodyHeight = (heightM: number | null | undefined) => {
    if (typeof heightM === 'number' && Number.isFinite(heightM)) {
      targetBodyHeightOffset = clamp((heightM - NOMINAL_BODY_HEIGHT_M) * 0.55, -0.095, 0.065);
    } else {
      targetBodyHeightOffset = 0;
    }
  };
  applyBodyHeight(options.bodyHeightM);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: lowPerf ? 'default' : 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !lowPerf;
  if (!lowPerf) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  const hostDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  renderer.setPixelRatio(lowPerf ? Math.min(hostDpr, 1.25) : Math.min(hostDpr, 2));

  const scene = new THREE.Scene();
  const initialPalette = THEME_PALETTES[sceneId];
  scene.background = new THREE.Color(initialPalette.bgHex);
  const fog = new THREE.FogExp2(initialPalette.bgHex, initialPalette.fogDensity);
  scene.fog = fog;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const studioEnvTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  let forestEnvTex: THREE.Texture | null = null;
  let realForestSkyTex: THREE.Texture | null = null;
  scene.environment = studioEnvTex;

  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.18, 65);

  // Subtle curved studio / atmospheric forest sky dome
  const skyGeo = new THREE.SphereGeometry(32, 36, 22);
  const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);

  // Seamless proving ground matte studio floor (low envMapIntensity preserves dark spotlight pool drama!)
  const floorGeo = new THREE.CircleGeometry(14, 72);
  const floorMat = new THREE.MeshStandardMaterial({
    color: initialPalette.floorHex,
    roughness: initialPalette.floorRoughness,
    metalness: initialPalette.floorMetalness,
    envMapIntensity: 0.08,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = !lowPerf;
  scene.add(floor);

  // Iconic DOSO glowing double-ring home pad at origin (0, 0)
  const pedestalGeo = new THREE.PlaneGeometry(1.80, 1.80);
  const pedestalMat = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    opacity: 0.96,
  });
  const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
  pedestal.rotation.x = -Math.PI / 2;
  pedestal.position.y = 0.003;
  scene.add(pedestal);

  // Proving ground ramp, suspension ripples, bollards & themed walls
  const { propsGroup, accentMats, galleryGroup, hangarGroup } = buildProvingGroundProps();
  scene.add(propsGroup);
  scene.add(galleryGroup);
  scene.add(hangarGroup);

  // Lazy-build the 3D Misty Forest world only when actually entering the forest scene.
  let forestWorld: ReturnType<typeof createForestWorld> | null = null;
  const ensureForestWorld = () => {
    if (!forestWorld) {
      forestWorld = createForestWorld({ lowPerf });
      scene.add(forestWorld.group);
    }
    return forestWorld;
  };
  if (sceneId === 'forest') {
    ensureForestWorld();
  }

  const sampleActiveTerrainHeight = (wx: number, wz: number): number => (
    sceneId === 'forest' && forestWorld ? forestWorld.sampleHeight(wx, wz) : sampleTerrainHeight(wx, wz)
  );
  const getActiveColliders = () => (sceneId === 'forest' && forestWorld ? forestWorld.colliders : BOLLARDS);
  const getActiveArenaRadius = () => (sceneId === 'forest' && forestWorld ? forestWorld.arenaRadius : ARENA_RADIUS_M);

  // Lighting rig: dramatic overhead studio SpotLight + warm golden Forest Directional Sun + crisp rim light
  const hemiLight = new THREE.HemisphereLight(
    initialPalette.hemiSky,
    initialPalette.hemiGround,
    initialPalette.hemiIntensity,
  );
  scene.add(hemiLight);

  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, 0.25, 0);
  scene.add(spotTarget);

  const heroSpot = new THREE.SpotLight(
    initialPalette.spotColor,
    initialPalette.spotIntensity,
    11.5,
    Math.PI / 4.2,
    0.90,
    1.65,
  );
  heroSpot.position.set(1.15, 3.55, -1.05);
  heroSpot.target = spotTarget;
  heroSpot.castShadow = !lowPerf;
  if (!lowPerf) {
    heroSpot.shadow.mapSize.set(1024, 1024);
    heroSpot.shadow.camera.near = 0.6;
    heroSpot.shadow.camera.far = 10.0;
    heroSpot.shadow.bias = -0.0004;
    heroSpot.shadow.normalBias = 0.015;
    heroSpot.shadow.radius = 4;
  }
  scene.add(heroSpot);

  const forestSunTarget = new THREE.Object3D();
  forestSunTarget.position.set(0, 0.2, 0);
  scene.add(forestSunTarget);

  const forestSun = new THREE.DirectionalLight(0xfff1dc, 2.45);
  forestSun.position.set(4.8, 9.2, -5.4);
  forestSun.target = forestSunTarget;
  forestSun.castShadow = !lowPerf;
  if (!lowPerf) {
    forestSun.shadow.mapSize.set(2048, 2048);
    forestSun.shadow.camera.left = -5.5;
    forestSun.shadow.camera.right = 5.5;
    forestSun.shadow.camera.top = 5.5;
    forestSun.shadow.camera.bottom = -5.5;
    forestSun.shadow.camera.near = 1.0;
    forestSun.shadow.camera.far = 26.0;
    forestSun.shadow.bias = -0.00025;
    forestSun.shadow.normalBias = 0.014;
    forestSun.shadow.radius = 2.5;
  }
  scene.add(forestSun);

  const forestWarmFill = new THREE.DirectionalLight(0xffe1b8, 0.0);
  forestWarmFill.position.set(3.8, 2.2, -3.2);
  scene.add(forestWarmFill);

  const rimLight = new THREE.DirectionalLight(initialPalette.rimColor, initialPalette.rimIntensity);
  rimLight.position.set(-2.6, 2.0, 2.2);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(initialPalette.fillColor, initialPalette.fillIntensity);
  fillLight.position.set(2.2, 0.9, 1.8);
  scene.add(fillLight);

  // Moving robot root & dynamic under-chassis contact shadow + front headlight floor beam
  const robotWorldGroup = new THREE.Group();
  scene.add(robotWorldGroup);

  const contactShadowTex = createContactShadowTexture();
  const contactShadowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.12, 0.86),
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
    }),
  );
  contactShadowMesh.rotation.x = -Math.PI / 2;
  contactShadowMesh.position.y = 0.005;
  robotWorldGroup.add(contactShadowMesh);

  const headlightTex = createHeadlightPoolTexture();
  const headlightMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.95, 1.25),
    new THREE.MeshBasicMaterial({
      map: headlightTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.42,
    }),
  );
  headlightMesh.rotation.x = -Math.PI / 2;
  headlightMesh.position.set(1.22, 0.007, 0);
  robotWorldGroup.add(headlightMesh);

  const robotModelAnchor = new THREE.Group();
  robotWorldGroup.add(robotModelAnchor);

  let bodyNode: THREE.Object3D | null = null;
  let bodyRestY = 0.4917;
  const legRigs: LegRig[] = [];

  let currentSkyTex: THREE.Texture | null = null;
  let currentFloorTex: THREE.Texture | null = null;
  let currentPedestalTex: THREE.Texture | null = null;

  const applyThemeVisuals = () => {
    const palette = THEME_PALETTES[sceneId];
    const isFsdBlue = accentTone === 'fsdBlue';
    const isForest = sceneId === 'forest';

    scene.background = new THREE.Color(palette.bgHex);
    fog.color.setHex(palette.bgHex);
    fog.density = palette.fogDensity;

    floor.visible = !isForest;
    pedestal.visible = !isForest;
    propsGroup.visible = !isForest;
    if (isForest) {
      ensureForestWorld().group.visible = true;
    } else if (forestWorld) {
      forestWorld.group.visible = false;
    }

    floorMat.color.setHex(palette.floorHex);
    floorMat.roughness = palette.floorRoughness;
    floorMat.metalness = palette.floorMetalness;

    heroSpot.color.setHex(palette.spotColor);
    heroSpot.intensity = palette.spotIntensity;
    heroSpot.visible = !isForest;
    heroSpot.castShadow = !lowPerf && !isForest;
    forestSun.visible = isForest;
    forestSun.castShadow = !lowPerf && isForest;
    forestWarmFill.visible = false;

    rimLight.color.setHex(isFsdBlue && !isForest ? 0x52a4ff : palette.rimColor);
    rimLight.intensity = isFsdBlue && !isForest ? palette.rimIntensity * 1.15 : palette.rimIntensity;
    rimLight.visible = palette.rimIntensity > 0.01;
    fillLight.color.setHex(palette.fillColor);
    fillLight.intensity = palette.fillIntensity;
    fillLight.visible = !isForest;

    // Disable artificial white headlight floor cone in sunlit outdoor forest (keep in dark studio/hangar!)
    headlightMesh.visible = !isForest;
    (contactShadowMesh.material as THREE.MeshBasicMaterial).opacity = isForest ? 0.54 : 0.85;
    hemiLight.color.setHex(palette.hemiSky);
    hemiLight.groundColor.setHex(palette.hemiGround);
    hemiLight.intensity = palette.hemiIntensity;
    renderer.toneMappingExposure = palette.exposure;

    const accentHex = isFsdBlue ? 0x52a6ff : palette.accentEmissiveHex;
    for (const m of accentMats) {
      m.color.setHex(accentHex);
    }

    galleryGroup.visible = palette.showGalleryWalls;
    hangarGroup.visible = palette.showHangarRibs;

    const nextSky = isForest
      ? (realForestSkyTex ?? createForestSkyTexture())
      : sceneId === 'gallery'
        ? createStudioSkyTexture('#0c1016', '#171d26', '#212934')
        : sceneId === 'hangar'
          ? createStudioSkyTexture('#03060a', '#070f19', '#0d1b2a')
          : createStudioSkyTexture('#040609', '#090d14', '#101721');
    if (currentSkyTex && currentSkyTex !== realForestSkyTex) currentSkyTex.dispose();
    currentSkyTex = nextSky;
    skyMat.map = nextSky;
    skyMat.needsUpdate = true;
    skyDome.rotation.y = isForest ? 0.95 : 0;

    scene.environment = isForest && forestEnvTex ? forestEnvTex : studioEnvTex;

    const nextFloor = createFloorGridTexture(
      isFsdBlue ? 'rgba(92, 168, 255, 0.14)' : palette.floorGridColor,
      palette.floorFineColor,
    );
    if (currentFloorTex) currentFloorTex.dispose();
    currentFloorTex = nextFloor;
    floorMat.map = nextFloor;
    floorMat.needsUpdate = true;

    const ringPrimary = isFsdBlue ? 'rgba(130, 198, 255, 0.96)' : palette.ringPrimary;
    const ringSecondary = isFsdBlue ? 'rgba(66, 154, 255, 0.68)' : palette.ringSecondary;
    const nextPedestal = createPedestalTexture(ringPrimary, ringSecondary, sceneId === 'hangar');
    if (currentPedestalTex) currentPedestalTex.dispose();
    currentPedestalTex = nextPedestal;
    pedestalMat.map = nextPedestal;
    pedestalMat.needsUpdate = true;

    const effectiveEnvIntensity = isForest && !forestEnvTex ? 0.46 : palette.envIntensity;
    robotModelAnchor.traverse(obj => {
      if ((obj as THREE.Mesh).isMesh) {
        const mat = (obj as THREE.Mesh).material;
        const mats = Array.isArray(mat) ? mat : [mat];
        for (const m of mats) {
          if (m && 'envMapIntensity' in m) {
            (m as THREE.MeshStandardMaterial).envMapIntensity = effectiveEnvIntensity;
          }
        }
      }
    });
  };

  applyThemeVisuals();

  // Camera spherical coordinates around smoothly tracking target
  const getDefaultRadius = () => (sceneId === 'forest' ? DEFAULT_RADIUS_FOREST : DEFAULT_RADIUS_STUDIO);
  const getDefaultPhi = () => (sceneId === 'forest' ? DEFAULT_PHI_FOREST : DEFAULT_PHI_STUDIO);
  const getTargetYOffset = () => (sceneId === 'forest' ? TARGET_Y_OFFSET_FOREST : TARGET_Y_OFFSET_STUDIO);
  let theta = DEFAULT_THETA;
  let phi = getDefaultPhi();
  let radius = getDefaultRadius();
  let targetTheta = DEFAULT_THETA;
  let targetPhi = getDefaultPhi();
  let targetRadius = getDefaultRadius();
  let velTheta = 0;
  let velPhi = 0;
  const camFocus = new THREE.Vector3(0, getTargetYOffset(), 0);

  const updateCameraTransform = () => {
    const sinPhi = Math.sin(phi);
    const camX = camFocus.x + radius * sinPhi * Math.cos(theta);
    const camZ = camFocus.z + radius * sinPhi * Math.sin(theta);
    const minCamY = sampleActiveTerrainHeight(camX, camZ) + 0.24;
    camera.position.set(
      camX,
      Math.max(minCamY, camFocus.y + radius * Math.cos(phi)),
      camZ,
    );
    camera.lookAt(camFocus);
  };
  updateCameraTransform();

  let rafId = 0;
  let lastFrameTs = performance.now();
  let lastRenderMs = 0;
  let idleSettleFrames = 3;
  const LOW_PERF_FRAME_INTERVAL_MS = 33;
  let scheduleRenderFrame: () => void = () => {};
  const wakeRender = (frames = 4) => {
    idleSettleFrames = Math.max(idleSettleFrames, frames);
    if (!disposed && !paused && !rafId) {
      lastFrameTs = performance.now();
      scheduleRenderFrame();
    }
  };

  const resize = (explicitW?: number, explicitH?: number) => {
    if (disposed) return;
    const parent = canvas.parentElement;
    const width = Math.max(1, Math.round(explicitW ?? parent?.clientWidth ?? canvas.clientWidth ?? window.innerWidth ?? 800));
    const height = Math.max(1, Math.round(explicitH ?? parent?.clientHeight ?? canvas.clientHeight ?? window.innerHeight ?? 450));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const baseFov = sceneId === 'forest' ? 39 : 34;
    camera.fov = camera.aspect > 2.05 ? baseFov + 2 : camera.aspect < 1.55 ? baseFov + 4 : baseFov;
    camera.updateProjectionMatrix();
    wakeRender(2);
  };
  resize();

  const resetRobot = () => {
    robotX = 0;
    robotY = sampleActiveTerrainHeight(0, 0);
    robotZ = 0;
    robotYaw = 0;
    velFwd = 0;
    velLat = 0;
    velYaw = 0;
    prevVelFwd = 0;
    accelPitch = 0;
    turnRoll = 0;
    terrainPitch = 0;
    terrainRoll = 0;
    hasDrivenAway = false;
    wakeRender(4);
  };

  const resetView = () => {
    // If parked away from origin and double-tapped, smoothly recenter robot back on the DOSO pedestal too!
    if (Math.hypot(velFwd, velLat) < 0.04 && Math.hypot(robotX, robotZ) > 0.35) {
      resetRobot();
    }
    targetTheta = DEFAULT_THETA;
    targetPhi = getDefaultPhi();
    targetRadius = getDefaultRadius();
    velTheta = 0;
    velPhi = 0;
    userOrbitOverrideTimer = 0;
    setUserMoved(false);
    wakeRender(6);
  };

  // Pointer & multi-touch gesture handling (single-finger 360 orbit + pinch zoom + double-tap reset)
  const activePointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let lastSingleX = 0;
  let lastSingleY = 0;
  let downX = 0;
  let downY = 0;
  let movedDistance = 0;
  let lastPinchDist: number | null = null;
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  const getPinchDistance = (): number | null => {
    if (activePointers.size < 2) return null;
    const pts = Array.from(activePointers.values());
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!interactive || disposed) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch { /* Pointer capture may be unavailable in synthetic events. */ }
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 1) {
      dragging = true;
      lastSingleX = e.clientX;
      lastSingleY = e.clientY;
      downX = e.clientX;
      downY = e.clientY;
      movedDistance = 0;
      velTheta = 0;
      velPhi = 0;
      lastPinchDist = null;
      userOrbitOverrideTimer = 3.2;
      canvas.style.cursor = 'grabbing';
    } else if (activePointers.size === 2) {
      dragging = false;
      velTheta = 0;
      velPhi = 0;
      userOrbitOverrideTimer = 3.2;
      lastPinchDist = getPinchDistance();
    }
    wakeRender(6);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!interactive || disposed || !activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 1 && dragging) {
      const dx = e.clientX - lastSingleX;
      const dy = e.clientY - lastSingleY;
      lastSingleX = e.clientX;
      lastSingleY = e.clientY;
      movedDistance += Math.hypot(dx, dy);

      const width = Math.max(320, canvas.clientWidth || window.innerWidth || 800);
      const height = Math.max(240, canvas.clientHeight || window.innerHeight || 400);
      const dTheta = (dx / width) * Math.PI * 1.85;
      const dPhi = -(dy / height) * Math.PI * 0.95;

      targetTheta += dTheta;
      targetPhi = clamp(targetPhi + dPhi, MIN_PHI, MAX_PHI);
      velTheta = dTheta * 0.72;
      velPhi = dPhi * 0.48;
      userOrbitOverrideTimer = 3.2;
      if (movedDistance > 6) setUserMoved(true);
      wakeRender(6);
    } else if (activePointers.size === 2) {
      const nextDist = getPinchDistance();
      if (nextDist !== null && lastPinchDist !== null && lastPinchDist > 12) {
        const scale = lastPinchDist / Math.max(12, nextDist);
        targetRadius = clamp(targetRadius * scale, MIN_RADIUS, MAX_RADIUS);
        userOrbitOverrideTimer = 3.2;
        setUserMoved(true);
        wakeRender(6);
      }
      lastPinchDist = nextDist;
    }
  };

  const onPointerUpOrCancel = (e: PointerEvent) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);
    try {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch { /* Ignore capture release error. */ }

    if (activePointers.size === 0) {
      const now = performance.now();
      if (movedDistance < 10) {
        const tapGap = now - lastTapAt;
        const tapDist = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY);
        if (tapGap > 20 && tapGap < 300 && tapDist < 28) {
          resetView();
          lastTapAt = 0;
        } else {
          lastTapAt = now;
          lastTapX = downX;
          lastTapY = downY;
        }
      }
      dragging = false;
      lastPinchDist = null;
      canvas.style.cursor = interactive ? 'grab' : 'default';
    } else if (activePointers.size === 1) {
      const remaining = Array.from(activePointers.values())[0];
      lastSingleX = remaining.x;
      lastSingleY = remaining.y;
      dragging = true;
      lastPinchDist = null;
    }
  };

  const onWheel = (e: WheelEvent) => {
    if (!interactive || disposed) return;
    e.preventDefault();
    const factor = 1 + clamp(e.deltaY * 0.0012, -0.18, 0.18);
    targetRadius = clamp(targetRadius * factor, MIN_RADIUS, MAX_RADIUS);
    userOrbitOverrideTimer = 3.2;
    setUserMoved(true);
    wakeRender(6);
  };

  const clearActivePointers = () => {
    activePointers.clear();
    dragging = false;
    lastPinchDist = null;
    canvas.style.cursor = interactive ? 'grab' : 'default';
  };

  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.hidden) {
      clearActivePointers();
    }
  };

  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';
  canvas.style.cursor = interactive ? 'grab' : 'default';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUpOrCancel);
  canvas.addEventListener('pointercancel', onPointerUpOrCancel);
  canvas.addEventListener('lostpointercapture', onPointerUpOrCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const onWindowResize = () => resize();
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('blur', clearActivePointers);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  // Bind 16-DOF articulated leg hierarchy from exported GLB
  const bindArticulatedRig = (model: THREE.Group) => {
    legRigs.length = 0;
    bodyNode = model.getObjectByName('R50_BODY') ?? null;
    if (bodyNode) {
      bodyRestY = bodyNode.position.y;
    }

    const defs: ReadonlyArray<{
      id: LegId;
      isFront: boolean;
      isLeft: boolean;
      footX: number;
      footZ: number;
      hipAxisX: number;
      pitchAxisY: number;
    }> = [
      { id: 'FL', isFront: true, isLeft: true, footX: 0.319, footZ: -0.265, hipAxisX: -1, pitchAxisY: 0.099833 },
      { id: 'FR', isFront: true, isLeft: false, footX: 0.319, footZ: 0.265, hipAxisX: -1, pitchAxisY: -0.099833 },
      { id: 'RL', isFront: false, isLeft: true, footX: -0.324, footZ: -0.265, hipAxisX: 1, pitchAxisY: 0.099833 },
      { id: 'RR', isFront: false, isLeft: false, footX: -0.324, footZ: 0.265, hipAxisX: 1, pitchAxisY: -0.099833 },
    ];

    for (const def of defs) {
      const hip = model.getObjectByName(`${def.id}_HIP`);
      const thigh = model.getObjectByName(`${def.id}_THIGH`);
      const calf = model.getObjectByName(`${def.id}_CALF`);
      const wheel = model.getObjectByName(`${def.id}_WHEEL`);
      if (!hip || !thigh || !calf || !wheel) continue;

      const restX = def.isFront ? -0.006 : 0.006;
      const restIk = solveTwoLinkLeg(def.isFront, restX, -LEG_REST_DROP);

      legRigs.push({
        id: def.id,
        isFront: def.isFront,
        isLeft: def.isLeft,
        hip,
        thigh,
        calf,
        wheel,
        hipRestQ: hip.quaternion.clone(),
        thighRestQ: thigh.quaternion.clone(),
        calfRestQ: calf.quaternion.clone(),
        wheelRestQ: wheel.quaternion.clone(),
        hipAxis: new THREE.Vector3(def.hipAxisX, 0, 0),
        // Standardized +Z-pointing pitch/wheel axis matching exact 0.1 rad hip camber!
        pitchAxis: new THREE.Vector3(0, def.pitchAxisY, 0.995004).normalize(),
        footOffsetX: def.footX,
        footOffsetZ: def.footZ,
        restX,
        restThighAbs: restIk.thighAbs,
        restCalfRel: restIk.calfRel,
        wheelAngle: 0,
        currentDeltaY: 0,
        currentDeltaX: 0,
        currentHipRoll: 0,
        lastKneeDelta: 0,
      });
    }
  };

  // Load articulated 16-DOF robot GLB (Meshopt-compressed) + photoreal forest kit, 360° sky & HDRI IBL in parallel
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let robotLoaded = false;
  let pendingForestLoads = 0;

  const tryFinalizeReady = () => {
    if (disposed || ready || !robotLoaded || pendingForestLoads > 0) return;
    ready = true;
    applyThemeVisuals();
    renderer.render(scene, camera);
    wakeRender(2);
    options.onReady?.();
  };

  const finishOptionalForestLoad = () => {
    pendingForestLoads = Math.max(0, pendingForestLoads - 1);
    if (!disposed) {
      if (ready) {
        applyThemeVisuals();
        renderer.render(scene, camera);
      } else {
        tryFinalizeReady();
      }
    }
  };

  // 1. Load photoreal Blender forest kit GLB (skip on lowPerf Android to save ~100MB RAM & GPU stalls)
  if (!lowPerf && (options.forestKitBase64 || options.forestKitUrl)) {
    pendingForestLoads += 1;
    const onKitOk = (gltf: { scene: THREE.Group }) => {
      if (!disposed) ensureForestWorld().applyPhotorealKit(gltf.scene);
      finishOptionalForestLoad();
    };
    const onKitErr = () => finishOptionalForestLoad();
    if (options.forestKitBase64) {
      try {
        const buf = decodeBase64ToArrayBuffer(options.forestKitBase64);
        loader.parse(buf, '', onKitOk, onKitErr);
      } catch {
        onKitErr();
      }
    } else if (options.forestKitUrl) {
      loader.load(options.forestKitUrl, onKitOk, undefined, onKitErr);
    }
  }

  // 2. Load real 360° misty_pines equirectangular photograph for forest sky dome
  if (!lowPerf && options.forestSkyUrl) {
    pendingForestLoads += 1;
    const texLoader = new THREE.TextureLoader();
    texLoader.load(
      options.forestSkyUrl,
      tex => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.needsUpdate = true;
        realForestSkyTex = tex;
        finishOptionalForestLoad();
      },
      undefined,
      () => finishOptionalForestLoad(),
    );
  }

  // 3. Load real floating-point 256x128 misty_pines HDRI for authentic IBL metallic reflections on R50
  if (!lowPerf && (options.forestHdrBase64 || options.forestHdrUrl)) {
    pendingForestLoads += 1;
    const rgbeLoader = new RGBELoader();
    const applyHdrData = (hdrTex: THREE.DataTexture) => {
      if (disposed) {
        hdrTex.dispose();
        return;
      }
      hdrTex.mapping = THREE.EquirectangularReflectionMapping;
      const pmremRT = pmrem.fromEquirectangular(hdrTex);
      hdrTex.dispose();
      forestEnvTex = pmremRT.texture;
      finishOptionalForestLoad();
    };
    if (options.forestHdrBase64) {
      try {
        const buf = decodeBase64ToArrayBuffer(options.forestHdrBase64);
        const parsed = rgbeLoader.parse(buf);
        const hdrTex = new THREE.DataTexture(parsed.data, parsed.width, parsed.height);
        hdrTex.type = parsed.type;
        hdrTex.minFilter = THREE.LinearFilter;
        hdrTex.magFilter = THREE.LinearFilter;
        hdrTex.generateMipmaps = false;
        hdrTex.flipY = true;
        hdrTex.needsUpdate = true;
        applyHdrData(hdrTex);
      } catch {
        finishOptionalForestLoad();
      }
    } else if (options.forestHdrUrl) {
      rgbeLoader.load(
        options.forestHdrUrl,
        tex => applyHdrData(tex),
        undefined,
        () => finishOptionalForestLoad(),
      );
    }
  }

  const handleModelLoaded = (gltf: { scene: THREE.Group }) => {
    if (disposed) return;
    const model = gltf.scene;
    const palette = THEME_PALETTES[sceneId];
    model.traverse(node => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        mesh.castShadow = !lowPerf;
        mesh.receiveShadow = !lowPerf;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m && 'envMapIntensity' in m) {
            (m as THREE.MeshStandardMaterial).envMapIntensity = palette.envIntensity;
          }
        }
      }
    });

    // Ground robot cleanly at Y=0 in rest pose
    const box = new THREE.Box3().setFromObject(model);
    if (!box.isEmpty()) {
      model.position.y -= box.min.y;
    }

    bindArticulatedRig(model);
    robotModelAnchor.add(model);
    robotLoaded = true;
    tryFinalizeReady();
  };

  const handleModelError = (err: unknown) => {
    if (disposed) return;
    const msg = err instanceof Error ? err.message : String(err ?? '3D model load failed');
    options.onError?.(msg);
  };

  if (options.glbGzipBase64) {
    void decodeGzipBase64ToArrayBuffer(options.glbGzipBase64)
      .then(buffer => {
        if (!disposed) loader.parse(buffer, '', handleModelLoaded, handleModelError);
      })
      .catch(err => handleModelError(err));
  } else if (options.glbBase64) {
    try {
      const buffer = decodeBase64ToArrayBuffer(options.glbBase64);
      loader.parse(buffer, '', handleModelLoaded, handleModelError);
    } catch (err) {
      handleModelError(err);
    }
  } else if (options.glbUrl) {
    loader.load(options.glbUrl, handleModelLoaded, undefined, handleModelError);
  } else {
    handleModelError(new Error('No 3D model source provided'));
  }

  // Reusable scratch quaternions (zero GC pressure at 60fps!)
  const tmpQ = new THREE.Quaternion();

  const updateRobotKinematics = (dt: number, now: number) => {
    // 1. Driving velocity integration with sporty acceleration & natural damping
    // Left stick Y < 0 = push forward; left stick X > 0 = strafe right; right stick X > 0 = turn right
    const cmdFwd = -inputDriveY * 1.85;
    const cmdLat = inputDriveX * 0.92;
    const cmdYaw = -inputTurnX * 1.95; // positive yaw = CCW (turn left), so right stick +X = negative yaw

    const activeDrive = Math.abs(cmdFwd) > 0.02 || Math.abs(cmdLat) > 0.02 || Math.abs(cmdYaw) > 0.02;
    if (activeDrive) hasDrivenAway = true;

    const velBlend = 1 - Math.exp(-7.5 * dt);
    prevVelFwd = velFwd;
    velFwd += (cmdFwd - velFwd) * velBlend;
    velLat += (cmdLat - velLat) * velBlend;
    velYaw += (cmdYaw - velYaw) * velBlend;

    if (Math.abs(velFwd) < 0.002 && Math.abs(cmdFwd) < 0.001) velFwd = 0;
    if (Math.abs(velLat) < 0.002 && Math.abs(cmdLat) < 0.001) velLat = 0;
    if (Math.abs(velYaw) < 0.002 && Math.abs(cmdYaw) < 0.001) velYaw = 0;

    // 2. Integrate world heading & position (forward = +X when yaw = 0, right = +Z when yaw = 0)
    const dYaw = velYaw * dt;
    robotYaw = wrapAngle(robotYaw + dYaw);

    const cosY = Math.cos(robotYaw);
    const sinY = Math.sin(robotYaw);
    // Forward unit vector in Three.js Y-up when yaw rotates CCW around +Y: (cosY, 0, -sinY)
    // Right unit vector: (sinY, 0, cosY)
    const fwdX = cosY;
    const fwdZ = -sinY;
    const rightX = sinY;
    const rightZ = cosY;

    let nextX = robotX + (fwdX * velFwd + rightX * velLat) * dt;
    let nextZ = robotZ + (fwdZ * velFwd + rightZ * velLat) * dt;

    // Soft collision deflection against tree trunks, mossy boulders & bollards (smooth sliding, never hard snag)
    const robotRadius = 0.44;
    if (sceneId === 'forest' && forestWorld) {
      const guided = forestWorld.constrainPosition(robotX, robotZ, nextX, nextZ, robotRadius);
      nextX = guided.x;
      nextZ = guided.z;
    }
    for (const b of getActiveColliders()) {
      const bx = nextX - b.x;
      const bz = nextZ - b.z;
      const dist = Math.hypot(bx, bz);
      const minDist = robotRadius + b.r;
      if (dist < minDist && dist > 1e-4) {
        const push = (minDist - dist) / dist;
        nextX += bx * push;
        nextZ += bz * push;
      }
    }

    // Soft circular arena perimeter constraint
    const radialDist = Math.hypot(nextX, nextZ);
    const maxR = getActiveArenaRadius() - robotRadius;
    if (radialDist > maxR && radialDist > 1e-4) {
      const clampScale = maxR / radialDist;
      nextX *= clampScale;
      nextZ *= clampScale;
    }

    const actualDx = nextX - robotX;
    const actualDz = nextZ - robotZ;
    const actualFwdDist = actualDx * fwdX + actualDz * fwdZ;
    const actualLatDist = actualDx * rightX + actualDz * rightZ;
    robotX = nextX;
    robotZ = nextZ;

    // 3. Sample terrain height under all 4 wheel footprints for active 4-leg terrain adaptation!
    const wheelGroundY: Record<LegId, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };
    for (const leg of legRigs) {
      const wx = robotX + fwdX * leg.footOffsetX + rightX * leg.footOffsetZ;
      const wz = robotZ + fwdZ * leg.footOffsetX + rightZ * leg.footOffsetZ;
      wheelGroundY[leg.id] = sampleActiveTerrainHeight(wx, wz);
    }

    const avgGroundY = legRigs.length === 4
      ? 0.25 * (wheelGroundY.FL + wheelGroundY.FR + wheelGroundY.RL + wheelGroundY.RR)
      : sampleActiveTerrainHeight(robotX, robotZ);
    const frontGroundY = 0.5 * (wheelGroundY.FL + wheelGroundY.FR);
    const rearGroundY = 0.5 * (wheelGroundY.RL + wheelGroundY.RR);
    const leftGroundY = 0.5 * (wheelGroundY.FL + wheelGroundY.RL);
    const rightGroundY = 0.5 * (wheelGroundY.FR + wheelGroundY.RR);

    // Smooth chassis elevation & terrain pitch/roll alignment
    const suspBlend = 1 - Math.exp(-12.0 * dt);
    robotY += (avgGroundY - robotY) * suspBlend;

    // Positive rotation around Z pitches nose (+X) UP; positive rotation around X rolls right (+Z) DOWN
    const targetTerrainPitch = Math.atan2(frontGroundY - rearGroundY, 0.64) * 0.72;
    const targetTerrainRoll = Math.atan2(leftGroundY - rightGroundY, 0.53) * 0.72;
    terrainPitch += (targetTerrainPitch - terrainPitch) * suspBlend;
    terrainRoll += (targetTerrainRoll - terrainRoll) * suspBlend;

    // Dynamic acceleration squat / brake nose-dip + cornering banking lean
    const accelFwd = clamp((velFwd - prevVelFwd) / Math.max(0.008, dt), -5.0, 5.0);
    const targetAccelPitch = clamp(accelFwd * 0.015, -0.065, 0.065);
    const targetTurnRoll = clamp(-velFwd * velYaw * 0.042 - velLat * 0.055, -0.08, 0.08);
    const dynBlend = 1 - Math.exp(-9.0 * dt);
    accelPitch += (targetAccelPitch - accelPitch) * dynBlend;
    turnRoll += (targetTurnRoll - turnRoll) * dynBlend;

    // Living idle breathing + subtle dynamic body squat at speed
    const speedMag = Math.hypot(velFwd, velLat);
    const speedCrouch = -clamp(speedMag * 0.012, 0, 0.022);
    const idleBreath = lowPerf && speedMag <= 0.02
      ? 0
      : Math.sin(now * 0.0022) * (speedMag > 0.08 ? 0.004 : 0.0026);
    const bodyDeltaY = currentBodyHeightOffset + speedCrouch + idleBreath;

    // Gait phase advances during strafe / turn-in-place for lifelike omni-legged stepping!
    const lateralActivity = Math.abs(velLat) + Math.abs(velYaw) * 0.14;
    if (lateralActivity > 0.04) {
      gaitPhase += dt * (6.2 + lateralActivity * 3.8);
    }

    // Apply world transform to robot root + under-shadow + headlight beam
    robotWorldGroup.position.set(robotX, robotY, robotZ);
    robotWorldGroup.rotation.y = robotYaw;

    // Keep contact shadow & headlight aligned to ground slope cleanly
    contactShadowMesh.position.y = 0.012;
    contactShadowMesh.rotation.set(-Math.PI / 2 + terrainRoll, terrainPitch, 0);
    headlightMesh.position.y = 0.018;
    headlightMesh.rotation.set(-Math.PI / 2 + terrainRoll, terrainPitch, 0);
    (headlightMesh.material as THREE.MeshBasicMaterial).opacity = sceneId === 'forest'
      ? (activeDrive ? 0.44 : 0.26)
      : (activeDrive ? 0.54 : 0.36);

    // 4. Articulate the torso + all 16 real joints via analytical 2-link IK + wheel spin!
    if (bodyNode && legRigs.length === 4) {
      const totalPitch = terrainPitch + accelPitch;
      const totalRoll = terrainRoll + turnRoll;
      bodyNode.position.y = bodyRestY + bodyDeltaY;
      bodyNode.rotation.set(totalRoll, 0, totalPitch);

      const strafeFactor = clamp(Math.abs(velLat) / 0.45, 0, 1);

      for (const leg of legRigs) {
        // Compute local vertical compression needed so tire stays planted on exact terrain height
        const wheelGroundRel = wheelGroundY[leg.id] - robotY;
        const bodyCornerShiftY = bodyDeltaY
          + totalPitch * leg.footOffsetX
          - totalRoll * leg.footOffsetZ;

        // Diagonal trotting lift & hip-roll sweep during lateral crab-strafe!
        const diagSign = (leg.isFront === leg.isLeft) ? 1 : -1;
        const phase = gaitPhase + (diagSign > 0 ? 0 : Math.PI);
        const swingLift = strafeFactor > 0.05 ? Math.max(0, Math.sin(phase)) * 0.052 * strafeFactor : 0;
        const swingForeAft = strafeFactor > 0.05 ? Math.cos(phase) * 0.022 * strafeFactor : 0;
        const hipStrideRoll = strafeFactor > 0.05
          ? Math.cos(phase) * 0.13 * strafeFactor * Math.sign(velLat || 1)
          : 0;

        // Dynamic fore-aft suspension give during hard braking/acceleration
        const dynamicX = leg.restX - accelPitch * 0.18 + swingForeAft;
        const targetLegDrop = clamp(
          LEG_REST_DROP + bodyCornerShiftY - wheelGroundRel - swingLift,
          0.18,
          0.465,
        );

        const targetHipRoll = clamp(
          hipStrideRoll + turnRoll * (leg.isLeft ? 0.65 : -0.65),
          -0.28,
          0.28,
        );

        const ikBlend = 1 - Math.exp(-18.0 * dt);
        leg.currentDeltaY += ((LEG_REST_DROP - targetLegDrop) - leg.currentDeltaY) * ikBlend;
        leg.currentDeltaX += ((dynamicX - leg.restX) - leg.currentDeltaX) * ikBlend;
        leg.currentHipRoll += (targetHipRoll - leg.currentHipRoll) * ikBlend;

        const solvedDrop = clamp(LEG_REST_DROP - leg.currentDeltaY, 0.18, 0.465);
        const ik = solveTwoLinkLeg(leg.isFront, leg.restX + leg.currentDeltaX, -solvedDrop);
        const dThigh = ik.thighAbs - leg.restThighAbs - totalPitch;
        const dCalf = ik.calfRel - leg.restCalfRel;
        leg.lastKneeDelta = dCalf;

        // Apply exact joint rotations around each joint's calibrated 3D axis
        tmpQ.setFromAxisAngle(leg.hipAxis, leg.currentHipRoll);
        leg.hip.quaternion.copy(leg.hipRestQ).premultiply(tmpQ);

        tmpQ.setFromAxisAngle(leg.pitchAxis, dThigh);
        leg.thigh.quaternion.copy(leg.thighRestQ).premultiply(tmpQ);

        tmpQ.setFromAxisAngle(leg.pitchAxis, dCalf);
        leg.calf.quaternion.copy(leg.calfRestQ).premultiply(tmpQ);

        // True differential wheel rolling (forward +X distance -> negative spin around +Z!)
        // Left wheels are at Z < 0, right wheels at Z > 0. Turning left (dYaw > 0) makes right wheels move faster.
        const wheelLinearDist = actualFwdDist + (leg.isLeft ? -TRACK_HALF_M : TRACK_HALF_M) * dYaw
          + (Math.abs(actualLatDist) > 0.0001 ? actualLatDist * 0.15 : 0);
        leg.wheelAngle -= wheelLinearDist / WHEEL_RADIUS_M;
        tmpQ.setFromAxisAngle(leg.pitchAxis, leg.wheelAngle);
        leg.wheel.quaternion.copy(leg.wheelRestQ).premultiply(tmpQ);
      }
    }

    // Track overhead spotlight & forest directional sun shadows cleanly with the moving robot!
    spotTarget.position.set(robotX, robotY + 0.25, robotZ);
    heroSpot.position.set(robotX + 1.15, robotY + 3.55, robotZ - 1.05);
    if (sceneId === 'forest' && forestWorld) {
      forestSunTarget.position.set(robotX, robotY + 0.2, robotZ);
      forestSun.position.set(robotX + 4.8, robotY + 9.2, robotZ - 5.4);
      forestWorld.update(dt, now, robotX, robotZ);
    }
  };

  // Animation loop: in lowPerf (Android/G20), cap at 30fps while moving and STOP completely (0% GPU) when idle!
  const renderTick = (now: number) => {
    if (disposed || paused) {
      rafId = 0;
      return;
    }

    if (lowPerf && lastRenderMs > 0 && (now - lastRenderMs) < LOW_PERF_FRAME_INTERVAL_MS) {
      rafId = requestAnimationFrame(renderTick);
      return;
    }

    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameTs) / 1000));
    lastFrameTs = now;
    const step60 = dt * 60;

    const lerpAlpha = 1 - Math.pow(0.84, step60);
    currentBodyHeightOffset += (targetBodyHeightOffset - currentBodyHeightOffset) * lerpAlpha;

    // Advance 16-DOF robot driving & terrain IK physics
    updateRobotKinematics(dt, now);

    // Smoothly track camera focus onto the moving robot
    const targetFocusY = robotY + getTargetYOffset() + currentBodyHeightOffset * 0.4;
    const camTrackAlpha = 1 - Math.exp(-7.5 * dt);
    camFocus.x += (robotX - camFocus.x) * camTrackAlpha;
    camFocus.y += (targetFocusY - camFocus.y) * camTrackAlpha;
    camFocus.z += (robotZ - camFocus.z) * camTrackAlpha;

    // Gentle auto-chase azimuth behind driving heading when driving & user isn't orbiting manually
    if (userOrbitOverrideTimer > 0) {
      userOrbitOverrideTimer = Math.max(0, userOrbitOverrideTimer - dt);
    }
    const isDrivingNow = Math.abs(velFwd) > 0.08 || Math.abs(velYaw) > 0.08;
    if (hasDrivenAway && isDrivingNow && !dragging && activePointers.size === 0 && userOrbitOverrideTimer <= 0) {
      // Sleek rear-3/4 chase angle showing forward trail, horizon pines & articulating legs
      const chaseTheta = wrapAngle(-robotYaw + Math.PI - 0.42);
      const diff = wrapAngle(chaseTheta - targetTheta);
      targetTheta += diff * (1 - Math.exp(-2.2 * dt));
      const desiredChasePhi = sceneId === 'forest' ? 1.36 : 1.19;
      targetPhi += (desiredChasePhi - targetPhi) * (1 - Math.exp(-1.8 * dt));
      const desiredChaseRadius = sceneId === 'forest' ? 2.65 : 2.25;
      targetRadius += (desiredChaseRadius - targetRadius) * (1 - Math.exp(-1.8 * dt));
    }

    if (!dragging && activePointers.size === 0) {
      if (Math.abs(velTheta) > 0.00008 || Math.abs(velPhi) > 0.00008) {
        targetTheta += velTheta * step60;
        targetPhi = clamp(targetPhi + velPhi * step60, MIN_PHI, MAX_PHI);
        const decay = Math.pow(0.915, step60);
        velTheta *= decay;
        velPhi *= decay;
      } else {
        velTheta = 0;
        velPhi = 0;
      }
    }

    theta += (targetTheta - theta) * lerpAlpha;
    phi += (targetPhi - phi) * lerpAlpha;
    radius += (targetRadius - radius) * lerpAlpha;

    pedestalMat.opacity = lowPerf ? 0.92 : (0.90 + Math.sin(now * 0.0014) * 0.06);

    updateCameraTransform();
    renderer.render(scene, camera);
    lastRenderMs = now;

    if (!lowPerf) {
      rafId = requestAnimationFrame(renderTick);
      return;
    }

    const isStillAnimating = dragging
      || activePointers.size > 0
      || Math.abs(inputDriveX) > 0.001
      || Math.abs(inputDriveY) > 0.001
      || Math.abs(inputTurnX) > 0.001
      || Math.abs(velFwd) > 0.004
      || Math.abs(velLat) > 0.004
      || Math.abs(velYaw) > 0.004
      || Math.abs(velTheta) > 0.0001
      || Math.abs(velPhi) > 0.0001
      || Math.abs(targetTheta - theta) > 0.0008
      || Math.abs(targetPhi - phi) > 0.0008
      || Math.abs(targetRadius - radius) > 0.002
      || Math.abs(targetBodyHeightOffset - currentBodyHeightOffset) > 0.0006
      || Math.abs(accelPitch) > 0.001
      || Math.abs(turnRoll) > 0.001
      || Math.abs(robotX - camFocus.x) > 0.002
      || Math.abs(targetFocusY - camFocus.y) > 0.002
      || Math.abs(robotZ - camFocus.z) > 0.002;

    if (isStillAnimating) {
      rafId = requestAnimationFrame(renderTick);
    } else if (idleSettleFrames > 0) {
      idleSettleFrames -= 1;
      rafId = requestAnimationFrame(renderTick);
    } else {
      rafId = 0;
    }
  };

  scheduleRenderFrame = () => {
    if (!disposed && !paused && !rafId) {
      rafId = requestAnimationFrame(renderTick);
    }
  };

  if (!paused) {
    scheduleRenderFrame();
  }

  return {
    setScene(next: Standby3dSceneId) {
      const normalized = normalizeSceneId(next);
      if (normalized === sceneId) return;
      const wasForest = sceneId === 'forest';
      sceneId = normalized;
      applyThemeVisuals();
      if (wasForest !== (sceneId === 'forest')) {
        resetRobot();
        resize();
        camFocus.set(0, getTargetYOffset() + currentBodyHeightOffset * 0.4, 0);
        if (!userMoved) {
          theta = DEFAULT_THETA;
          targetTheta = DEFAULT_THETA;
          phi = getDefaultPhi();
          targetPhi = getDefaultPhi();
          radius = getDefaultRadius();
          targetRadius = getDefaultRadius();
        }
        updateCameraTransform();
      }
      wakeRender(4);
    },
    setAccentTone(next: Standby3dAccentTone) {
      const normalized: Standby3dAccentTone = next === 'fsdBlue' ? 'fsdBlue' : 'graphite';
      if (normalized === accentTone) return;
      accentTone = normalized;
      applyThemeVisuals();
      wakeRender(2);
    },
    setInteractive(next: boolean) {
      interactive = next;
      canvas.style.cursor = next ? 'grab' : 'default';
      if (!next) {
        clearActivePointers();
      }
    },
    setPaused(next: boolean) {
      if (paused === next) return;
      paused = next;
      if (paused) {
        clearActivePointers();
        inputDriveX = 0;
        inputDriveY = 0;
        inputTurnX = 0;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      } else {
        wakeRender(2);
      }
    },
    setBodyHeight(heightM: number | null | undefined) {
      applyBodyHeight(heightM);
      wakeRender(6);
    },
    setDriveInput(driveX: number, driveY: number, turnX: number) {
      const nx = Number.isFinite(driveX) ? clamp(driveX, -1, 1) : 0;
      const ny = Number.isFinite(driveY) ? clamp(driveY, -1, 1) : 0;
      const nt = Number.isFinite(turnX) ? clamp(turnX, -1, 1) : 0;
      if (nx === inputDriveX && ny === inputDriveY && nt === inputTurnX) return;
      inputDriveX = nx;
      inputDriveY = ny;
      inputTurnX = nt;
      wakeRender(6);
    },
    resetView,
    resetRobot,
    resize,
    getState() {
      const fl = legRigs.find(l => l.id === 'FL');
      return {
        theta,
        phi,
        radius,
        scene: sceneId,
        accentTone,
        ready,
        userMoved,
        robotX,
        robotY,
        robotZ,
        robotYaw,
        speed: Math.hypot(velFwd, velLat),
        wheelSpinFL: fl?.wheelAngle ?? 0,
        kneeDeltaFL: fl?.lastKneeDelta ?? 0,
        articulated16Dof: legRigs.length === 4,
        discoveredBeacons: forestWorld?.getDiscoveredBeacons() ?? 0,
        totalBeacons: forestWorld?.getTotalBeacons() ?? 0,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUpOrCancel);
      canvas.removeEventListener('pointercancel', onPointerUpOrCancel);
      canvas.removeEventListener('lostpointercapture', onPointerUpOrCancel);
      canvas.removeEventListener('wheel', onWheel);
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onWindowResize);
        window.removeEventListener('blur', clearActivePointers);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      forestWorld?.dispose();
      if (currentSkyTex && currentSkyTex !== realForestSkyTex) currentSkyTex.dispose();
      if (realForestSkyTex) realForestSkyTex.dispose();
      if (currentFloorTex) currentFloorTex.dispose();
      if (currentPedestalTex) currentPedestalTex.dispose();
      contactShadowTex.dispose();
      headlightTex.dispose();
      studioEnvTex.dispose();
      if (forestEnvTex) forestEnvTex.dispose();
      pmrem.dispose();
      skyGeo.dispose();
      skyMat.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      pedestalGeo.dispose();
      pedestalMat.dispose();
      renderer.dispose();
    },
  };
}
