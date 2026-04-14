import { getApiSync, getCurrentUid } from "./zalo-client.js";

export interface StatusIssue {
  severity: "error" | "warning" | "info";
  message: string;
}

export function collectOpclawZaloStatusIssues(): StatusIssue[] {
  const issues: StatusIssue[] = [];

  const uid = getCurrentUid();
  if (!uid) {
    issues.push({ severity: "error", message: "OpenClaw Zalo: not logged in" });
    return issues;
  }

  const api = getApiSync();
  if (!api) {
    issues.push({ severity: "warning", message: "OpenClaw Zalo: API not initialized" });
    return issues;
  }

  try {
    const ctx = api.getContext();
    const settings = ctx?.settings;
    if (settings?.features?.webChat === false) {
      issues.push({ severity: "warning", message: "OpenClaw Zalo: web chat feature may be disabled" });
    }
  } catch {}

  return issues;
}
