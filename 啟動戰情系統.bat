@echo off
chcp 65001 >nul
title 全球戰情監控與Discord機器人
cd /d "."

echo =========================================================
echo   WordWar_News 全球戰情監控系統正在啟動中...
echo =========================================================
echo.
echo [1/2] 正在背景啟動 Web 戰情指揮中心 (http://localhost:3000)...
start "WordWar_Web" /min cmd /c "node src/server.js"

echo [2/2] 正在背景啟動 Discord 機器人 (WordWarNews#7102)...
start "WordWar_Bot" /min cmd /c "node src/bot.js"

echo.
echo =========================================================
echo [OK] 服務已在 Windows 獨立 CMD 中啟動！
echo      - Web 戰情指揮中心: http://localhost:3000
echo      - Discord 機器人: WordWarNews#7102 已上線
echo.
echo 如需停止服務，請執行 stop_services.bat
echo =========================================================
timeout /t 5
