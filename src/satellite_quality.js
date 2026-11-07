/**
 * WordWar_News - Satellite Cloud Quality Assessor (src/satellite_quality.js)
 * 
 * Feature: 衛星雲遮與可判讀品質標示（新功能 #4）
 * 
 * 依整片雲量百分比給可判讀等級（只是初篩：整片雲量低不代表目標區看得清楚）。
 */

'use strict';

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

module.exports = { assessCloudGrade, CLOUD_THRESHOLDS };
