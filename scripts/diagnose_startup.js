const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const appData = process.env.APPDATA;
const startupDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
console.log('Startup Dir:', startupDir);

const files = fs.readdirSync(startupDir);
console.log('Files in Startup:', files);

const vbsFile = path.join(startupDir, 'WordWar_News.vbs');
if (fs.existsSync(vbsFile)) {
  const content = fs.readFileSync(vbsFile, 'utf8');
  console.log('--- WordWar_News.vbs content ---');
  console.log(content);
  console.log('--------------------------------');

  try {
    const testVbs = path.join(startupDir, 'WordWar_News_test.vbs');
    const vbsCode = [
      'Set WshShell = CreateObject("WScript.Shell")',
      'userProfile = WshShell.ExpandEnvironmentStrings("%USERPROFILE%")',
      'WshShell.CurrentDirectory = userProfile & "\\Desktop\\WordWar_News"',
      'WScript.Echo "CurrentDir set successfully: " & WshShell.CurrentDirectory'
    ].join('\r\n');
    fs.writeFileSync(testVbs, vbsCode, 'ascii');
    const res = execSync(`cscript //Nologo "${testVbs}"`);
    console.log('[TEST VBS RESULT]:', res.toString());
    fs.unlinkSync(testVbs);
  } catch (err) {
    console.log('[TEST VBS FAILED]', err.message, err.stdout ? err.stdout.toString() : '');
  }
} else {


  console.log('WordWar_News.vbs not found in Startup.');
}
