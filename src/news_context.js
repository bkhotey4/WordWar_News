const fs=require('fs');
const path=require('path');
const SOURCES=path.join(__dirname,'../research/sources.json');
const CLAIMS=path.join(__dirname,'../research/news_context.json');
const REGISTRY=path.join(__dirname,'../public/data/global_theaters.json');
const MAX_AGE_MS=30*86400000;
function read(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function validClaim(claim,documents,theaterIds,now=Date.now()){
  if(!claim||claim.reviewed!==true||!theaterIds.has(claim.theater)||!/^[a-z0-9_-]{1,100}$/.test(claim.id||''))return false;
  const permitted=new Set(['id','theater','parties','summary','observedAt','evidence','reviewed']);
  if(Object.keys(claim).some(key=>!permitted.has(key)))return false;
  if(!Array.isArray(claim.parties)||claim.parties.length<1||claim.parties.length>4||claim.parties.some(p=>typeof p!=='string'||!p.trim()||p.length>80)||
    typeof claim.summary!=='string'||!claim.summary.trim()||claim.summary.length>500)return false;
  if(!Array.isArray(claim.evidence)||!claim.evidence.length||claim.evidence.length>3||new Set(claim.evidence.map(r=>r?.id)).size!==claim.evidence.length)return false;
  const docs=claim.evidence.map(ref=>documents.find(doc=>ref&&doc.id===ref.id&&doc.contentHash===ref.contentHash));
  if(docs.some(doc=>!doc))return false;
  const observed=Date.parse(claim.observedAt),latest=Math.max(...docs.map(doc=>Date.parse(doc.publishedAt)));
  return Number.isFinite(observed)&&observed===latest&&observed<=now&&now-observed<=MAX_AGE_MS;
}
function getNewsContext(now=Date.now(),{sources=read(SOURCES,{documents:[]}),registry=read(REGISTRY,{theaters:[]}),claims=read(CLAIMS,{claims:[]})}={}){
  const valid=new Set((registry.theaters||[]).map(t=>t.id));
  return (claims.claims||[]).filter(c=>validClaim(c,sources.documents||[],valid,now)).map(c=>({
    id:c.id,theater:c.theater,parties:c.parties,summary:c.summary,observedAt:c.observedAt,
    status:now-Date.parse(c.observedAt)<=48*3600000?'RECENT_REPORT':'DATED_CONTEXT',
    references:c.evidence.map(ref=>{const doc=sources.documents.find(d=>d.id===ref.id);return {id:doc.id,url:doc.url,publisher:doc.publisher,publishedAt:doc.publishedAt,sourceType:doc.sourceType};}),
    assessment:'SOURCE_REPORTED_PARTIES_ONLY',imageIdentification:false
  }));
}
module.exports={validClaim,getNewsContext};
