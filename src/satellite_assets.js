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
    const newest=assets.find(a=>a.region===key);
    const previous=assets.find(a=>a.region===key&&a.tile===newest.tile&&a.acquiredAt<newest.acquiredAt);
    comparisons.push({region:key,latest:newest,previous:previous||null,status:previous?'VISUAL_REVIEW_PAIR':'SINGLE_IMAGE',pixelChangeAnalysis:false,note:'同瓦片不同日期，僅供目視比對；裁切範圍可能因產品覆蓋而異，未進行雲遮、對位或戰損判讀。'});
  }
  return {sourceHealth:store.getHealth('Satellite_Assets'),assets,comparisons};
}
function satelliteDiscordPayload(region,compare=false) {
  const feed=getSatelliteFeed(region);const assets=compare?(feed.comparisons[0]?[feed.comparisons[0].previous,feed.comparisons[0].latest].filter(Boolean):[]):feed.assets.slice(0,1);
  return {sourceBacked:true,content:assets.length?'# Sentinel-2 來源影像\n來源裁切或產品預覽，未判讀軍事活動；拍攝日期不是目前時間。':'尚無成功下載且通過來源與檔案檢查的影像。',allowedMentions:{parse:[]},
    files:assets.map(a=>({attachment:path.join(__dirname,'../public',a.file),name:path.basename(a.file)})),embeds:assets.map(a=>({title:`${a.region}｜${a.acquiredAt}`,url:a.sourceProductUrl,description:`${a.scope}\n品質標示：${assessCloudGrade(a.cloudCoverPercent).badge}\n整片雲量：${a.cloudCoverPercent??'未提供'}%\n產品：${a.productId}\n[資料授權](${a.licenseUrl})`,image:{url:`attachment://${path.basename(a.file)}`},footer:{text:a.credit}}))};
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

function formatArrivalPayload(asset) {
  const quality = assessCloudGrade(asset.cloudCoverPercent);
  const lines = [
    '# 🛰️ 【新衛星影像公開資料到達提示 // SATELLITE IMAGERY ARRIVAL】',
    `> 📍 **目標區域**: \`${asset.region}\` ｜ **產品編號**: \`${asset.productId}\``,
    `> 🕒 **拍攝時間**: \`${asset.acquiredAt}\` (UTC) ｜ **瓦片**: \`${asset.tile || '未知'}\``,
    `> ☁️ **雲量與品質標示**: ${quality.badge} ｜ 整片雲量: \`${asset.cloudCoverPercent ?? '未提供'}%\``,
    `> 🔗 **來源產品**: [Element84 / Copernicus Sentinel-2](${asset.sourceProductUrl})`,
    '',
    '### ⚠️ 【重要聲明與判讀限制】',
    '• **未進行兵力辨識或戰損判讀**：本通知僅為衛星公開產品到達提示，未進行自動或人工對位判讀。',
    '• **目視限制**：光學衛星影像受雲層與視角影響，禁止單憑單一縮圖下定論。',
    '• **正式分析要求**：完成實際精確對位與專業光學解讀後，才會透過研究專頁發布變化結論。'
  ];
  return {
    sourceBacked: true,
    content: lines.join('\n').slice(0, 2000),
    files: asset.file && fs.existsSync(path.join(__dirname, '../public', asset.file))
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

module.exports={assetRecord,validLocalAsset,refreshSatelliteAssets,getSatelliteFeed,satelliteDiscordPayload,formatArrivalPayload,checkNewArrivals};
