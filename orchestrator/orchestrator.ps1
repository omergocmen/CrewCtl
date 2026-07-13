<# Geriye uyumluluk sarmalayicisi. Ana motor artik src/cli.js uzerinden calisir. #>
param(
  [ValidateSet("ask", "auto", "")]
  [string]$Mode = "",
  [switch]$Once
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cliArgs = @((Join-Path $root "src/cli.js"), "run")
if ($Once) { $cliArgs += "--once" }
if ($Mode) { $cliArgs += @("--approval", $Mode) }
& node @cliArgs
exit $LASTEXITCODE
