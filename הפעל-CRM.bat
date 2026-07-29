@echo off
chcp 65001 >nul 2>&1
title CRM - גיא אשר

REM עובר לתיקייה שבה הקובץ הזה יושב — כך הקיצור עובד גם אחרי העברת הפרויקט
cd /d "%~dp0"

REM אם השרת כבר רץ על הפורט 5173 - רק פותחים את הדפדפן ויוצאים
netstat -ano | findstr ":5173" | findstr "LISTENING" >nul
if %errorlevel%==0 (
    echo.
    echo  [V] The app is already running. Opening browser...
    echo.
    start "" "http://localhost:5173"
    timeout /t 2 /nobreak >nul
    exit /b 0
)

cls
echo.
echo  ============================================================
echo            CRM ^& Tax Calculator - Guy Ashar
echo  ============================================================
echo.
echo   Starting the application...
echo.
echo   The browser will open automatically in a few seconds.
echo.
echo   IMPORTANT:
echo   - Keep this window open while using the app.
echo   - To stop the app: simply close this window.
echo.
echo  ============================================================
echo.

REM פותח דפדפן ברקע אחרי השהיה של 6 שניות (זמן שהשרת יעלה)
start "browser-launcher" /min cmd /c "ping -n 7 127.0.0.1 >nul & start """" ""http://localhost:5173"" & exit"

REM מריץ את השרת בחלון הזה (npm.cmd נמצא ב-PATH)
call npm run dev

echo.
echo  ============================================================
echo   The server has stopped. You can close this window.
echo  ============================================================
echo.
pause
