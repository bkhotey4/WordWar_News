/**
 * Test Suite: OSINT Fusion Center, USGS Seismic Detonation Monitor & Enhanced Satellite Readability
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { formatArrivalPayload } = require('../src/satellite_assets');
const { parseUsgsFeatures, fetchUsgsSeismic } = require('../src/collectors/usgs_seismic');
const { generateOsintFusionReport, osintFusionDiscordPayload, evaluateTension } = require('../src/osint_fusion');
const { handleMessage } = require('../src/bot/dm_handler');

test('Enhanced Satellite Readability: Suwalki with 20.5% clouds filters junk image and provides readable intel', () => {
  const suwalkiAsset = {
    region: 'suwalki',
    productId: 'S2A_34UFE_20260927_1_L2A',
    acquiredAt: '2026-09-27T09:45:51.593Z',
    tile: '34UFE',
    cloudCoverPercent: 20.461893,
    sourceProductUrl: 'https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_34UFE_20260927_1_L2A',
    file: 'images/sentinel/S2A_34UFE_20260927_1_L2A.jpg'
  };

  const payload = formatArrivalPayload(suwalkiAsset);
  assert.equal(payload.sourceBacked, true);
  // Must filter junk image when cloud > 20%
  assert.equal(payload.files.length, 0, 'Junk cloudy image must NOT be attached to Discord');
  // Must provide tactical target details
  assert.match(payload.content, /蘇瓦烏基走廊/);
  assert.match(payload.content, /Via Baltica/);
  // Optical usability diagnosis
  assert.match(payload.content, /整片雲量高/);
  assert.match(payload.content, /縮圖不附上/);
  // Thermal telemetry cross-reference (no cloud-penetration claim)
  assert.match(payload.content, /NASA FIRMS 24h/);
  assert.doesNotMatch(payload.content, /穿雲/);
  // Interactive Copernicus browser link
  assert.match(payload.content, /Copernicus Browser 10m 原生影像檢視/);
  // Disclaimers intact
  assert.match(payload.content, /未進行兵力辨識或戰損判讀/);
  // Character limit compliance
  assert.ok(payload.content.length <= 2000, 'Content must fit inside Discord 2000-char limit');
});

test('Enhanced Satellite Readability: Low cloud asset attaches image and reports clear optical status', () => {
  const clearAsset = {
    region: 'longtian',
    productId: 'S2B_MSIL2A_TEST_CLEAR',
    acquiredAt: '2026-09-27T02:00:00.000Z',
    tile: '51RUQ',
    cloudCoverPercent: 4.5,
    sourceProductUrl: 'https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2B_MSIL2A_TEST_CLEAR'
  };

  const payload = formatArrivalPayload(clearAsset);
  assert.equal(payload.sourceBacked, true);
  assert.match(payload.content, /龍田前進空軍基地/);
  assert.match(payload.content, /整片雲量低/);
  assert.match(payload.content, /需看實際影像/);
  assert.ok(payload.content.length <= 2000);
});

test('USGS Seismic: parses features and detects shallow events in conflict regions', () => {
  const now = Date.now();
  const mockFeatures = [
    {
      id: 'event_toropets_explosion',
      properties: {
        mag: 2.8,
        place: '12 km W of Toropets, Russia',
        time: now - 3600000,
        type: 'explosion',
        title: 'M 2.8 Explosion - 12 km W of Toropets, Russia'
      },
      geometry: {
        coordinates: [31.65, 56.52, 1.5] // lon, lat, depth 1.5km (very shallow)
      }
    },
    {
      id: 'event_deep_pacific',
      properties: {
        mag: 4.5,
        place: 'Fiji Islands',
        time: now - 7200000,
        type: 'earthquake',
        title: 'M 4.5 Earthquake - Fiji'
      },
      geometry: {
        coordinates: [-178.5, -20.2, 550.0] // Outside conflict zone & deep
      }
    }
  ];

  const parsed = parseUsgsFeatures(mockFeatures, now);
  assert.equal(parsed.length, 1, 'Only conflict zone feature should be retained');
  assert.equal(parsed[0].id, 'event_toropets_explosion');
  assert.equal(parsed[0].isVeryShallow, true);
  assert.equal(parsed[0].isExplosionType, true);
  assert.equal(parsed[0].isSuspicious, true);
  assert.equal(parsed[0].theater, 'ukraine_front');
});

test('OSINT Fusion: evaluateTension properly calculates tension index and resonance', () => {
  // Scenario 1: Calm baseline
  const calm = evaluateTension({
    thermalHotspots: 2,
    thermalHighIntensity: 0,
    notamActiveCount: 0,
    officialActivitySurge: false,
    suspiciousSeismicCount: 0,
    infrastructureAnomalies: 0
  });
  assert.ok(calm.score <= 35);
  assert.equal(calm.isResonant, false);

  // Scenario 2: High tension with multi-sensor resonance (FIRMS + NOTAM + Official surge)
  const high = evaluateTension({
    thermalHotspots: 65,
    thermalHighIntensity: 2,
    notamActiveCount: 3,
    officialActivitySurge: true,
    officialNote: '共機68架次逾越海峽中線',
    suspiciousSeismicCount: 1,
    infrastructureAnomalies: 1
  });
  assert.ok(high.score >= 75);
  assert.equal(high.isResonant, true);
  assert.ok(high.resonantFactors.length >= 3);
  assert.equal(high.calibrated, false);

  // Scenario 3: missing sources are unknown, not zero
  const blind = evaluateTension({ thermalHotspots: null, thermalHighIntensity: null, notamActiveCount: null, officialActivitySurge: null, suspiciousSeismicCount: 0, infrastructureAnomalies: null });
  assert.equal(blind.unknownFactors.length, 3);
  assert.equal(blind.resonantFactors.length, 0);
});

test('OSINT Fusion: unconfigured NOTAM and missing data are reported as unknown, never as calm', async () => {
  const report = await generateOsintFusionReport('taiwan_strait');
  assert.equal(report.admiraltyRating, null);
  for (const key of ['firmsSummary', 'usgsSummary', 'notamSummary', 'twSummary', 'satSummary']) {
    assert.ok(['NORMAL', 'ANOMALY', 'UNKNOWN', 'NOT_APPLICABLE'].includes(report[key].state), key);
    if (report[key].state === 'UNKNOWN') assert.ok(report.tension.unknownFactors.length > 0 || key === 'satSummary', key);
  }
  const notam = require('../src/notam_monitor').getNotamFeed();
  if (notam.status === 'NOT_CONFIGURED') assert.equal(report.notamSummary.state, 'UNKNOWN');
  const payload = await osintFusionDiscordPayload('europe_security');
  assert.match(payload.content, /不適用/);
});

test('OSINT Fusion: osintFusionDiscordPayload produces structured Discord report <= 2000 chars', async () => {
  const payload = await osintFusionDiscordPayload('taiwan_strait');
  assert.equal(payload.sourceBacked, true);
  assert.match(payload.content, /公開情報多源交叉彙整研判/);
  assert.match(payload.content, /戰區張力指數/);
  assert.match(payload.content, /各來源狀態/);
  assert.match(payload.content, /沒有經過回測/);
  assert.doesNotMatch(payload.content, /60 日歷史常態|A1|穿雲/);
  assert.match(payload.content, /綜合說明/);
  assert.ok(payload.content.length <= 2000, `Length ${payload.content.length} exceeds Discord 2000 char limit`);
});

test('DM Handler: 查詢類關鍵字改回覆網站連結與指令說明，訂閱設定仍可用', async () => {
  const ask = async content => { const replies = []; await handleMessage({}, { author: { bot: false, id: 'cmd_user_1', tag: 'Commander#0001' }, channel: { type: 1 }, content, reply: async r => { replies.push(r); } }); return replies; };
  for (const text of ['公開資訊彙整 台海', '全球震動監測', '情報盲區', '戰場圖', '哨兵']) {
    const r = await ask(text);
    assert.equal(r.length, 1, text);
    assert.match(r[0].content, /bkhotey4\.github\.io\/wordwar-intel/, text);
    assert.match(r[0].content, /推播門檻/, text);
  }
});

test('Coverage Gap: analyzes reconnaissance blind spots and formats Discord payload <= 2000 chars', () => {
  const { analyzeCoverageGaps, coverageGapDiscordPayload } = require('../src/coverage_gap');
  const report = analyzeCoverageGaps();
  assert.ok(Array.isArray(report.theaters));
  assert.ok(report.theaters.length >= 5);
  
  const payload = coverageGapDiscordPayload();
  assert.equal(payload.sourceBacked, true);
  assert.match(payload.content, /戰區情報盲區與覆蓋缺口雷達/);
  assert.match(payload.content, /各大關鍵戰區即時覆蓋狀態/);
  assert.ok(report.theaters.every(t => t.coverageGrade !== 'FULL_COVERAGE'));
  assert.ok(report.theaters.filter(t => !require('../src/coverage_gap').THEATER_METRICS[t.theater].officialSource).every(t => t.officialStatus === 'UNVERIFIED' && t.coverageGrade !== 'CHECKED_SOURCES_OK'));
  assert.doesNotMatch(payload.content, /完整監控|穿雲/);
  assert.ok(payload.content.length <= 2000);
});

test('Enhanced Satellite Discord Payload: provides full readable tactical context and Copernicus deep link', () => {
  const { satelliteDiscordPayload } = require('../src/satellite_assets');
  const payload = satelliteDiscordPayload('longtian');
  assert.equal(payload.sourceBacked, true);
  assert.match(payload.content, /Sentinel-2 來源影像檢視/);
  assert.match(payload.content, /龍田前進空軍基地/);
  assert.match(payload.content, /Copernicus Browser 10m 原生影像檢視/);
  assert.match(payload.content, /NASA FIRMS 24h/);
  assert.doesNotMatch(payload.content, /穿雲/);
  assert.ok(payload.content.length <= 2000);
});

test('Sentry: records shallow seismic anomaly silently to alert history without DM broadcast', () => {
  const { evaluateThreats, getAlertHistory } = require('../src/sentry');
  const mockLiveData = {
    usgsSeismic: {
      success: true,
      suspiciousEvents: [
        {
          id: 'test_seismic_1',
          title: 'M 2.9 Explosion - Test Depot',
          place: '10 km N of Test Depot',
          magnitude: 2.9,
          depthKm: 1.8,
          latitude: 56.4,
          longitude: 31.7,
          theaterName: '烏俄前線與邊境戰區',
          time: new Date().toISOString(),
          url: 'https://earthquake.usgs.gov/'
        }
      ]
    }
  };

  const threat = evaluateThreats(mockLiveData);
  assert.equal(threat, null, 'Shallow seismic event must be recorded silently without broadcast');

  const history = getAlertHistory();
  const recorded = history.history.find(h => h.code === 'SEISMIC_SHALLOW_OBSERVATION');
  assert.ok(recorded, 'Must record SEISMIC_SHALLOW_OBSERVATION in history');
  assert.equal(recorded.quarantined, true);
  assert.equal(recorded.delivered, 0);
});

test('Enhanced Satellite Feed: provides multiBands, baseline, and tactical facilities', () => {
  const { getSatelliteFeed } = require('../src/satellite_assets');
  const feed = getSatelliteFeed();
  assert.ok(Array.isArray(feed.comparisons));
  if (feed.comparisons.length > 0) {
    const item = feed.comparisons[0];
    assert.ok(item.region);
    assert.ok(item.multiBands);
    assert.ok(typeof item.multiBands.rgb === 'string');
    assert.ok(typeof item.multiBands.swir === 'string');
    assert.ok(typeof item.multiBands.sar === 'string');
    assert.ok(Array.isArray(item.tacticalFacilities));
    assert.ok(item.baseline);
  }
});

test('Tactical Map Service: generates unified targets, firmsClusters, and notams', () => {
  const { getTacticalMapData } = require('../src/satellite_assets');
  const mapData = getTacticalMapData();
  assert.ok(Array.isArray(mapData.targets));
  assert.ok(Array.isArray(mapData.firmsClusters));
  assert.ok(Array.isArray(mapData.notams));
  assert.ok(typeof mapData.generatedAt === 'string');
  if (mapData.targets.length > 0) {
    const t = mapData.targets[0];
    assert.ok(Array.isArray(t.coords));
    assert.ok(typeof t.lat === 'number');
    assert.ok(typeof t.lon === 'number');
    assert.ok(t.multiBands);
    assert.match(t.multiBands.swir, /SWIR/);
    assert.match(t.multiBands.sar, /S1_CDAS_IW_GRD/);
  }
});
