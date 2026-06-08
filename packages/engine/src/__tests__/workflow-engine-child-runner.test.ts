import { describe, expect, it } from "vitest";
import { createEngineWorkflowChildRunner, type EngineWorkflowRunner } from "../workflow/engine-child-runner.js";
import type { LoopProfile, LoopResult, SkillContext, StateCapture, Task } from "../types.js";
import type { ToolRegistry } from "../tools/index.js";

function task(overrides: Partial<Task> = {}): Task {
  return { goal: "Do the thing", profile: "auto", ...overrides };
}

function loopResult(overrides: Partial<LoopResult> = {}): LoopResult {
  const runTask = task({ profile: "convergent-exec" });
  return {
    exitReason: "success",
    finalResponse: "done",
    iterations: 1,
    checkpointsPassed: 0,
    totalToolCalls: 0,
    trajectory: {
      task: runTask,
      profile: "convergent-exec",
      exitReason: "success",
      steps: [],
      finalResponse: "done",
      durationMs: 1,
      skillsUsed: [],
    },
    ...overrides,
  };
}

function skillContext(): SkillContext {
  return {
    metas: [],
    matched: [],
    async loadBody() {
      return null;
    },
  };
}

const profile = {
  name: "convergent-exec",
  attention: { reset: () => {}, matchSkills: () => [], renderInjection: async () => "", buildContext: async () => ({ messages: [] }) },
  terminate: { shouldStop: () => false, allowEarlyTextExit: false },
  verify: { check: async () => ({ passed: true, evidence: "ok" }) },
  recover: { reset: () => {}, handle: async () => ({ action: "retry" }) },
  memory: { maybePersist: async () => {} },
} as unknown as LoopProfile;

describe("createEngineWorkflowChildRunner", () => {
  it("selects a profile, filters tools, and runs the engine with child maxIterations", async () => {
    const selectedProfiles: string[] = [];
    const engineMaxIterations: Array<number | undefined> = [];
    const engineTasks: Task[] = [];
    const progressKinds: string[] = [];
    const registry = {
      toPiAiTools() {
        return [
          { name: "file_read", description: "read", parameters: {} },
          { name: "shell", description: "shell", parameters: {} },
        ];
      },
    } as unknown as ToolRegistry;
    const runner = createEngineWorkflowChildRunner({
      orchestrator: {
        async selectProfile(runTask) {
          selectedProfiles.push(runTask.profile);
          return { name: "convergent-exec", profile, method: "rule" as const };
        },
      },
      createEngine(maxIterations) {
        engineMaxIterations.push(maxIterations);
        return {
          async run(runTask, _skills, _profile, _stateCapture, availableTools, onProgress) {
            engineTasks.push(runTask);
            onProgress?.({ kind: "text", iteration: 1, text: `tools:${availableTools.map((tool) => tool.name).join(",")}` });
            return loopResult({ trajectory: { ...loopResult().trajectory, task: runTask, profile: _profile.name } });
          },
        } satisfies EngineWorkflowRunner;
      },
      registry,
      skillContext: skillContext(),
      stateCapture: {} as StateCapture,
      onProfileSelected: (selection) => progressKinds.push(`profile:${selection.name}:${selection.method}`),
    });

    const childResult = await runner.runChild(
      { id: "wf-1:worker-1", role: "worker", task: task(), policy: undefined },
      {
        maxIterations: 3,
        onProgress: (event) => progressKinds.push(event.kind),
      },
    );

    expect(childResult.exitReason).toBe("success");
    expect(selectedProfiles).toEqual(["auto"]);
    expect(engineMaxIterations).toEqual([3]);
    expect(engineTasks).toHaveLength(1);
    expect(engineTasks[0]).toMatchObject({ goal: "Do the thing", profile: "convergent-exec" });
    expect(progressKinds).toEqual(["profile:convergent-exec:rule", "text"]);
  });

  it("passes the workflow AbortSignal to the engine run", async () => {
    const controller = new AbortController();
    const seenSignals: Array<AbortSignal | undefined> = [];
    const registry = {
      toPiAiTools() {
        return [];
      },
    } as unknown as ToolRegistry;
    const runner = createEngineWorkflowChildRunner({
      orchestrator: {
        async selectProfile() {
          return { name: "convergent-exec", profile, method: "rule" as const };
        },
      },
      createEngine() {
        return {
          async run(_task, _skills, _profile, _stateCapture, _tools, _onProgress, options?: { signal?: AbortSignal }) {
            seenSignals.push(options?.signal);
            return loopResult();
          },
        } satisfies EngineWorkflowRunner;
      },
      registry,
      skillContext: skillContext(),
      stateCapture: {} as StateCapture,
    });

    await runner.runChild(
      { id: "wf-1:worker-1", role: "worker", task: task(), policy: undefined },
      { signal: controller.signal },
    );

    expect(seenSignals).toEqual([controller.signal]);
  });
});
