# install-autostart.ps1 - make the tunnel come back by itself after a logon.
#
# Registers the scheduled task "haqi-zetaris-tunnel" to run tunnel-autostart.ps1 at logon, and
# sets the AC lid-close action to "do nothing" so a closed laptop does not silently kill the URL
# Render is pointed at. Both are per-user changes: no admin prompt.
#
#   powershell -NoProfile -File infra\zetaris\install-autostart.ps1            # install + report
#   powershell -NoProfile -File infra\zetaris\install-autostart.ps1 -Status    # is it armed?
#   powershell -NoProfile -File infra\zetaris\install-autostart.ps1 -Remove    # undo both
#
# What this does NOT do: update Render. The quick-tunnel hostname changes on restart, so a human
# still relays it. See infra/RUNBOOK.md, "Exposing Zetaris to Render".

param(
    [switch]$Status,
    [switch]$Remove
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$taskName = 'haqi-zetaris-tunnel'
$runner = Join-Path $PSScriptRoot 'tunnel-autostart.ps1'
$runDir = Join-Path $env:LOCALAPPDATA 'haqi-demo'
$log = Join-Path $runDir 'autostart.log'
$lidGui = '{5ca83367-6e45-459f-a27b-476f675d6e14}'   # LIDACTION inside SUB_BUTTONS

function Ok   ([string]$m) { Write-Host ("  PASS  " + $m) }
function Bad  ([string]$m) { Write-Host ("  FAIL  " + $m) }
function Info ([string]$m) { Write-Host ("  INFO  " + $m) }
function Warn ([string]$m) { Write-Host ("  WARN  " + $m) }

function Get-Task { Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue }

function Get-LidAction {
    $out = powercfg /query SCHEME_CURRENT SUB_BUTTONS $lidGui 2>&1
    $m = ($out | Select-String -Pattern 'Current AC Power Setting Index:\s*0x([0-9a-fA-F]+)').Matches
    if ($m.Count -gt 0) { return [Convert]::ToInt32($m[0].Groups[1].Value, 16) }
    return $null
}

function Set-LidAction([int]$value) {
    powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS $lidGui $value 2>&1 | Out-Null
    powercfg /setactive SCHEME_CURRENT 2>&1 | Out-Null
}

# --- remove --------------------------------------------------------------------------------
if ($Remove) {
    Write-Host "haqi zetaris autostart - remove"
    Write-Host "==============================="
    Write-Host ""
    $task = Get-Task
    if ($task) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        if (Get-Task) { Bad "task is still registered" } else { Ok "scheduled task removed" }
    } else { Info "scheduled task was not registered" }
    Set-LidAction 1
    Ok "AC lid-close restored to sleep"
    Write-Host ""
    exit 0
}

# --- status --------------------------------------------------------------------------------
if ($Status) {
    Write-Host "haqi zetaris autostart - status"
    Write-Host "==============================="
    Write-Host ""
    $task = Get-Task
    if ($task) {
        $info = Get-ScheduledTaskInfo -TaskName $taskName
        Ok ("task registered, state " + $task.State)
        Info ("last run: " + $info.LastRunTime + "  result: 0x" + ('{0:X}' -f $info.LastTaskResult))
        Info ("next run: " + $info.NextRunTime)
    } else { Bad "task NOT registered - run without -Status to install" }

    $lid = Get-LidAction
    if ($lid -eq 0) { Ok "AC lid close: do nothing" }
    elseif ($null -eq $lid) { Warn "AC lid close: cannot read (firmware may hide it)" }
    else { Warn ("AC lid close: action " + $lid + " (may sleep)") }

    if (Test-Path $log) {
        Write-Host ""
        Write-Host ("last autostart log lines (" + $log + "):")
        Get-Content $log | Select-Object -Last 8 | ForEach-Object { '  ' + $_ }
    } else { Info "no autostart log yet - it appears after the first logon run" }
    Write-Host ""
    exit 0
}

# --- install -------------------------------------------------------------------------------
Write-Host "haqi zetaris autostart - install"
Write-Host "================================"
Write-Host ""

if (-not (Test-Path $runner)) { Bad "missing $runner"; exit 1 }
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$arg = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runner + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $me
$trigger.Delay = 'PT1M'
$principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Description 'Restart the haqi Zetaris quick tunnel after logon' `
        -Force -ErrorAction Stop | Out-Null
    Ok ("task registered for " + $me + " at logon (+1 min)")
} catch {
    Bad ("could not register the task: " + $_.Exception.Message)
    exit 1
}

$before = Get-LidAction
Set-LidAction 0
$after = Get-LidAction
if ($after -eq 0) { Ok "AC lid close: do nothing (closing the lid no longer kills the tunnel)" }
elseif ($null -eq $before -and $null -eq $after) { Warn "AC lid close: firmware exposes no setting - leave the lid open" }
else { Bad ("AC lid close still reads " + $after + " - set it by hand in Power Options") }

Write-Host ""
Write-Host "After a reboot: Docker starts itself, the task starts the tunnel ~1 min after logon,"
Write-Host "and the hostname will be NEW. Relay it from the autostart log or tunnel.ps1, then"
Write-Host "update ZETARIS_REST_URL in Render."
Write-Host ""
Write-Host ("Verify with: powershell -NoProfile -File infra\zetaris\install-autostart.ps1 -Status")
exit 0
