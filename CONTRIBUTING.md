# Contributing to zaloclaw

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/monasprox/zaloclaw.git
cd zaloclaw
npm install
```

No build step is required — OpenClaw loads `.ts` files directly via its runtime.

### Type Checking

```bash
npm run typecheck
```

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<short-name>` | `feat/voice-messages` |
| Bug fix | `fix/<short-name>` | `fix/mention-gate` |
| Refactor | `refactor/<short-name>` | `refactor/send-module` |
| Docs | `docs/<short-name>` | `docs/config-examples` |

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add voice message support
fix: gate images on @mention in groups
refactor: split tool.ts into domain modules
docs: add configuration examples
chore: update dependencies
```

## Pull Request Checklist

- [ ] `npm run typecheck` passes
- [ ] Tested locally with `openclaw gateway restart`
- [ ] Commit messages follow conventional format
- [ ] Updated `CHANGELOG.md` if user-facing
- [ ] No credentials, tokens, or secrets in the diff

## Project Structure

```
src/
  channel/    → Channel lifecycle, message processing, sending
  client/     → Zalo API client, credentials, account management
  config/     → Config schema and runtime config management
  tools/      → Agent tool definitions and execution
  features/   → Standalone features (reactions, stickers, etc.)
  parsing/    → Mention parsing, text processing
  safety/     → Output filtering, thread sandboxing
  runtime/    → Runtime state, types, status reporting
```

## Reporting Issues

Use [GitHub Issues](https://github.com/monasprox/zaloclaw/issues) with the provided templates.
