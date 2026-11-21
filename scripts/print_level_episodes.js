// 研究排程用：列出滿 14 天、還沒判定有沒有應驗的燈號升級。
const { unlabeled } = require('../src/level_scoring');
const history = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../research/warning_history.json'), 'utf8'));
const rows = unlabeled(history);
for (const e of rows.reverse()) console.log(`${e.id}｜${e.theater}｜${e.at.slice(0, 16)}Z 第 ${e.from}→${e.to} 級｜14 天內最高 ${e.peak} 級｜維持 ${e.heldHours} 小時｜當時指標：${(e.ind || ['未記錄']).join('、')}`);
console.log(`待判定 ${rows.length} 筆`);
