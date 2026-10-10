// 報導稿佇列：排程研究任務（在 Linux 環境，無法使用 SQLite）把查證後的稿件放進 research/drafts/pending/，
// 機器人在 Windows 上每輪巡檢自動「匯入來源 → 驗證發布 → 推播圖卡」，處理完移到 published/ 或 rejected/。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../research/drafts');
const DIRS = { pending: path.join(ROOT, 'pending'), published: path.join(ROOT, 'published'), rejected: path.join(ROOT, 'rejected') };
const THEATERS = new Set(['taiwan_strait', 'ukraine_front', 'middle_east', 'global', 'iran_gulf', 'europe_security', 'korea_peninsula', 'south_china_sea']);
const KINDS = new Set(['REPORTED', 'ANALYSIS', 'UNCERTAIN']);
const HOUR = 3600_000;
const httpsUrl = v => { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password && v.length <= 850; } catch { return false; } };
const str = (v, max, min = 1) => typeof v === 'string' && v.trim().length >= min && v.length <= max;

// 不需資料庫的結構檢查（排程任務在寫稿後執行）；真正發布時 research_reports 還會再完整驗證一次
function checkPackage(pkg, now = Date.now()) {
  const errors = [];
  const d = pkg?.draft, refs = pkg?.references;
  if (!d || typeof d !== 'object') return ['缺少 draft'];
  if (!Array.isArray(refs) || !refs.length || refs.length > 10) errors.push('references 需 1～10 筆');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(d.id || '')) errors.push('draft.id 只能用英數、底線、連字號');
  if (!str(d.title, 200)) errors.push('draft.title 必填、200 字內');
  if (!THEATERS.has(d.theater)) errors.push(`draft.theater 必須是 ${[...THEATERS].join('／')}`);
  if (/[图视软频为这们说开关发时会来对国过还进动]/.test(JSON.stringify(d))) errors.push('稿件含簡體字（例如 图、视、软），請改用臺灣繁體');
  const keys = new Set();
  for (const [i, r] of (refs || []).entries()) {
    const k = r?.key || `#${i}`;
    if (!str(r?.key, 40)) errors.push(`references[${i}].key 必填`);
    if (keys.has(r?.key)) errors.push(`references key 重複：${r?.key}`);
    keys.add(r?.key);
    if (!httpsUrl(r?.url)) errors.push(`${k}：url 必須是 https 且 850 字內`);
    if (!str(r?.title, 300)) errors.push(`${k}：title 必填`);
    if (!str(r?.publisher, 150)) errors.push(`${k}：publisher 必填`);
    if (!str(r?.originGroup, 80) || !str(r?.sourceType, 80)) errors.push(`${k}：originGroup、sourceType 必填`);
    if (!str(r?.body, 20000, 80)) errors.push(`${k}：body 至少 80 字（閱讀筆記要註明取得範圍）`);
    const t = Date.parse(r?.publishedAt);
    if (!Number.isFinite(t) || t > now) errors.push(`${k}：publishedAt 無效或在未來`);
  }
  const newest = Math.max(...(refs || []).map(r => Date.parse(r?.publishedAt)).filter(Number.isFinite));
  if (Number.isFinite(newest) && now - newest > 48 * HOUR) errors.push('最新來源超過 48 小時，報導會立即失效');
  if (!Array.isArray(d.sections) || !d.sections.length || d.sections.length > 5) errors.push('sections 需 1～5 段');
  const used = new Set();
  let size = 0;
  for (const [i, s] of (d.sections || []).entries()) {
    if (!KINDS.has(s?.kind)) errors.push(`sections[${i}].kind 必須是 REPORTED／ANALYSIS／UNCERTAIN`);
    if (!str(s?.label, 80)) errors.push(`sections[${i}].label 必填、80 字內`);
    if (!str(s?.text, 700)) errors.push(`sections[${i}].text 必填、700 字內`);
    if (!Array.isArray(s?.evidence) || !s.evidence.length || s.evidence.some(e => !keys.has(e))) errors.push(`sections[${i}].evidence 只能引用 references 的 key`);
    for (const e of s?.evidence || []) used.add(e);
    size += String(s?.label || '').length + String(s?.text || '').length + 8 + (s?.evidence || []).length * 5;
  }
  for (const k of keys) if (k && !used.has(k)) errors.push(`來源 ${k} 沒有被任何段落引用`);
  if (size > 4096) errors.push('全文過長（Discord 上限），請精簡');
  if (d.location !== undefined && !(d.location && Number.isFinite(d.location.lat) && Number.isFinite(d.location.lon) && str(d.location.label, 30))) errors.push('location 格式：{lat, lon, label(30 字內)}');
  if (d.cardPoints !== undefined && !(Array.isArray(d.cardPoints) && d.cardPoints.length <= 4 && d.cardPoints.every(p => KINDS.has(p?.kind) && str(p?.label, 30) && str(p?.text, 120)))) errors.push('cardPoints 最多 4 則 {kind, label(30 字內), text(120 字內)}');
  if (d.sourceIds || d.basis) errors.push('不要自己填 sourceIds／basis，由佇列自動產生');
  return errors;
}

function moveTo(dir, file, note) {
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, path.basename(file));
  fs.renameSync(file, dest);
  if (note) fs.writeFileSync(`${dest}.result.txt`, note);
  return dest;
}

// 匯入來源、發布稿件；成功回傳報導 id。deps 讓測試可替換
function publishPackage(pkg, deps = require('./research_reports')) {
  const errs = checkPackage(pkg);
  if (errs.length) throw new Error(errs.join('；'));
  const idOf = {};
  for (const r of pkg.references) {
    const { key, ...record } = r;
    idOf[key] = deps.importResearchReference(record).id;
  }
  const { draft } = pkg;
  const report = deps.publishResearchDraft({ ...draft, sections: draft.sections.map(s => ({ ...s, evidence: [...new Set(s.evidence.map(k => idOf[k]))] })),
    sourceIds: [...new Set(Object.values(idOf))] });
  return report.id;
}

async function processPendingDrafts(client, subscribers, { dirs = DIRS, deps, deliver } = {}) {
  let files = [];
  try { files = fs.readdirSync(dirs.pending).filter(f => f.endsWith('.json')).map(f => path.join(dirs.pending, f)).filter(f => Date.now() - fs.statSync(f).mtimeMs > 60_000); } catch { return []; }
  const results = [];
  for (const file of files.sort()) {
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { moveTo(dirs.rejected, file, `JSON 讀取失敗：${e.message}`); results.push({ file, status: 'REJECTED', error: e.message }); continue; }
    let id;
    try { id = publishPackage(pkg, deps); }
    catch (e) { moveTo(dirs.rejected, file, `發布失敗：${e.message}`); results.push({ file, status: 'REJECTED', error: e.message }); continue; }
    let sent = [];
    try {
      const fn = deliver || ((c, o) => require('./research_dispatch').deliverResearchReports(c, o));
      sent = await fn(client, { recipientIds: subscribers.map(s => s.userId), reportIds: [id] });
    } catch (e) { sent = [{ status: 'FAILED', error: e.message }]; }
    moveTo(dirs.published, file, `已發布 ${id}；推播：${JSON.stringify(sent).slice(0, 1500)}`);
    results.push({ file, status: 'PUBLISHED', id, delivery: sent.map(r => r.status) });
  }
  return results;
}

module.exports = { checkPackage, publishPackage, processPendingDrafts, DIRS };
