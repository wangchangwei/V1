# Pi Agent 集成设计

## 概述

将 pi/coding-agent 作为独立服务运行在沙箱容器内，V1 作为纯容器管理 + HTTP 代理层。

**设计原则**：
- V1 只做容器生命周期管理和 HTTP 代理，不参与 agent 逻辑
- pi 完全自治：模型选择、工具执行、prompt 处理全部由 pi 决定
- 容器与 pi 服务 1:1 部署

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│  前端（Browser）                                         │
│  POST /messages, SSE /stream                            │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP/SSE
                         ▼
┌─────────────────────────────────────────────────────────┐
│  V1 Backend（Node.js / Express）                        │
│                                                         │
│  ├─ 容器管理（Docker API / 文件系统）                    │
│  └─ HTTP 反向代理 ↔ SSE 转换                            │
│       └─ 容器健康检查                                    │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP（容器内 localhost）
                         ▼
┌─────────────────────────────────────────────────────────┐
│  容器（sandbox-N）                                       │
│                                                         │
│  └─ pi HTTP 服务（pi serve --port 7890）                │
│       ├─ /v1/chat/completions  (SSE stream)            │
│       ├─ /v1/models             (model list)            │
│       └─ /health               (health check)           │
│            │                                           │
│            ▼                                           │
│       pi-agent-core                                     │
│            │                                           │
│            ▼                                           │
│       pi-ai（多模型：OpenAI/Anthropic/MiniMax/...）     │
│            │                                           │
│            ▼                                           │
│       工具集：read / bash / edit / write / grep / find / ls │
└─────────────────────────────────────────────────────────┘
```

---

## 组件职责

### V1 Backend

| 组件 | 职责 |
|------|------|
| `ContainerManager` | 创建/销毁容器、管理容器生命周期、存储容器与项目映射 |
| `PiProxy` | HTTP 反向代理（请求转发）+ SSE 透传 |
| `ContainerHealthCheck` | 启动后检查 pi 服务是否就绪（`GET /health`） |

### 容器镜像

| 组件 | 职责 |
|------|------|
| `pi` | 核心 agent 进程，运行 `pi serve` HTTP 服务 |
| `tini` | PID 1 init 进程（graceful shutdown） |

---

## 决策

| # | 问题 | 选择 |
|---|------|------|
| 1 | 沙箱模型 | V1 容器 = pi 工作目录，V1 管理容器生命周期 |
| 2 | RPC 通信 | HTTP 服务模式（`pi serve`），非 STDIO |
| 3 | 进程生命周期 | 会话级进程，容器生命周期内复用 |
| 4 | 模型配置 | pi 独立选择模型，V1 不控制 |
| 5 | 事件流 | pi 事件 → V1 透传 → SSE 推送 |
| 6 | 集成范围 | 完全替换：V1 变为容器管理 + 代理层 |
| 7 | 架构拓扑 | 容器内 HTTP 服务，V1 作为反向代理 |
| 8 | pi 启动方式 | 容器启动时自动运行 pi 服务 |

---

## 请求流程

### 用户发消息

1. 前端 POST `/messages` → V1
2. V1 验证 `containerId`，查找容器内 pi 地址
3. V1 代理到 `http://localhost:PORT/v1/chat/completions`
4. V1 将 pi 的 SSE 流透传给前端
5. pi 内部：`pi-ai` → `agentLoop` → 工具执行 → SSE 输出

---

## 接口协议

### 通信

| 方向 | 协议 |
|------|------|
| V1 → pi | HTTP POST/GET |
| pi → 前端 | SSE（透传） |
| 健康检查 | HTTP GET `/health` |

### 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | 对话补全，支持流式 |
| `/v1/models` | GET | 可用模型列表 |
| `/health` | GET | 健康检查 |

### 请求格式（OpenAI 兼容）

```json
POST /v1/chat/completions
{
  "model": "claude-sonnet-4-20250514",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "帮我创建一个按钮组件" }
  ],
  "stream": true,
  "tools": [...]
}
```

---

## 容器生命周期

### 创建时序

```
用户请求创建项目
       ↓
V1.createContainer(projectId)
       ↓
Docker API: 创建容器
  - 基于 pi 镜像
  - CMD: ["pi", "serve", "--port", "7890"]
       ↓
容器启动 → pi serve 进程运行
       ↓
V1: GET http://localhost:PORT/health
  ├─ 200 OK → 容器就绪
  └─ 超时/失败 → 标记 FAILED
```

### 销毁

```
V1.destroyContainer(containerId)
       ↓
Docker: 停止容器 → 删除容器
       ↓
清理 V1 侧元数据
```

### pi 启动命令

```bash
pi serve \
  --port 7890 \
  --host 0.0.0.0 \
  --cwd /workspace \
  --session-name {projectId}
```

---

## 健康检查

- 首次检查：容器启动后 2s
- 重试间隔：2s
- 最大重试：5 次
- 超时后：标记容器为 FAILED，通知前端

---

## 错误处理

| 场景 | 处理 |
|------|------|
| pi 进程崩溃 | V1 检测到连接断开，通知前端 |
| 模型调用失败 | pi 返回错误消息，透传给前端 |
| 前端断连 | V1 感知 SSE 中断，容器保持运行 |
| 容器启动失败 | 健康检查重试后标记 FAILED |

---

## 实现步骤（待规划）

1. 构建包含 pi 的容器镜像
2. 实现 `ContainerManager`（创建/销毁容器）
3. 实现 `PiProxy`（HTTP 代理 + SSE 透传）
4. 实现 `ContainerHealthCheck`（健康检查）
5. 改造前端 SSE 协议（如需要）
6. 端到端测试
