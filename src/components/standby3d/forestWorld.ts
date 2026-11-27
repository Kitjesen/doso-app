import * as THREE from 'three';

export type ForestCollider = Readonly<{ x: number; z: number; r: number }>;

export type ForestWorldHandle = Readonly<{
  group: THREE.Group;
  arenaRadius: number;
  sampleHeight: (wx: number, wz: number) => number;
  constrainPosition: (prevX: number, prevZ: number, nextX: number, nextZ: number, robotRadius: number) => { x: number; z: number };
  colliders: readonly ForestCollider[];
  applyPhotorealKit: (kitRoot: THREE.Group) => void;
  isPhotorealLoaded: () => boolean;
  getDiscoveredBeacons: () => number;
  getTotalBeacons: () => number;
  update: (dt: number, now: number, robotX: number, robotZ: number) => void;
  dispose: () => void;
}>;

const FOREST_ARENA_RADIUS = 11.2;
const TERRAIN_SIZE = 44;
const TERRAIN_SEGMENTS = 144;

// Scenic rustic cedar plank bridge over meandering forest stream (framed cleanly in mid-ground!)
const BRIDGE_CENTER_X = -2.45;
const BRIDGE_CENTER_Z = 4.25;
const BRIDGE_YAW = -2.06;
const BRIDGE_HALF_L = 1.95;
const BRIDGE_HALF_W = 1.02;
const BRIDGE_PEAK_H = 0.31;

// Forward Mossy Granite Overlook Ridge (directly ahead along +X when pushing left joystick UP)
const RIDGE_CENTER_X = 3.85;
const RIDGE_CENTER_Z = -0.35;
const RIDGE_YAW = 0.16;
const RIDGE_FLAT_L = 0.78;
const RIDGE_SLOPE_L = 1.25;
const RIDGE_FLAT_W = 0.85;
const RIDGE_SLOPE_W = 0.92;
const RIDGE_HEIGHT = 0.34;

// South-West Corduroy Fallen-Log Suspension Trail
const LOGS_CENTER_X = -3.65;
const LOGS_CENTER_Z = -2.15;
const LOGS_YAW = 0.52;
const LOGS_HALF_L = 1.32;
const LOGS_HALF_W = 0.92;
const LOGS_HEIGHT = 0.056;

type BeaconState = {
  x: number;
  z: number;
  y: number;
  discovered: boolean;
  activation: number;
  orbMesh: THREE.Mesh;
  orbMat: THREE.MeshStandardMaterial;
  glowSprite: THREE.Sprite;
  glowMat: THREE.SpriteMaterial;
  haloMat: THREE.MeshBasicMaterial;
  rippleMesh: THREE.Mesh;
  rippleMat: THREE.MeshBasicMaterial;
  ripplePhase: number;
};

const BEACON_COORDS: ReadonlyArray<Readonly<{ x: number; z: number }>> = [
  { x: 2.55, z: -0.95 },   // Forward trailhead before mossy ridge
  { x: -4.25, z: 1.55 },   // Scenic left-midground pine grove beacon
  { x: -1.15, z: 6.15 },   // Across cedar bridge overlook
  { x: 3.45, z: 3.65 },    // Upstream mossy creek bend
  { x: -2.25, z: -4.15 },  // Deep pine corduroy trail
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Fast deterministic 2D tileable value noise & fBM for photoreal procedural textures (zero polka-dots!)
function hash2(ix: number, iy: number, period: number, seed: number): number {
  const x = ((ix % period) + period) % period;
  const y = ((iy % period) + period) % period;
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function tileableNoise2D(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(ix, iy, period, seed);
  const n10 = hash2(ix + 1, iy, period, seed);
  const n01 = hash2(ix, iy + 1, period, seed);
  const n11 = hash2(ix + 1, iy + 1, period, seed);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function tileableFbm(u: number, v: number, basePeriod: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let p = basePeriod;
  for (let o = 0; o < octaves; o += 1) {
    sum += tileableNoise2D(u, v, p, seed + o * 31) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

// Exact right-handed Three.js Y-axis rotation inverse: world (wx, wz) -> local (lx, lz)
function worldToLocalY(wx: number, wz: number, cx: number, cz: number, yaw: number): { lx: number; lz: number } {
  const dx = wx - cx;
  const dz = wz - cz;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    lx: dx * c - dz * s,
    lz: dx * s + dz * c,
  };
}

function localToWorldY(lx: number, lz: number, cx: number, cz: number, yaw: number): { wx: number; wz: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    wx: cx + lx * c + lz * s,
    wz: cz - lx * s + lz * c,
  };
}

function worldToBridgeLocal(wx: number, wz: number): { lx: number; lz: number } {
  return worldToLocalY(wx, wz, BRIDGE_CENTER_X, BRIDGE_CENTER_Z, BRIDGE_YAW);
}

function bridgeLocalToWorld(lx: number, lz: number): { wx: number; wz: number } {
  return localToWorldY(lx, lz, BRIDGE_CENTER_X, BRIDGE_CENTER_Z, BRIDGE_YAW);
}

function sampleCreekSignedDist(wx: number, wz: number): { dist: number; along: number } {
  const { lx, lz } = worldToBridgeLocal(wx, wz);
  const meander = 0.68 * Math.sin(lz * 0.30) + 0.22 * Math.sin(lz * 0.68 + 0.9);
  return { dist: lx - meander, along: lz };
}

function sampleBridgeDeckY(lx: number, lz: number): number | null {
  const absX = Math.abs(lx);
  const absZ = Math.abs(lz);
  if (absX > BRIDGE_HALF_L + 0.08 || absZ > BRIDGE_HALF_W + 0.05) return null;
  const u = clamp(absX / BRIDGE_HALF_L, 0, 1);
  const arch = Math.cos(u * Math.PI * 0.5);
  return BRIDGE_PEAK_H * arch * arch + 0.016;
}

function sampleRidgeHeight(wx: number, wz: number): number {
  const { lx, lz } = worldToLocalY(wx, wz, RIDGE_CENTER_X, RIDGE_CENTER_Z, RIDGE_YAW);
  const absX = Math.abs(lx);
  const absZ = Math.abs(lz);
  if (absX >= RIDGE_FLAT_L + RIDGE_SLOPE_L || absZ >= RIDGE_FLAT_W + RIDGE_SLOPE_W) return 0;
  const tx = absX <= RIDGE_FLAT_L ? 1 : clamp(1 - (absX - RIDGE_FLAT_L) / RIDGE_SLOPE_L, 0, 1);
  const tz = absZ <= RIDGE_FLAT_W ? 1 : clamp(1 - (absZ - RIDGE_FLAT_W) / RIDGE_SLOPE_W, 0, 1);
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  return RIDGE_HEIGHT * sx * sz;
}

function sampleCorduroyHeight(wx: number, wz: number): number {
  const { lx, lz } = worldToLocalY(wx, wz, LOGS_CENTER_X, LOGS_CENTER_Z, LOGS_YAW);
  if (Math.abs(lx) > LOGS_HALF_L || Math.abs(lz) > LOGS_HALF_W) return 0;
  const wave = 0.5 * (1 + Math.cos((lx / LOGS_HALF_L) * Math.PI * 6));
  const envX = Math.max(0, Math.cos((lx / LOGS_HALF_L) * (Math.PI * 0.5)));
  const envZ = smoothstep(LOGS_HALF_W, LOGS_HALF_W - 0.16, Math.abs(lz));
  return LOGS_HEIGHT * wave * envX * envZ;
}

function sampleForestGroundOnly(wx: number, wz: number): number {
  const r = Math.hypot(wx, wz);
  const clearingMask = smoothstep(2.1, 4.6, r);

  const hill1 = 0.26 * Math.sin(wx * 0.24 + 0.7) * Math.cos(wz * 0.22 - 0.4);
  const hill2 = 0.16 * Math.sin((wx * 0.39 - wz * 0.32) + 1.4);
  const micro = 0.032 * Math.sin(wx * 1.1 + wz * 0.85) * Math.cos(wx * 0.6 - wz * 1.0);
  const bowlRise = smoothstep(8.4, 19.5, r) * 1.85;

  let h = (hill1 + hill2 + micro) * clearingMask + bowlRise;

  // Carve meandering shallow forest brook bed
  const creek = sampleCreekSignedDist(wx, wz);
  const creekBankMask = smoothstep(2.35, 3.6, r);
  const creekCut = Math.exp(-(creek.dist * creek.dist) / (2 * 0.78 * 0.78));
  const valleyFade = Math.exp(-(creek.dist * creek.dist) / (2 * 1.75 * 1.75));
  h = h * (1 - 0.68 * valleyFade * creekBankMask) - 0.25 * creekCut * creekBankMask;

  // Sculpt smooth earthen approach embankments at BOTH ends of the cedar bridge so planks meet soil 100% flush!
  const { lx: blx, lz: blz } = worldToBridgeLocal(wx, wz);
  const absBlx = Math.abs(blx);
  const absBlz = Math.abs(blz);
  if (absBlx >= BRIDGE_HALF_L - 0.35 && absBlx <= BRIDGE_HALF_L + 1.45 && absBlz <= BRIDGE_HALF_W + 0.85) {
    const endDist = Math.abs(absBlx - BRIDGE_HALF_L);
    const alongBlend = smoothstep(1.35, 0.0, endDist);
    const widthBlend = smoothstep(BRIDGE_HALF_W + 0.85, BRIDGE_HALF_W - 0.05, absBlz);
    const rampMask = alongBlend * widthBlend;
    h = h * (1 - rampMask) + 0.014 * rampMask;
  }

  h += sampleRidgeHeight(wx, wz);
  h += sampleCorduroyHeight(wx, wz);
  return h;
}

export function sampleForestTerrainHeight(wx: number, wz: number): number {
  const ground = sampleForestGroundOnly(wx, wz);
  const { lx, lz } = worldToBridgeLocal(wx, wz);
  const deckY = sampleBridgeDeckY(lx, lz);
  if (deckY !== null) {
    return Math.max(ground, deckY);
  }
  return ground;
}

function sampleTrailFactor(wx: number, wz: number): number {
  // Trail 1: clearing -> forward mossy ridge (+X)
  const t1 = Math.exp(-((wz + 0.16 * Math.sin(wx * 0.65)) ** 2) / (2 * 0.72 * 0.72))
    * smoothstep(-0.4, 1.3, wx) * smoothstep(7.2, 4.8, wx);

  // Trail 2: clearing -> timber bridge -> across creek
  const { lx, lz } = worldToBridgeLocal(wx, wz);
  const t2 = Math.exp(-(lz * lz) / (2 * 0.82 * 0.82))
    * smoothstep(-4.4, -2.5, lx) * smoothstep(4.6, 2.4, lx);

  // Trail 3: clearing -> corduroy log path (SW)
  const { lx: llx, lz: llz } = worldToLocalY(wx, wz, LOGS_CENTER_X, LOGS_CENTER_Z, LOGS_YAW);
  const t3 = Math.exp(-(llz * llz) / (2 * 0.75 * 0.75))
    * smoothstep(-2.6, -1.0, llx) * smoothstep(4.2, 2.0, llx);

  return clamp(Math.max(t1, t2, t3), 0, 1);
}

// ============================================================================
// High-Craft Procedural PBR Textures (fBM Soil, Alpha Pine Needles, Serrated Ferns)
// ============================================================================

function createForestGroundTextures(): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 256;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  if (aCtx && bCtx) {
    const aImg = aCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);
    const aData = aImg.data;
    const bData = bImg.data;

    for (let y = 0; y < size; y += 1) {
      const v = y / size;
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const nBroad = tileableFbm(u, v, 4, 4, 17);
        const nFine = tileableFbm(u, v, 16, 3, 93);
        const grain = hash2(x, y, size, 311);

        // Rich organic soil/moss/pine-duff tonal variation (multiplied by vertex biome colors!)
        const lum = 0.72 + (nBroad - 0.5) * 0.34 + (nFine - 0.5) * 0.22 + (grain - 0.5) * 0.08;
        const r = clamp(Math.round(lum * 228), 0, 255);
        const g = clamp(Math.round(lum * 234), 0, 255);
        const b = clamp(Math.round(lum * 218), 0, 255);
        const idx = (y * size + x) * 4;
        aData[idx] = r;
        aData[idx + 1] = g;
        aData[idx + 2] = b;
        aData[idx + 3] = 255;

        const hVal = clamp(Math.round((nBroad * 0.45 + nFine * 0.4 + grain * 0.15) * 255), 0, 255);
        bData[idx] = hVal;
        bData[idx + 1] = hVal;
        bData[idx + 2] = hVal;
        bData[idx + 3] = 255;
      }
    }
    aCtx.putImageData(aImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    // Scatter crisp micro pine needles & twigs over fBM base
    const rand = seededRand(5142);
    for (let i = 0; i < 950; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const len = 3 + rand() * 7;
      const ang = rand() * Math.PI * 2;
      aCtx.strokeStyle = rand() > 0.45 ? 'rgba(38, 30, 20, 0.24)' : 'rgba(176, 186, 148, 0.16)';
      aCtx.lineWidth = 0.75 + rand() * 0.65;
      aCtx.beginPath();
      aCtx.moveTo(x, y);
      aCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      aCtx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(18, 18);
  map.anisotropy = 4;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(18, 18);
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

function createPineBarkTextures(): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 256;
  const aCanvas = document.createElement('canvas');
  aCanvas.width = size;
  aCanvas.height = size;
  const aCtx = aCanvas.getContext('2d');
  const bCanvas = document.createElement('canvas');
  bCanvas.width = size;
  bCanvas.height = size;
  const bCtx = bCanvas.getContext('2d');

  if (aCtx && bCtx) {
    const aImg = aCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      const v = y / size;
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        // Crisp high-frequency vertical Douglas-fir / spruce bark fissures
        const ridgeWide = tileableFbm(u * 4.0, v * 0.75, 8, 3, 701);
        const ridgeFine = tileableFbm(u * 12.0, v * 1.6, 8, 3, 433);
        const crack = smoothstep(0.28, 0.62, ridgeWide * 0.55 + ridgeFine * 0.45);
        const lichen = smoothstep(0.72, 0.88, tileableFbm(u * 2.0, v * 1.5, 6, 3, 919));

        // Deep charcoal-umber Pacific Northwest conifer bark (never flat bright tan!)
        let r = 24 + crack * 38;
        let g = 18 + crack * 27;
        let b = 15 + crack * 20;
        r = r * (1 - lichen * 0.35) + 64 * (lichen * 0.35);
        g = g * (1 - lichen * 0.35) + 82 * (lichen * 0.35);
        b = b * (1 - lichen * 0.35) + 56 * (lichen * 0.35);

        const idx = (y * size + x) * 4;
        aImg.data[idx] = clamp(Math.round(r), 0, 255);
        aImg.data[idx + 1] = clamp(Math.round(g), 0, 255);
        aImg.data[idx + 2] = clamp(Math.round(b), 0, 255);
        aImg.data[idx + 3] = 255;

        const bv = clamp(Math.round(crack * 245), 0, 255);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }
    aCtx.putImageData(aImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    // Extra sharp dark bark crevices for crisp close-up texture
    const rand = seededRand(7741);
    for (let i = 0; i < 120; i += 1) {
      const bx = rand() * size;
      aCtx.strokeStyle = 'rgba(12, 9, 7, 0.42)';
      aCtx.lineWidth = 1.0 + rand() * 1.8;
      aCtx.beginPath();
      aCtx.moveTo(bx, 0);
      aCtx.lineTo(bx + (rand() - 0.5) * 6, size);
      aCtx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(aCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 3);
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(1, 3);
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

function createPineBoughTexture(): THREE.CanvasTexture {
  // Alpha-tested high-detail evergreen pine needle skirt texture (makes silhouettes lush & feathery!)
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, w, h);
    const rand = seededRand(4419);

    // Dense inner foliage base along top 55% (connects cleanly around trunk)
    const coreGrad = ctx.createLinearGradient(0, 0, 0, h * 0.78);
    coreGrad.addColorStop(0, '#132419');
    coreGrad.addColorStop(0.55, '#1d3823');
    coreGrad.addColorStop(1, 'rgba(29, 56, 35, 0)');
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, 0, w, h * 0.62);

    // Paint 14 hanging radiating conifer branch fronds around circumference with feathery pine needles!
    const boughCount = 14;
    for (let b = 0; b < boughCount; b += 1) {
      const bx = ((b + 0.5) / boughCount) * w + (rand() - 0.5) * 12;
      const bLen = h * (0.64 + rand() * 0.30);
      const bSpread = (w / boughCount) * (0.78 + rand() * 0.35);

      // Draw woody twig spine
      ctx.strokeStyle = '#2c2218';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + (rand() - 0.5) * 14, bLen * 0.85);
      ctx.stroke();

      // Draw clustered pine needles fanning outward along twig
      const clusters = 24;
      for (let c = 0; c < clusters; c += 1) {
        const frac = c / (clusters - 1);
        const cy = frac * bLen;
        const spreadHere = bSpread * (1 - frac * 0.72) * (0.55 + 0.45 * Math.sin(frac * Math.PI));
        const needlesInCluster = 9;
        for (let n = 0; n < needlesInCluster; n += 1) {
          const side = n % 2 === 0 ? 1 : -1;
          const nAng = (Math.PI * 0.5) + side * (0.28 + rand() * 0.95);
          const nLen = (10 + rand() * 19) * (1 - frac * 0.42);
          const nx0 = bx + (rand() - 0.5) * spreadHere * 0.55;
          const ny0 = cy + (rand() - 0.5) * 8;
          const nx1 = nx0 + Math.cos(nAng) * nLen;
          const ny1 = ny0 + Math.sin(nAng) * nLen;

          // Wrap horizontally for seamless cylinder tiling!
          const shade = frac * 0.5 + rand() * 0.45;
          const r = Math.round(24 + shade * 42);
          const g = Math.round(48 + shade * 68);
          const bl = Math.round(30 + shade * 30);
          ctx.strokeStyle = `rgb(${r},${g},${bl})`;
          ctx.lineWidth = 2.0 + rand() * 1.4;
          ctx.lineCap = 'round';

          for (const wrapX of [0, -w, w]) {
            ctx.beginPath();
            ctx.moveTo(nx0 + wrapX, ny0);
            ctx.lineTo(nx1 + wrapX, ny1);
            ctx.stroke();
          }
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createFernFrondTexture(): THREE.CanvasTexture {
  // Crisp alpha-tested woodland sword-fern frond with 18 serrated pinnae pairs!
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;

    // Central stem (rachis)
    const stemGrad = ctx.createLinearGradient(cx, h, cx, 8);
    stemGrad.addColorStop(0, '#1e351c');
    stemGrad.addColorStop(0.6, '#39612d');
    stemGrad.addColorStop(1, '#658f44');
    ctx.strokeStyle = stemGrad;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(cx, h - 2);
    ctx.lineTo(cx, 12);
    ctx.stroke();

    // Paired serrated fern leaflets (pinnae)
    const pairs = 19;
    for (let i = 0; i < pairs; i += 1) {
      const t = i / (pairs - 1);
      const y = h - 18 - t * (h - 32);
      const env = Math.sin(Math.pow(t, 0.72) * Math.PI) * (1 - 0.12 * t);
      const len = 8 + env * 46;
      const leafletW = 3.6 + env * 3.8;
      const shade = 0.25 + t * 0.75;
      const r = Math.round(30 + shade * 58);
      const g = Math.round(58 + shade * 82);
      const b = Math.round(26 + shade * 28);
      ctx.fillStyle = `rgb(${r},${g},${b})`;

      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(cx, y);
        ctx.rotate(side * (-0.34 + t * 0.14));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(side * len * 0.5, -leafletW, side * len, -2);
        ctx.quadraticCurveTo(side * len * 0.5, leafletW * 0.75, 0, 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createRockDetailTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n1 = tileableFbm(x / size, y / size, 6, 4, 613);
        const n2 = tileableFbm(x / size, y / size, 16, 3, 829);
        const crack = smoothstep(0.36, 0.52, Math.abs(n1 - 0.5) * 2 + n2 * 0.35);
        const v = clamp(Math.round((0.55 + crack * 0.45) * 235), 0, 255);
        const idx = (y * size + x) * 4;
        img.data[idx] = v;
        img.data[idx + 1] = v;
        img.data[idx + 2] = clamp(v + 6, 0, 255);
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return tex;
}

function createCedarWoodTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const grain = tileableFbm((x / size) * 0.5, (y / size) * 3.5, 8, 4, 523);
        const r = clamp(Math.round(78 + grain * 56), 0, 255);
        const g = clamp(Math.round(58 + grain * 44), 0, 255);
        const b = clamp(Math.round(42 + grain * 30), 0, 255);
        const idx = (y * size + x) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Subtle weathered moss patina along plank edges
    ctx.fillStyle = 'rgba(46, 72, 38, 0.24)';
    ctx.fillRect(0, 0, size, 14);
    ctx.fillRect(0, size - 14, size, 14);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createWaterRippleTexture(): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 256;
  const aCanvas = document.createElement('canvas');
  aCanvas.width = size;
  aCanvas.height = size;
  const aCtx = aCanvas.getContext('2d');
  const bCanvas = document.createElement('canvas');
  bCanvas.width = size;
  bCanvas.height = size;
  const bCtx = bCanvas.getContext('2d');

  if (aCtx && bCtx) {
    const aImg = aCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      const v = y / size;
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        // Soft transparent shoreline fade across U (0..1) so water blends organically into mossy banks!
        const bankFade = smoothstep(0.02, 0.22, u) * smoothstep(0.98, 0.78, u);
        const w1 = tileableFbm(u * 1.4, v * 2.8, 6, 4, 211);
        const ripple = Math.sin((v * 18 + w1 * 5.2) * Math.PI) * 0.5 + 0.5;
        const sparkle = smoothstep(0.76, 0.96, w1 * 0.65 + ripple * 0.35);

        const idx = (y * size + x) * 4;
        aImg.data[idx] = clamp(Math.round(24 + sparkle * 88), 0, 255);
        aImg.data[idx + 1] = clamp(Math.round(56 + sparkle * 102), 0, 255);
        aImg.data[idx + 2] = clamp(Math.round(58 + sparkle * 96), 0, 255);
        aImg.data[idx + 3] = clamp(Math.round(bankFade * (195 + sparkle * 45)), 0, 255);

        const bv = clamp(Math.round((w1 * 0.55 + ripple * 0.45) * 255), 0, 255);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }
    aCtx.putImageData(aImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);
  }
  const map = new THREE.CanvasTexture(aCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 5);
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(1, 5);
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

function createForestPadTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    ctx.clearRect(0, 0, size, size);

    // Weathered dark slate circular expedition clearing stone pad (blends naturally into moss!)
    const stoneGrad = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.46);
    stoneGrad.addColorStop(0, 'rgba(28, 34, 32, 0.72)');
    stoneGrad.addColorStop(0.70, 'rgba(24, 30, 28, 0.56)');
    stoneGrad.addColorStop(0.90, 'rgba(26, 36, 28, 0.22)');
    stoneGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = stoneGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
    ctx.fill();

    // Subtle warm-amber / mint compass hairline ring
    ctx.save();
    ctx.shadowColor = 'rgba(235, 220, 178, 0.45)';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = 'rgba(232, 240, 228, 0.58)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.365, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = 'rgba(232, 200, 138, 0.34)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.425, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Tracked DOSO expedition mark facing hero camera (-0.68 rad)
    ctx.save();
    ctx.translate(cx - size * 0.14, cy - size * 0.25);
    ctx.rotate(-2.25);
    ctx.fillStyle = 'rgba(226, 236, 226, 0.62)';
    ctx.font = '700 38px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letters = ['D', 'O', 'S', 'O'];
    const spacing = 40;
    const startX = -((letters.length - 1) * spacing) / 2;
    letters.forEach((ch, idx) => {
      ctx.fillText(ch, startX + idx * spacing, 0);
    });
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createSunbeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 256);
    const hGrad = ctx.createLinearGradient(0, 0, 128, 0);
    hGrad.addColorStop(0.0, 'rgba(255, 224, 166, 0)');
    hGrad.addColorStop(0.26, 'rgba(255, 228, 174, 0.18)');
    hGrad.addColorStop(0.5, 'rgba(255, 238, 194, 0.34)');
    hGrad.addColorStop(0.74, 'rgba(255, 228, 174, 0.18)');
    hGrad.addColorStop(1.0, 'rgba(255, 224, 166, 0)');
    ctx.fillStyle = hGrad;
    ctx.fillRect(0, 0, 128, 256);

    ctx.globalCompositeOperation = 'destination-in';
    const vGrad = ctx.createLinearGradient(0, 0, 0, 256);
    vGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0)');
    vGrad.addColorStop(0.16, 'rgba(255, 255, 255, 0.95)');
    vGrad.addColorStop(0.72, 'rgba(255, 255, 255, 0.55)');
    vGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, 128, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createMistWispTexture(): THREE.CanvasTexture {
  // Square 256x256 radial gradient so alpha reaches exact 0.0 well before ALL 4 edges (zero box-seam artifact!)
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 6, c, c, c * 0.92);
    grad.addColorStop(0.0, 'rgba(215, 232, 222, 0.24)');
    grad.addColorStop(0.42, 'rgba(182, 210, 202, 0.12)');
    grad.addColorStop(0.78, 'rgba(150, 184, 178, 0.03)');
    grad.addColorStop(1.0, 'rgba(140, 176, 170, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createSoftGlowSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const grad = ctx.createRadialGradient(cx, cx, 1, cx, cx, cx);
    grad.addColorStop(0.0, 'rgba(255, 250, 224, 1)');
    grad.addColorStop(0.26, 'rgba(255, 220, 146, 0.72)');
    grad.addColorStop(0.62, 'rgba(218, 232, 170, 0.20)');
    grad.addColorStop(1.0, 'rgba(180, 220, 160, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createForestSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Rich Pacific Northwest golden dawn mist sky dome
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 256);
    skyGrad.addColorStop(0.0, '#0a161c');
    skyGrad.addColorStop(0.22, '#142931');
    skyGrad.addColorStop(0.38, '#264344');
    skyGrad.addColorStop(0.47, '#4d6a5e');
    skyGrad.addColorStop(0.54, '#8d8c6d');
    skyGrad.addColorStop(0.60, '#3a4f45');
    skyGrad.addColorStop(0.72, '#182824');
    skyGrad.addColorStop(1.0, '#0b1412');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 512, 256);

    // Warm golden morning sunbreak halo peeking right through the hero pine cathedral gap!
    const sunGrad = ctx.createRadialGradient(256, 122, 10, 256, 122, 168);
    sunGrad.addColorStop(0.0, 'rgba(255, 240, 194, 0.96)');
    sunGrad.addColorStop(0.20, 'rgba(255, 210, 142, 0.64)');
    sunGrad.addColorStop(0.50, 'rgba(208, 176, 124, 0.26)');
    sunGrad.addColorStop(1.0, 'rgba(110, 128, 108, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, 512, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ============================================================================
// Procedural Geometry Builders (UV-Preserving Merger for Textured Foliage!)
// ============================================================================

function mergeTexturedGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVerts = 0;
  let totalIndices = 0;
  for (const g of parts) {
    totalVerts += g.attributes.position.count;
    totalIndices += g.index ? g.index.count : g.attributes.position.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;

  for (const g of parts) {
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    const uv = g.attributes.uv;
    const col = g.attributes.color;
    const count = pos.count;

    for (let i = 0; i < count; i += 1) {
      const dst3 = (vOffset + i) * 3;
      const dst2 = (vOffset + i) * 2;
      positions[dst3] = pos.getX(i);
      positions[dst3 + 1] = pos.getY(i);
      positions[dst3 + 2] = pos.getZ(i);
      if (norm) {
        normals[dst3] = norm.getX(i);
        normals[dst3 + 1] = norm.getY(i);
        normals[dst3 + 2] = norm.getZ(i);
      }
      if (uv) {
        uvs[dst2] = uv.getX(i);
        uvs[dst2 + 1] = uv.getY(i);
      }
      if (col) {
        colors[dst3] = col.getX(i);
        colors[dst3 + 1] = col.getY(i);
        colors[dst3 + 2] = col.getZ(i);
      } else {
        colors[dst3] = 1;
        colors[dst3 + 1] = 1;
        colors[dst3 + 2] = 1;
      }
    }

    if (g.index) {
      const idx = g.index;
      for (let i = 0; i < idx.count; i += 1) {
        indices[iOffset + i] = idx.getX(i) + vOffset;
      }
      iOffset += idx.count;
    } else {
      for (let i = 0; i < count; i += 1) {
        indices[iOffset + i] = vOffset + i;
      }
      iOffset += count;
    }

    vOffset += count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

function createFeatheredPineCanopyGeometry(seed: number, tiers: number): THREE.BufferGeometry {
  const rand = seededRand(seed);
  const parts: THREE.BufferGeometry[] = [];
  // Keep lowest branches high enough (~1.55m) so towering trunks + forest depth shine clearly!
  const baseStartY = 1.55;
  const totalCrownH = 5.4;

  const deepShade = new THREE.Color(0x5c6e60);
  const midShade = new THREE.Color(0x98b096);
  const warmCrown = new THREE.Color(0xdbe8c8);
  const tmpColor = new THREE.Color();

  for (let t = 0; t < tiers; t += 1) {
    const frac = t / Math.max(1, tiers - 1);
    const tierY = baseStartY + frac * (totalCrownH * 0.80);
    const tierH = (1.55 - frac * 0.62) * (0.94 + rand() * 0.14);
    const bottomR = (1.42 * (1 - frac * 0.72) + 0.18) * (0.92 + rand() * 0.16);
    const topR = t === tiers - 1 ? 0.03 : bottomR * 0.22;

    // Open-ended feathered pine-bough skirt cone mapped cleanly with our alpha pine-needle texture!
    const skirt = new THREE.CylinderGeometry(topR, bottomR, tierH, 14, 3, true);
    skirt.translate(0, tierY + tierH * 0.44, 0);
    skirt.rotateY(rand() * Math.PI * 2);

    const pos = skirt.attributes.position;
    const uv = skirt.attributes.uv;
    const cols = new Float32Array(pos.count * 3);
    const lobes = 6 + (t % 3);

    for (let i = 0; i < pos.count; i += 1) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const rad = Math.hypot(x, z);
      const ang = Math.atan2(z, x);

      // Flip V so dense top connects to crown and feathery needle tips hang downward (v = 0 at bottom!)
      const uVal = uv.getX(i) * (t < tiers - 2 ? 1.5 : 1.0);
      const vVal = uv.getY(i);
      uv.setXY(i, uVal, vVal);

      if (rad > 0.08) {
        const droopMask = 1 - vVal;
        const wave = 0.86 + 0.20 * Math.sin(ang * lobes + t * 1.9);
        const s = 1 + (wave - 1) * droopMask;
        x *= s;
        z *= s;
        // Graceful pine bough downward curve with subtle upturned needle tips
        y -= droopMask * rad * 0.22 - droopMask * droopMask * rad * 0.08;
      }
      pos.setXYZ(i, x, y, z);

      // Vertex AO: deep interior darkness under boughs, warm sunlit needles on upper outer tips
      const normH = clamp((y - baseStartY) / totalCrownH, 0, 1);
      const tipLight = clamp(1 - vVal * 0.35, 0, 1);
      tmpColor.copy(deepShade).lerp(midShade, clamp(normH * 0.75 + tipLight * 0.28, 0, 1));
      if (normH > 0.42) {
        tmpColor.lerp(warmCrown, (normH - 0.42) * 0.65);
      }
      cols[i * 3] = tmpColor.r;
      cols[i * 3 + 1] = tmpColor.g;
      cols[i * 3 + 2] = tmpColor.b;
    }

    skirt.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    skirt.computeVertexNormals();
    parts.push(skirt);
  }

  return mergeTexturedGeometries(parts);
}

function createPineTrunkGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.055, 0.23, 6.2, 12, 8);
  geo.translate(0, 3.05, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const rootFlare = y < 0.70 ? 1 + Math.pow(1 - y / 0.70, 2) * 0.48 : 1;
    const bendX = Math.sin(y * 0.36) * 0.055;
    pos.setXYZ(i, x * rootFlare + bendX, y, z * rootFlare);
  }
  geo.computeVertexNormals();
  return geo;
}

function createOrganicGraniteBoulderGeometry(seed: number): THREE.BufferGeometry {
  // High-subdivision smooth organic granite boulder (zero low-poly crystal facets!)
  const geo = new THREE.IcosahedronGeometry(0.54, 3);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const darkSlate = new THREE.Color(0x282e30);
  const midGranite = new THREE.Color(0x474d4d);
  const velvetMoss = new THREE.Color(0x2d4425);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const n1 = Math.sin(x * 3.8 + seed) * Math.cos(z * 3.4 - seed * 0.6);
    const n2 = Math.cos(y * 4.8 + x * 2.9 + seed * 1.4);
    const n3 = Math.sin((x + z) * 7.2 + y * 5.5) * 0.04;
    const scale = 0.86 + 0.14 * n1 + 0.08 * n2 + n3;
    x *= scale * 1.18;
    y *= scale * 0.68;
    z *= scale * 1.04;
    if (y < -0.15) y = -0.15 + (y + 0.15) * 0.30;
    pos.setXYZ(i, x, y, z);

    const up = clamp((y + 0.16) / 0.44, 0, 1);
    const crevice = clamp(0.5 + n1 * 0.5, 0, 1);
    tmp.copy(darkSlate).lerp(midGranite, up * 0.55 + crevice * 0.25);
    // Natural damp moss cap only on upper surfaces
    if (up > 0.58) {
      tmp.lerp(velvetMoss, smoothstep(0.58, 0.90, up) * 0.72);
    }
    cols[i * 3] = tmp.r;
    cols[i * 3 + 1] = tmp.g;
    cols[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return geo;
}

function createTexturedFernClusterGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const frondCount = 7;
  const baseTint = new THREE.Color(0x6d8462);
  const tipTint = new THREE.Color(0xcde2aa);
  const tmp = new THREE.Color();

  for (let f = 0; f < frondCount; f += 1) {
    const angle = (f / frondCount) * Math.PI * 2 + (f % 2) * 0.22;
    const tiltOut = 0.35 + (f % 3) * 0.08;
    const plane = new THREE.PlaneGeometry(0.28, 0.62, 1, 5);
    plane.translate(0, 0.31, 0);

    const pos = plane.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const t = clamp(py / 0.62, 0, 1);
      // Graceful weeping fern arch
      const outZ = t * tiltOut + t * t * 0.28;
      const archY = py * (1 - 0.38 * t * t);
      pos.setXYZ(i, px, archY, outZ);

      tmp.copy(baseTint).lerp(tipTint, t);
      cols[i * 3] = tmp.r;
      cols[i * 3 + 1] = tmp.g;
      cols[i * 3 + 2] = tmp.b;
    }
    plane.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    plane.rotateY(angle);
    plane.computeVertexNormals();
    parts.push(plane);
  }
  return mergeTexturedGeometries(parts);
}

// ============================================================================
// Main Forest World Builder
// ============================================================================

export type ForestWorldOptions = Readonly<{
  lowPerf?: boolean;
}>;

export function createForestWorld(options: ForestWorldOptions = {}): ForestWorldHandle {
  const lowPerf = Boolean(options.lowPerf);
  const group = new THREE.Group();
  const colliders: ForestCollider[] = [];
  const disposables: Array<{ dispose: () => void }> = [];

  const groundTextures = createForestGroundTextures();
  const barkTextures = createPineBarkTextures();
  const pineBoughTex = createPineBoughTexture();
  const fernFrondTex = createFernFrondTexture();
  const rockTex = createRockDetailTexture();
  const cedarTex = createCedarWoodTexture();
  const waterTextures = createWaterRippleTexture();
  const forestPadTex = createForestPadTexture();
  const sunbeamTex = createSunbeamTexture();
  const mistWispTex = createMistWispTexture();
  const glowSpriteTex = createSoftGlowSpriteTexture();

  disposables.push(
    groundTextures.map, groundTextures.bumpMap,
    barkTextures.map, barkTextures.bumpMap,
    pineBoughTex, fernFrondTex, rockTex, cedarTex,
    waterTextures.map, waterTextures.bumpMap,
    forestPadTex, sunbeamTex, mistWispTex, glowSpriteTex,
  );

  // 1. Continuous Sculpted Forest Terrain (68x68 on Android lowPerf -> 4.5x fewer terrain tris!)
  const terrainSegs = lowPerf ? 68 : TERRAIN_SEGMENTS;
  const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, terrainSegs, terrainSegs);
  terrainGeo.rotateX(-Math.PI / 2);
  const tPos = terrainGeo.attributes.position;
  const tCols = new Float32Array(tPos.count * 3);

  const colMossLush = new THREE.Color(0x273f24);
  const colPineFloor = new THREE.Color(0x1b291b);
  const colTrailDirt = new THREE.Color(0x524231);
  const colCreekBed = new THREE.Color(0x1b2827);
  const colGraniteRidge = new THREE.Color(0x3f4645);
  const tmpCol = new THREE.Color();

  for (let i = 0; i < tPos.count; i += 1) {
    const x = tPos.getX(i);
    const z = tPos.getZ(i);
    const y = sampleForestGroundOnly(x, z);
    tPos.setY(i, y);

    const r = Math.hypot(x, z);
    const trail = sampleTrailFactor(x, z);
    const creek = sampleCreekSignedDist(x, z);
    const creekMask = Math.exp(-(creek.dist * creek.dist) / (2 * 1.05 * 1.05)) * smoothstep(2.2, 3.4, r);
    const ridgeMask = clamp(sampleRidgeHeight(x, z) / RIDGE_HEIGHT, 0, 1);

    const mossNoise = 0.5 + 0.5 * Math.sin(x * 0.55 + z * 0.48) * Math.cos(x * 0.32 - z * 0.68);
    tmpCol.copy(colPineFloor).lerp(colMossLush, mossNoise * (1 - smoothstep(8.0, 15, r) * 0.55));
    tmpCol.lerp(colTrailDirt, trail * 0.76);
    tmpCol.lerp(colGraniteRidge, smoothstep(0.28, 0.92, ridgeMask) * 0.74);
    tmpCol.lerp(colCreekBed, creekMask * 0.88);

    tCols[i * 3] = tmpCol.r;
    tCols[i * 3 + 1] = tmpCol.g;
    tCols[i * 3 + 2] = tmpCol.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(tCols, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: groundTextures.map,
    bumpMap: groundTextures.bumpMap,
    bumpScale: 0.045,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
    envMapIntensity: 0.16,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // 2. Subtle Weathered Slate DOSO Clearing Home Pad at Origin (0, 0)
  const padGeo = new THREE.PlaneGeometry(1.92, 1.92);
  const padMat = new THREE.MeshBasicMaterial({
    map: forestPadTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.44,
  });
  const padMesh = new THREE.Mesh(padGeo, padMat);
  padMesh.rotation.x = -Math.PI / 2;
  padMesh.position.y = sampleForestTerrainHeight(0, 0) + 0.008;
  group.add(padMesh);
  disposables.push(padGeo, padMat);

  // 3. Animated Shimmering Forest Brook with Soft Feathered Shorelines
  const creekLength = 26;
  const creekGeo = new THREE.PlaneGeometry(2.15, creekLength, 10, 72);
  creekGeo.rotateX(-Math.PI / 2);
  const cPos = creekGeo.attributes.position;
  for (let i = 0; i < cPos.count; i += 1) {
    const lx = cPos.getX(i);
    const lz = cPos.getZ(i);
    const meander = 0.68 * Math.sin(lz * 0.30) + 0.22 * Math.sin(lz * 0.68 + 0.9);
    cPos.setX(i, lx + meander);
  }
  creekGeo.computeVertexNormals();
  const creekMat = new THREE.MeshStandardMaterial({
    map: waterTextures.map,
    bumpMap: waterTextures.bumpMap,
    bumpScale: 0.035,
    color: 0x3b6e6c,
    emissive: 0x0c2122,
    emissiveIntensity: 0.28,
    roughness: 0.12,
    metalness: 0.68,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    envMapIntensity: 1.25,
  });
  const creekMesh = new THREE.Mesh(creekGeo, creekMat);
  creekMesh.position.set(BRIDGE_CENTER_X, -0.095, BRIDGE_CENTER_Z);
  creekMesh.rotation.y = BRIDGE_YAW;
  creekMesh.receiveShadow = true;
  group.add(creekMesh);
  disposables.push(creekGeo, creekMat);

  // 4. Hero Drivable Cedar Timber Bridge with Warm Glowing Trail Lanterns & Guide Rails
  const bridgeGroup = new THREE.Group();
  bridgeGroup.position.set(BRIDGE_CENTER_X, 0, BRIDGE_CENTER_Z);
  bridgeGroup.rotation.y = BRIDGE_YAW;

  const plankMat = new THREE.MeshStandardMaterial({
    map: cedarTex,
    color: 0xa68e74,
    roughness: 0.88,
    metalness: 0.03,
    envMapIntensity: 0.18,
  });
  const timberDarkMat = new THREE.MeshStandardMaterial({
    map: barkTextures.map,
    bumpMap: barkTextures.bumpMap,
    bumpScale: 0.02,
    color: 0x624d3b,
    roughness: 0.92,
    metalness: 0.03,
    envMapIntensity: 0.14,
  });
  const lanternGlassMat = new THREE.MeshBasicMaterial({ color: 0xffd58f });
  const lanternHaloMat = new THREE.SpriteMaterial({
    map: glowSpriteTex,
    color: 0xffc66e,
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  disposables.push(plankMat, timberDarkMat, lanternGlassMat, lanternHaloMat);

  const plankCount = 22;
  const plankGeo = new THREE.BoxGeometry(0.175, 0.052, BRIDGE_HALF_W * 2);
  disposables.push(plankGeo);

  for (let i = 0; i < plankCount; i += 1) {
    const frac = i / (plankCount - 1);
    const lx = -BRIDGE_HALF_L + 0.09 + frac * (BRIDGE_HALF_L * 2 - 0.18);
    const deckY = sampleBridgeDeckY(lx, 0) ?? 0;
    const deckNext = sampleBridgeDeckY(lx + 0.08, 0) ?? deckY;
    const deckPrev = sampleBridgeDeckY(lx - 0.08, 0) ?? deckY;
    const slope = Math.atan2(deckNext - deckPrev, 0.16);

    const plank = new THREE.Mesh(plankGeo, plankMat);
    plank.position.set(lx, deckY - 0.024, 0);
    plank.rotation.z = slope;
    plank.castShadow = true;
    plank.receiveShadow = true;
    bridgeGroup.add(plank);
  }

  const beamSegGeo = new THREE.BoxGeometry(0.68, 0.095, 0.095);
  const railGeo = new THREE.CylinderGeometry(0.022, 0.022, 1.85, 6);
  railGeo.rotateZ(Math.PI / 2);
  const postGeo = new THREE.CylinderGeometry(0.056, 0.072, 0.72, 10);
  const lanternCapGeo = new THREE.ConeGeometry(0.092, 0.075, 6);
  const lanternBulbGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.095, 8);
  disposables.push(beamSegGeo, railGeo, postGeo, lanternCapGeo, lanternBulbGeo);

  for (const sideZ of [-BRIDGE_HALF_W + 0.04, BRIDGE_HALF_W - 0.04]) {
    for (let s = -2; s <= 2; s += 1) {
      const bx = s * 0.66;
      const by = (sampleBridgeDeckY(bx, 0) ?? 0) + 0.015;
      const bNext = sampleBridgeDeckY(bx + 0.1, 0) ?? by;
      const bPrev = sampleBridgeDeckY(bx - 0.1, 0) ?? by;
      const beam = new THREE.Mesh(beamSegGeo, timberDarkMat);
      beam.position.set(bx, by, sideZ);
      beam.rotation.z = Math.atan2(bNext - bPrev, 0.2);
      beam.castShadow = true;
      bridgeGroup.add(beam);
    }

    // Center & corner wooden handrail posts + rustic top rails
    for (const postX of [-BRIDGE_HALF_L + 0.14, 0, BRIDGE_HALF_L - 0.14]) {
      const py = sampleBridgeDeckY(postX, 0) ?? 0;
      const post = new THREE.Mesh(postGeo, timberDarkMat);
      post.position.set(postX, py + 0.28, sideZ);
      post.castShadow = true;
      bridgeGroup.add(post);

      if (postX !== 0) {
        const bulb = new THREE.Mesh(lanternBulbGeo, lanternGlassMat);
        bulb.position.set(postX, py + 0.66, sideZ);
        bridgeGroup.add(bulb);

        const cap = new THREE.Mesh(lanternCapGeo, timberDarkMat);
        cap.position.set(postX, py + 0.74, sideZ);
        bridgeGroup.add(cap);

        const halo = new THREE.Sprite(lanternHaloMat);
        halo.position.set(postX, py + 0.66, sideZ);
        halo.scale.set(0.65, 0.65, 1);
        bridgeGroup.add(halo);
      }
    }

    // Sloped rustic timber handrails connecting end posts to center crest post
    for (const halfSign of [-1, 1]) {
      const endX = halfSign * (BRIDGE_HALF_L - 0.14);
      const yEnd = (sampleBridgeDeckY(endX, 0) ?? 0) + 0.56;
      const yMid = (sampleBridgeDeckY(0, 0) ?? 0) + 0.56;
      const rail = new THREE.Mesh(railGeo, timberDarkMat);
      rail.position.set(endX * 0.5, (yEnd + yMid) * 0.5, sideZ);
      rail.rotation.z = Math.atan2(yMid - yEnd, -endX);
      rail.castShadow = true;
      bridgeGroup.add(rail);
    }
  }
  group.add(bridgeGroup);

  // 5. Half-Buried Corduroy Fallen Timber Logs on SW Trail
  const logsGroup = new THREE.Group();
  logsGroup.position.set(LOGS_CENTER_X, 0, LOGS_CENTER_Z);
  logsGroup.rotation.y = LOGS_YAW;
  const logGeo = new THREE.CylinderGeometry(0.068, 0.074, LOGS_HALF_W * 1.95, 10);
  logGeo.rotateX(Math.PI / 2);
  disposables.push(logGeo);
  for (let i = -3; i <= 3; i += 1) {
    const lx = i * (LOGS_HALF_L / 3.2);
    const { wx, wz } = localToWorldY(lx, 0, LOGS_CENTER_X, LOGS_CENTER_Z, LOGS_YAW);
    const gy = sampleForestGroundOnly(wx, wz);
    const log = new THREE.Mesh(logGeo, timberDarkMat);
    log.position.set(lx, gy - 0.032, 0);
    log.castShadow = true;
    log.receiveShadow = true;
    logsGroup.add(log);
  }
  group.add(logsGroup);

  // 6. Towering Feathered Nordic Pine & Spruce Forest (InstancedMesh + Alpha Pine Needles!)
  const rand = seededRand(202611);
  const treeSpots: Array<{ x: number; z: number; scale: number; yaw: number; variant: number; inner: boolean }> = [];

  const isTreeSpotValid = (x: number, z: number): boolean => {
    const r = Math.hypot(x, z);
    if (r < 3.65) return false;

    // Keep hero camera sightline (+1.68, -1.36) -> (0, 0) 100% open
    if (Math.hypot(x - 1.85, z + 1.50) < 2.45) return false;

    if (Math.hypot(x - BRIDGE_CENTER_X, z - BRIDGE_CENTER_Z) < 2.75) return false;
    if (Math.hypot(x - RIDGE_CENTER_X, z - RIDGE_CENTER_Z) < 2.35) return false;
    if (Math.hypot(x - LOGS_CENTER_X, z - LOGS_CENTER_Z) < 2.15) return false;
    if (sampleTrailFactor(x, z) > 0.34) return false;

    const creek = sampleCreekSignedDist(x, z);
    if (Math.abs(creek.dist) < 1.25 && Math.abs(creek.along) < 12) return false;

    for (const b of BEACON_COORDS) {
      if (Math.hypot(x - b.x, z - b.z) < 1.35) return false;
    }

    for (const other of treeSpots) {
      if (Math.hypot(x - other.x, z - other.z) < 1.95) return false;
    }
    return true;
  };

  // Curated cathedral pine framing behind robot & around bridge (frames golden sunbreak gap!)
  const curatedHeroTrees: ReadonlyArray<[number, number, number, number]> = [
    [-5.4, 2.2, 1.28, 0],
    [-6.8, 5.4, 1.44, 1],
    [-4.1, 7.2, 1.36, 0],
    [0.8, 6.4, 1.26, 1],
    [-7.2, -0.6, 1.38, 1],
    [-5.8, -3.8, 1.22, 0],
    [2.9, 5.8, 1.32, 0],
    [6.2, 2.1, 1.35, 1],
    [5.8, -2.8, 1.24, 0],
    [0.8, -4.8, 1.18, 1],
    [-2.5, -5.6, 1.28, 0],
    [4.4, -4.9, 1.22, 1],
  ];
  for (const [x, z, scale, variant] of curatedHeroTrees) {
    if (isTreeSpotValid(x, z)) {
      treeSpots.push({ x, z, scale, yaw: rand() * Math.PI * 2, variant, inner: true });
    }
  }

  const maxTrees = lowPerf ? 52 : 96;
  let attempts = 0;
  while (treeSpots.length < maxTrees && attempts < 1800) {
    attempts += 1;
    const isOuter = treeSpots.length >= 38;
    const minR = isOuter ? 10.8 : 4.4;
    const maxR = isOuter ? 19.6 : 11.2;
    const ang = rand() * Math.PI * 2;
    const rad = minR + Math.sqrt(rand()) * (maxR - minR);
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    // Leave dramatic narrow golden dawn sunbreak window behind the robot (-0.75, +0.66)
    const sunDirDot = (x * -0.76 + z * 0.65) / Math.max(1, rad);
    if (sunDirDot > 0.94 && rad > 8.2) continue;

    if (!isTreeSpotValid(x, z)) continue;
    const scale = isOuter ? 1.25 + rand() * 0.72 : 0.96 + rand() * 0.48;
    treeSpots.push({
      x,
      z,
      scale,
      yaw: rand() * Math.PI * 2,
      variant: rand() > 0.48 ? 1 : 0,
      inner: !isOuter,
    });
  }

  const trunkGeo = createPineTrunkGeometry();
  const canopyGeoA = createFeatheredPineCanopyGeometry(101, 6);
  const canopyGeoB = createFeatheredPineCanopyGeometry(307, 7);

  const trunkMat = new THREE.MeshStandardMaterial({
    map: barkTextures.map,
    bumpMap: barkTextures.bumpMap,
    bumpScale: 0.04,
    roughness: 0.95,
    metalness: 0.02,
    envMapIntensity: 0.14,
  });
  const foliageMat = new THREE.MeshStandardMaterial({
    map: pineBoughTex,
    alphaTest: 0.38,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide,
    envMapIntensity: 0.22,
  });
  disposables.push(trunkGeo, canopyGeoA, canopyGeoB, trunkMat, foliageMat);

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  trunkInst.castShadow = true;
  trunkInst.receiveShadow = true;

  const spotsA = treeSpots.filter(t => t.variant === 0);
  const spotsB = treeSpots.filter(t => t.variant === 1);
  const canopyInstA = new THREE.InstancedMesh(canopyGeoA, foliageMat, Math.max(1, spotsA.length));
  const canopyInstB = new THREE.InstancedMesh(canopyGeoB, foliageMat, Math.max(1, spotsB.length));
  canopyInstA.castShadow = true;
  canopyInstA.receiveShadow = true;
  canopyInstB.castShadow = true;
  canopyInstB.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const instColor = new THREE.Color();
  let idxA = 0;
  let idxB = 0;

  treeSpots.forEach((t, idx) => {
    const gy = sampleForestGroundOnly(t.x, t.z);
    dummy.position.set(t.x, gy - 0.14, t.z);
    dummy.rotation.set((rand() - 0.5) * 0.035, t.yaw, (rand() - 0.5) * 0.035);
    dummy.scale.set(t.scale, t.scale * (0.94 + rand() * 0.20), t.scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);

    instColor.setHSL(0.32 + (rand() - 0.5) * 0.05, 0.18 + rand() * 0.14, 0.84 + rand() * 0.24);
    if (t.variant === 0) {
      canopyInstA.setMatrixAt(idxA, dummy.matrix);
      canopyInstA.setColorAt(idxA, instColor);
      idxA += 1;
    } else {
      canopyInstB.setMatrixAt(idxB, dummy.matrix);
      canopyInstB.setColorAt(idxB, instColor);
      idxB += 1;
    }

    if (t.inner && Math.hypot(t.x, t.z) < FOREST_ARENA_RADIUS + 0.5) {
      colliders.push({ x: t.x, z: t.z, r: 0.24 * t.scale });
    }
  });

  trunkInst.instanceMatrix.needsUpdate = true;
  canopyInstA.instanceMatrix.needsUpdate = true;
  canopyInstB.instanceMatrix.needsUpdate = true;
  if (canopyInstA.instanceColor) canopyInstA.instanceColor.needsUpdate = true;
  if (canopyInstB.instanceColor) canopyInstB.instanceColor.needsUpdate = true;

  const proceduralFloraGroup = new THREE.Group();
  proceduralFloraGroup.add(trunkInst, canopyInstA, canopyInstB);
  group.add(proceduralFloraGroup);

  const photorealGroup = new THREE.Group();
  group.add(photorealGroup);

  // 7. Distant Misty Mountain Silhouette Ring (Hidden once real 360° misty_pines sky dome is active!)
  const mountainGeo = new THREE.CylinderGeometry(26.5, 27.5, 11.5, 72, 1, true);
  const mPos = mountainGeo.attributes.position;
  for (let i = 0; i < mPos.count; i += 1) {
    const y = mPos.getY(i);
    if (y > 0) {
      const ang = Math.atan2(mPos.getZ(i), mPos.getX(i));
      const ridgeH = 3.2 + 2.8 * Math.sin(ang * 3 + 0.8) + 1.5 * Math.cos(ang * 7 - 0.4) + 0.75 * Math.sin(ang * 13);
      mPos.setY(i, ridgeH);
    } else {
      mPos.setY(i, -1.8);
    }
  }
  mountainGeo.computeVertexNormals();
  const mountainMat = new THREE.MeshBasicMaterial({
    color: 0x1a2d2b,
    side: THREE.BackSide,
    fog: true,
  });
  const mountainRing = new THREE.Mesh(mountainGeo, mountainMat);
  proceduralFloraGroup.add(mountainRing);
  disposables.push(mountainGeo, mountainMat);

  // 8. High-Detail Sculpted Wet Granite & Moss Boulders (Smooth Organic Rock + Bump Texture!)
  const boulderGeo = createOrganicGraniteBoulderGeometry(57);
  const boulderMat = new THREE.MeshStandardMaterial({
    map: rockTex,
    bumpMap: rockTex,
    bumpScale: 0.04,
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.08,
    envMapIntensity: 0.28,
  });
  disposables.push(boulderGeo, boulderMat);

  const boulderList: Array<{ x: number; z: number; sx: number; sy: number; sz: number; yaw: number; solid: boolean }> = [
    { x: -3.45, z: 1.95, sx: 0.92, sy: 0.68, sz: 0.86, yaw: 0.5, solid: true },
    { x: -4.15, z: 2.35, sx: 0.56, sy: 0.42, sz: 0.60, yaw: 1.9, solid: false },
    { x: -0.65, z: 4.95, sx: 0.72, sy: 0.50, sz: 0.66, yaw: 2.4, solid: true },
    { x: 1.65, z: 3.15, sx: 0.62, sy: 0.42, sz: 0.58, yaw: 0.8, solid: false },
    { x: 4.95, z: 0.85, sx: 0.94, sy: 0.66, sz: 0.84, yaw: 1.2, solid: true },
    { x: 3.35, z: -2.15, sx: 0.76, sy: 0.52, sz: 0.70, yaw: 2.9, solid: true },
  ];

  for (let i = 0; i < 48; i += 1) {
    const ang = rand() * Math.PI * 2;
    const rad = 2.9 + rand() * 8.8;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    if (sampleTrailFactor(x, z) > 0.30) continue;
    if (Math.hypot(x - BRIDGE_CENTER_X, z - BRIDGE_CENTER_Z) < 2.4) continue;
    if (Math.hypot(x - 1.68, z + 1.36) < 2.1) continue;
    const s = 0.22 + rand() * 0.54;
    boulderList.push({
      x,
      z,
      sx: s * (0.9 + rand() * 0.4),
      sy: s * (0.60 + rand() * 0.38),
      sz: s * (0.9 + rand() * 0.4),
      yaw: rand() * Math.PI * 2,
      solid: s > 0.54,
    });
  }

  const boulderInst = new THREE.InstancedMesh(boulderGeo, boulderMat, boulderList.length);
  boulderInst.castShadow = true;
  boulderInst.receiveShadow = true;
  boulderList.forEach((b, idx) => {
    const gy = sampleForestGroundOnly(b.x, b.z);
    dummy.position.set(b.x, gy + b.sy * 0.08, b.z);
    dummy.rotation.set((rand() - 0.5) * 0.22, b.yaw, (rand() - 0.5) * 0.22);
    dummy.scale.set(b.sx, b.sy, b.sz);
    dummy.updateMatrix();
    boulderInst.setMatrixAt(idx, dummy.matrix);
    if (b.solid && Math.hypot(b.x, b.z) < FOREST_ARENA_RADIUS) {
      colliders.push({ x: b.x, z: b.z, r: Math.max(b.sx, b.sz) * 0.46 });
    }
  });
  boulderInst.instanceMatrix.needsUpdate = true;
  proceduralFloraGroup.add(boulderInst);

  // 9. Lush Swaying Serrated Woodland Sword Ferns (260 Instanced Textured Clusters!)
  const fernGeo = createTexturedFernClusterGeometry();
  const fernMat = new THREE.MeshStandardMaterial({
    map: fernFrondTex,
    alphaTest: 0.36,
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.02,
    side: THREE.DoubleSide,
    envMapIntensity: 0.18,
  });
  disposables.push(fernGeo, fernMat);

  type FernEntry = { x: number; y: number; z: number; scale: number; yaw: number; phase: number };
  const fernEntries: FernEntry[] = [];
  const maxFerns = lowPerf ? 130 : 360;
  for (let i = 0; i < maxFerns; i += 1) {
    const ang = rand() * Math.PI * 2;
    const rad = 1.90 + Math.sqrt(rand()) * 12.2;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    if (sampleTrailFactor(x, z) > 0.40) continue;
    if (Math.hypot(x - BRIDGE_CENTER_X, z - BRIDGE_CENTER_Z) < 2.25) continue;
    if (Math.hypot(x - 1.65, z + 1.35) < 1.55) continue;
    const creek = sampleCreekSignedDist(x, z);
    if (Math.abs(creek.dist) < 0.85 && Math.abs(creek.along) < 12) continue;

    const gy = sampleForestGroundOnly(x, z);
    fernEntries.push({
      x,
      y: gy - 0.03,
      z,
      scale: 0.72 + rand() * 0.95,
      yaw: rand() * Math.PI * 2,
      phase: rand() * Math.PI * 2,
    });
  }

  const fernInst = new THREE.InstancedMesh(fernGeo, fernMat, Math.max(1, fernEntries.length));
  fernInst.receiveShadow = true;
  fernEntries.forEach((f, idx) => {
    dummy.position.set(f.x, f.y, f.z);
    dummy.rotation.set(0, f.yaw, 0);
    dummy.scale.setScalar(f.scale);
    dummy.updateMatrix();
    fernInst.setMatrixAt(idx, dummy.matrix);
  });
  fernInst.instanceMatrix.needsUpdate = true;
  proceduralFloraGroup.add(fernInst);

  // 10. Interactive Trail Survey Beacons (Soft Amber -> Luminous Emerald-Cyan Discovery Pulse!)
  const beacons: BeaconState[] = [];
  const beaconPostGeo = new THREE.CylinderGeometry(0.044, 0.064, 0.62, 12);
  const beaconCapGeo = new THREE.CylinderGeometry(0.062, 0.054, 0.048, 12);
  const beaconOrbGeo = new THREE.OctahedronGeometry(0.068, 1);
  const beaconHaloGeo = new THREE.RingGeometry(0.24, 0.285, 32);
  beaconHaloGeo.rotateX(-Math.PI / 2);
  const beaconRippleGeo = new THREE.RingGeometry(0.28, 0.34, 32);
  beaconRippleGeo.rotateX(-Math.PI / 2);
  const beaconMetalMat = new THREE.MeshStandardMaterial({
    color: 0x1f262b,
    roughness: 0.40,
    metalness: 0.72,
  });
  disposables.push(beaconPostGeo, beaconCapGeo, beaconOrbGeo, beaconHaloGeo, beaconRippleGeo, beaconMetalMat);

  for (const coord of BEACON_COORDS) {
    const gy = sampleForestTerrainHeight(coord.x, coord.z);
    const bg = new THREE.Group();
    bg.position.set(coord.x, gy, coord.z);

    const post = new THREE.Mesh(beaconPostGeo, beaconMetalMat);
    post.position.y = 0.31;
    post.castShadow = true;
    bg.add(post);

    const collar = new THREE.Mesh(beaconCapGeo, beaconMetalMat);
    collar.position.y = 0.63;
    bg.add(collar);

    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xffc066,
      emissive: 0xf59e3d,
      emissiveIntensity: 1.65,
      roughness: 0.16,
      metalness: 0.1,
    });
    const orbMesh = new THREE.Mesh(beaconOrbGeo, orbMat);
    orbMesh.position.y = 0.74;
    bg.add(orbMesh);

    const glowMat = new THREE.SpriteMaterial({
      map: glowSpriteTex,
      color: 0xffbe64,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.position.y = 0.74;
    glowSprite.scale.set(0.62, 0.62, 1);
    bg.add(glowSprite);

    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xf5b352,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const haloMesh = new THREE.Mesh(beaconHaloGeo, haloMat);
    haloMesh.position.y = 0.015;
    bg.add(haloMesh);

    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0x52f2c8,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const rippleMesh = new THREE.Mesh(beaconRippleGeo, rippleMat);
    rippleMesh.position.y = 0.018;
    bg.add(rippleMesh);

    group.add(bg);
    disposables.push(orbMat, glowMat, haloMat, rippleMat);
    colliders.push({ x: coord.x, z: coord.z, r: 0.12 });

    beacons.push({
      x: coord.x,
      z: coord.z,
      y: gy,
      discovered: false,
      activation: 0,
      orbMesh,
      orbMat,
      glowSprite,
      glowMat,
      haloMat,
      rippleMesh,
      rippleMat,
      ripplePhase: 0,
    });
  }

  // 11. Diagonal Volumetric Morning Sunbeams Slanting Through Pine Canopy (Visible Right in Hero Frame!)
  const sunbeamDefs: ReadonlyArray<{ x: number; y: number; z: number; w: number; h: number; rotY: number; tilt: number; baseOpacity: number }> = [
    { x: -3.2, y: 2.8, z: 2.8, w: 2.6, h: 8.8, rotY: -0.68, tilt: 0.36, baseOpacity: 0.30 },
    { x: -5.4, y: 3.1, z: 4.8, w: 3.2, h: 9.6, rotY: -0.62, tilt: 0.38, baseOpacity: 0.34 },
    { x: -0.8, y: 2.7, z: 4.6, w: 2.4, h: 8.5, rotY: -0.74, tilt: 0.34, baseOpacity: 0.24 },
    { x: -5.6, y: 3.2, z: 0.8, w: 2.5, h: 8.8, rotY: -0.60, tilt: 0.35, baseOpacity: 0.25 },
    { x: 2.4, y: 2.9, z: -0.6, w: 2.3, h: 8.4, rotY: -0.70, tilt: 0.33, baseOpacity: 0.20 },
    { x: -2.4, y: 3.1, z: -2.9, w: 2.5, h: 8.8, rotY: -0.66, tilt: 0.34, baseOpacity: 0.18 },
  ];
  const sunbeamMats: Array<{ mat: THREE.MeshBasicMaterial; baseOpacity: number; phase: number }> = [];
  sunbeamDefs.forEach((def, idx) => {
    const beamGeo = new THREE.PlaneGeometry(def.w, def.h);
    const beamMat = new THREE.MeshBasicMaterial({
      map: sunbeamTex,
      transparent: true,
      opacity: def.baseOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(def.x, def.y, def.z);
    beam.rotation.set(0, def.rotY, def.tilt);
    group.add(beam);
    disposables.push(beamGeo, beamMat);
    sunbeamMats.push({ mat: beamMat, baseOpacity: def.baseOpacity, phase: idx * 1.15 });
  });

  // 12. Low-Lying Forest Mist Ribbons Drifting Softly Over Creek & Clearing Edge
  const mistDefs: ReadonlyArray<{ x: number; y: number; z: number; sx: number; sy: number; phase: number }> = [
    { x: -3.2, y: 0.85, z: 4.5, sx: 6.5, sy: 2.2, phase: 0.0 },
    { x: -5.8, y: 1.15, z: 2.8, sx: 7.2, sy: 2.5, phase: 1.6 },
    { x: -0.4, y: 0.80, z: 6.2, sx: 6.2, sy: 2.1, phase: 3.1 },
    { x: 3.8, y: 0.95, z: 2.6, sx: 6.4, sy: 2.2, phase: 4.4 },
  ];
  const mistSprites: Array<{ sprite: THREE.Sprite; baseX: number; baseZ: number; phase: number }> = [];
  for (const m of mistDefs) {
    const mMat = new THREE.SpriteMaterial({
      map: mistWispTex,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: true,
    });
    const sp = new THREE.Sprite(mMat);
    sp.position.set(m.x, m.y, m.z);
    sp.scale.set(m.sx, m.sy, 1);
    group.add(sp);
    disposables.push(mMat);
    mistSprites.push({ sprite: sp, baseX: m.x, baseZ: m.z, phase: m.phase });
  }

  // 13. Drifting Golden Forest Fireflies & Sun-Dusted Pollen Motes
  const fireflyCount = lowPerf ? 36 : 95;
  const fireflyGeo = new THREE.BufferGeometry();
  const fireflyPositions = new Float32Array(fireflyCount * 3);
  const fireflySeeds = new Float32Array(fireflyCount * 4);
  for (let i = 0; i < fireflyCount; i += 1) {
    const ang = rand() * Math.PI * 2;
    const rad = 1.4 + Math.sqrt(rand()) * 10.2;
    const fx = Math.cos(ang) * rad;
    const fz = Math.sin(ang) * rad;
    const fy = sampleForestTerrainHeight(fx, fz) + 0.38 + rand() * 2.4;
    fireflyPositions[i * 3] = fx;
    fireflyPositions[i * 3 + 1] = fy;
    fireflyPositions[i * 3 + 2] = fz;
    fireflySeeds[i * 4] = fx;
    fireflySeeds[i * 4 + 1] = fy;
    fireflySeeds[i * 4 + 2] = fz;
    fireflySeeds[i * 4 + 3] = rand() * Math.PI * 2;
  }
  fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
  const fireflyMat = new THREE.PointsMaterial({
    map: glowSpriteTex,
    color: 0xffe8a2,
    size: 0.14,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const fireflies = new THREE.Points(fireflyGeo, fireflyMat);
  group.add(fireflies);
  disposables.push(fireflyGeo, fireflyMat);

  // Bridge continuous side-rail containment so robot drives cleanly across planks without wheels hanging off!
  const constrainPosition = (
    prevX: number,
    prevZ: number,
    nextX: number,
    nextZ: number,
    robotRadius: number,
  ): { x: number; z: number } => {
    const prevLocal = worldToBridgeLocal(prevX, prevZ);
    const nextLocal = worldToBridgeLocal(nextX, nextZ);
    const wasOnBridge = Math.abs(prevLocal.lx) <= BRIDGE_HALF_L - 0.10 && Math.abs(prevLocal.lz) <= BRIDGE_HALF_W;
    const railHalfW = BRIDGE_HALF_W - 0.34;

    if (wasOnBridge && Math.abs(nextLocal.lx) <= BRIDGE_HALF_L + 0.05) {
      // Keep chassis comfortably inside bridge guardrails while crossing!
      if (Math.abs(nextLocal.lz) > railHalfW) {
        const clamped = bridgeLocalToWorld(nextLocal.lx, clamp(nextLocal.lz, -railHalfW, railHalfW));
        return { x: clamped.wx, z: clamped.wz };
      }
    } else if (!wasOnBridge && Math.abs(nextLocal.lx) <= BRIDGE_HALF_L - 0.12) {
      // Prevent entering bridge deck from the side through wooden railings
      const outerRail = BRIDGE_HALF_W + robotRadius * 0.75;
      if (Math.abs(nextLocal.lz) < outerRail && Math.abs(prevLocal.lz) >= BRIDGE_HALF_W - 0.05) {
        const sign = prevLocal.lz >= 0 ? 1 : -1;
        const pushed = bridgeLocalToWorld(nextLocal.lx, sign * outerRail);
        return { x: pushed.wx, z: pushed.wz };
      }
    }
    return { x: nextX, z: nextZ };
  };

  let photorealLoaded = false;
  type PhotorealSwayBatch = {
    inst: THREE.InstancedMesh;
    entries: Array<{ x: number; y: number; z: number; scale: number; yaw: number; phase: number }>;
  };
  const photorealSwayBatches: PhotorealSwayBatch[] = [];

  const collectKitPrimitives = (kitRoot: THREE.Group, prefix: string): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    const target = kitRoot.getObjectByName(prefix);
    if (target) {
      target.traverse(node => {
        if ((node as THREE.Mesh).isMesh) out.push(node as THREE.Mesh);
      });
    }
    if (out.length === 0) {
      kitRoot.traverse(node => {
        if ((node as THREE.Mesh).isMesh && node.name.startsWith(prefix)) {
          out.push(node as THREE.Mesh);
        }
      });
    }
    return out;
  };

  const extractCarrierMaterial = (kitRoot: THREE.Group, carrierName: string): THREE.MeshStandardMaterial | null => {
    const prims = collectKitPrimitives(kitRoot, carrierName);
    if (prims.length === 0) return null;
    const mat = Array.isArray(prims[0].material) ? prims[0].material[0] : prims[0].material;
    return mat instanceof THREE.MeshStandardMaterial ? mat : null;
  };

  const configureRepeatingMap = (tex: THREE.Texture | null | undefined, rx: number, ry: number): THREE.Texture | null => {
    if (!tex) return null;
    const cloned = tex.clone();
    cloned.wrapS = THREE.RepeatWrapping;
    cloned.wrapT = THREE.RepeatWrapping;
    cloned.repeat.set(rx, ry);
    cloned.anisotropy = 4;
    cloned.needsUpdate = true;
    disposables.push(cloned);
    return cloned;
  };

  const applyPhotorealKit = (kitRoot: THREE.Group) => {
    if (photorealLoaded) return;
    photorealLoaded = true;
    proceduralFloraGroup.visible = false;

    // 1. Upgrade terrain to REAL Poly Haven photoscanned mossy forest floor (forest_leaves_02 Diffuse+Normal+ARM!)
    const scannedTerrainMat = extractCarrierMaterial(kitRoot, 'CARRIER_TERRAIN_MOSS')
      ?? extractCarrierMaterial(kitRoot, 'CARRIER_TERRAIN_PINE');
    if (scannedTerrainMat) {
      const tMap = configureRepeatingMap(scannedTerrainMat.map, 16, 16);
      const tNor = configureRepeatingMap(scannedTerrainMat.normalMap, 16, 16);
      const tRough = configureRepeatingMap(scannedTerrainMat.roughnessMap, 16, 16);
      if (tMap) terrainMat.map = tMap;
      terrainMat.bumpMap = null;
      if (tNor) {
        terrainMat.normalMap = tNor;
        terrainMat.normalScale.set(1.15, 1.15);
      }
      if (tRough) {
        terrainMat.roughnessMap = tRough;
        terrainMat.roughness = 0.96;
      }
      terrainMat.envMapIntensity = 0.28;

      // Rich damp Pacific Northwest woodland ground grading (deep natural soil + lush moss + crisp HUD contrast!)
      const vCols = terrainGeo.attributes.color as THREE.BufferAttribute;
      const cNeutral = new THREE.Color(0x88917f);
      const cTrail = new THREE.Color(0x8a755e);
      const cMoss = new THREE.Color(0x6b845e);
      const cCreek = new THREE.Color(0x3a4845);
      const cEdgeShade = new THREE.Color(0x4b5749);
      const vc = new THREE.Color();
      for (let i = 0; i < tPos.count; i += 1) {
        const x = tPos.getX(i);
        const z = tPos.getZ(i);
        const r = Math.hypot(x, z);
        const trail = sampleTrailFactor(x, z);
        const creek = sampleCreekSignedDist(x, z);
        const creekMask = Math.exp(-(creek.dist * creek.dist) / (2 * 1.1 * 1.1)) * smoothstep(2.2, 3.5, r);
        const mNoise = 0.5 + 0.5 * Math.sin(x * 0.52 + z * 0.46);
        vc.copy(cNeutral).lerp(cMoss, mNoise * 0.52);
        vc.lerp(cTrail, trail * 0.56);
        vc.lerp(cEdgeShade, smoothstep(5.0, 14.0, r) * 0.58);
        vc.lerp(cCreek, creekMask * 0.82);
        vCols.setXYZ(i, vc.r, vc.g, vc.b);
      }
      vCols.needsUpdate = true;
      terrainMat.needsUpdate = true;
    }

    // 2. Upgrade wooden bridge planks & mossy timber railings with REAL Poly Haven weathered_planks & moss_wood!
    const scannedPlanks = extractCarrierMaterial(kitRoot, 'CARRIER_BRIDGE_PLANKS');
    if (scannedPlanks) {
      const pMap = configureRepeatingMap(scannedPlanks.map, 1, 1);
      const pNor = configureRepeatingMap(scannedPlanks.normalMap, 1, 1);
      const pRough = configureRepeatingMap(scannedPlanks.roughnessMap, 1, 1);
      if (pMap) plankMat.map = pMap;
      if (pNor) {
        plankMat.normalMap = pNor;
        plankMat.normalScale.set(1.25, 1.25);
      }
      if (pRough) plankMat.roughnessMap = pRough;
      plankMat.color.setHex(0xb8ab9b);
      plankMat.roughness = 0.90;
      plankMat.envMapIntensity = 0.36;
      plankMat.needsUpdate = true;
    }

    const scannedTimber = extractCarrierMaterial(kitRoot, 'CARRIER_BRIDGE_TIMBER');
    if (scannedTimber) {
      const mMap = configureRepeatingMap(scannedTimber.map, 1, 2);
      const mNor = configureRepeatingMap(scannedTimber.normalMap, 1, 2);
      const mRough = configureRepeatingMap(scannedTimber.roughnessMap, 1, 2);
      if (mMap) timberDarkMat.map = mMap;
      timberDarkMat.bumpMap = null;
      if (mNor) {
        timberDarkMat.normalMap = mNor;
        timberDarkMat.normalScale.set(1.2, 1.2);
      }
      if (mRough) timberDarkMat.roughnessMap = mRough;
      timberDarkMat.color.setHex(0x7c786c);
      timberDarkMat.envMapIntensity = 0.28;
      timberDarkMat.needsUpdate = true;
    }

    // Helper: instance a potentially multi-primitive Blender GLB kit object across a list of transforms!
    const instanceKitAsset = (
      kitName: string,
      transforms: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; rx?: number; ry: number; rz?: number }>,
      opts: { castShadow?: boolean; receiveShadow?: boolean; isFoliage?: boolean; normalizeMaxSpan?: number } = {},
    ): THREE.InstancedMesh[] => {
      if (transforms.length === 0) return [];
      const prims = collectKitPrimitives(kitRoot, kitName);
      if (prims.length === 0) return [];

      // Compute combined bounding box of kit asset so we can scale accurately to real-world meters
      let normScale = 1.0;
      if (opts.normalizeMaxSpan) {
        const bb = new THREE.Box3();
        for (const p of prims) {
          p.geometry.computeBoundingBox();
          if (p.geometry.boundingBox) bb.union(p.geometry.boundingBox);
        }
        const sz = new THREE.Vector3();
        bb.getSize(sz);
        const span = Math.max(sz.x, sz.y, sz.z, 0.01);
        normScale = opts.normalizeMaxSpan / span;
      }

      const created: THREE.InstancedMesh[] = [];
      for (const prim of prims) {
        const rawMats = Array.isArray(prim.material) ? prim.material : [prim.material];
        const clonedMats = rawMats.map(m => {
          const cm = m.clone();
          if (cm instanceof THREE.MeshStandardMaterial) {
            const matName = (cm.name || '').toLowerCase();
            if (matName.includes('bough')) {
              // Deep velvety spruce needle shading with soft canopy translucency (no black undersides or washed-out silver tops!)
              cm.color.setHex(0x6d8768);
              cm.emissive.setHex(0x162415);
              cm.emissiveIntensity = 0.62;
              cm.envMapIntensity = 0.24;
              cm.alphaTest = 0.34;
              cm.transparent = false;
              cm.depthWrite = true;
              cm.side = THREE.DoubleSide;
              cm.roughness = 0.95;
            } else if (opts.isFoliage || matName.includes('fern') || matName.includes('grass')) {
              cm.color.multiplyScalar(0.88);
              cm.emissive.setHex(0x0f1c0e);
              cm.emissiveIntensity = 0.32;
              cm.envMapIntensity = 0.30;
              cm.alphaTest = 0.34;
              cm.transparent = false;
              cm.depthWrite = true;
              cm.side = THREE.DoubleSide;
              cm.roughness = 0.90;
            } else {
              cm.color.multiplyScalar(0.84);
              cm.envMapIntensity = 0.42;
            }
          }
          disposables.push(cm);
          return cm;
        });

        const inst = new THREE.InstancedMesh(
          prim.geometry,
          clonedMats.length === 1 ? clonedMats[0] : clonedMats,
          transforms.length,
        );
        inst.castShadow = opts.castShadow !== false;
        inst.receiveShadow = opts.receiveShadow !== false;

        transforms.forEach((tr, i) => {
          dummy.position.set(tr.x, tr.y, tr.z);
          dummy.rotation.set(tr.rx ?? 0, tr.ry, tr.rz ?? 0);
          dummy.scale.set(tr.sx * normScale, tr.sy * normScale, tr.sz * normScale);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        });
        inst.instanceMatrix.needsUpdate = true;
        photorealGroup.add(inst);
        created.push(inst);
      }
      return created;
    };

    const pRand = seededRand(998811);

    // 3. Place towering photorealistic conifers (real pine_bark PBR + Cycles-baked fir needle boughs!)
    const treesA = treeSpots
      .filter(t => t.variant === 0)
      .map(t => ({
        x: t.x,
        y: sampleForestGroundOnly(t.x, t.z) - 0.14,
        z: t.z,
        sx: t.scale * 0.92,
        sy: t.scale * (0.94 + pRand() * 0.16),
        sz: t.scale * 0.92,
        rx: (pRand() - 0.5) * 0.035,
        ry: t.yaw,
        rz: (pRand() - 0.5) * 0.035,
      }));
    const treesB = treeSpots
      .filter(t => t.variant === 1)
      .map(t => ({
        x: t.x,
        y: sampleForestGroundOnly(t.x, t.z) - 0.14,
        z: t.z,
        sx: t.scale * 0.92,
        sy: t.scale * (0.94 + pRand() * 0.18),
        sz: t.scale * 0.92,
        rx: (pRand() - 0.5) * 0.035,
        ry: t.yaw,
        rz: (pRand() - 0.5) * 0.035,
      }));
    instanceKitAsset('KIT_TREE_TALL_A', treesA, { castShadow: true, receiveShadow: true });
    instanceKitAsset('KIT_TREE_TALL_B', treesB, { castShadow: true, receiveShadow: true });

    // Young bushy fir saplings tucked along glade & creek banks for realistic forest vertical layering
    const saplings: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number }> = [];
    for (let i = 0; i < 18; i += 1) {
      const ang = pRand() * Math.PI * 2;
      const rad = 3.8 + pRand() * 7.8;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      if (sampleTrailFactor(x, z) > 0.34) continue;
      if (Math.hypot(x - BRIDGE_CENTER_X, z - BRIDGE_CENTER_Z) < 2.8) continue;
      if (Math.hypot(x - 1.85, z + 1.50) < 2.6) continue;
      const creek = sampleCreekSignedDist(x, z);
      if (Math.abs(creek.dist) < 1.25 && Math.abs(creek.along) < 12) continue;
      const s = 0.72 + pRand() * 0.48;
      saplings.push({ x, y: sampleForestGroundOnly(x, z) - 0.06, z, sx: s, sy: s, sz: s, ry: pRand() * Math.PI * 2 });
    }
    instanceKitAsset('KIT_SAPLING_01', saplings, { castShadow: true, receiveShadow: true });

    // 4. Real Photoscanned Mossy Forest Rocks & Lichen Boulders (normalized to authentic real-world rock sizes!)
    const rockBuckets: Record<string, Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; rx: number; ry: number; rz: number }>> = {
      KIT_ROCK_MOSS_01: [],
      KIT_ROCK_MOSS_02: [],
      KIT_ROCK_MOSS_03: [],
      KIT_ROCK_MOSS_04: [],
      KIT_BOULDER_01: [],
    };
    const rockKeys = Object.keys(rockBuckets);
    boulderList.forEach((b, idx) => {
      const key = idx === 0 || idx === 4 ? 'KIT_BOULDER_01' : rockKeys[idx % 4];
      const gy = sampleForestGroundOnly(b.x, b.z);
      const baseSpan = Math.max(b.sx, b.sz) * 1.12;
      rockBuckets[key].push({
        x: b.x,
        y: gy - 0.05,
        z: b.z,
        sx: baseSpan,
        sy: baseSpan * (0.78 + pRand() * 0.25),
        sz: baseSpan,
        rx: (pRand() - 0.5) * 0.14,
        ry: b.yaw,
        rz: (pRand() - 0.5) * 0.14,
      });
    });
    for (const [k, list] of Object.entries(rockBuckets)) {
      instanceKitAsset(k, list, { castShadow: true, receiveShadow: true, normalizeMaxSpan: 1.0 });
    }

    // 5. Real Photoscanned Forest Storytelling Props (Mossy Stumps, Fallen Logs & Gnarled Pine Roots!)
    const stumpSpots = [
      { x: -0.55, z: 3.15, s: 0.92, ry: 0.6 },
      { x: 3.15, z: -2.45, s: 0.88, ry: 2.1 },
      { x: -4.85, z: -0.45, s: 1.05, ry: 3.8 },
      { x: 4.95, z: 2.35, s: 0.95, ry: 1.4 },
    ];
    instanceKitAsset(
      'KIT_STUMP_01',
      stumpSpots.map(p => ({ x: p.x, y: sampleForestGroundOnly(p.x, p.z) - 0.04, z: p.z, sx: p.s, sy: p.s, sz: p.s, ry: p.ry })),
      { castShadow: true, receiveShadow: true, normalizeMaxSpan: 0.95 },
    );

    const logSpots = [
      { x: -4.65, z: 2.85, s: 2.25, ry: 0.65 },
      { x: 4.25, z: -2.95, s: 2.10, ry: -0.85 },
      { x: 1.65, z: 5.55, s: 2.40, ry: 1.95 },
    ];
    instanceKitAsset(
      'KIT_FALLEN_LOG',
      logSpots.map(p => ({ x: p.x, y: sampleForestGroundOnly(p.x, p.z) - 0.06, z: p.z, sx: p.s, sy: p.s, sz: p.s, ry: p.ry })),
      { castShadow: true, receiveShadow: true, normalizeMaxSpan: 1.0 },
    );

    const rootSpots = [
      { x: -5.25, z: 2.10, s: 1.45, ry: 0.9 },
      { x: -3.95, z: 6.85, s: 1.55, ry: 2.4 },
      { x: 5.65, z: 1.95, s: 1.40, ry: 4.1 },
    ];
    instanceKitAsset(
      'KIT_PINE_ROOTS',
      rootSpots.map(p => ({ x: p.x, y: sampleForestGroundOnly(p.x, p.z) - 0.04, z: p.z, sx: p.s, sy: p.s, sz: p.s, ry: p.ry })),
      { castShadow: true, receiveShadow: true, normalizeMaxSpan: 1.0 },
    );

    // 6. Real Photoscanned Woodland Ferns & Forest Grass Tufts (Swinging gently in forest breeze!)
    const fernA: Array<{ x: number; y: number; z: number; scale: number; yaw: number; phase: number }> = [];
    const fernB: Array<{ x: number; y: number; z: number; scale: number; yaw: number; phase: number }> = [];
    const grassA: Array<{ x: number; y: number; z: number; scale: number; yaw: number; phase: number }> = [];
    const grassB: Array<{ x: number; y: number; z: number; scale: number; yaw: number; phase: number }> = [];

    fernEntries.forEach((f, idx) => {
      const mod = idx % 4;
      const entry = { x: f.x, y: f.y - 0.01, z: f.z, scale: f.scale * 0.95, yaw: f.yaw, phase: f.phase };
      if (mod === 0) fernA.push(entry);
      else if (mod === 1) fernB.push(entry);
      else if (mod === 2) grassA.push({ ...entry, scale: f.scale * 0.68 });
      else grassB.push({ ...entry, scale: f.scale * 0.65 });
    });

    const plantSets: ReadonlyArray<[string, typeof fernA, number]> = [
      ['KIT_FERN_01', fernA, 1.05],
      ['KIT_FERN_02', fernB, 1.02],
      ['KIT_GRASS_01', grassA, 0.78],
      ['KIT_GRASS_02', grassB, 0.72],
    ];
    for (const [kName, entries, normSpan] of plantSets) {
      const meshes = instanceKitAsset(
        kName,
        entries.map(e => ({ x: e.x, y: e.y, z: e.z, sx: e.scale, sy: e.scale, sz: e.scale, ry: e.yaw })),
        { castShadow: false, receiveShadow: true, isFoliage: true, normalizeMaxSpan: normSpan },
      );
      if (meshes.length > 0) {
        // Compute normScale for breeze updates
        const bb = new THREE.Box3();
        meshes[0].geometry.computeBoundingBox();
        if (meshes[0].geometry.boundingBox) bb.copy(meshes[0].geometry.boundingBox);
        const sz = new THREE.Vector3();
        bb.getSize(sz);
        const ns = normSpan / Math.max(sz.x, sz.y, sz.z, 0.01);
        for (const m of meshes) {
          photorealSwayBatches.push({
            inst: m,
            entries: entries.map(e => ({ ...e, scale: e.scale * ns })),
          });
        }
      }
    }
  };

  const colDormant = new THREE.Color(0xf5a442);
  const colActive = new THREE.Color(0x4ef2c8);
  const colBlend = new THREE.Color();
  let fernFrameSkip = 0;

  const update = (dt: number, now: number, robotX: number, robotZ: number) => {
    const tSec = now * 0.001;

    // Animated flowing creek surface ripples
    waterTextures.map.offset.y = -tSec * 0.14;
    waterTextures.bumpMap.offset.y = -tSec * 0.18;
    creekMat.emissiveIntensity = 0.24 + Math.sin(tSec * 2.1) * 0.07;

    // Soft volumetric sunbeam atmospheric breathing
    for (const sb of sunbeamMats) {
      sb.mat.opacity = sb.baseOpacity * (0.88 + 0.14 * Math.sin(tSec * 0.65 + sb.phase));
    }

    // Drifting low-lying forest mist wisps
    for (const m of mistSprites) {
      m.sprite.position.x = m.baseX + Math.sin(tSec * 0.14 + m.phase) * 0.65;
      m.sprite.position.z = m.baseZ + Math.cos(tSec * 0.11 + m.phase) * 0.45;
    }

    // Skip per-frame CPU buffer/instance uploads on Android lowPerf to keep joystick driving locked smooth!
    if (!lowPerf) {
      // Drifting fireflies & sunlit forest motes
      const fAttr = fireflyGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < fireflyCount; i += 1) {
        const bx = fireflySeeds[i * 4];
        const by = fireflySeeds[i * 4 + 1];
        const bz = fireflySeeds[i * 4 + 2];
        const ph = fireflySeeds[i * 4 + 3];
        fAttr.setXYZ(
          i,
          bx + Math.sin(tSec * 0.45 + ph) * 0.34,
          by + Math.sin(tSec * 0.85 + ph * 1.7) * 0.20,
          bz + Math.cos(tSec * 0.42 + ph * 1.3) * 0.34,
        );
      }
      fAttr.needsUpdate = true;

      // Gentle breeze swaying ferns & grass (throttled to every 2nd frame)
      fernFrameSkip = (fernFrameSkip + 1) & 1;
      if (fernFrameSkip === 0) {
        if (photorealLoaded) {
          for (const batch of photorealSwayBatches) {
            for (let i = 0; i < batch.entries.length; i += 1) {
              const f = batch.entries[i];
              const sway = Math.sin(tSec * 1.5 + f.phase) * 0.04;
              dummy.position.set(f.x, f.y, f.z);
              dummy.rotation.set(sway, f.yaw, sway * 0.6);
              dummy.scale.setScalar(f.scale);
              dummy.updateMatrix();
              batch.inst.setMatrixAt(i, dummy.matrix);
            }
            batch.inst.instanceMatrix.needsUpdate = true;
          }
        } else {
          for (let i = 0; i < fernEntries.length; i += 1) {
            const f = fernEntries[i];
            const sway = Math.sin(tSec * 1.6 + f.phase) * 0.05;
            dummy.position.set(f.x, f.y, f.z);
            dummy.rotation.set(sway, f.yaw, sway * 0.65);
            dummy.scale.setScalar(f.scale);
            dummy.updateMatrix();
            fernInst.setMatrixAt(i, dummy.matrix);
          }
          fernInst.instanceMatrix.needsUpdate = true;
        }
      }
    }

    // Interactive trail survey beacons
    for (const b of beacons) {
      const dist = Math.hypot(robotX - b.x, robotZ - b.z);
      if (dist < 1.72 && !b.discovered) {
        b.discovered = true;
        b.ripplePhase = 0.001;
      }

      const targetAct = b.discovered ? 1 : 0;
      b.activation += (targetAct - b.activation) * (1 - Math.exp(-5.0 * dt));

      colBlend.copy(colDormant).lerp(colActive, b.activation);
      b.orbMat.color.copy(colBlend);
      b.orbMat.emissive.copy(colBlend);
      b.orbMat.emissiveIntensity = 1.45 + b.activation * 1.25 + Math.sin(tSec * 3.1 + b.x) * 0.25;
      b.orbMesh.rotation.y = tSec * (0.9 + b.activation * 1.8);
      b.orbMesh.position.y = 0.74 + Math.sin(tSec * 2.2 + b.z) * 0.028;

      b.glowMat.color.copy(colBlend);
      b.glowMat.opacity = 0.56 + b.activation * 0.34;
      b.glowSprite.position.y = b.orbMesh.position.y;

      b.haloMat.color.copy(colBlend);
      b.haloMat.opacity = 0.34 + b.activation * 0.44;

      if (b.ripplePhase > 0) {
        b.ripplePhase += dt * 1.15;
        if (b.ripplePhase >= 1) {
          b.ripplePhase = 0;
          b.rippleMat.opacity = 0;
        } else {
          const s = 1 + b.ripplePhase * 4.0;
          b.rippleMesh.scale.set(s, s, 1);
          b.rippleMat.opacity = (1 - b.ripplePhase) * 0.80;
        }
      }
    }
  };

  return {
    group,
    arenaRadius: FOREST_ARENA_RADIUS,
    sampleHeight: sampleForestTerrainHeight,
    constrainPosition,
    colliders,
    applyPhotorealKit,
    isPhotorealLoaded: () => photorealLoaded,
    getDiscoveredBeacons: () => beacons.reduce((acc, b) => acc + (b.discovered ? 1 : 0), 0),
    getTotalBeacons: () => beacons.length,
    update,
    dispose: () => {
      for (const item of disposables) {
        item.dispose();
      }
    },
  };
}
