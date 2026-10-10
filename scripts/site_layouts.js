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
    return `<div class="cc" id="bands" style="max-width:1520px;margin:0 auto;padding:6px 20px 0"><p class="cc-live">LIVE 戰況｜點燈號切換戰區</p>${radios}${bar}<div class="cc-tps">${tabs.map(t => `<div class="cc-tp tp-${t.id}">${t.html}</div>`).join('')}</div>${css}${S.ccThink || ''}</div>
      <main class="dash">${S.brief}${tailG}</main>`;
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
@media(max-width:960px){.war-layout{grid-template-columns:1fr}.war-side{position:static;max-height:none}}`;

module.exports = { compose, tabsBlock, CSS };
