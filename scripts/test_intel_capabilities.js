const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const {IntelStore}=require('../src/intel_store');
const {parseMndArticle,rocDate,articleLinks}=require('../src/collectors/taiwan_mnd');
const {assessTaiwan,dailySeries,backtestTaiwan}=require('../src/taiwan_intel');
const {assetRecord}=require('../src/satellite_assets');
const {cropWindow}=require('../src/satellite_crop');
const html=fs.readFileSync(path.join(__dirname,'fixtures/mnd-20260926.html'),'utf8');
const url='https://www.mnd.gov.tw/news/plaact/87838';
const now=Date.parse('2026-09-26T13:00:00Z');
test('official page uses its real statistics period, units and diagram type',()=>{
  const doc=parseMndArticle(html,url,now);
  assert.equal(doc.observation.periodStart,'2026-09-24T22:00:00.000Z');
  assert.equal(doc.observation.periodEnd,'2026-09-25T22:00:00.000Z');
  assert.deepEqual(doc.observation.aircraft,{value:5,unit:'架次'});
  assert.deepEqual(doc.observation.crossingOrAirspace,{value:1,unit:'架'});
  assert.equal(doc.imageKind,'OFFICIAL_ACTIVITY_DIAGRAM');
  assert.equal(doc.publicationPrecision,'DAY');
});
test('missing numbers remain unknown and future or impossible dates fail',()=>{
  const doc=parseMndArticle(html.replace('共機5架次','共機未提供'),url,now);
  assert.equal(doc.observation.aircraft.value,null);
  assert.equal(doc.observation.reviewRequired,true);
  assert.equal(rocDate('115.02.30'),null);
  assert.throws(()=>parseMndArticle(html,url,Date.parse('2026-09-24T00:00:00Z')));
});
test('official relative URLs respect the site base and exclude other hosts',()=>{
  const list='<base href="/"><a class="news_list" href="news/plaact/87838">臺海周邊</a><a class="news_list" href="https://example.com/news/plaact/1">臺海周邊</a>';
  assert.deepEqual(articleLinks(list),[url]);
});
test('SQLite preserves source corrections and distinguishes historical versions',()=>{
  const store=new IntelStore(':memory:');
  try {
    const original=parseMndArticle(html,url,now);store.putDocument(original);
    assert.equal(store.putDocument(original).changed,false);
    const corrected=parseMndArticle(html.replace('共機5架次','共機6架次'),url,now);
    store.putDocument(corrected);
    const changes=store.changes();
    assert.equal(changes.length,2);assert.equal(changes[0].kind,'CORRECTION');
    assert.equal(changes[0].previousObservation.aircraft.value,5);
    assert.equal(changes[0].observation.aircraft.value,6);
    assert.equal(changes[1].currentVersion,false);
    assert.equal(store.documents()[0].observation.aircraft.value,6);
  }finally{store.close();}
});
function history(count=35) {
  return Array.from({length:count},(_,i)=>{
    const end=now-(count-1-i)*24*60*60_000;
    return {id:String(i),url:'https://www.mnd.gov.tw/news/plaact/'+i,observation:{periodStart:new Date(end-24*60*60_000).toISOString(),periodEnd:new Date(end).toISOString(),reviewRequired:false,aircraft:{value:i===count-1?30:5,unit:'架次'}}};
  });
}
test('anomaly candidates require sufficient same-unit history and remain in observation mode',()=>{
  assert.equal(assessTaiwan(history(20),now).status,'INSUFFICIENT_HISTORY');
  const run=assessTaiwan(history(),now);
  assert.equal(run.status,'ANOMALY_REVIEW');assert.equal(run.pushEnabled,false);
  assert.equal(run.indicators[0].historicalP95,5);
  const mixed=history();mixed.slice(0,20).forEach(d=>d.observation.aircraft.unit='架');
  assert.equal(assessTaiwan(mixed,now).status,'INSUFFICIENT_HISTORY');
  assert.equal(assessTaiwan(history(),now+3*24*60*60_000).status,'STALE_OBSERVATION');
});
test('conflicting same-period notices are excluded rather than double-counted',()=>{
  const docs=history();const conflict=JSON.parse(JSON.stringify(docs[0]));conflict.id='duplicate';conflict.observation.aircraft.value=99;
  assert.equal(dailySeries([...docs,conflict,conflict]).length,docs.length-1);
});
test('historical replay never claims accuracy without labeled outcomes',()=>{
  const result=backtestTaiwan(history());assert.ok(result.evaluatedDays>0);
  assert.equal(result.falsePositiveRate,null);assert.equal(result.leadTime,null);
});
test('image provenance accepts only original asset host and valid acquisition dates',()=>{
  const item={id:'S2B_50RQP_20260924_0_L2A',bbox:[119,25,120,26],properties:{datetime:'2026-09-24T00:00:00Z'},assets:{thumbnail:{href:'https://sentinel-cogs.s3.us-west-2.amazonaws.com/path/preview.jpg'}}};
  const record=assetRecord(item,'longtian');assert.equal(record.kind,'SOURCE_TILE_PREVIEW');assert.equal(record.interpretationStatus,'NOT_ANALYZED');
  assert.throws(()=>assetRecord({...item,assets:{thumbnail:{href:'https://example.com/preview.jpg'}}},'longtian'));
  assert.throws(()=>assetRecord({...item,properties:{datetime:'2099-01-01T00:00:00Z'}},'longtian'));
});
test('geographic crop maps the central meridian to the correct raster pixels',()=>{
  assert.deepEqual(cropWindow([10,0,499000,0,-10,1000],[200,200],32631,[2.9999,-.0001,3.0001,.0001]),[98,98,102,102]);
  assert.throws(()=>cropWindow([10,0,499000,0,-10,1000],[200,200],4326,[2.9999,-.0001,3.0001,.0001]));
  assert.throws(()=>cropWindow([10,1,499000,0,-10,1000],[200,200],32631,[2.9999,-.0001,3.0001,.0001]));
});
test('changed source versions return to the research queue',()=>{
  const store=new IntelStore(':memory:');
  try {
    const doc={id:'source',url:'https://example.com/article',body:'Original source body',publishedAt:'2026-09-25T00:00:00Z',originGroup:'EXTERNAL'};
    store.putDocument(doc);assert.equal(store.analysisHealth().pendingOriginalDocuments,1);
    store.reviewDocuments(['source']);assert.equal(store.analysisHealth().pendingOriginalDocuments,0);
    store.putDocument({...doc,body:'Corrected source body'});assert.equal(store.analysisHealth().pendingOriginalDocuments,1);
  }finally{store.close();}
});
