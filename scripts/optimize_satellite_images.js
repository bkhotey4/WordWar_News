// 衛星影像轉 WebP 並清除過期影像：npm run satellite:optimize [-- --dry-run]
// --dry-run 只計算會轉檔／刪除多少，不改任何檔案或資料庫。
// 研究稿或草稿引用的影像不轉檔、不刪除。
const { optimizeSatelliteImages, cleanupSatelliteImages, RETENTION_DAYS, KEEP_PER_REGION } = require('../src/satellite_storage');
const dryRun = process.argv.includes('--dry-run');
const mb = n => `${(n / 1048576).toFixed(1)} MB`;
(async () => {
  const opt = await optimizeSatelliteImages({ dryRun });
  console.log(`${dryRun ? '（試算）' : ''}轉 WebP：${opt.converted} 張，${mb(opt.bytesBefore)} → ${mb(opt.bytesAfter)}；稿件引用而保留 PNG：${opt.keptReferenced} 張`);
  for (const e of opt.errors) console.log(`  轉檔失敗：${e}`);
  const clean = cleanupSatelliteImages({ dryRun });
  console.log(`${dryRun ? '（試算）' : ''}清除超過 ${RETENTION_DAYS} 天（每區保留最新 ${KEEP_PER_REGION} 張）：${clean.removedRecords} 筆紀錄、${clean.removedFiles} 個檔案；殘留檔 ${clean.removedOrphans} 個；釋放 ${mb(clean.bytesFreed)}；稿件引用而保留 ${clean.keptReferenced} 筆`);
  if (opt.errors.length) process.exitCode = 1;
})().catch(e => { console.error(e.message); process.exit(1); });
