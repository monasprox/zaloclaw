/**
 * Per-thread sandbox directory management.
 *
 * Each thread (DM or group) gets an isolated directory for:
 * - Downloaded media (images, voice, video)
 * - Files created by the bot
 * - Temporary files during processing
 *
 * Layout: ~/.openclaw/workspace/threads/{threadId}/
 *         ~/.openclaw/workspace/threads/{threadId}/media/
 *         ~/.openclaw/workspace/threads/{threadId}/files/
 *
 * Path traversal is blocked — all paths must resolve within the sandbox.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const WORKSPACE_BASE = path.join(os.homedir(), ".openclaw", "workspace", "threads");

/**
 * Sanitize thread ID for use as directory name.
 * Removes path separators and special characters.
 */
function sanitizeThreadId(threadId: string): string {
  return threadId.replace(/[/\\:*?"<>|.\s]/g, "_").slice(0, 100);
}

/**
 * Get the sandbox root for a thread. Creates if not exists.
 */
export function getThreadSandbox(threadId: string): string {
  const sanitized = sanitizeThreadId(threadId);
  const dir = path.join(WORKSPACE_BASE, sanitized);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Get the media subdirectory for a thread. Creates if not exists.
 */
export function getThreadMediaDir(threadId: string): string {
  const dir = path.join(getThreadSandbox(threadId), "media");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Get the files subdirectory for a thread. Creates if not exists.
 */
export function getThreadFilesDir(threadId: string): string {
  const dir = path.join(getThreadSandbox(threadId), "files");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Validate that a path is within the thread's sandbox.
 * Prevents path traversal attacks.
 */
export function validateSandboxPath(threadId: string, filePath: string): boolean {
  const sandbox = getThreadSandbox(threadId);
  const resolved = path.resolve(sandbox, filePath);
  return resolved.startsWith(sandbox);
}

/**
 * Cleanup old thread sandboxes. Removes directories older than maxAgeDays.
 */
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
        // Skip inaccessible directories
      }
    }
  } catch {
    // Skip if base dir doesn't exist
  }
  return cleaned;
}
