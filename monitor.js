/**
 * WordWar News - CMD 獨立監控面板 (monitor.js)
 * 完全獨立於 Antigravity，開機後雙擊即可執行
 * 每 30 秒自動刷新，顯示 Bot / Server / Watchdog 狀態與最新日誌
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORK_DIR = path.join(__dirname);
const REFRESH_SEC = 30;

function getProcessByCmd(keyword) {
  try {
    const result = spawnSync('powershell', [
      '-NoProfile', '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*${keyword}*" } | Select-Object -ExpandProperty ProcessId`
    ], { encoding: 'utf8', timeout: 5000 });
    const pids = (result.stdout || '').trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (pids.length > 0) return { found: true, pid: pids[0] };
  } catch (_) {}
  return { found: false, pid: null };
}


function isPortListening(port) {
  try {
    const result = spawnSync('netstat', ['-ano'], { encoding: 'utf8', timeout: 5000 });
    return (result.stdout || '').includes(`:${port}`) &&
           (result.stdout || '').split('\n').some(l => l.includes(`:${port}`) && l.includes('LISTENING'));
  } catch (_) { return false; }
}

function readLogTail(filePath, lines = 5) {
  try {
    if (!fs.existsSync(filePath)) return ['  (尚無日誌)'];
    const content = fs.readFileSync(filePath, 'utf8');
    const all = content.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
    return all.slice(-lines).map(l => '  ' + l);
  } catch (_) { return ['  (讀取失敗)']; }
}

function clearConsole() {
  process.stdout.write('\x1Bc');
}

function color(text, code) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

function renderDashboard() {
  clearConsole();

  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  console.log(color('============================================================', '36'));
  console.log(color(` WORDWAR NEWS - 系統狀態監控面板  ${now}`, '1;36'));
  console.log(color('============================================================', '36'));
  console.log();

  // 1. Discord Bot
  const bot = getProcessByCmd('src/bot.js');
  const botStatus = bot.found
    ? color(`✅ 執行中  PID: ${bot.pid}`, '1;32')
    : color('❌ 未偵測到 (可能尚未啟動)', '1;31');
  console.log(color('[1]', '33') + ' Discord Bot (src/bot.js)');
  console.log(`     狀態: ${botStatus}`);
  console.log();

  // 2. Web Server
  const serverUp = isPortListening(3000);
  const serverProc = getProcessByCmd('src/server.js');
  const serverStatus = serverUp
    ? color('✅ ONLINE  http://localhost:3000/api/status', '1;32')
    : color('❌ 離線 (Port 3000 未監聽)', '1;31');
  const serverPid = serverProc.found ? `  PID: ${serverProc.pid}` : '';
  console.log(color('[2]', '33') + ' Web 控制台 (src/server.js  port 3000)');
  console.log(`     狀態: ${serverStatus}${serverPid}`);
  console.log();

  // 3. Watchdog
  const watchdog = getProcessByCmd('bot_watchdog.ps1');
  const watchdogStatus = watchdog.found
    ? color(`✅ 執行中  PID: ${watchdog.pid}`, '1;32')
    : color('⚠️  未偵測到', '1;33');
  console.log(color('[3]', '33') + ' 守護進程 Watchdog (bot_watchdog.ps1)');
  console.log(`     狀態: ${watchdogStatus}`);
  console.log();

  // 4. Bot stdout 最新日誌
  console.log(color('[4]', '33') + ' Bot 最新日誌 (最後 5 行):');
  console.log(color('     ─'.repeat(25), '90'));
  const botLogs = readLogTail(path.join(WORK_DIR, 'logs', 'bot_stdout.log'), 5);
  botLogs.forEach(l => console.log(color(l, '37')));
  console.log();

  // 5. Watchdog log
  console.log(color('[5]', '33') + ' Watchdog 最新日誌 (最後 3 行):');
  console.log(color('     ─'.repeat(25), '90'));
  const wdLogs = readLogTail(path.join(WORK_DIR, 'logs', 'watchdog_ps.log'), 3);
  wdLogs.forEach(l => console.log(color(l, '37')));
  console.log();

  console.log(color('============================================================', '36'));
  console.log(color(` 自動刷新: 每 ${REFRESH_SEC} 秒  |  按 Ctrl+C 離開`, '90'));
  console.log(color('============================================================', '36'));
}

// Initial render
renderDashboard();

// Auto-refresh loop
setInterval(renderDashboard, REFRESH_SEC * 1000);

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n[監控] 已停止。');
  process.exit(0);
});
