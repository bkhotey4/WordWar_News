const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '../public/app.js');
let code = fs.readFileSync(appJsPath, 'utf8');

const targetFunction = 'async function refreshAll() {';
const newFunctions = `function renderFirms(feed) {
  if (!feed || !feed.success) {
    setText('firms-badge', '未取得');
    replaceChildren('firms-panel', [empty(feed?.error ? ('衛星資料取得失敗：' + feed.error) : '火點資料未取得。')]);
    return;
  }
  const highCount = feed.highIntensityClusters?.length || 0;
  setText('firms-badge', highCount > 0 ? (highCount + ' 處高強度熱區') : '常態熱訊號');
  const badgeEl = document.getElementById('firms-badge');
  if (badgeEl) badgeEl.className = 'badge ' + (highCount > 0 ? 'warning' : 'good');

  const nodes = [];
  nodes.push(el('strong', '', '觀測戰區：' + feed.theaterName));
  nodes.push(el('p', 'row-meta', '遙測時間：' + dateText(feed.fetchedAt) + ' · 偵測總點數：' + feed.totalHotspots + ' 點 · 聚類群：' + feed.clustersCount + ' 處'));

  if (!feed.clusters || !feed.clusters.length) {
    nodes.push(el('p', 'row-note', '目前該戰區無顯著密集高能量火點異常。'));
  } else {
    for (const c of feed.clusters.slice(0, 5)) {
      const row = el('article', 'source-row');
      const kind = c.intensity === 'HIGH' ? 'offline' : c.intensity === 'MEDIUM' ? 'warning' : 'neutral';
      row.append(rowTop('熱區聚類 [' + c.intensity + ']', c.totalFrp + ' MW', kind));
      row.append(el('p', 'row-meta', '座標：' + c.centerLat + '°N, ' + c.centerLon + '°E · 聚集點數：' + c.pointCount + ' 點'));
      if (c.latestObservedAt) {
        row.append(el('p', 'row-note', '最後衛星過境觀測：' + dateText(c.latestObservedAt)));
      }
      nodes.push(row);
    }
  }
  replaceChildren('firms-panel', nodes);
}

function renderNotam(feed) {
  if (!feed || feed.status !== 'AVAILABLE') {
    setText('notam-badge', '未取得');
    replaceChildren('notam-panel', [empty('航行通告未取得。')]);
    return;
  }
  const advanceCount = feed.advanceWarningsCount || 0;
  setText('notam-badge', advanceCount > 0 ? (advanceCount + ' 則前置預警') : '常態空域');
  const badgeEl = document.getElementById('notam-badge');
  if (badgeEl) badgeEl.className = 'badge ' + (advanceCount > 0 ? 'warning' : 'good');

  const nodes = [];
  nodes.push(el('strong', '', '有效/即將生效通告：共 ' + (feed.activeOrUpcomingCount || 0) + ' 則'));
  nodes.push(el('p', 'row-meta', '監測時間：' + dateText(feed.checkedAt)));

  for (const n of (feed.notams || []).slice(0, 5)) {
    const row = el('article', 'source-row');
    const kind = n.status === 'ACTIVE_NOW' ? 'offline' : n.status === 'ADVANCE_WARNING' ? 'warning' : 'neutral';
    const tag = n.status === 'ACTIVE_NOW' ? '進行中' : n.status === 'ADVANCE_WARNING' ? ('前置 ' + n.leadTimeHours + 'h') : '已過期';
    row.append(rowTop(n.title + ' (' + n.id + ')', tag, kind));
    row.append(el('p', 'row-meta', '情報區：' + (n.fir || '未標示') + ' · 管制類型：' + n.type + ' · 限制高度：' + (n.lowerLimit || 'SFC') + ' - ' + (n.upperLimit || 'UNL')));
    row.append(el('p', 'row-note', '有效期間：' + dateText(n.validFrom) + ' 至 ' + dateText(n.validTo)));
    nodes.push(row);
  }
  replaceChildren('notam-panel', nodes.length ? nodes : [empty('目前無有效或即將生效之軍事禁航通告。')]);
}
`;

const newRefreshAll = `async function refreshAll() {
  const button = document.getElementById('refresh-button');
  if (button.disabled) return;
  button.disabled = true;
  setText('checked-at', '正在讀取來源狀態…');
  const [health, live, imagery, reports, taiwan, events, satellite, firms, notam] = await Promise.allSettled([
    fetchJson('/api/health'),
    fetchJson('/data/live_intel.json'),
    fetchJson('/api/imagery'),
    fetchJson('/api/reports'),
    fetchJson('/api/taiwan'),
    fetchJson('/api/events'),
    fetchJson('/api/satellite-assets'),
    fetchJson('/api/firms'),
    fetchJson('/api/notam')
  ]);
  renderHealth(health.status === 'fulfilled' ? health.value : null);
  const liveData = live.status === 'fulfilled' ? live.value : null;
  renderAirspace(liveData);
  renderHeadlines(reports.status === 'fulfilled' ? reports.value : null);
  renderImagery(imagery.status === 'fulfilled' ? imagery.value : null);
  renderTaiwan(taiwan.status === 'fulfilled' ? taiwan.value : null);
  renderEvents(events.status === 'fulfilled' ? events.value : null);
  renderSatelliteAssets(satellite.status === 'fulfilled' ? satellite.value : null);
  renderFirms(firms.status === 'fulfilled' ? firms.value : null);
  renderNotam(notam.status === 'fulfilled' ? notam.value : null);
  const failures = [health, live, imagery, reports, taiwan, events, satellite, firms, notam].filter(result => result.status === 'rejected').length;
  setText('checked-at', '本頁檢查：' + dateText(new Date().toISOString()) + (failures ? (' · ' + failures + ' 個資料介面不可用') : ''));
  button.disabled = false;
}`;

const refreshIdx = code.indexOf(targetFunction);
const domReadyIdx = code.indexOf("document.addEventListener('DOMContentLoaded'", refreshIdx);

if (refreshIdx !== -1 && domReadyIdx !== -1) {
  code = code.slice(0, refreshIdx) + newFunctions + '\n' + newRefreshAll + '\n' + code.slice(domReadyIdx);
  fs.writeFileSync(appJsPath, code, 'utf8');
  console.log('SUCCESS: public/app.js patched cleanly!');
} else {
  console.error('Target not found in public/app.js');
  process.exit(1);
}
