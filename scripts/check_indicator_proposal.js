// 研究排程寫完提案後執行：node scripts/check_indicator_proposal.js research/indicator_proposals/pending/<id>.json
const fs = require('fs');
const path = require('path');
const { checkProposal } = require('../src/indicator_proposals');
const file = process.argv[2];
if (!file) { console.error('用法：node scripts/check_indicator_proposal.js <提案檔>'); process.exit(2); }
let p;
try { p = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`不合格：無法讀取 JSON（${e.message}）`); process.exit(1); }
const errors = checkProposal(p);
if (path.basename(file) !== `${p.id}.json`) errors.push(`檔名要是 ${p.id}.json`);
if (errors.length) { console.error(`不合格 ${errors.length} 項：\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`合格：${p.id}`);
process.exit(0);
