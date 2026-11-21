// 研究流程結束時呼叫，記錄這次執行的結果（含「無新內容」與失敗），研究排程健康頁靠這份紀錄判斷漏跑。
// 用法：node scripts/record_research_run.js --runner codex-discord --result PUBLISHED --published <稿件id> --note "說明"
//       result：PUBLISHED（有發布）／NO_NEW_CONTENT（跑完無新內容）／FAILED／QUOTA_EXHAUSTED
const { recordRun, RESULTS } = require('../src/research_health');

const args = process.argv.slice(2);
const opts = { published: [] };
for (let i = 0; i < args.length; i++) {
  const key = args[i].replace(/^--/, ''), value = args[i + 1];
  if (!args[i].startsWith('--') || value === undefined) { console.error(`參數錯誤：${args[i]}`); process.exit(2); }
  if (key === 'published') opts.published.push(value); else opts[key] = value;
  i++;
}
if (!opts.runner || !opts.result) {
  console.error(`需要 --runner 與 --result（${RESULTS.join('/')}）`);
  process.exit(2);
}
try {
  const run = recordRun({ runner: opts.runner, result: opts.result.toUpperCase(), note: opts.note || '', published: opts.published, startedAt: opts.started || null });
  console.log(JSON.stringify(run));
} catch (e) { console.error(e.message); process.exit(1); }
