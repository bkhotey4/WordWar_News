/**
 * WordWar_News Watchdog Supervisor
 * Ensures server.js and bot.js are permanently running with auto-restart on crash.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function startSupervisor(scriptRelPath, logBaseName) {
  const scriptFullPath = path.join(__dirname, scriptRelPath);
  const logFilePath = path.join(LOGS_DIR, `${logBaseName}.log`);

  function spawnChild() {
    const timestamp = new Date().toISOString();
    const logHeader = `\n=======================================================\n[${timestamp}] 啟動行程: ${scriptRelPath}\n=======================================================\n`;
    fs.appendFileSync(logFilePath, logHeader, 'utf8');

    const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

    console.log(`[WATCHDOG] 正在啟動: ${scriptRelPath}`);
    const child = spawn(process.execPath, [scriptFullPath], {
      cwd: __dirname,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    child.on('error', (err) => {
      const errMsg = `[${new Date().toISOString()}] [ERROR] 啟動失敗: ${err.message}\n`;
      console.error(errMsg);
      fs.appendFileSync(logFilePath, errMsg, 'utf8');
    });

    child.on('exit', (code, signal) => {
      const exitMsg = `[${new Date().toISOString()}] [RESTART] 行程 ${scriptRelPath} 已退出 (Code: ${code}, Signal: ${signal})。將在 5 秒後自動重啟...\n`;
      console.log(exitMsg);
      fs.appendFileSync(logFilePath, exitMsg, 'utf8');
      setTimeout(spawnChild, 5000);
    });
  }

  spawnChild();
}

console.log('=======================================================');
console.log('[WATCHDOG] WordWar_News 守護行程已啟動，開始永久掛機監控');
console.log('=======================================================');

// startSupervisor('src/server.js', 'server'); // Decommissioned: pure image edition, no web server needed
startSupervisor('src/bot.js', 'bot');

