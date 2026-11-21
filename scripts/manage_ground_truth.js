#!/usr/bin/env node
/**
 * WordWar_News - Ground Truth & Alert Review Management CLI
 * 
 * Implements Open Teacher Requirement:
 * "建立經人工覆核的事件歷史與誤報標記，再評估可用於公開民用風險提示的多來源預警。"
 * 
 * Usage:
 *   node scripts/manage_ground_truth.js list-alerts
 *   node scripts/manage_ground_truth.js label-alert --id <alertCodeOrTitle> --label <TRUE_POSITIVE|FALSE_POSITIVE> --eventId <eventId>
 *   node scripts/manage_ground_truth.js list-events
 *   node scripts/manage_ground_truth.js review-event --id <eventId> --outcome <CONFIRMED|DISPROVED|UNVERIFIED>
 *   node scripts/manage_ground_truth.js backtest
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { runBacktest, formatBacktestPayload } = require('../src/reviewed_backtest');

const ALERT_HISTORY_FILE = path.join(__dirname, '../src/alert_history.json');
const EVIDENCE_LEDGER_FILE = path.join(__dirname, '../research/evidence_ledger.json');

function loadAlertHistory() {
  try {
    return JSON.parse(fs.readFileSync(ALERT_HISTORY_FILE, 'utf8'));
  } catch (_) {
    return { history: [] };
  }
}

function saveAlertHistory(data) {
  const tmp = `${ALERT_HISTORY_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, ALERT_HISTORY_FILE);
}

function loadEvidenceLedger() {
  try {
    return JSON.parse(fs.readFileSync(EVIDENCE_LEDGER_FILE, 'utf8'));
  } catch (_) {
    return { events: [] };
  }
}

function saveEvidenceLedger(data) {
  const tmp = `${EVIDENCE_LEDGER_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, EVIDENCE_LEDGER_FILE);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const options = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      options[key] = val;
    }
  }
  return { command, options };
}

function main() {
  const { command, options } = parseArgs();

  switch (command) {
    case 'list-alerts': {
      const data = loadAlertHistory();
      const list = data.history || [];
      console.log(`\n📋 【歷史警報清單】(共 ${list.length} 則)`);
      console.log('='.repeat(70));
      list.slice(-20).forEach((a, i) => {
        const rev = a.evaluationReviewed ? `[已覆核: ${a.evaluationLabel}]` : '[待覆核]';
        console.log(`[${i + 1}] ${rev} 代碼: ${a.code || 'UNKNOWN'} ｜ 時間: ${a.timestamp || a.observedAt}`);
        console.log(`    標題: ${a.title}`);
        if (a.matchedEventId) console.log(`    配對事件: ${a.matchedEventId}`);
      });
      break;
    }

    case 'label-alert': {
      if (!options.id || !options.label) {
        console.error('❌ 缺少參數: --id <標題或代碼關鍵字> --label <TRUE_POSITIVE|FALSE_POSITIVE> [--eventId <id>]');
        process.exit(1);
      }
      if (!['TRUE_POSITIVE', 'FALSE_POSITIVE'].includes(options.label)) {
        console.error('❌ --label 必須為 TRUE_POSITIVE 或 FALSE_POSITIVE');
        process.exit(1);
      }
      const data = loadAlertHistory();
      const alert = (data.history || []).find(a => 
        (a.code && a.code.includes(options.id)) || 
        (a.title && a.title.includes(options.id))
      );
      if (!alert) {
        console.error(`❌ 找不到包含 "${options.id}" 的警報`);
        process.exit(1);
      }
      alert.evaluationReviewed = true;
      alert.evaluationLabel = options.label;
      if (options.eventId) alert.matchedEventId = options.eventId;
      alert.reviewedAt = new Date().toISOString();
      saveAlertHistory(data);
      console.log(`✅ 已覆核標記警報 [${alert.code}] "${alert.title}" 為: ${options.label}`);
      break;
    }

    case 'list-events': {
      const data = loadEvidenceLedger();
      const events = data.events || [];
      console.log(`\n📋 【事件證據庫清單】(共 ${events.length} 件)`);
      console.log('='.repeat(70));
      events.slice(-20).forEach((e, i) => {
        const rev = e.reviewed ? `[已審查: ${e.outcome}]` : '[待審查]';
        console.log(`[${i + 1}] ${rev} 編號: ${e.eventId} ｜ 戰區: ${e.theater}`);
        console.log(`    標題: ${e.title} ｜ 來源數: ${(e.sources || []).length}`);
      });
      break;
    }

    case 'review-event': {
      if (!options.id || !options.outcome) {
        console.error('❌ 缺少參數: --id <eventId> --outcome <CONFIRMED|DISPROVED|UNVERIFIED>');
        process.exit(1);
      }
      if (!['CONFIRMED', 'DISPROVED', 'UNVERIFIED'].includes(options.outcome)) {
        console.error('❌ --outcome 必須為 CONFIRMED, DISPROVED, 或 UNVERIFIED');
        process.exit(1);
      }
      const data = loadEvidenceLedger();
      const event = (data.events || []).find(e => e.eventId === options.id);
      if (!event) {
        console.error(`❌ 找不到事件編號 "${options.id}"`);
        process.exit(1);
      }
      event.reviewed = true;
      event.outcome = options.outcome;
      event.reviewedAt = new Date().toISOString();
      saveEvidenceLedger(data);
      console.log(`✅ 已審查標記事件 [${event.eventId}] "${event.title}" 結果為: ${options.outcome}`);
      break;
    }

    case 'backtest': {
      const report = runBacktest({ windowDays: parseInt(options.days, 10) || 30 });
      console.log('\n📊 【預警回測分析結果】');
      console.log('='.repeat(70));
      console.log(`產生時間: ${report.generatedAt} ｜ 評估天數: ${report.windowDays} 天`);
      console.log(`已推播警報數: ${report.totalAlerts} ｜ 人工確認真實事件數: ${report.totalGroundTruthEvents}`);
      console.log('-'.repeat(70));
      for (const [code, r] of Object.entries(report.categoryResults || {})) {
        console.log(`[${code}]`);
        console.log(`  • 總警報: ${r.totalAlerts} ｜ 真陽(命中): ${r.truePositives} ｜ 誤報: ${r.falsePositives} ｜ 待覆核: ${r.unlabeledAlerts}`);
        console.log(`  • 精確率: ${r.precision || '無法計算'} ｜ 召回率: ${r.recall || '無法計算'}`);
        console.log(`  • 評估建議: ${r.recommendation} — ${r.rationale}`);
      }
      console.log('='.repeat(70));
      console.log(`備註: ${report.researcherNote}`);
      break;
    }

    case 'help':
    default:
      console.log(`
WordWar_News - 人工真實事件與預警標記管理工具
指令說明:
  node scripts/manage_ground_truth.js list-alerts
    列出歷史警報與覆核狀態
  node scripts/manage_ground_truth.js label-alert --id <代碼/標題> --label <TRUE_POSITIVE|FALSE_POSITIVE> [--eventId <id>]
    將特定警報人工標記為真陽性或誤報
  node scripts/manage_ground_truth.js list-events
    列出事件證據庫中已記錄之事件
  node scripts/manage_ground_truth.js review-event --id <eventId> --outcome <CONFIRMED|DISPROVED|UNVERIFIED>
    將特定事件審查標記為已確認真實或已證偽
  node scripts/manage_ground_truth.js backtest [--days 30]
    執行人工標記之嚴謹預警回測計算
`);
      break;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadAlertHistory,
  saveAlertHistory,
  loadEvidenceLedger,
  saveEvidenceLedger
};
