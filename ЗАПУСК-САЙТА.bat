@echo off
title ToxicHR dev server
cd /d "C:\Users\mks\Projects\toxichr"
echo Freeing port 3000 if busy...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
echo Starting ToxicHR dev server...
echo Open http://localhost:3000 when you see "Ready"
echo.
call npm run dev
echo.
echo === server stopped, you can close this window ===
pause
