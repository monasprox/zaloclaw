# zaloclaw

[![CI](https://github.com/monasprox/zaloclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/monasprox/zaloclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-%E2%89%A52026.2.0-orange)](https://github.com/nicholasxuu/openclaw)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A522-green)](https://nodejs.org/)

**Plugin kênh OpenClaw** kết nối tài khoản Zalo cá nhân của bạn thành một kênh nhắn tin đầy đủ tính năng — sử dụng [zca-js](https://github.com/nicholasxuu/zca-js).

> **🤖 Dành cho AI Agent:** Xem [**docs/agent-help.md**](docs/agent-help.md) — hướng dẫn đầy đủ sử dụng 147 actions với tham số, ví dụ, quy trình cập nhật và hướng dẫn lưu trữ. Tham khảo nhanh: [**TOOLS.md**](TOOLS.md). Cài đặt: [**docs/agent-install.md**](docs/agent-install.md).

---

🚀 Tham gia cộng đồng Zalo. Nhận plugin, cập nhật, và các use case tự động hóa thực tế. https://zalo.me/g/gigr4cnahvidpewxk74z

## Tại sao cần zaloclaw?

Zalo là nền tảng nhắn tin phổ biến nhất Việt Nam (~75 triệu người dùng) nhưng không có API bot chính thức cho tài khoản cá nhân. Plugin này giải quyết vấn đề đó bằng cách kết nối tài khoản Zalo cá nhân với framework agent của OpenClaw — cho phép hội thoại AI, thực thi công cụ và tự động hóa trực tiếp qua Zalo chat.

## Tính năng

### Cốt lõi
- **147 Zalo API actions** được mở ra dưới dạng công cụ agent — nhắn tin, bạn bè, nhóm, bình chọn, nhắc nhở, hồ sơ, danh mục sản phẩm, ghi chú, cài đặt, v.v.
- **Đăng nhập QR code** — xác thực qua terminal hoặc bảng điều khiển, thông tin đăng nhập tự động lưu
- **Hỗ trợ DM & Nhóm** — chính sách theo tài khoản: `open`, `pairing`, `allowlist`, `disabled`
- **Mention gating** — trong nhóm, bot chỉ phản hồi khi được @mention (cấu hình theo nhóm)
- **Xử lý hình ảnh** — tải và phân tích ảnh gửi kèm @mention; đệm ảnh từ tin nhắn không mention để sẵn sàng làm ngữ cảnh khi bot được mention sau

### Tính năng tin nhắn
- **Rich text** — gửi tin nhắn có định dạng: đậm, nghiêng, gạch chân, gạch ngang, màu sắc (markdown tự động chuyển đổi)
- **Mức độ khẩn cấp** — đánh dấu tin nhắn quan trọng (`urgency: 1`) hoặc khẩn cấp (`urgency: 2`)
- **Ngữ cảnh trả lời/trích dẫn** — khi người dùng trả lời tin nhắn, AI nhận được nội dung và người gửi tin nhắn được trích dẫn
- **Gửi file** — gửi mọi loại file (PDF, doc, v.v.) qua đường dẫn local hoặc URL
- **Xác nhận bằng reaction** — react vào tin nhắn đến (cấu hình: heart, like, haha, v.v.)
- **Trả lời trích dẫn** — trả lời tin nhắn cụ thể với context threading
- **Xác nhận đã đọc** — đánh dấu tin nhắn đã đọc
- **Hỗ trợ sticker** — tìm kiếm và gửi sticker Zalo gốc qua agent tool calls
- **Tự động thu hồi** — thu hồi tin nhắn đã gửi
- **Chỉ báo đang nhập** — hiển thị trạng thái đang nhập khi xử lý

### Kiểm soát truy cập
- **Danh sách cho phép/chặn theo người dùng** — toàn cục và theo nhóm
- **Chế độ ghép nối** — xác thực DM bằng mã cho người dùng chưa biết
- **Chính sách nhóm** — open, allowlist, hoặc disabled theo nhóm
- **Phân quyền lệnh** — giới hạn lệnh điều khiển cho người dùng được phép

---

## Bắt đầu nhanh

### Yêu cầu

- [OpenClaw](https://github.com/nicholasxuu/openclaw) ≥ 2026.2.0
- Node.js ≥ 22
- Tài khoản Zalo cá nhân

### Cài đặt

```bash
# Clone plugin
git clone https://github.com/monasprox/zaloclaw.git /path/to/zaloclaw

# Cài đặt dependencies
cd /path/to/zaloclaw && npm install

# Đăng ký với OpenClaw
openclaw plugins install --link /path/to/zaloclaw

# Khởi động lại gateway
openclaw gateway restart
```

### Đăng nhập

```bash
# Hiển thị QR code trên terminal — quét bằng ứng dụng Zalo
openclaw channels login --channel zaloclaw
```

Sau khi quét, thông tin đăng nhập được lưu tự động. Các lần khởi động gateway sau sẽ tự động đăng nhập.

### Xác minh

```bash
openclaw status
```

Bạn sẽ thấy `zaloclaw` trong danh sách channels với trạng thái `ON`.

---

## Cấu hình

Toàn bộ cấu hình nằm trong `~/.openclaw/openclaw.json` tại `channels.zaloclaw`.

### Cấu hình tối thiểu

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

### Ví dụ cấu hình đầy đủ

```jsonc
{
  "channels": {
    "zaloclaw": {
      "accounts": {
        "default": {
          "enabled": true,

          // Chính sách truy cập DM
          "dmPolicy": "open",           // open | pairing | allowlist | disabled
          "allowFrom": ["*"],           // Zalo user IDs hoặc "*" cho tất cả
          "denyFrom": [],               // Chặn người dùng cụ thể

          // Chính sách truy cập nhóm
          "groupPolicy": "open",        // open | allowlist | disabled

          // Ghi đè theo nhóm (key = group ID, tên nhóm, hoặc "*" cho mặc định)
          "groups": {
            "*": {
              "requireMention": true    // Mặc định: chỉ phản hồi khi được @mention
            },
            "123456789": {
              "allow": true,
              "requireMention": false,  // Luôn phản hồi trong nhóm này
              "allowUsers": [],         // Rỗng = cho phép tất cả
              "denyUsers": []
            }
          },

          // Hiển thị
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

### Tham chiếu cấu hình

#### Cài đặt tài khoản

| Cài đặt | Kiểu | Mặc định | Mô tả |
|---------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Bật/tắt tài khoản này |
| `dmPolicy` | `string` | `"open"` | Truy cập DM: `open` / `pairing` / `allowlist` / `disabled` |
| `allowFrom` | `string[]` | `["*"]` | Người dùng được phép DM (IDs hoặc `*`) |
| `denyFrom` | `string[]` | `[]` | Người dùng bị chặn mọi tương tác |
| `groupPolicy` | `string` | `"open"` | Truy cập nhóm: `open` / `allowlist` / `disabled` |
| `messagePrefix` | `string` | `""` | Văn bản thêm vào đầu mỗi tin nhắn gửi đi |
| `responsePrefix` | `string` | `""` | Văn bản thêm vào đầu phản hồi agent |

#### Cài đặt theo nhóm (`groups.<id>`)

| Cài đặt | Kiểu | Mặc định | Mô tả |
|---------|------|---------|-------------|
| `allow` | `boolean` | — | Cho phép/chặn nhóm này rõ ràng |
| `requireMention` | `boolean` | `false` | Chỉ phản hồi khi được @mention |
| `allowUsers` | `string[]` | `[]` | Chỉ những người dùng này kích hoạt bot |
| `denyUsers` | `string[]` | `[]` | Chặn người dùng cụ thể trong nhóm này |
| `tools` | `object` | — | Chính sách thực thi tool theo nhóm |

#### Chính sách DM

| Chính sách | Hành vi |
|--------|----------|
| `open` | Chấp nhận tất cả DM |
| `pairing` | Yêu cầu trao đổi mã cho người dùng chưa biết |
| `allowlist` | Chỉ người dùng trong `allowFrom` được DM |
| `disabled` | Chặn tất cả DM |

---

## Công cụ Agent

Plugin cung cấp **147 actions** dưới dạng một tool `zaloclaw` duy nhất. Agent chọn action bằng tên. Tên người dùng và tên nhóm tự động được chuyển đổi thành Zalo numeric IDs.

### Nhắn tin (16 actions)

| Action | Mô tả |
|--------|-------------|
| `send` | Gửi tin nhắn văn bản (hỗ trợ `urgency` và `messageTtl`) |
| `send-styled` | Gửi tin nhắn rich text (đậm, nghiêng, gạch chân, gạch ngang, màu sắc) |
| `send-link` | Gửi URL kèm preview |
| `send-image` | Gửi ảnh theo URL |
| `send-file` | Gửi file bất kỳ (PDF, doc, v.v.) qua đường dẫn local hoặc URL |
| `send-video` | Gửi video theo URL |
| `send-voice` | Gửi tin nhắn thoại theo URL |
| `send-sticker` | Gửi sticker theo ID hoặc tìm kiếm từ khóa |
| `send-card` | Gửi danh thiếp liên hệ |
| `send-bank-card` | Gửi thông tin thẻ ngân hàng |
| `send-typing` | Gửi chỉ báo đang nhập |
| `send-to-stranger` | Gửi tin nhắn cho người lạ |
| `forward-message` | Chuyển tiếp tin nhắn đến nhiều cuộc hội thoại (hỗ trợ TTL) |
| `delete-message` | Xóa tin nhắn |
| `undo-message` | Thu hồi tin nhắn đã gửi |
| `add-reaction` | React tin nhắn (heart, like, haha, wow, cry, angry) |

### Bạn bè (16 actions)

| Action | Mô tả |
|--------|-------------|
| `friends` | Liệt kê tất cả bạn bè (có tìm kiếm/lọc) |
| `find-user` | Tìm người dùng theo số điện thoại (trả về hồ sơ đầy đủ) |
| `find-user-by-username` | Tìm người dùng theo username Zalo |
| `send-friend-request` | Gửi lời mời kết bạn (hỗ trợ phân giải tên) |
| `get-friend-requests` | Liệt kê lời mời kết bạn đang chờ |
| `accept-friend-request` | Chấp nhận lời mời kết bạn |
| `reject-friend-request` | Từ chối lời mời kết bạn |
| `get-sent-requests` | Liệt kê lời mời kết bạn đã gửi |
| `undo-friend-request` | Hủy lời mời kết bạn đã gửi |
| `unfriend` | Xóa bạn |
| `check-friend-status` | Kiểm tra trạng thái bạn bè/lời mời |
| `set-friend-nickname` | Đặt biệt danh cho bạn bè |
| `remove-friend-nickname` | Xóa biệt danh bạn bè |
| `get-online-friends` | Liệt kê bạn bè đang online |
| `get-close-friends` | Liệt kê bạn thân |
| `get-friend-recommendations` | Gợi ý kết bạn |

### Nhóm (22 actions)

| Action | Mô tả |
|--------|-------------|
| `groups` | Liệt kê tất cả nhóm (có tìm kiếm) |
| `get-group-info` | Lấy thông tin chi tiết nhóm |
| `create-group` | Tạo nhóm mới |
| `add-to-group` | Thêm thành viên vào nhóm |
| `remove-from-group` | Xóa thành viên khỏi nhóm |
| `leave-group` | Rời nhóm |
| `rename-group` | Đổi tên nhóm |
| `add-group-admin` / `remove-group-admin` | Quản lý admin nhóm |
| `change-group-owner` | Chuyển quyền trưởng nhóm |
| `disperse-group` | Giải tán nhóm |
| `update-group-settings` | Cập nhật cài đặt nhóm (khóa tên, lịch sử tin nhắn, duyệt tham gia, v.v.) |
| `enable-group-link` / `disable-group-link` / `get-group-link` | Quản lý link mời nhóm |
| `get-pending-members` / `review-pending-members` | Quản lý yêu cầu tham gia |
| `block-group-member` / `unblock-group-member` / `get-group-blocked` | Chặn thành viên nhóm |
| `get-group-members-info` | Lấy thông tin chi tiết thành viên |
| `join-group-link` / `invite-to-groups` / `get-group-invites` / `join-group-invite` / `delete-group-invite` | Lời mời nhóm |
| `change-group-avatar` | Đổi ảnh đại diện nhóm |
| `upgrade-group-to-community` | Nâng cấp nhóm thành cộng đồng |
| `get-group-chat-history` | Lấy lịch sử tin nhắn nhóm |

### Bình chọn (6 actions)

| Action | Mô tả |
|--------|-------------|
| `create-poll` | Tạo bình chọn (hỗ trợ `allowMultiChoices`, `allowAddNewOption`, `hideVotePreview`, `isAnonymous`, `expiredTime`) |
| `vote-poll` | Bỏ phiếu |
| `lock-poll` | Khóa bình chọn |
| `get-poll-detail` | Lấy chi tiết và kết quả bình chọn |
| `add-poll-options` | Thêm tùy chọn mới |
| `share-poll` | Chia sẻ bình chọn |

### Nhắc nhở (6 actions)

| Action | Mô tả |
|--------|-------------|
| `create-reminder` | Tạo nhắc nhở với emoji, thời gian, lặp lại |
| `edit-reminder` | Sửa nhắc nhở |
| `remove-reminder` | Xóa nhắc nhở |
| `list-reminders` | Liệt kê nhắc nhở trong cuộc hội thoại |
| `get-reminder` | Lấy chi tiết nhắc nhở theo ID |
| `get-reminder-responses` | Lấy danh sách thành viên chấp nhận/từ chối nhắc nhở |

### Quản lý hội thoại (16 actions)

| Action | Mô tả |
|--------|-------------|
| `mute-conversation` / `unmute-conversation` | Tắt/bật thông báo (1 giờ, 4 giờ, vĩnh viễn) |
| `pin-conversation` / `unpin-conversation` | Ghim/bỏ ghim hội thoại |
| `delete-chat` | Xóa hội thoại |
| `hide-conversation` / `unhide-conversation` / `get-hidden-conversations` | Ẩn/hiện hội thoại |
| `mark-unread` / `unmark-unread` / `get-unread-marks` | Quản lý đánh dấu chưa đọc |
| `set-auto-delete-chat` / `get-auto-delete-chats` | Tự động xóa chat (1 ngày, 7 ngày, 14 ngày) |
| `get-archived-chats` / `update-archived-chat` | Lưu trữ/bỏ lưu trữ hội thoại |
| `get-mute-status` / `get-pinned-conversations` | Truy vấn trạng thái tắt tiếng/ghim |

### Tin nhắn nhanh & Tự động trả lời (8 actions)

| Action | Mô tả |
|--------|-------------|
| `list-quick-messages` / `add-quick-message` / `remove-quick-message` / `update-quick-message` | Quản lý mẫu trả lời nhanh |
| `list-auto-replies` / `create-auto-reply` / `update-auto-reply` / `delete-auto-reply` | Quản lý quy tắc tự động trả lời (phạm vi: tất cả, người lạ, bạn bè cụ thể) |

### Hồ sơ & Tài khoản (14 actions)

| Action | Mô tả |
|--------|-------------|
| `me` | Lấy hồ sơ đầy đủ (username, avatar, cover, bio, SĐT, giới tính, ngày sinh, globalId, v.v.) |
| `status` | Kiểm tra trạng thái xác thực |
| `get-user-info` | Lấy thông tin hồ sơ người dùng |
| `last-online` | Kiểm tra thời gian online cuối cùng |
| `get-qr` | Lấy QR code của mình |
| `update-profile` | Cập nhật tên, ngày sinh, giới tính |
| `update-profile-bio` | Cập nhật tiểu sử |
| `change-avatar` | Đổi ảnh đại diện theo URL |
| `delete-avatar` / `get-avatar-list` / `reuse-avatar` | Quản lý lịch sử ảnh đại diện |
| `get-biz-account` | Lấy thông tin tài khoản doanh nghiệp |
| `get-full-avatar` | Lấy ảnh đại diện kích thước đầy đủ + ảnh nền |
| `get-friend-board` | Lấy danh sách bảng bạn bè |

### Cài đặt (3 actions)

| Action | Mô tả |
|--------|-------------|
| `get-settings` | Lấy tất cả cài đặt Zalo |
| `update-setting` | Cập nhật một cài đặt cụ thể |
| `update-active-status` | Bật/tắt trạng thái online |

### Sticker & Khác (3 actions)

| Action | Mô tả |
|--------|-------------|
| `search-stickers` / `search-sticker-detail` | Tìm kiếm và duyệt sticker |
| `parse-link` | Phân tích metadata URL |
| `send-report` | Báo cáo người dùng/nhóm |

### Ghi chú & Nhãn (4 actions)

| Action | Mô tả |
|--------|-------------|
| `create-note` / `edit-note` | Tạo/sửa ghi chú trong hội thoại |
| `get-boards` | Lấy bảng ghi chú |
| `get-labels` | Lấy nhãn liên hệ |

### Danh mục & Sản phẩm (8 actions)

| Action | Mô tả |
|--------|-------------|
| `create-catalog` / `update-catalog` / `delete-catalog` / `get-catalogs` | Quản lý danh mục sản phẩm |
| `create-product` / `update-product` / `delete-product` / `get-products` | Quản lý sản phẩm |

### Chặn Zalo (2 actions)

| Action | Mô tả |
|--------|-------------|
| `zalo-block-user` | Chặn người dùng ở cấp nền tảng Zalo |
| `zalo-unblock-user` | Bỏ chặn người dùng ở cấp nền tảng Zalo |

### Cấu hình Bot — Lớp OpenClaw (13 actions)

| Action | Mô tả |
|--------|-------------|
| `block-user` / `unblock-user` | Chặn/bỏ chặn người dùng trong cấu hình bot |
| `list-blocked` / `list-allowed` | Liệt kê người dùng bị chặn/được phép |
| `block-user-in-group` / `unblock-user-in-group` | Chặn người dùng theo nhóm |
| `allow-user-in-group` / `unallow-user-in-group` | Danh sách cho phép người dùng theo nhóm |
| `list-blocked-in-group` / `list-allowed-in-group` | Truy vấn danh sách theo nhóm |
| `group-mention` | Thiết lập require-mention cho nhóm |

### Tiện ích (3 actions)

| Action | Mô tả |
|--------|-------------|
| `get-alias-list` | Lấy danh sách biệt danh bạn bè |
| `get-related-friend-groups` | Lấy nhóm chung với một người bạn |
| `get-multi-users-by-phones` | Tra cứu hàng loạt người dùng theo số điện thoại |

---

## Kiến trúc

```
zaloclaw/
├── index.ts                    → Điểm vào plugin & đăng ký tool
├── package.json
├── openclaw.plugin.json        → Manifest plugin (JSON Schema cho cấu hình)
│
├── src/
│   ├── channel/                → Vòng đời kênh & luồng tin nhắn
│   │   ├── channel.ts          → Định nghĩa plugin, khởi động/dừng tài khoản, dock
│   │   ├── monitor.ts          → Xử lý & định tuyến tin nhắn đến
│   │   ├── send.ts             → Gửi tin nhắn đi & markdown
│   │   ├── onboarding.ts       → Luồng đăng nhập QR code (bảng điều khiển)
│   │   ├── image-downloader.ts → Xử lý tải media
│   │   └── probe.ts            → Kiểm tra sức khỏe kết nối
│   │
│   ├── client/                 → Wrapper API Zalo & quản lý tài khoản
│   │   ├── zalo-client.ts      → Vòng đời API zca-js (login, getApi, v.v.)
│   │   ├── credentials.ts      → Lưu trữ thông tin đăng nhập (đọc/ghi file)
│   │   ├── accounts.ts         → Phân giải đa tài khoản
│   │   ├── qr-display.ts       → Hiển thị QR code trên terminal
│   │   └── friend-request-store.ts → Theo dõi lời mời kết bạn
│   │
│   ├── config/                 → Schema cấu hình & quản lý
│   │   ├── config-schema.ts    → Schema Zod với gợi ý UI cho bảng điều khiển
│   │   └── config-manager.ts   → Đọc/ghi cấu hình runtime (openclaw.json)
│   │
│   ├── tools/                  → Định nghĩa công cụ agent
│   │   └── tool.ts             → 147 action handlers
│   │
│   ├── features/               → Các module tính năng độc lập
│   │   ├── auto-unsend.ts      → Thu hồi tin nhắn
│   │   ├── msg-id-store.ts     → Ánh xạ Message ID ↔ cliMsgId
│   │   ├── quote-reply.ts      → Hỗ trợ trả lời tin nhắn
│   │   ├── reaction-ack.ts     → Xác nhận reaction
│   │   ├── read-receipt.ts     → Xử lý xác nhận đã đọc
│   │   └── sticker.ts          → Tìm kiếm, cache & gửi sticker
│   │
│   ├── parsing/                → Xử lý văn bản
│   │   └── mention-parser.ts   → Phát hiện @mention & phân giải mention đi
│   │
│   ├── safety/                 → Bảo vệ đầu ra
│   │   ├── output-filter.ts    → Lọc nội dung nhạy cảm khỏi phản hồi
│   │   └── thread-sandbox.ts   → Cô lập thread
│   │
│   └── runtime/                → Trạng thái runtime chia sẻ
│       ├── runtime.ts          → Singleton môi trường runtime
│       ├── types.ts            → Định nghĩa kiểu TypeScript
│       └── status-issues.ts    → Báo cáo trạng thái sức khỏe
│
├── docs/
│   └── FEATURES.md             → Đặc tả tính năng & ghi chú API zca-js
│
├── .github/
│   ├── workflows/ci.yml        → CI: install + typecheck trên Node 22/24
│   └── ISSUE_TEMPLATE/         → Template báo lỗi & yêu cầu tính năng
│
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── LICENSE                     → MIT
└── .editorconfig
```

### Luồng tin nhắn

```
Zalo → sự kiện zca-js → monitor.ts
  ├── Trích xuất ngữ cảnh trả lời/trích dẫn (nội dung + người gửi)
  ├── Kiểm soát truy cập (chặn/cho phép, chính sách DM, chính sách nhóm)
  ├── Mention gating (nhóm: bỏ qua nếu không @mention → đệm)
  ├── Xử lý hình ảnh (chỉ tải khi được mention hoặc DM)
  ├── Tổng hợp ngữ cảnh (thông tin người gửi, tin nhắn đệm, media, trích dẫn)
  ├── Định dạng envelope → gửi đến OpenClaw agent
  └── Phản hồi agent → send.ts → Zalo
```

---

## Phát triển

```bash
# Kiểm tra kiểu
npm run typecheck

# Kiểm tra local
openclaw plugins install --link .
openclaw gateway restart
openclaw status
```

Không cần bước build — OpenClaw tải trực tiếp file `.ts` qua runtime.

### Thêm tính năng mới

1. Tạo module trong thư mục con `src/` phù hợp
2. Kết nối vào `monitor.ts` (cho tin đến) hoặc `send.ts` (cho tin đi)
3. Nếu cần tool action, thêm handler trong `src/tools/tool.ts`
4. Chạy `npm run typecheck` để xác minh
5. Kiểm tra với `openclaw gateway restart`

---

## Hạn chế

- **Một tài khoản mỗi instance plugin** — đa tài khoản được hỗ trợ về cấu trúc nhưng chưa được kiểm thử
- **Không hỗ trợ streaming** — zca-js không hỗ trợ phản hồi streaming (`blockStreaming: true`)
- **Giới hạn tốc độ** — Zalo có thể hạn chế hoặc chặn tài khoản gửi tin nhắn nhiều
- **Ổn định phiên** — phiên zca-js có thể hết hạn; cần đăng nhập lại bằng QR khi cookie hết hạn
- **Không mã hóa đầu cuối** — tin nhắn đi qua máy chủ Zalo như bình thường
- **Message TTL** — tự hủy tin nhắn (`messageTtl`) được gửi tới Zalo API nhưng có thể không được áp dụng phía server; sử dụng `set-auto-delete-chat` cho tự động xóa cấp hội thoại

## Giấy phép

[MIT](LICENSE) © monasprox
