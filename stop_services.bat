@echo off
cd /d "%~dp0"

echo ===================================================
echo [WordWar_News] Stopping background services...
echo ===================================================

:: Terminate watchdog and node bot services via PowerShell (compatible with Windows 10 & 11)
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*watchdog.js*' -or $_.CommandLine -like '*src/bot.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo [OK] All WordWar_News services stopped!
echo ===================================================
ping -n 3 127.0.0.1 >nul
