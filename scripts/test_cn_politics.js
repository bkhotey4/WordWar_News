// 中國政局：官方對台論調、軍方人事、行事曆；每週研究稿格式檢查；公開站頁面
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('../src/collectors/cn_politics');
const brief = require('../src/cn_politics_brief');
const HOUR = 3600_000, DAY = 24 * HOUR;
const now = Date.parse('2026-10-14T06:00:00Z');
const tmp = name => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ww-cnpol-')), name);

const TW_HTML = `<li class="list-item clearfix"><h2 class="list-item-title double-lines"><a href="https://www.taiwan.cn/xwzx/PoliticsNews/202610/t20261014_12817827.htm" target="_blank" title="民进党当局打着经贸的幌子谋求“台独”不会得逞">民进党当局…</a></h2><p class="list-item-desc"><a href="x"></a></p><p class="date">2026-10-14</p></li>
<li class="list-item"><h2 class="list-item-title double-lines"><a href="https://www.taiwan.cn/plzhx/plyzl/202610/t20261013_12817697.htm" target="_blank" title="两岸青年交流营在厦门开营 促进融合发展">两岸青年…</a></h2></li>
<li class="list-item"><h2 class="list-item-title double-lines"><a href="https://www.taiwan.cn/xwzx/PoliticsNews/202610/t20261014_12817837.htm" target="_blank" title="国际减灾日丨家庭防灾避险指南">减灾</a></h2><p class="date">2026-10-14</p></li>`;
const XH_HTML = `<div class="tit"><span><a href='https://www.news.cn/tw/20261011/c13f5ec7fb64405bacf496f1f8893f6d/c.html' target='_blank'>琼韵匠心跨海传情 海南非遗主题展在高雄圆满落幕</a></span></div>`;
const PLA_JW = `<div class="title"><a href="http://www.81.cn/jw_208551/16411543.html" target="_blank">国务院、中央军委公布《军用土地管理条例》</a> <a href="http://www.81.cn/yw_208727/16411444.html" target="_blank">全文</a></div>
<div class="title"><a href="http://www.81.cn/jw_208551/16500000.html" target="_blank">中央军委决定免去某战区司令员职务</a></div>`;
const PLA_ZQ = `<div class="list"><a href="http://www.81.cn/zq_208553/16600000.html">东部战区组织海空联合演训</a></div>`;

test('parsers: taiwan.cn (date from page or URL), Xinhua Taiwan (date from URL), 81.cn (no date); tone classes', () => {
  const tw = cp.parseTaiwanCn(TW_HTML);
  assert.equal(tw.length, 3); assert.equal(tw[0].publishedAt, '2026-10-14T04:00:00Z'); assert.equal(tw[1].publishedAt, '2026-10-13T04:00:00Z'); assert.equal(tw[1].title, '两岸青年交流营在厦门开营 促进融合发展');
  const xh = cp.parseXinhuaTw(XH_HTML); assert.equal(xh.length, 1); assert.equal(xh[0].publishedAt, '2026-10-11T04:00:00Z');
  const pla = cp.parse81(PLA_JW); assert.deepEqual(pla.map(p => p.title), ['国务院、中央军委公布《军用土地管理条例》', '中央军委决定免去某战区司令员职务']); assert.equal(pla[0].publishedAt, null);
  assert.equal(cp.toneOf('民进党当局打着经贸的幌子谋求“台独”不会得逞').cls, 'COERCE');
  assert.equal(cp.toneOf('两岸青年交流营在厦门开营 促进融合发展').cls, 'PEACE');
  assert.equal(cp.toneOf('国际减灾日丨家庭防灾避险指南'), null, 'not Taiwan-related');
});

test('collector: first-seen dates for 81.cn are kept; personnel detection; one failing source keeps the others', async () => {
  const file = tmp('cp.json');
  const fake = async url => { if (/news\.cn/.test(url)) return { ok: false, status: 503 }; return { ok: true, text: async () => /taiwan\.cn/.test(url) ? TW_HTML : /zq_/.test(url) ? PLA_ZQ : PLA_JW }; };
  const c = await cp.refreshCnPolitics({ force: true, file, fetchImpl: fake, now });
  assert.equal(c.status, 'PARTIAL'); assert.equal(c.sources.xinhua_tw.status, 'DEGRADED');
  const pla = Object.values(c.items).filter(i => /^pla_/.test(i.source));
  assert.equal(pla.length, 3);
  assert.ok(pla.every(i => i.publishedAt === new Date(now).toISOString() && i.dateBasis === 'FIRST_SEEN'));
  assert.deepEqual(Object.values(c.items).filter(i => i.personnel).map(i => i.title), ['中央军委决定免去某战区司令员职务']);
  const again = await cp.refreshCnPolitics({ force: true, file, fetchImpl: fake, now: now + 5 * DAY });
  assert.equal(Object.values(again.items).find(i => i.source === 'pla_jw').publishedAt, new Date(now).toISOString(), 'first-seen date is kept');
  const pr = cp.assessCnPolitics(again, 'PERSONNEL', now + 5 * DAY);
  assert.equal(pr.status, 'CLEAR'); assert.equal(pr.value, 1, 'one notice is below the 2-notice threshold');
  assert.equal(cp.toneSeries(again, now + 5 * DAY, 10).length, 10);
});

test('tone assessment: needs 30 days and 10 items; triggers when coercive share beats the 90-day P90', () => {
  const items = {};
  for (let d = 0; d < 95; d++) { const date = new Date(now - d * DAY).toISOString(); const n = d < 14 ? 3 : 1; for (let k = 0; k < n; k++) items[`c${d}-${k}`] = { source: 'taiwan_cn_politics', publisher: 'x', url: `https://www.taiwan.cn/c${d}-${k}`, title: '严惩“台独”分裂势力', publishedAt: date, tone: { cls: 'COERCE' } }; items[`p${d}`] = { source: 'taiwan_cn_politics', publisher: 'x', url: `https://www.taiwan.cn/p${d}`, title: '两岸融合发展', publishedAt: date, tone: { cls: 'PEACE' } }; }
  const cache = { lastSuccess: new Date(now).toISOString(), items };
  const r = cp.assessCnPolitics(cache, 'TONE', now);
  assert.equal(r.status, 'TRIGGERED'); assert.ok(r.value >= 70 && r.value <= 80, `share ${r.value}`); assert.ok(r.baseline.p90 <= 60); assert.match(r.summary, /不解讀意圖/);
  const few = { lastSuccess: new Date(now).toISOString(), items: Object.fromEntries(Object.entries(items).slice(0, 8)) };
  assert.match(cp.assessCnPolitics(few, 'TONE', now).summary, /累積中/);
  assert.equal(cp.assessCnPolitics({ ...cache, lastSuccess: new Date(now - 3 * DAY).toISOString() }, 'TONE', now), null);
  const series = cp.toneSeries(cache, now, 90);
  assert.equal(series.length, 90); assert.equal(series.at(-1).coerce, 3); assert.ok(series.at(-1).share14 > 0.7);
});

const GOOD = { week: '2026-W42', writtenAt: '2026-10-13T13:20:00Z', title: '五中全會前的人事與涉台口徑',
  summary: '本週中國軍方公布兩項人事變動，國台辦記者會延續「反獨促統」口徑但未提出新措施。與上週相比，涉台論調沒有明顯轉硬；軍委層級人事仍在調整，短期內更可能影響的是指揮體系的穩定而非行動意圖。下一個觀察點是五中全會的召開日期與公報中的涉台段落，以及下一次國台辦記者會是否公布新的懲戒名單。',
  sections: { personnel: { text: '中央軍委公布免去某戰區司令員職務，並任命新人選；這是今年第三次戰區主官異動，顯示指揮體系仍在調整。', sources: ['s1'] }, meetings: { text: '政治局會議公報強調「安全」與「鬥爭」，未直接提及台灣；五中全會日期尚未公布，本週沒有新的中央層級會議。', sources: ['s2'] }, taiwanTone: { text: '國台辦記者會重申「反獨促統」，用語與前兩週一致，沒有新增制裁或懲戒名單，也沒有新的對台經貿措施。', sources: ['s3'] }, capability: { text: '能力面：戰區主官更換後通常需要數月磨合；意圖面：官方口徑未見升級。兩者分開看，本週沒有指向近期行動的訊號。', sources: ['s1', 's3'] }, nextWatch: { text: '五中全會日期、十五五規劃建議的涉台與國防段落、下一次國台辦記者會，以及人大常委會是否公布新的軍職代表罷免。', sources: ['s2'] } },
  sources: [{ id: 's1', url: 'https://www.81.cn/jw/1.html', publisher: '中國軍網', title: '中央軍委決定', publishedAt: '2026-10-12T00:00:00Z', access: 'FULL' }, { id: 's2', url: 'https://www.gov.cn/x', publisher: '中國政府網', title: '政治局會議', publishedAt: '2026-10-10T00:00:00Z', access: 'FULL' }, { id: 's3', url: 'https://www.gwytb.gov.cn/x', publisher: '國台辦', title: '記者會輯錄', publishedAt: '2026-10-08T00:00:00Z', access: 'FULL' }],
  caveats: ['內政是慢變數，本稿不構成對軍事行動時間的預測。'] };

test('weekly brief checker: accepts a valid brief; rejects simplified characters, missing sources, probabilities, long quotes', () => {
  assert.deepEqual(brief.checkBrief(GOOD, Date.parse('2026-10-14T00:00:00Z')), []);
  assert.ok(brief.checkBrief({ ...GOOD, summary: GOOD.summary + ' 中国国防部表示' }, now).some(e => /簡體/.test(e)));
  assert.ok(brief.checkBrief({ ...GOOD, sections: { ...GOOD.sections, meetings: { text: GOOD.sections.meetings.text, sources: ['nope'] } } }, now).some(e => /不存在的來源/.test(e)));
  assert.ok(brief.checkBrief({ ...GOOD, caveats: ['三個月內開戰機率 20%'] }, now).some(e => /機率/.test(e)));
  assert.ok(brief.checkBrief({ ...GOOD, sources: [{ ...GOOD.sources[0], url: 'http://www.81.cn/x' }, ...GOOD.sources.slice(1)] }, now).some(e => /https/.test(e)));
  assert.ok(brief.checkBrief({ ...GOOD, caveats: ['「這是一段超過二十五個字的直接引用，用來測試檢查器會不會攔下來喔」'] }, now).some(e => /引用過長/.test(e)));
  assert.equal(brief.weekKey(Date.parse('2026-10-13T13:20:00Z')), '2026-W42');
  assert.equal(brief.weekKey(Date.parse('2026-01-01T00:00:00Z')), '2026-W01');
});

test('latestBrief/listBriefs: newest first, invalid files reported but not listed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-briefs-'));
  const at = Date.parse('2026-10-14T00:00:00Z');
  fs.writeFileSync(path.join(dir, '2026-W41.json'), JSON.stringify({ ...GOOD, week: '2026-W41' }));
  fs.writeFileSync(path.join(dir, '2026-W42.json'), JSON.stringify({ ...GOOD, summary: '太短' }));
  const r = brief.latestBrief(dir, at);
  assert.equal(r.file, '2026-W42.json'); assert.equal(r.valid, false);
  assert.deepEqual(brief.listBriefs(dir, at).map(b => b.week), ['2026-W41']);
  fs.unlinkSync(path.join(dir, '2026-W42.json'));
  assert.equal(brief.latestBrief(dir, at).brief.week, '2026-W41');
});

test('warning board exposes tone and personnel as Taiwan secondary indicators', () => {
  const { buildWarningBoard } = require('../src/warning_board');
  const items = {};
  for (let d = 1; d <= 3; d++) items[`u${d}`] = { source: 'pla_jw', publisher: '中國軍網「軍委」', url: `https://www.81.cn/jw/${d}.html`, title: '免去司令员职务', publishedAt: new Date(now - d * DAY).toISOString(), personnel: true, dateBasis: 'FIRST_SEEN' };
  const board = buildWarningBoard({ now, ledger: { entries: [] }, history: { snapshots: [] }, cnpol: { lastSuccess: new Date(now).toISOString(), items } });
  const tw = board.theaters.find(t => t.id === 'taiwan_strait');
  assert.equal(tw.indicators.find(i => i.id === 'tw_pla_personnel').status, 'TRIGGERED');
  assert.equal(tw.indicators.find(i => i.id === 'tw_party_tone').status, 'UNKNOWN', 'baseline accumulating → UNKNOWN with note');
});

test('public china page renders without JavaScript and includes the chart, headlines and calendar', () => {
  const site = require('./site_china');
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const link = (u, t) => `<a href="${esc(u)}">${esc(t)}</a>`;
  const tpe = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 16).replace('T', ' ');
  const md = iso => { const d = new Date(Date.parse(iso) + 8 * HOUR); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  const html = site.chinaPage({ esc, link, tpe, md, now });
  assert.match(html, /<svg class="cn-chart"/); assert.match(html, /政治行事曆/); assert.match(html, /解放軍建軍一百年/); assert.doesNotMatch(html, /<script/);
  const svg = site.toneChartSvg([{ date: '2026-10-13', coerce: 2, peace: 1, share14: 0.6 }, { date: '2026-10-14', coerce: 0, peace: 3, share14: 0.4 }], esc);
  assert.equal((svg.match(/<rect/g) || []).length, 3, 'one bar per non-zero class per day'); assert.match(svg, /<polyline/);
  assert.match(html, /中國政治與經濟/); assert.match(html, /長期分析（每季）/); assert.match(html, /人民幣與陸港股/);
});

test('weekly brief: the economy section is optional, but validated when present', () => {
  const at = Date.parse('2026-10-14T00:00:00Z');
  assert.deepEqual(brief.checkBrief(GOOD, at), [], 'older briefs without economy still pass');
  const withEcon = { ...GOOD, sections: { ...GOOD.sections, economy: { text: '商務部本週未公布新的對台貿易措施；國台辦懲戒名單新增一家公司，屬既有工具的延伸，未涉及關稅或 ECFA。', sources: ['s3'] } } };
  assert.deepEqual(brief.checkBrief(withEcon, at), []);
  assert.ok(brief.checkBrief({ ...withEcon, sections: { ...withEcon.sections, economy: { text: '太短', sources: ['s3'] } } }, at).some(e => /economy/.test(e)));
  assert.equal(brief.SECTIONS.economy, '經濟與對台經濟施壓');
});

const SRC = n => Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, url: `https://example.org/${i + 1}`, publisher: '國際貨幣基金', title: `報告第 ${i + 1} 號`, publishedAt: '2026-10-01T00:00:00Z', access: 'FULL' }));
const SEC = (s) => ({ facts: '官方公布第三季國內生產毛額年增百分之四點八，低於年初目標；地方政府專項債發行加速，土地出讓收入持續下滑，財政收支缺口擴大。', assessment: '成長放緩使財政空間收窄，但沒有證據顯示會因此提高或降低對台動武的意圖；影響主要在能力投資的優先順序。', sources: [s] });
const ANALYSIS = { quarter: '2026-Q4', writtenAt: '2026-10-15T13:00:00Z', title: '整肅、放緩與制裁防護：第四季中國政經',
  summary: '本季中國政治的主軸是軍方高層整肅延續，中央軍委只剩兩名成員，五中全會將決定是否增補。經濟方面成長放緩、地方財政吃緊，但出口與高科技製造仍具韌性。對台經濟施壓延續以懲戒名單與個別產品禁令為主，未見中止 ECFA 全部關稅減讓。制裁防護方面，外匯存底結構調整、減持美債與人民幣跨境支付擴張持續進行，屬長期趨勢而非短期行動訊號。整體判斷：能力面受整肅拖累，意圖面口徑未升級；下一季的觀察點是五中全會人事、明年兩會國防預算，以及對台懲戒名單是否擴大到新的產業。',
  sections: { power: SEC('s1'), economy: SEC('s2'), coercion: SEC('s3'), sanctionsProofing: SEC('s4'), taiwanImplications: SEC('s5') },
  indicators: [{ label: 'GDP 年增率', value: '4.8%', asOf: '2026-Q3', source: 's2' }, { label: '外匯存底', value: '3.3 兆美元', asOf: '2026-09', source: 's4' }],
  sources: SRC(6), caveats: ['經濟狀況與對外軍事行動的關係在學界證據不一致，本分析不構成行動時間的預測。'] };

test('long-term analysis checker: facts and assessment per section, indicators must cite sources', () => {
  const at = Date.parse('2026-10-16T00:00:00Z');
  assert.deepEqual(brief.checkAnalysis(ANALYSIS, at), []);
  assert.ok(brief.checkAnalysis({ ...ANALYSIS, sections: { ...ANALYSIS.sections, coercion: { ...SEC('s3'), assessment: '' } } }, at).some(e => /coercion assessment/.test(e)));
  assert.ok(brief.checkAnalysis({ ...ANALYSIS, indicators: [{ label: 'GDP', value: '5%', asOf: '2026-Q3', source: 'nope' }] }, at).some(e => /indicators\[0\]/.test(e)));
  assert.ok(brief.checkAnalysis({ ...ANALYSIS, sources: SRC(3) }, at).some(e => /6～40/.test(e)), 'needs at least 6 sources');
  assert.ok(brief.checkAnalysis({ ...ANALYSIS, quarter: '2026-Q5' }, at).some(e => /quarter/.test(e)));
  assert.equal(brief.quarterKey(Date.parse('2026-10-15T00:00:00Z')), '2026-Q4');
});

test('latestAnalysis falls back to the previous valid quarter and reports why the newest is hidden', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-pe-'));
  const at = Date.parse('2026-10-16T00:00:00Z');
  assert.equal(brief.latestAnalysis(dir, at), null);
  fs.writeFileSync(path.join(dir, '2026-Q3.json'), JSON.stringify({ ...ANALYSIS, quarter: '2026-Q3' }));
  fs.writeFileSync(path.join(dir, '2026-Q4.json'), JSON.stringify({ ...ANALYSIS, summary: '太短' }));
  const r = brief.latestAnalysis(dir, at);
  assert.equal(r.newestFile, '2026-Q4.json'); assert.equal(r.newestValid, false); assert.equal(r.analysis.quarter, '2026-Q3');
});

test('China market quotes stay off the homepage table and out of warning indicators', () => {
  const M = require('../src/collectors/markets');
  const q = (sym, extra = {}) => ({ sym, name: sym, status: 'ANOMALY', last: 7.3, prev: 7.2, pct: 2, pct5: 1, z: 4, dp: 2, dir: 1, reasons: ['x'], url: 'https://finance.yahoo.com/', date: new Date(now).toISOString(), points: [], ...extra });
  const cache = { lastSuccess: new Date(now).toISOString(), quotes: [q('^TWII', { theater: 'taiwan_strait', dir: -1, pct: -5 }), q('CNY=X', { theater: 'china', context: true, panel: 'china' })] };
  const esc = s => String(s);
  assert.doesNotMatch(M.marketPanel(cache, esc), /CNY=X/); assert.match(M.marketPanel(cache, esc), /\^TWII/);
  assert.match(M.marketPanel(cache, esc, { panel: 'china' }), /CNY=X/); assert.doesNotMatch(M.marketPanel(cache, esc, { panel: 'china' }), /\^TWII/);
  assert.ok(M.INSTRUMENTS.filter(i => i.panel === 'china').every(i => i.context), 'China quotes never feed the warning board');
});

test('Taiwan band box links to the China page when a brief exists', () => {
  const site = require('./site_china');
  const html = site.chinaBox({ esc: s => String(s), now: Date.parse('2026-10-16T00:00:00Z') });
  if (brief.listBriefs(undefined, Date.parse('2026-10-16T00:00:00Z')).length) { assert.match(html, /china\.html/); assert.match(html, /中國政治與經濟/); }
  else assert.equal(html, '');
});
