'use strict';
// 跨模組共用、會被改寫的執行狀態
const path = require('path');
const { DeliveryLedger } = require('../delivery_ledger');
module.exports = {
  lastPatrolTime: new Date().toISOString(),       // 最近一次巡檢時間（/sentry 顯示）
  lastManualBroadcastTimestamp: 0,               // 手動全體廣播冷卻計時
  scheduledDeliveries: new DeliveryLedger(path.join(__dirname, '../../research/delivery_ledger.json'))
};
