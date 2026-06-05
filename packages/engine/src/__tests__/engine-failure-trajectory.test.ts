import { describe, expect, it } from "vitest";
import type { LoopProfile, SkillContext, StateCapture, Task } from "../types.js";
import { LoopEngine } from "../engine.js";
import { ToolRegistry } from "../tools/index.js";

function task(): Task {
  return { goal: "Stop before LLM", profile: "test-profile" };
}

function skillContext(): SkillContext {
  return {
    metas: [{ name: "matched-skill", description: "relevant", tags: ["test"] }],
    matched: [],
    async loadBody() {
      return null;
    },
  };
}

function profile(): LoopProfile {
  return {
    name: "test-profile",
    attention: {
      reset() {},
      matchSkills() {
        return ["matched-skill"];
      },
      async renderInjection() {
        return "";
      },
      async buildContext() {
        throw new Error("buildContext should not be called when maxIterations is 0");
      },
    },
    terminate: {
      allowEarlyTextExit: false,
      shouldStop() {
        return false;
      },
    },
    verify: {
      async check() {
        return { passed: true, evidence: "ok" };
      },
    },
    recover: {
      reset() {},
      async handle() {
        return { kind: "retry" };
      },
    },
    memory: {
      async maybePersist() {},
    },
  };
}

const stateCapture: StateCapture = {
  async capture() {
    return { raw: {} };
  },
};

describe("LoopEngine failure trajectories", () => {
  it("preserves collected run metadata when max iterations stops before an LLM call", async () => {
    const engine = new LoopEngine({
      model: { api: "openai-completions", provider: "test", model: "test" } as never,
      apiKey: "test",
      maxIterations: 0,
      registry: new ToolRegistry(),
    });

    const result = await engine.run(task(), skillContext(), profile(), stateCapture, []);

    expect(result.exitReason).toBe("max_iterations");
    expect(result.trajectory.task.goal).toBe("Stop before LLM");
    expect(result.trajectory.profile).toBe("test-profile");
    expect(result.trajectory.skillsUsed).toEqual(["matched-skill"]);
  });
});
