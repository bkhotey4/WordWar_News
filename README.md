# WordWar_News

公開資料來源狀態與待查線索看板。公開 ADS-B 訊號、新聞標題和衛星產品目錄各有不同涵蓋範圍，不能直接推算全球危機或官方戰備級別。

## 網頁情勢簡報

`/briefing.html` 的首頁列出目前仍有效的已覆核報導與各篇新事實，並在同一瀏覽器記錄上次開啟時的報導清單，標示其後新增或更新的篇數。這是瀏覽器開啟紀錄比較，不代表戰場事件數或警戒等級變動；清除瀏覽器儲存資料後會回到首次開啟狀態。

衛星頁僅在當期研究稿明確填入 `imagery`，且產品 ID、區域及檔案雜湊與已驗證來源影像一致時出現。背景影像會標示 `CONTEXT_ONLY`，不宣稱確認攻擊、戰損或部隊位置；沒有合格引用時，簡報只顯示文字頁。公開網站的 `scripts/site_briefing.js` 也只複製這些被報導引用的產品，不依同戰區或低雲量自動挑圖。

## 目前資料

網站與 Discord 的主報導採用同一份自主研究稿：繁體中文的最新消息、來源比對、研判與待確認處，每一段都有研究來源。RSS 標題只用來找線索，不再當作主報導直接貼出。

原始公告與訪談由 `src/research_reports.js` 擷取正文與原始發布時間，私下保存於 `research/sources.json`；公開介面只提供中文研究稿與來源連結，不提供原始全文。軍方公告和軍方媒體維持相同來源群組，不視為獨立證實。`research/reports.json` 的每篇稿件綁定原文內容雜湊；來源更改或資料時間超過 48 小時即停止提供舊研判，重新擷取不能替舊稿刷新日期。網站與 Discord 共用 `getResearchFeed()`。

**目前能力：**原文爬取已接入巡檢，採30分鐘快取；Codex 本機排程負責外部網站查閱、分析、發布與 Discord 推播。有實質新內容才送報導，不送空的待研究提示。來源採集與研究成功分別記錄；ISW 有些頁面只能查閱公開索引摘錄，引用時須註明取得範圍。

事件的 `map` 須有獨立發布時間、原始貼文 URL、圖片 URL、作者與圖說，以及明確的 `reviewed` / `displayAllowed` 狀態，才會出現在網站與 Discord。過期地圖不沿用新聞的新時間。來源戰況標註不稱作衛星判讀；目前尚未接入當期事件地圖。

- OpenSky ADS-B：顯示最近 15 分鐘成功取得的公開航空器訊號。未廣播、未被接收或 API 限流時，不顯示為零事件。
- RSS / Google News：只保留有有效發布時間的近期標題。關鍵詞命中是待查線索，不代表事件已證實；Google News 不是國防部原始通報。
- Element84 Earth Search STAC：查詢指定區域相交的 Sentinel-2 產品；新的衛星影像管線從來源產品裁切，保存產品 ID、拍攝時間、來源及檔案雜湊。歷史無來源圖片不作為判讀依據。產品整片的雲量不能證明裁切區可見，未實際判讀也不能宣稱戰果。
- 舊熱點資料是情境參考。缺近期原始觀測時，API 回傳 `UNKNOWN` / `UNVERIFIED`。即時來源只寫入 `public/data/live_intel.json`，狀態與地圖 API 讀取同一份資料，避免兩份檔案各自維護即時分數。
- 總體危機分數與模型級別已暫停。現有來源不足以建立經校準的多來源風險模型；資料頁只顯示各來源的觀測與時間。
- 公開首頁已改為來源監測看板。舊圖卡、打擊目標檔與直接發送舊簡報的腳本封存在 `scratch/legacy_ui_20260926/`，不再由網站提供或由訂閱流程調用。

## 執行

```powershell
npm install
npm start
```

網站預設 `http://localhost:3000`。Discord 機器人需在本機 `.env` 設定 `DISCORD_BOT_TOKEN`，再執行 `npm run bot`。機器人只開放可回報來源狀態的指令；舊版專題暫停當作即時情報提供。

## 檢查

```powershell
node --test scripts/test_data_integrity.js
node --test scripts/test_news_reports.js
node --test scripts/test_research_reports.js
```

`/api/status`、`/api/conflicts`、`/api/imagery`、`/api/health` 可檢查資料與來源健康狀態。舊衛星參考圖仍未核實；新的實際产品影像請查 `/api/satellite-assets`，附產品來源、拍攝時間與檔案雜湊。

## 後續資料管線

重新取得原始研究資料可執行 `npm run research:refresh -- --force`；完成原文核對後，用 `node scripts/publish_research_draft.js research/drafts/<稿件>.json` 匯入中文研究稿。這是人工覆核流程，不是假裝自動模型。研究檔案保存於網站公開目錄之外。

只有在取得原始產品影像、產品 ID、拍攝與發布時間、地理範圍、授權及逐項判讀依據後，才應把圖像分析納入預警。跨來源通知應保留原文連結、時間、重複事件合併與人工覆核結果；評分模型需另做歷史回測與誤報率校準。

## 尚有限制與系統須知

- Codex 本機研究排程已設定每日 07:30、19:30；需電腦、app 在線及帳號有額度。排程已設定不代表每次研究已成功，須核對報導及 Discord 發送紀錄。
- 目前原文自動採集主要是烏克蘭軍方與軍方媒體；來源數量不等於獨立佐證數。外部評估需另外查閱並匯入。
- 衛星已有實際產品影像與不同日期目視比對；尚無事件判讀或自動變化分析。
- 未核實新聞保留為待查線索，不發送已核實特報；公開航空異常仍是待查通知，台海 P95 僅供觀察。不能宣稱能預測戰爭。
- 新官方觀測與影像登錄使用 SQLite 交易；研究稿及部分狀態仍使用 JSON，需避免多程序同時寫入。
- Discord 已接受訊息後、成功紀錄落盤前若程序崩潰，仍可能重送；目前無法保證嚴格只送一次。
- 對引用的格式與時效驗證不會自動證明段落語意真的受到來源支持，仍需研究者比對原文。
- 舊專題與圖卡產生器尚保留歷史內容，但沒有接回有效報導流程。要恢復功能必須改為讀取有來源的資料。

## 定時研究接手

Codex 排程查閱公開來源、比對原文、完成中文稿，再發布與推播；無新內容時保持安靜。SQLite 依報導版本及收件人記錄送出結果。完整步驟見 [研究與推播流程](research/RESEARCH_WORKFLOW.md)。來源爬取本身不等於分析完成。

## 2026-09-27 Gemini 複查

修正衛星熱點誤證實攻擊、NOTAM 未核實資料、觀察模式推播與來源冒名問題。`npm test` 50 項通過。詳見 [檢查與功能建議](research/GEMINI_REVIEW_20260927.md)。NOTAM 官方自動採集尚未設定。

同日第二次深度檢查修正來源數量冒充證實、未標記事件被算誤報、整片雲量冒充裁切區可判讀、取消 NOTAM 與跨過境 FRP 混算等問題。兩篇外部來源分析報導已實際推送，完整紀錄見 [深度檢查](research/DEEP_REVIEW_20260927.md)。

## 全球戰況、衛星與情境推演

入口 `/global.html`。八區研究清單讀取 `public/data/global_theaters.json`，新增民用影像區域讀取 `research/satellite_regions.json`；更新資料不必修改網頁程式。`npm run satellite:refresh -- --force` 查詢及下載来源產品；沒有成功的區域不會拿其他區域影像補位。每區優先展示經原文、日期、戰區與展示權限核對的來源戰況圖，附作者、圖說及原始貼文；沒有合格地圖就明示缺圖，不從新聞或衛星圖片自動畫控制線與箭頭。

全球稿與一般稿共用发布、時效、來源雜湊與推播收據。`coverage` 保留每區自己的資料日期，`scenarios` 附假設、成立條件、反證與來源，`imagery` 以產品與檔案雜湊配對，最多兩張。新版本重新推播，只有生成時間改變不重送。單次推播改用 Discord HTTPS API，無須額外開啟 Gateway 常駐連線。

全球頁現在會把稿件引用的衛星產品與該戰區的國際報導做成分欄對照圖，保留兩者各自的時間與來源。背景影像不代表報導所述事件已被影像證實；只有完成人工判讀的觀察才顯示觀察文字。第三方來源戰況圖須先核對原帖和展示權限，不自動重製其控制線。

若來源影像是經驗證的指定區域裁切，對照圖另顯示來自該產品裁切紀錄的查詢經緯度範圍與北向標記。這些座標由 `cropBbox` 動態產生，表示影像查詢範圍，並非事件位置或戰線。沒有可引用的地理定位資料時，不產生控制區或推進箭頭。

新版服務提供 `/api/global-brief`、bot 提供 `/global-brief`；常駐程序重新載入後可用。靜態全球頁面使用既有 `/api/reports` 和 `/api/satellite-assets`，已可在現有服務使用。衛星畫面是拍攝時的地表，背景圖不代表已判讀戰果；尚無 SAR、自动對位／變化判讀或完整全球覆蓋。

watchdog 現在每約30秒檢查網站程序，網站中途停止時可自行恢復；曾以停止本專案網站程序的方式驗證七區 API 重新提供服務。全球頁面遇到只有日期的來源會顯示「來源只標示日期」，不把資料庫使用的 `00:00` 表示法誤當發布時刻。Discord bot 仍由 watchdog 依其既有程序監督。

## 2026-09-29 更新

- **分析規格**：新增 [research/ANALYSIS_SPEC.md](research/ANALYSIS_SPEC.md)，定義四級預警、各戰區指標與回測要求。任何 AI 修改分析或推播邏輯前須先閱讀。
- **戰區調整**：新增「美伊戰爭與荷莫茲海峽」（`iran_gulf`，衛星區域 `hormuz_bandar_abbas`）；`europe_security` 改名為「波蘭與北約東翼」；`middle_east` 改名為「以巴、黎巴嫩與紅海」。目前共八區。
- **新聞來源**：新增美伊與荷莫茲中英文 Google News 標題來源；共機新聞改為先依時間排序並限 24 小時內，修正長期顯示 0 則的問題。
- **Discord 文字修復**：`src/bot.js` 原有 528 行中文亂碼，已依 9/24 備份與修補腳本還原，其餘逐行重寫；`/verify` 的 `text` 參數恢復為必填。
- **清理**：舊的 bot 備份檔與一次性修正腳本移到 `scratch/legacy_cleanup_20260929/`；修改前的檔案備份在 `scratch/backup_20260929_claude/`。

## 2026-09-30 戰區預警看板（試行）

- 新增 `src/warning_board.js`，依 [ANALYSIS_SPEC](research/ANALYSIS_SPEC.md) 計算台海、美伊、波蘭與北約東翼、烏俄四區的四級警戒。
- 查詢方式：網站 `/global.html` 戰區卡片、API `/api/warning`、Discord `/warning`、私訊「預警」。
- 台海指標由國防部原文自動判定；其他戰區指標寫在 `research/warning_indicators.json`，須附來源並經覆核。
- 試行期間不主動推播；完成回測前，等級不是開戰機率。

## 2026-09-30 自動指標與 Discord 推播

- `src/collectors/ukmto.js`：抓取 UKMTO 官方事件 API，判定荷莫茲／波灣船舶遇襲是否超過歷史基準。
- `src/collectors/ukraine_air.js`：抓取烏克蘭空軍官方 Telegram 每日通報，記錄無人機與飛彈數（已回溯 7/18 起資料）。
- 兩者每 30 分鐘隨資料巡檢更新，快取在 `research/source_cache/`。
- **Discord 推播**：機器人巡檢時，預警等級一有變化就私訊訂閱者；每天台北時間 08:00 後推一次全部戰區摘要。推播狀態記在 `research/warning_push_state.json`，同一變化不重複發送。

## 2026-09-30 戰場圖（Discord）

- `src/battle_map.js`＋`src/battle_map_core.js`：每張圖上方是一段中文說明，下方是 Sentinel-2 無雲衛星底圖加上有來源的圖層；八個戰區都有。
- 烏俄：DeepStateMap 控制區、近 7 天俄方新增／烏方收復的區域與面積（像素估算）、DeepState 更新中附座標的推進與收復地點；不填方向時自動挑本週變化最大的方向。資料由 `src/collectors/deepstate.js` 每 3 小時更新。
- 台海：國防部每日共機／共艦數、海峽中線（示意）；國防部未公布精確位置，所以不畫航跡。
- 美伊：UKMTO 官方座標的船舶遇襲點（近 7 天紅、8–30 天橘）。
- 其他戰區：地名，加上 `research/warning_indicators.json` 中附 `location`（座標）或 `arrow`（來源寫明的移動方向）的已覆核事件。
- Discord：`/battle-map 戰區 [方向]`、私訊「戰場圖」或「台海戰場圖」等；每日 08:00 摘要附全部戰區圖，預警等級變化時附該戰區圖。
- 底圖：Sentinel-2 cloudless 2020 © EOX IT Services（CC BY-NC-SA 4.0，限非商業使用並須標示），圖塊快取於 `research/tile_cache/`。

## 2026-09-30 多來源比對＋定時排程

- 新增 `mapEvents`（在 `research/warning_indicators.json`）：多來源比對後的事件，標明「多來源一致／單一來源／有爭議」、比對說明與來源連結；戰場圖以實心（多來源一致）或空心（未證實）圓點標出，Discord 訊息附比對來源連結。不影響預警等級。
- 缺座標的地名由 `src/geocode.js` 以 OpenStreetMap 查詢（每秒 1 次、結果快取於 `research/geocode_cache.json`），只接受落在該圖範圍內的結果。
- Claude 定時任務「戰場情資比對」每天 06:52、18:52（台北）依 `research/INTEL_RESEARCH_TASK.md` 查證、寫入紀錄並執行 `node scripts/validate_intel_ledger.js`；需電腦開機且 Claude 桌面版在線。

## 2026-09-30 台海前兆與來源故障通知

- `src/collectors/china_msa.js`：中國海事局軍事航行警告（福建、浙江、廣東、上海），禁航區畫在台海戰場圖上，並作為 `tw_nav_warning` 指標。首次執行回溯約 12 頁列表。
- `src/collectors/japan_js.js`：日本統合幕僚監部中國艦艇／軍機動向（列表含 2007 年起全部標題，可做歷史回測），作為 `tw_japan_fleet` 指標；通過水道以概略位置標在圖上。
- `src/source_health.js`：各來源超過時限（多數 12 小時）未成功更新時，私訊管理者（`COMMANDER_USER_ID`），恢復時再通知一次；私訊輸入「來源狀態」可查全部來源。

## 2026-09-30 戰況海報

- `src/poster.js`＋`src/poster_core.js`：1920×1080 簡報風格海報。全球版＝三大重點＋四大戰區狀態卡＋其他戰區；戰區版＝熱區地圖（事件光暈）、四個關鍵數字、武器／熱區排行、30 天趨勢、兵力估計、三大重點。
- 武器型號：`src/collectors/ukraine_air.js` 從烏克蘭空軍通報解析飛彈類別／型號與無人機類型（近 14 天缺漏會自動補抓）。
- 兵力：只讀 `research/force_estimates.json` 中有出處的數字，超過 90 天標示「較舊」；沒有就寫「暫無可靠的公開兵力估計」。
- Discord：`/poster [戰區]`、私訊「海報」「台海海報」；每日 08:00 摘要最前面附全球海報。

## 準備提醒與採購清單（2026-09-30）
- `/prepare`（可填 people、days）或私訊「準備清單」「要買什麼」「準備清單 3人 14天」：顯示目前台海準備階段，並依人數天數換算採購清單。
- 巡邏迴圈每 3 分鐘檢查台海預警等級：第 2 級「檢查存貨」、第 3 級「趁現在補齊」、第 4 級（或決定性指標觸發）「待命」，第 4 級不受靜默時段限制；回到常態時送一次解除通知。
- 清單資料：`research/prepare_checklist.json`（📘 官方指引明列／📐 估算），狀態檔：`research/prepare_push_state.json`。

## 戰況報導圖卡（2026-09-30）
- 研究報導推播（含 `/war-report`、`/global-brief`、私訊「戰況報導」、每日簡報）改為先附兩張 1920×1080 圖卡：第 1 張大字重點＋位置圖（或稿件附的衛星影像、戰區熱區圖），第 2 張完整內容與來源；下方文字只留來源連結。畫圖失敗時自動改回文字版。
- 稿件可填 `location`、`cardPoints`（說明見 research/RESEARCH_WORKFLOW.md）。程式：`src/report_card.js`、`src/report_card_core.js`。

## 台海來源修復與新監測（2026-09-30）
- 國防部、中國海事局改用 `src/win_fetch.js`：瀏覽器標頭＋在 Windows 被擋（403／憑證鏈錯誤）時改用 PowerShell 抓取。
- `src/collectors/pla_joint.js`：Google News 標題交叉比對「聯合戰備警巡」與具名演習（聯合利劍、海峽雷霆等），同日 2 家以上媒體才確認；觸發台海主要指標並即時私訊快訊（具名演習不受靜默時段限制）。
- `src/collectors/taiwan_infra.js`：IODA 斷網（全台、澎湖、金門、馬祖）、海纜中斷與大停電（≥5 萬戶，2 家媒體確認）；海纜／斷網列為台海次要指標，並推播生活提醒。
- `research/sensitive_dates.json`：敏感日期行事曆；POLITICAL 類觸發「政治時間點」次要指標，其餘只在看板與準備提醒中提示。
- 更正推播只處理國防部原文（修正把其他來源標成「國防部通報修訂」的問題）。
- 推播下方加按鈕（看戰場圖、預警看板、準備清單、戰區靜音 24 小時）；`/weekly` 每週戰況週報，週日 20:00 後自動推播。

## 2026-10-02 修正
- 預警規則 v2：同一行動衍生的指標合併計算（見 research/ANALYSIS_SPEC.md）。
- 共機新聞標題查詢改為單層 OR（原查詢一直回傳 0 則）。
- 海事局軍事公告分類加入「禁止驶入／实际使用武器／禁航」，排除火箭殘骸落區。
- 聯合戰備警巡隔天的追蹤報導不再重複推播。
- bot_watchdog.ps1：重啟時保留前 3 次紀錄（logs/bot_stdout.1.log …），看門狗本身重新啟動後生效。

## 2026-10-07 運作監看、時間線、回測、衛星對照、網站版圖卡
- **研究排程健康**（`src/research_health.js`）：網站 `/ops.html`、API `/api/research-health`、Discord `/analysis-health`。自動偵測 Codex 排程，其他排程寫在 `research/research_schedules.json`。研究流程最後一步執行 `node scripts/record_research_run.js --runner … --result …`，寫入 `research/research_runs.json`；預定時間 2 小時後仍無紀錄標為「漏跑」，超過 14 小時沒有成功紀錄會經來源健康通知私訊管理者。
- **事件時間線與更正**（`src/event_timeline.js`）：網站 `/events.html`、API `/api/event-timeline`、Discord `/events`、`/corrections`。合併已覆核事件、預警指標、原文修訂（含數值差異）、研究稿被取代／停止展示與預警等級變化，分列事件、發布、記錄三種時間。同一事件只依 `thread`／`role`／`corrects` 欄位串接（見 research/INTEL_RESEARCH_TASK.md），不自動合併。
- **預警回測**（`src/warning_backtest.js`）：網站 `/ops.html`、API `/api/warning-backtest`、Discord `/backtest`、`npm run backtest:warning`（寫入 `research/backtest_report.json`）。參考事件在 `research/backtest_events.json`（ANALYSIS_SPEC 第五節六次台海演習）。日本統合幕僚監部指標可回溯到 2022 年；海事局與預警看板資料只涵蓋 2026 年，涵蓋期外的事件標「無資料」不算漏報。
- **衛星前後期對照**（`src/satellite_compare.js`）：`/global.html` 各戰區卡片的滑桿對照與像素差異疊圖，API `/api/satellite-compare`。以像素實測裁切區可見比例（≥60%），只比較同一裁切範圍的兩期；差異圖未做輻射校正與精確對位，只是待查線索。
- **網站版戰場圖／海報**：`/global.html` 按鈕產生，API `/api/battle-map/<戰區>`、`/api/poster/<戰區|global>`（加 `.jpg` 取圖），與 Discord 同一繪圖程式，20 分鐘快取、一次只畫一張。
- 測試：`scripts/test_ops_features.js`（已加入 `npm test`）。修改前備份在 `scratch/backup_20261007_features/`。

## 2026-10-12 被擋來源的典藏備援、海上保安廳航行警報、NOTAM 現況
- **UKMTO 與日本統合幕僚監部自 10/7 起 HTTP 403**：兩個網站都改用 Cloudflare 防機器人（瀏覽器可開，程式連線被擋）。依研究規則不偽裝瀏覽器、不繞過驗證，改由 `src/archive_fetch.js` 走 Internet Archive：先讀公開快照（統合幕僚監部約每 5 小時一份），沒有新快照就請典藏機構抓一次（Save Page Now，每 6 小時最多一次；UKMTO 的 JSON 由此取得）。來源狀態顯示 `ONLINE_VIA_ARCHIVE`，資料時間以快照時間為準，`/api/warning` 與來源狀態都會註明。
- **新來源 `src/collectors/jcg_navwarn.js`**：日本海上保安廳 NAVAREA XI 航行警報（公開、免登入、英文正文）。這是事前公告的射擊、演習、飛彈落區與北韓飛彈發射通報；對應台海次要指標 `tw_jcg_firing` 與朝鮮半島主要指標 `kr_missile`（與媒體比對並列）。每 3 小時更新，快取 `research/source_cache/jcg_navwarn.json`。
- **NOTAM 官方自動採集仍未接通，原因已查明**：台灣飛航服務總臺的 NOTAM 系統（ais.anws.gov.tw）須登記帳號；美國 FAA NOTAM 查詢與 MARAD 海事公告對非美國位址回 403（地區封鎖）；NGA 航行警告沒有公開 JSON 介面。要接官方 NOTAM，需要你向飛航服務總臺申請帳號（免費），之後 `src/notam_monitor.js` 可接上。目前海事局航行警告（已採集）與海上保安廳航行警報已涵蓋海上演習區的事前公告。
- 測試：`scripts/test_archive_fetch.js`、`scripts/test_jcg_ukmto_archive.js`（已加入 `npm test`）。

## 2026-10-12 官方第一手 feed（取代新聞標題猜測）
- **`src/collectors/travel_advisories.js`**：美國國務院、英國 FCDO、日本外務省、台灣外交部領事事務局的旅遊警示／撤離公告（都是官方 RSS／Atom，免登入）。等級升到 3／4 級或出現撤離字樣才算事件，對應各戰區「撤僑、使館人員撤離或旅遊警示升級」指標（與媒體比對並列）。
- **`src/collectors/twse_flows.js`**：證交所三大法人買賣金額的外資淨額（官方開放資料），每日收盤後更新、自動回補 60 個交易日基線；外資單日淨賣超 z ≤ −2.5 或 ≥ 600 億元觸發台海次要指標。不構成投資建議。
- **`src/collectors/cn_official.js`**：中國國防部新聞發言人、國防部網東部戰區專欄、國台辦記者會輯錄。官方發布的聯合戰備警巡（72 小時）、涉台演習（7 天）直接觸發對應主要指標；言論強度指數（關鍵詞加權，近 3 天超過 90 日 P90）觸發台海次要指標。國防部網只有 http（https 憑證錯誤），頁面為 GB2312，`archive_fetch.decodeBuffer` 依字元集解碼。
- **預測市場不接**：Polymarket 在台灣被 ISP 封鎖（DNS 回應封鎖頁）；Metaculus 需帳號；且 ANALYSIS_SPEC 禁止顯示機率。若要接，需要你決定並註冊帳號。
- 測試：`scripts/test_official_feeds.js`（已加入 `npm test`）。

## 2026-10-15 中國政局（獨立分頁，本機與公開站）
- **頁面**：本機 `/china.html`（`public/china.js` 讀 `/api/cn-politics`）；公開站 `china.html` 由 `scripts/site_china.js` 產生純靜態 HTML（含 SVG 走勢圖，不需 JavaScript），已加入首頁「更多」導覽。內容：官方對台論調走勢（90 天）、脅迫／和統用語標題、軍方高層人事與整肅、每週中國政局研究（最新與往期）、政治行事曆。
- **第一層（程式）`src/collectors/cn_politics.js`**：中國台灣網（國台辦官方入口）時政與評論、新華台灣頻道的涉台標題論調（和統類／脅迫類用語占比，對比 90 日 P90）；中國軍網「軍委」「戰區」專欄的任免、審查調查公告（30 天 2 則觸發）。對應台海次要指標 `tw_party_tone`、`tw_pla_personnel`，不推高主要等級。行事曆 `research/cn_political_calendar.json` 只作背景。
- **為什麼不用人民日報／新華時政 RSS**：從本機連到的是 2022／2025 年的過期快取頁；全國人大網列表是 JavaScript 動態載入。人大常委會的罷免公告改由每週研究稿人工查核。
- **第二層（研究）**：Claude 排程「中國政局週報」每週一 21:15 讀官方公報、人大公告與智庫分析（China Leadership Monitor、Jamestown China Brief、MERICS、CSIS ChinaPower、國防安全研究院），寫入 `research/cn_politics_weekly/YYYY-Www.json`（格式見該目錄 README），`node scripts/check_cn_politics_brief.js` 合格才展示；分開寫「能力」與「意圖」，不得寫開戰機率。
- 誠實限制：中國內政是慢變數，歷史上六次大型演習都是對台灣或美國政治事件的反應，不是對中共政治日曆的反應；這一頁提供背景與能力判斷，不是提前量。
- 測試：`scripts/test_cn_politics.js`（已加入 `npm test`）。

## 2026-10-12 資訊環境：GDELT 與 Cloudflare Radar
- **`src/collectors/gdelt.js`**：GDELT 全球新聞資料庫（免費、免登入）各戰區關鍵詞的每日報導量強度，最新一天超過前 30 天 P90 且達中位數 2 倍時觸發各戰區 `*_media_surge` 次要指標。GDELT 限每 5 秒 1 次請求、本機連線偶爾逾時，採 10 秒間隔、失敗重試一次、每 2 小時更新；資料延遲 1–2 天。報導量只作佐證。
- **`src/collectors/cloudflare_radar.js`**：對台灣的 DDoS 攻擊流量與 Cloudflare 標註的網路中斷，對應台海次要指標 `tw_cyber`。**需要你建立 Cloudflare 免費帳號的 API Token**（My Profile → API Tokens → Create Token，權限 Account.Radar:Read），填入 `.env` 的 `CLOUDFLARE_RADAR_TOKEN`，機器人重新啟動後生效；未設定時指標顯示「無法判定」，不影響其他功能。
- 測試：`scripts/test_info_environment.js`（已加入 `npm test`）。

## 版本控制、換電腦與影像存放（2026-10-07）
- **git**：專案已建立 git 版本庫（`main` 分支；完整備份在私人倉庫 `worldwar-state` 的 `code` 分支）。`.env`、訂閱者資料、SQLite、原始來源全文、衛星影像與執行期狀態不進版本庫，見 `.gitignore`。以後改程式前不必再手動備份到 `scratch/`。
- **換電腦**（2026-10-26 起；程式、資料都在 GitHub，舊電腦不必開機）：
  - 存放位置：完整程式碼（含歷史）在私人倉庫 `bkhotey4/worldwar-state` 的 `code` 分支，每次 `node scripts/export_public_repo.js --push` 會同時更新公開倉庫與這個分支；執行期資料（研究稿、報導、訂閱者、資料庫）在同一倉庫的 `main` 分支，由雲端巡檢每 15 分鐘更新；網站在 `bkhotey4/wordwar-intel`。只有 `.env` 的金鑰不在 GitHub，請另存在密碼管理器。
  - 新電腦步驟：
    1. 安裝 Node.js 22 與 Git for Windows（第一次存取私人倉庫時會跳出 GitHub 登入）。
    2. 在桌面開命令提示字元：`git clone -b code https://github.com/bkhotey4/worldwar-state.git WordWar_News`，再 `cd WordWar_News`。
    3. `node scripts/setup_new_pc.js`：整理分支、安裝套件、建立 `.env`（含 `CLOUD_PRIMARY=1`）、下載雲端資料、取得網站倉庫；最後列出要手動填的金鑰。
    4. 填好 `.env` 後雙擊「啟動戰情系統.bat」；要開機自動啟動再執行 `node scripts/install_startup_watchdog.js`（專案放在桌面的 `WordWar_News`）。
    5. 舊電腦關掉機器人，避免兩台同時回應指令。
  - 兩台電腦都改過程式時：發布前先 `git pull`（`main` 追蹤 `backup/code`）；備份分支不強制推送，舊電腦不會蓋掉新程式。
  - 雲端的部分（GitHub Actions 巡檢、Claude 雲端研究排程）不綁電腦，換電腦不必重設；GitHub Secrets 也不用重填。
- **`/api/push-dm`**：金鑰只接受 `x-admin-key` header，至少 24 字元；網站預設只接受本機連線（`.env` 的 `HOST=127.0.0.1`），要讓同網路的手機看網站改成 `HOST=0.0.0.0`。
- **每週週報 PDF**：`/api/weekly.pdf`（全球頁有下載連結）、Discord `/weekly` 與週日推播都附 PDF。內容是週報、全球海報與台海／烏俄／美伊／北約東翼海報，約 5 MB。PDF 改用 Noto Sans TC（Windows 內建 `NotoSansTC-VF.ttf`），只內嵌用到的字；微軟正黑體是 .ttc 字型集，會整套內嵌、檔案超過 25 MB。
- **Discord 機器人程式結構**：`src/bot.js` 只負責連線、註冊指令與掛上處理程式；功能在 `src/bot/`：`commands.js`（指令定義與註冊名單）、`patrol.js`（定時巡檢與推播）、`dm_handler.js`（私訊關鍵字）、`interaction_handler.js`（Slash 指令與按鈕）、`payloads.js`、`broadcast.js`、`subscribers.js`、`state.js`、`config.js`。已暫停的舊專題指令（約 1,100 行、24 個主題）已刪除，需要時可從 git 歷史找回。
- **衛星影像**：新裁切圖存成 WebP（品質 90）。`npm run satellite:optimize [-- --dry-run]` 轉換舊 PNG 並清除超過 30 天的影像（每區保留最新 3 張）；每次衛星更新後也會自動清除。研究稿或草稿引用的影像不轉檔、不刪除。
