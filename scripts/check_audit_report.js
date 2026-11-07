// 雲端稽核排程寫完報告後執行：node scripts/check_audit_report.js research/audits/<日期>.json
const fs = require('fs');
const { checkAudit } = require('../src/audit_report');
const file = process.argv[2];
if (!file) { console.error('用法：node scripts/check_audit_report.js research/audits/<日期>.json'); process.exit(2); }
let a;
try { a = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`不合格：無法讀取 JSON（${e.message}）`); process.exit(1); }
const errors = checkAudit(a, file);
if (errors.length) { console.error(`不合格 ${errors.length} 項：\n- ${errors.join('\n- ')}`); process.exit(1); }
const n = s => a.findings.filter(f => f.severity === s).length;
console.log(`合格：${file} 比對 ${a.checked.length} 筆，問題 高 ${n('HIGH')}／中 ${n('MEDIUM')}／低 ${n('LOW')}`);
