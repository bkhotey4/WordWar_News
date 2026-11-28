const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const B = require('./site_beats');

const good = (o = {}) => ({ id: 'pol-taiwan-20261009', date: '2026-10-09', theater: 'taiwan_strait', beat: 'POL', title: '立法院審國防特別預算',
  points: ['行政院提出的國防特別預算本週進入立法院審查。', '在野黨要求分年編列並強化監督。', '執政黨主張盡速通過以免交機延誤。', '美方官員公開表示關注預算進度。'],
  context: '這筆預算是近年規模最大的一次國防特別預算。', stances: [{ actor: '行政院', view: '希望本會期內通過。' }], outlook: '可能在委員會階段刪減部分項目。',
  watch: '下週委員會初審', actors: ['行政院', '立法院'], sources: [{ publisher: '中央社', url: 'https://www.cna.com.tw/' }], ...o });

test('合格項目通過檢查', () => assert.deepStrictEqual(B.checkItem(good()), []));
test('新條線與熱點戰區', () => {
  assert.deepStrictEqual(B.checkItem(good({ beat: 'CYBER' })), []);
  assert.deepStrictEqual(B.checkItem(good({ theater: 'myanmar', beat: 'SUM' })), []);
  assert.ok(B.checkItem(good({ beat: 'SUM' })).some(e => e.includes('SUM')));
  assert.ok(B.checkItem(good({ beat: 'XX' })).length);
});
test('格式錯誤會被擋下', () => {
  assert.ok(B.checkItem(good({ points: ['太短'] })).length);
  assert.ok(B.checkItem(good({ title: '这个标题' })).some(e => e.includes('簡體')));
  assert.ok(B.checkItem(good({ stances: [{ actor: '', view: 'x' }] })).length);
  assert.ok(B.checkItem(good({ sources: [{ publisher: 'x', url: 'http://x.org' }] })).length);
  assert.ok(B.checkItem(good({ context: '「' + '長'.repeat(30) + '」的引用' })).some(e => e.includes('引用')));
});
test('latestMap 取 3 天內最新，呈現含展開分析與熱點區', () => {
  const f = path.join(os.tmpdir(), `beats_${process.pid}.json`);
  fs.writeFileSync(f, JSON.stringify({ items: [good(), good({ id: 'old-item', date: '2026-10-01' }), good({ id: 'cyber-item', beat: 'CYBER' }), good({ id: 'myanmar-item', theater: 'myanmar', beat: 'SUM' })] }));
  const m = B.latestMap(Date.parse('2026-10-09T20:00:00+08:00'), f);
  fs.unlinkSync(f);
  assert.strictEqual(m.taiwan_strait.POL.id, 'pol-taiwan-20261009');
  const h = { esc: s => String(s) };
  const html = B.beatHtml(m.taiwan_strait.POL, h);
  assert.ok(html.includes('展開完整分析') && html.includes('各方立場') && html.includes('可能走向'));
  assert.ok(B.extraRow(m.taiwan_strait, h).includes('更多面向'));
  assert.ok(B.hotspotsHtml(m, h).includes('緬甸'));
  assert.strictEqual(B.extraRow({}, h), '');
});
