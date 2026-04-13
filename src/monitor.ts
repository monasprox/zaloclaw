import type { OpenClawConfig, MarkdownTableMode, RuntimeEnv } from "openclaw/plugin-sdk/channel-plugin-common";
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

import { ThreadType, FriendEventType, Reactions, type API, type Message, type UserMessage, type GroupMessage, type FriendEvent, type Reaction, type Typing } from "zca-js";
import type { ResolvedZaloPersonalAccount, ZaloPersonalFriend, ZaloPersonalGroup, ZaloPersonalMessage } from "./types.js";
import { getZaloPersonalRuntime } from "./runtime.js";
import { sendMessageZaloPersonal } from "./send.js";
import { getApi, getCurrentUid } from "./zalo-client.js";
import { downloadImagesFromUrls } from "./image-downloader.js";
import { getThreadMediaDir } from "./thread-sandbox.js";
import { addPendingRequest, removePendingRequest } from "./friend-request-store.js";
import { recordReadReceipt } from "./features/read-receipt.js";
import { recordMsgId } from "./features/msg-id-store.js";
import { refreshCredentials } from "./credentials.js";

export type ZaloPersonalMonitorOptions = {
  account: ResolvedZaloPersonalAccount;
  config: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

export type ZaloPersonalMonitorResult = {
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
}>>();
const GROUP_BUFFER_MAX_MESSAGES = 50;
const GROUP_BUFFER_MAX_AGE_S = 4 * 60 * 60;

function bufferGroupMessage(groupId: string, entry: { senderName: string; content: string; timestamp: number }): void {
  let buffer = groupMessageBuffer.get(groupId) ?? [];
  buffer.push(entry);
  const cutoff = Math.floor(Date.now() / 1000) - GROUP_BUFFER_MAX_AGE_S;
  buffer = buffer.filter(m => m.timestamp > cutoff).slice(-GROUP_BUFFER_MAX_MESSAGES);
  groupMessageBuffer.set(groupId, buffer);
}

function consumeGroupBuffer(groupId: string): string {
  const buffer = groupMessageBuffer.get(groupId);
  if (!buffer || buffer.length === 0) return "";
  const lines = buffer.map(m => `[${m.senderName}]: ${m.content}`);
  groupMessageBuffer.delete(groupId);
  return lines.join("\n");
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

function normalizeZaloPersonalEntry(entry: string): string {
  return entry.replace(/^(opclaw-zalo|oz):/i, "").trim();
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

type ZaloPersonalCoreRuntime = ReturnType<typeof getZaloPersonalRuntime>;

function logVerbose(core: ZaloPersonalCoreRuntime, runtime: RuntimeEnv, message: string): void {
  if (core.logging.shouldLogVerbose()) {
    runtime.log(`[opclaw-zalo] ${message}`);
  }
}

function isSenderAllowed(senderId: string, allowFrom: string[]): boolean {
  if (allowFrom.includes("*")) return true;
  const normalizedSenderId = senderId.toLowerCase();
  return allowFrom.some((entry) => {
    const normalized = entry.toLowerCase().replace(/^(opclaw-zalo|oz):/i, "");
    return normalized === normalizedSenderId;
  });
}

function isSenderDenied(senderId: string, denyFrom: string[]): boolean {
  if (denyFrom.length === 0) return false;
  const normalizedSenderId = senderId.toLowerCase();
  return denyFrom.some((entry) => {
    const normalized = entry.toLowerCase().replace(/^(opclaw-zalo|oz):/i, "");
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

function convertToZaloPersonalMessage(msg: Message): ZaloPersonalMessage | null {
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

  const isGroup = msg.type === ThreadType.Group;
  const threadId = msg.threadId;
  const rawSenderId = data.uidFrom;
  const senderId = !isGroup && !/^\d+$/.test(rawSenderId) ? threadId : rawSenderId;
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
    metadata: {
      isGroup,
      groupId: isGroup ? threadId : undefined,
      senderName,
      fromId: senderId,
    },
  };
}

async function processMessage(
  message: ZaloPersonalMessage,
  account: ResolvedZaloPersonalAccount,
  config: OpenClawConfig,
  core: ZaloPersonalCoreRuntime,
  runtime: RuntimeEnv,
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void,
): Promise<void> {
  const { threadId, content, timestamp, metadata } = message;
  if (!content?.trim()) return;

  // Record msgId→cliMsgId mapping for reaction/undo lookups
  if (message.msgId && message.cliMsgId) {
    recordMsgId(message.msgId, message.cliMsgId, threadId, metadata?.isGroup ?? false);
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
  const rawBody = content.trim();
  const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(rawBody, config);
  const storeAllowFrom =
    !isGroup && (dmPolicy !== "open" || shouldComputeAuth)
      ? await core.channel.pairing.readAllowFromStore("opclaw-zalo").catch(() => [])
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
            channel: "opclaw-zalo",
            id: senderId,
            meta: { name: senderName || undefined },
          });
          if (created) {
            logVerbose(core, runtime, `pairing request sender=${senderId}`);
            try {
              await sendMessageZaloPersonal(
                chatId,
                core.channel.pairing.buildPairingReply({
                  channel: "opclaw-zalo",
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
  const selfUid = getCurrentUid();
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
      bufferGroupMessage(chatId, {
        senderName: resolvedName,
        content: rawBody,
        timestamp: timestamp ?? Math.floor(Date.now() / 1000),
      });
      logVerbose(core, runtime, `Buffered non-mention message in group ${chatId}`);
      return;
    }
  }

  const peer = isGroup
    ? { kind: "group" as const, id: chatId }
    : { kind: "direct" as const, id: senderId };

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "opclaw-zalo",
    accountId: account.accountId,
    peer: { kind: peer.kind, id: peer.id },
  });

  const resolvedSenderName = senderName || await resolveUserName(senderId);
  const fromLabel = isGroup
    ? await resolveGroupName(chatId)
    : resolvedSenderName || `user:${senderId}`;
  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });

  const bufferedContext = isGroup ? consumeGroupBuffer(chatId) : "";

  let bodyWithSender = isGroup
    ? `[userId: ${senderId}, name: ${resolvedSenderName}]: ${rawBody}`
    : rawBody;

  if (bufferedContext) {
    bodyWithSender = `[Recent group chat (context only, not addressed to you):\n${bufferedContext}\n]\n\n${bodyWithSender}`;
  }

  // Download media
  let localMediaPaths: string[] | undefined;
  if (message.mediaUrls && message.mediaUrls.length > 0) {
    const threadMediaDir = getThreadMediaDir(chatId);
    const downloadedPaths = await downloadImagesFromUrls(message.mediaUrls, threadMediaDir);
    localMediaPaths = downloadedPaths.filter((p): p is string => p !== undefined);
  }

  let bodyForEnvelope = bodyWithSender;
  if (localMediaPaths && localMediaPaths.length > 0) {
    const mediaInfo = localMediaPaths.map((p, idx) => `[Image ${idx + 1}: ${p}]`).join('\n');
    bodyForEnvelope = `${bodyWithSender}\n\n${mediaInfo}`;
  } else if (message.mediaUrls && message.mediaUrls.length > 0) {
    // Download failed — don't expose CDN URLs (SSRF blocked). Tell agent an image was sent.
    bodyForEnvelope = `${bodyWithSender}\n\n[User sent ${message.mediaUrls.length} image(s) but download failed — image not available]`;
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
    From: isGroup ? `'opclaw-zalo':group:${chatId}` : `'opclaw-zalo':${senderId}`,
    To: `'opclaw-zalo':${chatId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: fromLabel,
    SenderName: resolvedSenderName || undefined,
    SenderId: senderId,
    CommandAuthorized: commandAuthorized,
    Provider: "opclaw-zalo",
    Surface: "opclaw-zalo",
    MessageSid: message.msgId ?? `${timestamp}`,
    OriginatingChannel: "opclaw-zalo",
    OriginatingTo: `'opclaw-zalo':${chatId}`,
    MediaUrls: localMediaPaths && localMediaPaths.length > 0 ? localMediaPaths : undefined,
    MediaUrl: localMediaPaths && localMediaPaths.length > 0 ? localMediaPaths[0] : undefined,
    MediaTypes: message.mediaTypes,
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
    channel: "opclaw-zalo",
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
          channel: "opclaw-zalo",
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
        channel: "opclaw-zalo",
        target: chatId,
        action: "start",
        error: err,
      });
    },
  });

  try {
    await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: ctxPayload,
      cfg: config,
      dispatcherOptions: {
        ...prefixOptions,
        deliver: async (payload) => {
          await deliverZaloPersonalReply({
            payload: payload as { text?: string; mediaUrls?: string[]; mediaUrl?: string; isReasoning?: boolean },
            chatId,
            isGroup,
            runtime,
            core,
            config,
            accountId: account.accountId,
            statusSink,
            tableMode: core.channel.text.resolveMarkdownTableMode({
              cfg: config,
              channel: "opclaw-zalo",
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
            channel: "opclaw-zalo",
            target: chatId,
            error: err,
          });
        },
      });
    }
  }
}

function resolveGroupMentionSetting(account: ResolvedZaloPersonalAccount, groupId: string): boolean {
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

async function deliverZaloPersonalReply(params: {
  payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string; isReasoning?: boolean };
  chatId: string;
  isGroup: boolean;
  runtime: RuntimeEnv;
  core: ZaloPersonalCoreRuntime;
  config: OpenClawConfig;
  accountId?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
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

  if (mediaList.length > 0) {
    let first = true;
    for (const mediaUrl of mediaList) {
      const caption = first ? text : undefined;
      first = false;
      try {
        await sendMessageZaloPersonal(chatId, caption ?? "", { mediaUrl, isGroup });
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime.error(`Media send failed: ${String(err)}`);
      }
    }
    return;
  }

  if (text) {
    const chunkMode = core.channel.text.resolveChunkMode(config, "opclaw-zalo", accountId);
    const chunks = core.channel.text.chunkMarkdownTextWithMode(text, ZALOJS_TEXT_LIMIT, chunkMode);
    logVerbose(core, runtime, `Sending ${chunks.length} text chunk(s) to ${chatId}`);
    for (const chunk of chunks) {
      try {
        await sendMessageZaloPersonal(chatId, chunk, { isGroup });
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime.error(`Message send failed: ${String(err)}`);
      }
    }
  }
}

export async function monitorZaloPersonalProvider(
  options: ZaloPersonalMonitorOptions,
): Promise<ZaloPersonalMonitorResult> {
  let { account, config } = options;
  const { abortSignal, statusSink, runtime } = options;

  const core = getZaloPersonalRuntime();
  let stopped = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  let resolveRunning: (() => void) | null = null;

  // Resolve allowFrom name→id mappings
  try {
    const allowFromEntries = (account.config.allowFrom ?? [])
      .map((entry) => normalizeZaloPersonalEntry(String(entry)))
      .filter((entry) => entry && entry !== "*");

    if (allowFromEntries.length > 0) {
      try {
        const api = await getApi();
        const friends = await api.getAllFriends();
        const friendList: ZaloPersonalFriend[] = Array.isArray(friends)
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
        summarizeMapping("opclaw-zalo users", mapping, unresolved, runtime);
      } catch (err) {
        runtime.log?.(`opclaw-zalo user resolve failed. ${String(err)}`);
      }
    }

    // Resolve denyFrom
    const denyFromEntries = (account.config.denyFrom ?? [])
      .map((entry) => normalizeZaloPersonalEntry(String(entry)))
      .filter((entry) => entry && entry !== "*");

    if (denyFromEntries.length > 0) {
      try {
        const api = await getApi();
        const friends = await api.getAllFriends();
        const friendList: ZaloPersonalFriend[] = Array.isArray(friends)
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
        summarizeMapping("opclaw-zalo blocked users", mapping, unresolved, runtime);
      } catch (err) {
        runtime.log?.(`opclaw-zalo denyFrom resolve failed. ${String(err)}`);
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
        let groupList: ZaloPersonalGroup[] = [];
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
          const cleaned = normalizeZaloPersonalEntry(entry);
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
            .map((entry) => normalizeZaloPersonalEntry(String(entry)))
            .filter((entry) => entry && entry !== "*");
          if (denyUserEntries.length === 0) continue;

          const friends = await api.getAllFriends();
          const friendList: ZaloPersonalFriend[] = Array.isArray(friends)
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
            summarizeMapping(`opclaw-zalo group:${groupKey} blocked users`, userMapping, userUnresolved, runtime);
          }
        }

        account = { ...account, config: { ...account.config, groups: nextGroups } };
        summarizeMapping("opclaw-zalo groups", mapping, unresolved, runtime);
      } catch (err) {
        runtime.log?.(`opclaw-zalo group resolve failed. ${String(err)}`);
      }
    }
  } catch (err) {
    runtime.log?.(`opclaw-zalo resolve failed. ${String(err)}`);
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
      const selfUid = getCurrentUid();
      if (listenersRegistered) {
        try { api.listener.stop(); } catch {}
        api.listener.start({ retryOnClose: true });
        return;
      }
      listenersRegistered = true;

      api.listener.on("message", (msg: Message) => {
        if (msg.isSelf) return;
        if (selfUid && msg.data.uidFrom === selfUid) return;
        const converted = convertToZaloPersonalMessage(msg);
        if (!converted) return;
        logVerbose(core, runtime, `[${account.accountId}] inbound message`);
        statusSink?.({ lastInboundAt: Date.now() });
        processMessage(converted, account, config, core, runtime, statusSink).catch((err) => {
          runtime.error(`[${account.accountId}] Failed to process message: ${String(err)}`);
        });
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
