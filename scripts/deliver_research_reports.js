require('dotenv').config({path:require('path').join(__dirname,'../.env')});
const fs=require('fs');
const path=require('path');
const {REST,Routes}=require('discord.js');
const {getResearchFeed}=require('../src/research_reports');
const {deliverResearchReports}=require('../src/research_dispatch');
async function main() {
  const requested=process.argv.slice(2).filter(a=>!a.startsWith('--'));
  const ids=new Set(getResearchFeed().reports.map(r=>r.id));
  if(requested.some(id=>!ids.has(id)))throw Error('Requested report is unavailable or failed validation');
  const target=process.env.COMMANDER_USER_ID;
  if(!/^\d{17,20}$/.test(target || ''))throw Error('COMMANDER_USER_ID must be configured');
  const subscribers=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/subscribers.json'),'utf8')).subscribers;
  if(!subscribers.some(s=>s.userId===target))throw Error('Configured recipient is not subscribed');
  const rest=new REST({version:'10',timeout:60000,retries:1}).setToken(process.env.DISCORD_BOT_TOKEN);
  // One-shot delivery uses HTTPS; a persistent gateway session is unnecessary.
  const client={users:{fetch:async userId=>({send:async payload=>{
    const channel=await rest.post(Routes.userChannels(),{body:{recipient_id:userId}});
    const files=(payload.files||[]).map(f=>({name:f.name,data:Buffer.isBuffer(f.attachment)?f.attachment:fs.readFileSync(f.attachment)}));
    return rest.post(Routes.channelMessages(channel.id),{body:{content:payload.content,embeds:payload.embeds,allowed_mentions:payload.allowedMentions,
      ...(files.length?{attachments:files.map((f,i)=>({id:i,filename:f.name}))}:{})},files});
  }})}};
    const results=await deliverResearchReports(client,{recipientIds:[target],reportIds:requested.length?requested:undefined,explicit:process.argv.includes('--explicit')});
    console.log(JSON.stringify({results}));if(results.some(r=>r.status==='FAILED'))process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
