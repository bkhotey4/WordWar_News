const fs = require('fs');
let code = fs.readFileSync('src/bot.js', 'utf8');

const bad1 = "      '• `/alert-explain`：統計觀察的觸發依據與不足處。\n      • `/firms`：NASA FIRMS 衛星實體火點與戰場熱異常遙測。\n      • `/notam`：航空禁航通告 (NOTAM) 與海空演習前置預警。',";
const bad2 = "      '• `/alert-explain`：統計觀察的觸發依據與不足處。\r\n      • `/firms`：NASA FIRMS 衛星實體火點與戰場熱異常遙測。\r\n      • `/notam`：航空禁航通告 (NOTAM) 與海空演習前置預警。',";

const good = "      '• `/alert-explain`：統計觀察的觸發依據與不足處。',\n      '• `/firms`：NASA FIRMS 衛星實體火點與戰場熱異常遙測。',\n      '• `/notam`：航空禁航通告 (NOTAM) 與海空演習前置預警。',";
const goodCRLF = "      '• `/alert-explain`：統計觀察的觸發依據與不足處。',\r\n      '• `/firms`：NASA FIRMS 衛星實體火點與戰場熱異常遙測。',\r\n      '• `/notam`：航空禁航通告 (NOTAM) 與海空演習前置預警。',";

if (code.includes(bad2)) {
  code = code.replace(bad2, goodCRLF);
} else if (code.includes(bad1)) {
  code = code.replace(bad1, good);
} else {
  // Regex fallback
  code = code.replace(
    /'• `\/alert-explain`[^\r\n]*[\r\n]+\s*• `\/firms`[^\r\n]*[\r\n]+\s*• `\/notam`[^']*,?/,
    good
  );
}

fs.writeFileSync('src/bot.js', code, 'utf8');
console.log('[OK] bot.js syntax fixed.');
