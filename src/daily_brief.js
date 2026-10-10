// 每日一句話摘要：網站最上方顯示，並在台北時間每天 08:00 後用 Discord 私訊推一次給訂閱者。
// 只用預警看板與市場快取的現有結果組句，不另外做判斷；等級不是開戰機率。
const fs = require('fs');
const path = require('path');

const STATE = path.join(__dirname, '../research/daily_brief_state.json');
const SITE = 'https://bkhotey4.github.io/wordwar-intel/';
const HOUR = 3600_000;
const SHORT = { taiwan_strait: '台海', iran_gulf: '美伊', europe_security: '歐洲北約', ukraine_front: '烏俄', korea_peninsula: '朝鮮半島', south_china_sea: '南海', middle_east: '以巴紅海' };
const WEEK = '日一二三四五六';

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
// 指標名稱很長，摘要只取第一個括號前的部分
const shortName = n => String(n || '').split(/[（(，]|超過/)[0].trim().slice(0, 24);

function briefText(board, { now = Date.now(), markets = null } = {}) {
  const d = new Date(now + 8 * HOUR);
  const head = `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEK[d.getUTCDay()]}）每日摘要`;
  const parts = (board?.theaters || []).map(t => {
    const name = SHORT[t.id] || t.name;
    if (!t.level) return `${name} 無法判定`;
    const why = t.triggered?.[0] ? `：${shortName(t.triggered[0].name)}` : '';
    return `${name} ${t.level} 級${t.levelName && !/戰事持續/.test(t.levelName) ? t.levelName : ''}${why}`;
  });
  const calm = (board?.theaters || []).flatMap(t => (t.deescalation || []).slice(0, 1).map(() => SHORT[t.id] || t.name));
  const fresh = markets?.lastSuccess && now - Date.parse(markets.lastSuccess) <= 36 * HOUR;
  const anomalies = fresh ? (markets.quotes || []).filter(q => q.status === 'ANOMALY' && !q.context && Number.isFinite(q.pct)) : [];
  const mkt = !fresh ? '市場資料暫缺' : anomalies.length ? `市場異常：${anomalies.slice(0, 3).map(q => `${q.name} ${q.pct >= 0 ? '+' : ''}${q.pct.toFixed(1)}%`).join('、')}` : '市場無異常波動';
  return `${head}｜${parts.join('｜')}。${calm.length ? `降溫訊號：${calm.join('、')}。` : ''}${mkt}。`;
}

function briefPayload(board, opts = {}) {
  const text = briefText(board, opts);
  return { content: `📌 ${text}\n（等級依公開資料與固定規則計算，不是開戰機率）\n完整看板：${SITE}` };
}

// 每天台北 08:00 後送一次；遵守訂閱者的靜默與戰區設定（ROUTINE 等級）
async function dispatchDailyBrief(client, subscribers, { now = Date.now(), file = STATE, board = null, markets = null, shouldDeliver = () => ({ deliver: true }), markDelivered = () => {} } = {}) {
  const d = new Date(now + 8 * HOUR);
  if (d.getUTCHours() < 8) return [];
  const key = d.toISOString().slice(0, 10), state = readJson(file, {});
  const same = state.date === key, sent = new Set(same ? state.sentTo : []), attempts = same ? (state.attempts || {}) : {};
  const eventId = `DAILY_BRIEF_${key}`;
  const todo = subscribers.filter(s => !sent.has(s.userId) && (attempts[s.userId] || 0) < 5 && shouldDeliver(s.userId, { level: 'ROUTINE', eventId, code: 'DAILY_BRIEF' }).deliver);
  if (!todo.length) return [];
  board ||= require('./warning_board').getWarningBoard(now);
  if (markets === null) { try { markets = require('./collectors/markets').readCache(); } catch { markets = null; } }
  const payload = briefPayload(board, { now, markets }), results = [];
  for (const sub of todo) {
    try { await (await client.users.fetch(sub.userId)).send(payload); markDelivered(sub.userId, eventId); sent.add(sub.userId); results.push({ userId: sub.userId, status: 'SENT' }); }
    catch (e) { attempts[sub.userId] = (attempts[sub.userId] || 0) + 1; results.push({ userId: sub.userId, status: 'FAILED', error: e.message }); }
  }
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify({ date: key, sentTo: [...sent], attempts })); fs.renameSync(tmp, file);
  return results;
}

module.exports = { briefText, briefPayload, dispatchDailyBrief };
