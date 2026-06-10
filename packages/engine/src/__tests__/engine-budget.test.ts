import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoopProfile, LoopState, ProgressEvent, SkillContext, StateCapture, Task } from "../types.js";
import { ToolRegistry } from "../tools/registry.js";
import type { ToolDef } from "../tools/types.js";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
}));

vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
  return { ...actual, complete: mocks.complete };
});

const { LoopEngine } = await import("../engine.js");

const task: Task = { goal: "Run budgeted tools", profile: "convergent-exec" };

function skillContext(): SkillContext {
  return { metas: [], matched: [], async loadBody() { return null; } };
}

function profile(): LoopProfile {
  return {
    name: "convergent-exec",
    attention: {
      reset: vi.fn(),
      matchSkills: vi.fn(() => []),
      renderInjection: vi.fn(async () => ""),
      buildContext: vi.fn(async () => ({ messages: [] })),
    },
    terminate: { allowEarlyTextExit: false, shouldStop: vi.fn((_state: LoopState) => false) },
    verify: { check: vi.fn(async () => ({ passed: true, evidence: "ok" })) },
    recover: { reset: vi.fn(), handle: vi.fn(async () => ({ kind: "retry" })) },
    memory: { maybePersist: vi.fn(async () => undefined) },
  } as unknown as LoopProfile;
}

const stateCapture: StateCapture = {
  async capture() {
    return { raw: {} };
  },
};

function tool(name: string, execute: ToolDef["execute"]): ToolDef {
  return {
    name,
    description: name,
    parameters: {},
    permission: "readonly",
    riskLevel: "R0",
    sideEffect: "none",
    reversible: true,
    execute,
  };
}

describe("LoopEngine budget controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates provider usage from model responses into the result and trajectory", async () => {
    mocks.complete.mockResolvedValue({
      stopReason: "end",
      content: [{ type: "text", text: "done" }],
      api: "openai-completions",
      provider: "test",
      model: "test-model",
      usage: {
        input: 100,
        output: 20,
        cacheRead: 5,
        cacheWrite: 1,
        totalTokens: 126,
        cost: { input: 0.01, output: 0.02, cacheRead: 0.001, cacheWrite: 0.002, total: 0.033 },
      },
      timestamp: Date.now(),
    });
    const usageProfile = profile();
    usageProfile.terminate.allowEarlyTextExit = true;
    const engine = new LoopEngine({
      model: { api: "openai-completions", provider: "test", id: "test-model" } as never,
      apiKey: "test",
      maxIterations: 3,
      registry: new ToolRegistry(),
    });

    const result = await engine.run(task, skillContext(), usageProfile, stateCapture, []);

    expect(result.providerUsage).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 5,
      cacheWriteTokens: 1,
      totalTokens: 126,
      costUsd: 0.033,
      costStatus: "priced",
    });
    expect(result.trajectory.providerUsage).toEqual(result.providerUsage);
  });

  it("returns budget_exceeded after a priced provider response exceeds maxProviderCostUsd", async () => {
    mocks.complete.mockResolvedValue({
      stopReason: "end",
      content: [{ type: "text", text: "expensive result" }],
      api: "openai-completions",
      provider: "test",
      model: "test-model",
      usage: {
        input: 100,
        output: 20,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 120,
        cost: { input: 0.03, output: 0.04, cacheRead: 0, cacheWrite: 0, total: 0.07 },
      },
      timestamp: Date.now(),
    });
    const usageProfile = profile();
    usageProfile.terminate.allowEarlyTextExit = true;
    const engine = new LoopEngine({
      model: { api: "openai-completions", provider: "test", id: "test-model" } as never,
      apiKey: "test",
      maxIterations: 3,
      maxProviderCostUsd: 0.05,
      registry: new ToolRegistry(),
    });

    const result = await engine.run(task, skillContext(), usageProfile, stateCapture, []);

    expect(result.exitReason).toBe("budget_exceeded");
    expect(result.failure).toMatchObject({ code: "budget_exceeded", layer: "budget" });
    expect(result.providerUsage).toMatchObject({ costUsd: 0.07, costStatus: "priced" });
    expect(result.finalResponse).toContain("maxProviderCostUsd");
  });

  it("does not enforce maxProviderCostUsd when provider pricing is not configured", async () => {
    mocks.complete.mockResolvedValue({
      stopReason: "end",
      content: [{ type: "text", text: "usage without pricing" }],
      api: "openai-completions",
      provider: "test",
      model: "test-model",
      usage: {
        input: 100,
        output: 20,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 120,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      timestamp: Date.now(),
    });
    const usageProfile = profile();
    usageProfile.terminate.allowEarlyTextExit = true;
    const engine = new LoopEngine({
      model: { api: "openai-completions", provider: "test", id: "test-model" } as never,
      apiKey: "test",
      maxIterations: 3,
      maxProviderCostUsd: 0.05,
      registry: new ToolRegistry(),
    });

    const result = await engine.run(task, skillContext(), usageProfile, stateCapture, []);

    expect(result.exitReason).toBe("success");
    expect(result.providerUsage).toMatchObject({ costUsd: 0, costStatus: "pricing_not_configured" });
  });

  it("stops before executing tool calls beyond maxToolCalls", async () => {
    mocks.complete.mockResolvedValue({
      stopReason: "toolUse",
      content: [
        { type: "toolCall", id: "call-1", name: "first", arguments: {} },
        { type: "toolCall", id: "call-2", name: "second", arguments: {} },
      ],
      api: "openai-completions",
      provider: "test",
      model: "test-model",
      usage: {},
      timestamp: Date.now(),
    });
    const first = vi.fn(async () => ({ content: "first ok", isError: false }));
    const second = vi.fn(async () => ({ content: "second ok", isError: false }));
    const registry = new ToolRegistry().register(tool("first", first)).register(tool("second", second));
    const events: ProgressEvent[] = [];
    const engine = new LoopEngine({
      model: { api: "openai-completions", provider: "test", id: "test-model" } as never,
      apiKey: "test",
      maxIterations: 3,
      maxToolCalls: 1,
      registry,
    });

    const result = await engine.run(task, skillContext(), profile(), stateCapture, [], (event) => events.push(event));

    expect(result.exitReason).toBe("budget_exceeded");
    expect(result.failure).toMatchObject({ code: "budget_exceeded", layer: "budget" });
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    expect(result.totalToolCalls).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ kind: "done", exitReason: "budget_exceeded" }));
  });

  it("stops on maxWallTimeMs before starting another iteration", async () => {
    mocks.complete.mockResolvedValue({
      stopReason: "toolUse",
      content: [{ type: "toolCall", id: "call-1", name: "first", arguments: {} }],
      api: "openai-completions",
      provider: "test",
      model: "test-model",
      usage: {},
      timestamp: Date.now(),
    });
    const registry = new ToolRegistry().register(tool("first", async () => ({ content: "ok", isError: false })));
    const engine = new LoopEngine({
      model: { api: "openai-completions", provider: "test", id: "test-model" } as never,
      apiKey: "test",
      maxIterations: 3,
      maxWallTimeMs: 0,
      registry,
    });

    const result = await engine.run(task, skillContext(), profile(), stateCapture, []);

    expect(result.exitReason).toBe("budget_exceeded");
    expect(result.failure).toMatchObject({ code: "budget_exceeded", layer: "budget" });
    expect(result.iterations).toBe(1);
  });

  it("stops before recovery when maxRecoveryAttempts is exhausted", async () => {
    mocks.complete.mockResolvedValue({
      stopReason: "toolUse",
      content: [{ type: "toolCall", id: "call-1", name: "request_verification", arguments: { checkpoint_desc: "done" } }],
      api: "openai-completions",
      provider: "test",
      model: "test-model",
      usage: {},
      timestamp: Date.now(),
    });
    const recoveringProfile = profile();
    const recoverHandle = vi.fn(async () => ({ kind: "retry" as const }));
    recoveringProfile.verify.check = vi.fn(async () => ({ passed: false, evidence: "not done" }));
    recoveringProfile.recover.handle = recoverHandle;
    const engine = new LoopEngine({
      model: { api: "openai-completions", provider: "test", id: "test-model" } as never,
      apiKey: "test",
      maxIterations: 3,
      maxRecoveryAttempts: 0,
      registry: new ToolRegistry(),
    });

    const result = await engine.run(task, skillContext(), recoveringProfile, stateCapture, []);

    expect(result.exitReason).toBe("budget_exceeded");
    expect(result.failure).toMatchObject({ code: "budget_exceeded", layer: "budget" });
    expect(recoverHandle).not.toHaveBeenCalled();
  });

  it("stops before an LLM request when maxTokenEstimate would be exceeded", async () => {
    const tokenHeavyProfile = profile();
    tokenHeavyProfile.attention.buildContext = vi.fn(async () => ({
      messages: [{ role: "user" as const, content: "x".repeat(400), timestamp: Date.now() }],
    }));
    const engine = new LoopEngine({
      model: { api: "openai-completions", provider: "test", id: "test-model" } as never,
      apiKey: "test",
      maxIterations: 3,
      maxTokenEstimate: 10,
      registry: new ToolRegistry(),
    });

    const result = await engine.run(task, skillContext(), tokenHeavyProfile, stateCapture, []);

    expect(result.exitReason).toBe("budget_exceeded");
    expect(result.failure).toMatchObject({ code: "budget_exceeded", layer: "budget" });
    expect(result.estimatedTokens).toBeGreaterThan(10);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
