Set-Location C:\Users\12440\Projects\ai-writer\backend
node scripts/test-news-research.js | Out-File -FilePath scripts\research-out.txt -Encoding utf8
Get-Content scripts\research-out.txt
