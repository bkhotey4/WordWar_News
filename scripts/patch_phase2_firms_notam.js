const fs = require('fs');
const path = require('path');

// 1. Update src/server.js
const serverPath = path.join(__dirname, '../src/server.js');
let serverCode = fs.readFileSync(serverPath, 'utf8');

if (!serverCode.includes('fetchFirmsData')) {
  serverCode = serverCode.replace(
    "const { getSatelliteFeed } = require('./satellite_assets');",
    "const { getSatelliteFeed } = require('./satellite_assets');\nconst { fetchFirmsData } = require('./firms_monitor');\nconst { getNotamFeed } = require('./notam_monitor');"
  );
  serverCode = serverCode.replace(
    "app.get('/api/satellite-assets', (req,res) => { res.set('Cache-Control','no-store').json(getSatelliteFeed(typeof req.query.region==='string'?req.query.region:undefined)); });",
    `app.get('/api/satellite-assets', (req,res) => { res.set('Cache-Control','no-store').json(getSatelliteFeed(typeof req.query.region==='string'?req.query.region:undefined)); });
app.get('/api/firms', async (req, res) => {
  const theater = typeof req.query.theater === 'string' ? req.query.theater : 'ukraine_front';
  const data = await fetchFirmsData(theater);
  res.set('Cache-Control', 'no-store').json(data);
});
app.get('/api/notam', (req, res) => { res.set('Cache-Control', 'no-store').json(getNotamFeed()); });`
  );
  fs.writeFileSync(serverPath, serverCode, 'utf8');
  console.log('[OK] src/server.js updated with /api/firms and /api/notam.');
}

// 2. Update src/sentry.js
const sentryPath = path.join(__dirname, '../src/sentry.js');
let sentryCode = fs.readFileSync(sentryPath, 'utf8');

if (!sentryCode.includes('getNotamFeed')) {
  sentryCode = sentryCode.replace(
    "const { getTaiwanFeed } = require('./taiwan_intel');",
    "const { getTaiwanFeed } = require('./taiwan_intel');\nconst { getNotamFeed } = require('./notam_monitor');"
  );

  const notamCheck = `  // 2. NOTAM Military Airspace Restriction Advance Warning
  try {
    const notamFeed = getNotamFeed(now);
    const criticalNotam = (notamFeed.advanceWarnings || []).find(n => n.threatLevel === 'HIGH_PRIORITY_ADVANCE' || n.status === 'ACTIVE_NOW');
    if (criticalNotam) {
      const title = 'NOTAM 演訓禁航通告預警：' + criticalNotam.title + '（編號 ' + criticalNotam.id + '）';
      if (!isRecentlyAlerted(title, 'ELEVATED')) {
        return {
          level: 'ELEVATED',
          code: 'NOTAM_EXERCISE_ADVANCE_WARNING',
          title,
          category: '海空管制前置預警',
          summary: '管轄情報區 ' + criticalNotam.fir + '。' + criticalNotam.location + '，高度 ' + criticalNotam.lowerLimit + '-' + criticalNotam.upperLimit + '。有效時間 ' + criticalNotam.validFrom + ' 至 ' + criticalNotam.validTo + '（剩餘約 ' + criticalNotam.leadTimeHours + ' 小時開始）。此為國際民航公告演訓預警。',
          sourceUrl: 'https://www.mnd.gov.tw/',
          observedAt: criticalNotam.validFrom
        };
      }
    }
  } catch (err) {
    // Fail closed on evaluation error
  }`;

  const target = "  // ADS-B transponder emergency codes are observable signals, not proof of a military event.";
  if (sentryCode.includes(target)) {
    sentryCode = sentryCode.replace(target, notamCheck + '\n\n' + target);
    fs.writeFileSync(sentryPath, sentryCode, 'utf8');
    console.log('[OK] src/sentry.js updated with NOTAM advance warning check.');
  }
}

// 3. Update src/bot.js
const botPath = path.join(__dirname, '../src/bot.js');
let botCode = fs.readFileSync(botPath, 'utf8');

if (!botCode.includes('fetchFirmsData')) {
  botCode = botCode.replace(
    "const { satelliteDiscordPayload } = require('./satellite_assets');",
    "const { satelliteDiscordPayload } = require('./satellite_assets');\nconst { fetchFirmsData, firmsDiscordPayload } = require('./firms_monitor');\nconst { getNotamFeed, notamDiscordPayload } = require('./notam_monitor');"
  );
  botCode = botCode.replace(
    "const INTEL_COMMAND_NAMES = ['taiwan-status','taiwan-trend','events','corrections','satellite','satellite-compare','alert-explain','war-report','analysis-health'];",
    "const INTEL_COMMAND_NAMES = ['taiwan-status','taiwan-trend','events','corrections','satellite','satellite-compare','alert-explain','war-report','analysis-health','firms','notam'];"
  );

  // Add Slash Commands
  const slashTarget = "new SlashCommandBuilder().setName('war-report').setDescription('查閱目前通過來源檢查的中文戰況研究稿'),";
  const slashReplacement = `new SlashCommandBuilder().setName('war-report').setDescription('查閱目前通過來源檢查的中文戰況研究稿'),
  new SlashCommandBuilder().setName('firms').setDescription('NASA FIRMS 衛星近即時熱異常與戰場火點遙測')
    .addStringOption(option => option.setName('theater').setDescription('觀測戰區').setRequired(false).addChoices(
      { name: '烏俄前線與邊境戰區', value: 'ukraine_front' },
      { name: '台海與東南沿海演訓區', value: 'taiwan_strait' },
      { name: '中東要地與紅海沿岸', value: 'middle_east' }
    )),
  new SlashCommandBuilder().setName('notam').setDescription('航空禁航通告 (NOTAM) 與海空軍事演訓前置管制預警'),`;
  botCode = botCode.replace(slashTarget, slashReplacement);

  // Handle command dispatch
  const dispatchTarget = "else if(commandName==='war-report')payload=researchDiscordPayload();";
  const dispatchReplacement = `else if(commandName==='war-report')payload=researchDiscordPayload();
        else if(commandName==='firms') {
          const theater = interaction.options.getString('theater') || 'ukraine_front';
          const feed = await fetchFirmsData(theater);
          payload = firmsDiscordPayload(feed);
        }
        else if(commandName==='notam') {
          payload = notamDiscordPayload();
        }`;
  botCode = botCode.replace(dispatchTarget, dispatchReplacement);

  // Handle DM triggers
  const dmTarget = "} else if (/(戰況報導|war-report)/.test(msgText)) {";
  const dmReplacement = `} else if (/(火點|熱異常|熱點|firms)/.test(msgText)) {
        sourcePayload = firmsDiscordPayload(await fetchFirmsData());
      } else if (/(禁航|禁航區|notam|演習通告|射擊通報)/.test(msgText)) {
        sourcePayload = notamDiscordPayload();
      } else if (/(戰況報導|war-report)/.test(msgText)) {`;
  botCode = botCode.replace(dmTarget, dmReplacement);

  // Update createHelpPayload
  const helpTarget = "• `/alert-explain`：統計觀察的觸發依據與不足處。";
  const helpReplacement = "• `/alert-explain`：統計觀察的觸發依據與不足處。\n      • `/firms`：NASA FIRMS 衛星實體火點與戰場熱異常遙測。\n      • `/notam`：航空禁航通告 (NOTAM) 與海空演習前置預警。";
  botCode = botCode.replace(helpTarget, helpReplacement);

  const helpTipTarget = "私訊可輸入「台海」、「空情」、「在空機」";
  botCode = botCode.replace(helpTipTarget, "私訊可輸入「台海」、「火點」、「禁航」、「空情」、「在空機」");

  fs.writeFileSync(botPath, botCode, 'utf8');
  console.log('[OK] src/bot.js updated with FIRMS and NOTAM slash commands & DM triggers.');
}

console.log('[COMPLETED] Phase 2 integration patch complete.');
