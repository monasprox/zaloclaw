import { getApi, getCurrentUid } from "./zalo-client.js";

export interface ProbeResult {
  ok: boolean;
  uid?: string;
  displayName?: string;
  error?: string;
}

export async function probeZaloPersonal(): Promise<ProbeResult> {
  try {
    const api = await getApi();
    const uid = getCurrentUid();
    if (!uid) return { ok: false, error: "Not logged in" };

    const userInfo = await api.getUserInfo(uid);
    const profile = (userInfo as any)?.changed_profiles?.[uid];
    const displayName = profile?.displayName || profile?.zaloName || uid;

    return { ok: true, uid, displayName };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
