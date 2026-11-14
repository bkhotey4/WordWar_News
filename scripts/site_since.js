// 首頁「上次來過之後」：瀏覽器記住上次看到的網站版本時間，只列出那之後本站才收錄的事件（最多 3 件，可展開看時間與原文）。
// 第一次來（沒有紀錄）就列最近 24 小時的重點。紀錄只存在讀者自己的瀏覽器。
const HOUR = 3600_000, DAY = 24 * HOUR;
const PRIORITY = { LEVEL_UP: 5, EVAC: 4, REPORT: 3, MIL: 3, FLIGHTS: 3, HOMEFRONT: 2, MOBPREP: 2 };

function sinceItems(events, { names, kinds, tpe, now, clocks }) {
  const safe = h => h && /^(https:\/\/|archive\.html)/.test(h) ? h : null;
  return events.filter(e => e.kind !== 'LEVEL_DOWN' && now - Date.parse(e.seenAt || e.at) <= 7 * DAY)
    .map(e => {
      const k = kinds[e.kind] || { icon: '•', label: e.kind };
      return { t: e.title, h: safe(e.href), th: names[e.theater] || '全球', k: `${k.icon} ${k.label}`,
        s: Date.parse(e.seenAt || e.at), p: (PRIORITY[e.kind] || 1) + Math.min(2, (e.pubs || 0) / 4),
        c: clocks(e, { tpe, siteAt: now }).map(([a, b]) => `${a} ${b}`).join('｜') };
    }).sort((a, b) => b.s - a.s).slice(0, 60);
}

function sinceSection(events, { esc, names, kinds, tpe, now, clocks }) {
  const items = sinceItems(events, { names, kinds, tpe, now, clocks });
  if (!items.length) return '';
  // JSON 放進 <script type="application/json">，把 < 轉義避免提早結束標籤
  const data = JSON.stringify({ gen: now, items }).replace(/</g, '\\u003c');
  return `<section class="since" id="since" hidden><h2 class="since-h"></h2><ol class="since-list"></ol><p class="since-more muted small"></p>
<script type="application/json" id="since-data">${data}</script>
<script>(function(){var box=document.getElementById('since'),d;try{d=JSON.parse(document.getElementById('since-data').textContent)}catch(e){return}
var KEY='ww_last_build',last=null;try{last=Number(localStorage.getItem(KEY))||null}catch(e){}
var cut=last||d.gen-${DAY},list=d.items.filter(function(i){return i.s>cut});
try{if(!last||d.gen>last)localStorage.setItem(KEY,String(d.gen))}catch(e){}
if(!list.length){if(last){box.querySelector('.since-h').textContent='上次來過之後沒有新收錄的事件';box.hidden=false}return}
var top=list.slice().sort(function(a,b){return b.p-a.p||b.s-a.s}).slice(0,3);
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
box.querySelector('.since-h').textContent=last?'上次來過之後的 '+top.length+' 件事':'最近 24 小時的 '+top.length+' 件事';
box.querySelector('.since-list').innerHTML=top.map(function(i){
var t=i.h?'<a href="'+esc(i.h)+'"'+(/^https/.test(i.h)?' target="_blank" rel="noopener">開啟原文 ↗':'>看報導全文 →')+'</a>':'';
return '<li><details><summary><span class="since-tag">'+esc(i.th)+'</span> '+esc(i.k)+'｜'+esc(i.t)+'</summary><p class="since-c">'+esc(i.c)+'</p>'+(t?'<p>'+t+'</p>':'')+'</details></li>'}).join('');
box.querySelector('.since-more').innerHTML=(list.length>top.length?'另有 '+(list.length-top.length)+' 件，':'')+'<a href="timeline.html">看完整事件時間軸 →</a>';
box.hidden=false})()</script></section>`;
}

const CSS = `.since{margin:0 0 12px;padding:10px 14px;border:1px solid var(--line);border-left:4px solid var(--cyan);border-radius:8px;background:var(--panel)}
.since-h{margin:0 0 6px;font-size:1.05em}.since-list{margin:0;padding-left:1.2em}.since-list li{margin:4px 0}.since-list summary{cursor:pointer}
.since-tag{font-size:.8em;padding:0 6px;border:1px solid var(--line);border-radius:999px;color:var(--dim)}.since-c{margin:4px 0;font-size:.82em;color:var(--dim)}.since-more{margin:6px 0 0}`;

module.exports = { sinceItems, sinceSection, CSS };
