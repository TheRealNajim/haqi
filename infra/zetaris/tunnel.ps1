# tunnel.ps1 - give the deployed API a way to reach Zetaris on this PC.
#
# Render cannot see 127.0.0.1:8888. A Cloudflare quick tunnel puts an https URL in front of
# it; the deployed backend then uses that URL as ZETARIS_REST_URL. Zetaris still requires the
# `ak` bearer key, so the URL alone does not open the data (verified: no key -> 400).
#
# A quick tunnel is anonymous and its hostname changes every time cloudflared restarts. If it
# restarts, re-run -Start, then update ZETARIS_REST_URL in Render and redeploy. Nothing on
# this PC can update Render without an API key.
#
# Start detaches through a VBS ShellExecute. Start-Process and Win32_Process.Create children
# keep a console handle, so piping this script's output waits forever for cloudflared; WMI
# also kills it outright (the log ends in ^C). The VBS route survives both.
#
# Usage:
#   powershell -NoProfile -File infra\zetaris\tunnel.ps1            # status + the Render rows
#   powershell -NoProfile -File infra\zetaris\tunnel.ps1 -Start     # start (downloads cloudflared once)
#   powershell -NoProfile -File infra\zetaris\tunnel.ps1 -Stop

param(
    [switch]$Start,
    [switch]$Stop,
    [int]$Port = 8888
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $root '.env'
$runDir = Join-Path $env:LOCALAPPDATA 'haqi-demo'
$exe = Join-Path $runDir 'cloudflared.exe'
$logOut = Join-Path $runDir 'tunnel.out'
$logErr = Join-Path $runDir 'tunnel.log'
$urlFile = Join-Path $runDir 'tunnel.url'
$pidFile = Join-Path $runDir 'tunnel.pid'

function Ok   ([string]$m) { Write-Host ("  PASS  " + $m) }
function Bad  ([string]$m) { Write-Host ("  FAIL  " + $m) }
function Info ([string]$m) { Write-Host ("  INFO  " + $m) }
function Warn ([string]$m) { Write-Host ("  WARN  " + $m) }

function Get-TunnelUrl {
    foreach ($path in @($logErr, $logOut)) {
        if (-not (Test-Path $path)) { continue }
        $m = Select-String -Path $path -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches |
                ForEach-Object { $_.Matches } | Select-Object -First 1
        if ($m) { return $m.Value }
    }
    return $null
}

function Get-TunnelPid {
    if (Test-Path $pidFile) {
        $p = (Get-Content $pidFile -Raw).Trim()
        if ($p -and (Get-Process -Id ([int]$p) -ErrorAction SilentlyContinue)) { return [int]$p }
    }
    $proc = Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) { return $proc.Id }
    return $null
}

function Read-DotEnv([string]$path) {
    $map = @{}
    foreach ($line in (Get-Content $path -ErrorAction SilentlyContinue)) {
        if ($line -match '^\s*#' -or -not $line) { continue }
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $map[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
        }
    }
    return $map
}

function Show-RenderRows([string]$url) {
    Write-Host ""
    Write-Host "Paste these into Render -> haqi-api -> Environment, then redeploy:"
    Write-Host ""
    Write-Host ("  ZETARIS_REST_URL = " + $url + "/api/v1.0")
    Write-Host  "  ZETARIS_ORG_ID   = 1"
    Write-Host  "  ZETARIS_API_KEY  = <the ak token already in .env>"
    Write-Host ""
}

function Test-Public([string]$url) {
    $cfg = Read-DotEnv $envFile
    $key = $cfg['ZETARIS_API_KEY']
    if (-not $key) { Warn "no ZETARIS_API_KEY in .env - cannot prove the tunnel end to end"; return }
    $body = @{ queryId = [guid]::NewGuid().ToString(); sql = 'SELECT 1'; source = 'SqlEditor'; limit = 1 } |
            ConvertTo-Json -Compress
    $headers = @{
        Authorization  = "Bearer $key"
        'X-Org-ID'     = '1'
        'X-Request-ID' = [guid]::NewGuid().ToString()
    }
    # A fresh quick-tunnel hostname takes a few seconds to resolve and route.
    for ($i = 1; $i -le 24; $i++) {
        try {
            $r = Invoke-RestMethod ($url + "/api/v1.0/sql-editor/sqls/run") -Method Post `
                    -ContentType 'application/json' -Headers $headers -Body $body -TimeoutSec 15
            if ("$($r.data[0][0])" -eq '1') { Ok "public URL answers SELECT 1 through Zetaris" }
            else { Bad "public URL answered '$($r.data[0][0])' instead of 1" }
            return
        } catch {
            $code = $_.Exception.Response.StatusCode.value__
            if ($code -eq 400 -or $code -eq 401 -or $code -eq 403) {
                Bad ("public URL rejected the request (" + $code + ") - check ZETARIS_API_KEY and X-Org-ID")
                return
            }
            if ($i -eq 8) {
                Bad ("public URL not reachable after 24 tries" + $(if ($code) { " (" + $code + ")" } else { "" }))
                return
            }
            Start-Sleep -Seconds 5
        }
    }
}

# --- stop ----------------------------------------------------------------------------------
if ($Stop) {
    Write-Host "haqi zetaris tunnel - stop"
    Write-Host "=========================="
    Write-Host ""
    $stopped = 0
    $tunnelPid = Get-TunnelPid
    if ($tunnelPid) {
        taskkill /T /F /PID $tunnelPid 2>&1 | Out-Null
        $stopped++
    }
    foreach ($p in @(Get-Process cloudflared -ErrorAction SilentlyContinue)) {
        taskkill /T /F /PID $p.Id 2>&1 | Out-Null
        $stopped++
    }
    if ($stopped -gt 0) { Ok ("stopped tunnel (" + $stopped + " process(es))") } else { Info "no tunnel was running" }
    Remove-Item $urlFile, $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host "The URL is dead. If it was in Render, update or remove it or the Zetaris slot fails."
    exit 0
}

$tunnelPid = Get-TunnelPid
$url = Get-TunnelUrl

# --- status --------------------------------------------------------------------------------
if (-not $Start) {
    Write-Host "haqi zetaris tunnel - status"
    Write-Host "============================"
    Write-Host ""
    if (-not $tunnelPid) {
        Warn "cloudflared is not running - start with -Start"
        if ($url) { Info ("last URL (dead): " + $url) }
        Write-Host ""
        exit 1
    }
    Ok ("cloudflared running (pid " + $tunnelPid + ")")
    if (-not $url) { Warn "no URL in the log yet - give it a few seconds"; exit 1 }
    Ok ("public URL: " + $url)
    Test-Public $url
    Show-RenderRows $url
    exit 0
}

# --- start ---------------------------------------------------------------------------------
Write-Host "haqi zetaris tunnel"
Write-Host "==================="
Write-Host ""

if ($tunnelPid) {
    Info "already running - reusing it"
    if (-not $url) { Warn "no URL found in " + $logErr; exit 1 }
    Ok ("public URL: " + $url)
    Test-Public $url
    Show-RenderRows $url
    exit 0
}

# Zetaris must be answering locally before it is worth exposing.
try {
    Invoke-WebRequest "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5 | Out-Null
    Ok "zetaris: answering on 127.0.0.1:$Port"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 404) { Ok "zetaris: answering on 127.0.0.1:$Port (404 at root is normal)" }
    else { Bad "nothing on 127.0.0.1:$Port - is the Zetaris stack up?"; exit 1 }
}

New-Item -ItemType Directory -Force -Path $runDir | Out-Null
if (-not (Test-Path $exe)) {
    Info "downloading cloudflared (once, ~53 MB)"
    $ProgressPreference = 'SilentlyContinue'
    try {
        Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' `
            -OutFile $exe -TimeoutSec 300
    } catch {
        Bad "download failed - get cloudflared.exe manually into $runDir"
        exit 1
    }
}
Ok ("cloudflared: " + (& $exe --version 2>&1))

Remove-Item $logOut, $logErr -Force -ErrorAction SilentlyContinue

# Launcher + VBS detach. Start-Process (and WMI) children keep a handle on this console, so
# anything piping the script's output waits for cloudflared to exit - which is never. WScript's
# ShellExecute starts it outside the console tree, and wscript itself returns immediately.
$cmdFile = Join-Path $runDir 'tunnel.cmd'
$vbsFile = Join-Path $runDir 'launch.vbs'
@(
    '@echo off',
    ('cd /d "' + $runDir + '"'),
    ('cloudflared.exe tunnel --url http://127.0.0.1:' + $Port + ' --no-autoupdate 1>"' + $logOut + '" 2>"' + $logErr + '"')
) | Set-Content -Path $cmdFile -Encoding ascii

$vbs = @'
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c ""__CMD__""", 0, False
'@ -replace '__CMD__', $cmdFile
Set-Content -Path $vbsFile -Value $vbs -Encoding ascii

& wscript.exe '//B' $vbsFile

for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 2
    $url = Get-TunnelUrl
    if ($url) { break }
}
if (-not $url) {
    Bad ("no URL after 90 s - log: " + $logErr)
    exit 1
}

$tunnelPid = Get-TunnelPid
if ($tunnelPid) { Set-Content -Path $pidFile -Value $tunnelPid -Encoding ascii }

Set-Content -Path $urlFile -Value $url -Encoding ascii
Ok ("public URL: " + $url)
Test-Public $url
Show-RenderRows $url
Write-Host "Stop with -Stop. The hostname changes on every restart; re-run -Start and update Render."
exit 0


