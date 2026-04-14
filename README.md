# opclaw-zalo

[![CI](https://github.com/monasprox/opclaw-zalo/actions/workflows/ci.yml/badge.svg)](https://github.com/monasprox/opclaw-zalo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-%E2%89%A52026.2.0-orange)](https://github.com/nicholasxuu/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522-green)](https://nodejs.org/)

**OpenClaw channel plugin** that connects your Zalo personal account as a fully-featured messaging channel — powered by [zca-js](https://github.com/nicholasxuu/zca-js).

---

## Why

Zalo is Vietnam's dominant messaging platform (~75M users) but has no official bot API for personal accounts. This plugin bridges that gap by connecting a Zalo personal account to OpenClaw's agent framework — enabling AI-powered conversations, tool execution, and automation directly through Zalo chat.

## Features

### Core
- **130+ Zalo API actions** exposed as agent tools — messaging, friends, groups, polls, reminders, profile, catalogs, notes, settings, and more
- **QR code login** — authenticate via terminal or control panel, credentials auto-persist
- **DM & Group support** — per-account policies: `open`, `pairing`, `allowlist`, `disabled`
- **Mention gating** — in groups, bot only responds when @mentioned (configurable per group)
- **Image processing** — downloads and analyzes images sent with @mention; buffers images from non-mention messages so they're available as context when the bot is mentioned later

### Message Features
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
git clone https://github.com/monasprox/opclaw-zalo.git /path/to/opclaw-zalo

# Install dependencies
cd /path/to/opclaw-zalo && npm install

# Register with OpenClaw
openclaw plugins install --link /path/to/opclaw-zalo

# Restart gateway
openclaw gateway restart
```

### Login

```bash
# Show QR code in terminal — scan with Zalo app
openclaw channels login --channel opclaw-zalo
```

After scanning, credentials are saved. Subsequent gateway restarts auto-login.

### Verify

```bash
openclaw status
```

You should see `opclaw-zalo` listed under channels with status `ON`.

---

## Configuration

All configuration lives in `~/.openclaw/openclaw.json` under `channels.opclaw-zalo`.

### Minimal Config

```jsonc
{
  "channels": {
    "opclaw-zalo": {
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
    "opclaw-zalo": {
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

## Architecture

```
opclaw-zalo/
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
│   │   └── tool.ts             → 130+ action handlers (messaging, groups, etc.)
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
│       └── status-issues.ts    → Health status reporting for `openclaw status`
│
├── docs/
│   └── FEATURES.md             → Feature spec & zca-js API notes
│
├── .github/
│   ├── workflows/ci.yml        → CI: install + typecheck on Node 22/24
│   └── ISSUE_TEMPLATE/         → Bug report & feature request templates
│
├── LICENSE                     → MIT
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
└── .editorconfig
```

### Message Flow

```
Zalo → zca-js event → monitor.ts
  ├── Access control (deny/allow, DM policy, group policy)
  ├── Mention gating (group: skip if not @mentioned → buffer)
  ├── Image processing (download only if mentioned or DM)
  ├── Context assembly (sender info, buffered messages, media)
  ├── Envelope formatting → dispatch to OpenClaw agent
  └── Agent response → send.ts → Zalo
```

---

## Agent Tools

The plugin exposes **130+ actions** as a single `opclaw-zalo` agent tool. The agent selects the action by name. Key categories:

| Category | Actions |
|----------|---------|
| **Messaging** | send, send-image, send-video, send-voice, send-sticker, send-link, send-card, delete, undo, forward, react, typing |
| **Friends** | find-user, send/accept/reject friend request, unfriend, nickname, online-friends |
| **Groups** | list, create, add/remove members, rename, admin management, settings, join/leave |
| **Polls** | create, vote, lock, share, add options |
| **Reminders** | create, edit, remove, list |
| **Conversation** | mute, pin, archive, auto-delete, mark unread, hide |
| **Profile** | me, get-user-info, update-profile, change-avatar |
| **Settings** | get/update settings, active status |
| **Catalogs** | products, catalogs CRUD |
| **Bot Config** | block/unblock users, set require-mention, manage access lists |

Names and group names are auto-resolved to Zalo numeric IDs.

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

## License

[MIT](LICENSE) © monasprox
