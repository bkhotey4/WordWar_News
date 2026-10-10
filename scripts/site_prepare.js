// 離線版準備清單（prepare.html）＋附近防空避難處所查詢＋PWA（manifest、service worker）。
// 第一次開啟後，準備清單、避難要點與最近查過的避難處所在斷網時也能看。

function preparePage({ prepHtml, esc, tpe, now, shelterIndex }) {
  const districts = shelterIndex?.districts || {};
  const counties = [...new Set(Object.keys(districts).map(d => d.slice(0, 3)))];
  const shelterBlock = shelterIndex ? `
<section id="shelter"><h2>📍 附近防空避難處所</h2>
<p class="muted small">資料：${esc(shelterIndex.source)}，共 ${shelterIndex.total.toLocaleString('en-US')} 處，${esc(tpe(Date.parse(shelterIndex.updated)).slice(0, 10))} 更新。多數位於大樓地下室，平時屬私人產權，請在警報發布時使用；實際位置以現場「防空避難」標示為準。</p>
<div class="sh-controls"><button type="button" id="sh-geo">📍 用我的位置找最近的 10 處</button>
<select id="sh-county" aria-label="縣市"><option value="">或選縣市</option>${counties.map(c => `<option>${esc(c)}</option>`).join('')}</select>
<select id="sh-district" aria-label="鄉鎮市區" disabled><option value="">鄉鎮市區</option></select></div>
<p id="sh-status" class="muted" role="status"></p><ol id="sh-list" class="sh-list"></ol>
<p class="muted small">也可以用官方查詢：<a href="https://adr.npa.gov.tw/" target="_blank" rel="noopener">內政部警政署防空疏散避難專區</a>，或手機「警政服務」App 的防空避難專區。</p>
</section>` : '';
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>民眾準備清單（離線版）｜WorldWar 戰況情報站</title><meta name="description" content="家中儲備、緊急避難包、空襲警報應變與附近防空避難處所查詢；加到手機主畫面後斷網也能看。">
<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#060d18"><link rel="apple-touch-icon" href="icon-192.png">
<link rel="stylesheet" href="style.css"></head><body>
<header class="top"><div class="brand"><h1>民眾準備清單</h1><p>離線版｜內容更新於 ${esc(tpe(now))}（台北）</p></div><nav><a href="index.html">← 回首頁</a></nav></header>
<main class="narrow">
<p class="notice small" id="offline-tip">📴 <b>斷網也能看：</b>手機用瀏覽器開啟本頁後，iPhone 按「分享 → 加入主畫面」，Android 按選單「安裝應用程式／加到主畫面」。開過一次後，這頁和你查過的避難處所會存在手機裡。<span id="sw-state"></span></p>
${shelterBlock}
<section id="prepare"><h2>🧺 家中儲備與避難包</h2>${prepHtml || '<p class="muted">準備清單暫時無法載入。</p>'}</section>
</main>
<script>
(function(){
  var st=document.getElementById('sw-state');
  if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').then(function(){st.textContent='（離線功能已啟用）'}).catch(function(){st.textContent=''})}
  if(!document.getElementById('sh-geo'))return;
  var idx=null,tiles={},$=function(i){return document.getElementById(i)},status=$('sh-status'),list=$('sh-list');
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function loadIndex(){return idx?Promise.resolve(idx):fetch('shelters/index.json').then(function(r){return r.json()}).then(function(j){idx=j;return j})}
  function tile(k){if(tiles[k])return Promise.resolve(tiles[k]);if(idx.tiles.indexOf(k)<0)return Promise.resolve([]);return fetch('shelters/t_'+k+'.json').then(function(r){return r.json()}).then(function(j){tiles[k]=j;return j}).catch(function(){return[]})}
  function dist(a,b,c,d){var R=6371,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180,h=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)*Math.sin(y/2);return 2*R*Math.asin(Math.sqrt(h))}
  function near(lat,lon,label){
    status.textContent='搜尋中…';list.innerHTML='';
    loadIndex().then(function(){var bl=Math.floor(lat*10),bo=Math.floor(lon*10),ks=[];for(var i=-1;i<=1;i++)for(var j=-1;j<=1;j++)ks.push((bl+i)+'_'+(bo+j));return Promise.all(ks.map(tile))})
    .then(function(groups){var all=[].concat.apply([],groups).map(function(r){return{r:r,d:dist(lat,lon,r[0],r[1])}}).sort(function(a,b){return a.d-b.d}).slice(0,10);
      if(!all.length){status.textContent='附近 10 公里內沒有找到資料，請改用官方查詢。';return}
      status.textContent=label+'：最近的 '+all.length+' 處（直線距離，非步行路線）';
      list.innerHTML=all.map(function(x){var r=x.r,m=x.d<1?Math.round(x.d*1000)+' 公尺':x.d.toFixed(1)+' 公里';
        return '<li><b>'+m+'</b>｜'+esc(r[2])+(r[3]?'（'+esc(r[3])+'）':'')+'<br><span class="muted small">可容納約 '+(r[4]||'?')+' 人'+(r[5]?'｜'+esc(r[5]):'')+'｜<a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query='+r[0]+','+r[1]+'">地圖</a></span></li>'}).join('')})
    .catch(function(){status.textContent='讀取失敗：第一次使用需要網路，查過的區域之後離線也能看。'})}
  $('sh-geo').onclick=function(){if(!navigator.geolocation){status.textContent='這個瀏覽器不支援定位，請改選縣市。';return}
    status.textContent='取得位置中（位置只在你的手機上計算，不會上傳）…';
    navigator.geolocation.getCurrentPosition(function(p){near(p.coords.latitude,p.coords.longitude,'你的位置附近')},function(){status.textContent='無法取得位置，請允許定位或改選縣市。'},{enableHighAccuracy:true,timeout:15000})};
  $('sh-county').onchange=function(){var c=this.value,ds=$('sh-district');loadIndex().then(function(){var names=Object.keys(idx.districts).filter(function(d){return d.indexOf(c)===0&&d!==c});
    ds.innerHTML='<option value="">鄉鎮市區</option>'+names.map(function(d){return '<option value="'+esc(d)+'">'+esc(d.slice(3))+'（'+idx.districts[d][2]+' 處）</option>'}).join('');ds.disabled=!c})};
  $('sh-district').onchange=function(){var d=this.value;if(!d)return;var v=idx.districts[d];near(v[0],v[1],d+'中心附近')};
})();
</script></body></html>`;
}

function manifest() {
  return JSON.stringify({ name: 'WorldWar 戰況情報站', short_name: 'WorldWar', start_url: './prepare.html', scope: './', display: 'standalone', background_color: '#060d18', theme_color: '#060d18', lang: 'zh-Hant-TW',
    description: '民眾準備清單與附近防空避難處所（可離線）', icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }, null, 1);
}

// 準備清單與避難處所：先用網路、失敗用快取；其他網頁也會存一份最新的，斷網時至少看得到上次的版本（大圖不存，避免佔空間）
function serviceWorker(version, { shelters = true, sheltersVersion = 'v1' } = {}) {
  return `const V='ww-${version}', S='ww-shelters-${String(sheltersVersion).replace(/[^0-9A-Za-z]/g, '')}';
const CORE=['./prepare.html','./style.css','./manifest.webmanifest','./icon-192.png','./icon-512.png','./index.html'${shelters ? ",'./shelters/index.json'" : ''}];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!==S).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  if(/\\/shelters\\/t_/.test(u.pathname)){
    e.respondWith(caches.open(S).then(c=>c.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}))));return;
  }
  if(/\\.(jpg|jpeg|webp)$/i.test(u.pathname))return;
  // 網頁與資料一律向伺服器確認最新版（避免瀏覽器快取讓新內容晚 10 分鐘才出現），斷網才用快取
  e.respondWith(fetch(u.href,{cache:'no-cache',credentials:'same-origin'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp))}return r})
    .catch(()=>caches.match(e.request).then(hit=>hit||(e.request.mode==='navigate'?caches.match('./prepare.html'):undefined))));
});`;
}

const CSS = `.sh-controls{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.sh-controls button,.sh-controls select{padding:10px 14px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--text);font-size:16px}
.sh-controls button{background:var(--cyan);color:#0b1220;font-weight:700;border-color:var(--cyan);cursor:pointer}.sh-list{padding-left:1.4em}.sh-list li{margin:6px 0;padding-bottom:6px;border-bottom:1px solid var(--line)}`;

module.exports = { preparePage, manifest, serviceWorker, CSS };
