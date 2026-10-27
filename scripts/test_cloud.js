// 雲端執行：狀態同步三方合併、以本機 bare 倉庫模擬 GitHub 的完整來回、curl 備援在 Linux 也可用
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const CS = require('./cloud_state');

test('cloud_state.plan: 只改一邊就取那邊、兩邊都改依角色決定', () => {
  const base = { a: '1', b: '1', c: '1', d: '1', e: '1' };
  const work = { a: '1', b: '2', c: '2', e: '1', n: 'L' };          // b、c 本機改；d 本機刪；n 本機新增
  const remote = { a: '9', b: '1', c: '3', d: '1', m: 'R' };         // a 遠端改；c 遠端也改；e 遠端刪；m 遠端新增
  const cloud = CS.plan(work, remote, base, 'cloud');
  assert.deepStrictEqual(cloud.download.sort(), ['a', 'm']);
  assert.deepStrictEqual(cloud.upload.sort(), ['b', 'c', 'n']);
  assert.deepStrictEqual(cloud.deleteRemote, ['d']);
  assert.deepStrictEqual(cloud.deleteLocal, ['e']);
  assert.deepStrictEqual(cloud.conflicts, ['c']);
  const local = CS.plan(work, remote, base, 'local');
  assert.ok(local.download.includes('c') && !local.upload.includes('c'));
  // 本機角色：資料庫一律以雲端為準
  assert.deepStrictEqual(CS.plan({ 'research/x.sqlite': 'L' }, { 'research/x.sqlite': 'R' }, { 'research/x.sqlite': 'L' }, 'local').download, ['research/x.sqlite']);
});

test('cloud_state.isState: 研究說明文件、網站設定、圖磚快取與暫存檔不同步', () => {
  for (const p of ['research/INTEL_RESEARCH_TASK.md', 'research/public_site.json', 'research/tile_cache/a.png', 'research/intelligence.sqlite-wal', 'research/x.json.123.tmp']) assert.strictEqual(CS.isState(p), false, p);
  for (const p of ['research/reports.json', 'research/drafts/a.json', 'research/source_cache/gfw.json', 'research/intelligence.sqlite', 'src/subscribers.json']) assert.strictEqual(CS.isState(p), true, p);
  assert.strictEqual(CS.blobHash(Buffer.from('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a'); // 與 git hash-object 相同
});

test('cloud_state: 雲端與本機經由遠端倉庫來回同步，不互相覆蓋', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-cloud-'));
  const remote = path.join(tmp, 'state.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  const cloudDir = path.join(tmp, 'cloud'), localDir = path.join(tmp, 'local');
  const run = (root, ...args) => execFileSync(process.execPath, [path.join(__dirname, 'cloud_state.js'), ...args], { env: { ...process.env, CLOUD_STATE_ROOT: root, STATE_REPO: remote }, encoding: 'utf8' });
  const put = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  const get = (root, rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; } };
  try {
    // 沒有基準的雲端上傳會被拒絕（避免程式碼倉庫裡的舊資料蓋掉雲端）
    put(cloudDir, 'research/reports.json', 'v1');
    assert.throws(() => run(cloudDir, 'sync', '--role', 'cloud'), /沒有同步基準/);
    // 第一次建立遠端資料
    assert.match(run(cloudDir, 'sync', '--role', 'cloud', '--seed'), /上傳 1/);
    // 本機第一次同步：拿到雲端資料
    put(localDir, 'research/INTEL_RESEARCH_TASK.md', '說明文件不同步');
    run(localDir, 'sync', '--role', 'local');
    assert.strictEqual(get(localDir, 'research/reports.json'), 'v1');
    // 本機排程寫了新研究稿；同時雲端更新報導
    put(localDir, 'research/drafts/d1.json', '{"draft":1}');
    run(cloudDir, 'pull');
    put(cloudDir, 'research/reports.json', 'v2');
    put(cloudDir, 'research/source_cache/x.json', 'cache');
    run(cloudDir, 'sync', '--role', 'cloud');
    run(localDir, 'sync', '--role', 'local');
    assert.strictEqual(get(localDir, 'research/reports.json'), 'v2');
    assert.strictEqual(get(localDir, 'research/source_cache/x.json'), 'cache');
    // 雲端下一輪看得到本機的研究稿，且雲端自己的資料沒被蓋掉
    run(cloudDir, 'pull');
    assert.strictEqual(get(cloudDir, 'research/drafts/d1.json'), '{"draft":1}');
    // 下載的檔案帶遠端提交時間，不是下載當下（待發稿佇列只處理寫入超過 1 分鐘的檔案）
    const committed = Number(execFileSync('git', ['--git-dir', remote, 'log', '-1', '--format=%ct', 'main'], { encoding: 'utf8' })) * 1000;
    assert.strictEqual(Math.round(fs.statSync(path.join(cloudDir, 'research/drafts/d1.json')).mtimeMs / 1000) * 1000, committed);
    assert.strictEqual(get(cloudDir, 'research/reports.json'), 'v2');
    // 本機上傳用一般提交（不強制推送）；雲端研究排程同樣用 --append
    const count = () => execFileSync('git', ['--git-dir', remote, 'rev-list', '--count', 'main'], { encoding: 'utf8' }).trim();
    assert.strictEqual(count(), '2');
    const routineDir = path.join(tmp, 'routine');
    run(routineDir, 'pull');
    put(routineDir, 'research/beat_briefs.json', '{"items":[1]}');
    assert.match(run(routineDir, 'sync', '--role', 'cloud', '--append'), /上傳 1/);
    assert.strictEqual(count(), '3');
    // 雲端巡檢下一輪整併成單一提交，研究排程的成果保留
    put(cloudDir, 'research/reports.json', 'v3');
    run(cloudDir, 'sync', '--role', 'cloud');
    assert.strictEqual(count(), '1');
    run(cloudDir, 'pull');
    assert.strictEqual(get(cloudDir, 'research/beat_briefs.json'), '{"items":[1]}');
    assert.strictEqual(get(cloudDir, 'research/reports.json'), 'v3');
    // 說明文件不會被上傳
    assert.doesNotMatch(execFileSync('git', ['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'main'], { encoding: 'utf8' }), /\.md/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
  }
});

test('cloud_state: 訂閱設定檔兩邊同時改時合併，使用者設定以本機為準、已送清單取聯集', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-prefs-'));
  const remote = path.join(tmp, 'state.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  const cloudDir = path.join(tmp, 'cloud'), localDir = path.join(tmp, 'local');
  const run = (root, ...args) => execFileSync(process.execPath, [path.join(__dirname, 'cloud_state.js'), ...args], { env: { ...process.env, CLOUD_STATE_ROOT: root, STATE_REPO: remote }, encoding: 'utf8' });
  const F = 'src/subscriber_prefs.json';
  const put = (root, users) => { fs.mkdirSync(path.join(root, 'src'), { recursive: true }); fs.writeFileSync(path.join(root, F), JSON.stringify({ users }, null, 2)); };
  const get = root => JSON.parse(fs.readFileSync(path.join(root, F), 'utf8')).users.u1;
  try {
    put(cloudDir, { u1: { alertMode: 'all', suppressedEventIds: ['a'] } });
    run(cloudDir, 'sync', '--role', 'cloud', '--seed');
    run(localDir, 'sync', '--role', 'local');
    // 雲端巡檢開工後，本機使用者改了推播門檻並先同步上去
    run(cloudDir, 'pull');
    put(localDir, { u1: { alertMode: 'critical', suppressedEventIds: ['a'] } });
    assert.match(run(localDir, 'sync', '--role', 'local'), /上傳 1/);
    // 雲端這輪送了私訊（寫入已送清單），收工時兩邊都改過 → 合併，不能蓋掉使用者設定
    put(cloudDir, { u1: { alertMode: 'all', suppressedEventIds: ['a', 'b'] } });
    assert.match(run(cloudDir, 'sync', '--role', 'cloud'), /合併 1/);
    assert.deepStrictEqual(get(cloudDir), { alertMode: 'critical', suppressedEventIds: ['a', 'b'] });
    // 反方向：本機又改設定、雲端又送了私訊，本機同步時也合併
    put(cloudDir, { u1: { alertMode: 'critical', suppressedEventIds: ['a', 'b', 'c'] } });
    run(cloudDir, 'sync', '--role', 'cloud');
    put(localDir, { u1: { alertMode: 'important', suppressedEventIds: ['a'] } });
    assert.match(run(localDir, 'sync', '--role', 'local'), /合併 1/);
    assert.deepStrictEqual(get(localDir), { alertMode: 'important', suppressedEventIds: ['a', 'b', 'c'] });
    run(cloudDir, 'pull');
    assert.deepStrictEqual(get(cloudDir), { alertMode: 'important', suppressedEventIds: ['a', 'b', 'c'] });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
  }
});

test('curl 備援：Linux 用系統 curl、Windows 用 System32 curl.exe', async () => {
  const W = require('../src/win_fetch');
  let exe = null;
  const run = async (e) => { exe = e; return { stdout: Buffer.from('ok') }; };
  assert.strictEqual(await W.curlText('https://www.mod.go.jp/js/press/index.html', { hosts: ['www.mod.go.jp'], run, platform: 'linux' }), 'ok');
  assert.strictEqual(exe, 'curl');
  await W.curlText('https://www.mod.go.jp/js/press/index.html', { hosts: ['www.mod.go.jp'], run, platform: 'win32' });
  assert.match(exe, /System32[\\/]curl\.exe$/);
});

test('雲端巡檢：REST 用戶端補上機器人帳號後才能開私訊頻道', async () => {
  const { restClient, attachBotUser } = require('../src/discord_rest');
  const client = restClient('test-token');
  assert.throws(() => client.users.dmChannel('2'), /reading 'id'/); // 沒補帳號就是雲端推播失敗的原因
  client.rest.get = async route => { assert.strictEqual(route, '/users/@me'); return { id: '1', username: 'bot', discriminator: '0', bot: true }; };
  await attachBotUser(client);
  assert.strictEqual(client.user.id, '1');
  assert.strictEqual(client.users.dmChannel('2'), null);
  client.destroy();
});

test('雲端巡檢：patrol 匯出可單獨呼叫的一輪巡檢，REST 用戶端沒有 token 時明確報錯', () => {
  const P = require('../src/bot/patrol');
  assert.strictEqual(typeof P.patrolOnce, 'function');
  assert.strictEqual(typeof P.deliverReportsOnce, 'function');
  assert.throws(() => require('../src/discord_rest').restClient(''), /DISCORD_BOT_TOKEN/);
  const wf = fs.readFileSync(path.join(__dirname, '../.github/workflows/patrol.yml'), 'utf8');
  assert.match(wf, /cron: '7,37 \* \* \* \*'/);
  assert.match(wf, /node scripts\/cloud_loop\.js 330/);
  assert.match(wf, /timeout-minutes: 355/); // 迴圈 330 分鐘＋最後一輪與收尾
  assert.match(wf, /NODE_OPTIONS: --require \$\{\{ github\.workspace \}\}\/scripts\/cjk_fonts\.js/); // 中文字型
  assert.strictEqual(typeof require('./cjk_fonts').registerCjkFonts, 'function');
  // 迴圈：下載失敗的那輪不巡檢也不上傳
  const loop = fs.readFileSync(path.join(__dirname, 'cloud_loop.js'), 'utf8');
  assert.match(loop, /if \(run\(process\.execPath, \['scripts\/cloud_state\.js', 'pull'\]\)\)/);
  assert.doesNotMatch(wf, /ghp_|github_pat_/);
});
