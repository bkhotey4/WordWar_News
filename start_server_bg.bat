@echo off
cd /d "%~dp0"
echo [WORDWAR SERVER] Starting Web HUD Server in background cmd...
start "WordWar_News_Server" /min cmd.exe /c "node src/server.js"
echo [WORDWAR SERVER] Server started on http://localhost:3000
