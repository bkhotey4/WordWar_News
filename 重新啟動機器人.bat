@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   WordWar_News 重新啟動（載入新程式）
echo ==================================================
echo.
echo [1/3] 執行測試 npm test ...
call npm test >logs\restart_test.log 2>&1
if errorlevel 1 (
  echo.
  echo [注意] 有測試沒通過，詳細內容在 logs\restart_test.log
  choice /c YN /m "仍要重新啟動嗎"
  if errorlevel 2 exit /b 1
) else (
  echo [OK] 測試全部通過
)
echo.
echo [2/3] 停止機器人與網站（守護程式會自動用新程式重啟）...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and ($_.CommandLine -match 'src[/\\]bot\.js' -or $_.CommandLine -match 'src[/\\]server\.js') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo.
echo [3/3] 等待自動重啟（約 40 秒）...
timeout /t 40 /nobreak >nul
powershell -NoProfile -Command "if (-not (Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'src[/\\]bot\.js' })) { exit 1 }"
if errorlevel 1 (
  echo 守護程式沒有自動重啟，改為手動啟動守護程式...
  call "%~dp0Start_WordWar_Bot_Watchdog.bat"
  timeout /t 30 /nobreak >nul
)
echo.
echo 最近的啟動紀錄：
powershell -NoProfile -Command "Get-Content -Encoding UTF8 logs\watchdog_ps.log -Tail 6"
echo.
echo 完成！到 Discord 輸入 /battle-map 試試看（新指令可能要等 1 分鐘才出現）。
pause
