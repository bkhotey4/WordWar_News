const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appData = process.env.APPDATA;
const startupDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const vbsFile = path.join(startupDir, 'WordWar_News.vbs');

// Write the fixed pure-ASCII VBScript to Startup folder
const fixedVbsContent = [
  'Set WshShell = CreateObject("WScript.Shell")',
  'userProfile = WshShell.ExpandEnvironmentStrings("%USERPROFILE%")',
  'WshShell.CurrentDirectory = userProfile & "\\Desktop\\WordWar_News"',
  'WshShell.Run """C:\\Program Files\\nodejs\\node.exe"" watchdog.js", 0, False'
].join('\r\n') + '\r\n';

fs.writeFileSync(vbsFile, fixedVbsContent, 'ascii');
console.log('[STARTUP FIX] Successfully updated WordWar_News.vbs in Startup folder with pure ASCII %USERPROFILE% expansion.');

// Also test executing it right now using wscript to launch the bot
console.log('[STARTUP LAUNCH] Executing wscript on fixed WordWar_News.vbs...');
execSync(`wscript "${vbsFile}"`);
console.log('[STARTUP LAUNCH] wscript executed.');
