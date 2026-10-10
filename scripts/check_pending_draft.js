// 排程研究任務寫完稿件後執行：node scripts/check_pending_draft.js research/drafts/pending/<檔名>.json
// 只做結構檢查（不需資料庫）；機器人發布時還會再完整驗證。
const fs = require('fs');
const { checkPackage } = require('../src/draft_queue');
const file = process.argv[2];
if (!file) { console.error('用法：node scripts/check_pending_draft.js <稿件.json>'); process.exit(1); }
let pkg;
try { pkg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`JSON 讀取失敗：${e.message}`); process.exit(1); }
const errors = checkPackage(pkg);
if (errors.length) { console.error(`不合格 ${errors.length} 項：\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`合格：${pkg.draft.id}（${pkg.references.length} 個來源、${pkg.draft.sections.length} 段）`);
