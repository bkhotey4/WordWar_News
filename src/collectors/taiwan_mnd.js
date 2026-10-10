const cheerio = require('cheerio');
const { getStore, digest } = require('../intel_store');
const ENTRY = 'https://www.mnd.gov.tw/news/plaactlist';
// 國防部網站憑證鏈常讓 Node 驗證失敗（fetch failed），失敗時在 Windows 改用 PowerShell 抓取
async function officialPage(url, opts = {}) {
  try { return await require('../win_fetch').fetchText(url, { hosts: ['www.mnd.gov.tw'], ...opts }); }
  catch (e) { throw new Error(`MND ${e.message}`); }
}
function rocDate(value) {
  const m=String(value||'').match(/^(\d{2,3})[./](\d{1,2})[./](\d{1,2})$/);
  if(!m) return null;
  const y=Number(m[1])+1911, month=Number(m[2]), day=Number(m[3]);
  const date=new Date(Date.UTC(y,month-1,day));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===month-1&&date.getUTCDate()===day ? `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` : null;
}
function parsePeriod(body) {
  const matches=[...body.matchAll(/(?:(\d{2,3})年)(\d{1,2})月(\d{1,2})日(?:（[^）]*）|\([^)]*\))?\s*(\d{4})時/g)];
  if(matches.length!==2) return null;
  const values=matches.map(m=>{
    const day=rocDate(`${m[1]}.${m[2]}.${m[3]}`),hh=Number(m[4].slice(0,2)),mm=Number(m[4].slice(2));
    if(!day||hh>23||mm>59)return null;
    return new Date(`${day}T${m[4].slice(0,2)}:${m[4].slice(2)}:00+08:00`).toISOString();
  });
  if(values.some(v=>!v)||Date.parse(values[1])<=Date.parse(values[0])) return null;
  return {periodStart:values[0],periodEnd:values[1]};
}
function metric(body, expression) {
  const matches=[...body.matchAll(expression)];
  if(matches.length!==1)return {value:null,unit:null};
  return {value:Number(matches[0][1]),unit:matches[0][2]};
}
function parseMndArticle(html,url,now=Date.now()) {
  const $=cheerio.load(html);
  const body=$('.maincontent').text().replace(/\s+/g,' ').trim();
  const date=rocDate($('.pageinfo .body-2').first().text().trim());
  const period=parsePeriod(body);
  if(!body.includes('臺海周邊')||!date||!period||Date.parse(period.periodEnd)>now) throw new Error('Official report date, period or body unavailable');
  const aircraft=metric(body,/共機\s*(\d+)\s*(架次|架)/g);
  const ships=metric(body,/共艦\s*(\d+)\s*(艘次|艘)/g);
  const officialVessels=metric(body,/公務船\s*(\d+)\s*(艘次|艘)/g);
  const crossing=metric(body,/逾越[^）)。,；]{0,90}?(\d+)\s*(架次|架)/g);
  const image=$('.maincontent img').first().attr('src');
  const imageUrl=image ? new URL(image,'https://www.mnd.gov.tw/').href : null;
  const reviewRequired=aircraft.value===null||ships.value===null||(crossing.value!==null&&aircraft.value!==null&&crossing.value>aircraft.value);
  return {id:`mnd-${digest(url).slice(0,16)}`,url,title:'中共解放軍臺海周邊海、空域動態',body,publishedAt:`${date}T00:00:00+08:00`,publicationPrecision:'DAY',fetchedAt:new Date(now).toISOString(),publisher:'中華民國國防部',originGroup:'TAIWAN_MND',sourceType:'OFFICIAL_NOTICE',
    imageUrl:imageUrl?.startsWith('https://www.mnd.gov.tw/')?imageUrl:null,
    imageKind:'OFFICIAL_ACTIVITY_DIAGRAM',observation:{...period,aircraft,ships,officialVessels,crossingOrAirspace:crossing,reviewRequired, note:'逾越中線及指定空域的合併通報，不拆成個別中線數量；官方架次不是獨立航空器數。'}};
}
function articleLinks(html) {
  const $=cheerio.load(html);const base=new URL($('base').attr('href')||'/','https://www.mnd.gov.tw/');
  return [...new Set($('a.news_list').toArray().filter(a=>$(a).text().includes('臺海周邊')).map(a=>new URL($(a).attr('href'),base).href))].filter(url=>/^https:\/\/www\.mnd\.gov\.tw\/news\/plaact\/\d+$/.test(url));
}
let inFlight;
function refreshMnd(options={}) { if(!inFlight)inFlight=collect(options).finally(()=>{inFlight=null;});return inFlight; }
async function collect({force=false,backfill=false,store=getStore()}={}) {
  const previous=store.getHealth('Taiwan_MND');
  if(!force&&previous&&Date.now()-Date.parse(previous.lastAttempt)>=0&&Date.now()-Date.parse(previous.lastAttempt)<30*60_000)return previous;
  const attempt=new Date().toISOString();let readCount=0,changed=0,errors=[];
  try {
    for(let page=1;page<=(backfill?5:1);page++) {
      const links=articleLinks(await officialPage(page===1?ENTRY:`${ENTRY}/${page}`));
      if(!links.length)throw new Error('Official list layout changed');
      const selected=backfill?links:links.slice(0,3);
      for(const url of selected) {
        try { const doc=parseMndArticle(await officialPage(url),url);const result=store.putDocument(doc);readCount++;if(result.changed)changed++; }
        catch(e){errors.push({url,error:e.message});}
      }
    }
    if(!readCount)throw new Error('No readable original official reports');
    const result={status:errors.length?'DEGRADED':'ONLINE',entryUrl:ENTRY,lastAttempt:attempt,lastSuccess:new Date().toISOString(),readCount,changed,errors};store.health('Taiwan_MND',result);return result;
  }catch(e){const result={...previous,status:'DEGRADED',entryUrl:ENTRY,lastAttempt:attempt,error:e.message,errors};store.health('Taiwan_MND',result);return result;}
}
module.exports={refreshMnd,parseMndArticle,parsePeriod,rocDate,articleLinks,officialPage};
