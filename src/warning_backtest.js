'use strict';
// 預警回測（ANALYSIS_SPEC 第五節）：用各指標現行規則逐日重算歷史，對照 research/backtest_events.json 的參考事件，
// 計算命中、漏報、誤報與提前時間。只在指標資料實際涵蓋的期間內計分；資料不涵蓋的事件標示「無資料」，不算漏報。
const fs = require('fs');
const path = require('path');

const EVENTS_FILE = path.join(__dirname, '../research/backtest_events.json');
const REPORT_FILE = path.join(__dirname, '../research/backtest_report.json');
const HISTORY_FILE = path.join(__dirname, '../research/warning_history.json');
const DAY = 86400_000;
const TZ = 8 * 3600_000;
const LOOKBACK_DAYS = 7; // 事件開始前 7 天內觸發才算提前命中
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
// 台北日期 → 該日 23:59:59（以當日結束時的規則狀態代表這一天）
const dayEnd = date => Date.parse(`${date}T23:59:59+08:00`);
const dateOf = ms => new Date(ms + TZ).toISOString().slice(0, 10);

function loadEvents(file = EVENTS_FILE) {
  return (readJson(file, { events: [] }).events || []).filter(e => e.id && e.theater && /^\d{4}-\d{2}-\d{2}$/.test(e.start) && /^\d{4}-\d{2}-\d{2}$/.test(e.end || e.start)
    && (e.sources || []).some(s => { try { return new URL(s.url).protocol === 'https:'; } catch { return false; } }));
}

// 每個指標：theater、資料涵蓋起點、逐日是否觸發
function japanIndicator(cache = require('./collectors/japan_js').readCache()) {
  const { assessJapanJs } = require('./collectors/japan_js');
  const items = (cache.items || []).filter(i => i.kind !== 'OTHER');
  if (!items.length) return null;
  const first = Math.min(...items.map(i => Date.parse(`${i.date}T12:00:00+09:00`)));
  return { id: 'tw_japan_fleet', name: '日本統合幕僚監部：中國艦艇／軍機動向', theater: 'taiwan_strait', ruleVersion: 'js-china-7d-p95-v1',
    coverageStart: first + 67 * DAY, // 需 60 天基線＋7 天窗口
    coverageEnd: Date.parse(cache.lastSuccess || 0) || Date.now(),
    triggered: t => { const r = assessJapanJs({ ...cache, lastSuccess: new Date(t).toISOString() }, t); return r.status === 'CARRIER_OR_NEAR_TAIWAN' || r.status === 'ABOVE_HISTORICAL_P95'; },
    note: '日本只公布經過其周邊海域的動態，不涵蓋台灣西側；航艦或與那國附近通過即觸發。' };
}
function msaIndicator(cache = require('./collectors/china_msa').readCache()) {
  const { assessChinaMsa } = require('./collectors/china_msa');
  const times = (cache.notices || []).map(n => Date.parse(n.publishedAt)).filter(Number.isFinite);
  if (!times.length) return null;
  return { id: 'tw_nav_warning', name: '中國海事局軍事航行警告', theater: 'taiwan_strait', ruleVersion: 'msa-taiwan-7d-p95-v1',
    coverageStart: Math.min(...times) + 7 * DAY, coverageEnd: Date.parse(cache.lastSuccess || 0) || Date.now(),
    triggered: t => { const r = assessChinaMsa({ ...cache, lastSuccess: new Date(t).toISOString() }, t); return r.status === 'NEAR_TAIWAN' || r.status === 'ABOVE_HISTORICAL_P95'; },
    note: '快取只回溯首次採集時的列表頁，涵蓋期間短；基線不足 30 天時只有「中線以東」會觸發。' };
}
// 整體預警等級：用每次巡檢寫下的紀錄（無法重算過去），當日最高等級 ≥ 2 視為升溫訊號
function boardIndicators(history = readJson(HISTORY_FILE, { snapshots: [] })) {
  const by = {};
  for (const s of history.snapshots || []) (by[s.theater] = by[s.theater] || []).push(s);
  return Object.entries(by).map(([theater, list]) => {
    const days = {};
    for (const s of list) { const d = dateOf(Date.parse(s.at)); days[d] = Math.max(days[d] || 0, s.level || 0); }
    const dates = Object.keys(days).sort();
    return { id: `board_${theater}`, name: '預警看板等級（第 2 級以上）', theater, ruleVersion: [...new Set(list.map(s => s.ruleVersion))].join('、'),
      coverageStart: dayEnd(dates[0]), coverageEnd: dayEnd(dates.at(-1)), dayLevels: days,
      triggered: t => (days[dateOf(t)] || 0) >= 2,
      note: '等級無法回推到看板上線前；只計算有巡檢紀錄的日子。' };
  });
}

function episodesOf(days) {
  const out = [];
  for (const d of days) {
    const last = out.at(-1);
    if (last && d - last.end <= DAY + 1000) last.end = d; else out.push({ start: d, end: d });
  }
  return out;
}

function backtestIndicator(ind, events, now = Date.now()) {
  const end = Math.min(ind.coverageEnd, now);
  const mine = events.filter(e => e.theater === ind.theater);
  // 計分期間從最早參考事件前 60 天起算，避免十幾年前、規則與資料型態都不同的年份稀釋誤報率
  const periodStart = mine.length ? Math.max(ind.coverageStart, Math.min(...mine.map(e => dayEnd(e.start))) - 60 * DAY) : ind.coverageStart;
  const triggeredDays = [];
  let scored = 0;
  for (let t = dayEnd(dateOf(periodStart)); t <= end; t += DAY) { scored++; if (ind.triggered(t)) triggeredDays.push(t); }
  const episodes = episodesOf(triggeredDays);
  const results = mine.map(e => {
    const s = dayEnd(e.start) - DAY + 1000, eEnd = dayEnd(e.end || e.start); // s = 事件開始日 00:00:00 左右
    if (s - LOOKBACK_DAYS * DAY < ind.coverageStart || eEnd > end) return { eventId: e.id, name: e.name, start: e.start, outcome: 'NO_DATA' };
    const before = triggeredDays.filter(t => t >= s - LOOKBACK_DAYS * DAY && t < s);
    const during = triggeredDays.some(t => t >= s && t <= eEnd);
    if (before.length) return { eventId: e.id, name: e.name, start: e.start, outcome: 'HIT', leadDays: Math.round((dayEnd(e.start) - before[0]) / DAY), firstTrigger: dateOf(before[0]) };
    return { eventId: e.id, name: e.name, start: e.start, outcome: during ? 'DURING_ONLY' : 'MISS' };
  });
  // 誤報：觸發期間的開始不在任何事件開始前 7 天內，也不在事件期間
  const falseAlarms = episodes.filter(ep => !mine.some(e => { const s = dayEnd(e.start) - DAY + 1000; return ep.start >= s - LOOKBACK_DAYS * DAY && ep.start <= dayEnd(e.end || e.start); }));
  const covered = results.filter(r => r.outcome !== 'NO_DATA');
  const hits = covered.filter(r => r.outcome === 'HIT');
  const leads = hits.map(r => r.leadDays).sort((a, b) => a - b);
  return { id: ind.id, name: ind.name, theater: ind.theater, ruleVersion: ind.ruleVersion, note: ind.note,
    coverage: { from: dateOf(periodStart), to: dateOf(end), days: scored, dataFrom: dateOf(ind.coverageStart) },
    triggeredDays: triggeredDays.length, triggeredShare: scored ? Math.round(triggeredDays.length / scored * 1000) / 10 : null, episodes: episodes.length,
    eventsCovered: covered.length, hits: hits.length, misses: covered.filter(r => r.outcome === 'MISS').length, duringOnly: covered.filter(r => r.outcome === 'DURING_ONLY').length,
    // 沒有參考事件的戰區（例如進行中的戰爭）無從判斷誤報，不計
    falseAlarms: mine.length ? falseAlarms.length : null, falseAlarmsPer30Days: mine.length && scored ? Math.round(falseAlarms.length / scored * 30 * 100) / 100 : null,
    medianLeadDays: leads.length ? leads[Math.floor((leads.length - 1) / 2)] : null,
    recentFalseAlarms: (mine.length ? falseAlarms : []).slice(-5).map(ep => ({ from: dateOf(ep.start), to: dateOf(ep.end) })),
    events: results };
}

function runWarningBacktest({ now = Date.now(), events = loadEvents(), indicators = null } = {}) {
  const list = (indicators || [japanIndicator(), msaIndicator(), ...boardIndicators()]).filter(Boolean);
  const results = list.map(ind => backtestIndicator(ind, events, now));
  return { generatedAt: new Date(now).toISOString(), lookbackDays: LOOKBACK_DAYS, referenceEvents: events.map(e => ({ id: e.id, theater: e.theater, name: e.name, start: e.start, end: e.end, sources: e.sources })),
    indicators: results,
    method: `用各指標現行規則逐日重算（以台北日期當日結束時的狀態代表該日）。事件開始前 ${LOOKBACK_DAYS} 天內有觸發＝命中，提前天數取最早觸發日；只在事件期間觸發＝「僅事件期間」；資料不涵蓋＝無資料，不計漏報。觸發期間（連續觸發日）不在任何事件前 ${LOOKBACK_DAYS} 天或事件期間＝誤報。`,
    limitations: '參考事件只含已公開宣布的大型演習，未列入的小型活動也會被算成誤報；樣本數少，結果不能換算成開戰機率。國防部共機資料只回溯到 2026 年 8 月，無法重算 2022–2025 的事件。' };
}

function writeBacktestReport(report = runWarningBacktest(), file = REPORT_FILE) {
  const old = readJson(file, {});
  const legacy = old.warningBacktest ? old.legacyKeywordAlerts : (Object.keys(old).length ? old : undefined);
  const data = { warningBacktest: report, legacyKeywordAlerts: legacy };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1)); fs.renameSync(tmp, file);
  return data;
}

let memo = null;
function getWarningBacktest(now = Date.now()) {
  if (memo && now - memo.at < 6 * 3600_000) return memo.report;
  const report = runWarningBacktest({ now });
  memo = { at: now, report };
  return report;
}

const OUTCOME = { HIT: '命中', MISS: '漏報', DURING_ONLY: '僅事件期間觸發', NO_DATA: '無資料' };
function warningBacktestText(report = getWarningBacktest()) {
  const lines = ['# 📏 預警回測（試行）'];
  for (const r of report.indicators) {
    lines.push(`**${r.name}**（${r.theater}｜${r.coverage.from}～${r.coverage.to}）`);
    lines.push(`　參考事件 ${r.eventsCovered} 件：命中 ${r.hits}、漏報 ${r.misses}、僅期間 ${r.duringOnly}｜誤報 ${r.falseAlarms === null ? '—（無參考事件）' : `${r.falseAlarms} 次（每 30 天 ${r.falseAlarmsPer30Days}）`}｜提前中位數 ${r.medianLeadDays ?? '—'} 天｜觸發日佔 ${r.triggeredShare ?? '—'}%`);
    const ev = r.events.filter(e => e.outcome !== 'NO_DATA').map(e => `${e.name}：${OUTCOME[e.outcome]}${e.leadDays ? `（提前 ${e.leadDays} 天）` : ''}`);
    if (ev.length) lines.push(`　${ev.join('；')}`);
  }
  lines.push(report.limitations);
  return lines.join('\n').slice(0, 1990);
}

module.exports = { runWarningBacktest, writeBacktestReport, getWarningBacktest, warningBacktestText, backtestIndicator, episodesOf, loadEvents, japanIndicator, msaIndicator, boardIndicators, OUTCOME };
