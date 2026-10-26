# tunnel.ps1 - give the deployed API a way to reach a service on this PC.
#
# Render cannot see 127.0.0.1. A Cloudflare quick tunnel puts an https URL in front of a local
# port; the deployed backend then uses that URL instead of localhost. The service keeps its own
# auth, so the URL alone does not open anything (Zetaris: no key -> 400).
#
# Default target is Zetaris REST on 8888, which is the slot the deployed API consumes. The same
# script fronts a second port when asked, with its own state files so neither tunnel can stop
# the other:
#
#   powershell -NoProfile -File infra\zetaris\tunnel.ps1            # status + the Render rows
#   powershell -NoProfile -File infra\zetaris\tunnel.ps1 -Start     # start (downloads cloudflared once)
#   powershell -NoProfile -File infra\zetaris\tunnel.ps1 -Stop
#
#   # Meterless Nightshift narration lane (optional, port 8088):
#   powershell -NoProfile -File infra\zetaris\tunnel.ps1 -Start -Port 8088 -StatePrefix meterless
#
# A quick tunnel is anonymous and its hostname changes every time cloudflared restarts. If it
# restarts, re-run -Start, then update the matching env var in Render and redeploy. Nothing on
# this PC can update Render without an API key.
#
# Start detaches through a VBS ShellExecute. Start-Process and Win32_Process.Create children
# keep a console handle, so piping this script's output waits forever for cloudflared; WMI
# also kills it outright (the log ends in ^C). The VBS route survives both.

param(
    [switch]$Start,
    [switch]$Stop,
    [int]$Port = 8888,
    [string]$StatePrefix = 'tunnel'
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $root '.env'
$runDir = Join-Path $env:LOCALAPPDATA 'haqi-demo'
$exe = Join-Path $runDir 'cloudflared.exe'
$logOut = Join-Path $runDir ($StatePrefix + '.out')
$logErr = Join-Path $runDir ($StatePrefix + '.log')
$urlFile = Join-Path $runDir ($StatePrefix + '.url')
$pidFile = Join-Path $runDir ($StatePrefix + '.pid')

# 8888 is the Zetaris REST port; everything else is a generic local service.
$isZetaris = ($Port -eq 8888)
$label = if ($isZetaris) { 'zetaris' } else { 'port ' + $Port }

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
    # No state file (or a stale one): match the process to THIS port, never to any cloudflared.
    $proc = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and $_.CommandLine -match ('127\.0\.0\.1:' + $Port + '(\s|$)') } |
            Select-Object -First 1
    if ($proc) { return [int]$proc.ProcessId }
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
    if ($isZetaris) {
        Write-Host ("  ZETARIS_REST_URL = " + $url + "/api/v1.0")
        Write-Host  "  ZETARIS_ORG_ID   = 1"
        Write-Host  "  ZETARIS_API_KEY  = <the ak token already in .env>"
    } elseif ($Port -eq 8088) {
        Write-Host ("  METERLESS_BASE_URL = " + $url + "/v1")
        Write-Host  "  METERLESS_API_KEY  = <Nightshift proxy token, DM only>"
        Write-Host  "  METERLESS_MODEL    = <a local-runtime/* id from GET /v1/models>"
        Write-Host ""
        Write-Host  "Only worth pasting once a completion actually answers: with no weights the"
        Write-Host  "lane returns 503 local_runtime_not_ready. See .env.example."
    } else {
        Write-Host ("  <SERVICE>_BASE_URL = " + $url)
    }
    Write-Host ""
}

function Test-Public([string]$url) {
    if (-not $isZetaris) {
        # Keyless liveness only: the service's own auth is a separate question.
        for ($i = 1; $i -le 24; $i++) {
            try {
                $r = Invoke-WebRequest ($url + "/healthz") -UseBasicParsing -TimeoutSec 15
                if ($r.StatusCode -eq 200) { Ok ("public URL answers /healthz on " + $label) }
                else { Bad ("public URL returned " + $r.StatusCode + " from /healthz") }
                return
            } catch {
                $code = $_.Exception.Response.StatusCode.value__
                if ($code -and $code -lt 500) {
                    # Reached the service; /healthz just is not shaped the way we assumed.
                    Ok ("public URL reaches " + $label + " (" + $code + " from /healthz)")
                    return
                }
                if ($i -eq 24) {
                    Bad ("public URL not reachable after 24 tries" + $(if ($code) { " (" + $code + ")" } else { "" }))
                    return
                }
                Start-Sleep -Seconds 5
            }
        }
        return
    }

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
            if ($i -eq 24) {
                Bad ("public URL not reachable after 24 tries" + $(if ($code) { " (" + $code + ")" } else { "" }))
                return
            }
            Start-Sleep -Seconds 5
        }
    }
}

# --- stop ----------------------------------------------------------------------------------
if ($Stop) {
    Write-Host ("haqi tunnel - stop (" + $label + ")")
    Write-Host "========================================"
    Write-Host ""
    $tunnelPid = Get-TunnelPid
    if ($tunnelPid) {
        taskkill /T /F /PID $tunnelPid 2>&1 | Out-Null
        Ok ("stopped cloudflared pid " + $tunnelPid)
    } else { Info ("no tunnel is running for " + $label) }
    Remove-Item $urlFile, $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host "The URL is dead. If it was in Render, update or remove it or the slot fails."
    exit 0
}

$tunnelPid = Get-TunnelPid
$url = Get-TunnelUrl

# --- status --------------------------------------------------------------------------------
if (-not $Start) {
    Write-Host ("haqi tunnel - status (" + $label + ")")
    Write-Host "=========================================="
    Write-Host ""
    if (-not $tunnelPid) {
        Warn ("cloudflared is not running for " + $label + " - start with -Start")
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
Write-Host ("haqi tunnel - start (" + $label + ")")
Write-Host "========================================="
Write-Host ""

if ($tunnelPid) {
    Info "already running - reusing it"
    if (-not $url) { Warn ("no URL found in " + $logErr); exit 1 }
    Ok ("public URL: " + $url)
    Test-Public $url
    Show-RenderRows $url
    exit 0
}

# The service must be answering locally before it is worth exposing. Any HTTP status proves it
# is there - a 401 at the root is normal for both Zetaris and Nightshift.
try {
    Invoke-WebRequest "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5 | Out-Null
    Ok ($label + ": answering on 127.0.0.1:" + $Port)
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code) { Ok ($label + ": answering on 127.0.0.1:" + $Port + " (HTTP " + $code + " at root)") }
    else { Bad ("nothing on 127.0.0.1:" + $Port + " - is the service up?"); exit 1 }
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
$cmdFile = Join-Path $runDir ($StatePrefix + '.cmd')
$vbsFile = Join-Path $runDir ($StatePrefix + '.vbs')
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
