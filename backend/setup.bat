@echo off
cd /d %~dp0
echo [%date% %time%] Starting setup... > setup-log.txt

echo === prisma db push === >> setup-log.txt
call npx prisma db push >> setup-log.txt 2>&1

echo === kill port 3001 === >> setup-log.txt
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
  taskkill /F /PID %%a >> setup-log.txt 2>&1
)

timeout /t 2 /nobreak >nul

echo === start backend === >> setup-log.txt
start "ai-writer-backend" cmd /k "npm run dev"

timeout /t 5 /nobreak >nul

echo === health check === >> setup-log.txt
curl -s http://localhost:3001/api/health >> setup-log.txt 2>&1

echo DONE >> setup-log.txt
