/**
 * Security tests for URL validation / SSRF prevention.
 * [C4] [M4]
 */
import { describe, it, expect } from "vitest";
import { isPrivateIp, validateUrlForOutboundFetch } from "../src/safety/url-validator.js";

describe("isPrivateIp", () => {
  // Private IPs that MUST be blocked
  const privateIps = [
    "127.0.0.1",
    "127.0.0.2",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.168.1.100",
    "169.254.169.254", // AWS metadata
    "169.254.0.1",
    "0.0.0.0",
    "::1",           // IPv6 loopback
    "::",            // IPv6 unspecified
    "fe80::1",       // IPv6 link-local
    "fc00::1",       // IPv6 unique local
    "fd00::1",       // IPv6 unique local
    "::ffff:127.0.0.1", // IPv4-mapped IPv6
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
  ];

  for (const ip of privateIps) {
    it(`blocks private IP: ${ip}`, () => {
      expect(isPrivateIp(ip)).toBe(true);
    });
  }

  // Public IPs that MUST be allowed
  const publicIps = [
    "8.8.8.8",
    "1.1.1.1",
    "142.250.80.46", // google.com
    "104.16.132.229",
  ];

  for (const ip of publicIps) {
    it(`allows public IP: ${ip}`, () => {
      expect(isPrivateIp(ip)).toBe(false);
    });
  }
});

describe("validateUrlForOutboundFetch", () => {
  it("rejects non-http schemes", async () => {
    await expect(validateUrlForOutboundFetch("file:///etc/passwd")).rejects.toThrow("Blocked URL scheme");
    await expect(validateUrlForOutboundFetch("ftp://evil.com/file")).rejects.toThrow("Blocked URL scheme");
    await expect(validateUrlForOutboundFetch("javascript:alert(1)")).rejects.toThrow("Blocked URL scheme");
    await expect(validateUrlForOutboundFetch("data:text/html,<h1>xss</h1>")).rejects.toThrow("Blocked URL scheme");
  });

  it("rejects URLs with embedded credentials", async () => {
    await expect(validateUrlForOutboundFetch("https://user:pass@evil.com")).rejects.toThrow("credentials");
  });

  it("rejects invalid URLs", async () => {
    await expect(validateUrlForOutboundFetch("not-a-url")).rejects.toThrow("Invalid URL");
    await expect(validateUrlForOutboundFetch("")).rejects.toThrow("Invalid URL");
  });

  it("rejects direct private IP URLs", async () => {
    await expect(validateUrlForOutboundFetch("http://127.0.0.1/admin")).rejects.toThrow("private");
    await expect(validateUrlForOutboundFetch("http://169.254.169.254/latest/meta-data")).rejects.toThrow("private");
    await expect(validateUrlForOutboundFetch("http://10.0.0.1/internal")).rejects.toThrow("private");
    await expect(validateUrlForOutboundFetch("http://192.168.1.1/router")).rejects.toThrow("private");
    await expect(validateUrlForOutboundFetch("http://[::1]/admin")).rejects.toThrow("private");
    await expect(validateUrlForOutboundFetch("http://0.0.0.0/")).rejects.toThrow("private");
  });

  it("allows valid public URLs", async () => {
    // In CI, DNS may not work — so we just test that IP-literal public URLs pass
    const url = await validateUrlForOutboundFetch("https://93.184.215.14/image.jpg");
    expect(url.protocol).toBe("https:");
  });
});
