/**
 * WordWar_News - Satellite Cloud Quality Assessor (src/satellite_quality.js)
 * 
 * Feature: 衛星雲遮與可判讀品質標示（新功能 #4）
 * 
 * For each satellite image in the imagery catalog, evaluates:
 *   1. Cloud coverage percentage (from STAC metadata or manual annotation)
 *   2. Readability grade (CLEAR / PARTIALLY_OBSCURED / CLOUDY / UNUSABLE)
 *   3. Optimal acquisition season / viewing geometry
 *   4. Applies quality badge to all satellite Discord payloads
 * 
 * This module reads imagery_catalog.json and enriches entries with quality metadata.
 * Researchers can also manually annotate cloud coverage in the catalog.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CATALOG_FILE = path.join(__dirname, '../public/data/imagery_catalog.json');
const CLOUD_ANNOTATIONS_FILE = path.join(__dirname, '../research/satellite_cloud_annotations.json');

/**
 * Cloud coverage thresholds
 */
const CLOUD_THRESHOLDS = {
  CLEAR: 10,              // ≤ 10% cloud cover
  PARTIALLY_OBSCURED: 30, // > 10% and ≤ 30%
  CLOUDY: 60,             // > 30% and ≤ 60%
  UNUSABLE: 100           // > 60%
};

/**
 * Derives readability grade from cloud coverage percentage
 * @param {number|null} cloudPercent - 0-100 or null if unknown
 * @returns {{ grade: string, badge: string, readable: boolean }}
 */
function assessCloudGrade(cloudPercent) {
  if (cloudPercent === null || cloudPercent === undefined || !Number.isFinite(cloudPercent)) {
    return {
      grade: 'UNKNOWN',
      badge: '❓ 雲遮未標注',
      readable: null,
      cloudPercent: null
    };
  }
  
  if(cloudPercent<0||cloudPercent>100)return {grade:'UNKNOWN',badge:'雲量數值無效',readable:null,cloudPercent:null};
  const pct = Math.round(cloudPercent*10)/10;
  
  if (pct <= CLOUD_THRESHOLDS.CLEAR) {
    return { grade: 'CLEAR', badge: `整片產品雲量低 (${pct}%)；裁切區可見度未確認`, readable: null, cloudPercent: pct };
  }
  if (pct <= CLOUD_THRESHOLDS.PARTIALLY_OBSCURED) {
    return { grade: 'PARTIALLY_OBSCURED', badge: `整片產品部分雲遮 (${pct}%)；裁切區可見度未確認`, readable: null, cloudPercent: pct };
  }
  if (pct <= CLOUD_THRESHOLDS.CLOUDY) {
    return { grade: 'CLOUDY', badge: `整片產品顯著雲遮 (${pct}%)；裁切區可見度未確認`, readable: null, cloudPercent: pct };
  }
  return { grade: 'UNUSABLE', badge: `整片產品高雲量 (${pct}%)；裁切區可見度未確認`, readable: null, cloudPercent: pct };
}

/**
 * Loads manual cloud coverage annotations from researchers
 */
function loadCloudAnnotations() {
  try {
    if (fs.existsSync(CLOUD_ANNOTATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(CLOUD_ANNOTATIONS_FILE, 'utf8'));
    }
  } catch (_) {}
  return { annotations: [] };
}

/**
 * Manually annotates cloud coverage for an image (researcher-use only)
 * @param {string} imageProductId - The STAC/catalog product ID
 * @param {number} cloudPercent   - 0-100
 * @param {string} researcherNote - Optional note
 */
function annotateCloudCoverage(imageProductId, cloudPercent, researcherNote = '') {
  if (!Number.isFinite(cloudPercent) || cloudPercent < 0 || cloudPercent > 100) {
    throw new Error('cloudPercent must be 0-100');
  }
  
  const data = loadCloudAnnotations();
  const existing = data.annotations.find(a => a.imageProductId === imageProductId);
  
  if (existing) {
    existing.cloudPercent = cloudPercent;
    existing.researcherNote = researcherNote;
    existing.updatedAt = new Date().toISOString();
  } else {
    data.annotations.push({
      imageProductId,
      cloudPercent,
      researcherNote,
      annotatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  
  // Keep last 500 annotations
  data.annotations = data.annotations.slice(-500);
  
  fs.mkdirSync(path.dirname(CLOUD_ANNOTATIONS_FILE), { recursive: true });
  fs.writeFileSync(CLOUD_ANNOTATIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Gets the cloud coverage for an image, preferring:
 *   1. Manual researcher annotation (most reliable)
 *   2. STAC metadata cloudCoverPercent field
 *   3. null (unknown)
 */
function getCloudCoverage(imageEntry) {
  // 1. Check manual annotation
  const annotations = loadCloudAnnotations();
  const annotation = annotations.annotations.find(
    a => a.imageProductId === (imageEntry.imageSourceProductId || imageEntry.id)
  );
  if (annotation) {
    return {
      source: 'MANUAL_ANNOTATION',
      cloudPercent: annotation.cloudPercent,
      note: annotation.researcherNote
    };
  }
  
  // 2. Check STAC metadata
  if (Number.isFinite(imageEntry.cloudCoverPercent)) {
    return {
      source: 'STAC_METADATA',
      cloudPercent: imageEntry.cloudCoverPercent,
      note: null
    };
  }
  
  // 3. Check properties field (some STAC records nest it here)
  if (Number.isFinite(imageEntry.properties?.['eo:cloud_cover'])) {
    return {
      source: 'STAC_PROPERTIES',
      cloudPercent: imageEntry.properties['eo:cloud_cover'],
      note: null
    };
  }
  
  return { source: 'UNKNOWN', cloudPercent: null, note: null };
}

/**
 * Enriches imagery catalog entries with cloud quality assessments
 * @returns {Array} enriched image entries with .cloudQuality field
 */
function getEnrichedImageCatalog() {
  let catalog = { images: [] };
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
    }
  } catch (_) {}
  
  return (catalog.images || []).map(img => {
    const coverage = getCloudCoverage(img);
    const grade = assessCloudGrade(coverage.cloudPercent);
    return {
      ...img,
      cloudQuality: {
        ...grade,
        source: coverage.source,
        researcherNote: coverage.note
      }
    };
  });
}

/**
 * Formats cloud quality summary for Discord output
 * @param {object} imageEntry - enriched image entry with cloudQuality field
 * @returns {string} formatted quality line
 */
function formatCloudQualityLine(imageEntry) {
  const q = imageEntry.cloudQuality;
  if (!q) return '❓ 影像品質未評估';
  
  let line = q.badge;
  if (q.source === 'MANUAL_ANNOTATION') line += ' *(人工標注)*';
  else if (q.source === 'STAC_METADATA') line += ' *(衛星元數據)*';
  if (q.researcherNote) line += `\n   > ${q.researcherNote}`;
  return line;
}

/**
 * Generates a summary of catalog imagery quality stats
 */
function getQualitySummary() {
  const images = getEnrichedImageCatalog();
  const grades = { CLEAR: 0, PARTIALLY_OBSCURED: 0, CLOUDY: 0, UNUSABLE: 0, UNKNOWN: 0 };
  for (const img of images) {
    const g = img.cloudQuality?.grade || 'UNKNOWN';
    grades[g] = (grades[g] || 0) + 1;
  }
  
  const readableCount = images.filter(i=>i.cloudQuality?.readable===true).length;
  return {
    total: images.length,
    readable: readableCount,
    unreadable: images.filter(i=>i.cloudQuality?.readable===false).length,
    unknown: images.filter(i=>i.cloudQuality?.readable===null).length,
    grades,
    readablePercent: null
  };
}

module.exports = {
  assessCloudGrade,
  annotateCloudCoverage,
  getCloudCoverage,
  getEnrichedImageCatalog,
  formatCloudQualityLine,
  getQualitySummary,
  CLOUD_THRESHOLDS
};
