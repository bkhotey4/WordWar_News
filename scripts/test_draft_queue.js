const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dq = require('../src/draft_queue');

const NOW = Date.now();
const iso = h => new Date(NOW - h * 3600_000).toISOString();
const body = '閱讀筆記（全文）：' + '國防部今日公布共機與共艦動態，內容包含架次、越線與艦艇數量等官方統計資料，'.repeat(2);
const pkg = () => ({
  draft: { id: 'tw-test-1', title: '國防部公布聯合戰備警巡', theater: 'taiwan_strait',
    sections: [{ kind: 'REPORTED', label: '新進展', text: '共機 21 架次。', evidence: ['r1', 'r2'] }, { kind: 'ANALYSIS', label: '研判', text: '屬常見施壓。', evidence: ['r1'] }],
    cardPoints: [{ kind: 'REPORTED', label: '共機', text: '21 架次' }] },
  references: [
    { key: 'r1', url: 'https://www.cna.com.tw/a', title: 'a', publishedAt: iso(3), publisher: '中央社', originGroup: 'CNA', sourceType: 'NEWS_REPORT', body },
    { key: 'r2', url: 'https://news.ltn.com.tw/b', title: 'b', publishedAt: iso(2), publisher: '自由時報', originGroup: 'LTN', sourceType: 'NEWS_REPORT', body }]
});

test('structure check accepts a good package and explains problems', () => {
  assert.deepEqual(dq.checkPackage(pkg(), NOW), []);
  const bad = pkg(); bad.draft.sections[0].evidence = ['r9']; bad.draft.title = '衛星图'; bad.references[1].publishedAt = iso(80);
  const errs = dq.checkPackage(bad, NOW).join('\n');
  assert.match(errs, /只能引用 references/); assert.match(errs, /簡體字/);
  const unused = pkg(); unused.draft.sections = [unused.draft.sections[1]];
  assert.match(dq.checkPackage(unused, NOW).join('\n'), /r2 沒有被任何段落引用/);
});

test('queue imports sources, maps keys to ids, publishes, delivers and moves files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dq-'));
  const dirs = { pending: path.join(dir, 'p'), published: path.join(dir, 'ok'), rejected: path.join(dir, 'bad') };
  fs.mkdirSync(dirs.pending);
  fs.writeFileSync(path.join(dirs.pending, 'a.json'), JSON.stringify(pkg()));
  const broken = pkg(); broken.draft.theater = 'mars';
  fs.writeFileSync(path.join(dirs.pending, 'b.json'), JSON.stringify(broken));
  // 佇列只處理寫入超過 60 秒的檔案（避免讀到寫一半的稿）
  const old = new Date(Date.now() - 120_000);
  for (const f of fs.readdirSync(dirs.pending)) fs.utimesSync(path.join(dirs.pending, f), old, old);
  let published;
  const deps = { importResearchReference: r => ({ id: `id_${r.publisher}` }), publishResearchDraft: d => { published = d; return { id: d.id }; } };
  const res = await dq.processPendingDrafts({}, [{ userId: 'u' }], { dirs, deps, deliver: async (c, o) => o.reportIds.map(() => ({ status: 'SENT' })) });
  assert.deepEqual(res.map(r => r.status), ['PUBLISHED', 'REJECTED']);
  assert.deepEqual(published.sections[0].evidence, ['id_中央社', 'id_自由時報']);
  assert.deepEqual(published.sourceIds, ['id_中央社', 'id_自由時報']);
  assert.ok(fs.existsSync(path.join(dirs.published, 'a.json')));
  assert.match(fs.readFileSync(path.join(dirs.rejected, 'b.json.result.txt'), 'utf8'), /theater/);
  assert.equal(fs.readdirSync(dirs.pending).length, 0);
});
