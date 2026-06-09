import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoopProfile, LoopState, ProgressEvent, SkillContext, StateCapture, Task } from "../types.js";
import { DenyByDefaultGate, type ToolDef } from "../tools/types.js";
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

const task: Task = { goal: "Run a dangerous command", profile: "convergent-exec" };

const stateCapture: StateCapture = {
  async capture() {
    return { raw: {} };
  },
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
    name: "convergent-exec",
    attention: {
      reset: vi.fn(),
      matchSkills: vi.fn(() => []),
      renderInjection: vi.fn(async () => ""),
      buildContext: vi.fn(async () => ({ messages: [] })),
    },
    terminate: {
      allowEarlyTextExit: false,
      shouldStop(state: LoopState) {
        return state.toolCallCount >= 1;
      },
    },
    verify: { check: vi.fn(async () => ({ passed: true, evidence: "ok" })) },
    recover: { reset: vi.fn(), handle: vi.fn(async () => ({ kind: "retry" })) },
    memory: { maybePersist: vi.fn(async () => undefined) },
  } as unknown as LoopProfile;
}

function shellTool(): ToolDef {
  return {
    name: "shell",
    description: "run shell",
    parameters: {},
    permission: "dangerous",
    riskLevel: "R5",
    sideEffect: "local",
    reversible: false,
    execute: vi.fn(async () => ({ content: "should not execute", isError: false })),
  };
}

describe("LoopEngine approval trajectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams and persists denied approval decisions before the denied tool result", async () => {
    mocks.complete.mockResolvedValueOnce({
      stopReason: "toolUse",
      content: [{ type: "toolCall", id: "call-1", name: "shell", arguments: { command: "rm -rf dist", apiKey: "sk-secret" } }],
      api: "openai-completions",
      provider: "test",
      model: "test-model",
      usage: {},
      timestamp: Date.now(),
    });

    const registry = new ToolRegistry().register(shellTool());
    const engine = new LoopEngine({
      model: { api: "openai-completions", provider: "test", id: "test-model" } as never,
      apiKey: "test-key",
      maxIterations: 3,
      registry,
      workspace: "/tmp/workspace",
      approval: new DenyByDefaultGate(),
    });
    const events: ProgressEvent[] = [];

    const result = await engine.run(
      task,
      skillContext(),
      profile(),
      stateCapture,
      [{ name: "shell", description: "run shell", parameters: {} }],
      (event) => events.push(event),
    );

    const approvalIndex = result.trajectory.steps.findIndex((step) => step.kind === "approval");
    const deniedToolIndex = result.trajectory.steps.findIndex((step) => step.kind === "tool_call" && step.toolName === "shell");

    expect(approvalIndex).toBeGreaterThanOrEqual(0);
    expect(deniedToolIndex).toBeGreaterThan(approvalIndex);
    expect(result.trajectory.steps[approvalIndex]).toMatchObject({
      kind: "approval",
      iteration: 1,
      approval: {
        approved: false,
        request: expect.objectContaining({
          toolName: "shell",
          riskLevel: "R5",
          permission: "dangerous",
          exposesSecrets: true,
        }),
      },
    });
    expect(JSON.stringify(result.trajectory.steps[approvalIndex])).not.toContain("sk-secret");
    expect(result.trajectory.steps[deniedToolIndex]).toMatchObject({
      kind: "tool_call",
      toolName: "shell",
      toolSucceeded: false,
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "approval",
        iteration: 1,
        approved: false,
        request: expect.objectContaining({ toolName: "shell", riskLevel: "R5" }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "done",
        exitReason: "error",
        failure: expect.objectContaining({ code: "permission_denied" }),
      }),
    );
  });
});
