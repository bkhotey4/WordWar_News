const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  classifySource,
  extractEventEntities,
  evaluateIntelligenceReliability,
  formatVerifiedSitrep,
  quarantineNoise,
  getQuarantineRecords
} = require('../src/verification_engine');
const { evaluateThreats } = require('../src/sentry');

test('classifySource correctly distinguishes Tier 1 wires from Tier 4 aggregators like BigGo', () => {
  const biggo = classifySource('BigGo 財經', 'https://news.google.com/articles/biggo-test');
  assert.equal(biggo.tier, 4);
  assert.equal(biggo.reliability, 'E');
  assert.equal(biggo.isAggregator, true);

  const reuters = classifySource('Reuters', 'https://www.reuters.com/world/europe/airstrike');
  assert.equal(reuters.tier, 1);
  assert.equal(reuters.reliability, 'B');

  const mnd = classifySource('國防部發布', 'https://www.mnd.gov.tw/');
  assert.equal(mnd.tier, 1);
  assert.equal(mnd.reliability, 'A');

  const defNews = classifySource('Defense News', 'https://www.defensenews.com/');
  assert.equal(defNews.tier, 2);
  assert.equal(defNews.reliability, 'B');
});

test('extractEventEntities extracts theater, action and infrastructure claims', () => {
  const text = '俄羅斯空襲烏克蘭資料中心，10萬戶家庭斷網';
  const entities = extractEventEntities(text);
  assert.equal(entities.theater, 'ukraine_front');
  assert.equal(entities.actionType, 'AIRSTRIKE');
  assert.ok(entities.impactClaims.length > 0);
  assert.match(entities.impactClaims[0], /關鍵基礎設施受損/);
});

test('single unverified aggregator headline (BigGo) is quarantined with Grade E4 and blocked from broadcast', () => {
  const singleBiggoItem = {
    id: 'test-biggo-001',
    title: '俄羅斯空襲烏克蘭資料中心，10萬戶家庭斷網 - BigGo 財經',
    source: 'BigGo 財經',
    link: 'https://news.google.com/articles/biggo-item',
    publishedAt: new Date().toISOString()
  };

  const evaluation = evaluateIntelligenceReliability(singleBiggoItem, {}, [singleBiggoItem]);
  assert.equal(evaluation.admiraltyGrade, 'E4');
  assert.equal(evaluation.eligibleForBroadcast, false);
  assert.equal(evaluation.verdict, 'QUARANTINED');

});

test('unrelated theater heat and headlines cannot confirm an attack', () => {
  const wireItem = {
    id: 'wire-001',
    title: 'Russian missile and drone strikes hit Ukrainian energy hub - Reuters',
    source: 'Reuters',
    link: 'https://www.reuters.com/world/europe/strikes',
    publishedAt: new Date().toISOString()
  };

  const secondSource = {
    id: 'wire-002',
    title: 'Heavy airstrikes reported on Ukraine grid infrastructure - BBC News',
    source: 'BBC News',
    link: 'https://www.bbc.com/news/ukraine',
    publishedAt: new Date().toISOString()
  };

  const simulatedLiveData = {
    firmsFeed: {
      success: true,
      theater: 'ukraine_front',
      totalHotspots: 25,
      clustersCount: 4,
      highIntensityClusters: [{
        totalFrp: 78.5,
        centerLat: 48.5,
        centerLon: 37.6,
        latestObservedAt: new Date().toISOString()
      }]
    }
  };

  const evaluation = evaluateIntelligenceReliability(wireItem, simulatedLiveData, [wireItem, secondSource]);
  assert.equal(evaluation.admiraltyGrade,'B3');
  assert.equal(evaluation.eligibleForBroadcast, false);
  assert.equal(evaluation.verdict, 'QUARANTINED');
  assert.equal(evaluation.physicalTelemetry.corroborated, false);
  assert.equal(evaluation.crossCheck.count,0);

  // Formatter output test
  const sitrep = formatVerifiedSitrep(evaluation);
  assert.match(sitrep, /待查/);
  assert.doesNotMatch(sitrep, /完全證實|已完成四維自主核實/);
  assert.match(sitrep, /不能證實軍事攻擊/);
  // OPEN TEACHER FIX: 'operationalIntent' template field removed (was fabricated from headline).
  // Now verify that the tactical assessment no longer generates fake operational analysis.
  assert.doesNotMatch(sitrep, /作戰意圖.*已確認|受損目標.*已確認|已排除假消息/);
});

test('sentry evaluateThreats quarantines single BigGo lead and returns isVerified: false', () => {
  const live = {
    latestBreakingNews: [{
      id: 'test-single-biggo-distinct',
      title: '突發未核實軍事消息：俄羅斯空襲烏克蘭資料中心測試樣本 - BigGo 財經',
      source: 'BigGo 財經',
      link: 'https://example.com/biggo-airstrike-distinct',
      publishedAt: new Date().toISOString()
    }]
  };

  const alert = evaluateThreats(live,null,{persistQuarantine:false});
  assert.notEqual(alert, null);
  assert.equal(alert.isVerified, false);
  assert.equal(alert.quarantined, true);
  assert.equal(alert.admiraltyGrade, 'E4');
});
