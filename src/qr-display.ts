import * as fs from "fs";
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
  const pngPath = "/tmp/openclaw-zalo-personal-qr.png";
  try {
    const buffer = Buffer.from(base64Image, "base64");
    fs.writeFileSync(pngPath, buffer);
    const qrContent = await readQRFromPNG(pngPath);
    console.log("\n");
    qrcode.generate(qrContent, { small: true });
    console.log("\nScan the QR code above with your Zalo app to login");
    console.log(`\nQR image saved at: ${pngPath}\n`);
    return pngPath;
  } catch (err) {
    throw new Error(`Failed to display QR: ${err instanceof Error ? err.message : String(err)}`);
  }
}
