@echo off
rem Double-clickable launcher for people who don't want to touch a terminal.
rem Builds the UI (fast, no-op-ish when unchanged), starts the watcher+server
rem in its own window, then opens the orrery in the default browser.
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run - installing dependencies...
  call npm install
)
echo Starting ORRERY - keep the server window open while playing.
start "ORRERY server" cmd /k "npm start"
timeout /t 10 /nobreak >nul
start "" http://127.0.0.1:47821
