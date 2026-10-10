const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildNewsReports } = require('../src/news_reports');
const now = Date.now();
const article = {
  title: 'Ukraine frontline report', source: 'Source fixture', link: 'https://example.test/news',
  publishedAt: new Date(now - 60_000).toISOString()
};
const map = {
  reviewed: true, displayAllowed: true, imageUrl: 'https://example.test/map.png',
  sourceUrl: 'https://example.test/map-post', credit: 'Original map author', caption: 'Author annotations',
  publishedAt: article.publishedAt
};

test('headlines cannot acquire an invented body or map', () => {
  const report = buildNewsReports({ latestBreakingNews: [{ ...article, summary: 'Unlinked claim', map: { ...map, reviewed: false } }] }, now)[0];
  assert.equal(report.summary, '');
  assert.equal(report.reportType, 'HEADLINE_ONLY');
  assert.equal(report.map, null);
});
test('a summary from another article cannot be reused', () => {
  const report = buildNewsReports({ latestBreakingNews: [{ ...article, summary: 'Wrong article body', summarySourceUrl: 'https://example.test/other' }] }, now)[0];
  assert.equal(report.summary, '');
});
test('map dates and permission are independent of current article dates', () => {
  for (const badMap of [
    { ...map, publishedAt: new Date(now - 25 * 60 * 60_000).toISOString() },
    { ...map, displayAllowed: false }, { ...map, sourceUrl: '' },
    { ...map, imageUrl: 'javascript:alert(1)' },
    { ...map, publishedAt: new Date(now + 60_000).toISOString() }
  ]) assert.equal(buildNewsReports({ latestBreakingNews: [{ ...article, map: badMap }] }, now)[0].map, null);
});
test('source excerpts and reviewed maps retain their own provenance', () => {
  const report = buildNewsReports({ latestBreakingNews: [{ ...article, summary: 'Source excerpt', summarySourceUrl: article.link, map }] }, now)[0];
  assert.equal(report.summary, 'Source excerpt');
  assert.equal(report.map.sourceUrl, map.sourceUrl);
  assert.equal(report.map.publishedAt, map.publishedAt);
  assert.equal(report.verification, 'SOURCE_CLAIM_UNVERIFIED');
});
test('old, future, unrelated and duplicate articles do not enter military reports', () => {
  const reports = buildNewsReports({ latestBreakingNews: [article, article,
    { ...article, link: 'https://example.test/old', publishedAt: new Date(now - 25 * 60 * 60_000).toISOString() },
    { ...article, link: 'https://example.test/future', publishedAt: new Date(now + 1).toISOString() },
    { ...article, link: 'https://example.test/sport', title: 'Football match highlights' }
  ] }, now);
  assert.equal(reports.length, 1);
});
