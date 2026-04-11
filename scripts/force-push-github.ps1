# Run from project root (requires Git in PATH):
#   powershell -ExecutionPolicy Bypass -File .\scripts\force-push-github.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "Git not found. Install Git for Windows and reopen the terminal."
}

git add .
git commit -m "Force push files to GitHub"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Commit skipped (nothing new or already committed)."
}
git branch -M main
git push -u origin main

if ($LASTEXITCODE -ne 0) {
  Write-Host "If push was rejected, try: git push -u origin main --force-with-lease"
  exit $LASTEXITCODE
}

Write-Host "Done."
