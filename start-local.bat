@echo off
cls
echo 🚀 Starting TicketMail Local Server...
echo ====================================
echo.
echo 📂 Database: local-database.sqlite
echo 🔌 Server: http://localhost:3000
echo.
echo 📝 Logs will appear below. Keep this window open!
echo.

cd /d "%~dp0"

:: Check for node_modules
if not exist "node_modules" (
    echo 📦 Installing dependencies (first run only)...
    call npm install
    echo ✅ Dependencies installed.
    echo.
)

:: Start the server
node local-server.js

:: If node crashes, pause so user can see error
echo.
echo ❌ Server stopped unexpectedly.
pause
