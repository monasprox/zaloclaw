import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { opclawZaloPlugin } from "./src/channel/channel.js";
import { setOpclawZaloRuntime } from "./src/runtime/runtime.js";
import { OpclawZaloToolSchema, executeOpclawZaloTool } from "./src/tools/tool.js";

const plugin = {
  id: "opclaw-zalo",
  name: "OpenClaw Zalo",
  description: "Zalo personal account messaging via zca-js library",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setOpclawZaloRuntime(api.runtime);
    // Register channel plugin (for onboarding & gateway)
    api.registerChannel({ plugin: opclawZaloPlugin });

    // Register agent tool
    api.registerTool({
      name: "opclaw-zalo",
      label: "OpenClaw Zalo",
      description:
        "Complete Zalo personal account management via zca-js (130 actions). " +
        "Messaging: send, image, link, send-to-stranger, send-video, send-voice, send-sticker, send-card, send-bank-card, " +
        "delete-message, undo-message (recall), forward-message, add-reaction, send-typing. " +
        "Friend: find-user, send-friend-request, accept/reject-friend-request, get-sent/friend-requests, " +
        "undo-friend-request, unfriend, check-friend-status, set/remove-friend-nickname, get-online-friends, " +
        "get-friend-recommendations, get-alias-list, get-related-friend-groups. " +
        "Groups: list/search-groups, get-group-info, create-group, add/remove-to/from-group, leave-group, " +
        "rename-group, add/remove-group-admin, change-group-owner, disperse-group, update-group-settings, " +
        "enable/disable/get-group-link, get/review-pending-members, " +
        "get-group-blocked, block/unblock-group-member, get-group-members-info, " +
        "join-group-link, invite-to-groups, get-group-invites, join/delete-group-invite. " +
        "Polls: create-poll, vote-poll, lock-poll, get-poll-detail, add-poll-options, share-poll. " +
        "Reminders: create/remove/edit-reminder, list-reminders. " +
        "Conversation: mute/unmute/pin/unpin-conversation, delete-chat, hide/unhide-conversation, " +
        "get-hidden-conversations, mark/unmark-unread, get-unread-marks, " +
        "set-auto-delete-chat, get-auto-delete-chats, get-archived-chats. " +
        "Quick Messages: list/add/remove/update-quick-message. " +
        "Auto-Reply: list/create/update/delete-auto-reply. " +
        "Profile: me, get-user-info, last-online, get-qr, update-profile, " +
        "change-avatar, delete-avatar, get-avatar-list, reuse-avatar. " +
        "Settings: get-settings, update-setting, update-active-status. " +
        "Notes: create-note, edit-note, get-boards, get-labels. " +
        "Catalogs: create/update/delete-catalog, get-catalogs, create/update/delete-product, get-products. " +
        "Block: block/unblock-user (OpenClaw), zalo-block/unblock-user (Zalo-level), block-view-feed. " +
        "Misc: search-stickers, parse-link, send-report, get-biz-account. " +
        "Names are auto-resolved to IDs.",
      parameters: OpclawZaloToolSchema,
      execute: executeOpclawZaloTool,
    } as AnyAgentTool);
  },
};

export default plugin;
