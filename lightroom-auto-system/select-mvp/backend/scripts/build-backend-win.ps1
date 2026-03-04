$ErrorActionPreference = 'Stop'

$backendDir = Split-Path -Parent $PSScriptRoot
Set-Location $backendDir

if (!(Test-Path .venv\Scripts\python.exe)) {
  py -3.13 -m venv .venv
}

.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

$distDir = Join-Path $backendDir "dist"
$buildDir = Join-Path $backendDir "build"
if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
if (Test-Path $buildDir) { Remove-Item $buildDir -Recurse -Force }

.\.venv\Scripts\python.exe -m PyInstaller `
  --onefile `
  --name selectra-backend `
  --distpath "$distDir" `
  --workpath "$buildDir" `
  --specpath "$buildDir" `
  --paths "$backendDir" `
  run_backend.py

Write-Host "Built: $distDir\selectra-backend.exe"
