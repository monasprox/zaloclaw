# Đóng góp cho zaloclaw

Cảm ơn bạn đã quan tâm đóng góp! Đây là hướng dẫn để bắt đầu.

## Thiết lập môi trường phát triển

```bash
git clone https://github.com/monasprox/zaloclaw.git
cd zaloclaw
npm install
```

Không cần bước build — OpenClaw tải trực tiếp file `.ts` qua runtime.

### Kiểm tra kiểu

```bash
npm run typecheck
```

## Quy tắc đặt tên nhánh

| Loại | Mẫu | Ví dụ |
|------|---------|---------|
| Tính năng | `feat/<tên-ngắn>` | `feat/voice-messages` |
| Sửa lỗi | `fix/<tên-ngắn>` | `fix/mention-gate` |
| Tái cấu trúc | `refactor/<tên-ngắn>` | `refactor/send-module` |
| Tài liệu | `docs/<tên-ngắn>` | `docs/config-examples` |

## Quy ước commit

Tuân theo [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: thêm hỗ trợ tin nhắn thoại
fix: kiểm soát ảnh qua @mention trong nhóm
refactor: tách tool.ts thành các module theo domain
docs: thêm ví dụ cấu hình
chore: cập nhật dependencies
```

## Checklist Pull Request

- [ ] `npm run typecheck` thành công
- [ ] Đã kiểm tra local với `openclaw gateway restart`
- [ ] Commit messages tuân theo quy ước conventional
- [ ] Đã cập nhật `CHANGELOG.md` nếu ảnh hưởng người dùng
- [ ] Không có credentials, tokens, hoặc secrets trong diff

## Cấu trúc dự án

```
src/
  channel/    → Vòng đời kênh, xử lý tin nhắn, gửi tin
  client/     → API client Zalo, thông tin đăng nhập, quản lý tài khoản
  config/     → Schema cấu hình và quản lý cấu hình runtime
  tools/      → Định nghĩa và thực thi công cụ agent
  features/   → Tính năng độc lập (reactions, stickers, v.v.)
  parsing/    → Phân tích mention, xử lý văn bản
  safety/     → Lọc đầu ra, sandbox thread
  runtime/    → Trạng thái runtime, kiểu, báo cáo trạng thái
```

## Báo cáo lỗi

Sử dụng [GitHub Issues](https://github.com/monasprox/zaloclaw/issues) với các template có sẵn.
