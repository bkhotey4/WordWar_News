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
let tacticalMapInstance = null;
let tacticalMapMarkers = [];

function initTacticalMap(mapData) {
  if (!mapData || !mapData.targets) return;
  setText('map-target-count', `${mapData.targets.length} 個戰略目標 · ${mapData.firmsClusters?.length || 0} 處熱區`);

  const container = document.getElementById('tactical-map');
  if (!container) return;

  if (typeof L !== 'undefined') {
    if (!tacticalMapInstance) {
      tacticalMapInstance = L.map('tactical-map', {
        center: [30, 50],
        zoom: 3,
        zoomControl: true,
        attributionControl: false
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 18,
        subdomains: 'abcd'
      }).addTo(tacticalMapInstance);

      document.getElementById('map-recenter-btn')?.addEventListener('click', () => {
        tacticalMapInstance.setView([30, 50], 3);
      });
    }

    for (const m of tacticalMapMarkers) {
      tacticalMapInstance.removeLayer(m);
    }
    tacticalMapMarkers = [];

    for (const target of mapData.targets) {
      const isBlocked = target.isCloudBlocked;
      const color = isBlocked ? '#ef4444' : '#22c55e';
      const iconHtml = `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 8px ${color};"></div>`;
      const customIcon = L.divIcon({
        className: 'target-map-marker',
        html: iconHtml,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const marker = L.marker([target.lat, target.lon], { icon: customIcon }).addTo(tacticalMapInstance);

      const statusBadge = isBlocked 
        ? `<span style="color:#ef4444;font-weight:700;">🔴 厚雲受阻 (${target.cloudPercent}% 雲) ｜ 建議使用 SAR/SWIR 穿雲</span>`
        : `<span style="color:#22c55e;font-weight:700;">🟢 光學通透 (${target.cloudPercent}% 雲)</span>`;

      const popupHtml = `
        <div style="font-family:'DM Sans',sans-serif;font-size:0.85rem;line-height:1.5;">
          <strong style="font-size:0.95rem;color:#72d6e8;">${target.title}</strong>
          <p style="margin:4px 0;color:#9fb1c5;">戰略定位：${target.significance || '戰略樞紐'}</p>
          <p style="margin:4px 0;">${statusBadge}</p>
          <p style="margin:4px 0;font-size:0.78rem;color:#64748b;">拍攝時間：${dateText(target.acquiredAt)}</p>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
            ${target.multiBands?.swir ? `<a href="${target.multiBands.swir}" target="_blank" rel="noopener" style="padding:3px 7px;background:#f97316;color:#fff;border-radius:4px;text-decoration:none;font-size:0.75rem;">SWIR 穿雲假彩色 ↗</a>` : ''}
            ${target.multiBands?.sar ? `<a href="${target.multiBands.sar}" target="_blank" rel="noopener" style="padding:3px 7px;background:#38bdf8;color:#031525;border-radius:4px;text-decoration:none;font-weight:700;font-size:0.75rem;">SAR 微波雷達 ↗</a>` : ''}
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml);
      tacticalMapMarkers.push(marker);
    }

    for (const c of (mapData.firmsClusters || []).slice(0, 100)) {
      const circle = L.circleMarker([c.centerLat, c.centerLon], {
        radius: Math.min(16, Math.max(5, Math.sqrt(c.totalFrp || 1) * 2)),
        color: '#f97316',
        fillColor: '#ea580c',
        fillOpacity: 0.75,
        weight: 1.5
      }).addTo(tacticalMapInstance);

      circle.bindPopup(`
        <div style="font-size:0.82rem;">
          <strong style="color:#f97316;">NASA FIRMS 24h 穿雲熱異常</strong>
          <p style="margin:3px 0;">座標：${c.centerLat.toFixed(3)}°N, ${c.centerLon.toFixed(3)}°E</p>
          <p style="margin:3px 0;">能量：<strong>${c.totalFrp} MW</strong> (共 ${c.pointCount} 點)</p>
          <p style="margin:3px 0;font-size:0.75rem;color:#94a3b8;">最後觀測：${dateText(c.latestObservedAt)}</p>
        </div>
      `);
      tacticalMapMarkers.push(circle);
    }
  } else {
    renderCanvasMapFallback(container, mapData);
  }
}

function renderCanvasMapFallback(container, mapData) {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = container.clientWidth || 900;
  canvas.height = 460;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#050c17';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#122538';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  function project(lon, lat) {
    const x = ((lon + 180) / 360) * canvas.width;
    const y = ((75 - lat) / 145) * canvas.height;
    return [x, y];
  }

  ctx.fillStyle = 'rgba(249, 115, 22, 0.6)';
  for (const c of (mapData.firmsClusters || [])) {
    const [px, py] = project(c.centerLon, c.centerLat);
    ctx.beginPath();
    ctx.arc(px, py, Math.min(12, Math.max(3, (c.totalFrp || 1) * 0.2)), 0, Math.PI * 2);
    ctx.fill();
  }

  for (const t of (mapData.targets || [])) {
    const [px, py] = project(t.lon, t.lat);
    const color = t.isCloudBlocked ? '#ef4444' : '#22c55e';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px sans-serif';
    ctx.fillText(t.title, px + 9, py + 4);
  }
}

function renderSatelliteAssets(feed) {
  setText('image-value', feed ? `${feed.assets?.length || 0} 張來源影像` : '未取得');
  if (!feed || !feed.comparisons || !feed.comparisons.length) {
    replaceChildren('satellite-assets-panel', [empty('尚無通過產品來源及檔案檢查的實際影像。')]);
    return;
  }

  const nodes = feed.comparisons.map(pair => {
    const card = el('article', 'workbench-card');
    const target = pair.targetIntel || { title: pair.region, significance: '', watchPoints: '', coords: [0,0] };
    const latest = pair.latest;
    const baseline = pair.baseline || latest;
    const isBlocked = pair.isCloudBlocked;

    const header = el('div', 'workbench-header');
    const titleBox = el('div');
    titleBox.append(
      el('p', 'eyebrow', `${target.theater || '戰略觀測區'} · 座標 [${target.coords[1]}°N, ${target.coords[0]}°E]`),
      el('h3', '', target.title || pair.region)
    );
    const badgeKind = isBlocked ? 'offline' : (pair.cloudPercent <= 10 ? 'good' : 'warning');
    const badgeText = isBlocked ? `🔴 厚雲受阻 (${pair.cloudPercent}% 雲)` : `🟢 光學通透 (${pair.cloudPercent}% 雲)`;
    header.append(titleBox, badge(badgeText, badgeKind));
    card.append(header);

    card.append(el('p', 'row-meta', `戰略意義：${target.significance || '重要軍事觀測點'}`));
    if (pair.multiBands?.firmsNote) {
      card.append(el('p', 'row-note', `🔥 NASA FIRMS 24h 穿雲熱遙測：${pair.multiBands.firmsNote}`));
    }

    if (pair.tacticalFacilities?.length) {
      const chips = el('div', 'facility-chips');
      for (const fac of pair.tacticalFacilities) {
        chips.append(el('span', 'facility-chip', `📍 ${fac}`));
      }
      card.append(chips);
    }

    const bandBar = el('div', 'band-selector');
    const btnRgb = el('button', 'band-btn active', '🟢 RGB 真彩色 (可見光)');
    btnRgb.type = 'button';
    const btnSwir = el('a', 'band-btn swir', '🟠 SWIR 短波紅外穿雲 ↗');
    btnSwir.href = pair.multiBands?.swir || '#';
    btnSwir.target = '_blank';
    btnSwir.rel = 'noopener';
    const btnSar = el('a', 'band-btn sar', '🔵 Sentinel-1 SAR 微波雷達 ↗');
    btnSar.href = pair.multiBands?.sar || '#';
    btnSar.target = '_blank';
    btnSar.rel = 'noopener';
    bandBar.append(btnRgb, btnSwir, btnSar);
    card.append(bandBar);

    if (latest && baseline) {
      const xrayBox = el('div', 'xray-container');
      const stage = el('div', 'xray-stage');
      
      const imgBaseline = el('img', 'xray-baseline');
      imgBaseline.src = baseline.imageUrl;
      imgBaseline.alt = `${pair.region} 歷史無雲基線`;
      imgBaseline.loading = 'lazy';

      const imgLatest = el('img', 'xray-overlay');
      imgLatest.src = latest.imageUrl;
      imgLatest.alt = `${pair.region} 最新過境影像 (${latest.acquiredAt})`;
      imgLatest.loading = 'lazy';

      const overlayContainer = el('div', 'xray-tactical-boxes');
      if (pair.overlay) {
        const boxPin = el('div', 'tactical-box-pin');
        boxPin.style.left = `${pair.overlay.x}%`;
        boxPin.style.top = `${pair.overlay.y}%`;
        boxPin.style.width = `${pair.overlay.w}%`;
        boxPin.style.height = `${pair.overlay.h}%`;
        boxPin.append(el('span', 'tactical-box-label', `🎯 ${pair.overlay.label}`));
        overlayContainer.append(boxPin);
      }

      const badgeBaseline = el('span', 'xray-stage-badge l', `基線底層: ${baseline.acquiredAt?.slice(0, 10) || '歷史'} (無雲/少雲)`);
      const badgeLatest = el('span', 'xray-stage-badge r', `最新過境: ${latest.acquiredAt?.slice(0, 10) || '今日'} (${pair.cloudPercent}% 雲)`);

      stage.append(imgBaseline, imgLatest, overlayContainer, badgeBaseline, badgeLatest);
      xrayBox.append(stage);

      const sliderBox = el('div', 'xray-slider-box');
      const sliderLabel = el('label', '', '👁️ X-Ray 穿透雲層 (透視度)：');
      const slider = el('input', 'xray-slider');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = isBlocked ? '50' : '100';
      imgLatest.style.opacity = (slider.value / 100).toString();

      slider.addEventListener('input', () => {
        const val = slider.value;
        imgLatest.style.opacity = (val / 100).toString();
        sliderLabel.textContent = `👁️ X-Ray 穿透雲層 (${100 - val}% 透視度)：`;
      });

      const cbOverlay = el('input');
      cbOverlay.type = 'checkbox';
      cbOverlay.checked = true;
      const cbLabel = el('label', '', ' 標示關鍵戰術目標向量框');
      cbLabel.prepend(cbOverlay);
      cbOverlay.addEventListener('change', () => {
        overlayContainer.style.display = cbOverlay.checked ? 'block' : 'none';
      });

      sliderBox.append(sliderLabel, slider, cbLabel);
      xrayBox.append(sliderBox);
      card.append(xrayBox);
    }

    if (latest) {
      const footerMeta = el('div', 'row-meta');
      footerMeta.append(
        el('span', '', `拍攝時間：${dateText(latest.acquiredAt)} ｜ 產品：${latest.productId} ｜ 整片雲量：${latest.cloudCoverPercent ?? '未提供'}%`),
        el('br'),
        el('span', '', `${pair.note} · 未進行兵力辨識或戰損判讀。`)
      );
      card.append(footerMeta);

      const linksBox = el('p', 'row-note');
      const copernicusLink = el('a', 'scene-link', 'Copernicus 10m 原生高解析度多光譜/微波檢視 ↗ ');
      copernicusLink.href = safeUrl(pair.multiBands?.rgb || latest.sourceProductUrl);
      copernicusLink.target = '_blank';
      copernicusLink.rel = 'noopener';

      const sourceLink = el('a', 'scene-link', '來源產品資料 ↗');
      sourceLink.href = safeUrl(latest.sourceProductUrl);
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener';

      linksBox.append(copernicusLink, el('span', '', ' ｜ '), sourceLink);
      card.append(linksBox);
    }

    return card;
  });

  replaceChildren('satellite-assets-panel', nodes);
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
    row.append(el('p', 'row-meta', '情報區：' + (n.fir || '未標示') + ' · 管制類型：' + n.type + ' · 限制高度：' + (n.lowerLimit || '未標示') + ' - ' + (n.upperLimit || '未標示')));
    row.append(el('p', 'row-note', '有效期間：' + dateText(n.validFrom) + ' 至 ' + dateText(n.validTo)));
    nodes.push(row);
  }
  replaceChildren('notam-panel', nodes.length ? nodes : [empty('目前無有效或即將生效之軍事禁航通告。')]);
}

function renderOsintFusion(data) {
  if (!data || !data.tension) {
    setText('fusion-badge', '未取得');
    replaceChildren('fusion-panel', [empty('多源情報交叉彙整資料未取得。')]);
    return;
  }
  const score = data.tension.score;
  const levelText = data.tension.levelText;
  const unknowns = data.tension.unknownFactors || [];
  const kind = unknowns.length ? 'neutral' : score >= 75 ? 'offline' : score >= 50 ? 'warning' : 'good';
  setText('fusion-badge', `${data.theaterTitle} · 實驗指數 ${score}/100${unknowns.length ? ` · ${unknowns.length} 項無法判定` : ''}`);
  const badgeEl = document.getElementById('fusion-badge');
  if (badgeEl) badgeEl.className = 'badge ' + kind;

  const nodes = [];
  const topRow = el('article', 'source-row');
  topRow.append(rowTop('多源實驗指數（未校準，不是可靠度評級）', `${score} / 100 · ${levelText}`, kind));
  topRow.append(el('p', 'row-meta', `產生時間：${dateText(data.generatedAt)} · ${data.tension.isResonant ? '兩項以上同時觸發（未核對是否同地同時）' : '沒有兩項以上同時觸發'}`));
  if (data.tension.resonantFactors?.length) topRow.append(el('p', 'row-note', '觸發項目：' + data.tension.resonantFactors.join('；')));
  if (unknowns.length) topRow.append(el('p', 'row-note', '無法判定（缺資料不等於沒有異常）：' + unknowns.join('；')));
  nodes.push(topRow);

  const STATE = { NORMAL: ['未觸發', 'good'], ANOMALY: ['觸發', 'warning'], UNKNOWN: ['無法判定', 'neutral'], NOT_APPLICABLE: ['不適用', 'neutral'] };
  const grid = el('div', 'report-grid');
  for (const [label, s] of [['官方兵力通報（國防部）', data.twSummary], ['熱點（NASA FIRMS）', data.firmsSummary], ['淺層震動（USGS）', data.usgsSummary], ['禁航通告（NOTAM）', data.notamSummary], ['光學衛星（Sentinel-2，不計分）', data.satSummary]]) {
    if (s === data.satSummary && s?.state === 'NORMAL') { const card = el('article', 'source-row'); card.append(rowTop(label, '有軌次', 'neutral')); card.append(el('p', 'row-note', s.note)); grid.append(card); continue; }
    const [text, k] = STATE[s?.state] || ['無法判定', 'neutral'];
    const card = el('article', 'source-row');
    card.append(rowTop(label, text, k));
    card.append(el('p', 'row-note', s?.note || '無資料'));
    grid.append(card);
  }

  nodes.push(grid);
  replaceChildren('fusion-panel', nodes);
}

function renderCoverageGap(data) {
  if (!data || !Array.isArray(data.theaters)) {
    setText('coverage-gap-badge', '未取得');
    replaceChildren('coverage-gap-panel', [empty('戰區情報覆蓋資料未取得。')]);
    return;
  }
  const blindCount = data.blindSpotCount || 0;
  setText('coverage-gap-badge', blindCount > 0 ? `${blindCount} 個戰區有缺口或未檢查` : '已檢查的來源都有近期資料');
  const badgeEl = document.getElementById('coverage-gap-badge');
  if (badgeEl) badgeEl.className = 'badge ' + (blindCount > 0 ? 'warning' : 'good');

  const GRADE = { GAPS: ['光學與官方都有缺口', 'offline'], PARTIAL: ['部分缺口或未檢查', 'warning'], CHECKED_SOURCES_OK: ['已檢查來源正常', 'good'] };
  const nodes = [];
  if (data.note) nodes.push(el('p', 'row-meta', data.note));
  for (const t of data.theaters) {
    const [tag, kind] = GRADE[t.coverageGrade] || ['未知', 'neutral'];
    const row = el('article', 'source-row');
    row.append(rowTop(t.name, tag, kind));
    row.append(el('p', 'row-meta', `最近光學軌次：${t.satPassDate || '無紀錄'} · 整片雲量：${t.satCloudPercent ?? '未標注'}%（僅供初篩）`));
    if (t.notes?.length) row.append(el('p', 'row-note', t.notes.join('；')));
    nodes.push(row);
  }
  replaceChildren('coverage-gap-panel', nodes);
}

function renderUsgs(data) {
  if (!data || !data.success) {
    setText('usgs-badge', '未取得');
    replaceChildren('usgs-panel', [empty('USGS 淺層震動資料未取得。')]);
    return;
  }
  const suspCount = data.suspiciousEvents?.length || 0;
  setText('usgs-badge', suspCount > 0 ? `${suspCount} 起可疑震動（待查）` : '無符合條件事件');
  const badgeEl = document.getElementById('usgs-badge');
  if (badgeEl) badgeEl.className = 'badge ' + (suspCount > 0 ? 'warning' : 'good');

  const nodes = [];
  nodes.push(el('p', 'row-meta', `數據來源：${data.source} · 最後同步：${dateText(data.fetchedAt)} · 監測區內 24h 地震：${data.totalEvents24h} 起`));
  if (suspCount > 0) {
    for (const ev of data.suspiciousEvents.slice(0, 5)) {
      const row = el('article', 'source-row');
      row.append(rowTop(`${ev.place} (M${ev.magnitude ?? '?'})`, `深度 ${ev.depthKm}km`, 'warning'));
      row.append(el('p', 'row-meta', `發生時間：${dateText(ev.time)} · 經緯度：${Math.abs(ev.latitude)}°${ev.latitude < 0 ? 'S' : 'N'}, ${Math.abs(ev.longitude)}°${ev.longitude < 0 ? 'W' : 'E'}`));
      row.append(el('p', 'row-note', ev.isExplosionType ? `USGS 標註類型：${ev.type}` : '極淺層震動，可能是天然地震、採礦或其他爆破，原因未判定'));
      nodes.push(row);
    }
  } else {
    nodes.push(empty('過去 24 小時內，監測區內沒有符合可疑條件的震動（USGS 只收得到規模夠大的事件）。'));
  }
  replaceChildren('usgs-panel', nodes);
}

async function refreshAll() {
  const button = document.getElementById('refresh-button');
  if (button.disabled) return;
  button.disabled = true;
  setText('checked-at', '正在讀取來源狀態…');
  const [health, live, imagery, reports, taiwan, events, satellite, firms, notam, fusion, coverageGap, usgs, tacticalMap] = await Promise.allSettled([
    fetchJson('/api/health'),
    fetchJson('/data/live_intel.json'),
    fetchJson('/api/imagery'),
    fetchJson('/api/reports'),
    fetchJson('/api/taiwan'),
    fetchJson('/api/events'),
    fetchJson('/api/satellite-assets'),
    fetchJson('/api/firms'),
    fetchJson('/api/notam'),
    fetchJson('/api/osint-fusion'),
    fetchJson('/api/coverage-gap'),
    fetchJson('/api/usgs-seismic'),
    fetchJson('/api/tactical-map')
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
  renderOsintFusion(fusion.status === 'fulfilled' ? fusion.value : null);
  renderCoverageGap(coverageGap.status === 'fulfilled' ? coverageGap.value : null);
  renderUsgs(usgs.status === 'fulfilled' ? usgs.value : null);
  initTacticalMap(tacticalMap.status === 'fulfilled' ? tacticalMap.value : null);
  const failures = [health, live, imagery, reports, taiwan, events, satellite, firms, notam, fusion, coverageGap, usgs, tacticalMap].filter(result => result.status === 'rejected').length;
  setText('checked-at', '本頁檢查：' + dateText(new Date().toISOString()) + (failures ? (' · ' + failures + ' 個資料介面不可用') : ''));
  button.disabled = false;
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refresh-button').addEventListener('click', refreshAll);
  refreshAll();
  setInterval(refreshAll, 60_000);
});
