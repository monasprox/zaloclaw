import { describe, it, expect, beforeEach, vi } from "vitest";
import { _isDuplicateMsg as isDuplicateMsg, _processedMsgIds as processedMsgIds } from "../src/channel/monitor.js";

describe("isDuplicateMsg", () => {
  beforeEach(() => {
    processedMsgIds.clear();
  });

  it("returns false for the first occurrence of a msgId", () => {
    expect(isDuplicateMsg("msg-1")).toBe(false);
  });

  it("returns true for the second occurrence of the same msgId", () => {
    expect(isDuplicateMsg("msg-1")).toBe(false);
    expect(isDuplicateMsg("msg-1")).toBe(true);
  });

  it("returns false for undefined/empty msgId (no dedup)", () => {
    expect(isDuplicateMsg(undefined)).toBe(false);
    expect(isDuplicateMsg(undefined)).toBe(false);
  });

  it("tracks different msgIds independently", () => {
    expect(isDuplicateMsg("msg-1")).toBe(false);
    expect(isDuplicateMsg("msg-2")).toBe(false);
    expect(isDuplicateMsg("msg-1")).toBe(true);
    expect(isDuplicateMsg("msg-2")).toBe(true);
    expect(isDuplicateMsg("msg-3")).toBe(false);
  });

  it("evicts expired entries when cache is at capacity", () => {
    vi.useFakeTimers();
    try {
      // Fill cache to DEDUP_MAX (2000)
      for (let i = 0; i < 2000; i++) {
        isDuplicateMsg(`fill-${i}`);
      }
      expect(processedMsgIds.size).toBe(2000);

      // Advance time past TTL (60s)
      vi.advanceTimersByTime(61_000);

      // Adding a new entry should trigger eviction of expired ones
      expect(isDuplicateMsg("new-msg")).toBe(false);
      // All old entries should have been evicted (expired) + new one added
      expect(processedMsgIds.size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts oldest entry when cache is full and nothing is expired", () => {
    // Fill cache to DEDUP_MAX
    for (let i = 0; i < 2000; i++) {
      isDuplicateMsg(`fill-${i}`);
    }
    expect(processedMsgIds.size).toBe(2000);

    // Adding new entry at capacity should evict oldest
    expect(isDuplicateMsg("overflow-msg")).toBe(false);
    expect(processedMsgIds.has("overflow-msg")).toBe(true);
    // The first entry should have been evicted
    expect(processedMsgIds.has("fill-0")).toBe(false);
  });
});
