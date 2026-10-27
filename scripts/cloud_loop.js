// 雲端巡檢迴圈（.github/workflows/patrol.yml）：GitHub 的 cron 排程常被延後或略過（實測 */15 只有每 3～5 小時跑一次），
// 所以一次工作連續執行數小時，自己每 15 分鐘跑一輪「下載狀態 → 巡檢 → 上傳狀態」；排程只負責在上一輪結束後接上下一輪。
// 用法：node scripts/cloud_loop.js [總分鐘數，預設 330]
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUDGET = Number(process.argv[2] || 330) * 60_000;
const ROUND = 15 * 60_000;
const RESERVE = 20 * 60_000; // 一輪巡檢（含網站建置）最長約 20 分鐘，剩餘時間不夠就不再開新一輪
const started = Date.now();

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', timeout: RESERVE });
  return r.status === 0;
};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// 網站倉庫可能在兩輪之間被別處推送（例如本機手動發布），每輪先對齊遠端
function refreshSite() {
  const dir = path.join(ROOT, 'public_site');
  if (!fs.existsSync(path.join(dir, '.git'))) return run('git', ['clone', '-q', '--depth', '1', 'https://github.com/bkhotey4/wordwar-intel.git', 'public_site']);
  return run('git', ['-C', dir, 'fetch', '-q', '--depth', '1', 'origin']) && run('git', ['-C', dir, 'reset', '-q', '--hard', 'FETCH_HEAD']);
}

async function main() {
  let round = 0, failures = 0;
  while (Date.now() - started + RESERVE < BUDGET) {
    const roundStart = Date.now();
    round++;
    console.log(`::group::第 ${round} 輪（${new Date().toISOString()}）`);
    // 下載失敗時不巡檢也不上傳，以免舊資料蓋掉雲端；巡檢失敗仍要上傳推播紀錄，避免下一輪重發
    if (run(process.execPath, ['scripts/cloud_state.js', 'pull'])) {
      const ok = refreshSite() && run(process.execPath, ['scripts/cloud_patrol.js']);
      if (!run(process.execPath, ['scripts/cloud_state.js', 'sync', '--role', 'cloud']) || !ok) failures++;
    } else failures++;
    console.log('::endgroup::');
    // 對齊下一個整 15 分（:00、:15、:30、:45），與本機時期的巡檢節奏一致
    const next = Math.ceil((Date.now() + 1000) / ROUND) * ROUND;
    if (next - started + RESERVE >= BUDGET) break;
    await wait(Math.max(0, next - Date.now()));
    if (Date.now() - roundStart > 2 * ROUND) console.warn(`[CLOUD LOOP] 第 ${round} 輪超過 30 分鐘`);
  }
  console.log(`[CLOUD LOOP] 結束：${round} 輪、${failures} 輪失敗，共 ${Math.round((Date.now() - started) / 60_000)} 分鐘`);
  // 全部失敗才讓工作顯示失敗（GitHub 會寄信通知）；偶發失敗由下一輪補上
  process.exit(round && failures === round ? 1 : 0);
}

main();
