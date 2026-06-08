import { describe, expect, it, vi } from "vitest";
import type { LoopProfile } from "../types.js";

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

const { Orchestrator } = await import("../orchestrator.js");

function fakeProfile(name: string): LoopProfile {
  return {
    name,
    attention: { reset() {}, matchSkills: () => [], renderInjection: async () => "", buildContext: async () => ({ messages: [] }) },
    terminate: { shouldStop: () => true, allowEarlyTextExit: true },
    verify: { check: async () => ({ passed: true, evidence: "ok" }) },
    recover: { reset() {}, handle: async () => ({ kind: "retry" }) },
    memory: { maybePersist: async () => undefined },
  } as unknown as LoopProfile;
}

describe("Orchestrator LLM classification timeout", () => {
  it("falls back instead of hanging when classification completion stalls", async () => {
    mocks.complete.mockImplementationOnce((_model, _context, options: { signal?: AbortSignal }) => new Promise((resolve) => {
      options.signal?.addEventListener("abort", () => resolve({ content: [], stopReason: "error" }), { once: true });
    }));

    const orchestrator = new Orchestrator({
      model: { api: "openai-completions", provider: "test", id: "test-model" } as never,
      apiKey: "test-key",
      llmTimeoutMs: 10,
      registry: { get: (name: string) => fakeProfile(name), names: () => ["convergent-exec", "divergent-research", "conversational"] },
    });

    const selected = await orchestrator.selectProfile({ goal: "请处理这个边界任务：alpha beta gamma", profile: "auto" }, []);

    expect(selected.method).toBe("llm");
    expect(selected.name).toBe("divergent-research");
  });
});
