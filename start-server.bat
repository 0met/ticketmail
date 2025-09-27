@echo off
echo TicketMail Server Startup Script
echo ==============================
echo.

:RETRY
echo [%time%] Starting Netlify dev server...
echo.

cd /d "c:\Users\temoj\OneDrive\Desktop\TicketMail\ticketmail"
netlify dev --debug

echo.
echo [%time%] Server stopped or crashed.
echo.
set /p restart="Do you want to restart the server? (y/n): "
if /i "%restart%"=="y" goto RETRY
if /i "%restart%"=="yes" goto RETRY

echo Goodbye!
pause