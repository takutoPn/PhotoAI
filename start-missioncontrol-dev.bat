@echo off
setlocal

cd /d C:\Users\gecko\.openclaw\workspace\my-mission-control
if errorlevel 1 (
  echo [ERROR] project directory not found.
  exit /b 1
)

echo [INFO] Stopping existing dev servers on ports 3000-3003...
for %%P in (3000 3001 3002 3003) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    taskkill /PID %%A /F >nul 2>&1
  )
)

echo [INFO] Starting Mission Control on port 3000...
set PORT=3000
npm run dev
