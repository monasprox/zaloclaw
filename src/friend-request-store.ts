import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface PendingFriendRequest {
  fromUid: string;
  message: string;
  src?: number;
  receivedAt: number;
}

const STORE_PATH = join(homedir(), ".openclaw", "zalo-friend-requests.json");

let cache: PendingFriendRequest[] | null = null;

function loadRequests(): PendingFriendRequest[] {
  if (cache !== null) return cache;
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    cache = JSON.parse(raw);
    return cache!;
  } catch {
    cache = [];
    return cache;
  }
}

function saveRequests(requests: PendingFriendRequest[]): void {
  cache = requests;
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(requests, null, 2));
}

export function addPendingRequest(fromUid: string, message: string, src?: number): void {
  const requests = loadRequests().filter((r) => r.fromUid !== fromUid);
  requests.push({ fromUid, message, src, receivedAt: Date.now() });
  saveRequests(requests);
}

export function removePendingRequest(fromUid: string): void {
  const requests = loadRequests().filter((r) => r.fromUid !== fromUid);
  saveRequests(requests);
}

export function getPendingRequests(): PendingFriendRequest[] {
  return loadRequests();
}

export function clearPendingRequests(): void {
  saveRequests([]);
}
