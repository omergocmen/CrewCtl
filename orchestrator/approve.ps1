<#
  approve.ps1 — onaya takilan gorevleri yonet
  Kullanim:
    .\approve.ps1 -List
    .\approve.ps1 -Approve <id>     # onayla, tekrar kuyruga koy (gate atlanir)
    .\approve.ps1 -Reject  <id>     # reddet, failed'a tasi
#>
param(
  [switch]$List,
  [string]$Approve,
  [string]$Reject
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $root "queue\approval"
$pendDir = Join-Path $root "queue\pending"
$failDir = Join-Path $root "queue\failed"

if ($List -or (-not $Approve -and -not $Reject)) {
  $items = Get-ChildItem (Join-Path $appDir "*.json") -ErrorAction SilentlyContinue
  if (-not $items) { Write-Host "Onay bekleyen gorev yok." -ForegroundColor Green; return }
  foreach ($f in $items) {
    $t = Get-Content $f.FullName -Raw | ConvertFrom-Json
    Write-Host "`n=== $($t.id) ===" -ForegroundColor Cyan
    Write-Host "Gorev : $($t.prompt)"
    Write-Host "Plan  :" -ForegroundColor Yellow
    Write-Host $t.planPreview
  }
  Write-Host "`nOnayla: .\approve.ps1 -Approve <id>   Reddet: .\approve.ps1 -Reject <id>" -ForegroundColor Magenta
  return
}

if ($Approve) {
  $f = Join-Path $appDir "$Approve.json"
  if (-not (Test-Path $f)) { Write-Error "Bulunamadi: $Approve"; exit 1 }
  $t = Get-Content $f -Raw | ConvertFrom-Json
  $t | Add-Member -NotePropertyName approved -NotePropertyValue $true -Force
  $t | Add-Member -NotePropertyName status -NotePropertyValue "pending" -Force
  ($t | ConvertTo-Json -Depth 8) | Set-Content (Join-Path $pendDir "$Approve.json")
  Remove-Item $f
  Write-Host "Onaylandi, kuyruga geri kondu: $Approve" -ForegroundColor Green
}

if ($Reject) {
  $f = Join-Path $appDir "$Reject.json"
  if (-not (Test-Path $f)) { Write-Error "Bulunamadi: $Reject"; exit 1 }
  Move-Item $f (Join-Path $failDir "$Reject.json") -Force
  Write-Host "Reddedildi: $Reject" -ForegroundColor Red
}
