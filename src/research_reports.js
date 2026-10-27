const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');
const Parser = require('rss-parser');
const { reviewedMap } = require('./news_reports');
const { getStore } = require('./intel_store');
const {theaterRegistry,validateOutlook,outlookText,resolveImagery}=require('./strategic_outlook');
const {getSatelliteFeed}=require('./satellite_assets');
const {getNewsContext}=require('./news_context');
const {validateTimeline,renderTimeline}=require('./research_timeline');
const ROOT = path.join(__dirname, '../research');
const SOURCES_FILE = path.join(ROOT, 'sources.json');
const REPORTS_FILE = path.join(ROOT, 'reports.json');
const ARCHIVE_FILE = path.join(ROOT, 'report_archive.json');
const CHECK_TTL_MS = 30 * 60_000;
const REPORT_TTL_MS = 48 * 60 * 60_000;
const text = value => String(value || '').replace(/\s+/g, ' ').trim();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function write(file, value) {
  fs.mkdirSync(ROOT, { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}
async function page(url, host) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== host) throw new Error('Unexpected source URL');
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'error', headers: { 'User-Agent': 'WordWarNews source research (+private reading)' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error('Source page too large');
  return cheerio.load(html);
}
function documentRecord({ url, title, publishedAt, body, publisher, originGroup, sourceType }) {
  const published = Date.parse(publishedAt);
  let validUrl = false;
  try { const parsed = new URL(url); validUrl = parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch {}
  if (typeof title !== 'string' || !title.trim() || typeof body !== 'string' || !validUrl || url.length > 850 || body.length < 80 || typeof publisher !== 'string' || !publisher.trim() || publisher.length > 150 || typeof originGroup !== 'string' || !originGroup || typeof sourceType !== 'string' || !sourceType || !Number.isFinite(published) || published > Date.now()) throw new Error('Source body or publication time unavailable');
  return {
    id: hash(url).slice(0, 16), url, title: text(title), publishedAt: new Date(published).toISOString(),
    fetchedAt: new Date().toISOString(), contentHash: hash(body), body,
    publisher, originGroup, sourceType
  };
}
let researchInFlight;
function refreshResearchSources(options = {}) {
  if (!researchInFlight) researchInFlight = collectResearchSources(options).finally(() => { researchInFlight = null; });
  return researchInFlight;
}
async function collectResearchSources({ force = false } = {}) {
  const previous = read(SOURCES_FILE, { documents: [], sources: {} });
  for (const doc of previous.documents || []) getStore().putDocument(doc);
  if (!force && Date.now() - Date.parse(previous.lastCheckedAt) >= 0 && Date.now() - Date.parse(previous.lastCheckedAt) < CHECK_TTL_MS) return previous;
  const documents = new Map((previous.documents || []).map(doc => [doc.id, doc]));
  const status = { ...(previous.sources || {}) };
  const jobs = [
    ['Ukraine_Third_Corps', async () => {
      const url = 'https://ab3.army/operations/vivaldi';
      const $ = await page(url, 'ab3.army');
      const docs = [];
      $('[id^="vivaldi-"]').each((_, element) => {
        const node = $(element); const publishedAt = node.find('time[datetime]').first().attr('datetime');
        const title = node.find('h3').first().text();
        const body = text(node.find('p').map((i, p) => $(p).text()).get().join('\n'));
        if (!publishedAt || !title || !body) return;
        docs.push(documentRecord({ url: `${url}#${node.attr('id')}`, title, publishedAt, body,
          publisher: '烏克蘭第三軍團', originGroup: 'UKRAINIAN_MILITARY', sourceType: 'BELLIGERENT_STATEMENT' }));
      });
      if (!docs.length) throw new Error('Operation timeline format changed');
      return docs.slice(0, 6);
    }],
    ['ArmyInform_Interviews', async () => {
      const feed = await new Parser({ timeout: 15000 }).parseURL('https://armyinform.com.ua/feed/');
      const items = feed.items.filter(item => /Вівальді|Лиман|Куп|Покров|Костянтин|БПЛА|Київ|Генштаб/i.test(item.title || '')).slice(0, 3);
      const docs = [];
      for (const item of items) {
        try {
          const $ = await page(item.link, 'armyinform.com.ua');
          const body = text($('.single-content p').map((i, p) => $(p).text()).get().join('\n'));
          docs.push(documentRecord({ url: item.link, title: $('h1').first().text(), publishedAt: item.isoDate || item.pubDate, body,
            publisher: 'ArmyInform 烏克蘭軍方媒體', originGroup: 'UKRAINIAN_MILITARY', sourceType: 'BELLIGERENT_INTERVIEW' }));
        } catch (error) { docs.partial = true; console.warn('[RESEARCH ARTICLE]', error.message); }
      }
      if (!docs.length) throw new Error('No readable dated interviews');
      return docs;
    }]
  ];
  const results = await Promise.allSettled(jobs.map(async ([name, collect]) => ({ name, docs: await collect() })));
  results.forEach((result, index) => {
    const name = jobs[index][0];
    if (result.status === 'fulfilled') {
      result.value.docs.forEach(doc => documents.set(doc.id, doc));
      status[name] = { status: result.value.docs.partial ? 'DEGRADED' : 'ONLINE', lastSuccess: new Date().toISOString(), lastAttempt: new Date().toISOString(), count: result.value.docs.length,
        ...(result.value.docs.partial ? { error: 'Some source articles could not be read' } : {}) };
    } else status[name] = { ...status[name], status: 'DEGRADED', lastAttempt: new Date().toISOString(), error: result.reason.message };
  });
  // Preserve references imported while network requests were in flight. Freshly
  // collected originals override older cached versions of those same documents.
  const latest = read(SOURCES_FILE, { documents: [] });
  const merged = new Map((latest.documents || []).map(doc => [doc.id, doc]));
  results.filter(r => r.status === 'fulfilled').forEach(r => r.value.docs.forEach(doc => merged.set(doc.id, doc)));
  documents.forEach((doc, id) => { if (!merged.has(id)) merged.set(id, doc); });
  const retained = retainedReferenceIds(read(REPORTS_FILE,{reports:[]}).reports || []);
  for(const claim of getNewsContext(Date.now(),{sources:{documents:[...merged.values()]}}))for(const ref of claim.references)retained.add(ref.id);
  const result = { lastCheckedAt: new Date().toISOString(), sources: status,
    documents: [...merged.values()].filter(doc => Date.now() - Date.parse(doc.publishedAt) >= 0 &&
      (Date.now() - Date.parse(doc.publishedAt) <= 7 * 24 * 60 * 60_000 || retained.has(doc.id))) };
  write(SOURCES_FILE, result);
  for (const doc of result.documents) getStore().putDocument(doc);
  return result;
}

// Each paragraph has its own evidence references. Ownership groups are preserved:
// a military press report and the originating military statement are not counted
// as independent corroboration. Only a reviewed original Chinese draft is published.
function validateResearchReport(report, sources, now = Date.now()) {
  if (report?.supersededBy) return false;
  if(!report || !validateTimeline(report,now))return false;
  if(!validateOutlook(report,now))return false;
  if (report?.reviewed !== true || report.language !== 'zh-Hant' || typeof report.title !== 'string' || !report.title.trim() || report.title.length > 200 || !Array.isArray(report.sections) || !report.sections.length || report.sections.length > 5) return false;
  const docs = new Map((sources.documents || []).map(doc => [doc.id, doc]));
  if (!Array.isArray(report.basis) || !report.basis.length || report.basis.length > 10 || report.basis.some(ref => !ref || !docs.has(ref.id) || docs.get(ref.id).contentHash !== ref.contentHash) || new Set(report.basis.map(ref => ref.id)).size !== report.basis.length) return false;
  const newestPublication = Math.max(...report.basis.map(ref => Date.parse(docs.get(ref.id).publishedAt)));
  if (Date.parse(report.asOf) !== newestPublication || !Number.isFinite(Date.parse(report.generatedAt)) || Date.parse(report.generatedAt) > now) return false;
  if (!Number.isFinite(Date.parse(report.asOf)) || Date.parse(report.asOf) > now || now - Date.parse(report.asOf) > REPORT_TTL_MS) return false;
  const basisIds = new Set(report.basis.map(ref => ref.id));
  if (report.map !== undefined && report.map !== null && !researchMap(report, sources, now)) return false;
  if (!report.sections.every(section => section && ['REPORTED', 'ANALYSIS', 'UNCERTAIN'].includes(section.kind) && typeof section.label === 'string' && section.label.trim() && section.label.length <= 80 && typeof section.text === 'string' && section.text.trim() && section.text.length <= 700 &&
    Array.isArray(section.evidence) && section.evidence.length && section.evidence.length <= 10 && new Set(section.evidence).size === section.evidence.length && section.evidence.every(id => basisIds.has(id)))) return false;
  const used = new Set(report.sections.flatMap(section => section.evidence));
  if (report.basis.some(ref => !used.has(ref.id))) return false;
  const descriptionSize = report.sections.reduce((size, section) => size + section.label.length + section.text.length + 8 + section.evidence.length * 5, 0)+outlookText(report).length;
  const fieldsSize = report.basis.reduce((size, ref) => { const doc = docs.get(ref.id); return size + String(doc.publisher || '').length + String(doc.url || '').length + String(doc.publishedAt || '').length + 16; }, 0);
  const imagerySize=(report.imagery||[]).reduce((size,i)=>size+i.caption.length+(i.observation?.length||0)+550,0);
  return descriptionSize <= 4096 && descriptionSize + fieldsSize + imagerySize + report.title.length + 150 <= 6000;
}
function getResearchFeed(now = Date.now()) {
  const sources = read(SOURCES_FILE, { documents: [], sources: {} });
  const store = read(REPORTS_FILE, { reports: [] });
  const active = (store.reports || []).filter(report => validateResearchReport(report, sources, now));
  const reportAudit = (store.reports || []).filter(report => !active.includes(report)).map(report => {
    const changed = Array.isArray(report.basis) && report.basis.some(ref => !ref || !sources.documents.some(doc => doc.id === ref.id && doc.contentHash === ref.contentHash));
    const age = now - Date.parse(report.asOf);
    return { id: report.id, title: report.title, asOf: report.asOf,
      reason: report.supersededBy ? 'SUPERSEDED' : changed ? 'SOURCE_CHANGED_OR_MISSING' : age > REPORT_TTL_MS ? 'EXPIRED' : 'INVALID_REPORT' };
  });
  const reports = active.map(report => ({ ...report, map: researchMap(report, sources, now),
    references: report.basis.map(ref => {
      const doc = sources.documents.find(item => item.id === ref.id);
      return { id: doc.id, url: doc.url, publisher: doc.publisher, publishedAt: doc.publishedAt,
        originGroup: doc.originGroup, sourceType: doc.sourceType };
    }) }));
  return { reports, reportAudit, lastResearchCheckAt: sources.lastCheckedAt || null, sourceStatus: sources.sources,
    readableDocuments: sources.documents.length, pendingAnalysis: sources.documents.some(doc =>
      Date.parse(doc.publishedAt) > now - REPORT_TTL_MS && !active.some(report => report.basis.some(ref => ref.id === doc.id && ref.contentHash === doc.contentHash))),
    analysisMode: 'REVIEWED_DRAFTS', automaticAnalysisAvailable: false };
}

// The map is an attributed claim from an imported original post, never an
// independently detected frontline. It cannot be borrowed by another theater.
function researchMap(report, sources, now = Date.now()) {
  const map = reviewedMap(report?.map, now);
  if (!map || !report?.map?.sourceId || !report?.map?.theater || !map.imageUrl.startsWith('https:') || !map.sourceUrl.startsWith('https:')) return null;
  const source = (sources.documents || []).find(doc => doc.id === report.map.sourceId);
  if (!source || !report.basis?.some(ref => ref.id === source.id && ref.contentHash === source.contentHash) ||
      source.url !== map.sourceUrl || Date.parse(source.publishedAt) !== Date.parse(map.publishedAt)) return null;
  const theater = report.map.theater;
  if (!theaterRegistry().some(row => row.id === theater) ||
      !(report.theater === theater || report.coverage?.some(row => row.theater === theater))) return null;
  return { ...map, theater, sourceId: source.id };
}

function retainedReferenceIds(reports,now=Date.now()) {
  return new Set(reports.filter(r=>r.reviewed===true && !r.supersededBy && Number.isFinite(Date.parse(r.asOf)) &&
    Date.parse(r.asOf)<=now && now-Date.parse(r.asOf)<=REPORT_TTL_MS).flatMap(r=>(r.basis || []).map(ref=>ref.id)));
}
function researchDiscordPayload(reportId) {
  const feed = getResearchFeed();
  const report = reportId ? feed.reports.find(r=>r.id===reportId) : feed.reports[0];
  if (!report) return { sourceBacked: true, content: feed.pendingAnalysis
    ? '原始研究資料已有更新，中文戰況報導尚待分析覆核。未沿用舊研判或用新聞標題代替分析。'
    : '尚無時效內且完成來源比對的中文戰況報導。', files: [], embeds: [], allowedMentions: { parse: [] } };
  const description = [report.sections.map(section => `**${section.label}**\n${section.text} ${section.evidence.map(id => `[${report.references.findIndex(ref => ref.id === id) + 1}]`).join(' ')}`).join('\n\n'),outlookText(report)].filter(Boolean).join('\n\n');
  const imagery=resolveImagery(report,getSatelliteFeed().assets);
  const files=imagery.map(a=>({attachment:path.join(__dirname,'../public',a.file),name:path.basename(a.file)}));
  if(report.timeline)files.push({attachment:renderTimeline(report),name:'research-timeline.png'});
  return { sourceBacked: true, content: report.coverage?'# 全球戰況｜衛星證據與情境推演':'# 軍事新聞｜戰況與台海動態', files, allowedMentions: { parse: [] }, embeds: [{
    title: report.title, description,
    fields: report.references.map((ref, i) => ({ name: `[${i + 1}] ${ref.publisher}`, value: `${ref.url}\n發布：${ref.publishedAt}` })),
    footer: { text: `資料截至 ${report.asOf}｜分析 ${report.generatedAt}｜報導與研判分列` },
    ...(report.map ? { image: { url: report.map.imageUrl } } : report.timeline ? {image:{url:'attachment://research-timeline.png'}} : {})
  },...imagery.map(a=>({title:`${a.region}｜拍攝 ${a.acquiredAt}`,url:a.sourceProductUrl,description:`${a.caption}\n${a.role==='CONTEXT_ONLY'?'背景影像，未判讀戰果。':a.observation}\n整片雲量：${a.cloudCoverPercent??'未提供'}%（不代表裁切區可見度）\n[授權](${a.licenseUrl})`,image:{url:`attachment://${path.basename(a.file)}`},footer:{text:a.credit}}))] };
}

function publishResearchDraft(draft) {
  if (!draft || typeof draft.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(draft.id) || !Array.isArray(draft.sourceIds) || !draft.sourceIds.length) throw new Error('Draft id and evidence sourceIds required');
  if (draft.changeSummary !== undefined && (typeof draft.changeSummary !== 'string' || !draft.changeSummary.trim() || draft.changeSummary.length > 300)) throw new Error('changeSummary must be a nonempty reviewed summary under 300 characters');
  if (draft.supersedes?.length && !draft.changeSummary) throw new Error('Replacing a report requires a reviewed changeSummary');
  if (draft.updateType !== undefined && !['UPDATE','CORRECTION'].includes(draft.updateType)) throw new Error('updateType must be UPDATE or CORRECTION');
  if (draft.updateType === 'CORRECTION' && (!draft.supersedes?.length || !draft.changeSummary)) throw new Error('Corrections require supersedes and a reviewed changeSummary');
  const sources = read(SOURCES_FILE, { documents: [] });
  const basis = (draft.sourceIds || []).map(id => {
    const doc = sources.documents.find(item => item.id === id);
    if (!doc) throw new Error(`Unknown evidence document ${id}`);
    return { id, contentHash: doc.contentHash };
  });
  const asOf = new Date(Math.max(...basis.map(ref => Date.parse(sources.documents.find(doc => doc.id === ref.id).publishedAt)))).toISOString();
  const sourceSnapshot = basis.map(ref => {
    const doc = sources.documents.find(item => item.id === ref.id);
    return { id: doc.id, contentHash: doc.contentHash, url: doc.url, publisher: doc.publisher,
      publishedAt: doc.publishedAt, originGroup: doc.originGroup, sourceType: doc.sourceType };
  });
  const report = { ...draft, basis, sourceSnapshot, asOf, generatedAt: new Date().toISOString(), reviewed: true, language: 'zh-Hant' };
  delete report.sourceIds;
  if (!validateResearchReport(report, sources)) throw new Error('Draft evidence or timestamp invalid');
  if(report.imagery?.length&&resolveImagery(report,getSatelliteFeed().assets).length!==report.imagery.length)throw new Error('Imagery reference missing or file hash changed');
  const store = read(REPORTS_FILE, { reports: [] });
  const replaced = new Set(Array.isArray(draft.supersedes)?draft.supersedes:[]);
  if (replaced.has(report.id) || [...replaced].some(id => !store.reports.some(item => item.id === id))) throw new Error('supersedes must reference existing earlier reports');
  const next = [report, ...store.reports.filter(item => item.id !== report.id).map(item=>
    replaced.has(item.id)?{...item,supersededBy:report.id,reviewed:false}:item)];
  const evicted = next.slice(30);
  if (evicted.length) {
    const archive = read(ARCHIVE_FILE, { reports: [] });
    const byId = new Map((archive.reports || []).map(item => [item.id, item]));
    for (const item of evicted) byId.set(item.id, item);
    write(ARCHIVE_FILE, { reports: [...byId.values()] });
  }
  store.reports = next.slice(0, 30);
  write(REPORTS_FILE, store);
  for (const ref of basis) getStore().putDocument(sources.documents.find(doc=>doc.id===ref.id));
  getStore().reviewDocuments(basis.map(ref=>ref.id));
  return report;
}

function importResearchReference(record) {
  const doc = documentRecord(record);
  const store = read(SOURCES_FILE, { documents: [], sources: {} });
  store.documents = [doc, ...(store.documents || []).filter(item => item.id !== doc.id)];
  write(SOURCES_FILE, store);
  getStore().putDocument(doc);
  return doc;
}

module.exports = { refreshResearchSources, getResearchFeed, publishResearchDraft, validateResearchReport, importResearchReference, researchDiscordPayload, retainedReferenceIds, researchMap };
