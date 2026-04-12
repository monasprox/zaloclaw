/**
 * Reaction Ack — thả reaction khi nhận tin nhắn (acknowledgment).
 *
 * zca-js API:
 *   api.addReaction(icon, dest)
 *   - icon: Reactions enum hoặc CustomReaction
 *   - dest: { data: { msgId, cliMsgId }, threadId, type } hoặc message object
 *
 * Scope control:
 *   - "all"            → react mọi tin nhắn
 *   - "dm-only"        → chỉ react DM
 *   - "group-mentions" → chỉ react khi bị @mention trong group
 *   - "off"            → tắt
 */

import { Reactions, ThreadType, type API } from "zca-js";

export type AckReactionScope = "all" | "dm-only" | "group-mentions" | "off";

export interface ReactionAckConfig {
  /** Reaction icon to send. Default: Reactions.LIKE */
  icon: Reactions;
  /** Scope control */
  scope: AckReactionScope;
  /** Remove reaction after bot replies. Default: false */
  removeAfterReply: boolean;
}

export const DEFAULT_REACTION_ACK_CONFIG: ReactionAckConfig = {
  icon: Reactions.LIKE,
  scope: "group-mentions",
  removeAfterReply: false,
};

export interface ReactionTarget {
  msgId: string;
  cliMsgId: string;
  threadId: string;
  type: ThreadType;
  isGroup: boolean;
  wasMentioned: boolean;
}

/**
 * Determine if we should send an ack reaction for this message.
 */
export function shouldAckReact(target: ReactionTarget, config: ReactionAckConfig): boolean {
  if (config.scope === "off") return false;
  if (config.scope === "all") return true;
  if (config.scope === "dm-only") return !target.isGroup;
  if (config.scope === "group-mentions") {
    return !target.isGroup || target.wasMentioned;
  }
  return false;
}

/**
 * Send ack reaction. Fire-and-forget — errors are logged, never thrown.
 */
export async function sendAckReaction(
  api: API,
  target: ReactionTarget,
  config: ReactionAckConfig,
): Promise<void> {
  if (!shouldAckReact(target, config)) return;

  try {
    await api.addReaction(config.icon, {
      data: { msgId: target.msgId, cliMsgId: target.cliMsgId },
      threadId: target.threadId,
      type: target.type,
    });
  } catch (err) {
    console.warn(`[reaction-ack] Failed to add reaction:`, err);
  }
}

/**
 * Remove ack reaction (set NONE). Used when removeAfterReply is true.
 */
export async function removeAckReaction(
  api: API,
  target: ReactionTarget,
): Promise<void> {
  try {
    await api.addReaction(Reactions.NONE, {
      data: { msgId: target.msgId, cliMsgId: target.cliMsgId },
      threadId: target.threadId,
      type: target.type,
    });
  } catch (err) {
    console.warn(`[reaction-ack] Failed to remove reaction:`, err);
  }
}
