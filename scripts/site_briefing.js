'use strict';
const fs=require('fs');
const path=require('path');
const ROOT=path.join(__dirname,'..');
const PUBLIC=path.join(ROOT,'public');
const REGISTRY=path.join(PUBLIC,'data','global_theaters.json');

function buildBriefing(out,now=Date.now()){
  fs.mkdirSync(path.join(out,'assets'),{recursive:true});
  const registry=JSON.parse(fs.readFileSync(REGISTRY,'utf8'));
  const reports=require('../src/research_reports').getResearchFeed(now).reports.slice(0,8);
  const regionKeys=new Set(reports.flatMap(report=>registry.theaters.find(t=>t.id===report.theater)?.satelliteRegions||[]));
  const candidates=require('../src/satellite_assets').getSatelliteFeed().assets
    .filter(asset=>regionKeys.has(asset.region)&&asset.verified===true&&Number.isFinite(Date.parse(asset.acquiredAt))&&now-Date.parse(asset.acquiredAt)<7*86400000&&Number(asset.cloudCoverPercent)<40)
    .sort((a,b)=>Date.parse(b.acquiredAt)-Date.parse(a.acquiredAt));
  const seen=new Set(),assets=[];
  for(const asset of candidates){
    if(seen.has(asset.region))continue;
    if(!/^images\/sentinel\/[a-zA-Z0-9_.-]+\.(?:webp|jpg|png)$/.test(asset.file||''))continue;
    const source=path.resolve(PUBLIC,asset.file);
    if(!source.startsWith(path.resolve(PUBLIC,'images','sentinel')+path.sep)||!fs.existsSync(source))continue;
    const name=`briefing_${asset.productId}_${asset.region}${path.extname(asset.file)}`;
    fs.copyFileSync(source,path.join(out,'assets',name));
    assets.push({region:asset.region,productId:asset.productId,acquiredAt:asset.acquiredAt,cloudCoverPercent:asset.cloudCoverPercent,
      sourceProductUrl:asset.sourceProductUrl,credit:asset.credit,sha256:asset.sha256,cropBbox:asset.cropBbox,imageUrl:`assets/${name}`,verified:true});
    seen.add(asset.region);
  }
  const observations=JSON.parse(fs.readFileSync(path.join(PUBLIC,'data','imagery_observations.json'),'utf8')).observations
    .filter(o=>assets.some(a=>a.productId===o.productId&&a.sha256===o.sha256));
  const safeReports=reports.map(r=>({id:r.id,title:r.title,theater:r.theater,asOf:r.asOf,reviewed:r.reviewed,supersededBy:r.supersededBy||null,
    location:r.location||null,sections:r.sections,cardPoints:r.cardPoints||[],scenarios:r.scenarios||[],references:r.references||[]}));
  fs.writeFileSync(path.join(out,'briefing-data.json'),JSON.stringify({generatedAt:new Date(now).toISOString(),reports:{reports:safeReports},registry,satellite:{assets},observations:{observations}}));
  const html=fs.readFileSync(path.join(PUBLIC,'briefing.html'),'utf8').replace('href="style.css"','href="briefing-base.css"')
    .replace('href="global.html"','href="index.html#bands"').replace('href="events.html"','href="timeline.html"');
  fs.writeFileSync(path.join(out,'briefing.html'),html);
  for(const name of ['briefing.js','briefing.css'])fs.copyFileSync(path.join(PUBLIC,name),path.join(out,name));
  fs.copyFileSync(path.join(PUBLIC,'style.css'),path.join(out,'briefing-base.css'));
  return {reports:safeReports.length,assets:assets.length};
}
module.exports={buildBriefing};
if(require.main===module){const out=process.argv[2]||path.join(ROOT,'public_site');console.log(buildBriefing(out));}
