'use strict';
// 衛星前後期對照：同一區域、同一裁切範圍與像素尺寸的兩張 Sentinel-2 裁切圖，
// 先實測裁切區內的雲／無資料比例（整片產品雲量不能代表裁切區），再產生像素差異圖。
// 差異圖未做輻射校正與精確對位；亮度變化可能來自雲影、季節、太陽角度或水面反光，只是「待查」線索，不判為戰損或軍事活動。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUBLIC = path.join(__dirname, '../public');
const STATS_FILE = path.join(__dirname, '../research/satellite_crop_stats.json');
const DIFF_DIR = path.join(__dirname, '../research/compare_cache');
const MIN_CLEAR = 0.6;   // 裁切區至少 60% 像素非雲、非無資料
const MIN_GAP_DAYS = 2;
const MIN_PIXELS = 50_000; // 太小的裁切（例如緬甸區域）差異統計沒有意義
const DIFF_SIGMA = 2.5;  // 標準化後亮度差超過 2.5σ 才標示
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };

function localFile(asset) {
  if (!/^\/images\/sentinel\/[a-zA-Z0-9_.-]+\.(jpg|png|webp)$/.test(asset.imageUrl || '')) return null;
  const file = path.join(PUBLIC, asset.imageUrl);
  return file.startsWith(PUBLIC + path.sep) && fs.existsSync(file) ? file : null;
}
// 用 @napi-rs/canvas 解碼（sharp 需要 Node 20 以上，本機 Node 18 無法載入）
async function rawRgb(file) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const img = await loadImage(fs.readFileSync(file));
  const canvas = createCanvas(img.width, img.height), ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, img.width, img.height).data, n = img.width * img.height, data = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) { data[i * 3] = rgba[i * 4]; data[i * 3 + 1] = rgba[i * 4 + 1]; data[i * 3 + 2] = rgba[i * 4 + 2]; }
  return { data, width: img.width, height: img.height };
}
// 逐像素分類：無資料（近黑）、雲（亮且低飽和）、可見
function pixelClass(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max < 8) return 0;
  if (min > 165 && max - min < 35) return 1;
  return 2;
}
function classify(img) {
  const n = img.width * img.height, cls = new Uint8Array(n);
  let nodata = 0, cloud = 0;
  for (let i = 0; i < n; i++) { const c = pixelClass(img.data[i * 3], img.data[i * 3 + 1], img.data[i * 3 + 2]); cls[i] = c; if (c === 0) nodata++; else if (c === 1) cloud++; }
  return { cls, nodata: nodata / n, cloud: cloud / n, clear: (n - nodata - cloud) / n };
}

async function cropStats(asset, cache) {
  if (cache[asset.sha256]) return cache[asset.sha256];
  const file = localFile(asset);
  if (!file) return null;
  const img = await rawRgb(file);
  const c = classify(img);
  const stats = { width: img.width, height: img.height, clear: +c.clear.toFixed(3), cloud: +c.cloud.toFixed(3), nodata: +c.nodata.toFixed(3), measuredAt: new Date().toISOString(), method: 'pixel-rgb-v1' };
  cache[asset.sha256] = stats;
  return stats;
}

const sameFrame = (a, b) => a.cropBbox && b.cropBbox && a.cropBbox.every((v, i) => Math.abs(v - b.cropBbox[i]) < 1e-6) && a.tile === b.tile
  && JSON.stringify(a.outputSize) === JSON.stringify(b.outputSize);

// 每個區域：最新一張可見度足夠的影像（後期），與更早、同框、可見度足夠且相隔至少 2 天的一張（前期）
async function comparisonPairs({ feed = require('./satellite_assets').getSatelliteFeed(), statsFile = STATS_FILE } = {}) {
  const cache = readJson(statsFile, {});
  const before = Object.keys(cache).length;
  const byRegion = {};
  for (const a of feed.assets || []) if (a.verified && a.kind === 'SOURCE_AOI_CROP') (byRegion[a.region] = byRegion[a.region] || []).push(a);
  const out = [];
  for (const [region, list] of Object.entries(byRegion)) {
    list.sort((x, y) => Date.parse(y.acquiredAt) - Date.parse(x.acquiredAt));
    const rated = [];
    for (const a of list) { try { const s = await cropStats(a, cache); if (s) rated.push({ asset: a, stats: s }); } catch (e) { console.warn('[SAT COMPARE]', a.productId, e.message); } }
    const usable = rated.filter(r => r.stats.clear >= MIN_CLEAR && r.stats.width * r.stats.height * r.stats.clear >= MIN_PIXELS);
    const after = usable[0];
    const prior = after && usable.find(r => r !== after && sameFrame(r.asset, after.asset) && Date.parse(after.asset.acquiredAt) - Date.parse(r.asset.acquiredAt) >= MIN_GAP_DAYS * 86400_000);
    const summary = rated.map(r => ({ productId: r.asset.productId, acquiredAt: r.asset.acquiredAt, clear: r.stats.clear, usable: r.stats.clear >= MIN_CLEAR }));
    if (!after || !prior) {
      out.push({ region, available: false, reason: !rated.length ? '本機影像無法讀取' : !after ? `沒有裁切區可見比例 ≥ ${MIN_CLEAR * 100}% 且尺寸足夠的影像（多為雲遮或裁切太小）` : '找不到更早、同一裁切範圍且可見度足夠的影像', images: summary });
      continue;
    }
    const pick = r => ({ productId: r.asset.productId, acquiredAt: r.asset.acquiredAt, imageUrl: r.asset.imageUrl, sha256: r.asset.sha256, sourceProductUrl: r.asset.sourceProductUrl, cloudCoverPercent: r.asset.cloudCoverPercent, crop: r.stats });
    out.push({ region, available: true, before: pick(prior), after: pick(after), cropBbox: after.asset.cropBbox, gapDays: Math.round((Date.parse(after.asset.acquiredAt) - Date.parse(prior.asset.acquiredAt)) / 86400_000),
      diffUrl: `/api/satellite-compare/diff/${prior.asset.sha256}/${after.asset.sha256}.png`, images: summary });
  }
  if (Object.keys(cache).length !== before) {
    fs.mkdirSync(path.dirname(statsFile), { recursive: true });
    const tmp = `${statsFile}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(cache, null, 1)); fs.renameSync(tmp, statsFile);
  }
  return { generatedAt: new Date().toISOString(), minClear: MIN_CLEAR, pairs: out.sort((a, b) => a.region.localeCompare(b.region)),
    note: '裁切區可見比例由像素亮度實測（雲與無資料排除）。差異圖未做輻射校正與精確對位；標示處只是亮度變化較大，可能是雲影、季節、農作或水面反光，不代表戰損、部隊或設施變化，需人工判讀。' };
}

// 透明 PNG：差異大的像素塗紅（變亮）或青（變暗），兩期任一為雲或無資料的像素不比較
async function diffPng(beforeAsset, afterAsset) {
  const key = crypto.createHash('sha256').update(`${beforeAsset.sha256}:${afterAsset.sha256}:${DIFF_SIGMA}:v1`).digest('hex').slice(0, 32);
  const out = path.join(DIFF_DIR, `${key}.png`);
  if (fs.existsSync(out)) return { file: out, cached: true };
  const [fa, fb] = [localFile(beforeAsset), localFile(afterAsset)];
  if (!fa || !fb) throw new Error('本機影像不存在');
  const [a, b] = await Promise.all([rawRgb(fa), rawRgb(fb)]);
  if (a.width !== b.width || a.height !== b.height) throw new Error('兩期影像尺寸不同，無法逐像素比較');
  const ca = classify(a).cls, cb = classify(b).cls, n = a.width * a.height;
  const lum = (img, i) => 0.299 * img.data[i * 3] + 0.587 * img.data[i * 3 + 1] + 0.114 * img.data[i * 3 + 2];
  // 各自以「兩期都可見」的像素做平均／標準差標準化，抵銷整體亮度差
  const norm = img => { let s = 0, s2 = 0, k = 0; for (let i = 0; i < n; i++) if (ca[i] === 2 && cb[i] === 2) { const v = lum(img, i); s += v; s2 += v * v; k++; } const m = s / k; return { m, sd: Math.sqrt(Math.max(s2 / k - m * m, 1)), k }; };
  const na = norm(a), nb = norm(b);
  if (na.k < n * 0.3) throw new Error('兩期共同可見像素不足 30%');
  if (na.k < MIN_PIXELS) throw new Error('裁切圖太小，可比較像素不足');
  const rgba = Buffer.alloc(n * 4);
  let changed = 0;
  for (let i = 0; i < n; i++) {
    if (ca[i] !== 2 || cb[i] !== 2) continue;
    const d = (lum(b, i) - nb.m) / nb.sd - (lum(a, i) - na.m) / na.sd;
    if (Math.abs(d) < DIFF_SIGMA) continue;
    changed++;
    const o = i * 4;
    if (d > 0) { rgba[o] = 255; rgba[o + 1] = 60; rgba[o + 2] = 60; } else { rgba[o] = 40; rgba[o + 1] = 220; rgba[o + 2] = 255; }
    rgba[o + 3] = 200;
  }
  fs.mkdirSync(DIFF_DIR, { recursive: true });
  const { createCanvas } = require('@napi-rs/canvas');
  const canvas = createCanvas(a.width, a.height), ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(a.width, a.height);
  imageData.data.set(rgba);
  ctx.putImageData(imageData, 0, 0);
  fs.writeFileSync(out, await canvas.encode('png'));
  fs.writeFileSync(`${out}.json`, JSON.stringify({ before: beforeAsset.productId, after: afterAsset.productId, changedShare: +(changed / na.k).toFixed(4), comparedPixels: na.k, sigma: DIFF_SIGMA }));
  return { file: out, cached: false };
}
function diffMeta(beforeAsset, afterAsset) {
  const key = crypto.createHash('sha256').update(`${beforeAsset.sha256}:${afterAsset.sha256}:${DIFF_SIGMA}:v1`).digest('hex').slice(0, 32);
  return readJson(path.join(DIFF_DIR, `${key}.png.json`), null);
}

module.exports = { comparisonPairs, diffPng, diffMeta, classify, pixelClass, sameFrame, MIN_CLEAR };
