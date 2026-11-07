// 雲端「寫死數據與時效稽核」排程的報告格式（research/audits/<台北日期>.json）：檢查、讀取最新一份
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'research/audits');
const SEVERITIES = ['HIGH', 'MEDIUM', 'LOW'];
const CATEGORIES = ['HARDCODED', 'STALE', 'MISMATCH', 'LOGIC'];
const RESULTS = ['OK', 'MISMATCH', 'STALE', 'UNVERIFIED'];
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const https = v => typeof v === 'string' && /^https:\/\/\S+$/.test(v);

function checkAudit(a, file = '') {
  const errors = [];
  if (!a || typeof a !== 'object') return ['不是 JSON 物件'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) errors.push('date 要是 YYYY-MM-DD（台北日期）');
  else if (file && path.basename(file) !== `${a.date}.json`) errors.push(`檔名要是 ${a.date}.json`);
  if (!Date.parse(a.generatedAt)) errors.push('generatedAt 要是 ISO 時間');
  if (!str(a.summary, 1500) || a.summary.length < 60) errors.push('summary 要 60～1500 字');
  const checked = Array.isArray(a.checked) ? a.checked : [];
  if (checked.length < 8 || checked.length > 60) errors.push('checked 要 8～60 筆（實際比對過的資料點）');
  checked.forEach((c, i) => {
    const at = `checked[${i}]`;
    if (!str(c.item, 200)) errors.push(`${at}.item 必填（200 字內）`);
    if (!RESULTS.includes(c.result)) errors.push(`${at}.result 要是 ${RESULTS.join('/')}`);
    if (!str(c.siteValue, 500)) errors.push(`${at}.siteValue 必填：網站上顯示的內容`);
    if (c.result !== 'UNVERIFIED' && !https(c.sourceUrl)) errors.push(`${at}.sourceUrl 要是實際讀過的 https 原始來源`);
    if (c.result !== 'UNVERIFIED' && !str(c.sourceValue, 500)) errors.push(`${at}.sourceValue 必填：原始來源的內容`);
  });
  const findings = Array.isArray(a.findings) ? a.findings : null;
  if (!findings) errors.push('findings 要是陣列（沒有問題就給空陣列）');
  const ids = new Set();
  (findings || []).forEach((f, i) => {
    const at = `findings[${i}]`;
    if (!/^[a-z0-9-]{3,60}$/.test(f.id || '')) errors.push(`${at}.id 要是小寫英數與連字號（同一個問題每次用同一個 id）`);
    else if (ids.has(f.id)) errors.push(`${at}.id 重複`); else ids.add(f.id);
    if (!SEVERITIES.includes(f.severity)) errors.push(`${at}.severity 要是 ${SEVERITIES.join('/')}`);
    if (!CATEGORIES.includes(f.category)) errors.push(`${at}.category 要是 ${CATEGORIES.join('/')}`);
    for (const k of ['title', 'evidence', 'impact', 'suggestion']) if (!str(f[k], k === 'title' ? 120 : 800)) errors.push(`${at}.${k} 必填`);
    if (f.file != null && (!str(f.file, 200) || !fs.existsSync(path.join(ROOT, f.file)))) errors.push(`${at}.file 找不到：${f.file}`);
    if (f.firstSeen != null && !/^\d{4}-\d{2}-\d{2}$/.test(f.firstSeen)) errors.push(`${at}.firstSeen 要是 YYYY-MM-DD`);
  });
  if (a.unreachable != null && !Array.isArray(a.unreachable)) errors.push('unreachable 要是陣列');
  return errors;
}

// 最新一份通過格式檢查的報告（沒有就回傳 null）
function latestAudit(dir = DIR) {
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse(); } catch { return null; }
  for (const f of files) {
    try {
      const a = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!checkAudit(a, f).length) return a;
    } catch { /* 壞檔略過 */ }
  }
  return null;
}

module.exports = { checkAudit, latestAudit, DIR, SEVERITIES, CATEGORIES, RESULTS };
