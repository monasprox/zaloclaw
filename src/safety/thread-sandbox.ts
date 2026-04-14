import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const WORKSPACE_BASE = path.join(os.homedir(), ".openclaw", "workspace", "threads");

function sanitizeThreadId(threadId: string): string {
  return threadId.replace(/[/\\:*?"<>|.\s]/g, "_").slice(0, 100);
}

export function getThreadSandbox(threadId: string): string {
  const sanitized = sanitizeThreadId(threadId);
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

export function validateSandboxPath(threadId: string, filePath: string): boolean {
  const sandbox = getThreadSandbox(threadId);
  const resolved = path.resolve(sandbox, filePath);
  return resolved.startsWith(sandbox);
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
      } catch {}
    }
  } catch {}
  return cleaned;
}
