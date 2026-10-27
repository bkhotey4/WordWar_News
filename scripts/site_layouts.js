// 首頁版面：同一份內容的三種排法，build 時都產生（preview-a/b/c.html），index.html 用 research/public_site.json 的 layout 指定的那一種。
// A 三欄並排：預警卡 → 軍事／外交／政治三欄 → 各國動向 → 動態整理 → 情資…
// B 分頁切換：預警卡 → 一個分頁區（動態整理／軍事／外交／政治／各國動向／每日重點）→ 情資…
// C 戰情室：左側固定欄放燈號與關鍵數據，右側是分頁區與情資

function tabsBlock(id, tabs) {
  const list = tabs.filter(t => t.html);
  return `<div class="vtabs" id="${id}">${list.map((t, i) => `<input type="radio" name="${id}" id="${id}-${i}"${i ? '' : ' checked'}><label for="${id}-${i}">${t.label}</label>`).join('')}
  ${list.map((t, i) => `<div class="vpanel vp-${i}">${t.html}</div>`).join('')}</div>
  <style>${list.map((t, i) => `#${id}-${i}:checked~.vp-${i}{display:block}`).join('')}</style>`;
}

function compose(variant, S) {
  const tabs = tabsBlock('vt', [
    { label: '🌐 動態整理', html: S.situation },
    { label: '🛡️ 軍事', html: S.colMil },
    { label: '🏛️ 外交', html: S.colDip },
    { label: '📜 政治', html: S.colPol },
    { label: '🗺️ 各國動向', html: S.countries },
    { label: '📝 每日重點', html: S.points }
  ]);
  const tail = `${S.reports}${S.numbers}${S.digest}${S.cta}${S.more}${S.links}${S.notice}`;
  if (variant === 'B') return `<main class="dash">${S.brief}${S.warn}<section id="intel"><h2>情勢整理</h2><p class="muted small">點上方分頁切換：依類別（軍事／外交／政治）或依國家查看近 7 天經確認的事件。</p>${tabs}</section>${tail}</main>`;
  if (variant === 'C') {
    const tailC = `${S.reports}${S.digest}${S.cta}${S.more}${S.links}${S.notice}`;
    return `<div class="war-layout"><aside class="war-side">${S.warnList}${S.numbersStack}</aside>
      <main class="war-main">${S.brief}<section id="intel"><h2>情勢整理</h2>${tabs}</section>${tailC}</main></div>`;
  }
  // D 頭版：上方燈號條 → 今日焦點大圖卡 → 軍事／外交／政治三欄圖卡 → 情資
  if (variant === 'D') return `<main class="dash">${S.warnStrip}${S.brief}
    <section id="focus"><h2>今日焦點</h2><p class="muted small">近 72 小時最重要的事件（依事件類型與報導量排序）。</p>${S.focus}</section>
    <section id="columns"><h2>軍事・外交・政治</h2><div class="bcols"><div class="bcol">${S.colMil}</div><div class="bcol">${S.colDip}</div><div class="bcol">${S.colPol}</div></div></section>
    <details class="more" id="countries-more"><summary>各國動向</summary>${S.countries}</details>${tail}</main>`;
  // E 戰區專頁（定案）：左側固定欄放各戰區預警燈號，右側每個戰區一條橫幅 → 每個戰區一條橫幅（等級＋戰場圖＋三類圖卡）
  if (variant === 'E') {
    const tailE = `${S.reports}${S.numbers}${S.digest}${S.cta}${S.more}${S.links}${S.notice}`;
    const short = n => n.replace(/戰爭|與荷莫茲海峽|、黎巴嫩/g, '');
    const tabs = [...(S.bandList || []).map(b => ({ id: b.id, label: `<span class="dot" style="background:${b.color}"></span>${short(b.name)}<b style="color:${b.color}">${b.level || '—'}</b>`, html: b.html })),
      ...(S.hotspots ? [{ id: 'hot', label: '🌍 其他熱點', html: `<p class="muted small">這些地區沒有預警燈號，只整理重點動態。</p>${S.hotspots}` }] : []),
      { id: 'all', label: '全部戰區', html: '' }];
    const radios = tabs.map((t, i) => `<input type="radio" name="theater-pick" id="th-${t.id}" class="th-radio"${i ? '' : ' checked'}>`).join('');
    const bar = `<nav class="ttabs" aria-label="選擇戰區">${tabs.map(t => `<label for="th-${t.id}" class="ttab tl-${t.id}">${t.label}</label>`).join('')}</nav>`;
    const panels = `<div class="tpanels">${tabs.filter(t => t.html).map(t => `<div class="tp tp-${t.id}">${t.html}</div>`).join('')}</div>`;
    const css = `<style>${tabs.filter(t => t.html).map(t => `#th-${t.id}:checked~.tpanels .tp-${t.id}`).join(',')},#th-all:checked~.tpanels .tp{display:block}${tabs.map(t => `#th-${t.id}:checked~.ttabs .tl-${t.id}`).join(',')}{background:var(--cyan);color:#0b1220;border-color:var(--cyan)}${tabs.map(t => `#th-${t.id}:checked~.ttabs .tl-${t.id} b`).join(',')}{color:#0b1220!important}</style>`;
    return `<div class="war-layout"><aside class="war-side">${S.warnSide}</aside>
      <main class="war-main"><section id="bands" class="tbox">${radios}${bar}${panels}${css}</section>${S.brief}${tailE}</main></div>`;
  }
  // G 戰情指揮中心：上方戰區燈號儀表（點選切換）→ 戰區大圖＋軍事／外交／情報／政治四觀點 → 右側衛星前後期判讀與各方觀點
  if (variant === 'G') {
    // 期刊導讀與上方「智庫研究導讀」是同一份資料，G 版只保留上方那一區
    const tailG = `${S.reports}${S.numbers}${S.cta}${S.more}${S.links}${S.notice}`;
    const tabs = [...(S.ccPanels || []).map(p => ({ id: p.id, level: p.level || 0, label: `<span>${p.name.replace(/戰爭|與荷莫茲海峽|、黎巴嫩/g, '')}</span><b>${p.level || '—'}</b><i style="width:${(p.level || 0) * 20}%"></i>`, color: p.color, html: p.html })),
      ...(S.ccHot ? [{ id: 'hot', label: '<span>🌍 其他熱點</span><b>·</b>', color: '#64748b', html: S.ccHot }] : [])];
    // 預設打開燈號最高的戰區（同級時依原順序），接近戰爭時一打開就是最危急的那一區
    const top = tabs.reduce((best, t, i) => ((t.level || 0) > (tabs[best].level || 0) ? i : best), 0);
    const radios = tabs.map((t, i) => `<input type="radio" name="cc-pick" id="cc-${t.id}-r" class="cc-radio"${i === top ? ' checked' : ''}>`).join('');
    const bar = `<nav class="cc-gauges" aria-label="選擇戰區">${tabs.map(t => `<label for="cc-${t.id}-r" class="cc-g cl-${t.id}${t.level >= 3 ? ` hot${t.level}` : ''}" style="--c:${t.color}">${t.label}</label>`).join('')}</nav>`;
    const css = `<style>${tabs.map(t => `#cc-${t.id}-r:checked~.cc-tps .tp-${t.id}`).join(',')}{display:block}${tabs.map(t => `#cc-${t.id}-r:checked~.cc-gauges .cl-${t.id}`).join(',')}{border-color:var(--cy);box-shadow:0 0 0 1px var(--cy),0 0 18px rgba(34,211,238,.3)}</style>`;
    return `<div class="cc" id="bands" style="max-width:1520px;margin:0 auto;padding:6px 20px 0"><p class="cc-live">戰況燈號｜點燈號切換戰區</p>${radios}${bar}<div class="cc-tps">${tabs.map(t => `<div class="cc-tp tp-${t.id}">${t.html}</div>`).join('')}</div>${css}${S.ccThink || ''}</div>
      <main class="dash">${S.brief}${tailG}</main>`;
  }
  const esc = S.esc || (x => String(x));
  const KIND = { OFFICIAL: '官方', PARTY: '交戰方', MEASURED: '量測', MEDIA: '媒體', RESEARCH: '研究' };
  const parts = S.ccParts || [];
  const byLevel = [...parts].sort((a, b) => (b.level || 0) - (a.level || 0));
  const lvBadge = p => `<span class="lvb" style="--lv:${p.color}"><b>${p.level || '—'}</b>${esc(p.levelName)}</span>`;
  const brief3 = p => `${p.points.length ? `<h4>發生什麼${p.date ? `<small>｜${esc(p.date.slice(5).replace('-', '/'))}</small>` : ''}</h4><ul>${p.points.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${p.outlook ? `<h4>研判</h4><p class="ol">${esc(p.outlook)}</p>` : ''}${p.watch ? `<h4>下一個觀察點</h4><p class="wt">◎ ${esc(p.watch)}</p>` : ''}
    ${p.triggered.length ? `<h4>觸發的預警指標</h4><p class="chips">${(p.triggeredKinds || p.triggered.map(x => ({ name: x }))).map(x => `<span>${x.kind ? `<i class="kd k-${x.kind}">${KIND[x.kind]}</i>` : ''}${esc(x.name)}</span>`).join('')}</p>` : '<p class="muted small">目前沒有預警指標超過門檻。</p>'}`;
  // 圖例與出處用網頁文字呈現（地圖本體不烙字，手機也看得清楚）
  const legendHtml = l => `<span class="lg"><i class="${l.shape === 'dot' ? 'dot' : l.shape === 'line' ? 'ln' : 'sq'}" style="background:${l.color}"></i>${esc(l.text)}</span>`;
  const mapFig = (p, cls) => p.pic ? `<figure class="${cls}">${p.map?.title ? `<p class="mf-t">${esc(p.map.title)}</p>` : ''}<a href="${p.pic}" target="_blank" rel="noopener"><img loading="lazy" src="${p.pic}" alt="${esc(p.name)} 戰場圖"></a>
    ${p.map?.legend?.length ? `<div class="mf-lg">${p.map.legend.map(legendHtml).join('')}</div>` : ''}<figcaption>點圖放大｜${p.map?.footer ? esc(p.map.footer) : `${p.id === 'ukraine_front' ? '控制區：DeepStateMap.live；' : ''}事件為已查核紀錄；底圖為無雲衛星鑲嵌（非當日影像）`}</figcaption></figure>` : '';
  const tailMain = `${S.reports}${S.numbers}${S.cta}${S.more}${S.links}${S.notice}`;

  // H 地圖優先：上方戰區燈號 → 大張戰場圖（全亮度）＋右側三段式重點 → 四觀點 → 側欄資訊改排在下方
  if (variant === 'H') {
    const top = Math.max(0, parts.indexOf(byLevel[0]));
    const levelKey = `<p class="mx-key">燈號：<span style="--lv:#22c55e">1 常態</span><span style="--lv:#eab308">2 升溫</span><span style="--lv:#f97316">3 高度警戒</span><span style="--lv:#ef4444">4 危機</span>｜依公開指標判定的緊張程度，不是開戰機率。預設打開目前最緊張的戰區。</p>`;
    // 選中的燈號自動捲到可見位置（手機上燈號列只看得到前幾個）
    const js = `<script>(function(){var bar=document.querySelector('.mx-bar');if(!bar)return;function show(){var r=document.querySelector('.mx-radio:checked');if(!r)return;var l=bar.querySelector('label[for="'+r.id+'"]');if(l)bar.scrollLeft=l.offsetLeft-(bar.clientWidth-l.offsetWidth)/2}show();document.querySelectorAll('.mx-radio').forEach(function(r){r.addEventListener('change',show)})})()</script>`;
    const radios = parts.map((p, i) => `<input type="radio" name="mx-pick" id="mx-${p.id}" class="mx-radio"${i === top ? ' checked' : ''}>`).join('');
    const bar = `<nav class="mx-bar" aria-label="選擇戰區">${parts.map(p => `<label for="mx-${p.id}" class="mx-tab ml-${p.id}" style="--lv:${p.color}"><i></i>${esc(p.short)}<b>${p.level || '—'}</b></label>`).join('')}</nav>`;
    const panels = parts.map(p => `<section class="mx-panel mp-${p.id}" style="--lv:${p.color}">
      <div class="mx-top"><div class="mx-l">${mapFig(p, 'mx-map')}${p.data || ''}</div><div class="mx-brief">${lvBadge(p)}<h2>${esc(p.headline)}</h2>${brief3(p)}</div></div>
      ${p.persp}${p.extra}${p.side ? `<div class="mx-side">${p.side}</div>` : ''}</section>`).join('');
    const css = `<style>${parts.map(p => `#mx-${p.id}:checked~.mx-panels .mp-${p.id}`).join(',')}{display:block}${parts.map(p => `#mx-${p.id}:checked~.mx-bar .ml-${p.id}`).join(',')}{background:var(--lv);color:#06101e;border-color:var(--lv)}</style>`;
    const liveJs = `<script>(function(){var gen=${JSON.stringify(S.generatedAt || '')};fetch('live.json?t='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){
  if(!d||!d.theaters||(gen&&Date.parse(d.generatedAt)<=Date.parse(gen)))return;
  d.theaters.forEach(function(t){
    var tab=document.querySelector('.mx-tab.ml-'+t.id);if(tab){tab.style.setProperty('--lv',t.color);var b=tab.querySelector('b');if(b)b.textContent=t.level||'—'}
    var p=document.querySelector('.mx-panel.mp-'+t.id);if(!p)return;p.style.setProperty('--lv',t.color);
    var lv=p.querySelector('.mx-brief .lvb');if(lv){lv.style.setProperty('--lv',t.color);lv.innerHTML='<b>'+(t.level||'—')+'</b>'+t.levelName.replace(/[<>&]/g,'')}
    var ch=p.querySelector('.mx-brief .chips');if(ch)ch.innerHTML=t.chipsHtml;
    var db=p.querySelector('.dbox');if(db&&t.dataHtml){var w=document.createElement('div');w.innerHTML=t.dataHtml;if(w.firstElementChild)db.replaceWith(w.firstElementChild)}
  });
  var k=document.querySelector('.mx-key');if(k){var s=document.createElement('b');s.className='mx-live';s.textContent='燈號與官方數據更新於 '+d.generatedTpe+'（台北）';k.appendChild(s)}
}).catch(function(){})})()</script>`;
    return `<div class="mx" id="bands">${S.brief}${radios}${bar}${levelKey}<div class="mx-panels">${panels}</div>${css}${js}${liveJs}</div><main class="dash">${tailMain}</main>`;
  }

  // I 閱讀式日報：單欄、由最緊張的戰區往下讀；每區一張戰場圖＋三段重點，完整分析收合
  if (variant === 'I') {
    const toc = `<ol class="rd-toc">${byLevel.map(p => `<li style="--lv:${p.color}"><a href="#rd-${p.id}"><span class="d"></span><b>${esc(p.short)}</b><em>${p.level || '—'}</em><span class="h">${esc(p.headline)}</span></a></li>`).join('')}</ol>`;
    const secs = byLevel.map(p => `<article class="rd-sec" id="rd-${p.id}" style="--lv:${p.color}">
      <header class="rd-h">${lvBadge(p)}<h2>${esc(p.name)}</h2></header><h3 class="rd-hl">${esc(p.headline)}</h3>
      ${mapFig(p, 'rd-map')}<div class="rd-body">${brief3(p)}</div>${p.data || ''}
      <details class="rd-more"><summary>軍事・外交・情報・政治完整分析</summary>${p.persp}${p.extra}${p.side ? `<div class="mx-side">${p.side}</div>` : ''}</details></article>`).join('');
    return `<main class="rd" id="bands"><section class="rd-head"><p class="rd-k">今日戰況簡報｜依緊張程度排序</p>${S.brief}${toc}</section>${secs}${tailMain}</main>`;
  }

  // J 台灣優先：台海戰情放最上（數字、地圖、中國政經、準備清單），其他戰區縮成卡片，點開看完整分析
  if (variant === 'J') {
    const tw = parts.find(p => p.id === 'taiwan_strait');
    const others = byLevel.filter(p => p.id !== 'taiwan_strait');
    const twHtml = tw ? `<section class="twd" id="taiwan" style="--lv:${tw.color}"><div class="twd-grid">
        <div class="twd-l">${lvBadge(tw)}<p class="rd-k">台海戰情</p><h2>${esc(tw.headline)}</h2>${S.twKpis ? `<div class="twd-k">${S.twKpis}</div>` : ''}${brief3(tw)}</div>
        <div class="twd-r">${mapFig(tw, 'twd-map')}${S.chinaBox || ''}</div></div>${tw.data || ''}
      ${S.cta}<details class="rd-more"><summary>台海：軍事・外交・情報・政治完整分析</summary>${tw.persp}${tw.extra}</details></section>` : '';
    const cards = others.map(p => `<article class="oc" style="--lv:${p.color}">${p.pic ? `<a href="${p.pic}" target="_blank" rel="noopener" class="oc-img"><img loading="lazy" src="${p.pic}" alt="${esc(p.name)} 戰場圖"></a>` : ''}
      <div class="oc-b"><header>${lvBadge(p)}<h3>${esc(p.name)}</h3></header><h4>${esc(p.headline)}</h4>${p.points.length ? `<ul>${p.points.slice(0, 2).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${p.watch ? `<p class="wt">◎ ${esc(p.watch)}</p>` : ''}<details class="rd-more"><summary>完整分析</summary>${p.persp}${p.extra}</details></div></article>`).join('');
    return `<main class="dash tw-first" id="bands">${S.brief}${twHtml}<section id="others"><h2>其他戰區（依緊張程度）</h2><div class="oc-grid">${cards}</div></section>${S.reports}${S.numbers}${S.more}${S.links}${S.notice}</main>`;
  }

  // F 磚塊儀表板：燈號磚＋事件圖卡磚混排
  if (variant === 'F') return `<main class="dash">${S.brief}<section id="bento"><h2>戰情總覽</h2><div class="bento">${S.bento}</div></section>
    <section id="intel"><h2>依類別與國家</h2>${tabs}</section>${tail}</main>`;
  // A：三欄並排（預設）
  return `<main class="dash">${S.brief}${S.warn}
    <section id="columns"><h2>軍事・外交・政治</h2><p class="muted small">近 7 天經 2 家以上媒體確認的事件，依類別分欄。</p><div class="bcols">${S.colMil ? `<div class="bcol">${S.colMil}</div>` : ''}${S.colDip ? `<div class="bcol">${S.colDip}</div>` : ''}${S.colPol ? `<div class="bcol">${S.colPol}</div>` : ''}</div></section>
    <section id="countries"><h2>各國動向</h2><p class="muted small">以新聞標題中最先出現的國家作為行動方，列出近 7 天的動作。</p>${S.countries}</section>
    <section id="situation"><h2>各戰區動態整理</h2>${S.situation}</section>
    ${S.points ? `<section id="points"><h2>每日戰況重點</h2>${S.points}</section>` : ''}${tail}</main>`;
}

const CSS = `.wstrip{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.wpill{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:var(--panel);border:1px solid var(--lv);text-decoration:none;color:var(--text)}
.wpill b{color:var(--lv);font-size:1.15em}.wpill .dot{width:9px;height:9px;border-radius:50%;background:var(--lv)}
.bento{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.bento .big{grid-column:span 2;grid-row:span 2}.bento .wide{grid-column:span 2}
.btile{background:var(--panel);border:1px solid var(--line);border-top:5px solid var(--lv);border-radius:12px;padding:12px 14px}.btile .bl{font-size:2.2em;font-weight:800;color:var(--lv);line-height:1}.btile.big .bl{font-size:4em}
.btile h3{margin:0 0 6px;font-size:1.05em}.btile ul{margin:6px 0 0;padding-left:18px;font-size:.9em}.bento>.icards{display:block;min-width:0;margin:0}.bento .icard{height:100%;box-sizing:border-box;min-width:0}.btile{min-width:0}
@media(max-width:900px){.bento{grid-template-columns:repeat(2,minmax(0,1fr))}.bento .big{grid-row:auto}}
.vtabs input{position:absolute;opacity:0;pointer-events:none}.vtabs label{display:inline-block;padding:7px 14px;margin:0 6px 10px 0;border:1px solid var(--line);border-radius:999px;cursor:pointer;color:var(--dim);font-weight:600}
.vtabs input:checked+label{background:var(--cyan);color:#0b1220;border-color:var(--cyan)}.vtabs input:focus-visible+label{outline:2px solid var(--cyan);outline-offset:2px}.vpanel{display:none}
.vpanel>.bcol-solo{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.war-layout{max-width:1400px;margin:0 auto;padding:12px 16px;display:grid;grid-template-columns:300px minmax(0,1fr);gap:20px;align-items:start}
.war-side{position:sticky;top:10px;max-height:calc(100vh - 20px);overflow-y:auto;display:flex;flex-direction:column;gap:12px}.war-main>section{margin:6px 0 26px}
.wlist{list-style:none;margin:0;padding:0;background:var(--panel);border:1px solid var(--line);border-radius:10px}.wlist li{display:flex;align-items:center;gap:8px;padding:9px 12px;border-top:1px solid var(--line)}.wlist li:first-child{border-top:0}
.wlist .dot{width:10px;height:10px;border-radius:50%;background:var(--lv);flex:none}.wlist .wn{flex:1}.wlist .wl{font-weight:800;color:var(--lv)}.wlist small{display:block;color:var(--dim);font-size:.78em}
.nstack .ncard{margin-bottom:10px}
.tbox{position:relative;margin-top:4px}.th-radio{position:absolute;opacity:0;pointer-events:none;top:0;left:0}.tp{display:none}
.ttabs{position:sticky;top:0;z-index:5;display:flex;gap:6px;overflow-x:auto;padding:8px 0 10px;background:var(--bg,#050b16);scrollbar-width:thin}
.ttab{flex:none;display:flex;align-items:center;gap:6px;padding:7px 12px;border:1px solid var(--line);border-radius:999px;cursor:pointer;font-weight:600;color:var(--text);white-space:nowrap;background:var(--panel)}
.ttab .dot{width:9px;height:9px;border-radius:50%}.ttab b{font-size:1.05em}.th-radio:focus-visible~.ttabs{outline:2px solid var(--cyan)}
.wlist label.wlink{cursor:pointer}@media(max-width:960px){.war-side:has(label.wlink){display:none}}
.wlist .wlink{display:flex;align-items:center;gap:8px;width:100%;color:inherit;text-decoration:none}.wlist li:has(.wlink){padding:0}.wlist .wlink{padding:9px 12px}.wlist .wlink:hover{background:rgba(255,255,255,.04)}.band{scroll-margin-top:12px}
@media(max-width:960px){.war-layout{grid-template-columns:1fr}.war-side{position:static;max-height:none}}
.lvb{display:inline-flex;align-items:center;gap:8px;padding:3px 12px 3px 4px;border-radius:999px;border:1px solid var(--lv);color:var(--lv);font-weight:700;font-size:.9em}.lvb b{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--lv);color:#06101e}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0}.chips span{font-size:.8em;padding:2px 10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--line)}
.ol{margin:0;padding:8px 12px;border-left:3px solid var(--lv);background:rgba(255,255,255,.04);border-radius:0 8px 8px 0}.wt{margin:0;color:#67e8f9}
.mx{max-width:1520px;margin:0 auto;padding:8px 20px 0}.mx-radio{position:absolute;opacity:0;pointer-events:none}.mx-panel{display:none}
.mx-bar{position:sticky;top:0;z-index:6;display:flex;gap:8px;overflow-x:auto;padding:10px 0;background:var(--bg,#050b16)}
.mx-tab{flex:1 0 auto;display:flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid var(--line);border-radius:10px;background:var(--panel);cursor:pointer;font-weight:600;white-space:nowrap}.mx-tab i{width:10px;height:10px;border-radius:50%;background:var(--lv)}.mx-tab b{margin-left:auto;font-size:1.2em}
.mx-top{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:18px;align-items:start;margin:6px 0 14px}
.mx .hero{margin:4px 0 6px}.mx .hero .brief{margin:0}.mx-key{margin:0 0 10px;font-size:.78em;color:var(--dim)}.mx-live{margin-left:8px;color:#67e8f9;font-weight:600}.mx-key span{margin:0 8px 0 2px;color:var(--lv);font-weight:700}
.rpts{margin:6px 0 8px;padding-left:18px;line-height:1.55;font-size:.92em;color:#cbd5e1}.mf-t{margin:0 0 6px;font-weight:700}.mf-lg{display:flex;flex-wrap:wrap;gap:6px 14px;margin:8px 0 2px;font-size:.82em}.lg{display:inline-flex;align-items:center;gap:6px}.lg i{display:inline-block;width:14px;height:12px;border-radius:2px;opacity:.9}.lg i.dot{width:11px;height:11px;border-radius:50%}.lg i.ln{height:3px}
@media(max-width:640px){.alert-banner{margin:8px 10px 0;padding:8px 12px;font-size:.92em}.alert-banner .ab-text{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.alert-banner .ab-note{display:none}.mx{padding:4px 10px 0}.mx .hero .brief{font-size:.92em;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}}
.mx-map,.rd-map,.twd-map{margin:0}
.kd{display:inline-block;font-style:normal;font-size:.72em;font-weight:700;padding:0 6px;border-radius:4px;margin-right:6px;vertical-align:1px;white-space:nowrap}.k-OFFICIAL{background:#14532d;color:#bbf7d0}.k-MEASURED{background:#1e3a5f;color:#bfdbfe}.k-MEDIA{background:#3f3f46;color:#e4e4e7}.k-PARTY{background:#713f12;color:#fde68a}.k-RESEARCH{background:#4c1d95;color:#ddd6fe}
.cc-pc header .kd{margin-left:4px}
.dbox{margin:14px 0 0;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 16px}.dbox h3{margin:0 0 8px;font-size:1em}.dbox h3 small{color:var(--dim);font-weight:400;font-size:.78em;margin-left:6px}
.dbox ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:8px}.dbox li{border:1px solid var(--line);border-left:4px solid #475569;border-radius:8px;padding:8px 10px;min-width:0}
.dbox li.tg{border-left-color:#f97316;background:rgba(249,115,22,.07)}.dbox li.ok{border-left-color:#22c55e}.dbox li b{font-size:.9em}.dbox li em{float:right;font-style:normal;font-size:.75em;font-weight:700}.dbox li.tg em{color:#fb923c}.dbox li.ok em{color:#4ade80}.dbox li.na em{color:var(--dim)}
.dbox li p{margin:4px 0 2px;font-size:.82em;color:#cbd5e1;line-height:1.5}.dmore{margin-top:8px}.dmore summary{cursor:pointer;color:#67e8f9;font-size:.85em;margin-bottom:8px}.dbox li small{font-size:.72em;color:var(--dim)}.dbox li small a{color:var(--dim)}.mx-map img,.rd-map img,.twd-map img{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line)}.mx-map figcaption,.rd-map figcaption,.twd-map figcaption{font-size:.74em;color:var(--dim);margin-top:4px}
.mx-brief{background:var(--panel);border:1px solid var(--line);border-top:4px solid var(--lv);border-radius:12px;padding:16px 18px;position:sticky;top:70px}.mx-brief h2{margin:10px 0 6px;font-size:1.35em;line-height:1.4;border:0;padding:0}
.mx-brief h4,.rd-body h4,.twd-l h4{margin:14px 0 4px;font-size:.78em;letter-spacing:.1em;color:var(--dim)}.mx-brief h4 small,.rd-body h4 small{letter-spacing:0}.mx-brief ul,.rd-body ul,.twd-l ul{margin:0;padding-left:18px;line-height:1.6}
.mx-side{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-top:14px}
.rd{max-width:900px;margin:0 auto;padding:12px 16px}.rd-k{margin:0;color:#67e8f9;font-size:.8em;letter-spacing:.12em}
.rd-toc{list-style:none;margin:12px 0 26px;padding:0;border:1px solid var(--line);border-radius:12px;background:var(--panel)}.rd-toc li{border-top:1px solid var(--line)}.rd-toc li:first-child{border-top:0}
.rd-toc a{display:grid;grid-template-columns:12px 132px 28px 1fr;align-items:center;gap:10px;padding:10px 14px;color:inherit;text-decoration:none}.rd-toc a:hover{background:rgba(255,255,255,.04)}.rd-toc .d{width:10px;height:10px;border-radius:50%;background:var(--lv)}.rd-toc em{font-style:normal;font-weight:800;color:var(--lv)}.rd-toc .h{color:var(--dim);font-size:.9em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rd-sec{margin:0 0 34px;padding-top:6px;border-top:3px solid var(--lv);scroll-margin-top:10px}.rd-h{display:flex;align-items:center;gap:12px;margin:12px 0 4px}.rd-h h2{margin:0;border:0;padding:0}.rd-hl{margin:4px 0 12px;font-size:1.25em;line-height:1.45}
.rd-more{margin:12px 0 0;border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:rgba(255,255,255,.02)}.rd-more summary{cursor:pointer;color:#67e8f9;font-weight:600}
.twd{background:var(--panel);border:1px solid var(--line);border-top:5px solid var(--lv);border-radius:14px;padding:18px;margin:14px 0 24px}.twd-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:20px;align-items:start}
.twd-l h2{margin:8px 0 6px;font-size:1.45em;line-height:1.4;border:0;padding:0}.twd-k .kpis{grid-template-columns:repeat(2,1fr);margin:10px 0}.twd .cta{margin:16px 0 0}
.oc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(420px,100%),1fr));gap:16px}.oc{background:var(--panel);border:1px solid var(--line);border-top:4px solid var(--lv);border-radius:12px;overflow:hidden;min-width:0}
.oc-img img{display:block;width:100%;height:230px;object-fit:cover;object-position:center 70%}.oc-b{padding:12px 14px}.oc-b header{display:flex;align-items:center;gap:10px}.oc-b h3{margin:0}.oc-b h4{margin:8px 0 4px;line-height:1.4}.oc-b ul{margin:0;padding-left:18px;font-size:.9em}
@media(max-width:1100px){.mx-top,.twd-grid{grid-template-columns:1fr}.mx-brief{position:static}}@media(max-width:520px){.oc-grid{grid-template-columns:1fr}.rd-toc a{grid-template-columns:12px 70px 24px 1fr}}`;

module.exports = { compose, tabsBlock, CSS };
