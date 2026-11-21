const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Clear stale locks
const lock1 = path.join(__dirname, '../watchdog.lock');
const lock2 = path.join(__dirname, '../bot.lock');
if (fs.existsSync(lock1)) fs.unlinkSync(lock1);
if (fs.existsSync(lock2)) fs.unlinkSync(lock2);

const batPath = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Start_WordWar_Bot_Watchdog.bat');

console.log('[STARTUP TEST] Launching Start_WordWar_Bot_Watchdog.bat via WMI detached process...');
console.log('Target BAT:', batPath);

// Use WMI Win32_Process Create to launch detached background process exactly as Windows does
const escapedBat = batPath.replace(/\\/g, '\\\\');
const cmd = `powershell -NoProfile -Command "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = 'cmd.exe /c \\"${escapedBat}\\"' }"`;

const result = execSync(cmd).toString();
console.log('[WMI RESULT]:', result);

