# Run the finalize migration for employment_type enum
# Usage (PowerShell):
#   $env:DATABASE_URL = "postgres://user:pass@host:5432/dbname"; .\scripts\run_finalize_employment_type_enum.ps1
# This script depends on `psql` being available in PATH.

if (-not $env:DATABASE_URL) {
  Write-Error "DATABASE_URL environment variable is not set. Set it to your Postgres connection string and retry."
  exit 1
}

$mig = Join-Path -Path (Get-Location) -ChildPath "migration/2026_05_29_finalize_employment_type_enum.sql"
if (-not (Test-Path $mig)) {
  Write-Error "Migration file not found: $mig"
  exit 1
}

Write-Host "About to run migration: $mig"
Write-Host "This will attempt to rename employment_type_repair -> employment_type if safe."
Write-Host "Make sure you have a DB backup or are running against a staging DB."

$confirm = Read-Host "Type YES to continue"
if ($confirm -ne 'YES') {
  Write-Host "Aborting."
  exit 0
}

# Execute migration using psql; psql accepts a full connection string via --dbname
$psql = "psql"
if (-not (Get-Command $psql -ErrorAction SilentlyContinue)) {
  Write-Error "psql is not available in PATH. Install PostgreSQL client tools or run this from a machine with psql."
  exit 1
}

# Run the migration
$env:PGPASSWORD = $null # let psql derive credentials from the URL
try {
  & $psql --dbname=$env:DATABASE_URL -f $mig
  if ($LASTEXITCODE -ne 0) {
    Write-Error "psql returned exit code $LASTEXITCODE"
    exit $LASTEXITCODE
  }
  Write-Host "Migration executed. Review output above for notices." -ForegroundColor Green
} catch {
  Write-Error "Failed to execute migration: $_"
  exit 1
}
