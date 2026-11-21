// 研究排程寫完升級判定後執行：node scripts/check_level_outcome.js research/level_outcomes/<升級編號>.json
const fs = require('fs');
const path = require('path');
const { checkOutcome, episodes } = require('../src/level_scoring');
const file = process.argv[2];
if (!file) { console.error('用法：node scripts/check_level_outcome.js <判定檔>'); process.exit(2); }
let o;
try { o = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`不合格：無法讀取 JSON（${e.message}）`); process.exit(1); }
const history = JSON.parse(fs.readFileSync(path.join(__dirname, '../research/warning_history.json'), 'utf8'));
const errors = checkOutcome(o, new Set(episodes(history).map(e => e.id)));
if (path.basename(file) !== `${o.episodeId}.json`) errors.push(`檔名要是 ${o.episodeId}.json`);
if (errors.length) { console.error(`不合格 ${errors.length} 項：\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`合格：${o.episodeId} ${o.outcome}`);
