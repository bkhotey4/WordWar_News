// 只走 REST 的 Discord 用戶端：雲端（GitHub Actions）一次性巡檢用，不連 Gateway、不常駐，也不會收到斜線指令。
// 推播程式只用 client.users.fetch(id) 與 user.send(payload)，兩者都是 REST 呼叫，不需要登入 Gateway。
const { Client, ClientUser, Routes } = require('discord.js');

function restClient(token = process.env.DISCORD_BOT_TOKEN) {
  if (!token) throw new Error('缺少 DISCORD_BOT_TOKEN');
  const client = new Client({ intents: [] });
  client.token = token;
  client.rest.setToken(token);
  return client;
}

// 開私訊頻道時 discord.js 會比對 client.user.id（機器人自己），沒登入 Gateway 時它是 null，
// user.send() 會丟出「Cannot read properties of null (reading 'id')」；改用 REST 取得機器人帳號補上
async function attachBotUser(client) {
  client.user = new ClientUser(client, await client.rest.get(Routes.user()));
  return client;
}

module.exports = { restClient, attachBotUser };
