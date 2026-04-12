/**
 * Read Receipt Tracking — track when messages are seen.
 *
 * zca-js listener: api.listener.on("seen_messages", callback)
 * Note: This is for awareness only — not for gating behavior.
 *
 * Tracks: { threadId → { seenBy, seenAt } }
 */

interface ReadReceipt {
  seenBy: string[];
  seenAt: number;
}

const readReceipts = new Map<string, ReadReceipt>();
const MAX_THREADS = 200;

/**
 * Record a read receipt event.
 */
export function recordReadReceipt(threadId: string, seenBy: string | string[]): void {
  const users = Array.isArray(seenBy) ? seenBy : [seenBy];

  // LRU eviction
  if (readReceipts.size >= MAX_THREADS && !readReceipts.has(threadId)) {
    const oldest = readReceipts.keys().next().value;
    if (oldest) readReceipts.delete(oldest);
  }

  const existing = readReceipts.get(threadId);
  if (existing) {
    const newUsers = users.filter((u) => !existing.seenBy.includes(u));
    existing.seenBy.push(...newUsers);
    existing.seenAt = Date.now();
  } else {
    readReceipts.set(threadId, { seenBy: users, seenAt: Date.now() });
  }
}

/**
 * Get read receipt for a thread.
 */
export function getReadReceipt(threadId: string): ReadReceipt | undefined {
  return readReceipts.get(threadId);
}

/**
 * Check if a specific user has seen messages in a thread.
 */
export function hasUserSeen(threadId: string, userId: string): boolean {
  const receipt = readReceipts.get(threadId);
  return receipt ? receipt.seenBy.includes(userId) : false;
}
