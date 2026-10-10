const crypto=require('crypto');
const {getStore}=require('./intel_store');
const {getResearchFeed,researchDiscordPayload}=require('./research_reports');
const {shouldDeliverToUser}=require('./subscription_manager');
function revision(report) {
  return crypto.createHash('sha256').update(JSON.stringify({title:report.title,sections:report.sections,basis:report.basis,theater:report.theater,coverage:report.coverage,scenarios:report.scenarios,imagery:report.imagery,supersedes:report.supersedes,updateType:report.updateType,changeSummary:report.changeSummary,...(report.map?{map:report.map}:{}),...(report.timeline?{timeline:report.timeline}:{})})).digest('hex');
}
class ResearchReceipts {
  constructor(db=getStore().db) {
    this.db=db;
    db.exec(`CREATE TABLE IF NOT EXISTS research_delivery(
      report_id TEXT,revision TEXT,recipient TEXT,status TEXT,attempted_at INTEGER,lease TEXT,message_id TEXT,error TEXT,
      PRIMARY KEY(report_id,revision,recipient));`);
    const columns=new Set(db.prepare('PRAGMA table_info(research_delivery)').all().map(row=>row.name));
    if(!columns.has('channel_id'))db.exec('ALTER TABLE research_delivery ADD COLUMN channel_id TEXT');
    if(!columns.has('report_json'))db.exec('ALTER TABLE research_delivery ADD COLUMN report_json TEXT');
  }
  previous(report,userId) {
    const ids=[...(Array.isArray(report.supersedes)?report.supersedes:[]),report.id].filter(Boolean);
    if(!ids.length)return null;
    const placeholders=ids.map(()=>'?').join(',');
    return this.db.prepare(`SELECT report_id,message_id,channel_id,report_json FROM research_delivery
      WHERE recipient=? AND status='SENT' AND report_id IN (${placeholders}) AND revision<>?
      ORDER BY attempted_at DESC LIMIT 1`).get(userId,...ids,revision(report))||null;
  }
  claim(report,userId,now=Date.now()) {
    const hash=revision(report),lease=crypto.randomUUID();
    return this.db.transaction(()=>{
      const row=this.db.prepare('SELECT * FROM research_delivery WHERE report_id=? AND revision=? AND recipient=?').get(report.id,hash,userId);
      if(row?.status==='SENT'||(row?.status==='SENDING'&&now-row.attempted_at<120000)||
        (row?.status==='FAILED'&&now-row.attempted_at<60000))return null;
      this.db.prepare(`INSERT INTO research_delivery(report_id,revision,recipient,status,attempted_at,lease,message_id,error)
        VALUES(?,?,?,'SENDING',?,?,NULL,NULL)
        ON CONFLICT(report_id,revision,recipient) DO UPDATE SET status='SENDING',attempted_at=excluded.attempted_at,lease=excluded.lease,error=NULL`).run(report.id,hash,userId,now,lease);
      return {id:report.id,hash,userId,lease};
    })();
  }
  finish(ticket,messageId,error=null,{channelId=null,report=null}={}) {
    const snapshot=report?JSON.stringify({title:report.title,sections:report.sections,basis:report.basis,changeSummary:report.changeSummary}):null;
    this.db.prepare('UPDATE research_delivery SET status=?,message_id=?,error=?,channel_id=?,report_json=? WHERE report_id=? AND revision=? AND recipient=? AND lease=?')
      .run(error?'FAILED':'SENT',messageId || null,error?String(error).slice(0,300):null,channelId,snapshot,ticket.id,ticket.hash,ticket.userId,ticket.lease);
  }
}
function updateNotice(report,prior) {
  if(!prior)return '';
  let old=null;try{old=prior.report_json?JSON.parse(prior.report_json):null;}catch{}
  const changed=old?(report.sections||[]).filter((section,i)=>section.text!==old.sections?.[i]?.text || section.label!==old.sections?.[i]?.label).map(section=>section.label).slice(0,3):[];
  const lead=report.updateType==='CORRECTION'?'📝 **更正**':report.supersedes?.includes(prior.report_id)?'📰 **更新／取代前稿**':'📰 **報導更新**';
  const summary=report.changeSummary?.trim() || (changed.length?`本版更新段落：${changed.join('、')}。請以本版來源與內容為準。`:'請以本版來源與內容為準；舊版差異尚無逐項編輯摘要。');
  const link=prior.channel_id&&prior.message_id?`[查看先前推播](https://discord.com/channels/@me/${prior.channel_id}/${prior.message_id})`:
    prior.message_id?`先前推播訊息 ID：${prior.message_id}`:'先前推播紀錄可查';
  return `${lead}\n${summary}\n${link}\n證據頁：\`/evidence event_id:report:${report.id}\``;
}
async function deliverResearchReports(client,{recipientIds,reportIds,explicit=false,receipts=new ResearchReceipts()}={}) {
  if(!Array.isArray(recipientIds))throw Error('Explicit authorized recipients required');
  const reports=getResearchFeed().reports.filter(r=>!reportIds||reportIds.includes(r.id));
  const results=[];
  for(const report of reports)for(const userId of [...new Set(recipientIds)]) {
    const decision=shouldDeliverToUser(userId,{theater:report.theater || 'global',level:'REPORT',eventId:'report:'+report.id,isUpdate:true,isCorrection:report.updateType==='CORRECTION'});
    if(!explicit&&!decision.deliver){results.push({id:report.id,status:'DEFERRED',reason:decision.reason});continue;}
    // 以兩張圖卡為主（字比 Discord 內文大）；畫圖失敗時 researchCardPayload 會回傳原本文字版
    const payload=await require('./report_card').researchCardPayload(report.id);
    if(!payload.embeds?.length)continue;
    const prior=receipts.previous(report,userId);
    const ticket=receipts.claim(report,userId);if(!ticket)continue;
    try {
      const notice=updateNotice(report,prior);
      if(notice)payload.content=`${notice}\n\n${payload.content||''}`.slice(0,2000);
      else payload.content=`${payload.content||''}\n證據頁：\`/evidence event_id:report:${report.id}\``.slice(0,2000);
      const user=await client.users.fetch(userId);
      const message=await user.send(payload);
      receipts.finish(ticket,message.id,null,{channelId:message.channelId||message.channel_id||null,report});
      results.push({id:report.id,status:'SENT',messageId:message.id});
    }catch(error){receipts.finish(ticket,null,error.message);results.push({id:report.id,status:'FAILED',error:error.message});}
  }
  return results;
}
module.exports={ResearchReceipts,revision,deliverResearchReports,updateNotice};
