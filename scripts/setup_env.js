// 換電腦或第一次安裝時執行：npm run setup
// 1. 沒有 .env 就從 .env.example 複製一份
// 2. ADMIN_API_KEY 缺少、是範本值或太短時，自動產生 64 字元隨機金鑰
// 3. 列出仍需手動填的項目（例如 DISCORD_BOT_TOKEN）
// 不會在畫面上印出任何金鑰或 token 的內容。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env');
const exampleFile = path.join(root, '.env.example');
const PLACEHOLDER = /your_|YOUR_|change_me|example/;

if (!fs.existsSync(envFile)) {
  fs.copyFileSync(exampleFile, envFile);
  console.log('已從 .env.example 建立 .env');
}
let text = fs.readFileSync(envFile, 'utf8');
const get = key => text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? null;
const set = (key, value) => {
  text = new RegExp(`^${key}=`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`) : `${text.replace(/\s*$/, '')}\n${key}=${value}\n`;
};

const admin = get('ADMIN_API_KEY');
if (!admin || admin.length < 24 || PLACEHOLDER.test(admin)) {
  set('ADMIN_API_KEY', crypto.randomBytes(32).toString('hex'));
  console.log('已產生新的 ADMIN_API_KEY（64 字元）。若有其他程式呼叫 /api/push-dm，要改用新金鑰。');
} else console.log('ADMIN_API_KEY 已存在且長度足夠，保留不變。');
if (!get('HOST')) { set('HOST', '127.0.0.1'); console.log('已設定 HOST=127.0.0.1（只接受本機連線）。'); }
fs.writeFileSync(envFile, text);

const todo = ['DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID', 'COMMANDER_USER_ID'].filter(k => { const v = get(k); return !v || PLACEHOLDER.test(v); });
console.log(todo.length ? `仍需手動填入 .env：${todo.join('、')}（Discord Developer Portal 取得 token；COMMANDER_USER_ID 是你的 Discord 使用者 ID）` : '必要設定都已填好。');
