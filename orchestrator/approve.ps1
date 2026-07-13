<# Geriye uyumluluk sarmalayicisi. Yeni kullanim: cli-team approvals|approve|reject #>
param(
  [switch]$List,
  [string]$Approve,
  [string]$Reject
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cli = Join-Path $root "src/cli.js"
if ($Approve) { & node $cli approve $Approve }
elseif ($Reject) { & node $cli reject $Reject }
else { & node $cli approvals }
exit $LASTEXITCODE
