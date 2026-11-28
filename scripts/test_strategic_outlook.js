const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateOutlook,buildGlobalBrief,resolveImagery,mapFrameForAsset}=require('../src/strategic_outlook');
const {getSatelliteTargets}=require('../src/satellite_stac');
const {revision}=require('../src/research_dispatch');
const {researchMap}=require('../src/research_reports');
const now=Date.now(),stamp=new Date(now-1000).toISOString();
const scenario={name:'持續僵持',horizon:'未來一週',assumption:'未有協議',implication:'民生壓力持續',triggers:['公開公告未改變'],counterEvidence:['可查核停火生效'],evidence:['a']};
const report={id:'a',title:'分析',basis:[{id:'a'}],asOf:stamp,sections:[{text:'有來源內容'}],scenarios:[scenario],coverage:[{theater:'sudan',observedAt:stamp,summary:'事件內容',evidence:['a']}]};
test('scenarios require source references, assumptions, triggers and counter evidence; no unsupported probability',()=>{
 assert.equal(validateOutlook(report,now),true);
 for(const change of [{evidence:['unknown']},{counterEvidence:[]},{probability:0.8},{triggers:'none'}])assert.equal(validateOutlook({...report,scenarios:[{...scenario,...change}]},now),false);
 assert.equal(validateOutlook({...report,coverage:[{...report.coverage[0],observedAt:new Date(now+1000).toISOString()}]},now),false);
});
test('a new article in one theater cannot freshen older facts in another',()=>{
 const old=new Date(now-10*86400000).toISOString();
 const result=buildGlobalBrief([{...report,coverage:[{...report.coverage[0],observedAt:old}]}],{assets:[]},now);
 assert.equal(result.theaters.find(t=>t.id==='sudan').status,'DATED_CONTEXT');
 assert.equal(result.theaters.find(t=>t.id==='myanmar').status,'NO_RECENT_REVIEWED_REPORT');
 assert.equal(result.completeGlobalCoverage,false);
});
test('date-only source metadata prevents presenting synthetic midnight as a publication clock time',()=>{
 const r={...report,references:[{id:'a',sourceType:'REVIEWED_DATE_ONLY_ARTICLE_NOTES'}]};
 const result=buildGlobalBrief([r],{assets:[]},now);
 assert.equal(result.theaters.find(t=>t.id==='sudan').updates[0].timePrecision,'DAY');
});
test('satellite evidence must match both product identity and file hash',()=>{
 const asset={region:'a',productId:'p',sha256:'1'.repeat(64)};
 const r={imagery:[{...asset,role:'CONTEXT_ONLY',caption:'背景'}]};
 assert.equal(resolveImagery(r,[asset]).length,1);
 assert.equal(resolveImagery(r,[{...asset,sha256:'2'.repeat(64)}]).length,0);
 assert.equal(resolveImagery({...r,imagery:[{...r.imagery[0],observation:'不可當成判讀'}]},[asset])[0].observation,null);
});
test('map frame uses only bounded source crop metadata',()=>{
 const source={kind:'SOURCE_AOI_CROP',cropBbox:[32.4,15.45,32.65,15.7],bbox:[32,15,33,16],outputSize:[800,800]};
 assert.deepEqual(mapFrameForAsset(source).queryBbox,source.cropBbox);
 assert.equal(mapFrameForAsset({...source,cropBbox:[31,15.45,32.65,15.7]}),null);
 assert.equal(mapFrameForAsset({...source,kind:'SOURCE_TILE_PREVIEW'}),null);
 assert.equal(mapFrameForAsset({...source,outputSize:[0,800]}),null);
});
test('a changed scenario or satellite evidence creates a new delivery revision',()=>{
 assert.notEqual(revision(report),revision({...report,scenarios:[{...scenario,implication:'改變影響'}]}));
 assert.notEqual(revision(report),revision({...report,imagery:[{productId:'new'}]}));
});
test('global scenarios and satellite images appear only in related theater cards',()=>{
 const hash='1'.repeat(64),asset={region:'khartoum_civil',productId:'p',sha256:hash};
 const r={...report,coverage:[...report.coverage,{theater:'taiwan_strait',observedAt:stamp,summary:'公開調查',evidence:['b']}],imagery:[{...asset,role:'CONTEXT_ONLY',caption:'背景'}]};
 const feed=buildGlobalBrief([r],{assets:[asset]},now);
 assert.equal(feed.theaters.find(t=>t.id==='taiwan_strait').updates[0].scenarios.length,0);
 assert.equal(feed.theaters.find(t=>t.id==='taiwan_strait').updates[0].imagery.length,0);
 assert.equal(feed.theaters.find(t=>t.id==='sudan').updates[0].imagery.length,1);
});
test('cross-region evidence does not create a theater-specific scenario',()=>{
 const r={...report,basis:[{id:'a'},{id:'b'}],scenarios:[{...scenario,evidence:['a','b']}]};
 const feed=buildGlobalBrief([r],{assets:[]},now);
 assert.equal(feed.theaters.find(t=>t.id==='sudan').updates[0].scenarios.length,0);
});
test('a source map is shown only with matching imported original and theater',()=>{
 const source={id:'map-source',url:'https://example.test/original',publishedAt:stamp,contentHash:'a'.repeat(64)};
 const base={...report,basis:[{id:source.id,contentHash:source.contentHash}],map:{sourceId:source.id,theater:'sudan',reviewed:true,displayAllowed:true,imageUrl:'https://example.test/map.png',sourceUrl:source.url,publishedAt:stamp,credit:'Map author',caption:'Source annotations'}};
 const sources={documents:[source]};
 assert.equal(researchMap(base,sources,now).theater,'sudan');
 assert.equal(researchMap({...base,map:{...base.map,theater:'ukraine_front'}},sources,now),null);
 assert.equal(researchMap({...base,map:{...base.map,sourceUrl:'https://example.test/copied'}},sources,now),null);
 assert.equal(researchMap({...base,map:{...base.map,publishedAt:new Date(now-30_000).toISOString()}},sources,now),null);
 assert.equal(researchMap({...base,map:{...base.map,displayAllowed:false}},sources,now),null);
 const brief=buildGlobalBrief([{...base,map:researchMap(base,sources,now)}],{assets:[]},now);
 assert.equal(brief.theaters.find(t=>t.id==='sudan').updates[0].map.sourceId,source.id);
 assert.equal(brief.theaters.find(t=>t.id==='ukraine_front').updates.length,0);
});
test('configured civilian satellite regions have unique keys and bounded coordinates',()=>{
 const targets=getSatelliteTargets();assert.equal(targets.length,9);
 assert.equal(new Set(targets.map(t=>t.targetKey)).size,targets.length);
 assert.ok(targets.some(t=>t.targetKey==='khartoum_civil'));
});
