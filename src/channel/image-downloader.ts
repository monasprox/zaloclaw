/**
 * Image downloader with security hardening.
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

/** Max image download size: 20 MB */
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

/** Allowed image extensions (deny-by-default) */
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff"]);

export async function downloadImageFromUrl(
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
    const ext = getSafeExtension(url);
    const filename = `${timestamp}-zalo-${urlHash}.${ext}`;
    const filePath = path.join(targetDir, filename);

    // Verify the final path is within the target directory (defense-in-depth)
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(targetDir);
    if (!resolvedPath.startsWith(resolvedDir + path.sep)) {
      console.error(`[image-downloader] Path traversal blocked: ${filePath}`);
      return undefined;
    }

    // Use safeFetch with SSRF protection and size limits
    // Skip SSRF check for Zalo CDN URLs (they are from the Zalo API itself)
    // Strict hostname matching: must end with .zalo.vn, .zadn.vn, .zdn.vn, etc.
    const isZaloCdn = /^https:\/\/(?:[a-z0-9-]+\.)*(?:zalo|zadn|zdn)\.(?:vn|me)\//i.test(url);
    const { buffer } = await safeFetch(url, {
      maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
      skipSsrfCheck: isZaloCdn,
    });

    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error(`[image-downloader] Error downloading ${url}:`, err);
    return undefined;
  }
}

export async function downloadImagesFromUrls(
  urls: string[],
  workspaceDir?: string,
): Promise<(string | undefined)[]> {
  return Promise.all(urls.map(url => downloadImageFromUrl(url, workspaceDir)));
}

/**
 * Extract a safe file extension from a URL.
 * Only returns whitelisted image extensions; defaults to "jpg".
 */
function getSafeExtension(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    if (match) {
      const ext = match[1].toLowerCase();
      if (ALLOWED_EXTENSIONS.has(ext)) return ext;
    }
  } catch {
    // invalid URL
  }
  return "jpg";
}
