$p = Get-ChildItem 'C:\Program Files\PostgreSQL' -Recurse -Filter psql.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) {
    Write-Error 'psql not found in C:\Program Files\PostgreSQL'
    exit 1
}
$pp = $p.FullName
Write-Host "Found psql at $pp"
$conn = $env:DATABASE_URL
if (-not $conn) {
    Write-Host "DATABASE_URL not set in this session; using fallback from script"
    $conn = 'postgres://user:pass@host:5432/dbname'
}
Write-Host "Running migration with connection: $conn"
& $pp $conn -f 'migration/2026_05_29_finalize_employment_type_enum.sql'
exit $LASTEXITCODE
