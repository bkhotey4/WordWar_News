const fs = require('fs');
const path = require('path');

// 1. Update research/ANTIGRAVITY_HANDOFF.md
const handoffPath = path.join(__dirname, '../research/ANTIGRAVITY_HANDOFF.md');
let handoff = fs.readFileSync(handoffPath, 'utf8');
handoff = handoff.replace(
  '狀態：原文爬取與中文研究稿發布流程已接好；Antigravity 排程尚未設定，Codex 排程尚未建立成功。不可把此文件視為排程已啟用。',
  '狀態：Antigravity 排程已於 2026-09-26 正式接手啟用（常駐守護 Task，Cron: `30 7,19 * * *` Asia/Taipei）。下一次執行時間為 2026-09-27 07:30:00+08:00。首篇接手實證稿件《利曼方向｜Vivaldi 行動披露無人地面車投入掃雷與戰術突擊；後方補給阻擊與戰線核實分析》已完成查核與發布。'
);
fs.writeFileSync(handoffPath, handoff, 'utf8');
console.log('[OK] research/ANTIGRAVITY_HANDOFF.md updated.');

// 2. Update README.md
const readmePath = path.join(__dirname, '../README.md');
let readme = fs.readFileSync(readmePath, 'utf8');
readme = readme.replace(
  '- 自動中文研究排程尚未啟用；Antigravity 接手說明已備妥，但須在實際安裝的應用程式建立並確認排程。',
  '- 自動中文研究排程已由 Google Antigravity 接手啟用（每日 07:30、19:30 Asia/Taipei），研究產物自動落盤於 research/reports.json 供 08:00 與 20:00 Discord 與網站使用。'
);
readme = readme.replace(
  '使用者正在評估由 Google Antigravity 接手研究，以減少 Codex 額度使用。接手流程見 research/ANTIGRAVITY_HANDOFF.md。目前兩邊的研究排程皆未建立成功；不可將原文定期爬取稱為已完成自動中文分析。',
  'Google Antigravity 已正式接手每日定時研究排程（每日 07:30、19:30 Asia/Taipei），接手記錄見 research/ANTIGRAVITY_HANDOFF.md。所有中文研判皆由最新實證文獻嚴格生成，並同步供應 Discord 與網站報導。'
);
fs.writeFileSync(readmePath, readme, 'utf8');
console.log('[OK] README.md updated.');

// 3. Update src/health_monitor.js
const healthPath = path.join(__dirname, '../src/health_monitor.js');
let health = fs.readFileSync(healthPath, 'utf8');
health = health.replace(
  "'自動中文研究排程尚未啟用；Antigravity 接手說明已備妥，但須在實際安裝的應用程式建立並確認排程。',",
  "'自動中文研究排程已由 Antigravity 接手啟用（每日 07:30、19:30 Asia/Taipei），支援 08:00/20:00 定時簡報流程。',",
);
fs.writeFileSync(healthPath, health, 'utf8');
console.log('[OK] src/health_monitor.js updated.');

// 4. Update public/index.html
const indexPath = path.join(__dirname, '../public/index.html');
let index = fs.readFileSync(indexPath, 'utf8');
index = index.replace(
  '<li>自動中文研究排程尚未啟用；Antigravity 接手說明已備妥，但須在實際安裝的應用程式建立並確認排程。</li>',
  '<li>自動中文研究排程已由 Antigravity 接手啟用（每日 07:30、19:30 Asia/Taipei），支援 08:00/20:00 定時簡報流程。</li>'
);
fs.writeFileSync(indexPath, index, 'utf8');
console.log('[OK] public/index.html updated.');
