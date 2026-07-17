Set-Location C:\Users\12440\Projects\ai-writer\backend
node scripts/test-hot.js | Out-File -FilePath scripts\hot-out.txt -Encoding utf8
Get-Content scripts\hot-out.txt
