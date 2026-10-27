const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appData = process.env.APPDATA;
const startupDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');

const batContent = [
  '@echo off',
  'cd /d "%USERPROFILE%\\Desktop\\WordWar_News"',
  'start "" /min powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "bot_watchdog.ps1"',
  ''
].join('\r\n');

// 1. Write local batch file
const localBat = path.join(__dirname, '../Start_WordWar_Bot_Watchdog.bat');
fs.writeFileSync(localBat, batContent, 'ascii');
console.log('[SUCCESS] Created local batch file:', localBat);

// 2. Write Startup batch file
const startupBat = path.join(startupDir, 'Start_WordWar_Bot_Watchdog.bat');
fs.writeFileSync(startupBat, batContent, 'ascii');
console.log('[SUCCESS] Installed batch file to Startup folder:', startupBat);

// 3. Remove deprecated WordWar_News.vbs from Startup if present
const deprecatedVbs = path.join(startupDir, 'WordWar_News.vbs');
if (fs.existsSync(deprecatedVbs)) {
  fs.unlinkSync(deprecatedVbs);
  console.log('[SUCCESS] Removed non-working WordWar_News.vbs from Startup.');
}

console.log('[INSTALLATION COMPLETE] WordWarNews auto-start configuration successfully updated.');
