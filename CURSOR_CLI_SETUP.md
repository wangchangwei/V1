# Cursor CLI 配置指南

## 前置条件

- ✅ Cursor 已安装 (v2.4.31)
- ✅ 路径: `C:\Users\kymsuser049\AppData\Local\Programs\Cursor\resources\app\bin\cursor.cmd`

## 配置步骤

### 1. 获取 API Key

选择以下任一方式：

#### 方式 A：命令行登录
```powershell
& "$env:LOCALAPPDATA\Programs\Cursor\resources\app\bin\cursor.cmd" auth login
```

#### 方式 B：网页获取
访问：https://cursor.com/settings → API Keys → 复制 Key

### 2. 配置环境变量

编辑 `backend/.env`：
```env
CURSOR_API_KEY=your_actual_api_key_here
PORT=4001
```

### 3. 测试 Cursor CLI

```powershell
cd C:\Users\kymsuser049\december\backend

# 测试 Cursor CLI 基本功能
& "$env:LOCALAPPDATA\Programs\Cursor\resources\app\bin\cursor.cmd" agent -p "Hello, what is 2+2?" --output-format text
```

应该返回类似：`2+2 equals 4.`

### 4. 重启后端

```powershell
# 关闭现有后端
Get-NetTCPConnection -LocalPort 4001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# 启动后端
cd C:\Users\kymsuser049\december\backend
bun run start
```

### 5. 测试后端 AI 功能

```powershell
# 测试聊天 API
curl.exe -X POST http://localhost:4001/chat/test-container/messages `
  -H "Content-Type: application/json" `
  -d '{\"message\":\"Hello from test\",\"history\":[]}'
```

## 工作流程

```
用户 → 前端 (localhost:3000)
         ↓
      后端 (localhost:4001)
         ↓
      Cursor CLI (宿主机)
         ↓
      修改容器文件 (通过后端 API)
```

## 调试

### 查看后端日志
```powershell
# 后端会输出 Cursor CLI 调用日志
# 查看是否有 "Cursor CLI spawn error" 或其他错误
```

### 手动测试 Cursor CLI
```powershell
# 直接调用，查看输出
$env:CURSOR_API_KEY = "your_key"
& "$env:LOCALAPPDATA\Programs\Cursor\resources\app\bin\cursor.cmd" agent -p "Explain Docker" --output-format text
```

### 常见问题

**Q: "Cursor CLI spawn error"**
- 检查 `backend/config.ts` 中的 `cursorCliPath` 是否正确
- 检查 `.env` 中的 `CURSOR_API_KEY` 是否有效

**Q: "CURSOR_API_KEY not set"**
- 确保 `backend/.env` 存在且包含有效的 Key
- Bun 会自动加载 `.env`

**Q: "Request timeout"**
- Cursor API 可能响应较慢
- 检查网络连接

## 架构优势

✅ **安全**：API Key 只在宿主机，不暴露给容器
✅ **简单**：无需在容器中安装 Cursor
✅ **灵活**：可切换到其他 AI 提供商（OpenRouter/Ollama）

## 切换到其他 AI 提供商

编辑 `backend/config.ts`：
```typescript
export const config = {
  aiSdk: {
    provider: "openai" as const,  // 改为 "openai"
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "sk-or-v1-...",
    model: "anthropic/claude-sonnet-4",
  },
} as const;
```
