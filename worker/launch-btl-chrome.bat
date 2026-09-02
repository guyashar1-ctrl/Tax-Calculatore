@echo off
REM ---------------------------------------------------------------------
REM  launch-btl-chrome.bat
REM  Opens the dedicated Chrome window used for Bituach Leumi (BTL),
REM  "Maarechet Yizug Lakochot" at meyazegs.btl.gov.il.
REM
REM  NOTE: comments here are intentionally ASCII-only. cmd.exe reads .bat
REM  files using the active OEM codepage, and UTF-8 Hebrew inside REM lines
REM  is parsed as garbage commands. Hebrew documentation lives in README.md.
REM
REM  - SEPARATE window, profile and debugging port from the SHAAM one
REM    (9223 vs 9222). The two authorities are fully independent: connecting
REM    or disconnecting one never touches the other.
REM  - Uses a SEPARATE profile under %LOCALAPPDATA%\PIVO, never your normal
REM    Chrome profile, tabs, extensions or logins.
REM  - The profile lives OUTSIDE the repo on purpose: it holds a live
REM    logged-in session, and it must never be watched by the dev server,
REM    seen by git, or copied around with the source tree.
REM  - Chrome 136+ ignores --remote-debugging-port on the default profile,
REM    so a non-default --user-data-dir is REQUIRED, not a preference.
REM    See: https://developer.chrome.com/blog/remote-debugging-port
REM  - Sign in to BTL yourself in this window: ID number, user code,
REM    password, and the one-time code sent to your phone.
REM    The worker never types any of them.
REM  - Normally you do NOT need this file: the worker opens the window when
REM    you click "Bituach Leumi" in the PIVO header. This is a recovery tool.
REM ---------------------------------------------------------------------

set "PIVO_PROFILE=%LOCALAPPDATA%\PIVO\btl-chrome-profile"
if not exist "%PIVO_PROFILE%" mkdir "%PIVO_PROFILE%"

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9223 --user-data-dir="%PIVO_PROFILE%" --no-first-run --no-default-browser-check https://meyazegs.btl.gov.il/
