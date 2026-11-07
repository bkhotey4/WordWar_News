// 中國政治與經濟研究稿的格式檢查：
//   node scripts/check_cn_politics_brief.js [檔案]   每週稿（YYYY-Www.json）或長期分析（YYYY-Qn.json），依檔名判斷
// 不給檔案時檢查每週稿最新一份。不合格以代碼 1 結束並列出原因；不修改檔案。
const fs = require('fs');
const path = require('path');
const { checkBrief, checkAnalysis, latestBriefFile, DIR } = require('../src/cn_politics_brief');

const file = process.argv[2] ? path.resolve(process.argv[2]) : latestBriefFile();
if (!file || !fs.existsSync(file)) { console.error(`找不到研究稿：${file || DIR}`); process.exit(1); }
let doc;
try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`JSON 無法讀取：${e.message}`); process.exit(1); }
const isAnalysis = /-Q[1-4]\.json$/.test(file);
const errors = (isAnalysis ? checkAnalysis : checkBrief)(doc);
if (errors.length) { console.error(`不合格 ${errors.length} 項（${path.basename(file)}）：\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`合格：${path.basename(file)}（${isAnalysis ? '長期分析' : '每週稿'}），${doc.sources.length} 個來源，${Object.keys(doc.sections).length} 節`);
