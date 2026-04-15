import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import qrcode from "qrcode-terminal";
import { PNG } from "pngjs";
import jsQR from "jsqr";

async function readQRFromPNG(pngPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const buffer = fs.readFileSync(pngPath);
      const png = PNG.sync.read(buffer);
      const code = jsQR(Uint8ClampedArray.from(png.data), png.width, png.height);
      if (!code) {
        reject(new Error("Could not decode QR code from image"));
        return;
      }
      resolve(code.data);
    } catch (err) {
      reject(new Error(`Failed to read QR code: ${err instanceof Error ? err.message : String(err)}`));
    }
  });
}

export async function displayQRFromPNG(base64Image: string): Promise<string> {
  // [L6] Use unique temp file per invocation to prevent multi-instance conflicts
  const uniqueId = crypto.randomBytes(8).toString("hex");
  const pngPath = path.join(os.tmpdir(), `zaloclaw-qr-${uniqueId}.png`);
  try {
    const buffer = Buffer.from(base64Image, "base64");
    fs.writeFileSync(pngPath, buffer, { mode: 0o600 });
    const qrContent = await readQRFromPNG(pngPath);
    console.log("\n");
    qrcode.generate(qrContent, { small: true });
    console.log("\nScan the QR code above with your Zalo app to login");
    console.log(`\nQR image saved at: ${pngPath}\n`);
    return pngPath;
  } catch (err) {
    // Cleanup on error
    try { fs.unlinkSync(pngPath); } catch {}
    throw new Error(`Failed to display QR: ${err instanceof Error ? err.message : String(err)}`);
  }
}
