/**
 * Group Event Handler — welcome, leave, kick, admin alerts.
 *
 * zca-js listener: api.listener.on("group_event", callback)
 * Event types handled:
 *   JOIN          → welcome message
 *   LEAVE         → leave notification
 *   REMOVE_MEMBER → kick notification
 *   ADD_ADMIN     → admin promote notification
 *   REMOVE_ADMIN  → admin demote notification
 *
 * Config (per-group or global fallback):
 *   groupEvents.enabled         — master switch (default: false)
 *   groupEvents.welcome         — enable welcome on JOIN (default: true)
 *   groupEvents.leaveAlert      — enable alert on LEAVE/REMOVE_MEMBER (default: true)
 *   groupEvents.adminAlert      — enable alert on ADD_ADMIN/REMOVE_ADMIN (default: false)
 *   groupEvents.welcomeTemplate — custom welcome message ({name}, {groupName})
 *   groupEvents.leaveTemplate   — custom leave message ({name}, {groupName})
 *   groupEvents.kickTemplate    — custom kick message ({name}, {groupName})
 *
 * No API is consumed on event arrival — only on bot response (sendMessage).
 */

import { GroupEventType, type API } from "zca-js";

export interface GroupEventsConfig {
  /** Master switch. Default: false */
  enabled?: boolean;
  /** Send welcome on JOIN. Default: true */
  welcome?: boolean;
  /** Send alert on LEAVE / REMOVE_MEMBER. Default: true */
  leaveAlert?: boolean;
  /** Send alert on ADD_ADMIN / REMOVE_ADMIN. Default: false */
  adminAlert?: boolean;
  /** Welcome message template. Variables: {name}, {groupName} */
  welcomeTemplate?: string;
  /** Leave message template. Variables: {name}, {groupName} */
  leaveTemplate?: string;
  /** Kick message template. Variables: {name}, {groupName} */
  kickTemplate?: string;
  /** Admin promote template. Variables: {name}, {groupName} */
  adminAddTemplate?: string;
  /** Admin demote template. Variables: {name}, {groupName} */
  adminRemoveTemplate?: string;
}

const DEFAULTS: Required<GroupEventsConfig> = {
  enabled: false,
  welcome: true,
  leaveAlert: true,
  adminAlert: false,
  welcomeTemplate: "👋 Chào mừng {name} đã tham gia nhóm {groupName}!",
  leaveTemplate: "👋 {name} đã rời nhóm {groupName}.",
  kickTemplate: "🚫 {name} đã bị xóa khỏi nhóm {groupName}.",
  adminAddTemplate: "⭐ {name} được thêm làm quản trị viên nhóm {groupName}.",
  adminRemoveTemplate: "🔻 {name} bị thu hồi quyền quản trị viên nhóm {groupName}.",
};

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function mergeConfig(cfg?: GroupEventsConfig): Required<GroupEventsConfig> {
  return { ...DEFAULTS, ...cfg };
}

export interface GroupEventContext {
  api: API;
  config?: GroupEventsConfig;
  log?: (msg: string) => void;
}

/**
 * Handle a single group_event from zca-js.
 * Call this inside: api.listener.on("group_event", (event) => handleGroupEvent(event, ctx))
 */
export async function handleGroupEvent(event: any, ctx: GroupEventContext): Promise<void> {
  const cfg = mergeConfig(ctx.config);
  if (!cfg.enabled) return;

  const type: GroupEventType = event.type;
  const groupId: string = event.threadId ?? event.groupId ?? "";
  const groupName: string = event.data?.groupName ?? event.data?.name ?? groupId;

  // Extract affected member(s)
  const memberIds: string[] = event.data?.members
    ? (Array.isArray(event.data.members)
        ? event.data.members.map((m: any) => String(m.id ?? m.userId ?? m.uid ?? m))
        : [String(event.data.members)])
    : event.data?.fromUid
      ? [String(event.data.fromUid)]
      : [];

  const memberName: string =
    event.data?.members?.[0]?.dName ??
    event.data?.members?.[0]?.name ??
    event.data?.dName ??
    event.data?.fromName ??
    memberIds[0] ??
    "Thành viên";

  const vars = { name: memberName, groupName };

  let message: string | null = null;

  switch (type) {
    case GroupEventType.JOIN:
      if (cfg.welcome) {
        message = renderTemplate(cfg.welcomeTemplate, vars);
      }
      break;

    case GroupEventType.LEAVE:
      if (cfg.leaveAlert) {
        message = renderTemplate(cfg.leaveTemplate, vars);
      }
      break;

    case GroupEventType.REMOVE_MEMBER:
      if (cfg.leaveAlert) {
        message = renderTemplate(cfg.kickTemplate, vars);
      }
      break;

    case GroupEventType.ADD_ADMIN:
      if (cfg.adminAlert) {
        message = renderTemplate(cfg.adminAddTemplate, vars);
      }
      break;

    case GroupEventType.REMOVE_ADMIN:
      if (cfg.adminAlert) {
        message = renderTemplate(cfg.adminRemoveTemplate, vars);
      }
      break;

    default:
      // JOIN_REQUEST, UPDATE_SETTING, UPDATE_AVATAR, etc. — silently ignored
      break;
  }

  if (!message || !groupId) return;

  ctx.log?.(`[group-event] ${type} in ${groupId} → sending: ${message}`);

  try {
    await ctx.api.sendMessage(
      { msg: message, mentions: [] },
      groupId,
      1, // ThreadType.Group
    );
  } catch (err) {
    ctx.log?.(`[group-event] sendMessage failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
