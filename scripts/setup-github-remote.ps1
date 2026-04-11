# Initial commit + push to GitHub — run from project folder:
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-github-remote.ps1
# Requires: Git for Windows

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$RemoteUrl = "https://github.com/ilanitwin-kar/caloric-data-collector.git"
$CommitMessage = "Initial commit - Caloric Data Collector app"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "Git is not in PATH. Install Git for Windows and reopen the terminal."
}

if (-not (Test-Path .git)) {
  git init
}

git add -A

$porcelain = git status --porcelain
git rev-parse --verify HEAD 2>$null | Out-Null
$hasCommit = $LASTEXITCODE -eq 0

if ($porcelain) {
  git commit -m $CommitMessage
} elseif (-not $hasCommit) {
  git commit --allow-empty -m $CommitMessage
} else {
  Write-Host "Nothing new to commit (working tree clean)."
}

git branch -M main

$null = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
  git remote set-url origin $RemoteUrl
  Write-Host "Remote origin set to $RemoteUrl"
} else {
  git remote add origin $RemoteUrl
  Write-Host "Remote origin added: $RemoteUrl"
}

Write-Host ""
Write-Host "Pushing to main..."
git push -u origin main

Write-Host ""
Write-Host "Done: https://github.com/ilanitwin-kar/caloric-data-collector"
