const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\/root\/[^\s"'`)\]}>]+/g, replacement: "[path]" },
  { pattern: /\/home\/[^\s"'`)\]}>]+/g, replacement: "[path]" },
  { pattern: /~\/\.openclaw\/[^\s"'`)\]}>]+/g, replacement: "[path]" },
  { pattern: /\/usr\/lib\/node_modules\/[^\s"'`)\]}>]+/g, replacement: "[path]" },
  { pattern: /\bmcp__[a-z_-]+__[a-z_-]+/g, replacement: "[tool]" },
  { pattern: /openclaw\/plugin-sdk\/[^\s"'`)\]}>]+/g, replacement: "[internal]" },
  { pattern: /openclaw\/dist\/[^\s"'`)\]}>]+/g, replacement: "[internal]" },
  { pattern: /\bsession[_-]?id[:\s=]+[a-f0-9-]{36}/gi, replacement: "session [id]" },
  { pattern: /\b(api[_-]?key|token|secret|password)[:\s=]+["']?[A-Za-z0-9_\-./+=]{20,}["']?/gi, replacement: "$1=[redacted]" },
  { pattern: /\bpm2\s+(restart|stop|start|delete|logs)\s+[^\s]+/g, replacement: "pm2 [command]" },
  { pattern: /at\s+[^\n]*node_modules[^\n]*/g, replacement: "at [internal]" },
  { pattern: /at\s+[^\n]*\/dist\/[^\n]*/g, replacement: "at [internal]" },
];

export function redactOutput(text: string): string {
  let result = text;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function hasInternalInfo(text: string): boolean {
  return REDACTION_PATTERNS.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}
