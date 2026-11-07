const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classifySource,evaluateIntelligenceReliability,verifyPhysicalTelemetry}=require('../src/verification_engine');
const {evaluateThreats}=require('../src/sentry');
const {parseFirmsCsv,clusterHotspots}=require('../src/firms_monitor');
test('publisher names and URL text cannot spoof a trusted domain',()=>{
 for(const link of ['https://evil.test/reuters.com','https://reuters.com.evil.test','https://evil.test/?site=mnd.gov.tw'])
   assert.equal(classifySource('Reuters 國防部',link).tier,4);
});
test('stale, wrong-theater and missing timestamp heat never corroborates a claim',()=>{
 for(const feed of [{success:true,theater:'taiwan_strait',fetchedAt:new Date().toISOString()},
   {success:true,theater:'ukraine_front',fetchedAt:'2020-01-01T00:00:00Z'},
   {success:true,theater:'ukraine_front'}]) {
   assert.equal(verifyPhysicalTelemetry('ukraine_front',{firmsFeed:feed}).corroborated,false);
   assert.equal(verifyPhysicalTelemetry('ukraine_front',{firmsFeed:feed}).status,'UNAVAILABLE');
 }
});
test('same-source recycled headlines cannot earn a verified verdict',()=>{
 const one={id:'one',title:'Kyiv airstrike power outage',source:'Reuters',link:'https://www.reuters.com/a',publishedAt:new Date().toISOString()};
 const two={...one,id:'two',title:'Kyiv airstrike blackout',link:'https://www.reuters.com/b'};
 const result=evaluateIntelligenceReliability(one,{},[one,two]);
 assert.equal(result.eligibleForBroadcast,false);
 assert.equal(Object.hasOwn(result.tacticalAssessment,'substantiveImpact'),false);
});
test('stale FIRMS cannot generate a sentry alert',()=>{
 assert.equal(evaluateThreats({firmsFeed:{success:true,fetchedAt:'2020-01-01T00:00:00Z',highIntensityClusters:[{latestObservedAt:new Date().toISOString(),totalFrp:999}]}}),null);
});
test('FIRMS rejects future acquisitions, missing FRP, invalid dates and unknown region',()=>{
 const header='latitude,longitude,frp,acq_date,acq_time';
 const now=Date.parse('2026-09-27T01:00:00Z');
 for(const row of ['48,37,10,2026-09-28,0000','48,37,,2026-09-27,0000','48,37,10,2026-09-27,2460','48,37,10,2026-02-30,0000'])
   assert.equal(parseFirmsCsv(header+'\n'+row,'ukraine_front',now).length,0);
 assert.equal(parseFirmsCsv(header+'\n48,37,10,2026-09-27,0000','unknown',now).length,0);
});
test('separate satellite overpasses are not added as simultaneous radiative power',()=>{
 const points=['2026-09-27T00:00:00Z','2026-09-27T03:00:00Z'].map(timestamp=>({latitude:48,longitude:37,frp:100,timestamp,theater:'ukraine_front'}));
 assert.equal(clusterHotspots(points).length,2);
});
