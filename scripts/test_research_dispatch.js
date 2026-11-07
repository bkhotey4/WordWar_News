const {test}=require('node:test');
const assert=require('node:assert/strict');
const {IntelStore}=require('../src/intel_store');
const {ResearchReceipts,revision,updateNotice}=require('../src/research_dispatch');
const {projectReportEvidence,formatReportEvidencePayload}=require('../src/evidence_ledger');
const {retainedReferenceIds}=require('../src/research_reports');
const {runBacktest}=require('../src/alert_backtester');
const {assessCloudGrade}=require('../src/satellite_quality');
const {evaluateMilitaryNotams}=require('../src/notam_monitor');
test('research receipts reserve one version, recover failure, and ignore generation-only edits',()=>{
 const store=new IntelStore(':memory:'),r=new ResearchReceipts(store.db);
 const report={id:'a',title:'report',sections:[],basis:[]};
 const ticket=r.claim(report,'user',1000);assert.ok(ticket);
 assert.equal(r.claim(report,'user',1001),null);
 r.finish(ticket,'message');assert.equal(r.claim(report,'user',200000),null);
 assert.equal(revision(report),revision({...report,generatedAt:'new'}));
 const next={...report,title:'corrected'};const failed=r.claim(next,'user',300000);
 r.finish(failed,null,'offline');assert.equal(r.claim(next,'user',300001),null);
 assert.ok(r.claim(next,'user',361000));store.close();
});

test('report evidence links every reviewed paragraph to the exact source hash without inventing excerpts',()=>{
 const report={id:'r1',title:'已覆核報導',theater:'global',asOf:new Date().toISOString(),generatedAt:new Date().toISOString(),
  basis:[{id:'d1',contentHash:'hash1'},{id:'d2',contentHash:'hash2'}],sections:[{kind:'REPORTED',label:'新事實',text:'來源報導一項變化。',evidence:['d1']},{kind:'UNCERTAIN',label:'限制',text:'第二項來源尚不能核對。',evidence:['d2']}]};
 const event=projectReportEvidence(report,[{id:'d1',contentHash:'hash1',publisher:'原始媒體',url:'https://example.org/a',publishedAt:report.asOf,originGroup:'WIRE',sourceType:'NEWS'},{id:'d2',contentHash:'changed'}]);
 assert.equal(event.eventTime,null);
 assert.equal(event.sources[0].available,true);
 assert.equal(event.sources[1].available,false);
 const payload=formatReportEvidencePayload(event);
 assert.match(payload.content,/事件發生時間.*未結構化/);
 assert.match(payload.content,/來源紀錄缺失/);
 assert.match(payload.content,/不是來源原文摘錄/);
 const saved={...report,sourceSnapshot:[{id:'d1',contentHash:'hash1',publisher:'原始媒體',url:'https://example.org/a',publishedAt:report.asOf,originGroup:'WIRE',sourceType:'NEWS'}]};
 const archived=projectReportEvidence(saved,[]);
 assert.equal(archived.sources[0].archived,true);
 assert.match(formatReportEvidencePayload(archived).content,/現時原文未重新核對/);
});

test('delivery migration keeps prior receipt, then links a reviewed update to the earlier message',()=>{
 const store=new IntelStore(':memory:');
 store.db.exec(`CREATE TABLE research_delivery(report_id TEXT,revision TEXT,recipient TEXT,status TEXT,attempted_at INTEGER,lease TEXT,message_id TEXT,error TEXT,PRIMARY KEY(report_id,revision,recipient))`);
 const receipts=new ResearchReceipts(store.db);
 const old={id:'old',title:'舊稿',sections:[{label:'事實',text:'舊數字'}],basis:[]};
 const ticket=receipts.claim(old,'u',1000);
 receipts.finish(ticket,'m1',null,{channelId:'c1',report:old});
 const next={id:'new',title:'新稿',sections:[{label:'事實',text:'新數字'}],basis:[],supersedes:['old'],updateType:'CORRECTION',changeSummary:'官方修正數字；已重新核對來源。'};
 const prior=receipts.previous(next,'u');
 assert.equal(prior.message_id,'m1');
 assert.match(updateNotice(next,prior),/官方修正數字/);
 assert.match(updateNotice(next,prior),/discord\.com\/channels\/@me\/c1\/m1/);
 assert.notEqual(revision(next),revision({...next,changeSummary:'另有更正'}));
 store.close();
});
test('background references remain retained only while a current report needs them',()=>{
 const now=Date.now(),report={reviewed:true,asOf:new Date(now-1000).toISOString(),basis:[{id:'old-background'}]};
 assert.ok(retainedReferenceIds([report],now).has('old-background'));
 assert.equal(retainedReferenceIds([{...report,supersededBy:'new'}],now).size,0);
 assert.equal(retainedReferenceIds([report],now+49*3600000).size,0);
});
test('unlabeled alerts are unknown, not false positives, and broad time overlap is not a match',()=>{
 const now=Date.now(),stamp=new Date(now-1000).toISOString();
 const alerts=[{code:'X',delivered:1,timestamp:stamp},{code:'X',delivered:0,quarantined:true,timestamp:stamp}];
 const events=[{eventId:'other',eventTime:stamp,reviewed:true,outcome:'CONFIRMED'}];
 const result=runBacktest({alerts,events,now});
 assert.equal(result.totalAlerts,1);assert.equal(result.categoryResults.X.falsePositives,0);
 assert.equal(result.categoryResults.X.precision,null);assert.equal(result.categoryResults.X.recall,null);
});
test('scene cloud metadata cannot declare a small cropped target readable',()=>{
 assert.equal(assessCloudGrade(5).readable,null);assert.equal(assessCloudGrade(95).readable,null);
 assert.equal(assessCloudGrade(-2).grade,'UNKNOWN');
});
test('NOTAM cancellation and replacement withdraw previous notices before issuing warnings',()=>{
 const now=Date.now(),n={id:'A',validFrom:new Date(now-1000).toISOString(),validTo:new Date(now+3600000).toISOString(),type:'LIVE FIRING'};
 const results=evaluateMilitaryNotams([n,{id:'C',notamType:'NOTAMC',cancelsId:'A'}],now);
 assert.ok(results.every(n=>n.status==='WITHDRAWN'));
 const replaced=evaluateMilitaryNotams([n,{...n,id:'B',notamType:'NOTAMR',replacesId:'A'}],now);
 assert.equal(replaced.find(n=>n.id==='A').status,'WITHDRAWN');
 assert.equal(replaced.find(n=>n.id==='B').status,'ACTIVE_NOW');
});
