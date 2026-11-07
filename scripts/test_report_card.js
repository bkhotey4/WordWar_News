const test = require('node:test');
const assert = require('node:assert');
const rc = require('../src/report_card');
const core = require('../src/report_card_core');

// 假 Canvas：記錄文字位置，字寬以字級估算
function fakeCanvas(log) {
  return (w, h) => {
    let font = '20px x';
    const size = () => Number((font.match(/(\d+)px/) || [])[1] || 20);
    const ctx = new Proxy({
      measureText: t => ({ width: [...String(t)].length * size() }),
      fillText: (t, x, y) => log.push({ t: String(t), x, y, right: x + [...String(t)].length * size(), size: size() }),
      createLinearGradient: () => ({ addColorStop() {} })
    }, { get: (o, k) => k in o ? o[k] : () => {}, set: (o, k, v) => { if (k === 'font') font = v; return true; } });
    return { width: w, height: h, getContext: () => ctx };
  };
}
const report = {
  title: '嘉海科7事件後續：中方使館提出管轄主張，菲海巡反駁科研未獲同意', theater: 'taiwan_strait',
  asOf: '2026-09-29T17:01:53.000Z', generatedAt: '2026-09-29T23:32:43.407Z',
  sections: [
    { kind: 'REPORTED', label: '新進展', text: '短句。第二句補充內容比較長一點點。第三句。', evidence: ['a'] },
    { kind: 'ANALYSIS', label: '研判', text: '甲'.repeat(300) + '。', evidence: ['a', 'b'] },
    { kind: 'UNCERTAIN', label: '查核範圍', text: '沒有衛星證據。', evidence: ['b'] }
  ]
};
const refs = [{ id: 'a', url: 'https://www.gmanetwork.com/x', publisher: 'GMA News', publishedAt: '2026-09-29T17:01:53.000Z' },
  { id: 'b', url: 'https://www.dzrh.com.ph/y', publisher: 'DZRH', publishedAt: '2026-09-28T23:30:39.314Z' }];

test('first sentence is joined when too short and capped', () => {
  assert.equal(rc.firstSentences('短句。第二句補充內容比較長一點點。第三句。'), '短句。第二句補充內容比較長一點點。');
  assert.ok(rc.firstSentences('乙'.repeat(200)).length <= 90);
});

test('cardPoints take priority; location is validated', () => {
  assert.equal(rc.points({ ...report, cardPoints: [{ kind: 'REPORTED', label: 'x', text: 'y' }] }).length, 1);
  assert.equal(rc.points(report).length, 3);
  assert.ok(rc.validLocation({ lat: 20.8, lon: 121.8, label: 'Itbayat' }));
  assert.equal(rc.validLocation({ lat: 200, lon: 121.8, label: 'x' }), null);
  assert.equal(rc.validLocation({ lat: 20, lon: 121, label: '' }), null);
});

test('card data carries Taipei times, reference numbers and hosts', () => {
  const d = rc.cardData(report, refs);
  assert.equal(d.asOf, '9/30 01:01');
  assert.equal(d.theaterName, '台海');
  assert.equal(d.sections[1].refs, '[1][2]');
  assert.deepEqual(d.refs.map(r => r.host), ['gmanetwork.com', 'dzrh.com.ph']);
});

test('two slides, text stays inside the 1920 width, labels are drawn', () => {
  const log = [];
  const out = core.drawReportCards(fakeCanvas(log), rc.cardData(report, refs), null);
  assert.equal(out.slides.length, 2);
  assert.equal(out.truncated, false);
  for (const l of ['新進展', '研判', '查核範圍']) assert.ok(log.some(e => e.t.includes(l)), l);
  assert.ok(log.every(e => e.right <= core.W + 2), JSON.stringify(log.find(e => e.right > core.W + 2)));
  assert.ok(!log.some(e => /^[，。、；：]/.test(e.t)), '標點不應在行首');
});

test('very long reports are shortened instead of overflowing', () => {
  const log = [];
  const long = { ...report, sections: Array.from({ length: 5 }, (_, i) => ({ kind: 'ANALYSIS', label: `段${i}`, text: '丙'.repeat(700), evidence: ['a'] })) };
  const out = core.drawReportCards(fakeCanvas(log), rc.cardData(long, refs), null);
  assert.equal(out.truncated, true);
  assert.ok(log.filter(e => e.y > 0).every(e => e.y <= core.H));
});
