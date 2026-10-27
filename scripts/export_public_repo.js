// 公開程式碼：把 git 追蹤的檔案複製到 public_repo/，排除個人資料與他人著作，遮蔽個人 ID 與電腦路徑，
// 掃描確認沒有金鑰後，以「單一提交」強制推到公開倉庫（不帶本機歷史紀錄，舊提交裡的資料不會外流）。
// 用法：node scripts/export_public_repo.js [--push]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public_repo');
const CONFIG = path.join(ROOT, 'research', 'public_repo.json');
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const cfg = readJson(CONFIG, {});

// 不公開：研究稿與執行紀錄（含媒體報導閱讀筆記）、一次性個人腳本、本機工具設定
const EXCLUDE = [
  /^research\/drafts\//, /^research\/runs\//, /^research\/preview_.*\.png$/, /^\.claude\//,
  /^scripts\/(apply_code_improvements|send_phase2_demo|send_russian_alert_direct|verify_dm|check_all_bots)\.js$/,
  ...(cfg.extraExclude || []).map(s => new RegExp(s))
];
// 遮蔽：個人 Discord ID 與應用程式 ID（從 .env 讀取，不寫死在程式裡）、電腦使用者路徑
const envVals = Object.fromEntries((() => { try { return fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/); } catch { return []; } })()
  .map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^['"]|['"]$/g, '')]));
const PRIVATE_IDS = ['COMMANDER_USER_ID', 'DISCORD_CLIENT_ID'].map(k => envVals[k]).filter(v => /^\d{17,20}$/.test(v || ''));
const REDACT = [
  ...PRIVATE_IDS.map(id => [new RegExp(id, 'g'), '']),
  [/C:\\Users\\[^\\"'\s]+\\Desktop\\WordWar_News/gi, '.'], [/c:\/Users\/[^/"'\s]+\/Desktop\/WordWar_News/gi, '.']
];
// 金鑰與個資掃描：任何一項命中就中止，不推送
const SECRET = [
  [/[MN][A-Za-z\d]{23,25}\.[\w-]{6}\.[\w-]{27,}/, 'Discord 機器人金鑰'], [/discord(app)?\.com\/api\/webhooks\/\d+/, 'Discord webhook'],
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, 'GitHub 金鑰'], [/(?<![A-Za-z0-9])sk-[A-Za-z0-9]{20,}/, 'API 金鑰'], [/AIza[0-9A-Za-z_-]{30,}/, 'Google 金鑰'],
  [/\b(?:ADMIN_API_KEY|DISCORD_BOT_TOKEN|NASA_FIRMS_KEY|FIRMS_MAP_KEY)\s*=\s*(?!YOUR_|your_)[A-Za-z0-9._-]{12,}/, '.env 金鑰值'],
  [/[\w.+-]+@gmail\.com/, '個人信箱'], [/C:\\Users\\[^\\]+\\/i, '電腦使用者路徑'],
  ...PRIVATE_IDS.map(id => [new RegExp(id), '個人 Discord ID'])
];
const TEXT = /\.(js|json|md|txt|html|css|ps1|bat|vbs|cmd|yml|yaml|example|gitignore)$|^\.env\.example$|^\.gitignore$/i;

function trackedFiles() {
  return execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
}

function exportFiles() {
  fs.rmSync(OUT, { recursive: true, force: true, maxRetries: 3 });
  fs.mkdirSync(OUT, { recursive: true });
  const problems = [], copied = [];
  for (const rel of trackedFiles()) {
    const norm = rel.replace(/\\/g, '/');
    if (EXCLUDE.some(re => re.test(norm))) continue;
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src) || fs.statSync(src).isDirectory()) continue;
    const dest = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (TEXT.test(path.basename(norm))) {
      let s = fs.readFileSync(src, 'utf8');
      for (const [re, rep] of REDACT) s = s.replace(re, rep);
      for (const [re, what] of SECRET) if (re.test(s)) problems.push(`${norm}：${what}`);
      fs.writeFileSync(dest, s);
    } else fs.copyFileSync(src, dest);
    copied.push(norm);
  }
  return { copied, problems };
}

function push() {
  if (!cfg.repo || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/.test(cfg.repo)) throw new Error('research/public_repo.json 未設定 repo');
  const git = (...a) => execFileSync('git', a, { cwd: OUT, stdio: 'pipe', encoding: 'utf8', timeout: 180000, windowsHide: true });
  git('init', '-q');
  git('remote', 'add', 'origin', cfg.repo);
  git('checkout', '-q', '-b', 'main');
  git('add', '-A');
  const when = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  git('-c', 'user.name=bkhotey4', '-c', 'user.email=8165571+bkhotey4@users.noreply.github.com', 'commit', '-q', '-m', `公開版本 ${when}`);
  git('push', '-q', '-f', 'origin', 'main');
  return cfg.repo.replace(/\.git$/, '');
}

// 換電腦用的完整備份：本機 main（含歷史、未遮蔽）推到私人狀態倉庫的 code 分支。
// 不強制推送：另一台電腦推過較新的版本時會被拒絕，先 git pull 再發布，避免舊電腦蓋掉新程式
const BACKUP_BRANCH = 'code';
function backupPush() {
  const { STATE_REPO } = require('./cloud_state');
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: 180000, windowsHide: true });
  try { git('push', '-q', STATE_REPO, `HEAD:refs/heads/${BACKUP_BRANCH}`); }
  catch (e) { throw new Error(`私人備份被拒絕（另一台電腦可能推過較新的程式）：先執行 git pull ${STATE_REPO} ${BACKUP_BRANCH} 再發布\n${e.stderr || e.message}`); }
  return `${STATE_REPO.replace(/\.git$/, '')}/tree/${BACKUP_BRANCH}`;
}

if (require.main === module) {
  const { copied, problems } = exportFiles();
  console.log(`已匯出 ${copied.length} 個檔案到 public_repo/`);
  if (problems.length) { console.error(`發現可能的金鑰或個資，已中止：\n- ${problems.join('\n- ')}`); process.exit(1); }
  if (process.argv.includes('--push')) {
    console.log(`已推送：${push()}`);
    console.log(`已備份完整程式碼：${backupPush()}`);
  }
}
module.exports = { exportFiles, EXCLUDE, REDACT, SECRET, BACKUP_BRANCH };
