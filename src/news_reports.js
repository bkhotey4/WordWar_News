const crypto = require('crypto');

const NEWS_TTL_MS = 24 * 60 * 60_000;
const MILITARY_TOPIC = /軍|戰爭|戰況|戰線|烏克蘭|俄烏|台海|共機|海警|艦|飛彈|導彈|空襲|無人機|國防|北約|封鎖|交火|進攻|撤軍|war\b|military|defen[cs]e|ukrain|missile|drone|airstrike|frontline|troops|nato|naval|blockade|ceasefire|hormuz/i;

function httpUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function plainText(value, maxLength = 240) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function recent(value, nowMs, ttl = NEWS_TTL_MS) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && time <= nowMs && nowMs - time <= ttl;
}

// A source map is not satellite evidence. Rendering requires explicit review and
// permission, plus its own date and original-post URL; a news date never fills it in.
function reviewedMap(map, nowMs) {
  if (!map || map.reviewed !== true || map.displayAllowed !== true || !recent(map.publishedAt, nowMs)) return null;
  const imageUrl = httpUrl(map.imageUrl);
  const sourceUrl = httpUrl(map.sourceUrl);
  const credit = plainText(map.credit, 100);
  const caption = plainText(map.caption, 200);
  if (!imageUrl || !sourceUrl || !credit || !caption) return null;
  return { imageUrl, sourceUrl, credit, caption, publishedAt: map.publishedAt, kind: 'SOURCE_MAP' };
}

function buildNewsReports(live = {}, nowMs = Date.now()) {
  const seen = new Set();
  return (Array.isArray(live.latestBreakingNews) ? live.latestBreakingNews : [])
    .filter(item => item && recent(item.publishedAt, nowMs))
    .map(item => {
      const title = plainText(item.title, 300);
      const sourceUrl = httpUrl(item.link);
      const source = plainText(item.source, 100);
      // Only text received with this article is displayed. Never infer a body from
      // the title, region, a different article, or an unlinked STAC product.
      const summary = item.summarySourceUrl === sourceUrl ? plainText(item.summary) : '';
      if (!title || !source || !sourceUrl || !MILITARY_TOPIC.test(`${title} ${summary}`) || seen.has(sourceUrl)) return null;
      seen.add(sourceUrl);
      return {
        id: crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 16),
        title, summary: summary === title ? '' : summary,
        source, sourceUrl, publishedAt: item.publishedAt,
        reportType: summary && summary !== title ? 'SOURCE_EXCERPT' : 'HEADLINE_ONLY',
        verification: 'SOURCE_CLAIM_UNVERIFIED',
        map: reviewedMap(item.map, nowMs)
      };
    }).filter(Boolean)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function discordReportText(report) {
  const date = new Date(report.publishedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  return [
    `### ${date}｜${report.title}`,
    report.summary ? `**來源報導摘錄：** ${report.summary}` : '僅取得標題，完整事件細節待核對原文。',
    `來源：${report.source}｜單一來源待核對`,
    report.sourceUrl,
    report.map ? `地圖：${report.map.credit}｜${report.map.publishedAt}｜${report.map.sourceUrl}` : '事件地圖未取得；不以其他地區或日期的圖片代替。'
  ].join('\n');
}

module.exports = { buildNewsReports, reviewedMap, plainText, discordReportText, httpUrl };
