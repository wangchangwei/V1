# 在本地终端运行后端（保持窗口不关闭）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\backend
Write-Host "Starting backend on http://localhost:4000 ..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
bun run start
