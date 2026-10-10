const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const core = require('../src/battle_map_core');
const ds = require('../src/collectors/deepstate');
const bm = require('../src/battle_map');
const { validEntry } = require('../src/warning_board');

test('map projection fits the requested area and plans the right tiles', () => {
  const bbox = [37.25, 48.7, 38.75, 49.55];
  const v = core.makeView(bbox, 1280, 760, 100);
  const [x1, y1] = v.project(bbox[0], bbox[3]), [x2, y2] = v.project(bbox[2], bbox[1]);
  assert.ok(x1 >= 0 && x2 <= 1280 && y1 >= 100 && y2 <= 860, 'bbox inside map area');
  assert.ok(core.planTiles(bbox).every(t => t.z === v.z && t.x >= 0 && t.y >= 0));
  assert.ok(v.metersPerPixel > 50 && v.metersPerPixel < 400);
});

test('DeepState polygons keep only occupied/contested classes and skip joke territories', () => {
  const sq = [[[37, 48], [38, 48], [38, 49], [37, 49], [37, 48]]];
  const fc = { features: [
    { properties: { name: 'Окуповано /// Occupied /// geoJSON.status.occupied' }, geometry: { type: 'Polygon', coordinates: sq } },
    { properties: { name: 'Окупований Крим /// Occupied Crimea /// geoJSON.territories.crimea' }, geometry: { type: 'MultiPolygon', coordinates: [sq, sq] } },
    { properties: { name: 'Тимчасово окупована східна Пруссія /// geoJSON.territories.prussia' }, geometry: { type: 'Polygon', coordinates: sq } },
    { properties: { name: 'Статус невідомий /// Unknown status /// geoJSON.status.unknown' }, geometry: { type: 'Polygon', coordinates: sq } },
    { properties: { name: 'Напрямок удару /// geoJSON.status.attack_direction' }, geometry: { type: 'Point', coordinates: [37, 48, 0] } }] };
  assert.equal(ds.polygonsOf(fc, ds.OCCUPIED).length, 3);
  assert.equal(ds.polygonsOf(fc, ds.CONTESTED).length, 1);
});

test('DeepState update text becomes sided, geolocated events; city links without coordinates stay text-only', () => {
  const ev = ds.parseUpdates([
    { id: 1, createdAt: '2026-09-29T04:11:56.000Z', descriptionEn: 'The Ukrainian Armed Forces have regained control near <a href="https://deepstatemap.live/en#15/49.7902418/37.6201938">Kalynove</a>. The enemy has advanced near <a href="https://deepstatemap.live/en#14/48.3599016/37.0412627">Vasylivka</a> and <a href="https://deepstatemap.live/en#14/48.3845489/37.1114917">Shevchenko</a>.' },
    { id: 2, createdAt: '2026-09-27T21:23:38.000Z', descriptionEn: 'The Ukrainian Armed Forces liberated <a href="https://deepstatemap.live/en#dl!city!dsm:l:5903">Ridkodub</a>.' }]);
  assert.deepEqual(ev.filter(e => e.side === 'UA' && e.lat).map(e => e.name), ['Kalynove']);
  assert.deepEqual(ev.filter(e => e.side === 'RU').map(e => e.name), ['Vasylivka', 'Shevchenko']);
  const rid = ev.find(e => e.name === 'Ridkodub');
  assert.equal(rid.side, 'UA'); assert.equal(rid.lat, null);
  assert.equal(ev.find(e => e.name === 'Vasylivka').lon, 37.0412627);
});

test('DeepState collector stores two snapshots and keeps the old data when the site fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-'));
  const list = [{ id: 10, createdAt: '2026-09-20T00:00:00Z', descriptionEn: '' }, { id: 20, createdAt: '2026-09-29T00:00:00Z', descriptionEn: 'The enemy advanced near <a href="x#14/48.1/37.1">A</a>.' }];
  const fake = async url => ({ ok: true, json: async () => url.endsWith('/public') ? list : { type: 'FeatureCollection', features: [] } });
  const s = await ds.refreshDeepState({ force: true, dir, fetchImpl: fake, now: Date.parse('2026-09-30T00:00:00Z') });
  assert.equal(s.status, 'ONLINE'); assert.equal(s.latest.id, 20); assert.equal(s.weekAgo.id, 10);
  assert.ok(fs.existsSync(path.join(dir, '20.json')) && fs.existsSync(path.join(dir, '10.json')));
  const bad = async () => ({ ok: false, status: 500 });
  const s2 = await ds.refreshDeepState({ force: true, dir, fetchImpl: bad, now: Date.parse('2026-09-30T01:00:00Z') });
  assert.equal(s2.status, 'DEGRADED'); assert.equal(s2.latest.id, 20);
});

test('ledger entries may carry map coordinates and arrows, but only valid ones', () => {
  const e = { id: 'a', theater: 'europe_security', indicator: 'eu_airspace', triggered: true, observedAt: '2026-09-23T09:00:00Z', summary: 'x',
    sources: [{ url: 'https://example.org', publisher: 'p', sourceClass: 'INDEPENDENT_MEDIA', publishedAt: '2026-09-23T00:00:00Z' }], reviewed: true };
  const now = Date.parse('2026-09-30T00:00:00Z');
  assert.equal(validEntry({ ...e, location: { lat: 54.38, lon: 19.82, label: '布拉涅沃' } }, now), true);
  assert.equal(validEntry({ ...e, location: { lat: 954, lon: 19.82, label: 'x' } }, now), false);
  assert.equal(validEntry({ ...e, location: { lat: 54, lon: 19 } }, now), false);
  assert.equal(validEntry({ ...e, arrow: { from: [19, 54], to: [20, 54] } }, now), true);
  assert.equal(validEntry({ ...e, arrow: { from: [19], to: [20, 54] } }, now), false);
});

test('non-Ukraine specs contain sourced layers, text and attribution', async () => {
  const now = Date.parse('2026-09-30T03:00:00Z');
  const board = { theaters: [{ id: 'taiwan_strait', level: 1, levelName: '常態', triggered: [] }, { id: 'iran_gulf', level: 1, levelName: '無升級跡象（戰事持續中）', triggered: [{ id: 'ir_blockade', name: '美軍海上封鎖持續或擴大' }] }] };
  const tw = await bm.buildSpec('taiwan_strait', { now, board, taiwanFeed: { latest: { observation: { periodEnd: '2026-09-28T22:00:00Z', aircraft: { value: 3 }, ships: { value: 6 }, officialVessels: { value: 4 }, crossingOrAirspace: { value: null } } } } });
  assert.match(tw.paragraph, /共機 3 架次、共艦 6 艘/);
  assert.match(tw.paragraph, /不標航跡/);
  assert.ok(tw.layers.some(l => l.type === 'line' && /中線/.test(l.label)));
  assert.match(tw.footer, /EOX/);
  const ir = await bm.buildSpec('iran_gulf', { now, board });
  assert.match(ir.paragraph, /UKMTO/); assert.match(ir.paragraph, /海上封鎖持續/);
  for (const id of Object.keys(bm.MAPS).filter(x => x !== 'ukraine_front')) {
    const spec = await bm.buildSpec(id, { now, board });
    assert.ok(spec.title && spec.paragraph && spec.bbox.length === 4 && spec.footer, id);
  }
  await assert.rejects(bm.buildSpec('mars', { now, board }));
});

test('private-message words map to theaters', () => {
  assert.equal(bm.theaterFromText('台海戰場圖'), 'taiwan_strait');
  assert.equal(bm.theaterFromText('荷莫茲戰場圖'), 'iran_gulf');
  assert.equal(bm.theaterFromText('波蘭戰場圖'), 'europe_security');
  assert.equal(bm.theaterFromText('戰場圖'), 'ukraine_front');
});

test('compared map events: confidence rules, geocoding inside the map only, hollow marks for unconfirmed', async () => {
  const now = Date.parse('2026-09-30T04:00:00Z');
  const base = { id: 'e1', theater: 'ukraine_front', observedAt: '2026-09-27T21:00:00Z', title: '烏軍收復某村', summary: 's', comparison: 'c', place: { name: 'Nove', admin: 'Donetsk Oblast' }, side: 'UA', kind: 'ADVANCE', confidence: 'CONFIRMED_MULTI',
    sources: [{ url: 'https://deepstatemap.live/en', publisher: 'DeepStateMap', sourceClass: 'INDEPENDENT_MEDIA', publishedAt: '2026-09-27T21:00:00Z' }, { url: 'https://isw.example', publisher: 'ISW', sourceClass: 'EXTERNAL_ASSESSMENT', publishedAt: '2026-09-28T00:00:00Z' }], reviewed: true };
  assert.equal(bm.validMapEvent(base, now), true);
  assert.equal(bm.validMapEvent({ ...base, sources: [base.sources[0]] }, now), false, 'one source cannot be CONFIRMED_MULTI');
  assert.equal(bm.validMapEvent({ ...base, sources: base.sources.map(s => ({ ...s, sourceClass: 'PARTY_CLAIM' })) }, now), false, 'party claims alone cannot be confirmed');
  assert.equal(bm.validMapEvent({ ...base, confidence: 'SINGLE_SOURCE', sources: [base.sources[0]] }, now), true);
  assert.equal(bm.validMapEvent({ ...base, place: { name: 'x', lat: 49, lon: 37 } }, now), false, 'coordinates need a basis');
  assert.equal(bm.validMapEvent({ ...base, observedAt: '2026-10-09T00:00:00Z' }, now), false);
  const file = path.join(__dirname, '../research/warning_indicators.json');
  const original = fs.readFileSync(file, 'utf8');
  try {
    const ledger = JSON.parse(original);
    ledger.mapEvents = [base, { ...base, id: 'e2', confidence: 'SINGLE_SOURCE', sources: [base.sources[0]], place: { name: 'Far', lat: 45, lon: 30, basis: 'SOURCE_COORDS' } }];
    fs.writeFileSync(file, JSON.stringify(ledger));
    const calls = [];
    const geocodeImpl = async (q, theater, bbox) => { calls.push({ q, bbox }); return q === 'Nove, Donetsk Oblast' ? { lat: 49.2, lon: 37.9 } : null; };
    const r = await bm.mapEventLayers('ukraine_front', [37.25, 48.7, 38.75, 49.55], [37.25, 48.7, 38.75, 49.55], now, { geocodeImpl });
    assert.equal(r.points.length, 1); assert.equal(r.points[0].hollow, false);
    assert.deepEqual(calls[0].bbox, [37.25, 48.7, 38.75, 49.55]);
    assert.match(r.sentence, /多來源一致/); assert.match(r.sentence, /單一來源/);
    assert.deepEqual(r.unlocated, ['烏軍收復某村']);
  } finally { fs.writeFileSync(file, original); }
});

test('geocoder caches results and rejects hits outside the map', async () => {
  const { geocode } = require('../src/geocode');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'geo-')), 'g.json');
  let n = 0;
  const fake = async () => { n++; return { ok: true, json: async () => [{ lat: '10', lon: '10', display_name: 'far' }, { lat: '49.2', lon: '37.9', display_name: 'Nove' }] }; };
  const g = await geocode('Nove', 'ukraine_front', [37, 49, 38.5, 49.6], { fetchImpl: fake, file });
  assert.equal(g.lat, 49.2);
  await geocode('Nove', 'ukraine_front', [37, 49, 38.5, 49.6], { fetchImpl: fake, file });
  assert.equal(n, 1);
});
