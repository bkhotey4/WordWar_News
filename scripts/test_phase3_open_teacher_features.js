const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const testRoot=fs.mkdtempSync(path.join(require('os').tmpdir(),'wordwar-phase3-'));
process.env.WORDWAR_EVIDENCE_FILE=path.join(testRoot,'evidence.json');
process.env.WORDWAR_PREFS_FILE=path.join(testRoot,'preferences.json');
process.env.WORDWAR_NOTAM_REVISIONS_FILE=path.join(testRoot,'notam-revisions.json');

const {
  createEvidenceEvent,
  addEvidence,
  recordContradiction,
  getEvidenceEvent,
  getRecentEvidenceEvents,
  formatEvidencePayload
} = require('../src/evidence_ledger');

const {
  getUserPrefs,
  setUserPrefs,
  setTheaterSubscriptions,
  setQuietHours,
  isInQuietHours,
  shouldDeliverToUser,
  markEventDelivered,
  parseSubscriptionCommand
} = require('../src/subscription_manager');

const {
  assessCloudGrade,
  CLOUD_THRESHOLDS
} = require('../src/satellite_quality');

const {
  runBacktest,
  detectTheaterFromText
} = require('../src/alert_backtester');

const {
  getNotamFeed,
  recordNotamRevision,
  getNotamRevisions
} = require('../src/notam_monitor');

test('Feature 1: NOTAM revision and cancellation tracking works correctly', () => {
  const testNotam = {
    id: 'RCAA-TEST-REV-01',
    title: '實彈射擊操演測試',
    fir: 'RCAA',
    validFrom: new Date(Date.now() + 3600000).toISOString(),
    validTo: new Date(Date.now() + 7200000).toISOString()
  };
  recordNotamRevision('CANCELLED', testNotam);
  recordNotamRevision('REPLACED', testNotam, 'RCAA-TEST-REV-02');

  const revisions = getNotamRevisions();
  assert.ok(Array.isArray(revisions.cancellations));
  assert.ok(Array.isArray(revisions.revisions));

  const feed = getNotamFeed();
  assert.equal(feed.collectionMode, 'MANUAL_IMPORT_ONLY');
  assert.ok(['NOT_CONFIGURED','AUTO_FETCH_NOT_YET_CONFIGURED'].includes(feed.autoFetchStatus));
  assert.ok(feed.autoFetchNote.includes('尚未接通'));
});

test('Feature 2: Evidence Ledger creates, queries, and tracks contradictions', () => {
  const testEventId = `TEST-EVENT-${Date.now()}`;
  createEvidenceEvent({
    eventId: testEventId,
    title: '基輔能源設施空襲測試記錄',
    theater: 'ukraine_front',
    eventTime: new Date().toISOString(),
    location: { name: '基輔', lat: 50.45, lon: 30.52 },
    researcherNote: '多源交叉查證中'
  });

  const event = getEvidenceEvent(testEventId);
  assert.ok(event);
  assert.equal(event.verificationStatus, 'UNVERIFIED');

  // Add Source 1 (Reuters)
  addEvidence(testEventId, {
    publisher: '路透社 Reuters',
    url: `https://www.reuters.com/world/europe/test-strike-${Date.now()}`,
    publishedAt: new Date(Date.now() - 60000).toISOString(),
    excerpt: 'Ukrainian officials reported missile strikes on energy grid.',
    tier: 1,
    relationship: 'PRIMARY'
  });

  // Add Source 2 (AFP)
  addEvidence(testEventId, {
    publisher: '法新社 AFP',
    url: `https://www.afp.com/news/test-strike-afp-${Date.now()}`,
    publishedAt: new Date(Date.now() - 30000).toISOString(),
    excerpt: 'Power outages reported across districts following explosions.',
    tier: 1,
    relationship: 'PRIMARY'
  });

  const updated = getEvidenceEvent(testEventId);
  assert.equal(updated.sources.length, 2);
  assert.equal(updated.verificationStatus, 'SOURCES_RECORDED');

  // Record contradiction
  recordContradiction(testEventId, {
    sourceUrlA: updated.sources[0].url,
    sourceUrlB: updated.sources[1].url,
    claim: '烏方稱攔截全部飛彈',
    counterClaim: '地方政府通報多處變電所受損',
    researcherNote: '官方戰報與現場損害報導存在差異'
  });

  const payload = formatEvidencePayload(testEventId);
  assert.equal(payload.sourceBacked, true);
  assert.match(payload.content, /事件證據頁/);
  assert.match(payload.content, /路透社/);
  assert.match(payload.content, /法新社/);
  assert.match(payload.content, /相互矛盾說法/);
});

test('Feature 3: Subscription Manager handles theater filters, quiet hours, and dedup', () => {
  const testUserId = `test-user-${Date.now()}`;

  // Default: all theaters
  let prefs = getUserPrefs(testUserId);
  assert.deepEqual(prefs.theaters, ['all']);

  // Set theater subscription to taiwan_strait only
  setTheaterSubscriptions(testUserId, ['taiwan_strait']);
  prefs = getUserPrefs(testUserId);
  assert.deepEqual(prefs.theaters, ['taiwan_strait']);

  // Ukraine front alert should be suppressed
  const ukrAlert = { theater: 'ukraine_front', level: 'ELEVATED', code: 'TEST_UKR', eventId: 'ukr-001' };
  const ukrDecision = shouldDeliverToUser(testUserId, ukrAlert);
  assert.equal(ukrDecision.deliver, false);
  assert.match(ukrDecision.reason, /不在訂閱範圍內/);

  // Taiwan strait alert should pass
  const twAlert = { theater: 'taiwan_strait', level: 'ELEVATED', code: 'TEST_TW', eventId: 'tw-001' };
  const twDecision = shouldDeliverToUser(testUserId, twAlert);
  assert.equal(twDecision.deliver, true);

  // Mark delivered and verify dedup
  markEventDelivered(testUserId, 'tw-001');
  const repeatDecision = shouldDeliverToUser(testUserId, twAlert);
  assert.equal(repeatDecision.deliver, false);
  assert.match(repeatDecision.reason, /去重保護中/);

  // Test subscription commands parser
  assert.equal(parseSubscriptionCommand('訂閱戰區 台海').action, 'SET_THEATER');
  assert.equal(parseSubscriptionCommand('訂閱戰區 烏俄').theater, 'ukraine_front');
  assert.equal(parseSubscriptionCommand('靜默 23:00 07:00').action, 'SET_QUIET');
  assert.equal(parseSubscriptionCommand('取消靜默').action, 'CLEAR_QUIET');
  assert.equal(parseSubscriptionCommand('訂閱設定').action, 'SHOW_PREFS');
});

test('Feature 4: Satellite cloud quality assessor grades correctly', () => {
  assert.equal(assessCloudGrade(5).grade, 'CLEAR');
  assert.equal(assessCloudGrade(5).readable, null);
  assert.match(assessCloudGrade(5).badge, /裁切區可見度未確認/);

  assert.equal(assessCloudGrade(20).grade, 'PARTIALLY_OBSCURED');
  assert.equal(assessCloudGrade(20).readable, null);

  assert.equal(assessCloudGrade(45).grade, 'CLOUDY');
  assert.equal(assessCloudGrade(45).readable, null);

  assert.equal(assessCloudGrade(85).grade, 'UNUSABLE');
  assert.equal(assessCloudGrade(85).readable, null);

  assert.equal(assessCloudGrade(null).grade, 'UNKNOWN');
});

test('Feature 5: Alert backtesting engine correctly classifies alerts and outputs report', () => {
  assert.equal(detectTheaterFromText('烏克蘭首都遭飛彈空襲'), 'ukraine_front');
  assert.equal(detectTheaterFromText('共機 25 架次越過海峽中線'), 'taiwan_strait');
  assert.equal(detectTheaterFromText('紅海商船遭受無人機襲擊'), 'middle_east');

  const report = runBacktest({ windowDays: 30 });
  assert.ok(report);
  assert.ok(typeof report.totalAlerts === 'number');
  assert.ok(typeof report.totalGroundTruthEvents === 'number');
  assert.ok(report.categoryResults);
  assert.ok(report.researcherNote.includes('人工審查'));
});
