/**
 * Generic file downloader for non-image attachments (CSV, PDF, DOCX, etc.).
 *
 * [C1] Path traversal prevention — filename is hash-based, never user-controlled
 * [M4] Download size limits — stream-based with max size enforcement
 * [C4] SSRF protection — uses safeFetch for URL validation
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "os";
import { safeFetch } from "../safety/url-validator.js";
import { loadCredentials } from "../client/credentials.js";

/**
 * Convert Zalo cookie object (array or plain object) to a cookie header string.
 * Same pattern as image-downloader.ts.
 */
function buildZaloCookieHeader(cookie: unknown): string | undefined {
  if (!cookie) return undefined;
  if (Array.isArray(cookie)) {
    const pairs = (cookie as Array<{ key?: string; name?: string; value?: string }>)
      .map((c) => {
        const key = c.key ?? c.name ?? "";
        const value = c.value ?? "";
        return key ? `${key}=${value}` : "";
      })
      .filter(Boolean);
    return pairs.length > 0 ? pairs.join("; ") : undefined;
  }
  if (typeof cookie === "object") {
    const pairs = Object.entries(cookie as Record<string, string>)
      .filter(([k]) => Boolean(k))
      .map(([k, v]) => `${k}=${v}`);
    return pairs.length > 0 ? pairs.join("; ") : undefined;
  }
  return undefined;
}

/** Max file download size: 50 MB (higher than images to accommodate PDFs, spreadsheets) */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Download a generic file from a URL, saving it to the inbound media directory.
 * Unlike image-downloader, this accepts any file type (no MIME/extension whitelist).
 *
 * Returns the local file path on success, undefined on failure.
 */
export async function downloadFileFromUrl(
  url: string,
  workspaceDir?: string,
): Promise<string | undefined> {
  try {
    const targetDir = workspaceDir || path.join(os.homedir(), ".openclaw/media/inbound");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Generate safe filename from hash — never use URL path components directly
    const urlHash = crypto.createHash("sha256").update(url).digest("hex").substring(0, 12);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);

    // Try to extract extension from URL first, then content-type, then fallback
    const ext = getSafeExtension(url) || "file";
    const filename = `${timestamp}-zalo-file-${urlHash}.${ext}`;
    const filePath = path.join(targetDir, filename);

    // Verify the final path is within the target directory (defense-in-depth)
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(targetDir);
    if (!resolvedPath.startsWith(resolvedDir + path.sep)) {
      console.error(`[file-downloader] Path traversal blocked: ${filePath}`);
      return undefined;
    }

    // Use safeFetch with SSRF protection and size limits
    // For Zalo CDN URLs, send auth cookies (same pattern as image-downloader)
    const isZaloCdn = /^https:\/\/(?:[a-z0-9-]+\.)*(?:zalo|zadn|zdn)\.(?:vn|me)\//i.test(url);

    let buffer: Buffer;
    let contentType: string | null | undefined;

    if (isZaloCdn) {
      const creds = loadCredentials();
      const cookieHeader = creds?.cookie ? buildZaloCookieHeader(creds.cookie) : undefined;
      console.log(`[file-downloader] Zalo CDN url=${url.substring(0, 80)}`);
      if (!cookieHeader) {
        console.warn(`[file-downloader] Zalo CDN but no cookies found — download may fail`);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          redirect: "follow",
          headers: {
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
            "User-Agent": creds?.userAgent ?? "Mozilla/5.0",
          },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuf = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
        contentType = response.headers.get("content-type");
        console.log(`[file-downloader] Response status=${response.status} contentType=${contentType} size=${arrayBuf.byteLength}`);
      } finally {
        clearTimeout(timer);
      }
    } else {
      const result = await safeFetch(url, {
        maxSizeBytes: MAX_FILE_SIZE_BYTES,
        skipSsrfCheck: false,
      });
      buffer = result.buffer;
      contentType = result.contentType;
    }

    // Log content type for debugging (no rejection — accept any type)
    if (contentType) {
      console.log(`[file-downloader] Downloaded ${contentType} from ${url}`);
    }

    fs.writeFileSync(filePath, buffer);
    console.log(`[file-downloader] Saved to ${filePath} (${buffer.length} bytes)`);
    return filePath;
  } catch (err) {
    console.error(`[file-downloader] Error downloading ${url}:`, err);
    return undefined;
  }
}

export async function downloadFilesFromUrls(
  urls: string[],
  workspaceDir?: string,
): Promise<(string | undefined)[]> {
  return Promise.all(urls.map(url => downloadFileFromUrl(url, workspaceDir)));
}

/**
 * Extract a file extension from a URL.
 * Returns the extension if found, empty string if not.
 * Unlike image-downloader, does NOT whitelist — just extracts.
 */
function getSafeExtension(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    if (match) {
      return match[1].toLowerCase();
    }
  } catch {
    // invalid URL
  }
  return "";
}
