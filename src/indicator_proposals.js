// 人工指標半自動更新：雲端研究排程把查到的事實寫成提案（research/indicator_proposals/pending/），巡檢私訊站主，
// 按「採納」才寫進 research/warning_indicators.json。等級仍只由規則計算，提案本身不影響燈號。
// 雲端沒有常駐連線，按鈕由本機機器人處理；本機關機時按鈕無法回應，提案留在佇列，開機後再按。
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

function asEntry(p, now) {
  const { kind, proposedAt, runner, sentAt, ...entry } = p;
  return { ...entry, reviewed: true, reviewedAt: new Date(now).toISOString() };
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

// 雲端巡檢呼叫：私訊尚未送出的提案。格式不合的直接結案，已被本機結案的（同步時復活）清掉
async function dispatchProposals(client, adminId, { base = BASE, now = Date.now() } = {}) {
  const d = dirs(base);
  const out = { sent: 0, invalid: 0 };
  let user = null;
  for (const f of list(d.pending)) {
    const file = path.join(d.pending, f);
    if (fs.existsSync(path.join(d.resolved, f))) { fs.unlinkSync(file); continue; }
    const p = readJson(file, null);
    if (p?.sentAt) continue;
    const errors = checkProposal(p, now);
    if (errors.length) { writeJson(path.join(d.resolved, f), { ...(p || {}), decision: 'INVALID', errors, resolvedAt: new Date(now).toISOString() }); fs.unlinkSync(file); out.invalid++; continue; }
    if (out.sent >= MAX_PER_ROUND) break;
    user = user || await client.users.fetch(adminId);
    await user.send({ content: proposalMessage(p).slice(0, 1900), components: buttons(p.id), allowedMentions: { parse: [] } });
    writeJson(file, { ...p, sentAt: new Date(now).toISOString() });
    out.sent++;
  }
  return out;
}

// 本機機器人呼叫：回傳給站主看的一句話
function resolveProposal(id, approve, { base = BASE, ledgerFile = LEDGER, now = Date.now() } = {}) {
  const d = dirs(base), f = `${id}.json`, file = path.join(d.pending, f);
  if (fs.existsSync(path.join(d.resolved, f))) return '這筆提案已經處理過了。';
  const p = readJson(file, null);
  if (!p) return '這筆提案還沒同步到本機，最多 10 分鐘後再按一次。';
  const errors = approve ? checkProposal(p, now) : [];
  if (errors.length) return `提案不合格，沒有寫入：${errors[0]}`;
  if (approve) {
    const ledger = readJson(ledgerFile, null);
    if (!ledger) return '讀不到預警紀錄檔，沒有寫入。';
    if (p.kind === 'WATCH') ledger.watch = { ...(ledger.watch || {}), [p.theater]: { text: p.text, updatedAt: new Date(now).toISOString() } };
    else ledger.entries = [...(ledger.entries || []).filter(e => e.id !== p.id), asEntry(p, now)];
    writeJson(ledgerFile, ledger);
  }
  writeJson(path.join(d.resolved, f), { ...p, decision: approve ? 'APPROVED' : 'REJECTED', resolvedAt: new Date(now).toISOString() });
  fs.unlinkSync(file);
  return approve ? '已採納，同步到雲端後的下一輪巡檢會反映在燈號。' : '已駁回。';
}

async function handleButton(interaction, { adminId = require('./bot/config').COMMANDER_USER_ID } = {}) {
  const m = String(interaction.customId).match(/^ww:prop:(yes|no):([a-z0-9_-]+)$/);
  if (!m) return false;
  if (interaction.user.id !== adminId) { await interaction.reply({ content: '只有站主可以核可提案。', ephemeral: true }); return true; }
  const result = resolveProposal(m[2], m[1] === 'yes');
  const done = /^已/.test(result) || /處理過/.test(result);
  await interaction.update({ content: `${interaction.message.content}\n\n➡️ ${result}`.slice(0, 2000), components: done ? [] : interaction.message.components });
  return true;
}

module.exports = { manualIndicators, manualCoverage, checkProposal, proposalMessage, dispatchProposals, resolveProposal, handleButton, pendingProposals, MAX_PER_ROUND };
