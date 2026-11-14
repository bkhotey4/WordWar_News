// 換電腦：在新電腦取得完整程式碼後執行 node scripts/setup_new_pc.js（步驟見 README「換電腦」）
// 1. 本機分支整理成 main，並追蹤私人倉庫的 code 分支（之後 git pull 就能拿到另一台電腦發布的程式）
// 2. 安裝套件（沒有 node_modules 時）、建立 .env（npm run setup），設定雲端主控模式 CLOUD_PRIMARY=1
// 3. 從私人狀態倉庫下載最新資料（研究稿、報導、訂閱者、資料庫），並建立同步基準
// 4. 取得公開網站倉庫（public_site/），本機手動發布網站時使用
// 不會印出任何金鑰；DISCORD_BOT_TOKEN 等金鑰不在 git 裡，最後列出要手動填的項目。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SITE_REPO = 'https://github.com/bkhotey4/wordwar-intel.git';
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm', ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' }).trim();

function step(title, fn) {
  console.log(`\n== ${title}`);
  try { fn(); return true; } catch (e) { console.error(`  失敗：${e.message.split('\n')[0]}`); return false; }
}

function setEnv(key, value) {
  const file = path.join(ROOT, '.env');
  let text = fs.readFileSync(file, 'utf8');
  if (new RegExp(`^${key}=`, 'm').test(text)) return false;
  fs.writeFileSync(file, `${text.replace(/\s*$/, '')}\n# 雲端主控：巡檢、推播與網站更新由 GitHub Actions 執行，本機只回應斜線指令並同步資料\n${key}=${value}\n`);
  return true;
}

const results = [
  step('程式碼分支', () => {
    const { STATE_REPO } = require('./cloud_state');
    const { BACKUP_BRANCH } = require('./export_public_repo');
    const branch = out('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch !== 'main') run('git', ['branch', '-m', 'main']);
    const remotes = out('git', ['remote']).split(/\s+/);
    if (!remotes.includes('backup')) run('git', ['remote', 'add', 'backup', STATE_REPO]);
    run('git', ['fetch', '-q', 'backup', BACKUP_BRANCH]);
    run('git', ['branch', '-q', '-u', `backup/${BACKUP_BRANCH}`]);
    console.log(`  main 追蹤 backup/${BACKUP_BRANCH}；之後用 git pull 取得最新程式`);
  }),
  step('安裝套件', () => {
    if (fs.existsSync(path.join(ROOT, 'node_modules'))) { console.log('  node_modules 已存在，略過'); return; }
    run('npm', ['ci', '--no-audit', '--no-fund']);
  }),
  step('.env 設定', () => {
    run(process.execPath, ['scripts/setup_env.js']);
    console.log(setEnv('CLOUD_PRIMARY', '1') ? '  已加入 CLOUD_PRIMARY=1（雲端主控）' : '  CLOUD_PRIMARY 已設定，保留不變');
  }),
  step('下載雲端資料', () => {
    run(process.execPath, ['scripts/cloud_state.js', 'pull']);
  }),
  step('公開網站倉庫', () => {
    if (fs.existsSync(path.join(ROOT, 'public_site', '.git'))) { console.log('  public_site/ 已存在，略過'); return; }
    run('git', ['clone', '-q', '--depth', '1', SITE_REPO, 'public_site']);
  })
];

console.log(`\n完成 ${results.filter(Boolean).length}/${results.length} 項。${results.every(Boolean) ? '' : '失敗的項目修正後可重新執行本腳本（已完成的會略過）。'}`);
console.log(`接下來（手動）：
  1. 用記事本開 .env，填入 DISCORD_BOT_TOKEN、DISCORD_CLIENT_ID、COMMANDER_USER_ID，選填 GFW_TOKEN、CLOUDFLARE_RADAR_TOKEN（從密碼管理器或舊電腦的 .env 複製；不要放進 git 或聊天訊息）
  2. 雙擊「啟動戰情系統.bat」啟動網站與機器人；要開機自動啟動再執行 node scripts/install_startup_watchdog.js
  3. 舊電腦不再使用時，關掉它的機器人，避免兩台同時回應指令`);
