/**
 * WordWar_News - Asia-Pacific Tactical Defense Intelligence Grid (Dynamic & Responsive Edition)
 * Condensed, clean points without unrendered emojis, ready for crisp executive presentation
 */

const fs = require('fs');
const path = require('path');
const { getTaiwanStraitData } = require('./taiwan_strait_data');

const DATA_FILE = path.join(__dirname, '../public/data/live_intel.json');

function getApacDefenseGrid() {
  let liveIntel = {};
  try {
    if (fs.existsSync(DATA_FILE)) {
      liveIntel = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {}

  const strait = getTaiwanStraitData();
  const m = strait.airSeaPatrolMetrics;
  const lastUpdated = liveIntel.lastUpdatedDisplay || (new Date().toISOString().replace('T', ' ').substring(0, 16) + ' CST');

  return {
    lastUpdated,
    overallThreatLevel: 'CRITICAL OVERWATCH // 第一島鏈全域戰備對峙',
    summary: '解放軍以「海警準軍事執法 + 海空多軸壓迫」實施封控；美日菲以「第一島鏈反艦拒止環」展開聯防。',
    sectors: [
      {
        id: 'taiwan_strait',
        name: '一、 台灣海峽正面與東部戰區',
        threatLevel: '[HIGH THREAT]',
        keyForces: {
          pla: '東部戰區 71/72/73軍 ｜ 052D/054A ｜ 殲-16/殲-20',
          allied: '新竹幻象/花蓮F-16V ｜ 雄風岸置反艦 ｜ 樂山雷達'
        },
        tacticalFocus: '中線常態化抹消 ｜ 全島多軸戰警巡 ｜ 模擬聯合封鎖',
        metrics: `${m.plaAircraftTotal} (${m.plaCrossMedianLine}) ｜ ${m.plaVesselsTotal}`,
        analysis: '共軍以高頻次灰色地帶消耗戰，企圖磨損國軍空防攔截反應極限。'
      },
      {
        id: 'miyako_strait',
        name: '二、 宮古海峽走廊與西南諸島',
        threatLevel: '[ELEVATED]',
        keyForces: {
          pla: '北部/東部戰區遠海編隊 (山東/遼寧艦航母穿插)',
          allied: '日本西南航空隊 ｜ 第15旅團 ｜ 美陸戰隊第12團'
        },
        tacticalFocus: '封堵中共航母穿出第一島鏈 ｜ 部署12式反艦飛彈',
        metrics: '宮古水道寬 250 公里，美日於石垣/宮古構築火力閘門',
        analysis: '宮古為解放軍出西太咽喉，美日以遠征前進基地作戰實施拒止。'
      },
      {
        id: 'bashi_channel',
        name: '三、 巴士海峽與菲北呂宋走廊',
        threatLevel: '[CRITICAL]',
        keyForces: {
          pla: '南部戰區 094A核潛艦 ｜ 空潛-200 ｜ 無偵-7',
          allied: '美軍 P-8A反潛機 ｜ RC-135V電偵 ｜ 菲北EDCA基地'
        },
        tacticalFocus: '水下核潛艦深海陣位爭奪 ｜ 水聲監聽網 (SOSUS) 攔截',
        metrics: '水深逾 2,000-5,000 米，為南海戰略核潛艦前出西太生命線',
        analysis: '巴士海峽為印太水下最致命獵殺場，美軍常態電偵確保南翼航路。'
      },
      {
        id: 'south_china_sea',
        name: '四、 南海仙賓礁與仁愛礁前沿',
        threatLevel: '[HOSTILE CLASH]',
        keyForces: {
          pla: '海警 CCG 5901 (萬噸怪獸) ｜ 055神盾 ｜ 武裝民兵船',
          allied: '菲律賓海警旗艦 MRRV-9701 ｜ 美印太司令部巡防艦'
        },
        tacticalFocus: '阻斷菲方補給 ｜ 水砲衝撞擠壓 ｜ 測試美菲聯防紅線',
        metrics: '中方動員 20+ 艘鋼殼船蜂群包圍，菲艦右舷遭物理撞擊凹陷',
        analysis: '南海已由外交爭議升級為準軍事物理封鎖，擦槍走火風險極高。'
      },
      {
        id: 'korean_peninsula',
        name: '五、 朝鮮半島與朝俄軍火軸線',
        threatLevel: '[ELEVATED]',
        keyForces: {
          pla: '北韓人民軍火箭軍 (火星-17/18) ｜ 朝俄鐵路軍火專列',
          allied: '駐韓美軍 (USFK) ｜ 韓美聯合作戰司令部 ｜ 烏山基地'
        },
        tacticalFocus: '朝俄條約熱啟動 ｜ 數百萬發砲彈輸俄交換核導潛艦技術',
        metrics: '朝俄圖們江貨運暴增300%，百萬砲彈交換俄方先進航空技術',
        analysis: '朝俄軍事抱團牽制美韓戰略兵力，歐亞雙戰線呈現同步施壓。'
      }
    ]
  };
}

module.exports = {
  get apacDefenseGrid() {
    return getApacDefenseGrid();
  },
  getApacDefenseGrid
};
