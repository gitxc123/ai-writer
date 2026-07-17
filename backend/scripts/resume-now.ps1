$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3001'
$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType 'application/json' -Body '{"phone":"13800138000","password":"123456"}'
$token = $login.data.token
Write-Host "login ok"

try {
  $resume = Invoke-RestMethod -Uri "$base/api/records/resume" -Method POST -Headers @{ Authorization = "Bearer $token" }
  Write-Host ("resume: " + ($resume | ConvertTo-Json -Compress))
} catch {
  Write-Host ("resume error: " + $_.Exception.Message)
  if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }
}

$recs = Invoke-RestMethod -Uri "$base/api/records" -Headers @{ Authorization = "Bearer $token" }
$recs.data | Select-Object -First 8 | ForEach-Object {
  Write-Host ("{0} | {1} | {2} | err={3}" -f $_.id.Substring(0,10), $_.status, $_.taskType, $_.error)
}
