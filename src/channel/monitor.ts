import type { OpenClawConfig, MarkdownTableMode, RuntimeEnv } from "openclaw/plugin-sdk/zalouser";
import { createReplyPrefixOptions, createTypingCallbacks } from "openclaw/plugin-sdk/channel-reply-pipeline";
import { logTypingFailure, logAckFailure } from "openclaw/plugin-sdk/channel-feedback";
import { mergeAllowlist, summarizeMapping } from "openclaw/plugin-sdk/allow-from";

// Inline mention gating to avoid compat barrel issues with OpenClaw SDK
function resolveMentionGatingWithBypass(params: {
  isGroup: boolean; requireMention: boolean; canDetectMention: boolean;
  wasMentioned: boolean; allowTextCommands: boolean; hasControlCommand: boolean;
  commandAuthorized: boolean;
}): { shouldSkip: boolean } {
  if (!params.isGroup || !params.requireMention) return { shouldSkip: false };
  if (params.wasMentioned) return { shouldSkip: false };
  if (params.allowTextCommands && params.hasControlCommand && params.commandAuthorized) return { shouldSkip: false };
  return { shouldSkip: true };
}

import { ThreadType, FriendEventType, Reactions, type API, type Message, type UserMessage, type GroupMessage, type FriendEvent, type Reaction, type Typing, type SendMessageQuote } from "zca-js";
import type { ResolvedZaloClawAccount, ZaloClawFriend, ZaloClawGroup, ZaloClawMessage } from "../runtime/types.js";
import { getZaloClawRuntime } from "../runtime/runtime.js";
import { sendMessageZaloClaw } from "./send.js";
import { getApi, getCurrentUid } from "../client/zalo-client.js";
import { downloadImagesFromUrls } from "./image-downloader.js";
import { addPendingRequest, removePendingRequest } from "../client/friend-request-store.js";
import { recordReadReceipt } from "../features/read-receipt.js";
import { recordMsgId } from "../features/msg-id-store.js";
import { refreshCredentials } from "../client/credentials.js";
import { ThreadMessageQueue, type ThreadQueueEntry } from "./thread-queue.js";

export type ZaloClawMonitorOptions = {
  account: ResolvedZaloClawAccount;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

export type ZaloClawMonitorResult = {
  stop: () => void;
};

const ZALOJS_TEXT_LIMIT = 2000;

// --- Name cache ---
const nameCache = new Map<string, { name: string; cachedAt: number }>();
const groupNameCache = new Map<string, { name: string; cachedAt: number }>();
const NAME_CACHE_TTL = 60 * 60 * 1000;

// --- Group message buffer ---
const groupMessageBuffer = new Map<string, Array<{
  senderName: string;
  content: string;
  timestamp: number;
  mediaUrls?: string[];
  localMediaPaths?: string[];
}>>();
const GROUP_BUFFER_MAX_MESSAGES = 50;
const GROUP_BUFFER_MAX_AGE_S = 4 * 60 * 60;

function bufferGroupMessage(groupId: string, entry: { senderName: string; content: string; timestamp: number; mediaUrls?: string[]; localMediaPaths?: string[] }): void {
  let buffer = groupMessageBuffer.get(groupId) ?? [];
  buffer.push(entry);
  const cutoff = Math.floor(Date.now() / 1000) - GROUP_BUFFER_MAX_AGE_S;
  buffer = buffer.filter(m => m.timestamp > cutoff).slice(-GROUP_BUFFER_MAX_MESSAGES);
  groupMessageBuffer.set(groupId, buffer);
}

function consumeGroupBuffer(groupId: string): { text: string } {
  const buffer = groupMessageBuffer.get(groupId);
  if (!buffer || buffer.length === 0) return { text: "" };
  const lines = buffer.map(m => {
    return `[${m.senderName}]: ${m.content}`;
  });
  groupMessageBuffer.delete(groupId);
  return { text: lines.join("\n") };
}

// --- Inbound message cache: stores last inbound message per thread for quote-reply ---
const lastInboundMessage = new Map<string, {
  msgId: string;
  cliMsgId: string;
  content: string;
  msgType: number;
  uidFrom: string;
  ts: number;
  ttl: number;
  propertyExt?: Record<string, unknown>;
}>();
const INBOUND_CACHE_MAX = 500;

function cacheInboundMessage(threadId: string, data: {
  msgId: string; cliMsgId: string; content: string; msgType: number;
  uidFrom: string; ts: number; ttl: number; propertyExt?: Record<string, unknown>;
}): void {
  if (lastInboundMessage.size >= INBOUND_CACHE_MAX && !lastInboundMessage.has(threadId)) {
    const oldest = lastInboundMessage.keys().next().value;
    if (oldest) lastInboundMessage.delete(oldest);
  }
  lastInboundMessage.set(threadId, {
    msgId: data.msgId,
    cliMsgId: data.cliMsgId,
    content: data.content,
    msgType: data.msgType ?? 0,
    uidFrom: data.uidFrom,
    ts: data.ts,
    ttl: data.ttl ?? 0,
    propertyExt: data.propertyExt,
  });
}

// --- Inbound message dedup cache: prevents processing same msgId twice (e.g. delivery-mirror) ---
const processedMsgIds = new Map<string, number>();
const DEDUP_TTL = 60_000; // 60 seconds
const DEDUP_MAX = 2000;

function isDuplicateMsg(msgId: string | undefined): boolean {
  if (!msgId) return false;
  const now = Date.now();
  if (processedMsgIds.has(msgId)) return true;
  // Evict expired entries when approaching limit
  if (processedMsgIds.size >= DEDUP_MAX) {
    for (const [id, ts] of processedMsgIds) {
      if (now - ts > DEDUP_TTL) processedMsgIds.delete(id);
    }
    // If still at limit after eviction, remove oldest
    if (processedMsgIds.size >= DEDUP_MAX) {
      const oldest = processedMsgIds.keys().next().value;
      if (oldest) processedMsgIds.delete(oldest);
    }
  }
  processedMsgIds.set(msgId, now);
  return false;
}

/** Exported for testing only. */
export { isDuplicateMsg as _isDuplicateMsg, processedMsgIds as _processedMsgIds };

function getQuoteForThread(threadId: string): SendMessageQuote | undefined {
  const cached = lastInboundMessage.get(threadId);
  if (!cached) return undefined;
  return {
    content: cached.content,
    msgType: String(cached.msgType),
    propertyExt: cached.propertyExt as SendMessageQuote["propertyExt"],
    uidFrom: cached.uidFrom,
    msgId: cached.msgId,
    cliMsgId: cached.cliMsgId,
    ts: String(cached.ts),
    ttl: cached.ttl,
  };
}

async function resolveUserName(userId: string): Promise<string> {
  const cached = nameCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < NAME_CACHE_TTL) return cached.name;
  try {
    const api = await getApi();
    const userInfo = await api.getUserInfo(userId);
    const profile = (userInfo as any)?.changed_profiles?.[userId];
    const name = profile?.displayName || profile?.zaloName || userId;
    nameCache.set(userId, { name, cachedAt: Date.now() });
    return name;
  } catch {
    return userId;
  }
}

async function resolveGroupName(groupId: string): Promise<string> {
  const cached = groupNameCache.get(groupId);
  if (cached && Date.now() - cached.cachedAt < NAME_CACHE_TTL) return cached.name;
  try {
    const api = await getApi();
    const infoResp = await api.getGroupInfo([groupId]);
    const info = infoResp?.gridInfoMap?.[groupId];
    const name = (info as any)?.name || `group:${groupId}`;
    groupNameCache.set(groupId, { name, cachedAt: Date.now() });
    return name;
  } catch {
    return `group:${groupId}`;
  }
}

function normalizeZaloClawEntry(entry: string): string {
  return entry.replace(/^(zaloclaw|oz):/i, "").trim();
}

function buildNameIndex<T>(items: T[], nameFn: (item: T) => string | undefined): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const item of items) {
    const name = nameFn(item)?.trim().toLowerCase();
    if (!name) continue;
    const list = index.get(name) ?? [];
    list.push(item);
    index.set(name, list);
  }
  return index;
}

type ZaloClawCoreRuntime = ReturnType<typeof getZaloClawRuntime>;

function logVerbose(core: ZaloClawCoreRuntime, runtime: RuntimeEnv, message: string): void {
  if (core.logging.shouldLogVerbose()) {
    runtime.log(`[zaloclaw] ${message}`);
  }
}

function isSenderAllowed(senderId: string, allowFrom: string[]): boolean {
  if (allowFrom.includes("*")) return true;
  const normalizedSenderId = senderId.toLowerCase();
  return allowFrom.some((entry) => {
    const normalized = entry.toLowerCase().replace(/^(zaloclaw|oz):/i, "");
    return normalized === normalizedSenderId;
  });
}

function isSenderDenied(senderId: string, denyFrom: string[]): boolean {
  if (denyFrom.length === 0) return false;
  const normalizedSenderId = senderId.toLowerCase();
  return denyFrom.some((entry) => {
    const normalized = entry.toLowerCase().replace(/^(zaloclaw|oz):/i, "");
    return normalized === normalizedSenderId;
  });
}

function isUserDeniedInGroup(params: {
  senderId: string;
  groupId: string;
  groupName?: string | null;
  groups: Record<string, { denyUsers?: Array<string | number> }>;
}): boolean {
  const groups = params.groups ?? {};
  const candidates = [
    params.groupId,
    `group:${params.groupId}`,
    params.groupName ?? "",
    normalizeGroupSlug(params.groupName ?? ""),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const groupConfig = groups[candidate];
    if (!groupConfig || !groupConfig.denyUsers) continue;
    const denyUsers = groupConfig.denyUsers.map((v) => String(v));
    if (isSenderDenied(params.senderId, denyUsers)) return true;
  }

  const wildcard = groups["*"];
  if (wildcard?.denyUsers) {
    const denyUsers = wildcard.denyUsers.map((v) => String(v));
    if (isSenderDenied(params.senderId, denyUsers)) return true;
  }
  return false;
}

function checkGroupAllowUsers(params: {
  senderId: string;
  groupId: string;
  groupName?: string | null;
  groups: Record<string, { allowUsers?: Array<string | number> }>;
}): boolean | undefined {
  const groups = params.groups ?? {};
  const candidates = [
    params.groupId,
    `group:${params.groupId}`,
    params.groupName ?? "",
    normalizeGroupSlug(params.groupName ?? ""),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const groupConfig = groups[candidate];
    if (groupConfig?.allowUsers && groupConfig.allowUsers.length > 0) {
      return isSenderAllowed(params.senderId, groupConfig.allowUsers.map((v) => String(v)));
    }
  }

  const wildcard = groups["*"];
  if (wildcard?.allowUsers && wildcard.allowUsers.length > 0) {
    return isSenderAllowed(params.senderId, wildcard.allowUsers.map((v) => String(v)));
  }
  return undefined;
}

function normalizeGroupSlug(raw?: string | null): string {
  const trimmed = raw?.trim().toLowerCase() ?? "";
  if (!trimmed) return "";
  return trimmed.replace(/^#/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function isGroupAllowed(params: {
  groupId: string;
  groupName?: string | null;
  groups: Record<string, { allow?: boolean; enabled?: boolean }>;
}): boolean {
  const groups = params.groups ?? {};
  const keys = Object.keys(groups);
  if (keys.length === 0) return false;
  const candidates = [
    params.groupId,
    `group:${params.groupId}`,
    params.groupName ?? "",
    normalizeGroupSlug(params.groupName ?? ""),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const entry = groups[candidate];
    if (!entry) continue;
    return entry.allow !== false && entry.enabled !== false;
  }
  const wildcard = groups["*"];
  if (wildcard) return wildcard.allow !== false && wildcard.enabled !== false;
  return false;
}

function extractMediaFromObject(obj: any, mediaUrls: string[], mediaTypes: string[]): string {
  // Try href (link/attachment messages)
  if (obj.href) {
    mediaUrls.push(obj.href);
    const attachmentType = (obj.type ?? "").toLowerCase();
    let mimeType = "application/octet-stream";
    if (attachmentType.includes("photo") || attachmentType.includes("image")) mimeType = "image/jpeg";
    else if (attachmentType.includes("video")) mimeType = "video/mp4";
    else if (attachmentType.includes("audio")) mimeType = "audio/mpeg";
    mediaTypes.push(mimeType);
  }
  // Try hdUrl/normalUrl/oriUrl/thumb (photo messages)
  const photoUrl = obj.hdUrl || obj.normalUrl || obj.oriUrl || obj.thumb;
  if (photoUrl && !mediaUrls.includes(photoUrl)) {
    mediaUrls.push(photoUrl);
    mediaTypes.push("image/jpeg");
  }
  return obj.title || obj.description || (mediaUrls.length > 0 ? "[Media attachment]" : "");
}

function convertToZaloClawMessage(msg: Message): ZaloClawMessage | null {
  const data = msg.data;
  let content = "";
  const mediaUrls: string[] = [];
  const mediaTypes: string[] = [];

  if (typeof data.content === "string") {
    // Some image messages have JSON-encoded content strings
    const trimmed = data.content.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed !== null) {
          content = extractMediaFromObject(parsed, mediaUrls, mediaTypes);
          if (!content && !mediaUrls.length) content = data.content;
        } else {
          content = data.content;
        }
      } catch {
        content = data.content;
      }
    } else {
      content = data.content;
    }
  } else if (typeof data.content === "object" && data.content !== null) {
    const attachment = data.content as any;
    content = extractMediaFromObject(attachment, mediaUrls, mediaTypes);
    if (!content) content = "[Media attachment]";
  }

  if (!content.trim() && mediaUrls.length === 0) return null;

  // Extract quoted/replied message media (Zalo sends image separately from mention)
  const quote = (data as any).quote as { ownerId?: string; msg?: string; attach?: string; fromD?: string } | undefined;
  if (quote?.attach) {
    try {
      const attachData = JSON.parse(quote.attach);
      const attachList = Array.isArray(attachData) ? attachData : [attachData];
      for (const item of attachList) {
        const url = item.href || item.url || item.thumb;
        if (url && !mediaUrls.includes(url)) {
          mediaUrls.push(url);
          const t = (item.type || "").toLowerCase();
          if (t.includes("photo") || t.includes("image")) mediaTypes.push("image/jpeg");
          else if (t.includes("video")) mediaTypes.push("video/mp4");
          else mediaTypes.push("image/jpeg"); // default assume image
        }
      }
    } catch {
      // attach not parseable JSON, skip
    }
  }

  const isGroup = msg.type === ThreadType.Group;
  const threadId = msg.threadId;
  const rawSenderId = data.uidFrom;
  // Guard: if uidFrom is empty/non-numeric in DM, fall back to threadId with warning
  const senderId = (!isGroup && (!rawSenderId?.trim() || !/^\d+$/.test(rawSenderId.trim())))
    ? (console.warn(`[monitor] DM uidFrom empty/non-numeric ("${rawSenderId}"), falling back to threadId ${threadId}`), threadId)
    : rawSenderId;
  const senderName = data.dName ?? "";
  const timestamp = data.ts ? parseInt(data.ts, 10) : Math.floor(Date.now() / 1000);

  const mentions = isGroup && (msg as GroupMessage).data.mentions
    ? (msg as GroupMessage).data.mentions
    : undefined;

  return {
    threadId,
    msgId: data.msgId,
    cliMsgId: data.cliMsgId,
    type: isGroup ? 1 : 0,
    content: content || "[Media]",
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    mediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
    mentions: mentions ?? undefined,
    timestamp,
    quote: quote ? {
      msg: quote.msg || undefined,
      fromId: quote.ownerId || undefined,
      fromName: quote.fromD || undefined,
      msgId: (quote as any).globalMsgId ? String((quote as any).globalMsgId) : undefined,
      ts: (quote as any).ts || undefined,
    } : undefined,
    metadata: {
      isGroup,
      groupId: isGroup ? threadId : undefined,
      senderName,
      fromId: senderId,
    },
  };
}

async function processMessage(
  message: ZaloClawMessage,
  account: ResolvedZaloClawAccount,
  config: OpenClawConfig,
  core: ZaloClawCoreRuntime,
  runtime: RuntimeEnv,
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void,
): Promise<void> {
  const { threadId, content, timestamp, metadata } = message;
  if (!content?.trim()) return;

  // Record msgId→cliMsgId mapping for reaction/undo lookups
  if (message.msgId && message.cliMsgId) {
    recordMsgId(message.msgId, message.cliMsgId, threadId, metadata?.isGroup ?? false);
  }

  // Cache inbound message for quote-reply support
  if (message.msgId && message.cliMsgId) {
    cacheInboundMessage(threadId, {
      msgId: message.msgId,
      cliMsgId: message.cliMsgId,
      content: typeof message.content === "string" ? message.content : "",
      msgType: (message as any).rawMsgType ?? 0,
      uidFrom: metadata?.fromId ?? "",
      ts: timestamp ?? Math.floor(Date.now() / 1000),
      ttl: 0,
      propertyExt: (message as any).propertyExt,
    });
  }

  const isGroup = metadata?.isGroup ?? false;
  const senderId = metadata?.fromId ?? threadId;
  const senderName = metadata?.senderName ?? "";
  const chatId = threadId;

  // Global denylist check
  const configDenyFrom = (account.config.denyFrom ?? []).map((v) => String(v));
  if (configDenyFrom.length > 0 && isSenderDenied(senderId, configDenyFrom)) {
    logVerbose(core, runtime, `Blocked denied sender ${senderId} via denyFrom`);
    return;
  }

  const defaultGroupPolicy = config.channels?.defaults?.groupPolicy;
  const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "open";
  const groups = account.config.groups ?? {};

  if (isGroup) {
    if (isUserDeniedInGroup({ senderId, groupId: chatId, groups })) {
      logVerbose(core, runtime, `Blocked sender ${senderId} denied in group ${chatId}`);
      return;
    }
    const userAllowed = checkGroupAllowUsers({ senderId, groupId: chatId, groups });
    if (userAllowed === false) {
      logVerbose(core, runtime, `Blocked sender ${senderId} not in group ${chatId} allowUsers`);
      return;
    }
    if (groupPolicy === "disabled") {
      logVerbose(core, runtime, `Drop group ${chatId} (groupPolicy=disabled)`);
      return;
    }
    if (groupPolicy === "allowlist") {
      if (!isGroupAllowed({ groupId: chatId, groups })) {
        logVerbose(core, runtime, `Drop group ${chatId} (not allowlisted)`);
        return;
      }
    }
  }

  const dmPolicy = account.config.dmPolicy ?? "open";
  const configAllowFrom = (account.config.allowFrom ?? ["*"]).map((v) => String(v));

  // Inject reply/quote context into the message content itself
  let effectiveContent = content.trim();
  if (message.quote?.msg) {
    const quoteSender = message.quote.fromName || message.quote.fromId || "unknown";
    effectiveContent = `[Replying to ${quoteSender}: "${message.quote.msg}"]\n${effectiveContent}`;
  }

  const rawBody = effectiveContent;
  const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(rawBody, config);
  const storeAllowFrom =
    !isGroup && (dmPolicy !== "open" || shouldComputeAuth)
      ? await core.channel.pairing.readAllowFromStore({ channel: "zaloclaw", accountId: account.accountId }).catch(() => [])
      : [];
  const effectiveAllowFrom = [...configAllowFrom, ...storeAllowFrom];
  const useAccessGroups = config.commands?.useAccessGroups !== false;
  const senderAllowedForCommands = isSenderAllowed(senderId, effectiveAllowFrom);
  const commandAuthorized = shouldComputeAuth
    ? core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
        useAccessGroups,
        authorizers: [
          { configured: effectiveAllowFrom.length > 0, allowed: senderAllowedForCommands },
        ],
      })
    : undefined;

  if (!isGroup) {
    if (dmPolicy === "disabled") {
      logVerbose(core, runtime, `Blocked DM from ${senderId} (dmPolicy=disabled)`);
      return;
    }
    if (dmPolicy !== "open") {
      if (!senderAllowedForCommands) {
        if (dmPolicy === "pairing") {
          const { code, created } = await core.channel.pairing.upsertPairingRequest({
            channel: "zaloclaw",
            id: senderId,
            accountId: account.accountId,
            meta: { name: senderName || undefined },
          });
          if (created) {
            logVerbose(core, runtime, `pairing request sender=${senderId}`);
            try {
              await sendMessageZaloClaw(
                chatId,
                core.channel.pairing.buildPairingReply({
                  channel: "zaloclaw",
                  idLine: `Your Zalo user id: ${senderId}`,
                  code,
                }),
              );
              statusSink?.({ lastOutboundAt: Date.now() });
            } catch {}
          }
        } else {
          logVerbose(core, runtime, `Blocked unauthorized sender ${senderId} (dmPolicy=${dmPolicy})`);
        }
        return;
      }
    }
  }

  if (
    isGroup &&
    core.channel.commands.isControlCommandMessage(rawBody, config) &&
    commandAuthorized !== true
  ) {
    logVerbose(core, runtime, `Drop control command from unauthorized sender ${senderId}`);
    return;
  }

  // Mention gating for groups
  const selfUid = getCurrentUid() ?? (await getApi()).getOwnId();
  const wasMentioned = isGroup && selfUid
    ? (message.mentions ?? []).some(m => m.uid === selfUid)
    : false;

  const resolvedRequireMention = isGroup
    ? resolveGroupMentionSetting(account, chatId)
    : false;

  const hasControlCommand = core.channel.commands.isControlCommandMessage(rawBody, config);

  if (isGroup && resolvedRequireMention) {
    const mentionGate = resolveMentionGatingWithBypass({
      isGroup: true,
      requireMention: true,
      canDetectMention: true,
      wasMentioned,
      allowTextCommands: true,
      hasControlCommand,
      commandAuthorized: commandAuthorized === true,
    });

    if (mentionGate.shouldSkip) {
      const resolvedName = senderName || await resolveUserName(senderId);
      // Download media for buffered messages too, so they're available when bot is mentioned later
      let bufferedLocalPaths: string[] | undefined;
      if (message.mediaUrls && message.mediaUrls.length > 0) {
        const downloaded = await downloadImagesFromUrls(message.mediaUrls);
        bufferedLocalPaths = downloaded.filter((p): p is string => p !== undefined);
      }
      bufferGroupMessage(chatId, {
        senderName: resolvedName,
        content: rawBody,
        timestamp: timestamp ?? Math.floor(Date.now() / 1000),
        mediaUrls: message.mediaUrls,
        localMediaPaths: bufferedLocalPaths,
      });
      logVerbose(core, runtime, `Buffered non-mention message in group ${chatId} from ${senderId}`);
      return;
    }
  }

  const peer = isGroup
    ? { kind: "group" as const, id: chatId }
    : { kind: "direct" as const, id: senderId };

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "zaloclaw",
    accountId: account.accountId,
    peer: { kind: peer.kind, id: peer.id },
  });

  const resolvedSenderName = senderName || await resolveUserName(senderId);
  const fromLabel = isGroup
    ? await resolveGroupName(chatId)
    : resolvedSenderName || `user:${senderId}`;

  // Auto-typing: immediately show typing indicator when processing starts
  try {
    const api = await getApi();
    const type = isGroup ? ThreadType.Group : ThreadType.User;
    await api.sendTypingEvent(chatId, type);
  } catch {
    // fire-and-forget — typing failure should never block message processing
  }

  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  const bufferedContext = isGroup ? consumeGroupBuffer(chatId) : { text: "" };

  // Prepend sender context for group messages so the AI knows who sent what
  let bodyWithSender = isGroup
    ? `[userId: ${senderId}, name: ${resolvedSenderName}]: ${rawBody}`
    : rawBody;

  // Prepend quoted/replied message context so the AI sees what was replied to
  // (quote already injected into rawBody above)

  if (bufferedContext.text) {
    bodyWithSender = `[Recent group chat (context only, not addressed to you):\n${bufferedContext.text}\n]\n\n${bodyWithSender}`;
  }

  // --- Auto fetch user info for mentioned users (excluding self) ---
  if (isGroup && message.mentions && message.mentions.length > 0) {
    const mentionedUserIds = message.mentions
      .filter(m => m.type === 0 && m.uid && m.uid !== getCurrentUid()) // type 0 = user, skip bot self
      .map(m => m.uid);

    if (mentionedUserIds.length > 0) {
      try {
        const api = await getApi();
        const userInfos: string[] = [];
        for (const uid of mentionedUserIds) {
          try {
            const result = await api.getUserInfo(uid);
            const info = (result as any)?.changed_profiles?.[uid];
            if (info) {
              const name = info.displayName ?? info.zaloName ?? uid;
              const gender = info.gender ? ` | gender: ${info.gender}` : "";
              const dob = info.dob ? ` | dob: ${info.dob}` : "";
              userInfos.push(`  - @${name} (userId: ${uid}${gender}${dob})`);
            } else {
              userInfos.push(`  - userId: ${uid} (profile not available)`);
            }
          } catch {
            userInfos.push(`  - userId: ${uid} (lookup failed)`);
          }
        }
        if (userInfos.length > 0) {
          bodyWithSender = `[Mentioned users:\n${userInfos.join("\n")}\n]\n\n${bodyWithSender}`;
        }
      } catch {
        // getApi failed — skip mention enrichment
      }
    }
  }

  // Only process images in DMs or when bot was mentioned in groups
  const shouldProcessImages = !isGroup || wasMentioned;

  let localMediaPaths: string[] | undefined;
  if (shouldProcessImages && message.mediaUrls && message.mediaUrls.length > 0) {
    console.log(`[zaloclaw] Downloading ${message.mediaUrls.length} images for native image support...`);
    const downloadedPaths = await downloadImagesFromUrls(message.mediaUrls);
    localMediaPaths = downloadedPaths.filter((p): p is string => p !== undefined);

    if (localMediaPaths.length > 0) {
      console.log(`[zaloclaw] Downloaded ${localMediaPaths.length} images → ${localMediaPaths.join(", ")}`);
    }
  } else if (!shouldProcessImages && message.mediaUrls && message.mediaUrls.length > 0) {
    logVerbose(core, runtime, `Skipping ${message.mediaUrls.length} image(s) in group ${chatId} (not mentioned)`);
  }

  // Only use images from current message (includes reply-target attachments extracted by convertToZaloClawMessage)
  // No buffer media merge — prevents cross-message media contamination
  const effectiveLocalMediaPaths = localMediaPaths && localMediaPaths.length > 0 ? localMediaPaths : undefined;

  // Append media to body - use LOCAL paths if downloaded, otherwise URLs
  let bodyForEnvelope = bodyWithSender;
  if (shouldProcessImages) {
    const mediaPathsForBody = effectiveLocalMediaPaths && effectiveLocalMediaPaths.length > 0 ? effectiveLocalMediaPaths : message.mediaUrls;
    if (mediaPathsForBody && mediaPathsForBody.length > 0) {
      const mediaInfo = mediaPathsForBody.map((p, idx) => `[Image ${idx + 1}: ${p}]`).join('\n');
      bodyForEnvelope = `${bodyWithSender}\n\n${mediaInfo}`;
    }
  }

  const body = core.channel.reply.formatAgentEnvelope({
    channel: "Zalo JS",
    from: fromLabel,
    timestamp: timestamp ? timestamp * 1000 : undefined,
    previousTimestamp,
    envelope: envelopeOptions,
    body: bodyForEnvelope,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: isGroup ? `'zaloclaw':group:${chatId}` : `'zaloclaw':${senderId}`,
    To: `'zaloclaw':${chatId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: fromLabel,
    SenderName: resolvedSenderName || undefined,
    SenderId: senderId,
    CommandAuthorized: commandAuthorized,
    Provider: "zaloclaw",
    Surface: "zaloclaw",
    MessageSid: message.msgId ?? `${timestamp}`,
    OriginatingChannel: "zaloclaw",
    OriginatingTo: `'zaloclaw':${chatId}`,
    WasMentioned: wasMentioned || undefined,
    // Only attach media when mentioned (groups) or in DMs
    MediaPaths: shouldProcessImages && effectiveLocalMediaPaths && effectiveLocalMediaPaths.length > 0 ? effectiveLocalMediaPaths : undefined,
    MediaPath: shouldProcessImages && effectiveLocalMediaPaths && effectiveLocalMediaPaths.length > 0 ? effectiveLocalMediaPaths[0] : undefined,
    MediaUrls: shouldProcessImages && effectiveLocalMediaPaths && effectiveLocalMediaPaths.length > 0 ? undefined : (shouldProcessImages ? message.mediaUrls : undefined),
    MediaUrl: shouldProcessImages && effectiveLocalMediaPaths && effectiveLocalMediaPaths.length > 0 ? undefined : (shouldProcessImages ? message.mediaUrls?.[0] : undefined),
    MediaTypes: shouldProcessImages ? message.mediaTypes : undefined,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`Failed updating session meta: ${String(err)}`);
    },
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: "zaloclaw",
    accountId: account.accountId,
  });

  // Ack reaction
  const ackReaction = (config.messages?.ackReaction ?? "").trim();
  const ackScope = config.messages?.ackReactionScope ?? "group-mentions";
  const removeAckAfterReply = config.messages?.removeAckAfterReply ?? false;

  const shouldAck = Boolean(
    ackReaction &&
      core.channel.reactions.shouldAckReaction({
        scope: ackScope,
        isDirect: !isGroup,
        isGroup,
        isMentionableGroup: isGroup,
        requireMention: false,
        canDetectMention: false,
        effectiveWasMentioned: true,
        shouldBypassMention: true,
      }),
  );

  let ackReactionPromise: Promise<boolean> | null = null;
  if (shouldAck && message.msgId && message.cliMsgId) {
    const ackMsgId = message.msgId;
    const ackCliMsgId = message.cliMsgId;
    ackReactionPromise = (async () => {
      try {
        const api = await getApi();
        const type = isGroup ? ThreadType.Group : ThreadType.User;
        const iconMap: Record<string, Reactions> = {
          heart: Reactions.HEART, love: Reactions.HEART, like: Reactions.LIKE,
          haha: Reactions.HAHA, wow: Reactions.WOW, sad: Reactions.CRY,
          cry: Reactions.CRY, angry: Reactions.ANGRY,
          "👍": Reactions.LIKE, "❤️": Reactions.HEART, "😆": Reactions.HAHA,
          "😮": Reactions.WOW, "😢": Reactions.CRY, "😠": Reactions.ANGRY,
          "👀": Reactions.SURPRISE,
        };
        const reactionIcon = iconMap[ackReaction.toLowerCase()] ?? (ackReaction as Reactions);
        await api.addReaction(reactionIcon, {
          data: { msgId: ackMsgId, cliMsgId: ackCliMsgId },
          threadId: chatId,
          type,
        });
        return true;
      } catch (err) {
        logAckFailure({
          log: (msg) => logVerbose(core, runtime, msg),
          channel: "zaloclaw",
          target: chatId,
          error: err,
        });
        return false;
      }
    })();
  }

  // Typing indicator
  const typingCallbacks = createTypingCallbacks({
    start: async () => {
      const api = await getApi();
      const type = isGroup ? ThreadType.Group : ThreadType.User;
      await api.sendTypingEvent(chatId, type);
    },
    onStartError: (err) => {
      logTypingFailure({
        log: (msg) => logVerbose(core, runtime, msg),
        channel: "zaloclaw",
        target: chatId,
        action: "start",
        error: err,
      });
    },
  });

  // Get quote for reply-to-specific-message
  const quoteForReply = getQuoteForThread(chatId);

  try {
    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: config,
      dispatcherOptions: {
        ...prefixOptions,
        deliver: async (payload) => {
          await deliverZaloClawReply({
            payload: payload as { text?: string; mediaUrls?: string[]; mediaUrl?: string; isReasoning?: boolean },
            chatId,
            isGroup,
            runtime,
            core,
            config,
            accountId: account.accountId,
            statusSink,
            quote: quoteForReply,
            tableMode: core.channel.text.resolveMarkdownTableMode({
              cfg: config,
              channel: "zaloclaw",
              accountId: account.accountId,
            }),
          });
        },
        onError: (err, info) => {
          runtime.error(`[${account.accountId}] reply failed: ${String(err)}`);
        },
        onReplyStart: typingCallbacks.onReplyStart,
        onIdle: typingCallbacks.onIdle,
        onCleanup: typingCallbacks.onCleanup,
      },
      replyOptions: { onModelSelected },
    });
  } finally {
    if (shouldAck && message.msgId && message.cliMsgId) {
      const removeMsgId = message.msgId;
      const removeCliMsgId = message.cliMsgId;
      core.channel.reactions.removeAckReactionAfterReply({
        removeAfterReply: removeAckAfterReply,
        ackReactionPromise,
        ackReactionValue: ackReaction || null,
        remove: async () => {
          const api = await getApi();
          const type = isGroup ? ThreadType.Group : ThreadType.User;
          await api.addReaction(Reactions.NONE, {
            data: { msgId: removeMsgId, cliMsgId: removeCliMsgId },
            threadId: chatId,
            type,
          });
        },
        onError: (err) => {
          logAckFailure({
            log: (msg) => logVerbose(core, runtime, msg),
            channel: "zaloclaw",
            target: chatId,
            error: err,
          });
        },
      });
    }
  }
}

function resolveGroupMentionSetting(account: ResolvedZaloClawAccount, groupId: string): boolean {
  const groups = account.config.groups ?? {};
  const candidates = [groupId, `group:${groupId}`, "*"];
  for (const key of candidates) {
    const entry = groups[key];
    if (entry && typeof entry.requireMention === "boolean") return entry.requireMention;
  }
  return true;
}

const THINKING_TAG_RE = /^\s*<(?:think|thinking|thought|antthinking)\b[^>]*>/i;
const REASONING_PREFIX = "Reasoning:\n";

function isReasoningOnlyMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(REASONING_PREFIX)) return true;
  if (THINKING_TAG_RE.test(trimmed)) return true;
  return false;
}

function stripThinkingTags(text: string): string {
  return text.replace(/<(?:think|thinking|thought|antthinking)\b[^>]*>[\s\S]*?<\/(?:think|thinking|thought|antthinking)>/gi, "").trim();
}

async function deliverZaloClawReply(params: {
  payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string; isReasoning?: boolean };
  chatId: string;
  isGroup: boolean;
  runtime: RuntimeEnv;
  core: ZaloClawCoreRuntime;
  config: OpenClawConfig;
  accountId?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  quote?: SendMessageQuote;
  tableMode?: MarkdownTableMode;
}): Promise<void> {
  const { payload, chatId, isGroup, runtime, core, config, accountId, statusSink } = params;

  if (payload.isReasoning) {
    logVerbose(core, runtime, `Skipping reasoning block for ${chatId}`);
    return;
  }

  const tableMode = params.tableMode ?? "code";
  let text = core.channel.text.convertMarkdownTables(payload.text ?? "", tableMode);

  if (text && isReasoningOnlyMessage(text)) {
    logVerbose(core, runtime, `Skipping reasoning-only message for ${chatId}`);
    return;
  }
  text = stripThinkingTags(text);

  const mediaList = payload.mediaUrls?.length
    ? payload.mediaUrls
    : payload.mediaUrl
      ? [payload.mediaUrl]
      : [];

  // Quote is only attached to the first outbound message (first media or first chunk)
  let quoteUsed = false;
  const getQuoteOnce = () => {
    if (quoteUsed || !params.quote) return undefined;
    quoteUsed = true;
    return params.quote;
  };

  if (mediaList.length > 0) {
    let first = true;
    for (const mediaUrl of mediaList) {
      const caption = first ? text : undefined;
      first = false;
      try {
        await sendMessageZaloClaw(chatId, caption ?? "", { mediaUrl, isGroup, quote: getQuoteOnce() });
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime.error(`Media send failed: ${String(err)}`);
      }
    }
    return;
  }

  if (text) {
    const chunkMode = core.channel.text.resolveChunkMode(config, "zaloclaw", accountId);
    const chunks = core.channel.text.chunkMarkdownTextWithMode(text, ZALOJS_TEXT_LIMIT, chunkMode);
    logVerbose(core, runtime, `Sending ${chunks.length} text chunk(s) to ${chatId}`);
    for (const chunk of chunks) {
      try {
        await sendMessageZaloClaw(chatId, chunk, { isGroup, quote: getQuoteOnce() });
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime.error(`Message send failed: ${String(err)}`);
      }
    }
  }
}

export async function monitorZaloClawProvider(
  options: ZaloClawMonitorOptions,
): Promise<ZaloClawMonitorResult> {
  let { account, config } = options;
  const { abortSignal, statusSink, runtime } = options;

  const core = getZaloClawRuntime();
  let stopped = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  let resolveRunning: (() => void) | null = null;

  // Resolve allowFrom name→id mappings
  try {
    const allowFromEntries = (account.config.allowFrom ?? [])
      .map((entry) => normalizeZaloClawEntry(String(entry)))
      .filter((entry) => entry && entry !== "*");

    if (allowFromEntries.length > 0) {
      try {
        const api = await getApi();
        const friends = await api.getAllFriends();
        const friendList: ZaloClawFriend[] = Array.isArray(friends)
          ? friends.map((f: any) => ({
              userId: String(f.userId),
              displayName: f.displayName ?? f.zaloName ?? "",
              avatar: f.avatar,
            }))
          : [];
        const byName = buildNameIndex(friendList, (friend) => friend.displayName);
        const additions: string[] = [];
        const mapping: string[] = [];
        const unresolved: string[] = [];
        for (const entry of allowFromEntries) {
          if (/^\d+$/.test(entry)) { additions.push(entry); continue; }
          const matches = byName.get(entry.toLowerCase()) ?? [];
          const match = matches[0];
          const id = match?.userId ? String(match.userId) : undefined;
          if (id) { additions.push(id); mapping.push(`${entry}→${id}`); }
          else { unresolved.push(entry); }
        }
        const allowFrom = mergeAllowlist({ existing: account.config.allowFrom, additions });
        account = { ...account, config: { ...account.config, allowFrom } };
        summarizeMapping("zaloclaw users", mapping, unresolved, runtime);
      } catch (err) {
        runtime.log?.(`zaloclaw user resolve failed. ${String(err)}`);
      }
    }

    // Resolve denyFrom
    const denyFromEntries = (account.config.denyFrom ?? [])
      .map((entry) => normalizeZaloClawEntry(String(entry)))
      .filter((entry) => entry && entry !== "*");

    if (denyFromEntries.length > 0) {
      try {
        const api = await getApi();
        const friends = await api.getAllFriends();
        const friendList: ZaloClawFriend[] = Array.isArray(friends)
          ? friends.map((f: any) => ({
              userId: String(f.userId),
              displayName: f.displayName ?? f.zaloName ?? "",
              avatar: f.avatar,
            }))
          : [];
        const byName = buildNameIndex(friendList, (friend) => friend.displayName);
        const additions: string[] = [];
        const mapping: string[] = [];
        const unresolved: string[] = [];
        for (const entry of denyFromEntries) {
          if (/^\d+$/.test(entry)) { additions.push(entry); continue; }
          const matches = byName.get(entry.toLowerCase()) ?? [];
          const match = matches[0];
          const id = match?.userId ? String(match.userId) : undefined;
          if (id) { additions.push(id); mapping.push(`${entry}→${id}`); }
          else { unresolved.push(entry); }
        }
        const denyFrom = mergeAllowlist({ existing: account.config.denyFrom, additions });
        account = { ...account, config: { ...account.config, denyFrom } };
        summarizeMapping("zaloclaw blocked users", mapping, unresolved, runtime);
      } catch (err) {
        runtime.log?.(`zaloclaw denyFrom resolve failed. ${String(err)}`);
      }
    }

    // Resolve group name→id mappings
    const groupsConfig = account.config.groups ?? {};
    const groupKeys = Object.keys(groupsConfig).filter((key) => key !== "*");
    if (groupKeys.length > 0) {
      try {
        const api = await getApi();
        const groupsResp = await api.getAllGroups();
        const groupIds = Object.keys(groupsResp?.gridVerMap ?? {});
        let groupList: ZaloClawGroup[] = [];
        if (groupIds.length > 0) {
          try {
            const infoResp = await api.getGroupInfo(groupIds);
            const gridInfoMap = infoResp?.gridInfoMap ?? {};
            groupList = Object.entries(gridInfoMap).map(([id, info]: [string, any]) => ({
              groupId: id, name: info.name ?? "", memberCount: info.totalMember,
            }));
          } catch {
            groupList = groupIds.map((id) => ({ groupId: id, name: "", memberCount: 0 }));
          }
        }
        const byName = buildNameIndex(groupList, (group) => group.name);
        const mapping: string[] = [];
        const unresolved: string[] = [];
        const nextGroups = { ...groupsConfig };
        for (const entry of groupKeys) {
          const cleaned = normalizeZaloClawEntry(entry);
          if (/^\d+$/.test(cleaned)) {
            if (!nextGroups[cleaned]) nextGroups[cleaned] = groupsConfig[entry];
            mapping.push(`${entry}→${cleaned}`);
            continue;
          }
          const matches = byName.get(cleaned.toLowerCase()) ?? [];
          const match = matches[0];
          const id = match?.groupId ? String(match.groupId) : undefined;
          if (id) {
            if (!nextGroups[id]) nextGroups[id] = groupsConfig[entry];
            mapping.push(`${entry}→${id}`);
          } else {
            unresolved.push(entry);
          }
        }

        // Resolve denyUsers within each group
        for (const groupKey of Object.keys(nextGroups)) {
          const groupConfig = nextGroups[groupKey];
          if (!groupConfig.denyUsers || groupConfig.denyUsers.length === 0) continue;
          const denyUserEntries = groupConfig.denyUsers
            .map((entry) => normalizeZaloClawEntry(String(entry)))
            .filter((entry) => entry && entry !== "*");
          if (denyUserEntries.length === 0) continue;

          const friends = await api.getAllFriends();
          const friendList: ZaloClawFriend[] = Array.isArray(friends)
            ? friends.map((f: any) => ({
                userId: String(f.userId),
                displayName: f.displayName ?? f.zaloName ?? "",
                avatar: f.avatar,
              }))
            : [];
          const friendByName = buildNameIndex(friendList, (friend) => friend.displayName);
          const userAdditions: string[] = [];
          const userMapping: string[] = [];
          const userUnresolved: string[] = [];
          for (const entry of denyUserEntries) {
            if (/^\d+$/.test(entry)) { userAdditions.push(entry); continue; }
            const matches = friendByName.get(entry.toLowerCase()) ?? [];
            const match = matches[0];
            const id = match?.userId ? String(match.userId) : undefined;
            if (id) { userAdditions.push(id); userMapping.push(`${entry}→${id}`); }
            else { userUnresolved.push(entry); }
          }
          const resolvedDenyUsers = mergeAllowlist({ existing: groupConfig.denyUsers, additions: userAdditions });
          nextGroups[groupKey] = { ...groupConfig, denyUsers: resolvedDenyUsers };
          if (userMapping.length > 0 || userUnresolved.length > 0) {
            summarizeMapping(`zaloclaw group:${groupKey} blocked users`, userMapping, userUnresolved, runtime);
          }
        }

        account = { ...account, config: { ...account.config, groups: nextGroups } };
        summarizeMapping("zaloclaw groups", mapping, unresolved, runtime);
      } catch (err) {
        runtime.log?.(`zaloclaw group resolve failed. ${String(err)}`);
      }
    }
  } catch (err) {
    runtime.log?.(`zaloclaw resolve failed. ${String(err)}`);
  }

  const stop = () => {
    stopped = true;
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
    resolveRunning?.();
  };

  let listenersRegistered = false;

  const startListener = async () => {
    if (stopped || abortSignal.aborted) { resolveRunning?.(); return; }
    logVerbose(core, runtime, `[${account.accountId}] starting zca-js listener`);
    try {
      const api = await getApi();
      const selfUid = getCurrentUid() ?? api.getOwnId();
      if (listenersRegistered) {
        try { api.listener.stop(); } catch {}
        api.listener.start({ retryOnClose: true });
        return;
      }
      listenersRegistered = true;

      // --- Prefill group message buffer from chat history on startup ---
      const groupIds = Object.keys(account.config.groups ?? {}).filter(k => k.startsWith("group:") || /^\d+$/.test(k));
      if (groupIds.length > 0) {
        for (const groupId of groupIds) {
          try {
            const history = await api.getGroupChatHistory(groupId, 20);
            const msgs = (history as any)?.groupMsgs ?? [];
            for (const gm of msgs) {
              const gmData = (gm as any).data ?? gm;
              const gmContent = typeof gmData.content === "string" ? gmData.content : "";
              const gmSenderName = gmData.dName ?? gmData.uidFrom ?? "unknown";
              const gmTs = gmData.ts ? parseInt(gmData.ts, 10) : 0;
              if (gmContent && gmTs > 0) {
                bufferGroupMessage(groupId, {
                  senderName: gmSenderName,
                  content: gmContent,
                  timestamp: gmTs,
                });
              }
            }
            if (msgs.length > 0) {
              logVerbose(core, runtime, `[${account.accountId}] Prefilled ${msgs.length} messages for group ${groupId}`);
            }
          } catch (err) {
            logVerbose(core, runtime, `[${account.accountId}] Failed to prefill history for group ${groupId}: ${String(err)}`);
          }
        }
      }

      // --- Per-thread message queue (serialized per conversation, global concurrency limit) ---
      // Modeled after openclaw/telegram's @grammyjs/runner sink.concurrency pattern.
      const messageQueue = new ThreadMessageQueue<ZaloClawMessage>({
        maxConcurrent: 4,
        maxPerThread: 10,
        maxAgeMs: 5 * 60 * 1000, // 5 minutes
        processingTimeoutMs: 3 * 60 * 1000, // 3 minutes
        handler: (message) =>
          processMessage(message, account, config, core, runtime, statusSink),
        onDrop: (threadId, dropped) => {
          logVerbose(core, runtime, `[${account.accountId}] queue overflow: dropped oldest message in thread ${threadId} (msgId=${(dropped.data as ZaloClawMessage).msgId ?? "?"})`);
        },
        onTimeout: (threadId) => {
          runtime.error(`[${account.accountId}] message processing timed out for thread ${threadId}`);
        },
        onError: (threadId, err) => {
          runtime.error(`[${account.accountId}] Failed to process message in thread ${threadId}: ${String(err)}`);
        },
        onStale: (threadId, entry) => {
          logVerbose(core, runtime, `[${account.accountId}] skipped stale message in thread ${threadId} (age=${Math.round((Date.now() - entry.enqueuedAt) / 1000)}s)`);
        },
      });

      api.listener.on("message", (msg: Message) => {
        if (msg.isSelf) return;
        if (selfUid && msg.data.uidFrom === selfUid) return;
        // Dedup by msgId to prevent duplicate processing of delivery-mirror events
        if (isDuplicateMsg(msg.data.msgId)) {
          logVerbose(core, runtime, `[${account.accountId}] skipping duplicate msgId ${msg.data.msgId}`);
          return;
        }
        const converted = convertToZaloClawMessage(msg);
        if (!converted) return;
        logVerbose(core, runtime, `[${account.accountId}] inbound message`);
        statusSink?.({ lastInboundAt: Date.now() });
        messageQueue.enqueue(converted.threadId, converted);
      });

      api.listener.on("friend_event", (event: FriendEvent) => {
        try {
          if (event.type === FriendEventType.REQUEST && !event.isSelf) {
            const data = event.data as { fromUid: string; message: string; src?: number };
            addPendingRequest(data.fromUid, data.message, data.src);
            runtime.log?.(`[${account.accountId}] friend request from ${data.fromUid}`);
          } else if (event.type === FriendEventType.UNDO_REQUEST) {
            const data = event.data as { fromUid: string };
            removePendingRequest(data.fromUid);
          } else if (event.type === FriendEventType.ADD) {
            removePendingRequest(event.data as string);
          }
        } catch (err) {
          runtime.error(`[${account.accountId}] friend event error: ${String(err)}`);
        }
      });

      // Reaction events from other users
      api.listener.on("reaction", (reaction: Reaction) => {
        if (reaction.isSelf) return;
        const icon = reaction.data.content?.rIcon || "";
        const fromUid = reaction.data.uidFrom;
        const threadId = reaction.threadId;
        const isGroup = reaction.isGroup;
        logVerbose(core, runtime, `[${account.accountId}] reaction: ${icon} from ${fromUid} in ${isGroup ? "group" : "dm"} ${threadId}`);
      });

      // Typing events from other users
      api.listener.on("typing", (typing: Typing) => {
        if (typing.isSelf) return;
        const threadId = typing.threadId;
        const isGroup = typing.type === ThreadType.Group;
        logVerbose(core, runtime, `[${account.accountId}] typing in ${isGroup ? "group" : "dm"} ${threadId}`);
      });

      // Read/seen receipts
      api.listener.on("seen_messages", (seenObjects: Array<{ threadId: string; uid?: string; msgId?: string }>) => {
        for (const seen of seenObjects) {
          if (seen.threadId && seen.uid) {
            recordReadReceipt(seen.threadId, seen.uid);
          }
        }
        logVerbose(core, runtime, `[${account.accountId}] seen_messages: ${seenObjects.length} entries`);
      });

      api.listener.on("error", (err: unknown) => {
        runtime.error(`[${account.accountId}] listener error: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
      });

      api.listener.on("closed", (code: number, reason: string) => {
        runtime.log?.(`[${account.accountId}] listener closed: code=${code} reason=${reason}`);
        if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
        if (stopped || abortSignal.aborted) resolveRunning?.();
      });

      api.listener.on("connected", () => {
        logVerbose(core, runtime, `[${account.accountId}] listener connected`);
      });

      api.listener.start({ retryOnClose: true });

      // KeepAlive heartbeat
      const keepaliveDuration = api.getContext().settings?.keepalive?.keepalive_duration;
      if (keepaliveDuration && keepaliveDuration > 0) {
        const intervalMs = keepaliveDuration * 1000;
        runtime.log?.(`[${account.accountId}] keepAlive: ${keepaliveDuration}s interval`);
        keepAliveTimer = setInterval(async () => {
          if (stopped || abortSignal.aborted) return;
          try {
            await api.keepAlive();
            const jar = api.getCookie();
            const serialized = jar.serializeSync?.()?.cookies ?? jar.toJSON?.()?.cookies;
            if (serialized) refreshCredentials(serialized);
          } catch (err) {
            runtime.error(`[${account.accountId}] keepAlive failed: ${String(err)}`);
          }
        }, intervalMs);
      }
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes("Already started")) {
        runtime.log?.(`[${account.accountId}] listener already running`);
        return;
      }
      runtime.error(`[${account.accountId}] listener start failed: ${errMsg}`);
      if (!stopped && !abortSignal.aborted) {
        logVerbose(core, runtime, `[${account.accountId}] retrying in 10s...`);
        restartTimer = setTimeout(startListener, 10000);
      } else {
        resolveRunning?.();
      }
    }
  };

  const runningPromise = new Promise<void>((resolve) => {
    resolveRunning = resolve;
    abortSignal.addEventListener("abort", () => { stop(); resolve(); }, { once: true });
  });

  await startListener();
  await runningPromise;

  return { stop };
}
