#!/usr/bin/env pwsh
# Cursor CLI 测试脚本

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Cursor CLI 集成测试" -ForegroundColor Cyan
Write-Host "========================================`n"

# 1. 检查 Cursor CLI
Write-Host "[1/5] 检查 Cursor CLI..." -ForegroundColor Yellow
$cursorPath = "$env:LOCALAPPDATA\Programs\Cursor\resources\app\bin\cursor.cmd"

if (Test-Path $cursorPath) {
    Write-Host "  ✓ Cursor CLI 已安装: $cursorPath" -ForegroundColor Green
    $version = & $cursorPath --version 2>&1 | Select-Object -First 1
    Write-Host "  ✓ 版本: $version" -ForegroundColor Green
} else {
    Write-Host "  ✗ Cursor CLI 未找到" -ForegroundColor Red
    exit 1
}

# 2. 检查环境变量
Write-Host "`n[2/5] 检查环境变量..." -ForegroundColor Yellow
$envPath = "C:\Users\kymsuser049\december\backend\.env"

if (Test-Path $envPath) {
    Write-Host "  ✓ .env 文件存在" -ForegroundColor Green
    
    $envContent = Get-Content $envPath
    $hasKey = $envContent | Select-String "CURSOR_API_KEY="
    
    if ($hasKey) {
        $keyValue = ($hasKey -split "=", 2)[1]
        if ($keyValue -match "your_cursor_api_key_here") {
            Write-Host "  ⚠ 需要设置真实的 CURSOR_API_KEY" -ForegroundColor Yellow
            Write-Host "    请编辑 backend/.env 文件" -ForegroundColor Yellow
        } else {
            Write-Host "  ✓ CURSOR_API_KEY 已配置" -ForegroundColor Green
        }
    } else {
        Write-Host "  ✗ .env 文件中未找到 CURSOR_API_KEY" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  ✗ .env 文件不存在" -ForegroundColor Red
    exit 1
}

# 3. 检查配置文件
Write-Host "`n[3/5] 检查配置文件..." -ForegroundColor Yellow
$configPath = "C:\Users\kymsuser049\december\backend\config.ts"

if (Test-Path $configPath) {
    $configContent = Get-Content $configPath -Raw
    
    if ($configContent -match 'provider:\s*"cursor"') {
        Write-Host "  ✓ AI Provider 设置为 cursor" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ AI Provider 未设置为 cursor" -ForegroundColor Yellow
    }
    
    if ($configContent -match 'cursorCliPath') {
        Write-Host "  ✓ cursorCliPath 已配置" -ForegroundColor Green
    } else {
        Write-Host "  ✗ cursorCliPath 未配置" -ForegroundColor Red
    }
} else {
    Write-Host "  ✗ config.ts 不存在" -ForegroundColor Red
    exit 1
}

# 4. 测试 Cursor CLI（如果有 API Key）
Write-Host "`n[4/5] 测试 Cursor CLI 基本功能..." -ForegroundColor Yellow

if ($keyValue -and $keyValue -notmatch "your_cursor_api_key_here") {
    $env:CURSOR_API_KEY = $keyValue.Trim()
    
    Write-Host "  发送测试提示词: 'What is 2+2?'" -ForegroundColor Cyan
    
    try {
        $result = & $cursorPath agent -p "What is 2+2? Reply with just the answer." --output-format text 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Cursor CLI 响应成功" -ForegroundColor Green
            Write-Host "  响应: $($result | Select-Object -First 200)" -ForegroundColor Gray
        } else {
            Write-Host "  ✗ Cursor CLI 调用失败 (exit code: $LASTEXITCODE)" -ForegroundColor Red
            Write-Host "  错误: $result" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ✗ 调用异常: $_" -ForegroundColor Red
    }
} else {
    Write-Host "  ⊘ 跳过（需要有效的 API Key）" -ForegroundColor DarkGray
}

# 5. 检查后端
Write-Host "`n[5/5] 检查后端状态..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:4001/health" -Method GET -TimeoutSec 2 -ErrorAction Stop
    Write-Host "  ✓ 后端运行中 (http://localhost:4001)" -ForegroundColor Green
} catch {
    Write-Host "  ⚠ 后端未运行，需要启动：cd backend && bun run start" -ForegroundColor Yellow
}

# 总结
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  测试完成" -ForegroundColor Cyan
Write-Host "========================================`n"

Write-Host "后续步骤：" -ForegroundColor White
Write-Host "1. 如果 CURSOR_API_KEY 未设置，运行:" -ForegroundColor White
Write-Host "   & '$cursorPath' auth login" -ForegroundColor Gray
Write-Host "   或访问 https://cursor.com/settings 获取 API Key`n" -ForegroundColor Gray

Write-Host "2. 编辑 backend/.env 填写真实的 API Key`n" -ForegroundColor White

Write-Host "3. 重启后端:" -ForegroundColor White
Write-Host "   cd backend && bun run start`n" -ForegroundColor Gray

Write-Host "4. 在前端测试 AI 聊天功能" -ForegroundColor White
Write-Host "   http://localhost:3000/projects/[project-id]`n" -ForegroundColor Gray
