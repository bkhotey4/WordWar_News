const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseFirmsCsv, clusterHotspots, firmsDiscordPayload, THEATER_BOUNDS } = require('../src/firms_monitor');
const { evaluateMilitaryNotams, getNotamFeed, notamDiscordPayload } = require('../src/notam_monitor');

test('NASA FIRMS correctly parses CSV lines and respects theater bounding box', () => {
  const csv = [
    'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight',
    '48.35,37.80,340.5,0.4,0.4,2026-09-26,1230,N,nominal,2.0NRT,295.2,45.8,D',
    '48.36,37.82,345.1,0.4,0.4,2026-09-26,1230,N,nominal,2.0NRT,296.0,52.1,D',
    '10.00,10.00,340.0,0.4,0.4,2026-09-26,1230,N,nominal,2.0NRT,290.0,30.0,D' // Outside Ukraine box
  ].join('\n');

  const points = parseFirmsCsv(csv, 'ukraine_front',Date.parse('2026-09-26T13:00:00Z'));
  assert.equal(points.length, 2); // The 3rd point is filtered out by bounding box
  assert.equal(points[0].latitude, 48.35);
  assert.equal(points[0].frp, 45.8);
  assert.equal(points[0].timestamp, '2026-09-26T12:30:00.000Z');
});

test('NASA FIRMS clusters proximal fire points and assigns intensity based on FRP', () => {
  const points = [
    { latitude: 48.35, longitude: 37.80, frp: 60, timestamp: '2026-09-26T12:00:00.000Z', theater: 'ukraine_front' },
    { latitude: 48.36, longitude: 37.81, frp: 50, timestamp: '2026-09-26T12:10:00.000Z', theater: 'ukraine_front' },
    { latitude: 48.37, longitude: 37.82, frp: 50, timestamp: '2026-09-26T12:20:00.000Z', theater: 'ukraine_front' },
    { latitude: 48.35, longitude: 37.83, frp: 40, timestamp: '2026-09-26T12:30:00.000Z', theater: 'ukraine_front' }
  ];

  const clusters = clusterHotspots(points, 15);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].pointCount, 4);
  assert.equal(clusters[0].totalFrp, 200);
  assert.equal(clusters[0].intensity, 'HIGH');
  assert.equal(clusters[0].latestObservedAt, '2026-09-26T12:30:00.000Z');
});

test('NASA FIRMS discord payload formatting produces valid markdown without crashes', () => {
  const payload = firmsDiscordPayload({
    success: true,
    theaterName: '烏俄前線與邊境戰區',
    fetchedAt: '2026-09-26T14:00:00.000Z',
    totalHotspots: 12,
    clustersCount: 2,
    highIntensityClusters: [{ intensity: 'HIGH' }],
    clusters: [{ centerLat: 48.35, centerLon: 37.81, pointCount: 12, totalFrp: 210, intensity: 'HIGH' }]
  });
  assert.equal(payload.sourceBacked, true);
  assert.match(payload.content, /NASA FIRMS 衛星實體火點偵測/);
  assert.match(payload.content, /48\.35°N, 37\.81°E/);
});

test('NOTAM evaluator accurately classifies advance warnings vs active vs expired', () => {
  const now = Date.parse('2026-09-26T12:00:00.000Z');
  const notams = [
    {
      id: 'TEST01',
      title: '即將進行實彈演習',
      validFrom: '2026-09-27T00:00:00.000Z', // 12h in future
      validTo: '2026-09-27T08:00:00.000Z',
      type: 'LIVE FIRING'
    },
    {
      id: 'TEST02',
      title: '目前正進行操演',
      validFrom: '2026-09-26T10:00:00.000Z', // Started 2h ago
      validTo: '2026-09-26T14:00:00.000Z', // Ends in 2h
      type: 'MILITARY EXERCISE'
    },
    {
      id: 'TEST03',
      title: '已過期演訓',
      validFrom: '2026-09-25T00:00:00.000Z',
      validTo: '2026-09-25T10:00:00.000Z',
      type: 'DANGER AREA'
    }
  ];

  const results = evaluateMilitaryNotams(notams, now);
  assert.equal(results.find(n => n.id === 'TEST01').status, 'ADVANCE_WARNING');
  assert.equal(results.find(n => n.id === 'TEST01').leadTimeHours, 12);
  assert.equal(results.find(n => n.id === 'TEST02').status, 'ACTIVE_NOW');
  assert.equal(results.find(n => n.id === 'TEST03').status, 'EXPIRED');
});

test('NOTAM feed and discord payload correctly summarize active notices', () => {
  const feed = getNotamFeed();
  assert.equal(feed.status,'NOT_CONFIGURED');
  assert.equal(feed.notams.length,0);
  const payload = notamDiscordPayload();
  assert.equal(payload.sourceBacked, false);
  // OPEN TEACHER FIX: The new message explicitly says 'not connected' (尚未接通)
  // instead of the old vague 'cannot determine airspace status'
  assert.match(payload.content, /尚未接通/);
  assert.match(payload.content, /NOTAM 航空禁航通告與軍事演訓預警/);
  assert.match(payload.content, /台北飛航情報區/);

});
