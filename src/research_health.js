'use strict';
// 研究排程健康：排程設定、每次執行紀錄、上次成功、下次預定與漏跑偵測。
// 排程「已設定」不等於「已執行」；只有 research_runs.json 的紀錄能證明某次研究真的跑完。
const fs = require('fs');
const path = require('path');
const os = require('os');

const RUNS_FILE = path.join(__dirname, '../research/research_runs.json');
const SCHEDULES_FILE = path.join(__dirname, '../research/research_schedules.json');
const REPORTS_FILE = path.join(__dirname, '../research/reports.json');
const DELIVERY_FILE = path.join(__dirname, '../research/delivery_ledger.json');
const TZ_OFFSET = 8 * 3600_000; // 台北，無日光節約
const MISSED_GRACE = 2 * 3600_000; // 預定時間後 2 小時仍無紀錄才算漏跑
const RESULTS = ['PUBLISHED', 'NO_NEW_CONTENT', 'FAILED', 'QUOTA_EXHAUSTED'];
const OK_RESULTS = new Set(['PUBLISHED', 'NO_NEW_CONTENT']);
const MAX_RUNS = 300;

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, file);
}

function recordRun({ runner, result, note = '', published = [], startedAt = null, finishedAt = new Date().toISOString() }, file = RUNS_FILE) {
  if (typeof runner !== 'string' || !/^[a-z0-9_-]{2,40}$/.test(runner)) throw new Error('runner 須為 2–40 字元的英數、底線或連字號');
  if (!RESULTS.includes(result)) throw new Error(`result 須為 ${RESULTS.join('/')}`);
  if (!Number.isFinite(Date.parse(finishedAt))) throw new Error('finishedAt 無效');
  const data = readJson(file, { runs: [] });
  const run = { runner, result, finishedAt: new Date(finishedAt).toISOString(), startedAt, published: published.filter(Boolean).slice(0, 20), note: String(note).slice(0, 300) };
  data.runs = [...(data.runs || []), run].slice(-MAX_RUNS);
  writeJson(file, data);
  return run;
}

// 每天固定時刻（台北時間 HH:MM）
function parseTimes(list) {
  return (list || []).map(t => /^(\d{1,2}):(\d{2})$/.exec(t)).filter(Boolean).map(m => ({ h: +m[1], m: +m[2] })).filter(t => t.h < 24 && t.m < 60);
}
function rruleTimes(rule) {
  if (!/FREQ=DAILY/.test(rule || '')) return [];
  const hours = (/BYHOUR=([\d,]+)/.exec(rule)?.[1] || '').split(',').filter(Boolean).map(Number);
  const minutes = (/BYMINUTE=([\d,]+)/.exec(rule)?.[1] || '0').split(',').map(Number);
  return hours.flatMap(h => minutes.map(m => ({ h, m }))).filter(t => t.h < 24 && t.m < 60);
}
// 回傳 now 之前最近一次與之後下一次的預定時間
function scheduleWindow(times, now) {
  if (!times.length) return { previous: null, next: null };
  const local = new Date(now + TZ_OFFSET);
  const day0 = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TZ_OFFSET;
  const slots = [-1, 0, 1].flatMap(d => times.map(t => day0 + d * 86400_000 + (t.h * 60 + t.m) * 60_000)).sort((a, b) => a - b);
  return { previous: slots.filter(s => s <= now).pop() ?? null, next: slots.find(s => s > now) ?? null };
}

function codexSchedules(home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')) {
  const out = [];
  const dir = path.join(home, 'automations');
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let config;
    try { config = fs.readFileSync(path.join(dir, entry.name, 'automation.toml'), 'utf8'); } catch { continue; }
    if (!config.includes('WordWar_News') && !config.includes('RESEARCH_WORKFLOW.md')) continue;
    const field = name => config.match(new RegExp(`^${name}\\s*=\\s*"([^"\\r\\n]*)"`, 'm'))?.[1] || null;
    out.push({ runner: `codex-${field('id') || entry.name}`, name: field('name') || entry.name, app: 'Codex', active: field('status') === 'ACTIVE', rule: field('rrule'), times: rruleTimes(field('rrule')) });
  }
  return out;
}
function configuredSchedules(file = SCHEDULES_FILE) {
  return (readJson(file, { schedules: [] }).schedules || []).map(s => ({ runner: s.runner, name: s.name || s.runner, app: s.app || null, active: s.active !== false, rule: (s.times || []).join('、'), times: parseTimes(s.times) }));
}

function latestReportAt(file = REPORTS_FILE) {
  const reports = readJson(file, { reports: [] }).reports || [];
  const times = reports.map(r => Date.parse(r.generatedAt || r.asOf)).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}
// 研究稿送達紀錄在 SQLite research_delivery；舊版早晚報與警報在 delivery_ledger.json
function latestDeliveryAt(file = DELIVERY_FILE) {
  const times = Object.values(readJson(file, {})).map(r => r?.sentAt).filter(Number.isFinite);
  try {
    const db = require('./intel_store').getStore().db;
    const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='research_delivery'").get();
    const row = hasTable && db.prepare("SELECT max(attempted_at) AS t FROM research_delivery WHERE status='SENT'").get();
    if (Number.isFinite(row?.t)) times.push(row.t);
  } catch { /* 資料庫無法讀取時只用 JSON 紀錄 */ }
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

function assessSchedule(schedule, runs, now) {
  const mine = runs.filter(r => r.runner === schedule.runner).sort((a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt));
  const last = mine.at(-1) || null;
  const lastOk = [...mine].reverse().find(r => OK_RESULTS.has(r.result)) || null;
  const { previous, next } = scheduleWindow(schedule.times, now);
  let state, note;
  if (!schedule.active) { state = 'PAUSED'; note = '排程已停用。'; }
  else if (!mine.length) { state = 'NO_RECORD'; note = '尚無任何執行紀錄；排程已設定不代表研究已完成。'; }
  else if (last.result === 'QUOTA_EXHAUSTED') { state = 'QUOTA_EXHAUSTED'; note = `最近一次因額度不足失敗：${last.note || '未附說明'}`; }
  else if (last.result === 'FAILED') { state = 'FAILED'; note = `最近一次執行失敗：${last.note || '未附說明'}`; }
  else if (previous && now - previous > MISSED_GRACE && Date.parse(last.finishedAt) < previous - 30 * 60_000) {
    state = 'MISSED'; note = `預定 ${taipei(previous)} 的研究沒有紀錄（可能電腦關機、app 離線或執行中斷）。`;
  } else { state = 'OK'; note = last.result === 'PUBLISHED' ? '最近一次已發布新稿。' : '最近一次已執行，無新內容可發布。'; }
  return { ...schedule, times: undefined, state, note, lastRun: last, lastSuccessAt: lastOk?.finishedAt || null, previousScheduledAt: previous ? new Date(previous).toISOString() : null, nextScheduledAt: next ? new Date(next).toISOString() : null, recentRuns: mine.slice(-10).reverse() };
}
function taipei(ms) { return new Date(ms + TZ_OFFSET).toISOString().slice(5, 16).replace('T', ' '); }

function researchHealth({ now = Date.now(), runsFile = RUNS_FILE, schedules = null, codexHome } = {}) {
  const runs = readJson(runsFile, { runs: [] }).runs || [];
  const list = schedules || [...codexSchedules(codexHome), ...configuredSchedules()];
  const rows = list.map(s => assessSchedule(s, runs, now));
  const known = new Set(rows.map(r => r.runner));
  const unscheduled = [...new Set(runs.map(r => r.runner))].filter(r => !known.has(r));
  for (const runner of unscheduled) rows.push(assessSchedule({ runner, name: runner, app: null, active: true, rule: null, times: [] }, runs, now));
  const worst = ['QUOTA_EXHAUSTED', 'FAILED', 'MISSED', 'NO_RECORD', 'OK', 'PAUSED'].find(s => rows.some(r => r.state === s)) || 'NOT_CONFIGURED';
  return { generatedAt: new Date(now).toISOString(), overall: rows.length ? worst : 'NOT_CONFIGURED', schedules: rows, lastReportAt: latestReportAt(), lastDeliveryAt: latestDeliveryAt(),
    note: '「OK」只代表最近一次排程有執行紀錄；研究稿是否正確仍需比對原文。執行紀錄由研究流程結束時呼叫 scripts/record_research_run.js 寫入。' };
}

const STATE_NAMES = { OK: '正常', NO_RECORD: '無執行紀錄', MISSED: '漏跑', FAILED: '失敗', QUOTA_EXHAUSTED: '額度不足', PAUSED: '已停用', NOT_CONFIGURED: '未設定' };
const STATE_ICON = { OK: '🟢', NO_RECORD: '⚪', MISSED: '🟠', FAILED: '🔴', QUOTA_EXHAUSTED: '🔴', PAUSED: '⏸️', NOT_CONFIGURED: '⚪' };
function researchHealthText(health = researchHealth(), pending = null) {
  const lines = ['# 🧪 研究排程健康'];
  if (!health.schedules.length) lines.push('尚未偵測到任何研究排程。');
  for (const s of health.schedules) {
    lines.push(`${STATE_ICON[s.state]} **${s.name}**（${s.app || '未標示'}｜${s.rule || '無固定時刻'}）：${STATE_NAMES[s.state]}`);
    lines.push(`　上次成功：${s.lastSuccessAt ? taipei(Date.parse(s.lastSuccessAt)) : '無'}｜下次預定：${s.nextScheduledAt ? taipei(Date.parse(s.nextScheduledAt)) : '—'}（台北）`);
    lines.push(`　${s.note}`);
  }
  lines.push(`最新研究稿：${health.lastReportAt ? taipei(Date.parse(health.lastReportAt)) : '無'}｜最近 Discord 送達：${health.lastDeliveryAt ? taipei(Date.parse(health.lastDeliveryAt)) : '無'}`);
  if (pending !== null) lines.push(`待分析原文：${pending} 篇`);
  lines.push(health.note);
  return lines.join('\n').slice(0, 1900);
}

// 給 source_health 用：每個研究排程視為一個「來源」，超過時限沒有成功紀錄就通知管理者
function researchSourceRows(health = researchHealth()) {
  return health.schedules.filter(s => s.active && s.state !== 'PAUSED').map(s => ({ name: `研究排程：${s.name}`, lastSuccess: s.lastSuccessAt, status: s.state, detail: s.state === 'OK' ? null : s.note, limitHours: 14 }));
}

module.exports = { recordRun, researchHealth, researchHealthText, researchSourceRows, scheduleWindow, rruleTimes, parseTimes, assessSchedule, RUNS_FILE, RESULTS, STATE_NAMES };
