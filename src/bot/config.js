'use strict';
// 環境設定：.env 由此載入，其他模組只讀這裡的值
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
module.exports = {
  CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
  COMMANDER_USER_ID: process.env.COMMANDER_USER_ID || '',
  BOT_TOKEN: process.env.DISCORD_BOT_TOKEN
};
