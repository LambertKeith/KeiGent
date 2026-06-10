import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "../app/nav.js";

describe("app navigation", () => {
  it("exposes the skill governance surface as a first-class section", () => {
    expect(NAV_ITEMS.map((item) => item.id)).toEqual([
      "runs",
      "conversation",
      "dashboard",
      "skills",
      "config",
    ]);
  });
});
