import { Type } from "@sinclair/typebox";
import { ThreadType, Reactions, MuteAction, MuteDuration, UpdateSettingsType } from "zca-js";
import { getApi } from "./zalo-client.js";
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

/**
 * Extract member IDs from group info, using memVerList as fallback
 * when memberIds is empty (Zalo API change: memberIds often returns []
 * but memVerList contains "{userId}_{version}" entries).
 */
function extractMemberIds(info: any): string[] {
  const memberIds: string[] = info.memberIds ?? [];
  if (memberIds.length > 0) return memberIds;

  // Fallback: parse memVerList entries like "1234567890_0" → "1234567890"
  const memVerList: string[] = info.memVerList ?? [];
  if (memVerList.length > 0) {
    return memVerList.map((entry: string) => entry.split("_")[0]).filter(Boolean);
  }

  return [];
}

const ACTIONS = [
  "send",
  "send-styled",
  "image",
  "link",
  "friends",
  "groups",
  "me",
  "status",
  "block-user",
  "unblock-user",
  "block-user-in-group",
  "unblock-user-in-group",
  "list-blocked",
  "list-allowed",
  "allow-user-in-group",
  "unallow-user-in-group",
  "list-allowed-in-group",
  // Phase 1: Friend & Stranger
  "find-user",
  "send-friend-request",
  "send-to-stranger",
  // Phase 2: Friends Management
  "get-friend-requests",
  "accept-friend-request",
  "reject-friend-request",
  "get-sent-requests",
  "undo-friend-request",
  "unfriend",
  "set-friend-nickname",
  "remove-friend-nickname",
  "get-online-friends",
  "check-friend-status",
  // Phase 3: Groups Management
  "list-groups",
  "search-groups",
  "get-group-info",
  "create-group",
  "add-to-group",
  "remove-from-group",
  "leave-group",
  "rename-group",
  "add-group-admin",
  "remove-group-admin",
  // Phase 4: Media
  "send-video",
  "send-voice",
  "send-sticker",
  "send-card",
  // Phase 5: User Profile
  "get-user-info",
  "last-online",
  "get-qr",
  // Phase 6: Message Management
  "delete-message",
  "undo-message",
  "forward-message",
  // Phase 7: Reactions
  "add-reaction",
  // Phase 8: Polls
  "create-poll",
  "vote-poll",
  "lock-poll",
  "get-poll-detail",
  // Phase 9: Reminders
  "create-reminder",
  "remove-reminder",
  "edit-reminder",
  "list-reminders",
  // Phase 10: Group Advanced
  "change-group-owner",
  "disperse-group",
  "update-group-settings",
  "enable-group-link",
  "disable-group-link",
  "get-group-link",
  "get-pending-members",
  "review-pending-members",
  // Phase 11: Conversation
  "mute-conversation",
  "unmute-conversation",
  "pin-conversation",
  "unpin-conversation",
  "delete-chat",
  // Phase 12: Quick Messages & Auto-Reply
  "list-quick-messages",
  "add-quick-message",
  "remove-quick-message",
  "list-auto-replies",
  "create-auto-reply",
  "delete-auto-reply",
  // Phase 13: Settings
  "get-settings",
  "update-setting",
  // Phase 14: Misc
  "search-stickers",
  "parse-link",
  "send-report",
  // Phase 15: Profile & Avatar
  "update-profile",
  "change-avatar",
  "delete-avatar",
  "get-avatar-list",
  "reuse-avatar",
  // Phase 16: Group Invite & Block
  "join-group-link",
  "invite-to-groups",
  "get-group-invites",
  "join-group-invite",
  "delete-group-invite",
  "get-group-blocked",
  "block-group-member",
  "unblock-group-member",
  "get-group-members-info",
  // Phase 17: Conversation Advanced
  "hide-conversation",
  "unhide-conversation",
  "get-hidden-conversations",
  "mark-unread",
  "unmark-unread",
  "get-unread-marks",
  "set-auto-delete-chat",
  "get-auto-delete-chats",
  "get-archived-chats",
  // Phase 18: Zalo Block & Friend Advanced
  "zalo-block-user",
  "zalo-unblock-user",
  "block-view-feed",
  "get-friend-recommendations",
  "get-alias-list",
  "get-related-friend-groups",
  // Phase 19: Notes & Labels
  "create-note",
  "edit-note",
  "get-boards",
  "get-labels",
  // Phase 20: Catalogs & Products
  "create-catalog",
  "update-catalog",
  "delete-catalog",
  "get-catalogs",
  "create-product",
  "update-product",
  "delete-product",
  "get-products",
  // Phase 21: Extended
  "send-typing",
  "send-bank-card",
  "add-poll-options",
  "share-poll",
  "update-quick-message",
  "update-auto-reply",
  "update-active-status",
  "get-biz-account",
  // Phase 22: zca-js 2.1.0 APIs
  "find-user-by-username",
  "get-close-friends",
  "get-group-chat-history",
  "get-multi-users-by-phones",
  "search-sticker-detail",
  "update-archived-chat",
  "update-profile-bio",
  "upgrade-group-to-community",
  "change-group-avatar",
  "get-mute-status",
  "get-pinned-conversations",
  // Bot Settings
  "group-mention",
] as const;

type AgentToolResult = {
  content: Array<{ type: string; text: string }>;
  details?: unknown;
};

function stringEnum<T extends readonly string[]>(
  values: T,
  options: { description?: string } = {},
) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    ...options,
  });
}

export const ZaloPersonalToolSchema = Type.Object(
  {
    action: stringEnum(ACTIONS, { description: `Action to perform. send=plain text, send-styled=rich text with bold/italic/underline/colors (use markdown in message or provide explicit styles array). All actions: ${ACTIONS.join(", ")}` }),
    threadId: Type.Optional(Type.String({ description: "Thread ID for messaging" })),
    message: Type.Optional(Type.String({ description: "Message text. For send-styled: supports markdown **bold**, *italic*, __underline__, ~~strikethrough~~" })),
    isGroup: Type.Optional(Type.Boolean({ description: "Is group chat" })),
    query: Type.Optional(Type.String({ description: "Search query for users/groups" })),
    url: Type.Optional(Type.String({ description: "URL for media/link" })),
    userId: Type.Optional(Type.String({ description: "User ID or name for operations" })),
    groupId: Type.Optional(Type.String({ description: "Group ID or name for group operations" })),
    phoneNumber: Type.Optional(Type.String({ description: "Phone number to find user (e.g. 0987654321)" })),
    requestMessage: Type.Optional(Type.String({ description: "Message to send with friend request" })),
    nickname: Type.Optional(Type.String({ description: "Nickname/alias for friend" })),
    groupName: Type.Optional(Type.String({ description: "Group name for create/rename" })),
    memberIds: Type.Optional(Type.Array(Type.String(), { description: "Array of user IDs for group creation" })),
    // Phase 4: Media
    thumbnailUrl: Type.Optional(Type.String({ description: "Thumbnail URL for video" })),
    voiceUrl: Type.Optional(Type.String({ description: "Voice/audio URL" })),
    stickerId: Type.Optional(Type.Number({ description: "Sticker ID" })),
    stickerCateId: Type.Optional(Type.Number({ description: "Sticker category ID" })),
    // Phase 6: Message Management
    msgId: Type.Optional(Type.String({ description: "Message ID for reactions/delete/undo/forward" })),
    cliMsgId: Type.Optional(Type.String({ description: "Client message ID" })),
    onlyMe: Type.Optional(Type.Boolean({ description: "Delete message only for me" })),
    threadIds: Type.Optional(Type.Array(Type.String(), { description: "Thread IDs for forwarding" })),
    // Phase 7: Reactions
    icon: Type.Optional(Type.String({ description: "Reaction icon (heart, like, haha, wow, cry, angry, or zca-js code)" })),
    // Phase 8: Polls
    pollId: Type.Optional(Type.Number({ description: "Poll ID" })),
    options: Type.Optional(Type.Array(Type.String(), { description: "Options for poll creation" })),
    optionId: Type.Optional(Type.Number({ description: "Poll option ID for voting" })),
    // Phase 9: Reminders
    title: Type.Optional(Type.String({ description: "Title for reminders, notes, poll question" })),
    emoji: Type.Optional(Type.String({ description: "Emoji for reminders" })),
    startTime: Type.Optional(Type.Number({ description: "Start time (timestamp ms)" })),
    endTime: Type.Optional(Type.Number({ description: "End time (timestamp ms)" })),
    repeat: Type.Optional(Type.Number({ description: "Repeat mode: 0=none, 1=daily, 2=weekly, 3=monthly" })),
    reminderId: Type.Optional(Type.String({ description: "Reminder ID" })),
    // Phase 10: Group Advanced
    link: Type.Optional(Type.String({ description: "Group invite link" })),
    isApprove: Type.Optional(Type.Boolean({ description: "Approve or reject pending members" })),
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
    }, { description: "Group settings object" })),
    // Phase 11: Conversation
    duration: Type.Optional(Type.Number({ description: "Duration in seconds (mute: 3600=1h, 14400=4h, -1=forever)" })),
    // Phase 12: Quick Messages & Auto-Reply
    keyword: Type.Optional(Type.String({ description: "Keyword for quick messages/sticker search" })),
    replyId: Type.Optional(Type.Number({ description: "Auto-reply rule ID" })),
    itemId: Type.Optional(Type.Number({ description: "Quick message item ID" })),
    // Phase 13: Settings
    settingKey: Type.Optional(Type.String({ description: "Setting key (e.g. show_online_status, display_seen_status)" })),
    settingValue: Type.Optional(Type.Number({ description: "Setting value (0=off, 1=on)" })),
    // Phase 14: Misc
    reason: Type.Optional(Type.Number({ description: "Report reason: 0=other, 1=sensitive, 2=annoy, 3=fraud" })),
    // Phase 15: Profile & Avatar
    name: Type.Optional(Type.String({ description: "Display name for profile update" })),
    dob: Type.Optional(Type.String({ description: "Date of birth (YYYY-MM-DD)" })),
    gender: Type.Optional(Type.Number({ description: "Gender: 0=male, 1=female" })),
    photoId: Type.Optional(Type.String({ description: "Photo/avatar ID" })),
    // Phase 16: Group Invite
    groupIds: Type.Optional(Type.Array(Type.String(), { description: "Group IDs for invite-to-groups" })),
    blockFutureInvite: Type.Optional(Type.Boolean({ description: "Block future group invites" })),
    // Phase 17: Conversation Advanced
    ttl: Type.Optional(Type.Number({ description: "Auto-delete TTL (0=off, 86400000=1day, 604800000=7days, 1209600000=14days)" })),
    // Phase 18: Zalo Block
    isBlockFeed: Type.Optional(Type.Boolean({ description: "Block feed from user" })),
    // Phase 19: Notes
    pinAct: Type.Optional(Type.Boolean({ description: "Pin note" })),
    topicId: Type.Optional(Type.String({ description: "Topic/note ID for editing" })),
    // Phase 20: Catalogs & Products
    catalogId: Type.Optional(Type.String({ description: "Catalog ID" })),
    productId: Type.Optional(Type.String({ description: "Product ID" })),
    price: Type.Optional(Type.String({ description: "Product price" })),
    description: Type.Optional(Type.String({ description: "Description for product/note" })),
    // Phase 21: Extended
    binBank: Type.Optional(Type.String({ description: "Bank BIN code for bank card" })),
    numAccBank: Type.Optional(Type.String({ description: "Bank account number" })),
    nameAccBank: Type.Optional(Type.String({ description: "Bank account holder name" })),
    scope: Type.Optional(Type.Number({ description: "Auto-reply scope (0=all)" })),
    active: Type.Optional(Type.Boolean({ description: "Active status toggle" })),
    // Phase 22: zca-js 2.1.0
    username: Type.Optional(Type.String({ description: "Zalo username for find-user-by-username" })),
    phoneNumbers: Type.Optional(Type.Array(Type.String(), { description: "Array of phone numbers for multi-user lookup" })),
    count: Type.Optional(Type.Number({ description: "Number of items to return" })),
    isArchived: Type.Optional(Type.Boolean({ description: "Archive (true) or unarchive (false) conversation" })),
    bio: Type.Optional(Type.String({ description: "Profile biography text" })),
    // Bot Settings
    requireMention: Type.Optional(Type.Boolean({ description: "For group-mention action: true=require @mention, false=reply to all messages" })),
    // Rich text formatting
    styles: Type.Optional(Type.Array(
      Type.Object({
        start: Type.Number({ description: "Start position in text" }),
        len: Type.Number({ description: "Length of styled text" }),
        st: Type.String({ description: "Style type: b=bold, i=italic, u=underline, s=strikethrough, c_db342e=red, c_f27806=orange, c_f7b503=yellow, c_15a85f=green, f_13=small, f_18=big" }),
      }),
      { description: "Text styles array for send-styled action. Or use markdown in message: **bold**, *italic*, __underline__, ~~strike~~" },
    )),
  },
  { additionalProperties: false },
);

type ToolParams = {
  action: (typeof ACTIONS)[number];
  threadId?: string;
  message?: string;
  isGroup?: boolean;
  query?: string;
  url?: string;
  userId?: string;
  groupId?: string;
  phoneNumber?: string;
  requestMessage?: string;
  nickname?: string;
  groupName?: string;
  memberIds?: string[];
  thumbnailUrl?: string;
  voiceUrl?: string;
  stickerId?: number;
  stickerCateId?: number;
  msgId?: string;
  cliMsgId?: string;
  onlyMe?: boolean;
  threadIds?: string[];
  icon?: string;
  pollId?: number;
  options?: string[];
  optionId?: number;
  title?: string;
  emoji?: string;
  startTime?: number;
  endTime?: number;
  repeat?: number;
  reminderId?: string;
  link?: string;
  isApprove?: boolean;
  groupSettings?: Record<string, boolean>;
  duration?: number;
  keyword?: string;
  replyId?: number;
  itemId?: number;
  settingKey?: string;
  settingValue?: number;
  reason?: number;
  name?: string;
  dob?: string;
  gender?: number;
  photoId?: string;
  groupIds?: string[];
  blockFutureInvite?: boolean;
  ttl?: number;
  isBlockFeed?: boolean;
  pinAct?: boolean;
  topicId?: string;
  catalogId?: string;
  productId?: string;
  price?: string;
  description?: string;
  binBank?: string;
  numAccBank?: string;
  nameAccBank?: string;
  scope?: number;
  active?: boolean;
  username?: string;
  phoneNumbers?: string[];
  count?: number;
  isArchived?: boolean;
  bio?: string;
  requireMention?: boolean;
};

function json(payload: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

/**
 * Resolve user name to ID using friend list
 */
async function resolveUserId(nameOrId: string): Promise<string> {
  // If already numeric ID, return as-is
  if (/^\d+$/.test(nameOrId)) {
    return nameOrId;
  }

  // Search in friends list
  const api = await getApi();
  const friends = await api.getAllFriends();
  const friendList = Array.isArray(friends) ? friends : [];

  const query = nameOrId.toLowerCase();
  const match = friendList.find(
    (f: any) =>
      (f.displayName ?? "").toLowerCase() === query ||
      (f.zaloName ?? "").toLowerCase() === query ||
      String(f.userId) === nameOrId,
  );

  if (match) {
    return String(match.userId);
  }

  throw new Error(`User not found: ${nameOrId}. Use numeric ID or exact display name.`);
}

/**
 * Resolve group name to ID using group list
 */
async function resolveGroupId(nameOrId: string): Promise<string> {
  // If already looks like group ID, return as-is
  if (/^\d+$/.test(nameOrId)) {
    return nameOrId;
  }

  // Search in groups list
  const api = await getApi();
  const groupsResp = await api.getAllGroups();
  const groupIds = Object.keys(groupsResp?.gridVerMap ?? {});

  if (groupIds.length === 0) {
    throw new Error("No groups found");
  }

  try {
    const infoResp = await api.getGroupInfo(groupIds);
    const gridInfoMap = infoResp?.gridInfoMap ?? {};

    const query = nameOrId.toLowerCase();
    const match = Object.entries(gridInfoMap).find(([_id, info]: [string, any]) =>
      (info.name ?? "").toLowerCase() === query,
    );

    if (match) {
      return match[0]; // Return group ID
    }
  } catch {
    // Fallback: try to match by ID directly
  }

  throw new Error(`Group not found: ${nameOrId}. Use numeric group ID or exact group name.`);
}

export async function executeZaloPersonalTool(
  _toolCallId: string,
  params: ToolParams,
  _signal?: AbortSignal,
  _onUpdate?: unknown,
): Promise<AgentToolResult> {
  try {
    switch (params.action) {
      case "send": {
        if (!params.threadId || !params.message) {
          throw new Error("threadId and message required for send action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.sendMessage(
          { msg: params.message },
          params.threadId,
          type,
        );
        return json({ success: true, messageId: result?.message?.msgId });
      }

      case "send-styled": {
        if (!params.threadId || !params.message) {
          throw new Error("threadId and message required for send-styled action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        let msg = params.message;
        let styles = params.styles as any[] | undefined;

        // If no explicit styles provided, auto-convert markdown in message
        if (!styles || styles.length === 0) {
          const { markdownToZaloStyles } = await import("./send.js");
          const converted = markdownToZaloStyles(msg);
          msg = converted.text;
          styles = converted.styles;
        }

        const content: any = { msg };
        if (styles && styles.length > 0) {
          content.styles = styles;
        }
        const result = await api.sendMessage(content, params.threadId, type);
        return json({
          success: true,
          messageId: result?.message?.msgId,
          stylesApplied: styles?.length ?? 0,
        });
      }

      case "image": {
        if (!params.threadId) {
          throw new Error("threadId required for image action");
        }
        if (!params.url) {
          throw new Error("url required for image action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.sendLink(
          { url: params.url, title: params.message || params.url },
          params.threadId,
          type,
        );
        return json({ success: true, messageId: result?.message?.msgId });
      }

      case "link": {
        if (!params.threadId || !params.url) {
          throw new Error("threadId and url required for link action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.sendLink(
          { url: params.url },
          params.threadId,
          type,
        );
        return json({ success: true, messageId: result?.message?.msgId });
      }

      case "friends": {
        const api = await getApi();
        const friends = await api.getAllFriends();
        let friendList = Array.isArray(friends) ? friends : [];
        if (params.query?.trim()) {
          const q = params.query.trim().toLowerCase();
          friendList = friendList.filter(
            (f: any) =>
              (f.displayName ?? "").toLowerCase().includes(q) ||
              (f.zaloName ?? "").toLowerCase().includes(q) ||
              String(f.userId).includes(q),
          );
        }
        const mapped = friendList.map((f: any) => ({
          userId: f.userId,
          displayName: f.displayName,
          zaloName: f.zaloName,
          avatar: f.avatar,
          phoneNumber: f.phoneNumber,
          lastActionTime: f.lastActionTime,
        }));
        return json({
          friends: mapped,
          count: mapped.length,
          message: params.query
            ? `Found ${mapped.length} friend(s) matching "${params.query}"`
            : `Total ${mapped.length} friend(s)`,
        });
      }

      case "groups":
      case "list-groups":
      case "search-groups": {
        const api = await getApi();
        const groupsResp = await api.getAllGroups();
        const groupIds = Object.keys(groupsResp?.gridVerMap ?? {});
        if (groupIds.length === 0) {
          return json({ groups: [], count: 0, message: "No groups found" });
        }
        try {
          const infoResp = await api.getGroupInfo(groupIds);
          const gridInfoMap = infoResp?.gridInfoMap ?? {};
          let groups = Object.entries(gridInfoMap).map(([id, info]: [string, any]) => ({
            groupId: id,
            name: info.name,
            desc: info.desc,         // field name is "desc" NOT "description"
            totalMember: info.totalMember,
            maxMember: info.maxMember,
            creatorId: info.creatorId,
            adminIds: info.adminIds,
            avatar: info.avt,        // field name is "avt" NOT "avatar"
          }));
          if (params.query?.trim()) {
            const q = params.query.trim().toLowerCase();
            groups = groups.filter(g =>
              (g.name ?? "").toLowerCase().includes(q) || g.groupId.includes(q),
            );
          }
          return json({
            groups,
            count: groups.length,
            message: params.query
              ? `Found ${groups.length} group(s) matching "${params.query}"`
              : `Total ${groups.length} group(s)`,
          });
        } catch {
          return json({
            groups: groupIds.map((id) => ({ groupId: id })),
            count: groupIds.length,
            message: "Group IDs only (details unavailable)",
          });
        }
      }

      case "me": {
        const api = await getApi();
        const ownId = api.getOwnId();
        let raw: any = null;
        try {
          raw = await api.fetchAccountInfo();
        } catch {
          // fetchAccountInfo may fail for some account types
        }
        // zca-js wraps result in { profile: { ... } } or returns flat object
        const info = raw?.profile ?? raw;
        return json({
          userId: info?.userId ?? ownId ?? null,
          displayName: info?.displayName ?? null,
          zaloName: info?.zaloName ?? null,
          avatar: info?.avatar ?? null,
          status: info?.status ?? null,
          phoneNumber: info?.phoneNumber ?? null,
          gender: info?.gender ?? null,
          dob: info?.sdob ?? null,
        });
      }

      case "status": {
        const { isAuthenticated, hasStoredCredentials } = await import("./zalo-client.js");
        return json({
          authenticated: isAuthenticated(),
          hasCredentials: hasStoredCredentials(),
        });
      }

      case "block-user": {
        if (!params.userId) {
          throw new Error("userId required for block-user action");
        }
        const userId = await resolveUserId(params.userId);
        const config = readOpenClawConfig();
        const updated = addToDenyFrom(config, userId);
        writeOpenClawConfig(updated);
        return json({
          success: true,
          action: "blocked",
          userId,
          message: `User ${params.userId} (ID: ${userId}) has been blocked globally`,
          note: "Restart gateway for changes to take effect: openclaw gateway restart",
        });
      }

      case "unblock-user": {
        if (!params.userId) {
          throw new Error("userId required for unblock-user action");
        }
        const userId = await resolveUserId(params.userId);
        const config = readOpenClawConfig();
        const updated = removeFromDenyFrom(config, userId);
        writeOpenClawConfig(updated);
        return json({
          success: true,
          action: "unblocked",
          userId,
          message: `User ${params.userId} (ID: ${userId}) has been unblocked`,
          note: "Restart gateway for changes to take effect: openclaw gateway restart",
        });
      }

      case "block-user-in-group": {
        if (!params.userId) {
          throw new Error("userId required for block-user-in-group action");
        }
        if (!params.groupId) {
          throw new Error("groupId required for block-user-in-group action");
        }
        const userId = await resolveUserId(params.userId);
        const groupId = await resolveGroupId(params.groupId);
        const config = readOpenClawConfig();
        const updated = addToGroupDenyUsers(config, groupId, userId);
        writeOpenClawConfig(updated);
        return json({
          success: true,
          action: "blocked_in_group",
          userId,
          groupId,
          message: `User ${params.userId} (ID: ${userId}) has been blocked in group ${params.groupId} (ID: ${groupId})`,
          note: "Restart gateway for changes to take effect: openclaw gateway restart",
        });
      }

      case "unblock-user-in-group": {
        if (!params.userId) {
          throw new Error("userId required for unblock-user-in-group action");
        }
        if (!params.groupId) {
          throw new Error("groupId required for unblock-user-in-group action");
        }
        const userId = await resolveUserId(params.userId);
        const groupId = await resolveGroupId(params.groupId);
        const config = readOpenClawConfig();
        const updated = removeFromGroupDenyUsers(config, groupId, userId);
        writeOpenClawConfig(updated);
        return json({
          success: true,
          action: "unblocked_in_group",
          userId,
          groupId,
          message: `User ${params.userId} (ID: ${userId}) has been unblocked in group ${params.groupId} (ID: ${groupId})`,
          note: "Restart gateway for changes to take effect: openclaw gateway restart",
        });
      }

      case "list-blocked": {
        const config = readOpenClawConfig();
        const blocked = listBlockedUsers(config);
        return json({
          blocked,
          count: blocked.length,
          message: blocked.length > 0
            ? `Blocked users (${blocked.length}): ${blocked.join(", ")}`
            : "No users blocked globally",
        });
      }

      case "list-allowed": {
        const config = readOpenClawConfig();
        const allowed = listAllowedUsers(config);
        return json({
          allowed,
          count: allowed.length,
          message: allowed.length > 0
            ? `Allowed users (${allowed.length}): ${allowed.join(", ")}`
            : "No explicit allow list (check dmPolicy setting)",
        });
      }

      case "allow-user-in-group": {
        if (!params.userId) {
          throw new Error("userId required for allow-user-in-group action");
        }
        if (!params.groupId) {
          throw new Error("groupId required for allow-user-in-group action");
        }
        const userId = await resolveUserId(params.userId);
        const groupId = await resolveGroupId(params.groupId);
        const config = readOpenClawConfig();
        const updated = addToGroupAllowUsers(config, groupId, userId);
        writeOpenClawConfig(updated);
        return json({
          success: true,
          action: "allowed_in_group",
          userId,
          groupId,
          message: `User ${params.userId} (ID: ${userId}) added to allowUsers in group ${params.groupId} (ID: ${groupId}). Only users in allowUsers list will be processed.`,
          note: "Restart gateway for changes to take effect: openclaw gateway restart",
        });
      }

      case "unallow-user-in-group": {
        if (!params.userId) {
          throw new Error("userId required for unallow-user-in-group action");
        }
        if (!params.groupId) {
          throw new Error("groupId required for unallow-user-in-group action");
        }
        const userId = await resolveUserId(params.userId);
        const groupId = await resolveGroupId(params.groupId);
        const config = readOpenClawConfig();
        const updated = removeFromGroupAllowUsers(config, groupId, userId);
        writeOpenClawConfig(updated);
        return json({
          success: true,
          action: "unallowed_in_group",
          userId,
          groupId,
          message: `User ${params.userId} (ID: ${userId}) removed from allowUsers in group ${params.groupId} (ID: ${groupId})`,
          note: "Restart gateway for changes to take effect: openclaw gateway restart",
        });
      }

      case "list-allowed-in-group": {
        if (!params.groupId) {
          throw new Error("groupId required for list-allowed-in-group action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const config = readOpenClawConfig();
        const allowed = listAllowedUsersInGroup(config, groupId);
        return json({
          groupId,
          allowed,
          count: allowed.length,
          message: allowed.length > 0
            ? `Allowed users in group (${allowed.length}): ${allowed.join(", ")}. Only these users' messages will be processed.`
            : "No allowUsers configured for this group (all users' messages are processed, subject to denyUsers and @mention rules)",
        });
      }

      case "find-user": {
        if (!params.phoneNumber) {
          throw new Error("phoneNumber required for find-user action");
        }
        const cleanPhone = params.phoneNumber.replace(/[\s\-]/g, "");
        if (!/^(\+84|84|0)\d{9,10}$/.test(cleanPhone)) {
          throw new Error(
            `Invalid phone number format: ${params.phoneNumber}. Expected: 0987654321 or +84987654321`
          );
        }
        const api = await getApi();
        const result = await api.findUser(cleanPhone);
        if (!result || !result.uid) {
          return json({
            found: false,
            phoneNumber: cleanPhone,
            message: "User not found or phone number not registered on Zalo",
          });
        }
        return json({
          found: true,
          phoneNumber: cleanPhone,
          user: {
            userId: result.uid,
            displayName: result.display_name || result.zalo_name,
            zaloName: result.zalo_name,
            avatar: result.avatar,
            gender: result.gender,
            status: result.status,
          },
          message: `Found user: ${result.display_name || result.zalo_name} (ID: ${result.uid})`,
        });
      }

      case "send-friend-request": {
        if (!params.userId) {
          throw new Error("userId required for send-friend-request action");
        }
        if (!/^\d+$/.test(params.userId)) {
          throw new Error(
            `Invalid userId: ${params.userId}. Use numeric ID from find-user action.`
          );
        }
        const requestMsg = params.requestMessage || "Xin chào! Kết bạn với mình nhé.";
        const api = await getApi();
        // API signature: sendFriendRequest(msg: string, userId: string)
        await api.sendFriendRequest(requestMsg, params.userId);
        return json({
          success: true,
          userId: params.userId,
          requestMessage: requestMsg,
          message: `Friend request sent to user ${params.userId}`,
        });
      }

      case "send-to-stranger": {
        if (!params.userId) {
          throw new Error("userId required for send-to-stranger action");
        }
        if (!params.message) {
          throw new Error("message required for send-to-stranger action");
        }
        if (!/^\d+$/.test(params.userId)) {
          throw new Error(
            `Invalid userId: ${params.userId}. Use numeric ID from find-user action.`
          );
        }
        const api = await getApi();
        // ThreadType.User = 0 (KHÔNG phải 1)
        const result = await api.sendMessage(
          { msg: params.message },
          params.userId,
          ThreadType.User,
        );
        return json({
          success: true,
          userId: params.userId,
          messageId: result?.message?.msgId,
          message: `Message sent to user ${params.userId}`,
          note: "User may not receive if they don't accept messages from strangers.",
        });
      }

      case "check-friend-status": {
        if (!params.userId) {
          throw new Error("userId required for check-friend-status action");
        }
        if (!/^\d+$/.test(params.userId)) {
          throw new Error("userId must be numeric ID");
        }
        const api = await getApi();
        // API: getFriendRequestStatus(friendId: string)
        const status = await api.getFriendRequestStatus(params.userId);
        return json({
          userId: params.userId,
          isFriend: status.is_friend === 1,
          isRequested: status.is_requested === 1,    // Họ đã gửi request cho mình
          isRequesting: status.is_requesting === 1,   // Mình đã gửi request cho họ
          isSeenFriendReq: status.isSeenFriendReq,
          message: status.is_friend === 1
            ? `User ${params.userId} is already your friend`
            : status.is_requesting === 1
              ? `You already sent a friend request to ${params.userId}`
              : status.is_requested === 1
                ? `User ${params.userId} sent you a friend request`
                : `User ${params.userId} is not your friend`,
        });
      }

      case "accept-friend-request": {
        if (!params.userId) {
          throw new Error("userId required for accept-friend-request action");
        }
        const api = await getApi();
        // API: acceptFriendRequest(friendId: string) - CHỈ 1 PARAM
        await api.acceptFriendRequest(params.userId);
        removePendingRequest(params.userId);
        return json({
          success: true,
          userId: params.userId,
          message: `Accepted friend request from user ${params.userId}`,
        });
      }

      case "reject-friend-request": {
        if (!params.userId) {
          throw new Error("userId required for reject-friend-request action");
        }
        const api = await getApi();
        // API: rejectFriendRequest(friendId: string) - CHỈ 1 PARAM
        await api.rejectFriendRequest(params.userId);
        removePendingRequest(params.userId);
        return json({
          success: true,
          userId: params.userId,
          message: `Rejected friend request from user ${params.userId}`,
        });
      }

      case "get-sent-requests": {
        const api = await getApi();
        const response = await api.getSentFriendRequest();
        // Response is OBJECT { [userId]: SentFriendRequestInfo }, NOT array
        const requests = Object.entries(response).map(([uid, info]: [string, any]) => ({
          userId: info.userId || uid,
          displayName: info.displayName,
          zaloName: info.zaloName,
          avatar: info.avatar,
          requestMessage: info.fReqInfo?.message,
          sentAt: info.fReqInfo?.time,
        }));
        return json({
          requests,
          count: requests.length,
          message: requests.length > 0
            ? `You have ${requests.length} pending sent request(s)`
            : "No pending sent requests",
        });
      }

      case "get-friend-requests": {
        // Read from local store (populated by friend_event listener in monitor.ts)
        const pending = getPendingRequests();
        return json({
          requests: pending.map(r => ({
            fromUid: r.fromUid,
            message: r.message,
            receivedAt: r.receivedAt,
          })),
          count: pending.length,
          message: pending.length > 0
            ? `You have ${pending.length} pending friend request(s)`
            : "No pending friend requests",
          note: "Requests are captured in real-time via listener. Only requests received while gateway is running are shown.",
        });
      }

      case "undo-friend-request": {
        if (!params.userId) {
          throw new Error("userId required for undo-friend-request action");
        }
        const api = await getApi();
        // API: undoFriendRequest(friendId: string) - CHỈ 1 PARAM
        await api.undoFriendRequest(params.userId);
        return json({
          success: true,
          userId: params.userId,
          message: `Cancelled friend request to user ${params.userId}`,
        });
      }

      case "unfriend": {
        if (!params.userId) {
          throw new Error("userId required for unfriend action");
        }
        const userId = await resolveUserId(params.userId);
        const api = await getApi();
        // API: removeFriend(friendId: string)
        await api.removeFriend(userId);
        return json({
          success: true,
          userId,
          message: `Removed friend ${params.userId} (ID: ${userId})`,
        });
      }

      case "set-friend-nickname": {
        if (!params.userId || !params.nickname) {
          throw new Error("userId and nickname required for set-friend-nickname action");
        }
        const userId = await resolveUserId(params.userId);
        const api = await getApi();
        // API: changeFriendAlias(alias: string, friendId: string) - alias TRƯỚC!
        await api.changeFriendAlias(params.nickname, userId);
        return json({
          success: true,
          userId,
          nickname: params.nickname,
          message: `Set nickname for ${params.userId} (ID: ${userId}) to "${params.nickname}"`,
        });
      }

      case "remove-friend-nickname": {
        if (!params.userId) {
          throw new Error("userId required for remove-friend-nickname action");
        }
        const userId = await resolveUserId(params.userId);
        const api = await getApi();
        await api.removeFriendAlias(userId);
        return json({
          success: true,
          userId,
          message: `Removed nickname for ${params.userId} (ID: ${userId})`,
        });
      }

      case "get-online-friends": {
        const api = await getApi();
        // API returns { predefine: string[], ownerStatus: string, onlines: [{userId, status}] }
        const response = await api.getFriendOnlines();
        const onlines = response?.onlines ?? [];
        return json({
          friends: onlines.map((f: any) => ({
            userId: f.userId,
            status: f.status,
          })),
          count: onlines.length,
          message: `${onlines.length} friend(s) online`,
          note: "Only userId and status available. Use friends action with query to get display names.",
        });
      }

      case "get-group-info": {
        if (!params.groupId) {
          throw new Error("groupId required for get-group-info action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        // API: getGroupInfo(groupId: string | string[])
        const infoResp = await api.getGroupInfo(groupId);
        const info = infoResp?.gridInfoMap?.[groupId];
        if (!info) {
          return json({ found: false, groupId, message: `Group not found` });
        }
        return json({
          found: true,
          group: {
            groupId,
            name: info.name,
            desc: info.desc,
            totalMember: info.totalMember,
            maxMember: info.maxMember,
            creatorId: info.creatorId,
            adminIds: info.adminIds,
            memberIds: extractMemberIds(info),
            avatar: info.avt,
            createdTime: info.createdTime,
          },
        });
      }

      case "create-group": {
        if (!params.memberIds || params.memberIds.length === 0) {
          throw new Error("memberIds required for create-group action (at least 1 member)");
        }
        const api = await getApi();
        // API: createGroup(options: { name?, members: string[] })
        const result = await api.createGroup({
          name: params.groupName,
          members: params.memberIds,
        });
        return json({
          success: true,
          groupId: result?.groupId,
          groupName: params.groupName,
          successMembers: result?.sucessMembers,   // typo is in zca-js API
          errorMembers: result?.errorMembers,
          message: `Created group${params.groupName ? ` "${params.groupName}"` : ""} (ID: ${result?.groupId})`,
        });
      }

      case "add-to-group": {
        if (!params.groupId || !params.userId) {
          throw new Error("groupId and userId required for add-to-group action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const userId = await resolveUserId(params.userId);
        const api = await getApi();
        // API: addUserToGroup(memberId, groupId) - memberId TRƯỚC!
        const result = await api.addUserToGroup(userId, groupId);
        const hasErrors = result?.errorMembers?.length > 0;
        return json({
          success: !hasErrors,
          groupId,
          userId,
          errorMembers: result?.errorMembers,
          message: hasErrors
            ? `Failed to add some members: ${result.errorMembers.join(", ")}`
            : `Added user ${params.userId} to group ${params.groupId}`,
        });
      }

      case "remove-from-group": {
        if (!params.groupId || !params.userId) {
          throw new Error("groupId and userId required for remove-from-group action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const userId = await resolveUserId(params.userId);
        const api = await getApi();
        // API: removeUserFromGroup(memberId, groupId) - memberId TRƯỚC!
        await api.removeUserFromGroup(userId, groupId);
        return json({
          success: true,
          groupId,
          userId,
          message: `Removed user ${params.userId} from group ${params.groupId}`,
        });
      }

      case "leave-group": {
        if (!params.groupId) {
          throw new Error("groupId required for leave-group action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        // API: leaveGroup(groupId: string, silent?: boolean)
        await api.leaveGroup(groupId);
        return json({
          success: true,
          groupId,
          message: `Left group ${params.groupId}`,
        });
      }

      case "rename-group": {
        if (!params.groupId || !params.groupName) {
          throw new Error("groupId and groupName required for rename-group action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        // API: changeGroupName(name, groupId) - name TRƯỚC!
        await api.changeGroupName(params.groupName, groupId);
        return json({
          success: true,
          groupId,
          newName: params.groupName,
          message: `Renamed group to "${params.groupName}"`,
        });
      }

      case "add-group-admin": {
        if (!params.groupId || !params.userId) {
          throw new Error("groupId and userId required for add-group-admin action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const userId = await resolveUserId(params.userId);
        const api = await getApi();
        // API: addGroupDeputy(memberId, groupId) - memberId TRƯỚC!
        await api.addGroupDeputy(userId, groupId);
        return json({
          success: true,
          groupId,
          userId,
          message: `Added ${params.userId} as admin of group ${params.groupId}`,
        });
      }

      case "remove-group-admin": {
        if (!params.groupId || !params.userId) {
          throw new Error("groupId and userId required for remove-group-admin action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const userId = await resolveUserId(params.userId);
        const api = await getApi();
        // API: removeGroupDeputy(memberId, groupId) - memberId TRƯỚC!
        await api.removeGroupDeputy(userId, groupId);
        return json({
          success: true,
          groupId,
          userId,
          message: `Removed ${params.userId} from admin of group ${params.groupId}`,
        });
      }

      // ========== Phase 4: Media ==========

      case "send-video": {
        if (!params.threadId || !params.url || !params.thumbnailUrl) {
          throw new Error("threadId, url (video URL), and thumbnailUrl required for send-video action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.sendVideo(
          {
            videoUrl: params.url,
            thumbnailUrl: params.thumbnailUrl,
            msg: params.message,
            duration: params.duration,
          },
          params.threadId,
          type,
        );
        return json({
          success: true,
          messageId: result?.msgId,
          message: `Video sent to ${params.isGroup ? "group" : "user"} ${params.threadId}`,
        });
      }

      case "send-voice": {
        if (!params.threadId || !params.voiceUrl) {
          throw new Error("threadId and voiceUrl required for send-voice action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.sendVoice(
          { voiceUrl: params.voiceUrl },
          params.threadId,
          type,
        );
        return json({
          success: true,
          messageId: result?.msgId,
          message: `Voice sent to ${params.isGroup ? "group" : "user"} ${params.threadId}`,
        });
      }

      case "send-sticker": {
        if (!params.threadId || params.stickerId == null || params.stickerCateId == null) {
          throw new Error("threadId, stickerId, and stickerCateId required for send-sticker action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.sendSticker(
          { id: params.stickerId, cateId: params.stickerCateId, type: 2 },
          params.threadId,
          type,
        );
        return json({
          success: true,
          messageId: result?.msgId,
          message: `Sticker sent to ${params.isGroup ? "group" : "user"} ${params.threadId}`,
        });
      }

      case "send-card": {
        if (!params.threadId || !params.userId) {
          throw new Error("threadId and userId required for send-card action (share contact card)");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.sendCard(
          { userId: params.userId, phoneNumber: params.phoneNumber },
          params.threadId,
          type,
        );
        return json({
          success: true,
          messageId: result?.msgId,
          message: `Contact card sent to ${params.isGroup ? "group" : "user"} ${params.threadId}`,
        });
      }

      // ========== Phase 5: User Profile ==========

      case "get-user-info": {
        if (!params.userId) {
          throw new Error("userId required for get-user-info action");
        }
        const api = await getApi();
        const result = await api.getUserInfo(params.userId);
        const profiles = result?.changed_profiles ?? {};
        const info = Object.values(profiles)[0] as any;
        if (!info) {
          return json({
            found: false,
            userId: params.userId,
            message: `No profile info found for user ${params.userId}`,
          });
        }
        return json({
          found: true,
          user: {
            userId: params.userId,
            displayName: info.displayName ?? info.display_name,
            zaloName: info.zaloName ?? info.zalo_name,
            avatar: info.avatar,
            gender: info.gender,
            dob: info.dob,
            phoneNumber: info.phoneNumber,
            status: info.status,
          },
        });
      }

      case "last-online": {
        if (!params.userId) {
          throw new Error("userId required for last-online action");
        }
        const api = await getApi();
        const result = await api.lastOnline(params.userId);
        return json({
          userId: params.userId,
          lastOnline: result?.lastOnline,
          showOnlineStatus: result?.settings?.show_online_status,
          message: result?.lastOnline
            ? `Last online: ${new Date(result.lastOnline).toISOString()}`
            : "Last online info not available (user may hide online status)",
        });
      }

      case "get-qr": {
        if (!params.userId) {
          throw new Error("userId required for get-qr action");
        }
        const api = await getApi();
        const result = await api.getQR(params.userId);
        const qrUrl = result?.[params.userId];
        return json({
          userId: params.userId,
          qrUrl: qrUrl || null,
          message: qrUrl ? `QR code URL for user ${params.userId}` : "QR code not available",
        });
      }

      // ========== Phase 6: Message Management ==========

      case "delete-message": {
        if (!params.threadId || !params.msgId || !params.cliMsgId) {
          throw new Error("threadId, msgId, and cliMsgId required for delete-message action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const ownId = api.getOwnId();
        const result = await api.deleteMessage(
          {
            data: { cliMsgId: params.cliMsgId, msgId: params.msgId, uidFrom: ownId },
            threadId: params.threadId,
            type,
          },
          params.onlyMe ?? false,
        );
        return json({
          success: true,
          status: result?.status,
          onlyMe: params.onlyMe ?? false,
          message: `Message deleted${params.onlyMe ? " (only for me)" : " (for everyone)"}`,
        });
      }

      case "undo-message": {
        if (!params.threadId || !params.msgId || !params.cliMsgId) {
          throw new Error("threadId, msgId, and cliMsgId required for undo-message (recall) action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.undo(
          { msgId: params.msgId, cliMsgId: params.cliMsgId },
          params.threadId,
          type,
        );
        return json({
          success: true,
          status: result?.status,
          message: `Message recalled in ${params.isGroup ? "group" : "user"} ${params.threadId}`,
        });
      }

      case "forward-message": {
        if (!params.threadIds || params.threadIds.length === 0) {
          throw new Error("threadIds required for forward-message action");
        }
        if (!params.message) {
          throw new Error("message required for forward-message action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.forwardMessage(
          { message: params.message },
          params.threadIds,
          type,
        );
        return json({
          success: result?.success?.length ?? 0,
          fail: result?.fail?.length ?? 0,
          message: `Forwarded to ${result?.success?.length ?? 0} thread(s), ${result?.fail?.length ?? 0} failed`,
        });
      }

      // ========== Phase 7: Reactions ==========

      case "add-reaction": {
        if (!params.threadId || !params.msgId || !params.cliMsgId) {
          throw new Error("threadId, msgId, and cliMsgId required for add-reaction action");
        }
        const iconMap: Record<string, Reactions> = {
          heart: Reactions.HEART, like: Reactions.LIKE, haha: Reactions.HAHA,
          wow: Reactions.WOW, cry: Reactions.CRY, angry: Reactions.ANGRY,
          kiss: Reactions.KISS, sad: Reactions.SAD, dislike: Reactions.DISLIKE,
          love: Reactions.LOVE, ok: Reactions.OK, pray: Reactions.PRAY,
          "": Reactions.NONE,
        };
        const iconStr = (params.icon ?? "heart").toLowerCase();
        const reactionIcon = iconMap[iconStr] ?? (iconStr as Reactions);
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.addReaction(reactionIcon, {
          data: { msgId: params.msgId, cliMsgId: params.cliMsgId },
          threadId: params.threadId,
          type,
        });
        return json({
          success: true,
          msgIds: result?.msgIds,
          icon: iconStr,
          message: `Reaction "${iconStr}" added to message ${params.msgId}`,
        });
      }

      // ========== Phase 8: Polls ==========

      case "create-poll": {
        if (!params.groupId || !params.title || !params.options || params.options.length < 2) {
          throw new Error("groupId, title (question), and options (at least 2) required for create-poll");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        const result = await api.createPoll(
          { question: params.title, options: params.options },
          groupId,
        );
        return json({
          success: true,
          poll: result,
          message: `Poll created in group ${params.groupId}`,
        });
      }

      case "vote-poll": {
        if (params.pollId == null || params.optionId == null) {
          throw new Error("pollId and optionId required for vote-poll action");
        }
        const api = await getApi();
        const result = await api.votePoll(params.pollId, params.optionId);
        return json({
          success: true,
          options: result?.options,
          message: `Voted on poll ${params.pollId}`,
        });
      }

      case "lock-poll": {
        if (params.pollId == null) {
          throw new Error("pollId required for lock-poll action");
        }
        const api = await getApi();
        await api.lockPoll(params.pollId);
        return json({
          success: true,
          pollId: params.pollId,
          message: `Poll ${params.pollId} locked`,
        });
      }

      case "get-poll-detail": {
        if (params.pollId == null) {
          throw new Error("pollId required for get-poll-detail action");
        }
        const api = await getApi();
        const result = await api.getPollDetail(params.pollId);
        return json({
          poll: result,
          message: `Poll ${params.pollId} details retrieved`,
        });
      }

      // ========== Phase 9: Reminders ==========

      case "create-reminder": {
        if (!params.threadId || !params.title) {
          throw new Error("threadId and title required for create-reminder action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.createReminder(
          {
            title: params.title,
            emoji: params.emoji,
            startTime: params.startTime,
            repeat: params.repeat,
          },
          params.threadId,
          type,
        );
        return json({
          success: true,
          reminder: result,
          message: `Reminder "${params.title}" created`,
        });
      }

      case "remove-reminder": {
        if (!params.reminderId || !params.threadId) {
          throw new Error("reminderId and threadId required for remove-reminder action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        await api.removeReminder(params.reminderId, params.threadId, type);
        return json({
          success: true,
          reminderId: params.reminderId,
          message: `Reminder ${params.reminderId} removed`,
        });
      }

      case "edit-reminder": {
        if (!params.reminderId || !params.threadId || !params.title) {
          throw new Error("reminderId, threadId, and title required for edit-reminder action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.editReminder(
          {
            title: params.title,
            topicId: params.reminderId,
            emoji: params.emoji,
            startTime: params.startTime,
            repeat: params.repeat,
          },
          params.threadId,
          type,
        );
        return json({
          success: true,
          reminder: result,
          message: `Reminder ${params.reminderId} updated`,
        });
      }

      case "list-reminders": {
        if (!params.threadId) {
          throw new Error("threadId required for list-reminders action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const result = await api.getListReminder({}, params.threadId, type);
        const reminders = Array.isArray(result) ? result : [];
        return json({
          reminders: reminders.map((r: any) => ({
            id: r.id ?? r.reminderId,
            title: r.params?.title,
            emoji: r.emoji,
            startTime: r.startTime,
            repeat: r.repeat,
            creatorId: r.creatorId ?? r.creatorUid,
          })),
          count: reminders.length,
          message: `${reminders.length} reminder(s) found`,
        });
      }

      // ========== Phase 10: Group Advanced ==========

      case "change-group-owner": {
        if (!params.groupId || !params.userId) {
          throw new Error("groupId and userId required for change-group-owner action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const userId = await resolveUserId(params.userId);
        const api = await getApi();
        // API: changeGroupOwner(memberId, groupId) - memberId TRƯỚC!
        await api.changeGroupOwner(userId, groupId);
        return json({
          success: true,
          groupId,
          newOwnerId: userId,
          message: `Transferred group ownership to ${params.userId}`,
        });
      }

      case "disperse-group": {
        if (!params.groupId) {
          throw new Error("groupId required for disperse-group action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        await api.disperseGroup(groupId);
        return json({
          success: true,
          groupId,
          message: `Group ${params.groupId} has been dispersed (dissolved)`,
        });
      }

      case "update-group-settings": {
        if (!params.groupId || !params.groupSettings) {
          throw new Error("groupId and groupSettings required for update-group-settings action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        await api.updateGroupSettings(params.groupSettings as any, groupId);
        return json({
          success: true,
          groupId,
          settings: params.groupSettings,
          message: `Group settings updated for ${params.groupId}`,
        });
      }

      case "enable-group-link": {
        if (!params.groupId) {
          throw new Error("groupId required for enable-group-link action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        const result = await api.enableGroupLink(groupId);
        return json({
          success: true,
          groupId,
          link: result?.link,
          expirationDate: result?.expiration_date,
          message: `Group link enabled: ${result?.link}`,
        });
      }

      case "disable-group-link": {
        if (!params.groupId) {
          throw new Error("groupId required for disable-group-link action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        await api.disableGroupLink(groupId);
        return json({
          success: true,
          groupId,
          message: `Group link disabled for ${params.groupId}`,
        });
      }

      case "get-group-link": {
        if (!params.groupId) {
          throw new Error("groupId required for get-group-link action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        const result = await api.getGroupLinkDetail(groupId);
        return json({
          groupId,
          link: result?.link,
          enabled: result?.enabled === 1,
          expirationDate: result?.expiration_date,
          message: result?.enabled === 1
            ? `Group link: ${result.link}`
            : "Group link is disabled",
        });
      }

      case "get-pending-members": {
        if (!params.groupId) {
          throw new Error("groupId required for get-pending-members action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        const result = await api.getPendingGroupMembers(groupId);
        const users = result?.users ?? [];
        return json({
          groupId,
          pendingMembers: users,
          count: users.length,
          message: users.length > 0
            ? `${users.length} pending member(s) waiting for approval`
            : "No pending members",
        });
      }

      case "review-pending-members": {
        if (!params.groupId || !params.memberIds || params.memberIds.length === 0) {
          throw new Error("groupId and memberIds required for review-pending-members action");
        }
        if (params.isApprove == null) {
          throw new Error("isApprove (true/false) required for review-pending-members action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        const result = await api.reviewPendingMemberRequest(
          { members: params.memberIds, isApprove: params.isApprove },
          groupId,
        );
        return json({
          success: true,
          groupId,
          action: params.isApprove ? "approved" : "rejected",
          result,
          message: `${params.isApprove ? "Approved" : "Rejected"} ${params.memberIds.length} pending member(s)`,
        });
      }

      // ========== Phase 11: Conversation ==========

      case "mute-conversation": {
        if (!params.threadId) {
          throw new Error("threadId required for mute-conversation action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const dur = params.duration ?? -1; // default: forever
        await api.setMute(
          { duration: dur as any, action: MuteAction.MUTE },
          params.threadId,
          type,
        );
        return json({
          success: true,
          threadId: params.threadId,
          duration: dur,
          message: `Muted conversation ${params.threadId}${dur === -1 ? " (forever)" : ` for ${dur}s`}`,
        });
      }

      case "unmute-conversation": {
        if (!params.threadId) {
          throw new Error("threadId required for unmute-conversation action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        await api.setMute(
          { action: MuteAction.UNMUTE },
          params.threadId,
          type,
        );
        return json({
          success: true,
          threadId: params.threadId,
          message: `Unmuted conversation ${params.threadId}`,
        });
      }

      case "pin-conversation": {
        if (!params.threadId) {
          throw new Error("threadId required for pin-conversation action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        await api.setPinnedConversations(true, params.threadId, type);
        return json({
          success: true,
          threadId: params.threadId,
          message: `Pinned conversation ${params.threadId}`,
        });
      }

      case "unpin-conversation": {
        if (!params.threadId) {
          throw new Error("threadId required for unpin-conversation action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        await api.setPinnedConversations(false, params.threadId, type);
        return json({
          success: true,
          threadId: params.threadId,
          message: `Unpinned conversation ${params.threadId}`,
        });
      }

      case "delete-chat": {
        if (!params.threadId || !params.msgId || !params.cliMsgId) {
          throw new Error("threadId, msgId (last msg), and cliMsgId required for delete-chat action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const ownId = api.getOwnId();
        const result = await api.deleteChat(
          { ownerId: ownId, cliMsgId: params.cliMsgId, globalMsgId: params.msgId },
          params.threadId,
          type,
        );
        return json({
          success: true,
          status: result?.status,
          message: `Chat with ${params.threadId} deleted`,
        });
      }

      // ========== Phase 12: Quick Messages & Auto-Reply ==========

      case "list-quick-messages": {
        const api = await getApi();
        const result = await api.getQuickMessageList();
        const items = result?.items ?? [];
        return json({
          items: items.map((item: any) => ({
            itemId: item.id ?? item.itemId,
            keyword: item.keyword,
            title: item.title,
          })),
          count: items.length,
          message: `${items.length} quick message(s)`,
        });
      }

      case "add-quick-message": {
        if (!params.keyword || !params.title) {
          throw new Error("keyword and title required for add-quick-message action");
        }
        const api = await getApi();
        const result = await api.addQuickMessage({
          keyword: params.keyword,
          title: params.title,
        });
        return json({
          success: true,
          item: result?.item,
          message: `Quick message added: /${params.keyword} → "${params.title}"`,
        });
      }

      case "remove-quick-message": {
        if (params.itemId == null) {
          throw new Error("itemId required for remove-quick-message action");
        }
        const api = await getApi();
        const result = await api.removeQuickMessage(params.itemId);
        return json({
          success: true,
          removedIds: result?.itemIds,
          message: `Quick message ${params.itemId} removed`,
        });
      }

      case "list-auto-replies": {
        const api = await getApi();
        const result = await api.getAutoReplyList();
        const items = result?.item ?? [];
        return json({
          items: Array.isArray(items) ? items.map((item: any) => ({
            id: item.id,
            content: item.content,
            isEnable: item.isEnable,
            startTime: item.startTime,
            endTime: item.endTime,
            scope: item.scope,
          })) : [],
          count: Array.isArray(items) ? items.length : 0,
          message: `${Array.isArray(items) ? items.length : 0} auto-reply rule(s)`,
        });
      }

      case "create-auto-reply": {
        if (!params.message) {
          throw new Error("message (content) required for create-auto-reply action");
        }
        const api = await getApi();
        const result = await api.createAutoReply({
          content: params.message,
          isEnable: true,
          startTime: params.startTime ?? 0,
          endTime: params.endTime ?? 0,
          scope: 0, // 0 = all
        });
        return json({
          success: true,
          item: result?.item,
          message: `Auto-reply created: "${params.message}"`,
        });
      }

      case "delete-auto-reply": {
        if (params.replyId == null) {
          throw new Error("replyId required for delete-auto-reply action");
        }
        const api = await getApi();
        await api.deleteAutoReply(params.replyId);
        return json({
          success: true,
          replyId: params.replyId,
          message: `Auto-reply ${params.replyId} deleted`,
        });
      }

      // ========== Phase 13: Settings ==========

      case "get-settings": {
        const api = await getApi();
        const result = await api.getSettings();
        return json({
          settings: result,
          message: "Account settings retrieved",
          validKeys: Object.values(UpdateSettingsType),
        });
      }

      case "update-setting": {
        if (!params.settingKey || params.settingValue == null) {
          throw new Error("settingKey and settingValue required for update-setting action");
        }
        const validKeys = Object.values(UpdateSettingsType) as string[];
        if (!validKeys.includes(params.settingKey)) {
          throw new Error(
            `Invalid settingKey: ${params.settingKey}. Valid keys: ${validKeys.join(", ")}`,
          );
        }
        const api = await getApi();
        await api.updateSettings(params.settingKey as UpdateSettingsType, params.settingValue);
        return json({
          success: true,
          settingKey: params.settingKey,
          settingValue: params.settingValue,
          message: `Setting "${params.settingKey}" updated to ${params.settingValue}`,
        });
      }

      // ========== Phase 14: Misc ==========

      case "search-stickers": {
        if (!params.keyword) {
          throw new Error("keyword required for search-stickers action");
        }
        const api = await getApi();
        const stickerIds = await api.getStickers(params.keyword);
        if (!stickerIds || stickerIds.length === 0) {
          return json({
            stickers: [],
            count: 0,
            message: `No stickers found for "${params.keyword}"`,
          });
        }
        const details = await api.getStickersDetail(stickerIds.slice(0, 20));
        return json({
          stickers: (Array.isArray(details) ? details : []).map((s: any) => ({
            id: s.id,
            cateId: s.cateId,
            type: s.type,
            text: s.text,
            stickerUrl: s.stickerUrl,
          })),
          count: stickerIds.length,
          message: `Found ${stickerIds.length} sticker(s) for "${params.keyword}"`,
          note: "Use send-sticker with stickerId and stickerCateId to send a sticker.",
        });
      }

      case "parse-link": {
        if (!params.url) {
          throw new Error("url required for parse-link action");
        }
        const api = await getApi();
        const result = await api.parseLink(params.url);
        return json({
          url: params.url,
          data: result?.data,
          message: result?.data?.title
            ? `Link preview: ${result.data.title}`
            : "Link parsed",
        });
      }

      case "send-report": {
        if (!params.threadId) {
          throw new Error("threadId required for send-report action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        const reasonNum = params.reason ?? 0;
        const reportOptions = reasonNum === 0
          ? { reason: 0 as const, content: params.message || "Reported" }
          : { reason: reasonNum as 1 | 2 | 3 };
        const result = await api.sendReport(reportOptions, params.threadId, type);
        return json({
          success: true,
          reportId: result?.reportId,
          message: `Report sent for ${params.threadId}`,
        });
      }

      // ========== Phase 15: Profile & Avatar ==========

      case "update-profile": {
        if (!params.name) {
          throw new Error("name required for update-profile action");
        }
        const api = await getApi();
        await api.updateProfile({
          profile: {
            name: params.name,
            dob: (params.dob ?? "2000-01-01") as `${string}-${string}-${string}`,
            gender: params.gender ?? 0,
          },
        });
        return json({
          success: true,
          name: params.name,
          dob: params.dob,
          gender: params.gender,
          message: `Profile updated: name="${params.name}"`,
        });
      }

      case "change-avatar": {
        if (!params.url) {
          throw new Error("url (avatar image URL) required for change-avatar action");
        }
        const api = await getApi();
        await api.changeAccountAvatar(params.url);
        return json({
          success: true,
          message: `Account avatar changed`,
        });
      }

      case "delete-avatar": {
        if (!params.photoId) {
          throw new Error("photoId required for delete-avatar action");
        }
        const api = await getApi();
        const result = await api.deleteAvatar(params.photoId);
        return json({
          success: true,
          deletedIds: result?.delPhotoIds,
          message: `Avatar photo ${params.photoId} deleted`,
        });
      }

      case "get-avatar-list": {
        const api = await getApi();
        const result = await api.getAvatarList();
        const photos = result?.photos ?? [];
        return json({
          photos: photos.map((p: any) => ({
            photoId: p.photoId,
            thumbnail: p.thumbnail,
            url: p.url,
          })),
          count: photos.length,
          hasMore: result?.hasMore === 1,
          message: `${photos.length} avatar photo(s)`,
        });
      }

      case "reuse-avatar": {
        if (!params.photoId) {
          throw new Error("photoId required for reuse-avatar action");
        }
        const api = await getApi();
        await api.reuseAvatar(params.photoId);
        return json({
          success: true,
          photoId: params.photoId,
          message: `Avatar reused: ${params.photoId}`,
        });
      }

      // ========== Phase 16: Group Invite & Block ==========

      case "join-group-link": {
        if (!params.link) {
          throw new Error("link required for join-group-link action");
        }
        const api = await getApi();
        await api.joinGroupLink(params.link);
        return json({
          success: true,
          link: params.link,
          message: `Joined group via link`,
        });
      }

      case "invite-to-groups": {
        if (!params.userId || !params.groupIds || params.groupIds.length === 0) {
          throw new Error("userId and groupIds required for invite-to-groups action");
        }
        const api = await getApi();
        const result = await api.inviteUserToGroups(params.userId, params.groupIds);
        return json({
          success: true,
          result: result?.grid_message_map,
          message: `Invited user ${params.userId} to ${params.groupIds.length} group(s)`,
        });
      }

      case "get-group-invites": {
        const api = await getApi();
        const result = await api.getGroupInviteBoxList();
        return json({
          invites: result,
          message: "Group invites retrieved",
        });
      }

      case "join-group-invite": {
        if (!params.groupId) {
          throw new Error("groupId required for join-group-invite action");
        }
        const api = await getApi();
        await api.joinGroupInviteBox(params.groupId);
        return json({
          success: true,
          groupId: params.groupId,
          message: `Joined group ${params.groupId} via invite`,
        });
      }

      case "delete-group-invite": {
        if (!params.groupId) {
          throw new Error("groupId required for delete-group-invite action");
        }
        const api = await getApi();
        const result = await api.deleteGroupInviteBox(
          params.groupId,
          params.blockFutureInvite ?? false,
        );
        return json({
          success: true,
          deletedIds: result?.delInvitaionIds,
          message: `Group invite ${params.groupId} deleted${params.blockFutureInvite ? " (future invites blocked)" : ""}`,
        });
      }

      case "get-group-blocked": {
        if (!params.groupId) {
          throw new Error("groupId required for get-group-blocked action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        const result = await api.getGroupBlockedMember({}, groupId);
        const blocked = result?.blocked_members ?? [];
        return json({
          groupId,
          blockedMembers: blocked.map((m: any) => ({
            userId: m.id,
            displayName: m.dName,
            zaloName: m.zaloName,
            avatar: m.avatar,
          })),
          count: blocked.length,
          hasMore: result?.has_more === 1,
          message: `${blocked.length} blocked member(s) in group`,
        });
      }

      case "block-group-member": {
        if (!params.groupId || !params.userId) {
          throw new Error("groupId and userId required for block-group-member action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const userId = await resolveUserId(params.userId);
        const api = await getApi();
        // API: addGroupBlockedMember(memberId, groupId) - memberId TRƯỚC!
        await api.addGroupBlockedMember(userId, groupId);
        return json({
          success: true,
          groupId,
          userId,
          message: `Blocked ${params.userId} in group ${params.groupId} (Zalo-level)`,
        });
      }

      case "unblock-group-member": {
        if (!params.groupId || !params.userId) {
          throw new Error("groupId and userId required for unblock-group-member action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const userId = await resolveUserId(params.userId);
        const api = await getApi();
        // API: removeGroupBlockedMember(memberId, groupId) - memberId TRƯỚC!
        await api.removeGroupBlockedMember(userId, groupId);
        return json({
          success: true,
          groupId,
          userId,
          message: `Unblocked ${params.userId} in group ${params.groupId} (Zalo-level)`,
        });
      }

      case "get-group-members-info": {
        if (!params.memberIds || params.memberIds.length === 0) {
          throw new Error("memberIds required for get-group-members-info action");
        }
        const api = await getApi();
        const result = await api.getGroupMembersInfo(params.memberIds);
        const profiles = result?.profiles ?? {};
        return json({
          profiles: Object.entries(profiles).map(([id, info]: [string, any]) => ({
            userId: id,
            displayName: info.displayName ?? info.dName,
            zaloName: info.zaloName,
            avatar: info.avatar,
          })),
          count: Object.keys(profiles).length,
          message: `${Object.keys(profiles).length} member profile(s) retrieved`,
        });
      }

      // ========== Phase 17: Conversation Advanced ==========

      case "hide-conversation": {
        if (!params.threadId) {
          throw new Error("threadId required for hide-conversation action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        await api.setHiddenConversations(true, params.threadId, type);
        return json({
          success: true,
          threadId: params.threadId,
          message: `Conversation ${params.threadId} hidden`,
        });
      }

      case "unhide-conversation": {
        if (!params.threadId) {
          throw new Error("threadId required for unhide-conversation action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        await api.setHiddenConversations(false, params.threadId, type);
        return json({
          success: true,
          threadId: params.threadId,
          message: `Conversation ${params.threadId} unhidden`,
        });
      }

      case "get-hidden-conversations": {
        const api = await getApi();
        const result = await api.getHiddenConversations();
        const threads = result?.threads ?? [];
        return json({
          threads: threads.map((t: any) => ({
            threadId: t.thread_id,
            isGroup: t.is_group === 1,
          })),
          count: threads.length,
          message: `${threads.length} hidden conversation(s)`,
        });
      }

      case "mark-unread": {
        if (!params.threadId) {
          throw new Error("threadId required for mark-unread action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        await api.addUnreadMark(params.threadId, type);
        return json({
          success: true,
          threadId: params.threadId,
          message: `Conversation ${params.threadId} marked as unread`,
        });
      }

      case "unmark-unread": {
        if (!params.threadId) {
          throw new Error("threadId required for unmark-unread action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        await api.removeUnreadMark(params.threadId, type);
        return json({
          success: true,
          threadId: params.threadId,
          message: `Unread mark removed for ${params.threadId}`,
        });
      }

      case "get-unread-marks": {
        const api = await getApi();
        const result = await api.getUnreadMark();
        const users = result?.data?.convsUser ?? [];
        const groups = result?.data?.convsGroup ?? [];
        return json({
          users,
          groups,
          totalCount: users.length + groups.length,
          message: `${users.length} user + ${groups.length} group unread mark(s)`,
        });
      }

      case "set-auto-delete-chat": {
        if (!params.threadId || params.ttl == null) {
          throw new Error("threadId and ttl required for set-auto-delete-chat action (ttl: 0=off, 86400000=1day, 604800000=7days, 1209600000=14days)");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        await api.updateAutoDeleteChat(params.ttl as any, params.threadId, type);
        return json({
          success: true,
          threadId: params.threadId,
          ttl: params.ttl,
          message: params.ttl === 0
            ? `Auto-delete disabled for ${params.threadId}`
            : `Auto-delete set to ${params.ttl / 86400000} day(s) for ${params.threadId}`,
        });
      }

      case "get-auto-delete-chats": {
        const api = await getApi();
        const result = await api.getAutoDeleteChat();
        const convs = result?.convers ?? [];
        return json({
          conversations: convs.map((c: any) => ({
            threadId: c.destId,
            isGroup: c.isGroup,
            ttl: c.ttl,
            createdAt: c.createdAt,
          })),
          count: convs.length,
          message: `${convs.length} conversation(s) with auto-delete enabled`,
        });
      }

      case "get-archived-chats": {
        const api = await getApi();
        const result = await api.getArchivedChatList();
        return json({
          items: result?.items ?? [],
          count: (result?.items ?? []).length,
          message: `${(result?.items ?? []).length} archived chat(s)`,
        });
      }

      // ========== Phase 18: Zalo Block & Friend Advanced ==========

      case "zalo-block-user": {
        if (!params.userId) {
          throw new Error("userId required for zalo-block-user action");
        }
        const api = await getApi();
        await api.blockUser(params.userId);
        return json({
          success: true,
          userId: params.userId,
          message: `User ${params.userId} blocked at Zalo level`,
          note: "This is different from OpenClaw block-user which only blocks in OpenClaw config.",
        });
      }

      case "zalo-unblock-user": {
        if (!params.userId) {
          throw new Error("userId required for zalo-unblock-user action");
        }
        const api = await getApi();
        await api.unblockUser(params.userId);
        return json({
          success: true,
          userId: params.userId,
          message: `User ${params.userId} unblocked at Zalo level`,
        });
      }

      case "block-view-feed": {
        if (!params.userId || params.isBlockFeed == null) {
          throw new Error("userId and isBlockFeed required for block-view-feed action");
        }
        const api = await getApi();
        await api.blockViewFeed(params.isBlockFeed, params.userId);
        return json({
          success: true,
          userId: params.userId,
          isBlockFeed: params.isBlockFeed,
          message: params.isBlockFeed
            ? `Blocked feed from user ${params.userId}`
            : `Unblocked feed from user ${params.userId}`,
        });
      }

      case "get-friend-recommendations": {
        const api = await getApi();
        const result = await api.getFriendRecommendations();
        const items = result?.recommItems ?? [];
        return json({
          recommendations: items.map((item: any) => ({
            userId: item.userId,
            displayName: item.displayName ?? item.dName,
            zaloName: item.zaloName,
            avatar: item.avatar,
            source: item.source,
          })),
          count: items.length,
          message: `${items.length} friend recommendation(s)`,
        });
      }

      case "get-alias-list": {
        const api = await getApi();
        const result = await api.getAliasList();
        const items = result?.items ?? [];
        return json({
          aliases: items.map((a: any) => ({
            userId: a.userId,
            alias: a.alias,
          })),
          count: items.length,
          message: `${items.length} friend alias(es)`,
        });
      }

      case "get-related-friend-groups": {
        if (!params.userId) {
          throw new Error("userId required for get-related-friend-groups action");
        }
        const api = await getApi();
        const result = await api.getRelatedFriendGroup(params.userId);
        const groups = result?.groupRelateds?.[params.userId] ?? [];
        return json({
          userId: params.userId,
          groupIds: groups,
          count: groups.length,
          message: `${groups.length} shared group(s) with user ${params.userId}`,
        });
      }

      // ========== Phase 19: Notes & Labels ==========

      case "create-note": {
        if (!params.groupId || !params.title) {
          throw new Error("groupId and title required for create-note action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        const result = await api.createNote(
          { title: params.title, pinAct: params.pinAct },
          groupId,
        );
        return json({
          success: true,
          note: result,
          message: `Note created in group ${params.groupId}`,
        });
      }

      case "edit-note": {
        if (!params.groupId || !params.topicId || !params.title) {
          throw new Error("groupId, topicId, and title required for edit-note action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        const result = await api.editNote(
          { title: params.title, topicId: params.topicId, pinAct: params.pinAct },
          groupId,
        );
        return json({
          success: true,
          note: result,
          message: `Note ${params.topicId} updated in group ${params.groupId}`,
        });
      }

      case "get-boards": {
        if (!params.groupId) {
          throw new Error("groupId required for get-boards action");
        }
        const groupId = await resolveGroupId(params.groupId);
        const api = await getApi();
        const result = await api.getListBoard({}, groupId);
        return json({
          boards: result?.items ?? [],
          count: result?.count ?? 0,
          message: `${result?.count ?? 0} board item(s) in group`,
        });
      }

      case "get-labels": {
        const api = await getApi();
        const result = await api.getLabels();
        return json({
          labels: result?.labelData ?? [],
          version: result?.version,
          lastUpdateTime: result?.lastUpdateTime,
          message: `${(result?.labelData ?? []).length} label(s)`,
        });
      }

      // ========== Phase 20: Catalogs & Products ==========

      case "create-catalog": {
        if (!params.title) {
          throw new Error("title (catalog name) required for create-catalog action");
        }
        const api = await getApi();
        const result = await api.createCatalog(params.title);
        return json({
          success: true,
          catalog: result?.item,
          message: `Catalog "${params.title}" created`,
        });
      }

      case "update-catalog": {
        if (!params.catalogId || !params.title) {
          throw new Error("catalogId and title (name) required for update-catalog action");
        }
        const api = await getApi();
        const result = await api.updateCatalog({
          catalogId: params.catalogId,
          catalogName: params.title,
        });
        return json({
          success: true,
          catalog: result?.item,
          message: `Catalog ${params.catalogId} updated to "${params.title}"`,
        });
      }

      case "delete-catalog": {
        if (!params.catalogId) {
          throw new Error("catalogId required for delete-catalog action");
        }
        const api = await getApi();
        await api.deleteCatalog(params.catalogId);
        return json({
          success: true,
          catalogId: params.catalogId,
          message: `Catalog ${params.catalogId} deleted`,
        });
      }

      case "get-catalogs": {
        const api = await getApi();
        const result = await api.getCatalogList();
        const items = result?.items ?? [];
        return json({
          catalogs: items,
          count: items.length,
          hasMore: result?.has_more === 1,
          message: `${items.length} catalog(s)`,
        });
      }

      case "create-product": {
        if (!params.catalogId || !params.title || !params.price) {
          throw new Error("catalogId, title (productName), and price required for create-product action");
        }
        const api = await getApi();
        const result = await api.createProductCatalog({
          catalogId: params.catalogId,
          productName: params.title,
          price: params.price,
          description: params.description || "",
        });
        return json({
          success: true,
          product: result?.item,
          message: `Product "${params.title}" created in catalog ${params.catalogId}`,
        });
      }

      case "update-product": {
        if (!params.catalogId || !params.productId || !params.title || !params.price) {
          throw new Error("catalogId, productId, title, and price required for update-product action");
        }
        const api = await getApi();
        const result = await api.updateProductCatalog({
          catalogId: params.catalogId,
          productId: params.productId,
          productName: params.title,
          price: params.price,
          description: params.description || "",
          createTime: Date.now(),
        });
        return json({
          success: true,
          product: result?.item,
          message: `Product ${params.productId} updated`,
        });
      }

      case "delete-product": {
        if (!params.catalogId || !params.productId) {
          throw new Error("catalogId and productId required for delete-product action");
        }
        const api = await getApi();
        const result = await api.deleteProductCatalog({
          catalogId: params.catalogId,
          productIds: params.productId,
        });
        return json({
          success: true,
          deleted: result?.item,
          message: `Product ${params.productId} deleted from catalog ${params.catalogId}`,
        });
      }

      case "get-products": {
        if (!params.catalogId) {
          throw new Error("catalogId required for get-products action");
        }
        const api = await getApi();
        const result = await api.getProductCatalogList({
          catalogId: params.catalogId,
        });
        const items = result?.items ?? [];
        return json({
          products: items,
          count: items.length,
          hasMore: result?.has_more === 1,
          message: `${items.length} product(s) in catalog ${params.catalogId}`,
        });
      }

      // ========== Phase 21: Extended ==========

      case "send-typing": {
        if (!params.threadId) {
          throw new Error("threadId required for send-typing action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        await api.sendTypingEvent(params.threadId, type);
        return json({
          success: true,
          threadId: params.threadId,
          message: `Typing event sent to ${params.threadId}`,
        });
      }

      case "send-bank-card": {
        if (!params.threadId || !params.binBank || !params.numAccBank) {
          throw new Error("threadId, binBank, and numAccBank required for send-bank-card action");
        }
        const api = await getApi();
        const type = params.isGroup ? ThreadType.Group : ThreadType.User;
        await api.sendBankCard(
          {
            binBank: params.binBank as any,
            numAccBank: params.numAccBank,
            nameAccBank: params.nameAccBank,
          },
          params.threadId,
          type,
        );
        return json({
          success: true,
          message: `Bank card sent to ${params.threadId}`,
        });
      }

      case "add-poll-options": {
        if (params.pollId == null || !params.options || params.options.length === 0) {
          throw new Error("pollId and options required for add-poll-options action");
        }
        const api = await getApi();
        const result = await api.addPollOptions({
          pollId: params.pollId,
          options: params.options.map(o => ({ voted: false, content: o })),
          votedOptionIds: [],
        });
        return json({
          success: true,
          options: result?.options,
          message: `Added ${params.options.length} option(s) to poll ${params.pollId}`,
        });
      }

      case "share-poll": {
        if (params.pollId == null) {
          throw new Error("pollId required for share-poll action");
        }
        const api = await getApi();
        await api.sharePoll(params.pollId);
        return json({
          success: true,
          pollId: params.pollId,
          message: `Poll ${params.pollId} shared`,
        });
      }

      case "update-quick-message": {
        if (params.itemId == null || !params.keyword || !params.title) {
          throw new Error("itemId, keyword, and title required for update-quick-message action");
        }
        const api = await getApi();
        const result = await api.updateQuickMessage(
          { keyword: params.keyword, title: params.title },
          params.itemId,
        );
        return json({
          success: true,
          item: result?.item,
          message: `Quick message ${params.itemId} updated`,
        });
      }

      case "update-auto-reply": {
        if (params.replyId == null || !params.message) {
          throw new Error("replyId and message (content) required for update-auto-reply action");
        }
        const api = await getApi();
        const result = await api.updateAutoReply({
          id: params.replyId,
          content: params.message,
          isEnable: true,
          startTime: params.startTime ?? 0,
          endTime: params.endTime ?? 0,
          scope: params.scope ?? 0,
        });
        return json({
          success: true,
          item: result?.item,
          message: `Auto-reply ${params.replyId} updated`,
        });
      }

      case "update-active-status": {
        if (params.active == null) {
          throw new Error("active (true/false) required for update-active-status action");
        }
        const api = await getApi();
        const result = await api.updateActiveStatus(params.active);
        return json({
          success: true,
          active: result?.status,
          message: params.active ? "Active status: online" : "Active status: offline",
        });
      }

      case "get-biz-account": {
        if (!params.userId) {
          throw new Error("userId required for get-biz-account action");
        }
        const api = await getApi();
        const result = await api.getBizAccount(params.userId);
        return json({
          userId: params.userId,
          biz: result?.biz,
          pkgId: result?.pkgId,
          message: result?.biz
            ? `Business account info for ${params.userId}`
            : `No business info for ${params.userId}`,
        });
      }

      // ========== Phase 22: zca-js 2.1.0 APIs ==========

      case "find-user-by-username": {
        if (!params.username) {
          throw new Error("username required for find-user-by-username action");
        }
        const api = await getApi();
        const result = await api.findUserByUsername(params.username);
        return json({
          user: result
            ? {
                uid: result.uid,
                displayName: result.display_name,
                zaloName: result.zalo_name,
                avatar: result.avatar,
                gender: result.gender,
              }
            : null,
          message: result ? `Found user: ${result.display_name}` : "User not found",
        });
      }

      case "get-close-friends": {
        const api = await getApi();
        const result = await api.getCloseFriends();
        const friends = result ?? [];
        return json({
          friends: friends.map((f: any) => ({
            userId: f.userId,
            displayName: f.displayName,
            zaloName: f.zaloName,
            avatar: f.avatar,
          })),
          count: friends.length,
          message: `${friends.length} close friend(s)`,
        });
      }

      case "get-group-chat-history": {
        if (!params.groupId) {
          throw new Error("groupId required for get-group-chat-history action");
        }
        const api = await getApi();
        const groupId = await resolveGroupId(params.groupId);
        const result = await api.getGroupChatHistory(groupId, params.count ?? 20);
        const msgs = result?.groupMsgs ?? [];
        return json({
          groupId,
          messages: msgs.map((m: any) => ({
            msgId: m.msgId,
            uidFrom: m.uidFrom,
            content: m.content,
            ts: m.ts,
            msgType: m.msgType,
          })),
          more: result?.more,
          count: msgs.length,
          message: `${msgs.length} message(s) from group history`,
        });
      }

      case "get-multi-users-by-phones": {
        if (!params.phoneNumbers || params.phoneNumbers.length === 0) {
          throw new Error("phoneNumbers array required for get-multi-users-by-phones action");
        }
        const api = await getApi();
        const result = await api.getMultiUsersByPhones(params.phoneNumbers);
        const entries = Object.entries(result ?? {});
        return json({
          users: entries.map(([phone, user]: [string, any]) => ({
            phone,
            uid: user.uid,
            displayName: user.display_name,
            zaloName: user.zalo_name,
            avatar: user.avatar,
          })),
          count: entries.length,
          message: `Found ${entries.length} user(s) by phone numbers`,
        });
      }

      case "search-sticker-detail": {
        if (!params.keyword) {
          throw new Error("keyword required for search-sticker-detail action");
        }
        const api = await getApi();
        const result = await api.searchSticker(params.keyword, params.count ?? 10);
        const stickers = result ?? [];
        return json({
          stickers: stickers.map((s: any) => ({
            id: s.id,
            cateId: s.cateId,
            type: s.type,
            spriteUrl: s.spriteUrl,
          })),
          count: stickers.length,
          message: `${stickers.length} sticker(s) found for "${params.keyword}"`,
        });
      }

      case "update-archived-chat": {
        if (!params.threadId) {
          throw new Error("threadId required for update-archived-chat action");
        }
        const api = await getApi();
        const type = params.isGroup ? 1 : 0;
        const isArchived = params.isArchived !== false;
        const result = await api.updateArchivedChatList(isArchived, { id: params.threadId, type });
        return json({
          success: true,
          archived: isArchived,
          threadId: params.threadId,
          message: isArchived ? "Conversation archived" : "Conversation unarchived",
        });
      }

      case "update-profile-bio": {
        if (params.bio === undefined) {
          throw new Error("bio required for update-profile-bio action");
        }
        const api = await getApi();
        await api.updateProfileBio(params.bio);
        return json({
          success: true,
          bio: params.bio,
          message: params.bio ? `Bio updated to: ${params.bio}` : "Bio cleared",
        });
      }

      case "upgrade-group-to-community": {
        if (!params.groupId) {
          throw new Error("groupId required for upgrade-group-to-community action");
        }
        const api = await getApi();
        const groupId = await resolveGroupId(params.groupId);
        await api.upgradeGroupToCommunity(groupId);
        return json({
          success: true,
          groupId,
          message: `Group ${groupId} upgraded to community`,
        });
      }

      case "change-group-avatar": {
        if (!params.groupId || !params.url) {
          throw new Error("groupId and url required for change-group-avatar action");
        }
        const api = await getApi();
        const groupId = await resolveGroupId(params.groupId);
        await api.changeGroupAvatar(params.url, groupId);
        return json({
          success: true,
          groupId,
          message: `Group avatar changed for ${groupId}`,
        });
      }

      case "get-mute-status": {
        const api = await getApi();
        const result = await api.getMute();
        return json({
          muted: result,
          message: "Mute status retrieved",
        });
      }

      case "get-pinned-conversations": {
        const api = await getApi();
        const result = await api.getPinConversations();
        return json({
          pinned: result,
          message: "Pinned conversations retrieved",
        });
      }

      case "group-mention": {
        const targetGroupId = params.groupId ?? params.threadId;
        if (!targetGroupId) {
          return json({ error: "groupId is required" });
        }

        // GET: read current setting
        if (params.requireMention === undefined) {
          const config = readOpenClawConfig();
          const current = getGroupRequireMention(config, targetGroupId);
          return json({
            groupId: targetGroupId,
            requireMention: current ?? true,
            source: current !== undefined ? "config" : "default",
            message: current ?? true
              ? `Group ${targetGroupId}: bot only replies when @mentioned`
              : `Group ${targetGroupId}: bot replies to all messages`,
          });
        }

        // SET: update config
        let config = readOpenClawConfig();
        config = setGroupRequireMention(config, targetGroupId, params.requireMention);
        writeOpenClawConfig(config);

        return json({
          groupId: targetGroupId,
          requireMention: params.requireMention,
          message: params.requireMention
            ? `Group ${targetGroupId}: bot now only replies when @mentioned`
            : `Group ${targetGroupId}: bot now replies to all messages`,
          note: "Setting saved. Takes effect after gateway restart or config reload.",
        });
      }

      default: {
        params.action satisfies never;
        throw new Error(
          `Unknown action: ${String(params.action)}. Valid actions: ${ACTIONS.join(", ")}`,
        );
      }
    }
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
