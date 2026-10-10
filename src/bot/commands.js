'use strict';
// Slash 指令定義與實際註冊到 Discord 的指令名單
const { SlashCommandBuilder } = require('discord.js');
const INTEL_COMMAND_NAMES = ['weekly','prepare','poster','battle-map','warning','global-brief','taiwan-status','taiwan-trend','events','corrections','satellite','satellite-compare','alert-explain','war-report','analysis-health','firms','notam','evidence','backtest','preferences'];
// 只有這些指令會註冊；其他舊專題已暫停，定義保留但不送到 Discord
const REGISTERED_COMMAND_NAMES = new Set([
  ...INTEL_COMMAND_NAMES,
  'dm-subscribe', 'dm-unsubscribe', 'sentry', 'refresh', 'dm-briefing',
  'imint', 'airspace', 'osint', 'sky-scan', 'help', 'briefing', 'daily-briefing', 'limitations'
]);

// Define Slash Commands (Pure Text & Image Focus)
const commands = [
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
    .setName('russian-flight')
    .setDescription('【俄羅斯特殊飛行器 RA-01966 現蹤中線】泉州外海盤旋、誤導試探與中俄協同特報 (附圖卡)'),

  new SlashCommandBuilder()
    .setName('radar-track')
    .setDescription('【海空實體軌跡動態雷達】ADS-B 美軍電偵機與中共海警萬噸船動態航圖 (附即時雷達圖卡)'),

  new SlashCommandBuilder()
    .setName('infra')
    .setDescription('能源設施參考資料（尚未取得可驗證來源）'),

  new SlashCommandBuilder()
    .setName('shelter')
    .setDescription('【行政區防空避難所查詢】輸入行政區秒查 B2 地下掩體與蓄水站 (附民防圖卡)')
    .addStringOption(option =>
      option.setName('district')
        .setDescription('輸入縣市行政區 (例如: 台北市中正區, 板橋, 西屯, 左營)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('fact-check')
    .setDescription('【認知作戰與戰前闢謠雷達】戰前「元首離境、美軍棄台、全台全黑」四大謠言拆解'),

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
    .setName('ukraine-front')
    .setDescription('【俄烏前線接觸線戰術態勢】紅軍城樞紐、庫斯克反撲與運河巷戰 (附1920x1080軍規戰術圖卡)'),

  new SlashCommandBuilder()
    .setName('readiness')
    .setDescription('【全球軍事實體準備與三階段動員】北約155mm產能、俄軍戰時動員與中共三階段動員燈號 (附圖卡)'),

  new SlashCommandBuilder()
    .setName('strike-tracker')
    .setDescription('【俄羅斯戰略縱深戰損清單】俄境煉油廠襲擊、黑海艦隊撤離新羅西斯克與戰略轟炸機疏散'),

  new SlashCommandBuilder()
    .setName('drone-tech')
    .setDescription('【現代無人機與電戰黑科技】抗干擾光纖FPV、UMPK滑翔炸彈與低空皮卡獵殺隊實戰解剖'),

  new SlashCommandBuilder()
    .setName('test-alert')
    .setDescription('【實兵演練測試】立即模擬一次「主動突發威脅報警」推送至您的私訊'),

  new SlashCommandBuilder()
    .setName('sentry')
    .setDescription('【哨兵雷達狀態】查看 24/7 背景主動巡檢狀態、最後掃描時間與四大防線指標'),

  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('【來源查證】輸入任何新聞或消息，比對來源並整理查證結果')
    .addStringOption(opt => opt.setName('text').setDescription('欲查證的新聞標題或事件描述').setRequired(true)),

  new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('【即時刷新情報】立即抓取最新外電與國防數據，重新渲染 PPT 簡報圖卡'),

  new SlashCommandBuilder()
    .setName('ww3')
    .setDescription('【歐戰WWIII與亞洲聯動】歐亞雙戰線大戰想定、美軍產能牽制與亞洲前線引爆點分析 (附即時PPT圖卡)'),

  new SlashCommandBuilder()
    .setName('china')
    .setDescription('【中國動態與後備動員】解放軍平戰轉換、滾裝渡輪徵用與集結異常指標評估 (附即時PPT圖卡)'),

  new SlashCommandBuilder()
    .setName('finance')
    .setDescription('【戰略金融預警 FININT】美債拋售、勞合社海運戰險、實體黃金儲備與主權CDS異動監測 (附即時PPT圖卡)'),

  new SlashCommandBuilder()
    .setName('survival')
    .setDescription('【戰時避難與逃生裝備】疏散方向、防空掩體設施、72小時避難包必備清單 (附第三張民防PPT圖卡)'),

  new SlashCommandBuilder()
    .setName('briefing')
    .setDescription('【戰情前線日報】獲取最新戰場動態與武器實戰解剖 (一般文字大字號排版)'),

  new SlashCommandBuilder()
    .setName('taiwan-strait')
    .setDescription('【台海每日戰術態勢圖】共軍演習、戰備警巡、中線越界與灰色地帶衝突 (附1920x1080高解析地圖)'),

  new SlashCommandBuilder()
    .setName('asia')
    .setDescription('【亞太軍事情報網】第一島鏈五大關鍵戰術咽喉、兵力部署與海空封控 (附1920x1080軍規圖卡)'),

  new SlashCommandBuilder()
    .setName('nato')
    .setDescription('【歐洲北約前線】蘇瓦烏基走廊戰情與武器技術解剖 (伊斯坎德爾 vs 愛國者)'),

  new SlashCommandBuilder()
    .setName('middle-east')
    .setDescription('【中東與紅海戰區】荷姆茲海峽、曼德海峽反艦飛彈與全球航運繞道 (附戰略圖卡)'),

  new SlashCommandBuilder()
    .setName('strike-targets')
    .setDescription('【關鍵設施飽和打擊清單】台海或東歐重要晶圓廠、煉油廠、電網與空軍基地目標預警')
    .addStringOption(option =>
      option.setName('theater')
        .setDescription('選擇戰區目標清單')
        .setRequired(false)
        .addChoices(
          { name: '🇹🇼 台海方向高價值關鍵目標 (台積電/麥寮六輕/LNG/佳山洞庫)', value: 'taiwan' },
      { name: '歐洲與俄烏戰場', value: 'europe' }
        )
    ),

  new SlashCommandBuilder()
    .setName('hud')
    .setDescription('【Web 戰情指揮儀表板】獲取本機全功能互動式戰情室 HUD 網址與即時操作指引'),

  new SlashCommandBuilder()
    .setName('weapon')
    .setDescription('【尖端武器庫】四大現役突防武器規格圖鑑 (Geran-5, 暴風影, 海馬斯, 匕首)'),

  new SlashCommandBuilder()
    .setName('crisis-index')
    .setDescription('【全球危機看板】全球五大衝突熱點升級指數與誘因評估'),

  new SlashCommandBuilder()
    .setName('wargame')
    .setDescription('【兵棋推演模擬】蘇瓦烏基 48h 閃電戰 vs 台海多軸封鎖階段推演'),

  new SlashCommandBuilder()
    .setName('radar')
    .setDescription('【空中情監偵】AWACS 預警機與電子偵察機動態 (E-3A、RC-135、P-8A)'),

  new SlashCommandBuilder()
    .setName('map')
    .setDescription('【軍規情報地圖】調取高解析戰術軍規情報地圖套組 (含即時PPT總看板)'),

  new SlashCommandBuilder()
    .setName('limitations')
    .setDescription('【系統已知限制與誠信須知】查閱包含研究排程、資料來源、衛星影像等8項核心須知'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('【情報目錄與指令清單】查看所有可調取之專題戰情與私訊關鍵字'),

  new SlashCommandBuilder()
    .setName('dm-briefing')
    .setDescription('【私訊推播】將戰情日報直接推送至您的 Discord 私訊'),

  new SlashCommandBuilder()
    .setName('daily-briefing')
    .setDescription('【每日晨報 / 晚報】立即手動調取今日 08:00 晨報或 20:00 晚間戰況總結特報 (附雙圖卡)')
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
