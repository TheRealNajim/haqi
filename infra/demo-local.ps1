# demo-local.ps1 - run the whole product on this PC, no tunnel.
#
# Why this exists: the deployed API (haqi-api.onrender.com) cannot reach Zetaris on
# 127.0.0.1:8888, so the sponsor SQL slot is an honest blind there. Running the API on
# this PC removes the network gap entirely: the frontend dev server proxies /api to
# 127.0.0.1:8000, the backend talks to Zetaris on loopback, and nothing is exposed.
#
# Read-only with -Status. Starts processes with no flags. Stops them with -Stop.
#
# Usage:
#   powershell -NoProfile -File infra\demo-local.ps1            # preflight, then start
#   powershell -NoProfile -File infra\demo-local.ps1 -Force     # start despite missing product keys
#   powershell -NoProfile -File infra\demo-local.ps1 -Status
#   powershell -NoProfile -File infra\demo-local.ps1 -Stop

param(
    [switch]$Stop,
    [switch]$Status,
    [switch]$Force,
    [int]$ApiPort = 8000,
    [int]$WebPort = 5173
)

# The API answers in UTF-8 (em dashes, degree signs). Windows PowerShell decodes console
# output as the OEM codepage by default, which turns the verdict reason into mojibake.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$envFile = Join-Path $root '.env'
$venv = Join-Path $root '.venv\Scripts\python.exe'
$runDir = Join-Path $env:LOCALAPPDATA 'haqi-demo'
$pidFile = Join-Path $runDir 'pids.json'
$apiLog = Join-Path $runDir 'api.log'
$webLog = Join-Path $runDir 'web.log'
$apiOut = Join-Path $runDir 'api.out'
$webOut = Join-Path $runDir 'web.out'

function Ok   ([string]$m) { Write-Host ("  PASS  " + $m) }
function Bad  ([string]$m) { Write-Host ("  FAIL  " + $m); $script:fail++ }
function Info ([string]$m) { Write-Host ("  INFO  " + $m) }
function Warn ([string]$m) { Write-Host ("  WARN  " + $m) }
$fail = 0

function Read-DotEnv([string]$path) {
    $map = @{}
    if (-not (Test-Path $path)) { return $map }
    foreach ($line in Get-Content $path) {
        if ($line -match '^\s*#') { continue }
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $v = $matches[2].Trim()
            if ($v.Length -ge 2 -and (($v[0] -eq '"' -and $v[-1] -eq '"') -or ($v[0] -eq "'" -and $v[-1] -eq "'"))) {
                $v = $v.Substring(1, $v.Length - 2)
            }
            $map[$matches[1]] = $v
        }
    }
    return $map
}

function Get-PortOwner([int]$port) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
    if (-not $c) { return $null }
    return $c.OwningProcess
}

function Wait-Url([string]$url, [int]$seconds) {
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
        } catch { }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

# Windows PowerShell 5.1 decodes a JSON body with no charset in Content-Type as
# ISO-8859-1, which turns the em dashes in the verdict reason into "â€”". Decode the
# bytes as UTF-8 ourselves so what we print matches what the API said.
function Get-JsonUtf8([string]$url, [int]$seconds) {
    $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec $seconds
    $text = [System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
    return ($text | ConvertFrom-Json)
}

# --- stop ----------------------------------------------------------------------------------
if ($Stop) {
    Write-Host "haqi local demo - stop"
    Write-Host "======================"
    Write-Host ""
    $killed = 0
    if (Test-Path $pidFile) {
        $saved = Get-Content $pidFile -Raw | ConvertFrom-Json
        foreach ($p in @($saved.pids)) {
            if ($p -and (Get-Process -Id $p -ErrorAction SilentlyContinue)) {
                taskkill /T /F /PID $p 2>&1 | Out-Null
                $killed++
            }
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
    foreach ($port in @($ApiPort, $WebPort)) {
        $owner = Get-PortOwner $port
        if ($owner) {
            taskkill /T /F /PID $owner 2>&1 | Out-Null
            $killed++
            Start-Sleep -Milliseconds 400
        }
    }
    if ($killed -gt 0) { Ok ("stopped " + $killed + " process(es)") } else { Info "nothing was running" }
    Write-Host ""
    Write-Host ("Zetaris and Meterless are untouched by this script.")
    exit 0
}

# --- status --------------------------------------------------------------------------------
if ($Status) {
    Write-Host "haqi local demo - status"
    Write-Host "========================"
    Write-Host ""
    foreach ($item in @(@{ Name = 'api'; Port = $ApiPort; Url = "http://127.0.0.1:$ApiPort/health" },
                        @{ Name = 'web'; Port = $WebPort; Url = "http://127.0.0.1:$WebPort/" })) {
        $owner = Get-PortOwner $item.Port
        if (-not $owner) { Warn ($item.Name + ": nothing listening on " + $item.Port); continue }
        try {
            $r = Invoke-WebRequest $item.Url -UseBasicParsing -TimeoutSec 10
            Ok ($item.Name + ": " + $item.Url + " -> " + $r.StatusCode + " (pid " + $owner + ")")
        } catch {
            Bad ($item.Name + ": port " + $item.Port + " held by pid " + $owner + " but " + $item.Url + " failed")
        }
    }
    Write-Host ""
    exit $(if ($fail) { 1 } else { 0 })
}

# --- preflight -----------------------------------------------------------------------------
Write-Host "haqi local demo"
Write-Host "==============="
Write-Host ""

if (-not (Test-Path $envFile)) { Write-Host "  FAIL  .env not found at $envFile"; exit 1 }
$cfg = Read-DotEnv $envFile

foreach ($item in @(@{ Port = $ApiPort; Name = 'api' }, @{ Port = $WebPort; Name = 'web' })) {
    $owner = Get-PortOwner $item.Port
    if ($owner) {
        Bad ($item.Name + " port " + $item.Port + " already in use by pid " + $owner + " - run with -Stop first")
    } else {
        Ok ($item.Name + ": port " + $item.Port + " free")
    }
}

if (-not (Test-Path $venv)) { Bad ".venv\Scripts\python.exe missing - create the venv and install backend\requirements.txt" }
else { Ok "python: .venv present" }

if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Bad "frontend\node_modules missing - run: cd frontend; npm ci"
} else { Ok "frontend: node_modules present" }

# Zetaris must be reachable from the backend, and the key must authenticate; the recipe
# repair is idempotent and cheap, so demo start always runs it.
$rest = $cfg['ZETARIS_REST_URL']
if (-not $rest) { Bad "ZETARIS_REST_URL empty in .env" }
elseif ($rest -notmatch '127\.0\.0\.1|localhost') {
    Bad ("ZETARIS_REST_URL points at " + $rest + " - a local demo needs the loopback URL")
} else { Ok ("zetaris: " + $rest) }

if ($cfg['ZETARIS_API_KEY'] -and $cfg['ZETARIS_API_KEY'].Length -eq 60 -and $rest -match '127\.0\.0\.1|localhost') {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'zetaris\restore-key.ps1') 2>&1 |
        ForEach-Object { Write-Host ("  " + $_) }
    if ($LASTEXITCODE -ne 0) { Bad "zetaris key could not be restored - see infra/RUNBOOK.md" }
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'zetaris\ensure-recipe.ps1') 2>&1 |
        ForEach-Object { Write-Host ("  " + $_) }
    if ($LASTEXITCODE -ne 0) { Bad "zetaris recipe could not be rebuilt - see infra/zetaris/README.md" }
} else {
    Bad "ZETARIS_API_KEY missing or not a 60-char ak token"
}

try {
    $hz = Invoke-RestMethod 'http://127.0.0.1:8088/healthz' -TimeoutSec 5
    if ($hz.status -eq 'ok') { Ok "meterless: /healthz ok" } else { Bad "meterless: unexpected /healthz body" }
} catch { Bad "meterless: not answering on 127.0.0.1:8088 - launch Nightshift" }

if (-not $cfg['MODEL_BASE_URL'] -or -not $cfg['MODEL_API_KEY'] -or -not $cfg['NEMOTRON_MODEL']) {
    Bad "MODEL_BASE_URL / MODEL_API_KEY / NEMOTRON_MODEL not all set"
} else {
    Ok ("model route: " + ([uri]$cfg['MODEL_BASE_URL']).Host + " / " + $cfg['NEMOTRON_MODEL'])
}

# Product sources decide what /today can actually say. Without them the verdict drops to
# "be careful, 0/4 sources", which is a worse demo than the deployed API. This is a hard
# stop unless -Force, because a demo that quietly shows a blind verdict is the failure.
$want = @('OPENAQ_API_KEY', 'WAQI_TOKEN', 'OPENWEATHER_API_KEY', 'NASA_FIRMS_MAP_KEY', 'BRIGHTDATA_API_KEY')
$missing = @($want | Where-Object { -not $cfg[$_] })
if ($missing.Count -eq 0) {
    Ok "product sources: all five keys present"
} else {
    foreach ($m in $missing) { Warn ("product source missing: " + $m) }
    if (-not $Force) {
        Write-Host ""
        Write-Host "  Local /today would report a blind verdict (0/4 sources), which is worse than"
        Write-Host "  the deployed API. Copy the values from Render -> haqi-api -> Environment into"
        Write-Host "  .env, or re-run with -Force to start anyway."
        exit 1
    }
    Info "-Force given: starting with a degraded verdict"
}

if ($fail -gt 0) {
    Write-Host ""
    Write-Host ("{0} check(s) failed. Not starting." -f $fail)
    exit 1
}

# --- start ---------------------------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

# Children are created through WMI, not Start-Process. Start-Process children inherit this
# console's stdout handle, so anything that pipes this script's output (a CI log, `| tee`,
# `| Select-Object`) waits forever for the long-lived server to exit. WMI creates the
# process outside our console tree, and the launcher scripts redirect into $runDir.
function Start-Detached([string]$launcher) {
    $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine      = 'cmd.exe /c "' + $launcher + '"'
        CurrentDirectory = $runDir
    }
    if ($r.ReturnValue -ne 0) { throw ("could not start " + $launcher + " (Win32_Process.Create returned " + $r.ReturnValue + ")") }
    return [int]$r.ProcessId
}

$apiCmd = Join-Path $runDir 'api.cmd'
$webCmd = Join-Path $runDir 'web.cmd'

@(
    '@echo off',
    ('cd /d "' + $backend + '"'),
    ('"' + $venv + '" -m uvicorn app.main:app --host 127.0.0.1 --port ' + $ApiPort + ' 1>"' + $apiOut + '" 2>"' + $apiLog + '"')
) | Set-Content -Path $apiCmd -Encoding ascii

@(
    '@echo off',
    ('cd /d "' + $frontend + '"'),
    ('set VITE_API_PROXY_TARGET=http://127.0.0.1:' + $ApiPort),
    ('npm run dev -- --host 127.0.0.1 --port ' + $WebPort + ' --strictPort 1>"' + $webOut + '" 2>"' + $webLog + '"')
) | Set-Content -Path $webCmd -Encoding ascii

$apiPid = Start-Detached $apiCmd
$webPid = Start-Detached $webCmd

@{ pids = @($apiPid, $webPid); started = (Get-Date).ToString('s') } |
    ConvertTo-Json -Compress | Set-Content -Path $pidFile -Encoding ascii

$apiOk = Wait-Url ("http://127.0.0.1:" + $ApiPort + "/health") 45
$webOk = Wait-Url ("http://127.0.0.1:" + $WebPort + "/") 60

Write-Host ""
if ($apiOk) { Ok ("api: http://127.0.0.1:" + $ApiPort) } else { Bad ("api did not answer - log: " + $apiLog) }
if ($webOk) { Ok ("web: http://127.0.0.1:" + $WebPort) } else { Bad ("web did not answer - log: " + $webLog) }

if ($apiOk) {
    try {
        $src = Get-JsonUtf8 ("http://127.0.0.1:" + $ApiPort + "/sources/status") 20
        $on = @($src.sources | Where-Object { $_.configured }).Count
        $all = @($src.sources).Count
        Ok ("sources: " + $on + "/" + $all + " configured")
        foreach ($s in $src.sources) {
            if (-not $s.configured) { Warn ("blind slot: " + $s.adapter + " (" + $s.role + ")") }
        }
    } catch { Warn "sources: /sources/status failed" }
    try {
        $today = Get-JsonUtf8 ("http://127.0.0.1:" + $ApiPort + "/today") 120
        Ok ("today: " + $today.level + " - " + $today.reason)
    } catch { Warn ("today: failed (" + $_.Exception.Response.StatusCode.value__ + ")") }
}

Write-Host ""
if ($apiOk -and $webOk -and $fail -eq 0) {
    Write-Host ("Open http://127.0.0.1:" + $WebPort + " for the demo. Stop with -Stop.")
    exit 0
}
Write-Host "One or more checks failed. Logs: $runDir"
exit 1
