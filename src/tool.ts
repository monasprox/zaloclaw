/**
 * Zalo Personal agent tool — written from scratch against zca-js v2.1.2 API.
 *
 * Organized by domain: messaging → contacts → groups → media → reactions →
 * polls → reminders → conversation → settings → profile → bot-config.
 *
 * Every action handler is a standalone async function calling the zca-js API
 * directly. Name/ID resolution helpers convert display names to numeric IDs
 * using the friend/group lists.
 */

import { Type } from "@sinclair/typebox";
import {
  ThreadType,
  Reactions,
  MuteAction,
  MuteDuration,
  UpdateSettingsType,
} from "zca-js";
import { getApi } from "./zalo-client.js";
import { lookupCliMsgId } from "./features/msg-id-store.js";
import {
  readOpenClawConfig,
  writeOpenClawConfig,
  addToDenyFrom,
  removeFromDenyFrom,
  addToGroupDenyUsers,
  removeFromGroupDenyUsers,
  addToGroupAllowUsers,
  removeFromGroupAllowUsers,
  listBlockedUsers,
  listAllowedUsers,
  listBlockedUsersInGroup,
  listAllowedUsersInGroup,
  setGroupRequireMention,
  getGroupRequireMention,
} from "./config-manager.js";
import { getPendingRequests, removePendingRequest } from "./friend-request-store.js";

// ─── Result helper ───────────────────────────────────────────────────────────

type ToolResult = {
  content: Array<{ type: string; text: string }>;
  details?: unknown;
};

function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

// ─── Name→ID resolvers ──────────────────────────────────────────────────────

async function resolveUserId(nameOrId: string): Promise<string> {
  if (/^\d+$/.test(nameOrId)) return nameOrId;
  const api = await getApi();
  const friends = await api.getAllFriends();
  const list = Array.isArray(friends) ? friends : [];
  const q = nameOrId.toLowerCase();
  const hit = list.find(
    (f: any) =>
      (f.displayName ?? "").toLowerCase() === q ||
      (f.zaloName ?? "").toLowerCase() === q,
  );
  if (hit) return String(hit.userId);
  throw new Error(`User not found: "${nameOrId}". Use numeric ID or exact display name.`);
}

async function resolveGroupId(nameOrId: string): Promise<string> {
  if (/^\d+$/.test(nameOrId)) return nameOrId;
  const api = await getApi();
  const resp = await api.getAllGroups();
  const ids = Object.keys(resp?.gridVerMap ?? {});
  if (ids.length === 0) throw new Error("No groups found");
  const info = await api.getGroupInfo(ids);
  const map = info?.gridInfoMap ?? {};
  const q = nameOrId.toLowerCase();
  const hit = Object.entries(map).find(
    ([, g]: [string, any]) => (g.name ?? "").toLowerCase() === q,
  );
  if (hit) return hit[0];
  throw new Error(`Group not found: "${nameOrId}". Use numeric group ID or exact name.`);
}

/**
 * zca-js API ≥2.1.0 often returns empty memberIds but populates
 * memVerList with entries like "userId_version". Parse both.
 */
function extractMemberIds(groupInfo: any): string[] {
  const ids: string[] = groupInfo?.memberIds ?? [];
  if (ids.length > 0) return ids;
  const verList: string[] = groupInfo?.memVerList ?? [];
  return verList.map((e: string) => e.split("_")[0]).filter(Boolean);
}

// ─── Actions list ────────────────────────────────────────────────────────────

const ACTIONS = [
  // Messaging
  "send",
  "send-styled",
  "send-link",
  "send-image",
  "send-video",
  "send-voice",
  "send-sticker",
  "send-card",
  "send-bank-card",
  "send-typing",
  "forward-message",
  "delete-message",
  "undo-message",
  // Reactions
  "add-reaction",
  // Contacts
  "friends",
  "find-user",
  "find-user-by-username",
  "send-friend-request",
  "get-friend-requests",
  "accept-friend-request",
  "reject-friend-request",
  "get-sent-requests",
  "undo-friend-request",
  "unfriend",
  "check-friend-status",
  "set-friend-nickname",
  "remove-friend-nickname",
  "get-online-friends",
  "get-close-friends",
  "get-friend-recommendations",
  "get-alias-list",
  "get-related-friend-groups",
  "get-multi-users-by-phones",
  // Groups
  "groups",
  "get-group-info",
  "create-group",
  "add-to-group",
  "remove-from-group",
  "leave-group",
  "rename-group",
  "add-group-admin",
  "remove-group-admin",
  "change-group-owner",
  "disperse-group",
  "update-group-settings",
  "enable-group-link",
  "disable-group-link",
  "get-group-link",
  "get-pending-members",
  "review-pending-members",
  "get-group-blocked",
  "block-group-member",
  "unblock-group-member",
  "get-group-members-info",
  "join-group-link",
  "invite-to-groups",
  "get-group-invites",
  "join-group-invite",
  "delete-group-invite",
  "change-group-avatar",
  "upgrade-group-to-community",
  "get-group-chat-history",
  // Polls
  "create-poll",
  "vote-poll",
  "lock-poll",
  "get-poll-detail",
  "add-poll-options",
  "share-poll",
  // Reminders
  "create-reminder",
  "remove-reminder",
  "edit-reminder",
  "list-reminders",
  // Conversation management
  "mute-conversation",
  "unmute-conversation",
  "pin-conversation",
  "unpin-conversation",
  "delete-chat",
  "hide-conversation",
  "unhide-conversation",
  "get-hidden-conversations",
  "mark-unread",
  "unmark-unread",
  "get-unread-marks",
  "set-auto-delete-chat",
  "get-auto-delete-chats",
  "get-archived-chats",
  "update-archived-chat",
  "get-mute-status",
  "get-pinned-conversations",
  // Quick messages & auto-reply
  "list-quick-messages",
  "add-quick-message",
  "remove-quick-message",
  "update-quick-message",
  "list-auto-replies",
  "create-auto-reply",
  "update-auto-reply",
  "delete-auto-reply",
  // Settings
  "get-settings",
  "update-setting",
  "update-active-status",
  // Profile & account
  "me",
  "status",
  "get-user-info",
  "last-online",
  "get-qr",
  "update-profile",
  "update-profile-bio",
  "change-avatar",
  "delete-avatar",
  "get-avatar-list",
  "reuse-avatar",
  "get-biz-account",
  // Stickers & misc
  "search-stickers",
  "search-sticker-detail",
  "parse-link",
  "send-report",
  // Notes & labels
  "create-note",
  "edit-note",
  "get-boards",
  "get-labels",
  // Catalogs & products
  "create-catalog",
  "update-catalog",
  "delete-catalog",
  "get-catalogs",
  "create-product",
  "update-product",
  "delete-product",
  "get-products",
  // Bot config (OpenClaw layer)
  "block-user",
  "unblock-user",
  "block-user-in-group",
  "unblock-user-in-group",
  "list-blocked",
  "list-allowed",
  "allow-user-in-group",
  "unallow-user-in-group",
  "list-allowed-in-group",
  "list-blocked-in-group",
  "group-mention",
  // Stranger messaging
  "send-to-stranger",
] as const;

// ─── TypeBox parameter schema ────────────────────────────────────────────────

function stringEnum<T extends readonly string[]>(
  values: T,
  opts: { description?: string } = {},
) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    ...opts,
  });
}

export const ZaloPersonalToolSchema = Type.Object(
  {
    action: stringEnum(ACTIONS, {
      description: `Action to perform. ${ACTIONS.length} actions available: ${ACTIONS.join(", ")}`,
    }),
    // Core identifiers
    threadId: Type.Optional(Type.String({ description: "Thread / chat ID" })),
    message: Type.Optional(Type.String({ description: "Text content. For send-styled, supports **bold**, *italic*, __underline__, ~~strike~~" })),
    isGroup: Type.Optional(Type.Boolean({ description: "Whether the thread is a group" })),
    userId: Type.Optional(Type.String({ description: "User ID or display name" })),
    groupId: Type.Optional(Type.String({ description: "Group ID or name" })),
    query: Type.Optional(Type.String({ description: "Search / filter query" })),
    // Media
    url: Type.Optional(Type.String({ description: "URL for media/link/image" })),
    thumbnailUrl: Type.Optional(Type.String({ description: "Thumbnail URL (video)" })),
    voiceUrl: Type.Optional(Type.String({ description: "Voice/audio URL" })),
    // Stickers
    stickerId: Type.Optional(Type.Number({ description: "Sticker ID" })),
    stickerCateId: Type.Optional(Type.Number({ description: "Sticker category ID" })),
    keyword: Type.Optional(Type.String({ description: "Keyword for sticker search / quick messages" })),
    // Friend operations
    phoneNumber: Type.Optional(Type.String({ description: "Phone number (e.g. 0987654321)" })),
    phoneNumbers: Type.Optional(Type.Array(Type.String(), { description: "Array of phone numbers" })),
    requestMessage: Type.Optional(Type.String({ description: "Friend request message" })),
    nickname: Type.Optional(Type.String({ description: "Friend nickname/alias" })),
    username: Type.Optional(Type.String({ description: "Zalo username" })),
    // Group operations
    groupName: Type.Optional(Type.String({ description: "Group name (create/rename)" })),
    memberIds: Type.Optional(Type.Array(Type.String(), { description: "User IDs for group ops" })),
    link: Type.Optional(Type.String({ description: "Group invite link" })),
    groupIds: Type.Optional(Type.Array(Type.String(), { description: "Group IDs for invite-to-groups" })),
    groupSettings: Type.Optional(Type.Object({
      blockName: Type.Optional(Type.Boolean()),
      signAdminMsg: Type.Optional(Type.Boolean()),
      setTopicOnly: Type.Optional(Type.Boolean()),
      enableMsgHistory: Type.Optional(Type.Boolean()),
      joinAppr: Type.Optional(Type.Boolean()),
      lockCreatePost: Type.Optional(Type.Boolean()),
      lockCreatePoll: Type.Optional(Type.Boolean()),
      lockSendMsg: Type.Optional(Type.Boolean()),
      lockViewMember: Type.Optional(Type.Boolean()),
    }, { description: "Group settings" })),
    isApprove: Type.Optional(Type.Boolean({ description: "Approve/reject pending members" })),
    blockFutureInvite: Type.Optional(Type.Boolean({ description: "Block future group invites" })),
    // Message operations
    msgId: Type.Optional(Type.String({ description: "Message ID" })),
    cliMsgId: Type.Optional(Type.String({ description: "Client message ID" })),
    onlyMe: Type.Optional(Type.Boolean({ description: "Delete only for me" })),
    threadIds: Type.Optional(Type.Array(Type.String(), { description: "Thread IDs for forwarding" })),
    count: Type.Optional(Type.Number({ description: "Number of items to return" })),
    // Reaction
    icon: Type.Optional(Type.String({ description: "Reaction icon (heart, like, haha, wow, cry, angry)" })),
    // Poll
    pollId: Type.Optional(Type.Number({ description: "Poll ID" })),
    title: Type.Optional(Type.String({ description: "Title (polls, reminders, notes)" })),
    options: Type.Optional(Type.Array(Type.String(), { description: "Poll options" })),
    optionId: Type.Optional(Type.Number({ description: "Poll option ID for voting" })),
    // Reminder
    emoji: Type.Optional(Type.String({ description: "Reminder emoji" })),
    startTime: Type.Optional(Type.Number({ description: "Start time (ms)" })),
    endTime: Type.Optional(Type.Number({ description: "End time (ms)" })),
    repeat: Type.Optional(Type.Number({ description: "Repeat: 0=none, 1=daily, 2=weekly, 3=monthly" })),
    reminderId: Type.Optional(Type.String({ description: "Reminder ID" })),
    // Conversation
    duration: Type.Optional(Type.Number({ description: "Mute duration seconds (-1=forever)" })),
    ttl: Type.Optional(Type.Number({ description: "Auto-delete TTL (0=off, 86400000=1day)" })),
    isArchived: Type.Optional(Type.Boolean({ description: "Archive/unarchive" })),
    // Quick message / auto-reply
    replyId: Type.Optional(Type.Number({ description: "Auto-reply rule ID" })),
    itemId: Type.Optional(Type.Number({ description: "Quick message item ID" })),
    scope: Type.Optional(Type.Number({ description: "Auto-reply scope (0=all)" })),
    // Settings
    settingKey: Type.Optional(Type.String({ description: "Setting key" })),
    settingValue: Type.Optional(Type.Number({ description: "Setting value (0=off, 1=on)" })),
    active: Type.Optional(Type.Boolean({ description: "Active status toggle" })),
    // Profile
    name: Type.Optional(Type.String({ description: "Display name" })),
    dob: Type.Optional(Type.String({ description: "Date of birth YYYY-MM-DD" })),
    gender: Type.Optional(Type.Number({ description: "Gender: 0=male, 1=female" })),
    bio: Type.Optional(Type.String({ description: "Profile biography" })),
    photoId: Type.Optional(Type.String({ description: "Photo/avatar ID" })),
    // Report
    reason: Type.Optional(Type.Number({ description: "Report reason: 0=other, 1=sensitive, 2=annoy, 3=fraud" })),
    // Notes
    description: Type.Optional(Type.String({ description: "Description for product/note" })),
    pinAct: Type.Optional(Type.Boolean({ description: "Pin note" })),
    topicId: Type.Optional(Type.String({ description: "Topic/note ID" })),
    // Catalogs
    catalogId: Type.Optional(Type.String({ description: "Catalog ID" })),
    productId: Type.Optional(Type.String({ description: "Product ID" })),
    price: Type.Optional(Type.String({ description: "Product price" })),
    // Bank card
    binBank: Type.Optional(Type.String({ description: "Bank BIN code" })),
    numAccBank: Type.Optional(Type.String({ description: "Bank account number" })),
    nameAccBank: Type.Optional(Type.String({ description: "Account holder name" })),
    // Rich text
    styles: Type.Optional(Type.Array(
      Type.Object({
        start: Type.Number({ description: "Start offset" }),
        len: Type.Number({ description: "Length" }),
        st: Type.String({ description: "Style: b=bold, i=italic, u=underline, s=strike, c_HEX=color" }),
      }),
      { description: "Text styles for send-styled. Or use markdown in message." },
    )),
    // Bot config
    requireMention: Type.Optional(Type.Boolean({ description: "Require @mention in group" })),
    isBlockFeed: Type.Optional(Type.Boolean({ description: "Block feed from user" })),
  },
  { additionalProperties: false },
);

// ─── Reaction icon resolver ──────────────────────────────────────────────────

const REACTION_MAP: Record<string, Reactions> = {
  heart: Reactions.HEART, love: Reactions.HEART,
  like: Reactions.LIKE, thumbsup: Reactions.LIKE,
  haha: Reactions.HAHA, laugh: Reactions.HAHA,
  wow: Reactions.WOW, surprised: Reactions.WOW,
  cry: Reactions.CRY, sad: Reactions.CRY,
  angry: Reactions.ANGRY,
  none: Reactions.NONE,
  "👍": Reactions.LIKE, "❤️": Reactions.HEART, "😆": Reactions.HAHA,
  "😮": Reactions.WOW, "😢": Reactions.CRY, "😠": Reactions.ANGRY,
};

function resolveReaction(raw: string): Reactions {
  return REACTION_MAP[raw.toLowerCase()] ?? (raw as Reactions);
}

// ─── Type alias ──────────────────────────────────────────────────────────────

type Params = {
  action: (typeof ACTIONS)[number];
  [key: string]: any;
};

// ─── Execute ─────────────────────────────────────────────────────────────────

export async function executeZaloPersonalTool(
  _callId: string,
  p: Params,
  _signal?: AbortSignal,
): Promise<ToolResult> {
  try {
    return await dispatch(p);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return ok({ error: true, message: msg });
  }
}

async function dispatch(p: Params): Promise<ToolResult> {
  const api = async () => getApi();

  switch (p.action) {
    // ── Messaging ──────────────────────────────────────────────────────────

    case "send": {
      if (!p.threadId || !p.message) throw new Error("threadId and message required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.sendMessage({ msg: p.message }, p.threadId, type);
      return ok({ success: true, msgId: res?.message?.msgId });
    }

    case "send-styled": {
      if (!p.threadId || !p.message) throw new Error("threadId and message required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      let msg = p.message;
      let styles = p.styles as any[] | undefined;
      if (!styles || styles.length === 0) {
        const { markdownToZaloStyles } = await import("./send.js");
        const converted = markdownToZaloStyles(msg);
        msg = converted.text;
        styles = converted.styles;
      }
      const content: any = { msg };
      if (styles && styles.length > 0) content.styles = styles;
      const res = await a.sendMessage(content, p.threadId, type);
      return ok({ success: true, msgId: res?.message?.msgId, stylesApplied: styles?.length ?? 0 });
    }

    case "send-link": {
      if (!p.threadId || !p.url) throw new Error("threadId and url required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.sendLink({ url: p.url }, p.threadId, type);
      return ok({ success: true, msgId: res?.message?.msgId });
    }

    case "send-image": {
      if (!p.threadId || !p.url) throw new Error("threadId and url required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.sendLink(
        { url: p.url, title: p.message || p.url },
        p.threadId, type,
      );
      return ok({ success: true, msgId: res?.message?.msgId });
    }

    case "send-video": {
      if (!p.threadId || !p.url) throw new Error("threadId and url required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.sendVideo(p.url, p.thumbnailUrl ?? p.url, p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "send-voice": {
      if (!p.threadId) throw new Error("threadId required");
      const voiceUrl = p.voiceUrl || p.url;
      if (!voiceUrl) throw new Error("voiceUrl or url required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.sendVoice(voiceUrl, p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "send-sticker": {
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      if (p.stickerId && p.stickerCateId) {
        const detail = { id: p.stickerId, cateId: p.stickerCateId, type: 3 };
        await a.sendSticker(detail as any, p.threadId!, type);
        return ok({ success: true, stickerId: p.stickerId });
      }
      if (p.keyword) {
        const ids = await a.getStickers(p.keyword);
        if (!ids || ids.length === 0) return ok({ error: true, message: "No stickers found" });
        const details = await a.getStickersDetail(ids[0]);
        if (!details || details.length === 0) return ok({ error: true, message: "Sticker detail unavailable" });
        await a.sendSticker(details[0], p.threadId!, type);
        return ok({ success: true, sticker: details[0] });
      }
      throw new Error("stickerId+stickerCateId or keyword required");
    }

    case "send-card": {
      if (!p.threadId || !p.userId) throw new Error("threadId and userId required");
      const a = await api();
      const uid = await resolveUserId(p.userId);
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.sendCard(uid, p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "send-bank-card": {
      if (!p.threadId || !p.binBank || !p.numAccBank || !p.nameAccBank)
        throw new Error("threadId, binBank, numAccBank, nameAccBank required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.sendBankCard(
        { binBank: p.binBank, numAccBank: p.numAccBank, nameAccBank: p.nameAccBank },
        p.threadId, type,
      );
      return ok({ success: true, result: res });
    }

    case "send-typing": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      await a.sendTypingEvent(p.threadId, type);
      return ok({ success: true, message: "Typing indicator sent" });
    }

    case "forward-message": {
      if (!p.msgId || !p.threadIds?.length) throw new Error("msgId and threadIds required");
      const a = await api();
      const res = await a.forwardMessage(p.msgId, p.threadIds);
      return ok({ success: true, result: res });
    }

    case "delete-message": {
      if (!p.msgId || !p.threadId) throw new Error("msgId and threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.deleteMessage(p.msgId, p.threadId, type, Boolean(p.onlyMe));
      return ok({ success: true, result: res });
    }

    case "undo-message": {
      if (!p.msgId) throw new Error("msgId required");
      let undoCliMsgId = p.cliMsgId as string | undefined;
      if (!undoCliMsgId) {
        const stored = lookupCliMsgId(p.msgId);
        if (stored) undoCliMsgId = stored.cliMsgId;
      }
      if (!undoCliMsgId) throw new Error("cliMsgId not found — message may be too old");
      const a = await api();
      const res = await a.undo({ msgId: p.msgId, cliMsgId: undoCliMsgId });
      return ok({ success: true, result: res });
    }

    // ── Reactions ──────────────────────────────────────────────────────────

    case "add-reaction": {
      if (!p.msgId || !p.icon)
        throw new Error("msgId and icon required");
      // Auto-lookup cliMsgId and threadId from in-memory store if not provided
      let cliMsgId = p.cliMsgId as string | undefined;
      let threadId = p.threadId as string | undefined;
      let isGroup = p.isGroup as boolean | undefined;
      if (!cliMsgId || !threadId) {
        const stored = lookupCliMsgId(p.msgId);
        if (stored) {
          cliMsgId = cliMsgId || stored.cliMsgId;
          threadId = threadId || stored.threadId;
          isGroup = isGroup ?? stored.isGroup;
        }
      }
      if (!cliMsgId || !threadId)
        throw new Error("cliMsgId/threadId not found — message may be too old or from before bot started");
      const a = await api();
      const type = isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.addReaction(resolveReaction(p.icon), {
        data: { msgId: p.msgId, cliMsgId },
        threadId,
        type,
      });
      return ok({ success: true, result: res });
    }

    // ── Contacts ───────────────────────────────────────────────────────────

    case "friends": {
      const a = await api();
      const raw = await a.getAllFriends();
      let list = Array.isArray(raw) ? raw : [];
      if (p.query?.trim()) {
        const q = p.query.trim().toLowerCase();
        list = list.filter((f: any) =>
          (f.displayName ?? "").toLowerCase().includes(q) ||
          (f.zaloName ?? "").toLowerCase().includes(q) ||
          String(f.userId).includes(q),
        );
      }
      const friends = list.map((f: any) => ({
        userId: f.userId,
        displayName: f.displayName,
        zaloName: f.zaloName,
        avatar: f.avatar,
        phoneNumber: f.phoneNumber,
      }));
      return ok({ friends, count: friends.length });
    }

    case "find-user": {
      if (!p.phoneNumber) throw new Error("phoneNumber required");
      const clean = p.phoneNumber.replace(/[\s-]/g, "");
      const a = await api();
      const res = await a.findUser(clean);
      if (!res?.uid) return ok({ found: false, phoneNumber: clean });
      return ok({
        found: true,
        user: { userId: res.uid, displayName: res.display_name || res.zalo_name, avatar: res.avatar },
      });
    }

    case "find-user-by-username": {
      if (!p.username) throw new Error("username required");
      const a = await api();
      const res = await a.findUserByUsername(p.username);
      return ok({ result: res });
    }

    case "send-friend-request": {
      if (!p.userId) throw new Error("userId required (numeric)");
      const msg = p.requestMessage || "Xin chào!";
      const a = await api();
      await a.sendFriendRequest(msg, p.userId);
      return ok({ success: true, userId: p.userId });
    }

    case "get-friend-requests": {
      const pending = getPendingRequests();
      return ok({ requests: pending, count: pending.length });
    }

    case "accept-friend-request": {
      if (!p.userId) throw new Error("userId required");
      const a = await api();
      await a.acceptFriendRequest(p.userId);
      removePendingRequest(p.userId);
      return ok({ success: true, userId: p.userId });
    }

    case "reject-friend-request": {
      if (!p.userId) throw new Error("userId required");
      const a = await api();
      await a.rejectFriendRequest(p.userId);
      removePendingRequest(p.userId);
      return ok({ success: true, userId: p.userId });
    }

    case "get-sent-requests": {
      const a = await api();
      const res = await a.getSentFriendRequest();
      const list = Object.entries(res).map(([uid, info]: [string, any]) => ({
        userId: info.userId || uid,
        displayName: info.displayName,
        sentAt: info.fReqInfo?.time,
      }));
      return ok({ requests: list, count: list.length });
    }

    case "undo-friend-request": {
      if (!p.userId) throw new Error("userId required");
      const a = await api();
      const uid = await resolveUserId(p.userId);
      await a.removeFriend(uid); // undo uses removeFriend before accepted
      return ok({ success: true, userId: uid });
    }

    case "unfriend": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      await a.removeFriend(uid);
      return ok({ success: true, userId: uid });
    }

    case "check-friend-status": {
      if (!p.userId) throw new Error("userId required");
      const a = await api();
      const st = await a.getFriendRequestStatus(p.userId);
      return ok({
        userId: p.userId,
        isFriend: st.is_friend === 1,
        isRequested: st.is_requested === 1,
        isRequesting: st.is_requesting === 1,
      });
    }

    case "set-friend-nickname": {
      if (!p.userId || !p.nickname) throw new Error("userId and nickname required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      await a.changeFriendAlias(uid, p.nickname);
      return ok({ success: true, userId: uid, nickname: p.nickname });
    }

    case "remove-friend-nickname": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      await a.removeFriendAlias(uid);
      return ok({ success: true, userId: uid });
    }

    case "get-online-friends": {
      const a = await api();
      const res = await a.getFriendOnlines();
      return ok({ onlineFriends: res });
    }

    case "get-close-friends": {
      const a = await api();
      const res = await a.getCloseFriends();
      return ok({ closeFriends: res });
    }

    case "get-friend-recommendations": {
      const a = await api();
      const res = await a.getFriendRecommendations();
      return ok({ recommendations: res });
    }

    case "get-alias-list": {
      const a = await api();
      const res = await a.getAliasList();
      return ok({ aliases: res });
    }

    case "get-related-friend-groups": {
      const a = await api();
      const res = await a.getRelatedFriendGroup();
      return ok({ groups: res });
    }

    case "get-multi-users-by-phones": {
      if (!p.phoneNumbers?.length) throw new Error("phoneNumbers required");
      const a = await api();
      const res = await a.getMultiUsersByPhones(p.phoneNumbers);
      return ok({ users: res });
    }

    case "send-to-stranger": {
      if (!p.userId || !p.message) throw new Error("userId and message required");
      const a = await api();
      const res = await a.sendMessage({ msg: p.message }, p.userId, ThreadType.User);
      return ok({
        success: true,
        msgId: res?.message?.msgId,
        note: "May not be received if stranger doesn't accept messages",
      });
    }

    // ── Groups ─────────────────────────────────────────────────────────────

    case "groups": {
      const a = await api();
      const resp = await a.getAllGroups();
      const ids = Object.keys(resp?.gridVerMap ?? {});
      if (ids.length === 0) return ok({ groups: [], count: 0 });
      try {
        const info = await a.getGroupInfo(ids);
        const map = info?.gridInfoMap ?? {};
        let groups = Object.entries(map).map(([id, g]: [string, any]) => ({
          groupId: id, name: g.name, desc: g.desc,
          totalMember: g.totalMember, creatorId: g.creatorId,
        }));
        if (p.query?.trim()) {
          const q = p.query.trim().toLowerCase();
          groups = groups.filter(g => (g.name ?? "").toLowerCase().includes(q));
        }
        return ok({ groups, count: groups.length });
      } catch {
        return ok({ groups: ids.map(id => ({ groupId: id })), count: ids.length });
      }
    }

    case "get-group-info": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const info = await a.getGroupInfo([gid]);
      const g = info?.gridInfoMap?.[gid];
      return ok({
        groupId: gid,
        name: g?.name,
        desc: (g as any)?.desc,
        totalMember: (g as any)?.totalMember,
        memberIds: extractMemberIds(g),
        creatorId: (g as any)?.creatorId,
        adminIds: (g as any)?.adminIds,
      });
    }

    case "create-group": {
      if (!p.groupName || !p.memberIds?.length) throw new Error("groupName and memberIds required");
      const a = await api();
      const ids = await Promise.all(p.memberIds.map(resolveUserId));
      const res = await a.createGroup(p.groupName, ids);
      return ok({ success: true, result: res });
    }

    case "add-to-group": {
      if (!p.groupId || !p.memberIds?.length) throw new Error("groupId and memberIds required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const ids = await Promise.all(p.memberIds.map(resolveUserId));
      const res = await a.addUserToGroup(gid, ids);
      return ok({ success: true, result: res });
    }

    case "remove-from-group": {
      if (!p.groupId || !p.userId) throw new Error("groupId and userId required");
      const gid = await resolveGroupId(p.groupId);
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.removeUserFromGroup(gid, uid);
      return ok({ success: true, result: res });
    }

    case "leave-group": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.leaveGroup(gid);
      return ok({ success: true, result: res });
    }

    case "rename-group": {
      if (!p.groupId || !p.groupName) throw new Error("groupId and groupName required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.changeGroupName(gid, p.groupName);
      return ok({ success: true, result: res });
    }

    case "add-group-admin": {
      if (!p.groupId || !p.userId) throw new Error("groupId and userId required");
      const gid = await resolveGroupId(p.groupId);
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.addGroupDeputy(gid, uid);
      return ok({ success: true, result: res });
    }

    case "remove-group-admin": {
      if (!p.groupId || !p.userId) throw new Error("groupId and userId required");
      const gid = await resolveGroupId(p.groupId);
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.removeGroupDeputy(gid, uid);
      return ok({ success: true, result: res });
    }

    case "change-group-owner": {
      if (!p.groupId || !p.userId) throw new Error("groupId and userId required");
      const gid = await resolveGroupId(p.groupId);
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.changeGroupOwner(gid, uid);
      return ok({ success: true, result: res });
    }

    case "disperse-group": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.disperseGroup(gid);
      return ok({ success: true, result: res });
    }

    case "update-group-settings": {
      if (!p.groupId || !p.groupSettings) throw new Error("groupId and groupSettings required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.updateGroupSettings(gid, p.groupSettings);
      return ok({ success: true, result: res });
    }

    case "enable-group-link": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.enableGroupLink(gid);
      return ok({ success: true, result: res });
    }

    case "disable-group-link": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.disableGroupLink(gid);
      return ok({ success: true, result: res });
    }

    case "get-group-link": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.getGroupLinkDetail(gid);
      return ok({ result: res });
    }

    case "get-pending-members": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.getPendingGroupMembers(gid);
      return ok({ result: res });
    }

    case "review-pending-members": {
      if (!p.groupId || !p.memberIds?.length || p.isApprove === undefined)
        throw new Error("groupId, memberIds, and isApprove required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.reviewPendingMemberRequest(gid, p.memberIds, p.isApprove);
      return ok({ success: true, result: res });
    }

    case "get-group-blocked": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.getGroupBlockedMember(gid);
      return ok({ result: res });
    }

    case "block-group-member": {
      if (!p.groupId || !p.userId) throw new Error("groupId and userId required");
      const gid = await resolveGroupId(p.groupId);
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.addGroupBlockedMember(gid, uid);
      return ok({ success: true, result: res });
    }

    case "unblock-group-member": {
      if (!p.groupId || !p.userId) throw new Error("groupId and userId required");
      const gid = await resolveGroupId(p.groupId);
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.removeGroupBlockedMember(gid, uid);
      return ok({ success: true, result: res });
    }

    case "get-group-members-info": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.getGroupMembersInfo(gid);
      return ok({ result: res });
    }

    case "join-group-link": {
      if (!p.link) throw new Error("link required");
      const a = await api();
      const info = await a.getGroupLinkInfo(p.link);
      const res = await a.joinGroupLink(p.link);
      return ok({ success: true, groupInfo: info, result: res });
    }

    case "invite-to-groups": {
      if (!p.userId || !p.groupIds?.length) throw new Error("userId and groupIds required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const res = await a.inviteUserToGroups(uid, p.groupIds);
      return ok({ success: true, result: res });
    }

    case "get-group-invites": {
      const a = await api();
      const res = await a.getGroupInviteBoxList();
      return ok({ invites: res });
    }

    case "join-group-invite": {
      if (!p.groupId) throw new Error("groupId required");
      const a = await api();
      const res = await a.joinGroupInviteBox(p.groupId, p.blockFutureInvite ?? false);
      return ok({ success: true, result: res });
    }

    case "delete-group-invite": {
      if (!p.groupId) throw new Error("groupId required");
      const a = await api();
      const res = await a.deleteGroupInviteBox(p.groupId);
      return ok({ success: true, result: res });
    }

    case "change-group-avatar": {
      if (!p.groupId || !p.url) throw new Error("groupId and url required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      await a.changeGroupAvatar(p.url, gid);
      return ok({ success: true, groupId: gid });
    }

    case "upgrade-group-to-community": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      await a.upgradeGroupToCommunity(gid);
      return ok({ success: true, groupId: gid });
    }

    case "get-group-chat-history": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const a = await api();
      const res = await a.getGroupChatHistory(gid, p.count ?? 20);
      return ok({ history: res });
    }

    // ── Polls ──────────────────────────────────────────────────────────────

    case "create-poll": {
      if (!p.threadId || !p.title || !p.options?.length) throw new Error("threadId, title, options required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.createPoll(p.title, p.options, p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "vote-poll": {
      if (!p.pollId || !p.threadId || p.optionId === undefined) throw new Error("pollId, threadId, optionId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.votePoll(p.pollId, [p.optionId], p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "lock-poll": {
      if (!p.pollId || !p.threadId) throw new Error("pollId and threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.lockPoll(p.pollId, p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "get-poll-detail": {
      if (!p.pollId || !p.threadId) throw new Error("pollId and threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.getPollDetail(p.pollId, p.threadId, type);
      return ok({ poll: res });
    }

    case "add-poll-options": {
      if (!p.pollId || !p.threadId || !p.options?.length) throw new Error("pollId, threadId, options required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.addPollOptions(p.pollId, p.options, p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "share-poll": {
      if (!p.pollId || !p.threadId || !p.threadIds?.length) throw new Error("pollId, threadId, threadIds required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.sharePoll(p.pollId, p.threadId, type, p.threadIds);
      return ok({ success: true, result: res });
    }

    // ── Reminders ──────────────────────────────────────────────────────────

    case "create-reminder": {
      if (!p.threadId || !p.title || !p.startTime) throw new Error("threadId, title, startTime required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.createReminder(p.threadId, type, {
        title: p.title, time: p.startTime, emoji: p.emoji,
        repeat: p.repeat ?? 0, memberIds: p.memberIds ?? [],
      });
      return ok({ success: true, result: res });
    }

    case "remove-reminder": {
      if (!p.reminderId || !p.threadId) throw new Error("reminderId and threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.removeReminder(p.reminderId, p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "edit-reminder": {
      if (!p.reminderId || !p.threadId) throw new Error("reminderId and threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.editReminder(p.reminderId, p.threadId, type, {
        title: p.title, time: p.startTime, emoji: p.emoji,
        repeat: p.repeat, memberIds: p.memberIds,
      });
      return ok({ success: true, result: res });
    }

    case "list-reminders": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.getListReminder(p.threadId, type);
      return ok({ reminders: res });
    }

    // ── Conversation ───────────────────────────────────────────────────────

    case "mute-conversation": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const d = p.duration === -1 ? MuteDuration.FOREVER
        : p.duration === 3600 ? MuteDuration.ONE_HOUR
        : p.duration === 14400 ? MuteDuration.FOUR_HOURS
        : MuteDuration.FOREVER;
      const res = await a.setMute(MuteAction.MUTE, d, p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "unmute-conversation": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.setMute(MuteAction.UNMUTE, MuteDuration.FOREVER, p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "pin-conversation": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const pins = await a.getPinConversations();
      const pinList = Array.isArray(pins) ? pins : [];
      pinList.push({ threadId: p.threadId, type });
      const res = await a.setPinnedConversations(pinList);
      return ok({ success: true, result: res });
    }

    case "unpin-conversation": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const pins = await a.getPinConversations();
      const filtered = (Array.isArray(pins) ? pins : []).filter(
        (pin: any) => String(pin.threadId) !== String(p.threadId),
      );
      const res = await a.setPinnedConversations(filtered);
      return ok({ success: true, result: res });
    }

    case "delete-chat": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.deleteChat(p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "hide-conversation": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.setHiddenConversations([{ threadId: p.threadId, type }]);
      return ok({ success: true, result: res });
    }

    case "unhide-conversation": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.setHiddenConversations([{ threadId: p.threadId, type, unhide: true }] as any);
      return ok({ success: true, result: res });
    }

    case "get-hidden-conversations": {
      const a = await api();
      const res = await a.getHiddenConversations();
      return ok({ conversations: res });
    }

    case "mark-unread": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.addUnreadMark(p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "unmark-unread": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.removeUnreadMark(p.threadId, type);
      return ok({ success: true, result: res });
    }

    case "get-unread-marks": {
      const a = await api();
      const res = await a.getUnreadMark();
      return ok({ marks: res });
    }

    case "set-auto-delete-chat": {
      if (!p.threadId || p.ttl === undefined) throw new Error("threadId and ttl required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.updateAutoDeleteChat(p.threadId, type, p.ttl);
      return ok({ success: true, result: res });
    }

    case "get-auto-delete-chats": {
      const a = await api();
      const res = await a.getAutoDeleteChat();
      return ok({ chats: res });
    }

    case "get-archived-chats": {
      const a = await api();
      const res = await a.getArchivedChatList();
      return ok({ archived: res });
    }

    case "update-archived-chat": {
      if (!p.threadId || p.isArchived === undefined) throw new Error("threadId and isArchived required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.updateArchivedChatList(p.threadId, type, p.isArchived);
      return ok({ success: true, result: res });
    }

    case "get-mute-status": {
      const a = await api();
      const res = await a.getMute();
      return ok({ muted: res });
    }

    case "get-pinned-conversations": {
      const a = await api();
      const res = await a.getPinConversations();
      return ok({ pinned: res });
    }

    // ── Quick messages & auto-reply ────────────────────────────────────────

    case "list-quick-messages": {
      const a = await api();
      const res = await a.getQuickMessageList();
      return ok({ quickMessages: res });
    }

    case "add-quick-message": {
      if (!p.keyword || !p.message) throw new Error("keyword and message required");
      const a = await api();
      const res = await a.addQuickMessage(p.keyword, p.message);
      return ok({ success: true, result: res });
    }

    case "remove-quick-message": {
      if (p.itemId === undefined) throw new Error("itemId required");
      const a = await api();
      const res = await a.removeQuickMessage(p.itemId);
      return ok({ success: true, result: res });
    }

    case "update-quick-message": {
      if (p.itemId === undefined || !p.keyword || !p.message) throw new Error("itemId, keyword, message required");
      const a = await api();
      const res = await a.updateQuickMessage(p.itemId, p.keyword, p.message);
      return ok({ success: true, result: res });
    }

    case "list-auto-replies": {
      const a = await api();
      const res = await a.getAutoReplyList();
      return ok({ autoReplies: res });
    }

    case "create-auto-reply": {
      if (!p.keyword || !p.message) throw new Error("keyword and message required");
      const a = await api();
      const res = await a.createAutoReply(p.keyword, p.message, p.scope ?? 0);
      return ok({ success: true, result: res });
    }

    case "update-auto-reply": {
      if (p.replyId === undefined || !p.keyword || !p.message)
        throw new Error("replyId, keyword, message required");
      const a = await api();
      const res = await a.updateAutoReply(p.replyId, p.keyword, p.message, p.scope ?? 0);
      return ok({ success: true, result: res });
    }

    case "delete-auto-reply": {
      if (p.replyId === undefined) throw new Error("replyId required");
      const a = await api();
      const res = await a.deleteAutoReply(p.replyId);
      return ok({ success: true, result: res });
    }

    // ── Settings ───────────────────────────────────────────────────────────

    case "get-settings": {
      const a = await api();
      const res = await a.getSettings();
      return ok({ settings: res });
    }

    case "update-setting": {
      if (!p.settingKey || p.settingValue === undefined) throw new Error("settingKey and settingValue required");
      const a = await api();
      const res = await a.updateSettings(p.settingKey as UpdateSettingsType, p.settingValue);
      return ok({ success: true, result: res });
    }

    case "update-active-status": {
      if (p.active === undefined) throw new Error("active required (true/false)");
      const a = await api();
      const res = await a.updateActiveStatus(p.active);
      return ok({ success: true, result: res });
    }

    // ── Profile & account ──────────────────────────────────────────────────

    case "me": {
      const a = await api();
      const ownId = a.getOwnId();
      let info: any = null;
      try { info = await a.fetchAccountInfo(); } catch {}
      const profile = info?.profile ?? info;
      return ok({
        userId: profile?.userId ?? ownId,
        displayName: profile?.displayName,
        zaloName: profile?.zaloName,
        avatar: profile?.avatar,
        phoneNumber: profile?.phoneNumber,
        gender: profile?.gender,
      });
    }

    case "status": {
      const { isAuthenticated, hasStoredCredentials } = await import("./zalo-client.js");
      return ok({ authenticated: isAuthenticated(), hasCredentials: hasStoredCredentials() });
    }

    case "get-user-info": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const info = await a.getUserInfo(uid);
      return ok({ userId: uid, info });
    }

    case "last-online": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const a = await api();
      const info = await a.getUserInfo(uid);
      const profile = (info as any)?.changed_profiles?.[uid];
      return ok({ userId: uid, lastOnline: profile?.lastOnline ?? profile?.lastActionTime });
    }

    case "get-qr": {
      const a = await api();
      const res = await a.getQR();
      return ok({ qr: res });
    }

    case "update-profile": {
      const a = await api();
      const opts: any = {};
      if (p.name) opts.name = p.name;
      if (p.dob) opts.dob = p.dob;
      if (p.gender !== undefined) opts.gender = p.gender;
      const res = await a.updateProfile(opts);
      return ok({ success: true, result: res });
    }

    case "update-profile-bio": {
      if (!p.bio) throw new Error("bio required");
      const a = await api();
      const res = await a.updateProfileBio(p.bio);
      return ok({ success: true, result: res });
    }

    case "change-avatar": {
      if (!p.url) throw new Error("url required");
      const a = await api();
      const res = await a.changeAccountAvatar(p.url);
      return ok({ success: true, result: res });
    }

    case "delete-avatar": {
      const a = await api();
      const res = await a.deleteAvatar();
      return ok({ success: true, result: res });
    }

    case "get-avatar-list": {
      const a = await api();
      const res = await a.getAvatarList();
      return ok({ avatars: res });
    }

    case "reuse-avatar": {
      if (!p.photoId) throw new Error("photoId required");
      const a = await api();
      const res = await a.reuseAvatar(p.photoId);
      return ok({ success: true, result: res });
    }

    case "get-biz-account": {
      const a = await api();
      const res = await a.getBizAccount();
      return ok({ bizAccount: res });
    }

    // ── Stickers & misc ────────────────────────────────────────────────────

    case "search-stickers": {
      if (!p.keyword) throw new Error("keyword required");
      const a = await api();
      const ids = await a.getStickers(p.keyword);
      return ok({ stickerIds: ids, count: ids?.length ?? 0 });
    }

    case "search-sticker-detail": {
      if (!p.stickerId) throw new Error("stickerId required");
      const a = await api();
      const details = await a.getStickersDetail(p.stickerId);
      return ok({ details });
    }

    case "parse-link": {
      if (!p.url) throw new Error("url required");
      const a = await api();
      const res = await a.parseLink(p.url);
      return ok({ result: res });
    }

    case "send-report": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.sendReport(p.threadId, type, p.reason ?? 0, p.message ?? "");
      return ok({ success: true, result: res });
    }

    // ── Notes & labels ─────────────────────────────────────────────────────

    case "create-note": {
      if (!p.threadId || !p.title) throw new Error("threadId and title required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.createNote(p.threadId, type, {
        title: p.title,
        pinAct: p.pinAct ?? false,
      });
      return ok({ success: true, result: res });
    }

    case "edit-note": {
      if (!p.threadId || !p.topicId) throw new Error("threadId and topicId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.editNote(p.threadId, type, {
        topicId: p.topicId,
        title: p.title,
      });
      return ok({ success: true, result: res });
    }

    case "get-boards": {
      if (!p.threadId) throw new Error("threadId required");
      const a = await api();
      const type = p.isGroup ? ThreadType.Group : ThreadType.User;
      const res = await a.getListBoard(p.threadId, type);
      return ok({ boards: res });
    }

    case "get-labels": {
      const a = await api();
      const res = await a.getLabels();
      return ok({ labels: res });
    }

    // ── Catalogs & products ────────────────────────────────────────────────

    case "create-catalog": {
      if (!p.name) throw new Error("name required");
      const a = await api();
      const res = await a.createCatalog(p.name);
      return ok({ success: true, result: res });
    }

    case "update-catalog": {
      if (!p.catalogId || !p.name) throw new Error("catalogId and name required");
      const a = await api();
      const res = await a.updateCatalog(p.catalogId, p.name);
      return ok({ success: true, result: res });
    }

    case "delete-catalog": {
      if (!p.catalogId) throw new Error("catalogId required");
      const a = await api();
      const res = await a.deleteCatalog(p.catalogId);
      return ok({ success: true, result: res });
    }

    case "get-catalogs": {
      const a = await api();
      const res = await a.getCatalogList();
      return ok({ catalogs: res });
    }

    case "create-product": {
      if (!p.name) throw new Error("name required");
      const a = await api();
      const opts: any = { name: p.name };
      if (p.price) opts.price = p.price;
      if (p.description) opts.desc = p.description;
      if (p.catalogId) opts.catalogId = p.catalogId;
      if (p.url) opts.imageUrl = p.url;
      const res = await a.createProductCatalog(opts);
      return ok({ success: true, result: res });
    }

    case "update-product": {
      if (!p.productId) throw new Error("productId required");
      const a = await api();
      const opts: any = { productId: p.productId };
      if (p.name) opts.name = p.name;
      if (p.price) opts.price = p.price;
      if (p.description) opts.desc = p.description;
      const res = await a.updateProductCatalog(opts);
      return ok({ success: true, result: res });
    }

    case "delete-product": {
      if (!p.productId) throw new Error("productId required");
      const a = await api();
      const res = await a.deleteProductCatalog(p.productId);
      return ok({ success: true, result: res });
    }

    case "get-products": {
      const a = await api();
      const res = await a.getProductCatalogList();
      return ok({ products: res });
    }

    // ── Bot config (OpenClaw layer) ────────────────────────────────────────

    case "block-user": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const cfg = readOpenClawConfig();
      writeOpenClawConfig(addToDenyFrom(cfg, uid));
      return ok({ success: true, userId: uid, note: "Restart gateway for changes to take effect" });
    }

    case "unblock-user": {
      if (!p.userId) throw new Error("userId required");
      const uid = await resolveUserId(p.userId);
      const cfg = readOpenClawConfig();
      writeOpenClawConfig(removeFromDenyFrom(cfg, uid));
      return ok({ success: true, userId: uid, note: "Restart gateway for changes to take effect" });
    }

    case "list-blocked": {
      const cfg = readOpenClawConfig();
      return ok({ blocked: listBlockedUsers(cfg) });
    }

    case "list-allowed": {
      const cfg = readOpenClawConfig();
      return ok({ allowed: listAllowedUsers(cfg) });
    }

    case "block-user-in-group": {
      if (!p.userId || !p.groupId) throw new Error("userId and groupId required");
      const uid = await resolveUserId(p.userId);
      const gid = await resolveGroupId(p.groupId);
      const cfg = readOpenClawConfig();
      writeOpenClawConfig(addToGroupDenyUsers(cfg, gid, uid));
      return ok({ success: true, userId: uid, groupId: gid, note: "Restart gateway" });
    }

    case "unblock-user-in-group": {
      if (!p.userId || !p.groupId) throw new Error("userId and groupId required");
      const uid = await resolveUserId(p.userId);
      const gid = await resolveGroupId(p.groupId);
      const cfg = readOpenClawConfig();
      writeOpenClawConfig(removeFromGroupDenyUsers(cfg, gid, uid));
      return ok({ success: true, userId: uid, groupId: gid, note: "Restart gateway" });
    }

    case "allow-user-in-group": {
      if (!p.userId || !p.groupId) throw new Error("userId and groupId required");
      const uid = await resolveUserId(p.userId);
      const gid = await resolveGroupId(p.groupId);
      const cfg = readOpenClawConfig();
      writeOpenClawConfig(addToGroupAllowUsers(cfg, gid, uid));
      return ok({ success: true, userId: uid, groupId: gid, note: "Restart gateway" });
    }

    case "unallow-user-in-group": {
      if (!p.userId || !p.groupId) throw new Error("userId and groupId required");
      const uid = await resolveUserId(p.userId);
      const gid = await resolveGroupId(p.groupId);
      const cfg = readOpenClawConfig();
      writeOpenClawConfig(removeFromGroupAllowUsers(cfg, gid, uid));
      return ok({ success: true, userId: uid, groupId: gid, note: "Restart gateway" });
    }

    case "list-allowed-in-group": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const cfg = readOpenClawConfig();
      return ok({ groupId: gid, allowed: listAllowedUsersInGroup(cfg, gid) });
    }

    case "list-blocked-in-group": {
      if (!p.groupId) throw new Error("groupId required");
      const gid = await resolveGroupId(p.groupId);
      const cfg = readOpenClawConfig();
      return ok({ groupId: gid, blocked: listBlockedUsersInGroup(cfg, gid) });
    }

    case "group-mention": {
      if (!p.groupId || p.requireMention === undefined) throw new Error("groupId and requireMention required");
      const gid = await resolveGroupId(p.groupId);
      const cfg = readOpenClawConfig();
      writeOpenClawConfig(setGroupRequireMention(cfg, gid, p.requireMention));
      return ok({
        success: true, groupId: gid, requireMention: p.requireMention,
        note: "Restart gateway for changes to take effect",
      });
    }

    default:
      return ok({ error: true, message: `Unknown action: ${p.action}` });
  }
}
