import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ThreadMessageQueue } from "../src/channel/thread-queue.js";

describe("ThreadMessageQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("processes a single message", async () => {
    const processed: string[] = [];
    const queue = new ThreadMessageQueue<string>({
      handler: async (data) => {
        processed.push(data);
      },
    });
    queue.enqueue("t1", "hello");
    // Allow microtask to resolve
    await vi.waitFor(() => expect(processed).toEqual(["hello"]));
  });

  it("processes messages sequentially per thread", async () => {
    const order: string[] = [];
    let resolve1!: () => void;
    const blocker1 = new Promise<void>((r) => { resolve1 = r; });

    const queue = new ThreadMessageQueue<string>({
      maxConcurrent: 4,
      handler: async (data) => {
        if (data === "msg-1") await blocker1;
        order.push(data);
      },
    });

    queue.enqueue("t1", "msg-1");
    queue.enqueue("t1", "msg-2");
    queue.enqueue("t1", "msg-3");

    // msg-1 is processing; msg-2, msg-3 are queued
    expect(queue.activeCount).toBe(1);
    expect(queue.pendingCount).toBe(2);

    // Release msg-1
    resolve1();

    // All should process in order
    await vi.waitFor(() => expect(order).toEqual(["msg-1", "msg-2", "msg-3"]));
  });

  it("processes different threads concurrently up to maxConcurrent", async () => {
    const started: string[] = [];
    const resolvers = new Map<string, () => void>();

    const queue = new ThreadMessageQueue<string>({
      maxConcurrent: 2,
      handler: async (data) => {
        started.push(data);
        await new Promise<void>((r) => resolvers.set(data, r));
      },
    });

    queue.enqueue("t1", "a");
    queue.enqueue("t2", "b");
    queue.enqueue("t3", "c");

    // Wait for the first two to start
    await vi.waitFor(() => expect(started.length).toBe(2));
    expect(started).toEqual(["a", "b"]);
    expect(queue.activeCount).toBe(2);

    // Thread 3 is pending due to concurrency limit
    expect(queue.pendingCount).toBeGreaterThanOrEqual(1);

    // Complete thread 1 → thread 3 should start
    resolvers.get("a")!();
    await vi.waitFor(() => expect(started).toContain("c"));
    expect(queue.activeCount).toBe(2); // b still running, c just started

    resolvers.get("b")!();
    resolvers.get("c")!();
    await vi.waitFor(() => expect(queue.activeCount).toBe(0));
  });

  it("drops oldest message when per-thread queue overflows", async () => {
    const dropped: string[] = [];
    let blockResolve!: () => void;
    const block = new Promise<void>((r) => { blockResolve = r; });

    const queue = new ThreadMessageQueue<string>({
      maxConcurrent: 1,
      maxPerThread: 3,
      handler: async (data) => {
        if (data === "msg-0") await block;
      },
      onDrop: (_threadId, entry) => {
        dropped.push(entry.data);
      },
    });

    // msg-0 starts processing
    queue.enqueue("t1", "msg-0");
    await vi.waitFor(() => expect(queue.activeCount).toBe(1));

    // Fill the queue (maxPerThread=3)
    queue.enqueue("t1", "msg-1");
    queue.enqueue("t1", "msg-2");
    queue.enqueue("t1", "msg-3");
    expect(queue.pendingCount).toBe(3);

    // Overflow: msg-1 (oldest pending) should be dropped
    queue.enqueue("t1", "msg-4");
    expect(dropped).toEqual(["msg-1"]);
    expect(queue.pendingCount).toBe(3); // still 3 (msg-2, msg-3, msg-4)

    blockResolve();
  });

  it("skips stale messages at dequeue time", async () => {
    const processed: string[] = [];
    const stale: string[] = [];
    let blockResolve!: () => void;
    const block = new Promise<void>((r) => { blockResolve = r; });

    const queue = new ThreadMessageQueue<string>({
      maxConcurrent: 1,
      maxAgeMs: 10_000, // 10 seconds
      handler: async (data) => {
        if (data === "first") await block;
        processed.push(data);
      },
      onStale: (_threadId, entry) => {
        stale.push(entry.data);
      },
    });

    // Manually set old enqueuedAt by enqueuing then advancing the reference
    const realNow = Date.now;
    let fakeTime = Date.now();

    queue.enqueue("t1", "first");

    // Enqueue "queued-old" at current time
    queue.enqueue("t1", "queued-old");

    // Override Date.now to simulate time passing
    Date.now = () => fakeTime + 15_000;

    // Add a fresh message (its enqueuedAt will be in the "future" = current faked time)
    queue.enqueue("t1", "queued-fresh");

    // Release the first message so the queue drains
    blockResolve();

    await vi.waitFor(() => expect(processed).toContain("queued-fresh"));

    // queued-old should have been skipped as stale
    expect(stale).toContain("queued-old");
    expect(processed).not.toContain("queued-old");

    // Restore Date.now
    Date.now = realNow;
  });

  it("fires onTimeout for slow processing", async () => {
    vi.useFakeTimers();
    const timeouts: string[] = [];

    const queue = new ThreadMessageQueue<string>({
      maxConcurrent: 1,
      processingTimeoutMs: 5_000,
      handler: async () => {
        // Never resolves (simulates stuck handler)
        await new Promise<void>(() => {});
      },
      onTimeout: (threadId) => {
        timeouts.push(threadId);
      },
    });

    queue.enqueue("t1", "stuck-msg");

    // Advance past timeout
    vi.advanceTimersByTime(6_000);

    await vi.waitFor(() => expect(timeouts).toEqual(["t1"]));

    vi.useRealTimers();
  });

  it("fires onError when handler throws", async () => {
    const errors: Array<{ threadId: string; error: unknown }> = [];

    const queue = new ThreadMessageQueue<string>({
      handler: async (data) => {
        if (data === "bad") throw new Error("test error");
      },
      onError: (threadId, error) => {
        errors.push({ threadId, error });
      },
    });

    queue.enqueue("t1", "bad");
    await vi.waitFor(() => expect(errors.length).toBe(1));
    expect(errors[0].threadId).toBe("t1");
    expect((errors[0].error as Error).message).toBe("test error");
  });

  it("continues processing next messages after error", async () => {
    const processed: string[] = [];
    const errors: string[] = [];

    const queue = new ThreadMessageQueue<string>({
      handler: async (data) => {
        if (data === "bad") throw new Error("boom");
        processed.push(data);
      },
      onError: (threadId) => {
        errors.push(threadId);
      },
    });

    queue.enqueue("t1", "bad");
    queue.enqueue("t1", "good");

    await vi.waitFor(() => expect(processed).toEqual(["good"]));
    expect(errors).toEqual(["t1"]);
  });

  it("cleans up idle thread state", async () => {
    const queue = new ThreadMessageQueue<string>({
      handler: async () => {},
    });

    queue.enqueue("t1", "msg");
    await vi.waitFor(() => expect(queue.activeCount).toBe(0));

    // Internal thread state should be cleaned up
    const stats = queue.threadStats();
    expect(stats.size).toBe(0);
  });

  it("reports correct threadStats while processing", async () => {
    let blockResolve!: () => void;
    const block = new Promise<void>((r) => { blockResolve = r; });

    const queue = new ThreadMessageQueue<string>({
      maxConcurrent: 4,
      handler: async (data) => {
        if (data === "a") await block;
      },
    });

    queue.enqueue("t1", "a");
    queue.enqueue("t1", "b");
    queue.enqueue("t2", "c");

    await vi.waitFor(() => expect(queue.activeCount).toBeGreaterThanOrEqual(1));

    const stats = queue.threadStats();
    const t1 = stats.get("t1");
    expect(t1?.processing).toBe(true);
    expect(t1?.pending).toBe(1); // "b" is pending

    blockResolve();
  });

  it("handles default maxConcurrent=1 correctly (global serial)", async () => {
    const order: string[] = [];
    const resolvers = new Map<string, () => void>();

    const queue = new ThreadMessageQueue<string>({
      // Default maxConcurrent=1
      handler: async (data) => {
        order.push(`start:${data}`);
        await new Promise<void>((r) => resolvers.set(data, r));
        order.push(`end:${data}`);
      },
    });

    queue.enqueue("t1", "a");
    queue.enqueue("t2", "b");

    await vi.waitFor(() => expect(order).toContain("start:a"));
    expect(order).not.toContain("start:b"); // b should be waiting for concurrency slot
    expect(queue.activeCount).toBe(1);

    resolvers.get("a")!();
    await vi.waitFor(() => expect(order).toContain("start:b"));

    resolvers.get("b")!();
    await vi.waitFor(() => expect(queue.activeCount).toBe(0));
    expect(order).toEqual(["start:a", "end:a", "start:b", "end:b"]);
  });

  it("pending threads are drained in FIFO order", async () => {
    const started: string[] = [];
    const resolvers = new Map<string, () => void>();

    const queue = new ThreadMessageQueue<string>({
      maxConcurrent: 1,
      handler: async (data) => {
        started.push(data);
        await new Promise<void>((r) => resolvers.set(data, r));
      },
    });

    queue.enqueue("t1", "first");
    queue.enqueue("t2", "second");
    queue.enqueue("t3", "third");

    await vi.waitFor(() => expect(started).toEqual(["first"]));

    resolvers.get("first")!();
    await vi.waitFor(() => expect(started.length).toBe(2));
    expect(started[1]).toBe("second"); // FIFO: t2 was enqueued before t3

    resolvers.get("second")!();
    await vi.waitFor(() => expect(started.length).toBe(3));
    expect(started[2]).toBe("third");

    resolvers.get("third")!();
  });

  it("enqueue returns true even when message is accepted after drop", () => {
    let blockResolve!: () => void;
    new Promise<void>((r) => { blockResolve = r; });

    const queue = new ThreadMessageQueue<string>({
      maxConcurrent: 1,
      maxPerThread: 1,
      handler: async () => {
        await new Promise<void>(() => {}); // never resolves
      },
    });

    queue.enqueue("t1", "processing");
    // Queue is now full (maxPerThread=1) after adding one pending
    const result = queue.enqueue("t1", "overflow-but-accepted");
    expect(result).toBe(true);

    blockResolve();
  });

  it("_reset clears all state", async () => {
    const queue = new ThreadMessageQueue<string>({
      handler: async () => {
        await new Promise<void>(() => {}); // never resolves
      },
    });

    queue.enqueue("t1", "a");
    queue.enqueue("t2", "b");
    queue.enqueue("t1", "c");

    queue._reset();
    expect(queue.activeCount).toBe(0);
    expect(queue.pendingCount).toBe(0);
    expect(queue.threadStats().size).toBe(0);
  });
});
