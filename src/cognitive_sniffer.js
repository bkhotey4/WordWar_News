/**
 * COGNITIVE WARFARE & WARTIME DISINFORMATION SNIFFER
 * Analyzes pre-war information operations, psychological warfare rumors, and official rebuttal logic
 */

function getCognitiveAlerts() {
  return [
    {
      id: 'rumor_decapitation_fled',
      category: '🚨 斬首瓦解士氣謠言',
      threatLevel: 'EXTREME // 嚴重破壞抵抗意志',
      headline: '「元首及國安高層已搭乘美軍專機逃往關島或夏威夷」',
      narrativeIntent: '製造指揮鏈真空假象，誘發基層守軍產生「群龍無首、抵抗無用」之投降心理。',
      debunkFact: '三軍統帥戰時依國防防衛計畫直接進駐台北大直「衡山指揮所」地下深層指管中心，絕無搭機離境可能；此類謠言多利用過往出訪舊新聞畫面或 AI 深度偽造（Deepfake）聲音合成。',
      verificationMethod: '收聽戰時「中央廣播電台 / 漢聲廣播電台」統帥即時原聲政令發布，切勿相信無正式錄影之社群文字截圖。'
    },
    {
      id: 'rumor_abandon_taiwan',
      category: '⚠️ 疑美論與背叛敘事',
      threatLevel: 'HIGH // 撕裂盟友防衛信任',
      headline: '「美軍宣佈依照不涉入原則撤出第七艦隊、放棄第一島鏈」',
      narrativeIntent: '切斷台灣對國際馳援的戰略信心，孤立島內防衛心理。',
      debunkFact: '美國第七艦隊司令部與印太司令部受《台灣關係法》六項保證約束，且美日安保條約第四條規範日本西南諸島與基地防衛；美軍雙航母（CSG）在菲律賓海保持戰略機動，非社群所稱撤離。',
      verificationMethod: '比對 USNI News Fleet Tracker 航母打擊群公開陣位圖與美國國防部官方簡報。'
    },
    {
      id: 'rumor_grid_collapse',
      category: '⚡ 民生恐慌性謠言',
      threatLevel: 'HIGH // 引發社會擠兌與暴動',
      headline: '「全台變電所遭網軍全面摧毀，全島將永久斷電、自來水斷水一個月」',
      narrativeIntent: '促使民眾恐慌性搶購屯積物資、擠兌銀行、阻塞幹道，使城市自亂陣腳。',
      debunkFact: '台電調度中心具備實體物理隔絕（Air-Gapped）防護機制，各縣市配有分區微電網與柴油發電機；局部受損會有分區輪流供電計畫，絕非永久性全面癱瘓。',
      verificationMethod: '檢視各地方政府災害應變中心發布之「分區輪流通電時程表」。'
    },
    {
      id: 'rumor_surrender_unit',
      category: '⚔️ 偽造前線戰況謠言',
      threatLevel: 'HIGH // 分化軍民團結',
      headline: '「某前線旅已全體繳械投降、沿海某灘頭已完全失守」',
      narrativeIntent: '削弱後方後備軍人報到動員意願，破壞防衛縱深信心。',
      debunkFact: '國軍各作戰區指揮部具備獨立固守作戰條令，開戰初期任何單一部隊投降假消息多由認知戰農場預錄影片拼貼，或利用戰場通訊中斷之空窗期造謠。',
      verificationMethod: '國防部軍事新聞通訊社（軍聞社）即時戰況澄清戰報。'
    }
  ];
}

module.exports = {
  getCognitiveAlerts
};
