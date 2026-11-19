import type { RemoteLocation } from '../services/remoteState';

export type LocationTrailPoint = { lat: number; lon: number; observedAt: string; breakBefore: boolean };
export type LocationMapProps = {
  location?: RemoteLocation;
  fresh: boolean;
  simulated: boolean;
  isDark?: boolean;
  trail?: LocationTrailPoint[];
  trackKey?: string;
};
export type MapMode = 'follow' | 'overview' | 'globe' | 'free';
export type MapView = {
  ready: boolean; mode: MapMode; canFollow: boolean; canOverview: boolean;
  status: string; description: string; error: string | null;
};
export const initialMapView: MapView = {
  ready: false, mode: 'follow', canFollow: false, canOverview: false,
  status: '加载地图', description: '正在加载设备位置地图', error: null,
};

export function readMapView(value: unknown): MapView | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const view = value as Record<string, unknown>;
  if (view.type !== 'doso-map-view' || typeof view.ready !== 'boolean' || typeof view.mode !== 'string'
    || !['follow', 'overview', 'globe', 'free'].includes(view.mode) || typeof view.canFollow !== 'boolean'
    || typeof view.canOverview !== 'boolean' || typeof view.status !== 'string' || view.status.length > 64
    || typeof view.description !== 'string' || view.description.length > 256
    || (view.error !== null && (typeof view.error !== 'string' || view.error.length > 160))
    || (!view.ready && (view.canFollow || view.canOverview))) return null;
  return { ready: view.ready, mode: view.mode as MapMode, canFollow: view.canFollow,
    canOverview: view.canOverview, status: view.status, description: view.description, error: view.error as string | null };
}

export const locationMapMessage = ({ location, fresh, simulated, isDark = false, trail = [], trackKey = '' }: LocationMapProps) => JSON.stringify({
  type: 'doso-location',
  location: location && location.fixType > 0 ? { lat: location.lat, lon: location.lon, observedAt: location.observedAt } : null,
  fresh, simulated, dark: isDark, trackKey,
  trail: trail.slice(-2000).map(point => ({ lat: point.lat, lon: point.lon, observedAt: point.observedAt, breakBefore: point.breakBefore })),
  trailLimited: trail.length > 2000,
});

const styleUrl = process.env.EXPO_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
export const locationMapHtml = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl.css">
<style>
html,body,#map{height:100%;margin:0}body{background:#e8edf2}
.maplibregl-ctrl-group{border-radius:10px;box-shadow:0 2px 10px #17354d20}
.maplibregl-ctrl-group button{width:36px;height:36px}
.maplibregl-ctrl-attrib{color:#334155}
.device{width:12px;height:12px;border:2px solid white;border-radius:50%;background:#1672e8;box-shadow:0 1px 5px #17354d4d}
.device.stale{background:#7b8795}
.endpoint{width:6px;height:6px;border:1.5px solid #1672e8;border-radius:50%;background:white}
.endpoint.end{background:#1672e8;border-color:white}
</style></head><body><div id="map" aria-label="设备位置地图"></div>
<script type="module">
let map, marker, startMarker, endMarker, state = {location:null,fresh:false,simulated:false,dark:false,trail:[],trackKey:''}, disposed = false;
let ready = false, mode = 'follow', heading = 0, courseKnown = false, coursePoint = null, cameraPoint = null, trailSignature = '', failure = null;
const coordinates = p => p && Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90 && Number.isFinite(p.lon) && p.lon >= -180 && p.lon <= 180;
const timestamp = value => typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
const publish = () => {
  if (disposed) return;
  const status = !state.location ? state.trail.length ? '历史轨迹' : '暂无定位' : state.fresh ? '最新定位' : '定位已过期';
  const description = (state.simulated ? '模拟设备 · ' : '') + status
    + (mode === 'follow' ? ' · 跟随模式' : mode === 'overview' ? ' · 轨迹全览' : mode === 'globe' ? ' · 地球视角' : ' · 自由查看')
    + (!state.fresh ? ' · 方向待更新' : courseKnown ? ' · 轨迹估计行进方向' : ' · 北向')
    + (state.trailLimited ? ' · 仅显示最近 2000 点' : '');
  const view = {type:'doso-map-view',ready,mode,canFollow:ready && !!state.location && state.fresh,
    canOverview:ready && state.trail.length > 0,status,description,error:failure};
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(view));
  else window.parent.postMessage(view,'*');
};
const follow = (duration = cameraPoint ? 650 : 0) => {
  if (!ready || !state.location || !state.fresh) return;
  map.setProjection({type:'mercator'});
  map.easeTo({center:[state.location.lon,state.location.lat],zoom:16,pitch:45,bearing:heading,
    padding:{top:Math.round(map.getContainer().clientHeight * 0.35),bottom:0,left:0,right:0},duration});
  cameraPoint = state.location;
};
const overview = (duration = 650) => {
  if (!ready || !state.trail.length) return;
  mode = 'overview'; map.setProjection({type:'mercator'});
  const bounds = new maplibre.LngLatBounds();
  for (const point of state.trail) bounds.extend([point.lon,point.lat]);
  map.fitBounds(bounds,{padding:{top:25,bottom:50,left:30,right:30},maxZoom:16,pitch:0,bearing:0,duration});
};
const updateCourse = () => {
  const points = state.trail;
  if (!state.fresh || points.length < 2 || points[points.length - 1].breakBefore) {
    heading = 0; courseKnown = false; coursePoint = null; return;
  }
  const end = points[points.length - 1];
  if (coursePoint && Date.parse(end.observedAt) <= Date.parse(coursePoint.observedAt)) return;
  coursePoint = end;
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i + 1].breakBefore) { heading = 0; courseKnown = false; break; }
    const start = points[i];
    if (Date.parse(start.observedAt) >= Date.parse(end.observedAt)) continue;
    const lat1 = start.lat * Math.PI / 180, lat2 = end.lat * Math.PI / 180;
    const delta = (end.lon - start.lon) * Math.PI / 180;
    const a = Math.sin((lat2-lat1)/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(delta/2)**2;
    if (6371000 * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a))) < 3) continue;
    heading = Math.atan2(Math.sin(delta)*Math.cos(lat2),Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(delta)) * 180 / Math.PI;
    courseKnown = true;
    break;
  }
};
const endpoints = () => {
  if (!ready) return;
  startMarker.remove(); endMarker.remove();
  if (!state.trail.length) return;
  const first = state.trail[0], last = state.trail[state.trail.length-1];
  startMarker.setLngLat([first.lon,first.lat]).addTo(map);
  const near = point => {
    const a = map.project([point.lon,point.lat]), b = map.project([last.lon,last.lat]);
    return Math.hypot(a.x-b.x,a.y-b.y) < 18;
  };
  if (!near(first) && !(state.location && near(state.location))) endMarker.setLngLat([last.lon,last.lat]).addTo(map);
};
const updateTrail = () => {
  if (!ready) return;
  const signature = JSON.stringify(state.trail);
  if (signature === trailSignature) return;
  trailSignature = signature;
  const features = [], segments = [];
  for (const point of state.trail) {
    if (!segments.length || point.breakBefore) segments.push([]);
    segments[segments.length-1].push([point.lon,point.lat]);
  }
  for (const segment of segments) {
    if (segment.length > 1) features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:segment}});
  }
  map.getSource('trail').setData({type:'FeatureCollection',features});
};
const update = () => {
  const previousHeading = heading, previousCourse = courseKnown;
  updateCourse(); updateTrail(); endpoints();
  if (marker) {
    if (!state.location) {
      marker.remove(); cameraPoint = null;
      if (ready && mode === 'follow' && state.trail.length) overview();
    } else {
      marker.getElement().classList.toggle('stale', !state.fresh);
      marker.setLngLat([state.location.lon,state.location.lat]).addTo(map);
      const changed = !cameraPoint || Date.parse(state.location.observedAt) > Date.parse(cameraPoint.observedAt)
        && (state.location.lat !== cameraPoint.lat || state.location.lon !== cameraPoint.lon);
      if (mode === 'follow' && state.fresh && (changed || previousHeading !== heading || previousCourse !== courseKnown)) follow();
    }
  }
  publish();
};
const chooseMode = next => {
  if (!ready) return;
  if (next === 'follow') {
    if (!state.location || !state.fresh) return;
    mode = next; follow();
  } else if (next === 'overview') {
    if (!state.trail.length) return;
    overview();
  } else if (next === 'globe') {
    mode = next; map.setProjection({type:'globe'});
    map.easeTo({zoom:0.5,pitch:0,bearing:0,padding:{top:0,bottom:0,left:0,right:0},duration:900});
  } else return;
  publish();
};
const receive = event => {
  if (event.source && event.source !== window.parent) return;
  let next; try { next = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
  if (!next) return;
  if (next.type === 'doso-map-mode') { chooseMode(next.mode); return; }
  if (next.type !== 'doso-location' || typeof next.fresh !== 'boolean' || typeof next.simulated !== 'boolean') return;
  const p = next.location;
  if (p !== null && (!coordinates(p) || !timestamp(p.observedAt))) return;
  const trail = next.trail ?? [], trackKey = next.trackKey ?? '', dark = next.dark ?? false;
  if (!Array.isArray(trail) || trail.length > 2000 || !trail.every(point => coordinates(point) && timestamp(point.observedAt) && typeof point.breakBefore === 'boolean')
    || typeof trackKey !== 'string' || trackKey.length > 512 || typeof dark !== 'boolean') return;
  if (trackKey !== state.trackKey) {
    heading = 0; courseKnown = false; coursePoint = null; cameraPoint = null;
    trailSignature = ''; mode = 'follow';
  }
  state = {location:p,fresh:next.fresh,simulated:next.simulated,dark,trail,trackKey,trailLimited:next.trailLimited === true};
  update();
};
window.addEventListener('message', receive);
document.addEventListener('message', receive);
const timer = setTimeout(() => { failure = '底图加载超时，请检查网络后重新展开。'; publish(); }, 20000);
const cleanup = () => {
  disposed = true; clearTimeout(timer);
  window.removeEventListener('message', receive); document.removeEventListener('message', receive);
  marker?.remove(); startMarker?.remove(); endMarker?.remove(); map?.remove();
};
window.addEventListener('pagehide', cleanup, {once:true});
let maplibre;
try {
  maplibre = await import('https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl.mjs');
  if (!disposed) {
    maplibre.setWorkerUrl('https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl-worker.mjs');
    map = new maplibre.Map({container:'map',style:${JSON.stringify(styleUrl).replace(/</g, '\\u003c')},
      center:state.location ? [state.location.lon,state.location.lat] : [104,35],zoom:state.location ? 16 : 2,pitch:45,attributionControl:{compact:false}});
    map.addControl(new maplibre.NavigationControl(), 'top-right');
    const dot = document.createElement('div'); dot.className = 'device'; dot.setAttribute('aria-label','设备位置');
    marker = new maplibre.Marker({element:dot});
    const start = document.createElement('div'); start.className = 'endpoint'; start.setAttribute('role','img'); start.setAttribute('aria-label','轨迹起点'); start.setAttribute('title','轨迹起点');
    const end = document.createElement('div'); end.className = 'endpoint end'; end.setAttribute('role','img'); end.setAttribute('aria-label','末次记录位置'); end.setAttribute('title','末次记录位置');
    startMarker = new maplibre.Marker({element:start}); endMarker = new maplibre.Marker({element:end});
    map.on('style.load', () => {
      clearTimeout(timer); ready = true; failure = null;
      map.addSource('trail',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      map.addLayer({id:'trail-outline',type:'line',source:'trail',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':4.5}});
      map.addLayer({id:'trail-line',type:'line',source:'trail',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#1672e8','line-width':2.5}});
      trailSignature = ''; update();
    });
    const release = event => { if (event.originalEvent) { mode = 'free'; publish(); } };
    map.on('movestart', release); map.on('rotatestart', release); map.on('pitchstart', release); map.on('zoomstart', release);
    map.on('moveend', endpoints);
    map.on('resize', () => {
      if (mode === 'follow') follow(0);
      else if (mode === 'overview') overview(0);
      endpoints();
    });
    map.on('error', () => { failure = '底图加载失败，请检查网络后重试。'; publish(); });
    update();
  }
} catch { clearTimeout(timer); failure = '底图加载失败，请检查网络与 WebGL 支持。'; publish(); }
</script></body></html>`;
