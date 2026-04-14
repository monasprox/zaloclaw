/**
 * Tests for output redaction / secret filtering.
 * [M2] [M3]
 */
import { describe, it, expect } from "vitest";
import { redactOutput, hasInternalInfo } from "../src/safety/output-filter.js";

describe("redactOutput", () => {
  it("redacts file paths", () => {
    expect(redactOutput("Error at /home/user/code/file.ts")).not.toContain("/home/user");
    expect(redactOutput("Error at /root/secret")).not.toContain("/root/secret");
    expect(redactOutput("Path: ~/.openclaw/workspace/test")).not.toContain("workspace/test");
  });

  it("redacts long secrets (20+ chars)", () => {
    const text = "token=abc123def456ghi789jkl012mno";
    const result = redactOutput(text);
    expect(result).toContain("[redacted]");
    expect(result).not.toContain("abc123def456ghi789jkl012mno");
  });

  it("[M2] redacts short secrets (8+ chars)", () => {
    const text = "api_key=shortkey12";
    const result = redactOutput(text);
    expect(result).toContain("[redacted]");
    expect(result).not.toContain("shortkey12");
  });

  it("redacts session IDs", () => {
    const text = "session_id: a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const result = redactOutput(text);
    expect(result).not.toContain("a1b2c3d4-e5f6");
  });

  it("redacts pm2 commands", () => {
    const text = "pm2 restart my-app";
    const result = redactOutput(text);
    expect(result).not.toContain("my-app");
  });

  it("redacts stack traces from node_modules", () => {
    const text = "at Function.run (/usr/lib/node_modules/zca-js/dist/index.js:123:45)";
    const result = redactOutput(text);
    expect(result).not.toContain("zca-js/dist/index.js");
  });

  it("preserves normal text", () => {
    const text = "Hello, how are you? This is a normal message.";
    expect(redactOutput(text)).toBe(text);
  });
});

describe("hasInternalInfo", () => {
  it("detects internal paths", () => {
    expect(hasInternalInfo("/home/user/project/file.ts")).toBe(true);
    expect(hasInternalInfo("/root/.config")).toBe(true);
  });

  it("returns false for clean text", () => {
    expect(hasInternalInfo("Hello world")).toBe(false);
    expect(hasInternalInfo("Normal message without paths")).toBe(false);
  });

  it("[M3] handles concurrent calls without state corruption", () => {
    // Call hasInternalInfo multiple times rapidly — should not have regex lastIndex issues
    const results = Array.from({ length: 100 }, () =>
      hasInternalInfo("/home/user/test"),
    );
    expect(results.every(r => r === true)).toBe(true);
  });
});
