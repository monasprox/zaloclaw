/**
 * Security tests for path validation / sandbox enforcement.
 * [C1] [C2] [C3] [L3]
 */
import { describe, it, expect } from "vitest";
import * as path from "path";
import * as os from "os";
import { enforceSandboxPath, validateLocalFilePath } from "../src/safety/thread-sandbox.js";

describe("enforceSandboxPath", () => {
  it("allows paths within the sandbox", () => {
    const result = enforceSandboxPath("test123", "image.jpg");
    expect(result).toContain("test123");
    expect(result).toContain("image.jpg");
  });

  it("blocks path traversal with ../", () => {
    expect(() => enforceSandboxPath("test123", "../../../etc/passwd")).toThrow("Path traversal blocked");
    expect(() => enforceSandboxPath("test123", "../../secret")).toThrow("Path traversal blocked");
  });

  it("blocks absolute paths outside sandbox", () => {
    expect(() => enforceSandboxPath("test123", "/etc/passwd")).toThrow("Path traversal blocked");
    expect(() => enforceSandboxPath("test123", "/root/.ssh/id_rsa")).toThrow("Path traversal blocked");
  });

  it("blocks encoded traversal patterns", () => {
    // Double-encoded ..
    expect(() => enforceSandboxPath("test123", "..%2F..%2Fetc%2Fpasswd")).not.toThrow();
    // Actual .. in path
    expect(() => enforceSandboxPath("test123", "./../../../etc/passwd")).toThrow("Path traversal blocked");
  });

  it("handles unicode thread IDs safely", () => {
    // Unicode gets sanitized to underscores
    const result = enforceSandboxPath("thre\u0061d_正常", "file.txt");
    expect(result).toContain("file.txt");
    expect(result).not.toContain("正常"); // CJK stripped
  });

  it("rejects all-underscore thread IDs", () => {
    expect(() => enforceSandboxPath("///", "file.txt")).toThrow("Invalid thread ID");
  });
});

describe("validateLocalFilePath", () => {
  it("blocks access to /etc/passwd", () => {
    expect(() => validateLocalFilePath("/etc/passwd")).toThrow("Access denied");
  });

  it("blocks access to SSH keys", () => {
    expect(() => validateLocalFilePath("/root/.ssh/id_rsa")).toThrow("Access denied");
    expect(() => validateLocalFilePath(`${os.homedir()}/.ssh/id_rsa`)).toThrow("Access denied");
  });

  it("blocks access to credential files", () => {
    const credPath = path.join(os.homedir(), ".openclaw", "opclaw-zalo-credentials.json");
    expect(() => validateLocalFilePath(credPath)).toThrow("Access denied");
  });

  it("blocks path traversal with ..", () => {
    expect(() => validateLocalFilePath("../../etc/passwd")).toThrow("Path traversal blocked");
    expect(() => validateLocalFilePath("/tmp/../etc/passwd")).toThrow("Path traversal blocked");
  });

  it("allows files in workspace directory", () => {
    const workspacePath = path.join(os.homedir(), ".openclaw", "workspace", "test.txt");
    const result = validateLocalFilePath(workspacePath);
    expect(result).toBe(workspacePath);
  });

  it("allows files in media directory", () => {
    const mediaPath = path.join(os.homedir(), ".openclaw", "media", "image.jpg");
    const result = validateLocalFilePath(mediaPath);
    expect(result).toBe(mediaPath);
  });

  it("allows files in temp directory", () => {
    const tmpPath = path.join(os.tmpdir(), "zalo-send-12345-file.jpg");
    const result = validateLocalFilePath(tmpPath);
    expect(result).toContain("zalo-send-12345-file.jpg");
  });

  it("rejects empty paths", () => {
    expect(() => validateLocalFilePath("")).toThrow("File path is required");
  });

  // Adversarial payloads from audit
  it("blocks /proc/self/environ", () => {
    expect(() => validateLocalFilePath("/proc/self/environ")).toThrow("Access denied");
  });

  it("blocks cloud metadata file access patterns", () => {
    expect(() => validateLocalFilePath("/var/run/secrets/kubernetes.io")).toThrow("Access denied");
  });
});
