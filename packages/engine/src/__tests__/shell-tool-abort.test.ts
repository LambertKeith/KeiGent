import { describe, expect, it } from "vitest";
import { shellTool } from "../tools/impl/system.js";
import type { ToolContext } from "../tools/types.js";

function ctx(signal?: AbortSignal): ToolContext {
  return {
    workspace: process.cwd(),
    browser: null,
    approval: { request: async () => true },
    task: { goal: "Run shell", profile: "auto" },
    headless: true,
    signal,
  };
}

describe("shell tool AbortSignal handling", () => {
  it("kills a running shell command when the parent signal aborts", async () => {
    const controller = new AbortController();
    const startedAt = Date.now();
    const pending = shellTool.execute(
      { command: "node -e \"setTimeout(() => {}, 1000)\"" },
      ctx(controller.signal),
    );

    setTimeout(() => controller.abort(), 10);
    const result = await pending;

    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("aborted");
  });
});
