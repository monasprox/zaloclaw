import { hasStoredCredentials } from "../client/zalo-client.js";
import type { ChannelStatusIssue } from "openclaw/plugin-sdk/channel-contract";

export function collectZaloClawStatusIssues(): ChannelStatusIssue[] {
  const issues: ChannelStatusIssue[] = [];

  if (!hasStoredCredentials()) {
    issues.push({
      channel: "zaloclaw",
      accountId: "default",
      kind: "auth",
      message: "zaloclaw: not logged in (no credentials — run: openclaw channels login zaloclaw)",
    });
  }

  return issues;
}
