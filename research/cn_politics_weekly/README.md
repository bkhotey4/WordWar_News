# 每週中國政局研究稿

由 Claude 排程「中國政局週報」每週產出一份 `YYYY-Www.json`（ISO 週，台北時間）。本機網站 `/china.html`、公開站 `china.html` 與 `/api/cn-politics` 顯示通過 `node scripts/check_cn_politics_brief.js` 的稿；最新一份不合格時頁面會說明原因並改顯示上一份合格的。

## 格式

```json
{
  "week": "2026-W42",
  "writtenAt": "2026-10-13T13:20:00Z",
  "title": "二十屆五中全會前的人事與涉台口徑",
  "summary": "120～800 字：本週重點、與上週的差別、對台海的意義。",
  "sections": {
    "personnel":  { "text": "人事與整肅（40～1200 字）", "sources": ["src-1"] },
    "meetings":   { "text": "會議與路線", "sources": ["src-2"] },
    "taiwanTone": { "text": "涉台論調：官方與黨媒用語有無變化", "sources": ["src-3"] },
    "capability": { "text": "對解放軍能力與意圖的影響：分開寫能力（人事、預算、訓練）與意圖（口徑、措施）", "sources": ["src-1", "src-3"] },
    "nextWatch":  { "text": "下一個觀察點：會議日期、人事公布、敏感日期", "sources": ["src-2"] }
  },
  "sources": [
    { "id": "src-1", "url": "https://…", "publisher": "中國軍網", "title": "原文標題", "publishedAt": "2026-10-12T00:00:00Z", "access": "FULL" }
  ],
  "caveats": ["內政是慢變數，本稿不構成對軍事行動時間的預測。"]
}
```

規則：全文台灣繁體；每節至少一個來源 id；來源須 https；`access` 填 FULL（讀到全文）／PARTIAL（付費牆只讀到開頭）／ABSTRACT（只看到摘要）；不得寫開戰機率或「幾天內」預測；直接引用用「」且 25 字內。
