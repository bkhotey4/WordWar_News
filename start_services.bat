@echo off
cd /d "%~dp0"

echo ===================================================
echo [WordWar_News] Starting services in background...
echo ===================================================

:: Start Watchdog Daemon (auto-restarting Discord Bot) in minimized cmd window
start "WordWar_Watchdog" /min cmd /k "node watchdog.js"

echo [OK] Discord Bot 24/7 Supervisor running: WordWarNews#7102
echo [OK] Pure Image & Direct NATO Briefing Edition Active
echo.
echo To stop services, run stop_services.bat
echo ===================================================
ping -n 3 127.0.0.1 >nul
