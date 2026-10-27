const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {getStore}=require('./intel_store');
const {getSatelliteTargets}=require('./satellite_stac');
const {cropSatellite}=require('./satellite_crop');
const {assessCloudGrade}=require('./satellite_quality');
const DIRECTORY=path.join(__dirname,'../public/images/sentinel');
const CREDIT='Contains Copernicus Sentinel data; preview supplied through Element84 Earth Search';
const LICENSE='https://dataspace.copernicus.eu/terms-and-conditions';
function assetRecord(item,region) {
  const acquired=Date.parse(item.properties?.datetime);
  const source=item.assets?.thumbnail?.href;
  let url;try{url=new URL(source);}catch{throw new Error('No image asset');}
  if(url.protocol!=='https:'||url.hostname!=='sentinel-cogs.s3.us-west-2.amazonaws.com'||url.username||url.password||!source.endsWith('.jpg'))throw new Error('Unapproved satellite image host');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id)||!Number.isFinite(acquired)||acquired>Date.now()||!Array.isArray(item.bbox)||item.bbox.length!==4||!item.bbox.every(Number.isFinite))throw new Error('Invalid source product metadata');
  return {productId:item.id,region,tile:item.id.match(/_(\d{2}[A-Z]{3})_/)?.[1]||null,acquiredAt:new Date(acquired).toISOString(),bbox:item.bbox,cloudCoverPercent:item.properties['eo:cloud_cover']??null,
    assetUrl:source,sourceProductUrl:`https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${item.id}`,file:`images/sentinel/${item.id}.jpg`,imageUrl:`/images/sentinel/${item.id}.jpg`,credit:CREDIT,licenseUrl:LICENSE,
    kind:'SOURCE_TILE_PREVIEW',interpretationStatus:'NOT_ANALYZED',scope:'原始產品整片縮圖；不是指定位置裁切，不據此辨識兵力或判定戰損。'};
}
async function downloadAsset(record) {
  const res=await fetch(record.assetUrl,{signal:AbortSignal.timeout(25000),redirect:'error'});
  if(!res.ok||!res.headers.get('content-type')?.startsWith('image/jpeg'))throw new Error(`Satellite asset HTTP ${res.status}`);
  const chunks=[];let length=0;
  for await(const chunk of res.body){length+=chunk.length;if(length>8_000_000)throw new Error('Image exceeds size limit');chunks.push(chunk);}
  const buffer=Buffer.concat(chunks);
  if(buffer[0]!==0xff||buffer[1]!==0xd8||length<100)throw new Error('Invalid JPEG image');
  fs.mkdirSync(DIRECTORY,{recursive:true});
  const file=path.join(DIRECTORY,`${record.productId}.jpg`),temp=`${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp,buffer);fs.renameSync(temp,file);
  return {...record,downloadedAt:new Date().toISOString(),sha256:crypto.createHash('sha256').update(buffer).digest('hex'),verified:true};
}
let inFlight;
function refreshSatelliteAssets(options={}) {if(!inFlight)inFlight=collect(options).finally(()=>{inFlight=null;});return inFlight;}
async function collect({force=false,store=getStore()}={}) {
  const previous=store.getHealth('Satellite_Assets');
  if(!force&&previous&&Date.now()-Date.parse(previous.lastAttempt)>=0&&Date.now()-Date.parse(previous.lastAttempt)<6*60*60_000)return previous;
  const errors=[];let found=0;
  for(const target of getSatelliteTargets()) {
    try {
      const res=await fetch('https://earth-search.aws.element84.com/v1/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({collections:['sentinel-2-l2a'],bbox:target.bbox,limit:8,sortby:[{field:'properties.datetime',direction:'desc'}]}),signal:AbortSignal.timeout(15000)});
      if(!res.ok)throw new Error(`STAC HTTP ${res.status}`);
      const data=await res.json();const records=(data.features||[]).map(item=>assetRecord(item,target.targetKey));
      const tile=records[0]?.tile;if(!tile)throw new Error('No tile preview metadata');
      const selected=records.filter(r=>r.tile===tile).filter((r,i,a)=>a.findIndex(x=>x.acquiredAt.slice(0,10)===r.acquiredAt.slice(0,10))===i).slice(0,2);
      for(const record of selected) {
        const cached=store.imagery(target.targetKey).find(a=>a.productId===record.productId);
        if(cached&&cached.kind==='SOURCE_AOI_CROP'&&validLocalAsset(cached)){found++;continue;}
        const preview=cached&&validLocalAsset(cached)?cached:await downloadAsset(record);
        try {store.putImagery(await cropSatellite(preview,target,data.features.find(item=>item.id===record.productId)));}
        catch(error){store.putImagery({...preview,cropError:error.message});errors.push({region:target.targetKey,productId:record.productId,error:`Crop unavailable: ${error.message}`});}
        found++;
      }
    }catch(e){errors.push({region:target.targetKey,error:e.message});}
  }
  // 每次更新後清掉超過保存期限、沒有稿件引用的舊影像
  let cleanup=null;
  try{cleanup=require('./satellite_storage').cleanupSatelliteImages({store});}catch(error){errors.push({error:`Cleanup failed: ${error.message}`});}
  const state={status:errors.length?'DEGRADED':'ONLINE',lastAttempt:new Date().toISOString(),...(found?{lastSuccess:new Date().toISOString()}:{}),verifiedPreviews:found,errors,cleanup};
  store.health('Satellite_Assets',state);return state;
}
function validLocalAsset(record) {
  if(record.verified!==true||!record.sha256||!record.productId||!record.acquiredAt||!record.sourceProductUrl)return false;
  const full=path.resolve(__dirname,'../public',record.file||'');
  return full.startsWith(DIRECTORY+path.sep)&&fs.existsSync(full)&&crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')===record.sha256;
}
function getSatelliteFeed(region,store=getStore()) {
  const assets=store.imagery(region).filter(validLocalAsset);
  const comparisons=[];
  for(const key of [...new Set(assets.map(a=>a.region))]) {
    const regionAssets = assets.filter(a => a.region === key);
    const newest = regionAssets.find(a => a.region === key);
    const previous = regionAssets.find(a => a.tile === newest?.tile && a.acquiredAt < newest?.acquiredAt);
    const baseline = regionAssets.reduce((best, curr) => {
      const bestCloud = best?.cloudCoverPercent ?? 100;
      const currCloud = curr?.cloudCoverPercent ?? 100;
      return currCloud < bestCloud ? curr : best;
    }, newest);

    const intel = TARGET_INTEL[key] || {
      title: key,
      theater: '一般戰區',
      significance: '重點軍事與地緣觀測目標',
      watchPoints: '地表設施與活動動態',
      coords: [0, 0],
      tacticalFacilities: []
    };

    const cloudPct = newest?.cloudCoverPercent != null ? Math.round(newest.cloudCoverPercent * 10) / 10 : null;
    const isCloudBlocked = cloudPct !== null && cloudPct > 20;

    comparisons.push({
      region: key,
      latest: newest,
      previous: previous || null,
      baseline: baseline || newest,
      targetIntel: intel,
      tacticalFacilities: intel.tacticalFacilities || [],
      cloudPercent: cloudPct,
      cloudGrade: assessCloudGrade(newest?.cloudCoverPercent),
      isCloudBlocked,
      overlay: intel.overlay || null,
      multiBands: {
        rgb: newest ? getCopernicusBrowserLink(newest, intel, 'rgb') : null,
        swir: newest ? getCopernicusBrowserLink(newest, intel, 'swir') : null,
        sar: newest ? getCopernicusBrowserLink(newest, intel, 'sar') : null,
        firmsNote: getThermalTelemetry(intel)
      },
      status: previous ? 'VISUAL_REVIEW_PAIR' : 'SINGLE_IMAGE',
      pixelChangeAnalysis: false,
      note: '同瓦片不同日期，僅供目視比對；裁切範圍可能因產品覆蓋而異，未進行雲遮、對位或戰損判讀。'
    });
  }
  return {sourceHealth:store.getHealth('Satellite_Assets'),assets,comparisons};
}
function satelliteDiscordPayload(region, compare = false) {
  const feed = getSatelliteFeed(region);
  const assets = compare
    ? (feed.comparisons[0] ? [feed.comparisons[0].previous, feed.comparisons[0].latest].filter(Boolean) : [])
    : feed.assets.slice(0, 1);

  if (!assets.length) {
    return {
      sourceBacked: true,
      content: '尚無成功下載且通過來源與檔案檢查的影像。',
      allowedMentions: { parse: [] },
      files: [],
      embeds: []
    };
  }

  const primary = assets[assets.length - 1];
  const target = TARGET_INTEL[region] || {
    title: region,
    theater: '一般戰區',
    significance: '重點軍事與地緣觀測目標',
    watchPoints: '地表設施與活動動態',
    coords: [0, 0]
  };

  const cloudPct = primary.cloudCoverPercent != null ? Math.round(primary.cloudCoverPercent * 10) / 10 : null;
  const isCloudy = cloudPct !== null && cloudPct > 20;
  const thermalNote = getThermalTelemetry(target);
  const browserLink = getCopernicusBrowserLink(primary, target);

  let usabilityText = '';
  if (cloudPct === null) {
    usabilityText = '❓ 雲量未標注 ｜ 需人工目視覆核';
  } else if (cloudPct <= 10) {
    usabilityText = '🟢 整片雲量低 ｜ 目標區是否清楚仍需看實際影像';
  } else if (cloudPct <= 20) {
    usabilityText = `🟡 整片雲量中等 (${cloudPct}%) ｜ 目標區可能有雲或雲影，需看實際影像`;
  } else {
    usabilityText = `🔴 整片雲量高 (${cloudPct}%) ｜ 目標區很可能被雲遮，需看實際影像確認`;
  }

  const lines = [
    `# 🛰️ 【Sentinel-2 來源影像檢視 // ${compare ? '雙期目視比對' : '最新過境'}`,
    `> 📍 **目標區域**: \`${target.title}\` (\`${region}\`)`,
    `> 🎯 **戰略定位**: ${target.significance}`,
    `> 🕒 **拍攝時間**: \`${primary.acquiredAt}\` (UTC) ｜ **產品**: \`${primary.productId}\``,
    `> ☁️ **雲量標示**: \`${cloudPct !== null ? `${cloudPct}%` : '未標注'}\` ｜ 評估: ${usabilityText}`,
    `> 🔥 **附近熱點 (NASA FIRMS 24h，厚雲時也偵測不到)**: ${thermalNote}`,
    `> 🌐 **原始影像**: [Copernicus Browser 10m 原生影像檢視](${browserLink})`,
    '',
    '### 📌 【目標監控重點與判讀指引】',
    `• **關鍵設施**: ${target.watchPoints}`,
    compare
      ? '• **比對說明**: 兩張影像為同瓦片不同日期；供目視比對地表構造，未進行自動戰損判定。'
      : (isCloudy
        ? '• **雲遮說明**: 整片雲量高，目標區很可能看不到地表；光學與短波紅外都無法穿透厚雲，陰天需改看 Sentinel-1 雷達影像。'
        : '• **目視指引**: 原始真彩色 TCI 影像，未補造像素；非即時即地戰場空照。'),
    '',
    '### ⚠️ 【重要聲明與判讀限制】',
    '• **未進行兵力辨識或戰損判讀**：本通知僅為衛星公開產品到達提示，未進行自動或人工對位判讀。',
    '• **目視限制**：光學衛星影像受雲層與視角影響，禁止單憑單一縮圖下定論。',
    '• **正式分析要求**：完成實際精確對位與專業光學解讀後，才會透過研究專頁發布變化結論。'
  ];

  const shouldAttach = assets.some(a => a.file && fs.existsSync(path.join(__dirname, '../public', a.file)));

  return {
    sourceBacked: true,
    content: lines.join('\n').slice(0, 2000),
    allowedMentions: { parse: [] },
    files: shouldAttach
      ? assets.filter(a => a.file && fs.existsSync(path.join(__dirname, '../public', a.file))).map(a => ({ attachment: path.join(__dirname, '../public', a.file), name: path.basename(a.file) }))
      : [],
    embeds: assets.map(a => ({
      title: `${a.region}｜${a.acquiredAt}`,
      url: a.sourceProductUrl,
      description: `${a.scope}\n品質標示：${assessCloudGrade(a.cloudCoverPercent).badge}\n整片雲量：${a.cloudCoverPercent ?? '未提供'}%\n產品：${a.productId}\n[資料授權](${a.licenseUrl})`,
      image: { url: `attachment://${path.basename(a.file)}` },
      footer: { text: a.credit }
    }))
  };
}
const ARRIVAL_LEDGER_FILE = path.join(__dirname, '../research/satellite_arrival_ledger.json');

function getArrivalLedger() {
  try {
    if (fs.existsSync(ARRIVAL_LEDGER_FILE)) {
      return JSON.parse(fs.readFileSync(ARRIVAL_LEDGER_FILE, 'utf8'));
    }
  } catch (_) {}
  return { notifiedProductIds: [] };
}

function saveArrivalLedger(data) {
  const tmp = `${ARRIVAL_LEDGER_FILE}.${crypto.randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(ARRIVAL_LEDGER_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, ARRIVAL_LEDGER_FILE);
}

const TARGET_INTEL = {
  suwalki: {
    title: '蘇瓦烏基走廊 (Suwalki Gap)',
    theater: '北約東翼 / 波蘭-立陶宛邊界',
    significance: '連接白俄羅斯與俄加里寧格勒飛地之咽喉要道',
    watchPoints: 'Via Baltica (E67公路)、鐵路集結樞紐、立波邊界防線',
    coords: [23.0, 54.15],
    tacticalFacilities: ['Via Baltica (E67 公路主幹)', '蘇瓦烏基鐵路編組站', '卡爾瓦里亞立波邊境防線', '波蘭第14反裝甲砲兵團駐地'],
    overlay: { x: 30, y: 50, w: 40, h: 18, label: 'E67 走廊樞紐' }
  },
  longtian: {
    title: '福建龍田前進空軍基地 (Longtian Airbase)',
    theater: '台海戰區 / 福建福清',
    significance: '距台灣本島約 160 公里，共軍對台出動前沿樞紐',
    watchPoints: '主跑道、加固機堡群 (HAS)、停機坪戰機與防空陣地',
    coords: [119.35, 25.55],
    tacticalFacilities: ['主跑道 (06/24, 2,800m)', '北部加固機堡群 (HAS)', '南部擴建停機坪與快速滑行道', 'S-300 / 紅旗-9 防空陣地'],
    overlay: { x: 40, y: 30, w: 22, h: 42, label: '主跑道 06/24 (2800m)' }
  },
  sabina: {
    title: '南海仙賓礁潟湖 (Sabina Shoal)',
    theater: '南海戰區 / 南沙群島',
    significance: '仁愛礁補給線關鍵中繼要衝，中菲海警對峙前沿',
    watchPoints: '潟湖主錨地、海警巡邏艦與海上民兵船隻集結泊位',
    coords: [116.5, 9.75],
    tacticalFacilities: ['仙賓礁中央潟湖錨泊區', '東南淺灘海警執法巡邏線', '海上民兵漁船集結泊位', '菲方海警巡邏艇待命點'],
    overlay: { x: 35, y: 40, w: 32, h: 26, label: '潟湖主錨泊區' }
  },
  toropets: {
    title: '俄軍特維爾州第 107 GRAU 彈藥庫 (Toropets)',
    theater: '烏俄戰區 / 俄羅斯西部',
    significance: '俄軍主要戰略導彈與常規重型彈藥儲備基地',
    watchPoints: '地下混凝土掩體群、鐵路裝卸調度場與周邊防空火網',
    coords: [31.7, 56.5],
    tacticalFacilities: ['第 107 GRAU 混凝土重型掩體庫區', '軍用鐵路專用調度支線', '北側彈藥裝卸月台', '周邊野戰防空陣地'],
    overlay: { x: 38, y: 35, w: 26, h: 32, label: 'GRAU 重型彈藥庫區' }
  },
  hormuz_bandar_abbas: {
    title: '荷莫茲海峽／阿巴斯港 (Bandar Abbas)',
    theater: '中東波斯灣戰區',
    significance: '全球 20% 原油運輸咽喉與伊朗海軍主力軍港',
    watchPoints: '潛艦與飛彈巡邏快艇母港、航道通航安全',
    coords: [56.27, 27.18],
    tacticalFacilities: ['阿巴斯港伊朗海軍第1戰區軍港', '飛彈快艇與潛艦泊位', '霍爾木茲分道通航制 (TSS) 航道', '格什姆島沿岸反艦飛彈陣地'],
    overlay: { x: 45, y: 38, w: 30, h: 22, label: '主力軍港與快艇泊位' }
  },
  ukraine_civil: {
    title: '烏克蘭基輔大都市區及周邊水電基礎設施',
    theater: '烏俄戰區 / 基輔',
    significance: '烏克蘭國家指揮中樞與民生能源主網節點',
    watchPoints: '水電發電廠、高壓變電所、鐵路樞紐',
    coords: [30.52, 50.45],
    tacticalFacilities: ['第聶伯河基輔水電發電站', '基輔熱電5號/6號廠 (CHPP-5/6)', '中央鐵路貨運調度樞紐', '750kV 北基輔超高壓變電所'],
    overlay: { x: 42, y: 40, w: 26, h: 26, label: '基輔能源樞紐' }
  },
  gaza_civil: {
    title: '加薩走廊人道與避難區域',
    theater: '以巴戰區',
    significance: '避難營地與人道補給通道',
    watchPoints: '過境點、帳篷區、醫療設施',
    coords: [34.45, 31.5],
    tacticalFacilities: ['拉法／凱雷姆沙洛姆口岸', '沿海阿爾馬瓦西人道疏散區', '汗尤尼斯醫療避難聚落', '薩拉丁公路主要補給幹道'],
    overlay: { x: 38, y: 45, w: 28, h: 28, label: '人道避難與疏散通道' }
  }
};

function getCopernicusBrowserLink(asset, target, band = 'rgb') {
  const coords = target?.coords || [0, 0];
  const dateStr = asset?.acquiredAt ? asset.acquiredAt.slice(0, 10) : '';
  if (band === 'sar') {
    return `https://browser.dataspace.copernicus.eu/?zoom=12&lat=${coords[1]}&lng=${coords[0]}&themeId=DEFAULT-THEME&datasetId=S1_CDAS_IW_GRD&layerId=IW-DV-AMPLITUDE-GAMMA0-DB&fromTime=${dateStr}T00%3A00%3A00.000Z&toTime=${dateStr}T23%3A59%3A59.999Z`;
  }
  if (band === 'swir') {
    return `https://browser.dataspace.copernicus.eu/?zoom=12&lat=${coords[1]}&lng=${coords[0]}&themeId=DEFAULT-THEME&datasetId=S2_L2A_CDAS&visualizationUrl=https%3A%2F%2Fsh.dataspace.copernicus.eu%2Fogc%2Fwms%2Fa91f72b5-f395-4347-ab75-9260abeb688d&layerId=SWIR&fromTime=${dateStr}T00%3A00%3A00.000Z&toTime=${dateStr}T23%3A59%3A59.999Z`;
  }
  return `https://browser.dataspace.copernicus.eu/?zoom=12&lat=${coords[1]}&lng=${coords[0]}&themeId=DEFAULT-THEME&visualizationUrl=https%3A%2F%2Fsh.dataspace.copernicus.eu%2Fogc%2Fwms%2Fa91f72b5-f395-4347-ab75-9260abeb688d&datasetId=S2_L2A_CDAS&fromTime=${dateStr}T00%3A00%3A00.000Z&toTime=${dateStr}T23%3A59%3A59.999Z`;
}

// 目標附近的 FIRMS 熱點：不在觀測框內、快取過舊或讀不到都回「無法判定」，不當成 0 處
function getThermalTelemetry(target, now = Date.now()) {
  const coords = target?.coords;
  try {
    const { THEATER_BOUNDS } = require('./firms_monitor');
    const key = coords && Object.keys(THEATER_BOUNDS).find(k => { const [x0, y0, x1, y1] = THEATER_BOUNDS[k].bbox; return coords[0] >= x0 && coords[0] <= x1 && coords[1] >= y0 && coords[1] <= y1; });
    if (!key) return '無法判定（此地點不在 FIRMS 觀測框內）';
    const t = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/firms_cache.json'), 'utf8'))[key];
    if (!t || !Array.isArray(t.clusters)) return '無法判定（沒有 FIRMS 資料）';
    const age = (now - Date.parse(t.fetchedAt)) / 3600000;
    if (!(age <= 36)) return `無法判定（FIRMS 資料已 ${Number.isFinite(age) ? Math.round(age) : '?'} 小時未更新）`;
    const nearby = t.clusters.filter(c => Math.hypot(c.centerLon - coords[0], c.centerLat - coords[1]) <= 0.8);
    if (nearby.length) return `⚠️ 附近有 ${nearby.length} 處熱點聚落 (最高 FRP ${Math.max(...nearby.map(c => c.totalFrp || 0))} MW)，原因未判定`;
    return '附近約 80 公里內沒有偵測到熱點（雲層下或較弱的熱源偵測不到）';
  } catch (_) {
    return '無法判定（FIRMS 資料讀取失敗）';
  }
}

function formatArrivalPayload(asset) {
  const quality = assessCloudGrade(asset.cloudCoverPercent);
  const target = TARGET_INTEL[asset.region] || {
    title: asset.region,
    theater: '一般戰區',
    significance: '重點軍事與地緣觀測目標',
    watchPoints: '地表設施與活動動態',
    coords: [0, 0]
  };

  const cloudPct = asset.cloudCoverPercent != null ? Math.round(asset.cloudCoverPercent * 10) / 10 : null;
  const isCloudyOrObscured = cloudPct !== null && cloudPct > 20;
  const thermalNote = getThermalTelemetry(target);
  const browserLink = getCopernicusBrowserLink(asset, target);

  let usabilityText = '';
  if (cloudPct === null) {
    usabilityText = '❓ 雲量未標注 ｜ 需人工目視覆核';
  } else if (cloudPct <= 10) {
    usabilityText = '🟢 整片雲量低 ｜ 目標區是否清楚仍需看實際影像';
  } else if (cloudPct <= 20) {
    usabilityText = `🟡 整片雲量中等 (${cloudPct}%) ｜ 目標區可能有雲或雲影，需看實際影像`;
  } else {
    usabilityText = `🔴 整片雲量高 (${cloudPct}%) ｜ 目標區很可能被雲遮，縮圖不附上`;
  }

  const lines = [
    '# 🛰️ 【新衛星影像公開資料到達提示 // SATELLITE IMAGERY ARRIVAL】',
    `> 📍 **目標區域**: \`${target.title}\` (\`${asset.region}\`)`,
    `> 🎯 **戰略定位**: ${target.significance}`,
    `> 🕒 **拍攝時間**: \`${asset.acquiredAt}\` (UTC) ｜ **產品編號**: \`${asset.productId}\``,
    `> ☁️ **雲量與品質標示**: ${quality.badge} ｜ 整片雲量: \`${asset.cloudCoverPercent ?? '未提供'}%\``,
    `> 👁️ **光學可用度評估**: ${usabilityText}`,
    `> 🔥 **附近熱點 (NASA FIRMS 24h，厚雲時也偵測不到)**: ${thermalNote}`,
    `> 🌐 **原始影像**: [Copernicus Browser 10m 原生影像檢視](${browserLink})`,
    `> 🔗 **來源產品**: [Element84 / Copernicus Sentinel-2](${asset.sourceProductUrl})`,
    '',
    '### 📌 【目標監控重點與判讀指引】',
    `• **關鍵設施**: ${target.watchPoints}`,
    isCloudyOrObscured
      ? '• **雲遮說明**：整片雲量高，縮圖不附上；可用上方連結檢查目標區局部是否有空隙。光學與短波紅外都無法穿透厚雲，陰天需改看 Sentinel-1 雷達影像。'
      : '• **目視指引**：可比對歷史影像跑道、泊位或建物輪廓變化；注意光照角度差異。',
    '',
    '### ⚠️ 【重要聲明與判讀限制】',
    '• **未進行兵力辨識或戰損判讀**：本通知僅為衛星公開產品到達提示，未進行自動或人工對位判讀。',
    '• **目視限制**：光學衛星影像受雲層與視角影響，禁止單憑單一縮圖下定論。',
    '• **正式分析要求**：完成實際精確對位與專業光學解讀後，才會透過研究專頁發布變化結論。'
  ];

  const shouldAttachImage = !isCloudyOrObscured && asset.file && fs.existsSync(path.join(__dirname, '../public', asset.file));

  return {
    sourceBacked: true,
    content: lines.join('\n').slice(0, 2000),
    files: shouldAttachImage
      ? [{ attachment: path.join(__dirname, '../public', asset.file), name: path.basename(asset.file) }]
      : [],
    embeds: []
  };
}

function checkNewArrivals(store = getStore()) {
  const ledger = getArrivalLedger();
  const notifiedSet = new Set(ledger.notifiedProductIds || []);
  const assets = store.imagery().filter(validLocalAsset);
  const newAssets = assets.filter(a => !notifiedSet.has(a.productId));

  if (!newAssets.length) return [];

  for (const a of newAssets) {
    ledger.notifiedProductIds.push(a.productId);
  }
  ledger.notifiedProductIds = ledger.notifiedProductIds.slice(-200);
  saveArrivalLedger(ledger);

  return newAssets.map(a => ({ asset: a, payload: formatArrivalPayload(a) }));
}

function getTacticalMapData(store = getStore()) {
  const satFeed = getSatelliteFeed(undefined, store);
  const targets = (satFeed.comparisons || []).map(c => {
    const coords = c.targetIntel?.coords || [0, 0];
    return {
      key: c.region,
      title: c.targetIntel?.title || c.region,
      theater: c.targetIntel?.theater || '一般戰區',
      coords: coords,
      lat: coords[1],
      lon: coords[0],
      significance: c.targetIntel?.significance,
      watchPoints: c.targetIntel?.watchPoints,
      tacticalFacilities: c.tacticalFacilities || [],
      cloudPercent: c.cloudPercent,
      cloudGrade: c.cloudGrade,
      isCloudBlocked: c.isCloudBlocked,
      acquiredAt: c.latest?.acquiredAt || null,
      imageUrl: c.latest?.imageUrl || null,
      baselineImageUrl: c.baseline?.imageUrl || c.latest?.imageUrl || null,
      multiBands: c.multiBands,
      overlay: c.overlay
    };
  });

  let firmsClusters = [];
  try {
    const firmsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/firms_cache.json'), 'utf8'));
    for (const [theaterKey, t] of Object.entries(firmsData)) {
      if (Array.isArray(t.clusters)) {
        for (const cluster of t.clusters) {
          firmsClusters.push({
            centerLat: cluster.centerLat,
            centerLon: cluster.centerLon,
            totalFrp: cluster.totalFrp,
            pointCount: cluster.pointCount,
            intensity: cluster.intensity,
            theater: theaterKey,
            latestObservedAt: cluster.latestObservedAt
          });
        }
      }
    }
  } catch (_) {}

  let notams = [];
  try {
    const notamData = require('./notam_monitor').getNotamFeed();
    if (Array.isArray(notamData.notams)) {
      notams = notamData.notams.map(n => ({
        id: n.id,
        title: n.title,
        fir: n.fir,
        type: n.type,
        status: n.status,
        lowerLimit: n.lowerLimit,
        upperLimit: n.upperLimit,
        validFrom: n.validFrom,
        validTo: n.validTo
      }));
    }
  } catch (_) {}

  return {
    targets,
    firmsClusters,
    notams,
    generatedAt: new Date().toISOString()
  };
}

module.exports={
  assetRecord,
  validLocalAsset,
  refreshSatelliteAssets,
  getSatelliteFeed,
  satelliteDiscordPayload,
  formatArrivalPayload,
  checkNewArrivals,
  TARGET_INTEL,
  getCopernicusBrowserLink,
  getTacticalMapData
};
