/**
 * WordWar_News - Comprehensive Warfare & Military Readiness Database
 * Modules:
 * 1. Ukraine Frontline SITREP (Pokrovsk, Kursk, Toretsk, Chasiv Yar, Vuhledar)
 * 2. Military Readiness & 3-Stage Mobilization Index (NATO, Russia, China PLA)
 * 3. Deep-Strike & Strategic Asset Damage Tracker (Refineries, Airbases, Black Sea Fleet)
 * 4. EW & Drone Tech Warfare (Fiber-Optic FPV, UMPK Glide Bombs, Shahed Interceptors)
 */

const fs = require('fs');
const path = require('path');
const DATA_FILE = path.join(__dirname, '../public/data/live_intel.json');

function getLiveTimestamp() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      if (data.lastUpdatedDisplay) return data.lastUpdatedDisplay;
    }
  } catch (e) {}
  return new Date().toISOString().replace('T', ' ').substring(0, 10) + ' CST';
}

const warfareIntel = {
  // 1. Ukraine Frontline Battleground Contacts (ISW & DeepState OSINT Synthesis)
  frontlineContacts: {
    get lastUpdated() {
      return getLiveTimestamp();
    },
    overview: '俄軍在頓巴斯保持主攻節奏，烏軍庫斯克突出部實施機動防禦，戰線呈高消耗消耗戰態勢。',
    sectors: [
      {
        name: '波克羅夫斯克 (紅軍城) 樞紐戰線 // POKROVSK SECTOR',
        status: '極度危急 // HIGH INTENSITY CLASH',
        distanceToCity: '俄軍先頭部隊距外圍鐵路防線約 6.5 - 8.0 公里',
        ruUnits: '俄中央集群第 2 諸兵種合成軍、第 41 軍、近衛第 90 坦克師',
        uaUnits: '烏第 47 機械化旅、第 25 空降旅、第 68 獵兵旅',
        situation: '俄軍採取鉗形攻勢包夾塞利多韋 (Selydove) 與熱蘭涅，意圖切斷 T0504 補給動脈；烏軍以無人機阻滯俄軍輪式與摩托化突擊隊。'
      },
      {
        name: '俄羅斯庫斯克突出部 // KURSK SALIENT',
        status: '俄軍發動機械化反撲 // FLANK COUNTER-OFFENSIVE',
        distanceToCity: '烏軍控制蘇賈 (Sudzha) 及周邊約 750-900 平方公里',
        ruUnits: '俄太平洋艦隊海軍步兵第 155 旅、第 810 旅、近衛空降第 106 師',
        uaUnits: '烏第 80、82、95 獨立空中突擊旅、特戰部隊 (SSO)',
        situation: '俄軍自科列涅沃 (Korenevo) 南下發動裝甲突擊，切斷烏軍西翼部分補給線；烏軍則在格盧什科沃 (Glushkovo) 發動二次越境穿插以牽制俄軍。'
      },
      {
        name: '托列茨克與紐約村 // TORETSK URBAN COMBAT',
        status: '高烈度城鎮殘骸巷戰 // URBAN ATTRITION',
        distanceToCity: '市中心高層建築區激烈爭奪',
        ruUnits: '俄第 1 斯拉夫旅、頓涅茨克第 8 諸兵種軍',
        uaUnits: '烏第 32 機械化旅、亞速第 12 特戰旅',
        situation: '俄軍以 FAB-500/1500 滑翔炸彈推平建築掩體，烏軍利用地下坑道和防空掩體依託抵抗，爭奪廢墟每條街道。'
      },
      {
        name: '查西夫雅爾與運河防線 // CHASIV YAR CANAL DEFENSE',
        status: '微速推進與運河拉鋸 // CANAL BARRIER',
        distanceToCity: '東側十月區被俄軍控制，主城區隔「頓涅茨-頓巴斯運河」對峙',
        ruUnits: '俄近衛空降第 98 師、車臣阿赫馬特特種部隊',
        uaUnits: '烏第 93 機械化旅 (Kholodnyi Yar)、總統旅',
        situation: '運河成為天然屏障，俄軍多次強渡運河建立微型橋頭堡，但遭烏軍 FPV 集火封殺，戰線相對膠著。'
      },
      {
        name: '北約東翼邊境與領空擦邊測探線 // NATO EASTERN FLANK INTRUSIONS',
        status: '俄軍無人機與直升機越界擦邊 // AIRSPACE PROBING & HYBRID INCURSIONS',
        distanceToCity: '波蘭布拉涅沃(300米)、羅馬尼亞蘇恰瓦、摩爾多瓦邊界',
        ruUnits: '加里寧格勒航空隊、黑海方向長程自殺無人機突擊群',
        uaUnits: '波蘭空軍 F-16、西班牙輪駐 F-18、羅馬尼亞防空部隊',
        situation: '1. 加里寧格勒 Mi-8 直升機深入波蘭布拉涅沃 300 公尺停留 42 秒；2. 俄軍無人機侵犯羅馬尼亞領空 4 分鐘墜毀於蘇恰瓦；3. 摩爾多瓦空域多架無人機越界爆炸；4. 波蘭邊境 Starlink 站發電機遭破壞起火。'
      }
    ]
  },

  // 2. Military Readiness & 3-Stage Mobilization Index
  militaryReadiness: {
    natoReadiness: {
      ammoProductionRate: '155mm 砲彈年產量已提至 120 萬發 (目標 2026 年底達 140 萬發)',
      usStockpileReplenishment: '戰備庫存回補率 68% (PAC-3 / 155mm / 海馬斯火箭彈產線全開)',
      easternFlankReadiness: '北約「新部隊模型」已將 30 萬名官兵置於 30 天內快速反應戰備',
      f16CombatStatus: '第一批 F-16AM/BM 戰機已於烏克蘭執行巡弋飛彈與無人機攔截任務'
    },
    russiaMobilization: {
      recruitmentRate: '合約兵 (Kontraktniki) 每月招募約 30,000 人 (巨額簽約金激勵)',
      tankRefurbishment: '烏拉爾機車廠月修復並升級 70-80 輛 T-90M/T-72B3M，舊庫存消耗過半',
      foreignAmmoSupply: '平壤供應之 152mm 砲彈與 KN-23/24 飛彈佔俄前線消耗量 45% 以上',
      sanctionEvasion: '國防晶片透過中亞與第三國走私轉運，維持巡弋飛彈月產 110-130 枚'
    },
    plaThreeStageMobilization: {
      currentStage: '階段一：常態威懾與戰略物資儲備 (STAGE 1 // NORMALIZED POSTURE)',
      stage1_Status: '[活躍中] 戰備警巡常態化、軍民融合產業產能預置、能源糧食儲備擴張',
      stage2_Status: '[未觸發] 沿海民用大型客滾船徵召管制 (臨界點: 徵用率 > 20%)、空域航線大面積取消',
      stage3_Status: '[未觸發] 野戰醫院向海岸部署、東部戰區通信完全無線電靜默、兩棲部隊實體登船'
    }
  },

  // 3. Deep-Strike & Strategic Asset Damage Tracker
  deepStrikeTracker: {
    oilRefineries: [
      {
        name: '莫斯科煉油廠 (Gazprom Neft Moscow)',
        date: '2024年秋-2026年',
        damage: '歐洲-大西洋裂解裝置 (Euro+ CDU) 遭自殺無人機精確命中引發大火',
        capacityImpact: '影響該廠約 40% 汽油蒸餾能力，波及莫斯科首都圈燃料供應'
      },
      {
        name: '梁贊煉油廠 (Ryazan RNPK, 俄第4大)',
        date: '多次無人機群飽和打擊',
        damage: 'AVT-4 與 AVT-6 初步蒸餾塔起火損毀',
        capacityImpact: '年產能 1,710 萬噸，產能被迫下修 30-35%'
      },
      {
        name: '伏爾加格勒煉油廠 (Lukoil Volgograd)',
        date: '遠程縱深 450km 襲擊',
        damage: '油品儲存槽連環起火，加氫裂化裝置停機檢修',
        capacityImpact: '暫時停產部分航空燃油與柴油組分'
      }
    ],
    blackSeaFleetState: {
      status: '塞凡堡基地實質喪失水面作戰艦艇常駐功能 // EVACUATED TO NOVOROSSIYSK',
      lossesConfirmed: '黑海艦隊戰前 35% 主力艦艇被擊沉或重創 (包括旗艦莫斯科號、大豼艇多艘、基洛級潛艦頓河畔羅斯托夫號)',
      remainingFleetLocation: '殘存之格里戈洛維奇海軍上將號與暴徒-M 護衛艦龜縮於高加索新羅西斯克港，僅敢於防港內發射口徑飛彈'
    },
    russianStrategicAirbases: [
      {
        base: '恩格斯-2 戰略轟炸機基地 (Engels-2, 薩拉托夫州)',
        aircraft: 'Tu-95MS / Tu-160',
        observation: '機坪遭多次無人機襲擊後，戰略轟炸機實施輪胎覆蓋迷彩，部分長程疏散至北極圈奧萊尼亞基地 (Olenya)'
      },
      {
        base: '莫羅佐夫斯克空軍基地 (Morozovsk, 羅斯托夫州)',
        aircraft: 'Su-34 戰鬥轟炸機前進聯隊',
        observation: '機庫與滑翔炸彈彈藥庫遭集束無人機摧毀，多架 Su-34 遭穿甲破片打成篩子'
      }
    ]
  },

  // 4. EW & Drone Tech Warfare
  techWarfare: {
    fiberOpticFPV: {
      name: '抗干擾光纖導引 FPV 無人機 (Fiber-Optic FPV Drone)',
      deploymentSide: '俄烏雙方均已前線實裝 (俄「Knyaz Vandal」vs 烏軍試驗部隊)',
      specs: '尾部拖帶 10-15 公里超細耐折光纖捲盤，零無線電射頻信號發射',
      tacticalAdvantage: '1. 徹底免疫任何電子戰干擾槍 (Jammer) 與穹頂電戰壓制；2. 終端畫面為 1080p 超高清無雪花干擾；3. 鑽入地下掩體或森林不受地貌遮蔽。'
    },
    glideBombs: {
      name: '滑翔通用航空炸彈套件 (UMPK / FAB-3000)',
      deploymentSide: '俄空天軍 (VKS) 戰術打擊核心主力',
      specs: 'FAB-500/1500/3000 加裝折疊彈翼與 GLONASS 衛星導引天線，投放距離 60-70 公里',
      tacticalThreat: 'Su-34 在烏軍防空飛彈射程邊緣高空投擲，巨大爆炸超壓可直接坍塌任何鋼筋混凝土工事，為俄軍步兵開路之關鍵武器。'
    },
    mobileAirDefenseTeams: {
      name: '機動防空獵殺小組 (Mobile AD / Drone Hunters)',
      deploymentSide: '烏克蘭國土防衛軍與國民警衛隊',
      specs: '4x4 輕型皮卡、探照燈、熱成像儀、雙聯裝 Browning M2 或 DShK 重機槍、平板聲學追蹤系統',
      tacticalRole: '專門獵殺夜間來襲之 Shahed-136/131 自殺無人機，攔截成功率達 80% 以上，為烏軍節省昂貴的愛國者與 NASAMS 飛彈。'
    },
    gerberaContainerDrone: {
      name: '熱爾貝拉 (Gerbera) 貨櫃偽裝海射無人機',
      deploymentSide: '俄羅斯「影子船隊 (Ghost Fleet)」與特種破壞部隊',
      specs: '木質/發泡塑料結構、翼展 2.5m、長 2m、重 18kg、航程 600km、攜帶 4-5kg 高爆炸藥，氣動導軌彈射器裝入標準 40 呎海運貨櫃',
      tacticalThreat: 'CIA 警告地中海民船偽裝突襲西班牙、法國、義大利沿海港口與能源設施；對台海極具警示意義，中共散裝貨輪與滾裝船完全能複製相同模式於海峽中線實施公海蜂群彈射。'
    }
  }
};

module.exports = {
  warfareIntel
};
