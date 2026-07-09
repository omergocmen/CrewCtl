<#
  orchestrator.ps1 — cok-agent gorev orkestratoru (Windows / PowerShell)

  Kullanim:
    .\orchestrator.ps1                 # config'teki approvalMode ile surekli calisir
    .\orchestrator.ps1 -Mode auto      # riskli isleri sormadan yapar
    .\orchestrator.ps1 -Mode ask       # riskli isleri onaya takar
    .\orchestrator.ps1 -Once           # kuyrukta bekleyen tek gorevi isler, cikar

  Kuyruk: queue/pending -> queue/done | queue/failed | queue/approval
  Gorev eklemek: .\add-task.ps1 "yapilacak is"
  Onaylamak:     .\approve.ps1 -List  /  .\approve.ps1 -Approve <id>  /  -Reject <id>
#>
param(
  [ValidateSet("ask","auto","")]
  [string]$Mode = "",
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# ---- Config ----
$config = Get-Content (Join-Path $root "config.json") -Raw | ConvertFrom-Json
if ($Mode -ne "") { $config.approvalMode = $Mode }

$workingDir = Resolve-Path (Join-Path $root $config.workingDir)

$Q        = Join-Path $root "queue"
$dirs     = @("pending","done","failed","approval") | ForEach-Object { Join-Path $Q $_ }
$memDir   = Join-Path $root "memory"
$stateDir = Join-Path $root "state"
foreach ($d in ($dirs + $memDir + $stateDir)) {
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

function Log($msg, $color = "Gray") {
  $ts = Get-Date -Format "HH:mm:ss"
  Write-Host "[$ts] $msg" -ForegroundColor $color
}

# ---- Gunluk cagri butcesi ----
function Get-CallCount {
  $f = Join-Path $stateDir ("calls-" + (Get-Date -Format "yyyyMMdd") + ".txt")
  if (Test-Path $f) { [int](Get-Content $f -Raw) } else { 0 }
}
function Add-CallCount {
  $f = Join-Path $stateDir ("calls-" + (Get-Date -Format "yyyyMMdd") + ".txt")
  $n = (Get-CallCount) + 1
  Set-Content $f $n
  return $n
}

# ---- Ortak hafiza ----
function Get-Memory {
  $files = Get-ChildItem (Join-Path $memDir "*.md") -ErrorAction SilentlyContinue | Sort-Object LastWriteTime
  if (-not $files) { return "(hafiza bos)" }
  $text = ($files | ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n`n"
  $budget = [int]$config.memoryCharBudget
  if ($text.Length -gt $budget) { $text = $text.Substring($text.Length - $budget) }
  return $text
}
function Append-Memory($title, $body) {
  $f = Join-Path $memDir "log.md"
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
  Add-Content $f "`n## $stamp — $title`n$body`n"
}

# ---- Bir agent'i cagir (prompt stdin ile, ya da args icinde {PROMPT}) ----
function Invoke-Agent($agentName, $prompt) {
  $a = $config.agents.$agentName
  if (-not $a) { throw "Agent tanimsiz: $agentName (config.json > agents)" }

  $n = Add-CallCount
  if ($n -gt [int]$config.dailyCallBudget) {
    throw "Gunluk cagri butcesi asildi ($($config.dailyCallBudget)). Durduruluyor."
  }

  $cmdArgs = @()
  $useToken = $false
  foreach ($x in $a.args) {
    if ("$x" -match "\{PROMPT\}") { $cmdArgs += ("$x" -replace "\{PROMPT\}", $prompt); $useToken = $true }
    else { $cmdArgs += $x }
  }

  Push-Location $workingDir
  try {
    if ($useToken) {
      $out = & $a.cmd @cmdArgs | Out-String
    } else {
      $out = $prompt | & $a.cmd @cmdArgs | Out-String
    }
  } finally {
    Pop-Location
  }
  return $out.Trim()
}

# ---- Risk taramasi ----
function Test-Risky($text) {
  foreach ($p in $config.riskyPatterns) {
    if ($text -match [regex]::Escape($p)) { return $true }
  }
  return $false
}

# ---- Bir asamanin promptunu kur ----
function Build-Prompt($roleFile, $task, $memory, $stageOutputs) {
  $role = Get-Content (Join-Path $root $roleFile) -Raw
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine($role)
  [void]$sb.AppendLine("`n---`n## Ortak Hafiza (gecmis islerden)`n$memory")
  [void]$sb.AppendLine("`n---`n## Gorev`n$($task.prompt)")
  if ($stageOutputs.Count -gt 0) {
    [void]$sb.AppendLine("`n---`n## Onceki Asamalarin Ciktilari")
    foreach ($k in $stageOutputs.Keys) {
      [void]$sb.AppendLine("### $k`n$($stageOutputs[$k])`n")
    }
  }
  return $sb.ToString()
}

# ---- Tek gorevi isle ----
function Process-Task($file) {
  $task = Get-Content $file.FullName -Raw | ConvertFrom-Json
  Log "GOREV baslIyor: $($task.id) — $($task.prompt)" "Cyan"

  $memory = Get-Memory
  $stageOutputs = [ordered]@{}
  $iter = 0
  $i = 0

  while ($i -lt $config.pipeline.Count) {
    $step = $config.pipeline[$i]
    Log "  -> asama '$($step.stage)' [$($step.agent)]" "Yellow"

    $prompt = Build-Prompt $step.roleFile $task $memory $stageOutputs
    $out = Invoke-Agent $step.agent $prompt
    $stageOutputs[$step.stage] = $out
    Log "     tamam ($($out.Length) karakter)"

    # --- Onay kapisi ---
    if ($step.gate -and (Test-Risky $out) -and $config.approvalMode -eq "ask" -and -not $task.approved) {
      Log "  !! RISKLI plan tespit edildi, ONAYA aliniyor" "Red"
      $task | Add-Member -NotePropertyName planPreview -NotePropertyValue $out -Force
      $task | Add-Member -NotePropertyName status -NotePropertyValue "awaiting-approval" -Force
      $dest = Join-Path $Q "approval\$($task.id).json"
      ($task | ConvertTo-Json -Depth 8) | Set-Content $dest
      Remove-Item $file.FullName
      Log "  Onay icin: .\approve.ps1 -List  sonra  .\approve.ps1 -Approve $($task.id)" "Magenta"
      return
    }

    # --- Denetci FAIL -> geri don ---
    if ($step.loopBackTo) {
      $verdict = ""
      foreach ($line in ($out -split "`n")) {
        if ($line -match "VERDICT:\s*(PASS|FAIL)") { $verdict = $Matches[1] }
      }
      if ($verdict -eq "FAIL" -and $iter -lt ([int]$config.maxIterationsPerTask - 1)) {
        $iter++
        Log "  Denetci FAIL dedi -> '$($step.loopBackTo)' asamasina donuluyor (tur $($iter+1)/$($config.maxIterationsPerTask))" "Red"
        for ($j = 0; $j -lt $config.pipeline.Count; $j++) {
          if ($config.pipeline[$j].stage -eq $step.loopBackTo) { $i = $j; break }
        }
        continue
      }
      if ($verdict -eq "FAIL") {
        Log "  Denetci hala FAIL, tur limiti doldu -> FAILED" "Red"
        Complete-Task $file $task $stageOutputs "failed"
        return
      }
    }
    $i++
  }

  Complete-Task $file $task $stageOutputs "done"
}

function Complete-Task($file, $task, $stageOutputs, $result) {
  $task | Add-Member -NotePropertyName status -NotePropertyValue $result -Force
  $task | Add-Member -NotePropertyName finishedAt -NotePropertyValue (Get-Date -Format "s") -Force
  $task | Add-Member -NotePropertyName output -NotePropertyValue $stageOutputs -Force
  $dest = Join-Path $Q "$result\$($task.id).json"
  ($task | ConvertTo-Json -Depth 8) | Set-Content $dest
  if (Test-Path $file.FullName) { Remove-Item $file.FullName }

  $summary = ($stageOutputs.Keys | ForEach-Object { "**$_**: " + ($stageOutputs[$_] -replace "`n"," ").Substring(0,[Math]::Min(200,$stageOutputs[$_].Length)) }) -join "`n"
  Append-Memory "$($task.id) [$result] $($task.prompt)" $summary
  Log "GOREV bitti: $($task.id) [$result]" ($(if($result -eq "done"){"Green"}else{"Red"}))
}

# ---- Ana dongu ----
Log "Orkestrator basladi. Mod=$($config.approvalMode)  workingDir=$workingDir" "Green"
Log "Kuyruk: $Q   (gorev ekle: .\add-task.ps1 \"...\")" "Green"

do {
  $pending = Get-ChildItem (Join-Path $Q "pending\*.json") -ErrorAction SilentlyContinue | Sort-Object Name
  if ($pending) {
    try { Process-Task $pending[0] }
    catch { Log "HATA: $($_.Exception.Message)" "Red"; Start-Sleep 3 }
  } else {
    if ($Once) { Log "Kuyruk bos, cikiliyor (-Once)." ; break }
    Start-Sleep ([int]$config.pollSeconds)
  }
} while (-not $Once)
