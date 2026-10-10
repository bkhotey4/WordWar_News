// 首頁「軍事・外交・政治」三欄與「各國動向」：都用時間軸裡近 7 天經 2 家以上媒體確認的事件（不另抓資料），
// 依事件類型分到三欄；各國動向則以標題中最早出現的國家當作行動方。
const HOUR = 3600_000, DAY = 24 * HOUR;
const COLUMN = {
  MIL: ['MIL', 'MOBPREP', 'MOBIL', 'LEVEL_UP'],
  DIP: ['DIPLO', 'EVAC', 'SANCTION', 'UN', 'DEESC', 'FLIGHTS', 'SHIP'],
  POL: ['RHETORIC', 'CNTW', 'ARMS', 'HOMEFRONT', 'EUPREP']
};
const COLUMNS = [['MIL', '🛡️ 軍事'], ['DIP', '🏛️ 外交'], ['POL', '📜 政治']];
const COUNTRIES = [
  ['CN', '🇨🇳 中國', /China|Chinese|Beijing|\bPLA\b|Xi Jinping|中國|中共|北京|解放軍|國台辦|陸方|習近平/i],
  ['US', '🇺🇸 美國', /\bUS\b|U\.S\.|United States|Washington|Pentagon|White House|Trump|Rubio|Hegseth|美國|美方|美軍|川普|白宮|五角大廈/],
  ['RU', '🇷🇺 俄羅斯', /Russia|Russian|Moscow|Kremlin|Putin|俄羅斯|俄國|俄方|俄軍|莫斯科|克里姆林|普丁/i],
  ['UA', '🇺🇦 烏克蘭', /Ukrain|Kyiv|Zelensky|烏克蘭|烏方|基輔|澤倫斯基/i],
  ['KP', '🇰🇵 北韓', /North Korea|DPRK|Pyongyang|Kim Jong|北韓|朝鮮|平壤|金正恩/i],
  ['KR', '🇰🇷 南韓', /South Korea|Seoul|南韓|韓國|首爾/i],
  ['JP', '🇯🇵 日本', /Japan|Japanese|Tokyo|日本|日方|東京/i],
  ['PH', '🇵🇭 菲律賓', /Philippin|Manila|Marcos|菲律賓|菲國|菲方|馬尼拉/i],
  ['IR', '🇮🇷 伊朗', /Iran|Tehran|伊朗|德黑蘭/i],
  ['IL', '🇮🇱 以色列', /Israel|IDF|Netanyahu|以色列|以軍|納坦雅胡/i],
  ['EU', '🇪🇺 歐盟與歐洲', /\bEU\b|European Union|Brussels|\bNATO\b|Poland|Polish|Germany|German|France|French|Britain|British|\bUK\b|Baltic|Lithuania|Latvia|Estonia|Finland|Sweden|歐盟|歐洲|北約|波蘭|德國|法國|英國|波羅的海|立陶宛|拉脫維亞|愛沙尼亞|芬蘭|瑞典/],
  ['TW', '🇹🇼 台灣', /Taiwan|Taipei|台灣|臺灣|國軍|賴清德|我國/i]
];

function actorOf(title) {
  let best = null;
  for (const [code, label, re] of COUNTRIES) { const m = re.exec(title); if (m && (!best || m.index < best.index)) best = { code, label, index: m.index }; }
  return best;
}
const recent = (events, now, days = 7) => events.filter(e => e.kind !== 'REPORT' && now - Date.parse(e.at) <= days * DAY && Date.parse(e.at) <= now + HOUR);

// 每種事件的中文標題與「代表什麼」說明（圖卡用；原文標題只當小字參考）
const INFO = {
  DPRK_MISSILE: ['🚀', '北韓發射彈道飛彈', '北韓以試射展示打擊能力，常與美韓演習或政治時間點相關；日本、南韓會同步發布警報與軌跡。'],
  DPRK_NUKE: ['☢️', '北韓核試或核設施異常', '核能力升級是朝鮮半島最嚴重的升級訊號之一，通常會引發安理會與美日韓的強烈回應。'],
  DMZ: ['⚠️', '非軍事區交火、越界或 GPS 干擾', '南北韓前線的直接摩擦，容易引發報復循環。'],
  ALLIED_DRILL: ['🎯', '美韓（日）聯合演習', '大型聯合演習期間，北韓常以飛彈試射或強硬聲明回應。'],
  SCS_CLASH: ['💦', '中菲海上衝突', '中國海警以水砲、衝撞或雷射對菲律賓船隻施壓；美菲共同防禦條約可能被拿出來討論。'],
  SCS_BLOCK: ['⛔', '中方阻擋補給或登臨', '阻斷仁愛礁等菲方據點的補給，是南海最直接的緊張來源。'],
  SCS_DRILL: ['⚓', '南海演習或聯合巡航', '中方演習或美菲日澳聯合巡航，顯示各方在南海展示存在。'],
  HOUTHI: ['🛳️', '胡塞攻擊船隻', '紅海與亞丁灣航運受威脅，會推高歐亞運費、保費與油價。'],
  IL_STRIKE: ['💥', '以色列跨境空襲', '打擊黎巴嫩、敘利亞、伊拉克或葉門目標，衝突有擴大到多國的風險。'],
  LB_ROCKETS: ['🎇', '對以色列的火箭或無人機攻擊', '真主黨、哈瑪斯或胡塞對以色列發動攻擊，常引來以軍報復。'],
  TW_COASTGUARD: ['🚤', '中國海警在金馬海域執法', '灰色地帶施壓，試圖模糊金門、馬祖海域的管轄界線。'],
  AIRSPACE: ['✈️', '北約東翼領空遭侵犯', '俄國無人機或飛彈越界進入北約國家，北約需判斷是否回應。'],
  RESPONSE: ['🛩️', '北約戰機升空或機場關閉', '北約國家為因應俄國攻擊而緊急升空或關閉機場，代表前線緊張升高。'],
  JOINT_PATROL: ['🛡️', '共軍聯合戰備警巡', '共軍多軍種在台灣周邊演練制空、制海與封控，是對台軍事施壓的主要形式。'],
  NAMED_EXERCISE: ['🎯', '東部戰區具名演習', '具名演習（如聯合利劍）規模大、常模擬封鎖台灣，是重要的升溫指標。'],
  MOBIL: ['🚢', '中國民船徵用或集結', '滾裝船、渡輪與漁船可用於渡海運兵，是兩棲作戰準備的觀察重點。'],
  RESERVE: ['🎖️', '後備召集或動員法令', '召集後備、延長役期或修改動員法，是開戰前最明確的準備動作之一。'],
  CIVDEF: ['🏥', '民防與醫療備戰', '防空演習、避難所整備、血庫備戰，代表政府在為可能的攻擊做準備。'],
  EMERGENCY: ['🚨', '緊急狀態或資訊管制', '宣布緊急狀態、戒嚴或斷網，常見於戰爭前後或重大動盪時。'],
  STOCKPILE: ['🏚️', '戰略物資收儲或經濟管制', '大量收儲糧食與能源、限制出口或資本管制，可能是為制裁或戰爭預作準備。'],
  EUPREP: ['🇪🇺', '歐洲備戰', '歐洲各國增加國防預算、恢復徵兵或發放民防手冊，反映對俄威脅的評估升高。'],
  DIPLO: ['🏛️', '外交關係變化', '召回大使、驅逐外交官或關閉使館，代表兩國關係明顯惡化。'],
  EVAC: ['🧳', '撤僑或旅遊警示升級', '各國撤離僑民或提高旅遊警示，往往早於軍事行動出現。'],
  SANCTION: ['💼', '新制裁', '新一輪制裁或出口管制，反映外交施壓升級。'],
  UN: ['🌐', '國際組織行動', '安理會表決、IAEA 報告或北約峰會等正式行動。'],
  DEESC: ['🕊️', '降溫訊號', '衝突雙方通話、會談或停火協商，可能讓緊張暫緩（不會降低燈號）。'],
  FLIGHTS: ['✈️', '航空公司停飛', '航空公司暫停飛往衝突地區，代表民間評估風險升高。'],
  SHIP: ['⚓', '航運戰爭險或繞道', '保險公司調高戰爭險或航運公司繞道，是商業界對風險的即時反應。'],
  RHETORIC: ['📢', '官方言論升級', '官方使用「懲戒」「玩火自焚」等強烈措辭，且數量高於平常。'],
  CNTW: ['🇨🇳', '中國對台措施', '國台辦、商務部等宣布制裁、關稅、禁令或懲戒名單，屬經濟與政治施壓。'],
  ARMS: ['🛡️', '對台軍售或涉台法案', '美國批准軍售或通過涉台法案；中方常在之後以軍演回應。'],
  POWER: ['⚡', '非天候大停電', '大規模停電或電力設施受損，是民生韌性的重要觀察點。'],
  ISLANDS: ['⛴️', '外島交通停駛', '金門、馬祖、澎湖航班船班在非天候因素下停駛。'],
  CHIPS: ['🔌', '半導體管制', '晶片、稀土等關鍵材料的出口管制，牽動台灣半導體供應鏈。'],
  PANIC: ['🛒', '民眾搶購', '民眾因戰爭疑慮搶購物資，反映社會緊張程度。'],
  LEVEL_UP: ['⚠️', '燈號上升', '本站預警燈號升級。']
};
const COLOR = { MIL: '#f59e0b', DIP: '#38bdf8', POL: '#a78bfa' };
const colOf = kind => Object.keys(COLUMN).find(k => COLUMN[k].includes(kind)) || 'MIL';

function item(e, { esc, names, tpe }, showTheater = true) {
  const key = e.sub && INFO[e.sub] ? e.sub : INFO[e.kind] ? e.kind : null;
  const [icon, label, meaning] = key ? INFO[key] : ['•', e.kind, ''];
  const title = e.sub === 'NAMED_EXERCISE' && e.exName ? `${label}：${e.exName}` : label;
  const pubs = e.pubs ? `${e.pubs} 家媒體報導` : (e.note || '');
  const src = e.href && /^https:\/\//.test(e.href) ? ` <a class="ic-src" href="${esc(e.href)}" target="_blank" rel="noopener">來源 ↗</a>` : '';
  return `<article class="icard" style="--c:${COLOR[colOf(e.kind)]}"><div class="ic-icon">${icon}</div><div class="ic-body">
    <h4>${esc(title)}</h4><p class="ic-meta">${showTheater ? `${esc(names[e.theater] || '全球')}｜` : ''}${esc(tpe(Date.parse(e.at)).slice(5, 10).replace('-', '/'))}${pubs ? `｜${esc(pubs)}` : ''}</p>
    ${meaning ? `<p class="ic-text">${esc(meaning)}</p>` : ''}<p class="ic-orig">報導標題：${esc(String(e.title).slice(0, 120))}${src}</p></div></article>`;
}

// 同一標題可能被歸到多個戰區，欄位裡只列一次
const dedupe = list => { const seen = new Set(); return list.filter(e => { const k = e.title; if (seen.has(k)) return false; seen.add(k); return true; }); };

// 回傳三欄各自的 HTML（標題＋清單），由版面決定外框
function columnParts(events, helpers, { now = Date.now(), limit = 8 } = {}) {
  const ev = recent(events, now), out = {};
  for (const [key, label] of COLUMNS) {
    const list = dedupe(ev.filter(e => COLUMN[key].includes(e.kind))).slice(0, limit);
    out[key] = `<h3>${label}<span class="muted small">（近 7 天 ${list.length} 則）</span></h3>${list.length ? `<div class="icards">${list.map(e => item(e, helpers)).join('')}</div>` : '<p class="muted">近 7 天沒有經確認的事件。</p>'}`;
  }
  return out;
}

function countriesSection(events, helpers, { now = Date.now(), perCountry = 4 } = {}) {
  const ev = dedupe(recent(events, now));
  const by = new Map();
  for (const e of ev) { const a = actorOf(e.title); if (!a) continue; (by.get(a.code) || by.set(a.code, []).get(a.code)).push(e); }
  const cards = COUNTRIES.filter(([code]) => by.get(code)?.length).map(([code, label]) => {
    const list = by.get(code);
    const counts = COLUMNS.map(([key, l]) => [l.split(' ')[1], list.filter(e => COLUMN[key].includes(e.kind)).length]).filter(([, n]) => n).map(([l, n]) => `${l} ${n}`).join('・');
    return `<div class="ccard"><h3>${label}<span class="muted small">${esc0(counts)}</span></h3><div class="icards one">${list.slice(0, perCountry).map(e => item(e, helpers)).join('')}</div>${list.length > perCountry ? `<p class="muted small">另有 ${list.length - perCountry} 則，見<a href="timeline.html">時間軸</a></p>` : ''}</div>`;
  });
  return cards.length ? `<div class="cgrid">${cards.join('')}</div>` : '<p class="muted">近 7 天沒有可歸屬到特定國家的確認事件。</p>';
}
const esc0 = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));


// 重要度：用來挑「今日焦點」與 Bento 版面的事件順序
const WEIGHT = { DPRK_NUKE: 10, EVAC: 9, RESERVE: 9, NAMED_EXERCISE: 9, MOBIL: 8, SCS_BLOCK: 8, AIRSPACE: 8, DPRK_MISSILE: 7, JOINT_PATROL: 7, SCS_CLASH: 7, HOUTHI: 6, EMERGENCY: 6, DIPLO: 6, CNTW: 6, ARMS: 5, TW_COASTGUARD: 5, RESPONSE: 5, IL_STRIKE: 4, UN: 4, SANCTION: 3, RHETORIC: 3, STOCKPILE: 3, SHIP: 3, FLIGHTS: 3, CIVDEF: 3, EUPREP: 2, DEESC: 2 };
function topEvents(events, { now = Date.now(), n = 6, hours = 72 } = {}) {
  const ev = dedupe(events.filter(e => e.kind !== 'REPORT' && e.kind !== 'LEVEL_DOWN' && now - Date.parse(e.at) <= hours * HOUR && Date.parse(e.at) <= now + HOUR));
  const w = e => (WEIGHT[e.sub] || WEIGHT[e.kind] || 1) + Math.min(3, (e.pubs || 2) / 4) - (now - Date.parse(e.at)) / DAY;
  // 同一類型只取一則，避免焦點被同一件事洗版
  const seen = new Set();
  return ev.sort((a, b) => w(b) - w(a)).filter(e => { const k = `${e.sub || e.kind}|${e.theater}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, n);
}
function cardsHtml(list, helpers, cls = '') { return list.length ? `<div class="icards ${cls}">${list.map(e => item(e, helpers)).join('')}</div>` : ''; }

// 戰區橫幅：每個戰區一列，左邊等級與戰場圖縮圖，右邊軍事／外交／政治各 2 張圖卡
function theaterBands(events, board, helpers, { now = Date.now(), order, level, img = () => null, shortName = n => n, beats = {}, beatHtml = () => '', extra = () => '', asList = false } = {}) {
  const ev = recent(events, now);
  const list = order.map(id => board.theaters.find(t => t.id === id)).filter(Boolean).map(t => {
    const [color, lname] = level[t.level] || ['#94a3b8', '無法判定'];
    const mine = dedupe(ev.filter(e => e.theater === t.id));
    const cols = COLUMNS.map(([key, label]) => {
      const brief = beatHtml((beats[t.id] || {})[key], helpers);
      const list = mine.filter(e => COLUMN[key].includes(e.kind)).slice(0, brief ? 1 : 2);
      return `<div class="bandcol"><h4>${label}</h4>${brief}${list.length ? `<div class="icards one">${list.map(e => item(e, helpers, false)).join('')}</div>` : brief ? '' : '<p class="muted small">近 7 天無確認事件</p>'}</div>`;
    }).join('');
    const pic = img(t.id);
    return { id: t.id, name: t.name, level: t.level, color, html: `<section class="band" id="band-${t.id}" style="--lv:${color}"><div class="band-head"><span class="dot"></span><h3>${helpers.esc(t.name)}</h3><span class="band-lv">${t.level ? `${t.level}｜${helpers.esc((t.levelName || lname).replace(/（.*）/, ''))}` : '無法判定'}</span>
      <span class="band-why">${helpers.esc(t.triggered.slice(0, 3).map(i => shortName(i.name)).join('、') || '沒有指標超過門檻')}</span></div>
      <div class="band-body">${pic ? `<a class="band-pic" href="${pic}" target="_blank"><img loading="lazy" src="${pic}" alt="${helpers.esc(t.name)} 戰場圖"></a>` : ''}<div class="band-cols">${cols}</div></div>${extra(t.id)}</section>` };
  });
  return asList ? list : list.map(b => b.html).join('');
}

const CSS = `.band{background:var(--panel);border:1px solid var(--line);border-top:5px solid var(--lv);border-radius:12px;padding:12px 14px;margin:0 0 14px}
.band-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.band-head h3{margin:0;font-size:1.15em}.band-head .dot{width:12px;height:12px;border-radius:50%;background:var(--lv)}
.band-lv{font-weight:800;color:var(--lv);font-size:1.1em}.band-why{color:var(--dim);font-size:.9em}
.band-body{display:grid;grid-template-columns:260px 1fr;gap:12px;margin-top:10px}.band-pic img{width:100%;border-radius:8px;display:block}.band-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.band-body:not(:has(.band-pic)){grid-template-columns:1fr}.bandcol h4{margin:0 0 6px;font-size:.92em;color:var(--dim)}
.icards.hero{grid-template-columns:repeat(3,minmax(0,1fr))}.icards.hero .icard{padding:16px}.icards.hero .ic-icon{font-size:2.6em;width:60px;height:60px}.icards.hero h4{font-size:1.15em}
.war-main .band-body{grid-template-columns:1fr}.war-main .band-pic{text-align:center;background:rgba(0,0,0,.25);border-radius:8px}.war-main .band-pic img{width:auto;max-width:100%;max-height:280px;margin:0 auto}
@media(min-width:1600px){.war-main .band-body:has(.band-pic){grid-template-columns:300px 1fr}.war-main .band-pic{background:none}.war-main .band-pic img{max-height:none;width:100%}}
@media(max-width:1000px){.band-body{grid-template-columns:1fr}.band-cols{grid-template-columns:1fr}.icards.hero{grid-template-columns:1fr}}
.icards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}.icards.one{grid-template-columns:1fr}
.icard{display:flex;gap:12px;background:var(--panel);border:1px solid var(--line);border-left:5px solid var(--c);border-radius:10px;padding:12px 14px}
.ic-icon{font-size:1.9em;line-height:1;flex:none;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:rgba(255,255,255,.05)}
.ic-body h4{margin:0 0 2px;font-size:1.02em;color:var(--c)}.ic-meta{margin:0 0 6px;font-size:.82em;color:var(--dim)}.ic-text{margin:0 0 6px;font-size:.93em;line-height:1.55}
.ic-orig{margin:0;font-size:.78em;color:var(--dim);line-height:1.4}.ic-src{color:var(--dim);white-space:nowrap}
.bcols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.bcol,.ccard{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.bcol h3,.ccard h3{margin:0 0 8px;font-size:1.05em;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.blist{list-style:none;margin:0;padding:0}.blist li{padding:6px 0;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:2px}.blist li:first-child{border-top:0}
.bi-meta{font-size:.82em;color:var(--dim)}.bi-title{font-size:.92em;line-height:1.45}.bi-title a{color:var(--text)}.bi-title a:hover{color:var(--cyan)}
.cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
@media(max-width:900px){.bcols{grid-template-columns:1fr}}`;

// 單一戰區、單一類別的近期事件圖卡（指揮中心版面在沒有記者整理時當備援）
function eventCards(events, theater, key, helpers, { now = Date.now(), n = 2 } = {}) {
  const list = dedupe(recent(events, now).filter(e => e.theater === theater && COLUMN[key].includes(e.kind))).slice(0, n);
  return list.length ? `<div class="icards one">${list.map(e => item(e, helpers, false)).join('')}</div>` : '';
}

module.exports = { eventCards, topEvents, cardsHtml, theaterBands, columnParts, countriesSection, actorOf, COLUMN, CSS };
