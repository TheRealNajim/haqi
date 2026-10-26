# infra/healthcheck.ps1 - one command that says whether the stack is demo-ready.
#
# Read-only: it never starts, stops, changes or restarts anything.
# Usage:  powershell -ExecutionPolicy Bypass -File infra\healthcheck.ps1
# Exit:   0 = all required checks pass, 1 = something is down.
#
# Covers: Docker engine, the four Zetaris services, the two one-shot jobs,
# Zetaris UI, Zetaris REST with a real SQL round-trip, the recipe view, Meterless
# runtime (eligibility) and the configured model route end to end.
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

# --- Meterless runtime (eligibility, independent of the model route) ------------------------
# Meterless must be running for the event even when the product talks straight to NVIDIA,
# so this check never depends on MODEL_BASE_URL.
$mlroot = 'http://127.0.0.1:8088'
try {
    $hz = Invoke-RestMethod ($mlroot + '/healthz') -TimeoutSec 5
    if ($hz.status -eq 'ok') { Ok ("meterless: /healthz " + $mlroot) } else { Bad "meterless: /healthz unexpected body" }
} catch {
    Bad ("meterless: not answering on " + $mlroot + " - launch Nightshift")
}

# --- Model route (one route for all three settings) ----------------------------------------
$mbase = ($cfg['MODEL_BASE_URL']).TrimEnd('/')
$mmodel = $cfg['NEMOTRON_MODEL']
$mkey = $cfg['MODEL_API_KEY']
if (-not $mbase -or -not $mmodel -or -not $mkey) {
    Skip "model route: MODEL_BASE_URL / MODEL_API_KEY / NEMOTRON_MODEL not all set"
} else {
    $mhost = ([uri]$mbase).Host
    $localRoute = $mhost -match '^(127\.0\.0\.1|localhost)$'
    $routeName = if ($localRoute) { 'meterless' } else { $mhost }

    # Mixing routes is the failure this guard exists for: a Meterless model id sent to
    # NVIDIA (or vice versa) answers 404 and reads like a broken model instead of bad config.
    if ($localRoute -and $mmodel -like 'nvidia/*') {
        Bad ("model route: NEMOTRON_MODEL " + $mmodel + " is a hosted id but MODEL_BASE_URL is local - routes mixed")
    } elseif (-not $localRoute -and $mmodel -like 'meterless/*') {
        Bad ("model route: NEMOTRON_MODEL " + $mmodel + " is a Meterless id but MODEL_BASE_URL is " + $mhost + " - routes mixed")
    } else {
        Ok ("model route: " + $routeName + " / " + $mmodel)
    }

    $mh = @{ Authorization = 'Bearer ' + $mkey }
    try {
        $models = Invoke-RestMethod ($mbase + '/models') -Headers $mh -TimeoutSec 20
        $ids = @($models.data)
        if ($ids.id -contains $mmodel) {
            Ok ("model route: id present in catalogue (" + $ids.Count + " ids)")
        } else {
            Bad ("model route: " + $mmodel + " not in " + $routeName + " catalogue (" + $ids.Count + " ids)")
        }
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($code -eq 401 -or $code -eq 403) { Bad ("model route: key rejected by " + $routeName + " (401/403) - replace MODEL_API_KEY") }
        else { Bad ("model route: /models failed on " + $routeName + $(if ($code) { " (" + $code + ")" } else { "" })) }
    }

    # Only a completion proves a provider is behind the endpoint.
    try {
        $chatBody = @{
            model      = $mmodel
            messages   = @(@{ role = 'user'; content = 'Reply with the single word: ready' })
            max_tokens = 400
        } | ConvertTo-Json -Depth 5 -Compress
        $chat = Invoke-RestMethod ($mbase + '/chat/completions') -Method Post -ContentType 'application/json' `
            -Headers $mh -Body $chatBody -TimeoutSec 120
        $answer = ([string]$chat.choices[0].message.content -replace '\s+', ' ').Trim()
        if (-not $answer) {
            Warn ("model route: " + $mmodel + " replied with empty content - check max_tokens and thinking mode")
        } else {
            Ok ("model route: " + $mmodel + " replied (" + $answer + ")")
        }
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($code -eq 400) {
            Warn ("model route: " + $mmodel + " has no provider - product answers fall back to the deterministic path")
        } else {
            Warn ("model route: " + $mmodel + " did not answer" + $(if ($code) { " (" + $code + ")" } else { "" }))
        }
    }
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
