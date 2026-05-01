import { describe, it, expect, afterEach } from "vitest";
import { ThreadType } from "zca-js";
import sharp from "sharp";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  _convertToZaloClawMessage as convertToZaloClawMessage,
  _filterAttachableMediaPaths as filterAttachableMediaPaths,
  _isSystemNotificationContent as isSystemNotificationContent,
} from "../src/channel/monitor.js";

const tempFiles: string[] = [];

function fakeUserMessage(content: unknown) {
  return {
    type: ThreadType.User,
    threadId: "8034963954397433363",
    isSelf: false,
    data: {
      content,
      uidFrom: "8034963954397433363",
      dName: "Huy Nguyen",
      ts: "1714555818",
      msgId: `msg-${Math.random()}`,
      cliMsgId: `cli-${Math.random()}`,
    },
  } as any;
}

function fakeUserMessageWithQuote(content: unknown, quote: Record<string, unknown>) {
  const msg = fakeUserMessage(content);
  msg.data.quote = quote;
  return msg;
}

async function createImage(width: number, height: number): Promise<string> {
  const filePath = path.join(os.tmpdir(), `zaloclaw-media-${width}x${height}-${Date.now()}-${Math.random()}.png`);
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).png().toFile(filePath);
  tempFiles.push(filePath);
  return filePath;
}

function createTextFile(name: string, content: string): string {
  const filePath = path.join(os.tmpdir(), `${Date.now()}-${Math.random()}-${name}`);
  fs.writeFileSync(filePath, content);
  tempFiles.push(filePath);
  return filePath;
}

afterEach(() => {
  for (const filePath of tempFiles.splice(0)) {
    fs.rmSync(filePath, { force: true });
  }
});

describe("Zalo media ingestion guard", () => {
  it("drops Zalo friend/system notification messages", () => {
    expect(isSystemNotificationContent("Bạn vừa kết bạn với Huy Nguyễn")).toBe(true);
    expect(convertToZaloClawMessage(fakeUserMessage("Bạn vừa kết bạn với Huy Nguyễn"))).toBeNull();
  });

  it("does not treat a lone thumb as customer-uploaded media", () => {
    const converted = convertToZaloClawMessage(fakeUserMessage(JSON.stringify({
      thumb: "https://res-zalo.zadn.vn/upload/media/avatar.jpg",
      description: "preview",
    })));

    expect(converted?.mediaUrls).toBeUndefined();
    expect(converted?.content).toBe("preview");
  });

  it("keeps explicit full-size photo URLs", () => {
    const converted = convertToZaloClawMessage(fakeUserMessage(JSON.stringify({
      normalUrl: "https://photo-stal.zdn.vn/fullsize/photo.jpg",
      thumb: "https://photo-stal.zdn.vn/thumb/photo.jpg",
    })));

    expect(converted?.mediaUrls).toEqual(["https://photo-stal.zdn.vn/fullsize/photo.jpg"]);
    expect(converted?.mediaTypes).toEqual(["image/jpeg"]);
  });

  it("does not attach generic link-preview hrefs as media", () => {
    const converted = convertToZaloClawMessage(fakeUserMessage(JSON.stringify({
      href: "https://example.com/some-page",
      title: "Example link",
      thumb: "https://example.com/preview.jpg",
    })));

    expect(converted?.mediaUrls).toBeUndefined();
    expect(converted?.content).toBe("Example link");
  });

  it("drops object payloads that contain no text and no media URL", () => {
    const converted = convertToZaloClawMessage(fakeUserMessage({
      thumb: "https://example.com/profile-or-preview.jpg",
      msgType: "link-preview",
    }));

    expect(converted).toBeNull();
  });

  it("does not treat quoted image attachments as current customer uploads", () => {
    const converted = convertToZaloClawMessage(fakeUserMessageWithQuote("check giúp em", {
      attach: JSON.stringify({
        normalUrl: "https://photo-stal.zdn.vn/fullsize/old-photo.jpg",
        type: "photo",
      }),
      msg: "old image",
    }));

    expect(converted?.content).toBe("check giúp em");
    expect(converted?.mediaUrls).toBeUndefined();
  });

  it("filters tiny avatars and banner-like images before model context", async () => {
    const avatar = await createImage(160, 160);
    const banner = await createImage(682, 122);
    const normal = await createImage(800, 600);

    await expect(filterAttachableMediaPaths([avatar, banner, normal])).resolves.toEqual([normal]);
  });

  it("drops HTML documents disguised as image files", async () => {
    const fakeJpg = createTextFile("zalo-preview.jpg", "<!doctype html><html><head></head><body>not an image</body></html>");

    await expect(filterAttachableMediaPaths([fakeJpg])).resolves.toEqual([]);
  });
});
