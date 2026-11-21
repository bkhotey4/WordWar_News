'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const ROOT=path.join(__dirname,'..');
const PUBLIC=path.join(ROOT,'public');
const REGISTRY=path.join(PUBLIC,'data','global_theaters.json');
function selectCitedAssets(reports,assets){
  const refs=reports.flatMap(report=>report.imagery||[]);
  return assets.filter(asset=>asset.verified===true&&refs.some(ref=>ref.region===asset.region&&ref.productId===asset.productId&&ref.sha256===asset.sha256));
}
const version=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(PUBLIC,file))).digest('hex').slice(0,12);

function buildBriefing(out,now=Date.now()){
  fs.mkdirSync(path.join(out,'assets'),{recursive:true});
  const registry=JSON.parse(fs.readFileSync(REGISTRY,'utf8'));
  const reports=require('../src/research_reports').getResearchFeed(now).reports.slice(0,8);
  // Only export products explicitly cited by a current, reviewed report.
  const candidates=selectCitedAssets(reports,require('../src/satellite_assets').getSatelliteFeed().assets);
  const seen=new Set(),assets=[];
  for(const asset of candidates){
    const key=`${asset.region}:${asset.productId}:${asset.sha256}`;
    if(seen.has(key))continue;
    if(!/^images\/sentinel\/[a-zA-Z0-9_.-]+\.(?:webp|jpg|png)$/.test(asset.file||''))continue;
    const source=path.resolve(PUBLIC,asset.file);
    if(!source.startsWith(path.resolve(PUBLIC,'images','sentinel')+path.sep)||!fs.existsSync(source))continue;
    const name=`briefing_${asset.productId}_${asset.region}${path.extname(asset.file)}`;
    fs.copyFileSync(source,path.join(out,'assets',name));
    assets.push({region:asset.region,productId:asset.productId,acquiredAt:asset.acquiredAt,cloudCoverPercent:asset.cloudCoverPercent,
      sourceProductUrl:asset.sourceProductUrl,credit:asset.credit,sha256:asset.sha256,cropBbox:asset.cropBbox,imageUrl:`assets/${name}`,verified:true});
    seen.add(key);
  }
  const safeReports=reports.map(r=>({id:r.id,title:r.title,theater:r.theater,asOf:r.asOf,generatedAt:r.generatedAt,reviewed:r.reviewed,supersededBy:r.supersededBy||null,
    changeSummary:r.changeSummary||null,sections:r.sections,cardPoints:r.cardPoints||[],scenarios:r.scenarios||[],references:r.references||[],
    imagery:(r.imagery||[]).filter(ref=>assets.some(asset=>asset.region===ref.region&&asset.productId===ref.productId&&asset.sha256===ref.sha256))}));
  // Keep the empty observations shape while older cached briefing.js is still in browsers.
  const snapshot=JSON.stringify({generatedAt:new Date(now).toISOString(),reports:{reports:safeReports},registry,satellite:{assets},observations:{observations:[]}});
  fs.writeFileSync(path.join(out,'briefing-data.json'),snapshot);
  const snapshotVersion=crypto.createHash('sha256').update(snapshot).digest('hex').slice(0,12);
  const html=fs.readFileSync(path.join(PUBLIC,'briefing.html'),'utf8').replace('href="style.css"','href="briefing-base.css"')
    .replace('href="global.html"','href="index.html#bands"').replace('href="events.html"','href="timeline.html"')
    .replace('<title>情勢簡報',`<meta name="briefing-data" content="briefing-data.json?v=${snapshotVersion}"><title>情勢簡報`)
    .replace('href="briefing-base.css"',`href="briefing-base.css?v=${version('style.css')}"`)
    .replace('href="briefing.css"',`href="briefing.css?v=${version('briefing.css')}"`)
    .replace('src="briefing.js"',`src="briefing.js?v=${version('briefing.js')}"`);
  fs.writeFileSync(path.join(out,'briefing.html'),html);
  for(const name of ['briefing.js','briefing.css'])fs.copyFileSync(path.join(PUBLIC,name),path.join(out,name));
  fs.copyFileSync(path.join(PUBLIC,'style.css'),path.join(out,'briefing-base.css'));
  return {reports:safeReports.length,assets:assets.length};
}
module.exports={buildBriefing,selectCitedAssets};
if(require.main===module){const out=process.argv[2]||path.join(ROOT,'public_site');console.log(buildBriefing(out));}
