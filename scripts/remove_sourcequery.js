const fs = require('fs');
const path = require('path');

const botFile = path.join(__dirname, '../src/bot.js');
let code = fs.readFileSync(botFile, 'utf8');

const idx = code.indexOf('const sourceQuery =');
if (idx !== -1) {
  const endIdx = code.indexOf('let payload;', idx);
  if (endIdx !== -1) {
    code = code.substring(0, idx) + code.substring(endIdx);
    fs.writeFileSync(botFile, code, 'utf8');
    console.log('[SUCCESS] Successfully removed premature sourceQuery block from bot.js!');
  } else {
    console.error('Failed to locate let payload;');
  }
} else {
  console.error('Failed to locate const sourceQuery =');
}
