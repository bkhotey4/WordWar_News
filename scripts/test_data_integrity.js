const assert = require('node:assert/strict');
const { test } = require('node:test');
const { calculateGlobalCrisisMetrics } = require('../src/fetcher');
const { evaluateThreats } = require('../src/sentry');

const now = Date.parse('2026-09-25T01:00:00Z');

test('empty or static-only data never produces a new model score', () => {
  assert.equal(calculateGlobalCrisisMetrics({}, {}, now).crisisIndex, null);
  const staleStrategicData = {
    chinaMobilization: { roRoRequisitionRate: 99 },
    financialIndicators: { overallStatus: 'ALERT' },
    ww3DualTheater: { transitionIndicators: { carrierRedeployment: { happened: true } } }
  };
  assert.equal(calculateGlobalCrisisMetrics(staleStrategicData, {}, now).crisisIndex, null);
});

test('fresh ADS-B alone cannot produce a geopolitical crisis score', () => {
  const observations = {
    airspace: {
      success: true,
      timestamp: new Date(now - 60_000).toISOString(),
      midStraitCount: 2,
      foreignOrSpecial: []
    }
  };
  const result = calculateGlobalCrisisMetrics({}, observations, now);
  assert.equal(result.crisisIndex, null);
  assert.equal(result.isModelEstimate, true);
  assert.equal(result.dataConfidence, 'NONE');
  assert.deepEqual(result.observedSources, ['OpenSky ADS-B']);
});

test('stale or failed observations do not masquerade as fresh data', () => {
  const stale = {
    airspace: {
      success: true,
      timestamp: new Date(now - 16 * 60_000).toISOString(),
      midStraitCount: 7
    },
    mnd: { success: false, fetchedAt: new Date(now).toISOString(), extractedMetrics: { raw: { crossMedian: 40 } } }
  };
  assert.equal(calculateGlobalCrisisMetrics({}, stale, now).crisisIndex, null);
});

test('static strategic fields cannot trigger an automated alert', () => {
  assert.equal(evaluateThreats({
    chinaMobilization: { roRoRequisitionRate: 99 },
    financialIndicators: { overallStatus: 'ALERT' },
    ww3DualTheater: { transitionIndicators: { carrierRedeployment: { happened: true } } }
  }), null);
});

test('a timestamped headline only creates an unverified review lead', () => {
  const alert = evaluateThreats({ latestBreakingNews: [{
    title: 'blockade source review fixture 742906',
    link: 'https://example.test/source-review-742906',
    publishedAt: new Date().toISOString(),
    source: 'test fixture'
  }] },null,{persistQuarantine:false});
  assert.equal(alert?.level, 'ELEVATED');
  assert.equal(alert?.code, 'NEWS_HEADLINE_REVIEW');
  assert.match(alert?.summary || '', /尚未確認事件/);
});

test('STAC product metadata does not verify a local image', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const catalogPath = path.join(__dirname, '../public/data/imagery_catalog.json');
  assert.equal(fs.existsSync(catalogPath), true);
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.ok(Array.isArray(catalog.images));
  assert.ok(catalog.images.length > 0);
  for (const item of catalog.images) {
    if (item.catalogScene?.productId) {
      assert.equal(item.verified, false, `A catalog scene alone cannot verify local image ${item.id}`);
      assert.equal(item.acquiredAt, null);
      assert.equal(item.sourceProductUrl, null);
    }
    if (item.verified) {
      assert.ok(item.imageSourceProductId, `Item ${item.id} must link the local image to the product`);
      assert.ok(item.productId, `Item ${item.id} must have productId`);
      assert.ok(item.acquiredAt, `Item ${item.id} must have acquiredAt`);
      assert.ok(item.sourceProductUrl, `Item ${item.id} must have sourceProductUrl`);
      assert.equal(item.historicalReference, true, `Item ${item.id} must disclose historical reference nature`);
    }
  }
});

test('health monitor correctly flags stale sensors and enforces TTL', () => {
  const { evaluateSourceHealth } = require('../src/health_monitor');
  const staleData = {
    liveAirspace: {
      success: true,
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago (> 15m TTL)
      totalAircraftInStrait: 10
    }
  };
  const health = evaluateSourceHealth(staleData);
  assert.equal(health.sources.OpenSky_ADSB.status, 'STALE');
  assert.equal(health.qualityAudit.staleDataSuppressionActive, true);
});

test('future sensor timestamps cannot appear healthy', () => {
  const { evaluateSourceHealth } = require('../src/health_monitor');
  const health = evaluateSourceHealth({ liveAirspace: {
    success: true,
    timestamp: new Date(Date.now() + 10 * 60_000).toISOString(),
    totalAircraftInStrait: 5
  } });
  assert.equal(health.sources.OpenSky_ADSB.status, 'INVALID_TIME');
});
