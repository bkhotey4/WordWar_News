// 排程研究任務寫完稿件後執行：node scripts/check_pending_draft.js research/drafts/pending/<檔名>.json
// 只做結構檢查（不需資料庫）；機器人發布時還會再完整驗證。
// 另外提醒（不擋發布）：台海等主戰區稿件若完全沒有提到官方或量測數據，印出「提醒」，請先跑 scripts/print_official_data.js 交叉比對。
const fs = require('fs');

// 官方與量測數據的常見用語：出現任一即視為有引用
const OFFICIAL_HINTS = {
  taiwan_strait: /國防部|共機|共艦|架次|航行警告|海事局|統合幕僚監部|海上保安廳|雷達衛星|Global Fishing Watch|AIS|證交所|外資|告警|台電|斷網|海纜|旅遊警示/,
  ukraine_front: /烏克蘭空軍|無人機\s*\d|飛彈\s*\d|DeepState|控制區|平方公里|km²/,
  iran_gulf: /UKMTO|布倫特|油價|旅遊警示|遇襲\s*\d/,
  europe_security: /領空|升空|旅遊警示|國防部|軍方公告/,
  korea_peninsula: /合參|聯合參謀|國防部|飛彈|旅遊警示/,
  south_china_sea: /海警|海巡|雷達衛星|AIS|國防部|旅遊警示/,
  middle_east: /國防軍|IDF|UKMTO|旅遊警示|衛生部/
};
function officialReminder(pkg) {
  const d = pkg?.draft || pkg;
  const re = OFFICIAL_HINTS[d?.theater];
  if (!re) return null;
  const text = [d.title, ...(d.sections || []).flatMap(s => [s.label, s.text]), ...(d.cardPoints || []).map(c => c.text)].filter(Boolean).join(' ');
  if (re.test(text)) return null;
  return `提醒：這篇 ${d.theater} 稿件沒有提到任何官方或量測數據。請先跑 node scripts/print_official_data.js ${d.theater}，把一致或矛盾的地方寫進「比對說明」；當天確實沒有相關數據就在稿中註明。（只是提醒，不影響發布）`;
}

module.exports = { officialReminder, OFFICIAL_HINTS };

if (require.main === module) {
  const { checkPackage } = require('../src/draft_queue');
  const file = process.argv[2];
  if (!file) { console.error('用法：node scripts/check_pending_draft.js <稿件.json>'); process.exit(1); }
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`JSON 讀取失敗：${e.message}`); process.exit(1); }
  const errors = checkPackage(pkg);
  if (errors.length) { console.error(`不合格 ${errors.length} 項：\n- ${errors.join('\n- ')}`); process.exit(1); }
  console.log(`合格：${pkg.draft.id}（${pkg.references.length} 個來源、${pkg.draft.sections.length} 段）`);
  const note = officialReminder(pkg);
  if (note) console.log(note);
}
