const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, '../src/bot.js');
let code = fs.readFileSync(botPath, 'utf8');

const target = "client.login(BOT_TOKEN).catch(err => {";
const idx = code.indexOf(target);

if (idx !== -1) {
  const endIdx = code.indexOf("});", idx);
  if (endIdx !== -1) {
    const replacement = `client.login(BOT_TOKEN).catch(err => {
    console.error('[DISCORD BOT] 登入失敗 (請確認 DISCORD_BOT_TOKEN 是否正確或等待網路連線):', err.message);
    process.exit(1);
  });`;
    code = code.slice(0, idx) + replacement + code.slice(endIdx + 3);
    fs.writeFileSync(botPath, code, 'utf8');
    console.log('[SUCCESS] bot.js updated to exit on login failure so watchdog automatically recovers!');
  } else {
    console.error('End of block not found');
  }
} else {
  console.error('Target not found in bot.js');
}
