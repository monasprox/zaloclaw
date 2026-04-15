# zaloclaw

[![CI](https://github.com/monasprox/zaloclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/monasprox/zaloclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-%E2%89%A52026.2.0-orange)](https://github.com/nicholasxuu/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522-green)](https://nodejs.org/)

**OpenClaw channel plugin** that connects your Zalo personal account as a fully-featured messaging channel — powered by [zca-js](https://github.com/nicholasxuu/zca-js).

> **🤖 For AI Agents:** See [**docs/agent-help.md**](docs/agent-help.md) — complete tool usage guide for all 147 actions with parameters, examples, update process, and persistence instructions. Quick reference: [**TOOLS.md**](TOOLS.md). Installation: [**docs/agent-install.md**](docs/agent-install.md).

---

🚀 Join the Zalo Community. Get the plugin, updates, and real-world automation use cases. https://zalo.me/g/gigr4cnahvidpewxk74z

## Why

Zalo is Vietnam's dominant messaging platform (~75M users) but has no official bot API for personal accounts. This plugin bridges that gap by connecting a Zalo personal account to OpenClaw's agent framework — enabling AI-powered conversations, tool execution, and automation directly through Zalo chat.

## Features

### Core
- **147 Zalo API actions** exposed as agent tools — messaging, friends, groups, polls, reminders, profile, catalogs, notes, settings, and more
- **QR code login** — authenticate via terminal or control panel, credentials auto-persist
- **DM & Group support** — per-account policies: `open`, `pairing`, `allowlist`, `disabled`
- **Mention gating** — in groups, bot only responds when @mentioned (configurable per group)
- **Image processing** — downloads and analyzes images sent with @mention; buffers images from non-mention messages so they're available as context when the bot is mentioned later

### Message Features
- **Rich text** — send styled messages with bold, italic, underline, strikethrough, colors (markdown auto-converted)
- **Urgency** — mark messages as important (`urgency: 1`) or urgent (`urgency: 2`)
- **Reply/quote context** — when a user replies to a message, the AI receives the quoted message content and sender
- **File sending** — send any file type (PDF, docs, etc.) via local path or URL
- **Reaction acknowledgment** — react to incoming messages (configurable: heart, like, haha, etc.)
- **Quote reply** — reply to specific messages with context threading
- **Read receipts** — mark messages as read
- **Sticker support** — search and send native Zalo stickers via agent tool calls
- **Auto-unsend** — recall sent messages
- **Typing indicator** — show typing status while processing

### Access Control
- **Per-user allow/deny lists** — global and per-group
- **Pairing mode** — code-based DM authorization for unknown users
- **Group policies** — open, allowlist, or disabled per group
- **Command authorization** — restrict control commands to allowed users

---

## Quick Start

### Prerequisites

- [OpenClaw](https://github.com/nicholasxuu/openclaw) ≥ 2026.2.0
- Node.js ≥ 22
- A Zalo personal account

### Install

```bash
# Clone the plugin
git clone https://github.com/monasprox/zaloclaw.git /path/to/zaloclaw

# Install dependencies
cd /path/to/zaloclaw && npm install

# Register with OpenClaw
openclaw plugins install --link /path/to/zaloclaw

# Restart gateway
openclaw gateway restart
```

### Login

```bash
# Show QR code in terminal — scan with Zalo app
openclaw channels login --channel zaloclaw
```

After scanning, credentials are saved. Subsequent gateway restarts auto-login.

### Verify

```bash
openclaw status
```

You should see `zaloclaw` listed under channels with status `ON`.

---

## Configuration

All configuration lives in `~/.openclaw/openclaw.json` under `channels.zaloclaw`.

### Minimal Config

```jsonc
{
  "channels": {
    "zaloclaw": {
      "accounts": {
        "default": {
          "enabled": true
        }
      }
    }
  }
}
```

### Full Config Example

```jsonc
{
  "channels": {
    "zaloclaw": {
      "accounts": {
        "default": {
          "enabled": true,

          // DM access policy
          "dmPolicy": "open",           // open | pairing | allowlist | disabled
          "allowFrom": ["*"],           // Zalo user IDs or "*" for all
          "denyFrom": [],               // Block specific users

          // Group access policy
          "groupPolicy": "open",        // open | allowlist | disabled

          // Per-group overrides (key = group ID, name, or "*" for default)
          "groups": {
            "*": {
              "requireMention": true    // Default: only respond when @mentioned
            },
            "123456789": {
              "allow": true,
              "requireMention": false,  // Always respond in this group
              "allowUsers": [],         // Empty = all users allowed
              "denyUsers": []
            }
          },

          // Display
          "markdown": {
            "tables": "bullets"         // off | bullets | code | block
          },
          "messagePrefix": "",
          "responsePrefix": ""
        }
      }
    }
  }
}
```

### Configuration Reference

#### Account Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable this account |
| `dmPolicy` | `string` | `"open"` | DM access: `open` / `pairing` / `allowlist` / `disabled` |
| `allowFrom` | `string[]` | `["*"]` | Users allowed to DM (IDs or `*`) |
| `denyFrom` | `string[]` | `[]` | Users blocked from all interaction |
| `groupPolicy` | `string` | `"open"` | Group access: `open` / `allowlist` / `disabled` |
| `messagePrefix` | `string` | `""` | Text prepended to every outbound message |
| `responsePrefix` | `string` | `""` | Text prepended to agent responses |

#### Per-Group Settings (`groups.<id>`)

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `allow` | `boolean` | — | Explicitly allow/deny this group |
| `requireMention` | `boolean` | `false` | Only respond when @mentioned |
| `allowUsers` | `string[]` | `[]` | Only these users trigger the bot |
| `denyUsers` | `string[]` | `[]` | Block specific users in this group |
| `tools` | `object` | — | Per-group tool execution policy |

#### DM Policies

| Policy | Behavior |
|--------|----------|
| `open` | Accept all DMs |
| `pairing` | Require code exchange for unknown users |
| `allowlist` | Only `allowFrom` users can DM |
| `disabled` | Block all DMs |

---

## Agent Tools

The plugin exposes **147 actions** as a single `zaloclaw` agent tool. The agent selects the action by name. Names and group names are auto-resolved to Zalo numeric IDs.

### Messaging (16 actions)

| Action | Description |
|--------|-------------|
| `send` | Send text message (supports `urgency` and `messageTtl`) |
| `send-styled` | Send message with rich text (bold, italic, underline, strike, colors) |
| `send-link` | Send a URL with preview |
| `send-image` | Send image by URL |
| `send-file` | Send any file (PDF, doc, etc.) by local path or URL |
| `send-video` | Send video by URL |
| `send-voice` | Send voice message by URL |
| `send-sticker` | Send sticker by ID or keyword search |
| `send-card` | Send contact card |
| `send-bank-card` | Send bank card info |
| `send-typing` | Send typing indicator |
| `send-to-stranger` | Send message to non-friend |
| `forward-message` | Forward message to multiple threads (supports TTL) |
| `delete-message` | Delete a message |
| `undo-message` | Recall a sent message |
| `add-reaction` | React to a message (heart, like, haha, wow, cry, angry) |

### Friends (16 actions)

| Action | Description |
|--------|-------------|
| `friends` | List all friends (with search/filter) |
| `find-user` | Find user by phone number (returns full profile) |
| `find-user-by-username` | Find user by Zalo username |
| `send-friend-request` | Send friend request (supports name resolution) |
| `get-friend-requests` | List pending friend requests |
| `accept-friend-request` | Accept a friend request |
| `reject-friend-request` | Reject a friend request |
| `get-sent-requests` | List sent friend requests |
| `undo-friend-request` | Cancel a sent friend request |
| `unfriend` | Remove a friend |
| `check-friend-status` | Check friend/request status |
| `set-friend-nickname` | Set nickname for a friend |
| `remove-friend-nickname` | Remove friend nickname |
| `get-online-friends` | List online friends |
| `get-close-friends` | List close friends |
| `get-friend-recommendations` | Get friend recommendations |

### Groups (22 actions)

| Action | Description |
|--------|-------------|
| `groups` | List all groups (with search) |
| `get-group-info` | Get group details |
| `create-group` | Create a new group |
| `add-to-group` | Add members to a group |
| `remove-from-group` | Remove member from group |
| `leave-group` | Leave a group |
| `rename-group` | Rename a group |
| `add-group-admin` / `remove-group-admin` | Manage group admins |
| `change-group-owner` | Transfer group ownership |
| `disperse-group` | Dissolve a group |
| `update-group-settings` | Update group settings (name lock, msg history, join approval, etc.) |
| `enable-group-link` / `disable-group-link` / `get-group-link` | Manage group invite links |
| `get-pending-members` / `review-pending-members` | Manage join requests |
| `block-group-member` / `unblock-group-member` / `get-group-blocked` | Group member blocking |
| `get-group-members-info` | Get detailed member info |
| `join-group-link` / `invite-to-groups` / `get-group-invites` / `join-group-invite` / `delete-group-invite` | Group invitations |
| `change-group-avatar` | Change group avatar |
| `upgrade-group-to-community` | Upgrade group to community |
| `get-group-chat-history` | Get group message history |

### Polls (6 actions)

| Action | Description |
|--------|-------------|
| `create-poll` | Create poll (supports `allowMultiChoices`, `allowAddNewOption`, `hideVotePreview`, `isAnonymous`, `expiredTime`) |
| `vote-poll` | Vote on a poll option |
| `lock-poll` | Lock a poll |
| `get-poll-detail` | Get poll details and results |
| `add-poll-options` | Add new options to a poll |
| `share-poll` | Share a poll |

### Reminders (6 actions)

| Action | Description |
|--------|-------------|
| `create-reminder` | Create a reminder with emoji, time, repeat |
| `edit-reminder` | Edit an existing reminder |
| `remove-reminder` | Delete a reminder |
| `list-reminders` | List reminders in a thread |
| `get-reminder` | Get full reminder details by ID |
| `get-reminder-responses` | Get accept/reject member lists for a reminder |

### Conversation Management (16 actions)

| Action | Description |
|--------|-------------|
| `mute-conversation` / `unmute-conversation` | Mute/unmute (1h, 4h, forever) |
| `pin-conversation` / `unpin-conversation` | Pin/unpin conversations |
| `delete-chat` | Delete a conversation |
| `hide-conversation` / `unhide-conversation` / `get-hidden-conversations` | Hide/show conversations |
| `mark-unread` / `unmark-unread` / `get-unread-marks` | Manage unread marks |
| `set-auto-delete-chat` / `get-auto-delete-chats` | Auto-delete chat (1 day, 7 days, 14 days) |
| `get-archived-chats` / `update-archived-chat` | Archive/unarchive conversations |
| `get-mute-status` / `get-pinned-conversations` | Query mute/pin status |

### Quick Messages & Auto-Reply (8 actions)

| Action | Description |
|--------|-------------|
| `list-quick-messages` / `add-quick-message` / `remove-quick-message` / `update-quick-message` | Manage quick reply templates |
| `list-auto-replies` / `create-auto-reply` / `update-auto-reply` / `delete-auto-reply` | Manage auto-reply rules (with scope: everyone, strangers, specific friends) |

### Profile & Account (14 actions)

| Action | Description |
|--------|-------------|
| `me` | Get own full profile (username, avatar, cover, bio, phone, gender, dob, globalId, etc.) |
| `status` | Check authentication status |
| `get-user-info` | Get user profile info |
| `last-online` | Check user's last online time |
| `get-qr` | Get own QR code |
| `update-profile` | Update name, DOB, gender |
| `update-profile-bio` | Update bio |
| `change-avatar` | Change account avatar by URL |
| `delete-avatar` / `get-avatar-list` / `reuse-avatar` | Manage avatar history |
| `get-biz-account` | Get business account info |
| `get-full-avatar` | Get full-size avatar + background avatar |
| `get-friend-board` | Get friend board list |

### Settings (3 actions)

| Action | Description |
|--------|-------------|
| `get-settings` | Get all Zalo settings |
| `update-setting` | Update a specific setting |
| `update-active-status` | Toggle online/offline status |

### Stickers & Misc (3 actions)

| Action | Description |
|--------|-------------|
| `search-stickers` / `search-sticker-detail` | Search and browse stickers |
| `parse-link` | Parse URL metadata |
| `send-report` | Report a user/group |

### Notes & Labels (4 actions)

| Action | Description |
|--------|-------------|
| `create-note` / `edit-note` | Create/edit notes in conversations |
| `get-boards` | Get note boards |
| `get-labels` | Get contact labels |

### Catalogs & Products (8 actions)

| Action | Description |
|--------|-------------|
| `create-catalog` / `update-catalog` / `delete-catalog` / `get-catalogs` | Manage product catalogs |
| `create-product` / `update-product` / `delete-product` / `get-products` | Manage products |

### Zalo Block (2 actions)

| Action | Description |
|--------|-------------|
| `zalo-block-user` | Block user at Zalo platform level |
| `zalo-unblock-user` | Unblock user at Zalo platform level |

### Bot Config — OpenClaw Layer (13 actions)

| Action | Description |
|--------|-------------|
| `block-user` / `unblock-user` | Block/unblock user in bot config |
| `list-blocked` / `list-allowed` | List blocked/allowed users |
| `block-user-in-group` / `unblock-user-in-group` | Per-group user blocking |
| `allow-user-in-group` / `unallow-user-in-group` | Per-group user allowlist |
| `list-blocked-in-group` / `list-allowed-in-group` | Query per-group lists |
| `group-mention` | Set require-mention for a group |

### Utility (3 actions)

| Action | Description |
|--------|-------------|
| `get-alias-list` | Get friend alias list |
| `get-related-friend-groups` | Get groups shared with a friend |
| `get-multi-users-by-phones` | Bulk lookup users by phone numbers |

---

## Architecture

```
zaloclaw/
├── index.ts                    → Plugin entry point & tool registration
├── package.json
├── openclaw.plugin.json        → Plugin manifest (JSON Schema for config)
│
├── src/
│   ├── channel/                → Channel lifecycle & message flow
│   │   ├── channel.ts          → Plugin definition, account start/stop, dock
│   │   ├── monitor.ts          → Inbound message processing & routing
│   │   ├── send.ts             → Outbound message delivery & markdown
│   │   ├── onboarding.ts       → QR code login flow (control panel)
│   │   ├── image-downloader.ts → Media download handler
│   │   └── probe.ts            → Connection health probe
│   │
│   ├── client/                 → Zalo API wrapper & account management
│   │   ├── zalo-client.ts      → zca-js API lifecycle (login, getApi, etc.)
│   │   ├── credentials.ts      → Credential persistence (disk I/O)
│   │   ├── accounts.ts         → Multi-account resolution
│   │   ├── qr-display.ts       → Terminal QR code renderer
│   │   └── friend-request-store.ts → Friend request tracking
│   │
│   ├── config/                 → Configuration schema & management
│   │   ├── config-schema.ts    → Zod schema with UI hints for control panel
│   │   └── config-manager.ts   → Runtime config read/write (openclaw.json)
│   │
│   ├── tools/                  → Agent tool definitions
│   │   └── tool.ts             → 147 action handlers
│   │
│   ├── features/               → Standalone feature modules
│   │   ├── auto-unsend.ts      → Message recall
│   │   ├── msg-id-store.ts     → Message ID ↔ cliMsgId mapping
│   │   ├── quote-reply.ts      → Reply-to-message support
│   │   ├── reaction-ack.ts     → Reaction acknowledgments
│   │   ├── read-receipt.ts     → Read receipt handling
│   │   └── sticker.ts          → Sticker search, cache & send
│   │
│   ├── parsing/                → Text processing
│   │   └── mention-parser.ts   → @mention detection & outbound mention resolution
│   │
│   ├── safety/                 → Output guardrails
│   │   ├── output-filter.ts    → Redact sensitive content from responses
│   │   └── thread-sandbox.ts   → Thread isolation
│   │
│   └── runtime/                → Shared runtime state
│       ├── runtime.ts          → Runtime environment singleton
│       ├── types.ts            → TypeScript type definitions
│       └── status-issues.ts    → Health status reporting
│
├── docs/
│   └── FEATURES.md             → Feature spec & zca-js API notes
│
├── .github/
│   ├── workflows/ci.yml        → CI: install + typecheck on Node 22/24
│   └── ISSUE_TEMPLATE/         → Bug report & feature request templates
│
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── LICENSE                     → MIT
└── .editorconfig
```

### Message Flow

```
Zalo → zca-js event → monitor.ts
  ├── Quote/reply context extraction (replied message text + sender)
  ├── Access control (deny/allow, DM policy, group policy)
  ├── Mention gating (group: skip if not @mentioned → buffer)
  ├── Image processing (download only if mentioned or DM)
  ├── Context assembly (sender info, buffered messages, media, quote)
  ├── Envelope formatting → dispatch to OpenClaw agent
  └── Agent response → send.ts → Zalo
```

---

## Development

```bash
# Type check
npm run typecheck

# Test locally
openclaw plugins install --link .
openclaw gateway restart
openclaw status
```

No build step — OpenClaw loads `.ts` files directly via its runtime.

### Adding a New Feature

1. Create a module in the appropriate `src/` subdirectory
2. Wire it into `monitor.ts` (for inbound) or `send.ts` (for outbound)
3. If it needs a tool action, add a handler in `src/tools/tool.ts`
4. Run `npm run typecheck` to verify
5. Test with `openclaw gateway restart`

---

## Limitations

- **Single account per plugin instance** — multi-account is structurally supported but untested
- **No streaming** — zca-js does not support streaming responses (`blockStreaming: true`)
- **Rate limits** — Zalo may throttle or block accounts with high message volume
- **Session stability** — zca-js sessions may expire; re-login via QR is required when cookies expire
- **No end-to-end encryption** — messages pass through Zalo's servers as normal
- **Message TTL** — per-message self-destruct (`messageTtl`) is sent to Zalo API but may not be enforced server-side; use `set-auto-delete-chat` for conversation-level auto-delete

## License

[MIT](LICENSE) © monasprox
