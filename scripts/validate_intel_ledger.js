// 檢查 research/warning_indicators.json：預警指標紀錄（entries）與多來源比對事件（mapEvents）。
// 定時研究寫完紀錄後執行：node scripts/validate_intel_ledger.js
// 有不合格的紀錄時以代碼 1 結束，並列出原因方向；不會修改檔案。
const fs = require('fs');
const path = require('path');
const { validEntry, buildWarningBoard } = require('../src/warning_board');
const { validMapEvent } = require('../src/battle_map');

const file = path.join(__dirname, '../research/warning_indicators.json');
let ledger;
try { ledger = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`JSON 無法讀取：${e.message}`); process.exit(1); }
const now = Date.now();
const badEntries = (ledger.entries || []).filter(e => !validEntry(e, now)).map(e => e?.id || '(無 id)');
const badEvents = (ledger.mapEvents || []).filter(e => !validMapEvent(e, now)).map(e => e?.id || '(無 id)');
const ids = [...(ledger.entries || []), ...(ledger.mapEvents || [])].map(e => e?.id);
const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
console.log(`預警指標紀錄 ${(ledger.entries || []).length} 筆，不合格 ${badEntries.length}${badEntries.length ? `：${badEntries.join(', ')}` : ''}`);
console.log(`比對事件 ${(ledger.mapEvents || []).length} 筆，不合格 ${badEvents.length}${badEvents.length ? `：${badEvents.join(', ')}` : ''}`);
if (dup.length) console.log(`重複 id：${[...new Set(dup)].join(', ')}`);
// 事件時間線串接欄位（選填）：thread、role、corrects
const { ROLES } = require('../src/event_timeline');
const idSet = new Set(ids);
const badThread = [...(ledger.entries || []), ...(ledger.mapEvents || [])].filter(e => e && (
  (e.thread !== undefined && !(typeof e.thread === 'string' && /^[\w-]{3,60}$/.test(e.thread))) ||
  (e.role !== undefined && !Object.hasOwn(ROLES, e.role)) ||
  (e.corrects !== undefined && !idSet.has(e.corrects)) ||
  (e.role === 'CORRECTION' && !e.corrects))).map(e => e.id);
console.log(`時間線串接欄位不合格 ${badThread.length}${badThread.length ? `：${badThread.join(', ')}` : ''}`);
const board = buildWarningBoard({ now, ledger, history: { snapshots: [] } });
for (const t of board.theaters) console.log(`${t.name}：${t.level ? `第 ${t.level} 級 ${t.levelName}` : '無法判定'}（未含自動來源）`);
if (badEntries.length || badEvents.length || dup.length || badThread.length) {
  console.log('常見原因：缺 https 來源、reviewed 不是 true、時間在未來、「多來源一致」卻只有一個發布者或全是交戰方聲稱、座標缺 basis；thread 只能用英數與 _-，role 為 CORRECTION 時須填 corrects（被更正的 id）。');
  process.exit(1);
}
