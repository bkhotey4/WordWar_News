const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateResearchReport, researchDiscordPayload } = require('../src/research_reports');
const now = Date.now();
const publishedAt = new Date(now - 60_000).toISOString();
const sources = { documents: [{ id: 'a', contentHash: 'original', publishedAt, originGroup: 'MILITARY' }] };
const report = { reviewed: true, title: '研究報導', language: 'zh-Hant', asOf: publishedAt,
  generatedAt: new Date(now).toISOString(), basis: [{ id: 'a', contentHash: 'original' }],
  sections: [{ kind: 'ANALYSIS', label: '研判', text: '有來源的研判。', evidence: ['a'] }] };
test('source edits invalidate old analysis', () => {
  assert.equal(validateResearchReport(report, sources, now), true);
  assert.equal(validateResearchReport(report, { documents: [{ ...sources.documents[0], contentHash: 'changed' }] }, now), false);
});
test('missing paragraph references cannot publish a claim', () => {
  for (const evidence of [[], ['unread-source']]) {
    assert.equal(validateResearchReport({ ...report, sections: [{ ...report.sections[0], evidence }] }, sources, now), false);
  }
});
test('changing generation or report dates cannot freshen old source evidence', () => {
  assert.equal(validateResearchReport({ ...report, asOf: new Date(now).toISOString() }, sources, now), false);
  assert.equal(validateResearchReport(report, sources, now + 49 * 60 * 60_000), false);
  assert.equal(validateResearchReport({ ...report, generatedAt: new Date(now + 1000).toISOString() }, sources, now), false);
});
test('Discord payload includes original Chinese analysis and complete source links', () => {
  const payload = researchDiscordPayload();
  assert.ok(payload.content.length <= 2000);
  for (const embed of payload.embeds) {
    assert.ok(embed.description.length <= 4096);
    assert.ok((embed.fields||[]).every(field => field.value.length <= 1024));
    assert.ok((embed.fields||[]).every(field => field.value.includes('https://')));
    if(embed.image?.url?.startsWith('attachment://'))assert.ok(payload.files.some(f=>'attachment://'+f.name===embed.image.url));
  }
});

test('malformed references and oversized Discord descriptions fail closed', () => {
  for (const basis of ['invalid', [null], [...report.basis, ...report.basis]]) {
    assert.equal(validateResearchReport({ ...report, basis }, sources, now), false);
  }
  assert.equal(validateResearchReport({ ...report, sections: [{ ...report.sections[0], evidence: 'a' }] }, sources, now), false);
  const docs = { documents: Array.from({ length: 10 }, (_, i) => ({ id: String(i), contentHash: 'hash', publishedAt, publisher: '來源', url: 'https://example.com/' + 'a'.repeat(800) })) };
  const basis = docs.documents.map(doc => ({ id: doc.id, contentHash: doc.contentHash }));
  const sections = [{ kind: 'REPORTED', label: '來源', text: '資料', evidence: basis.map(ref => ref.id) }];
  assert.equal(validateResearchReport({ ...report, basis, sections }, docs, now), false);
});

test('an unused newer source cannot refresh the report date', () => {
  const newer = { id: 'b', contentHash: 'new', publishedAt: new Date(now).toISOString() };
  assert.equal(validateResearchReport({ ...report, asOf: newer.publishedAt, basis: [...report.basis, { id: 'b', contentHash: 'new' }] }, { documents: [...sources.documents, newer] }, now), false);
});
