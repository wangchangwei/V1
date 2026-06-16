// Per-project serialization lock.
//
// Each project (a.k.a. container) gets a FIFO queue. Callers of
// `withProjectLock(projectId, fn)` wait until the queue drains, then
// run `fn` to completion before the next waiter is released.
//
// Used to serialize mutating operations on the same container so that,
// e.g., a POST /messages run and a PATCH /messages/:id edit don't
// interleave their filesystem mutations.
//
// Pure in-memory implementation. Suitable for a single-process Node
// server; not safe across multiple processes.

const projectQueues = new Map<string, Promise<unknown>>();

export async function withProjectLock<T>(
  projectId: string,
  fn: () => Promise<T>
): Promise<T> {
  const previous = projectQueues.get(projectId) ?? Promise.resolve();

  let release: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const next = previous.then(() => gate);
  // Swallow rejections from previous so a single failure doesn't poison
  // the queue for subsequent waiters.
  const stored = next.catch(() => {});
  projectQueues.set(projectId, stored);

  await previous;
  try {
    return await fn();
  } finally {
    release!();
    // Drop the map entry if no later waiter has appended to it.
    queueMicrotask(() => {
      if (projectQueues.get(projectId) === stored) {
        projectQueues.delete(projectId);
      }
    });
  }
}
