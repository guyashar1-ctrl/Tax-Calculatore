@echo off
REM ---------------------------------------------------------------------
REM  install-autostart.bat — one-time setup on the accountant's Windows PC.
REM
REM  Creates a shortcut to start-worker.vbs in the current user's Startup
REM  folder, so the PIVO automation worker runs from the next login onward
REM  with no console window and no manual step.
REM
REM  Chosen over a Windows Service or Task Scheduler entry because it needs
REM  NO administrator rights, and the worker must run inside the user's own
REM  desktop session anyway - it opens a visible Chrome window that the
REM  accountant interacts with. A service in session 0 could not do that.
REM
REM  To undo: delete the shortcut from the folder that opens with
REM    shell:startup   (Win+R, type shell:startup)
REM ---------------------------------------------------------------------

setlocal
set "WORKERDIR=%~dp0"
set "VBS=%WORKERDIR%start-worker.vbs"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\PIVO Automation Worker.lnk"

if not exist "%VBS%" (
  echo [x] start-worker.vbs not found next to this file.
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [x] Node.js is not on PATH. Install Node 18+ first, then run this again.
  exit /b 1
)

if not exist "%WORKERDIR%.env" (
  echo [!] worker\.env is missing. Copy .env.example to .env and fill it in,
  echo     otherwise the worker will exit immediately on startup.
)

powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%LNK%');" ^
  "$s.TargetPath='wscript.exe';" ^
  "$s.Arguments='\"%VBS%\"';" ^
  "$s.WorkingDirectory='%WORKERDIR%';" ^
  "$s.Description='PIVO automation worker';" ^
  "$s.Save()"

if errorlevel 1 (
  echo [x] Failed to create the startup shortcut.
  exit /b 1
)

echo [v] Installed. The worker will start automatically at every login.
echo     Starting it now as well...
start "" wscript.exe "%VBS%"
echo [v] Done. Check worker\worker.log if the SHAAM light stays grey.
endlocal
