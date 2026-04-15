import type { PluginRuntime } from "openclaw/plugin-sdk/channel-plugin-common";

let runtime: PluginRuntime | null = null;

export function setZaloClawRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getZaloClawRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("ZaloClaw runtime not initialized");
  }
  return runtime;
}
