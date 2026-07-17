@echo off
echo Stopping old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
timeout /t 2 /nobreak >nul

echo Starting backend...
start "ai-writer-backend" cmd /k "cd /d C:\Users\12440\Projects\ai-writer\backend && npm run dev"

timeout /t 3 /nobreak >nul

echo Starting frontend...
start "ai-writer-frontend" cmd /k "cd /d C:\Users\12440\Projects\ai-writer\frontend && npm run dev:h5"

echo Done. Backend http://localhost:3001  Frontend http://localhost:5173
timeout /t 8 /nobreak >nul
