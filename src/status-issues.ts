import { getApiSync, getCurrentUid, isAuthenticated, hasStoredCredentials } from "./zalo-client.js";

export interface StatusIssue {
  severity: "error" | "warning" | "info";
  message: string;
}

export function collectOpclawZaloStatusIssues(): StatusIssue[] {
  const issues: StatusIssue[] = [];

  const api = getApiSync();
  const uid = getCurrentUid();
  const hasCreds = hasStoredCredentials();

  // API instance is active — bot is working
  if (api) {
    if (!uid) {
      // Logged in but uid not yet resolved (async fetch may still be in progress)
      issues.push({ severity: "info", message: "opclaw-zalo: connected (uid resolving...)" });
    }
    try {
      const ctx = api.getContext();
      const settings = ctx?.settings;
      if (settings?.features?.webChat === false) {
        issues.push({ severity: "warning", message: "opclaw-zalo: web chat feature may be disabled" });
      }
    } catch {}
    return issues;
  }

  // No API instance but has saved credentials — will auto-login on first message
  if (hasCreds) {
    issues.push({ severity: "info", message: "opclaw-zalo: has credentials (not yet connected)" });
    return issues;
  }

  // No credentials at all
  issues.push({ severity: "error", message: "opclaw-zalo: not logged in (no credentials)" });
  return issues;
}
