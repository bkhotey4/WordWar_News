const fs = require('fs');
const path = require('path');

// 1. Update research/ANTIGRAVITY_HANDOFF.md
const handoffPath = path.join(__dirname, '../research/ANTIGRAVITY_HANDOFF.md');
let handoff = fs.readFileSync(handoffPath, 'utf8');
handoff = handoff.replace(
  /狀態：Antigravity 排程已於 2026-09-26 正式接手啟用[^\n]+/,
  '狀態：Antigravity 背景排程已依使用者指示取消停用（目前無常駐排程 Task）。研究流程轉為依需求手動查核與發布；中文研究稿發布管線維持完整可用。'
);
fs.writeFileSync(handoffPath, handoff, 'utf8');
console.log('[OK] research/ANTIGRAVITY_HANDOFF.md updated.');

// 2. Update README.md
const readmePath = path.join(__dirname, '../README.md');
let readme = fs.readFileSync(readmePath, 'utf8');
readme = readme.replace(
  '- 自動中文研究排程已由 Google Antigravity 接手啟用（每日 07:30、19:30 Asia/Taipei），研究產物自動落盤於 research/reports.json 供 08:00 與 20:00 Discord 與網站使用。',
  '- 自動中文研究排程目前未啟用（依使用者指示取消背景常駐排程，採依需手動查核發布）；不可將原文定期爬取稱為已完成自動中文分析。'
);
readme = readme.replace(
  'Google Antigravity 已正式接手每日定時研究排程（每日 07:30、19:30 Asia/Taipei），接手記錄見 research/ANTIGRAVITY_HANDOFF.md。所有中文研判皆由最新實證文獻嚴格生成，並同步供應 Discord 與網站報導。',
  '定時研究排程已依指示取消停用，避免未經人工即時審查自動推送。中文研究報導採手動或指令觸發查核與發布。'
);
fs.writeFileSync(readmePath, readme, 'utf8');
console.log('[OK] README.md updated.');

// 3. Update src/health_monitor.js
const healthPath = path.join(__dirname, '../src/health_monitor.js');
let health = fs.readFileSync(healthPath, 'utf8');
health = health.replace(
  "'自動中文研究排程已由 Antigravity 接手啟用（每日 07:30、19:30 Asia/Taipei），支援 08:00/20:00 定時簡報流程。',",
  "'自動中文研究排程目前未啟用（依使用者指示取消常駐背景排程，採手動查核匯入）。',"
);
fs.writeFileSync(healthPath, health, 'utf8');
console.log('[OK] src/health_monitor.js updated.');

// 4. Update public/index.html
const indexPath = path.join(__dirname, '../public/index.html');
let index = fs.readFileSync(indexPath, 'utf8');
index = index.replace(
  '<li>自動中文研究排程已由 Antigravity 接手啟用（每日 07:30、19:30 Asia/Taipei），支援 08:00/20:00 定時簡報流程。</li>',
  '<li>自動中文研究排程目前未啟用（依使用者指示取消常駐背景排程，採手動查核匯入）。</li>'
);
fs.writeFileSync(indexPath, index, 'utf8');
console.log('[OK] public/index.html updated.');
