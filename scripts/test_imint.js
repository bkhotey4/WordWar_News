const test = require('node:test');
const assert = require('node:assert');
const IM = require('./site_imint');
const good = (o = {}) => ({ region: 'longtian', beforeProductId: 'S2B_50RQP_20261004_0_L2A', afterProductId: 'S2C_50RQP_20261009_0_L2A', reviewedAt: '2026-10-10T14:30:00.000Z',
  visible: '兩期都可辨識機場跑道與港區。', change: '潮汐與雲影造成差異。', assessment: '未見可辨識的新建工程或大面積異常。', limitations: '10 公尺解析度無法辨識個別機型。', confidence: '中', ...o });
test('合格判讀通過', () => assert.deepStrictEqual(IM.checkReview(good()), []));
test('錯誤欄位被擋下', () => {
  assert.ok(IM.checkReview(good({ region: 'xx' })).length);
  assert.ok(IM.checkReview(good({ afterProductId: 'abc' })).length);
  assert.ok(IM.checkReview(good({ confidence: '很高' })).length);
  assert.ok(IM.checkReview(good({ assessment: '这个' })).length);
});
test('判讀只套用在同一組前後期影像', () => {
  const pair = { region: 'longtian', before: { productId: 'S2B_50RQP_20261004_0_L2A' }, after: { productId: 'S2C_50RQP_20261009_0_L2A' } };
  assert.ok(IM.reviewFor(pair, [good()]));
  assert.strictEqual(IM.reviewFor({ ...pair, after: { productId: 'S2A_50RQP_20261012_0_L2A' } }, [good()]), null);
});
test('面板：無判讀時顯示待判讀、有判讀時顯示信心', () => {
  const h = { esc: s => String(s) };
  const p = { region: 'longtian', name: '龍田', focus: '跑道', available: true, gapDays: 5, before: { img: 'a.webp', acquiredAt: '2026-10-04T00:00:00Z', crop: { clear: 0.9 } }, after: { img: 'b.webp', acquiredAt: '2026-10-09T00:00:00Z', crop: { clear: 0.9 } }, diff: { img: 'd.png', changedShare: 0.018 } };
  assert.ok(IM.panelHtml({ ...p, review: null }, h).includes('尚待判讀'));
  assert.ok(IM.panelHtml({ ...p, review: good() }, h).includes('信心'));
  assert.ok(IM.panelHtml({ region: 'x', name: 'x', focus: 'y', available: false, reason: '雲遮' }, h).includes('無法比對'));
});
