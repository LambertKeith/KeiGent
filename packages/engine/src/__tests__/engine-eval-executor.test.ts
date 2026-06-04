import { describe, expect, it } from "vitest";
import { createEngineEvalExecutor } from "../evals/engine-executor.js";
import { makeConversationalProfile } from "../profiles/conversational.js";
import type { EvalCase } from "../evals/types.js";
import type { LoopResult, ProgressEvent, SkillContext, StateCapture, Task } from "../types.js";

const evalCase: EvalCase = {
  id: "hello",
  title: "hello",
  category: "conversational",
  task: { goal: "你好", profile: "auto" },
  expectedProfile: "conversational",
  acceptance: { exitReasons: ["success"] },
};

const skillContext: SkillContext = {
  metas: [],
  matched: [],
  async loadBody() {
    return null;
  },
};

const stateCapture: StateCapture = {
  async capture() {
    return { raw: {} };
  },
};

function resultFor(task: Task): LoopResult {
  return {
    exitReason: "success",
    finalResponse: "你好，我在。",
    iterations: 1,
    checkpointsPassed: 0,
    totalToolCalls: 0,
    trajectory: {
      task,
      profile: task.profile,
      exitReason: "success",
      steps: [{ iteration: 1, kind: "text_output", text: "你好，我在。" }],
      finalResponse: "你好，我在。",
      durationMs: 1,
      skillsUsed: [],
    },
  };
}

describe("createEngineEvalExecutor", () => {
  it("selects a profile, filters tools for that profile, runs the engine, and preserves selectedProfile", async () => {
    const progressEvents: ProgressEvent[] = [];
    const registry = {
      toPiAiTools(predicate?: (tool: { name: string; permission: string }) => boolean) {
        const tools = [
          { name: "ask_user", permission: "readonly" },
          { name: "file_read", permission: "readonly" },
          { name: "file_write", permission: "write" },
        ];
        return tools.filter((tool) => !predicate || predicate(tool)).map((tool) => ({ function: { name: tool.name } }));
      },
    };
    const orchestrator = {
      async selectProfile(task: Task, metas: SkillContext["metas"]) {
        expect(task).toEqual(evalCase.task);
        expect(metas).toBe(skillContext.metas);
        return { name: "conversational" as const, method: "rule" as const, profile: makeConversationalProfile() };
      },
    };
    const engine = {
      async run(
        task: Task,
        skills: SkillContext,
        profile: ReturnType<typeof makeConversationalProfile>,
        capture: StateCapture,
        availableTools: Array<any>,
        onProgress?: (event: ProgressEvent) => void,
      ) {
        expect(task.profile).toBe("conversational");
        expect(skills).toBe(skillContext);
        expect(profile.name).toBe("conversational");
        expect(capture).toBe(stateCapture);
        expect(availableTools.map((tool) => tool.function.name)).toEqual(["ask_user", "file_read"]);
        expect(onProgress).toBeDefined();
        return resultFor(task);
      },
    };

    const executor = createEngineEvalExecutor({
      orchestrator: orchestrator as any,
      engine: engine as any,
      registry: registry as any,
      skillContext,
      stateCapture,
      onProgress: (event) => progressEvents.push(event),
    });

    const execution = await executor.run(evalCase);

    expect(execution.selectedProfile).toBe("conversational");
    expect(execution.result.trajectory.profile).toBe("conversational");
    expect(progressEvents).toEqual([{ kind: "profile_selected", profile: "conversational", via: "rule" }]);
  });
});
