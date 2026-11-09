@echo off
cd /d "%~dp0"
curl.exe -fsS --max-time 2 http://127.0.0.1:4173/health 2>nul | findstr /C:"micro-gp" >nul
if not errorlevel 1 (
  start "" http://127.0.0.1:4173/
  exit /b 0
)
if not exist "node_modules\.bin\vite.cmd" (
  call npm ci
  if errorlevel 1 goto failed
)
if not exist "dist\index.html" (
  call npm run build
  if errorlevel 1 goto failed
)
node server/index.ts --open
if not errorlevel 1 exit /b 0
:failed
pause
exit /b 1
