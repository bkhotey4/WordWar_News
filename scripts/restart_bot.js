const { execSync } = require('child_process');

try {
  const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*bot.js*' -and $_.ProcessId -ne ${process.pid} } | Select-Object -ExpandProperty ProcessId"`;
  const output = execSync(psCmd).toString().trim();
  const pids = output.split(/\r?\n/).map(l => l.trim()).filter(l => /^\d+$/.test(l));
  
  if (pids.length > 0) {
    for (const pid of pids) {
      console.log(`[RESTART] Found bot.js PID ${pid}, stopping it...`);
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch (err) {
        execSync(`taskkill /F /PID ${pid}`);
      }
      console.log(`[RESTART] Terminated PID ${pid}. Watchdog will revive bot in 5s with new code.`);
    }
  } else {
    console.log('[RESTART] No bot.js PID detected.');
  }
} catch (e) {
  console.error('[RESTART ERROR]', e.message);
}
