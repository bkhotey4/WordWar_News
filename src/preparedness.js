// 民眾準備提醒：依台海預警等級，提醒「檢查存貨／趁早補齊／待命」，並提供依人數與天數換算的採購清單。
// 物資數量以國防部《臺灣全民安全指引》為準（research/prepare_checklist.json 逐項標註官方或估算）。
const fs = require('fs');
const path = require('path');

const CHECKLIST_FILE = path.join(__dirname, '../research/prepare_checklist.json');
const STATE_FILE = path.join(__dirname, '../research/prepare_push_state.json');
const THEATER = 'taiwan_strait';

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function checklist() { return readJson(CHECKLIST_FILE, null); }

const STAGES = {
  1: { name: '常態', icon: '🟢', title: '平時循環儲備',
    actions: ['照「循環儲備」慢慢買：照常吃用、用掉再補，每半年檢查一次。', '不需要特別囤貨；這些東西颱風、地震停水停電時一樣用得到。'] },
  2: { name: '升溫', icon: '🟡', title: '檢查家裡存貨',
    actions: ['這週找時間清點：水、食物、藥、照明、行動電源夠不夠 7 天。', '缺的照清單補上，正常採購量即可，不用搶。', '檢查避難包：放在玄關、食物沒過期、手電筒有電。', '手機裝「消防防災 e 點通」與「警政服務」，查好住家與公司附近的避難設施。'] },
  3: { name: '高度警戒', icon: '🟠', title: '趁現在補齊剩下的',
    actions: ['把清單上還缺的東西在這幾天補齊，避開之後可能的排隊搶購。', '汽機車加滿油；領一些小額現金放家裡。', '慢性病處方箋提早領下一期藥。', '行動電源、手電筒電池充飽；避難包確認可以直接背走。', '和家人約好聯絡方式與集合地點（手機不通時怎麼辦）。'] },
  4: { name: '危機', icon: '🔴', title: '待命，以官方指示為準',
    actions: ['不要再去人多的賣場排隊；用家裡的存貨。', '浴缸與水桶先裝滿生活用水。', '留在離避難處所近的地方，確認最近的地下室或防空避難設施。', '開著收音機或手機廣播，只照政府與警察的指示行動。', '看到「政府投降」「國家戰敗」一類訊息，一律當作假訊息。'] }
};

// 台海戰區等級 → 準備階段（等級無法判定時回 null，不推播也不改狀態）
function stageFromBoard(board) {
  const t = (board?.theaters || []).find(x => x.id === THEATER);
  if (!t || t.level === null || t.level === undefined) return null;
  const decisive = (t.triggered || []).some(i => i.tier === 'DECISIVE');
  return { stage: decisive ? 4 : Math.max(1, Math.min(4, t.level)), theater: t };
}


// 依人數、天數換算採購清單；回傳多段文字（每段 < 2000 字，Discord 可分則送出）
function shoppingList({ people = 1, days = 7 } = {}) {
  const list = checklist();
  if (!list) return ['找不到準備清單資料（research/prepare_checklist.json）。'];
  people = Math.min(20, Math.max(1, Math.round(Number(people) || 1)));
  days = Math.min(30, Math.max(1, Math.round(Number(days) || 7)));
  const water = 3 * people * days;
  const head = [
    `# 🧺 家庭準備採購清單（${people} 人 × ${days} 天）`,
    `💧 **飲用水 ${water} 公升**（每人每天 3 公升，約 ${Math.ceil(water / 1.5)} 瓶 1.5L 或 ${Math.ceil(water / 20)} 桶 20L）`,
    '標示 📘 為官方指引明列；📐 為依官方原則換算的估算，請依家中狀況調整。', ''
  ];
  const cats = {};
  for (const it of list.home) {
    (cats[it.cat] ||= []).push(it);
  }
  const body = [];
  for (const [cat, items] of Object.entries(cats)) {
    body.push(`**${cat}**`);
    for (const it of items) {
      const n = it.perPersonDay ? it.perPersonDay * people * days : it.perHouseholdDay ? it.perHouseholdDay * days : 0;
      const qty = n ? `：約 ${Math.ceil(n)} ${it.unit}` : '';
      body.push(`${it.basis === 'OFFICIAL' ? '📘' : '📐'} ${it.item}${qty}${it.note ? `（${it.note}）` : ''}`);
    }
  }
  const gobag = ['', `**🎒 緊急避難包（每人一個，1～3 天份）**`, ...list.gobag.map(g => `📘 ${g.item}`)];
  const rules = ['', '**原則**', ...list.principles.map(p => `• ${p.text}`)];
  const raid = ['', '**📢 聽到空襲警報**', ...list.airRaid.map(a => `• ${a}`), `☎️ ${list.hotlines}`, `📱 ${list.apps}`];
  const srcs = ['', '**來源**', ...list.sources.map(s => `• [${s.title}](<${s.url}>)`)];
  return chunk([...head, ...body, ...gobag, ...rules, ...raid, ...srcs]);
}

function chunk(lines, max = 1900) {
  const out = []; let cur = '';
  for (const l of lines) {
    if ((cur + '\n' + l).length > max) { out.push(cur); cur = l; } else cur = cur ? `${cur}\n${l}` : l;
  }
  if (cur) out.push(cur);
  return out;
}

const datesLine = up => up?.length ? `📅 近期敏感日期：${up.map(d => `${d.date.slice(5).replace('-', '/')} ${d.name}`).join('、')}` : null;
function stageMessage(stage, theater, { downgrade = false, upcoming = [] } = {}) {
  const s = STAGES[stage];
  if (downgrade) return [`# 🟢 準備提醒解除：台海回到常態`,
    '預警等級已降回常態。已經買的東西不用丟，照常吃用、用掉再補（循環儲備）。',
    '輸入 `/prepare` 或私訊「準備清單」可隨時看完整清單。'].join('\n');
  const why = (theater?.triggered || []).slice(0, 4).map(i => `• ${i.name}${i.summary ? `：${String(i.summary).slice(0, 90)}` : ''}`);
  const lines = [
    `# ${s.icon} 準備提醒｜台海第 ${stage} 級「${s.name}」：${s.title}`,
    why.length ? `**觸發原因**\n${why.join('\n')}` : `**判定**：${theater?.reason || '台海預警等級上升'}`,
    '', '**現在可以做的事**', ...s.actions.map(a => `✅ ${a}`), '', ...(datesLine(upcoming) ? [datesLine(upcoming)] : []),
    '預警是依公開資料的早期判斷（試行中），不代表戰爭一定發生；軍演多數沒有演變成衝突。這些準備在颱風、地震時一樣有用。',
    '👉 輸入 `/prepare`（可指定人數、天數）或私訊「準備清單」看完整採購清單。'
  ];
  return lines.join('\n').slice(0, 1990);
}

// 每位訂閱者各自記錄「已收到的階段」，靜默時段延後的提醒會在下一輪自動補送
function planPreparePushes(current, subscribers, state) {
  const users = { ...(state.users || {}) }, pushes = [];
  if (!current) return { pushes, users };
  for (const sub of subscribers) {
    const prev = users[sub.userId]?.stage;
    if (prev === undefined) {
      if (current.stage >= 2) pushes.push({ userId: sub.userId, stage: current.stage, kind: 'UP' });
      else users[sub.userId] = { stage: 1 };
    } else if (current.stage > prev && current.stage >= 2) pushes.push({ userId: sub.userId, stage: current.stage, kind: 'UP' });
    else if (current.stage <= 1 && prev >= 2) pushes.push({ userId: sub.userId, stage: 1, kind: 'DOWN' });
    else if (current.stage < prev) users[sub.userId] = { stage: current.stage }; // 4→3 等小幅降級不打擾
  }
  return { pushes, users };
}

async function dispatchPreparePushes(client, subscribers, { board, file = STATE_FILE, shouldDeliver = () => ({ deliver: true }), markDelivered = () => {}, now = Date.now() } = {}) {
  if (!board) board = require('./warning_board').getWarningBoard();
  const current = stageFromBoard(board);
  const state = readJson(file, {});
  const { pushes, users } = planPreparePushes(current, subscribers, state);
  const results = [];
  for (const p of pushes) {
    const eventId = `PREP_${p.kind}_${p.stage}_${new Date(now).toISOString().slice(0, 13)}`;
    const level = p.stage >= 4 ? 'CRITICAL' : 'WARNING';
    const decision = shouldDeliver(p.userId, { level, eventId, code: 'PREPAREDNESS' });
    if (!decision.deliver) { results.push({ userId: p.userId, eventId, status: 'DEFERRED', reason: decision.reason }); continue; }
    try {
      const user = await client.users.fetch(p.userId);
      await user.send({ content: stageMessage(p.stage, current.theater, { downgrade: p.kind === 'DOWN', upcoming: board.upcoming }), components: require('./push_buttons').buttonsFor('taiwan_strait', { mute: false }), allowedMentions: { parse: [] } });
      markDelivered(p.userId, eventId);
      users[p.userId] = { stage: p.stage, at: new Date(now).toISOString() };
      results.push({ userId: p.userId, eventId, status: 'SENT' });
    } catch (e) { results.push({ userId: p.userId, eventId, status: 'FAILED', error: e.message }); }
  }
  const next = { stage: current?.stage ?? state.stage ?? null, updatedAt: new Date(now).toISOString(), users };
  if (JSON.stringify(next.users) !== JSON.stringify(state.users || {}) || next.stage !== state.stage) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 1)); fs.renameSync(tmp, file);
  }
  return results;
}

// /prepare 與私訊「準備清單」的回覆：目前階段 + 採購清單
function prepareDiscordPayload({ people, days, board } = {}) {
  let head;
  try {
    board = board || require('./warning_board').getWarningBoard();
    const cur = stageFromBoard(board);
    head = cur ? `${STAGES[cur.stage].icon} 目前台海準備階段：第 ${cur.stage} 級「${STAGES[cur.stage].name}」— ${STAGES[cur.stage].title}\n${STAGES[cur.stage].actions.map(a => `✅ ${a}`).join('\n')}${datesLine(board.upcoming) ? `\n${datesLine(board.upcoming)}` : ''}` : '目前台海預警等級無法判定（資料不足），先照平時循環儲備準備。';
  } catch { head = '目前無法讀取預警看板，先照平時循環儲備準備。'; }
  const parts = shoppingList({ people, days });
  return { content: `${head}\n\n${parts[0]}`.slice(0, 2000), extra: parts.slice(1), files: [], embeds: [], allowedMentions: { parse: [] } };
}

function parsePrepareText(text) {
  const p = String(text).match(/(\d+)\s*(?:人|口|people)/), d = String(text).match(/(\d+)\s*(?:天|日|days?)/);
  return { people: p ? Number(p[1]) : 1, days: d ? Number(d[1]) : 7 };
}

module.exports = { STAGES, stageFromBoard, shoppingList, stageMessage, planPreparePushes, dispatchPreparePushes, prepareDiscordPayload, parsePrepareText };
