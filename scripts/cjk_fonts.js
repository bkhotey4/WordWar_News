// 雲端（Linux）中文字型：@napi-rs/canvas 不一定找得到 workflow 從快取還原到 ~/.local/share/fonts 的 Noto Sans CJK，
// 找不到時地圖、海報與圖卡的中文全變成方框。由 patrol.yml 以 NODE_OPTIONS=--require 預先載入，明確註冊字型，
// 並把繪圖程式寫死的「Microsoft JhengHei」對應到 Noto Sans CJK TC。Windows 本機不做任何事。
const os = require('os');
const path = require('path');
const fs = require('fs');

const DIRS = [path.join(os.homedir(), '.local/share/fonts/noto'), '/usr/share/fonts/opentype/noto'];

function registerCjkFonts(dirs = DIRS) {
  if (process.platform !== 'linux') return 0;
  let GlobalFonts;
  try { ({ GlobalFonts } = require('@napi-rs/canvas')); } catch { return 0; }
  let count = 0;
  for (const dir of dirs) if (fs.existsSync(dir)) count += GlobalFonts.loadFontsFromDir(dir);
  // loadFontsFromDir 讀 .ttc 字型集合只載入第一個字型；NotoSansCJK-*.ttc 第一個是「Noto Sans CJK JP」，不是 TC。
  // 只認 TC 時對應永遠建不起來，中文全變方框（2026-10-27 發現）。所以哪一版 Noto Sans CJK 都接受（字集相同，只有少數字形差異），優先 TC。
  const names = GlobalFonts.families.map(f => f.family);
  const pick = ['TC', 'HK', 'SC', 'JP', 'KR'].map(v => `Noto Sans CJK ${v}`).find(n => names.includes(n));
  if (pick) for (const alias of ['Microsoft JhengHei', 'Noto Sans CJK TC']) if (alias !== pick) GlobalFonts.setAlias(pick, alias);
  // 寫進執行紀錄，之後看 GitHub Actions 的紀錄就知道字型有沒有載入
  if (!process.env.CJK_FONTS_LOGGED) { process.env.CJK_FONTS_LOGGED = '1'; console.error(`[CJK FONTS] 載入 ${count} 個字型檔，中文字型：${pick || '找不到（圖上的中文會變方框）'}`); }
  return count;
}

registerCjkFonts();
module.exports = { registerCjkFonts };
