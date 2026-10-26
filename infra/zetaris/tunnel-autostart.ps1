# tunnel-autostart.ps1 - bring the Zetaris quick tunnel back after a reboot.
#
# Docker Desktop starts itself; cloudflared does not. This waits for the Zetaris REST port to
# answer, then hands off to tunnel.ps1 -Start, which detaches cloudflared and proves the public
# URL with SELECT 1. Running it while a tunnel is already up is harmless: tunnel.ps1 reuses it.
#
# install-autostart.ps1 registers this as the scheduled task "haqi-zetaris-tunnel" (at logon).
# Log: %LOCALAPPDATA%\haqi-demo\autostart.log
#
# It cannot update Render. A new hostname still has to be relayed to whoever owns the
# dashboard - see the drill in infra/RUNBOOK.md.

param(
    [int]$Port = 8888,
    [int]$WaitSeconds = 300
)

$ErrorActionPreference = 'Continue'

$runDir = Join-Path $env:LOCALAPPDATA 'haqi-demo'
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$log = Join-Path $runDir 'autostart.log'
$tunnel = Join-Path $PSScriptRoot 'tunnel.ps1'

function Say([string]$m) {
    $line = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $m
    Add-Content -Path $log -Value $line -Encoding utf8
}

Say '---- autostart begin ----'

if (-not (Test-Path $tunnel)) {
    Say "FAIL tunnel.ps1 not found at $tunnel"
    exit 1
}

# Docker Desktop needs a while after logon. Poll instead of sleeping a fixed amount.
$deadline = [datetime]::UtcNow.AddSeconds($WaitSeconds)
$up = $false
while ([datetime]::UtcNow -lt $deadline) {
    try {
        Invoke-WebRequest "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 3 | Out-Null
        $up = $true
        break
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 404) { $up = $true; break }
    }
    Start-Sleep -Seconds 5
}

if (-not $up) {
    Say "FAIL zetaris did not answer on 127.0.0.1:$Port within ${WaitSeconds}s - is Docker running?"
    exit 1
}
Say "PASS zetaris answering on 127.0.0.1:$Port"

$output = & $tunnel -Start 2>&1 | Out-String
$code = $LASTEXITCODE
foreach ($line in ($output -split "`r?`n")) {
    if ($line.Trim()) { Say ('  ' + $line.Trim()) }
}
Say "tunnel.ps1 -Start exit=$code"

$urlFile = Join-Path $runDir 'tunnel.url'
if (Test-Path $urlFile) {
    Say ('URL ' + (Get-Content $urlFile -Raw).Trim() + ' - relay it to Render if it is not the same hostname as before')
}

Say '---- autostart end ----'
exit $code
