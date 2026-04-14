/**
 * Tests for isLocalFilePath and send module.
 * [M1]
 */
import { describe, it, expect } from "vitest";
import { isLocalFilePath } from "../src/channel/send.js";

describe("isLocalFilePath", () => {
  // Should return true for local paths
  it("detects absolute paths", () => {
    expect(isLocalFilePath("/home/user/file.txt")).toBe(true);
    expect(isLocalFilePath("/tmp/image.jpg")).toBe(true);
  });

  it("detects relative paths with ./", () => {
    expect(isLocalFilePath("./image.jpg")).toBe(true);
  });

  it("detects relative paths with ../", () => {
    expect(isLocalFilePath("../image.jpg")).toBe(true);
  });

  // [M1] Should NOT match URLs — this was the bug
  it("does NOT match URLs containing workspace path substring", () => {
    expect(isLocalFilePath("https://evil.com/.openclaw/workspace/malicious")).toBe(false);
  });

  it("does NOT match http URLs", () => {
    expect(isLocalFilePath("https://example.com/image.jpg")).toBe(false);
    expect(isLocalFilePath("http://example.com/file.txt")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isLocalFilePath("")).toBe(false);
  });

  it("returns false for plain text", () => {
    expect(isLocalFilePath("hello world")).toBe(false);
    expect(isLocalFilePath("some random text")).toBe(false);
  });
});
