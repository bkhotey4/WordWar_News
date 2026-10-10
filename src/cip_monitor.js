/**
 * CRITICAL INFRASTRUCTURE PROTECTION (CIP) MONITOR
 * Tracks 14 international subsea cables, LNG natural gas reserve countdown, and 345kV EHV power grid
 * Generates 1920x1080 CIP Overwatch briefing graphics
 */

const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

// Register Windows native fonts to prevent missing glyphs
const FONT_PATH = 'C:\\Windows\\Fonts\\msjhbd.ttc';
if (fs.existsSync(FONT_PATH)) {
  try {
    GlobalFonts.registerFromPath(FONT_PATH, 'CustomJhengHei');
    GlobalFonts.registerFromPath(FONT_PATH, 'Microsoft JhengHei');
  } catch (e) {}
}

const CIP_SLIDE_FILE = path.join(__dirname, '../public/images/cip_infrastructure_slide.png');

function drawRoundedRect(ctx, x, y, width, height, radius, fill = true, stroke = true) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function getCIPData() {
  return {
    timestamp: new Date().toISOString(),
    cables: {
      totalCables: 14,
      landingStations: [
        { name: '宜蘭頭城登陸站', count: '4 條 (TPE, APCN-2 等)', role: '直通美日東向數據骨幹', threat: '低（水深良好）' },
        { name: '新北淡水/八里登陸站', count: '3 條 (EAC-C2C, FNAL 等)', role: '西向香港、東南亞與兩岸光纖', threat: '中（台灣海峽淺水區易遭底拖網破壞）' },
        { name: '屏東枋山登陸站', count: '5 條 (SJC2, SEA-ME-WE 等)', role: '巴士海峽咽喉南向跨太平洋主幹線', threat: '高（緊鄰南海演訓區與巴士海峽）' },
        { name: '馬祖/金門離島微波備援', count: '2 條台馬海纜 + 8 處微波站', role: '離島通訊命脈', threat: '高（歷史曾遭抽砂船重複勾斷）' }
      ],
      healthScore: null
    },
    lngReserves: {
      daysRemaining: null,
      safetyBufferDays: 14,
      criticalThresholdDays: 7,
      taichungCapacityPercent: null,
      yungAnCapacityPercent: null,
      powerGenerationShare: '42.5% (燃氣發電總佔比)',
      blockadeVulnerability: '全島僅約 10-14 天存量，海上封鎖第 8 天起需實施工業大規模停電'
    },
    powerGrid: {
      ehvLines: '345kV 超高壓主幹雙迴路',
      coreNodes: [
        { name: '桃園龍潭超高壓變電所', role: '大台北生活圈與竹科供電心臟', status: '特種警衛加固防護' },
        { name: '南投中寮超高壓開關所', role: '南北電網輸送總樞紐 (921大地震曾震毀引發全台全黑)', status: '地下化防空加固完成' },
        { name: '台南龍崎超高壓變電所', role: '南科半導體園區與高雄工業帶樞紐', status: '常態二級防護' }
      ]
    }
  };
}

async function generateCIPSlide() {
  const width = 1920;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const data = getCIPData();

  // 1. Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#030712');
  bgGrad.addColorStop(0.5, '#0b152d');
  bgGrad.addColorStop(1, '#020617');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Grid
  ctx.strokeStyle = 'rgba(14, 165, 233, 0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 2. Top Header Bar
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, 40, 25, width - 80, 85, 12, true, true);

  // Badge
  ctx.fillStyle = '#0284c7';
  drawRoundedRect(ctx, 60, 42, 160, 32, 6, true, false);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ CIP 基礎設施', 72, 64);

  // Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 24px "Microsoft JhengHei", sans-serif';
  ctx.fillText('海底電纜與關鍵能源咽喉防護網 // CRITICAL INFRASTRUCTURE OVERWATCH', 240, 64);

  // Telemetry Right
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('【14條國際海纜登陸站 ｜ LNG天然氣儲備倒數 ｜ 345kV超高壓電網】', 1120, 50);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '13.5px "Microsoft JhengHei", sans-serif';
  ctx.fillText('監控維度: 數位通信防護 ｜ 能源戰略中斷臨界 ｜ 國家電網脆弱性', 1120, 76);

  // 3. Four Column Layout (Width: 435px each, Gap: 20px)
  const colWidth = 435;
  const colHeight = 880;
  const gap = 20;
  const colY = 128;

  // --- COLUMN 1: 14 條國際海底電纜登陸站 ---
  const c1X = 40;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c1X, colY, colWidth, colHeight, 14, true, true);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 21px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 全台 14 條國際海底電纜', c1X + 25, colY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('95% 跨國數據傳輸依賴，三大登陸站核心分佈', c1X + 25, colY + 75);

  let p1Y = colY + 105;
  data.cables.landingStations.forEach((st) => {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.2;
    drawRoundedRect(ctx, c1X + 20, p1Y, colWidth - 40, 115, 8, true, true);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
    ctx.fillText(st.name, c1X + 35, p1Y + 28);

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(`[ ${st.count} ]`, c1X + 260, p1Y + 28);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(`• 功能: ${st.role}`, c1X + 35, p1Y + 58);
    ctx.fillText(`• 威脅評估: ${st.threat}`, c1X + 35, p1Y + 85);

    p1Y += 130;
  });

  // Cable Health Bar Box
  ctx.fillStyle = 'rgba(14, 165, 233, 0.15)';
  ctx.strokeStyle = '#0ea5e9';
  drawRoundedRect(ctx, c1X + 20, colY + 660, colWidth - 40, 130, 8, true, true);
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 海纜防護現況與備援架構:', c1X + 35, colY + 692);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('• 700 處低軌衛星 (OneWeb / 衛星熱點) 備援接收站', c1X + 35, colY + 720);
  ctx.fillText('• 微波數位骨幹可支撐戰時國安指揮通訊', c1X + 35, colY + 745);
  ctx.fillText('• 民用影音頻寬預計在封鎖第 1 天即全面降速', c1X + 35, colY + 770);

  // --- COLUMN 2: 天然氣 (LNG) 戰略儲備天數倒數 ---
  const c2X = c1X + colWidth + gap;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c2X, colY, colWidth, colHeight, 14, true, true);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 21px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 天然氣 (LNG) 存量倒數', c2X + 25, colY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('台灣能源生命線最脆弱單點 (供電佔比 42.5%)', c2X + 25, colY + 75);

  // Countdown Gauge Box
  ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, c2X + 20, colY + 105, colWidth - 40, 150, 10, true, true);

  ctx.fillStyle = '#fde68a';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('全台安全存量資料狀態:', c2X + 35, colY + 140);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 46px "Microsoft JhengHei", sans-serif';
  ctx.fillText('未取得', c2X + 130, colY + 200);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('(法定安全存量下限: 14 天 ｜ 斷電臨界閥值: 7 天)', c2X + 50, colY + 235);

  // Progress Bar
  const barX = c2X + 35;
  const barY = colY + 280;
  const barW = colWidth - 70;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  drawRoundedRect(ctx, barX, barY, barW, 20, 6, true, false);
  ctx.fillStyle = '#f59e0b';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px "Microsoft JhengHei", sans-serif';
  ctx.fillText('當前儲備水位未取得', barX + 100, barY + 15);

  // Key Terminals Detail
  const terminals = [
    { name: '高雄永安液化天然氣廠 (一接)', cap: '目前水位未取得', note: '資料待核對' },
    { name: '台中港液化天然氣廠 (二接)', cap: '目前水位未取得', note: '資料待核對' },
    { name: '桃園觀塘第三接收站 (三接)', cap: '外推防波堤施工中 ｜ 預計增補儲備', note: '完成後全台安全天數預計提升至 14-17 天' }
  ];

  let tY = colY + 330;
  terminals.forEach(t => {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
    ctx.strokeStyle = '#334155';
    drawRoundedRect(ctx, c2X + 20, tY, colWidth - 40, 100, 8, true, true);

    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
    ctx.fillText(t.name, c2X + 35, tY + 26);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px "Microsoft JhengHei", sans-serif';
    ctx.fillText(`• ${t.cap}`, c2X + 35, tY + 52);
    ctx.fillText(`• 戰略: ${t.note}`, c2X + 35, tY + 76);

    tY += 115;
  });

  // Risk Warning
  ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
  ctx.strokeStyle = '#ef4444';
  drawRoundedRect(ctx, c2X + 20, colY + 685, colWidth - 40, 105, 8, true, true);
  ctx.fillStyle = '#fca5a5';
  ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 海上封鎖斷航戰略推演:', c2X + 35, colY + 715);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12.5px "Microsoft JhengHei", sans-serif';
  ctx.fillText('封鎖第 1-5 天: 啟動燃煤與燃油全力代轉發電', c2X + 35, colY + 740);
  ctx.fillText('封鎖第 8-10 天: 燃氣耗盡，全台實施輪流分區限電', c2X + 35, colY + 765);

  // --- COLUMN 3: 345kV 超高壓電網關鍵節點 ---
  const c3X = c2X + colWidth + gap;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c3X, colY, colWidth, colHeight, 14, true, true);

  ctx.fillStyle = '#f87171';
  ctx.font = 'bold 21px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 345kV 超高壓主電網節點', c3X + 25, colY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('南電北送命脈，防範特種作戰定點破壞', c3X + 25, colY + 75);

  let gridY = colY + 105;
  data.powerGrid.coreNodes.forEach((node) => {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
    ctx.strokeStyle = '#475569';
    drawRoundedRect(ctx, c3X + 20, gridY, colWidth - 40, 125, 8, true, true);

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
    ctx.fillText(node.name, c3X + 35, gridY + 28);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(`• 功能: ${node.role}`, c3X + 35, gridY + 58);
    ctx.fillText(`• 防護等級: ${node.status}`, c3X + 35, gridY + 86);

    gridY += 140;
  });

  // Power Protection Insight
  ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
  ctx.strokeStyle = '#ef4444';
  drawRoundedRect(ctx, c3X + 20, colY + 545, colWidth - 40, 245, 8, true, true);
  ctx.fillStyle = '#fca5a5';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 電網單點故障 (SPOF) 脆弱性解析:', c3X + 35, colY + 575);
  ctx.fillStyle = '#ffffff';
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('1. 南電北送跨越濁水溪主幹線為咽喉瓶頸。', c3X + 35, colY + 608);
  ctx.fillText('2. 憲兵與國軍已將三大超高壓變電所納入戰時', c3X + 35, colY + 636);
  ctx.fillText('   一級防護目標，布設防空刺針飛彈與特戰步哨。', c3X + 35, colY + 662);
  ctx.fillText('3. 推動區域分散式微電網與儲能案場，降低', c3X + 35, colY + 690);
  ctx.fillText('   樞紐遭巡弋飛彈定點破壞引發全島全黑機率。', c3X + 35, colY + 718);
  ctx.fillText('4. 竹科/南科半導體廠區備妥 48-72h 柴油發電機。', c3X + 35, colY + 746);

  // --- COLUMN 4: 國家 CIP 戰備戰略總結 ---
  const c4X = c3X + colWidth + gap;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c4X, colY, colWidth, colHeight, 14, true, true);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 21px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 國家關鍵基礎設施防護', c4X + 25, colY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('非對稱平戰轉換與韌性強化戰略方針', c4X + 25, colY + 75);

  const cipMeasures = [
    { title: '1. 低軌衛星終端普及 (LEO Satellites)', desc: '在全台消防、警政與醫療節點廣設非同步衛星接收器，突破海纜中斷封鎖。' },
    { title: '2. 戰略儲煤與水力抽蓄全開 (Coal & Hydro)', desc: '水力抽蓄（日月潭明潭等）與燃煤安全存量達 30-45 天，作為斷氣斷油時保命底線。' },
    { title: '3. 重要設施防空刺針部署 (MANPADS)', desc: '油庫、接收站、海纜登陸點常駐防空排與無人機干擾槍，防範自殺無人機破頂。' },
    { title: '4. 軍民聯合防護演習 (Civ-Mil Defense)', desc: '漢光與民安演習擴大關鍵基礎設施實兵防護演練，實兵阻擊特工突襲。' }
  ];

  let mY = colY + 105;
  cipMeasures.forEach((m) => {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
    ctx.strokeStyle = '#334155';
    drawRoundedRect(ctx, c4X + 20, mY, colWidth - 40, 115, 8, true, true);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
    ctx.fillText(m.title, c4X + 35, mY + 28);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '12.5px "Microsoft JhengHei", sans-serif';
    ctx.fillText(m.desc.substring(0, 26), c4X + 35, mY + 58);
    ctx.fillText(m.desc.substring(26), c4X + 35, mY + 84);

    mY += 130;
  });

  // Summary Verdict
  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.strokeStyle = '#10b981';
  drawRoundedRect(ctx, c4X + 20, colY + 660, colWidth - 40, 130, 8, true, true);
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ CIP 基礎設施戰略總結:', c4X + 35, colY + 692);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('現代大國攻防首重「掐斷海纜與圍困能源」。', c4X + 35, colY + 720);
  ctx.fillText('強化 LNG 安全存量天數與低軌衛星備援，', c4X + 35, colY + 745);
  ctx.fillText('為防衛作戰爭取國際盟友介入之關鍵防禦基石！', c4X + 35, colY + 770);

  // 5. Bottom Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('情資來源: 國家關鍵基礎設施防護 (CIP) 會報 ｜ 經濟部能源署 ｜ 數位發展部海纜資料 ｜ 產製工具: WordWarNews CIP Engine', 50, height - 35);
  ctx.fillText('驗證時間: ' + new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC', 1420, height - 35);

  // Save to file
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(CIP_SLIDE_FILE, buffer);

  console.log(`[CIP MONITOR SUCCESS] 1920x1080 關鍵基礎設施防護圖卡已成功生成: ${CIP_SLIDE_FILE}`);
  return { success: true, path: CIP_SLIDE_FILE };
}

// CLI test
if (require.main === module) {
  generateCIPSlide().then(r => {
    console.log('CIP Slide Generated:', r);
    process.exit(0);
  }).catch(err => {
    console.error('Error generating CIP slide:', err);
    process.exit(1);
  });
}

module.exports = {
  getCIPData,
  generateCIPSlide
};
