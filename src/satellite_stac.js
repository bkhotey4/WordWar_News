/**
 * SATELLITE IMAGERY STAC RECONNAISSANCE COLLECTOR
 * Connects to open Copernicus STAC catalog (Earth Search / ESA)
 * Retrieves verified orbital pass metadata (Product ID, Acquisition Datetime, Cloud Cover, Platform)
 * Separates satellite acquisition time from local dossier generation time.
 */

const fs = require('fs');
const path = require('path');

const STAC_ENDPOINT = 'https://earth-search.aws.element84.com/v1/search';
const CATALOG_FILE = path.join(__dirname, '../public/data/imagery_catalog.json');

const RECON_TARGETS = [
  {
    id: 'longtian_reference',
    targetKey: 'longtian',
    title: '福建龍田前進空軍基地 (Longtian Airbase)',
    theater: 'asia',
    coordinates: '25°34\'N, 119°27\'E',
    bbox: [119.2, 25.4, 119.5, 25.7],
    file: 'images/imint_longtian_airbase_satellite.jpg',
    dossierFile: 'images/imint_longtian_recon_dossier.png',
    historicalNote: '本機圖卡來源與拍攝時間未驗證；STAC 產品紀錄與此圖卡沒有建立對應關係。'
  },
  {
    id: 'sabina_reference',
    targetKey: 'sabina',
    title: '南海仙賓礁潟湖 (Sabina Shoal)',
    theater: 'asia',
    coordinates: '9°45\'N, 116°28\'E',
    bbox: [116.3, 9.6, 116.7, 9.9],
    file: 'images/imint_sabina_shoal_satellite.jpg',
    dossierFile: 'images/imint_sabina_recon_dossier.png',
    historicalNote: '本機圖卡來源與拍攝時間未驗證；STAC 產品紀錄與此圖卡沒有建立對應關係。'
  },
  {
    id: 'europe_reference',
    targetKey: 'toropets',
    title: '俄羅斯特維爾州托羅佩茨軍火庫 (Toropets 107th GRAU)',
    theater: 'europe',
    coordinates: '56°30\'N, 31°42\'E',
    bbox: [31.6, 56.4, 31.8, 56.6],
    file: 'images/imint_europe_satellite.jpg',
    dossierFile: 'images/imint_europe_recon_dossier.png',
    historicalNote: '本機圖卡來源與拍攝時間未驗證；STAC 產品紀錄與此圖卡沒有建立對應關係。'
  },
  {
    id: 'suwalki_reference',
    targetKey: 'suwalki',
    title: '北約東翼蘇瓦烏基走廊 (Suwalki Gap)',
    theater: 'europe',
    coordinates: '54°06\'N, 22°56\'E',
    bbox: [22.8, 54.0, 23.2, 54.3],
    file: 'images/nato_eastern_flank_sitrep.jpg',
    dossierFile: null,
    historicalNote: '本機圖卡來源與拍攝時間未驗證；STAC 產品紀錄與此圖卡沒有建立對應關係。'
  }
];

function getSatelliteTargets() {
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../research/satellite_regions.json'),'utf8'));
  const extra=config.regions;
  if(!Array.isArray(extra))throw new Error('Invalid satellite region configuration');
  const keys=new Set(RECON_TARGETS.map(t=>t.targetKey));
  for(const r of extra) {
    if(!r||!/^[a-z0-9_-]{1,60}$/.test(r.targetKey)||keys.has(r.targetKey)||typeof r.title!=='string'||
      !Array.isArray(r.bbox)||r.bbox.length!==4||!r.bbox.every(Number.isFinite)||r.bbox[0]<-180||r.bbox[2]>180||r.bbox[1]<-90||r.bbox[3]>90||r.bbox[0]>=r.bbox[2]||r.bbox[1]>=r.bbox[3]||r.bbox[2]-r.bbox[0]>1||r.bbox[3]-r.bbox[1]>1)throw new Error('Invalid satellite region bounds');
    keys.add(r.targetKey);
  }
  return [...RECON_TARGETS,...extra];
}

/**
 * Fetch latest STAC metadata for a given target
 */
async function queryTargetSTAC(target, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(STAC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collections: ['sentinel-2-l2a'],
        bbox: target.bbox,
        limit: 1,
        sortby: [{ field: 'properties.datetime', direction: 'desc' }]
      }),
      signal: controller.signal
    });

    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`STAC HTTP ${res.status}`);
    }

    const data = await res.json();
    const item = data.features?.[0];
    if (!item?.id || !item.properties?.datetime) {
      return null;
    }

    const props = item.properties || {};
    const cloudCover = typeof props['eo:cloud_cover'] === 'number'
      ? Math.round(props['eo:cloud_cover'] * 10) / 10
      : null;

    const selfLink = item.links?.find(l => l.rel === 'self')?.href || `https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${item.id}`;
    return {
      productId: item.id,
      collection: 'sentinel-2-l2a',
      provider: 'Element84 Earth Search STAC',
      platform: props.platform || 'Sentinel-2',
      constellation: 'sentinel-2',
      sensor: props.instruments ? props.instruments.join(', ') : 'MSI (Multi-Spectral Instrument)',
      acquiredAt: props.datetime || null,
      cloudCoverPercent: cloudCover,
      sourceProductUrl: selfLink,
      lastCheckedAt: new Date().toISOString()
    };
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[STAC WARNING] Failed to query STAC for ${target.title}:`, err.message);
    return null;
  }
}

/**
 * Fetch and update imagery catalog
 */
async function refreshImageryCatalog() {
  let existingCatalog = { images: [] };
  try {
    if (fs.existsSync(CATALOG_FILE)) existingCatalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  } catch (err) {
    console.warn('[STAC CATALOG READ]', err.message);
  }
  const previousCheck = Date.parse(existingCatalog.lastCatalogCheckAt || '');
  const cacheFresh = Number.isFinite(previousCheck) && Date.now() - previousCheck >= 0 &&
    Date.now() - previousCheck < 60 * 60_000 &&
    RECON_TARGETS.every(target => (existingCatalog.images || []).some(item =>
      item.id === target.id && item.sceneCheckStatus === 'ONLINE' && item.catalogScene?.productId
    ));
  if (cacheFresh) return { ...existingCatalog, checkSkipped: true };
  const checkedAt = new Date().toISOString();
  const images = [];
  for (const target of RECON_TARGETS) {
    const previous = (existingCatalog.images || []).find(item => item.id === target.id) || {};
    const scene = await queryTargetSTAC(target);
    images.push({
      id: target.id,
      targetKey: target.targetKey,
      title: target.title,
      theater: target.theater,
      coordinates: target.coordinates,
      file: target.file,
      dossierFile: target.dossierFile,
      historicalReference: true,
      historicalNote: target.historicalNote,
      // A STAC search result has no proven relationship to the local JPEG or dossier.
      verified: false,
      productId: null,
      acquiredAt: null,
      sourceProductUrl: null,
      catalogScene: scene ? {
        productId: scene.productId,
        acquiredAt: scene.acquiredAt,
        sourceProductUrl: scene.sourceProductUrl,
        provider: scene.provider,
        platform: scene.platform,
        sensor: scene.sensor,
        tileCloudCoverPercent: scene.cloudCoverPercent,
        metadataCheckedAt: scene.lastCheckedAt
      } : previous.catalogScene || null,
      sceneCheckStatus: scene ? 'ONLINE' : 'UNAVAILABLE',
      sceneLastCheckedAt: checkedAt
    });
  }
  const output = {
    title: 'Satellite catalog metadata and unverified local reference images',
    description: 'STAC scene metadata is separate from local image provenance.',
    lastCatalogCheckAt: checkedAt,
    stacProvider: 'Element84 Earth Search STAC',
    images
  };
  const tempFile = `${CATALOG_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tempFile, JSON.stringify(output, null, 2), 'utf8');
    fs.renameSync(tempFile, CATALOG_FILE);
  } catch (err) {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    throw err;
  }
  return output;
}

// Standalone CLI execution
if (require.main === module) {
  refreshImageryCatalog().then(catalog => {
    console.log('STAC Catalog refreshed with', catalog.images.length, 'targets.');
    process.exit(0);
  }).catch(err => {
    console.error('STAC Error:', err);
    process.exit(1);
  });
}

module.exports = {
  refreshImageryCatalog,
  queryTargetSTAC,
  getSatelliteTargets,
  RECON_TARGETS
};
