$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (!(Test-Path .venv\Scripts\python.exe)) {
  try {
    python -m venv .venv
  } catch {
    try { py -3 -m venv .venv } catch { throw "Python not found" }
  }
}

.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

if (Test-Path build) { Remove-Item build -Recurse -Force }
if (Test-Path dist) { Remove-Item dist -Recurse -Force }

.\.venv\Scripts\python.exe -m PyInstaller `
  --onefile `
  --name selectra-share-server-backend `
  --distpath dist `
  --workpath build `
  --specpath build `
  --paths "$root" `
  run_share_server.py

Write-Host "Built: dist\selectra-share-server-backend.exe"
