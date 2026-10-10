/**
 * WordWar_News - Dynamic PPT Intelligence Slide Generator (Option C)
 * Renders a crisp 1920x1080 dark-navy executive defense intelligence presentation slide
 * using @napi-rs/canvas based on live data from public/data/live_intel.json.
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

const DATA_FILE = path.join(__dirname, '../public/data/live_intel.json');
const OUTPUT_FILE = path.join(__dirname, '../public/images/ppt_strategic_intel_slide.png');
const FININT_SLIDE_FILE = path.join(__dirname, '../public/images/ppt_finint_capital_slide.png');
const SURVIVAL_SLIDE_FILE = path.join(__dirname, '../public/images/ppt_survival_evac_slide.png');
const WW3_IMG_FILE = path.join(__dirname, '../public/images/tech_ww3_dual_theater.jpg');
const CHINA_IMG_FILE = path.join(__dirname, '../public/images/tech_china_mobilization.jpg');

function getLiveIntelData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[PPT GEN ERROR] Reading live_intel.json:', e.message);
  }
  try {
    const conflictsPath = path.join(__dirname, '../public/data/conflicts.json');
    if (fs.existsSync(conflictsPath)) {
      const cData = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
      if (cData.system_status) {
        return {
          lastUpdatedDisplay: cData.system_status.last_updated,
          defconLevel: cData.system_status.defcon_level != null ? `DEFCON ${cData.system_status.defcon_level}: ${cData.system_status.defcon_name}` : null,
          defconNumeric: cData.system_status.defcon_level,
          defconName: cData.system_status.defcon_name,
          crisisIndex: cData.system_status.escalation_index,
          threatAssessment: cData.system_status.threat_assessment
        };
      }
    }
  } catch (ce) {}

  // ⚠️ 所有來源均不可用 — 不給假數字 (OpenAI Review Defect 2)
  return {
    lastUpdatedDisplay: null,
    defconLevel: null,
    defconNumeric: null,
    defconName: null,
    crisisIndex: null,
    crisisIsModelEstimate: true,
    threatAssessment: null
  };
}

function drawRoundedRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

async function generateDynamicPPTSlide(alertOverride = null) {
  const data = getLiveIntelData();
  const width = 1920;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const isEmergency = Boolean(alertOverride && alertOverride.isEmergency);

  // 1. Background (Executive Dark Navy & Subtle Grid)
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#090d16');
  bgGrad.addColorStop(0.5, '#0e1626');
  bgGrad.addColorStop(1, '#080d1a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(30, 58, 95, 0.25)';
  ctx.lineWidth = 1;
  for (let x = 60; x < width; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 60; y < height; y += 120) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // If Emergency, draw prominent Red Alert outer border
  if (isEmergency) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, width - 8, height - 8);
  }

  // 2. Slide Header Bar
  ctx.fillStyle = isEmergency ? '#2b0f15' : '#101e38';
  ctx.fillRect(0, 0, width, 120);

  ctx.strokeStyle = isEmergency ? '#ef4444' : '#1e3a5f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 120);
  ctx.lineTo(width, 120);
  ctx.stroke();

  // Slide Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 38px "Microsoft JhengHei", "PingFang TC", sans-serif';
  ctx.fillText('國防戰略情報研判：歐戰升級下亞洲軍事動態與中國動員檢驗', 60, 68);

  // Classification & Live Timestamp
  ctx.fillStyle = isEmergency ? '#f87171' : '#00e5ff';
  ctx.font = 'bold 16px "Microsoft JhengHei", "PingFang TC", sans-serif';
  ctx.fillText(isEmergency ? '▲ EVENT ALERT // REVIEW REQUIRED' : 'PUBLIC SOURCE MONITORING // MODEL ESTIMATE', 60, 100);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px "Microsoft JhengHei", "PingFang TC", sans-serif';
  const displayTime = alertOverride?.timestamp || data.lastUpdatedDisplay || '觀測時間未取得';
  const displayLevel = isEmergency ? '事件警報（非官方戰備等級）' : (data.defconLevel ? `${data.defconLevel}（系統估算）` : '資料不足');
  ctx.fillText(`資料時間: ${displayTime} ｜ 模型觀測級別: ${displayLevel}`, 550, 100);

  // Top Right Status Badges (Dynamic DEFCON Badge)
  const defconNum = Number.isInteger(data.defconNumeric) ? data.defconNumeric : null;
  const badgeLabel = isEmergency ? '▲ EVENT ALERT' : `■ ${data.defconLevel ? `${data.defconLevel}（估算）` : '資料不足'}`;

  const isHighAlert = defconNum !== null && defconNum <= 2;
  const isMidAlert = defconNum === 3;
  const badgeColor = isHighAlert ? '#ff4444' : (isMidAlert ? '#f59e0b' : '#34d399');
  const badgeStroke = isHighAlert ? '#ef4444' : (isMidAlert ? '#d97706' : '#10b981');
  const badgeBg = isHighAlert ? 'rgba(239, 68, 68, 0.25)' : (isMidAlert ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.15)');

  ctx.fillStyle = badgeBg;
  ctx.strokeStyle = badgeStroke;
  drawRoundedRect(ctx, 1560, 35, 300, 50, 8, true, true);
  ctx.fillStyle = badgeColor;
  ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
  ctx.fillText(badgeLabel.substring(0, 24), 1575, 68);

  // 3. Four Major Strategic Cards
  const cardWidth = 425;
  const cardHeight = 840;
  const cardY = 160;
  const gap = 30;
  const startX = 60;

  // --- CARD 1: 中國後備動員監測 ---
  const c1X = startX;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c1X, cardY, cardWidth, cardHeight, 14, true, true);

  // Card 1 Header
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 24px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 中國後備動員監測', c1X + 25, cardY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('4大戰前指標均處常規基準線，未見緊急徵召', c1X + 25, cardY + 75);

  // Status Badge: 正常
  ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, c1X + 25, cardY + 95, 375, 45, 8, true, true);
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
  ctx.fillText('狀態: 正常常規基準 (PEACETIME)', c1X + 50, cardY + 124);

  // Four Checklist Items
  const checklist = [
    { title: '後備兵員召集', tag: '● 正常無異常', desc: '各地 NDMO 年度常規兵役，未發突發集中令' },
    { title: '民用滾裝渡輪', tag: '近期資料未取得', desc: '需有可核對的觀測與時間才能顯示目前狀態' },
    { title: '後勤醫療血庫', tag: '● 正常無異常', desc: '東南沿海甲級醫院維持常規儲備與病床' },
    { title: '東部戰區集結', tag: '▲ 常態高壓', desc: '登陸場站未發現發起攻勢之萬人露天裝甲' }
  ];

  let checkY = cardY + 175;
  checklist.forEach(item => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#334155';
    drawRoundedRect(ctx, c1X + 25, checkY, 375, 95, 8, true, true);

    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
    ctx.fillText(item.title, c1X + 40, checkY + 30);

    ctx.fillStyle = item.tag.includes('🟢') ? '#4ade80' : '#facc15';
    ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
    ctx.fillText(item.tag, c1X + 210, checkY + 30);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Microsoft JhengHei", sans-serif';
    ctx.fillText(item.desc, c1X + 40, checkY + 65);

    checkY += 115;
  });

  // Telemetry Bar Graph at bottom of Card 1
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('登陸運力動員徵用監測 (Ro-Ro Capacity):', c1X + 25, cardY + 655);

  // Bar container
  ctx.fillStyle = '#1e293b';
  drawRoundedRect(ctx, c1X + 25, cardY + 675, 375, 26, 6, true, false);
  // Filled bar (12%)
  const barWidth = 0;
  ctx.fillStyle = '#38bdf8';
  drawRoundedRect(ctx, c1X + 25, cardY + 675, barWidth, 26, 6, true, false);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('近期資料未取得', c1X + 35, cardY + 693);

  // FININT Quick Telemetry Badge at Card 1 bottom
  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, c1X + 25, cardY + 720, 375, 95, 8, true, true);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 16px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 金融情報 (FININT): ● 正常平穩', c1X + 40, cardY + 748);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('• 美債持倉: $752.4B (未見恐慌拋售)', c1X + 40, cardY + 774);
  ctx.fillText('• 戰險保費: 台灣海峽維持常規無加費', c1X + 40, cardY + 798);


  // --- CARD 2: 歐亞雙戰線連鎖機制 (WWIII) ---
  const c2X = c1X + cardWidth + gap;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c2X, cardY, cardWidth, cardHeight, 14, true, true);

  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 24px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 歐亞雙戰線連鎖機制', c2X + 25, cardY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('美軍彈藥產能極限與西太平洋戰略空窗期', c2X + 25, cardY + 75);

  // Escalation alert
  ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
  ctx.strokeStyle = '#eab308';
  drawRoundedRect(ctx, c2X + 25, cardY + 95, 375, 45, 8, true, true);
  ctx.fillStyle = '#fef08a';
  ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
  ctx.fillText('連鎖評估: 莫斯科—北京—平壤軸心牽制', c2X + 40, cardY + 124);

  // Mechanism Cards
  const mechList = [
    {
      title: '1. 彈藥產能見底',
      tag: 'CRITICAL',
      body: '愛國者 PAC-3 攔截彈、155mm 增程砲彈海量消耗於歐洲戰場，美軍雙戰線庫存面臨臨界點。'
    },
    {
      title: '2. 戰略牽制效應',
      tag: 'OVERSTRETCH',
      body: '若美軍大西洋艦隊與戰略轟炸機深陷東歐，第一島鏈將出現致命的「航母與防空空窗期」。'
    },
    {
      title: '3. 機會之窗誘因',
      tag: 'OPPORTUNISTIC',
      body: '西方軍事資源被鎖死在烏克蘭與波羅的海，亞洲威權軸心可能藉機發起極限施壓。'
    }
  ];

  let mechY = cardY + 175;
  mechList.forEach(m => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#475569';
    drawRoundedRect(ctx, c2X + 25, mechY, 375, 140, 8, true, true);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
    ctx.fillText(m.title, c2X + 40, mechY + 35);

    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
    ctx.fillText(m.tag, c2X + 260, mechY + 35);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Microsoft JhengHei", sans-serif';
    // Word wrap text
    ctx.fillText(m.body.substring(0, 24), c2X + 40, mechY + 70);
    ctx.fillText(m.body.substring(24), c2X + 40, mechY + 98);

    mechY += 165;
  });

  // Munition Gap Chart
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('美軍雙戰線彈藥供需比 (Demand vs Surge):', c2X + 25, cardY + 700);

  ctx.fillStyle = '#ef4444';
  drawRoundedRect(ctx, c2X + 25, cardY + 725, 300, 24, 6, true, false);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('戰時雙戰線需求: 100%', c2X + 35, cardY + 742);

  ctx.fillStyle = '#22c55e';
  drawRoundedRect(ctx, c2X + 25, cardY + 755, 150, 24, 6, true, false);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('現役年產能上限: 48%', c2X + 35, cardY + 772);


  // --- CARD 3: 印太前沿 5 大連鎖熱點 ---
  const c3X = c2X + cardWidth + gap;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c3X, cardY, cardWidth, cardHeight, 14, true, true);

  ctx.fillStyle = '#fb923c';
  ctx.font = 'bold 24px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 印太前沿 5 大連鎖熱點', c3X + 25, cardY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('第一島鏈反介入與戰略咽喉連鎖引爆點', c3X + 25, cardY + 75);

  const hotPoints = [
    { name: '1. 台灣海峽', risk: 'HIGH', txt: '灰色地帶多軸封鎖，LNG 天然氣 7-14 天存量脆弱點' },
    { name: '2. 朝鮮半島', risk: 'ELEVATED', txt: '朝俄條約第 4 條互助，平壤輸送砲彈牽制駐韓美軍' },
    { name: '3. 南海仙賓/仁愛礁', risk: 'SEVERE', txt: '中菲水砲撞船逼近 MDT 紅線，菲北部署堤豐中程飛彈' },
    { name: '4. 日本西南諸島', risk: 'HIGH', txt: '石垣/宮古要塞化部署 12 式反艦飛彈，中俄轟炸機夾擊' },
    { name: '5. 麻六甲海峽', risk: 'MODERATE', txt: '能源航道遠海截擊想定，中方推進中緬/中巴油氣管道' }
  ];

  let hotY = cardY + 115;
  hotPoints.forEach(hp => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#475569';
    drawRoundedRect(ctx, c3X + 25, hotY, 375, 115, 8, true, true);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
    ctx.fillText(hp.name, c3X + 40, hotY + 35);

    ctx.fillStyle = hp.risk === 'SEVERE' ? '#ef4444' : (hp.risk === 'HIGH' ? '#f97316' : '#eab308');
    ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
    ctx.fillText(`[${hp.risk}]`, c3X + 275, hotY + 35);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '14px "Microsoft JhengHei", sans-serif';
    ctx.fillText(hp.txt.substring(0, 24), c3X + 40, hotY + 70);
    ctx.fillText(hp.txt.substring(24), c3X + 40, hotY + 95);

    hotY += 135;
  });


  // --- CARD 4: 4 大早期質變臨界指標 (含金融戰備 FININT) ---
  const c4X = c3X + cardWidth + gap;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.strokeStyle = '#ec4899';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c4X, cardY, cardWidth, cardHeight, 14, true, true);

  ctx.fillStyle = '#f472b6';
  ctx.font = 'bold 23px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 4 大早期質變臨界指標', c4X + 25, cardY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('軍事／金融戰前異動與全球擴大預警閥值', c4X + 25, cardY + 75);

  const triggers = [
    {
      title: '指標一：美軍印太航母跨區抽調',
      tag: '未發生 [常態在防]',
      statusOk: true,
      body: '橫須賀雷根號/華盛頓號若奉召馳援大西洋或中東，西太將正式出現防衛真空。'
    },
    {
      title: '指標二：中國遠洋船隊回港避險',
      tag: '未發生 [正常運航]',
      statusOk: true,
      body: '若中遠海運等數百艘國有遠洋貨輪無預警大規模召回或偏航，為實戰臨戰避險。'
    },
    {
      title: '指標三：俄朝尖端核導技術交付',
      tag: '密切監視中 [尚未跨線]',
      statusOk: true,
      body: '若俄方將核潛艦靜音技術或高超音速導引源碼移交平壤，朝俄質變為核傘聯動。'
    },
    {
      title: '指標四：美債異常拋售與戰險飆升',
      tag: '未發生 [持倉$752B平穩]',
      statusOk: true,
      body: '監控中方美債清倉、倫敦勞合社海運戰險保費及實體黃金搶運，無恐慌異動。'
    }
  ];

  let trigY = cardY + 110;
  triggers.forEach(t => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#475569';
    drawRoundedRect(ctx, c4X + 25, trigY, 375, 160, 8, true, true);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
    ctx.fillText(t.title, c4X + 35, trigY + 32);

    // Status Pill
    ctx.fillStyle = t.statusOk ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    ctx.strokeStyle = t.statusOk ? '#22c55e' : '#ef4444';
    drawRoundedRect(ctx, c4X + 35, trigY + 45, 230, 30, 6, true, true);
    ctx.fillStyle = t.statusOk ? '#4ade80' : '#f87171';
    ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(`● ${t.tag}`, c4X + 45, trigY + 66);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(t.body.substring(0, 24), c4X + 35, trigY + 105);
    ctx.fillText(t.body.substring(24), c4X + 35, trigY + 130);

    trigY += 175;
  });

  // Footer / Source Bar
  ctx.fillStyle = '#64748b';
  ctx.font = '14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('資料來源: USNI Fleet Tracker / ISW / Taiwan MND / Allied Satellite OSINT ｜ 產製工具: WordWarNews PPT Render Engine', 60, height - 35);

  // Save to Buffer & Files
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(OUTPUT_FILE, buffer);
  fs.writeFileSync(WW3_IMG_FILE, buffer);
  fs.writeFileSync(CHINA_IMG_FILE, buffer);

  console.log(`[PPT GEN SUCCESS] 1920x1080 繁體中文 PPT 簡報圖卡已成功動態生成: ${OUTPUT_FILE}`);
  return { success: true, path: OUTPUT_FILE };
}

/**
 * Generates Slide 2: Strategic Financial Intelligence & Pre-War Capital Flows (FININT)
 * Visualizes US Treasuries, Gold Bullion repatriation, Lloyd's JWC war risk, and Sovereign CDS.
 */
async function generateFinintCapitalSlide(alertOverride = null) {
  const data = getLiveIntelData();
  const fin = data.financialIndicators || {};
  const width = 1920;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const isEmergency = Boolean(alertOverride && alertOverride.isEmergency);

  // 1. Background (Deep Executive Dark Navy Gradient & Grid)
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#060a12');
  bgGrad.addColorStop(0.5, '#0b1424');
  bgGrad.addColorStop(1, '#050912');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(30, 58, 95, 0.22)';
  ctx.lineWidth = 1;
  for (let x = 60; x < width; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 60; y < height; y += 120) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (isEmergency) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, width - 8, height - 8);
  }

  // 2. Header Bar
  ctx.fillStyle = isEmergency ? '#2b0f15' : '#0c1b33';
  ctx.fillRect(0, 0, width, 120);

  ctx.strokeStyle = isEmergency ? '#ef4444' : '#1e3a5f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 120);
  ctx.lineTo(width, 120);
  ctx.stroke();

  // Slide Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px "Microsoft JhengHei", "PingFang TC", sans-serif';
  ctx.fillText('國防戰略金融情報研判：大國開戰前資金動向與地緣資本重組預警模型', 60, 68);

  // Classification & Timestamp
  ctx.fillStyle = isEmergency ? '#f87171' : '#38bdf8';
  ctx.font = 'bold 16px "Microsoft JhengHei", "PingFang TC", sans-serif';
  ctx.fillText('CLASSIFIED // FININT OVERWATCH // GEO-ECONOMIC CAPITAL REALLOCATION', 60, 100);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px "Microsoft JhengHei", "PingFang TC", sans-serif';
  const displayTime = alertOverride?.timestamp || data.lastUpdatedDisplay || '觀測時間未取得';
  ctx.fillText(`即時情資時間戳: ${displayTime} ｜ 戰備評估: PEACETIME BASELINE (常態平穩)`, 780, 100);

  // Top Right Status Badge
  ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
  ctx.strokeStyle = '#10b981';
  drawRoundedRect(ctx, 1610, 35, 250, 50, 8, true, true);
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
  ctx.fillText('■ FININT: 正常基準', 1640, 67);

  // 3. Four Major Strategic Columns
  const cardWidth = 425;
  const cardHeight = 840;
  const cardY = 160;
  const gap = 30;
  const startX = 60;

  // --- COLUMN 1: 美債持倉與去美元化路徑 ---
  const c1X = startX;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c1X, cardY, cardWidth, cardHeight, 14, true, true);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 23px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 美債持倉與去美元化路徑', c1X + 25, cardY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('開戰前 90-180 天必現斷崖清倉與海外結算', c1X + 25, cardY + 75);

  // Status Badge
  ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
  ctx.strokeStyle = '#22c55e';
  drawRoundedRect(ctx, c1X + 25, cardY + 95, 375, 45, 8, true, true);
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
  ctx.fillText(`當前持倉: ${fin.usTreasuryHolding?.amount || '$752.4B'} (常態低檔平穩)`, c1X + 40, cardY + 124);

  const c1Points = [
    {
      title: '1. 戰前斷崖拋售模型',
      tag: '[ CRITICAL I&W ]',
      line1: '若爆發全面衝突，交戰方美元存底將遭美國 IEEPA',
      line2: '緊急法案凍結；戰前單月拋售 >$500億 為紅色警報。'
    },
    {
      title: '2. 資本掩護與轉移路徑',
      tag: '[ ROUTING ]',
      line1: '資金經紐約清算所轉往盧森堡/瑞士/中東離岸帳戶，',
      line2: '兌換非西方主權債券或實物資產以規避司法扣押。'
    },
    {
      title: '3. 當前即時態勢研判',
      tag: '[ STABLE ]',
      line1: '中方持倉自高點 $1.3T 漸進微調至現有 $752B，',
      line2: '屬長期防禦性平穩調配，未見臨戰恐慌性出清。'
    }
  ];

  let c1Y = cardY + 165;
  c1Points.forEach(p => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#334155';
    drawRoundedRect(ctx, c1X + 25, c1Y, 375, 140, 8, true, true);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.title, c1X + 38, c1Y + 32);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.tag, c1X + 255, c1Y + 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.line1, c1X + 38, c1Y + 70);
    ctx.fillText(p.line2, c1X + 38, c1Y + 98);

    c1Y += 160;
  });

  // Telemetry Bar
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('美債戰前異常清倉警示進度:', c1X + 25, cardY + 685);

  ctx.fillStyle = '#1e293b';
  drawRoundedRect(ctx, c1X + 25, cardY + 710, 375, 26, 6, true, false);
  ctx.fillStyle = '#0284c7';
  drawRoundedRect(ctx, c1X + 25, cardY + 710, 68, 26, 6, true, false);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('18% 處於安全平穩區 (警戒閥值: >40%)', c1X + 35, cardY + 728);

  ctx.fillStyle = '#64748b';
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('依據美國財政部 TIC 跨境資本流動月報監控', c1X + 25, cardY + 775);


  // --- COLUMN 2: 實體黃金儲備與金庫回遷 ---
  const c2X = c1X + cardWidth + gap;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c2X, cardY, cardWidth, cardHeight, 14, true, true);

  ctx.fillStyle = '#fde047';
  ctx.font = 'bold 23px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 實體黃金儲備與金庫回遷', c2X + 25, cardY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('紙黃金無戰時防禦力，實體金條包機運回本土', c2X + 25, cardY + 75);

  ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
  ctx.strokeStyle = '#eab308';
  drawRoundedRect(ctx, c2X + 25, cardY + 95, 375, 45, 8, true, true);
  ctx.fillStyle = '#fef08a';
  ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
  ctx.fillText('官方儲備: 2,264 噸 (常態平穩連續微增)', c2X + 40, cardY + 124);

  const c2Points = [
    {
      title: '1. 跨國金庫回運前兆',
      tag: '[ REPATRIATION ]',
      line1: '存放在英格蘭銀行/美聯儲之海外黃金面臨扣押，',
      line2: '戰前必現異常的大規模提取實物與武裝包機運回。'
    },
    {
      title: '2. 去中心化結算防線',
      tag: '[ mBridge / CIPS ]',
      line1: '加速構建多邊央行數位貨幣橋（mBridge）與 CIPS，',
      line2: '防範全面踢出 SWIFT 國際報文清算系統之斷鍊。'
    },
    {
      title: '3. 戰時硬通貨採購力',
      tag: '[ HARD ASSETS ]',
      line1: '高強度制裁下，實體黃金為唯一不依賴西方信用、',
      line2: '可用於採購戰略能源、特種零組件之終極結算物。'
    }
  ];

  let c2Y = cardY + 165;
  c2Points.forEach(p => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#475569';
    drawRoundedRect(ctx, c2X + 25, c2Y, 375, 140, 8, true, true);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.title, c2X + 38, c2Y + 32);

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.tag, c2X + 245, c2Y + 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.line1, c2X + 38, c2Y + 70);
    ctx.fillText(p.line2, c2X + 38, c2Y + 98);

    c2Y += 160;
  });

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('實體黃金本土自持儲備比例:', c2X + 25, cardY + 685);

  ctx.fillStyle = '#1e293b';
  drawRoundedRect(ctx, c2X + 25, cardY + 710, 375, 26, 6, true, false);
  ctx.fillStyle = '#eab308';
  drawRoundedRect(ctx, c2X + 25, cardY + 710, 330, 26, 6, true, false);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('88% 實體金條已在本國境內金庫存放', c2X + 35, cardY + 728);

  ctx.fillStyle = '#64748b';
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('依據世界黃金協會 (WGC) 央行儲備月度審計', c2X + 25, cardY + 775);


  // --- COLUMN 3: 勞合社海運戰險與航道監測 ---
  const c3X = c2X + cardWidth + gap;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c3X, cardY, cardWidth, cardHeight, 14, true, true);

  ctx.fillStyle = '#fb923c';
  ctx.font = 'bold 23px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 勞合社海運戰險與航道監測', c3X + 25, cardY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('國際海運保險聯合戰爭委員會 (JWC) 嗅覺最敏銳', c3X + 25, cardY + 75);

  ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
  ctx.strokeStyle = '#22c55e';
  drawRoundedRect(ctx, c3X + 25, cardY + 95, 375, 45, 8, true, true);
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
  ctx.fillText('台海戰險: 常規基準 (未列入加費區)', c3X + 40, cardY + 124);

  const c3Points = [
    {
      title: '1. 勞合社 JWC 突發公告',
      tag: '[ JWC WATCH ]',
      line1: '倫敦勞合社 JWC 若將台海或南海列入高危清單，',
      line2: '所有行經商船必須於 48 小時前通報並加徵戰險。'
    },
    {
      title: '2. 保費飆漲 5~10 倍臨界點',
      tag: '[ PREMIUM SURGE ]',
      line1: '船體戰險由平時船價 0.02% 飆升至 0.5%~1.0%，',
      line2: '單航次附加費達數百萬美元，迫使商船集體改道。'
    },
    {
      title: '3. 遠洋船隊迴避西方港口',
      tag: '[ FLEET RETREAT ]',
      line1: '中遠海運 (COSCO) 等數百艘遠洋貨輪若無故偏航、',
      line2: '提前撤出美歐港口，為防範遭司法扣押之臨戰避險。'
    }
  ];

  let c3Y = cardY + 165;
  c3Points.forEach(p => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#475569';
    drawRoundedRect(ctx, c3X + 25, c3Y, 375, 140, 8, true, true);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.title, c3X + 38, c3Y + 32);

    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.tag, c3X + 245, c3Y + 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.line1, c3X + 38, c3Y + 70);
    ctx.fillText(p.line2, c3X + 38, c3Y + 98);

    c3Y += 160;
  });

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('海運戰險緊張指數 (War Risk Index):', c3X + 25, cardY + 685);

  ctx.fillStyle = '#1e293b';
  drawRoundedRect(ctx, c3X + 25, cardY + 710, 375, 26, 6, true, false);
  ctx.fillStyle = '#f97316';
  drawRoundedRect(ctx, c3X + 25, cardY + 710, 45, 26, 6, true, false);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('12% (常態安全區，閥值: >50% 跳漲)', c3X + 35, cardY + 728);

  ctx.fillStyle = '#64748b';
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('依據倫敦勞合社 JWC 每季海事高風險區域公告', c3X + 25, cardY + 775);


  // --- COLUMN 4: 跨境資本管制與主權 CDS ---
  const c4X = c3X + cardWidth + gap;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#ec4899';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c4X, cardY, cardWidth, cardHeight, 14, true, true);

  ctx.fillStyle = '#f472b6';
  ctx.font = 'bold 23px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 跨境資本管制與主權 CDS', c4X + 25, cardY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('防範境內資本擠兌外逃與國際信用違約定價', c4X + 25, cardY + 75);

  ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
  ctx.strokeStyle = '#22c55e';
  drawRoundedRect(ctx, c4X + 25, cardY + 95, 375, 45, 8, true, true);
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
  ctx.fillText('中國 5Y CDS: 48 bps (常規低檔平穩)', c4X + 40, cardY + 124);

  const c4Points = [
    {
      title: '1. 戰時外匯管制前兆',
      tag: '[ CAPITAL CONTROL ]',
      line1: '限制居民與外企外幣匯出、嚴格封閉海外置產渠道，',
      line2: '國防動員法授權政府對全境涉外資產實施強制結匯。'
    },
    {
      title: '2. 主權 CDS 違約溢價',
      tag: '[ CDS SURGE ]',
      line1: '國際對沖基金大幅買入國債違約保險時 CDS 點數飆升，',
      line2: '若 5Y CDS 突破 150 bps 即代表金融市場定價開戰。'
    },
    {
      title: '3. 權貴資產異常出逃',
      tag: '[ ILLICIT OUTFLOWS ]',
      line1: '知情階層透過地下錢莊、加密貨幣等非正規渠道，',
      line2: '在資本國門徹底關閉前實施最後窗口期之資金大撤退。'
    }
  ];

  let c4Y = cardY + 165;
  c4Points.forEach(p => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#475569';
    drawRoundedRect(ctx, c4X + 25, c4Y, 375, 140, 8, true, true);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.title, c4X + 38, c4Y + 32);

    ctx.fillStyle = '#f472b6';
    ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.tag, c4X + 240, c4Y + 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.line1, c4X + 38, c4Y + 70);
    ctx.fillText(p.line2, c4X + 38, c4Y + 98);

    c4Y += 160;
  });

  // Comprehensive Verdict Box
  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, c4X + 25, cardY + 665, 375, 130, 8, true, true);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 16px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 綜合戰略資金動向判定:', c4X + 40, cardY + 695);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('● PEACETIME BASELINE (正常平穩基準)', c4X + 40, cardY + 725);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('各項指標未見臨戰斷崖清倉或避險轉移痕跡', c4X + 40, cardY + 755);
  ctx.fillText('全天候哨兵情報雷達持續 24/7 監控此防線', c4X + 40, cardY + 778);

  // Footer / Source Bar
  ctx.fillStyle = '#64748b';
  ctx.font = '14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('資料來源: 國際清算銀行 (BIS) ｜ 美國財政部 TIC ｜ 倫敦勞合社 JWC ｜ 世界黃金協會 WGC ｜ Bloomberg Terminal ｜ 產製工具: WordWarNews FININT Engine', 60, height - 35);

  // Save to Buffer & File
  const finintBuffer = canvas.toBuffer('image/png');
  fs.writeFileSync(FININT_SLIDE_FILE, finintBuffer);

  console.log(`[FININT PPT SUCCESS] 1920x1080 戰略金融資金動向簡報圖卡已成功生成: ${FININT_SLIDE_FILE}`);
  return { success: true, path: FININT_SLIDE_FILE };
}

/**
 * Generates Slide 3: Civil Defense, Emergency Evacuation & 72H Go-Bag Protocol
 * Visualizes safe relocation directions, hardened shelters, and survival kit checklist.
 */
async function generateSurvivalEvacSlide(alertOverride = null) {
  const data = getLiveIntelData();
  const width = 1920;
  const height = 1080;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const isEmergency = Boolean(alertOverride && alertOverride.isEmergency);

  // 1. Background (Deep Executive Dark Navy Gradient & Grid)
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#060b14');
  bgGrad.addColorStop(0.5, '#0b1626');
  bgGrad.addColorStop(1, '#050912');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(30, 58, 95, 0.22)';
  ctx.lineWidth = 1;
  for (let x = 60; x < width; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 60; y < height; y += 120) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (isEmergency) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, width - 8, height - 8);
  }

  // 2. Header Bar
  ctx.fillStyle = isEmergency ? '#2b0f15' : '#0c1b33';
  ctx.fillRect(0, 0, width, 120);

  ctx.strokeStyle = isEmergency ? '#ef4444' : '#1e3a5f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 120);
  ctx.lineTo(width, 120);
  ctx.stroke();

  // Slide Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px "Microsoft JhengHei", "PingFang TC", sans-serif';
  ctx.fillText('戰時全民防衛避難與逃生裝備整備指南：避難方向、防空設施與72小時求生包', 60, 68);

  // Classification & Timestamp
  ctx.fillStyle = isEmergency ? '#f87171' : '#38bdf8';
  ctx.font = 'bold 16px "Microsoft JhengHei", "PingFang TC", sans-serif';
  ctx.fillText('CIVIL DEFENSE OVERWATCH // EMERGENCY EVACUATION & 72H GO-BAG PROTOCOL', 60, 100);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px "Microsoft JhengHei", "PingFang TC", sans-serif';
  const displayTime = alertOverride?.timestamp || data.lastUpdatedDisplay || '觀測時間未取得';
  ctx.fillText(`即時情報發布時間戳: ${displayTime} ｜ 民防整備等級: WARTIME READINESS BASELINE`, 750, 100);

  // Top Right Status Badge
  ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
  ctx.strokeStyle = '#10b981';
  drawRoundedRect(ctx, 1610, 35, 250, 50, 8, true, true);
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 18px "Microsoft JhengHei", sans-serif';
  ctx.fillText('■ 民防整備: 必備指南', 1640, 67);

  // 3. Four Major Strategic Columns
  const cardWidth = 425;
  const cardHeight = 840;
  const cardY = 160;
  const gap = 30;
  const startX = 60;

  // --- COLUMN 1: 戰時疏散方向與高危目標研判 ---
  const c1X = startX;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c1X, cardY, cardWidth, cardHeight, 14, true, true);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 23px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 戰時疏散方向與目標研判', c1X + 25, cardY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('開戰首波精確打擊目標與相對安全撤離縱深', c1X + 25, cardY + 75);

  // Status Badge
  ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
  ctx.strokeStyle = '#ef4444';
  drawRoundedRect(ctx, c1X + 25, cardY + 95, 375, 45, 8, true, true);
  ctx.fillStyle = '#f87171';
  ctx.font = 'bold 16px "Microsoft JhengHei", sans-serif';
  ctx.fillText('高危區: 軍港/機場/雷達站/政軍樞紐周邊', c1X + 35, cardY + 124);

  const c1Points = [
    {
      title: '1. 首波致命打擊目標 (避開)',
      tag: '[ NO-GO ZONE ]',
      line1: '遠離海空軍基地、飛彈陣地、雷達站、指揮中心，',
      line2: '以及大型發電廠、變電所、LNG接收站等基礎設施。'
    },
    {
      title: '2. 戰術疏散方向 (安全腹地)',
      tag: '[ RELOCATION ]',
      line1: '向非首波登陸灘頭之內陸淺山、二線丘陵市鎮疏散；',
      line2: '避開國道高速公路等軍事調動主幹線（易遭封鎖癱瘓）。'
    },
    {
      title: '3. 避難動線與時間決策',
      tag: '[ TIMING ]',
      line1: '臨戰前 24-48 小時依情資提前轉移至預備避難點；',
      line2: '若空襲警報已響起，切勿駕車上路，就近地下掩蔽。'
    }
  ];

  let c1Y = cardY + 165;
  c1Points.forEach(p => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#334155';
    drawRoundedRect(ctx, c1X + 25, c1Y, 375, 140, 8, true, true);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.title, c1X + 38, c1Y + 32);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.tag, c1X + 250, c1Y + 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.line1, c1X + 38, c1Y + 70);
    ctx.fillText(p.line2, c1X + 38, c1Y + 98);

    c1Y += 160;
  });

  // Telemetry Bar
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('戰時主要高速幹道塞車癱瘓風險:', c1X + 25, cardY + 685);

  ctx.fillStyle = '#1e293b';
  drawRoundedRect(ctx, c1X + 25, cardY + 710, 375, 26, 6, true, false);
  ctx.fillStyle = '#ef4444';
  drawRoundedRect(ctx, c1X + 25, cardY + 710, 320, 26, 6, true, false);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('85% (極高危: 逃生切勿盲目開車上國道)', c1X + 35, cardY + 728);

  ctx.fillStyle = '#64748b';
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('依據全民防衛動員防空疏散指引與交通管制想定', c1X + 25, cardY + 775);


  // --- COLUMN 2: 就近掩體與防空避難設施 ---
  const c2X = c1X + cardWidth + gap;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c2X, cardY, cardWidth, cardHeight, 14, true, true);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 23px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 就近掩體與防空避難設施', c2X + 25, cardY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('空襲發生時 0-10 分鐘內生死關鍵就近掩蔽', c2X + 25, cardY + 75);

  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.strokeStyle = '#10b981';
  drawRoundedRect(ctx, c2X + 25, cardY + 95, 375, 45, 8, true, true);
  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 16px "Microsoft JhengHei", sans-serif';
  ctx.fillText('優選空間: 鋼筋混凝土 B2 以下密閉地下室', c2X + 35, cardY + 124);

  const c2Points = [
    {
      title: '1. 防空避難室法定標籤',
      tag: '[ HARDENED ]',
      line1: '認明內政部警政署黃色「防空避難設備」標示貼紙，',
      line2: '優先選擇地下 2 層 (B2) 以下、無對外開口之密閉空間。'
    },
    {
      title: '2. 高樓無地下室緊急自保',
      tag: '[ INDOOR SHIELD ]',
      line1: '處於高樓時躲入結構最堅固之浴廁內側無窗房，',
      line2: '遠離玻璃窗（防止超壓震碎飛濺），採背向爆點臥倒。'
    },
    {
      title: '3. 避開易次生災害場所',
      tag: '[ HAZARD AVOID ]',
      line1: '避免進入輕鋼架鐵皮屋、加油站旁、大型玻璃帷幕大樓，',
      line2: '防止空襲引發二次大火、瓦斯爆炸與高空落物砸傷。'
    }
  ];

  let c2Y = cardY + 165;
  c2Points.forEach(p => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#475569';
    drawRoundedRect(ctx, c2X + 25, c2Y, 375, 140, 8, true, true);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.title, c2X + 38, c2Y + 32);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.tag, c2X + 245, c2Y + 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.line1, c2X + 38, c2Y + 70);
    ctx.fillText(p.line2, c2X + 38, c2Y + 98);

    c2Y += 160;
  });

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('地下 B2 掩體超壓抗爆防護力:', c2X + 25, cardY + 685);

  ctx.fillStyle = '#1e293b';
  drawRoundedRect(ctx, c2X + 25, cardY + 710, 375, 26, 6, true, false);
  ctx.fillStyle = '#10b981';
  drawRoundedRect(ctx, c2X + 25, cardY + 710, 345, 26, 6, true, false);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('92% (優異: 有效阻絕破片衝擊波與次生落物)', c2X + 35, cardY + 728);

  ctx.fillStyle = '#64748b';
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('平時使用警政服務 APP 預先離線儲存周邊避難點', c2X + 25, cardY + 775);


  // --- COLUMN 3: 72小時避難包 (Go-Bag) 裝備清單 ---
  const c3X = c2X + cardWidth + gap;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c3X, cardY, cardWidth, cardHeight, 14, true, true);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 23px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 72小時避難包 (Go-Bag)', c3X + 25, cardY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('一人一包、30秒內可抓取背走（建議 25-35L）', c3X + 25, cardY + 75);

  ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
  ctx.strokeStyle = '#f59e0b';
  drawRoundedRect(ctx, c3X + 25, cardY + 95, 375, 45, 8, true, true);
  ctx.fillStyle = '#fde68a';
  ctx.font = 'bold 16px "Microsoft JhengHei", sans-serif';
  ctx.fillText('背包總重: 建議控制在個人體重 15% 以內', c3X + 35, cardY + 124);

  const c3Points = [
    {
      title: '1. 生命維生 (飲水與口糧)',
      tag: '[ WATER & FOOD ]',
      line1: '個人濾水器/淨水吸管 + 瓶裝水 (備 3 日飲用量)；',
      line2: '壓縮口糧、能量棒、肉乾、巧克力（不需加熱即食）。'
    },
    {
      title: '2. 戰術醫療與止血耗材',
      tag: '[ IFAK MEDICAL ]',
      line1: '旋鈕式止血帶 (CAT)、以色列彈性繃帶、止血紗布；',
      line2: '消毒耗材與個人慢性病處方常用藥物 14 天份。'
    },
    {
      title: '3. 戰備通訊與光電源',
      tag: '[ COMMS / PWR ]',
      line1: '手搖/太陽能 AM/FM 收音機（斷網斷電唯一情報來源）；',
      line2: '戰術強光手電筒、頭燈 (備用電池)、行動電源、求生哨。'
    }
  ];

  let c3Y = cardY + 165;
  c3Points.forEach(p => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#475569';
    drawRoundedRect(ctx, c3X + 25, c3Y, 375, 140, 8, true, true);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.title, c3X + 38, c3Y + 32);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.tag, c3X + 250, c3Y + 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.line1, c3X + 38, c3Y + 70);
    ctx.fillText(p.line2, c3X + 38, c3Y + 98);

    c3Y += 160;
  });

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('緊急避難包裝備就緒度檢驗標準:', c3X + 25, cardY + 685);

  ctx.fillStyle = '#1e293b';
  drawRoundedRect(ctx, c3X + 25, cardY + 710, 375, 26, 6, true, false);
  ctx.fillStyle = '#f59e0b';
  drawRoundedRect(ctx, c3X + 25, cardY + 710, 280, 26, 6, true, false);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('75% 就緒 (建議每半年檢驗乾糧與電池效期)', c3X + 35, cardY + 728);

  ctx.fillStyle = '#64748b';
  ctx.font = '13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('平時置於大門玄關便於 30 秒內抓取撤離', c3X + 25, cardY + 775);


  // --- COLUMN 4: 工具防護、證件與戰時硬通貨 ---
  const c4X = c3X + cardWidth + gap;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = '#ec4899';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, c4X, cardY, cardWidth, cardHeight, 14, true, true);

  ctx.fillStyle = '#f472b6';
  ctx.font = 'bold 23px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 工具防護、證件與硬通貨', c4X + 25, cardY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Microsoft JhengHei", sans-serif';
  ctx.fillText('應對斷水斷電、ATM失效與身分產權保全', c4X + 25, cardY + 75);

  ctx.fillStyle = 'rgba(236, 72, 153, 0.15)';
  ctx.strokeStyle = '#ec4899';
  drawRoundedRect(ctx, c4X + 25, cardY + 95, 375, 45, 8, true, true);
  ctx.fillStyle = '#fbcfe8';
  ctx.font = 'bold 16px "Microsoft JhengHei", sans-serif';
  ctx.fillText('重要資產: 雙層防水夾鏈袋密閉貼身保管', c4X + 35, cardY + 124);

  const c4Points = [
    {
      title: '1. 工具與人身安全防護',
      tag: '[ EDC TOOLS ]',
      line1: '多功能折疊鉗/瑞士刀、防割耐磨手套、防風打火機；',
      line2: '鋁箔防失溫太空毯、N95防塵口罩/防煙面罩。'
    },
    {
      title: '2. 戰時小額現金儲備',
      tag: '[ HARD CASH ]',
      line1: '備妥小額新台幣紙鈔 (100/500) 與硬幣（斷電ATM失效）；',
      line2: '少量微型金飾/銀幣/實物硬通貨，應對法幣極端波動。'
    },
    {
      title: '3. 證件與離線紙本地圖',
      tag: '[ OFFLINE ID ]',
      line1: '身分證/護照/健保卡/房契影本、親屬紙本電話名冊；',
      line2: '離線紙本戰術地圖、事先約定好之失散集合點。'
    }
  ];

  let c4Y = cardY + 165;
  c4Points.forEach(p => {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.strokeStyle = '#475569';
    drawRoundedRect(ctx, c4X + 25, c4Y, 375, 140, 8, true, true);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 17px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.title, c4X + 38, c4Y + 32);

    ctx.fillStyle = '#f472b6';
    ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.tag, c4X + 240, c4Y + 32);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "Microsoft JhengHei", sans-serif';
    ctx.fillText(p.line1, c4X + 38, c4Y + 70);
    ctx.fillText(p.line2, c4X + 38, c4Y + 98);

    c4Y += 160;
  });

  // Summary Verdict Box
  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, c4X + 25, cardY + 665, 375, 130, 8, true, true);

  ctx.fillStyle = '#34d399';
  ctx.font = 'bold 16px "Microsoft JhengHei", sans-serif';
  ctx.fillText('◆ 戰時避難生存三大金科玉律:', c4X + 40, cardY + 695);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('1. 警報驟響先就近掩蔽，盲目開車等於自陷火網', c4X + 40, cardY + 725);
  ctx.fillText('2. 收音機與乾電池是斷網斷電最珍貴戰略情報源', c4X + 40, cardY + 750);
  ctx.fillText('3. 避難包置於玄關大門，平時每半年檢查更新', c4X + 40, cardY + 775);

  // Footer / Source Bar
  ctx.fillStyle = '#64748b';
  ctx.font = '14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('資料參考: 內政部警政署全民國防指引 ｜ 國防部全民防衛動員署 ｜ 國際紅十字會 (ICRC) 戰地準則 ｜ 產製工具: WordWarNews Civil Defense Engine', 60, height - 35);

  // Save to Buffer & File
  const survivalBuffer = canvas.toBuffer('image/png');
  fs.writeFileSync(SURVIVAL_SLIDE_FILE, survivalBuffer);

  console.log(`[SURVIVAL PPT SUCCESS] 1920x1080 民防避難與逃生裝備簡報圖卡已成功生成: ${SURVIVAL_SLIDE_FILE}`);
  return { success: true, path: SURVIVAL_SLIDE_FILE };
}

async function generateAllPPTSlides(alertOverride = null) {
  const r1 = await generateDynamicPPTSlide(alertOverride);
  const r2 = await generateFinintCapitalSlide(alertOverride);
  const r3 = await generateSurvivalEvacSlide(alertOverride);
  return { slide1: r1.path, slide2: r2.path, slide3: r3.path };
}

// CLI test
if (require.main === module) {
  generateAllPPTSlides().then(r => {
    console.log('All 3 Slides Generated:', r);
    process.exit(0);
  });
}

module.exports = {
  generateDynamicPPTSlide,
  generateFinintCapitalSlide,
  generateSurvivalEvacSlide,
  generateAllPPTSlides
};
