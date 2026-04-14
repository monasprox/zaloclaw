declare module "qrcode-terminal" {
  const qrcode: {
    generate(text: string, options?: { small?: boolean }): void;
  };
  export default qrcode;
}

declare module "pngjs" {
  export class PNG {
    static sync: {
      read(buffer: Buffer): { data: Uint8Array; width: number; height: number };
    };
    data: Uint8Array;
    width: number;
    height: number;
  }
}

declare module "jsqr" {
  interface QRCode {
    data: string;
  }
  function jsQR(data: Uint8ClampedArray, width: number, height: number): QRCode | null;
  export default jsQR;
}
