# 軍事新聞研究與推播

使用者授權：查閱公開網站、完成中文分析後，推播給 `.env` 的 `COMMANDER_USER_ID`，且必須仍在 `src/subscribers.json` 訂閱名單。不要只發「待查」「待研究」狀態，不重複發同一版，不發測試訊息。

Codex 任務排程 ID：`discord`；每天 Asia/Taipei 07:30、19:30。這是有額度與本機在線條件的研究排程，不是無限常駐模型。先讀本機實際排程狀態；未執行完成不能宣稱已成功研究。

## 每次執行

1. 執行 `npm run research:refresh -- --force`，讀取最新原文與既有 `research/reports.json`，辨別來源是不是同一軍方公告或共同社轉載。
2. 使用 web 工具查阅相關網站與原文：台海優先國防部、海巡、日本海保與統合幕僚監部、USNI、War on the Rocks、AMTI；烏俄優先軍方原始聲明、ISW／Critical Threats、EFE及具地理定位依據的報導。ISW與Critical Threats同一評估不計兩份獨立證據。對照過去稿件，挑選實質新進展。
   每轮台海周邊研究必查巴士海峽／巴丹群島：Philippine Coast Guard、PIA、Reuters、ABS-CBN、GMA。使用 Batanes、Itbayat、Luzon Strait、research vessel、AIS 等議題詞，不能只查已知船名。Google News 海域專項採集只提供線索，不能取代正文研究。來源 403 記錄不可讀，改查合法公開的通訊社稿；索引內容須標為索引摘錄。PIA 轉載 PCG 與引用該聲明的媒體不算多個獨立觀测。
   在 research/runs/<時間>.json 留存本輪查過的議題、來源 URL、取得範圍、未能查閱的原因與發布／發送結果；來源採集成功不能當成所有區域研究完成。
3. 讀取事件本身的日期、文章發布／更新日期、數據範圍與原始引用。不得只改寫RSS標題。命令列HTTP403不繞過；可使用正常查閱工具，並記錄是完整正文、公開段落或索引摘錄。沒有讀到全文就不聲稱全文核對。付費牆不繞過。
4. 保存精簡的來源記錄JSON到 `research/references/`。含 url/title/publishedAt/publisher/originGroup/sourceType/body。body 可是忠實的閱讀筆記，但要明寫「閱讀筆記」與取得範圍，不假裝逐字原文；只知道日期要在 publisher 與 body 說明日期精度，不捏造精確時刻。執行 `node scripts/import_research_reference.js <參考JSON>`，取得 source id。
5. 撰寫繁體中文稿，先講新消息，再談背景與軍事意義、來源間一致與差異、明確結論與限制。每段 evidence 引用實際 sourceIds。不能由未核實地圖箭頭推導戰線，也不編造傷亡或兵力。普通報導不必有「自主研究」品牌或狀態文字。
6. draft 包含 id/title/theater/sourceIds/sections，sections kind 為 REPORTED／ANALYSIS／UNCERTAIN，每段 text 最長700字；theater 使用 taiwan_strait／ukraine_front／middle_east／global。替代錯誤舊稿用 supersedes 列出舊稿id，舊稿保留歷史但不再有效展示。
   發布後可用 Discord `/evidence event_id:report:<報導id>` 查看各段落引用、來源發布時間與同源群組；這是由已覆核稿件動態產生的證據索引，不把報導文字冒充原文摘錄或事件時間。新稿會保存發布時的來源索引；原始來源移除或雜湊變更後，證據頁標明僅存發布時索引、現時原文未重新核對。移出近期清單的舊稿保存在 `research/report_archive.json`，被取代後仍可查閱其歷史頁。
   更新舊稿填 `supersedes` 時必須同時填人工撰寫的 `changeSummary`（最多300字），說明真正改變的事實；確屬更正時另填 `updateType: "CORRECTION"`。一般新進展使用 `updateType: "UPDATE"` 或省略，不要標成更正。
7. 執行 `node scripts/publish_research_draft.js research/drafts/<稿件>.json`。引用雜湊、時效、大小驗證會拒絕無效稿；不能重設日期讓舊新聞變新。背景來源可早於48小時，但本次新進展須有真實的新來源。
8. 執行 `node scripts/deliver_research_reports.js <報導id...>`。只發目前通過驗證的新版本；使用SQLite紀錄去重、暫時失敗可重試，遵守使用者戰區與靜默設定。只有使用者在當次任務明確要求立即發送時才使用 `--explicit`。回傳 SENT 並有 messageId 才可說已送出。
   同一收件者先前收到被取代稿或同一稿的舊版本時，新推播會附人工 `changeSummary`、舊訊息連結（資料庫有頻道 ID 時）與證據頁指令；舊紀錄缺少快照時不臆造逐項差異。
9. 有衛星相關主題時，讀 `/api/satellite-assets` 或 `getSatelliteFeed()`：核對實際拍攝日期、範圍、來源產品與雲量。整片雲量不等於裁切區可見度；兩張圖不代表已做對位與變化判讀。影像不能確認的兵力／戰果，不補上推測圖。只附已核對與文章相關且有授權依據的圖，不用無關影像裝飾。

來源戰況圖只能用原作者當期貼文：先把原文以 `import_research_reference.js` 匯入，並加入稿件 `sourceIds`。`map` 需填 `sourceId`、`theater`、`sourceUrl`、`imageUrl`、`publishedAt`、`credit`、`caption`，人工確認後才設 `reviewed:true` 與 `displayAllowed:true`。來源 URL 與發布時間必須和匯入文件一致，地圖必須屬於該戰區，24 小時後停止展示。展示的是原作者的戰況主張；不得從截圖臆測現時控制線、箭頭、部隊身分或精確位置。沒有原始貼文與展示權限時，不發布該圖。更新研究稿後以網站戰區卡檢查圖、圖說與原始連結均正確。

國際報導和衛星影像可做分欄對照圖：各自標來源、事件／拍攝時間、產品 ID、範圍及限制。只有稿件 `imagery` 明確引用且產品 ID 與檔案雜湊一致的影像才進入圖卡；`CONTEXT_ONLY` 不對影像描出報導中的行動位置。若要在影像上畫觀察區，先核對座標系統、影像足跡、局部雲遮、拍攝與事件時間，且需要獨立可追溯的地理定位證據與人工覆核。公開研究機構的控制區圖只連回原圖；其地圖授權未允許時，不重製幾何或疊加至本站衛星圖。

圖卡的 `SOURCE_QUERY_EXTENT` 只來自驗證過的衛星裁切紀錄 `cropBbox`，表示來源查詢經緯度範圍；圖片經 UTM 裁切、縮放後，其邊緣不能當成精確經緯度線。N 箭頭是來源北向參考，圖卡不生成部隊、攻擊方向或控制區。

無實質新內容就不發布、不發空訊息。需要的帳號、來源或服務不可用時，記錄失敗與需處理事項，不發假新聞補位。首次與前幾次排程需核對發布及發送結果。

10. **每次執行最後一步（不論結果）**：記錄執行結果，研究排程健康頁（`/ops.html`、Discord `/analysis-health`）靠這份紀錄分辨「跑完無新內容」與「漏跑」：
   `node scripts/record_research_run.js --runner codex-discord --result <PUBLISHED|NO_NEW_CONTENT|FAILED|QUOTA_EXHAUSTED> [--published <稿件id>]... --note "一句說明"`
   失敗時 note 寫原因（例如哪個來源 403、額度不足）。沒有這筆紀錄，預定時間 2 小時後會被標為漏跑並私訊管理者。

事件時間軸使用 draft.timeline（title、note、events）。每個 event 需 date（YYYY-MM-DD）、timeLabel、place、text、kind（REPORTED_OBSERVATION／DISPUTED_SIGNAL／OFFICIAL_ASSESSMENT）、evidence。時間軸由同一稿件動態產生網站與 Discord 圖卡；數據不可寫入繪圖程式。AIS 異常點只列為有爭議訊號，不連成實際航線。日期、時區不明要明記。官方指控、照片拍到的現象與軍事意圖推測分開；航空照片不可標成衛星照。

## 本次手動驗證稿

- `east-china-sea-surveys-20260927`
- `lyman-vivaldi-progress-20260927`

這些稿件是有日期的報導範例，不是固定每日重播內容。網站與 Discord 共用相同 `research/reports.json`。

## 全球戰況與情境推演（新增）

每輪先讀 `public/data/global_theaters.json` 的全球研究清單，涵蓋烏俄、中東、蘇丹、緬甸、台海、南海與歐洲區域安全。清單是研究入口，並不表示網站採集成功或正在交戰；逐區查閱相關原文。可用 `node scripts/refresh_satellite_assets.js` 更新影像，這不等於完成判讀。

有實質變化時撰寫 `theater:global` 報導，新增 `coverage`（theater／summary／observedAt／evidence）。每區保留自身資料日期；較舊人道背景不得當成今天戰線。報導標題須說明覆蓋範圍，不能宣稱全世界都已查清。

`scenarios` 最多3個，必須包含 name／horizon／assumption／implication／triggers陣列／counterEvidence陣列／evidence。只做戰略與民用風險情境，不能產生攻擊位置、行軍路徑、目標弱點或作戰建議。不給未校準戰爭機率，情境不是事件事實。

`imagery` 最多2項，引用實際 region／productId／sha256／caption／role。背景使用 CONTEXT_ONLY；REVIEWED_OBSERVATION 必須有 observation／reviewedAt／evidence，且先閱讀影像並核對相關來源。不能把雲遮、季節、影像差異解釋成軍事動作。正文如依賴影像，先確認檔案與引用仍有效。

範例結構見 `research/drafts/global-strategic-20260928.json`，不得沿用其中數據產生新稿。用正常 publish 與 deliver 腳本發布推播。網站 `/global.html` 與新版 `/api/global-brief` 從同一份有效稿與影像資料組合；只更新 generation 日期不能把舊資料變新。

## 預警指標更新（2026-09-30 起）

每次定時研究完成後，另外檢查 `research/warning_indicators.json`：

1. 依 `research/ANALYSIS_SPEC.md` 第三節，逐項查核美伊、波蘭與北約東翼、烏俄的指標；台海由國防部原文自動判定，只需補具名演習、航行警告等人工指標。
2. 有新觀測就新增一筆：附 https 來源、`sourceClass`、`observedAt`、`reviewed: true`。已查核但未觸發也要記 `triggered: false`，否則會顯示「無法判定」。
3. 不得修改 `src/warning_board.js` 的等級規則；認為規則不合理時，在 `research/` 寫修改提案。
4. 同一原始公告的轉載只記一筆。

### 報導圖卡欄位（2026-09-30 起）
Discord 推播改以兩張 1920×1080 圖卡為主（第 1 張重點＋位置圖／衛星影像，第 2 張完整內容），稿件可多填兩個選填欄位：
- `location`：`{ "lat": 20.79, "lon": 121.84, "label": "Itbayat（巴丹群島）" }`。只填來源明確提到的地點（取該地名的座標，不自行推算船位或戰線）；label 最多 30 字。沒有明確地點就不填，圖卡改用戰區熱區圖。
- `cardPoints`：最多 4 則 `{ "kind": "REPORTED|ANALYSIS|UNCERTAIN", "label": "短標題", "text": "一句話重點（120 字內）" }`，給第 1 張大字重點用；沒填時取各段第一句。重點必須能在該段 sections 找到依據，不可新增內容。
- 有 `imagery`（經核對的衛星影像）時，第 1 張會優先放該影像。
- 全文一律用臺灣繁體中文字形與用語（例如「圖」不寫「图」、「影片」不寫「視頻」）。
