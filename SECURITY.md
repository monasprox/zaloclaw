# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x     | ✅        |
| < 2.0   | ❌        |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Email: monasprox@users.noreply.github.com

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive a response within 72 hours. Critical issues will be patched and released as soon as possible.

## Scope

This plugin handles:
- Zalo API credentials (cookies, IMEI, user agent)
- Message content routing between Zalo and OpenClaw
- User identity resolution

Security concerns related to credential storage, message injection, or unauthorized access are in scope.
