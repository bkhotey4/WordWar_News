// One-time researched edition. Later editions must research sources anew.
const fs=require('fs');const path=require('path');
const {importResearchReference,publishResearchDraft}=require('../src/research_reports');
const {getSatelliteFeed}=require('../src/satellite_assets');
const refs=[
 {key:'lebanon',url:'https://lebanon.un.org/en/323037-lebanon-response-plan-2026-addendum',title:'Lebanon Response Plan 2026 Addendum',publishedAt:'2026-09-18T00:00:00Z',publisher:'聯合國黎巴嫩（日期精度；非精確時刻）',originGroup:'UN_LEBANON_RESPONSE',sourceType:'REVIEWED_DATE_ONLY_ARTICLE_NOTES',body:'公開頁正文閱讀筆記，非逐字原文；日期只確定為2026年9月18日，00:00是日期儲存表示，非真實發布時刻。頁面說明2026年3月衝突升級造成流離失所與基礎設施損害，9月至12月附加援助計畫是追加需求，沒有重新計算原計畫。可用於人道壓力背景，不能當作9月28日戰線或當日交戰紀錄。'},
 {key:'myanmar',url:'https://iimm.un.org/en/armed-conflict-and-violence-prevent-safe-return-rakhine-state',title:'Armed conflict and violence prevent a safe return to Rakhine State',publishedAt:'2026-09-24T00:00:00Z',publisher:'聯合國IIMM（日期精度；非精確時刻）',originGroup:'UN_IIMM',sourceType:'REVIEWED_DATE_ONLY_ARTICLE_NOTES',body:'公開頁全文閱讀後的中文筆記，非逐字原文。日期為2026年9月24日，00:00不代表發布時刻。IIMM表示若開邦衝突與暴力持續，民眾受空襲、砲擊、無人機攻擊與拘禁等危害，部分地區缺乏生活必需品及受阻的人道援助。現況不適合安全、自願、有尊嚴及可持續的回返；未提供當日城鎮控制線或戰力數量。'},
 {key:'sudan',url:'https://www.unognewsroom.org/teleprompter/en/3248/hrc63-iiffm-sudan-and-country-concerned-07-september-2026/9655',title:'HRC63 Sudan Fact-Finding Mission opening statement',publishedAt:'2026-09-07T00:00:00Z',publisher:'聯合國日內瓦調查團發言（日期精度）',originGroup:'UN_SUDAN_FFM',sourceType:'REVIEWED_DATE_ONLY_TRANSCRIPT_NOTES',body:'公開逐字稿閱讀筆記，非原文；網站逐字稿部分地名有轉錄錯誤，未引用那些地名及傷亡數。頁面日期2026年9月7日，00:00不代表精確發布時刻。調查團表示長程無人機使戰爭危害超出傳統前線，雙方使用造成民用服務及基礎設施受損；外部技術、武器、訓練、人員與後勤支持維持這些能力。這是較舊的結構背景，不能用來判定9月28日某城控制權。'},
 {key:'south',url:'https://news.usni.org/2026/09/25/usni-news-western-pacific-pulse-sept-25-2026',title:'USNI Western Pacific Pulse Sept25',publishedAt:'2026-09-25T00:00:00Z',publisher:'USNI（僅保存日期；未確認時區）',originGroup:'USNI_WESTERN_PACIFIC',sourceType:'REVIEWED_DATE_ONLY_ARTICLE_NOTES',body:'正常網頁查閱所得公開正文閱讀筆記，非逐字原文；命令列403未绕過。頁面顯示9月25日12:43PM但時區未確認，僅保存日期，00:00不是實際時刻。南海段落描述菲律賓與日本共同主持ADMM-Plus海上安全合作活動，海上階段9月23日開始。中國軍艦跟監是USNI引用ABS-CBN的報導，未當作獨立確認；演習不等於開戰。這是週報背景，不是9月28日即時艦位。'}
];
const ids={};for(const ref of refs){const {key,...record}=ref;fs.writeFileSync(path.join(__dirname,`../research/references/global-${key}-20260928.json`),JSON.stringify(record,null,2));ids[key]=importResearchReference(record).id;}
ids.ukraine='eafdf89a70ccce3f';ids.taiwan='83ab3d66077df8c3';
const coverage=[
 {theater:'ukraine_front',observedAt:'2026-09-27T12:04:35Z',summary:'烏方9月27日表示Vivaldi仍在進行；新成果未完整披露。不能由此認定利曼全城新收復。',evidence:[ids.ukraine]},
 {theater:'taiwan_strait',observedAt:'2026-09-27T11:12:28Z',summary:'9月27日披露向陽紅22先前調查活動。事件涉及3月至7月歷史觀測，並非9月27日新出航；此項資料不構成近期軍事行動預測。',evidence:[ids.taiwan]},
 {theater:'middle_east',observedAt:'2026-09-18T00:00:00Z',summary:'9月18日聯合國黎巴嫩援助附加計畫反映衝突造成民生與基礎設施壓力；屬背景，不能表示當日戰況。',evidence:[ids.lebanon]},
 {theater:'sudan',observedAt:'2026-09-07T00:00:00Z',summary:'9月7日調查團指出外部支持與長程無人機使民用服務風險跨越前線。屬結構背景，不提供今天控制線。',evidence:[ids.sudan]},
 {theater:'myanmar',observedAt:'2026-09-24T00:00:00Z',summary:'9月24日IIMM表示若開邦暴力與援助阻礙持續，安全回返條件尚未具備；未提供今日控制權資料。',evidence:[ids.myanmar]},
 {theater:'south_china_sea',observedAt:'2026-09-25T00:00:00Z',summary:'9月25日USNI週報記載多國海上合作活動；跟監說法是引用其他媒體，不能據此推斷即將開戰。',evidence:[ids.south]}
];
const draft={id:'global-strategic-20260928',title:'全球戰況首期｜烏俄新進展、亞太活動與中東／非洲／緬甸背景；兩種有條件情境',theater:'global',sourceIds:Object.values(ids),coverage,
 sections:[
  {kind:'REPORTED',label:'烏俄與台海｜近期披露',text:coverage.slice(0,2).map(c=>c.summary).join('\n'),evidence:[ids.ukraine,ids.taiwan]},
  {kind:'REPORTED',label:'中東、蘇丹、緬甸｜附日期背景',text:coverage.slice(2,5).map(c=>c.summary).join('\n'),evidence:[ids.lebanon,ids.sudan,ids.myanmar]},
  {kind:'REPORTED',label:'南海｜9月25日週報',text:coverage[5].summary,evidence:[ids.south]},
  {kind:'ANALYSIS',label:'跨戰區觀察',text:'不同戰區沒有共同的進攻時鐘。烏俄需要區分官方戰果聲明與控制線確認；中東、蘇丹及緬甸的資料支持民生壓力持續的背景，但不是本日戰果。演習與調查活動應分別解讀。不能把這些來源相加成全球開戰分數。',evidence:Object.values(ids)},
  {kind:'UNCERTAIN',label:'覆蓋與衛星限制',text:'本期不是全世界即時戰況全覆蓋。歐洲區域安全未取得足夠近期原文，因此沒有新增結論。衛星影像只在拍攝時刻有效；本期若附圖僅作民用區域背景，不代表已做變化或戰損判讀。',evidence:[ids.lebanon,ids.sudan,ids.myanmar]}
 ],scenarios:[
  {name:'民用服務壓力延續',horizon:'未來一至兩週的觀察框架',assumption:'衝突未明顯降溫，救援通道仍受限制；這是條件，不是已確認的未來。',implication:'流離失所與公共服務需求可能延續，城市影像需與人道報告比對才能解釋變化。',triggers:['新的官方人道報告持續記錄援助受阻或服務中斷'],counterEvidence:['可查核的持續停火及援助恢復報告'],evidence:[ids.lebanon,ids.sudan,ids.myanmar]},
  {name:'局部降溫與恢復',horizon:'未來一至兩週的觀察框架',assumption:'出現可執行且持續生效的降溫協議，並開放救援與基礎設施修復。',implication:'部分民生壓力可能下降，但單一外交聲明不足以確認趨勢逆轉。',triggers:['多日援助通行與服務恢復獲公開記錄'],counterEvidence:['新報告再次記錄衝突或通道關閉'],evidence:[ids.lebanon,ids.myanmar]}
 ]};
const asset=getSatelliteFeed().assets.find(a=>a.region==='khartoum_civil'&&a.kind==='SOURCE_AOI_CROP');
if(asset)draft.imagery=[{region:asset.region,productId:asset.productId,sha256:asset.sha256,role:'CONTEXT_ONLY',caption:'喀土穆民用市區來源影像，只展示拍攝時的地表背景，不能據此確認上述較早調查報告的個別攻擊。'}];
fs.writeFileSync(path.join(__dirname,'../research/drafts/global-strategic-20260928.json'),JSON.stringify(draft,null,2));
console.log(JSON.stringify({id:publishResearchDraft(draft).id,coverage:coverage.length,imagery:draft.imagery?.length||0}));
