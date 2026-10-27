const fs=require('fs');
const path=require('path');
function read(file,key){try{return JSON.parse(fs.readFileSync(file,'utf8'))[key]||[];}catch{return [];}}
function detectTheaterFromText(text='') {
 if(/烏克蘭|ukraine|russia|俄羅斯|kyiv|基輔/i.test(text))return 'ukraine_front';
 if(/台海|taiwan|共機|共艦|adiz|中線/i.test(text))return 'taiwan_strait';
 if(/中東|iran|伊朗|red sea|紅海|israel|以色列/i.test(text))return 'middle_east';
 return 'global';
}
function alertMatchesEvent(alert,event) {
 const a=Date.parse(alert.observedAt||alert.timestamp||''),b=Date.parse(event.eventTime||'');
 return alert.evaluationReviewed===true && alert.evaluationLabel==='TRUE_POSITIVE' && alert.matchedEventId===event.eventId &&
   event.reviewed===true && event.outcome==='CONFIRMED' && Number.isFinite(a)&&Number.isFinite(b);
}
function runBacktest(options={}) {
 const now=options.now||Date.now(),windowDays=options.windowDays||30,cutoff=now-windowDays*86400000;
 const alerts=(options.alerts||read(path.join(__dirname,'alert_history.json'),'history')).filter(a=>{
  const t=Date.parse(a.timestamp||'');return t>=cutoff&&t<=now&&!a.quarantined&&a.delivered>0;
 });
 const events=(options.events||read(path.join(__dirname,'../research/evidence_ledger.json'),'events')).filter(e=>
  e.reviewed===true&&e.outcome==='CONFIRMED'&&Date.parse(e.eventTime)>=cutoff&&Date.parse(e.eventTime)<=now);
 const categoryResults={};
 for(const code of [...new Set(alerts.map(a=>a.code||'UNKNOWN'))]) {
  const group=alerts.filter(a=>(a.code||'UNKNOWN')===code);
  const tp=group.filter(a=>events.some(e=>alertMatchesEvent(a,e))).length;
  const fp=group.filter(a=>a.evaluationReviewed===true&&a.evaluationLabel==='FALSE_POSITIVE').length;
  const covered=new Set(group.filter(a=>events.some(e=>alertMatchesEvent(a,e))).map(a=>a.matchedEventId));
  categoryResults[code]={code,totalAlerts:group.length,truePositives:tp,falsePositives:fp,
   unlabeledAlerts:group.length-tp-fp,precision:tp+fp?Math.round(tp/(tp+fp)*100)+'%':null,
   recall:options.datasetComplete===true&&events.length?Math.round(covered.size/events.length*100)+'%':null,
   recommendation:'REVIEW_REQUIRED',rationale:'僅計算已人工標記的警報；未標記不算誤報。事件資料不完整時不計漏報率，也不自動建議啟用。'};
 }
 return {generatedAt:new Date(now).toISOString(),windowDays,totalAlerts:alerts.length,totalGroundTruthEvents:events.length,
  categoryResults,uncaughtEvents:options.datasetComplete===true?events.filter(e=>!alerts.some(a=>alertMatchesEvent(a,e))):[],
  summary:Object.values(categoryResults),researcherNote:'僅人工審查標記可用於回測；不能由戰區與時間近似匹配建立真實事件。'};
}
function formatBacktestPayload(windowDays=30) {
 const report=runBacktest({windowDays});
 const lines=['# 預警回測',`已發送警報：${report.totalAlerts}；人工確認事件：${report.totalGroundTruthEvents}`];
 for(const r of Object.values(report.categoryResults))lines.push(`${r.code}：已標記精確率 ${r.precision||'無法計算'}；未標記 ${r.unlabeledAlerts}；召回率 ${r.recall||'無法計算'}`);
 lines.push(report.researcherNote);
 return {sourceBacked:true,content:lines.join('\n').slice(0,2000),files:[],embeds:[]};
}
module.exports={runBacktest,formatBacktestPayload,alertMatchesEvent,detectTheaterFromText};
