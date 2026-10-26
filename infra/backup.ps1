# infra/backup.ps1 - back up the Zetaris metastore and prove the backup restores.
#
# The valuable state in this stack is the postgres volume `zetaris_pgdata`: accounts, the API
# token hash, registered sources, query history. Containers are disposable; this is not.
#
# What it does, in order:
#   1. pg_dump (custom format) of `metastore` and `audit` into <repo>\backups\<timestamp>\
#   2. copies the platform .env next to the dumps (it holds the keypair password)
#   3. restore drill: loads each dump into a throwaway database, compares row counts, drops it
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File infra\backup.ps1
#   powershell -ExecutionPolicy Bypass -File infra\backup.ps1 -NoRestoreTest
#   powershell -ExecutionPolicy Bypass -File infra\backup.ps1 -PlatformDir "C:\path\to\zetaris-platform"
#
# Exit: 0 = dumps written and verified, 1 = anything failed.
# The stack keeps running throughout. backups\ is gitignored; never commit it.

param(
    [string]$OutDir,
    [string]$PlatformDir,
    [switch]$NoRestoreTest
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $repo 'backups' }

$Container = 'zetaris-postgres-1'
$User = 'zetaris'
$Databases = @('metastore', 'audit')
# Tables that must survive a restore, with the query that counts them.
$Probes = @(
    @{ Db = 'metastore'; Table = 'lightning_database' },
    @{ Db = 'metastore'; Table = 'lightning_user_api_key' },
    @{ Db = 'metastore'; Table = 'filestore_table' }
)

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$dest = Join-Path $OutDir $stamp

function Fail([string]$m) {
    Write-Host ("  FAIL  " + $m)
    exit 1
}

function Psql([string]$db, [string]$sql) {
    $out = docker exec $Container psql -U $User -d $db -tAc $sql 2>&1
    if ($LASTEXITCODE -ne 0) { throw ("psql failed on {0}: {1}" -f $db, ($out -join ' ')) }
    return ($out | Out-String).Trim()
}

Write-Host "Zetaris backup"
Write-Host "=============="
Write-Host ""

docker inspect -f '{{.State.Status}}' $Container 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "$Container not found - is the stack up?" }
$state = (docker inspect -f '{{.State.Status}}' $Container).Trim()
if ($state -ne 'running') { Fail "$Container is $state - start the stack first" }

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host ("  target: {0}" -f $dest)

# --- 1. dumps -------------------------------------------------------------------------------
foreach ($db in $Databases) {
    $inner = "/tmp/$db.dump"
    docker exec $Container sh -c "pg_dump -U $User -Fc -f $inner $db" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "pg_dump failed for $db" }
    $size = (docker exec $Container sh -c "stat -c %s $inner" 2>&1 | Out-String).Trim()
    if (-not $size -or [int]$size -le 0) { Fail "dump for $db is empty" }
    docker cp "${Container}:$inner" (Join-Path $dest "$db.dump") 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "copying the $db dump out of the container failed" }
    docker exec $Container sh -c "rm -f $inner" | Out-Null
    Write-Host ("  PASS  {0}.dump ({1:N0} KB)" -f $db, ([int]$size / 1KB))
}

# --- 2. platform .env -----------------------------------------------------------------------
if (-not $PlatformDir) {
    $candidates = @(
        (Join-Path $env:USERPROFILE 'Downloads\zetaris-platform\zetaris-platform'),
        (Join-Path $env:USERPROFILE 'zetaris-platform')
    )
    foreach ($c in $candidates) { if (Test-Path (Join-Path $c '.env')) { $PlatformDir = $c; break } }
}
if ($PlatformDir -and (Test-Path (Join-Path $PlatformDir '.env'))) {
    Copy-Item (Join-Path $PlatformDir '.env') (Join-Path $dest 'platform.env.backup') -Force
    Write-Host "  PASS  platform .env copied (contains the keypair password - keep this folder private)"
} else {
    Write-Host "  WARN  platform .env not found; pass -PlatformDir. Without it the keypair password is lost"
}

# --- 3. restore drill -----------------------------------------------------------------------
$probePath = Join-Path $dest 'restore-test.txt'
if ($NoRestoreTest) {
    Write-Host "  SKIP  restore drill (-NoRestoreTest)"
    "restore drill skipped" | Set-Content -Path $probePath -Encoding utf8
} else {
    $lines = @()
    foreach ($db in $Databases) {
        $tmpDb = ("restore_test_{0}_{1}" -f $db, ($stamp -replace '[-_]', ''))
        $file = Join-Path $dest "$db.dump"

        $before = @{}
        foreach ($p in $Probes | Where-Object { $_.Db -eq $db }) {
            $before[$p.Table] = Psql $db ("select count(*) from " + $p.Table)
        }

        docker cp $file "${Container}:/tmp/$db.dump" 2>&1 | Out-Null
        docker exec $Container psql -U $User -d postgres -c "create database $tmpDb" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Fail "could not create the throwaway database $tmpDb" }

        docker exec $Container pg_restore -U $User --no-owner --no-privileges -d $tmpDb "/tmp/$db.dump" 2>&1 | Out-Null
        $restoreExit = $LASTEXITCODE
        docker exec $Container sh -c "rm -f /tmp/$db.dump" | Out-Null

        if ($restoreExit -ne 0) {
            docker exec $Container psql -U $User -d postgres -c "drop database if exists $tmpDb" 2>&1 | Out-Null
            Fail "pg_restore reported errors for $db - the dump is not usable"
        }

        foreach ($p in $Probes | Where-Object { $_.Db -eq $db }) {
            $after = Psql $tmpDb ("select count(*) from " + $p.Table)
            if ($before[$p.Table] -ne $after) {
                docker exec $Container psql -U $User -d postgres -c "drop database if exists $tmpDb" 2>&1 | Out-Null
                Fail ("{0}.{1}: {2} rows live, {3} after restore" -f $db, $p.Table, $before[$p.Table], $after)
            }
            $lines += ("{0}.{1} = {2}" -f $db, $p.Table, $after)
        }

        $tables = Psql $tmpDb "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')"
        docker exec $Container psql -U $User -d postgres -c "drop database if exists $tmpDb" 2>&1 | Out-Null
        $lines += ("{0} tables restored in {1}" -f $tables, $db)
        Write-Host ("  PASS  {0} restored into a throwaway database and dropped" -f $db)
    }

    $lines += ("verified " + (Get-Date -Format 'u'))
    $lines | Set-Content -Path $probePath -Encoding utf8
}

# --- summary --------------------------------------------------------------------------------
$total = (Get-ChildItem $dest -File | Measure-Object -Sum Length).Sum
Write-Host ""
Write-Host ("Backup written to {0} ({1:N1} MB)" -f $dest, ($total / 1MB))
Write-Host "Copy this folder somewhere off this PC; it is the only copy of the keypair password."
exit 0
