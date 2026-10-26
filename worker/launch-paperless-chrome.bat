@echo off
REM ---------------------------------------------------------------------
REM  launch-paperless-chrome.bat
REM  Opens the dedicated Chrome window used for Paperless (304).
REM  ASCII-only comments on purpose (cmd.exe and the OEM codepage).
REM  - Separate window, profile and debugging port (9224) from SHAAM/BTL.
REM  - Sign in yourself: email + the code sent to your phone.
REM    The worker never types any of them.
REM  - Normally not needed: the next Paperless job opens it on the login page.
REM ---------------------------------------------------------------------

set "PIVO_PROFILE=%LOCALAPPDATA%PIVOpaperless-chrome-profile"
if not exist "%PIVO_PROFILE%" mkdir "%PIVO_PROFILE%"

start "" "C:Program FilesGoogleChromeApplicationchrome.exe" --remote-debugging-port=9224 --user-data-dir="%PIVO_PROFILE%" --no-first-run --no-default-browser-check https://home.paperless.tax/login
