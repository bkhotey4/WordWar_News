const SOURCE_TTL_MS = 15 * 60_000;
const NEWS_TTL_MS = 24 * 60 * 60_000;
const STAC_TTL_MS = 60 * 60_000;

function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}
function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}
function replaceChildren(id, children) {
  const node = document.getElementById(id);
  if (node) node.replaceChildren(...children);
}
function freshTime(value, maxAge) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && time <= Date.now() + 60_000 && Date.now() - time <= maxAge;
}
function dateText(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '未取得';
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
function badge(value, kind) {
  return el('span', `badge ${kind}`, value);
}
function empty(message) {
  return el('p', 'empty', message);
}
function rowTop(title, status, kind) {
  const top = el('div', 'row-top');
  top.append(el('strong', '', title), badge(status, kind));
  return top;
}

function renderHealth(health) {
  if (!health?.sources) {
    setText('health-summary', '無法讀取');
    replaceChildren('sources-list', [empty('來源健康資料未取得。')]);
    return;
  }
  setText('health-summary', `${health.activeSources}/${health.totalSources} 個來源可用`);
  const nodes = Object.values(health.sources).map(source => {
    const status = source.status || 'UNKNOWN';
    const kind = status === 'HEALTHY' ? 'good' : status === 'STALE' ? 'warning' : 'offline';
    const row = el('article', 'source-row');
    row.append(rowTop(source.name || '未標示來源', status, kind));
    row.append(el('div', 'row-meta', `最後取得：${dateText(source.lastObserved)} · 時效上限：${source.maxAllowedAgeMinutes ?? '未定義'} 分鐘`));
    if (source.note) row.append(el('p', 'row-note', source.note));
    return row;
  });
  replaceChildren('sources-list', nodes.length ? nodes : [empty('尚無來源記錄。')]);
}

function renderAirspace(live) {
  const air = live?.liveAirspace;
  const valid = air?.success === true && freshTime(air.timestamp, SOURCE_TTL_MS);
  if (!valid) {
    setText('airspace-value', '未取得');
    setText('airspace-detail', '最近 15 分鐘沒有成功的公開航訊觀測。');
    replaceChildren('airspace-panel', [empty('來源失敗或時間已過期；不能將缺資料視為沒有航空活動。')]);
    return;
  }
  const total = Number.isFinite(air.totalAircraftInStrait) ? air.totalAircraftInStrait : null;
  const median = Number.isFinite(air.midStraitCount) ? air.midStraitCount : null;
  setText('airspace-value', total === null ? '數量未取得' : `${total} 筆訊號`);
  setText('airspace-detail', `觀測時間：${dateText(air.timestamp)}`);
  const row = el('article', 'airspace-row');
  row.append(rowTop('區域公開 ADS-B 回傳', '近期', 'good'));
  row.append(el('div', 'row-meta', `總數：${total ?? '未取得'} 筆 · 中線鄰近：${median ?? '未取得'} 筆`));
  row.append(el('p', 'row-note', '這些是被接收到的公開訊號，不能推算軍機數量或任務。'));
  replaceChildren('airspace-panel', [row]);
}

function renderHeadlines(response) {
  const allItems = (Array.isArray(response?.reports) ? response.reports : [])
    .filter(item => item?.title && freshTime(item.asOf, 48 * 60 * 60_000));
  const items = allItems.slice(0, 12);
  document.getElementById('headlines-list').classList.toggle('single-report', items.length <= 1);
  setText('news-value', response ? `${allItems.length} 則報導` : '未取得');
  const nodes = items.map(item => {
    const row = el('article', 'report-card');
    const body = el('div', 'report-body');
    body.append(rowTop(`資料截至 ${dateText(item.asOf)}`, '自主研究', 'neutral'));
    body.append(el('h3', 'report-title', item.title));
    const references = Array.isArray(item.references) ? item.references : [];
    for (const section of (item.sections || [])) {
      const block = el('section', `report-section ${section.kind === 'ANALYSIS' ? 'analysis' : ''}`);
      block.append(el('h4', '', section.label), el('p', 'report-summary', section.text));
      const cites = el('div', 'report-citations');
      for (const id of (section.evidence || [])) {
        const index = references.findIndex(ref => ref.id === id);
        const href = safeUrl(references[index]?.url);
        if (!href) continue;
        const link = el('a', '', `[${index + 1}]`); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; cites.append(link);
      }
      block.append(cites); body.append(block);
    }
    body.append(el('p', 'row-meta', `分析時間：${dateText(item.generatedAt)} · 報導消息不等於已獨立證實`));
    const sources = el('details', 'report-sources');
    sources.append(el('summary', '', '研究來源與發布日期'));
    for (const [index, reference] of references.entries()) {
      const href = safeUrl(reference.url); if (!href) continue;
      const link = el('a', '', `[${index + 1}] ${reference.publisher} · ${dateText(reference.publishedAt)}${(reference.sourceType || '').startsWith('BELLIGERENT') ? ' · 交戰方來源' : ' · 外部評估'}`);
      link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; sources.append(link);
    }
    body.append(sources);
    row.append(body);
    const map = item.map;
    const mapImage = safeUrl(map?.imageUrl);
    const mapSource = safeUrl(map?.sourceUrl);
    if (mapImage && mapSource && freshTime(map.publishedAt, NEWS_TTL_MS)) {
      const figure = el('figure', 'report-map');
      const img = el('img'); img.src = mapImage; img.alt = map.caption; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => { figure.replaceChildren(empty('原始地圖無法載入，請查看來源貼文。')); });
      const caption = el('figcaption', '', `${map.caption} · ${map.credit} · ${dateText(map.publishedAt)} · 原作者戰況標註，非衛星判讀`);
      const sourceLink = el('a', '', '查看地圖原始貼文 ↗');
      sourceLink.href = mapSource; sourceLink.target = '_blank'; sourceLink.rel = 'noopener noreferrer';
      figure.append(img, caption, sourceLink); row.append(figure);
    } else {
      row.append(el('p', 'report-map-empty', '事件地圖待接入 · 不以其他地區或日期的圖片代替'));
    }
    return row;
  });
  if (response?.pendingAnalysis) nodes.push(el('p', 'report-pending', '其他原始資料已取得，仍待研究覆核；舊研判不自動套用新日期。'));
  for (const item of response?.reportAudit || []) {
    const reason = { SOURCE_CHANGED_OR_MISSING: '來源已變更或缺失，須重新查核', EXPIRED: '消息超過時效', INVALID_REPORT: '報導格式或引用未通過檢查' }[item.reason] || '待查核';
    nodes.push(el('p', 'report-pending', `已停止展示：${item.title || item.id} · ${reason}`));
  }
  replaceChildren('headlines-list', nodes.length ? nodes : [empty(response ? '尚無時效內且完成來源比對的中文報導。' : '報導介面無法讀取。')]);
}

function renderImagery(catalog) {
  const images = Array.isArray(catalog?.images) ? catalog.images : [];
  const checkFresh = freshTime(catalog?.lastCatalogCheckAt, STAC_TTL_MS);
  const scenes = images.filter(item => checkFresh && item.sceneCheckStatus === 'ONLINE' && item.catalogScene?.productId && item.catalogScene?.acquiredAt);
  const verifiedImages = images.filter(item => item.verified === true && item.imageSourceProductId && item.available);
  setText('scene-value', checkFresh ? `${scenes.length} 處有紀錄` : '查詢已過期');
  setText('image-value', `${verifiedImages.length} 張已驗證`);
  const nodes = images.map(item => {
    const scene = checkFresh && item.sceneCheckStatus === 'ONLINE' ? item.catalogScene : null;
    const hasScene = Boolean(scene?.productId && scene?.acquiredAt && safeUrl(scene?.sourceProductUrl));
    const row = el('article', 'scene-row');
    row.append(rowTop(item.title || '未標示區域', hasScene ? '產品目錄可查' : '近期目錄未取得', hasScene ? 'good' : 'warning'));
    if (hasScene) {
      row.append(el('div', 'row-meta', `產品：${scene.productId} · 拍攝：${dateText(scene.acquiredAt)}`));
      row.append(el('p', 'row-note', scene.tileCloudCoverPercent == null ? '產品整片雲量未提供。' : `產品整片雲量 ${scene.tileCloudCoverPercent}%；不代表特定位置可見度。`));
      const link = el('a', 'scene-link', '查看產品原始紀錄 ↗');
      link.href = safeUrl(scene.sourceProductUrl);
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      row.append(link);
    } else {
      row.append(el('p', 'row-note', '目前沒有時效內的區域產品查詢結果。'));
    }
    row.append(el('p', 'row-note', item.evidenceStatus || '本機圖片來源未驗證。'));
    return row;
  });
  replaceChildren('imagery-list', nodes.length ? nodes : [empty('衛星產品目錄未取得。')]);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
const officialMetricLabels={aircraft:'共機',ships:'共艦',officialVessels:'公務船',crossingOrAirspace:'中線／指定空域通報'};
function metricLine(observation) {
  return Object.entries(officialMetricLabels).map(([key,label])=>`${label} ${observation?.[key]?.value??'未提供'}${observation?.[key]?.unit||''}`).join(' · ');
}
function renderTaiwan(feed) {
  const nodes=[];const doc=feed?.latest;
  if(!doc){replaceChildren('taiwan-panel',[empty('官方通報尚未取得；不以新聞標題補數字。')]);return;}
  nodes.push(el('strong','',feed.status==='AVAILABLE'?'官方期間通報':'官方通報已過期，僅供歷史查閱'));
  nodes.push(el('p','row-meta',`統計：${dateText(doc.observation.periodStart)} 至 ${dateText(doc.observation.periodEnd)}`));
  nodes.push(el('p','',metricLine(doc.observation)));
  if(doc.observation.reviewRequired)nodes.push(el('p','report-pending','通報欄位待覆核，不納入統計基準。'));
  const link=el('a','scene-link','查閱國防部原文 ↗');link.href=safeUrl(doc.url);link.target='_blank';link.rel='noopener noreferrer';nodes.push(link);
  nodes.push(el('p','row-note','統計為官方所列期間，不代表目前全部部署；中線／空域合併數量不拆成個別中線數字。'));
  const assessment=feed.assessment;
  nodes.push(el('strong','',`異常觀察：${assessment.status}`));
  for(const i of assessment.indicators||[])nodes.push(el('p','row-meta',`${officialMetricLabels[i.metric]} · 同單位历史 ${i.samples} 筆 · ${i.historicalP95===undefined?'尚不足30筆基準':`第95百分位 ${i.historicalP95}${i.unit} · ${i.status}`}`));
  nodes.push(el('p','row-note','規則處於觀察模式，未啟用自動預判推播；未計算戰爭機率。'));
  const history=el('details','report-sources');history.append(el('summary','','最近官方統計期間'));
  for(const item of (feed.history||[]).slice(0,7))history.append(el('p','row-meta',`${dateText(item.observation.periodEnd)} · ${metricLine(item.observation)}`));
  nodes.push(history);replaceChildren('taiwan-panel',nodes);
}
function renderEvents(feed) {
  const rows=(feed?.events||[]).slice(0,8).map(event=>{
    const row=el('article','source-row');row.append(rowTop(event.title,`${event.kind==='CORRECTION'?'來源更正':'新增資料'} · ${event.currentVersion?'目前版本':'歷史版本'}`,'neutral'));
    row.append(el('p','row-meta',`紀錄：${dateText(event.recordedAt)} · 發布：${dateText(event.publishedAt)} · ${event.evidenceStatus}`));
    if(event.previousObservation)row.append(el('p','row-note',`更正前：${metricLine(event.previousObservation)}\n更正後：${metricLine(event.observation)}`));
    const url=safeUrl(event.url);if(url){const a=el('a','scene-link','原始來源 ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}return row;
  });replaceChildren('events-panel',rows.length?rows:[empty('尚無資料事件紀錄。')]);
}
function renderSatelliteAssets(feed) {
  setText('image-value',feed?`${feed.assets.length} 張來源影像`:'未取得');
  const nodes=(feed?.comparisons||[]).map(pair=>{
    const row=el('article','scene-row');row.append(rowTop(pair.region,pair.previous?'不同日期可比對':'僅一張影像','neutral'));
    const grid=el('div','satellite-pair');
    for(const item of [pair.previous,pair.latest].filter(Boolean)) {
      const figure=el('figure','satellite-figure');const img=el('img');img.src=item.imageUrl;img.alt=`${pair.region} ${item.acquiredAt} ${item.kind==='SOURCE_AOI_CROP'?'來源區域裁切':'產品縮圖'}`;img.loading='lazy';
      const caption=el('figcaption','row-meta',`${dateText(item.acquiredAt)} · ${item.kind==='SOURCE_AOI_CROP'?'來源區域裁切':'整片縮圖'} · 產品整片雲量 ${item.cloudCoverPercent??'未提供'}% · ${item.productId}`);
      const link=el('a','scene-link','來源產品 ↗');link.href=safeUrl(item.sourceProductUrl);link.target='_blank';link.rel='noopener noreferrer';
      img.addEventListener('error',()=>{img.replaceWith(empty('來源縮圖載入失敗。'));});figure.append(img,caption,link);grid.append(figure);
    }
    row.append(grid,el('p','row-note',pair.note),el('p','row-note',pair.latest.credit));
    const license=el('a','scene-link','影像授權說明 ↗');license.href=safeUrl(pair.latest.licenseUrl);license.target='_blank';license.rel='noopener noreferrer';row.append(license);return row;
  });replaceChildren('satellite-assets-panel',nodes.length?nodes:[empty('尚無通過產品來源及檔案檢查的實際影像。')]);
}
function renderFirms(feed) {
  if (!feed || !feed.success) {
    setText('firms-badge', '未取得');
    replaceChildren('firms-panel', [empty(feed?.error ? ('衛星資料取得失敗：' + feed.error) : '火點資料未取得。')]);
    return;
  }
  const highCount = feed.highIntensityClusters?.length || 0;
  setText('firms-badge', highCount > 0 ? (highCount + ' 處高強度熱區（原因待查）') : '未達群集門檻');
  const badgeEl = document.getElementById('firms-badge');
  if (badgeEl) badgeEl.className = 'badge ' + (highCount > 0 ? 'warning' : 'good');

  const nodes = [];
  nodes.push(el('strong', '', '觀測戰區：' + feed.theaterName));
  nodes.push(el('p', 'row-meta', '資料下載時間：' + dateText(feed.fetchedAt) + ' · 過去 24 小時偵測點數：' + feed.totalHotspots + ' 點 · 群集：' + feed.clustersCount + ' 處'));
  nodes.push(el('p', 'row-note', '熱異常可能來自野火、農業或工業；尚未確認軍事事件。不同過境的觀測分開計算。'));

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
    replaceChildren('notam-panel', [empty(feed?.status === 'NOT_CONFIGURED' ? '尚未接通官方 NOTAM 自動採集；目前沒有可核實的匯入通告，無法判定空域是否有管制。' : '沒有可顯示的有效匯入通告；不代表空域無管制。')]);
    return;
  }
  const advanceCount = feed.advanceWarningsCount || 0;
  setText('notam-badge', advanceCount > 0 ? (advanceCount + ' 則未來通告') : '已匯入有效通告');
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

async function refreshAll() {
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
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh-button').addEventListener('click', refreshAll);
  refreshAll();
  setInterval(refreshAll, 60_000);
});
