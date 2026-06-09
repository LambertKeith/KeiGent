import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoopProfile, LoopState, ProgressEvent, SkillContext, StateCapture, Task, Verdict } from "../types.js";
import { ToolRegistry } from "../tools/registry.js";

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

const task: Task = {
  goal: "Verify the thing",
  profile: "convergent-verified",
  successDef: { goal: "verified", assertions: [{ description: "visible", signal: "text" }] },
};

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
    name: "convergent-verified",
    attention: {
      reset: vi.fn(),
      matchSkills: vi.fn(() => []),
      renderInjection: vi.fn(async () => ""),
      buildContext: vi.fn(async () => ({ messages: [] })),
    },
    terminate: { allowEarlyTextExit: false, shouldStop: vi.fn((_state: LoopState) => false) },
    verify: { check: vi.fn(async (): Promise<Verdict> => ({ passed: false, evidence: "missing evidence" })) },
    recover: {
      reset: vi.fn(),
      handle: vi.fn(async () => ({ kind: "repair", hint: "collect stronger evidence" })),
    },
    memory: { maybePersist: vi.fn(async () => undefined) },
  } as unknown as LoopProfile;
}

const stateCapture: StateCapture = {
  async capture() {
    return { raw: {}, visibleText: "not enough" };
  },
};

describe("LoopEngine recovery trajectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records recovery decisions after failed checkpoint verdicts", async () => {
    mocks.complete.mockResolvedValue({
      stopReason: "toolUse",
      content: [{ type: "toolCall", id: "checkpoint-1", name: "request_verification", arguments: { checkpoint_desc: "check" } }],
      api: "openai-completions",
      provider: "test",
      model: "test-model",
      usage: {},
      timestamp: Date.now(),
    });
    const engine = new LoopEngine({
      model: { api: "openai-completions", provider: "test", id: "test-model" } as never,
      apiKey: "test-key",
      maxIterations: 1,
      registry: new ToolRegistry(),
    });
    const events: ProgressEvent[] = [];

    const result = await engine.run(
      task,
      skillContext(),
      profile(),
      stateCapture,
      [{ name: "request_verification", description: "checkpoint", parameters: {} }],
      (event) => events.push(event),
    );

    expect(result.exitReason).toBe("max_iterations");
    expect(result.trajectory.steps).toContainEqual(
      expect.objectContaining({
        kind: "recovery",
        iteration: 1,
        recovery: { decision: "repair", hint: "collect stronger evidence" },
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "recovery",
        iteration: 1,
        decision: "repair",
        hint: "collect stronger evidence",
      }),
    );
  });
});
