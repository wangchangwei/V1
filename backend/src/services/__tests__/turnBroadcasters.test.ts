import { afterEach, describe, expect, it } from "vitest";
import {
  getBroadcaster,
  setBroadcaster,
  removeBroadcaster,
  __resetBroadcastersForTests,
} from "../turnBroadcasters";
import { TurnBroadcaster } from "../turnBroadcaster";
import type { Message } from "../chatSessions";

const CID = "reg-cid";
const userMsg: Message = {
  id: "u-1",
  role: "user",
  content: "hi",
  timestamp: "2024-01-01T00:00:00.000Z",
};

function makeBroadcaster(cid: string) {
  return new TurnBroadcaster(cid, userMsg, "asst-1", () => {
    removeBroadcaster(cid);
  });
}

afterEach(() => {
  __resetBroadcastersForTests();
});

describe("turnBroadcasters registry", () => {
  it("getBroadcaster returns undefined when not set", () => {
    expect(getBroadcaster(CID)).toBeUndefined();
  });

  it("setBroadcaster + getBroadcaster round-trips", () => {
    const b = makeBroadcaster(CID);
    setBroadcaster(CID, b);
    expect(getBroadcaster(CID)).toBe(b);
  });

  it("removeBroadcaster drops the entry", () => {
    const b = makeBroadcaster(CID);
    setBroadcaster(CID, b);
    removeBroadcaster(CID);
    expect(getBroadcaster(CID)).toBeUndefined();
  });

  it("setBroadcaster overwrites prior entry for the same containerId", () => {
    const first = makeBroadcaster(CID);
    const second = makeBroadcaster(CID);
    setBroadcaster(CID, first);
    setBroadcaster(CID, second);
    expect(getBroadcaster(CID)).toBe(second);
  });
});
