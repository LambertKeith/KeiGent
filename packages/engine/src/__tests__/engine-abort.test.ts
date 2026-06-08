import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoopProfile, SkillContext, StateCapture, Task } from "../types.js";
import type { ToolRegistry } from "../tools/index.js";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
}));

vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
  return {
    ...actual,
    complete: mocks.complete,
  };
});

const { LoopEngine } = await import("../engine.js");

const task: Task = { goal: "Do it", profile: "convergent-exec" };

function skillContext(): SkillContext {
  return {
    metas: [],
    matched: [],
    async loadBody() {
      return null;
    },
  };
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
    terminate: { shouldStop: vi.fn(() => false), allowEarlyTextExit: true },
    verify: { check: vi.fn(async () => ({ passed: true, evidence: "ok" })) },
    recover: { reset: vi.fn(), handle: vi.fn(async () => ({ kind: "retry" })) },
    memory: { maybePersist: vi.fn(async () => undefined) },
  } as unknown as LoopProfile;
}

function engine(registry: ToolRegistry, opts: { llmTimeoutMs?: number } = {}): InstanceType<typeof LoopEngine> {
  return new LoopEngine({
    model: { api: "openai-completions", provider: "test", id: "test-model" } as never,
    apiKey: "test-key",
    maxIterations: 3,
    registry,
    workspace: "/tmp/workspace",
    ...opts,
  });
}

function toolUseResponse() {
  return {
    stopReason: "toolUse",
    content: [{ type: "toolCall", id: "call-1", name: "file_read", arguments: { path: "README.md" } }],
    api: "openai-completions",
    provider: "test",
    model: "test-model",
    usage: {},
    timestamp: Date.now(),
  };
}

describe("LoopEngine AbortSignal handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exits promptly without calling the LLM when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const registry = { execute: vi.fn() } as unknown as ToolRegistry;

    const result = await engine(registry).run(
      task,
      skillContext(),
      profile(),
      {} as StateCapture,
      [],
      undefined,
      { signal: controller.signal },
    );

    expect(result.exitReason).toBe("error");
    expect(result.finalResponse).toContain("aborted");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(registry.execute).not.toHaveBeenCalled();
  });

  it("does not execute tools when the signal aborts after the LLM response", async () => {
    const controller = new AbortController();
    const registry = { execute: vi.fn() } as unknown as ToolRegistry;
    mocks.complete.mockImplementationOnce(async () => {
      controller.abort();
      return toolUseResponse();
    });

    const result = await engine(registry).run(
      task,
      skillContext(),
      profile(),
      {} as StateCapture,
      [{ name: "file_read", description: "read", parameters: {} }],
      undefined,
      { signal: controller.signal },
    );

    expect(result.exitReason).toBe("error");
    expect(result.finalResponse).toContain("aborted");
    expect(registry.execute).not.toHaveBeenCalled();
  });

  it("passes the run AbortSignal into the model completion options", async () => {
    const controller = new AbortController();
    mocks.complete.mockResolvedValueOnce({
      stopReason: "end",
      content: [{ type: "text", text: "done" }],
      api: "openai-completions",
      provider: "test",
      model: "test-model",
      usage: {},
      timestamp: Date.now(),
    });

    await engine({ execute: vi.fn() } as unknown as ToolRegistry).run(
      task,
      skillContext(),
      profile(),
      {} as StateCapture,
      [],
      undefined,
      { signal: controller.signal },
    );

    expect(mocks.complete).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("turns a stalled model completion into a bounded error", async () => {
    mocks.complete.mockImplementationOnce((_model, _context, options: { signal?: AbortSignal }) => new Promise((resolve) => {
      options.signal?.addEventListener("abort", () => {
        resolve({
          stopReason: "error",
          errorMessage: "LLM request timed out after 10ms",
          content: [],
          api: "openai-completions",
          provider: "test",
          model: "test-model",
          usage: {},
          timestamp: Date.now(),
        });
      }, { once: true });
    }));

    const result = await engine({ execute: vi.fn() } as unknown as ToolRegistry, { llmTimeoutMs: 10 }).run(
      task,
      skillContext(),
      profile(),
      {} as StateCapture,
      [],
    );

    expect(result.exitReason).toBe("error");
    expect(result.finalResponse).toContain("timed out");
  });
});
