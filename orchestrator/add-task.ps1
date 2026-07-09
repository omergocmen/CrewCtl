<#
  add-task.ps1 — kuyruga yeni gorev ekler
  Kullanim:
    .\add-task.ps1 "README dosyasindaki TODO'lari topla ve onceliklendir"
    .\add-task.ps1 -Prompt "..."
#>
param(
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
  [string[]]$Words,
  [string]$Prompt
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Prompt) { $Prompt = ($Words -join " ") }
if (-not $Prompt) { Write-Error "Gorev metni gerekli. Ornek: .\add-task.ps1 `"...`""; exit 1 }

$pendingDir = Join-Path $root "queue\pending"
if (-not (Test-Path $pendingDir)) { New-Item -ItemType Directory -Path $pendingDir -Force | Out-Null }

$id = (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + (Get-Random -Maximum 9999)
$task = [ordered]@{
  id        = $id
  prompt    = $Prompt
  status    = "pending"
  createdAt = (Get-Date -Format "s")
}
($task | ConvertTo-Json) | Set-Content (Join-Path $pendingDir "$id.json")
Write-Host "Eklendi: $id" -ForegroundColor Green
Write-Host $Prompt
