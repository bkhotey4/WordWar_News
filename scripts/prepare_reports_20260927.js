const fs=require('fs');
const {importResearchReference,publishResearchDraft}=require('../src/research_reports');
for(const f of ['senkaku-survey-20260927','wotr-surveys-20260908','efe-lyman-20260922','isw-lyman-20260926'])importResearchReference(JSON.parse(fs.readFileSync('research/references/'+f+'.json','utf8')));
const docs=JSON.parse(fs.readFileSync('research/sources.json','utf8')).documents;
const find=(part)=>{const d=docs.find(d=>d.url.includes(part));if(!d)throw Error('Missing source '+part);return d.id;};
const taiwan=find('9780312'),wotr=find('chinas-warrior-scientists'),efe=find('ukraines-offensive-operation'),isw=find('assessment-september-26-2026'),latest=find('vivaldi-tryvaye-gotuyutsya-novi-kroky');
const drafts=[{
 id:'east-china-sea-surveys-20260927',theater:'taiwan_strait',title:'向陽紅22反覆海洋調查：可累積水下作戰資料，但沒有攻台倒數的證據',sourceIds:[taiwan,wotr],
 sections:[
 {kind:'REPORTED',label:'最新動態',text:'9月27日中央社轉述共同社對AIS航跡的分析：向陽紅22在今年3至7月五度於釣魚台列嶼附近海域調查，航行範圍約66乘11公里；7月一次作業曾低速南北往返，日方觀察到管狀設備入水。這是今天披露的過往活動分析，不是今天船位。',evidence:[taiwan]},
 {kind:'ANALYSIS',label:'軍事意義',text:'海洋調查的價值在於累積海底地形、水文及聲學環境資訊。War on the Rocks的兩位研究者指出，這類資料可與軍事準備及主權施壓相連，但也承認科研作業存在正當民用用途。我的判斷是：反覆調查值得長期追蹤；單一船舶調查不足以判定已進入攻台準備的最後階段。',evidence:[wotr,taiwan]},
 {kind:'REPORTED',label:'數據怎麼讀',text:'文中「五度」指向陽紅22於3至7月的調查；「13起」指截至9月25日相關海域的調查事件統計，分母不同，不能相加或當作同一艘船的總次數。中央社與經濟日報刊載內容來自同一共同社報導，不能算兩份獨立AIS證據。',evidence:[taiwan]},
 {kind:'UNCERTAIN',label:'結論與下一步',text:'這批資料支持「持續蒐集海洋資訊」的描述，尚無法證明特定攻台命令、兵力部署或發動日期。後续報導應核對官方新通報及可取得的原始航跡；衛星圖只用於它實際可見的海面或岸上內容，不能用一張光學影像證明水下調查目的。',evidence:[taiwan,wotr]}
 ]
},{id:'lyman-vivaldi-progress-20260927',theater:'ukraine_front',title:'利曼Vivaldi仍在進行：反攻結合補給阻擊與無人載具，不能把局部戰果寫成全城新收復',sourceIds:[latest,efe,isw],supersedes:['lyman-vivaldi-ugv-tactics-20260926','lyman-vivaldi-20260926'],
 sections:[
 {kind:'REPORTED',label:'最新戰況',text:'ArmyInform於9月27日轉述澤倫斯基的戰況說明：利曼方向的Vivaldi行動仍在進行，取得新成果並準備後續步驟，但沒有公布這一階段的具體範圍。這提供了行動持續的官方說法，並未證實你圖片所述的「9月25日重新控制利曼全城」。',evidence:[latest]},
 {kind:'REPORTED',label:'國外來源比對',text:'EFE於9月22日報導第三軍團宣稱第二階段增加逾40平方公里，並描述無人機對通信及補給的壓制；面積仍是軍方戰果宣稱。ISW的9月26日公開段落則分析先阻斷俄軍增援與補給、再清除滲透小組的打法。兩家有外部分析，但引用軍方的相同戰果並不變成獨立測量。',evidence:[efe,isw]},
 {kind:'ANALYSIS',label:'為何重要',text:'這些資料較一致指向：烏軍嘗試降低俄軍滲透兵力獲得增援的能力，並以無人系統支援步兵。若效果能維持，可能減輕利曼方向的防禦壓力；但EFE同時描述頓內茨克其他方向仍受壓，不能由一個方向的反攻推導整體戰局已逆轉。',evidence:[efe,isw]},
 {kind:'UNCERTAIN',label:'地圖與結論',text:'目前可確認的是行動持續與已公開的戰術說明。Yampil、Torske或全城控制邊界需要有日期的地理定位影像及地圖原始版本；附圖箭頭不是衛星判讀結果。本稿不沿用未核實的全城收復說法，也不把歷史通報的40平方公里當成今天新增領土。',evidence:[latest,efe,isw]}
 ]}];
for(const draft of drafts){fs.mkdirSync('research/drafts',{recursive:true});fs.writeFileSync('research/drafts/'+draft.id+'.json',JSON.stringify(draft,null,2));const report=publishResearchDraft(draft);console.log(JSON.stringify({id:report.id,asOf:report.asOf,sources:report.basis.length}));}
