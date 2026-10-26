# ensure-recipe.ps1 - rebuild the Zetaris recipe if a restart wiped it.
#
# Why this exists: this bundle's catalog does not survive every restart. On 26 Oct a
# stack restart removed the HAQI REST table and the haqi_views schema store, while all
# containers kept reporting healthy. The recipe check went from PASS to FAIL with
# TABLE_OR_VIEW_NOT_FOUND and no other symptom.
#
# Idempotent: probes the view first and only rebuilds the missing layers. Safe to run
# before every demo.
#
# Usage: powershell -NoProfile -File infra/zetaris/ensure-recipe.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $root '.env'
$rest = 'http://localhost:8888/api/v1.0'
$orgId = '1'

if (-not (Test-Path $envFile)) { Write-Host "  FAIL  .env not found at $envFile"; exit 1 }
$key = ((Get-Content $envFile | Where-Object { $_ -match '^ZETARIS_API_KEY=' } |
        Select-Object -First 1) -replace '^ZETARIS_API_KEY=', '').Trim()
if ($key.Length -ne 60) { Write-Host "  FAIL  ZETARIS_API_KEY in .env is not a 60-char token"; exit 1 }

function Invoke-Sql($sql) {
    $body = @{ queryId = [guid]::NewGuid().ToString(); sql = $sql; source = 'SqlEditor'; limit = 10 } |
            ConvertTo-Json -Compress
    $headers = @{
        Authorization  = "Bearer $key"
        'X-Org-ID'     = $orgId
        'X-Request-ID' = [guid]::NewGuid().ToString()
    }
    try {
        $r = Invoke-RestMethod "$rest/sql-editor/sqls/run" -Method Post -ContentType 'application/json' `
                -Headers $headers -Body $body -TimeoutSec 120
        return [pscustomobject]@{ Ok = $true; Data = $r.data }
    } catch {
        return [pscustomobject]@{ Ok = $false; Status = $_.Exception.Response.StatusCode.value__ }
    }
}

$probe = Invoke-Sql 'SELECT source_id, raw_value, unit, distance_km, observed_at FROM haqi_views.air_quality_readings LIMIT 1'
if ($probe.Ok) {
    $row = $probe.Data[0]
    Write-Host "  PASS  recipe already present: $($row[0]) = $($row[1]) $($row[2]) at $($row[4])"
    exit 0
}

Write-Host "  INFO  recipe missing - rebuilding"

$table = Invoke-Sql 'DESCRIBE HAQI.AIR_QUALITY'
if (-not $table.Ok) {
    $db = Invoke-Sql "CREATE LIGHTNING DATABASE HAQI DESCRIBE BY 'Haqi live sources'"
    Write-Host "  INFO  lightning database HAQI: $(if ($db.Ok) { 'created' } else { "failed ($($db.Status))" })"

    $ddl = "CREATE LIGHTNING REST TABLE AIR_QUALITY FROM HAQI REQUEST (" +
           "endpoint 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=6.5244&longitude=3.3792&current=pm2_5,pm10,us_aqi&timezone=UTC', " +
           "method 'GET', http_encoding 'URLENCODED', response_type 'JSON', insecure_ssl 'false') HEADER () BODY ()"
    $restTable = Invoke-Sql $ddl
    if (-not $restTable.Ok) { Write-Host "  FAIL  could not create HAQI.AIR_QUALITY ($($restTable.Status)) - is outbound internet up?"; exit 1 }
    Write-Host "  INFO  REST table HAQI.AIR_QUALITY: created"
}

# Container creation fails harmlessly when it already exists; the view create is what matters.
Invoke-Sql 'CREATE SCHEMASTORE CONTAINER haqi_views' | Out-Null
$view = Invoke-Sql ("CREATE SCHEMASTORE VIEW air_quality_readings WITH CONTAINER haqi_views AS " +
        "SELECT 'open-meteo:lagos' AS source_id, current.pm2_5 AS raw_value, 'ugm3' AS unit, " +
        "CAST(NULL AS DOUBLE) AS distance_km, concat(current.time, ':00Z') AS observed_at FROM HAQI.AIR_QUALITY")
if (-not $view.Ok) { Write-Host "  FAIL  could not create the view ($($view.Status))"; exit 1 }

$check = Invoke-Sql 'SELECT source_id, raw_value, unit, distance_km, observed_at FROM haqi_views.air_quality_readings LIMIT 1'
if (-not $check.Ok) { Write-Host "  FAIL  view created but the contract query still fails ($($check.Status))"; exit 1 }

$row = $check.Data[0]
Write-Host "  PASS  recipe rebuilt: $($row[0]) = $($row[1]) $($row[2]) at $($row[4])"
exit 0
