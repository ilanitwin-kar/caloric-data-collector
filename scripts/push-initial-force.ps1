# Run locally (Git for Windows required):
#   cd to project folder, then:
#   powershell -ExecutionPolicy Bypass -File .\scripts\push-initial-force.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$Origin = "https://github.com/ilanitwin-kar/caloric-data-collector.git"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "Git not found in PATH. Install from https://git-scm.com/download/win and reopen the terminal."
}

Write-Host ">> git init"
git init

Write-Host ">> git remote (add or update origin)"
$null = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
  git remote set-url origin $Origin
} else {
  git remote add origin $Origin
}

Write-Host ">> git add ."
git add .

Write-Host ">> git commit"
git commit -m "Initial upload of all files"
if ($LASTEXITCODE -ne 0) {
  Write-Warning "Commit failed (maybe nothing to commit or user.name not set). Fix and re-run, or run: git config user.email ... && git config user.name ..."
}

Write-Host ">> git branch -M main"
git branch -M main

Write-Host ">> git push -u origin main --force"
git push -u origin main --force

Write-Host "Done. Check: https://github.com/ilanitwin-kar/caloric-data-collector"
