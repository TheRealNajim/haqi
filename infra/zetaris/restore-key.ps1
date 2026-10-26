# restore-key.ps1 - make sure the Zetaris API key in .env is valid again.
#
# Why this exists: this bundle cannot create API tokens. The UI build has no
# Management / API Tokens page and POST /api/v1.0/auth/api-key returns 404, so
# the key rows in lightning_user_api_key are maintained by hand. A stack restart
# or a bootstrap re-run can leave the table without our row, and then every
# Zetaris REST call fails while the containers still look healthy.
#
# Idempotent: inserts the row only when the hash is missing, then proves the key
# with SELECT 1 through the same contract the backend uses.
#
# Usage: powershell -NoProfile -File infra/zetaris/restore-key.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $root '.env'
$rest = 'http://localhost:8888/api/v1.0'
$orgId = '1'
$email = 'ADMIN@ZETARIS.COM'
$container = 'zetaris-postgres-1'
$dbUser = 'zetaris'
$dbName = 'metastore'

function Fail($message) {
    Write-Host "  FAIL  $message"
    exit 1
}

if (-not (Test-Path $envFile)) { Fail ".env not found at $envFile" }

$key = (Get-Content $envFile | Where-Object { $_ -match '^ZETARIS_API_KEY=' } |
        Select-Object -First 1) -replace '^ZETARIS_API_KEY=', ''
$key = $key.Trim()
if ($key.Length -ne 60 -or -not $key.StartsWith('ak')) {
    Fail "ZETARIS_API_KEY in .env is not a 60-char ak token (len=$($key.Length))"
}

$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($key)))).Replace('-', '').ToLower()
$mask = $key.Substring(0, 6) + '...' + $key.Substring($key.Length - 4)

# Docker must be answering before we touch the metastore.
docker ps --filter "name=$container" --format "{{.Names}}" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "docker is not available - start Docker Desktop first" }

$count = (docker exec $container psql -U $dbUser -d $dbName -t -A -c `
        "select count(*) from lightning_user_api_key where api_key='$hash';" 2>$null).Trim()
if ($count -eq '') { Fail "could not read lightning_user_api_key - is $container healthy?" }

if ($count -eq '0') {
    $id = [guid]::NewGuid().ToString()
    $sql = "set synchronous_commit=on; insert into lightning_user_api_key " +
           "(id,name,org_id,email,api_key,created_at,expired_at,last_used_at,api_key_masked) values " +
           "('$id','haqi-backend-20261026',$orgId,'$email','$hash',now(),'2031-10-26',null,'$mask'); checkpoint;"
    docker exec $container psql -U $dbUser -d $dbName -c $sql 2>$null | Out-Null
    Write-Host "  INFO  key row was missing - restored ($mask)"
} else {
    Write-Host "  PASS  key row present ($mask)"
}

$body = @{ queryId = [guid]::NewGuid().ToString(); sql = 'SELECT 1'; source = 'SqlEditor'; limit = 1 } |
        ConvertTo-Json -Compress
$headers = @{
    Authorization  = "Bearer $key"
    'X-Org-ID'     = $orgId
    'X-Request-ID' = [guid]::NewGuid().ToString()
}
try {
    $r = Invoke-RestMethod "$rest/sql-editor/sqls/run" -Method Post -ContentType 'application/json' `
            -Headers $headers -Body $body -TimeoutSec 60
    if ("$($r.data[0][0])" -ne '1') { Fail "query returned '$($r.data[0][0])' instead of 1" }
    Write-Host "  PASS  key authenticates: SELECT 1 -> 1"
} catch {
    Fail "key still rejected ($($_.Exception.Response.StatusCode.value__)) - is the api container healthy?"
}

exit 0
