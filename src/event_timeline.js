'use strict';
// 事件時間線與更正紀錄：把已覆核事件、預警指標、原文修訂、研究稿替換／停止展示與預警等級變化放在同一條時間線。
// 每筆分開三種時間：eventTime（事件發生，來源所述）、publishedAt（最早來源發布）、recordedAt（本站記錄／覆核）。
// 同一事件的首報、後續、否認與更正只依研究者填的 thread 欄位串接；程式不以地點或時間相近自動合併。
const fs = require('fs');
const path = require('path');

const INDICATORS_FILE = path.join(__dirname, '../research/warning_indicators.json');
const HISTORY_FILE = path.join(__dirname, '../research/warning_history.json');
const REPORTS_FILE = path.join(__dirname, '../research/reports.json');
const ROLES = { FIRST_REPORT: '首次通報', FOLLOW_UP: '後續報導', CORROBORATION: '佐證', DENIAL: '否認／反駁', CORRECTION: '更正' };
const KINDS = { EVENT: '已覆核事件', INDICATOR: '預警指標觀測', SOURCE_REVISION: '原文修訂', REPORT_SUPERSEDED: '研究稿被新版取代', REPORT_WITHDRAWN: '研究稿停止展示', LEVEL_CHANGE: '預警等級變化' };
const CONFIDENCE = { CONFIRMED_MULTI: '多來源一致', SINGLE_SOURCE: '單一來源', DISPUTED: '有爭議' };
const AUDIT_REASONS = { EXPIRED: '資料超過 48 小時', SOURCE_CHANGED_OR_MISSING: '引用來源已更改或缺失', INVALID: '驗證失敗' };
const LEVEL_NAMES = { 1: '常態', 2: '升溫', 3: '高度警戒', 4: '危機' };

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const iso = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const httpsSource = s => { try { return new URL(s.url).protocol === 'https:'; } catch { return false; } };
function earliest(sources) {
  const times = sources.map(s => Date.parse(s.publishedAt || '')).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}
function cleanSources(list) {
  return (Array.isArray(list) ? list : []).filter(httpsSource).slice(0, 10).map(s => ({ url: s.url, publisher: String(s.publisher || '未標示').slice(0, 80), sourceClass: s.sourceClass || null, publishedAt: iso(s.publishedAt) }));
}

function ledgerItems(ledger) {
  const out = [];
  for (const [kind, list] of [['EVENT', ledger.mapEvents], ['INDICATOR', ledger.entries]]) {
    for (const e of list || []) {
      if (e?.reviewed !== true || !e.id) continue;
      const sources = cleanSources(e.sources);
      if (!sources.length) continue;
      out.push({ id: `${kind.toLowerCase()}:${e.id}`, sourceId: e.id, kind, theater: e.theater || 'global', thread: typeof e.thread === 'string' ? e.thread : null,
        role: ROLES[e.role] ? e.role : null, corrects: typeof e.corrects === 'string' ? e.corrects : null,
        title: e.title || (kind === 'INDICATOR' ? `${e.indicator}${e.triggered === false ? '（已查核、未觸發）' : ''}` : e.id), summary: e.summary || '', comparison: e.comparison || null,
        place: e.place?.name ? [e.place.name, e.place.admin].filter(Boolean).join('，') : null,
        confidence: e.confidence || null, triggered: kind === 'INDICATOR' ? e.triggered !== false : null,
        eventTime: iso(e.observedAt), publishedAt: earliest(sources), recordedAt: iso(e.reviewedAt), sources });
    }
  }
  return out;
}

function revisionItems(changes) {
  return changes.filter(c => c.kind === 'CORRECTION').map(c => {
    const prev = c.previousObservation, cur = c.observation;
    const diff = prev && cur ? Object.keys({ ...prev, ...cur }).filter(k => JSON.stringify(prev[k]) !== JSON.stringify(cur[k]) && !/period/i.test(k)).map(k => ({ field: k, before: prev[k] ?? null, after: cur[k] ?? null })) : [];
    return { id: `revision:${c.id}`, kind: 'SOURCE_REVISION', theater: c.originGroup === 'TAIWAN_MND' ? 'taiwan_strait' : /UKRAIN/.test(c.originGroup || '') ? 'ukraine_front' : 'global',
      thread: null, role: 'CORRECTION', title: c.title, summary: diff.length ? `數值更動：${diff.map(d => `${d.field} ${d.before ?? '無'} → ${d.after ?? '無'}`).join('；')}` : '來源原文內容已更動（標題、正文或圖片）。',
      eventTime: iso(cur?.periodEnd), publishedAt: iso(c.publishedAt), recordedAt: iso(c.recordedAt), diff, currentVersion: c.currentVersion,
      sources: [{ url: c.url, publisher: c.originGroup, sourceClass: c.evidenceStatus, publishedAt: iso(c.publishedAt) }].filter(httpsSource) };
  });
}

function reportItems(reports, audit) {
  const byId = new Map(reports.map(r => [r.id, r]));
  const out = reports.filter(r => r.supersededBy).map(r => {
    const next = byId.get(r.supersededBy);
    return { id: `superseded:${r.id}`, kind: 'REPORT_SUPERSEDED', theater: r.theater || 'global', thread: `report:${r.supersededBy}`, role: 'CORRECTION', title: r.title,
      summary: `已由新版「${next?.title || r.supersededBy}」取代；舊稿保留歷史，不再展示。`, eventTime: iso(r.asOf), publishedAt: iso(r.generatedAt), recordedAt: iso(next?.generatedAt), sources: [] };
  });
  for (const a of audit || []) out.push({ id: `withdrawn:${a.id}`, kind: 'REPORT_WITHDRAWN', theater: byId.get(a.id)?.theater || 'global', thread: null, role: null, title: a.title,
    summary: `停止展示原因：${AUDIT_REASONS[a.reason] || a.reason}。`, eventTime: iso(a.asOf), publishedAt: iso(byId.get(a.id)?.generatedAt), recordedAt: null, sources: [] });
  return out;
}

// 同一戰區、同一規則版本內等級改變的時刻
function levelItems(history) {
  const last = {}, out = [];
  for (const s of [...(history.snapshots || [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const key = s.theater, prev = last[key];
    if (prev && prev.level !== s.level && prev.ruleVersion === s.ruleVersion) {
      const up = (s.level || 0) > (prev.level || 0);
      out.push({ id: `level:${key}:${s.at}`, kind: 'LEVEL_CHANGE', theater: key, thread: null, role: null,
        title: `預警${up ? '升' : '降'}為第 ${s.level ?? '?'} 級${LEVEL_NAMES[s.level] ? ` ${LEVEL_NAMES[s.level]}` : ''}`,
        summary: `由第 ${prev.level ?? '?'} 級變為第 ${s.level ?? '?'} 級（規則 ${s.ruleVersion}）。觸發指標請見預警看板；等級不是開戰機率。`,
        eventTime: null, publishedAt: null, recordedAt: iso(s.at), level: s.level, previousLevel: prev.level, sources: [] });
    }
    last[key] = s;
  }
  return out;
}

const sortTime = i => Date.parse(i.eventTime || i.publishedAt || i.recordedAt || 0) || 0;
function buildEventTimeline({ ledger = readJson(INDICATORS_FILE, {}), history = readJson(HISTORY_FILE, { snapshots: [] }), reports = readJson(REPORTS_FILE, { reports: [] }).reports || [], audit = null, changes = null, theater = null, kinds = null, since = null, limit = 300 } = {}) {
  if (audit === null) { try { audit = require('./research_reports').getResearchFeed().reportAudit || []; } catch { audit = []; } }
  if (changes === null) { try { changes = require('./intel_store').getStore().changes(500); } catch { changes = []; } }
  let items = [...ledgerItems(ledger), ...revisionItems(changes), ...reportItems(reports, audit), ...levelItems(history)];
  if (theater) items = items.filter(i => i.theater === theater);
  if (kinds?.length) items = items.filter(i => kinds.includes(i.kind));
  if (since) items = items.filter(i => sortTime(i) >= since);
  items.sort((a, b) => sortTime(b) - sortTime(a));
  // 串內依發布（無則記錄）時間由舊到新
  const threads = {}, pubTime = i => Date.parse(i.publishedAt || i.recordedAt || 0) || 0;
  for (const i of [...items].sort((a, b) => pubTime(a) - pubTime(b))) if (i.thread) (threads[i.thread] = threads[i.thread] || []).push(i.id);
  return { generatedAt: new Date().toISOString(), total: items.length, items: items.slice(0, limit), threads: Object.fromEntries(Object.entries(threads).filter(([, ids]) => ids.length > 1)),
    labels: { kinds: KINDS, roles: ROLES, confidence: CONFIDENCE },
    note: '時間線只列已覆核或系統自動記錄的項目。同一事件的關聯只依研究者填的 thread 欄位，不自動以地點或時間合併；交戰方聲稱與外部確認分開標示。' };
}

function timelineDiscordPayload({ theater = null, correctionsOnly = false } = {}) {
  const tl = buildEventTimeline({ theater, kinds: correctionsOnly ? ['SOURCE_REVISION', 'REPORT_SUPERSEDED', 'REPORT_WITHDRAWN'] : null, limit: 12 });
  const fmt = v => v ? new Date(Date.parse(v) + 8 * 3600_000).toISOString().slice(5, 16).replace('T', ' ') : '—';
  const lines = [`# 🗂️ ${correctionsOnly ? '更正紀錄' : '事件時間線'}${theater ? `｜${theater}` : ''}`];
  if (!tl.items.length) lines.push('目前沒有符合的紀錄。');
  for (const i of tl.items) {
    lines.push(`**${KINDS[i.kind]}${i.role ? `・${ROLES[i.role]}` : ''}${i.confidence ? `・${CONFIDENCE[i.confidence] || i.confidence}` : ''}**｜${i.title}`.slice(0, 200));
    lines.push(`　事件 ${fmt(i.eventTime)}｜發布 ${fmt(i.publishedAt)}｜記錄 ${fmt(i.recordedAt)}${i.sources[0] ? `｜<${i.sources[0].url}>` : ''}`);
  }
  lines.push('完整時間線：網站 /events.html（台北時間）');
  return { content: lines.join('\n').slice(0, 1990), files: [], embeds: [], allowedMentions: { parse: [] } };
}

module.exports = { buildEventTimeline, timelineDiscordPayload, ledgerItems, revisionItems, reportItems, levelItems, ROLES, KINDS };
