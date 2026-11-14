// 排程任務更新期刊導讀後執行：node scripts/check_journal_digest.js
const { readDigest, checkDigest, FILE } = require('./site_journals');
const d = readDigest();
const errors = checkDigest(d);
if (errors.length) { console.error(`不合格 ${errors.length} 項：\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`合格：${FILE} 共 ${d.items.length} 篇`);
