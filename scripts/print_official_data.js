// 研究排程用：印出某戰區目前的「官方與量測數據」（政府原文、交易所、儀器、雷達衛星船舶偵測），供撰稿時和新聞交叉比對。
// 用法：node scripts/print_official_data.js [theater]   例：node scripts/print_official_data.js taiwan_strait
// 只讀本機快取，不連網；不印出任何金鑰。
const WB = require('../src/warning_board');

function lines(theaterId, now = Date.now()) {
  const board = WB.getWarningBoard(now);
  const t = board.theaters.find(x => x.id === theaterId);
  if (!t) throw new Error(`未知戰區：${theaterId}（可用：${board.theaters.map(x => x.id).join('、')}）`);
  const out = [`【${t.name}】預警第 ${t.level ?? '—'} 級 ${t.levelName}｜${t.reason}`];
  for (const i of t.indicators) {
    const kind = WB.resultKind(i);
    if (!['OFFICIAL', 'PARTY', 'MEASURED'].includes(kind)) continue;
    const st = { TRIGGERED: '觸發', CLEAR: '正常', UNKNOWN: '無資料' }[i.status] || i.status;
    const src = (i.sources || [])[0];
    out.push(`- [${WB.KIND_LABEL[kind]}｜${st}] ${i.name}：${i.summary || ''}${i.observedAt ? `（${i.observedAt}）` : ''}${src?.url ? ` ${src.url}` : ''}`);
  }
  return out;
}

module.exports = { lines };

if (require.main === module) {
  try { console.log(lines(process.argv[2] || 'taiwan_strait').join('\n')); }
  catch (e) { console.error(e.message); process.exit(1); }
}
