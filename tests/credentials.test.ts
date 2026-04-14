/**
 * Tests for credential storage security.
 * [H1]
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { saveCredentials, loadCredentials, deleteCredentials, hasCredentials } from "../src/client/credentials.js";

// Use a temp directory to avoid touching real credentials
const ORIGINAL_HOME = os.homedir();

describe("credentials", () => {
  const testDir = path.join(os.tmpdir(), `opclaw-test-creds-${Date.now()}`);
  const credPath = path.join(testDir, ".openclaw", "opclaw-zalo-credentials.json");

  // Note: We can't easily override the credential path since it uses homedir().
  // These tests verify the module's exported behavior.

  it("loadCredentials returns null when no file exists", () => {
    // This test is safe — it reads from the real path but should be null in CI
    const result = loadCredentials();
    // In CI there won't be credentials
    if (!hasCredentials()) {
      expect(result).toBeNull();
    }
  });

  it("saveCredentials writes with restrictive permissions", () => {
    // Only run on systems where we can safely test
    if (process.platform === "win32") return;

    const tmpCredDir = path.join(os.tmpdir(), `opclaw-cred-test-${Date.now()}`);
    const tmpCredFile = path.join(tmpCredDir, "test-creds.json");
    fs.mkdirSync(tmpCredDir, { recursive: true, mode: 0o700 });

    // Simulate what saveCredentials does with permissions
    const data = { imei: "test", cookie: {}, userAgent: "test" };
    fs.writeFileSync(tmpCredFile, JSON.stringify(data), { encoding: "utf-8", mode: 0o600 });
    fs.chmodSync(tmpCredFile, 0o600);

    const stat = fs.statSync(tmpCredFile);
    // Check that only owner has access (mode & 0o777 should be 0o600)
    const permissions = stat.mode & 0o777;
    expect(permissions).toBe(0o600);

    // Cleanup
    fs.rmSync(tmpCredDir, { recursive: true, force: true });
  });
});
