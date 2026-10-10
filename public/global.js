'use strict';
function el(tag,text,parent){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(parent)parent.append(node);return node;}
function link(title,url,parent){try{const u=new URL(url,location.origin);if(u.protocol!=='https:'&&u.origin!==location.origin)return;const a=el('a',title,parent);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';}catch{}}
function image(asset,parent){if(!/^\/images\/sentinel\/[a-zA-Z0-9_.-]+\.(jpg|png|webp)$/.test(asset.imageUrl||''))return;const img=el('img',undefined,parent);img.src=asset.imageUrl;img.alt=`${asset.region}，拍攝 ${asset.acquiredAt}`;img.loading='lazy';el('p',`拍攝：${asset.acquiredAt}\n整片雲量：${asset.cloudCoverPercent??'未提供'}%｜局部可見度未確認\n來源影像不等於目前戰況。`,parent);link('來源產品',asset.sourceProductUrl,parent);}
function evidenceFigure(ref,asset,report,coverage,frame,parent){
  if(!/^\/images\/sentinel\/[a-zA-Z0-9_.-]+\.(jpg|png|webp)$/.test(asset.imageUrl||''))return;
  const figure=el('figure',undefined,parent);figure.className='evidence-figure';
  const header=el('div',undefined,figure);header.className='evidence-head';el('strong','影像與國際報導對照',header);
  el('span',ref.role==='REVIEWED_OBSERVATION'?'已覆核影像觀察':'地表背景｜未判讀戰況',header);
  const grid=el('div',undefined,figure);grid.className='evidence-grid';
  const visual=el('div',undefined,grid);visual.className='evidence-visual';const img=el('img',undefined,visual);img.src=asset.imageUrl;img.alt=`${asset.region} 來源衛星影像，拍攝 ${asset.acquiredAt}`;img.loading='lazy';
  const label=el('span',`Sentinel-2｜${asset.acquiredAt.slice(0,10)}`,visual);label.className='evidence-date';
  if(frame?.kind==='SOURCE_QUERY_EXTENT'){const compass=el('span','N ↑',visual);compass.className='evidence-north';}
  const notes=el('div',undefined,grid);notes.className='evidence-notes';el('h4',report.title,notes);
  el('p',`報導所述：${coverage?.summary||report.sections?.find(s=>s.kind==='REPORTED')?.text||'本稿未列出可對照的事件摘要。'}`,notes);
  el('p',`影像範圍：${asset.region}\n產品：${asset.productId}\n拍攝：${asset.acquiredAt}\n圖說：${ref.caption}`,notes);
  if(frame?.kind==='SOURCE_QUERY_EXTENT'){
    const [west,south,east,north]=frame.queryBbox;
    el('p',`來源查詢範圍：西界經度 ${west.toFixed(4)}°、東界經度 ${east.toFixed(4)}°；南界緯度 ${south.toFixed(4)}°、北界緯度 ${north.toFixed(4)}°。\n${frame.note}`,notes);
  }
  if(ref.role==='REVIEWED_OBSERVATION')el('p',`已覆核觀察：${ref.observation}`,notes);
  else el('p','這張影像僅展示該區拍攝時的地表；沒有證明報導事件、控制區或部隊位置。',notes);
  link('影像產品與來源 ↗',asset.sourceProductUrl,notes);
  for(const sourceId of (coverage?.evidence||report.sections?.find(s=>s.kind==='REPORTED')?.evidence||[])){
    const source=report.references?.find(r=>r.id===sourceId);if(source)link(`${source.publisher}｜${source.publishedAt} ↗`,source.url,notes);
  }
  el('figcaption','分欄對照：文字來自引用報導；照片來自獨立衛星產品。未經影像判讀，不把報導內容畫到照片上的位置。',figure);
}
function sourceMap(map,parent){if(!map)return;const panel=el('section',undefined,parent);panel.className='theater-map';el('h3','來源戰況圖',panel);
  const picture=el('figure',undefined,panel);const img=el('img',undefined,picture);img.src=map.imageUrl;img.alt=`${map.credit} 的戰況圖：${map.caption}`;img.loading='lazy';img.referrerPolicy='no-referrer';
  img.addEventListener('error',()=>{img.remove();el('p','圖片無法載入，請查看原始貼文。',picture);});
  el('figcaption',`${map.caption}｜圖像作者：${map.credit}｜發布：${map.publishedAt}\n線條與箭頭是來源作者的主張，非本站衛星識別或即時位置。`,picture);
  link('查看地圖原始貼文 ↗',map.sourceUrl,picture);
}
function chronology(report,parent){
  if(!report.timeline)return;
  const box=el('section',undefined,parent);box.className='theater-map';el('h4',report.timeline.title,box);
  el('p','公開報導時間軸｜事件順序示意，不是航跡、衛星定位或即時位置',box);
  const kinds={REPORTED_OBSERVATION:'來源所述觀測',DISPUTED_SIGNAL:'有爭議的訊號',OFFICIAL_ASSESSMENT:'官方研判'};
  const list=el('ol',undefined,box);
  for(const e of report.timeline.events){const row=el('li',undefined,list);el('strong',`${e.date} ${e.timeLabel}｜${kinds[e.kind]}`,row);el('p',`${e.place}\n${e.text}`,row);for(const id of e.evidence){const ref=report.references.find(r=>r.id===id);if(ref)link(`${ref.publisher} ↗`,ref.url,row);}}
  el('p',report.timeline.note,box);
}
// 網站版戰場圖／海報：按鈕觸發才產生，避免每次開頁都要伺服器畫圖
const RENDER_TYPES={map:{api:'battle-map',label:'戰場圖'},poster:{api:'poster',label:'海報'}};
function renderBox(id,parent){const box=el('section',undefined,parent);box.className='theater-map render-box';el('h3','戰場圖與戰況海報',box);
  el('p','與 Discord /battle-map、/poster 相同的圖；圖層只畫有來源的覆核紀錄。每 20 分鐘最多重畫一次。',box).className='row-note';
  for(const type of ['map','poster']){const b=el('button',`產生${RENDER_TYPES[type].label}`,box);b.type='button';b.dataset.render=type;b.dataset.theater=id;b.style.marginRight='8px';}
}
async function showRender(button){
  const {render:type,theater}=button.dataset,info=RENDER_TYPES[type],box=button.closest('.render-box');
  box.querySelector(`[data-output="${type}"]`)?.remove();
  const out=el('div',undefined,box);out.dataset.output=type;const note=el('p',`${info.label}產生中…`,out);note.className='row-note';button.disabled=true;
  try{const r=await fetch(`/api/${info.api}/${encodeURIComponent(theater)}`,{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||`HTTP ${r.status}`);
    note.textContent=`${data.title}｜產生於 ${new Date(data.renderedAt).toLocaleString('zh-TW')}${data.paragraph?`\n${data.paragraph}`:''}`;
    const img=el('img',undefined,out);img.src=`${data.imageUrl}?t=${Date.parse(data.renderedAt)}`;img.alt=data.title;
    const a=el('a','開啟原尺寸圖 ↗',out);a.href=img.src;a.target='_blank';a.rel='noopener';
    for(const l of data.sourceLinks||[]){const p=el('p',undefined,out);link(`比對來源：${l.title} ↗`,l.url,p);}
    for(const f of data.forces||[]){const p=el('p',undefined,out);link(`兵力出處：${f.source}（${f.asOf}） ↗`,f.url,p);}
  }catch(error){note.textContent=`${info.label}暫時無法產生：${error.message}`;}finally{button.disabled=false;}
}
document.addEventListener('click',e=>{const b=e.target.closest('button[data-render]');if(b)showRender(b);});
// 衛星前後期對照：拖曳滑桿比較兩期，可疊加像素差異（待查，不是判讀）
function comparePanel(pair,parent){
  const box=el('section',undefined,parent);box.className='compare';el('h3',`衛星前後期對照｜${pair.region}`,box);
  if(!pair.available){el('p',`無法比較：${pair.reason}`,box).className='row-note';return;}
  const stage=el('div',undefined,box);stage.className='compare-stage';
  const before=el('img',undefined,stage);before.src=pair.before.imageUrl;before.alt=`${pair.region} 前期影像 ${pair.before.acquiredAt}`;before.loading='lazy';
  const after=el('img',undefined,stage);after.className='after';after.src=pair.after.imageUrl;after.alt=`${pair.region} 後期影像 ${pair.after.acquiredAt}`;after.loading='lazy';
  const diff=el('img',undefined,stage);diff.className='diff';diff.alt='像素差異（紅＝變亮、青＝變暗）';diff.loading='lazy';
  const divider=el('span',undefined,stage);divider.className='divider';
  el('span',`前期 ${pair.before.acquiredAt.slice(0,10)}`,stage).className='tag l';el('span',`後期 ${pair.after.acquiredAt.slice(0,10)}`,stage).className='tag r';
  const range=el('input',undefined,box);range.type='range';range.min='0';range.max='100';range.value='50';range.setAttribute('aria-label','前後期分界位置');
  range.addEventListener('input',()=>{after.style.clipPath=`inset(0 0 0 ${range.value}%)`;divider.style.left=`${range.value}%`;});
  const label=el('label',undefined,box);const cb=el('input',undefined,label);cb.type='checkbox';label.append(' 疊加像素差異（紅＝變亮、青＝變暗；雲與無資料處不比較）');
  cb.addEventListener('change',()=>{if(cb.checked&&!diff.src)diff.src=pair.diffUrl;diff.style.display=cb.checked?'block':'none';});
  diff.addEventListener('error',()=>{cb.checked=false;cb.disabled=true;diff.style.display='none';label.append('｜差異圖無法產生');});
  const share=pair.diff?`差異像素約 ${(pair.diff.changedShare*100).toFixed(2)}%（共同可見 ${pair.diff.comparedPixels.toLocaleString()} 像素）`:'差異比例於首次開啟疊圖後計算';
  el('p',`相隔 ${pair.gapDays} 天｜裁切區實測可見：前期 ${Math.round(pair.before.crop.clear*100)}%、後期 ${Math.round(pair.after.crop.clear*100)}%｜${share}\n未做輻射校正與精確對位；標示處只代表亮度變化較大（可能是雲影、季節、農作或水面反光），不代表戰損、部隊或設施變化。`,box).className='row-note';
  const p=el('p',undefined,box);link(`前期產品 ${pair.before.productId} ↗`,pair.before.sourceProductUrl,p);p.append('　');link(`後期產品 ${pair.after.productId} ↗`,pair.after.sourceProductUrl,p);
}
const WARN_NAMES={1:'常態',2:'升溫',3:'高度警戒',4:'危機'};
const WARN_TREND={UP:'↑ 較上週升高',DOWN:'↓ 較上週下降',FLAT:'→ 與上週相同',UNKNOWN:'尚無上週紀錄'};
function warningBox(board,id,card){const t=board?.theaters?.find(x=>x.id===id);if(!t)return;
  const box=el('div',undefined,card);box.className=`warning-box warning-${t.level||'unknown'}`;
  el('h3',`預警（試行中）：${t.level?`第 ${t.level} 級 ${WARN_NAMES[t.level]}`:'無法判定'}｜${WARN_TREND[t.trend]}`,box);
  el('p',`判定：${t.reason}`,box);
  for(const i of [...t.triggered,...t.deescalation]){const p=el('p',`${i.tier==='DEESCALATION'?'降溫訊號｜':''}${i.name}：${i.summary}`,box);if(i.sources?.[0])link(` ${i.sources[0].publisher} ↗`,i.sources[0].url,p);}
  if(t.unknown.length){const d=el('details',undefined,box);el('summary',`無法判定的指標（${t.unknown.length}）`,d);el('p',t.unknown.map(i=>i.name).join('、'),d);}
  if(t.nextWatch)el('p',`下一個觀察點：${t.nextWatch}`,box);}
async function load(){const status=document.getElementById('status');status.textContent='查閱最新資料…';try{
  const [reports,satellite,registry,globalBrief]=await Promise.all(['/api/reports','/api/satellite-assets','/data/global_theaters.json','/api/global-brief'].map(async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}));
  const [warning,compare]=await Promise.all(['/api/warning','/api/satellite-compare'].map(url=>fetch(url,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)));
  const root=document.getElementById('theaters');root.replaceChildren();
  for(const {id,name,satelliteRegions:regions}of registry.theaters){const card=el('article',undefined,root);el('h2',name,card);warningBox(warning,id,card);
    const theater=globalBrief.theaters.find(t=>t.id===id);const context=theater?.newsContext||[];
    const currentMap=theater?.updates?.find(update=>update.map)?.map;sourceMap(currentMap,card);renderBox(id,card);
    for(const pair of (compare?.pairs||[]).filter(p=>regions.includes(p.region)))comparePanel(pair,card);
    for(const claim of context){const box=el('div',undefined,card);box.className='scenario';el('h3','國際報導提及的行動方｜非影像識別',box);
      el('p',`${claim.parties.join('／')}\n${claim.summary}\n來源日期：${claim.references.some(r=>r.sourceType?.includes('DATE_ONLY'))?claim.observedAt.slice(0,10)+'（僅日期）':claim.observedAt}${claim.status==='DATED_CONTEXT'?'｜較舊背景':''}`,box);
      for(const ref of claim.references){const line=el('p',undefined,box);link(ref.publisher,ref.url,line);}}
    const rows=(reports.reports||[]).filter(r=>!r.supersededBy&&(r.theater===id||r.coverage?.some(c=>c.theater===id)));
    if(!rows.length)el('p','本輪沒有可引用的近期研究稿；不據此判斷局勢平靜。',card);
    for(const report of rows){const coverage=report.coverage?.find(c=>c.theater===id);const date=coverage?.observedAt||report.asOf;
      const dayOnly=coverage?.evidence?.some(sourceId=>report.references?.some(ref=>ref.id===sourceId&&ref.sourceType?.includes('DATE_ONLY')));
      el('h3',report.title,card);el('p',`資料日期：${dayOnly?date.slice(0,10)+'（來源只標示日期）':date}${Date.now()-Date.parse(date)>48*3600000?'｜較舊背景':''}`,card);
      if(coverage)el('p',coverage.summary,card);else for(const section of report.sections)el('p',`${section.label}\n${section.text}`,card);
      if(!coverage||report.timeline?.events.every(e=>e.evidence.every(id=>coverage.evidence.includes(id))))chronology(report,card);
      const scenarios=(report.scenarios||[]).filter(s=>!coverage||s.evidence.every(id=>coverage.evidence.includes(id)));
      for(const scenario of scenarios){const box=el('div',undefined,card);box.className='scenario';el('h4',`情境推演：${scenario.name}｜${scenario.horizon}`,box);el('p',`假設：${scenario.assumption}\n可能影響：${scenario.implication}\n成立條件：${scenario.triggers.join('；')}\n反證：${scenario.counterEvidence.join('；')}`,box);}
      const evidence=coverage?new Set(coverage.evidence):null;
      for(const ref of (report.references||[]).filter(r=>!evidence||evidence.has(r.id))){const p=el('p',undefined,card);link(`${ref.publisher}｜${ref.publishedAt}`,ref.url,p);}
      for(const ref of (report.imagery||[]).filter(r=>regions.includes(r.region))){const asset=(satellite.assets||[]).find(a=>a.region===ref.region&&a.productId===ref.productId&&a.sha256===ref.sha256);const frame=theater?.updates?.find(u=>u.reportId===report.id)?.imagery?.find(a=>a.region===ref.region&&a.productId===ref.productId&&a.sha256===ref.sha256)?.mapFrame;if(asset)evidenceFigure(ref,asset,report,coverage,frame,card);}
    }
    const assets=(satellite.assets||[]).filter(a=>regions.includes(a.region)).slice(0,2);if(assets.length){const details=el('details',undefined,card);el('summary','區域背景影像（未判讀戰果）',details);for(const asset of assets)image(asset,details);}
  }status.textContent=`已讀取 ${reports.reports?.length||0} 篇有效報導、${satellite.assets?.length||0} 張來源影像。查阅時間 ${new Date().toLocaleString('zh-TW')}；不是事件時間。`;
}catch(error){status.textContent=`資料讀取失敗：${error.message}。未沿用舊畫面冒充更新。`;document.getElementById('theaters').replaceChildren();}}
document.getElementById('refresh').addEventListener('click',load);load();
