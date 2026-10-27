'use strict';
// 中國政治與經濟的研究稿：讀寫與格式檢查。
//   每週稿：research/cn_politics_weekly/YYYY-Www.json（政治五節＋選填「經濟與對台經濟施壓」）
//   長期分析：research/cn_political_economy/YYYY-Qn.json（每季，分開寫已知事實與研判）
// 不合格的稿不展示。
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '../research/cn_politics_weekly');
const PE_DIR = path.join(__dirname, '../research/cn_political_economy');
// 每週稿章節；economy 為選填（2026-W43 起排程會寫），舊稿沒有也合格
const SECTIONS = { personnel: '人事與整肅', meetings: '會議與路線', taiwanTone: '涉台論調', economy: '經濟與對台經濟施壓', capability: '對解放軍能力與意圖的影響', nextWatch: '下一個觀察點' };
const OPTIONAL_SECTIONS = new Set(['economy']);
// 長期分析章節：每節分「已知事實」與「研判」
const PE_SECTIONS = { power: '權力結構與軍方整肅', economy: '經濟成長與結構壓力', coercion: '對台經濟施壓工具與歷次使用', sanctionsProofing: '制裁防護準備（戰略儲備、外匯與美債、人民幣跨境支付）', taiwanImplications: '對台海的意義' };
const ACCESS = new Set(['FULL', 'PARTIAL', 'ABSTRACT']);
// 常見且不與繁體同形的簡體字；出現即視為未轉成台灣繁體
const SIMPLIFIED_RE = /[国发会这为对时产东业术据义关军党统战经认识让们与说话应该问题经济发展强际结构开办务实报节点难题]/;

const bounded = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const httpsUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } };

// 共用：來源清單（回傳 id 集合）
function checkSources(list, errors, now, { min = 3, max = 25 } = {}) {
  const ids = new Set();
  if (!Array.isArray(list) || list.length < min || list.length > max) { errors.push(`sources 需 ${min}～${max} 筆`); return ids; }
  for (const s of list) {
    if (!/^[a-z0-9-]{2,40}$/.test(s?.id || '')) errors.push(`來源 id 無效：${s?.id}`);
    else if (ids.has(s.id)) errors.push(`來源 id 重複：${s.id}`); else ids.add(s.id);
    if (!httpsUrl(s?.url)) errors.push(`來源 ${s?.id} 需 https 網址`);
    if (!bounded(s?.publisher, 2, 80)) errors.push(`來源 ${s?.id} 缺 publisher`);
    if (!bounded(s?.title, 4, 200)) errors.push(`來源 ${s?.id} 缺 title`);
    if (!Number.isFinite(Date.parse(s?.publishedAt)) || Date.parse(s.publishedAt) > now + 3600_000) errors.push(`來源 ${s?.id} publishedAt 無效`);
    if (!ACCESS.has(s?.access)) errors.push(`來源 ${s?.id} access 須為 FULL/PARTIAL/ABSTRACT`);
  }
  return ids;
}
const checkRefs = (key, refs, ids, errors) => {
  if (!Array.isArray(refs) || !refs.length) errors.push(`${key} 需至少 1 個來源 id`);
  else for (const id of refs) if (!ids.has(id)) errors.push(`${key} 引用不存在的來源 ${id}`);
};
// 共用：全文用語（台灣繁體、引用長度、不寫機率或時間預測）
function checkText(text, errors) {
  const simp = text.match(SIMPLIFIED_RE);
  if (simp) errors.push(`疑似簡體字「${simp[0]}」，全文須為台灣繁體（直接引用請用「」並限 25 字內）`);
  for (const q of text.match(/「[^」]*」/g) || []) if (q.length > 27) errors.push(`直接引用過長（${q.slice(0, 12)}…），請改寫成自己的話`);
  if (/(機率|概率|可能性|勝率)\s*[:：為是約]?\s*\d{1,3}\s*%|\d{1,3}\s*%\s*的?\s*(機率|概率|可能性|勝率)|幾天內(開戰|攻台|動武)|\d+\s*(天|週|個月|年)內(開戰|攻台|動武|進攻)/.test(text)) errors.push('不得寫開戰機率或時間預測');
}

function checkBrief(b, now = Date.now()) {
  const errors = [];
  if (!b || typeof b !== 'object') return ['不是物件'];
  if (!/^\d{4}-W\d{2}$/.test(b.week || '')) errors.push('week 須為 YYYY-Www');
  if (!Number.isFinite(Date.parse(b.writtenAt)) || Date.parse(b.writtenAt) > now + 3600_000) errors.push('writtenAt 無效或在未來');
  if (!bounded(b.title, 8, 80)) errors.push('title 8～80 字');
  if (!bounded(b.summary, 120, 800)) errors.push('summary 120～800 字');
  const ids = checkSources(b.sources, errors, now);
  if (!b.sections || typeof b.sections !== 'object') errors.push('缺 sections');
  else for (const [key, label] of Object.entries(SECTIONS)) {
    const sec = b.sections[key];
    if (!sec) { if (!OPTIONAL_SECTIONS.has(key)) errors.push(`缺章節 ${key}（${label}）`); continue; }
    if (!bounded(sec.text, 40, 1200)) errors.push(`${key} text 40～1200 字`);
    checkRefs(key, sec.sources, ids, errors);
  }
  if (!Array.isArray(b.caveats) || !b.caveats.length) errors.push('caveats 需至少 1 條（例如：內政為慢變數、不構成預測）');
  checkText([b.title, b.summary, ...Object.values(b.sections || {}).map(s => s?.text || ''), ...(b.caveats || [])].join('\n'), errors);
  return errors;
}

// 長期分析：quarter、title、summary、五節（facts＋assessment＋sources）、選填 indicators、caveats
function checkAnalysis(a, now = Date.now()) {
  const errors = [];
  if (!a || typeof a !== 'object') return ['不是物件'];
  if (!/^\d{4}-Q[1-4]$/.test(a.quarter || '')) errors.push('quarter 須為 YYYY-Qn');
  if (!Number.isFinite(Date.parse(a.writtenAt)) || Date.parse(a.writtenAt) > now + 3600_000) errors.push('writtenAt 無效或在未來');
  if (!bounded(a.title, 8, 80)) errors.push('title 8～80 字');
  if (!bounded(a.summary, 200, 1200)) errors.push('summary 200～1200 字');
  const ids = checkSources(a.sources, errors, now, { min: 6, max: 40 });
  if (!a.sections || typeof a.sections !== 'object') errors.push('缺 sections');
  else for (const [key, label] of Object.entries(PE_SECTIONS)) {
    const sec = a.sections[key];
    if (!sec) { errors.push(`缺章節 ${key}（${label}）`); continue; }
    if (!bounded(sec.facts, 60, 1500)) errors.push(`${key} facts（已知事實）60～1500 字`);
    if (!bounded(sec.assessment, 40, 1000)) errors.push(`${key} assessment（研判）40～1000 字`);
    checkRefs(key, sec.sources, ids, errors);
  }
  if (a.indicators !== undefined) {
    if (!Array.isArray(a.indicators) || a.indicators.length > 12) errors.push('indicators 最多 12 筆');
    else for (const [i, ind] of a.indicators.entries()) {
      if (!bounded(ind?.label, 2, 40) || !bounded(ind?.value, 1, 40)) errors.push(`indicators[${i}] 需 label 與 value`);
      if (!/^\d{4}(-\d{2}){0,2}$|^\d{4}-Q[1-4]$/.test(ind?.asOf || '')) errors.push(`indicators[${i}] asOf 須為日期或季度`);
      if (!ids.has(ind?.source)) errors.push(`indicators[${i}] 引用不存在的來源 ${ind?.source}`);
    }
  }
  if (!Array.isArray(a.caveats) || !a.caveats.length) errors.push('caveats 需至少 1 條');
  checkText([a.title, a.summary, ...Object.values(a.sections || {}).flatMap(s => [s?.facts || '', s?.assessment || '']), ...(a.indicators || []).map(i => `${i.label}${i.value}`), ...(a.caveats || [])].join('\n'), errors);
  return errors;
}

function readJsonChecked(file, check, now) {
  try { const b = JSON.parse(fs.readFileSync(file, 'utf8')); const errors = check(b, now); return errors.length ? { file: path.basename(file), valid: false, errors } : { file: path.basename(file), valid: true, brief: b }; }
  catch (e) { return { file: path.basename(file), valid: false, errors: [e.message] }; }
}
const listFiles = (dir, re) => { try { return fs.readdirSync(dir).filter(f => re.test(f)).sort().reverse().map(f => path.join(dir, f)); } catch { return []; } };
const WEEK_RE = /^\d{4}-W\d{2}\.json$/, QUARTER_RE = /^\d{4}-Q[1-4]\.json$/;

function readBrief(file, now = Date.now()) { return readJsonChecked(file, checkBrief, now); }
function latestBriefFile(dir = DIR) { return listFiles(dir, WEEK_RE)[0] || null; }
// 最新一份（不論合格與否，讓頁面能說明為何不展示）
function latestBrief(dir = DIR, now = Date.now()) { const f = latestBriefFile(dir); return f ? { ...readBrief(f, now), sectionLabels: SECTIONS } : null; }
// 往期：只列合格的
function listBriefs(dir = DIR, now = Date.now()) { return listFiles(dir, WEEK_RE).map(f => readBrief(f, now)).filter(r => r.valid).map(r => r.brief); }

function latestAnalysisFile(dir = PE_DIR) { return listFiles(dir, QUARTER_RE)[0] || null; }
// 長期分析：最新一份的狀態，以及最新一份「合格」的內容（最新不合格時退回上一份）
function latestAnalysis(dir = PE_DIR, now = Date.now()) {
  const files = listFiles(dir, QUARTER_RE);
  if (!files.length) return null;
  const newest = readJsonChecked(files[0], checkAnalysis, now);
  const valid = newest.valid ? newest : files.slice(1).map(f => readJsonChecked(f, checkAnalysis, now)).find(r => r.valid) || null;
  return { newestFile: newest.file, newestValid: newest.valid, newestErrors: newest.errors || [], analysis: valid?.brief || null, sectionLabels: PE_SECTIONS };
}

// ISO 週：YYYY-Www（台北時間）
function weekKey(now = Date.now()) {
  const d = new Date(now + 8 * 3600_000); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); const week = 1 + Math.round(((d - firstThu) / 86400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function quarterKey(now = Date.now()) { const d = new Date(now + 8 * 3600_000); return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`; }

module.exports = { checkBrief, checkAnalysis, readBrief, latestBrief, latestBriefFile, listBriefs, latestAnalysis, latestAnalysisFile, weekKey, quarterKey, DIR, PE_DIR, SECTIONS, PE_SECTIONS };
