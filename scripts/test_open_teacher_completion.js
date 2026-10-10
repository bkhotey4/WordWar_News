const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  formatObservationDiff,
  checkMndCorrections,
  checkNotamRevisions,
  getPendingCorrections,
  formatCorrectionDiscordPayload
} = require('../src/correction_dispatcher');

const {
  formatArrivalPayload,
  checkNewArrivals
} = require('../src/satellite_assets');

const {
  loadAlertHistory,
  loadEvidenceLedger
} = require('./manage_ground_truth');

const { IntelStore } = require('../src/intel_store');

test('Correction Dispatcher: formats observation difference accurately', () => {
  const prior = {
    aircraft: { value: 12, unit: '架次' },
    ships: { value: 5, unit: '艘次' }
  };
  const current = {
    aircraft: { value: 15, unit: '架次' },
    ships: { value: 5, unit: '艘次' }
  };

  const diff = formatObservationDiff(prior, current);
  assert.match(diff, /共機架次: 原報 12 → 修正為 15/);
  assert.doesNotMatch(diff, /共艦艘次/); // Unchanged metric should not appear in diff
});

test('Correction Dispatcher: parses NOTAM cancellations and formats correction payload', () => {
  const item = {
    sourceType: 'NOTAM_CANCELLATION',
    title: 'NOTAM 航空管制通告撤銷：RCAA-TEST-001',
    recordedAt: new Date().toISOString(),
    summary: '原通告 RCAA-TEST-001 已由官方撤銷',
    url: 'https://www.anws.gov.tw/'
  };

  const payload = formatCorrectionDiscordPayload(item);
  assert.match(payload, /官方通報更正與撤回公告/);
  assert.match(payload, /NOTAM_CANCELLATION/);
  assert.match(payload, /RCAA-TEST-001/);
});

test('Satellite Arrival: formats arrival notice with strict limitations and quality badge', () => {
  const dummyAsset = {
    region: 'longtian',
    productId: 'S2B_MSIL2A_TEST_001',
    acquiredAt: '2026-09-27T02:00:00.000Z',
    tile: '51RUQ',
    cloudCoverPercent: 12,
    sourceProductUrl: 'https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2B_MSIL2A_TEST_001'
  };

  const payload = formatArrivalPayload(dummyAsset);
  assert.equal(payload.sourceBacked, true);
  assert.match(payload.content, /新衛星影像公開資料到達提示/);
  assert.match(payload.content, /longtian/);
  assert.match(payload.content, /S2B_MSIL2A_TEST_001/);
  assert.match(payload.content, /未進行兵力辨識或戰損判讀/);
  assert.match(payload.content, /部分雲遮/);

});

test('Ground Truth CLI: load and review interfaces function reliably', () => {
  const history = loadAlertHistory();
  assert.ok(Array.isArray(history.history));

  const ledger = loadEvidenceLedger();
  assert.ok(Array.isArray(ledger.events));
});

test('IntelStore: analysisHealth detects quota exhaustion and runner failure properly', () => {
  const store = new IntelStore(':memory:');
  
  // Normal state
  const normal = store.analysisHealth();
  assert.ok(['CODEX_SCHEDULED_RESEARCH', 'NOT_CONFIGURED'].includes(normal.automaticResearchRunner));

  // Simulate quota exhausted run status
  store.recordRunStatus({ success: false, quotaExhausted: true, error: 'insufficient_quota: model capacity exceeded' });
  const quotaHealth = store.analysisHealth();
  assert.equal(quotaHealth.automaticResearchRunner, 'QUOTA_EXHAUSTED');
  assert.match(quotaHealth.note, /額度耗盡或請求超速/);

  // Simulate runner failed status
  store.recordRunStatus({ success: false, quotaExhausted: false, error: 'network timeout connecting to API' });
  const failHealth = store.analysisHealth();
  assert.equal(failHealth.automaticResearchRunner, 'RUNNER_FAILED');
  assert.match(failHealth.note, /執行失敗/);

  // Clean up temporary test file in research
  const statusFile = path.join(__dirname, '../research/research_run_status.json');
  if (fs.existsSync(statusFile)) fs.unlinkSync(statusFile);
  store.close();
});
