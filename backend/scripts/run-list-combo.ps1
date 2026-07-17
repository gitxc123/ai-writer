Set-Location C:\Users\12440\Projects\ai-writer\backend
node scripts/list-combo.js | Out-File -FilePath scripts\combo-out.txt -Encoding utf8
Get-Content scripts\combo-out.txt
