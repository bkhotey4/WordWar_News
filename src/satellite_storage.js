'use strict';
// 衛星影像存放管理：
// 1. 舊的 PNG 裁切圖轉成 WebP（品質 90），並更新資料庫的檔名與雜湊。
// 2. 超過保存天數的影像刪除檔案與資料庫紀錄，每區至少保留最新幾張。
// 研究稿（含草稿）以 sha256 引用的影像一律不轉檔、不刪除，否則稿件的證據連結會失效。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUBLIC = path.join(__dirname, '../public');
const RESEARCH = path.join(__dirname, '../research');
const RETENTION_DAYS = 30;
const KEEP_PER_REGION = 3;
const DAY = 86400_000;
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

// 研究稿與草稿（含已發布、待審）中 imagery 引用的影像雜湊
function referencedHashes(researchDir = RESEARCH) {
  const hashes = new Set();
  const collect = doc => { for (const ref of doc?.imagery || []) if (typeof ref?.sha256 === 'string') hashes.add(ref.sha256); };
  for (const report of readJson(path.join(researchDir, 'reports.json'), { reports: [] }).reports || []) collect(report);
  const walk = dir => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full); else if (e.name.endsWith('.json')) collect(readJson(full, null));
    }
  };
  walk(path.join(researchDir, 'drafts'));
  return hashes;
}

// publicDir 可替換（測試用暫存資料夾），預設為網站 public 目錄
function localPath(rel, publicDir = PUBLIC) {
  if (typeof rel !== 'string' || !rel) return null;
  const full = path.resolve(publicDir, rel);
  return full.startsWith(path.join(publicDir, 'images/sentinel') + path.sep) ? full : null;
}
function removeFile(full) { try { const size = fs.statSync(full).size; fs.unlinkSync(full); return size; } catch { return 0; } }

async function optimizeSatelliteImages({ store = require('./intel_store').getStore(), dryRun = false, quality = require('./satellite_crop').WEBP_QUALITY, referenced = referencedHashes(), publicDir = PUBLIC } = {}) {
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const result = { converted: 0, keptReferenced: 0, skipped: 0, bytesBefore: 0, bytesAfter: 0, errors: [] };
  for (const asset of store.imagery()) {
    const full = localPath(asset.file, publicDir);
    if (asset.kind !== 'SOURCE_AOI_CROP' || !full || !full.endsWith('.png') || !fs.existsSync(full)) { result.skipped++; continue; }
    if (referenced.has(asset.sha256)) { result.keptReferenced++; continue; }
    try {
      const png = fs.readFileSync(full);
      if (sha256(png) !== asset.sha256) throw new Error('檔案雜湊與資料庫不符，未轉檔');
      const img = await loadImage(png);
      const canvas = createCanvas(img.width, img.height);
      canvas.getContext('2d').drawImage(img, 0, 0);
      const webp = await canvas.encode('webp', quality);
      result.bytesBefore += png.length; result.bytesAfter += webp.length;
      if (dryRun) { result.converted++; continue; }
      const file = asset.file.replace(/\.png$/, '.webp');
      const out = path.join(publicDir, file), tmp = `${out}.${crypto.randomUUID()}.tmp`;
      fs.writeFileSync(tmp, webp); fs.renameSync(tmp, out);
      store.putImagery({ ...asset, file, imageUrl: `/${file}`, sha256: sha256(webp), convertedFrom: { format: 'png', sha256: asset.sha256, at: new Date().toISOString() },
        processing: `${String(asset.processing || '').replace(/。$/, '')}；${new Date().toISOString().slice(0, 10)} 由原 PNG 轉存為 WebP（品質 ${quality}）。` });
      fs.unlinkSync(full);
      result.converted++;
    } catch (e) { result.errors.push(`${asset.productId}: ${e.message}`); }
  }
  return result;
}

function cleanupSatelliteImages({ store = require('./intel_store').getStore(), now = Date.now(), retentionDays = RETENTION_DAYS, keepPerRegion = KEEP_PER_REGION, dryRun = false, referenced = referencedHashes(), publicDir = PUBLIC } = {}) {
  const directory = path.join(publicDir, 'images/sentinel');
  const result = { removedRecords: 0, removedFiles: 0, removedOrphans: 0, bytesFreed: 0, keptReferenced: 0 };
  const assets = store.imagery(); // 依拍攝時間由新到舊
  const seen = {};
  for (const asset of assets) {
    const rank = seen[asset.region] = (seen[asset.region] || 0) + 1;
    const old = now - Date.parse(asset.acquiredAt) > retentionDays * DAY;
    if (!old || rank <= keepPerRegion) continue;
    if (referenced.has(asset.sha256)) { result.keptReferenced++; continue; }
    result.removedRecords++;
    for (const rel of new Set([asset.file, asset.previewFile])) {
      const full = localPath(rel, publicDir);
      // 預覽縮圖可能被同產品的其他區域共用，仍被引用時保留
      if (!full || assets.some(a => a !== asset && (a.file === rel || a.previewFile === rel) && !(now - Date.parse(a.acquiredAt) > retentionDays * DAY))) continue;
      if (!fs.existsSync(full)) continue;
      result.removedFiles++;
      result.bytesFreed += dryRun ? fs.statSync(full).size : removeFile(full);
    }
    if (!dryRun) store.deleteImagery(asset.region, asset.productId);
  }
  // 資料庫已沒有紀錄、超過 1 天的殘留檔（例如中斷的暫存檔）
  const known = new Set(store.imagery().flatMap(a => [localPath(a.file, publicDir), localPath(a.previewFile, publicDir)]).filter(Boolean));
  let files = [];
  try { files = fs.readdirSync(directory); } catch {}
  for (const name of files) {
    const full = path.join(directory, name);
    if (known.has(full)) continue;
    let stat; try { stat = fs.statSync(full); } catch { continue; }
    if (!stat.isFile() || now - stat.mtimeMs < DAY) continue;
    result.removedOrphans++;
    result.bytesFreed += dryRun ? stat.size : removeFile(full);
  }
  return result;
}

module.exports = { referencedHashes, optimizeSatelliteImages, cleanupSatelliteImages, RETENTION_DAYS, KEEP_PER_REGION };
