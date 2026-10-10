const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, '../src/bot.js');
let code = fs.readFileSync(botPath, 'utf8');

// 1. Require SYSTEM_LIMITATIONS
if (!code.includes("require('./health_monitor')")) {
  code = code.replace(
    "const { researchDiscordPayload } = require('./research_reports');",
    "const { researchDiscordPayload } = require('./research_reports');\nconst { SYSTEM_LIMITATIONS } = require('./health_monitor');"
  );
}

// 2. Add createLimitationsPayload
if (!code.includes('function createLimitationsPayload()')) {
  const limitationsFunc = `function createLimitationsPayload() {
  return {
    sourceBacked: true,
    content: [
      '# 系統已知限制與誠信須知',
      ...SYSTEM_LIMITATIONS.map((lim, idx) => \`• **[\${idx + 1}]** \${lim}\`)
    ].join('\\n'),
    files: []
  };
}

`;
  code = code.replace(
    'function createHelpPayload()',
    limitationsFunc + 'function createHelpPayload()'
  );
}

// 3. Update createHelpPayload
code = code.replace(
  "'• `/sentry`、`/refresh`：巡檢狀態與重新擷取。',",
  "'• `/sentry`、`/refresh`：巡檢狀態與重新擷取。',\n      '• `/limitations`：系統已知限制與誠信須知（8 項核心說明）。',"
);
code = code.replace(
  "'私訊可輸入「空情」、「在空機」、「衛星」、「晨報」、「更新」或「哨兵」。',",
  "'私訊可輸入「空情」、「在空機」、「衛星」、「晨報」、「更新」、「哨兵」或「限制」。',"
);

// 4. Update createSentryStatusPayload
if (!code.includes('系統限制與誠信須知請輸入')) {
  code = code.replace(
    "'待查通知不能代表事件已核實。'",
    "'待查通知不能代表事件已核實。',\n      '系統限制與誠信須知請輸入「限制」或 `/limitations`。'"
  );
}

// 5. Add SlashCommandBuilder for limitations
if (!code.includes("setName('limitations')")) {
  const limitationCommand = `  new SlashCommandBuilder()
    .setName('limitations')
    .setDescription('【系統已知限制與誠信須知】查閱包含研究排程、資料來源、衛星影像等8項核心須知'),

`;
  code = code.replace(
    "  new SlashCommandBuilder()\n    .setName('help')",
    limitationCommand + "  new SlashCommandBuilder()\n    .setName('help')"
  );
  // Also handle \r\n if needed
  if (!code.includes("setName('limitations')")) {
    code = code.replace(
      "  new SlashCommandBuilder()\r\n    .setName('help')",
      limitationCommand.replace(/\n/g, '\r\n') + "  new SlashCommandBuilder()\r\n    .setName('help')"
    );
  }
}

// 6. Whitelist registration
code = code.replace(
  "'help', 'briefing', 'daily-briefing'",
  "'help', 'briefing', 'daily-briefing', 'limitations'"
);

// 7. DM keyword listener
if (!code.includes("limitations)")) {
  code = code.replace(
    "if (/(help|目錄|功能|指令|選單)/.test(msgText) || msgText === '?') {",
    "if (/(help|目錄|功能|指令|選單)/.test(msgText) || msgText === '?') {\n        sourcePayload = createHelpPayload();\n      } else if (/(限制|須知|誠信|limitations)/.test(msgText)) {\n        sourcePayload = createLimitationsPayload();"
  );
  if (!code.includes("limitations)")) {
    code = code.replace(
      "if (/(help|目錄|功能|指令|選單)/.test(msgText) || msgText === '?') {\r\n",
      "if (/(help|目錄|功能|指令|選單)/.test(msgText) || msgText === '?') {\r\n        sourcePayload = createHelpPayload();\r\n      } else if (/(限制|須知|誠信|limitations)/.test(msgText)) {\r\n        sourcePayload = createLimitationsPayload();\r\n"
    );
  }
}

// 8. Supported commands and switch in interactionCreate
code = code.replace(
  "const supportedCommands = new Set(['dm-briefing', 'imint', 'airspace', 'osint', 'sky-scan', 'help', 'briefing', 'daily-briefing']);",
  "const supportedCommands = new Set(['dm-briefing', 'imint', 'airspace', 'osint', 'sky-scan', 'help', 'briefing', 'daily-briefing', 'limitations']);"
);

if (!code.includes("case 'limitations':")) {
  code = code.replace(
    "case 'help':\n          payload = createHelpPayload();\n          break;",
    "case 'limitations':\n          payload = createLimitationsPayload();\n          break;\n        case 'help':\n          payload = createHelpPayload();\n          break;"
  );
  if (!code.includes("case 'limitations':")) {
    code = code.replace(
      "case 'help':\r\n          payload = createHelpPayload();\r\n          break;",
      "case 'limitations':\r\n          payload = createLimitationsPayload();\r\n          break;\r\n        case 'help':\r\n          payload = createHelpPayload();\r\n          break;"
    );
  }
}

fs.writeFileSync(botPath, code, 'utf8');
console.log('Successfully patched src/bot.js with limitations command and keywords.');
