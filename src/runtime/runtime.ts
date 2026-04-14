import type { PluginRuntime } from "openclaw/plugin-sdk/channel-plugin-common";

let runtime: PluginRuntime | null = null;

export function setOpclawZaloRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getOpclawZaloRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("OpclawZalo runtime not initialized");
  }
  return runtime;
}
