// 推播下方的快捷按鈕：看戰場圖、預警看板、準備清單、此戰區靜音 24 小時。
// 按鈕以 Discord API 原始格式（type 1 列、type 2 按鈕）產生，不依賴 discord.js 的 Builder。
const MAP_THEATERS = new Set(['ukraine_front', 'taiwan_strait', 'iran_gulf', 'europe_security', 'middle_east', 'sudan', 'myanmar', 'south_china_sea']);
const WARN_THEATERS = new Set(['taiwan_strait', 'iran_gulf', 'europe_security', 'ukraine_front', 'korea_peninsula', 'south_china_sea', 'middle_east']);
const NAMES = { ukraine_front: '烏俄', taiwan_strait: '台海', iran_gulf: '美伊', europe_security: '歐洲北約', middle_east: '以巴', sudan: '蘇丹', myanmar: '緬甸', south_china_sea: '南海', korea_peninsula: '朝鮮半島' };
const btn = (label, id, style = 2) => ({ type: 2, style, label, custom_id: id });

function buttonsFor(theater, { prepare = theater === 'taiwan_strait', mute = true } = {}) {
  const row = [];
  if (MAP_THEATERS.has(theater)) row.push(btn('🗺️ 看戰場圖', `ww:map:${theater}`, 1));
  if (WARN_THEATERS.has(theater)) row.push(btn('📶 預警看板', `ww:warn:${theater}`));
  if (prepare) row.push(btn('🧺 準備清單', 'ww:prep'));
  if (mute && theater && NAMES[theater]) row.push(btn(`🔕 ${NAMES[theater]}靜音 24 小時`, `ww:mute:${theater}`, 4));
  return row.length ? [{ type: 1, components: row.slice(0, 5) }] : [];
}

function parse(customId) {
  const m = String(customId || '').match(/^ww:(map|warn|prep|mute|unmute)(?::([a-z_]+))?$/);
  return m ? { action: m[1], theater: m[2] || null } : null;
}

async function handleButton(interaction, deps = {}) {
  const p = parse(interaction.customId);
  if (!p) return false;
  const sm = deps.subscriptions || require('./subscription_manager');
  if (p.action === 'mute' || p.action === 'unmute') {
    if (p.theater && !NAMES[p.theater]) return false;
    const until = p.action === 'mute' ? new Date(Date.now() + 24 * 3600_000).toISOString() : null;
    sm.setTheaterMute(interaction.user.id, p.theater, until);
    await interaction.reply({ content: until ? `已將「${NAMES[p.theater]}」靜音 24 小時（到 ${new Date(Date.parse(until) + 8 * 3600_000).toISOString().slice(5, 16).replace('T', ' ')}）。緊急（危機級）推播仍會送達。` : `已取消「${NAMES[p.theater]}」靜音。`,
      components: until ? [{ type: 1, components: [btn('取消靜音', `ww:unmute:${p.theater}`)] }] : [] });
    return true;
  }
  await interaction.deferReply();
  try {
    let payload;
    if (p.action === 'map') payload = await require('./battle_map').battleMapDiscordPayload(p.theater);
    else if (p.action === 'warn') payload = require('./warning_board').warningDiscordPayload(p.theater || undefined);
    else if (p.action === 'prep') payload = require('./preparedness').prepareDiscordPayload({});
    await interaction.editReply({ content: payload.content, files: payload.files || [], embeds: payload.embeds || [], allowedMentions: { parse: [] } });
    for (const part of payload.extra || []) await interaction.followUp({ content: part, allowedMentions: { parse: [] } });
  } catch (e) { await interaction.editReply({ content: `暫時無法產生：${e.message}` }); }
  return true;
}

module.exports = { buttonsFor, parse, handleButton };
