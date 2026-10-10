const fs = require('fs');
const path = require('path');

const botFile = path.join(__dirname, '../src/bot.js');
let code = fs.readFileSync(botFile, 'utf8');

// List of function names that must return sourceBacked: true
const targetFunctions = [
  'createWW3DualTheaterPayload',
  'createChinaMobilizationPayload',
  'createFinancePayload',
  'createSurvivalPayload',
  'createShelterPayload',
  'createCognitivePayload',
  'createAsiaPayload',
  'createTaiwanStraitTacticalPayload',
  'createRussianFlightPayload',
  'createEuropePayload',
  'createWeaponsPayload',
  'createCrisisIndexPayload',
  'createMiddleEastPayload',
  'createStrikeTargetsPayload',
  'createWebHUDPayload',
  'createWargamePayload',
  'createRadarPayload',
  'createMapPayload'
];

for (const fnName of targetFunctions) {
  // Find function fnName(...) { ... return { ... }; }
  const fnRegex = new RegExp(`(function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?return\\s*\\{)([\\s\\S]*?\\n\\s*\\};)`);
  const match = code.match(fnRegex);
  if (match) {
    if (!match[2].includes('sourceBacked: true')) {
      const updatedReturn = match[1] + '\n    sourceBacked: true,' + match[2];
      code = code.replace(match[0], updatedReturn);
      console.log(`[PATCHED] Added sourceBacked: true to ${fnName}`);
    } else {
      console.log(`[SKIP] ${fnName} already has sourceBacked: true`);
    }
  } else {
    console.warn(`[WARN] Could not find function ${fnName}`);
  }
}

// Upgrade createHelpPayload
const newHelpLines = [
  "function createHelpPayload() {",
  "  return {",
  "    sourceBacked: true,",
  "    content: [",
  "      '# 🌐 全球戰情指揮中心 (WordWar_News) 指令全集 // COMMAND DIRECTORY',",
  "      '> 💡 *提示：所有指令均支援 Discord 斜線指令（/）或於私訊中直接輸入關鍵字！*',",
  "      '',",
  "      '### 📡 一、 即時空情與航空遙測',",
  "      '• `/airspace`（關鍵字：`空情`）：台海在空動態與中線正面巡航即時彙整',",
  "      '• `/sky-scan`（關鍵字：`在空機`）：OpenSky 實時 ADS-B 航空器狀態與代碼',",
  "      '• `/taiwan-strait`（關鍵字：`台海`）：台海戰術態勢圖、灰色地帶模式與防衛部署',",
  "      '• `/radar-track`（關鍵字：`航跡`）：海空實體動態航圖與電偵機巡弋圈',",
  "      '',",
  "      '### 🛰️ 二、 天基偵照與關鍵基礎設施',",
  "      '• `/imint`（關鍵字：`偵照`）：高解析衛星空拍目標情資（仙賓礁、龍田機場、托羅佩茨）',",
  "      '• `/infra`（關鍵字：`海纜`）：海底電纜、LNG 天然氣接收站與黑啟動電網防護',",
  "      '',",
  "      '### ⚔️ 三、 前線戰況與國防戰術科技',",
  "      '• `/ukraine-front`（關鍵字：`俄烏`）：紅軍城、庫斯克、托列茨克、查西夫雅爾與北約東翼最新 SITREP',",
  "      '• `/drone-tech`（關鍵字：`無人機`）：抗干擾光纖 FPV、熱爾貝拉 (Gerbera) 貨櫃海射機、UMPK 滑翔彈',",
  "      '• `/strike-tracker`（關鍵字：`煉油廠`）：遠程深層打擊戰果、俄煉油廠與黑海艦隊戰損追蹤',",
  "      '• `/readiness`（關鍵字：`軍事準備`）：北約 155mm 產能、俄兵員招募與解放軍三階段動員指標',",
  "      '',",
  "      '### 🌐 四、 全域戰略與民防求生',",
  "      '• `/asia`（關鍵字：`亞太`）：第一島鏈五大戰術咽喉特報',",
  "      '• `/nato`（關鍵字：`北約`）：北約東翼前沿與飛彈防禦體系',",
  "      '• `/finance`（關鍵字：`金融`）：FININT 戰前資金動向、美債清倉與海運戰險指標',",
  "      '• `/survival`（關鍵字：`避難`）：戰時疏散方向與 72 小時緊急避難包（Go-Bag）清單',",
  "      '• `/shelter <行政區>`（關鍵字：`避難所 板橋`）：全台防空地下掩體與緊急配水站查詢',",
  "      '• `/fact-check`（關鍵字：`認知作戰`）：戰前假訊息與心戰原型闢謠指引',",
  "      '',",
  "      '### ⚙️ 五、 哨兵系統與自動排程',",
  "      '• `/sentry`（關鍵字：`哨兵`）：24/7 自動情報巡檢狀態與異常偵測日誌',",
  "      '• `/refresh`（關鍵字：`更新`）：手動重整所有資料來源與重新計算',",
  "      '• `/briefing`（關鍵字：`戰報`）：即時來源資料摘要與最新外電',",
  "      '• `/daily-briefing`：08:00 晨報 / 20:00 晚報戰情報導',",
  "      '• `/dm-subscribe`（關鍵字：`訂閱`）：訂閱私訊重大事件主動推播'",
  "    ].join('\\n'),",
  "    files: []",
  "  };",
  "}"
].join('\n');

const helpRegex = /function createHelpPayload\(\)\s*\{[\s\S]*?\n\}/;
if (helpRegex.test(code)) {
  code = code.replace(helpRegex, newHelpLines);
  console.log('[PATCHED] Upgraded createHelpPayload directory');
}

// Remove premature sourceQuery block in DM handler
const dmPrematureBlockRegex = /\s*const sourceQuery = \/help\|[\s\S]*?await message\.reply\(\{ content: payload\.content, files: payload\.files \};\s*return;\s*\}/;
if (dmPrematureBlockRegex.test(code)) {
  code = code.replace(dmPrematureBlockRegex, '\n      let payload;');
  console.log('[PATCHED] Removed premature sourceQuery block in DM handler');
} else {
  console.warn('[WARN] Could not find dmPrematureBlockRegex');
}

fs.writeFileSync(botFile, code, 'utf8');
console.log('[SUCCESS] bot.js patching complete');
