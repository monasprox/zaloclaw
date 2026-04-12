/**
 * Quote Reply — cache inbound messages and build quote objects.
 *
 * zca-js API:
 *   api.sendMessage({ msg: "text", quote: message }, threadId, type)
 *   - quote accepts full message object or SendMessageQuote type
 *   - SendMessageQuote: { content, msgType, propertyExt, uidFrom, msgId, cliMsgId, ts, ttl }
 *
 * Design:
 *   - Cache last inbound message per thread (for accurate quote)
 *   - Max 500 threads cached, LRU eviction
 *   - Quote is optional — if no cached message, send without quote
 */

interface CachedMessage {
  msgId: string;
  cliMsgId: string;
  content: unknown;
  msgType: number;
  uidFrom: string;
  ts: number;
  ttl: number;
  propertyExt?: Record<string, unknown>;
}

const lastInboundMessage = new Map<string, CachedMessage>();
const CACHE_MAX = 500;

/**
 * Cache an inbound message for later quoting.
 */
export function cacheInboundMessage(threadId: string, data: {
  msgId: string;
  cliMsgId: string;
  content: unknown;
  msgType?: number;
  uidFrom: string;
  ts: number;
  ttl?: number;
  propertyExt?: Record<string, unknown>;
}): void {
  // LRU eviction
  if (lastInboundMessage.size >= CACHE_MAX && !lastInboundMessage.has(threadId)) {
    const oldest = lastInboundMessage.keys().next().value;
    if (oldest) lastInboundMessage.delete(oldest);
  }
  lastInboundMessage.set(threadId, {
    msgId: data.msgId,
    cliMsgId: data.cliMsgId,
    content: data.content,
    msgType: data.msgType ?? 0,
    uidFrom: data.uidFrom,
    ts: data.ts,
    ttl: data.ttl ?? 0,
    propertyExt: data.propertyExt,
  });
}

/**
 * Get cached message for quoting. Returns undefined if no cached message.
 */
export function getQuoteForThread(threadId: string): CachedMessage | undefined {
  return lastInboundMessage.get(threadId);
}

/**
 * Build a SendMessageQuote-compatible object from cached message.
 */
export function buildQuote(threadId: string): object | undefined {
  const cached = getQuoteForThread(threadId);
  if (!cached) return undefined;
  return {
    msgId: cached.msgId,
    cliMsgId: cached.cliMsgId,
    content: cached.content,
    msgType: cached.msgType,
    uidFrom: cached.uidFrom,
    ts: cached.ts,
    ttl: cached.ttl,
    propertyExt: cached.propertyExt ?? {},
  };
}
