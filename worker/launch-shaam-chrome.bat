@echo off
REM ---------------------------------------------------------------------
REM  launch-shaam-chrome.bat
REM  Opens the dedicated Chrome window used by the PIVO automation worker.
REM
REM  NOTE: comments here are intentionally ASCII-only. cmd.exe reads .bat
REM  files using the active OEM codepage, and UTF-8 Hebrew inside REM lines
REM  is parsed as garbage commands. Hebrew documentation lives in README.md.
REM
REM  - Uses a SEPARATE profile under %LOCALAPPDATA%\PIVO, never your normal
REM    Chrome profile, tabs, extensions or logins.
REM  - The profile lives OUTSIDE the repo on purpose: it holds a live logged-in
REM    session, and it must never be watched by the dev server, seen by git,
REM    or copied around with the source tree.
REM  - Chrome 136+ ignores --remote-debugging-port on the default profile,
REM    so a non-default --user-data-dir is REQUIRED, not a preference.
REM    See: https://developer.chrome.com/blog/remote-debugging-port
REM  - Sign in to SHAAM yourself in this window (certificate + PIN).
REM    The worker never handles certificate/PIN/OTP.
REM  - Leave this window OPEN. The worker attaches and detaches from it and
REM    never closes or relaunches it.
REM ---------------------------------------------------------------------

set "PIVO_PROFILE=%LOCALAPPDATA%\PIVO\shaam-chrome-profile"
if not exist "%PIVO_PROFILE%" mkdir "%PIVO_PROFILE%"

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%PIVO_PROFILE%" --no-first-run --no-default-browser-check https://shaam.taxes.gov.il/
