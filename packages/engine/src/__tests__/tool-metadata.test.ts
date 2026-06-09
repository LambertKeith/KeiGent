import { describe, expect, it } from "vitest";
import { buildDefaultRegistry } from "../tools/index.js";

describe("built-in tool governance metadata", () => {
  it("declares risk metadata for every default tool", () => {
    const registry = buildDefaultRegistry({ includeComputer: true });

    for (const tool of registry.list()) {
      expect(tool.riskLevel, tool.name).toMatch(/^R[0-5]$/);
      expect(["none", "local", "external"], tool.name).toContain(tool.sideEffect);
      expect(typeof tool.reversible, tool.name).toBe("boolean");
    }
  });

  it("classifies shell and computer input as approval-required R5 actions", () => {
    const registry = buildDefaultRegistry({ includeComputer: true });

    expect(registry.get("shell")).toMatchObject({ permission: "dangerous", riskLevel: "R5", sideEffect: "local", reversible: false });
    expect(registry.get("mouse")).toMatchObject({ permission: "dangerous", riskLevel: "R5", sideEffect: "external", reversible: false });
    expect(registry.get("keyboard")).toMatchObject({ permission: "dangerous", riskLevel: "R5", sideEffect: "external", reversible: false });
  });

  it("classifies workspace write and readonly tools separately", () => {
    const registry = buildDefaultRegistry();

    expect(registry.get("file_write")).toMatchObject({ permission: "write", riskLevel: "R1", sideEffect: "local", reversible: true });
    expect(registry.get("file_read")).toMatchObject({ permission: "readonly", riskLevel: "R0", sideEffect: "none", reversible: true });
    expect(registry.get("web_fetch")).toMatchObject({ permission: "readonly", riskLevel: "R0", sideEffect: "none", reversible: true });
  });

  it("classifies HTTP requests as R3 external side effects and memory recall as readonly", () => {
    const registry = buildDefaultRegistry();

    expect(registry.get("http_request")).toMatchObject({
      permission: "execute",
      riskLevel: "R3",
      sideEffect: "external",
      reversible: false,
    });
    expect(registry.get("memory_recall")).toMatchObject({
      permission: "readonly",
      riskLevel: "R0",
      sideEffect: "none",
      reversible: true,
    });
  });
});
