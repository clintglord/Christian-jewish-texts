$ErrorActionPreference = "Stop"

$projectRoot = "C:\dev\jewish-christian-text-library"
Set-Location $projectRoot

$env:IMPORT_MAX_FETCH = "10"
$env:IMPORT_SKIP_EXISTING = "1"

node "C:\dev\jewish-christian-text-library\scripts\import-safe.cjs"
