/**
 * Output filter — redact internal information before sending to users.
 *
 * Prevents leaking:
 * - File paths (/root/..., /home/..., ~/.openclaw/...)
 * - MCP tool names (mcp__zalo__send, mcp__memory__...)
 * - OpenClaw internals (plugin-sdk, node_modules paths)
 * - API keys / tokens
 * - Session/thread IDs
 * - Process info (PID, PM2 commands)
 * - Node.js internal stack traces
 *
 * Redaction is best-effort via regex. Does NOT block messages, only sanitizes.
 */

const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Absolute file paths
  { pattern: /\/root\/[^\s"'`)\]}>]+/g, replacement: "[path]" },
  { pattern: /\/home\/[^\s"'`)\]}>]+/g, replacement: "[path]" },
  { pattern: /~\/\.openclaw\/[^\s"'`)\]}>]+/g, replacement: "[path]" },
  { pattern: /\/usr\/lib\/node_modules\/[^\s"'`)\]}>]+/g, replacement: "[path]" },

  // MCP tool names (mcp__provider__tool)
  { pattern: /\bmcp__[a-z_-]+__[a-z_-]+/g, replacement: "[tool]" },

  // OpenClaw plugin-sdk internals
  { pattern: /openclaw\/plugin-sdk\/[^\s"'`)\]}>]+/g, replacement: "[internal]" },
  { pattern: /openclaw\/dist\/[^\s"'`)\]}>]+/g, replacement: "[internal]" },

  // Session IDs (UUIDs)
  { pattern: /\bsession[_-]?id[:\s=]+[a-f0-9-]{36}/gi, replacement: "session [id]" },

  // API keys / tokens (generic patterns)
  { pattern: /\b(api[_-]?key|token|secret|password)[:\s=]+["']?[A-Za-z0-9_\-./+=]{20,}["']?/gi, replacement: "$1=[redacted]" },

  // PM2 / process commands
  { pattern: /\bpm2\s+(restart|stop|start|delete|logs)\s+[^\s]+/g, replacement: "pm2 [command]" },

  // Node.js error stacks with internal paths
  { pattern: /at\s+[^\n]*node_modules[^\n]*/g, replacement: "at [internal]" },
  { pattern: /at\s+[^\n]*\/dist\/[^\n]*/g, replacement: "at [internal]" },
];

/**
 * Redact internal information from text before sending to users.
 */
export function redactOutput(text: string): string {
  let result = text;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Check if text contains patterns that should be redacted.
 */
export function hasInternalInfo(text: string): boolean {
  return REDACTION_PATTERNS.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

// --- Truncation ---
const ZALO_MAX_TEXT_LENGTH = 4000;
const TRUNCATION_SUFFIX = "\n\n[...tin nhắn quá dài, đã cắt bớt]";

/**
 * Redact + truncate text for safe outbound sending.
 */
export function sanitizeOutbound(text: string): string {
  const redacted = redactOutput(text);
  if (redacted.length <= ZALO_MAX_TEXT_LENGTH) return redacted;
  return redacted.slice(0, ZALO_MAX_TEXT_LENGTH - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}
