/**
 * Passive Group Message Collector
 *
 * Stores ALL group messages to oc_verbatim (Elasticsearch) WITHOUT calling AI.
 * Zero API cost — pure storage only.
 *
 * Schema matches existing oc_verbatim structure so verbatim_recall works
 * transparently across DM (AI-handled) and group (passively collected).
 *
 * turn_type = "passive" distinguishes these from AI-exchange turns.
 */

import { randomUUID } from "crypto";

const ES_URL = "http://localhost:19200";
const INDEX = "oc_verbatim";

export interface PassiveCollectorOptions {
  /** Group ID */
  groupId: string;
  /** Sender's Zalo user ID */
  senderId: string;
  /** Sender's display name */
  senderName: string;
  /** Message text content */
  content: string;
  /** Message ID from Zalo */
  msgId?: string;
  /** Wing identifier, e.g. "zaloclaw" */
  wing?: string;
  /** Suppress errors (default: true — never block message flow) */
  silent?: boolean;
}

/**
 * Store a single group message passively to oc_verbatim.
 * Call this BEFORE the mention check — runs fire-and-forget.
 */
export async function collectGroupMessage(opts: PassiveCollectorOptions): Promise<void> {
  const {
    groupId,
    senderId,
    senderName,
    content,
    msgId,
    wing = "zaloclaw",
    silent = true,
  } = opts;

  if (!content?.trim()) return;

  const doc = {
    id: randomUUID(),
    wing,
    channel: "zaloclaw",
    author_id: senderId,
    author_name: senderName,
    sender_id: senderId,
    user_message: content,
    bot_response: null,
    group_id: groupId,
    message_id: msgId ?? null,
    turn_type: "passive",          // distinguish from AI-exchange turns
    timestamp: new Date().toISOString(),
    word_count_user: content.split(/\s+/).filter(Boolean).length,
    word_count_bot: 0,
    user_msg_len: content.length,
    bot_msg_len: 0,
    has_code: /```/.test(content),
    language: "vi",
  };

  try {
    const res = await fetch(`${ES_URL}/${INDEX}/_doc/${doc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    if (!res.ok && !silent) {
      const err = await res.text();
      throw new Error(`ES store failed: ${res.status} ${err}`);
    }
  } catch (err) {
    if (!silent) throw err;
    // silent mode: swallow errors — never block message flow
  }
}
