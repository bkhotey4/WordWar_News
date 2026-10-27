const fs = require('fs');
const path = require('path');

const startupDir = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const localBat = path.join(__dirname, '../Start_WordWar_Bot_Watchdog.bat');
const startupBat = path.join(startupDir, 'Start_WordWar_Bot_Watchdog.bat');

const batContent = `@echo off
chcp 65001 > nul
cd /d "%USERPROFILE%\\Desktop\\WordWar_News"
start "" /min powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "%USERPROFILE%\\Desktop\\WordWar_News\\bot_watchdog.ps1"
`;

// Remove old lock files
const localWatchdogLock = path.join(__dirname, '../watchdog.lock');
const localBotLock = path.join(__dirname, '../bot.lock');
if (fs.existsSync(localWatchdogLock)) fs.unlinkSync(localWatchdogLock);
if (fs.existsSync(localBotLock)) fs.unlinkSync(localBotLock);
console.log('[CLEAN] Removed stale lock files');

// Write local batch file
fs.writeFileSync(localBat, batContent, 'utf8');
console.log('[SUCCESS] Updated local batch file:', localBat);

// Write Startup batch file
fs.writeFileSync(startupBat, batContent, 'utf8');
console.log('[SUCCESS] Updated Startup batch file:', startupBat);
