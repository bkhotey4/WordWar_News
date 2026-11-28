// Internet Archive 備援：官方網站被擋時讀公開快照；快照時間要當作資料時間；不接受過舊或仍是擋頁的快照
const { test } = require('node:test');
const assert = require('node:assert/strict');
const af = require('../src/archive_fetch');

const now = Date.now();
const ts = d => new Date(d).toISOString().replace(/\D/g, '').slice(0, 14);
const fresh = ts(now - 3 * 3600_000), old = ts(now - 10 * 24 * 3600_000);
const CDX = `${fresh} 200 9000\n`;
function fakeFetch(map) {
  const calls = [];
  const impl = async (url, opt = {}) => {
    calls.push(url);
    for (const [re, reply] of map) if (re.test(url)) { const r = typeof reply === 'function' ? reply(url, opt) : reply; return { ok: (r.status || 200) < 400, status: r.status || 200, headers: new Map(), text: async () => r.text || '', json: async () => JSON.parse(r.text) }; }
    throw new Error(`no route for ${url}`);
  };
  impl.calls = calls;
  return impl;
}

test('stamp converts 14-digit Wayback timestamps', () => {
  assert.equal(af.stamp('20261012080050'), '2026-10-12T08:00:50.000Z');
  assert.equal(af.stamp('2026'), null);
});

test('direct fetch wins when the site answers normally', async () => {
  const f = fakeFetch([[/^https:\/\/www\.example\.gov\//, { text: '<html>real page</html>' }]]);
  const r = await af.fetchDirectOrArchive('https://www.example.gov/list.html', { hosts: ['www.example.gov'], fetchImpl: f });
  assert.equal(r.via, 'DIRECT'); assert.equal(r.archivedAt, null); assert.equal(f.calls.length, 1);
});

test('a Cloudflare challenge page counts as blocked even with HTTP 200; archive snapshot is used and dated', async () => {
  const f = fakeFetch([
    [/^https:\/\/www\.example\.gov\//, { text: '<html><head><title>Just a moment...</title></head></html>' }],
    [/cdx\/search/, { text: CDX }],
    [new RegExp(`web\\.archive\\.org/web/${fresh}id_/`), { text: '<html>archived list</html>' }]]);
  const r = await af.fetchDirectOrArchive('https://www.example.gov/list.html', { hosts: ['www.example.gov'], fetchImpl: f });
  assert.equal(r.via, 'ARCHIVE'); assert.equal(r.text, '<html>archived list</html>');
  assert.equal(r.archivedAt, af.stamp(fresh)); assert.match(r.directError, /HTTP 200/);
  assert.match(r.snapshotUrl, new RegExp(`/web/${fresh}/https://www\\.example\\.gov/list\\.html$`));
});

test('snapshots that are too old, too small, or block pages are rejected; availability API is the fallback', async () => {
  const tooOld = fakeFetch([[/^https:\/\/www\.example\.gov\//, { status: 403 }], [/cdx\/search/, { text: `${old} 200 9000\n` }]]);
  await assert.rejects(af.fetchDirectOrArchive('https://www.example.gov/x', { hosts: ['www.example.gov'], fetchImpl: tooOld, maxAgeHours: 48 }), /too old/);
  const blockSnap = fakeFetch([[/^https:\/\/www\.example\.gov\//, { status: 403 }], [/cdx\/search/, { text: CDX }], [/id_\//, { text: '<html><head><title>Attention Required! | Cloudflare</title></head></html>' }]]);
  await assert.rejects(af.fetchDirectOrArchive('https://www.example.gov/x', { hosts: ['www.example.gov'], fetchImpl: blockSnap }), /block page/);
  // CDX lists only tiny captures → fall back to availability API
  const avail = fakeFetch([[/^https:\/\/www\.example\.gov\//, { status: 403 }], [/cdx\/search/, { text: `${fresh} 200 120\n` }],
    [/wayback\/available/, { text: JSON.stringify({ archived_snapshots: { closest: { timestamp: fresh } } }) }], [/id_\//, { text: '<html>ok</html>' }]]);
  const r = await af.fetchDirectOrArchive('https://www.example.gov/x', { hosts: ['www.example.gov'], fetchImpl: avail });
  assert.equal(r.via, 'ARCHIVE');
});

test('only https URLs on the allowed hosts are fetched', async () => {
  await assert.rejects(af.fetchDirectOrArchive('https://evil.example/x', { hosts: ['www.example.gov'], fetchImpl: fakeFetch([]) }), /Unexpected URL host/);
  await assert.rejects(af.fetchViaWayback('http://www.example.gov/x', { hosts: ['www.example.gov'], fetchImpl: fakeFetch([]) }), /Unexpected URL host/);
});
