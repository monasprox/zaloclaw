import { hasStoredCredentials } from "../client/zalo-client.js";

export interface StatusIssue {
  severity: "error" | "warning" | "info";
  message: string;
}

export function collectOpclawZaloStatusIssues(): StatusIssue[] {
  const issues: StatusIssue[] = [];

  if (!hasStoredCredentials()) {
    issues.push({ severity: "error", message: "opclaw-zalo: not logged in (no credentials — run: openclaw channels login opclaw-zalo)" });
  }

  return issues;
}
