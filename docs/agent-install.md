# opclaw-zalo — Hướng dẫn cài đặt & sử dụng cho Agent

> Tài liệu chi tiết dành cho AI agent và người dùng: cách cài đặt plugin, cấu hình từng tính năng, và sử dụng toàn bộ 147 công cụ (actions) của opclaw-zalo.

---

## Mục lục

1. [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
2. [Cài đặt](#cài-đặt)
3. [Đăng nhập Zalo](#đăng-nhập-zalo)
4. [Cấu hình](#cấu-hình)
5. [Hướng dẫn sử dụng công cụ](#hướng-dẫn-sử-dụng-công-cụ)
   - [Nhắn tin](#1-nhắn-tin-16-actions)
   - [Bạn bè](#2-bạn-bè-16-actions)
   - [Nhóm](#3-nhóm-22-actions)
   - [Bình chọn](#4-bình-chọn-polls-6-actions)
   - [Nhắc nhở](#5-nhắc-nhở-reminders-6-actions)
   - [Quản lý hội thoại](#6-quản-lý-hội-thoại-16-actions)
   - [Tin nhắn nhanh & Tự động trả lời](#7-tin-nhắn-nhanh--tự-động-trả-lời-8-actions)
   - [Hồ sơ & Tài khoản](#8-hồ-sơ--tài-khoản-14-actions)
   - [Cài đặt Zalo](#9-cài-đặt-zalo-3-actions)
   - [Sticker & Tiện ích](#10-sticker--tiện-ích-3-actions)
   - [Ghi chú & Nhãn](#11-ghi-chú--nhãn-4-actions)
   - [Danh mục & Sản phẩm](#12-danh-mục--sản-phẩm-8-actions)
   - [Chặn người dùng (Zalo)](#13-chặn-người-dùng-cấp-zalo-2-actions)
   - [Cấu hình Bot (OpenClaw)](#14-cấu-hình-bot-openclaw-layer-13-actions)
   - [Tiện ích khác](#15-tiện-ích-khác-3-actions)
6. [Luồng xử lý tin nhắn](#luồng-xử-lý-tin-nhắn)
7. [Xử lý sự cố](#xử-lý-sự-cố)

---

## Yêu cầu hệ thống

| Thành phần | Phiên bản tối thiểu |
|------------|---------------------|
| **OpenClaw** | ≥ 2026.2.0 |
| **Node.js** | ≥ 22 |
| **npm** | ≥ 10 |
| **OS** | Linux (khuyến nghị), macOS, Windows (WSL) |

Cần có tài khoản Zalo cá nhân (không phải OA) và thiết bị có Zalo app để quét QR.

---

## Cài đặt

### Bước 1: Clone plugin

```bash
git clone https://github.com/monasprox/opclaw-zalo.git /path/to/opclaw-zalo
cd /path/to/opclaw-zalo
```

### Bước 2: Cài dependencies

```bash
npm install
```

### Bước 3: Đăng ký plugin với OpenClaw

```bash
openclaw plugins install --link /path/to/opclaw-zalo
```

> **Lưu ý:** Dùng `--link` để liên kết trực tiếp từ thư mục source. KHÔNG tự tạo symlink thủ công.

### Bước 4: Khởi động lại gateway

```bash
openclaw gateway restart
```

### Bước 5: Kiểm tra

```bash
openclaw status
```

Kết quả mong muốn: `opclaw-zalo` hiển thị trong danh sách channels với status `ON`.

---

## Đăng nhập Zalo

### Qua terminal (CLI)

```bash
openclaw channels login --channel opclaw-zalo
```

Mã QR sẽ hiện trong terminal. Mở Zalo app → Quét QR → Xác nhận.

### Qua Control Panel

Truy cập OpenClaw Control Panel → Channels → opclaw-zalo → Login. QR code hiện trên giao diện web.

### Credentials

Sau khi đăng nhập thành công:
- Credentials lưu tại `~/.openclaw/opclaw-zalo-credentials.json`
- Tự động đăng nhập lại khi gateway restart
- Khi session hết hạn (cookies expire), cần quét QR lại

---

## Cấu hình

File cấu hình: `~/.openclaw/openclaw.json` → `channels.opclaw-zalo`

### Cấu hình tối thiểu

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

### Cấu hình đầy đủ

```jsonc
{
  "channels": {
    "opclaw-zalo": {
      "accounts": {
        "default": {
          "enabled": true,

          // === Chính sách DM ===
          "dmPolicy": "open",           // open | pairing | allowlist | disabled
          "allowFrom": ["*"],           // Danh sách user ID được nhắn DM, "*" = tất cả
          "denyFrom": [],               // Danh sách user ID bị chặn

          // === Chính sách nhóm ===
          "groupPolicy": "open",        // open | allowlist | disabled

          // === Cấu hình từng nhóm ===
          "groups": {
            "*": {                       // Mặc định cho tất cả nhóm
              "requireMention": true     // Chỉ phản hồi khi @mention
            },
            "123456789": {               // Cấu hình riêng cho nhóm cụ thể
              "allow": true,
              "requireMention": false,   // Luôn phản hồi
              "allowUsers": [],          // Rỗng = tất cả
              "denyUsers": [],
              "tools": {                 // Giới hạn công cụ cho nhóm này
                "allow": ["send", "friends"],
                "deny": ["delete-chat"]
              }
            }
          },

          // === Hiển thị ===
          "markdown": {
            "tables": "bullets"          // off | bullets | code | block
          },
          "messagePrefix": "",           // Thêm trước mọi tin nhắn gửi đi
          "responsePrefix": ""           // Thêm trước phản hồi của agent
        }
      }
    }
  }
}
```

### Chính sách DM (dmPolicy)

| Giá trị | Mô tả |
|---------|-------|
| `open` | Nhận DM từ tất cả mọi người |
| `pairing` | Yêu cầu trao đổi mã PIN trước khi nhắn tin |
| `allowlist` | Chỉ những user trong `allowFrom` mới được nhắn |
| `disabled` | Không nhận DM nào |

### Chính sách nhóm (groupPolicy)

| Giá trị | Mô tả |
|---------|-------|
| `open` | Bot hoạt động trong tất cả nhóm |
| `allowlist` | Chỉ hoạt động trong nhóm được cấu hình |
| `disabled` | Không hoạt động trong nhóm nào |

### Cấu hình mention gating

Khi `requireMention: true` (mặc định trong nhóm):
- Bot **chỉ phản hồi** khi được @mention
- Tin nhắn không @mention sẽ được **buffer** (tối đa 50 tin, 4 giờ)
- Khi được @mention, bot nhận được cả tin nhắn hiện tại + các tin nhắn buffer trước đó làm context

---

## Hướng dẫn sử dụng công cụ

Plugin cung cấp **1 tool duy nhất** tên `opclaw-zalo` với 147 actions. Agent chọn action bằng tên.

**Quy tắc chung:**
- `threadId` = ID người nhận (DM) hoặc ID nhóm — có thể dùng **tên hiển thị** thay vì số, plugin tự phân giải
- `isGroup` = `true` nếu gửi vào nhóm, `false` nếu DM
- `userId` — có thể dùng tên hiển thị, plugin tự tra cứu trong danh sách bạn bè
- Kết quả trả về luôn có dạng JSON object

---

### 1. Nhắn tin (16 actions)

#### `send` — Gửi tin nhắn văn bản

```json
{
  "action": "send",
  "threadId": "user_id_or_name",
  "message": "Xin chào!",
  "isGroup": false,
  "urgency": 0,
  "messageTtl": 0
}
```

| Param | Bắt buộc | Mô tả |
|-------|----------|-------|
| `threadId` | ✅ | ID hoặc tên người/nhóm nhận |
| `message` | ✅ | Nội dung tin nhắn |
| `isGroup` | ✅ | `true` = nhóm, `false` = DM |
| `urgency` | ❌ | `0` = bình thường, `1` = quan trọng, `2` = khẩn cấp |
| `messageTtl` | ❌ | Thời gian tự xóa (ms): `60000` = 1 phút, `3600000` = 1 giờ |

#### `send-styled` — Gửi tin nhắn có định dạng

```json
{
  "action": "send-styled",
  "threadId": "123456",
  "message": "**Chào bạn**, đây là tin nhắn *quan trọng*",
  "isGroup": false,
  "urgency": 1
}
```

Hỗ trợ markdown:
- `**bold**` → **đậm**
- `*italic*` → *nghiêng*
- `__underline__` → <u>gạch chân</u>
- `~~strike~~` → ~~gạch ngang~~

Hoặc dùng styles array cho màu sắc:
```json
{
  "action": "send-styled",
  "threadId": "123456",
  "message": "Cảnh báo: hệ thống quá tải",
  "styles": [
    { "start": 0, "len": 9, "st": "b" },
    { "start": 0, "len": 9, "st": "c_FF0000" }
  ],
  "isGroup": false
}
```

Style codes: `b` = bold, `i` = italic, `u` = underline, `s` = strikethrough, `c_HEX` = màu (ví dụ `c_FF0000` = đỏ)

#### `send-link` — Gửi link có preview

```json
{
  "action": "send-link",
  "threadId": "123456",
  "url": "https://example.com",
  "isGroup": false
}
```

#### `send-image` — Gửi ảnh

```json
{
  "action": "send-image",
  "threadId": "123456",
  "url": "https://example.com/photo.jpg",
  "message": "Ảnh chụp hôm nay",
  "isGroup": false
}
```

#### `send-file` — Gửi file (PDF, doc, v.v.)

```json
{
  "action": "send-file",
  "threadId": "123456",
  "filePath": "/path/to/document.pdf",
  "isGroup": false
}
```

Hoặc gửi file từ URL:
```json
{
  "action": "send-file",
  "threadId": "123456",
  "url": "https://example.com/report.pdf",
  "isGroup": false
}
```

#### `send-video` — Gửi video

```json
{
  "action": "send-video",
  "threadId": "123456",
  "url": "https://example.com/video.mp4",
  "thumbnailUrl": "https://example.com/thumb.jpg",
  "isGroup": false
}
```

#### `send-voice` — Gửi tin nhắn thoại

```json
{
  "action": "send-voice",
  "threadId": "123456",
  "voiceUrl": "https://example.com/audio.mp3",
  "isGroup": false
}
```

#### `send-sticker` — Gửi sticker

Gửi theo ID:
```json
{
  "action": "send-sticker",
  "threadId": "123456",
  "stickerId": "sticker_id",
  "stickerCateId": "category_id",
  "isGroup": false
}
```

Hoặc tìm kiếm theo từ khóa:
```json
{
  "action": "send-sticker",
  "threadId": "123456",
  "keyword": "vui",
  "isGroup": false
}
```

#### `send-card` — Gửi danh thiếp

```json
{
  "action": "send-card",
  "threadId": "123456",
  "userId": "target_user_id",
  "isGroup": false
}
```

#### `send-bank-card` — Gửi thẻ ngân hàng

```json
{
  "action": "send-bank-card",
  "threadId": "123456",
  "binBank": "970436",
  "numAccBank": "1234567890",
  "nameAccBank": "NGUYEN VAN A",
  "isGroup": false
}
```

#### `send-typing` — Gửi trạng thái đang nhập

```json
{
  "action": "send-typing",
  "threadId": "123456",
  "isGroup": false
}
```

#### `send-to-stranger` — Gửi tin nhắn cho người lạ (chưa kết bạn)

```json
{
  "action": "send-to-stranger",
  "userId": "stranger_id",
  "message": "Xin chào, tôi muốn kết nối"
}
```

> Lưu ý: Tin nhắn có thể không được nhận nếu người lạ chặn tin nhắn từ người lạ.

#### `forward-message` — Chuyển tiếp tin nhắn

```json
{
  "action": "forward-message",
  "msgId": "original_msg_id",
  "threadIds": ["thread1", "thread2"],
  "message": "FYI",
  "messageTtl": 0
}
```

#### `delete-message` — Xóa tin nhắn

```json
{
  "action": "delete-message",
  "msgId": "msg_id",
  "threadId": "123456",
  "isGroup": false,
  "onlyMe": false
}
```

- `onlyMe: true` = chỉ xóa ở phía mình
- `onlyMe: false` = xóa cho tất cả (trong vòng 24h)

#### `undo-message` — Thu hồi tin nhắn đã gửi

```json
{
  "action": "undo-message",
  "msgId": "msg_id",
  "threadId": "123456"
}
```

#### `add-reaction` — Thả reaction

```json
{
  "action": "add-reaction",
  "msgId": "msg_id",
  "icon": "heart",
  "threadId": "123456",
  "isGroup": false
}
```

Icon hỗ trợ: `heart` ❤️, `like` 👍, `haha` 😆, `wow` 😮, `cry` 😢, `angry` 😠

> Plugin tự tra cứu `cliMsgId` từ bộ nhớ nội bộ. Nếu tin nhắn cũ hơn lúc bot khởi động, cần cung cấp `cliMsgId` thủ công.

---

### 2. Bạn bè (16 actions)

#### `friends` — Danh sách bạn bè

```json
{
  "action": "friends",
  "query": "Nguyễn"
}
```

Trả về: `{ friends: [{userId, displayName, zaloName, avatar, phoneNumber}], count }`

#### `find-user` — Tìm người dùng theo SĐT

```json
{
  "action": "find-user",
  "phoneNumber": "0912345678"
}
```

Trả về đầy đủ profile: `userId`, `displayName`, `zaloName`, `avatar`, `cover`, `gender`, `dob`, `status`, `globalId`

#### `find-user-by-username` — Tìm theo username

```json
{
  "action": "find-user-by-username",
  "username": "nguyenvana"
}
```

#### `send-friend-request` — Gửi lời mời kết bạn

```json
{
  "action": "send-friend-request",
  "userId": "user_id_or_name",
  "requestMessage": "Xin chào! Mình muốn kết bạn"
}
```

`requestMessage` mặc định: `"Xin chào!"`

#### `get-friend-requests` — Xem lời mời kết bạn đã nhận

```json
{ "action": "get-friend-requests" }
```

#### `accept-friend-request` / `reject-friend-request`

```json
{
  "action": "accept-friend-request",
  "userId": "user_id"
}
```

#### `get-sent-requests` — Xem lời mời đã gửi

```json
{ "action": "get-sent-requests" }
```

#### `undo-friend-request` — Hủy lời mời đã gửi

```json
{
  "action": "undo-friend-request",
  "userId": "user_id"
}
```

#### `unfriend` — Hủy kết bạn

```json
{
  "action": "unfriend",
  "userId": "user_id_or_name"
}
```

#### `check-friend-status` — Kiểm tra trạng thái bạn bè

```json
{
  "action": "check-friend-status",
  "userId": "user_id"
}
```

Trả về: `{ userId, isFriend, isRequested, isRequesting }`

#### `set-friend-nickname` / `remove-friend-nickname`

```json
{
  "action": "set-friend-nickname",
  "userId": "user_id",
  "nickname": "Bạn thân"
}
```

#### `get-online-friends` — Bạn bè đang online

```json
{ "action": "get-online-friends" }
```

#### `get-close-friends` — Bạn thân

```json
{ "action": "get-close-friends" }
```

#### `get-friend-recommendations` — Gợi ý kết bạn

```json
{ "action": "get-friend-recommendations" }
```

---

### 3. Nhóm (22 actions)

#### `groups` — Danh sách nhóm

```json
{
  "action": "groups",
  "query": "Team dev"
}
```

#### `get-group-info` — Thông tin chi tiết nhóm

```json
{
  "action": "get-group-info",
  "groupId": "group_id_or_name"
}
```

Trả về: `groupId`, `name`, `desc`, `totalMember`, `memberIds`, `creatorId`, `adminIds`

#### `create-group` — Tạo nhóm mới

```json
{
  "action": "create-group",
  "groupName": "Nhóm dự án mới",
  "memberIds": ["user1", "user2", "user3"]
}
```

#### `add-to-group` — Thêm thành viên

```json
{
  "action": "add-to-group",
  "groupId": "group_id",
  "memberIds": ["user1", "user2"]
}
```

#### `remove-from-group` — Xóa thành viên

```json
{
  "action": "remove-from-group",
  "groupId": "group_id",
  "userId": "user_id"
}
```

#### `leave-group` — Rời nhóm

```json
{
  "action": "leave-group",
  "groupId": "group_id"
}
```

#### `rename-group` — Đổi tên nhóm

```json
{
  "action": "rename-group",
  "groupId": "group_id",
  "groupName": "Tên mới"
}
```

#### `add-group-admin` / `remove-group-admin` — Quản lý admin

```json
{
  "action": "add-group-admin",
  "groupId": "group_id",
  "userId": "user_id"
}
```

#### `change-group-owner` — Chuyển quyền trưởng nhóm

```json
{
  "action": "change-group-owner",
  "groupId": "group_id",
  "userId": "new_owner_id"
}
```

#### `disperse-group` — Giải tán nhóm

```json
{
  "action": "disperse-group",
  "groupId": "group_id"
}
```

> ⚠️ Hành động không thể hoàn tác!

#### `update-group-settings` — Cập nhật cài đặt nhóm

```json
{
  "action": "update-group-settings",
  "groupId": "group_id",
  "groupSettings": {
    "blockName": true,
    "signAdminMsg": true,
    "enableMsgHistory": true,
    "joinAppr": true,
    "lockCreatePost": false,
    "lockCreatePoll": false,
    "lockSendMsg": false,
    "lockViewMember": false
  }
}
```

| Setting | Mô tả |
|---------|-------|
| `blockName` | Khóa đổi tên nhóm |
| `signAdminMsg` | Hiện badge admin |
| `setTopicOnly` | Chỉ admin đặt topic |
| `enableMsgHistory` | Thành viên mới xem tin cũ |
| `joinAppr` | Duyệt trước khi vào nhóm |
| `lockCreatePost` | Khóa tạo bài viết |
| `lockCreatePoll` | Khóa tạo bình chọn |
| `lockSendMsg` | Khóa gửi tin nhắn |
| `lockViewMember` | Khóa xem danh sách thành viên |

#### Quản lý link nhóm

```json
{ "action": "enable-group-link", "groupId": "group_id" }
{ "action": "disable-group-link", "groupId": "group_id" }
{ "action": "get-group-link", "groupId": "group_id" }
```

#### Duyệt thành viên chờ

```json
{
  "action": "get-pending-members",
  "groupId": "group_id"
}
```

```json
{
  "action": "review-pending-members",
  "groupId": "group_id",
  "memberIds": ["user1", "user2"],
  "isApprove": true
}
```

#### Chặn thành viên trong nhóm

```json
{ "action": "block-group-member", "groupId": "group_id", "userId": "user_id" }
{ "action": "unblock-group-member", "groupId": "group_id", "userId": "user_id" }
{ "action": "get-group-blocked", "groupId": "group_id" }
```

#### Thông tin thành viên chi tiết

```json
{
  "action": "get-group-members-info",
  "groupId": "group_id"
}
```

#### Tham gia nhóm qua link

```json
{
  "action": "join-group-link",
  "link": "https://zalo.me/g/xxxxxx"
}
```

#### Mời vào nhóm / Quản lý lời mời

```json
{
  "action": "invite-to-groups",
  "userId": "user_id",
  "groupIds": ["group1", "group2"]
}
```

```json
{ "action": "get-group-invites" }
{ "action": "join-group-invite", "groupId": "group_id" }
{ "action": "delete-group-invite", "groupId": "group_id" }
```

#### `change-group-avatar` — Đổi avatar nhóm

```json
{
  "action": "change-group-avatar",
  "groupId": "group_id",
  "url": "https://example.com/avatar.jpg"
}
```

#### `upgrade-group-to-community` — Nâng cấp lên cộng đồng

```json
{
  "action": "upgrade-group-to-community",
  "groupId": "group_id"
}
```

#### `get-group-chat-history` — Lấy lịch sử chat nhóm

```json
{
  "action": "get-group-chat-history",
  "groupId": "group_id",
  "count": 20
}
```

`count` mặc định = 20.

---

### 4. Bình chọn / Polls (6 actions)

#### `create-poll` — Tạo bình chọn

```json
{
  "action": "create-poll",
  "threadId": "group_id",
  "title": "Đi ăn ở đâu?",
  "options": ["Phở", "Bún bò", "Cơm tấm"],
  "isGroup": true,
  "allowMultiChoices": true,
  "allowAddNewOption": false,
  "hideVotePreview": false,
  "isAnonymous": false,
  "expiredTime": 1776268800000
}
```

| Param | Bắt buộc | Mô tả |
|-------|----------|-------|
| `threadId` | ✅ | ID nhóm hoặc DM |
| `title` | ✅ | Tiêu đề bình chọn |
| `options` | ✅ | Mảng các lựa chọn |
| `isGroup` | ✅ | `true` / `false` |
| `allowMultiChoices` | ❌ | Cho phép chọn nhiều |
| `allowAddNewOption` | ❌ | Cho phép thêm lựa chọn |
| `hideVotePreview` | ❌ | Ẩn kết quả trước khi vote |
| `isAnonymous` | ❌ | Bình chọn ẩn danh |
| `expiredTime` | ❌ | Thời gian hết hạn (Unix ms) |

#### `vote-poll` — Bỏ phiếu

```json
{
  "action": "vote-poll",
  "pollId": "poll_id",
  "threadId": "group_id",
  "optionId": "option_id",
  "isGroup": true
}
```

#### `lock-poll` — Khóa bình chọn

```json
{
  "action": "lock-poll",
  "pollId": "poll_id",
  "threadId": "group_id",
  "isGroup": true
}
```

#### `get-poll-detail` — Xem chi tiết bình chọn

```json
{
  "action": "get-poll-detail",
  "pollId": "poll_id",
  "threadId": "group_id",
  "isGroup": true
}
```

#### `add-poll-options` — Thêm lựa chọn

```json
{
  "action": "add-poll-options",
  "pollId": "poll_id",
  "threadId": "group_id",
  "options": ["Lựa chọn mới"],
  "isGroup": true
}
```

#### `share-poll` — Chia sẻ bình chọn

```json
{
  "action": "share-poll",
  "pollId": "poll_id",
  "threadId": "group_id",
  "threadIds": ["other_group1", "other_group2"],
  "isGroup": true
}
```

---

### 5. Nhắc nhở / Reminders (6 actions)

#### `create-reminder` — Tạo nhắc nhở

```json
{
  "action": "create-reminder",
  "threadId": "group_id",
  "title": "Họp team 3h chiều",
  "startTime": 1776268800000,
  "isGroup": true,
  "emoji": "📅",
  "repeat": 0
}
```

| Giá trị `repeat` | Mô tả |
|-------------------|-------|
| `0` | Không lặp |
| `1` | Hàng ngày |
| `2` | Hàng tuần |
| `3` | Hàng tháng |

#### `edit-reminder` — Sửa nhắc nhở

```json
{
  "action": "edit-reminder",
  "reminderId": "reminder_id",
  "threadId": "group_id",
  "isGroup": true,
  "title": "Tiêu đề mới",
  "startTime": 1776355200000
}
```

#### `remove-reminder` — Xóa nhắc nhở

```json
{
  "action": "remove-reminder",
  "reminderId": "reminder_id",
  "threadId": "group_id",
  "isGroup": true
}
```

#### `list-reminders` — Liệt kê nhắc nhở

```json
{
  "action": "list-reminders",
  "threadId": "group_id",
  "isGroup": true
}
```

#### `get-reminder` — Chi tiết nhắc nhở

```json
{
  "action": "get-reminder",
  "reminderId": "reminder_id"
}
```

#### `get-reminder-responses` — Xem ai đã chấp nhận/từ chối

```json
{
  "action": "get-reminder-responses",
  "reminderId": "reminder_id"
}
```

Trả về: `{ reminderId, acceptMembers, rejectMembers }`

---

### 6. Quản lý hội thoại (16 actions)

#### Tắt/bật thông báo

```json
{
  "action": "mute-conversation",
  "threadId": "123456",
  "isGroup": false,
  "duration": -1
}
```

| Giá trị `duration` | Mô tả |
|--------------------|-------|
| `3600` | Tắt 1 giờ |
| `14400` | Tắt 4 giờ |
| `-1` | Tắt vĩnh viễn |

```json
{ "action": "unmute-conversation", "threadId": "123456", "isGroup": false }
```

#### Ghim / bỏ ghim

```json
{ "action": "pin-conversation", "threadId": "123456", "isGroup": false }
{ "action": "unpin-conversation", "threadId": "123456", "isGroup": false }
```

#### Xóa hội thoại

```json
{ "action": "delete-chat", "threadId": "123456", "isGroup": false }
```

#### Ẩn / hiện hội thoại

```json
{ "action": "hide-conversation", "threadId": "123456", "isGroup": false }
{ "action": "unhide-conversation", "threadId": "123456", "isGroup": false }
{ "action": "get-hidden-conversations" }
```

#### Đánh dấu / bỏ đánh dấu chưa đọc

```json
{ "action": "mark-unread", "threadId": "123456", "isGroup": false }
{ "action": "unmark-unread", "threadId": "123456", "isGroup": false }
{ "action": "get-unread-marks" }
```

#### Tin nhắn tự xóa (auto-delete) — cấp hội thoại

```json
{
  "action": "set-auto-delete-chat",
  "threadId": "123456",
  "ttl": 86400000,
  "isGroup": false
}
```

| Giá trị `ttl` | Mô tả |
|----------------|-------|
| `0` | Tắt |
| `86400000` | 1 ngày |
| `604800000` | 7 ngày |
| `1209600000` | 14 ngày |

```json
{ "action": "get-auto-delete-chats" }
```

#### Lưu trữ hội thoại

```json
{
  "action": "update-archived-chat",
  "threadId": "123456",
  "isArchived": true,
  "isGroup": false
}
```

```json
{ "action": "get-archived-chats" }
```

#### Truy vấn trạng thái

```json
{ "action": "get-mute-status" }
{ "action": "get-pinned-conversations" }
```

---

### 7. Tin nhắn nhanh & Tự động trả lời (8 actions)

#### Tin nhắn nhanh (Quick Messages)

```json
{ "action": "list-quick-messages" }

{
  "action": "add-quick-message",
  "keyword": "/hello",
  "message": "Xin chào! Tôi có thể giúp gì?"
}

{
  "action": "update-quick-message",
  "itemId": "item_id",
  "keyword": "/hi",
  "message": "Nội dung mới"
}

{ "action": "remove-quick-message", "itemId": "item_id" }
```

#### Tự động trả lời (Auto-Reply)

```json
{
  "action": "create-auto-reply",
  "message": "Tôi đang bận, sẽ phản hồi sau!",
  "startTime": 1776268800000,
  "endTime": 1776355200000,
  "isEnable": true,
  "scope": 0,
  "memberIds": []
}
```

| Giá trị `scope` | Mô tả |
|------------------|-------|
| `0` | Tất cả mọi người |
| `1` | Người lạ |
| `2` | Bạn bè cụ thể (cần `memberIds`) |
| `3` | Tất cả bạn trừ một số (cần `memberIds`) |

```json
{
  "action": "update-auto-reply",
  "replyId": "reply_id",
  "message": "Nội dung cập nhật",
  "startTime": 1776268800000,
  "endTime": 1776355200000
}

{ "action": "delete-auto-reply", "replyId": "reply_id" }
{ "action": "list-auto-replies" }
```

---

### 8. Hồ sơ & Tài khoản (14 actions)

#### `me` — Xem profile của mình

```json
{ "action": "me" }
```

Trả về: `userId`, `username`, `displayName`, `zaloName`, `avatar`, `bgavatar`, `cover`, `phoneNumber`, `gender`, `dob`, `sdob`, `status`, `bio`, `globalId`, `isActive`, `accountStatus`, `createdTs`

#### `status` — Trạng thái đăng nhập

```json
{ "action": "status" }
```

Trả về: `{ authenticated, hasCredentials }`

#### `get-user-info` — Xem thông tin người dùng

```json
{ "action": "get-user-info", "userId": "user_id" }
```

#### `last-online` — Thời gian online cuối

```json
{ "action": "last-online", "userId": "user_id" }
```

#### `get-qr` — Lấy mã QR của mình

```json
{ "action": "get-qr" }
```

#### `update-profile` — Cập nhật hồ sơ

```json
{
  "action": "update-profile",
  "name": "Tên mới",
  "dob": "1990-01-15",
  "gender": 0
}
```

Gender: `0` = Nam, `1` = Nữ

#### `update-profile-bio` — Cập nhật bio

```json
{
  "action": "update-profile-bio",
  "bio": "Đây là bio mới của tôi"
}
```

#### `change-avatar` — Đổi avatar

```json
{
  "action": "change-avatar",
  "url": "https://example.com/new-avatar.jpg"
}
```

#### Quản lý avatar cũ

```json
{ "action": "get-avatar-list" }
{ "action": "reuse-avatar", "photoId": "photo_id" }
{ "action": "delete-avatar", "photoId": "photo_id" }
```

#### `get-biz-account` — Xem tài khoản business

```json
{ "action": "get-biz-account", "userId": "user_id" }
```

#### `get-full-avatar` — Avatar full-size + background

```json
{ "action": "get-full-avatar", "userId": "user_id" }
```

Trả về: `{ userId, fullAvatar, backgroundAvatar }`

#### `get-friend-board` — Bảng bạn bè

```json
{ "action": "get-friend-board" }
```

---

### 9. Cài đặt Zalo (3 actions)

#### `get-settings` — Xem tất cả cài đặt

```json
{ "action": "get-settings" }
```

#### `update-setting` — Cập nhật cài đặt

```json
{
  "action": "update-setting",
  "settingKey": "key_name",
  "settingValue": 1
}
```

`settingValue`: `0` = tắt, `1` = bật

#### `update-active-status` — Bật/tắt trạng thái online

```json
{
  "action": "update-active-status",
  "active": true
}
```

---

### 10. Sticker & Tiện ích (3 actions)

#### `search-stickers` — Tìm sticker

```json
{ "action": "search-stickers", "keyword": "mèo" }
```

Trả về: `{ stickerIds, count }`

#### `search-sticker-detail` — Chi tiết sticker

```json
{ "action": "search-sticker-detail", "stickerId": "sticker_id" }
```

#### `parse-link` — Phân tích URL

```json
{ "action": "parse-link", "url": "https://example.com" }
```

---

### 11. Ghi chú & Nhãn (4 actions)

#### `create-note` — Tạo ghi chú trong hội thoại

```json
{
  "action": "create-note",
  "threadId": "123456",
  "title": "Ghi chú quan trọng",
  "pinAct": true
}
```

`pinAct: true` = ghim ghi chú

#### `edit-note` — Sửa ghi chú

```json
{
  "action": "edit-note",
  "threadId": "123456",
  "topicId": "topic_id",
  "title": "Tiêu đề mới"
}
```

#### `get-boards` — Xem bảng ghi chú

```json
{ "action": "get-boards", "threadId": "123456" }
```

#### `get-labels` — Xem nhãn liên hệ

```json
{ "action": "get-labels" }
```

---

### 12. Danh mục & Sản phẩm (8 actions)

#### Quản lý danh mục

```json
{ "action": "get-catalogs" }

{
  "action": "create-catalog",
  "name": "Đồ điện tử"
}

{
  "action": "update-catalog",
  "catalogId": "catalog_id",
  "name": "Tên mới"
}

{ "action": "delete-catalog", "catalogId": "catalog_id" }
```

#### Quản lý sản phẩm

```json
{ "action": "get-products", "catalogId": "catalog_id" }

{
  "action": "create-product",
  "name": "iPhone 15",
  "price": 25000000,
  "description": "Mô tả sản phẩm",
  "catalogId": "catalog_id",
  "url": "https://example.com/product"
}

{
  "action": "update-product",
  "productId": "product_id",
  "name": "Tên mới",
  "price": 23000000
}

{
  "action": "delete-product",
  "productId": "product_id",
  "catalogId": "catalog_id"
}
```

---

### 13. Chặn người dùng cấp Zalo (2 actions)

Chặn/bỏ chặn **trực tiếp trên Zalo platform** (khác với chặn trong bot config):

```json
{ "action": "zalo-block-user", "userId": "user_id" }
{ "action": "zalo-unblock-user", "userId": "user_id" }
```

---

### 14. Cấu hình Bot — OpenClaw Layer (13 actions)

Các hành động này **thay đổi file cấu hình** `openclaw.json` và **yêu cầu restart gateway** để có hiệu lực.

#### Chặn/bỏ chặn người dùng (global)

```json
{ "action": "block-user", "userId": "user_id" }
{ "action": "unblock-user", "userId": "user_id" }
{ "action": "list-blocked" }
{ "action": "list-allowed" }
```

#### Chặn/bỏ chặn trong nhóm cụ thể

```json
{ "action": "block-user-in-group", "userId": "user_id", "groupId": "group_id" }
{ "action": "unblock-user-in-group", "userId": "user_id", "groupId": "group_id" }
{ "action": "list-blocked-in-group", "groupId": "group_id" }
```

#### Cho phép/bỏ cho phép trong nhóm

```json
{ "action": "allow-user-in-group", "userId": "user_id", "groupId": "group_id" }
{ "action": "unallow-user-in-group", "userId": "user_id", "groupId": "group_id" }
{ "action": "list-allowed-in-group", "groupId": "group_id" }
```

#### Cấu hình mention

```json
{
  "action": "group-mention",
  "groupId": "group_id",
  "requireMention": true
}
```

> ⚠️ Tất cả các action trong nhóm này đều trả về `note: "Restart gateway..."`. Hãy chạy `openclaw gateway restart` sau khi thay đổi.

---

### 15. Tiện ích khác (3 actions)

#### `get-alias-list` — Danh sách biệt danh bạn bè

```json
{ "action": "get-alias-list" }
```

#### `get-related-friend-groups` — Nhóm chung với bạn

```json
{ "action": "get-related-friend-groups", "userId": "user_id" }
```

#### `get-multi-users-by-phones` — Tra cứu nhiều SĐT

```json
{
  "action": "get-multi-users-by-phones",
  "phoneNumbers": ["0912345678", "0987654321"]
}
```

---

## Luồng xử lý tin nhắn

### Tin nhắn đến (Inbound)

```
Zalo → zca-js event → monitor.ts
  │
  ├─ 1. Trích xuất context reply/quote
  │     → Nếu user reply tin nhắn, AI nhận được:
  │       [Replying to Tên_người_gửi: "nội dung tin nhắn gốc"]
  │
  ├─ 2. Kiểm tra quyền truy cập
  │     → denyFrom → dmPolicy/groupPolicy → allowFrom/allowUsers
  │
  ├─ 3. Mention gating (nếu trong nhóm)
  │     → Nếu requireMention=true và không @mention → buffer tin nhắn
  │     → Nếu @mention → đính kèm buffer cũ làm context
  │
  ├─ 4. Xử lý ảnh
  │     → Download ảnh nếu DM hoặc có @mention
  │     → Buffer ảnh từ tin nhắn không @mention
  │
  ├─ 5. Tập hợp context
  │     → Thông tin người gửi + tin nhắn buffer + media + quote
  │
  ├─ 6. Đóng gói envelope → gửi đến OpenClaw agent
  │
  └─ 7. Agent phản hồi → send.ts → Zalo
```

### Tin nhắn đi (Outbound)

```
Agent response → send.ts
  │
  ├─ 1. Parse markdown (nếu có)
  ├─ 2. Chuyển đổi sang Zalo TextStyle
  ├─ 3. Áp dụng urgency level
  ├─ 4. Đặt TTL (nếu có)
  └─ 5. Gửi qua zca-js API → Zalo
```

### Bộ nhớ đệm tin nhắn

- Lưu mapping `msgId ↔ cliMsgId` trong bộ nhớ (tối đa 500 entries)
- Dùng cho `add-reaction` và `undo-message` để tự tra cứu
- Chỉ hoạt động với tin nhắn sau khi bot khởi động
- Reset khi gateway restart

---

## Xử lý sự cố

### Bot không phản hồi trong nhóm

1. Kiểm tra `groupPolicy` — phải là `open` hoặc nhóm nằm trong `groups` config
2. Kiểm tra `requireMention` — nếu `true`, phải @mention bot
3. Kiểm tra `denyUsers` trong cấu hình nhóm

### Bot không nhận DM

1. Kiểm tra `dmPolicy` — `disabled` sẽ chặn tất cả
2. Nếu `allowlist`, kiểm tra user ID có trong `allowFrom` không
3. Nếu `pairing`, user cần gửi mã PIN trước

### Lỗi "Session expired"

```bash
openclaw channels login --channel opclaw-zalo
```

Quét lại QR code. Credentials tự động cập nhật.

### Bot không thấy reaction/undo

- `add-reaction` và `undo-message` cần `cliMsgId`
- Plugin tự tra cứu nhưng chỉ với tin nhắn sau lần khởi động gần nhất
- Nếu tin nhắn cũ, cung cấp `cliMsgId` thủ công

### Restart sau thay đổi config

Mọi thay đổi trong `openclaw.json` (thủ công hoặc qua bot config actions) cần:

```bash
openclaw gateway restart
```

### Kiểm tra trạng thái

```bash
openclaw status
```

---

*Plugin Version: 2.0.0 | zca-js: 2.1.2 | OpenClaw: ≥ 2026.2.0*
