import { hasStoredCredentials } from "../client/zalo-client.js";
import type { ChannelStatusIssue } from "openclaw/plugin-sdk/channel-contract";

export function collectOpclawZaloStatusIssues(): ChannelStatusIssue[] {
  const issues: ChannelStatusIssue[] = [];

  if (!hasStoredCredentials()) {
    issues.push({
      channel: "opclaw-zalo",
      accountId: "default",
      kind: "auth",
      message: "opclaw-zalo: not logged in (no credentials — run: openclaw channels login opclaw-zalo)",
    });
  }

  return issues;
}
