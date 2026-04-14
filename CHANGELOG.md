# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.0] — 2026-04-14

### Changed
- **Project restructure**: reorganized `src/` into domain-based modules (`channel/`, `client/`, `config/`, `tools/`, `parsing/`, `safety/`, `runtime/`, `features/`)
- **Status reporting**: `collectStatusIssues` is now synchronous — fixes crash in `openclaw status` when core spreads async return value
- **Image processing**: images in groups are only processed when bot is @mentioned; non-mention images are buffered for later context

### Fixed
- `collectStatusIssues` returned `Promise` (async) but core expected sync `StatusIssue[]` — caused `TypeError: Spread syntax requires ...iterable[Symbol.iterator]`
- Image-only messages in groups bypassed mention gate via `!hasMedia` check — bot responded to all images regardless of @mention
- Status scan reported "not logged in" even when bot was active — `collectStatusIssues` runs in CLI process where `apiInstance` is always null; now checks credentials on disk instead

### Added
- `README.md` with full documentation
- `LICENSE` (MIT)
- `CONTRIBUTING.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`
- `.editorconfig`, `.github/` templates and CI workflow
- Comprehensive `.gitignore`

## [1.0.0] — 2026-04-13

### Added
- Initial release as `opclaw-zalo` (renamed from `zalo-personal`)
- Full Zalo personal account integration via zca-js v2.1.2
- 130+ agent tool actions (messaging, friends, groups, polls, reminders, profile, catalogs, etc.)
- QR code login flow with credential persistence
- Group mention gating with per-group configuration
- DM access policies: open, pairing, allowlist, disabled
- Features: reaction-ack, quote-reply, read-receipts, sticker support, auto-unsend, message buffering
