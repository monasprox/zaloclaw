import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CREDENTIALS_PATH = join(homedir(), ".openclaw", "opclaw-zalo-credentials.json");

export type ZaloPersonalCredentials = {
  imei: string;
  cookie: unknown;
  userAgent: string;
  language?: string;
};

export function saveCredentials(data: ZaloPersonalCredentials): void {
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function loadCredentials(): ZaloPersonalCredentials | null {
  if (!existsSync(CREDENTIALS_PATH)) {
    return null;
  }
  try {
    const raw = readFileSync(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(raw) as ZaloPersonalCredentials;
  } catch {
    return null;
  }
}

export function deleteCredentials(): void {
  if (existsSync(CREDENTIALS_PATH)) {
    unlinkSync(CREDENTIALS_PATH);
  }
}

export function hasCredentials(): boolean {
  return existsSync(CREDENTIALS_PATH);
}

export function refreshCredentials(freshCookies: unknown): void {
  const existing = loadCredentials();
  if (!existing) return;
  existing.cookie = freshCookies;
  saveCredentials(existing);
}
