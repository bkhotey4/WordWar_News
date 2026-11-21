// 雲端巡檢一輪（GitHub Actions 每 15 分鐘執行，見 .github/workflows/patrol.yml）：
// 與本機機器人同一套 patrolOnce（抓資料、預警看板、Discord 私訊、研究稿發布、網站更新），
// 差別只在 Discord 走 REST（不常駐連線），網站建置在這裡等它完成才結束。
// 執行前後由 workflow 呼叫 scripts/cloud_state.js 下載／上傳私人狀態倉庫。
require('dotenv').config({ quiet: true });
const { execFile } = require('child_process');

async function main() {
  const { restClient, attachBotUser } = require('../src/discord_rest');
  const { patrolOnce, deliverReportsOnce } = require('../src/bot/patrol');
  const client = await attachBotUser(restClient());
  const pending = [];
  // 網站排程原本在子行程背景執行；這裡把子行程包成 Promise，巡檢結束前等它推送完
  const run = (cmd, args, opts, cb) => pending.push(new Promise(resolve => execFile(cmd, args, opts, (err, stdout, stderr) => {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    try { cb(err, stdout, stderr); } finally { resolve(); }
  })));
  const publish = () => require('../src/public_site_scheduler').maybePublish({ run });
  const started = Date.now();
  try {
    await patrolOnce(client, { publish });
    await deliverReportsOnce(client);
    await Promise.all(pending);
  } finally {
    client.destroy();
  }
  console.log(`[CLOUD PATROL] 完成，耗時 ${Math.round((Date.now() - started) / 1000)} 秒`);
}

main().then(() => process.exit(0), e => { console.error('[CLOUD PATROL ERROR]', e); process.exit(1); });
