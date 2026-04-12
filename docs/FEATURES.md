# opclaw-zalo — Feature Spec & API Notes

> Reference: [zca-js v2.1.2](https://zca-js.tdung.com/) — Official API docs
> Target: OpenClaw 2026.4.x channel plugin

---

## 1. Reaction Ack

**Purpose:** Bot thả reaction (👍 LIKE) khi nhận tin nhắn, báo cho user biết "đã nhận".

### zca-js API (chính xác)

```ts
import { Reactions, ThreadType } from "zca-js";

// addReaction(icon, dest)
api.addReaction(Reactions.LIKE, {
    data: { msgId, cliMsgId },
    threadId,
    type  // ThreadType.User | ThreadType.Group
});

// Shortcut: truyền thẳng message object
api.addReaction(Reactions.LIKE, message);
```

### Design Decisions
- **Scope control** (config): `all` | `dm-only` | `group-mentions` | `off`
  - `group-mentions`: chỉ react khi bot bị @mention trong group (tránh spam)
  - `dm-only`: react tất cả DM
  - `all`: react mọi tin (cẩn thận spam)
- **Remove after reply**: config `removeAckAfterReply: boolean`
  - `false` recommended: giữ reaction, UX tự nhiên hơn
  - `true`: dùng `api.addReaction(Reactions.NONE, dest)` để xóa sau khi reply
- **Reaction type**: dùng `Reactions.LIKE` ("/-strong") mặc định, config cho phép đổi
- **Error handling**: fire-and-forget, log error nhưng không block message processing

### Reactions Enum (hay dùng)
```
LIKE     = "/-strong"   (👍)
HEART    = "/-heart"    (❤️)
HAHA     = ":>"         (😆)
WOW      = ":o"         (😮)
OK       = "/-ok"       (👌)
THANKS   = "/-thanks"   (🙏)
```

---

## 2. Zalo Sticker

**Purpose:** Bot gửi sticker Zalo thật (không phải emoji text) để responses tự nhiên hơn.

### zca-js API (3 bước chính xác)

```ts
// Bước 1: Search sticker bằng keyword → trả về mảng sticker IDs
const stickerIds: number[] = await api.getStickers("xin chào");

// Bước 2: Lấy detail của sticker
const details: StickerDetail[] = await api.getStickersDetail(stickerIds[0]);
// StickerDetail = { id, cateId, type, text, uri, stickerUrl, stickerSpriteUrl, ... }

// Bước 3: Gửi sticker
await api.sendSticker(details[0], threadId, ThreadType.User);
// sendSticker cần: { id: number, cateId: number, type: number }
```

### Design Decisions

**Cách tiếp cận:** Agent-driven, KHÔNG dùng regex/keyword matching.
- OpenClaw agent tự quyết khi nào gửi sticker thông qua tool calls
- Plugin expose 2 tools: `search-stickers(keyword)` và `send-sticker(stickerId, threadId, threadType)`
- Agent instructions (trong TOOLS.md) hướng dẫn khi nào nên/không nên gửi

**Smart gating (chống spam):**
- Cooldown: 3 phút/thread — không gửi sticker liên tục
- Skip tin nhắn dài (>80 chars) — sticker chỉ phù hợp tin ngắn
- Skip technical/questions/help requests — sticker không phù hợp context nghiêm túc

**Sticker cache:**
- Cache `keyword → StickerDetail[]` để tránh gọi API mỗi lần
- TTL 1 giờ, max 100 keywords
- Tránh rate limit Zalo API

**Error handling:**
- `getStickers()` trả về `[]` → skip, không throw
- `getStickersDetail()` fail → skip, log warning
- `sendSticker()` fail → log error, không retry

---

## 3. Quote Reply (đã verify hoạt động)

```ts
api.sendMessage({
    msg: "text reply",
    quote: message  // truyền thẳng message object nhận được
}, message.threadId, message.type);
```

- `quote` nhận `SendMessageQuote` type: `{ content, msgType, propertyExt, uidFrom, msgId, cliMsgId, ts, ttl }`
- Nhưng API chấp nhận pass thẳng `message` object (đã test hoạt động)
- Cache `lastInboundMessage` per thread để quote chính xác tin nhắn đang trả lời

---

## 4. Auto-Unsend (undo)

```ts
// undo(message) — chỉ cần { msgId, cliMsgId }
api.undo({ msgId: "123", cliMsgId: "456" });
```

- Track outbound messages: `Map<threadId, { msgId, cliMsgId, ts }[]>`
- Commands: `/xoa`, `/undo`, `/recall` → thu hồi tin nhắn cuối cùng bot gửi
- TTL 5 phút — chỉ undo tin nhắn gần đây
- Max 100 threads tracked

---

## 5. Output Redaction (PHẢI CÓ)

Trước khi gửi text cho user:
1. **Redact** internal paths, tool names, API keys, session IDs
2. **Truncate** tới 4000 chars với indicator `[...tin nhắn quá dài, đã cắt bớt]`

Patterns cần filter:
- `/root/...`, `/home/...`, `~/.openclaw/...` → `[path]`
- `mcp__*__*` → `[tool]`
- `openclaw/plugin-sdk/...` → `[internal]`
- API keys/tokens → `[redacted]`

---

## 6. Per-Thread Media Sandbox (PHẢI CÓ)

Media download vào `~/.openclaw/workspace/threads/{threadId}/media/`
- Mỗi thread isolated
- Path traversal protection: sanitize threadId, validate resolved path within sandbox
- Cleanup: auto-remove directories >30 ngày

---

## Cấu trúc dự kiến

```
src/
├── features/
│   ├── reaction-ack.ts      # addReaction logic + scope gating
│   ├── sticker.ts           # search → detail → send + cache + cooldown
│   ├── quote-reply.ts       # lastInboundMessage cache + quote building
│   ├── auto-unsend.ts       # outbound tracking + undo command
│   └── read-receipt.ts      # seen_messages tracking
├── safety/
│   ├── output-filter.ts     # redactOutput() — path/token/tool name stripping
│   └── thread-sandbox.ts    # per-thread media directory isolation
├── monitor.ts               # main message listener + dispatch
├── send.ts                  # outbound message sending + markdown→styles
└── types.ts                 # shared types
```
