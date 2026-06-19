// Per-containerId registry of in-flight TurnBroadcaster instances.
//
// One broadcaster per containerId at a time: POST /messages checks for an
// existing entry and 409s if one is in flight. The registry self-cleans via
// the broadcaster's onFinalize callback, which calls removeBroadcaster().

import { TurnBroadcaster } from "./turnBroadcaster";

const broadcasters = new Map<string, TurnBroadcaster>();

export function getBroadcaster(containerId: string): TurnBroadcaster | undefined {
  return broadcasters.get(containerId);
}

export function setBroadcaster(containerId: string, b: TurnBroadcaster): void {
  broadcasters.set(containerId, b);
}

export function removeBroadcaster(containerId: string): void {
  broadcasters.delete(containerId);
}

// Test-only: clear all registered broadcasters. Production code never calls
// this — broadcasters self-clean via onFinalize.
export function __resetBroadcastersForTests(): void {
  broadcasters.clear();
}
