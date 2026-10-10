# 定時情資比對流程（Claude 排程，每天 06:52、18:52 台北時間）

目的：查閱多個公開來源，比對後把事件寫進 `research/warning_indicators.json`，Discord 機器人會自動畫進戰場圖並推播。**本流程不修改程式、不直接發送 Discord 訊息。**

## 一、每次要查的來源

| 戰區 | 必查 | 補充 |
|---|---|---|
| 烏俄 `ukraine_front` | ISW 每日評估（criticalthreats.org 的 Russian Offensive Campaign Assessment）、DeepState 更新 | 烏軍總參謀部／各軍團、俄國防部（交戰方聲稱）、Reuters／AP |
| 台海 `taiwan_strait` | 國防部即時軍事動態（mnd.gov.tw） | 日本統合幕僚監部、菲律賓海巡、CNA、Reuters、中國海事局航行警告 |
| 美伊 `iran_gulf` | UKMTO（程式已自動抓）、CENTCOM | Reuters、Al Jazeera、IAEA |
| 波蘭與北約東翼 `europe_security` | 波蘭作戰司令部／國防部、羅馬尼亞國防部 | Notes from Poland、Reuters |
| 以巴紅海、蘇丹、緬甸、南海 | 聯合國 OCHA／各國官方 | Reuters、AP、AMTI（南海） |

## 二、比對規則

1. 同一件事至少找兩個**不同發布者**。轉載同一份公告只算一個來源。
2. `confidence`：
   - `CONFIRMED_MULTI` 多來源一致：≥2 個不同發布者，且至少一個不是交戰方聲稱（`PARTY_CLAIM`）。
   - `SINGLE_SOURCE` 單一來源：只有一方說。
   - `DISPUTED` 有爭議：來源說法互相矛盾。
3. `comparison` 用一兩句話寫清楚「誰說了什麼、哪裡一致、哪裡沒證實」。
4. 只有來源明確寫出移動方向（例如「從 A 往 B 推進」）且兩端都有座標時，才加 `arrow`。不要自己推測方向。
5. 座標：
   - 來源本身有座標（如 DeepState 連結的 `#縮放/緯度/經度`、UKMTO）→ `basis: "SOURCE_COORDS"`。
   - 由文字推算（「某島西北 38 浬」）→ `basis: "DERIVED_FROM_TEXT"`。
   - 其他情況**不要填座標**，只填 `place.name`（英文拼法）與 `place.admin`（區／省），機器人會用 OpenStreetMap 地名查詢，只接受落在該圖範圍內的結果。
6. 已存在的事件不要重複新增；有新資訊就更新該筆的 `sources`、`comparison`、`confidence`。
7. 事件超過 14 天不會再畫出，不必刪除。
8. 事件時間線（網站 `/events.html`）：同一件事的首報、後續、否認、更正分屬不同紀錄時，填相同的 `thread`（英數與 `_-`，例如 `batanes-jiahaike7`），並填 `role`：`FIRST_REPORT`／`FOLLOW_UP`／`CORROBORATION`／`DENIAL`／`CORRECTION`。更正紀錄要加 `corrects`（被更正那筆的 id），舊紀錄不要刪改，保留歷史。只有確定是同一件事才串接，地點或時間相近不算。

## 三、mapEvents 格式

```json
{
  "id": "ua-lyman-ridkodub-20260927",
  "theater": "ukraine_front",
  "observedAt": "2026-09-27T21:23:38Z",
  "title": "烏軍收復里德科杜布（≤40字）",
  "summary": "發生了什麼（≤240字）",
  "comparison": "比對說明（≤240字）",
  "place": { "name": "Ridkodub", "admin": "Kramatorsk Raion, Donetsk Oblast", "lat": 49.19, "lon": 37.80, "basis": "SOURCE_COORDS" },
  "side": "UA | RU | ROC | PRC | PH | US | IR | OTHER",
  "kind": "ADVANCE | CLAIMED_ADVANCE | STRIKE | INCIDENT | MANEUVER",
  "confidence": "CONFIRMED_MULTI | SINGLE_SOURCE | DISPUTED",
  "arrow": { "from": [經度, 緯度], "to": [經度, 緯度], "label": "佯攻（≤30字）" },
  "sources": [{ "url": "https://…", "publisher": "ISW／CTP", "sourceClass": "OFFICIAL | INDEPENDENT_MEDIA | EXTERNAL_ASSESSMENT | PARTY_CLAIM", "publishedAt": "2026-09-28T00:00:00Z" }],
  "reviewed": true,
  "reviewedAt": "查核時間"
}
```

預警指標（`entries`）的規則見 `research/ANALYSIS_SPEC.md`；會改變警戒等級的觀測寫在 `entries`，只是要畫在圖上的事件寫在 `mapEvents`。

## 四、兵力估計（海報用）

`research/force_estimates.json` 只收有明確出處與日期的兵力數字（官方、交戰方聲稱、外部評估如 ISW／英國國防部／美國國防部報告）。查到比現有更新的數字就新增一筆（`id`、`theater`、`side`、`label`、`value`、`asOf`、`source.url／publisher／sourceClass`、`note`），舊的不要刪。**不得自行估算或換算。**

## 五、收尾

1. 執行 `node scripts/validate_intel_ledger.js`，必須顯示不合格 0 筆；否則修正後再跑。
2. 在 `research/runs/` 新增一筆紀錄（檔名 `intel-YYYYMMDD-HHMM.json`）：查了哪些來源、新增／更新哪些事件、查不到或被擋的來源。
3. 沒有新事件就只寫紀錄，不要為了有內容而新增。
4. 最後執行 `node scripts/record_research_run.js --runner <排程 runner> --result <PUBLISHED|NO_NEW_CONTENT|FAILED|QUOTA_EXHAUSTED> --note "一句說明"`（runner 須與 `research/research_schedules.json` 相同），研究排程健康頁靠它判斷漏跑。
