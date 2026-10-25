# infra/healthcheck.ps1 - one command that says whether the stack is demo-ready.
#
# Read-only: it never starts, stops, changes or restarts anything.
# Usage:  powershell -ExecutionPolicy Bypass -File infra\healthcheck.ps1
# Exit:   0 = all required checks pass, 1 = something is down.
#
# Covers: Docker engine, the four Zetaris services, the two one-shot jobs,
# Zetaris UI, Zetaris REST with a real SQL round-trip, Meterless runtime.
# Secrets are read from .env and never printed.

param([switch]$NoColor)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'

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

$fail = 0
$warn = 0
function Ok   ([string]$m) { Write-Host ("  PASS  " + $m) }
function Bad  ([string]$m) { Write-Host ("  FAIL  " + $m); $script:fail++ }
function Warn ([string]$m) { Write-Host ("  WARN  " + $m); $script:warn++ }
function Skip ([string]$m) { Write-Host ("  SKIP  " + $m) }

function Get-Health([string]$name) {
    $id = (docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.State.ExitCode}}' $name 2>$null)
    if (-not $id) { return $null }
    $parts = $id.Split('|')
    return [pscustomobject]@{ Status = $parts[0]; Health = $parts[1]; Exit = $parts[2] }
}

Write-Host "haqi infra health"
Write-Host "================="
Write-Host ""

# --- Docker engine -------------------------------------------------------------------------
docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Bad "Docker engine not reachable - start Docker Desktop"
    Write-Host ""
    Write-Host "1 check failed. Nothing else can be tested without the engine."
    exit 1
}
Ok ("docker engine " + (docker info --format '{{.ServerVersion}}' 2>$null))

# --- Zetaris containers --------------------------------------------------------------------
$containers = @(docker ps -a --filter 'label=com.docker.compose.project=zetaris' --format '{{.Names}}')
if ($containers.Count -eq 0) {
    Bad "no Zetaris containers found (compose project 'zetaris')"
} else {
    foreach ($svc in 'postgres', 'driver', 'api', 'ui') {
        $name = $containers | Where-Object { $_ -match ("zetaris-" + $svc + "-") } | Select-Object -First 1
        if (-not $name) { Bad ($svc + ": container missing"); continue }
        $h = Get-Health $name
        if ($h.Status -eq 'running' -and ($h.Health -eq 'healthy' -or $h.Health -eq 'none')) {
            Ok ($svc + ": running" + $(if ($h.Health -ne 'none') { " (" + $h.Health + ")" } else { "" }))
        } else {
            Bad ($svc + ": " + $h.Status + $(if ($h.Health -ne 'none') { "/" + $h.Health } else { "" }))
        }
    }
    foreach ($svc in 'init', 'bootstrap') {
        $name = $containers | Where-Object { $_ -match ("zetaris-" + $svc + "-") } | Select-Object -First 1
        if (-not $name) { Bad ($svc + ": never ran"); continue }
        $h = Get-Health $name
        if ($h.Status -eq 'running') { Bad ($svc + ": still running") }
        elseif ($h.Exit -eq '0') { Ok ($svc + ": completed (exit 0)") }
        else { Bad ($svc + ": exited " + $h.Exit) }
    }
}

# --- Zetaris UI ----------------------------------------------------------------------------
try {
    $r = Invoke-WebRequest 'http://localhost:3000/api/config' -UseBasicParsing -TimeoutSec 10
    if ($r.StatusCode -eq 200) { Ok "ui: /api/config 200" } else { Bad ("ui: /api/config " + $r.StatusCode) }
} catch {
    Bad "ui: not answering on http://localhost:3000"
}

# --- Zetaris REST: a real query ------------------------------------------------------------
$cfg = Read-DotEnv $envFile
$rest = $cfg['ZETARIS_REST_URL']
$key = $cfg['ZETARIS_API_KEY']
$org = $cfg['ZETARIS_ORG_ID']
if (-not $rest) { $rest = 'http://localhost:8888/api/v1.0' }
if (-not $org) { $org = '1' }
if (-not $key) {
    Skip "zetaris rest: ZETARIS_API_KEY empty in .env"
} else {
    try {
        $body = @{
            queryId = [guid]::NewGuid().ToString()
            sql     = 'SELECT 1 AS one'
            source  = 'SqlEditor'
            limit   = 1
        } | ConvertTo-Json -Compress
        $h = @{
            Authorization  = 'Bearer ' + $key
            'X-Org-ID'     = [string]$org
            'X-Request-ID' = [guid]::NewGuid().ToString()
        }
        $res = Invoke-RestMethod ($rest.TrimEnd('/') + '/sql-editor/sqls/run') -Method Post -ContentType 'application/json' -Headers $h -Body $body -TimeoutSec 60
        if ([string]$res.data[0][0] -eq '1') { Ok "zetaris rest: SELECT 1 -> 1" }
        else { Bad "zetaris rest: unexpected reply shape" }
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        Bad ("zetaris rest: query failed" + $(if ($code) { " (" + $code + ")" } else { "" }))
    }
}

# --- Zetaris recipe: the table the backend actually queries --------------------------------
$recipe = 'haqi_views.air_quality_readings'
if ($key) {
    try {
        $body = @{
            queryId = [guid]::NewGuid().ToString()
            sql     = 'SELECT source_id, raw_value, unit, distance_km, observed_at FROM ' + $recipe
            source  = 'SqlEditor'
            limit   = 5
        } | ConvertTo-Json -Compress
        $h = @{
            Authorization  = 'Bearer ' + $key
            'X-Org-ID'     = [string]$org
            'X-Request-ID' = [guid]::NewGuid().ToString()
        }
        $res = Invoke-RestMethod ($rest.TrimEnd('/') + '/sql-editor/sqls/run') -Method Post `
            -ContentType 'application/json' -Headers $h -Body $body -TimeoutSec 90
        $row = $res.data[0]
        if (-not $row -or $row.Count -lt 5) {
            Bad ("recipe: " + $recipe + " returned no contract row")
        } else {
            $stamp = [string]$row[4]
            $age = $null
            try {
                $when = [datetime]::Parse($stamp, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal)
                $age = ((Get-Date).ToUniversalTime() - $when).TotalHours
            } catch { }
            if ($age -eq $null) {
                Warn ("recipe: " + $recipe + " answered but observed_at is not a timestamp (" + $stamp + ")")
            } elseif ($age -gt 6) {
                Warn ("recipe: " + $recipe + " answered but observed_at is {0:N1} h old ({1})" -f $age, $stamp)
            } else {
                Ok ("recipe: " + $recipe + " -> " + $row[1] + " " + $row[2] + ", " + ("{0:N1}" -f $age) + " h old")
            }
        }
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        Bad ("recipe: " + $recipe + " query failed" + $(if ($code) { " (" + $code + ")" } else { "" }) + " - see infra/zetaris/README.md")
    }
} else {
    Skip "recipe: no ZETARIS_API_KEY"
}

# --- Meterless runtime ---------------------------------------------------------------------
$mbase = $cfg['MODEL_BASE_URL']
if (-not $mbase -or $mbase -notmatch '127\.0\.0\.1|localhost') { $mbase = 'http://127.0.0.1:8088/v1' }
$mbase = $mbase.TrimEnd('/')
$mroot = $mbase -replace '/v1$', ''
try {
    $hz = Invoke-RestMethod ($mroot + '/healthz') -TimeoutSec 5
    if ($hz.status -eq 'ok') { Ok ("meterless: /healthz " + $mroot) } else { Bad "meterless: /healthz unexpected body" }
} catch {
    Bad ("meterless: not answering on " + $mroot + " - launch Nightshift")
}
if ($cfg['MODEL_API_KEY']) {
    try {
        $mh = @{ Authorization = 'Bearer ' + $cfg['MODEL_API_KEY'] }
        $models = Invoke-RestMethod ($mbase + '/models') -Headers $mh -TimeoutSec 10
        Ok ("meterless: /v1/models " + $models.data.Count + " ids")
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($code -eq 401 -or $code -eq 403) { Bad "meterless: token rejected (401/403) - refresh MODEL_API_KEY from proxy-token" }
        else { Bad "meterless: /v1/models failed" }
    }

    # /v1/models proves the hotspot is up; only a completion proves a provider is behind it.
    $model = $cfg['NEMOTRON_MODEL']; if (-not $model) { $model = 'meterless/auto' }
    try {
        $chatBody = @{
            model      = $model
            messages   = @(@{ role = 'user'; content = 'Reply with the single word: ready' })
            max_tokens = 16
        } | ConvertTo-Json -Depth 5 -Compress
        $chatHeaders = @{
            Authorization    = 'Bearer ' + $cfg['MODEL_API_KEY']
            'meterless-app'  = 'haqi'
            'meterless-scope' = 'user'
        }
        $chat = Invoke-RestMethod ($mbase + '/chat/completions') -Method Post -ContentType 'application/json' `
            -Headers $chatHeaders -Body $chatBody -TimeoutSec 90
        $answer = $chat.choices[0].message.content
        Ok ("model route: " + $model + " replied (" + ($answer -replace '\s+', ' ').Trim() + ")")
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($code -eq 400) {
            Warn ("model route: " + $model + " has no provider - product answers fall back to the deterministic path")
        } else {
            Warn ("model route: " + $model + " did not answer" + $(if ($code) { " (" + $code + ")" } else { "" }))
        }
    }
} else {
    Skip "meterless: MODEL_API_KEY empty in .env"
}

Write-Host ""
if ($fail -gt 0) {
    Write-Host ("{0} check(s) failed, {1} warning(s). Not demo-ready." -f $fail, $warn)
    exit 1
}
if ($warn -gt 0) {
    Write-Host ("Infra is up, {0} warning(s). Read them before the demo." -f $warn)
    exit 0
}
Write-Host "All required checks passed. Demo-ready."
exit 0
