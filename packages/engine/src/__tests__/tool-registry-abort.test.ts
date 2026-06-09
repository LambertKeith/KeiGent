import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import type { ToolContext, ToolDef } from "../tools/types.js";

function ctx(signal?: AbortSignal): ToolContext {
  return {
    workspace: "/tmp/workspace",
    browser: null,
    approval: { request: vi.fn(async () => true) },
    task: { goal: "Do it", profile: "auto" },
    headless: true,
    signal,
  };
}

function tool(execute: ToolDef["execute"], timeoutMs = 1_000): ToolDef {
  return {
    name: "slow_tool",
    description: "slow",
    parameters: {},
    permission: "readonly",
    riskLevel: "R0",
    sideEffect: "none",
    reversible: true,
    timeoutMs,
    execute,
  };
}

describe("ToolRegistry AbortSignal handling", () => {
  it("does not start a tool when the parent signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const execute = vi.fn(async () => ({ content: "ran", isError: false }));
    const registry = new ToolRegistry().register(tool(execute));

    const result = await registry.execute("slow_tool", {}, ctx(controller.signal));

    expect(execute).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content).toContain("aborted");
  });

  it("returns promptly when the parent signal aborts during tool execution", async () => {
    const controller = new AbortController();
    const execute = vi.fn(() => new Promise<never>(() => {}));
    const registry = new ToolRegistry().register(tool(execute, 5_000));
    const startedAt = Date.now();

    const pending = registry.execute("slow_tool", {}, ctx(controller.signal));
    controller.abort();
    const result = await pending;

    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(execute).toHaveBeenCalledOnce();
    expect(result.isError).toBe(true);
    expect(result.content).toContain("aborted");
  });
});
