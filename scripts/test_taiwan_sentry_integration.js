const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluateThreats } = require('../src/sentry');
const { getTaiwanFeed } = require('../src/taiwan_intel');

test('Taiwan Strait normal observations do not trigger sentry alert', () => {
  const normalFeed = {
    status: 'AVAILABLE',
    latest: {
      url: 'https://www.mnd.gov.tw/news/plaact/87838',
      observation: { periodStart: '2026-09-24T22:00:00.000Z', periodEnd: '2026-09-25T22:00:00.000Z' }
    },
    assessment: {
      status: 'OBSERVATION_AVAILABLE',
      indicators: [
        { metric: 'aircraft', current: 5, unit: '架次', historicalP95: 21, status: 'WITHIN_HISTORICAL_RANGE' }
      ]
    }
  };
  const alert = evaluateThreats({}, normalFeed);
  assert.equal(alert, null);
});

test('Taiwan Strait P95 surge respects missing opt-in and observation-only mode', () => {
  const surgeFeed = {
    status: 'AVAILABLE',
    latest: {
      url: 'https://www.mnd.gov.tw/news/plaact/87899',
      observation: { periodStart: '2026-09-25T22:00:00.000Z', periodEnd: '2026-09-26T22:00:00.000Z' }
    },
    assessment: {
      status: 'ANOMALY_REVIEW',
      indicators: [
        { metric: 'aircraft', current: 38, unit: '架次', historicalP95: 21, status: 'ABOVE_HISTORICAL_P95' }
      ]
    }
  };
  const alert = evaluateThreats({}, surgeFeed);
  assert.equal(alert, null); // Missing opt-in must fail closed.
  surgeFeed.assessment.pushEnabled=false;
  surgeFeed.assessment.mode='OBSERVATION_ONLY';
  assert.equal(evaluateThreats({},surgeFeed),null);
});
