<# Geriye uyumluluk sarmalayicisi. Yeni kullanim: cli-team task "..." #>
param(
  [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
  [string[]]$Words,
  [string]$Prompt
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Prompt) { $Prompt = ($Words -join " ") }
if (-not $Prompt) { Write-Error "Gorev metni gerekli."; exit 1 }
& node (Join-Path $root "src/cli.js") task $Prompt
exit $LASTEXITCODE
