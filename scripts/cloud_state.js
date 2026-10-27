// 雲端狀態同步：執行期資料（來源快取、推播紀錄、訂閱者、研究稿與報導）放在「私人」GitHub 倉庫，
// 雲端巡檢（GitHub Actions）、雲端研究排程與本機機器人共用同一份。程式碼在公開倉庫，這些資料不會公開。
//
// 以「檔案」為單位三方合併：記住上次同步時各檔案的雜湊（.cloud_state/base.json），
//   只有本機改了 → 上傳；只有遠端改了 → 下載；兩邊都改 → 雲端角色以本機為準、本機角色以遠端為準。
// 遠端倉庫永遠只保留一個提交（孤兒提交強制推送，以 lease 防止蓋掉別人剛推的版本；被搶先就重來），倉庫不會越長越大。
//
// 用法：
//   node scripts/cloud_state.js pull               雲端開工前：遠端資料覆蓋到工作目錄
//   node scripts/cloud_state.js sync --role cloud  雲端收工：合併後上傳（衝突以本次執行結果為準）
//   node scripts/cloud_state.js sync --role cloud --append  雲端研究排程收工：同上，但用一般提交、不強制推送
//   node scripts/cloud_state.js sync --role local  本機（雲端主控模式）：下載雲端資料，並上傳本機新寫的研究稿
// 倉庫網址：環境變數 STATE_REPO，預設 https://github.com/bkhotey4/worldwar-state.git（認證交給 git：本機用認證管理員，雲端用 STATE_TOKEN）
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = process.env.CLOUD_STATE_ROOT || path.join(__dirname, '..'); // 測試時指向暫存目錄
const WORK = path.join(ROOT, '.cloud_state');
const REPO_DIR = path.join(WORK, 'repo');
const BASE_FILE = path.join(WORK, 'base.json');
const STATE_REPO = process.env.STATE_REPO || 'https://github.com/bkhotey4/worldwar-state.git';

// 狀態範圍：研究資料夾、前端資料檔、訂閱者與推播紀錄。研究說明文件（*.md）與網站設定屬於程式碼，由公開倉庫管理
const ROOTS = ['research', 'public/data', 'src/subscribers.json', 'src/subscriber_prefs.json', 'src/alert_history.json'];
const EXCLUDE = [
  /^research\/[^/]+\.md$/, /^research\/(public_site|public_repo)\.json$/,
  /^research\/tile_cache\//, // 底圖圖磚只是快取，雲端另用 Actions 快取保存
  /\.sqlite-(wal|shm)$/, /\.tmp$/, /\.lock$/, /(^|\/)\.git(\/|$)/
];
const isState = rel => !EXCLUDE.some(re => re.test(rel));

const blobHash = buf => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
function walk(dir, rel, out) {
  let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r, out);
    else if (e.isFile() && isState(r)) out.push(r);
  }
  return out;
}
// 工作目錄中狀態檔的 git blob 雜湊
function workspaceHashes(root = ROOT) {
  const files = [];
  for (const r of ROOTS) {
    const p = path.join(root, r);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) walk(p, r, files); else if (isState(r)) files.push(r);
  }
  return Object.fromEntries(files.map(r => [r, blobHash(fs.readFileSync(path.join(root, r)))]));
}

// 三方合併決策（純函式，方便測試）：回傳要下載、上傳、本機刪除、遠端刪除的路徑
function plan(work, remote, base, role) {
  const out = { download: [], upload: [], deleteLocal: [], deleteRemote: [], conflicts: [] };
  for (const p of new Set([...Object.keys(work), ...Object.keys(remote)])) {
    const w = work[p], r = remote[p], b = base[p];
    if (w === r) continue;
    let take;
    if (w === b) take = 'remote';
    else if (r === b) take = 'local';
    else { take = role === 'cloud' ? 'local' : 'remote'; out.conflicts.push(p); }
    // 資料庫檔只由雲端寫入；本機開著資料庫時不覆寫也不上傳
    if (role === 'local' && /\.sqlite$/.test(p)) take = 'remote';
    if (take === 'remote') (r === undefined ? out.deleteLocal : out.download).push(p);
    else (w === undefined ? out.deleteRemote : out.upload).push(p);
  }
  return out;
}

// 兩邊都改的訂閱設定檔不整份取捨，而是合併：使用者設定（戰區、靜默、推播門檻、按鈕靜音）只由本機機器人回應私訊時寫入，以本機為準；
// 已送事件清單（去重用）兩邊都會寫，取聯集保留最後 50 筆。userText＝本機那份、cloudText＝雲端巡檢那份
const DELIVERY_KEYS = new Set(['suppressedEventIds']);
function mergePrefs(userText, cloudText) {
  const parse = t => { try { return JSON.parse(t).users || {}; } catch { return {}; } };
  const u = parse(userText), c = parse(cloudText), users = {};
  for (const id of new Set([...Object.keys(c), ...Object.keys(u)])) {
    const a = u[id] || {}, b = c[id] || {};
    const merged = { ...b, ...Object.fromEntries(Object.entries(a).filter(([k]) => !DELIVERY_KEYS.has(k))) };
    // 推播由雲端送出，雲端清單最新：本機獨有的放前面、雲端的接在後面，截掉最舊的
    const cloudIds = b.suppressedEventIds || [], cloudSet = new Set(cloudIds);
    merged.suppressedEventIds = [...new Set([...(a.suppressedEventIds || []).filter(x => !cloudSet.has(x)), ...cloudIds])].slice(-50);
    users[id] = merged;
  }
  return JSON.stringify({ users }, null, 2);
}
const MERGE = { 'src/subscriber_prefs.json': mergePrefs };

const git = (args, opts = {}) => execFileSync('git', args, { cwd: REPO_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000, windowsHide: true, maxBuffer: 64_000_000, ...opts });
// 取得遠端最新版本（淺層），回傳提交雜湊；空倉庫回傳 null
function fetchRemote() {
  fs.mkdirSync(WORK, { recursive: true });
  if (!fs.existsSync(path.join(REPO_DIR, '.git'))) {
    fs.mkdirSync(REPO_DIR, { recursive: true });
    git(['init', '-q']);
    git(['remote', 'add', 'origin', STATE_REPO]);
    git(['config', 'core.autocrlf', 'false']);
    git(['config', 'core.quotepath', 'false']);
  }
  git(['remote', 'set-url', 'origin', STATE_REPO]);
  const heads = git(['ls-remote', 'origin', 'refs/heads/main']).trim();
  if (!heads) { git(['read-tree', '--empty']); git(['clean', '-fdxq']); return null; }
  git(['fetch', '-q', '--depth', '1', 'origin', 'main']);
  git(['reset', '-q', '--hard', 'FETCH_HEAD']);
  git(['clean', '-fdxq']);
  return git(['rev-parse', 'HEAD']).trim();
}
function remoteHashes(sha) {
  if (!sha) return {};
  const out = {};
  for (const line of git(['ls-tree', '-r', '-z', sha]).split('\0')) {
    const m = line.match(/^\d+ blob ([0-9a-f]{40})\t(.+)$/);
    if (m && isState(m[2])) out[m[2]] = m[1];
  }
  return out;
}
const readBase = () => { try { return JSON.parse(fs.readFileSync(BASE_FILE, 'utf8')); } catch { return {}; } };
const writeBase = b => { fs.mkdirSync(WORK, { recursive: true }); fs.writeFileSync(BASE_FILE, JSON.stringify(b)); };

// mtime：從遠端下載的檔案改用遠端提交時間（不是下載當下），否則 draft_queue 會把剛下載的待發稿當成「寫入中」而每輪都跳過，
// 快取檔也會被誤判為剛更新
function copy(from, to, mtime) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const tmp = `${to}.${process.pid}.sync`;
  fs.copyFileSync(from, tmp);
  if (mtime) fs.utimesSync(tmp, mtime, mtime);
  fs.renameSync(tmp, to);
}
const commitTime = () => new Date(Number(git(['log', '-1', '--format=%ct']).trim()) * 1000);
// 收工前把 WAL 寫回主檔，上傳的資料庫才完整
function checkpointSqlite(root = ROOT) {
  for (const f of walk(path.join(root, 'research'), 'research', []).filter(r => /\.sqlite$/.test(r))) {
    try { const db = new (require('better-sqlite3'))(path.join(root, f)); db.pragma('wal_checkpoint(TRUNCATE)'); db.close(); } catch (e) { console.warn(`[CLOUD STATE] ${f} 無法 checkpoint：${e.message}`); }
  }
}

function pull() {
  const sha = fetchRemote();
  const remote = remoteHashes(sha);
  let n = 0;
  const mtime = sha && commitTime();
  for (const p of Object.keys(remote)) {
    const dest = path.join(ROOT, p);
    if (fs.existsSync(dest) && blobHash(fs.readFileSync(dest)) === remote[p]) continue;
    copy(path.join(REPO_DIR, p), dest, mtime); n++;
  }
  writeBase(remote);
  return `已下載雲端狀態：${Object.keys(remote).length} 個檔案，更新 ${n} 個${sha ? `（${sha.slice(0, 7)}）` : '（遠端是空的）'}`;
}

// append：在遠端最新提交之上加一般提交、不強制推送（本機與雲端研究排程用；雲端研究排程的 git 不允許強制推送）。
// 雲端巡檢每 15 分鐘用孤兒提交整個取代，所以一般提交累積的歷史會在下一輪被收掉
function sync(role, { seed = false, append = role === 'local' } = {}) {
  // 雲端角色衝突時以本機為準；沒有先 pull（沒有基準）就上傳，會讓程式碼倉庫裡的舊資料蓋掉雲端，所以拒絕（第一次建立遠端資料時用 --seed）
  if (role === 'cloud' && !seed && !fs.existsSync(BASE_FILE)) throw new Error('沒有同步基準（請先執行 pull）；為避免舊資料蓋掉雲端，已中止');
  if (role === 'cloud') checkpointSqlite();
  for (let attempt = 1; attempt <= 4; attempt++) {
    const sha = fetchRemote();
    const remote = remoteHashes(sha), work = workspaceHashes(), base = readBase();
    const p = plan(work, remote, base, role);
    for (const f of p.conflicts.filter(f => MERGE[f] && work[f] !== undefined && remote[f] !== undefined)) {
      const local = fs.readFileSync(path.join(ROOT, f), 'utf8'), cloud = fs.readFileSync(path.join(REPO_DIR, f), 'utf8');
      const merged = role === 'local' ? MERGE[f](local, cloud) : MERGE[f](cloud, local);
      const tmp = `${path.join(ROOT, f)}.${process.pid}.sync`;
      fs.writeFileSync(tmp, merged); fs.renameSync(tmp, path.join(ROOT, f));
      p.download = p.download.filter(x => x !== f);
      if (!p.upload.includes(f)) p.upload.push(f);
      p.merged = [...(p.merged || []), f];
    }
    const skipped = [];
    const mtime = sha && commitTime();
    for (const f of p.download) {
      try { copy(path.join(REPO_DIR, f), path.join(ROOT, f), mtime); } catch (e) { skipped.push(f); if (!/EBUSY|EPERM/.test(e.code || '')) throw e; }
    }
    for (const f of p.deleteLocal) { try { fs.unlinkSync(path.join(ROOT, f)); } catch { /* 已不存在或被占用 */ } }
    for (const f of p.upload) copy(path.join(ROOT, f), path.join(REPO_DIR, f));
    for (const f of p.deleteRemote) { try { fs.unlinkSync(path.join(REPO_DIR, f)); } catch { /* 已不存在 */ } }
    const summary = `下載 ${p.download.length - skipped.length}、上傳 ${p.upload.length}、刪除 ${p.deleteLocal.length + p.deleteRemote.length}${p.conflicts.length ? `、衝突 ${p.conflicts.length}（${p.merged ? `合併 ${p.merged.length}，其餘` : ''}${role === 'cloud' ? '以本次執行為準' : '以雲端為準'}）` : ''}${skipped.length ? `、${skipped.length} 個使用中未覆寫` : ''}`;
    if (!p.upload.length && !p.deleteRemote.length) {
      // 沒有要上傳的：基準＝遠端（未能覆寫的檔案保留舊基準，下次再試）
      const next = { ...remote };
      for (const f of skipped) if (base[f] !== undefined) next[f] = base[f]; else delete next[f];
      writeBase(next);
      return `同步完成：${summary}`;
    }
    git(['add', '-A']);
    const tree = git(['write-tree']).trim();
    const when = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
    const commit = git(['-c', 'user.name=WorldWar Bot', '-c', 'user.email=wordwar-bot@users.noreply.github.com', 'commit-tree', tree, ...(append && sha ? ['-p', sha] : []), '-m', `狀態 ${when}（${role}${append ? '' : '，整併'}）`]).trim();
    try {
      if (append) git(['push', '-q', 'origin', `${commit}:refs/heads/main`]);
      else git(['push', '-q', `--force-with-lease=main:${sha || ''}`, 'origin', `${commit}:refs/heads/main`]);
    } catch (e) {
      if (attempt === 4) throw new Error(`上傳失敗：${String(e.stderr || e.message).trim().split(/\r?\n/).pop()}`);
      console.log(`[CLOUD STATE] 遠端剛被更新，重新合併（第 ${attempt} 次）`);
      continue;
    }
    git(['reset', '-q', '--hard', commit]);
    const next = remoteHashes(commit);
    for (const f of skipped) if (base[f] !== undefined) next[f] = base[f]; else delete next[f];
    writeBase(next);
    return `同步完成：${summary}（${commit.slice(0, 7)}）`;
  }
}

module.exports = { mergePrefs, plan, workspaceHashes, blobHash, isState, ROOTS, STATE_REPO };

if (require.main === module) {
  const [cmd] = process.argv.slice(2);
  const role = (process.argv.find((a, i) => process.argv[i - 1] === '--role')) || 'cloud';
  try {
    if (cmd === 'pull') console.log(pull());
    else if (cmd === 'sync' && ['cloud', 'local'].includes(role)) console.log(sync(role, { seed: process.argv.includes('--seed'), ...(process.argv.includes('--append') ? { append: true } : {}) }));
    else { console.error('用法：node scripts/cloud_state.js pull | sync --role cloud|local [--seed] [--append]'); process.exit(2); }
  } catch (e) { console.error(`[CLOUD STATE] ${e.message}`); process.exit(1); }
}
