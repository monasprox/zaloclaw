# opclaw-zalo

OpenClaw channel plugin for Zalo personal accounts via [zca-js](https://github.com/nicholasxuu/zca-js).

## Overview

Connects your Zalo personal account to [OpenClaw](https://github.com/nicholasxuu/openclaw) as a messaging channel. Supports both direct messages and group conversations with full mention gating, access control, and 130+ Zalo API actions exposed as agent tools.

## Requirements

- **OpenClaw** ≥ 2026.2.0
- **Node.js** ≥ 22
- A Zalo personal account (logged in via QR code)

## Installation

```bash
openclaw plugins install --link /path/to/opclaw-zalo
openclaw gateway restart
```

## Setup

1. After installation, run `openclaw status` to verify the plugin is loaded.
2. The plugin will display a QR code in the terminal for Zalo login.
3. Scan the QR code with the Zalo mobile app to authenticate.
4. Configure channel settings in `openclaw.json` under `channels.opclaw-zalo`.

## Configuration

Configured via `openclaw.json` → `channels.opclaw-zalo`:

```jsonc
{
  "channels": {
    "opclaw-zalo": {
      "accounts": {
        "default": {
          "enabled": true,
          "dmPolicy": "open",         // open | pairing | allowlist | disabled
          "groupPolicy": "open",      // open | allowlist | disabled
          "allowFrom": ["*"],
          "denyFrom": [],
          "groups": {
            "*": {
              "requireMention": true   // Only respond when @mentioned
            },
            "specific-group-id": {
              "allow": true,
              "requireMention": false,
              "allowUsers": [],
              "denyUsers": []
            }
          }
        }
      }
    }
  }
}
```

### Key Settings

| Setting | Values | Description |
|---------|--------|-------------|
| `dmPolicy` | `open` / `pairing` / `allowlist` / `disabled` | Controls who can DM the bot |
| `groupPolicy` | `open` / `allowlist` / `disabled` | Controls which groups the bot responds in |
| `allowFrom` | `["*"]` or user IDs | Users allowed to interact in DMs |
| `denyFrom` | user IDs | Users blocked from interacting |
| `groups.*.requireMention` | `true` / `false` | Require @mention before responding in group |

## Features

- **Full Zalo API** — 130+ actions: messaging, friends, groups, polls, reminders, profile, catalogs, etc.
- **Mention gating** — In groups, bot only responds when @mentioned (configurable per group)
- **Image support** — Downloads and processes images sent with @mention; buffers images from non-mention messages for context when mentioned later
- **QR code login** — Authenticate via terminal QR code display
- **Quote reply** — Reply to specific messages with context
- **Reaction acknowledgment** — React to messages being processed
- **Read receipts** — Mark messages as read
- **Sticker support** — Send and receive stickers
- **Auto-unsend** — Recall sent messages
- **Pairing mode** — Code-based DM authorization for unknown users
- **Access control** — Per-user and per-group allow/deny lists
- **Typing indicator** — Show typing status while processing

## Project Structure

```
index.ts                  → Plugin entry point & tool registration
src/
  channel.ts              → Channel plugin definition & lifecycle
  monitor.ts              → Inbound message processing & routing
  send.ts                 → Outbound message delivery
  tool.ts                 → Agent tool schema & execution (130+ actions)
  config-schema.ts        → Zod config schema with UI hints
  config-manager.ts       → Runtime config management
  zalo-client.ts          → zca-js API wrapper
  credentials.ts          → Credential storage
  mention-parser.ts       → @mention detection & parsing
  image-downloader.ts     → Media download handler
  onboarding.ts           → QR code login flow
  status-issues.ts        → Health status reporting
  types.ts                → TypeScript type definitions
  features/
    auto-unsend.ts        → Message recall
    msg-id-store.ts       → Message ID tracking
    quote-reply.ts        → Reply-to-message support
    reaction-ack.ts       → Reaction acknowledgments
    read-receipt.ts       → Read receipt handling
    sticker.ts            → Sticker support
```

## Development

```bash
# Type check
npm run typecheck
```

No build step required — OpenClaw loads `.ts` files directly.

## License

Private — not for redistribution.
