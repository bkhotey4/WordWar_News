// 官方網站抓取：先用 Node fetch（瀏覽器標頭），失敗或被擋（403/429/連線錯誤、憑證鏈不完整）時，
// 在 Windows 改用 PowerShell Invoke-WebRequest（Windows 內建 TLS，較不會被網站防火牆擋）。
// 只允許呼叫端指定的網域；網址經環境變數傳入，不拼進指令字串。
const { promisify } = require('util');
const execFile = promisify(require('child_process').execFile);

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
};

function checkUrl(url, hosts) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.username || u.password || !hosts.includes(u.hostname)) throw new Error(`Unexpected URL host ${u.hostname}`);
  return u;
}
function describe(e) { return [e.message, e.cause?.code || e.cause?.message].filter(Boolean).join(' / '); }

const PS_SCRIPT = [
  "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue';",
  "try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]'Tls12,Tls13'}catch{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12};",
  '$uri=[Uri]$env:WW_URL; if($uri.Scheme -ne \'https\' -or $uri.UserInfo -or ($env:WW_HOSTS.Split(\',\') -notcontains $uri.Host)){throw \'Unexpected URL\'};',
  '$r=Invoke-WebRequest -Uri $uri.AbsoluteUri -UseBasicParsing -TimeoutSec 25 -MaximumRedirection 3 -UserAgent $env:WW_UA -Headers @{\'Accept-Language\'=\'zh-TW,zh;q=0.9\'};',
  '$ms=$r.RawContentStream; [Console]::Out.Write([Convert]::ToBase64String($ms.ToArray()))'
].join(' ');

async function powershellText(url, hosts, run = execFile) {
  let lastErr;
  for (const exe of ['pwsh.exe', 'powershell.exe']) {
    try {
      const { stdout } = await run(exe, ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT], {
        timeout: 35000, maxBuffer: 8_000_000, windowsHide: true, encoding: 'utf8',
        env: { ...process.env, WW_URL: url, WW_HOSTS: hosts.join(','), WW_UA: BROWSER_HEADERS['User-Agent'] } });
      const text = Buffer.from(String(stdout).trim(), 'base64').toString('utf8');
      if (!text) throw new Error('empty response');
      return text;
    } catch (e) { lastErr = e; if (e.code !== 'ENOENT') break; }
  }
  throw new Error(`PowerShell 備援也失敗：${String(lastErr?.message || lastErr).split('\n')[0].slice(0, 160)}`);
}

async function fetchText(url, { hosts, fetchImpl = fetch, platform = process.platform, run, maxBytes = 3_000_000 } = {}) {
  checkUrl(url, hosts);
  let firstError;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(20000), headers: BROWSER_HEADERS, redirect: 'follow' });
    if (res.ok) {
      if (res.url) checkUrl(res.url, hosts); // 轉址後仍須在允許網域
      const text = await res.text();
      if (text.length > maxBytes) throw new Error('page too large');
      return text;
    }
    firstError = new Error(`HTTP ${res.status}`);
    firstError.status = res.status;
  } catch (e) { firstError = firstError || e; }
  if (firstError.status && ![403, 429, 503].includes(firstError.status)) throw firstError;
  if (platform !== 'win32') throw new Error(describe(firstError));
  try { return await powershellText(url, hosts, run); }
  catch (e) { throw new Error(`${describe(firstError)}；${e.message}`); }
}

module.exports = { fetchText, BROWSER_HEADERS, PS_SCRIPT };
