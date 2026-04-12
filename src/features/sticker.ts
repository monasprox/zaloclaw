/**
 * Zalo Sticker — search, cache, and send real Zalo stickers.
 *
 * zca-js API flow (3 steps):
 *   1. api.getStickers(keyword)       → number[] (sticker IDs)
 *   2. api.getStickersDetail(id)      → StickerDetail[] ({ id, cateId, type, ... })
 *   3. api.sendSticker(detail, threadId, type) → SendStickerResponse
 *
 * Design:
 *   - Agent-driven: OpenClaw agent decides when to send stickers via tool calls
 *   - Cooldown per thread to prevent spam
 *   - Cache sticker search results (TTL 1h)
 */

import type { API, ThreadType } from "zca-js";

// --- Sticker cache ---
interface CachedSticker {
  id: number;
  cateId: number;
  type: number;
  text: string;
  fetchedAt: number;
}

const stickerCache = new Map<string, CachedSticker[]>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_MAX_KEYWORDS = 100;

// --- Cooldown per thread ---
const threadCooldowns = new Map<string, number>();
const COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Check if sticker can be sent to this thread (cooldown not active).
 */
export function canSendSticker(threadId: string): boolean {
  const lastSent = threadCooldowns.get(threadId);
  if (!lastSent) return true;
  return Date.now() - lastSent >= COOLDOWN_MS;
}

/**
 * Mark that a sticker was sent to this thread (start cooldown).
 */
export function markStickerSent(threadId: string): void {
  threadCooldowns.set(threadId, Date.now());
  // Evict old entries
  if (threadCooldowns.size > 500) {
    const oldest = threadCooldowns.keys().next().value;
    if (oldest) threadCooldowns.delete(oldest);
  }
}

/**
 * Search stickers by keyword with caching.
 * Returns array of { id, cateId, type } ready for sendSticker.
 */
export async function searchStickers(
  api: API,
  keyword: string,
  limit: number = 5,
): Promise<CachedSticker[]> {
  const cacheKey = keyword.toLowerCase().trim();

  // Check cache
  const cached = stickerCache.get(cacheKey);
  if (cached && Date.now() - cached[0].fetchedAt < CACHE_TTL_MS) {
    return cached.slice(0, limit);
  }

  // Search via API
  const stickerIds = await api.getStickers(keyword);
  if (!stickerIds || stickerIds.length === 0) return [];

  // Get details for first N results
  const idsToFetch = stickerIds.slice(0, limit);
  const details = await api.getStickersDetail(idsToFetch);
  if (!details || details.length === 0) return [];

  const now = Date.now();
  const results: CachedSticker[] = details.map((d) => ({
    id: d.id,
    cateId: d.cateId,
    type: d.type,
    text: d.text || "",
    fetchedAt: now,
  }));

  // Cache results (evict if too many)
  if (stickerCache.size >= CACHE_MAX_KEYWORDS) {
    const oldestKey = stickerCache.keys().next().value;
    if (oldestKey) stickerCache.delete(oldestKey);
  }
  stickerCache.set(cacheKey, results);

  return results.slice(0, limit);
}

/**
 * Send a sticker to a thread. Includes cooldown check.
 * Returns true if sent, false if skipped (cooldown/error).
 */
export async function sendSticker(
  api: API,
  sticker: { id: number; cateId: number; type: number },
  threadId: string,
  threadType: ThreadType,
): Promise<boolean> {
  if (!canSendSticker(threadId)) {
    console.log(`[sticker] Cooldown active for thread ${threadId}, skipping`);
    return false;
  }

  try {
    await api.sendSticker(sticker, threadId, threadType);
    markStickerSent(threadId);
    return true;
  } catch (err) {
    console.warn(`[sticker] Failed to send sticker:`, err);
    return false;
  }
}

/**
 * Convenience: search + send first matching sticker.
 */
export async function searchAndSendSticker(
  api: API,
  keyword: string,
  threadId: string,
  threadType: ThreadType,
): Promise<boolean> {
  if (!canSendSticker(threadId)) return false;

  try {
    const stickers = await searchStickers(api, keyword, 1);
    if (stickers.length === 0) return false;
    return sendSticker(api, stickers[0], threadId, threadType);
  } catch (err) {
    console.warn(`[sticker] searchAndSend failed for "${keyword}":`, err);
    return false;
  }
}
