const fs = require('fs');
const path = require('path');

const psPath = path.join(__dirname, '../bot_watchdog.ps1');
let code = fs.readFileSync(psPath, 'utf8');

// 1. Safe watchdog PID check (ensures target is actually powershell/pwsh)
const oldWdGuard = `        if ($wpidStr -match '^\\d+$') {
            $wpid = [int]$wpidStr
            if ($wpid -ne $PID -and (Get-Process -Id $wpid -ErrorAction SilentlyContinue)) {
                Write-Log "Another watchdog instance is already running (PID: $wpid). Exiting."
                exit 0
            }
        }`;

const newWdGuard = `        if ($wpidStr -match '^\\d+$') {
            $wpid = [int]$wpidStr
            if ($wpid -ne $PID) {
                $existingProc = Get-Process -Id $wpid -ErrorAction SilentlyContinue
                if ($existingProc -and ($existingProc.ProcessName -like "*powershell*" -or $existingProc.ProcessName -like "*pwsh*")) {
                    Write-Log "Another watchdog instance is already running (PID: $wpid). Exiting."
                    exit 0
                }
            }
        }`;

// 2. Safe node check before killing PID in Clear-BotLock
const oldClearBot = `                $oldProc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
                if ($oldProc) {
                    Write-Log "Terminating old bot process PID: $oldPid..."
                    Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 2
                }`;

const newClearBot = `                $oldProc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
                if ($oldProc -and $oldProc.ProcessName -eq "node") {
                    Write-Log "Terminating old bot process PID: $oldPid..."
                    Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 2
                }`;

// 3. Supervise Web Server (src/server.js) on port 3000
const oldNodeFind = `# Find node binary
$NodeExe = "node"
if (Test-Path "C:\\Program Files\\nodejs\\node.exe") {
    $NodeExe = "C:\\Program Files\\nodejs\\node.exe"
}`;

const newNodeFind = `# Find node binary
$NodeExe = "node"
if (Test-Path "C:\\Program Files\\nodejs\\node.exe") {
    $NodeExe = "C:\\Program Files\\nodejs\\node.exe"
}

# Ensure Web Server (src/server.js) is running on port 3000
try {
    $portActive = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if (-not $portActive) {
        Write-Log "Web Server (port 3000) not active. Starting src/server.js..."
        Start-Process -FilePath $NodeExe -ArgumentList "src/server.js" -WorkingDirectory $WorkDir -NoNewWindow
        Start-Sleep -Seconds 2
    } else {
        Write-Log "Web Server (port 3000) is active."
    }
} catch {
    Write-Log "Note: Unable to check port 3000, continuing."
}`;

// Normalize CRLF
const isCrlf = code.includes('\r\n');
function replaceBlock(source, search, replace) {
  const normSource = source.replace(/\r\n/g, '\n');
  const normSearch = search.replace(/\r\n/g, '\n');
  if (normSource.includes(normSearch)) {
    const finalSearch = isCrlf ? search.replace(/\n/g, '\r\n') : search;
    const finalReplace = isCrlf ? replace.replace(/\n/g, '\r\n') : replace;
    return source.replace(finalSearch, finalReplace);
  }
  console.warn('[WARN] Could not find search block');
  return source;
}

code = replaceBlock(code, oldWdGuard, newWdGuard);
code = replaceBlock(code, oldClearBot, newClearBot);
code = replaceBlock(code, oldNodeFind, newNodeFind);

fs.writeFileSync(psPath, code, 'utf8');
console.log('[SUCCESS] bot_watchdog.ps1 hardened for reboot resilience!');
