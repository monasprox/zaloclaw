import { getApi, getCurrentUid } from "./zalo-client.js";

export interface StatusIssue {
  severity: "error" | "warning" | "info";
  message: string;
}

export async function collectZaloPersonalStatusIssues(): Promise<StatusIssue[]> {
  const issues: StatusIssue[] = [];

  const uid = getCurrentUid();
  if (!uid) {
    issues.push({ severity: "error", message: "Zalo Personal: not logged in" });
    return issues;
  }

  try {
    const api = await getApi();
    const userInfo = await api.getUserInfo(uid);
    const profile = (userInfo as any)?.changed_profiles?.[uid];
    if (!profile) {
      issues.push({ severity: "warning", message: "Zalo Personal: could not fetch profile" });
    }
  } catch (err) {
    issues.push({ severity: "error", message: `Zalo Personal API error: ${String(err)}` });
  }

  try {
    const api = await getApi();
    const ctx = api.getContext();
    const settings = ctx?.settings;
    if (settings?.features?.webChat === false) {
      issues.push({ severity: "warning", message: "Zalo Personal: web chat feature may be disabled" });
    }
  } catch {}

  return issues;
}
