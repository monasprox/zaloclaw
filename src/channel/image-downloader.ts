import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "os";

export async function downloadImageFromUrl(
  url: string,
  workspaceDir?: string,
): Promise<string | undefined> {
  try {
    const targetDir = workspaceDir || path.join(os.homedir(), ".openclaw/media/inbound");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const urlHash = crypto.createHash("md5").update(url).digest("hex").substring(0, 8);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
    const ext = getExtensionFromUrl(url) || "jpg";
    const filename = `${timestamp}-zalo-${urlHash}.${ext}`;
    const filePath = path.join(targetDir, filename);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[image-downloader] Failed to fetch ${url}: ${response.status}`);
      return undefined;
    }
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buffer));
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

function getExtensionFromUrl(url: string): string | undefined {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}
