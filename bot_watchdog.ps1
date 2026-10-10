# ============================================================
#  WordWarNews Discord Bot - Watchdog Script
#  Features: Start on logon + Auto restart on crash + Hidden
#  Invoked by Windows Startup batch file.
# ============================================================

$WorkDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($WorkDir)) {
    $WorkDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if ([string]::IsNullOrEmpty($WorkDir) -or -not (Test-Path "$WorkDir\src\bot.js")) {
    $WorkDir = "."
}

$LogsDir = "$WorkDir\logs"
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

$LogFile = "$LogsDir\watchdog_ps.log"
$BotStdout = "$LogsDir\bot_stdout.log"
$BotStderr = "$LogsDir\bot_stderr.log"
$ServerStdout = "$LogsDir\server_stdout.log"
$ServerStderr = "$LogsDir\server_stderr.log"
$BotScript = "src/bot.js"
$MaxRestarts = 99
$RestartDelaySec = 5
$StartupDelaySec = 5

# Set encoding to UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Log {
    param([string]$Msg)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $Msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

Write-Log "=== WordWarNews Discord Bot Watchdog Started ==="

# Single-instance guard for Watchdog (verifies actual powershell process and commandline)
$WdLockFile = "$WorkDir\watchdog.lock"
if (Test-Path $WdLockFile) {
    try {
        $wpidStr = (Get-Content $WdLockFile -ErrorAction SilentlyContinue).Trim()
        if ($wpidStr -match '^\d+$') {
            $wpid = [int]$wpidStr
            if ($wpid -ne $PID) {
                $existingProc = Get-Process -Id $wpid -ErrorAction SilentlyContinue
                if ($existingProc -and ($existingProc.ProcessName -like "*powershell*" -or $existingProc.ProcessName -like "*pwsh*")) {
                    $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $wpid" -ErrorAction SilentlyContinue
                    if ($cim -and ($cim.CommandLine -like "*WordWar_News*" -or $cim.CommandLine -like "*bot_watchdog*")) {
                        Write-Log "Another WordWar watchdog instance is already running (PID: $wpid). Exiting."
                        exit 0
                    } else {
                        Write-Log "PID $wpid in watchdog.lock is stale or belongs to another process. Overwriting."
                    }
                }
            }
        }
    } catch {}
}
Set-Content -Path $WdLockFile -Value $PID -Encoding UTF8

Write-Log "Waiting $StartupDelaySec seconds for system and network to stabilize..."
Start-Sleep -Seconds $StartupDelaySec

# Verify network before attempting Discord connection
$retries = 0
while ($retries -lt 12) {
    try {
        Test-Connection -ComputerName "discord.com" -Count 1 -ErrorAction Stop | Out-Null
        Write-Log "Network connection verified. Ready to start bot."
        break
    } catch {
        $retries++
        Write-Log "Waiting for network connectivity... ($retries/12)"
        Start-Sleep -Seconds 5
    }
}

if ($retries -ge 12) {
    Write-Log "ERROR: Network connection timed out after 60s. Will attempt bot start anyway."
}

# Find node binary
$NodeExe = "node"
if (Test-Path "C:\Program Files\nodejs\node.exe") {
    $NodeExe = "C:\Program Files\nodejs\node.exe"
}

# Keep the web server alive independently of Discord's gateway connection.
function Ensure-WebServer {
    try {
        $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($listener) {
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
            if ($owner -and $owner.CommandLine -notmatch 'src[/\\]server\.js') {
                Write-Log "WARNING: Port 3000 belongs to another process; project server was not started."
            }
            return
        }
    } catch {
        # No listener exists. Start only this project's server below.
    }
    try {
        Write-Log "Web Server (port 3000) not active. Starting src/server.js..."
        Start-Process -FilePath $NodeExe -ArgumentList 'src/server.js' -WorkingDirectory $WorkDir -WindowStyle Hidden -RedirectStandardOutput $ServerStdout -RedirectStandardError $ServerStderr | Out-Null
        Start-Sleep -Seconds 2
    } catch {
        Write-Log "WARNING: Project web server could not start: $($_.Exception.Message)"
    }
}
Ensure-WebServer

$restartCount = 0
$LockFile = "$WorkDir\bot.lock"

function Clear-BotLock {
    if (Test-Path $LockFile) {
        try {
            $pidStr = (Get-Content $LockFile -ErrorAction SilentlyContinue).Trim()
            if ($pidStr -match '^\d+$') {
                $oldPid = [int]$pidStr
                $oldProc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
                if ($oldProc -and $oldProc.ProcessName -eq "node") {
                    $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $oldPid" -ErrorAction SilentlyContinue
                    if ($cim -and ($cim.CommandLine -like "*bot.js*" -or $cim.CommandLine -like "*WordWar*")) {
                        Write-Log "Terminating old bot process PID: $oldPid..."
                        Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
                        Start-Sleep -Seconds 2
                    }
                }
            }
        } catch {}
        Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
        Write-Log "bot.lock cleared."
    }
}

while ($restartCount -le $MaxRestarts) {
    Clear-BotLock

    # Keep the last 3 bot logs instead of overwriting them on every restart (bot_stdout.1.log = previous run)
    foreach ($log in @($BotStdout, $BotStderr)) {
        if (Test-Path $log) {
            for ($i = 2; $i -ge 1; $i--) {
                $src = $log -replace '\.log$', ".$i.log"
                $dst = $log -replace '\.log$', ".$($i + 1).log"
                if (Test-Path $src) { Move-Item -Path $src -Destination $dst -Force -ErrorAction SilentlyContinue }
            }
            Move-Item -Path $log -Destination ($log -replace '\.log$', '.1.log') -Force -ErrorAction SilentlyContinue
        }
    }

    Write-Log "Starting WordWarNews bot (Attempt $($restartCount + 1))..."

    $proc = Start-Process `
        -FilePath $NodeExe `
        -ArgumentList $BotScript `
        -WorkingDirectory $WorkDir `
        -PassThru `
        -NoNewWindow `
        -RedirectStandardOutput $BotStdout `
        -RedirectStandardError $BotStderr

    Write-Log "Bot started successfully with PID: $($proc.Id)"
    Set-Content -Path $LockFile -Value $proc.Id -Encoding UTF8

    Start-Sleep -Seconds 5

    $startTime = Get-Date
    while (-not $proc.HasExited) {
        Start-Sleep -Seconds 30
        Ensure-WebServer
    }
    $proc.WaitForExit()
    $exitCode = $proc.ExitCode
    $duration = (Get-Date) - $startTime

    # If bot ran stably for over 60 seconds, reset restart counter to enable perpetual uptime
    if ($duration.TotalSeconds -gt 60) {
        $restartCount = 0
    }

    Write-Log "WARNING: Bot stopped with ExitCode: $exitCode (Ran for $([math]::Round($duration.TotalSeconds, 1))s)"

    if ($exitCode -eq 0) {
        Write-Log "INFO: Bot stopped normally (ExitCode 0). Restarting in $RestartDelaySec seconds to ensure 24/7 uptime..."
        Start-Sleep -Seconds $RestartDelaySec
        continue
    }

    $restartCount++
    if ($restartCount -gt $MaxRestarts) {
        Write-Log "ERROR: Reached max restart limit ($MaxRestarts). Watchdog stopping."
        break
    }

    Write-Log "Rebooting bot in $RestartDelaySec seconds... (Restart count: $restartCount)"
    Start-Sleep -Seconds $RestartDelaySec
}

Remove-Item $WdLockFile -Force -ErrorAction SilentlyContinue
Write-Log "=== Watchdog Finished ==="
