# AI 集成配置指南

本项目支持两种 AI 提供商：**OpenRouter**（推荐）和 **Cursor CLI**（实验性）

---

## 🎯 方案 1：OpenRouter（推荐）

### 优点
- ✅ **稳定可靠**：通过 HTTP API 调用，无需本地工具
- ✅ **多模型支持**：Claude、GPT-4、Gemini 等
- ✅ **易于调试**：清晰的错误信息
- ✅ **按需付费**：只为使用付费

### 配置步骤

#### 1. 获取 API Key
访问：https://openrouter.ai/keys
- 注册/登录账户
- 创建 API Key
- 复制 Key（格式：`sk-or-v1-...`）

#### 2. 配置环境变量
编辑 `backend/.env`：
```env
OPENROUTER_API_KEY=sk-or-v1-your_actual_key_here
PORT=4001
```

#### 3. 更新配置文件
`backend/config.ts` 已配置为使用 OpenRouter：
```typescript
export const config = {
  aiSdk: {
    provider: "openai" as const,
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    model: "anthropic/claude-3.5-sonnet",
  },
};
```

#### 4. 重启后端
```powershell
# Windows PowerShell
cd C:\Users\kymsuser049\december\backend
Get-NetTCPConnection -LocalPort 4001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
bun run start
```

#### 5. 测试
```powershell
curl.exe -X POST http://localhost:4001/chat/test/messages `
  -H "Content-Type: application/json" `
  -d '{\"message\":\"Hello, test AI integration\",\"history\":[]}'
```

### 可用模型

| 模型 | 描述 | 成本 |
|------|------|------|
| `anthropic/claude-3.5-sonnet` | 平衡性能和成本（推荐） | $ |
| `anthropic/claude-opus` | 最高质量 | $$$ |
| `openai/gpt-4-turbo` | OpenAI 最新 | $$ |
| `google/gemini-pro` | Google 模型 | $ |

完整列表：https://openrouter.ai/models

---

## 🧪 方案 2：Cursor CLI（实验性）

### 当前状态
⚠ **存在问题**：Cursor Agent CLI 在 Windows PowerShell 环境下可能挂起

### 已知限制
- 需要交互式终端环境
- Windows 兼容性问题
- 调试困难

### 配置（如果要尝试）

#### 1. 检查安装
```powershell
& "C:\Users\kymsuser049\AppData\Local\cursor-agent\agent.cmd" --version
# 应显示: 2026.02.13-41ac335
```

#### 2. 配置
编辑 `backend/config.ts`：
```typescript
export const config = {
  aiSdk: {
    provider: "cursor" as const,
    cursorCliPath: `${process.env.LOCALAPPDATA}\\cursor-agent\\agent.cmd`,
    cursorArgs: [],
  },
};
```

编辑 `backend/.env`：
```env
CURSOR_API_KEY=key_b80d66abf393385abc3ac50247e6f9d5fc2a77f4238369e0900696159d7c617e
```

#### 3. 手动测试
```powershell
$env:CURSOR_API_KEY="your_key"
& "C:\Users\kymsuser049\AppData\Local\cursor-agent\agent.cmd" --list-models
```

如果挂起，建议使用 OpenRouter。

---

## 💰 成本估算

### OpenRouter（Claude 3.5 Sonnet）
- **输入**：$3/百万 tokens
- **输出**：$15/百万 tokens

**典型聊天成本**：
- 简单问答：$0.001 - $0.01
- 代码生成：$0.01 - $0.05
- 大型重构：$0.05 - $0.20

### Cursor API
- 订阅制：$20/月（专业版）
- 使用限制可能适用

---

## 🔧 调试

### OpenRouter

#### 测试连接
```powershell
curl.exe https://openrouter.ai/api/v1/models `
  -H "Authorization: Bearer sk-or-v1-your_key"
```

#### 查看后端日志
```powershell
# 后端会输出 API 调用日志
# 查找错误信息
```

#### 常见错误

**"Invalid API key"**
- 检查 `.env` 文件中的 Key 格式
- 确保 Key 以 `sk-or-v1-` 开头

**"Rate limit exceeded"**
- OpenRouter 有请求速率限制
- 等待几秒后重试

**"Model not found"**
- 检查模型名称拼写
- 访问 https://openrouter.ai/models 查看可用模型

### Cursor CLI

#### 检查认证
```powershell
$env:CURSOR_API_KEY="your_key"
& "C:\Users\kymsuser049\AppData\Local\cursor-agent\agent.cmd" --list-models
```

#### 如果挂起
- 尝试在 Cursor 编辑器中测试 Agent 功能
- 检查 Windows 防火墙设置
- 考虑切换到 OpenRouter

---

## 📊 推荐配置

**开发/测试环境**：
```typescript
{
  provider: "openai",
  model: "anthropic/claude-3.5-sonnet",  // 平衡成本和性能
}
```

**生产环境**：
```typescript
{
  provider: "openai",
  model: "anthropic/claude-3.5-sonnet",
  baseUrl: "https://openrouter.ai/api/v1",
}
```

**本地测试（免费）**：
```typescript
{
  provider: "openai",
  model: "meta-llama/llama-3.2-3b-instruct:free",  // 免费模型
  baseUrl: "https://openrouter.ai/api/v1",
}
```

---

## 🔄 切换提供商

编辑 `backend/config.ts`，修改 `provider` 字段：

```typescript
// 使用 OpenRouter
provider: "openai" as const,

// 或使用 Cursor CLI
provider: "cursor" as const,
```

重启后端即可生效。

---

## 📝 总结

**强烈推荐使用 OpenRouter**：
- ✅ 更稳定可靠
- ✅ 易于配置和调试
- ✅ 支持多种顶级模型
- ✅ 透明的定价

只需：
1. 访问 https://openrouter.ai/keys 获取 Key
2. 编辑 `backend/.env` 填写 Key
3. 重启后端
4. 开始使用！
