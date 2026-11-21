const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'../research');
function theaterRegistry() {
  const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/data/global_theaters.json'),'utf8')).theaters;
  if(!Array.isArray(rows)||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Invalid theater registry');
  return rows;
}
const bounded=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
function validateOutlook(report,now=Date.now()) {
  if(!report||typeof report!=='object')return false;
  if(!Array.isArray(report.basis)||report.basis.some(r=>!r))return false;
  const ids=new Set(report.basis.map(r=>r.id));
  const evidence=v=>Array.isArray(v)&&v.length>0&&v.length<=10&&new Set(v).size===v.length&&v.every(id=>ids.has(id));
  if(report.coverage!==undefined) {
    const valid=new Set(theaterRegistry().map(t=>t.id));
    if(!Array.isArray(report.coverage)||!report.coverage.length||report.coverage.length>theaterRegistry().length||new Set(report.coverage.map(c=>c?.theater)).size!==report.coverage.length)return false;
    if(!report.coverage.every(c=>c&&valid.has(c.theater)&&bounded(c.summary,400)&&evidence(c.evidence)&&Number.isFinite(Date.parse(c.observedAt))&&Date.parse(c.observedAt)<=now))return false;
  }
  if(report.scenarios!==undefined) {
    if(!Array.isArray(report.scenarios)||!report.scenarios.length||report.scenarios.length>3)return false;
    if(!report.scenarios.every(s=>s&&bounded(s.name,60)&&bounded(s.horizon,60)&&bounded(s.assumption,300)&&bounded(s.implication,300)&&evidence(s.evidence)&&
      ['triggers','counterEvidence'].every(key=>Array.isArray(s[key])&&s[key].length>0&&s[key].length<=3&&s[key].every(v=>bounded(v,150)))&&
      !Object.hasOwn(s,'probability')))return false;
  }
  if(report.imagery!==undefined) {
    if(!Array.isArray(report.imagery)||report.imagery.length>2)return false;
    if(!report.imagery.every(i=>i&&bounded(i.region,60)&&bounded(i.productId,100)&&/^[a-f0-9]{64}$/.test(i.sha256)&&
      bounded(i.caption,220)&&['CONTEXT_ONLY','REVIEWED_OBSERVATION'].includes(i.role)&&
      (i.role!=='REVIEWED_OBSERVATION'||(bounded(i.observation,300)&&evidence(i.evidence)&&Number.isFinite(Date.parse(i.reviewedAt))&&Date.parse(i.reviewedAt)<=now))))return false;
  }
  return true;
}
function outlookText(report) {
  return (report.scenarios||[]).map(s=>`**情境推演｜${s.name}（${s.horizon}）**\n假設：${s.assumption}\n可能影響：${s.implication}\n成立條件：${s.triggers.join('；')}\n反證：${s.counterEvidence.join('；')} ${s.evidence.map(id=>`[${report.basis.findIndex(r=>r.id===id)+1}]`).join(' ')}`).join('\n\n');
}
function resolveImagery(report,assets) {
  return (report.imagery||[]).flatMap(ref=>{
    const asset=assets.find(a=>a.region===ref.region&&a.productId===ref.productId&&a.sha256===ref.sha256);
    return asset?[{...asset,caption:ref.caption,role:ref.role,observation:ref.role==='REVIEWED_OBSERVATION'?ref.observation:null,reviewedAt:ref.reviewedAt||null,mapFrame:mapFrameForAsset(asset)}]:[];
  });
}
function mapFrameForAsset(asset) {
  if(asset?.kind!=='SOURCE_AOI_CROP'||!Array.isArray(asset.cropBbox)||asset.cropBbox.length!==4||
    !Array.isArray(asset.bbox)||asset.bbox.length!==4||!Array.isArray(asset.outputSize)||asset.outputSize.length!==2||
    !asset.cropBbox.every(Number.isFinite)||!asset.bbox.every(Number.isFinite)||
    !asset.outputSize.every(n=>Number.isInteger(n)&&n>0))return null;
  const [west,south,east,north]=asset.cropBbox,[tileWest,tileSouth,tileEast,tileNorth]=asset.bbox;
  if(west>=east||south>=north||west<tileWest||south<tileSouth||east>tileEast||north>tileNorth||
    west < -180||east > 180||south < -90||north > 90)return null;
  return {queryBbox:[west,south,east,north],outputSize:asset.outputSize,kind:'SOURCE_QUERY_EXTENT',
    note:'查詢範圍取自來源產品與裁切參數；UTM 裁切後的圖片邊緣不等於精確經緯度邊界。'};
}
function buildGlobalBrief(reports,satellite,now=Date.now(),newsContext=[]) {
  const theaters=theaterRegistry().map(theater=>{
    const related=reports.filter(r=>r.theater===theater.id||r.coverage?.some(c=>c.theater===theater.id));
    const updates=related.flatMap(r=>{
      const c=r.coverage?.find(c=>c.theater===theater.id);
      const observedAt=c?.observedAt||r.asOf;
      const fresh=Date.parse(observedAt)<=now&&now-Date.parse(observedAt)<=48*3600000;
      const timePrecision=c?.evidence?.some(id=>r.references?.some(ref=>ref.id===id&&ref.sourceType?.includes('DATE_ONLY')))?'DAY':'INSTANT';
      return [{reportId:r.id,title:r.title,summary:c?.summary||r.sections.find(s=>s.kind==='REPORTED')?.text||r.sections[0]?.text,
        observedAt,timePrecision,status:fresh?'RECENT_REPORT':'DATED_CONTEXT',references:r.references,
        map:r.map?.theater===theater.id?r.map:null,
        scenarios:(r.scenarios||[]).filter(s=>!c||s.evidence.every(id=>c.evidence.includes(id))),
        imagery:resolveImagery(r,satellite.assets).filter(a=>theater.satelliteRegions.includes(a.region))}];
    }).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
    return {...theater,sourceAccess:'RESEARCH_TARGETS_NOT_CONNECTOR_STATUS',status:updates.some(u=>u.status==='RECENT_REPORT')?'RECENT_REPORT':updates.length?'DATED_CONTEXT':'NO_RECENT_REVIEWED_REPORT',updates,
      newsContext:newsContext.filter(c=>c.theater===theater.id),
      satelliteAssets:satellite.assets.filter(a=>theater.satelliteRegions.includes(a.region))};
  });
  return {generatedAt:new Date(now).toISOString(),mode:'SOURCE_BACKED_STRATEGIC_SCENARIOS',completeGlobalCoverage:false,theaters,satelliteHealth:satellite.sourceHealth,
    note:'情境是有條件的分析，不是已發生事件或戰爭機率。無近期報導不代表該區沒有衝突。影像日期不等於現在，背景圖不能證明戰果。'};
}
module.exports={theaterRegistry,validateOutlook,outlookText,resolveImagery,mapFrameForAsset,buildGlobalBrief};
