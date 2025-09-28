@echo off
echo TicketMail Manual Database Setup
echo ================================
echo.

echo This script will create the user management tables in your Neon database.
echo Make sure your DATABASE_URL environment variable is set.
echo.

set /p confirm="Continue with database setup? (y/n): "
if /i not "%confirm%"=="y" if /i not "%confirm%"=="yes" goto END

echo.
echo Running database setup...
echo.

node manual-database-setup.js

echo.
echo Setup completed. Check the output above for results.
echo.

:END
pause