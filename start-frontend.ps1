# 在本地终端运行前端
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\frontend
Write-Host "Starting frontend on http://localhost:3000 ..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
bun run dev
