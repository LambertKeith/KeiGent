import { describe, expect, it } from "vitest";
import { hashForSection, parseHashRoute } from "../app/hash-route.js";

describe("Workbench hash routing", () => {
  it("routes run detail links to the runs section with a selected run id", () => {
    expect(parseHashRoute("#runs/run_noop")).toEqual({
      section: "runs",
      selectedRunId: "run_noop",
    });
  });

  it("routes real-world eval links to the settings section with a dataset id", () => {
    expect(parseHashRoute("#eval/real-world/local-real-task-v1")).toEqual({
      section: "settings",
      evalDatasetId: "local-real-task-v1",
      evalKind: "real-world",
    });
  });

  it("routes top-level section hashes and falls back to runs", () => {
    expect(parseHashRoute("#chat")).toEqual({ section: "chat" });
    expect(parseHashRoute("#conversation")).toEqual({ section: "chat" });
    expect(parseHashRoute("#skills")).toEqual({ section: "skills" });
    expect(parseHashRoute("#unknown/path")).toEqual({ section: "chat" });
    expect(parseHashRoute("")).toEqual({ section: "chat" });
  });

  it("generates stable section hashes for nav buttons", () => {
    expect(hashForSection("chat")).toBe("#chat");
    expect(hashForSection("runs")).toBe("#runs");
    expect(hashForSection("settings")).toBe("#settings");
  });
});
