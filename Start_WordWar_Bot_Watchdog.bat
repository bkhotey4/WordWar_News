@echo off
chcp 65001 > nul
cd /d "%USERPROFILE%\Desktop\WordWar_News"
start "" /min powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "%USERPROFILE%\Desktop\WordWar_News\bot_watchdog.ps1"
