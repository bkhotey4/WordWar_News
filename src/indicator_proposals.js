// 人工指標自動更新：雲端研究排程把查到的事實寫成提案（research/indicator_proposals/pending/），
// 巡檢檢查格式合格就自動寫進 research/warning_indicators.json（站主 2026-11-10 決定不再逐筆按採納），並私訊通知。
// 自動採納的紀錄標 autoAdopted、reviewed: false（沒有人看過）；等級仍只由規則計算，交戰方說法照規則不能單獨升到第 3 級。
// 通知附「撤銷」按鈕，由本機機器人處理；撤銷會把紀錄從檔案移除，下一輪巡檢燈號跟著改。
const fs = require('fs');
const path = require('path');
const { THEATERS, validEntry } = require('./warning_board');

const ROOT = path.join(__dirname, '..');
const LEDGER = path.join(ROOT, 'research/warning_indicators.json');
const BASE = path.join(ROOT, 'research/indicator_proposals');
const dirs = (base = BASE) => ({ pending: path.join(base, 'pending'), resolved: path.join(base, 'resolved') });
const MAX_PER_ROUND = 5;
const DEFAULT_VALID_HOURS = 168;
const CLASS_NAMES = { OFFICIAL: '官方', INDEPENDENT_MEDIA: '獨立媒體', EXTERNAL_ASSESSMENT: '外部評估', PARTY_CLAIM: '交戰方聲稱' };
const TIER_NAMES = { PRIMARY: '主要', SECONDARY: '次要', DECISIVE: '決定性', DEESCALATION: '降溫' };

const readJson = (file, fb) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fb; } };
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

// 沒有自動來源、只能靠人工紀錄的指標
function manualIndicators() {
  return Object.entries(THEATERS).flatMap(([theater, t]) => t.indicators.filter(i => !i.auto).map(i => ({ theater, theaterName: t.name, id: i.id, name: i.name, tier: i.tier })));
}
// 每個人工指標目前的紀錄狀態（給研究排程挑要查哪些）：expiresInHours 為負表示已過期，null 表示從沒有紀錄
function manualCoverage(ledger = readJson(LEDGER, { entries: [] }), now = Date.now()) {
  return manualIndicators().map(i => {
    const latest = (ledger.entries || []).filter(e => e.theater === i.theater && e.indicator === i.id && validEntry(e, now)).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
    if (!latest) return { ...i, expiresInHours: null, lastObserved: null, lastTriggered: null };
    const until = Date.parse(latest.observedAt) + (latest.validHours || DEFAULT_VALID_HOURS) * 3600_000;
    return { ...i, expiresInHours: Math.round((until - now) / 3600_000), lastObserved: latest.observedAt, lastTriggered: latest.triggered };
  });
}

function asEntry(p, now, auto = false) {
  const { kind, proposedAt, runner, sentAt, ...entry } = p;
  return auto ? { ...entry, reviewed: false, autoAdopted: true, reviewedAt: new Date(now).toISOString() } : { ...entry, reviewed: true, reviewedAt: new Date(now).toISOString() };
}
function checkProposal(p, now = Date.now()) {
  if (!p || typeof p !== 'object') return ['不是 JSON 物件'];
  const errors = [];
  if (!/^[a-z0-9_-]{1,80}$/.test(p.id || '')) errors.push('id 要是 80 字內的小寫英數、底線或連字號');
  if (!THEATERS[p.theater]) errors.push(`theater 不存在：${p.theater}`);
  if (p.kind === 'WATCH') {
    if (typeof p.text !== 'string' || p.text.length < 8 || p.text.length > 200) errors.push('text 要 8～200 字');
    return errors;
  }
  if (p.kind !== 'INDICATOR') return [...errors, 'kind 要是 INDICATOR 或 WATCH'];
  const def = manualIndicators().find(i => i.theater === p.theater && i.id === p.indicator);
  if (!def) errors.push(`${p.indicator} 不是人工指標（有自動來源的指標不能提案）`);
  else if (!validEntry(asEntry(p, now), now)) errors.push('紀錄不合格：triggered 要布林值、summary 300 字內、observedAt 不可在未來、sources 1～5 筆（https、publisher、sourceClass、publishedAt）、validHours 選填且最多 720');
  return errors;
}

const list = dir => { try { return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort(); } catch { return []; } };
const pendingProposals = (base = BASE) => list(dirs(base).pending).map(f => readJson(path.join(dirs(base).pending, f), null)).filter(Boolean);

function proposalMessage(p) {
  const theater = THEATERS[p.theater]?.name || p.theater;
  if (p.kind === 'WATCH') return `📝 **下一個觀察點提案**｜${theater}\n${p.text}`;
  const def = manualIndicators().find(i => i.theater === p.theater && i.id === p.indicator);
  const when = new Date(Date.parse(p.observedAt) + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  const src = p.sources.map(s => `• ${s.publisher}（${CLASS_NAMES[s.sourceClass] || s.sourceClass}）<${s.url}>`).join('\n');
  return `🧾 **預警指標提案**｜${theater}｜${def?.name || p.indicator}（${TIER_NAMES[def?.tier] || ''}指標）\n判定：**${p.triggered ? '已觸發' : '已查核、未觸發'}**｜時間 ${when}（台北）｜有效 ${p.validHours || DEFAULT_VALID_HOURS} 小時\n${p.summary}\n${src}`;
}
const buttons = id => [{ type: 1, components: [{ type: 2, style: 3, label: '✅ 採納', custom_id: `ww:prop:yes:${id}` }, { type: 2, style: 4, label: '❌ 駁回', custom_id: `ww:prop:no:${id}` }] }];
const undoButton = id => [{ type: 1, components: [{ type: 2, style: 2, label: '↩️ 撤銷', custom_id: `ww:prop:undo:${id}` }] }];

function adopt(p, ledgerFile, now, auto) {
  const ledger = readJson(ledgerFile, null);
  if (!ledger) return false;
  if (p.kind === 'WATCH') ledger.watch = { ...(ledger.watch || {}), [p.theater]: { text: p.text, updatedAt: new Date(now).toISOString(), ...(auto ? { autoAdopted: true, proposalId: p.id } : {}) } };
  else ledger.entries = [...(ledger.entries || []).filter(e => e.id !== p.id), asEntry(p, now, auto)];
  writeJson(ledgerFile, ledger);
  return true;
}

// 雲端巡檢呼叫：格式合格的提案直接採納並私訊通知（附撤銷按鈕）；格式不合的直接結案，已被本機結案的（同步時復活）清掉。
// 以前送出、還在等按鈕的提案也一併採納。私訊失敗不影響採納。
async function dispatchProposals(client, adminId, { base = BASE, ledgerFile = LEDGER, now = Date.now() } = {}) {
  const d = dirs(base);
  const out = { adopted: 0, invalid: 0, notified: 0 };
  let user = null;
  for (const f of list(d.pending)) {
    const file = path.join(d.pending, f);
    if (fs.existsSync(path.join(d.resolved, f))) { fs.unlinkSync(file); continue; }
    const p = readJson(file, null);
    const errors = checkProposal(p, now);
    if (errors.length) { writeJson(path.join(d.resolved, f), { ...(p || {}), decision: 'INVALID', errors, resolvedAt: new Date(now).toISOString() }); fs.unlinkSync(file); out.invalid++; continue; }
    if (!adopt(p, ledgerFile, now, true)) break; // 讀不到紀錄檔就留在佇列，下一輪再試
    writeJson(path.join(d.resolved, f), { ...p, decision: 'AUTO_ADOPTED', resolvedAt: new Date(now).toISOString() });
    fs.unlinkSync(file);
    out.adopted++;
    if (out.notified >= MAX_PER_ROUND || !client) continue;
    try {
      user = user || await client.users.fetch(adminId);
      await user.send({ content: `${proposalMessage(p)}
➡️ 已自動採納，下一輪巡檢反映在燈號；有錯可按撤銷。`.slice(0, 1900), components: undoButton(p.id), allowedMentions: { parse: [] } });
      out.notified++;
    } catch (e) { /* 通知失敗不影響採納 */ }
  }
  return out;
}

// 本機機器人呼叫：撤銷自動採納的提案
function revokeProposal(id, { base = BASE, ledgerFile = LEDGER, now = Date.now() } = {}) {
  const d = dirs(base), file = path.join(d.resolved, `${id}.json`);
  const p = readJson(file, null);
  if (!p) return '這筆提案還沒同步到本機，最多 10 分鐘後再按一次。';
  if (p.decision === 'REVOKED') return '這筆提案已經撤銷過了。';
  if (p.decision !== 'AUTO_ADOPTED') return '這筆提案不是自動採納的，沒有變更。';
  const ledger = readJson(ledgerFile, null);
  if (!ledger) return '讀不到預警紀錄檔，沒有變更。';
  if (p.kind === 'WATCH') { if (ledger.watch?.[p.theater]?.proposalId === p.id) delete ledger.watch[p.theater]; }
  else ledger.entries = (ledger.entries || []).filter(e => e.id !== p.id);
  writeJson(ledgerFile, ledger);
  writeJson(file, { ...p, decision: 'REVOKED', revokedAt: new Date(now).toISOString() });
  return '已撤銷，同步到雲端後的下一輪巡檢會反映在燈號。';
}

// 本機機器人呼叫：回傳給站主看的一句話
function resolveProposal(id, approve, { base = BASE, ledgerFile = LEDGER, now = Date.now() } = {}) {
  const d = dirs(base), f = `${id}.json`, file = path.join(d.pending, f);
  if (fs.existsSync(path.join(d.resolved, f))) return '這筆提案已經處理過了。';
  const p = readJson(file, null);
  if (!p) return '這筆提案還沒同步到本機，最多 10 分鐘後再按一次。';
  const errors = approve ? checkProposal(p, now) : [];
  if (errors.length) return `提案不合格，沒有寫入：${errors[0]}`;
  if (approve && !adopt(p, ledgerFile, now, false)) return '讀不到預警紀錄檔，沒有寫入。';
  writeJson(path.join(d.resolved, f), { ...p, decision: approve ? 'APPROVED' : 'REJECTED', resolvedAt: new Date(now).toISOString() });
  fs.unlinkSync(file);
  return approve ? '已採納，同步到雲端後的下一輪巡檢會反映在燈號。' : '已駁回。';
}

async function handleButton(interaction, { adminId = require('./bot/config').COMMANDER_USER_ID } = {}) {
  const m = String(interaction.customId).match(/^ww:prop:(yes|no|undo):([a-z0-9_-]+)$/);
  if (!m) return false;
  if (interaction.user.id !== adminId) { await interaction.reply({ content: '只有站主可以處理提案。', ephemeral: true }); return true; }
  // 舊訊息上的採納／駁回按鈕：提案多半已被自動採納，按駁回等同撤銷
  const autoDone = readJson(path.join(dirs().resolved, `${m[2]}.json`), null)?.decision === 'AUTO_ADOPTED';
  const result = m[1] === 'undo' || (m[1] === 'no' && autoDone) ? revokeProposal(m[2]) : resolveProposal(m[2], m[1] === 'yes');
  const done = /^已/.test(result) || /處理過/.test(result);
  await interaction.update({ content: `${interaction.message.content}\n\n➡️ ${result}`.slice(0, 2000), components: done ? [] : interaction.message.components });
  return true;
}

module.exports = { manualIndicators, manualCoverage, checkProposal, proposalMessage, dispatchProposals, resolveProposal, revokeProposal, handleButton, pendingProposals, MAX_PER_ROUND };
