import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "../app/nav.js";

describe("app navigation", () => {
  it("uses a chat-first information architecture", () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual([
      "chat",
      "runs",
      "skills",
      "settings",
    ]);
    expect(NAV_ITEMS.map((item) => item.label)).not.toContain("Conversation");
    const chat = NAV_ITEMS.find((item) => item.id === "chat");
    expect(chat?.description).toContain("Start");
    expect(chat?.description).toContain("run");
    expect(chat?.description).not.toMatch(/raw|inspector|workflow_event/i);
  });
});
