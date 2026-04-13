/**
 * In-memory msgId → cliMsgId mapping for reaction/undo lookups.
 * The agent only knows msgId; cliMsgId is internal to zca-js.
 * LRU eviction at 500 entries, TTL 30 minutes.
 */

interface MsgEntry {
  cliMsgId: string;
  threadId: string;
  isGroup: boolean;
  ts: number;
}

const store = new Map<string, MsgEntry>();
const MAX_ENTRIES = 500;
const TTL_MS = 30 * 60 * 1000;

export function recordMsgId(
  msgId: string,
  cliMsgId: string,
  threadId: string,
  isGroup: boolean,
): void {
  if (!msgId || !cliMsgId) return;
  // Evict expired
  if (store.size > MAX_ENTRIES) {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of store) {
      if (v.ts < cutoff) store.delete(k);
    }
  }
  // Evict oldest if still over limit
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(msgId, { cliMsgId, threadId, isGroup, ts: Date.now() });
}

export function lookupCliMsgId(msgId: string): MsgEntry | undefined {
  const entry = store.get(msgId);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > TTL_MS) {
    store.delete(msgId);
    return undefined;
  }
  return entry;
}
