@echo off
chcp 65001 >nul
title WordWar News - 系統監控面板
color 0A

:loop
cls
echo ============================================================
echo  WORDWAR NEWS - 系統狀態監控面板  %date% %time%
echo ============================================================
echo.

:: ---- Discord Bot (bot.js) ----
echo [1] Discord Bot (src/bot.js)
for /f "tokens=1" %%p in ('wmic process where "CommandLine like '%%bot.js%%'" get ProcessId 2^>nul ^| findstr /r "[0-9]"') do (
    echo     狀態: 執行中  PID: %%p
    goto :bot_done
)
echo     狀態: 未偵測到 ^(可能尚未啟動^)
:bot_done

echo.

:: ---- Web Server (server.js) ----
echo [2] Web 控制台 (src/server.js  port 3000)
netstat -ano 2>nul | findstr ":3000" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo     狀態: ONLINE  http://localhost:3000/api/status
) else (
    echo     狀態: 離線
)

echo.

:: ---- Watchdog PowerShell ----
echo [3] 守護進程 Watchdog (bot_watchdog.ps1)
tasklist /fi "imagename eq powershell.exe" /fo csv 2>nul | findstr /i "powershell" >nul
if %errorlevel%==0 (
    echo     狀態: 執行中
) else (
    echo     狀態: 未偵測到
)

echo.

:: ---- Log tail: bot_stdout ----
echo [4] Bot 最新日誌 (最後 5 行):
echo     ---------------------------------------------------
if exist "logs\bot_stdout.log" (
    powershell -Command "Get-Content 'logs\bot_stdout.log' -Tail 5 -Encoding UTF8 | ForEach-Object { '    ' + $_ }" 2>nul
) else (
    echo     尚無日誌
)

echo.

:: ---- Watchdog log tail ----
echo [5] Watchdog 最新日誌 (最後 3 行):
echo     ---------------------------------------------------
if exist "logs\watchdog_ps.log" (
    powershell -Command "Get-Content 'logs\watchdog_ps.log' -Tail 3 -Encoding UTF8 | ForEach-Object { '    ' + $_ }" 2>nul
) else (
    echo     尚無日誌
)

echo.
echo ============================================================
echo  自動刷新: 每 30 秒  ^|  按 Ctrl+C 離開
echo ============================================================

timeout /t 30 /nobreak >nul
goto :loop
