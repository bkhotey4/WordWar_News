// 衛星影像前後期比對（網站用）：沿用 src/satellite_compare 的配對（同一裁切範圍、裁切區實測可見比例 ≥ 60%、相隔 ≥ 2 天），
// 複製前期／本期裁切圖與差異圖到網站，並套上 research/imint_reviews.json 的人工（排程）判讀。
// 判讀必須對應同一組前後期產品編號，影像換了就自動回到「待判讀」，不會把舊判讀套到新影像上。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const REVIEWS = path.join(ROOT, 'research', 'imint_reviews.json');
const REGIONS = {
  longtian: { theater: 'taiwan_strait', name: '福建龍田機場', focus: '跑道、停機坪與周邊新闢設施' },
  sabina: { theater: 'south_china_sea', name: '仙賓礁潟湖', focus: '潟湖內與礁盤周邊的大型船隻聚集' },
  hormuz_bandar_abbas: { theater: 'iran_gulf', name: '阿巴斯港（荷莫茲海峽）', focus: '港區泊位、錨地船隻數量與油料設施' },
  gaza_civil: { theater: 'middle_east', name: '加薩走廊', focus: '城區大範圍損毀、清運與臨時營地' },
  suwalki: { theater: 'europe_security', name: '蘇瓦烏基走廊', focus: '邊境道路與營區周邊大型活動' },
  toropets: { theater: 'ukraine_front', name: '托羅佩茨軍火庫（俄）', focus: '庫區燃燒痕跡與建物損毀' },
  ukraine_civil: { theater: 'ukraine_front', name: '烏克蘭東部城區', focus: '城區火燒痕與大型建物損毀' },
  khartoum_civil: { theater: 'sudan', name: '喀土穆', focus: '城區火燒痕與大範圍損毀' },
  mandalay_civil: { theater: 'myanmar', name: '曼德勒', focus: '城區火燒痕與大範圍損毀' }
};
const CONF = ['低', '中', '高'];
const SIMPLIFIED = /[图视软频为这们说开关发时会来对国过还进动战经济]/;
const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const str = (v, max, min = 1) => typeof v === 'string' && v.trim().length >= min && v.length <= max;

function checkReview(r) {
  const e = [], k = `${r?.region || '?'}／${r?.afterProductId || '?'}`;
  if (!Object.hasOwn(REGIONS, r?.region)) e.push(`${k}：region 必須是 ${Object.keys(REGIONS).join('／')}`);
  for (const f of ['beforeProductId', 'afterProductId']) if (!/^S2[A-D]_[0-9A-Z]{5}_\d{8}_\d_L2A$/.test(r?.[f] || '')) e.push(`${k}：${f} 必須是 Sentinel-2 產品編號`);
  if (!Number.isFinite(Date.parse(r?.reviewedAt))) e.push(`${k}：reviewedAt 必須是 ISO 時間`);
  for (const [f, min, max] of [['visible', 10, 160], ['change', 6, 160], ['assessment', 10, 220], ['limitations', 10, 160]]) if (!str(r?.[f], max, min)) e.push(`${k}：${f} 需 ${min}～${max} 字`);
  if (!CONF.includes(r?.confidence)) e.push(`${k}：confidence 必須是 低／中／高`);
  const zh = ['visible', 'change', 'assessment', 'limitations'].map(f => r?.[f] || '').join('');
  if (SIMPLIFIED.test(zh)) e.push(`${k}：含簡體字`);
  return e;
}
function checkFile(d) {
  if (!Array.isArray(d?.reviews)) return ['reviews 必須是陣列'];
  const errors = d.reviews.flatMap(checkReview), keys = new Set();
  for (const r of d.reviews) { const key = `${r.region}|${r.beforeProductId}|${r.afterProductId}`; if (keys.has(key)) errors.push(`重複：${key}`); keys.add(key); }
  if (d.reviews.length > 300) errors.push('超過 300 筆，請移除最舊的');
  return errors;
}
const reviewFor = (pair, reviews) => reviews.filter(r => !checkReview(r).length && r.region === pair.region && r.beforeProductId === pair.before.productId && r.afterProductId === pair.after.productId)
  .sort((a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt))[0] || null;

// 準備網站用資料：回傳 { theater: [panel] }
async function prepare(out, { reviewsFile = REVIEWS } = {}) {
  const C = require('../src/satellite_compare');
  const feed = require('../src/satellite_assets').getSatelliteFeed();
  const { pairs } = await C.comparisonPairs({ feed });
  const reviews = readJson(reviewsFile, { reviews: [] }).reviews || [];
  const dir = path.join(out, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  const copy = (imageUrl, name) => {
    const src = path.join(PUBLIC, imageUrl || '');
    if (!/^\/images\/sentinel\/[a-zA-Z0-9_.-]+\.(jpg|png|webp)$/.test(imageUrl || '') || !fs.existsSync(src)) return null;
    const file = `${name}${path.extname(src)}`;
    fs.copyFileSync(src, path.join(dir, file));
    return `assets/${file}`;
  };
  const byTheater = {};
  for (const p of pairs) {
    const meta = REGIONS[p.region];
    if (!meta) continue;
    const panel = { region: p.region, ...meta, available: p.available, reason: p.reason || null };
    if (p.available) {
      panel.before = { ...p.before, img: copy(p.before.imageUrl, `imint_${p.region}_before`) };
      panel.after = { ...p.after, img: copy(p.after.imageUrl, `imint_${p.region}_after`) };
      panel.gapDays = p.gapDays;
      try {
        const assets = feed.assets;
        const [b, a] = [assets.find(x => x.sha256 === p.before.sha256), assets.find(x => x.sha256 === p.after.sha256)];
        const d = await C.diffPng(b, a);
        fs.copyFileSync(d.file, path.join(dir, `imint_${p.region}_diff.png`));
        panel.diff = { img: `assets/imint_${p.region}_diff.png`, ...(C.diffMeta(b, a) || {}) };
      } catch (e) { panel.diffError = e.message; }
      panel.review = reviewFor(p, reviews);
      if (!panel.before.img || !panel.after.img) { panel.available = false; panel.reason = '本機影像檔不存在'; }
    } else {
      const latest = feed.assets.filter(a => a.region === p.region && a.verified).sort((x, y) => Date.parse(y.acquiredAt) - Date.parse(x.acquiredAt))[0];
      if (latest) panel.latest = { productId: latest.productId, acquiredAt: latest.acquiredAt, cloudCoverPercent: latest.cloudCoverPercent, img: copy(latest.imageUrl, `imint_${p.region}_latest`) };
    }
    (byTheater[meta.theater] ||= []).push(panel);
  }
  return byTheater;
}

const d10 = s => (s || '').slice(5, 10).replace('-', '/');
function panelHtml(p, { esc }) {
  const head = `<div class="im-head"><b>${esc(p.name)}</b><span>觀察重點：${esc(p.focus)}</span></div>`;
  if (!p.available) {
    return `<div class="im">${head}${p.latest?.img ? `<div class="im-one"><img loading="lazy" src="${p.latest.img}" alt="${esc(p.name)} 最新影像"><span class="im-tag">最新 ${d10(p.latest.acquiredAt)}</span></div>` : ''}
      <p class="im-na">⚠ 目前無法比對：${esc(p.reason || '影像不足')}</p></div>`;
  }
  const id = `imd-${p.region}`, r = p.review;
  const share = Number.isFinite(p.diff?.changedShare) ? `｜亮度明顯變化 ${(p.diff.changedShare * 100).toFixed(1)}% 像素` : '';
  return `<div class="im">${head}
    <div class="im-pair"><figure><img loading="lazy" src="${p.before.img}" alt="${esc(p.name)} 前期"><figcaption>前期 ${d10(p.before.acquiredAt)}</figcaption></figure>
    <figure class="im-after">${p.diff?.img ? `<input type="checkbox" id="${id}" class="im-tg"><label for="${id}" class="im-btn">顯示差異</label>` : ''}<img loading="lazy" src="${p.after.img}" alt="${esc(p.name)} 本期">${p.diff?.img ? `<img class="im-diff" loading="lazy" src="${p.diff.img}" alt="差異標示">` : ''}<figcaption>本期 ${d10(p.after.acquiredAt)}</figcaption></figure></div>
    <p class="im-meta">Sentinel-2｜相隔 ${p.gapDays} 天｜裁切區可見 ${Math.round(p.before.crop.clear * 100)}% → ${Math.round(p.after.crop.clear * 100)}%${share}</p>
    ${r ? `<dl class="im-ar"><dt>可見</dt><dd>${esc(r.visible)}</dd><dt>變化</dt><dd>${esc(r.change)}</dd><dt>研判</dt><dd>${esc(r.assessment)}</dd><dt>限制</dt><dd>${esc(r.limitations)}</dd><dt>信心</dt><dd><span class="im-cf cf-${CONF.indexOf(r.confidence)}">${esc(r.confidence)}</span></dd></dl>`
      : `<p class="im-pending">◌ 這組前後期影像尚待判讀（每天由排程比對後更新）。紅色＝變亮、青色＝變暗，只是亮度變化線索，可能來自雲影、季節或水面反光。</p>`}</div>`;
}

const CSS = `.im{margin:0 0 14px}.im-head b{display:block;font-size:.95em}.im-head span{font-size:.76em;color:var(--dim)}
.im-pair{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.im-pair figure,.im-one{margin:0;position:relative;border-radius:6px;overflow:hidden;background:#000;border:1px solid var(--ln,#1f3a5a)}
.im-pair img,.im-one img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover}.im-pair figcaption,.im-tag{position:absolute;left:0;bottom:0;right:0;padding:2px 6px;font:600 .7em ui-monospace,Consolas,monospace;color:#e6f1ff;background:linear-gradient(transparent,rgba(0,0,0,.85))}
.im-diff{position:absolute;inset:0;opacity:0;transition:opacity .2s;pointer-events:none}.im-tg{position:absolute;opacity:0}.im-tg:checked~.im-diff{opacity:.9}
.im-btn{position:absolute;top:4px;right:4px;z-index:2;font-size:.68em;padding:1px 7px;border-radius:999px;background:rgba(2,6,23,.75);border:1px solid var(--cy,#22d3ee);color:var(--cy,#22d3ee);cursor:pointer}.im-tg:checked+.im-btn{background:var(--cy,#22d3ee);color:#020617}
.im-meta{margin:6px 0;font:.7em ui-monospace,Consolas,monospace;color:var(--dim)}.im-ar{display:grid;grid-template-columns:40px 1fr;gap:3px 8px;margin:0;font-size:.82em}.im-ar dt{color:var(--cy,#22d3ee)}.im-ar dd{margin:0}
.im-cf{padding:0 8px;border-radius:999px;font-size:.9em}.cf-0{background:#475569}.cf-1{background:#a16207}.cf-2{background:#15803d}.im-pending,.im-na{font-size:.8em;color:var(--dim);margin:6px 0 0}`;

module.exports = { REGIONS, REVIEWS, checkReview, checkFile, reviewFor, prepare, panelHtml, CSS };

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'pairs') {
    // 給排程用：列出目前各區的前後期組合與本機檔案路徑，以及是否已有判讀
    (async () => {
      const C = require('../src/satellite_compare');
      const feed = require('../src/satellite_assets').getSatelliteFeed();
      const { pairs } = await C.comparisonPairs({ feed });
      const reviews = readJson(REVIEWS, { reviews: [] }).reviews || [];
      for (const p of pairs) {
        const m = REGIONS[p.region]; if (!m) continue;
        if (!p.available) { console.log(`\n[${p.region}] ${m.name}：無法比對（${p.reason}）`); continue; }
        let diff = '';
        try { const fa = feed.assets.find(x => x.sha256 === p.before.sha256), fb = feed.assets.find(x => x.sha256 === p.after.sha256); diff = (await C.diffPng(fa, fb)).file; } catch (e) { diff = `（差異圖無法產生：${e.message}）`; }
        console.log(`\n[${p.region}] ${m.name}｜觀察重點：${m.focus}｜${reviewFor(p, reviews) ? '已判讀' : '待判讀'}`);
        console.log(`  前期 ${p.before.productId}  ${p.before.acquiredAt}  可見 ${p.before.crop.clear}  檔案 public${p.before.imageUrl}`);
        console.log(`  本期 ${p.after.productId}  ${p.after.acquiredAt}  可見 ${p.after.crop.clear}  檔案 public${p.after.imageUrl}`);
        console.log(`  差異圖 ${diff}`);
      }
    })().catch(e => { console.error(e.message); process.exit(1); });
  } else {
    const f = process.argv[3] || REVIEWS;
    let d; try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error(`JSON 讀取失敗：${e.message}`); process.exit(1); }
    const errors = checkFile(d);
    if (errors.length) { console.error(`不合格 ${errors.length} 項：\n- ${errors.join('\n- ')}`); process.exit(1); }
    console.log(`合格：${f} 共 ${d.reviews.length} 筆`);
  }
}
