// 戰區預警看板（I&W）：依 research/ANALYSIS_SPEC.md 計算四級警戒。
// 等級只由本檔規則計算；AI 與研究者只能新增附來源的指標紀錄（research/warning_indicators.json）。
const fs = require('fs');
const path = require('path');

const LEDGER_FILE = path.join(__dirname, '../research/warning_indicators.json');
const HISTORY_FILE = path.join(__dirname, '../research/warning_history.json');
const CALENDAR_FILE = path.join(__dirname, '../research/sensitive_dates.json');
const HOUR = 3600_000;
// v2：同一事件衍生的指標（同一份國防部通報的架次與越線、同日的聯合戰備警巡）合併計為 1 項主要指標，避免單一事件直接升到第 3 級
const RULE_VERSION = 'iw-v2-trial';
const LEVEL_NAMES = { 1: '常態', 2: '升溫', 3: '高度警戒', 4: '危機' };
const QUALIFYING_SOURCES = new Set(['OFFICIAL', 'INDEPENDENT_MEDIA', 'EXTERNAL_ASSESSMENT']);
const SOURCE_CLASSES = new Set([...QUALIFYING_SOURCES, 'PARTY_CLAIM']);

// tier：PRIMARY 主要、SECONDARY 次要、DECISIVE 決定性、DEESCALATION 降溫訊號（v1 只顯示，不降低等級）
const THEATERS = {
  taiwan_strait: {
    name: '台海',
    indicators: [
      { id: 'tw_aircraft', name: '共機架次超過 60 日 P95', tier: 'PRIMARY', auto: 'mnd:aircraft', group: 'tw_air' },
      { id: 'tw_crossing', name: '逾越中線／進入空域架次超過 60 日 P95', tier: 'PRIMARY', auto: 'mnd:crossingOrAirspace', group: 'tw_air' },
      { id: 'tw_ships', name: '共艦數超過 60 日 P95', tier: 'PRIMARY', auto: 'mnd:ships' },
      { id: 'tw_joint_patrol', name: '聯合戰備警巡（國防部原文或 2 家以上媒體）', tier: 'PRIMARY', auto: ['mnd:keyword', 'pla:JOINT_PATROL'], group: 'tw_air' },
      { id: 'tw_named_exercise', name: '東部戰區具名演習（聯合利劍、海峽雷霆等）', tier: 'PRIMARY', auto: 'pla:NAMED_EXERCISE', group: 'tw_exercise' },
      { id: 'tw_cn_reserve', name: '中國召集後備、延長役期或修改動員法令（2 家以上媒體）', tier: 'PRIMARY', auto: 'mob:RESERVE', group: 'tw_exercise' },
      { id: 'tw_cn_homefront', name: '中國進入緊急或戰時體制、民防醫療備戰或戰略物資收儲', tier: 'SECONDARY', auto: 'mob:EMERGENCY+CIVDEF+STOCKPILE' },
      { id: 'tw_mobilization', name: '中國民船（滾裝船、渡輪、海上民兵）徵用集結或國防動員（2 家以上媒體）', tier: 'PRIMARY', auto: 'civil:MOBIL', group: 'tw_exercise' },
      { id: 'tw_nav_warning', name: '中國海事局軍事航行警告（台海周邊）', tier: 'SECONDARY', auto: 'msa' },
      { id: 'tw_japan_fleet', name: '日本統合幕僚監部公布中國艦艇／軍機動向', tier: 'SECONDARY', auto: 'jsjp' },
      { id: 'tw_infra', name: '海纜中斷或外島／全台大規模斷網', tier: 'SECONDARY', auto: 'infra' },
      { id: 'tw_market', name: '台股、台積電或新台幣單日異常下跌', tier: 'SECONDARY', auto: 'market:taiwan_strait' },
      { id: 'tw_coast_guard', name: '中國海警進入金門、馬祖限制水域或登檢台灣船隻（2 家以上媒體）', tier: 'SECONDARY', auto: 'region:TW_COASTGUARD' },
      { id: 'tw_political_window', name: '政治時間點後 14 天內（就職、過境、軍售、國慶演說）', tier: 'SECONDARY', auto: 'calendar' },
      { id: 'tw_evac', name: '撤僑、使館人員撤離或旅遊警示升級（2 家以上媒體）', tier: 'PRIMARY', auto: 'diplo:EVAC' },
      { id: 'tw_diplomatic', name: '外交關係變化，或國台辦／中國外交部言論明顯升級（高於 30 日常態）', tier: 'SECONDARY', auto: 'diplo:DIPLO+RHETORIC' },
      { id: 'tw_sanction_flight', name: '新制裁、出口管制或航空公司停飛（高於 30 日常態）', tier: 'SECONDARY', auto: 'diplo:SANCTION+FLIGHTS' },
      { id: 'tw_power', name: '非天候因素的大規模停電、限電或電力設施受損（2 家以上媒體）', tier: 'SECONDARY', auto: 'civil:POWER', group: 'tw_civil' },
      { id: 'tw_islands', name: '金門、馬祖、澎湖航班或船班停駛（排除天候，2 家以上媒體）', tier: 'SECONDARY', auto: 'civil:ISLANDS', group: 'tw_civil' },
      { id: 'tw_chips', name: '晶片、稀土等半導體供應鏈管制升級（高於 30 日常態）', tier: 'SECONDARY', auto: 'civil:CHIPS' },
      { id: 'tw_disinfo', name: '戰爭相關假訊息查核量異常增加（高於 30 日常態）', tier: 'SECONDARY', auto: 'civil:DISINFO' },
      { id: 'tw_panic', name: '民眾因戰爭疑慮搶購物資（2 家以上媒體）', tier: 'SECONDARY', auto: 'civil:PANIC' },
      { id: 'tw_shipping', name: '台海航運戰爭險上調或航運公司繞道停航（2 家以上媒體）', tier: 'SECONDARY', auto: 'diplo:SHIP' },
      { id: 'tw_carriers', name: '美軍航艦集中西太平洋（USNI 週報 3 艘以上）', tier: 'SECONDARY', auto: 'usni' },
      { id: 'tw_arms', name: '美國對台軍售或涉台法案通過（2 家以上媒體；中方常隨後軍演）', tier: 'SECONDARY', auto: 'diplo:ARMS' },
      { id: 'tw_cn_measures', name: '中國對台制裁、關稅、禁令或懲戒名單（2 家以上媒體）', tier: 'SECONDARY', auto: 'diplo:CNTW' },
      { id: 'tw_deesc', name: '美中或兩岸高層通話、會談等降溫訊號', tier: 'DEESCALATION', auto: 'diplo:DEESC' },
      { id: 'tw_decisive', name: '民船徵用、封鎖／檢疫宣告、實彈區環繞本島', tier: 'DECISIVE' }
    ]
  },
  iran_gulf: {
    name: '美伊戰爭與荷莫茲海峽', activeWar: true,
    indicators: [
      { id: 'ir_us_strikes', name: '美軍打擊或攔截行動', tier: 'PRIMARY' },
      { id: 'ir_shipping', name: 'UKMTO 波灣／荷莫茲／阿曼灣船舶遇襲超過 60 日 P95', tier: 'PRIMARY', auto: 'ukmto' },
      { id: 'ir_gulf_retaliation', name: '伊朗對波灣鄰國的報復行動', tier: 'SECONDARY' },
      { id: 'ir_blockade', name: '美軍海上封鎖持續或擴大', tier: 'SECONDARY' },
      { id: 'ir_oil', name: '布倫特原油單日異常上漲', tier: 'SECONDARY', auto: 'market:iran_gulf' },
      { id: 'ir_iaea', name: '國際原子能總署報告、安理會表決等國際組織行動（2 家以上媒體）', tier: 'SECONDARY', auto: 'diplo:UN' },
      { id: 'ir_reserve', name: '伊朗召集後備或動員（2 家以上媒體）', tier: 'PRIMARY', auto: 'mob:RESERVE' },
      { id: 'ir_homefront', name: '伊朗緊急狀態、斷網、民防或物資收儲', tier: 'SECONDARY', auto: 'mob:EMERGENCY+CIVDEF+STOCKPILE' },
      { id: 'ir_evac', name: '撤僑、使館人員撤離或旅遊警示升級（2 家以上媒體）', tier: 'PRIMARY', auto: 'diplo:EVAC' },
      { id: 'ir_diplomatic', name: '外交關係變化或安理會緊急會議', tier: 'SECONDARY', auto: 'diplo:DIPLO+RHETORIC' },
      { id: 'ir_ship_insurance', name: '荷莫茲航運戰爭險上調或航運公司繞道（高於 30 日常態）', tier: 'SECONDARY', auto: 'diplo:SHIP' },
      { id: 'ir_carriers', name: '美軍航艦集中中東海域（USNI 週報 2 艘以上）', tier: 'SECONDARY', auto: 'usni' },
      { id: 'ir_sanction_flight', name: '新制裁或航空公司停飛（高於 30 日常態）', tier: 'SECONDARY', auto: 'diplo:SANCTION+FLIGHTS' },
      { id: 'ir_talks', name: '調停會談、停火或封鎖放寬', tier: 'DEESCALATION', auto: 'diplo:DEESC' },
      { id: 'ir_decisive', name: '海峽實際封閉、大規模攻擊美軍基地、核設施遭打擊', tier: 'DECISIVE' }
    ]
  },
  europe_security: {
    name: '歐洲與北約東翼',
    indicators: [
      { id: 'eu_airspace', name: '波蘭／羅馬尼亞／波羅的海國家領空遭侵犯', tier: 'PRIMARY', auto: 'nato:AIRSPACE' },
      { id: 'eu_response', name: '戰機緊急升空、機場關閉或交戰規則變更', tier: 'PRIMARY', auto: 'nato:RESPONSE' },
      { id: 'eu_nato_art4', name: '北約第 4 條諮商', tier: 'SECONDARY' },
      { id: 'eu_reinforcement', name: '東翼增派兵力或擴大空防任務', tier: 'SECONDARY' },
      { id: 'eu_belarus', name: '白俄羅斯邊境演習', tier: 'SECONDARY' },
      { id: 'eu_energy', name: '歐洲天然氣價格單日異常上漲', tier: 'SECONDARY', auto: 'market:europe_security' },
      { id: 'eu_prep', name: '歐洲各國與歐盟備戰：國防預算、恢復徵兵、民防手冊（高於 30 日常態）', tier: 'SECONDARY', auto: 'mob:EUPREP' },
      { id: 'eu_by_mobil', name: '白俄羅斯動員、緊急狀態或戰時體制', tier: 'SECONDARY', auto: 'mob:RESERVE+EMERGENCY' },
      { id: 'eu_evac', name: '撤僑、使館人員撤離或旅遊警示升級（2 家以上媒體）', tier: 'PRIMARY', auto: 'diplo:EVAC' },
      { id: 'eu_diplomatic', name: '驅逐外交官、關閉使館或安理會緊急會議', tier: 'SECONDARY', auto: 'diplo:DIPLO+RHETORIC' },
      { id: 'eu_sanction_flight', name: '新制裁、航空公司停飛或領空關閉（高於 30 日常態）', tier: 'SECONDARY', auto: 'diplo:SANCTION+FLIGHTS' },
      { id: 'eu_deesc', name: '俄方與北約／歐洲高層通話、會談等降溫訊號', tier: 'DEESCALATION', auto: 'diplo:DEESC' },
      { id: 'eu_decisive', name: '北約成員國人員傷亡或設施遭擊中', tier: 'DECISIVE' }
    ]
  },
  ukraine_front: {
    name: '烏俄戰爭', activeWar: true,
    indicators: [
      { id: 'ua_strike_volume', name: '俄軍飛彈與無人機 7 日平均（或單夜飛彈數）超過 60 日 P95', tier: 'PRIMARY', auto: 'uaair' },
      { id: 'ua_energy', name: '能源設施遭打擊比例上升', tier: 'PRIMARY' },
      { id: 'ua_front', name: '戰線推進或撤退（外部評估）', tier: 'SECONDARY' },
      { id: 'ua_mobilization', name: '俄國動員、召集後備或徵兵法令變化（高於 30 日常態）', tier: 'SECONDARY', auto: 'mob:RESERVE' },
      { id: 'ua_homefront', name: '俄國緊急狀態、戰時經濟、斷網或物資收儲', tier: 'SECONDARY', auto: 'mob:EMERGENCY+CIVDEF+STOCKPILE' },
      { id: 'ua_diplomatic', name: '外交關係變化或安理會緊急會議', tier: 'SECONDARY', auto: 'diplo:DIPLO+RHETORIC' },
      { id: 'ua_sanction_flight', name: '新制裁或航空公司停飛（高於 30 日常態）', tier: 'SECONDARY', auto: 'diplo:SANCTION+FLIGHTS' },
      { id: 'ua_un', name: '安理會、北約峰會等國際組織行動（2 家以上媒體）', tier: 'SECONDARY', auto: 'diplo:UN' },
      { id: 'ua_deesc', name: '停火談判、元首通話等降溫訊號', tier: 'DEESCALATION', auto: 'diplo:DEESC' },
      { id: 'ua_decisive', name: '新戰線方向開啟、核設施周邊交戰', tier: 'DECISIVE' }
    ]
  },
  korea_peninsula: {
    name: '朝鮮半島',
    indicators: [
      { id: 'kr_missile', name: '北韓彈道飛彈發射（2 家以上媒體）', tier: 'PRIMARY', auto: 'region:DPRK_MISSILE' },
      { id: 'kr_nuclear', name: '北韓核試或核設施異常活動（2 家以上媒體）', tier: 'PRIMARY', auto: 'region:DPRK_NUKE' },
      { id: 'kr_dmz', name: '非軍事區交火、越界或大規模 GPS 干擾', tier: 'SECONDARY', auto: 'region:DMZ' },
      { id: 'kr_drill', name: '美韓（日）大規模聯合演習', tier: 'SECONDARY', auto: 'region:ALLIED_DRILL' },
      { id: 'kr_reserve', name: '北韓動員、召集或宣布戰時體制（2 家以上媒體）', tier: 'SECONDARY', auto: 'mob:RESERVE+EMERGENCY' },
      { id: 'kr_homefront', name: '北韓民防演習或物資收儲', tier: 'SECONDARY', auto: 'mob:CIVDEF+STOCKPILE' },
      { id: 'kr_evac', name: '撤僑、使館人員撤離或旅遊警示升級（2 家以上媒體）', tier: 'PRIMARY', auto: 'diplo:EVAC' },
      { id: 'kr_diplomatic', name: '外交關係變化或官方言論升級', tier: 'SECONDARY', auto: 'diplo:DIPLO+RHETORIC' },
      { id: 'kr_un', name: '安理會、IAEA 等國際組織行動', tier: 'SECONDARY', auto: 'diplo:UN' },
      { id: 'kr_deesc', name: '美朝或南北韓會談、通話等降溫訊號', tier: 'DEESCALATION', auto: 'diplo:DEESC' },
      { id: 'kr_decisive', name: '北韓攻擊南韓或日本領土、宣戰', tier: 'DECISIVE' }
    ]
  },
  south_china_sea: {
    name: '南海',
    indicators: [
      { id: 'scs_clash', name: '中菲海上衝突（水砲、衝撞、雷射，2 家以上媒體）', tier: 'PRIMARY', auto: 'region:SCS_CLASH', group: 'scs_incident' },
      { id: 'scs_block', name: '中方阻擋補給、封鎖或登臨（仁愛礁、黃岩島等）', tier: 'PRIMARY', auto: 'region:SCS_BLOCK', group: 'scs_incident' },
      { id: 'scs_drill', name: '南部戰區演習或美菲聯合巡航', tier: 'SECONDARY', auto: 'region:SCS_DRILL' },
      { id: 'scs_diplomatic', name: '外交抗議、召見大使或官方言論升級', tier: 'SECONDARY', auto: 'diplo:DIPLO+RHETORIC' },
      { id: 'scs_deesc', name: '中菲會談、行為準則協商等降溫訊號', tier: 'DEESCALATION', auto: 'diplo:DEESC' },
      { id: 'scs_decisive', name: '中菲軍艦交火或人員死亡', tier: 'DECISIVE' }
    ]
  },
  middle_east: {
    name: '以巴、黎巴嫩與紅海', activeWar: true,
    indicators: [
      { id: 'me_houthi', name: '胡塞攻擊紅海／亞丁灣船隻（2 家以上媒體）', tier: 'PRIMARY', auto: 'region:HOUTHI' },
      { id: 'me_israel', name: '以色列對黎巴嫩、敘利亞、伊拉克或葉門空襲（高於 30 日常態）', tier: 'PRIMARY', auto: 'region:IL_STRIKE' },
      { id: 'me_rockets', name: '對以色列的火箭、飛彈或無人機攻擊（高於 30 日常態）', tier: 'SECONDARY', auto: 'region:LB_ROCKETS' },
      { id: 'me_reserve', name: '以色列大規模召集後備軍人（高於 30 日常態）', tier: 'SECONDARY', auto: 'mob:RESERVE' },
      { id: 'me_homefront', name: '以色列緊急狀態、民防或醫療備戰', tier: 'SECONDARY', auto: 'mob:EMERGENCY+CIVDEF' },
      { id: 'me_evac', name: '撤僑、使館人員撤離或旅遊警示升級（2 家以上媒體）', tier: 'PRIMARY', auto: 'diplo:EVAC' },
      { id: 'me_diplomatic', name: '外交關係變化或官方言論升級', tier: 'SECONDARY', auto: 'diplo:DIPLO+RHETORIC' },
      { id: 'me_un', name: '安理會表決、緊急會議等國際組織行動', tier: 'SECONDARY', auto: 'diplo:UN' },
      { id: 'me_deesc', name: '停火談判、人質交換等降溫訊號', tier: 'DEESCALATION', auto: 'diplo:DEESC' },
      { id: 'me_decisive', name: '以色列地面部隊大規模進入黎巴嫩，或與伊朗全面直接交戰', tier: 'DECISIVE' }
    ]
  }
};

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
const bounded = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
function httpsUrl(v) { try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } }

function validEntry(e, now = Date.now()) {
  if (!e || e.reviewed !== true || !THEATERS[e.theater]) return false;
  const def = THEATERS[e.theater].indicators.find(i => i.id === e.indicator);
  if (!def || !/^[a-z0-9_-]{1,100}$/.test(e.id || '') || typeof e.triggered !== 'boolean' || !bounded(e.summary, 300)) return false;
  const observed = Date.parse(e.observedAt);
  if (!Number.isFinite(observed) || observed > now) return false;
  if (e.validHours !== undefined && !(Number.isInteger(e.validHours) && e.validHours > 0 && e.validHours <= 24 * 30)) return false;
  if (!Array.isArray(e.sources) || !e.sources.length || e.sources.length > 5) return false;
  // 選填：地圖用的事件座標與箭頭（只畫來源寫明方向的移動）
  const lonLat = v => Array.isArray(v) && v.length === 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90;
  if (e.location !== undefined && !(e.location && lonLat([e.location.lon, e.location.lat]) && bounded(e.location.label, 40))) return false;
  if (e.arrow !== undefined && !(e.arrow && lonLat(e.arrow.from) && lonLat(e.arrow.to))) return false;
  return e.sources.every(s => s && httpsUrl(s.url) && bounded(s.publisher, 80) && SOURCE_CLASSES.has(s.sourceClass) && Number.isFinite(Date.parse(s.publishedAt)) && Date.parse(s.publishedAt) <= now);
}

// 台海自動指標：沿用 taiwan_intel.assessTaiwan 的 60 日 P95 規則與國防部原文
function autoTaiwan(def, feed, mndDocs, now) {
  if (def.auto === 'mnd:keyword') {
    const recent = (mndDocs || []).filter(d => { const t = Date.parse(d.observation?.periodEnd || d.publishedAt); return Number.isFinite(t) && t <= now && now - t <= 72 * HOUR; });
    if (!recent.length) return null;
    const hit = recent.find(d => /聯合戰備警巡|(共軍|中共|解放軍|東部戰區).{0,12}演習/.test((d.body || '').replace(/漢光[^。]*演習/g, '')));
    return { status: hit ? 'TRIGGERED' : 'CLEAR', observedAt: (hit || recent[0]).observation?.periodEnd || (hit || recent[0]).publishedAt,
      summary: hit ? '國防部通報原文提及聯合戰備警巡或演習。' : `近 7 日 ${recent.length} 篇國防部通報未提及聯合戰備警巡或演習。`,
      sources: [{ url: (hit || recent[0]).url, publisher: '中華民國國防部', sourceClass: 'OFFICIAL', publishedAt: (hit || recent[0]).publishedAt }] };
  }
  const metric = def.auto.split(':')[1];
  const a = feed?.assessment;
  if (!a || a.status === 'STALE_OBSERVATION' || a.status === 'INSUFFICIENT_HISTORY') return null;
  const i = (a.indicators || []).find(x => x.metric === metric);
  if (!i || i.historicalP95 === undefined) return null;
  return { status: i.status === 'ABOVE_HISTORICAL_P95' ? 'TRIGGERED' : 'CLEAR', observedAt: i.periodEnd, value: i.current, unit: i.unit,
    baseline: { p95: i.historicalP95, windowDays: i.baselineWindowDays, samples: i.samples },
    summary: `最新 ${i.current}${i.unit}，60 日 P95 為 ${i.historicalP95}${i.unit}。`,
    sources: [{ url: i.sourceUrl, publisher: '中華民國國防部', sourceClass: 'OFFICIAL', publishedAt: i.periodEnd }] };
}

function autoUkmto(a) {
  if (!a || !['ABOVE_HISTORICAL_P95', 'WITHIN_HISTORICAL_RANGE'].includes(a.status)) return null;
  const l = a.latest;
  return { status: a.status === 'ABOVE_HISTORICAL_P95' ? 'TRIGGERED' : 'CLEAR', observedAt: l?.occurredAt || new Date().toISOString(), value: a.current, unit: '件',
    baseline: { p95: a.historicalP95, windowDays: a.baselineWindowDays, samples: a.samples },
    summary: `近 7 天灣區船舶遇襲 ${a.current} 件（60 日 P95 為 ${a.historicalP95} 件）${l ? `；最新：${l.occurredAt.slice(0, 10)} ${l.place}，UKMTO #${l.number}` : ''}。`,
    sources: [{ url: 'https://www.ukmto.org/recent-incidents', publisher: 'UKMTO（英國海事貿易行動辦公室）', sourceClass: 'OFFICIAL', publishedAt: l?.createdAt || l?.occurredAt || new Date().toISOString() }] };
}
function autoUkraineAir(a) {
  if (!a || !['ABOVE_HISTORICAL_P95', 'WITHIN_HISTORICAL_RANGE'].includes(a.status)) return null;
  const l = a.latest;
  const why = [a.volumeHigh ? '7 日平均超標' : null, a.missileHigh ? `單夜飛彈 ${l.nightMissiles} 枚超過 P95 ${a.missileP95} 枚` : null].filter(Boolean).join('、');
  return { status: a.status === 'ABOVE_HISTORICAL_P95' ? 'TRIGGERED' : 'CLEAR', observedAt: `${l.date}T06:00:00Z`, value: a.current7dAvg, unit: '架／枚（日均）',
    baseline: { p95: a.historicalP95, windowDays: a.baselineWindowDays, samples: a.samples },
    summary: `${l.date} 無人機 ${l.drones}、飛彈 ${l.missiles ?? '未明'}；7 日日均 ${a.current7dAvg}（60 日 P95 為 ${a.historicalP95}）${why ? `｜${why}` : ''}。烏方公布數字。`,
    sources: l.sources?.[0] ? [{ url: l.sources[0], publisher: '烏克蘭空軍（交戰方公布）', sourceClass: 'PARTY_CLAIM', publishedAt: `${l.date}T06:00:00Z` }] : [] };
}

function autoMsa(a) {
  if (!a || !['NEAR_TAIWAN', 'ABOVE_HISTORICAL_P95', 'WITHIN_HISTORICAL_RANGE'].includes(a.status)) return null;
  const top = (a.near[0] || a.recent[0]);
  const trig = a.status !== 'WITHIN_HISTORICAL_RANGE';
  return { status: trig ? 'TRIGGERED' : 'CLEAR', observedAt: top?.publishedAt || new Date().toISOString(), value: a.current, unit: '則',
    baseline: a.historicalP95 != null ? { p95: a.historicalP95, windowDays: 60, samples: a.samples } : undefined,
    summary: `近 7 天台海周邊軍事航行警告 ${a.current} 則${a.historicalP95 != null ? `（60 日 P95 ${a.historicalP95} 則）` : ''}${a.near.length ? `，其中 ${a.near.length} 則區域在海峽中線以東` : ''}${top ? `；最新：${top.code} ${top.type}` : ''}。`,
    sources: [{ url: top?.url || 'https://www.msa.gov.cn/', publisher: `中國海事局（${top?.bureauName || '航行警告'}）`, sourceClass: 'OFFICIAL', publishedAt: top?.publishedAt || new Date().toISOString() }] };
}
function autoJapanJs(a) {
  if (!a || !['CARRIER_OR_NEAR_TAIWAN', 'ABOVE_HISTORICAL_P95', 'WITHIN_HISTORICAL_RANGE'].includes(a.status)) return null;
  const top = a.special[0] || a.recent[0];
  const trig = a.status !== 'WITHIN_HISTORICAL_RANGE';
  return { status: trig ? 'TRIGGERED' : 'CLEAR', observedAt: top ? `${top.date}T12:00:00+09:00` : new Date().toISOString(), value: a.current, unit: '則',
    baseline: { p95: a.historicalP95, windowDays: 60, samples: a.samples },
    summary: `近 7 天日本公布中國艦艇／軍機動向 ${a.current} 則（60 日 P95 ${a.historicalP95} 則）${a.special.length ? `，含航艦或台灣附近通過 ${a.special.length} 則` : ''}${top ? `；最新：${top.date} ${top.title.replace(/の動向について/, '')}` : ''}。`,
    sources: [{ url: top?.url || 'https://www.mod.go.jp/js/press/index.html', publisher: '日本統合幕僚監部', sourceClass: 'OFFICIAL', publishedAt: top ? `${top.date}T12:00:00+09:00` : new Date().toISOString() }] };
}

// 聯合戰備警巡／具名演習：Google News 標題，同日 2 家以上不同媒體才算確認
function autoPla(type, pla, now) {
  const a = require('./collectors/pla_joint').assessPlaJoint(pla, type, now);
  if (!a) return null;
  const label = type === 'NAMED_EXERCISE' ? '具名演習' : '聯合戰備警巡';
  if (!a.hit) return { status: 'CLEAR', observedAt: pla.lastSuccess, value: 0, unit: '則',
    summary: `近 ${type === 'NAMED_EXERCISE' ? '7 天' : '72 小時'}沒有 2 家以上媒體確認的${label}${a.pending.length ? `（另有 ${a.pending.length} 則單一媒體報導待確認）` : ''}。`, sources: [] };
  const e = a.hit;
  return { status: 'TRIGGERED', observedAt: e.firstSeen, value: e.publishers.length, unit: '家媒體',
    summary: `${e.date.slice(5).replace('-', '/')} ${e.publishers.length} 家媒體報導共軍「${e.name}」${e.sorties ? `，共機 ${e.sorties} 架次` : ''}${e.crossing ? `、${e.crossing} 架次越過中線` : ''}（${e.publishers.slice(0, 3).join('、')}）。`,
    sources: e.items.filter((it, i, arr) => arr.findIndex(x => x.publisher === it.publisher) === i).slice(0, 3)
      .map(it => ({ url: it.url, publisher: it.publisher, sourceClass: 'INDEPENDENT_MEDIA', publishedAt: it.publishedAt })) };
}
// 海纜／斷網：海纜需 2 家媒體確認（72 小時內）；斷網需 IODA 兩種資料來源同時異常
function autoInfra(cache, now) {
  const a = require('./collectors/taiwan_infra').assessInfra(cache, now);
  if (!a) return null;
  if (a.cable) return { status: 'TRIGGERED', observedAt: a.cable.firstSeen, summary: `${a.cable.label}：${a.cable.publishers.length} 家媒體報導（${a.cable.publishers.slice(0, 3).join('、')}）；原因未必是人為。`,
    sources: a.cable.items.slice(0, 2).map(it => ({ url: it.url, publisher: it.publisher, sourceClass: 'INDEPENDENT_MEDIA', publishedAt: it.publishedAt })) };
  if (a.net) return { status: 'TRIGGERED', observedAt: a.net.since, summary: `${a.net.label}：IODA ${a.net.datasources.join('、')} 同時異常，流量約少 ${a.net.drop}%。`,
    sources: [{ url: 'https://ioda.inetintel.cc.gatech.edu/country/TW', publisher: 'IODA（喬治亞理工學院）', sourceClass: 'INDEPENDENT_MEDIA', publishedAt: a.net.since }] };
  return { status: 'CLEAR', observedAt: cache.lastSuccess, summary: '近 72 小時沒有經確認的海纜中斷，IODA 未偵測到台灣或外島斷網。', sources: [] };
}
// 敏感日期：POLITICAL 類在日期後 windowDays 天內觸發；只看已發生的日期
function autoCalendar(cal, now) {
  if (!cal?.entries) return null;
  const hit = cal.entries.find(e => e.kind === 'POLITICAL' && Date.parse(`${e.date}T00:00:00+08:00`) <= now && now - Date.parse(`${e.date}T00:00:00+08:00`) <= (e.windowDays || 14) * 24 * HOUR);
  if (!hit) return { status: 'CLEAR', observedAt: new Date(now).toISOString(), summary: '目前不在已登錄的政治時間點觀察期內。', sources: [] };
  return { status: 'TRIGGERED', observedAt: `${hit.date}T00:00:00+08:00`, summary: `${hit.name}（${hit.date.slice(5).replace('-', '/')}）後 ${hit.windowDays || 14} 天觀察期。${hit.note || ''}`.slice(0, 300),
    sources: hit.source?.url ? [{ url: hit.source.url, publisher: hit.source.publisher || '來源', sourceClass: 'INDEPENDENT_MEDIA', publishedAt: `${hit.date}T00:00:00+08:00` }] : [] };
}
// 未來 14 天內（含今天前 3 天）的敏感日期，給看板與推播提醒
function upcomingDates(cal, now = Date.now()) {
  return (cal?.entries || []).filter(e => { const t = Date.parse(`${e.date}T00:00:00+08:00`); return t >= now - 3 * 24 * HOUR && t <= now + 14 * 24 * HOUR; })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function evaluateIndicator(def, theaterId, entries, ctx, now) {
  const own = entries.filter(e => e.theater === theaterId && e.indicator === def.id &&
    now - Date.parse(e.observedAt) <= (e.validHours || 168) * HOUR).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  let result = null;
  if (own.length) {
    const latest = own.find(e => e.triggered) || own[0]; // 有效期內任一觸發即算觸發
    result = { status: latest.triggered ? 'TRIGGERED' : 'CLEAR', observedAt: latest.observedAt, summary: latest.summary, sources: latest.sources, entryId: latest.id };
  }
  // 一個指標可有多個自動來源（例如國防部原文＋媒體交叉比對），任一觸發即觸發
  for (const key of [].concat(def.auto || [])) {
    const auto = key === 'ukmto' ? autoUkmto(ctx.ukmto) : key === 'uaair' ? autoUkraineAir(ctx.uaAir) : key === 'msa' ? autoMsa(ctx.msa) : key === 'jsjp' ? autoJapanJs(ctx.jsjp)
      : key.startsWith('pla:') ? autoPla(key.slice(4), ctx.pla, now) : key.startsWith('market:') ? require('./collectors/markets').assessMarket(ctx.markets, key.slice(7), now) : key.startsWith('nato:') ? require('./collectors/nato_flank').assessNato(ctx.nato, key.slice(5), now) : key === 'usni' ? require('./collectors/usni_fleet').assessCarriers(ctx.usni, theaterId, now) : key.startsWith('mob:') ? require('./collectors/mobilization').assessMobilization(ctx.mob, theaterId, key.slice(4).split('+'), now) : key.startsWith('region:') ? require('./collectors/regional').assessRegional(ctx.regional, key.slice(7), now) : key.startsWith('civil:') ? require('./collectors/taiwan_civil').assessCivil(ctx.civil, key.slice(6), now) : key.startsWith('diplo:') ? require('./collectors/diplomacy').assessDiplomacy(ctx.diplo, theaterId, key.slice(6).split('+'), now) : key === 'calendar' ? autoCalendar(ctx.calendar, now) : key === 'infra' ? autoInfra(ctx.infra, now) : autoTaiwan({ ...def, auto: key }, ctx.taiwanFeed, ctx.mndDocs, now);
    if (auto && (!result || (auto.status === 'TRIGGERED' && result.status !== 'TRIGGERED'))) result = auto;
  }
  return { id: def.id, name: def.name, tier: def.tier, group: def.group || def.id, ...(result || { status: 'UNKNOWN', summary: '有效期內沒有經覆核的觀測，無法判定。', sources: [] }) };
}

function rawLevel(indicators) {
  const trig = t => indicators.filter(i => i.tier === t && i.status === 'TRIGGERED');
  if (trig('DECISIVE').length) return { level: 4, reason: '出現決定性指標' };
  const pAll = trig('PRIMARY'), s = trig('SECONDARY');
  // 同一 group 的主要指標只算 1 項（例如同一天的共機架次、越中線、聯合戰備警巡都來自同一次行動）
  const groups = new Map();
  for (const i of pAll) groups.set(i.group || i.id, [...(groups.get(i.group || i.id) || []), i]);
  const p = [...groups.values()];
  const merged = pAll.length > p.length ? `（${pAll.length} 項觸發，屬同一行動合併計為 ${p.length} 項）` : '';
  const knownPrimary = indicators.some(i => i.tier === 'PRIMARY' && i.status !== 'UNKNOWN');
  if (!knownPrimary && !p.length && s.length < 2) return { level: null, reason: '主要指標全部無法判定' };
  if (p.length >= 2 && pAll.some(i => i.sources.some(src => QUALIFYING_SOURCES.has(src.sourceClass)))) return { level: 3, reason: `${p.length} 項獨立主要指標觸發${merged}，且有官方或獨立來源` };
  if (p.length >= 1 || s.length >= 2) return { level: 2, reason: `${p.length} 項主要${merged}、${s.length} 項次要指標觸發` };
  return { level: 1, reason: '沒有指標超過門檻' };
}

function applyHistory(theaterId, raw, history, now) {
  // 48 小時不降級、72 小時升級只看同一規則版本的紀錄；規則改版後舊等級不延續
  const all = (history.snapshots || []).filter(s => s.theater === theaterId && Number.isFinite(Date.parse(s.at)) && Date.parse(s.at) <= now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const snaps = all.filter(s => (s.ruleVersion || 'iw-v1-trial') === RULE_VERSION)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let level = raw.level, note = null;
  const last48 = snaps.filter(s => now - Date.parse(s.at) <= 48 * HOUR && Number.isInteger(s.rawLevel));
  const held = Math.max(0, ...last48.map(s => s.rawLevel));
  if (level !== null && held > level) { level = held; note = '48 小時內曾達較高等級，暫不降級'; }
  if (raw.level === 3) {
    // 72～80 小時前要有一筆第 3 級以上的紀錄當起點，期間內每筆都 ≥3，且紀錄之間不能有超過 2 小時的空白（機器人離線時不能算「持續」）
    const span = snaps.filter(s => now - Date.parse(s.at) <= 80 * HOUR);
    const anchor = span.find(s => now - Date.parse(s.at) >= 72 * HOUR && s.rawLevel >= 3);
    const fromAnchor = anchor ? span.filter(s => Date.parse(s.at) >= Date.parse(anchor.at)) : [];
    const times = [...fromAnchor.map(s => Date.parse(s.at)), now];
    const noGap = times.every((t, i) => i === 0 || t - times[i - 1] <= 2 * HOUR);
    if (anchor && noGap && fromAnchor.every(s => s.rawLevel >= 3)) { level = 4; note = '第 3 級已持續 72 小時'; }
  }
  const weekAgo = [...all].reverse().find(s => now - Date.parse(s.at) >= 7 * 24 * HOUR);
  return { level, note, previousLevel: weekAgo ? weekAgo.level ?? weekAgo.rawLevel : null };
}

function buildWarningBoard({ now = Date.now(), ledger = readJson(LEDGER_FILE, { entries: [] }), history = readJson(HISTORY_FILE, { snapshots: [] }), taiwanFeed = null, mndDocs = [], ukmto = null, uaAir = null, msa = null, jsjp = null, pla = null, calendar = null, infra = null, nato = null, markets = null, diplo = null, civil = null, usni = null, regional = null, mob = null } = {}) {
  const entries = (ledger.entries || []).filter(e => validEntry(e, now));
  const theaters = Object.entries(THEATERS).map(([id, t]) => {
    const indicators = t.indicators.map(def => evaluateIndicator(def, id, entries, { taiwanFeed, mndDocs, ukmto, uaAir, msa, jsjp, pla, calendar, infra, nato, markets, diplo, civil, usni, regional, mob }, now));
    const raw = rawLevel(indicators);
    const h = applyHistory(id, raw, history, now);
    const trend = h.level === null || h.previousLevel === null ? 'UNKNOWN' : h.level > h.previousLevel ? 'UP' : h.level < h.previousLevel ? 'DOWN' : 'FLAT';
    const watch = ledger.watch?.[id];
    return { id, name: t.name, level: h.level, levelName: h.level ? (t.activeWar && h.level === 1 ? '無升級跡象（戰事持續中）' : LEVEL_NAMES[h.level]) : '無法判定', rawLevel: raw.level, reason: h.note || raw.reason,
      previousLevel: h.previousLevel, trend,
      triggered: indicators.filter(i => i.status === 'TRIGGERED' && i.tier !== 'DEESCALATION'),
      deescalation: indicators.filter(i => i.tier === 'DEESCALATION' && i.status === 'TRIGGERED'),
      unknown: indicators.filter(i => i.status === 'UNKNOWN'), indicators,
      nextWatch: bounded(watch, 200) ? watch : null };
  });
  return { generatedAt: new Date(now).toISOString(), upcoming: upcomingDates(calendar, now), ruleVersion: RULE_VERSION, mode: 'TRIAL', pushEnabled: true, rejectedEntries: (ledger.entries || []).length - entries.length, theaters,
    note: '試行中：等級依 ANALYSIS_SPEC 規則計算，尚未完成歷史回測；不是開戰機率。「無法判定」表示缺資料，不代表平靜。' };
}

// 由單一常駐程序（bot 的資料巡檢）呼叫；每小時最多記一筆，保留 30 天
function recordWarningSnapshot(board, file = HISTORY_FILE) {
  const history = readJson(file, { snapshots: [] });
  const now = Date.parse(board.generatedAt);
  let changed = false;
  for (const t of board.theaters) {
    const last = [...history.snapshots].reverse().find(s => s.theater === t.id);
    if (last && last.rawLevel === t.rawLevel && now - Date.parse(last.at) < HOUR) continue;
    history.snapshots.push({ at: board.generatedAt, theater: t.id, rawLevel: t.rawLevel, level: t.level, ruleVersion: board.ruleVersion }); changed = true;
  }
  if (!changed) return false;
  history.snapshots = history.snapshots.filter(s => now - Date.parse(s.at) <= 40 * 24 * HOUR);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(history, null, 1));
  fs.renameSync(tmp, file);
  return true;
}

function getWarningBoard(now = Date.now()) {
  let taiwanFeed = null, mndDocs = [];
  try {
    const { getTaiwanFeed } = require('./taiwan_intel');
    const { getStore } = require('./intel_store');
    taiwanFeed = getTaiwanFeed(now); mndDocs = getStore().documents('TAIWAN_MND');
  } catch (e) { /* 資料庫不可用時台海自動指標標為無法判定 */ }
  let ukmto = null, uaAir = null;
  try { const u = require('./collectors/ukmto'); ukmto = u.assessUkmto(u.readCache(), now); } catch (e) { /* 無快取時為無法判定 */ }
  try { const a = require('./collectors/ukraine_air'); uaAir = a.assessUkraineAir(a.readCache(), now); } catch (e) { /* 無快取時為無法判定 */ }
  let msa = null, jsjp = null;
  try { const m = require('./collectors/china_msa'); msa = m.assessChinaMsa(m.readCache(), now); } catch (e) { /* 無快取 */ }
  try { const j = require('./collectors/japan_js'); jsjp = j.assessJapanJs(j.readCache(), now); } catch (e) { /* 無快取 */ }
  let pla = null;
  try { pla = require('./collectors/pla_joint').readCache(); } catch (e) { /* 無快取 */ }
  let infra = null;
  try { infra = require('./collectors/taiwan_infra').readCache(); } catch (e) { /* 無快取 */ }
  const calendar = readJson(CALENDAR_FILE, null);
  let nato = null;
  try { nato = require('./collectors/nato_flank').readCache(); } catch (e) { /* 無快取 */ }
  let markets = null;
  try { markets = require('./collectors/markets').readCache(); } catch (e) { /* 無快取 */ }
  let diplo = null;
  try { diplo = require('./collectors/diplomacy').readCache(); } catch (e) { /* 無快取 */ }
  let civil = null;
  try { civil = require('./collectors/taiwan_civil').readCache(); } catch (e) { /* 無快取 */ }
  let usni = null;
  try { usni = require('./collectors/usni_fleet').readCache(); } catch (e) { /* 無快取 */ }
  let regional = null;
  try { regional = require('./collectors/regional').readCache(); } catch (e) { /* 無快取 */ }
  let mob = null;
  try { mob = require('./collectors/mobilization').readCache(); } catch (e) { /* 無快取 */ }
  return buildWarningBoard({ now, taiwanFeed, mndDocs, ukmto, uaAir, msa, jsjp, pla, calendar, infra, nato, markets, diplo, civil, usni, regional, mob });
}

const ICON = { 1: '🟢', 2: '🟡', 3: '🟠', 4: '🔴' };
const TREND = { UP: '↑ 較上週升高', DOWN: '↓ 較上週下降', FLAT: '→ 與上週相同', UNKNOWN: '（尚無上週紀錄）' };
function warningDiscordPayload(theaterId, board = getWarningBoard()) {
  const list = theaterId ? board.theaters.filter(t => t.id === theaterId) : board.theaters;
  const lines = ['# 戰區預警看板（試行中）'];
  for (const t of list) {
    lines.push(`\n**${ICON[t.level] || '⚪'} ${t.name}：${t.level ? `第 ${t.level} 級 ${t.levelName}` : '無法判定'}** ${TREND[t.trend]}`);
    if (theaterId) lines.push(`判定：${t.reason}`);
    // 列出全部戰區（7 個）時精簡內容，才不會超過 Discord 2000 字上限
    const brief = !theaterId;
    if (!brief) for (const i of t.indicators.filter(i => i.tier === 'PRIMARY' && i.status === 'CLEAR' && i.baseline).slice(0, 2)) lines.push(`• 已查核未超標｜${i.name}：${i.summary}`);
    for (const i of t.triggered.slice(0, brief ? 2 : 5)) lines.push(brief ? `• ${i.name.split(/[（(]/)[0]}：${String(i.summary || '').slice(0, 70)}` : `• ${i.name}：${i.summary}${i.sources[0] ? ` <${i.sources[0].url}>` : ''}`);
    for (const i of t.deescalation.slice(0, brief ? 1 : 2)) lines.push(brief ? `• 降溫訊號｜${String(i.summary || '').slice(0, 60)}` : `• 降溫訊號｜${i.name}：${i.summary}${i.sources[0] ? ` <${i.sources[0].url}>` : ''}`);
    if (theaterId && t.unknown.length) lines.push(`無法判定：${t.unknown.map(i => i.name).join('、')}`);
    if (t.nextWatch) lines.push(`下一個觀察點：${t.nextWatch}`);
    if (t.id === 'taiwan_strait' && board.upcoming?.length) lines.push(`📅 敏感日期：${board.upcoming.map(d => `${d.date.slice(5).replace('-', '/')} ${d.name}`).join('、')}`);
  }
  lines.push('', board.note);
  return { sourceBacked: true, content: lines.join('\n').slice(0, 2000), files: [], embeds: [], allowedMentions: { parse: [] } };
}

// ── Discord 主動推播 ──
// 等級變化時推播該戰區；每天台北時間 08:00 後推一次全部戰區摘要。狀態檔確保同一變化只推一次。
const PUSH_FILE = path.join(__dirname, '../research/warning_push_state.json');
function planWarningPushes(board, state, now = Date.parse(board.generatedAt)) {
  const pushes = [], next = { theaters: { ...(state.theaters || {}) }, lastDigestDate: state.lastDigestDate || null };
  const localDate = new Date(now + 8 * HOUR).toISOString().slice(0, 10), localHour = new Date(now + 8 * HOUR).getUTCHours();
  for (const t of board.theaters) {
    if (t.level === null) continue; // 缺資料不推播，也不覆蓋上次等級
    const prev = next.theaters[t.id]?.level;
    if (prev !== undefined && prev !== t.level) pushes.push({ kind: 'CHANGE', theater: t.id, from: prev, to: t.level,
      eventId: `WARN_${t.id}_${prev}to${t.level}_${board.generatedAt.slice(0, 13)}` });
    next.theaters[t.id] = { level: t.level, at: board.generatedAt };
  }
  if (localHour >= 8 && next.lastDigestDate !== localDate) {
    pushes.push({ kind: 'DIGEST', theater: null, eventId: `WARN_DIGEST_${localDate}` });
    next.lastDigestDate = localDate;
  }
  return { pushes, next };
}
function pushPayload(push, board) {
  const base = warningDiscordPayload(push.theater || undefined, board);
  if (push.kind === 'DIGEST') return { ...base, content: base.content.replace('# 戰區預警看板（試行中）', '# 每日戰區預警摘要（試行中）') };
  const t = board.theaters.find(x => x.id === push.theater);
  const arrow = push.to > push.from ? '⬆️ 升級' : '⬇️ 降級';
  return { ...base, content: `# ${arrow}｜${t.name}：第 ${push.from} 級 → 第 ${push.to} 級 ${LEVEL_NAMES[push.to]}\n${base.content.replace('# 戰區預警看板（試行中）', '')}`.slice(0, 2000) };
}
async function dispatchWarningPushes(client, subscribers, { board = getWarningBoard(), file = PUSH_FILE, shouldDeliver = () => ({ deliver: true }), markDelivered = () => {}, renderMaps = null, now = Date.parse(board.generatedAt) } = {}) {
  const state = readJson(file, null);
  const { pushes, next } = planWarningPushes(board, state || {});
  // 待送清單：新推播加入全部訂閱者；同一戰區有更新的等級變化時，舊的變化不再補送；每日摘要只補送當天的
  let pending = (state?.pending || []).filter(p => now - Date.parse(p.createdAt) <= 24 * HOUR);
  for (const push of pushes) {
    pending = pending.filter(p => push.kind === 'DIGEST' ? p.kind !== 'DIGEST' : !(p.kind === 'CHANGE' && p.theater === push.theater));
    pending.push({ ...push, createdAt: new Date(now).toISOString(), users: subscribers.map(s => s.userId), attempts: {} });
  }
  const results = [];
  for (const p of pending) {
    const level = p.kind === 'CHANGE' && p.to >= 3 ? 'CRITICAL' : 'WARNING';
    const ready = [];
    for (const userId of p.users) {
      const decision = shouldDeliver(userId, { theater: p.theater || undefined, level, eventId: p.eventId, code: 'WARNING_BOARD' });
      if (decision.deliver) ready.push(userId);
      else {
        results.push({ eventId: p.eventId, userId, status: 'DEFERRED', reason: decision.reason });
        // 只有靜默時段會等之後補送；不在訂閱範圍、靜音或已送過的直接移出
        if (!/靜默/.test(decision.reason || '')) p.users = p.users.filter(u => u !== userId);
      }
    }
    if (!ready.length) continue;
    const payload = pushPayload(p, board);
    // 附戰場圖：每日摘要附全部戰區，等級變化附該戰區；畫圖失敗只送文字
    let files = [];
    if (renderMaps) { try { files = await renderMaps(p.kind === 'DIGEST' ? null : p.theater); } catch (e) { console.warn('[WARNING PUSH MAP]', e.message); } }
    for (const userId of ready) {
      try {
        const user = await client.users.fetch(userId);
        const components = p.kind === 'CHANGE' ? require('./push_buttons').buttonsFor(p.theater) : require('./push_buttons').buttonsFor('taiwan_strait', { mute: false });
        await user.send({ content: payload.content, files, components, allowedMentions: { parse: [] } });
        markDelivered(userId, p.eventId);
        p.users = p.users.filter(u => u !== userId);
        results.push({ eventId: p.eventId, userId, status: 'SENT' });
      } catch (e) {
        // 寄送失敗（例如對方關閉私訊）最多重試 5 次
        p.attempts[userId] = (p.attempts[userId] || 0) + 1;
        if (p.attempts[userId] >= 5) p.users = p.users.filter(u => u !== userId);
        results.push({ eventId: p.eventId, userId, status: 'FAILED', error: e.message });
      }
    }
  }
  next.pending = pending.filter(p => p.users.length);
  if (pushes.length || !state || results.length || (state.pending || []).length !== next.pending.length) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(next, null, 1)); fs.renameSync(tmp, file);
  }
  return results;
}

module.exports = { upcomingDates, autoPla, autoCalendar, planWarningPushes, dispatchWarningPushes, THEATERS, LEVEL_NAMES, validEntry, rawLevel, buildWarningBoard, recordWarningSnapshot, getWarningBoard, warningDiscordPayload };
