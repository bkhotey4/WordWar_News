// 戰場圖地形底圖、控制區色塊與衛星雲遮判定（SCL）
const test = require('node:test');
const assert = require('node:assert');

test('decodeCountry turns delta-encoded TopoJSON arcs into lon/lat rings', () => {
  const { decodeCountry } = require('../src/geo_borders');
  const topo = { transform: { scale: [1, 1], translate: [0, 0] }, arcs: [[[0, 0], [10, 0], [0, 10], [-10, 0], [0, -10]]],
    objects: { countries: { geometries: [{ id: '804', type: 'Polygon', arcs: [[0]] }] } } };
  const polys = decodeCountry(topo, 804);
  assert.deepStrictEqual(polys, [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]]);
  assert.strictEqual(decodeCountry(topo, 643), null);
});

test('bare-name geocode must match the recorded raion/oblast (no same-name village in another raion)', () => {
  const { adminMatches } = require('../src/battle_map');
  assert.strictEqual(adminMatches('Pokrovsk Raion, Donetsk Oblast', 'Ivanivka, Lyman urban hromada, Kramatorsk Raion, Donetsk Oblast, Ukraine'), false);
  assert.strictEqual(adminMatches('Pokrovsk Raion, Donetsk Oblast', 'Ivanivka, Hrodivka, Pokrovskii Raion, Donetsk Oblast, Ukraine'), true);
  assert.strictEqual(adminMatches('Kyiv City', 'Kyiv, Kyiv City, Ukraine'), true);
  assert.strictEqual(adminMatches('Ștefan Vodă District, Moldova', 'Ștefan Vodă, Raionul Ștefan Vodă, Moldova'), true);
  // 行政區名稱含地名本身時，不可因第一段地名相同而誤配到別國同名村
  assert.strictEqual(adminMatches('Brussels-Capital', 'Brussels, Odesa Raion, Odesa Oblast, Ukraine'), false);
  assert.strictEqual(adminMatches('Kyiv City', 'Kyiv'), false);
  assert.strictEqual(adminMatches(undefined, 'anything'), true);
});

test('sector map geocodes admin-qualified names theatre-wide and drops big cities outside the sector', async () => {
  const bm = require('../src/battle_map');
  const calls = [];
  const geocodeImpl = async (q, theater, box) => { calls.push([q, box]); return /^Kyiv/.test(q) ? { lat: 50.45, lon: 30.52, name: 'Kyiv, Ukraine' } : null; };
  const sector = bm.UA_SECTORS.lyman_siversk.bbox, wide = bm.MAPS.ukraine_front.publicBbox;
  const ev = { id: 'test-kyiv', theater: 'ukraine_front', reviewed: true, title: '測試基輔', summary: '測試', comparison: '測試', side: 'RU', kind: 'STRIKE', confidence: 'SINGLE_SOURCE',
    observedAt: new Date(Date.now() - 3600_000).toISOString(), place: { name: 'Kyiv', admin: 'Kyiv City' },
    sources: [{ url: 'https://example.com/a', publisher: '測試', sourceClass: 'OFFICIAL', publishedAt: new Date().toISOString() }] };
  const r = await bm.mapEventLayers('ukraine_front', sector, wide, Date.now(), { geocodeImpl, mapEvents: [ev] }, sector);
  assert.strictEqual(r.points.length, 0, 'Kyiv is outside the Lyman sector and must not be drawn there');
  assert.deepStrictEqual(calls[0], ['Kyiv, Kyiv City', wide]);
});

test('cloud-free satellite mosaic is the default basemap; terrain only on request', async () => {
  const bm = require('../src/battle_map');
  const seen = [];
  const fetchImpl = async url => { seen.push(url); return { ok: false, status: 404 }; };
  await bm.loadTiles([120.0, 22.0, 120.01, 22.01], async b => b, fetchImpl, 256, 256);
  assert.ok(seen.some(u => /s2cloudless/.test(u)) && seen.some(u => /overlay_bright/.test(u)), seen.join('\n'));
  seen.length = 0;
  await bm.loadTiles([120.0, 22.0, 120.01, 22.01], async b => b, fetchImpl, 256, 256, 'terrain');
  assert.ok(seen.length && seen.every(u => /terrain-light|overlay_3857/.test(u)), seen.join('\n'));
});

test('SCL fractions count cloud, shadow, cirrus and nodata as obscured', () => {
  const { sclFractions } = require('../src/satellite_crop');
  const s = sclFractions([4, 4, 5, 6, 8, 9, 3, 10, 0, 1]);
  assert.strictEqual(s.clear, 0.4); assert.strictEqual(s.cloud, 0.2); assert.strictEqual(s.shadow, 0.1); assert.strictEqual(s.cirrus, 0.1); assert.strictEqual(s.nodata, 0.2);
  assert.throws(() => sclFractions([]));
});

test('crop is usable only when SCL clear >= 90%, or pixel-only clear >= 85%', () => {
  const { usableStats } = require('../src/satellite_compare');
  // 蘇瓦烏基案例：像素法 76% 可見（抓不到雲影），SCL 只有 25% → 不可用
  assert.strictEqual(usableStats({ clear: 0.765, scl: { clear: 0.25 } }), false);
  assert.strictEqual(usableStats({ clear: 0.9, scl: { clear: 0.85 } }), false, 'SCL 85% is not enough (scattered cumulus is under-counted)');
  assert.strictEqual(usableStats({ clear: 0.9, scl: { clear: 0.95 } }), true);
  assert.strictEqual(usableStats({ clear: 0.8 }), false);
  assert.strictEqual(usableStats({ clear: 0.9 }), true);
  assert.strictEqual(usableStats(null), false);
});

test('comparisonPairs uses SCL and skips cloudy crops; fallback latest image must be cloud-checked', async () => {
  const C = require('../src/satellite_compare');
  const fs = require('fs'), os = require('os'), path = require('path');
  const statsFile = path.join(os.tmpdir(), `scl-test-${process.pid}.json`);
  const mk = (id, day, sha) => ({ verified: true, kind: 'SOURCE_AOI_CROP', region: 'suwalki', productId: id, acquiredAt: `2026-10-${day}T09:00:00Z`, sha256: sha, imageUrl: '/images/sentinel/x.webp', cropBbox: [1, 2, 3, 4], tile: '34UFE', outputSize: [1024, 576] });
  const assets = [mk('S2A_34UFE_20261014_0_L2A', 14, 'a'), mk('S2A_34UFE_20261008_0_L2A', '08', 'b')];
  fs.writeFileSync(statsFile, JSON.stringify({ a: { width: 1024, height: 576, clear: 0.77, method: 'pixel-rgb-v1' }, b: { width: 1024, height: 576, clear: 0.95, method: 'pixel-rgb-v1' } }));
  const sclImpl = async a => ({ clear: a.sha256 === 'a' ? 0.3 : 0.95, method: 's2-scl-v1' });
  try {
    const r = await C.comparisonPairs({ feed: { assets }, statsFile, sclImpl });
    const p = r.pairs[0];
    assert.strictEqual(p.available, false);
    assert.deepStrictEqual(p.images.map(i => i.usable), [false, true]);
    assert.strictEqual(JSON.parse(fs.readFileSync(statsFile, 'utf8')).a.scl.clear, 0.3, 'SCL result cached');
  } finally { fs.rmSync(statsFile, { force: true }); }
});

test('beat briefs accept up to 4 places; bad places are rejected', () => {
  const { checkItem } = require('./site_beats');
  const base = { id: 'mil-taiwan-20261016', date: '2026-10-16', theater: 'taiwan_strait', beat: 'MIL', title: '共軍演訓測試標題', points: ['第一點的內容要夠長才合格', '第二點的內容要夠長才合格', '第三點的內容要夠長才合格'], sources: [{ publisher: '中央社', url: 'https://www.cna.com.tw/x' }] };
  assert.deepStrictEqual(checkItem({ ...base, places: [{ name: 'Kinmen', admin: 'Fujian', note: '海警船進入' }] }), []);
  assert.ok(checkItem({ ...base, places: [{ name: 'Kinmen', lat: 24.4 }] }).length, 'lat without lon/basis rejected');
  assert.ok(checkItem({ ...base, places: Array(5).fill({ name: 'X' }) }).length, 'more than 4 rejected');
  assert.ok(checkItem({ ...base, places: [{ name: 'Kinmen', note: '这是简体' }] }).length, 'simplified note rejected');
});

test('beat places are geocoded inside the theatre and drawn hollow; unmatched admin is dropped', async () => {
  const bm = require('../src/battle_map');
  const beatMap = { taiwan_strait: { MIL: { beat: 'MIL', date: '2026-10-16', title: '金門海警船進入限制水域', places: [{ name: 'Kinmen', admin: 'Fujian', note: '海警船' }, { name: 'Nowhere' }] } } };
  const geocodeImpl = async q => (/^Kinmen/.test(q) ? { lat: 24.44, lon: 118.32, name: 'Kinmen County, Taiwan' } : null);
  const r = await bm.beatPlaceLayers('taiwan_strait', bm.MAPS.taiwan_strait.bbox, bm.MAPS.taiwan_strait.bbox, Date.parse('2026-10-16T12:00:00+08:00'), { geocodeImpl, beatMap });
  assert.strictEqual(r.count, 1);
  assert.strictEqual(r.points[0].hollow, true);
  assert.match(r.points[0].label, /^海警船 10\/16/);
});

test('perspective without any brief or event is omitted instead of an empty box', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, 'site_command.js'), 'utf8');
  assert.ok(src.includes("if (!ev) return '';"));
  assert.ok(!src.includes('近期沒有整理或經確認的事件</p>\'}'));
});
