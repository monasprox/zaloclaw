/**
 * URL validation for outbound requests — SSRF prevention.
 *
 * Blocks:
 *  - Non-http(s) schemes
 *  - Private/internal IPs (IPv4 + IPv6)
 *  - Cloud metadata endpoints (169.254.169.254, fd00::, etc.)
 *  - Loopback addresses
 *  - Link-local addresses
 *
 * [C4] SSRF — send-file URL fetch
 */

import { URL } from "node:url";
import * as dns from "node:dns/promises";
import * as net from "node:net";

/** Maximum download size in bytes (50 MB) */
export const MAX_DOWNLOAD_SIZE_BYTES = 50 * 1024 * 1024;

/** Download timeout in ms (30 seconds) */
export const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Check whether an IP address is private/internal/loopback/link-local.
 */
export function isPrivateIp(ip: string): boolean {
  // Normalize IPv6-mapped IPv4 (::ffff:127.0.0.1 → 127.0.0.1)
  const normalized = ip.replace(/^::ffff:/i, "");

  if (net.isIPv4(normalized)) {
    const parts = normalized.split(".").map(Number);
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (link-local, includes AWS metadata 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
    return false;
  }

  if (net.isIPv6(normalized)) {
    const lower = normalized.toLowerCase();
    // ::1 (loopback)
    if (lower === "::1") return true;
    // :: (unspecified)
    if (lower === "::") return true;
    // fe80::/10 (link-local)
    if (lower.startsWith("fe80:")) return true;
    // fc00::/7 (unique local — covers both fc and fd prefixes)
    if (/^f[cd]/i.test(lower)) return true;
    return false;
  }

  // If it's not a recognized IP format, treat as suspicious
  return true;
}

/**
 * Validate a URL for safe outbound fetching.
 * Throws if the URL is unsafe.
 */
export async function validateUrlForOutboundFetch(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  // Only allow http and https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Blocked URL scheme: ${parsed.protocol} (only http/https allowed)`);
  }

  // Block URLs with credentials
  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not allowed");
  }

  // Extract hostname, strip IPv6 brackets if present
  let hostname = parsed.hostname;
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }

  // If hostname is an IP literal, check directly
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error(`Blocked private/internal IP: ${hostname}`);
    }
    return parsed;
  }

  // Resolve DNS and check all resolved IPs
  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const allAddresses = [...addresses, ...addresses6];

    if (allAddresses.length === 0) {
      throw new Error(`DNS resolution failed for: ${hostname}`);
    }

    for (const ip of allAddresses) {
      if (isPrivateIp(ip)) {
        throw new Error(`Blocked: ${hostname} resolves to private/internal IP ${ip}`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Blocked")) throw err;
    throw new Error(`DNS validation failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return parsed;
}

/**
 * Safe fetch with SSRF protection, size limits, and timeout.
 * Returns the response body as a Buffer.
 *
 * [C4] SSRF prevention
 * [M4] Download size limit
 */
export async function safeFetch(
  rawUrl: string,
  options: {
    maxSizeBytes?: number;
    timeoutMs?: number;
    /** If true, skip SSRF validation (for known-safe URLs from Zalo CDN) */
    skipSsrfCheck?: boolean;
  } = {},
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const maxSize = options.maxSizeBytes ?? MAX_DOWNLOAD_SIZE_BYTES;
  const timeout = options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS;

  if (!options.skipSsrfCheck) {
    await validateUrlForOutboundFetch(rawUrl);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(rawUrl, {
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check Content-Length header first
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxSize) {
      throw new Error(`File too large: ${contentLength} bytes (max ${maxSize})`);
    }

    // Stream-read with size enforcement
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > maxSize) {
        reader.cancel();
        throw new Error(`Download exceeded size limit: ${totalSize} bytes (max ${maxSize})`);
      }
      chunks.push(value);
    }

    return {
      buffer: Buffer.concat(chunks),
      contentType: response.headers.get("content-type"),
    };
  } finally {
    clearTimeout(timer);
  }
}
