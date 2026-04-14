/**
 * Thread sandbox — filesystem isolation for per-thread workspace.
 *
 * [C2] Enforced sandbox path validation
 * [L3] Unicode-safe sanitization
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const WORKSPACE_BASE = path.join(os.homedir(), ".openclaw", "workspace", "threads");

/**
 * Sanitize a thread ID for use as a directory name.
 * [L3] Only allows ASCII alphanumeric, hyphen, underscore — rejects unicode.
 */
function sanitizeThreadId(threadId: string): string {
  return threadId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
}

export function getThreadSandbox(threadId: string): string {
  const sanitized = sanitizeThreadId(threadId);
  if (!sanitized || /^_+$/.test(sanitized)) {
    throw new Error("Invalid thread ID: produces empty or all-underscore directory name");
  }
  const dir = path.join(WORKSPACE_BASE, sanitized);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getThreadMediaDir(threadId: string): string {
  const dir = path.join(getThreadSandbox(threadId), "media");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getThreadFilesDir(threadId: string): string {
  const dir = path.join(getThreadSandbox(threadId), "files");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Enforce that a resolved file path is within the thread sandbox.
 * Uses realpath to defeat symlink escapes.
 *
 * [C2] Central enforcement point for sandbox containment.
 * Returns the canonical path if safe, throws otherwise.
 */
export function enforceSandboxPath(threadId: string, filePath: string): string {
  const sandbox = getThreadSandbox(threadId);
  const resolved = path.resolve(sandbox, filePath);

  // Lexical containment check
  if (!resolved.startsWith(sandbox + path.sep) && resolved !== sandbox) {
    throw new Error(`Path traversal blocked: ${filePath} escapes sandbox`);
  }

  // If exists, also check realpath to defeat symlinks
  if (fs.existsSync(resolved)) {
    const real = fs.realpathSync(resolved);
    const realSandbox = fs.realpathSync(sandbox);
    if (!real.startsWith(realSandbox + path.sep) && real !== realSandbox) {
      throw new Error(`Symlink escape blocked: ${filePath} resolves outside sandbox`);
    }
  }

  return resolved;
}

/**
 * Validate that an absolute path is within allowed file-access directories.
 * Used for tool actions that accept local file paths (e.g., send-file).
 *
 * Allowed directories:
 *  - ~/.openclaw/workspace/
 *  - ~/.openclaw/media/
 *  - System temp directory
 *
 * [C3] Prevents arbitrary file read/send via tool actions.
 */
export function validateLocalFilePath(filePath: string): string {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("File path is required");
  }

  const resolved = path.resolve(filePath);

  // Block explicit traversal patterns
  if (filePath.includes("..")) {
    throw new Error(`Path traversal blocked: ".." not allowed in file paths`);
  }

  const tmpDir = os.tmpdir();
  const allowedBases = [
    path.join(os.homedir(), ".openclaw", "workspace"),
    path.join(os.homedir(), ".openclaw", "media"),
    tmpDir,
    // Resolve /tmp symlinks (e.g., macOS /tmp → /private/tmp)
    ...(fs.existsSync(tmpDir) ? [fs.realpathSync(tmpDir)] : []),
  ];

  const isAllowed = allowedBases.some(
    (base) => resolved.startsWith(base + path.sep) || resolved === base,
  );

  if (!isAllowed) {
    throw new Error(
      `Access denied: ${filePath} is outside allowed directories. ` +
      `Only files in ~/.openclaw/workspace/, ~/.openclaw/media/, or system temp are allowed.`,
    );
  }

  // Symlink check for existing files
  if (fs.existsSync(resolved)) {
    const real = fs.realpathSync(resolved);
    const isRealAllowed = allowedBases.some(
      (base) => real.startsWith(base + path.sep) || real === base,
    );
    if (!isRealAllowed) {
      throw new Error(`Symlink escape blocked: ${filePath} resolves outside allowed directories`);
    }
  }

  return resolved;
}

/**
 * Legacy compat — returns boolean instead of throwing.
 * @deprecated Use enforceSandboxPath() instead.
 */
export function validateSandboxPath(threadId: string, filePath: string): boolean {
  try {
    enforceSandboxPath(threadId, filePath);
    return true;
  } catch {
    return false;
  }
}

export function cleanupOldSandboxes(maxAgeDays: number = 30): number {
  let cleaned = 0;
  try {
    if (!fs.existsSync(WORKSPACE_BASE)) return 0;
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(WORKSPACE_BASE)) {
      const dirPath = path.join(WORKSPACE_BASE, entry);
      try {
        const stat = fs.statSync(dirPath);
        if (stat.isDirectory() && now - stat.mtimeMs > maxAgeMs) {
          fs.rmSync(dirPath, { recursive: true, force: true });
          cleaned++;
        }
      } catch {
        // skip entries that can't be stat'd
      }
    }
  } catch {
    // workspace base doesn't exist or isn't readable
  }
  return cleaned;
}
