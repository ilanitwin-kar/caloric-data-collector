# Run from project root:  powershell -ExecutionPolicy Bypass -File .\scripts\git-initial-commit.ps1
# Requires Git for Windows: https://git-scm.com/download/win

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "Git not found in PATH. Install Git for Windows, then reopen the terminal and run this script again."
}

if (Test-Path .git) {
  Write-Host "Git repo already exists (.git folder found). Skipping git init."
} else {
  git init
}

git add -A
git status
git commit -m "Initial Caloric App"

Write-Host ""
Write-Host "Done. Next: create an empty repo on GitHub (no README), then run:"
Write-Host '  git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git'
Write-Host '  git branch -M main'
Write-Host '  git push -u origin main'
Write-Host ""
