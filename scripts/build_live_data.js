// 公開站「每小時數據」：只更新 public_site/live.json（各戰區燈號、觸發指標、官方與量測數據），不重畫地圖與海報。
// 首頁（H 版）開啟時讀這個檔，比整頁（每天 08:40、20:40）更即時。
// 用法：node scripts/build_live_data.js [--push]   --push 時把目前 public_site/ 整包推上 GitHub（沿用整頁建置的推送方式）。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public_site');
const HOUR = 3600_000;
const LEVEL = { 1: ['#22c55e', '常態'], 2: ['#eab308', '升溫'], 3: ['#f97316', '高度警戒'], 4: ['#ef4444', '危機'] };
const ORDER = ['taiwan_strait', 'korea_peninsula', 'south_china_sea', 'iran_gulf', 'middle_east', 'europe_security', 'ukraine_front'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tpe = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 16).replace('T', ' ');
const shortName = n => String(n || '').split(/[（(，]|超過/)[0].trim();
const KIND = { OFFICIAL: '官方', PARTY: '交戰方', MEASURED: '量測', MEDIA: '媒體', RESEARCH: '研究' };

function liveData({ now = Date.now(), board } = {}) {
  const WB = require('../src/warning_board');
  const CMD = require('./site_command');
  board = board || WB.getWarningBoard(now);
  const theaters = ORDER.map(id => board.theaters.find(t => t.id === id)).filter(Boolean).map(t => {
    const [color, lname] = LEVEL[t.level] || ['#94a3b8', '無法判定'];
    const trig = t.triggered.map(i => ({ name: shortName(i.name), kind: WB.resultKind(i) }));
    return {
      id: t.id, name: t.name, level: t.level ?? null, levelName: (t.levelName || lname).replace(/（.*）/, ''), color, reason: t.reason,
      chipsHtml: trig.map(x => `<span><i class="kd k-${x.kind}">${KIND[x.kind] || ''}</i>${esc(x.name)}</span>`).join(''),
      dataHtml: CMD.dataBox(t, { esc, tpe })
    };
  });
  return { generatedAt: new Date(now).toISOString(), generatedTpe: tpe(now), ruleVersion: board.ruleVersion || null, theaters };
}

function writeLive(opts = {}) {
  const data = liveData(opts);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'live.json'), tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, file);
  return data;
}

module.exports = { liveData, writeLive };

if (require.main === module) {
  try {
    if (!fs.existsSync(path.join(OUT, 'index.html'))) throw new Error('public_site/ 還沒有整頁建置，請先跑 node scripts/build_public_site.js');
    const d = writeLive();
    console.log(`live.json：${d.theaters.length} 個戰區，${d.generatedTpe}（台北）`);
    if (process.argv.includes('--push')) console.log(`已推送：${require('./build_public_site').push()}`);
  } catch (e) { console.error(e.message); process.exit(1); }
}
