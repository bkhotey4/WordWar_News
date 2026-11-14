// 研究排程改完兵力估計後執行：node scripts/check_force_estimates.js
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '../research/force_estimates.json');
const CLASSES = new Set(['OFFICIAL', 'INDEPENDENT_MEDIA', 'EXTERNAL_ASSESSMENT', 'PARTY_CLAIM']);
let j;
try { j = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { console.error(`不合格：無法讀取 JSON（${e.message}）`); process.exit(1); }
const errors = [], ids = new Set();
for (const [i, e] of (j.estimates || []).entries()) {
  const at = e?.id || `第 ${i + 1} 筆`;
  if (!/^[a-z0-9-]{1,80}$/.test(e?.id || '')) errors.push(`${at}：id 格式不對`);
  if (ids.has(e?.id)) errors.push(`${at}：id 重複`);
  ids.add(e?.id);
  for (const k of ['theater', 'side', 'label', 'value']) if (typeof e?.[k] !== 'string' || !e[k].trim()) errors.push(`${at}：缺 ${k}`);
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(e?.asOf || '') || Date.parse(e.asOf) > Date.now()) errors.push(`${at}：asOf 要是過去的日期`);
  if (!/^https:\/\//.test(e?.source?.url || '') || !e?.source?.publisher || !CLASSES.has(e?.source?.sourceClass)) errors.push(`${at}：source 要有 https 網址、publisher 與 sourceClass`);
}
if (!j.estimates?.length) errors.push('estimates 是空的');
if (errors.length) { console.error(`不合格 ${errors.length} 項：\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`合格：${j.estimates.length} 筆兵力估計`);
