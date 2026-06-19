# SSE 流重连与多客户端订阅设计

## 概述

解决"chat turn 流式生成时刷新页面 → UI 静默停在新 chunk 收不到"的 bug。当 pi 正在为某个 project 流式生成响应时，多个客户端（刷新后的同一 tab、其他 tab、其他设备）应当能够订阅该 turn 的后续 chunk 并正确渲染。

**设计原则**：
- chat turn 的生命周期从"绑死某个 Express `res`"剥离为独立 server-side 状态对象
- 多个 SSE 客户端可以同时订阅同一个 turn，行为等价
- 客户端断连/刷新/重连都不影响后端 turn 继续运行
- "启动 turn" 和 "订阅 turn 响应" 解耦为两个端点

---

## 背景

`commit 17876bd feat: track in-progress turn state for page-reload recovery` 实现了"页面刷新时调 `GET /chat/:containerId/turn-status` 拿 inProgressTurn 的 partialText + toolCalls，恢复已流出的内容"。但该实现**没有**重新订阅后续 chunk 的机制：

- 旧 SSE 连接是 POST `/messages` 时建立的长连接
- 浏览器刷新 = 该 SSE 连接永久断开
- 后端 `runChatTurn` 仍在 `for await (chunk) { res.write(...) }` 循环里写，但 `res` 不可写
- 最终 `req.signal` 触发 abort（很晚）→ 抛错 → 清空 `inProgressTurn`
- 前端从未收到后续 chunk 和 done 事件

本次设计把"流式响应"从 per-connection 改为 per-turn，多客户端可订阅。

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│  前端（Browser）                                         │
│  POST /messages (sync)  ──►  { userMsg, assistantMsgId }│
│  GET  /turn-stream (SSE)──►  { chunks... done }         │
│  GET  /turn-status       ──►  { processing, state }     │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  V1 Backend                                             │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │ TurnBroadcaster (per containerId)          │         │
│  │  ├─ state: { userMsg, partialText, ... }   │         │
│  │  ├─ subscribers: Set<Response>             │         │
│  │  ├─ emit(chunk) → 扇出到所有 subscribers   │         │
│  │  └─ finalize(done|error) → 推 final + 清理 │         │
│  └────────────────────────────────────────────┘         │
│         ▲                                               │
│         │ emit(chunk)                                   │
│  runChatTurn (async generator)                          │
│         │                                               │
│         ▼                                               │
│  piChatStream ──► pi sidecar                            │
└─────────────────────────────────────────────────────────┘
```

**关键变化**：`runChatTurn` 不再 `res.write(...)`，改为 `broadcaster.emit(chunk)`。Express `res` 从"数据归宿"降级为"view"。

---

## 组件职责

### `TurnBroadcaster` (新)

**位置**：`backend/src/services/turnBroadcaster.ts`

| 方法 | 职责 |
|------|------|
| `constructor(userMsg, assistantMsgId, onFinalize)` | 初始化 state，注入 registry 清理回调 |
| `attach(res)` | 新订阅者接入：先 flush 当前 state（user + assistant partial + 累积 toolCalls），再进入实时推送 |
| `detach(res)` | 订阅者断开时移除（不清理 broadcaster） |
| `emit(chunk)` | 接收 runChatTurn 产出的 chunk，更新 state 并扇出到所有 subscribers |
| `finalize(status, error?)` | piChatStream done/error 时调用：标记 state、推 final chunk、触发 onFinalize |
| `getState()` | 供 `GET /turn-status` 使用 |
| `abort()` | 暴露给未来 stop 功能（本期不用） |

**状态机**：`running` → (`done` | `error`)，finalize 后不可变。

### Registry (`turnBroadcasters.ts`)

```ts
const turnBroadcasters = new Map<string, TurnBroadcaster>();
getBroadcaster(containerId), setBroadcaster(...), removeBroadcaster(...)
```

**写入时序**（在 `withProjectLock` 内）：
1. `const b = new TurnBroadcaster(userMsg, assistantId, () => removeBroadcaster(containerId))`
2. `setBroadcaster(containerId, b)`
3. `for await (chunk of piChatStream(..., b.abortController.signal)) { b.emit(chunk) }`
4. 循环结束后 `b.finalize('done')` → 触发回调清掉自己

### 改造后的 `runChatTurn` (在 `routes/chat.ts`)

- 不再 `res.write(chunk)`，改为 `broadcaster.emit(chunk)`
- 完成后 `broadcaster.finalize('done')`（或 `'error'`）
- 不再依赖任何 res 生命周期
- **必须是 fire-and-forget 后台 task**：POST 处理器创建 broadcaster 后立即 `void runChatTurn(...)`（不 await），让 task 在后台跑。POST 立即返回 JSON。
- `runChatTurn` 内部仍 `await` piChatStream 完成才返回（即 `void` 一个 Promise，等它自己 settle）
- 这种模式让 POST 响应延迟与 broadcaster 创建成本对齐（snapshot + setBroadcaster），不阻塞等 pi 流

### 新端点 `GET /chat/:containerId/turn-stream`

```ts
router.get('/:containerId/turn-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const broadcaster = getBroadcaster(containerId);
  if (!broadcaster) {
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  broadcaster.attach(res);
  req.on('close', () => broadcaster.detach(res));
});
```

### 改造后的 `POST /chat/:containerId/messages`

- `stream: true` 参数**不再支持**，传了返回 400
- 改为同步启动 turn：调用 `runChatTurn` **消费 generator 写入 broadcaster**，**不返回 SSE 流**
- 立即返回 JSON `{ success: true, userMessage, assistantMessageId, turnId }`
- broadcaster 存在时 → 返回 409 `{ error: 'turn_in_progress' }`

### 改造后的 `PATCH /chat/:containerId/messages/:messageId`

- 同样不再返回 SSE 流
- 启动 `TurnBroadcaster` 后立即返回 JSON
- 前端响应后订阅 `/turn-stream`

### 改造后的 `GET /chat/:containerId/turn-status`

- 行为不变：从 broadcaster.getState() 读，**不再**从 `chatSessions.inProgressTurn` 读
- 响应结构不变：`{ processing, inProgressTurn }`

### `chatSessions.inProgressTurn` (移除)

- **删除该字段**（连同 `InProgressTurn` interface）。原因：broadcaster 成为唯一数据源，inProgressTurn 不再被写入，"保留作兜底"在实践中永远是空的，反而增加理解成本
- `runChatTurn` 不再写 `chatSessions.inProgressTurn`，状态全权交给 broadcaster
- `sessionToPiMessages` 中跳过 in-flight user message 的逻辑（chatSessions.ts:110-112）保留——这是基于 `msg.snapshotId` 缺失 + 当前消息是否在 in-flight 的判断，依然必要

### 前端 `subscribeTurnStream` (新)

**位置**：`frontend/src/lib/backend/api.ts`

```ts
export function subscribeTurnStream(
  containerId: string,
  onMessage: (data: any) => void,
  onError?: (error: string) => void,
  onComplete?: () => void,
): () => void {
  const es = new EventSource(`${API_BASE_URL}/chat/${containerId}/turn-stream`);

  es.onmessage = (ev) => {
    if (ev.data === '[DONE]') {
      onComplete?.();
      es.close();
      return;
    }
    try { onMessage(JSON.parse(ev.data)); } catch {}
  };

  es.onerror = () => {
    onError?.('SSE connection error');
    es.close();  // 不让浏览器自动重连；调用方决定节奏
  };

  return () => es.close();
}
```

### 前端 `WorkspaceDashboard` 改造

- 删除 `sendChatMessageStream`（或重写为"启动 + 订阅"两阶段）
- `handleSendMessage` 改成：
  ```
  1. POST /messages (sync) → 拿到 userMessage + assistantMsgId
  2. setMessages(prev => [...prev, userMessage, partialAssistantPlaceholder])
  3. setStreamingMessageId(assistantMsgId)
  4. subscribeTurnStream(containerId, onChunkHandler)  // 返回 cancel
  5. 第一个 chunk 通常是 'user' (重复，丢弃) + 'assistant' (累积)
  6. done 事件触发 → onComplete 清 streamingMessageId
  ```
- 加载时：调 `getChatHistory` + `getTurnStatus`；如果有 in-flight turn → 直接 `subscribeTurnStream`

---

## 决策

| # | 问题 | 选择 |
|---|------|------|
| 1 | 刷新后是否接续订阅 | **接续订阅 + 看到后续 chunk** |
| 2 | 多客户端（多 tab）是否都订阅 | **需要多客户端订阅** |
| 3 | 订阅粒度 | **按 turn 订阅**（per containerId，一个 project 同时最多一个 in-flight turn） |
| 4 | 端点设计 | **POST 启动 turn + GET EventSource 订阅**（两阶段解耦） |
| 5 | broadcaster 退出时机 | **piChatStream done/error 时**（订阅者断连不影响后端） |
| 6 | 旧 `sendChatMessageStream` 路径 | **删除**（POST 不再支持 `stream: true`） |
| 7 | `inProgressTurn` 字段 | **删除**——broadcaster 是唯一数据源，保留即空字段，徒增理解成本 |
| 8 | EventSource 自动重连 | **禁用**，由 `subscribeTurnStream` 显式管理 |
| 9 | 409 turn_in_progress 时新消息如何处理 | **toast 提示**，不做排队 |
| 10 | stop / abort turn 功能 | **不在本期范围** |

---

## 请求流程

### 启动 turn

```
client  ─POST /messages─►  server
                            ├─ withProjectLock 拿锁（仅锁 broadcaster 创建 + snapshot，
                            │     不锁整个 turn——见下方"锁的范围"）
                            ├─ broadcaster 不存在 → 创建 + setBroadcaster
                            ├─ 捕获 snapshot（同步部分，await）
                            ├─ void runChatTurn(...) ← fire-and-forget 后台 task
                            ├─ 立即返回 JSON { userMessage, assistantMessageId, turnId }
                            └─ 释放锁

client  ─GET /turn-stream─►  server
                            ├─ 找到 broadcaster
                            ├─ broadcaster.attach(res): flush state (user + assistant partial + toolCalls)
                            └─ req close → broadcaster.detach(res)
```

**锁的范围**：`withProjectLock` 只包住"创建 broadcaster + 启动后台 task + 立即返回 JSON"这一段。后台 `runChatTurn` task 跑在锁外。如果锁包住整个后台 task，POST 会阻塞等 turn 完成——这就退化成旧的 stream: true 行为，违反设计目标。

**并发保证**：锁释放后，第二个 POST 进来能拿锁、但会发现 broadcaster 已存在 → 409 `turn_in_progress`。并发效果 = 同一 project 同一时间最多一个 in-flight turn，由 broadcaster 检查（而非锁）保证。

### 刷新恢复

```
client mount → useEffect loadChatHistory
              ├─ GET /messages → 历史消息
              ├─ GET /turn-status → { processing: true, inProgressTurn }
              ├─ setMessages([...history, partialAssistant])
              ├─ setStreamingMessageId(assistantMsgId)
              └─ subscribeTurnStream → 持续接收 chunks → done
```

### turn 结束清理

```
piChatStream 吐 done chunk
  → runChatTurn 循环结束
  → broadcaster.finalize('done')
    ├─ state.status = 'done'
    ├─ 推 done chunk 给所有 subscribers
    ├─ 触发 onFinalize 回调 → removeBroadcaster(containerId)
    └─ withProjectLock 释放
```

---

## 接口协议

### `POST /chat/:containerId/messages`

**请求**：
```json
{ "message": "...", "attachments": [...] }
```
（不再接受 `stream` 字段；传 `stream: true` 返回 400）

**响应 200**：
```json
{
  "success": true,
  "userMessage": { ... },
  "assistantMessageId": "assistant-...",
  "turnId": "turn-..."
}
```

**响应 409**（已有 in-flight turn）：
```json
{ "success": false, "error": "turn_in_progress" }
```

### `GET /chat/:containerId/turn-stream`

**响应 200**（有 in-flight turn）：`text/event-stream`，chunk 协议同 POST 流
```
data: {"type":"user","data":{...}}
data: {"type":"assistant","data":{...}}
...
data: {"type":"done","data":{...}}
data: [DONE]
```

**响应 200**（无 in-flight turn）：立即结束
```
data: [DONE]
```

### `GET /chat/:containerId/turn-status`

行为不变：
```json
{ "processing": true, "inProgressTurn": { ... } }
```

### Chunk 协议（不变）

`user` / `assistant` / `tool_call` / `tool_result` / `done` / `error`，格式与现有 POST SSE 流一致。

---

## 初始 flush 协议（attach 时给新订阅者灌什么）

为了让刷新后的新客户端 UI 状态正确，attach 时按以下顺序灌 chunk：

```
1. { type: 'user', data: state.userMsg }                            // 同步 user 消息
2. { type: 'assistant', data: { id, content: partialText, toolCalls, ... } }  // 已渲染状态
3. 已完成的 toolCall/toolResult：从 state.toolCalls 重新 yield 一遍
4. (后续是 emit 的实时 chunk)
```

> 初始 assistant chunk 的 `content` 用 `state.partialText`，让刷新后 UI 立即看到已流出内容，无需等下一个 emit。

---

## 错误处理

| 场景 | 行为 |
|------|------|
| 浏览器刷新 / tab 关闭 | `req.on('close')` → `broadcaster.detach(res)`，broadcaster 继续跑 |
| 客户端断网 | EventSource 报错 → onError 触发，调用方决定是否重连 |
| 多 tab 订阅 | 每个 tab 独立 EventSource，各自 attach |
| piChatStream 抛错 | runChatTurn catch → `finalize('error', { message })` → registry 清理 |
| pi container 死 / 重启 | piChatStream 立即 fetch error → finalize('error') |
| 同 project 已有 turn | POST 返回 409，前端 toast |
| GET /turn-stream 时 broadcaster 不存在 | 立即 `[DONE]` 让客户端结束 |
| 后端进程重启 | in-memory state 全丢，turn-status 返回 processing=false，前端自然清理；接受限制 |
| 用户主动 stop turn | 不在本期范围；架构留 `broadcaster.abort()` 入口 |

---

## 资源生命周期

| 事件 | 行为 |
|------|------|
| piChatStream `done` | `finalize('done')` → 推 done → registry 清理 |
| piChatStream `error` | `finalize('error', { message })` → 推 error → registry 清理 |
| 所有 subscribers 断开 | **不清理**（broadcaster 继续跑） |
| `withProjectLock` 释放 | runChatTurn 返回时（保持现有行为） |
| `AbortController` 触发 | 本期不主动 abort（用户没要 stop 功能） |

---

## 改造文件清单

| 文件 | 改动 |
|------|------|
| `backend/src/services/turnBroadcaster.ts` | **新建** — broadcaster 类 |
| `backend/src/services/turnBroadcasters.ts` | **新建** — registry Map |
| `backend/src/routes/chat.ts` | 改 `runChatTurn` 写入 broadcaster；改 `POST /messages` 不返回流；新增 `GET /turn-stream`；改 `GET /turn-status` 从 broadcaster 读 |
| `backend/src/services/chatSessions.ts` | 移除 `inProgressTurn` 字段和 `InProgressTurn` interface；保留 `sessionToPiMessages` 中的 in-flight user message 跳过逻辑 |
| `frontend/src/lib/backend/api.ts` | 新增 `subscribeTurnStream`；删除/重写 `sendChatMessageStream`；改 `sendChatMessage` 不再 stream |
| `frontend/src/app/projects/components/WorkspaceDashboard.tsx` | 改 `handleSendMessage` 为"启动 + 订阅"两阶段；加载时如有 in-flight turn 订阅 |

---

## 测试策略

### 后端单元测试（`turnBroadcaster.test.ts`）

| 用例 | 验证点 |
|------|--------|
| 单订阅者 attach/emit/detach | chunk 顺序正确，断连不抛 |
| 多订阅者 attach | 同一 chunk 推给所有 subscribers |
| attach 时已有累积 state | 初始 flush 顺序：user → assistant(partial) → toolCall → toolResult |
| finalize('done') | 推 done chunk + 触发 onFinalize 回调 |
| finalize('error', msg) | 推 error chunk + 触发 onFinalize 回调 |
| attach 已 finalize 的 broadcaster | 仍能拿到 final state + done/error chunk |
| detach 后 emit | 不写入已关闭 res（不抛） |

### 后端集成测试（`chat.test.ts` 新增）

| 用例 | 验证点 |
|------|--------|
| POST /messages 启动 turn → 立即返回 JSON | 响应时间 < 200ms（不阻塞等 pi） |
| POST /messages 时 broadcaster 存在 → 409 | `turn_in_progress` |
| GET /turn-stream 在 turn 进行中 → 完整 chunks 序列 | 端到端 |
| GET /turn-stream 无 broadcaster → 立即 [DONE] | 200 |
| GET /turn-stream 客户端断开 → broadcaster 继续跑 | detach 验证 |
| PATCH /messages/:id 启动新 turn + GET /turn-stream 收到 | edit 路径 |
| piChatStream 抛错 → finalize('error') | 错误路径 |

**mock 策略**：mock `piChatStream` 为可控 async generator；用 supertest + 内存 `res` 收集 SSE 事件。

### 前端单元测试（`subscribeTurnStream.test.ts`）

| 用例 | 验证点 |
|------|--------|
| 收到 chunk → onMessage | 数据正确 |
| 收到 [DONE] → onComplete + close | 不自动重连 |
| 收到 error → onError + close | 手动 close |
| 返回的 unsubscribe → 关 EventSource | 不再触发回调 |

**mock 策略**：替换 `EventSource` 为可手动驱动的 fake。

### 前端 `WorkspaceDashboard` 行为测试

| 用例 | 验证点 |
|------|--------|
| 加载时 turn-status = processing → 订阅 → 渲染 partialAssistant | UI 正确恢复 |
| sendChatMessage 启动后立即订阅 → 收到 chunks | send 路径 |
| 刷新（mount/unmount）→ onComplete/onError 清理 | 不泄漏 EventSource |

### 手动 E2E 验证清单

1. 启动 turn → 中途刷新 → 加载后看到 partial 内容 + 继续接收后续 chunks
2. 启动 turn → 中途刷新 → 再发新消息 → 看到 409 toast
3. 启动 turn → 不刷新，开第二个 tab → 第二个 tab 也能看到 turn 进度
4. 启动 turn → 中途断网 5s → 恢复后自动重连看到当前 state
5. pi 端报错 → UI 看到 error chunk → 自动恢复
6. 启动 turn → 完成 → 刷新 → 看到完整对话历史（无 stuck 的 in-flight 状态）

### 回归保护

- 现有 E2E `test/integration/chat-routes.test.ts`（commit a68abce）必须继续通过
- grep 确认无 `sendChatMessageStream` 其他调用方
- `withProjectLock` 行为不变

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| EventSource 跨域 / 鉴权问题 | 沿用现有 CORS `*`；未来加 cookie 鉴权时复制 `withCredentials` 处理 |
| 大量 in-flight turn 占用内存 | 当前架构 in-flight turn 只能 1 个/project，不会无限增长 |
| piChatStream 的 abort signal 没人用 | 接受浪费；用户没要 stop 功能就不 abort |
| 后端重启丢状态 | 接受限制；前端 turn-status 拿到 processing=false 时自然清理 UI |
| `chatSessions.inProgressTurn` 与 broadcaster 双写不一致 | 已删除该字段，单一数据源，无不一致风险 |
