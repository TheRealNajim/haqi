# infra/zetaris/check-recipe.ps1 - validate a Lightning table against the backend row contract.
#
# The backend's Zetaris adapter (backend/app/adapters/zetaris.py) refuses to guess a query
# until infra publishes a recipe: a table name plus five columns in a fixed order. This
# script is the acceptance test for that handoff. Run it the moment a table is registered.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File infra\zetaris\check-recipe.ps1 -Table HAQI.SENSOR_READINGS
#   powershell -ExecutionPolicy Bypass -File infra\zetaris\check-recipe.ps1 -SelfTest
#
# Exit: 0 = contract satisfied, 1 = table missing, unreadable or wrong shape.
# Read-only. Reads .env for URL/key/org and never prints the key.

param(
    [string]$Table,
    [switch]$SelfTest
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $root '.env'

$Expected = @('source_id', 'raw_value', 'unit', 'distance_km', 'observed_at')

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

# Compare the first columns of a DESCRIBE result to the contract.
# Returns @{ Ok = [bool]; Messages = [string[]] }.
function Test-Contract([string[]]$Actual) {
    $msgs = @()
    $ok = $true

    if ($Actual.Count -lt $Expected.Count) {
        $ok = $false
        $msgs += ("table has {0} column(s); the contract needs at least {1}" -f $Actual.Count, $Expected.Count)
        return [pscustomobject]@{ Ok = $ok; Messages = $msgs }
    }

    $head = @()
    for ($i = 0; $i -lt $Expected.Count; $i++) { $head += $Actual[$i].ToLowerInvariant() }

    for ($i = 0; $i -lt $Expected.Count; $i++) {
        if ($head[$i] -ne $Expected[$i]) {
            $ok = $false
            $msgs += ("column {0} is '{1}', expected '{2}'" -f ($i + 1), $head[$i], $Expected[$i])
        }
    }

    if ($Actual.Count -gt $Expected.Count) {
        $extra = $Actual[$Expected.Count..($Actual.Count - 1)] -join ', '
        $msgs += ("extra column(s) after the contract order (ignored by the adapter): {0}" -f $extra)
    }

    return [pscustomobject]@{ Ok = $ok; Messages = $msgs }
}

if ($SelfTest) {
    Write-Host "contract self-test"
    Write-Host "=================="
    $bad = 0

    $good = @('source_id', 'raw_value', 'unit', 'distance_km', 'observed_at')
    $r = Test-Contract $good
    if ($r.Ok) { Write-Host "  PASS  exact five columns" } else { Write-Host "  FAIL  exact five columns"; $bad++ }

    $withExtra = @('source_id', 'raw_value', 'unit', 'distance_km', 'observed_at', 'station_name')
    $r = Test-Contract $withExtra
    if ($r.Ok -and $r.Messages.Count -eq 1) { Write-Host "  PASS  trailing extras tolerated" } else { Write-Host "  FAIL  trailing extras tolerated"; $bad++ }

    $wrongOrder = @('source_id', 'unit', 'raw_value', 'distance_km', 'observed_at')
    $r = Test-Contract $wrongOrder
    if (-not $r.Ok) { Write-Host "  PASS  wrong order rejected" } else { Write-Host "  FAIL  wrong order rejected"; $bad++ }

    $tooShort = @('source_id', 'raw_value', 'unit')
    $r = Test-Contract $tooShort
    if (-not $r.Ok) { Write-Host "  PASS  short table rejected" } else { Write-Host "  FAIL  short table rejected"; $bad++ }

    $upper = @('SOURCE_ID', 'RAW_VALUE', 'UNIT', 'DISTANCE_KM', 'OBSERVED_AT')
    $r = Test-Contract $upper
    if ($r.Ok) { Write-Host "  PASS  case-insensitive" } else { Write-Host "  FAIL  case-insensitive"; $bad++ }

    Write-Host ""
    if ($bad -gt 0) { Write-Host ("{0} self-test(s) failed." -f $bad); exit 1 }
    Write-Host "All self-tests passed. The checker's rules match the backend contract."
    exit 0
}

if (-not $Table) {
    Write-Host "usage: check-recipe.ps1 -Table <DATABASE.TABLE>   or   -SelfTest"
    exit 1
}

if ($Table -notmatch '^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$') {
    Write-Host ("'{0}' is not a DATABASE.TABLE name" -f $Table)
    exit 1
}

$cfg = Read-DotEnv $envFile
$rest = $cfg['ZETARIS_REST_URL']; if (-not $rest) { $rest = 'http://localhost:8888/api/v1.0' }
$key = $cfg['ZETARIS_API_KEY']
$org = $cfg['ZETARIS_ORG_ID']; if (-not $org) { $org = '1' }

Write-Host ("checking {0}" -f $Table)
Write-Host "=================="

if (-not $key) {
    Write-Host "  FAIL  ZETARIS_API_KEY is empty in .env - nothing to authenticate with"
    exit 1
}

$headers = @{
    Authorization  = 'Bearer ' + $key
    'X-Org-ID'     = [string]$org
    'X-Request-ID' = [guid]::NewGuid().ToString()
}

function Invoke-ZetarisSql([string]$sql) {
    $payload = @{
        queryId = [guid]::NewGuid().ToString()
        sql     = $sql
        source  = 'SqlEditor'
        limit   = 200
    } | ConvertTo-Json -Compress
    return Invoke-RestMethod ($rest.TrimEnd('/') + '/sql-editor/sqls/run') -Method Post `
        -ContentType 'application/json' -Headers $headers -Body $payload -TimeoutSec 60
}

# Positive control: a 400 on DESCRIBE means "no such table" only if the engine is answering at
# all. Without this, an expired key and a missing table look identical.
try {
    $probe = Invoke-ZetarisSql 'SELECT 1 AS one'
    if ([string]$probe.data[0][0] -ne '1') { throw 'unexpected answer to SELECT 1' }
} catch {
    Write-Host "  FAIL  the engine did not answer a trivial query - fix auth/connectivity first"
    Write-Host ("        {0}" -f $_.Exception.Message)
    exit 1
}

try {
    $res = Invoke-ZetarisSql ('DESCRIBE ' + $Table)
} catch {
    $code = $null
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $detail = $_.Exception.Message
    if ($_.Exception.Response) {
        try {
            $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
            $text = $reader.ReadToEnd()
            if ($text) { $detail = $text.Trim() }
        } catch { }
    }
    Write-Host ("  FAIL  query rejected" + $(if ($code) { " (HTTP " + $code + ")" } else { "" }))
    Write-Host ("        {0}" -f $detail)
    Write-Host "        If the table does not exist yet, this is the expected result: nothing is registered."
    exit 1
}

$cols = @()
if ($res.data) {
    foreach ($row in $res.data) {
        if ($row -and $row.Count -ge 1 -and $row[0]) { $cols += [string]$row[0] }
    }
}

if ($cols.Count -eq 0) {
    Write-Host "  FAIL  the engine answered but returned no columns"
    exit 1
}

Write-Host ("  columns: {0}" -f ($cols -join ', '))
$verdict = Test-Contract $cols
foreach ($m in $verdict.Messages) { Write-Host ("  INFO  {0}" -f $m) }

if ($verdict.Ok) {
    Write-Host ""
    Write-Host ("  PASS  {0} matches the adapter row contract." -f $Table)
    Write-Host ("        Recipe to publish to the backend: table={0} columns={1}" -f $Table, ($Expected -join ','))
    exit 0
}

Write-Host ""
Write-Host ("  FAIL  {0} does not match the adapter row contract." -f $Table)
Write-Host ("        Required order: {0}" -f ($Expected -join ', '))
exit 1
