# 中國政治與經濟：長期分析（每季）

由 Claude 排程「中國政經季度分析」每季產出一份 `YYYY-Qn.json`（台北時間的季度）。本機 `/china.html`、公開站 `china.html` 最上方顯示最新一份通過 `node scripts/check_cn_politics_brief.js research/cn_political_economy/<檔名>` 的分析；最新一份不合格時退回上一份並說明原因。

與每週稿的分工：每週稿寫「這週發生了什麼」；長期分析寫「結構性狀況與它對台海的意義」，每節分開寫**已知事實**（附來源、有日期的數字與公告）與**研判**（作者推論，須說明依據與不確定性）。

## 格式

```json
{
  "quarter": "2026-Q4",
  "writtenAt": "2026-10-15T13:00:00Z",
  "title": "整肅、放緩與制裁防護：2026 年第四季中國政經",
  "summary": "200～1200 字：本季的整體判斷，以及與上一季相比的變化。",
  "sections": {
    "power":             { "facts": "60～1500 字", "assessment": "40～1000 字", "sources": ["s1"] },
    "economy":           { "facts": "…", "assessment": "…", "sources": ["s2"] },
    "coercion":          { "facts": "對台經濟施壓工具與歷次使用（ECFA、禁令、懲戒名單、出口管制）", "assessment": "…", "sources": ["s3"] },
    "sanctionsProofing": { "facts": "戰略儲備、外匯存底與美債持有、人民幣跨境支付（CIPS）", "assessment": "…", "sources": ["s4"] },
    "taiwanImplications":{ "facts": "兩岸貿易依存度等", "assessment": "對台海的意義：分開寫能力與意圖", "sources": ["s1", "s3"] }
  },
  "indicators": [
    { "label": "GDP 年增率", "value": "4.8%", "asOf": "2026-Q3", "source": "s2" }
  ],
  "sources": [
    { "id": "s1", "url": "https://…", "publisher": "…", "title": "原文標題", "publishedAt": "2026-10-01T00:00:00Z", "access": "FULL" }
  ],
  "caveats": ["經濟狀況與對外軍事行動的關係在學界證據不一致，本分析不構成行動時間的預測。"]
}
```

規則：全文台灣繁體；來源 6～40 筆、須 https；每節至少一個來源 id；`indicators` 最多 12 筆，每筆的數字都要能在引用來源找到；不得寫開戰機率或「幾天內」預測；直接引用用「」且 25 字內。
