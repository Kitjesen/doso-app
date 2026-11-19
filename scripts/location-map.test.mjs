import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/locationMapHtml.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { module, exports: module.exports, process: { env: {} } });
const { locationMapHtml, locationMapMessage, readMapView } = module.exports;

async function mount(native = false) {
  const elements = new Map(), listeners = new Map(), events = new Map(), timers = new Set(), moves = [], markers = [], sources = new Map(), views = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', classList: { toggle(name, value) { this[name] = value; } }, setAttribute(name, value) { this[name] = value; } });
    return elements.get(id);
  };
  const parent = { postMessage(value) { views.push(value); } };
  const window = { parent, addEventListener: (name, fn) => listeners.set('window:' + name, fn), removeEventListener: name => listeners.delete('window:' + name) };
  if (native) window.ReactNativeWebView = { postMessage(value) { views.push(JSON.parse(value)); } };
  let nextElement = 0, removed = 0, projection, height = 360;
  const document = { createElement: () => element('marker-' + nextElement++), addEventListener: (name, fn) => listeners.set('document:' + name, fn), removeEventListener: name => listeners.delete('document:' + name) };
  const fake = {
    setWorkerUrl() {}, NavigationControl: class {},
    Map: class {
      addControl() {} on(name, fn) { events.set(name, fn); } setProjection(value) { projection = value; }
      getContainer() { return { clientHeight: height }; }
      easeTo(value) { moves.push({ kind: 'ease', ...value }); }
      fitBounds(bounds, value) { moves.push({ kind: 'fit', bounds, ...value }); }
      project([lon, lat]) { return { x: lon * 100000, y: lat * 100000 }; }
      addSource(name, value) { sources.set(name, { data: value.data, writes: 0, setData(data) { this.data = data; this.writes++; } }); }
      getSource(name) { return sources.get(name); }
      addLayer() {} remove() { removed++; }
    },
    Marker: class {
      constructor({ element }) { this.element = element; this.position = null; markers.push(this); }
      getElement() { return this.element; } setLngLat(at) { this.position = at; return this; } addTo() { return this; } remove() { this.position = null; }
    },
    LngLatBounds: class { points = []; extend(point) { this.points.push(point); return this; } },
  };
  const script = locationMapHtml.match(/<script type="module">([\s\S]*)<\/script>/)[1]
    .replace("await import('https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl.mjs')", 'await Promise.resolve(fake)');
  await vm.runInNewContext('(async () => { ' + script + ' })()', { window, document, fake,
    setTimeout(fn) { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn) });
  return { element, events, timers, moves, listeners, markers, sources, views, get view() { return views.at(-1); },
    get removed() { return removed; }, get markerAt() { return markers[0]?.position ?? null; }, get projection() { return projection; },
    message(value, source = parent) { listeners.get('window:message')({ data: JSON.stringify(value), source }); },
    command(mode, source = parent) { this.message({ type: 'doso-map-mode', mode }, source); },
    resize(value) { height = value; events.get('resize')(); },
    close() { listeners.get('window:pagehide')(); },
  };
}

const at = Date.parse('2026-11-09T00:00:00.000Z');
const point = (second, lat = 31.2304, lon = 121.4737, breakBefore = false) => ({ lat, lon, observedAt: new Date(at + second * 1000).toISOString(), breakBefore });
const message = (patch = {}) => ({ type: 'doso-location', location: point(0), fresh: true, simulated: false, trail: [], trackKey: 'today', ...patch });

test('external controls follow renderer mode without repeating camera commands on polling', async () => {
  const host = await mount();
  assert.equal(host.markerAt, null); assert.equal(host.view.ready, false);
  host.command('globe'); assert.equal(host.moves.length, 0);
  host.events.get('style.load')(); assert.equal(host.view.ready, true);
  const payload = JSON.parse(locationMapMessage({ location: { ...point(0), fixType: 4, accuracyM: 2 }, fresh: true, simulated: true }));
  assert.deepEqual(Object.keys(payload.location), ['lat', 'lon', 'observedAt']);
  host.message(payload); assert.deepEqual([...host.markerAt], [121.4737, 31.2304]);
  assert.match(host.view.description, /模拟设备 · 最新定位.*跟随模式/);
  assert.equal(host.view.canFollow, true); assert.equal(host.moves.at(-1).pitch, 45);
  host.events.get('movestart')({ originalEvent: {} }); const moves = host.moves.length;
  host.message({ ...payload, location: point(1, 31.2305) });
  assert.equal(host.moves.length, moves); assert.equal(host.view.mode, 'free');
  host.command('follow'); assert.equal(host.moves.length, moves + 1); assert.equal(host.view.mode, 'follow');
  host.command('globe'); assert.equal(host.moves.at(-1).zoom, 0.5); assert.equal(host.projection.type, 'globe');
  const globeMoves = host.moves.length; host.message(payload);
  assert.equal(host.moves.length, globeMoves); assert.equal(host.view.mode, 'globe');
  host.message({ ...payload, location: null }); assert.equal(host.markerAt, null); assert.equal(host.view.canFollow, false);
  host.close(); assert.equal(host.removed, 1); assert.equal(host.timers.size, 0);
  assert.equal(host.listeners.has('window:message'), false); assert.equal(host.listeners.has('document:message'), false);
});

test('foreign commands and invalid coordinates cannot move the map, errors reach external controls', async () => {
  const host = await mount(); host.events.get('style.load')();
  host.message(message({ location: point(0, 91) })); host.message(message(), {});
  host.message(message({ trail: [{ ...point(0), breakBefore: 'yes' }] }));
  host.command('globe', {}); host.command('invalid');
  assert.equal(host.markerAt, null); assert.equal(host.moves.length, 0);
  host.events.get('error')(); assert.match(host.view.error, /底图加载失败/);
  host.close();
});

test('stale fixes pause follow until a fresh fix arrives', async () => {
  const host = await mount(); host.events.get('style.load')();
  host.message(message({ fresh: false })); assert.equal(host.moves.length, 0); assert.equal(host.view.canFollow, false);
  host.command('follow'); assert.equal(host.moves.length, 0);
  host.message(message()); const moves = host.moves.length;
  host.message(message({ fresh: false, location: point(2, 31.2306) }));
  assert.equal(host.moves.length, moves); assert.equal(host.view.status, '定位已过期');
  assert.match(host.view.description, /方向待更新/); assert.equal(host.markers[0].element.classList.stale, true);
  host.close();
});

test('historical tracks start in overview and keep the selected view when refreshed', async () => {
  const host = await mount(); host.events.get('style.load')(); host.message(message());
  const trail = [point(0, 30, 120, true), point(1, 30.001, 120)];
  host.message(message({ location: null, fresh: false, trail, trackKey: 'yesterday' }));
  assert.equal(host.markerAt, null); assert.equal(host.moves.at(-1).kind, 'fit'); assert.equal(host.moves.at(-1).pitch, 0);
  assert.equal(host.moves.at(-1).maxZoom, 16);
  assert.equal(host.view.mode, 'overview'); assert.equal(host.view.status, '历史轨迹'); assert.equal(host.view.canFollow, false);
  const moves = host.moves.length; host.message(message({ location: null, fresh: false, trail, trackKey: 'yesterday' }));
  assert.equal(host.moves.length, moves); host.command('overview'); assert.equal(host.moves.length, moves + 1);
  host.message(message({ location: null, fresh: false, trail: [], trackKey: 'empty-day' }));
  assert.equal(host.sources.get('trail').data.features.length, 0);
  assert.equal(host.markers[1].position, null); assert.equal(host.markers[2].position, null);
  host.close();
});

test('segments preserve gaps and reset the estimated course', async () => {
  const host = await mount(); host.events.get('style.load')();
  const first = [point(0, 31, 121, true), point(1, 31, 121.0001)];
  host.message(message({ trail: first, location: first[1] }));
  assert.ok(Math.abs(host.moves.at(-1).bearing - 90) < 1); assert.match(host.view.description, /轨迹估计行进方向/);
  const second = [...first, point(2, 31.001, 121.001, true)];
  host.message(message({ trail: second, location: second[2] }));
  assert.equal(host.moves.at(-1).bearing, 0); assert.equal(host.sources.get('trail').data.features.length, 1);
  second.push(point(3, 31.0011, 121.001)); host.message(message({ trail: second, location: second[3] }));
  const features = host.sources.get('trail').data.features;
  assert.equal(features.length, 2); assert.equal(features[0].geometry.coordinates.length, 2); assert.equal(features[1].geometry.coordinates.length, 2);
  assert.deepEqual([...features[0].geometry.coordinates[0]], [first[0].lon, first[0].lat]);
  host.close();
});

test('stationary segment breaks reset camera bearing without inventing movement', async () => {
  const host = await mount(); host.events.get('style.load')();
  const trail = [point(0, 31, 121, true), point(1, 31, 121.0001)];
  host.message(message({ trail, location: trail[1] })); assert.ok(host.moves.at(-1).bearing > 80);
  const stopped = point(2, trail[1].lat, trail[1].lon, true); trail.push(stopped);
  host.message(message({ trail, location: stopped })); assert.equal(host.moves.at(-1).bearing, 0);
  const moves = host.moves.length; host.message(message({ trail, location: stopped })); assert.equal(host.moves.length, moves);
  host.close();
});

test('only bounded map fields and a valid external view cross the bridge', async () => {
  const trail = Array.from({ length: 2001 }, (_, i) => ({ ...point(i), private: 'hidden' }));
  const payload = JSON.parse(locationMapMessage({ fresh: false, simulated: false, trail, trackKey: 'device-day-epoch', isDark: true }));
  assert.equal(payload.trail.length, 2000); assert.equal(payload.trailLimited, true); assert.equal(payload.trail[0].private, undefined);
  assert.equal(payload.trackKey, 'device-day-epoch'); assert.equal(payload.dark, true);
  const host = await mount(true); host.events.get('style.load')(); host.message(message());
  assert.equal(readMapView(host.view).mode, 'follow');
  for (const bad of [null, [], { ...host.view, mode: 'unknown' }, { ...host.view, ready: false, canFollow: true },
    { ...host.view, error: {} }, { ...host.view, description: 'x'.repeat(257) }]) assert.equal(readMapView(bad), null);
  const moves = host.moves.length; host.message(message({ dark: true }));
  assert.equal(host.moves.length, moves); host.message(message({ dark: 'yes' }));
  assert.equal(host.moves.length, moves); host.close();
});

test('small endpoints stay accessible and avoid stacking on nearby fixes', async () => {
  const host = await mount(); host.events.get('style.load')();
  const trail = [point(0, 31, 121, true), point(1, 31.001, 121)];
  host.message(message({ location: null, fresh: false, trail }));
  assert.equal(host.markers[1].element.textContent, ''); assert.equal(host.markers[1].element.title, '轨迹起点');
  assert.equal(host.markers[2].element.title, '末次记录位置'); assert.notEqual(host.markers[2].position, null);
  host.message(message({ location: null, fresh: false, trail: [trail[0], point(2, 31.00001, 121)] }));
  assert.equal(host.markers[2].position, null); assert.notEqual(host.markers[1].position, null);
  host.message(message({ location: trail[1], trail }));
  assert.equal(host.markers[2].position, null); host.close();
});

test('drawer resizing adapts follow and overview while keeping free pan', async () => {
  const host = await mount(); host.events.get('style.load')();
  const trail = [point(0, 31, 121, true), point(1, 31.001, 121)];
  host.message(message({ location: trail[1], trail }));
  host.resize(220); assert.equal(host.moves.at(-1).duration, 0); assert.equal(host.moves.at(-1).padding.top, 77);
  host.command('overview'); host.resize(400);
  assert.equal(host.moves.at(-1).kind, 'fit'); assert.equal(host.moves.at(-1).duration, 0);
  host.events.get('movestart')({ originalEvent: {} }); const moves = host.moves.length;
  host.resize(220); assert.equal(host.moves.length, moves); assert.equal(host.view.mode, 'free'); host.close();
});
