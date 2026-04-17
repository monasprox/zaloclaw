/**
 * Per-thread message queue with global concurrency control.
 *
 * Modeled after the concurrency sink pattern used in openclaw/telegram
 * (@grammyjs/runner with `sink.concurrency`). Ensures:
 *
 * 1. **Per-thread serial processing** — only one message processes at a time
 *    per conversation thread, preventing the agent from seeing a "queued
 *    messages while agent was busy" dump.
 * 2. **Global concurrency limit** — at most N threads process simultaneously
 *    to avoid overloading the agent runtime.
 * 3. **Queue-depth limit** — oldest messages are dropped when a per-thread
 *    queue overflows (prevents unbounded memory growth).
 * 4. **Stale-message skip** — messages older than a configurable threshold
 *    are silently discarded so the agent doesn't reply to ancient inputs.
 * 5. **Processing timeout** — a stuck `processMessage` call is abandoned
 *    after a deadline so the thread can continue draining.
 */

export type ThreadQueueEntry<T> = {
  data: T;
  threadId: string;
  enqueuedAt: number;
};

export type ThreadQueueOptions<T> = {
  /** Maximum threads processing simultaneously. Default: 1 */
  maxConcurrent?: number;
  /** Maximum pending messages per thread (oldest dropped on overflow). Default: 10 */
  maxPerThread?: number;
  /** Messages older than this (ms) are skipped at dequeue time. Default: 5 min */
  maxAgeMs?: number;
  /** Per-message processing timeout (ms). Default: 3 min */
  processingTimeoutMs?: number;
  /** Called when a message is dropped because the per-thread queue is full. */
  onDrop?: (threadId: string, dropped: ThreadQueueEntry<T>) => void;
  /** Called when processing a message exceeds the timeout. */
  onTimeout?: (threadId: string) => void;
  /** Called when processing throws an error. */
  onError?: (threadId: string, error: unknown) => void;
  /** Called when a stale message is skipped. */
  onStale?: (threadId: string, entry: ThreadQueueEntry<T>) => void;
  /** The handler that processes each message. */
  handler: (data: T) => Promise<void>;
};

const DEFAULT_MAX_CONCURRENT = 1;
const DEFAULT_MAX_PER_THREAD = 10;
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_PROCESSING_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

type PerThreadState<T> = {
  queue: Array<ThreadQueueEntry<T>>;
  processing: boolean;
};

export class ThreadMessageQueue<T> {
  readonly #maxConcurrent: number;
  readonly #maxPerThread: number;
  readonly #maxAgeMs: number;
  readonly #processingTimeoutMs: number;
  readonly #handler: (data: T) => Promise<void>;
  readonly #onDrop?: (threadId: string, dropped: ThreadQueueEntry<T>) => void;
  readonly #onTimeout?: (threadId: string) => void;
  readonly #onError?: (threadId: string, error: unknown) => void;
  readonly #onStale?: (threadId: string, entry: ThreadQueueEntry<T>) => void;

  readonly #threads = new Map<string, PerThreadState<T>>();
  #activeCount = 0;
  /** Threads waiting for a global concurrency slot (FIFO). */
  readonly #pendingThreads: string[] = [];

  constructor(options: ThreadQueueOptions<T>) {
    this.#maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
    this.#maxPerThread = options.maxPerThread ?? DEFAULT_MAX_PER_THREAD;
    this.#maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.#processingTimeoutMs = options.processingTimeoutMs ?? DEFAULT_PROCESSING_TIMEOUT_MS;
    this.#handler = options.handler;
    this.#onDrop = options.onDrop;
    this.#onTimeout = options.onTimeout;
    this.#onError = options.onError;
    this.#onStale = options.onStale;
  }

  /** Enqueue a message for processing. Returns true if accepted, false if dropped. */
  enqueue(threadId: string, data: T): boolean {
    let state = this.#threads.get(threadId);
    if (!state) {
      state = { queue: [], processing: false };
      this.#threads.set(threadId, state);
    }

    const entry: ThreadQueueEntry<T> = {
      data,
      threadId,
      enqueuedAt: Date.now(),
    };

    if (state.queue.length >= this.#maxPerThread) {
      // Drop the oldest pending message (front of queue)
      const dropped = state.queue.shift()!;
      this.#onDrop?.(threadId, dropped);
    }

    state.queue.push(entry);
    this.#tryDrain(threadId);
    return true;
  }

  /** Number of threads currently processing a message. */
  get activeCount(): number {
    return this.#activeCount;
  }

  /** Total number of messages pending across all threads. */
  get pendingCount(): number {
    let total = 0;
    for (const state of this.#threads.values()) {
      total += state.queue.length;
    }
    return total;
  }

  /** Number of threads that have pending messages. */
  get pendingThreadCount(): number {
    let count = 0;
    for (const state of this.#threads.values()) {
      if (state.queue.length > 0) count++;
    }
    return count;
  }

  /** Snapshot of per-thread queue depths. */
  threadStats(): Map<string, { pending: number; processing: boolean }> {
    const result = new Map<string, { pending: number; processing: boolean }>();
    for (const [id, state] of this.#threads) {
      if (state.queue.length > 0 || state.processing) {
        result.set(id, { pending: state.queue.length, processing: state.processing });
      }
    }
    return result;
  }

  /** Attempt to start processing the next message for `threadId`. */
  #tryDrain(threadId: string): void {
    const state = this.#threads.get(threadId);
    if (!state || state.processing || state.queue.length === 0) return;

    // Global concurrency gate
    if (this.#activeCount >= this.#maxConcurrent) {
      if (!this.#pendingThreads.includes(threadId)) {
        this.#pendingThreads.push(threadId);
      }
      return;
    }

    this.#processNext(threadId, state);
  }

  /** Pop the next non-stale message from the thread queue and process it. */
  #processNext(threadId: string, state: PerThreadState<T>): void {
    const now = Date.now();

    // Skip stale messages
    while (state.queue.length > 0) {
      const next = state.queue[0];
      if (now - next.enqueuedAt > this.#maxAgeMs) {
        state.queue.shift();
        this.#onStale?.(threadId, next);
        continue;
      }
      break;
    }

    if (state.queue.length === 0) {
      this.#cleanupThread(threadId);
      return;
    }

    const entry = state.queue.shift()!;
    state.processing = true;
    this.#activeCount++;

    // Wrap handler with timeout
    const timeoutPromise = new Promise<"timeout">((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), this.#processingTimeoutMs);
      // Allow Node.js to exit even if this timer is pending
      if (typeof timer === "object" && "unref" in timer) {
        (timer as NodeJS.Timeout).unref();
      }
    });

    const handlerPromise = this.#handler(entry.data)
      .then(() => "done" as const)
      .catch((err) => {
        this.#onError?.(threadId, err);
        return "error" as const;
      });

    void Promise.race([handlerPromise, timeoutPromise]).then((result) => {
      if (result === "timeout") {
        this.#onTimeout?.(threadId);
      }

      state.processing = false;
      this.#activeCount--;

      // Continue draining this thread
      if (state.queue.length > 0) {
        this.#tryDrain(threadId);
      } else {
        this.#cleanupThread(threadId);
      }

      // Unblock a pending thread
      this.#drainPendingThread();
    });
  }

  /** Remove empty, idle thread state to prevent unbounded Map growth. */
  #cleanupThread(threadId: string): void {
    const state = this.#threads.get(threadId);
    if (state && !state.processing && state.queue.length === 0) {
      this.#threads.delete(threadId);
    }
  }

  /** Start processing for the next thread waiting for a concurrency slot. */
  #drainPendingThread(): void {
    while (this.#pendingThreads.length > 0 && this.#activeCount < this.#maxConcurrent) {
      const nextThreadId = this.#pendingThreads.shift()!;
      const state = this.#threads.get(nextThreadId);
      if (state && !state.processing && state.queue.length > 0) {
        this.#processNext(nextThreadId, state);
        return;
      }
      // Thread was cleaned up or already processing; try next
    }
  }

  /** Clear all queues and reset state. For testing only. */
  _reset(): void {
    this.#threads.clear();
    this.#pendingThreads.length = 0;
    this.#activeCount = 0;
  }
}
