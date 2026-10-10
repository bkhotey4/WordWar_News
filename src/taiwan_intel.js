const { getStore } = require('./intel_store');
const DAILY_MS=24*60*60_000;
function dailySeries(documents) {
  const periods=new Map();
  for(const doc of documents) {
    const o=doc.observation;
    if(!o||o.reviewRequired||Date.parse(o.periodEnd)-Date.parse(o.periodStart)!==DAILY_MS)continue;
    const key=`${o.periodStart}/${o.periodEnd}`;
    if(!periods.has(key))periods.set(key,doc);
    else if(!periods.get(key)||JSON.stringify(periods.get(key).observation)!==JSON.stringify(o))periods.set(key,null);
  }
  return [...periods.values()].filter(Boolean).sort((a,b)=>Date.parse(a.observation.periodEnd)-Date.parse(b.observation.periodEnd));
}
function quantile(values,q) { const s=[...values].sort((a,b)=>a-b);return s[Math.ceil(q*s.length)-1]; }
function assessTaiwan(documents,now=Date.now()) {
  const series=dailySeries(documents).filter(d=>Date.parse(d.observation.periodEnd)<=now);
  const latest=series.at(-1);
  const result={mode:'OBSERVATION_ONLY',ruleVersion:'historical-p95-v1',pushEnabled:false,assessedAt:new Date(now).toISOString(),latestPeriodEnd:latest?.observation.periodEnd||null,indicators:[],status:'INSUFFICIENT_HISTORY',explanation:'僅統計活動異常待查；未校準戰爭預測，候選提醒不自動推播。'};
  if(!latest)return result;
  if(now-Date.parse(latest.observation.periodEnd)>48*60*60_000)return {...result,status:'STALE_OBSERVATION'};
  for(const key of ['aircraft','ships','officialVessels','crossingOrAirspace']) {
    const metric=latest.observation[key];
    if(!Number.isFinite(metric?.value)||!metric.unit)continue;
    const cutoff=Date.parse(latest.observation.periodEnd)-60*DAILY_MS;
    const history=series.filter(d=>d!==latest&&Date.parse(d.observation.periodEnd)>=cutoff&&d.observation[key]?.unit===metric.unit&&Number.isFinite(d.observation[key]?.value));
    if(history.length<30) {result.indicators.push({metric:key,current:metric.value,unit:metric.unit,samples:history.length,status:'INSUFFICIENT_HISTORY'});continue;}
    const p95=quantile(history.map(d=>d.observation[key].value),.95);
    result.indicators.push({metric:key,current:metric.value,unit:metric.unit,samples:history.length,baselineWindowDays:60,historicalP95:p95,status:metric.value>p95?'ABOVE_HISTORICAL_P95':'WITHIN_HISTORICAL_RANGE',sourceUrl:latest.url,periodEnd:latest.observation.periodEnd});
  }
  if(result.indicators.some(i=>i.historicalP95!==undefined))result.status=result.indicators.some(i=>i.status==='ABOVE_HISTORICAL_P95')?'ANOMALY_REVIEW':'OBSERVATION_AVAILABLE';
  return result;
}
function backtestTaiwan(documents) {
  const series=dailySeries(documents);let evaluated=0,triggered=0;
  for(let i=30;i<series.length;i++) {
    const run=assessTaiwan(series.slice(0,i+1),Date.parse(series[i].observation.periodEnd)+1000);
    if(run.status==='INSUFFICIENT_HISTORY')continue;
    evaluated++;if(run.status==='ANOMALY_REVIEW')triggered++;
  }
  return {ruleVersion:'historical-p95-v1',evaluatedDays:evaluated,candidateDays:triggered,falsePositiveRate:null,missRate:null,leadTime:null,groundTruth:'NOT_LABELED',note:'僅計算歷史規則觸發，尚無事件標籤，不宣稱預測準確率。'};
}
function getTaiwanFeed(now=Date.now(),store=getStore()) {
  const docs=store.documents('TAIWAN_MND');
  const latest=docs[0];
  const fresh=latest&&Date.parse(latest.observation.periodEnd)<=now&&now-Date.parse(latest.observation.periodEnd)<=48*60*60_000;
  return {sourceHealth:store.getHealth('Taiwan_MND'),status:latest?(fresh?'AVAILABLE':'STALE'):'UNAVAILABLE',latest:latest?{...latest,body:undefined}:null,
    history:docs.slice(0,90).map(d=>({id:d.id,url:d.url,publishedAt:d.publishedAt,publicationPrecision:d.publicationPrecision,observation:d.observation})),
    assessment:assessTaiwan(docs,now),backtest:backtestTaiwan(docs)};
}
const labels={aircraft:'共機',ships:'共艦',officialVessels:'公務船',crossingOrAirspace:'中線／指定空域通報'};
function taiwanDiscordPayload(mode='status') {
  const feed=getTaiwanFeed();const doc=feed.latest;
  const lines=['# 台海官方公開動態',`資料狀態：${feed.status}`];
  if(doc) {
    lines.push(`統計期間：${doc.observation.periodStart} 至 ${doc.observation.periodEnd}`);
    for(const [key,label]of Object.entries(labels)){const m=doc.observation[key];lines.push(`${label}：${m?.value??'未提供'}${m?.unit||''}`);}
    lines.push(`官方來源：${doc.url}`,'官方通報為所列期間的觀測，不代表目前全部部署。');
  } else lines.push('尚未取得可解析的官方通報，不以新聞標題代替數據。');
  if(mode==='trend'||mode==='alert') {
    lines.push(`異常觀察：${feed.assessment.status}（未啟用自動預判推播）`);
    for(const i of feed.assessment.indicators)lines.push(`${labels[i.metric]}：同單位歷史 ${i.samples} 筆；${i.historicalP95===undefined?'不足基準':`歷史第95百分位 ${i.historicalP95}；${i.status}`}`);
    lines.push(`回測：${feed.backtest.evaluatedDays} 日可評估，${feed.backtest.candidateDays} 日觸發候選；未具備誤報／漏報標籤。`);
  }
  const image=mode==='status'&&feed.status==='AVAILABLE'&&doc?.imageUrl;
  return {sourceBacked:true,content:lines.join('\n').slice(0,2000),files:[],allowedMentions:{parse:[]},embeds:image?[{title:'國防部活動示意圖（非衛星照片）',url:doc.url,image:{url:image},footer:{text:`統計截至 ${doc.observation.periodEnd}`}}]:[]};
}
function eventsDiscordPayload(corrections=false) {
  const changes=getStore().changes(100).filter(c=>!corrections||c.kind==='CORRECTION').slice(0,5);
  return {sourceBacked:true,content:['# 公開來源事件與更正紀錄',...changes.map(c=>`${c.kind==='CORRECTION'?'更正':'新增資料'}｜${c.title}\n${c.recordedAt}｜${c.evidenceStatus}\n${c.url}${c.currentVersion?'':'\n此為歷史版本'}`),...(changes.length?[]:['尚無符合條件的紀錄。']),'不同來源主張尚未自動合併為已證實事件。'].join('\n').slice(0,2000),files:[],embeds:[],allowedMentions:{parse:[]}};
}
module.exports={dailySeries,assessTaiwan,backtestTaiwan,getTaiwanFeed,taiwanDiscordPayload,eventsDiscordPayload};
