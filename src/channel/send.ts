import { ThreadType, TextStyle, type Style, type MessageContent, type Mention, type SendMessageQuote } from "zca-js";
import { getApi } from "../client/zalo-client.js";
import { resolveOutboundMentions } from "../parsing/mention-parser.js";
import { redactOutput } from "../safety/output-filter.js";
import * as fs from "fs";
import * as path from "path";

const ZALO_MAX_TEXT_LENGTH = 4000;
const TRUNCATION_SUFFIX = "\n\n[...tin nhắn quá dài, đã cắt bớt]";

export function markdownToZaloStyles(input: string): { text: string; styles: Style[] } {
  const styles: Style[] = [];
  let text = input;

  // Block-level: headings → bold
  text = text.replace(/^(#{1,6})\s+(.+)$/gm, (_m, _h, content) => content);

  // Inline patterns (longer markers first)
  const inlinePatterns: Array<{ regex: RegExp; style: TextStyle }> = [
    { regex: /\*\*\*(.+?)\*\*\*/g, style: TextStyle.Bold },
    { regex: /\*\*(.+?)\*\*/g, style: TextStyle.Bold },
    { regex: /~~(.+?)~~/g, style: TextStyle.StrikeThrough },
    { regex: /__(.+?)__/g, style: TextStyle.Underline },
    { regex: /`([^`]+)`/g, style: TextStyle.Bold },
    { regex: /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, style: TextStyle.Italic },
  ];

  for (const { regex, style } of inlinePatterns) {
    let result = "";
    let lastIndex = 0;
    const pending: Style[] = [];
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      result += text.slice(lastIndex, match.index);
      const start = result.length;
      const content = match[1];
      result += content;
      pending.push({ start, len: content.length, st: style as Exclude<TextStyle, TextStyle.Indent> });
      lastIndex = match.index + match[0].length;
    }
    if (pending.length > 0) {
      result += text.slice(lastIndex);
      text = result;
      styles.push(...pending);
    }
  }

  return { text, styles };
}

function countStripsBefore(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type OpclawZaloSendOptions = {
  mediaUrl?: string;
  caption?: string;
  isGroup?: boolean;
  localPath?: string;
  cleanupAfterUpload?: boolean;
  quote?: SendMessageQuote;
};

export type OpclawZaloSendResult = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

export async function sendMessageOpclawZalo(
  threadId: string,
  text: string,
  options: OpclawZaloSendOptions = {},
): Promise<OpclawZaloSendResult> {
  if (!threadId?.trim()) return { ok: false, error: "No threadId provided" };

  if (options.localPath) {
    return uploadAndSendLocalImage(threadId, options.localPath, {
      ...options,
      caption: text || options.caption,
    });
  }

  if (text && isLocalFilePath(text.trim()) && fs.existsSync(text.trim())) {
    return uploadAndSendLocalImage(threadId, text.trim(), {
      ...options,
      caption: options.caption,
    });
  }

  if (options.mediaUrl) {
    return sendMediaOpclawZalo(threadId, options.mediaUrl, {
      ...options,
      caption: text || options.caption,
    });
  }

  try {
    const api = await getApi();
    const type = options.isGroup ? ThreadType.Group : ThreadType.User;
    const redacted = redactOutput(text);
    const truncated = redacted.length > ZALO_MAX_TEXT_LENGTH
      ? redacted.slice(0, ZALO_MAX_TEXT_LENGTH - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX
      : redacted;
    const { text: postMarkdownText, styles } = markdownToZaloStyles(truncated);

    let outboundText = postMarkdownText;
    let mentions: Mention[] = [];
    let alignedStyles = styles;
    if (options.isGroup) {
      const resolved = await resolveOutboundMentions(threadId.trim(), postMarkdownText);
      outboundText = resolved.text;
      mentions = resolved.mentions;
      if (resolved.stripIndices.length > 0 && styles.length > 0) {
        alignedStyles = styles.map((s) => {
          const shift = countStripsBefore(resolved.stripIndices, s.start);
          return shift === 0 ? s : { ...s, start: s.start - shift };
        });
      }
    }

    const content: { msg: string; styles?: Style[]; mentions?: Mention[]; quote?: SendMessageQuote } = { msg: outboundText };
    if (alignedStyles.length > 0) content.styles = alignedStyles;
    if (mentions.length > 0) content.mentions = mentions;
    if (options.quote) content.quote = options.quote;

    const result = await api.sendMessage(content, threadId.trim(), type);
    const msgId = result?.message?.msgId;
    return { ok: true, messageId: msgId != null ? String(msgId) : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendMediaOpclawZalo(
  threadId: string,
  mediaUrl: string,
  options: OpclawZaloSendOptions = {},
): Promise<OpclawZaloSendResult> {
  if (!threadId?.trim()) return { ok: false, error: "No threadId provided" };
  if (!mediaUrl?.trim()) return { ok: false, error: "No media URL provided" };
  try {
    const api = await getApi();
    const type = options.isGroup ? ThreadType.Group : ThreadType.User;
    const result = await api.sendLink(
      { url: mediaUrl.trim(), title: options.caption || mediaUrl.trim() },
      threadId.trim(),
      type,
    );
    const msgId = result?.message?.msgId;
    return { ok: true, messageId: msgId != null ? String(msgId) : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendLinkOpclawZalo(
  threadId: string,
  url: string,
  options: OpclawZaloSendOptions = {},
): Promise<OpclawZaloSendResult> {
  if (!threadId?.trim()) return { ok: false, error: "No threadId provided" };
  if (!url?.trim()) return { ok: false, error: "No URL provided" };
  try {
    const api = await getApi();
    const type = options.isGroup ? ThreadType.Group : ThreadType.User;
    const result = await api.sendLink({ url: url.trim() }, threadId.trim(), type);
    const msgId = result?.message?.msgId;
    return { ok: true, messageId: msgId != null ? String(msgId) : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function uploadAndSendLocalImage(
  threadId: string,
  localPath: string,
  options: OpclawZaloSendOptions = {},
): Promise<OpclawZaloSendResult> {
  if (!threadId?.trim()) return { ok: false, error: "No threadId provided" };
  if (!localPath?.trim()) return { ok: false, error: "No local path provided" };
  if (!fs.existsSync(localPath)) return { ok: false, error: `File not found: ${localPath}` };
  try {
    const api = await getApi();
    const type = options.isGroup ? ThreadType.Group : ThreadType.User;
    const result = await api.sendMessage(
      { msg: options.caption || "", attachments: localPath },
      threadId.trim(),
      type,
    );
    if (options.cleanupAfterUpload === true) {
      try { fs.unlinkSync(localPath); } catch {}
    }
    const msgId = result?.message?.msgId;
    return { ok: true, messageId: msgId != null ? String(msgId) : undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function isLocalFilePath(str: string): boolean {
  if (!str) return false;
  return (
    str.startsWith("/") ||
    str.startsWith("./") ||
    str.startsWith("../") ||
    str.includes("/.openclaw/workspace/")
  );
}
