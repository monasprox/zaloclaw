/**
 * Injection Guard — detect prompt injection attempts in group chats.
 *
 * Flow:
 *   Attempt 1 → log silently
 *   Attempt 2 → public warning in group
 *   Attempt 3+ → remove from group (block)
 *
 * Resets per user after 1h of clean behavior.
 */

import type { API } from "zca-js";

// --- Violation tracking ---

interface ViolationRecord {
  count: number;
  lastAt: number;
  warned: boolean;
}

const violations = new Map<string, ViolationRecord>(); // key: `${groupId}:${userId}`
const RESET_MS = 60 * 60 * 1000; // 1 hour clean → reset
const WARN_THRESHOLD = 2;   // warn after N attempts
const BLOCK_THRESHOLD = 3;  // remove after N attempts

// --- Detection patterns ---

const INJECTION_PATTERNS: RegExp[] = [
  // English
  /ignore\s+(previous|all|your)\s+(instructions?|rules?|prompt)/i,
  /forget\s+(your|all|previous)\s+(rules?|instructions?|training)/i,
  /you\s+are\s+now\s+/i,
  /act\s+as\s+(if\s+you\s+are|a\s+different|an?\s+)/i,
  /pretend\s+(you\s+are|to\s+be)/i,
  /bypass\s+(your\s+)?(rules?|restrictions?|filter|safety)/i,
  /jailbreak/i,
  /do\s+anything\s+now/i,
  /DAN\s+mode/i,
  /system\s*prompt/i,
  /reveal\s+(your\s+)?(instructions?|prompt|system)/i,
  /override\s+(your\s+)?(instructions?|rules?)/i,
  /new\s+persona/i,
  /disregard\s+(your\s+)?(previous|all)/i,

  // Vietnamese
  /bỏ\s*qua\s+(hướng\s*dẫn|quy\s*tắc|lệnh\s*trước)/i,
  /quên\s+(đi\s+)?(tất\s+cả|quy\s*tắc|hướng\s*dẫn)/i,
  /giả\s*vờ\s+(là|bạn\s+là|em\s+là)/i,
  /đóng\s*vai\s+(là|một)/i,
  /bây\s+giờ\s+bạn\s+là/i,
  /mày\s+là\s+/i,
  /không\s+có\s+(giới\s*hạn|quy\s*tắc|hạn\s*chế)/i,
  /vượt\s+qua\s+(giới\s*hạn|bộ\s*lọc)/i,
  /tiết\s+lộ\s+(system\s+prompt|hướng\s+dẫn|lệnh\s+hệ\s+thống)/i,
  /lọc\s+.*(xnxx|porn|sex|18\+|người\s+lớn)/i,
  /tìm\s+.*(xnxx|porn|sex|18\+)/i,
];

export function isInjectionAttempt(text: string): boolean {
  if (!text) return false;
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

function getKey(groupId: string, userId: string): string {
  return `${groupId}:${userId}`;
}

function getRecord(key: string): ViolationRecord {
  const now = Date.now();
  const existing = violations.get(key);
  if (existing) {
    // Reset if clean for RESET_MS
    if (now - existing.lastAt > RESET_MS) {
      violations.delete(key);
      return { count: 0, lastAt: now, warned: false };
    }
    return existing;
  }
  return { count: 0, lastAt: now, warned: false };
}

export interface InjectionGuardContext {
  api: API;
  groupId: string;
  userId: string;
  userName: string;
  message: string;
  log?: (msg: string) => void;
}

/**
 * Check message for injection. Returns true if message should be blocked from AI.
 * Handles warnings and removal automatically.
 */
export async function checkInjection(ctx: InjectionGuardContext): Promise<boolean> {
  if (!isInjectionAttempt(ctx.message)) return false;

  const key = getKey(ctx.groupId, ctx.userId);
  const record = getRecord(key);
  record.count++;
  record.lastAt = Date.now();
  violations.set(key, record);

  ctx.log?.(`[injection-guard] attempt #${record.count} from ${ctx.userName} (${ctx.userId}) in ${ctx.groupId}`);

  if (record.count >= BLOCK_THRESHOLD) {
    // Remove from group
    ctx.log?.(`[injection-guard] removing ${ctx.userName} from group after ${record.count} attempts`);
    try {
      await (ctx.api as any).removeUserFromGroup(ctx.userId, ctx.groupId);
    } catch (err) {
      ctx.log?.(`[injection-guard] remove failed: ${String(err)}`);
    }
    violations.delete(key); // Reset after action
    return true;
  }

  if (record.count >= WARN_THRESHOLD && !record.warned) {
    // Public warning
    record.warned = true;
    violations.set(key, record);
    const warningPrefix = "⚠️ ";
    const mentionText = `@${ctx.userName}`;
    const warningText =
      `${warningPrefix}${mentionText} — Em phát hiện bạn đang cố gắng can thiệp vào cách em hoạt động.\n\n` +
      `Hành vi này không được phép trong nhóm. ` +
      `Nếu tiếp tục, bạn sẽ bị xóa khỏi nhóm tự động.`;
    // Build proper mention so Zalo sends notification to the user
    const mentionPos = warningPrefix.length; // position of '@' in string
    const mention = { pos: mentionPos, uid: ctx.userId, len: mentionText.length };
    try {
      await ctx.api.sendMessage({ msg: warningText, mentions: [mention] }, ctx.groupId, 1);
    } catch (err) {
      ctx.log?.(`[injection-guard] warning send failed: ${String(err)}`);
    }
    return true;
  }

  return true; // Block from AI even on first attempt (silent)
}

/**
 * Get current violation stats for a user in a group.
 */
export function getViolationCount(groupId: string, userId: string): number {
  const key = getKey(groupId, userId);
  return violations.get(key)?.count ?? 0;
}

/**
 * Manually reset violations for a user (admin action).
 */
export function resetViolations(groupId: string, userId: string): void {
  violations.delete(getKey(groupId, userId));
}
