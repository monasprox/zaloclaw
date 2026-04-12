/**
 * Auto-Unsend — track outbound messages and allow recall.
 *
 * zca-js API:
 *   api.undo({ msgId, cliMsgId })
 *   - Only needs msgId + cliMsgId
 *   - Returns { status: number }
 *
 * Design:
 *   - Track outbound messages per thread: { msgId, cliMsgId, ts }
 *   - TTL 5 minutes — only recent messages can be undone
 *   - Max 100 threads tracked
 *   - Commands: /xoa, /undo, /recall, /delete
 */

import type { API } from "zca-js";

interface TrackedMessage {
  msgId: string;
  cliMsgId?: string;
  ts: number;
}

const outboundMessages = new Map<string, TrackedMessage[]>();
const TRACK_MAX_THREADS = 100;
const TRACK_TTL_MS = 5 * 60 * 1000; // 5 minutes

const UNDO_COMMANDS = new Set(["/xoa", "/undo", "/recall", "/delete"]);

/**
 * Check if a message text is an undo command.
 */
export function isUndoCommand(text: string): boolean {
  return UNDO_COMMANDS.has(text.trim().toLowerCase());
}

/**
 * Track an outbound message for later undo.
 */
export function trackOutboundMessage(threadId: string, msgId: string, cliMsgId?: string): void {
  if (!outboundMessages.has(threadId)) {
    outboundMessages.set(threadId, []);
  }
  const list = outboundMessages.get(threadId)!;
  list.push({ msgId, cliMsgId, ts: Date.now() });

  // Prune expired entries
  const cutoff = Date.now() - TRACK_TTL_MS;
  while (list.length > 0 && list[0].ts < cutoff) list.shift();

  // Evict oldest thread if too many
  if (outboundMessages.size > TRACK_MAX_THREADS) {
    const oldest = outboundMessages.keys().next().value;
    if (oldest && oldest !== threadId) outboundMessages.delete(oldest);
  }
}

/**
 * Get the last outbound message for a thread (if within TTL).
 */
export function getLastOutbound(threadId: string): TrackedMessage | undefined {
  const list = outboundMessages.get(threadId);
  if (!list || list.length === 0) return undefined;
  const last = list[list.length - 1];
  if (Date.now() - last.ts > TRACK_TTL_MS) return undefined;
  return last;
}

/**
 * Undo the last outbound message in a thread.
 * Returns true if undo was sent, false if nothing to undo or error.
 */
export async function undoLastOutbound(api: API, threadId: string): Promise<boolean> {
  const last = getLastOutbound(threadId);
  if (!last) {
    console.log(`[auto-unsend] No recent message to undo for thread ${threadId}`);
    return false;
  }

  try {
    await api.undo({
      msgId: last.msgId,
      cliMsgId: last.cliMsgId ?? last.msgId,
    });
    // Remove from tracking after undo
    const list = outboundMessages.get(threadId);
    if (list) list.pop();
    return true;
  } catch (err) {
    console.warn(`[auto-unsend] Failed to undo:`, err);
    return false;
  }
}
