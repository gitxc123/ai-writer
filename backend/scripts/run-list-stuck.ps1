Set-Location C:\Users\12440\Projects\ai-writer\backend
node scripts/list-stuck.js | Out-File -FilePath scripts\stuck-out.txt -Encoding utf8
Get-Content scripts\stuck-out.txt
