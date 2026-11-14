'use strict';
// A chronology of attributed reporting, never a reconstructed vessel track.
const {createCanvas}=require('@napi-rs/canvas');
const kinds={REPORTED_OBSERVATION:'來源所述觀測',DISPUTED_SIGNAL:'有爭議的訊號',OFFICIAL_ASSESSMENT:'官方研判'};
function validateTimeline(report,now=Date.now()) {
  if(report.timeline===undefined)return true;
  const t=report.timeline,ids=new Set((report.basis||[]).map(r=>r.id));
  const str=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
  if(!t||!str(t.title,36)||!str(t.note,90)||!Array.isArray(t.events)||!t.events.length||t.events.length>5)return false;
  let previous='';
  return t.events.every(e=>{
    if(!e||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(Date.parse(e.date))||new Date(e.date).toISOString().slice(0,10)!==e.date||e.date>new Date(now).toISOString().slice(0,10)||e.date<previous)return false;
    previous=e.date;
    return Object.hasOwn(kinds,e.kind)&&str(e.timeLabel,24)&&str(e.place,36)&&str(e.text,120)&&Array.isArray(e.evidence)&&e.evidence.length>0&&e.evidence.length<=10&&e.evidence.every(id=>ids.has(id));
  });
}
function renderTimeline(report){
  if(!report.timeline||!validateTimeline(report))throw Error('Invalid evidence chronology');
  const t=report.timeline,c=createCanvas(1200,210+t.events.length*190),ctx=c.getContext('2d');
  ctx.fillStyle='#0b1726';ctx.fillRect(0,0,c.width,c.height);
  function wrap(value,x,y,width,font,color){ctx.font=font;ctx.fillStyle=color;let line='';for(const char of value){if(ctx.measureText(line+char).width>width){ctx.fillText(line,x,y);line='';y+=30;}line+=char;}ctx.fillText(line,x,y);return y;}
  wrap(t.title,40,52,1120,'bold 30px "Microsoft JhengHei", sans-serif','#ffffff');
  wrap('公開報導時間軸｜事件順序示意，不是航跡、衛星定位或即時位置',40,92,1120,'22px "Microsoft JhengHei", sans-serif','#a8c7df');
  t.events.forEach((e,i)=>{const y=125+i*190;ctx.fillStyle='#172b40';ctx.fillRect(30,y,1140,172);
    const refs=e.evidence.map(id=>(report.basis||[]).findIndex(r=>r.id===id)+1).join(', ');
    wrap(`${e.date} ${e.timeLabel}  •  ${kinds[e.kind]} [${refs}]`,50,y+33,1090,'22px "Microsoft JhengHei", sans-serif',e.kind==='DISPUTED_SIGNAL'?'#ffcd7d':'#86ccec');
    wrap(e.place,50,y+68,1090,'bold 25px "Microsoft JhengHei", sans-serif','#ffffff');
    wrap(e.text,50,y+104,1090,'22px "Microsoft JhengHei", sans-serif','#d9e4ed');
  });
  wrap(t.note,40,c.height-48,1120,'20px "Microsoft JhengHei", sans-serif','#b6c6d6');
  return c.toBuffer('image/png');
}
module.exports={validateTimeline,renderTimeline};
