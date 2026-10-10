const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../public/index.html');
let html = fs.readFileSync(file, 'utf8');

const panel = `      <section class="panel limitations-panel" aria-labelledby="limitations-title" style="grid-column: 1 / -1; margin-top: 1rem;">
        <div class="panel-heading">
          <div><p class="eyebrow">SYSTEM NOTICES</p><h2 id="limitations-title">系統已知限制與誠信須知</h2></div>
          <span class="badge warning">運作限制</span>
        </div>
        <ul class="limitations-list" style="margin: 0.75rem 0 0 1.25rem; line-height: 1.7; font-size: 0.9rem; color: #cbd5e1;">
          <li>自動中文研究排程尚未啟用；Antigravity 接手說明已備妥，但須在實際安裝的應用程式建立並確認排程。</li>
          <li>目前原文自動採集主要是烏克蘭軍方與軍方媒體；來源數量不等於獨立佐證數。外部評估需另外查閱並匯入。</li>
          <li>衛星功能目前查詢產品目錄，尚無已核實的本機事件影像或自動變化判讀。</li>
          <li>預警目前是新聞關鍵字與公開航空訊號的待查通知，不能宣稱能預測戰爭或已確認威脅。</li>
          <li>本機檔案不提供跨程序交易鎖；避免多個程序同時發布同一資料庫。大量任務或多使用者時應遷移至支援交易的資料庫。</li>
          <li>Discord 已接受訊息後、成功紀錄落盤前若程序崩潰，仍可能重送；目前無法保證嚴格只送一次。</li>
          <li>對引用的格式與時效驗證不會自動證明段落語意真的受到來源支持，仍需研究者比對原文。</li>
          <li>舊專題與圖卡產生器尚保留歷史內容，但沒有接回有效報導流程。要恢復功能必須改為讀取有來源的資料。</li>
        </ul>
      </section>`;

if (html.includes('id="limitations-title"')) {
  console.log('Limitations already present in index.html');
} else {
  const insertMarker = '    </div>\r\n  </main>';
  const insertMarkerLF = '    </div>\n  </main>';
  if (html.includes(insertMarker)) {
    html = html.replace(insertMarker, panel + '\r\n    </div>\r\n  </main>');
    fs.writeFileSync(file, html, 'utf8');
    console.log('Added limitations panel to index.html (CRLF)');
  } else if (html.includes(insertMarkerLF)) {
    html = html.replace(insertMarkerLF, panel + '\n    </div>\n  </main>');
    fs.writeFileSync(file, html, 'utf8');
    console.log('Added limitations panel to index.html (LF)');
  } else {
    console.error('Marker not found in index.html');
  }
}
