/**
 * WordWar_News - Event Evidence Ledger (src/evidence_ledger.js)
 * 
 * Feature: 事件證據頁（新功能 #2）
 * For each tracked event, stores:
 *   - 原文摘錄 (source text excerpts with URLs)
 *   - 時間 (publication timestamps and event time)
 *   - 地點 (geographic location with coordinates if available)
 *   - 來源關聯 (source relationships — wires, republications, dependencies)
 *   - 相互矛盾說法 (contradictions between sources)
 *   - 查核狀態 (verification status)
 * 
 * Manually reviewed events remain researcher-owned. Published research
 * reports also appear as read-only evidence indexes, never as automatic
 * observations or quotes extracted from headlines.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEDGER_FILE = process.env.WORDWAR_EVIDENCE_FILE || path.join(__dirname, '../research/evidence_ledger.json');

/**
 * Loads the full evidence ledger
 */
function loadLedger() {
  try {
    if (fs.existsSync(LEDGER_FILE)) {
      return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
    }
  } catch (_) {}
  return { events: [] };
}

/**
 * Saves the ledger atomically
 */
function saveLedger(ledger) {
  const tmp = `${LEDGER_FILE}.${crypto.randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(LEDGER_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2), 'utf8');
  fs.renameSync(tmp, LEDGER_FILE);
}

/**
 * Creates a new evidence event record.
 * Must be called by researchers with verified data, NOT automatically from headlines.
 * 
 * @param {object} params
 * @param {string} params.eventId         - Unique identifier (e.g., "UKR-2026-09-27-KYIV-STRIKE")
 * @param {string} params.title           - Short event title (factual, from sources)
 * @param {string} params.theater         - 'ukraine_front' | 'taiwan_strait' | 'middle_east' | 'global'
 * @param {string} params.eventTime       - ISO timestamp of the reported event (null if unknown)
 * @param {object} params.location        - { name, lat, lon, accuracy } (null if unknown)
 * @param {string} params.researcherNote  - Researcher's assessment note
 * @returns {string} eventId
 */
function createEvidenceEvent({ eventId, title, theater, eventTime = null, location = null, researcherNote = '' }) {
  const ledger = loadLedger();
  if (typeof eventId !== 'string' || eventId.startsWith('report:')) throw new Error('report: is reserved for published report evidence pages');
  
  if (ledger.events.find(e => e.eventId === eventId)) {
    throw new Error(`Evidence event "${eventId}" already exists. Use addEvidence() to add sources.`);
  }
  
  const record = {
    eventId,
    title,
    theater,
    eventTime,
    location,
    researcherNote,
    verificationStatus: 'UNVERIFIED',
    sources: [],
    contradictions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  ledger.events.unshift(record);
  // Keep last 200 events
  ledger.events = ledger.events.slice(0, 200);
  saveLedger(ledger);
  return eventId;
}

/**
 * Adds a source evidence item to an existing event.
 * 
 * @param {string} eventId
 * @param {object} source
 * @param {string} source.publisher     - Publisher name
 * @param {string} source.url           - Direct URL to original article
 * @param {string} source.publishedAt   - ISO timestamp when published
 * @param {string} source.excerpt       - Key quote or excerpt from original text (not paraphrase)
 * @param {string} source.tier          - 1-4 (credibility tier)
 * @param {string} source.relationship  - 'PRIMARY' | 'WIRE_REPUBLICATION' | 'SECONDARY_CITE' | 'AGGREGATOR'
 * @param {string} source.language      - 'zh-TW' | 'en' | 'uk' | etc.
 * @param {boolean} source.hasPaywall   - True if full text requires subscription
 */
function addEvidence(eventId, source) {
  const ledger = loadLedger();
  const event = ledger.events.find(e => e.eventId === eventId);
  if (!event) throw new Error(`Evidence event "${eventId}" not found. Create it first with createEvidenceEvent().`);
  
  // Validate required fields
  if (!source.url || !source.publisher || !source.publishedAt) {
    throw new Error('Evidence source must include url, publisher, and publishedAt.');
  }
  
  // Validate URL — must be HTTPS with no credentials
  let parsedUrl;
  try { parsedUrl = new URL(source.url); } catch (_) { throw new Error('Invalid source URL.'); }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
    throw new Error('Source URL must use HTTPS with no embedded credentials.');
  }
  
  // Prevent duplicate source URLs
  if (event.sources.find(s => s.url === source.url)) return; // Already recorded
  
  const stamp = Date.parse(source.publishedAt);
  if (!Number.isFinite(stamp) || stamp > Date.now()) {
    throw new Error('publishedAt must be a valid past ISO timestamp.');
  }
  
  event.sources.push({
    publisher: source.publisher,
    url: source.url,
    publishedAt: source.publishedAt,
    excerpt: (source.excerpt || '').slice(0, 500), // Cap excerpt length
    tier: Number(source.tier) || 4,
    relationship: source.relationship || 'PRIMARY',
    language: source.language || 'zh-TW',
    hasPaywall: !!source.hasPaywall,
    addedAt: new Date().toISOString()
  });
  
  event.updatedAt = new Date().toISOString();
  
  // Auto-update verification status based on source count and tier
  event.verificationStatus = 'SOURCES_RECORDED';
  
  saveLedger(ledger);
}

/**
 * Records a contradiction between two sources for an event.
 * 
 * @param {string} eventId
 * @param {object} contradiction
 * @param {string} contradiction.sourceUrlA    - URL of first source
 * @param {string} contradiction.sourceUrlB    - URL of contradicting source
 * @param {string} contradiction.claim         - What Source A says
 * @param {string} contradiction.counterClaim  - What Source B says differently
 * @param {string} contradiction.researcherNote - Assessment of the discrepancy
 */
function recordContradiction(eventId, contradiction) {
  const ledger = loadLedger();
  const event = ledger.events.find(e => e.eventId === eventId);
  if (!event) throw new Error(`Evidence event "${eventId}" not found.`);
  
  event.contradictions.push({
    ...contradiction,
    recordedAt: new Date().toISOString()
  });
  event.updatedAt = new Date().toISOString();
  event.verificationStatus = 'CONFLICT_REQUIRES_REVIEW';
  saveLedger(ledger);
}

/**
 * Gets an evidence event by ID
 */
function getEvidenceEvent(eventId) {
  const ledger = loadLedger();
  return ledger.events.find(e => e.eventId === eventId) || getReportEvidenceEvent(eventId);
}

// Published reports are a read-only projection. Never turn reviewed prose into
// a manually verified observation, an original quote, or a new ground-truth event.
function getReportEvidenceEvent(eventId) {
  if (!eventId?.startsWith('report:')) return null;
  const id = eventId.slice(7);
  const reports = [
    ...(readJson(path.join(__dirname, '../research/reports.json'), { reports: [] }).reports || []),
    ...(readJson(path.join(__dirname, '../research/report_archive.json'), { reports: [] }).reports || [])
  ];
  const report = reports.find(r => r.id === id && (r.reviewed === true || r.supersededBy));
  if (!report) return null;
  const docs = readJson(path.join(__dirname, '../research/sources.json'), { documents: [] }).documents || [];
  return projectReportEvidence(report, docs);
}

function projectReportEvidence(report, docs) {
  const documentById = new Map(docs.map(doc => [doc.id, doc]));
  const snapshotById = new Map((report.sourceSnapshot || []).map(item => [item.id, item]));
  const sources = (report.basis || []).map(ref => {
    const doc = documentById.get(ref.id);
    const current = doc && doc.contentHash === ref.contentHash ? doc : null;
    const snapshot = snapshotById.get(ref.id);
    const archived = !current && snapshot?.contentHash === ref.contentHash ? snapshot : null;
    const source = current || archived;
    return source ? { id: ref.id, publisher: source.publisher, url: source.url,
      publishedAt: source.publishedAt, originGroup: source.originGroup,
      sourceType: source.sourceType, available: true, archived: !!archived } :
      { id: ref.id, available: false };
  });
  return {
    eventId: `report:${report.id}`, title: report.title, theater: report.theater, eventTime: null,
    asOf: report.asOf, generatedAt: report.generatedAt, supersededBy: report.supersededBy || null,
    verificationStatus: 'REVIEWED_REPORT', sources, sections: report.sections || [],
    contradictions: [], reportId: report.id, kind: 'REPORT_EVIDENCE'
  };
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

/**
 * Gets recent evidence events, optionally filtered by theater
 */
function getRecentEvidenceEvents(theater = null, limit = 10) {
  const ledger = loadLedger();
  const reports = readJson(path.join(__dirname, '../research/reports.json'), { reports: [] }).reports || [];
  let events = [...ledger.events, ...reports.filter(r => r.reviewed === true && !r.supersededBy)
    .map(r => getReportEvidenceEvent(`report:${r.id}`)).filter(Boolean)];
  if (theater) events = events.filter(e => e.theater === theater || theater === 'all');
  events.sort((a, b) => Date.parse(b.generatedAt || b.updatedAt || b.createdAt || 0) - Date.parse(a.generatedAt || a.updatedAt || a.createdAt || 0));
  return events.slice(0, limit);
}

/**
 * Formats an evidence event as a Discord payload
 */
function formatEvidencePayload(eventId) {
  const event = getEvidenceEvent(eventId);
  if (!event) {
    return {
      sourceBacked: false,
      content: `找不到事件證據頁：\`${eventId}\``,
      files: [], embeds: []
    };
  }
  if (event.kind === 'REPORT_EVIDENCE') return formatReportEvidencePayload(event);
  
  const statusMap = {
    SOURCES_RECORDED:'來源已記錄；事件事實與來源獨立性需逐項核對',
    CONFLICT_REQUIRES_REVIEW:'來源存在矛盾，需重新核對',
    UNVERIFIED: '🔴 未查證',
    SINGLE_SOURCE: '🟡 單一來源（尚未交叉核對）',
    MULTI_SOURCE_TIER2: '🟠 多源核對（Tier 2 以上）',
    MULTI_SOURCE_TIER1: '🟢 多源核對（含 Tier 1 權威機構）'
  };
  
  const lines = [
    `# 📋 事件證據頁 // EVIDENCE RECORD`,
    `**事件編號**: \`${event.eventId}\``,
    `**標題**: ${event.title}`,
    `**查核狀態**: ${statusMap[event.verificationStatus] || event.verificationStatus}`,
    `**戰區**: ${event.theater} ｜ **事件時間**: ${event.eventTime || '未確認'}`,
    event.location ? `**地點**: ${event.location.name}${event.location.lat ? ` (${event.location.lat}°N, ${event.location.lon}°E)` : ''}` : null,
    `**更新時間**: ${event.updatedAt}`,
    ''
  ];
  
  if (event.sources.length) {
    lines.push(`### 📰 【來源記錄 — ${event.sources.length} 個】`);
    for (const [i, s] of event.sources.entries()) {
      const paywall = s.hasPaywall ? ' (付費牆)' : '';
      const rel = s.relationship !== 'PRIMARY' ? ` [${s.relationship}]` : '';
      lines.push(
        `**[${i+1}]** Tier ${s.tier}${rel} — **${s.publisher}**${paywall}\n` +
        `   發布時間: \`${s.publishedAt}\`\n` +
        (s.excerpt ? `   > 原文摘錄: "${s.excerpt}"\n` : '') +
        `   來源: ${s.url}`
      );
    }
  } else {
    lines.push('> 尚未錄入任何來源，請由研究人員使用 `addEvidence()` 新增。');
  }
  
  if (event.contradictions.length) {
    lines.push('');
    lines.push(`### ⚠️ 【相互矛盾說法 — ${event.contradictions.length} 則】`);
    for (const [i, c] of event.contradictions.entries()) {
      lines.push(
        `**矛盾 ${i+1}**: ${c.claim}\n` +
        `   **反方說法**: ${c.counterClaim}\n` +
        `   **來源 A**: ${c.sourceUrlA}\n` +
        `   **來源 B**: ${c.sourceUrlB}\n` +
        (c.researcherNote ? `   **研究員評估**: ${c.researcherNote}` : '')
      );
    }
  }
  
  if (event.researcherNote) {
    lines.push('');
    lines.push(`### 📝 研究員備忘`);
    lines.push(event.researcherNote);
  }
  
  lines.push('');
  lines.push('> 此頁面為研究人員手動建立的事件證據追蹤記錄，不由標題或關鍵字自動生成。');
  
  return {
    sourceBacked: event.sources.length > 0,
    content: lines.filter(Boolean).join('\n').slice(0, 2000),
    files: [], embeds: []
  };
}

function formatReportEvidencePayload(event) {
  const lines = [
    '# 📋 報導證據頁',
    `**報導**：${event.title}`,
    `**編號**：\`${event.eventId}\`｜**戰區**：${event.theater}`,
    `**最新來源發布**：${event.asOf || '未提供'}｜**事件發生時間**：未結構化記錄`,
    `**狀態**：${event.supersededBy ? `已由 report:${event.supersededBy} 取代` : '研究稿已覆核；各項主張仍須按來源判讀'}${Date.now() - Date.parse(event.asOf) > 48 * 3600_000 ? '｜歷史報導，非現況' : ''}`,
    ''
  ];
  const sourceById = new Map(event.sources.map((s, i) => [s.id, { ...s, n: i + 1 }]));
  for (const section of event.sections) {
    const refs = (section.evidence || []).map(id => {
      const s = sourceById.get(id);
      return s ? `[${s.n}${s.available ? '' : ' 來源紀錄缺失'}]` : '[引用缺失]';
    }).join(' ');
    lines.push(`**${section.kind}｜${section.label}**：${section.text} ${refs}`);
  }
  lines.push('', '**來源**（相同 originGroup 不計為獨立佐證）：');
  for (const [i, s] of event.sources.entries()) {
    lines.push(s.available ? `[${i + 1}] ${s.publisher}｜${s.publishedAt}｜${s.originGroup}｜${s.url}${s.archived ? '（發布時來源索引；現時原文未重新核對）' : ''}` :
      `[${i + 1}] 來源紀錄缺失（ID ${s.id}）；無法從本頁重新核對。`);
  }
  lines.push('本文段落是研究員撰寫的報導或分析，不是來源原文摘錄；發布時間不等於事件時間。');
  const chunks = [];
  let chunk = '';
  for (const line of lines) {
    if (chunk && chunk.length + line.length + 1 > 1900) { chunks.push(chunk); chunk = ''; }
    // A reviewed section is at most 700 chars; long source URLs are bounded
    // by documentRecord(), so this does not split a citation or claim.
    chunk += `${chunk ? '\n' : ''}${line}`;
  }
  if (chunk) chunks.push(chunk);
  return { sourceBacked: event.sources.some(s => s.available),
    content: chunks.shift() || '', extra: chunks, files: [], embeds: [], allowedMentions: { parse: [] } };
}

module.exports = {
  createEvidenceEvent,
  addEvidence,
  recordContradiction,
  getEvidenceEvent,
  getRecentEvidenceEvents,
  formatEvidencePayload,
  projectReportEvidence,
  formatReportEvidencePayload
};
