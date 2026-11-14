'use strict';
// Slash 指令定義與實際註冊到 Discord 的指令名單
const { SlashCommandBuilder } = require('discord.js');
const INTEL_COMMAND_NAMES = ['weekly','prepare','poster','battle-map','warning','global-brief','taiwan-status','taiwan-trend','events','corrections','satellite','satellite-compare','alert-explain','war-report','analysis-health','firms','notam','evidence','backtest','preferences','osint-fusion','coverage-gap'];
// 只有這些指令會註冊（2026-10-27 起）：查詢內容都在網站，Discord 只留網站做不到的——事件原文證據、依人數換算的準備清單、訂閱設定。
// 其餘指令的定義與處理程式保留，要恢復就加回名單
const REGISTERED_COMMAND_NAMES = new Set(['evidence', 'prepare', 'preferences', 'dm-subscribe', 'dm-unsubscribe', 'help']);

// Define Slash Commands (Pure Text & Image Focus)
const commands = [
  new SlashCommandBuilder().setName('coverage-gap').setDescription('戰區覆蓋缺口：光學軌次、整片雲量與官方來源更新時間'),
  new SlashCommandBuilder().setName('osint-fusion').setDescription('公開來源並列（實驗）：官方動態、熱點、禁航、衛星與震動')
    .addStringOption(option => option.setName('theater').setDescription('指定戰區（不填＝全球關鍵戰區綜合研判）').setRequired(false).addChoices(
      { name: '全球關鍵戰區綜合研判', value: 'all' },
      { name: '台海與周邊西太平洋戰區', value: 'taiwan_strait' },
      { name: '烏俄前線與邊界縱深戰區', value: 'ukraine_front' },
      { name: '美伊戰爭、荷莫茲海峽與波斯灣', value: 'iran_gulf' },
      { name: '以巴、黎巴嫩與紅海航道', value: 'middle_east' },
      { name: '北約東翼與波羅的海防禦走廊', value: 'europe_security' },
      { name: '南海島礁與第一島鏈水域', value: 'south_china_sea' }
    )),
  new SlashCommandBuilder().setName('global-brief').setDescription('全球戰況、衛星證據與有條件情境推演'),
  new SlashCommandBuilder().setName('poster').setDescription('戰況海報：簡報風格重點大圖（熱區、關鍵數字、武器、兵力估計、三大重點）')
    .addStringOption(opt => opt.setName('theater').setDescription('戰區（不填＝全球重點海報）').setRequired(false)
      .addChoices({ name: '烏俄戰爭', value: 'ukraine_front' }, { name: '台海', value: 'taiwan_strait' }, { name: '美伊與荷莫茲', value: 'iran_gulf' },
        { name: '歐洲與北約東翼', value: 'europe_security' }, { name: '以巴、黎巴嫩與紅海', value: 'middle_east' }, { name: '南海', value: 'south_china_sea' },
        { name: '蘇丹', value: 'sudan' }, { name: '緬甸', value: 'myanmar' })),
  new SlashCommandBuilder().setName('battle-map').setDescription('戰場圖：衛星底圖＋有來源的控制區與事件＋中文說明')
    .addStringOption(opt => opt.setName('theater').setDescription('戰區').setRequired(true)
      .addChoices({ name: '烏俄戰爭', value: 'ukraine_front' }, { name: '台海', value: 'taiwan_strait' }, { name: '美伊與荷莫茲', value: 'iran_gulf' },
        { name: '歐洲與北約東翼', value: 'europe_security' }, { name: '以巴、黎巴嫩與紅海', value: 'middle_east' }, { name: '南海', value: 'south_china_sea' },
        { name: '蘇丹', value: 'sudan' }, { name: '緬甸', value: 'myanmar' }))
    .addStringOption(opt => opt.setName('sector').setDescription('烏俄方向（不填則自動選本週變化最大的方向）').setRequired(false)
      .addChoices({ name: '全線概覽', value: 'overview' }, { name: '哈爾科夫—庫皮揚斯克', value: 'kharkiv_kupiansk' }, { name: '利曼—謝維爾斯克', value: 'lyman_siversk' },
        { name: '波克羅夫斯克—康斯坦丁尼夫卡', value: 'pokrovsk_kostiantynivka' }, { name: '札波羅熱', value: 'zaporizhzhia' }, { name: '赫爾松—第聶伯河', value: 'kherson' })),
  new SlashCommandBuilder().setName('weekly').setDescription('每週戰況週報圖卡：7 天警戒等級、本週與上週比較、本週重點'),
  new SlashCommandBuilder().setName('prepare').setDescription('準備清單：目前台海準備階段＋依人數天數換算要買什麼（國防部全民安全指引）')
    .addIntegerOption(opt => opt.setName('people').setDescription('家中人數（預設 1）').setRequired(false).setMinValue(1).setMaxValue(20))
    .addIntegerOption(opt => opt.setName('days').setDescription('儲備天數（官方建議至少 7 天）').setRequired(false).setMinValue(1).setMaxValue(30)),
  new SlashCommandBuilder().setName('warning').setDescription('戰區預警看板（試行中）：七個戰區的四級警戒與觸發指標')
    .addStringOption(opt => opt.setName('theater').setDescription('指定戰區（不填則列出全部）').setRequired(false)
      .addChoices({ name: '台海', value: 'taiwan_strait' }, { name: '美伊戰爭與荷莫茲海峽', value: 'iran_gulf' },
        { name: '歐洲與北約東翼', value: 'europe_security' }, { name: '烏俄戰爭', value: 'ukraine_front' },
        { name: '朝鮮半島', value: 'korea_peninsula' }, { name: '南海', value: 'south_china_sea' }, { name: '以巴、黎巴嫩與紅海', value: 'middle_east' })),
  new SlashCommandBuilder().setName('taiwan-status').setDescription('台海官方通報與來源統計'),
  new SlashCommandBuilder().setName('taiwan-trend').setDescription('台海官方歷史觀測與資料缺口'),
  new SlashCommandBuilder().setName('events').setDescription('事件時間線：已覆核事件、原文修訂、研究稿更正與預警等級變化'),
  new SlashCommandBuilder().setName('corrections').setDescription('更正紀錄：原文修訂、研究稿被取代或停止展示'),
  new SlashCommandBuilder().setName('alert-explain').setDescription('統計異常觀察的依據、樣本與偵測限制'),
  new SlashCommandBuilder().setName('war-report').setDescription('查閱通過來源檢查的中文戰況研究稿'),
  new SlashCommandBuilder().setName('firms').setDescription('NASA FIRMS 衛星近即時熱異常與戰場火點遙測')
    .addStringOption(option => option.setName('theater').setDescription('觀測戰區').setRequired(false).addChoices(
      { name: '烏俄前線與邊境戰區', value: 'ukraine_front' },
      { name: '台海與東南沿海演訓區', value: 'taiwan_strait' },
      { name: '中東要地與紅海沿岸', value: 'middle_east' }
    )),
  new SlashCommandBuilder().setName('notam').setDescription('飛航公告 (NOTAM) 與海空軍事訓練管制查詢'),
  new SlashCommandBuilder().setName('analysis-health').setDescription('查閱研究排程與覆核狀態'),
  ...['satellite','satellite-compare'].map(name=>new SlashCommandBuilder().setName(name)
    .setDescription(name==='satellite' ? '已下載 Sentinel-2 衛星影像' : '衛星影像提供目視')
    .addStringOption(option=>option.setName('region').setDescription('影像區域').setRequired(true).addChoices(
      {name:'龍田（台海）',value:'longtian'},{name:'仙賓礁（南海）',value:'sabina'},
      {name:'托羅佩茨（俄國）',value:'toropets'},{name:'蘇瓦烏基走廊（波蘭）',value:'suwalki'},
      {name:'基輔周邊（烏克蘭）',value:'ukraine_civil'},{name:'荷莫茲海峽／阿巴斯港',value:'hormuz_bandar_abbas'},
      {name:'加薩',value:'gaza_civil'},{name:'喀土穆（蘇丹）',value:'khartoum_civil'},{name:'曼德勒（緬甸）',value:'mandalay_civil'}))),
  new SlashCommandBuilder()
    .setName('airspace')
    .setDescription('查詢近期 OpenSky ADS-B 更新與來源狀態'),

  new SlashCommandBuilder()
    .setName('osint')
    .setDescription('檢查公開空域訊號更新與主題來源狀態'),

  new SlashCommandBuilder()
    .setName('sky-scan')
    .setDescription('顯示近期 OpenSky 公開 ADS-B 在空訊號'),

  new SlashCommandBuilder()
    .setName('imint')
    .setDescription('檢查衛星影像產品目錄與來源驗證狀態')
    .addStringOption(option =>
      option.setName('theater')
        .setDescription('查詢衛星產品目錄狀態')
        .setRequired(false)
        .addChoices(
      { name: '全部戰區', value: 'all' },
      { name: '仙賓礁（南海）', value: 'sabina' },
      { name: '龍田與東部戰區', value: 'longtian' },
      { name: '歐洲與俄烏戰場', value: 'europe' },
      { name: '蘇瓦烏基走廊', value: 'suwalki' }
        )
    ),

  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('【來源查證】輸入任何新聞或消息，比對來源並整理查證結果')
    .addStringOption(opt => opt.setName('text').setDescription('欲查證的新聞標題或事件描述').setRequired(true)),

  new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('立即重新抓取外電與官方資料'),

  new SlashCommandBuilder()
    .setName('briefing')
    .setDescription('公開來源摘要（文字版）'),

  new SlashCommandBuilder()
    .setName('limitations')
    .setDescription('系統已知限制：研究排程、資料來源、衛星影像等'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('指令與私訊關鍵字說明'),

  new SlashCommandBuilder()
    .setName('dm-briefing')
    .setDescription('把最新公開來源摘要私訊給你'),

  new SlashCommandBuilder()
    .setName('daily-briefing')
    .setDescription('手動送出晨報或晚報（管理員送給全體訂閱者，其他人只送給自己）')
    .addStringOption(option =>
      option.setName('time')
        .setDescription('選擇晨報 (08:00) 或晚報 (20:00)')
        .setRequired(false)
        .addChoices(
          { name: '🌅 晨間戰情要聞 (08:00 Morning)', value: 'MORNING' },
          { name: '🌙 晚間戰況總結 (20:00 Evening)', value: 'EVENING' }
        )
    ),

  new SlashCommandBuilder()
    .setName('evidence')
    .setDescription('【事件證據頁】查詢事件的原文摘錄、時間、地點、來源關聯與矛盾說法')
    .addStringOption(option =>
      option.setName('event_id')
        .setDescription('事件編號（留空則顯示近期事件清單）')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('backtest')
    .setDescription('預警回測：各指標對歷次台海大型演習的命中、漏報、誤報與提前天數'),

  new SlashCommandBuilder()
    .setName('preferences')
    .setDescription('【訂閱設定】查看或調整戰區訂閱與靜默時段'),

  new SlashCommandBuilder()
    .setName('dm-subscribe')
    .setDescription('【訂閱私訊】登記您的帳號，即時接收後續重大戰況通知'),

  new SlashCommandBuilder()
    .setName('dm-unsubscribe')
    .setDescription('【取消訂閱】取消私訊推播戰情報告')
].map(command => command.toJSON());

module.exports = { commands, INTEL_COMMAND_NAMES, REGISTERED_COMMAND_NAMES };
