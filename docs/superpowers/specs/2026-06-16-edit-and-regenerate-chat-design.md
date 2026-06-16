# Edit-and-Regenerate for V1 Chat — Design

**Date**: 2026-06-16
**Status**: Draft (pending user review)
**Topic**: Chat UX upgrades → Edit & Regenerate
**Author**: brainstorm skill (3-question scope, 3-section design)

## Context

V1 is an open-source AI web app generator (v0.dev alternative). Its chat panel
streams AI responses that drive tool calls (write/edit files in a per-project
Docker container). Today there is no way to recover from a bad AI generation
short of manually editing files — once a message is sent, the user is locked
into its trajectory.

This spec adds the most-requested feature in Claude/ChatGPT-style tools:
**edit any past user message and regenerate from that point forward**, with
the project filesystem rolled back to match.

## Product Decisions (locked from brainstorm)

| Decision | Choice | Rationale |
|---|---|---|
| Scope (focus area) | Chat UX upgrades | Highest daily-use impact, lowest risk |
| Specific feature | Edit & Regenerate | Universal top-requested feature |
| Post-edit semantics | **Truncate & regenerate** | Cleanest mental model; matches Claude.ai/ChatGPT |
| Filesystem behavior | **Auto-rollback** to snapshot at edit point | Chat is source of truth for files |
| Snapshot implementation | **Host-side tarball** (`docker exec tar`) | Simple, robust, host survives container recreate |

## Architecture & Data Flow

### Existing message lifecycle (unchanged)

1. Frontend `POST /chat/:containerId/messages` with `{role: "user", content}`
2. Backend streams AI response via SSE
3. AI makes tool calls that write/edit files in the container
4. Backend appends final `{role: "assistant", content, toolCalls}` to
   `session.messages` (persisted on host under `data/sessions/{containerId}.json`)

### New: snapshot capture (passive, on the existing path)

After step 2 (AI loop begins), BEFORE the first tool call, the backend
captures a tarball of the container's `/app` directory:

```
data/snapshots/{containerId}/{messageId}.tar.gz
```

The user-message `messageId` (the message that triggered this AI run) is the
snapshot key. The tarball **excludes** `node_modules`, `.next`, `.git`,
`.turbo` (re-buildable, would otherwise bloat snapshots ~10x).

The new field `snapshotId?: string` is persisted on the user-message row in
`session.messages` when the capture completes.

### New: edit-and-regenerate flow

```
[User clicks Edit on user message N]
        │
        ▼
PATCH /chat/:containerId/messages/:messageId
  Body: { content: "new prompt" }
        │
        ▼
[Backend orchestration — all inside withProjectLock(containerId)]
  1. Lookup target message + its snapshotId
  2. restoreSnapshot(containerId, snapshotId)
       cat data/snapshots/{cid}/{snap}.tar.gz
         | docker exec -i {container} tar xzf - -C /app
  3. Truncate session.messages to indices [0..N], drop [N+1..]
  4. Update session.messages[N].content = newContent
  5. Persist updated session.messages
  6. Run AI loop again from index N+1, streaming SSE on the PATCH response
        │
        ▼
[Frontend reuses useChatStream — same code path as fresh POST]
```

### Snapshot directory contract

- Location: `data/snapshots/{containerId}/{messageId}.tar.gz`
- Format: gzipped tar, root = `/app` (paths inside tar are relative to `/app`)
- Created by: backend after AI loop begins, before first tool call
- Read by: PATCH endpoint during restore
- Deleted by: `pruneSnapshots()` after a configurable number (default 20)

## API Contract

### New endpoint

```
PATCH /chat/:containerId/messages/:messageId
```

**Path params:**
- `containerId`: string (UUID)
- `messageId`: string (must match a user-role message in `session.messages`)

**Body:**
```ts
{ content: string }   // new prompt text; non-empty; max length matches existing POST
```

**Response:** Server-Sent Events stream — same shape as
`POST /chat/:containerId/messages`. The first event is a synthetic
`message_start` event for the new AI message; subsequent events are
identical to a fresh chat stream.

**Status codes:**

| Code | When |
|---|---|
| 200 | SSE stream opens successfully (status of regen is in stream events) |
| 400 | `content` empty, `messageId` not a user-role message, edit index out of range |
| 404 | containerId not found, OR messageId not found in session |
| 409 | `edit_in_progress` — another edit (or POST) is running; client retries |
| 409 | `stream_in_progress` — AI stream for current message still in flight; client waits for end |
| 410 | `snapshot_gone` — snapshot tarball was pruned; UI shows "Cannot undo past 20 messages" banner |
| 500 | restore failed (corrupt tarball, container died); session truncation rolled back |

### Modified endpoints

- `POST /chat/:containerId/messages` — gains snapshot capture as the AI
  loop begins. The capture happens BEFORE the first tool call. Capture
  failures are logged but do NOT block the AI loop (degraded — edits
  against this message will return 410).
- `GET /chat/:containerId/messages` — no change to response shape;
  messages with successful captures carry `snapshotId` field.

### New helper endpoint (optional, for debugging / future UI)

```
GET /chat/:containerId/snapshots
  Response: { snapshots: Array<{ messageId: string, sizeBytes: number, capturedAt: string }> }
```

Not required for v1; included for completeness. Optional to ship.

## Components

### New backend service: `backend/src/services/snapshots.ts`

```ts
captureSnapshot(containerId: string, messageId: string): Promise<void>
  // docker exec {containerId} tar czf - \
  //   --exclude=node_modules --exclude=.next --exclude=.git --exclude=.turbo \
  //   -C /app . > data/snapshots/{containerId}/{messageId}.tar.gz

restoreSnapshot(containerId: string, messageId: string): Promise<void>
  // cat data/snapshots/{containerId}/{messageId}.tar.gz \
  //   | docker exec -i {containerId} tar xzf - -C /app

listSnapshots(containerId: string): Promise<string[]>
  // returns messageIds that have tarballs on disk

pruneSnapshots(containerId: string, keepLast: number = 20): Promise<void>
  // sorts by messageId (UUID v4, lexically monotonic-ish), keeps last N
  // removes older tarballs AND clears snapshotId on session.messages rows

deleteSnapshot(containerId: string, messageId: string): Promise<void>
  // removes a single tarball; used by prune and on disconnect
```

### Modified: `backend/src/routes/chat.ts`

- Wrap the AI loop in `try/finally` that calls `captureSnapshot` before the
  loop body runs. Set `session.messages[N].snapshotId = messageId` after
  successful capture.
- Add PATCH route handler. Acquires `withProjectLock(containerId)` from
  `services/locks.ts` (IMPL-001 — same primitive used by GitHub push).
- Inside the lock: restore → truncate → persist → run AI loop → stream SSE.
- **POST `/chat/:containerId/messages` MUST also acquire `withProjectLock(containerId)`** —
  this serializes PATCH against in-flight AI loops. Without it, a PATCH
  arriving during a streaming AI response could race the snapshot capture.
  This is a behavioral change to POST: any existing direct session mutation
  moves inside the lock.

### Modified: `backend/src/services/locks.ts`

No changes required — `withProjectLock` and `withProjectMutex` from IMPL-001
already serialize per-container writes. The PATCH route reuses the same
`withProjectLock(containerId, async () => ...)` shape.

### New frontend component: `frontend/src/app/editor/components/MessageBubble.tsx`

- Existing `MessageBubble` gains an `onEdit` callback prop
- Edit mode replaces message text with a `<textarea>` (autoFocus, autosize)
- Save / Cancel buttons; Save calls the parent-supplied `onSave(newContent)`
- Cancel reverts text without API call
- Only user-role messages render the Edit button (assistant messages cannot
  be edited — they are AI output)

### Modified: chat panel container

- Wires `MessageBubble.onSave` to call `PATCH /chat/{containerId}/messages/{id}`
- Reuses the existing `useChatStream` hook to consume the SSE response
- Shows toast: `"Regenerating from message N…"` on edit submit; replaces with
  success or error toast as the stream resolves

## Data Model

### `session.messages[i]` — new optional field

```ts
interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  // NEW:
  snapshotId?: string;   // present on user messages after a successful capture
}
```

`snapshotId` is `undefined` for:
- Assistant messages (AI output, not regenerable)
- Tool messages
- User messages whose capture failed (degraded mode — edit will return 410)

### Snapshot storage

```
data/
├── projects.json                    # existing
├── sessions/{containerId}.json      # existing chat history
└── snapshots/{containerId}/{messageId}.tar.gz   # NEW
```

Storage budget: 20 snapshots × ~10 MB = ~200 MB per project. Snapshots
average smaller in practice (most messages edit ≤ 5 files).

## Error Handling

| Failure | Response | User-visible behavior |
|---|---|---|
| Edit during active AI stream | 409 `stream_in_progress` | Toast: "Wait for current response to finish" |
| Edit during another tab's edit | 409 `edit_in_progress` | Toast: "Another edit in progress — retry shortly" |
| Snapshot pruned (older than 20 messages) | 410 `snapshot_gone` | Banner: "Cannot undo past 20 messages" |
| Restore fails (corrupt tarball, container down) | 500 `restore_failed` | Toast: "Could not restore files — chat refreshed without file rollback"; session NOT truncated (atomicity preserved) |
| Container missing | 404 `container_not_found` | Standard 404 page |
| AI loop during regen errors | Stream `error` event | Same as current error UX; message saved with `status: "error"` |
| Capture failure on POST | (logged, not surfaced) | Edit later returns 410; user warned in PATCH response only if they try |

**Capture-restore atomicity invariant:** snapshot restore must complete
SUCCESSFULLY before `session.messages` is truncated. If restore throws,
the truncation is skipped and the user sees their original chat intact.

## Edge Cases

1. **Edit message 0** (the very first user message): `snapshotId` exists
   (captured when AI first ran); restore succeeds (filesystem was in
   pre-AI state by definition); regen rebuilds from scratch.
2. **Snapshot excludes build artifacts**: tar command excludes
   `node_modules`, `.next`, `.git`, `.turbo` (re-buildable). Restore
   leaves these directories untouched (they keep their current state).
   Trade-off: if the AI's edits modified `package.json`, the npm install
   that ran during the original AI session is NOT re-run after restore —
   the user must re-trigger npm install manually. **v1 accepts this trade**;
   future v2 may add an `auto_install_on_restore` flag.
3. **Concurrent edits in two tabs**: `withProjectLock` serializes. Second
   tab gets 409; on retry, it operates on the first tab's updated state.
4. **Edit while streaming message N+1 (different user message)**: blocked
   by `stream_in_progress` because the lock is held by the streaming POST.
5. **Edit while a previous AI run is still streaming**: `withProjectLock`
   serializes this. PATCH waits for the POST's lock; by the time PATCH
   acquires the lock, the snapshot is already captured (success or
   logged failure). If capture failed, `snapshotId` is undefined and
   PATCH returns 410 `snapshot_gone`. There is no path where PATCH
   observes a user message with `snapshotId=undefined` that is NOT
   a capture-failure case.
6. **Snapshot pruning interaction with edit**: prune runs after each new
   capture, deleting the oldest snapshots beyond `keepLast=20`. A user
   who edited message N (older than 20 messages) gets 410 with a banner.
   The session.messages row's `snapshotId` field is cleared on prune.

## Testing Strategy

### Unit tests (`backend/src/services/__tests__/snapshots.test.ts`)

- `captureSnapshot` writes a tarball to disk with correct shape
- `restoreSnapshot` round-trip preserves file contents (using temp dir)
- `restoreSnapshot` excludes `node_modules` (assert no node_modules in tar)
- `pruneSnapshots` keeps last N by messageId ordering
- `listSnapshots` returns only existing tarballs
- Capture failure (no container, missing docker) logs but does not throw
  to caller

### Integration tests (`backend/src/routes/__tests__/chat-edit.test.ts`)

- PATCH on existing user message:
  - Asserts `restoreSnapshot` called BEFORE session truncation (spy on order)
  - Asserts `session.messages` is truncated correctly
  - Asserts AI loop invoked starting from editIndex+1
  - Asserts SSE response shape matches POST /messages
- PATCH returns 400 on empty content / non-user role / out-of-range
- PATCH returns 404 on unknown containerId / messageId
- PATCH returns 409 when stream_in_progress
- PATCH returns 410 when snapshot tarball is missing
- PATCH returns 500 and does NOT truncate session on restore failure
  (atomicity test)
- PATCH inside `withProjectLock` — assert second PATCH is serialized
  (second waits for first to complete)
- Snapshot capture on POST /messages — assert tarball exists after first
  AI tool call; assert message.snapshotId is set

### E2E tests (`frontend/e2e/edit-and-regenerate.spec.ts`)

- Real browser flow: create project → send prompt → AI writes files →
  user clicks Edit on the user message → modifies text → Save → assert
  files in live preview revert to pre-AI state → AI re-streams new
  response → files update again
- Edit Cancel reverts text, no API call (assert via network spy)
- Edit on too-old message shows "Cannot undo past 20 messages" banner
- Two-tab edit race: tab 2 sees toast "Another edit in progress"

## Out of Scope (deferred)

- **Branch conversations** (parallel exploration from one message) —
  deferred to v2. Reuses snapshot infrastructure but adds branching UI.
- **Regenerate single tool call** — deferred; v1 granularity = full
  user message.
- **Message-level feedback (👍/👎)** — deferred; separate feature.
- **Auto-rerun npm install after restore** — deferred; user can re-trigger.
- **Storage budget configuration UI** — default 20 snapshots is fixed in v1.

## Open Questions

None. All major decisions are locked from the brainstorm session.

## References

- Existing: `backend/src/routes/chat.ts` (POST /messages, GET /messages)
- Existing: `backend/src/services/locks.ts` (withProjectLock from IMPL-001)
- Existing: `backend/src/services/llm.ts` (AI loop + tool calling)
- Decision: brainstorm session 2026-06-16 (3-question scope, 3-section design)
