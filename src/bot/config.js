'use strict';
// 環境設定：.env 由此載入，其他模組只讀這裡的值
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
module.exports = {
  CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
  // 管理者 ID 一定要從 .env／雲端 Secrets 設定；不寫死，避免別人複製程式後把管理通知寄到這個帳號
  COMMANDER_USER_ID: process.env.COMMANDER_USER_ID || null,
  BOT_TOKEN: process.env.DISCORD_BOT_TOKEN
};
