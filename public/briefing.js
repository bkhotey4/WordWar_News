'use strict';
const LENSES={general:'綜合分析',military:'軍事',diplomacy:'外交',intelligence:'情報',politics:'政治'};
const LENS_ALIASES={MILITARY:'military',DIPLOMACY:'diplomacy',INTELLIGENCE:'intelligence',POLITICS:'politics'};
const $=id=>document.getElementById(id);
const make=(tag,text,parent)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(parent)parent.append(node);return node;};
const time=value=>{const n=Date.parse(value);return Number.isFinite(n)?new Date(n).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'時間未提供';};
const short=(text,max)=>typeof text==='string'&&text.length>max?`${text.slice(0,max).trimEnd()}…`:text||'';
let allReports=[],names=new Map(),satelliteAssets=[],selectedId=null,visibleReports=[],slideIndex=0,previousVisit=null;
const SEEN_KEY='wordwar-briefing-seen-v1';
function readPreviousVisit(){try{const value=JSON.parse(localStorage.getItem(SEEN_KEY));return value&&typeof value.reports==='object'&&!Array.isArray(value.reports)?value:null;}catch{return null;}}
function saveVisit(){try{localStorage.setItem(SEEN_KEY,JSON.stringify({at:new Date().toISOString(),reports:Object.fromEntries(allReports.map(r=>[r.id,r.generatedAt||r.asOf]))}));}catch{/* Storage may be unavailable. */}}
function visitKind(report){if(!previousVisit)return '首次開啟';const old=previousVisit.reports[report.id];return !old?'上次後新增':old!==(report.generatedAt||report.asOf)?'上次後更新':'先前已收錄';}
function sections(report,kind){return Array.isArray(report.sections)?report.sections.filter(s=>s.kind===kind):[];}
function lens(section){return LENS_ALIASES[section.lens]||'general';}
function validUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'?u.href:null;}catch{return null;}}
function addLink(parent,label,url){const safe=validUrl(url);if(!safe)return;const a=make('a',label,parent);a.href=safe;a.target='_blank';a.rel='noopener noreferrer';}
function reportLens(report){return [...new Set(sections(report,'ANALYSIS').map(lens))];}
function showInspector(report){const root=$('inspector-content');root.replaceChildren();if(!report)return;
  make('p',report.title,root);
  make('h3','時間與範圍',root);make('p',`資料截至 ${time(report.asOf)}（臺灣時間）\n${names.get(report.theater)||report.theater||'跨區域'}`,root);
  const uncertain=sections(report,'UNCERTAIN');if(uncertain.length){make('h3','尚待確認與證據限制',root);for(const s of uncertain)make('p',s.text,root);}
  const scenarios=Array.isArray(report.scenarios)?report.scenarios:[];
  if(scenarios.length){make('h3','有條件情境',root);for(const s of scenarios){const box=make('div',undefined,root);box.className='scenario-box';make('h4',`${s.name}｜${s.horizon}`,box);make('p',`假設：${s.assumption}`,box);make('p',`可能影響：${s.implication}`,box);make('p',`成立條件：${(s.triggers||[]).join('；')}`,box);make('p',`反證：${(s.counterEvidence||[]).join('；')}`,box);}}
  make('h3','原始來源',root);for(const ref of report.references||[]){const box=make('div',undefined,root);box.className='source-item';addLink(box,`${ref.publisher||'來源'} ↗`,ref.url);make('span',`發表：${time(ref.publishedAt)}`,box);}
  if(!report.references?.length)make('p','此稿未列出可用的原始連結。',root);
}
function select(report){selectedId=report.id;for(const card of document.querySelectorAll('.analysis-card')){const on=card.dataset.id===report.id;card.classList.toggle('selected',on);card.setAttribute('aria-pressed',String(on));}showInspector(report);}
function card(report,parent){const item=make('article',undefined,parent);item.className='analysis-card';item.dataset.id=report.id;item.tabIndex=0;item.setAttribute('role','button');item.setAttribute('aria-label',`查看 ${report.title} 的來源與證據限制`);
  const top=make('div',undefined,item);top.className='analysis-card-top';make('span',names.get(report.theater)||report.theater||'跨區域',top);make('span',`資料截至 ${time(report.asOf)}`,top);
  make('h3',report.title,item);
  const fact=sections(report,'REPORTED')[0];if(fact){const p=make('p',short(fact.text,210),item);p.className='fact';}
  const finding=sections(report,'ANALYSIS')[0];if(finding){const p=make('p',undefined,item);p.className='finding';make('span',`${LENSES[lens(finding)]}｜${finding.label||'研判'}`,p);p.append(short(finding.text,260));}
  const foot=make('div',undefined,item);foot.className='analysis-card-foot';for(const l of reportLens(report)){const pill=make('span',LENSES[l],foot);pill.className='analysis-pill';}
  if(report.scenarios?.length){const pill=make('span',`${report.scenarios.length} 個條件情境`,foot);pill.className='analysis-pill scenario';}
  if(sections(report,'UNCERTAIN').length){const pill=make('span','附證據限制',foot);pill.className='analysis-pill muted';}
  item.addEventListener('click',()=>select(report));item.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(report);}});
}
function render(){const theater=$('theater-filter').value,l=$('lens-filter').value;const rows=allReports.filter(r=>(theater==='all'||r.theater===theater)&&(l==='all'||reportLens(r).includes(l)));
  visibleReports=rows;$('open-briefing').disabled=!rows.length;
  const root=$('analysis-cards');root.replaceChildren();for(const r of rows)card(r,root);if(!rows.length){const p=make('p','目前沒有已覆核且明確屬於此分類的分析；請選擇其他範圍。',root);p.className='analysis-empty';}
  $('visible-count').textContent=`顯示 ${rows.length} 篇`;
  const selected=rows.find(r=>r.id===selectedId)||rows[0];if(selected)select(selected);else{$('inspector-content').replaceChildren();make('p','目前沒有可顯示的來源。',$('inspector-content'));}
}
function loadCounts(){const counts=$('lens-counts');counts.replaceChildren();for(const [key,label] of Object.entries(LENSES)){const p=make('p',undefined,counts);make('span',label,p);make('strong',String(allReports.filter(r=>reportLens(r).includes(key)).length),p);}}
async function load(){try{
    const read=async url=>{const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error(`HTTP ${response.status}`);return response.json();};
    const snapshotUrl=document.querySelector('meta[name="briefing-data"]')?.content||'briefing-data.json';
    const snapshot=await read(snapshotUrl).catch(()=>null);
    const [reports,registry,satellite]=snapshot?[snapshot.reports,snapshot.registry,snapshot.satellite]:await Promise.all(['/api/reports','/data/global_theaters.json','/api/satellite-assets'].map(read));
    satelliteAssets=(satellite.assets||[]).filter(a=>a.verified&&a.productId&&a.sha256&&a.acquiredAt&&validUrl(a.sourceProductUrl)&&/^(?:\/images\/sentinel\/|assets\/briefing_)[a-zA-Z0-9_.-]+\.(?:webp|jpg|png)$/.test(a.imageUrl||''));
    names=new Map((registry.theaters||[]).map(t=>[t.id,t.name]));names.set('global','全球議題');allReports=(reports.reports||[]).filter(r=>r.reviewed===true&&!r.supersededBy&&sections(r,'ANALYSIS').length).sort((a,b)=>Date.parse(b.asOf)-Date.parse(a.asOf));
    previousVisit=readPreviousVisit();
    const select=$('theater-filter');for(const t of registry.theaters||[]){if(!allReports.some(r=>r.theater===t.id))continue;const option=make('option',t.name,select);option.value=t.id;}
    $('report-count').textContent=String(allReports.length);$('analysis-count').textContent=String(allReports.reduce((n,r)=>n+sections(r,'ANALYSIS').length,0));$('scenario-count').textContent=String(allReports.reduce((n,r)=>n+(r.scenarios?.length||0),0));$('latest-asof').textContent=allReports.length?time(allReports[0].asOf):'尚無';
    $('analysis-status').textContent=`資料產生：${time(snapshot?.generatedAt||new Date().toISOString())}（臺灣時間）`;loadCounts();render();if(visibleReports.length)setBriefing(true);saveVisit();
  }catch(error){$('analysis-status').textContent=`資料讀取失敗：${error.message}`;$('analysis-cards').replaceChildren();const p=make('p','無法顯示現有研究資料。',$('analysis-cards'));p.className='analysis-empty';}}
function briefingLine(parent,label,value){const line=make('div',undefined,parent);line.className='briefing-line';make('span',label,line);make('p',short(value,205),line);}
function citedImagery(report){return (report.imagery||[]).flatMap(ref=>{
  if(!['CONTEXT_ONLY','REVIEWED_OBSERVATION'].includes(ref.role))return [];
  const asset=satelliteAssets.find(a=>a.region===ref.region&&a.productId===ref.productId&&a.sha256===ref.sha256);
  return asset?[{asset,ref,report}]:[];
});}
function slideItems(){const items=[{type:'cover'}];for(const report of visibleReports){items.push({type:'report',report});for(const item of citedImagery(report))items.push({type:'satellite',...item});}return items;}
function keyFact(report){const points=(report.cardPoints||[]).filter(p=>p.kind==='REPORTED').slice(0,2);return points.length?points.map(p=>`${p.label}：${p.text}`).join(' '):sections(report,'REPORTED')[0]?.text||'詳見已覆核報導與原始來源。';}
function drawSlide(){const items=slideItems(),current=items[slideIndex];const root=$('briefing-stage');root.replaceChildren();const slide=make('article',undefined,root);slide.className='briefing-slide';
  if(slideIndex===0){slide.classList.add('briefing-cover');const intro=make('div',undefined,slide);make('p','公開來源研究簡報',intro).className='briefing-kicker';make('h2','本期重點',intro);make('strong',String(visibleReports.length).padStart(2,'0'),intro).className='briefing-big-number';make('p',`篇有效的已覆核報導\n最新資料 ${visibleReports.length?time(visibleReports[0].asOf):'尚無'}`,intro).className='briefing-lead';
    const change=previousVisit?visibleReports.filter(r=>visitKind(r)!=='先前已收錄').length:null;make('p',change===null?'首次開啟，沒有前次紀錄':`上次開啟後新增或更新 ${change} 篇`,intro).className='briefing-visit';
    const list=make('ol',undefined,slide);list.className='briefing-topics';for(const report of visibleReports.slice(0,5)){const li=make('li',undefined,list);const meta=make('div',undefined,li);meta.className='briefing-topic-meta';make('span',names.get(report.theater)||'跨區域',meta);make('em',visitKind(report),meta);make('strong',short(report.title,60),li);make('p',short(report.changeSummary||keyFact(report),110),li).className='briefing-topic-fact';}make('p','依資料時間排序；「新增／更新」只與此瀏覽器上次開啟的清單比較。點入各頁可查來源與限制。',slide).className='briefing-disclosure';}
  else if(current.type==='report'){const report=current.report;make('p',`${names.get(report.theater)||'跨區域'}　 / 　${time(report.asOf)}`,slide).className='briefing-kicker';make('h2',report.title,slide);
    if(report.changeSummary)make('p',`相對前稿：${short(report.changeSummary,180)}`,slide).className='briefing-change';
    const points=Array.isArray(report.cardPoints)&&report.cardPoints.length?report.cardPoints.slice(0,4):[...sections(report,'REPORTED').slice(0,2),...sections(report,'ANALYSIS').slice(0,1),...sections(report,'UNCERTAIN').slice(0,1)];
    for(const point of points)briefingLine(slide,point.label||({REPORTED:'已報導',ANALYSIS:'分析',UNCERTAIN:'限制'}[point.kind]||'重點'),point.text);
    const source=(report.references||[]).find(r=>validUrl(r.url));if(source){const p=make('p',undefined,slide);p.className='briefing-source';addLink(p,`${source.publisher||'原始來源'} ↗`,source.url);p.append(`　發表 ${time(source.publishedAt)}`);}if(report.references?.length>1)make('p',`另有 ${report.references.length-1} 個來源，完整清單見網頁右側來源欄。`,slide).className='briefing-small';}
  else if(current.type==='satellite'){const {asset,ref,report}=current;slide.classList.add('briefing-satellite');const visual=make('figure',undefined,slide);const img=make('img',undefined,visual);img.src=asset.imageUrl;img.alt=`${asset.region} 衛星影像，拍攝 ${time(asset.acquiredAt)}`;make('figcaption',asset.credit||'來源產品',visual);const panel=make('div',undefined,slide);make('p',ref.role==='CONTEXT_ONLY'?'SATELLITE IMAGE / BACKGROUND':'SATELLITE IMAGE / REVIEWED',panel).className='briefing-kicker';make('h2',ref.role==='CONTEXT_ONLY'?'報導引用的背景影像':'報導引用的覆核影像',panel);make('p',short(report.title,92),panel).className='satellite-report-title';const cloud=asset.cloudCoverPercent!==null&&asset.cloudCoverPercent!==undefined&&Number.isFinite(Number(asset.cloudCoverPercent))?`${Number(asset.cloudCoverPercent).toFixed(1)}%（整片產品，非裁切區）`:'未提供';make('p',`產品 ${asset.productId}\n拍攝 ${time(asset.acquiredAt)}\n雲量 ${cloud}`,panel).className='satellite-meta';make('p',ref.role==='CONTEXT_ONLY'?`${ref.caption}\n此圖僅作報導背景，不據此確認事件、戰損、控制區或部隊位置。`:`${ref.caption}\n覆核觀察：${ref.observation}`,panel).className='satellite-assessment';const p=make('p',undefined,panel);p.className='briefing-source';addLink(p,'查看衛星產品與來源 ↗',asset.sourceProductUrl);}
  $('slide-counter').textContent=`${slideIndex+1} / ${items.length}`;$('previous-slide').disabled=slideIndex===0;$('next-slide').disabled=slideIndex===items.length-1;
}
function setBriefing(open){$('briefing').hidden=!open;document.body.classList.toggle('briefing-open',open);if(open){slideIndex=0;drawSlide();$('close-briefing').focus();}else $('open-briefing').focus();}
$('open-briefing').addEventListener('click',()=>setBriefing(true));$('close-briefing').addEventListener('click',()=>setBriefing(false));
$('previous-slide').addEventListener('click',()=>{if(slideIndex>0){slideIndex--;drawSlide();}});$('next-slide').addEventListener('click',()=>{if(slideIndex<slideItems().length-1){slideIndex++;drawSlide();}});
document.addEventListener('keydown',event=>{if($('briefing').hidden)return;if(event.key==='Escape')setBriefing(false);else if(event.key==='ArrowRight'&&slideIndex<slideItems().length-1){slideIndex++;drawSlide();}else if(event.key==='ArrowLeft'&&slideIndex>0){slideIndex--;drawSlide();}});
$('theater-filter').addEventListener('change',render);$('lens-filter').addEventListener('change',render);load();
