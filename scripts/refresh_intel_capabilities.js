const {refreshMnd}=require('../src/collectors/taiwan_mnd');
const {refreshSatelliteAssets}=require('../src/satellite_assets');
const {getTaiwanFeed}=require('../src/taiwan_intel');
const {getSatelliteFeed}=require('../src/satellite_assets');
const {getStore}=require('../src/intel_store');
(async()=>{
  const results=await Promise.allSettled([refreshMnd({force:true,backfill:process.argv.includes('--backfill')}),refreshSatelliteAssets({force:true})]);
  console.log(JSON.stringify(results.map((r,i)=>({source:i?'satellite':'mnd',...r.status==='fulfilled'?r.value:{error:r.reason.message}})),null,2));
  const tw=getTaiwanFeed(),sat=getSatelliteFeed();
  getStore().analysis({createdAt:new Date().toISOString(),kind:'STATISTICAL_REPLAY',backtest:tw.backtest,observationHashes:getStore().documents('TAIWAN_MND').map(d=>({id:d.id,hash:d.contentHash}))});
  console.log(JSON.stringify({officialHistory:tw.history.length,latestPeriod:tw.latest?.observation.periodEnd,assessment:tw.assessment.status,verifiedImages:sat.assets.length,comparisonPairs:sat.comparisons.filter(c=>c.previous).length}));
  if(results.some(r=>r.status==='rejected')||results.some(r=>r.status==='fulfilled'&&r.value.status==='DEGRADED'))process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
