import { describe, expect, it, vi } from "vitest";
import { LoopEngine } from "../engine.js";
import { ToolRegistry } from "../tools/registry.js";
import type { LoopProfile, LoopState, ProgressEvent, SkillContext, StateCapture, Task, Verdict } from "../types.js";

const task: Task = { goal: "use file-write workflow to create hello.txt", profile: "convergent-exec" };

function skillContext(): SkillContext {
  return {
    metas: [
      { name: "file-write", description: "Write files deterministically", tags: ["file", "write", "workflow"], status: "active" },
      { name: "weather-research", description: "Research weather APIs", tags: ["weather"], status: "active" },
    ],
    matched: [],
    async loadBody(name) {
      return name === "file-write" ? "Use file_write." : null;
    },
  };
}

function profile(): LoopProfile {
  return {
    name: "convergent-exec",
    attention: {
      reset: vi.fn(),
      matchSkills: vi.fn(() => ["file-write"]),
      renderInjection: vi.fn(async () => "Use file_write."),
      buildContext: vi.fn(async () => ({ messages: [] })),
    },
    terminate: { allowEarlyTextExit: false, shouldStop: vi.fn((_state: LoopState) => false) },
    verify: { check: vi.fn(async (): Promise<Verdict> => ({ passed: true, evidence: "ok" })) },
    recover: { reset: vi.fn(), handle: vi.fn(async () => ({ kind: "retry" })) },
    memory: { maybePersist: vi.fn(async () => undefined) },
  } as unknown as LoopProfile;
}

const stateCapture: StateCapture = {
  async capture() {
    return { raw: {} };
  },
};

describe("skill match explanations", () => {
  it("emits and persists rich skill match explanations while preserving skill names", async () => {
    const engine = new LoopEngine({
      model: { api: "openai-completions", provider: "test", id: "test-model" } as never,
      apiKey: "test-key",
      maxIterations: 0,
      registry: new ToolRegistry(),
    });
    const events: ProgressEvent[] = [];

    const result = await engine.run(task, skillContext(), profile(), stateCapture, [], (event) => events.push(event));

    const skillEvent = events.find((event): event is Extract<ProgressEvent, { kind: "skills_matched" }> => event.kind === "skills_matched");
    expect(skillEvent).toMatchObject({ skills: ["file-write"] });
    expect(skillEvent?.explanations).toEqual([
      expect.objectContaining({
        name: "file-write",
        matched: true,
        injected: true,
        score: expect.any(Number),
        signals: expect.arrayContaining(["name", "tag:file", "tag:workflow"]),
      }),
      expect.objectContaining({
        name: "weather-research",
        matched: false,
        injected: false,
        exclusionReason: "score_below_threshold",
      }),
    ]);
    expect(result.trajectory.steps).toContainEqual(
      expect.objectContaining({
        kind: "skill_match",
        skillMatches: skillEvent?.explanations,
      }),
    );
  });
});
