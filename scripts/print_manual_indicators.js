// 研究排程用：列出人工指標的紀錄狀態與待核可提案，挑「已過期、快過期、從沒紀錄」的去查。
const { manualCoverage, pendingProposals } = require('../src/indicator_proposals');
const pending = pendingProposals();
const rows = manualCoverage().sort((a, b) => (a.expiresInHours ?? -Infinity) - (b.expiresInHours ?? -Infinity));
for (const r of rows) {
  const state = r.expiresInHours === null ? '從沒有紀錄' : r.expiresInHours < 0 ? `已過期 ${-r.expiresInHours} 小時` : `剩 ${r.expiresInHours} 小時`;
  const last = r.lastObserved ? `｜最新紀錄 ${r.lastObserved.slice(0, 10)} ${r.lastTriggered ? '已觸發' : '未觸發'}` : '';
  const wait = pending.some(p => p.theater === r.theater && p.indicator === r.id) ? '｜已有待核可提案，不要重複' : '';
  console.log(`${r.theater}/${r.id}（${r.tier}）${r.name}：${state}${last}${wait}`);
}
console.log(`待核可提案 ${pending.length} 筆`);
process.exit(0);
