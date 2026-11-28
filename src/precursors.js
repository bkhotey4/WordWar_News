// 前兆組合：72 小時內同一戰區有多項「領先型」指標先後觸發，即使燈號還沒升級也先提醒。
// 依據：過去大型對台演習前常見「航行警告／落區公告＋共艦共機異常＋官方措辭升級」在數天內接連出現。
// 只計領先型指標（反應性的股市、報導量不算）；同一行動衍生的指標（同一 group）只算 1 項；
// 至少要有 1 項實體軍事訊號（anyOf），避免只靠言論或外交新聞成立。不是開戰預測。
const HOUR = 3600_000;
const WINDOW_HOURS = 72;

const PRECURSORS = {
  taiwan_strait: { min: 3, members: ['tw_nav_warning', 'tw_jcg_firing', 'tw_ships', 'tw_aircraft', 'tw_crossing', 'tw_air_trend', 'tw_ship_trend', 'tw_joint_patrol', 'tw_named_exercise', 'tw_japan_fleet', 'tw_dark_vessels', 'tw_coast_guard', 'tw_cn_reserve', 'tw_mobilization', 'tw_party_tone', 'tw_cn_measures', 'tw_diplomatic'],
    anyOf: ['tw_nav_warning', 'tw_jcg_firing', 'tw_ships', 'tw_aircraft', 'tw_crossing', 'tw_air_trend', 'tw_ship_trend', 'tw_japan_fleet', 'tw_dark_vessels'] },
  korea_peninsula: { min: 3, members: ['kr_missile', 'kr_nuclear', 'kr_dmz', 'kr_reserve', 'kr_homefront', 'kr_evac', 'kr_diplomatic'], anyOf: ['kr_missile', 'kr_nuclear', 'kr_dmz'] },
  iran_gulf: { min: 3, members: ['ir_us_strikes', 'ir_shipping', 'ir_gulf_retaliation', 'ir_blockade', 'ir_reserve', 'ir_homefront', 'ir_evac', 'ir_carriers', 'ir_ship_insurance', 'ir_diplomatic'],
    anyOf: ['ir_us_strikes', 'ir_shipping', 'ir_gulf_retaliation', 'ir_blockade', 'ir_carriers'] },
  europe_security: { min: 3, members: ['eu_airspace', 'eu_response', 'eu_belarus', 'eu_by_mobil', 'eu_evac', 'eu_reinforcement', 'eu_nato_art4', 'eu_diplomatic'], anyOf: ['eu_airspace', 'eu_response', 'eu_belarus', 'eu_reinforcement'] },
  south_china_sea: { min: 3, members: ['scs_clash', 'scs_block', 'scs_drill', 'scs_ally_callout', 'scs_diplomatic'], anyOf: ['scs_clash', 'scs_block', 'scs_drill'] },
  ukraine_front: { min: 3, members: ['ua_strike_volume', 'ua_strike_trend', 'ua_energy', 'ua_mobilization', 'ua_homefront', 'ua_diplomatic'], anyOf: ['ua_strike_volume', 'ua_strike_trend', 'ua_energy'] },
  middle_east: { min: 3, members: ['me_houthi', 'me_israel', 'me_rockets', 'me_reserve', 'me_homefront', 'me_evac'], anyOf: ['me_houthi', 'me_israel', 'me_rockets'] }
};

// indicators：本輪指標（含 group）；snapshots：等級快照（ind 為當時觸發的指標 id）
function assessPrecursor(theaterId, indicators, snapshots = [], now = Date.now()) {
  const rule = PRECURSORS[theaterId];
  if (!rule) return null;
  const groupOf = Object.fromEntries(indicators.map(i => [i.id, i.group || i.id]));
  const nameOf = Object.fromEntries(indicators.map(i => [i.id, i.name]));
  const seen = new Map(); // id → 最早觸發時間
  for (const s of snapshots) {
    const at = Date.parse(s.at);
    if (s.theater !== theaterId || !Array.isArray(s.ind) || !(now - at <= WINDOW_HOURS * HOUR) || at > now) continue;
    for (const id of s.ind) if (!seen.has(id) || at < seen.get(id)) seen.set(id, at);
  }
  for (const i of indicators) if (i.status === 'TRIGGERED' && !seen.has(i.id)) seen.set(i.id, now);
  const ids = [...seen.keys()].filter(id => rule.members.includes(id)).sort();
  const groups = new Set(ids.map(id => groupOf[id] || id));
  const fired = groups.size >= rule.min && ids.some(id => rule.anyOf.includes(id));
  return { fired, ids, count: groups.size, min: rule.min, windowHours: WINDOW_HOURS,
    items: ids.map(id => ({ id, name: nameOf[id] || id, firstAt: new Date(seen.get(id)).toISOString() })) };
}

// 推播判斷：成立且（72 小時內沒推過，或出現新的前兆指標）才推
function planPrecursor(theaterId, precursor, prev, now) {
  if (!precursor?.fired) return null;
  const recent = prev && now - Date.parse(prev.at) <= WINDOW_HOURS * HOUR;
  const added = precursor.ids.filter(id => !(prev?.ids || []).includes(id));
  if (recent && !added.length) return null;
  return { kind: 'PRECURSOR', theater: theaterId, ids: precursor.ids, added: recent ? added : precursor.ids, eventId: `PRECURSOR_${theaterId}_${new Date(now).toISOString().slice(0, 13)}` };
}

function precursorText(t, push) {
  const p = t.precursor;
  const lines = [`# ⚠️ 前兆組合｜${t.name}：${WINDOW_HOURS} 小時內 ${p.count} 項前兆指標接連觸發`,
    `目前燈號：第 ${t.level ?? '—'} 級（${t.levelName}）。前兆組合是「提早留意」的提醒，不是開戰預測；燈號依原規則判定。`];
  for (const i of p.items) {
    const at = new Date(Date.parse(i.firstAt) + 8 * HOUR).toISOString().slice(5, 16).replace('-', '/').replace('T', ' ');
    lines.push(`• ${push.added.includes(i.id) ? '🆕 ' : ''}${i.name.split(/[（(]/)[0]}（首次 ${at}）`);
  }
  lines.push('', '依據：大型軍事行動前，常見演習公告、兵力異常與官方措辭升級在數天內接連出現；單項觸發常是例行活動，組合才值得提早留意。');
  return lines.join('\n').slice(0, 2000);
}

module.exports = { PRECURSORS, WINDOW_HOURS, assessPrecursor, planPrecursor, precursorText };
