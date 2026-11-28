@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================================
echo  WordWar_News Watchdog Supervisor (Background Detached)
echo ========================================================
powershell -NoProfile -Command "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine = '\"C:\Program Files\nodejs\node.exe\" watchdog.js'; CurrentDirectory = '%~dp0'}" >nul
echo [OK] Watchdog 守護行程已於 Windows 後台背景獨立啟動！
timeout /t 2 >nul
