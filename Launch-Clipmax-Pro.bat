@echo off
REM Clipmax Pro launcher - starts the local API + built UI, then opens the browser.
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
set "APPDIR=C:\Users\Philomena Osei Bonsu\Documents\faceless"
cd /d "%APPDIR%"

REM Start the API only if nothing is already listening on 8787.
powershell -NoProfile -Command ^
  "$p = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue;" ^
  "if (-not $p) { Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'server/index.js','--serve-build' -WorkingDirectory '%APPDIR%' -WindowStyle Hidden -RedirectStandardOutput '%APPDIR%\launch.log' -RedirectStandardError '%APPDIR%\launch-error.log' }"

REM Wait briefly for the server, then open the app.
powershell -NoProfile -Command "Start-Sleep -Seconds 6"
start "" "http://127.0.0.1:8787"
