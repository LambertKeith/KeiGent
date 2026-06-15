import { describe, expect, it } from "vitest";
import { createEngineWorkflowChildRunner, type EngineWorkflowRunner } from "../workflow/engine-child-runner.js";
import type { LoopProfile, LoopResult, SkillContext, StateCapture, Task } from "../types.js";
import type { ToolRegistry } from "../tools/index.js";
import type { ToolDef } from "../tools/types.js";

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

function registryWithPolicyTools(): ToolRegistry {
  const defs: ToolDef[] = [
    {
      name: "file_read",
      description: "read",
      parameters: {},
      permission: "readonly",
      riskLevel: "R0",
      sideEffect: "none",
      reversible: true,
      async execute() {
        return { content: "read", isError: false };
      },
    } as ToolDef,
    {
      name: "file_write",
      description: "write",
      parameters: {},
      permission: "write",
      riskLevel: "R2",
      sideEffect: "local",
      reversible: true,
      async execute() {
        return { content: "write", isError: false };
      },
    } as ToolDef,
    {
      name: "shell",
      description: "shell",
      parameters: {},
      permission: "execute",
      riskLevel: "R3",
      sideEffect: "local",
      reversible: true,
      async execute() {
        return { content: "shell", isError: false };
      },
    } as ToolDef,
    {
      name: "http_request",
      description: "http",
      parameters: {},
      permission: "readonly",
      riskLevel: "R1",
      sideEffect: "external",
      reversible: true,
      async execute() {
        return { content: "http", isError: false };
      },
    } as ToolDef,
  ];

  return {
    toPiAiTools(filter?: (tool: ToolDef) => boolean) {
      return defs
        .filter((toolDef) => (filter ? filter(toolDef) : true))
        .map((toolDef) => ({ name: toolDef.name, description: toolDef.description, parameters: toolDef.parameters }));
    },
  } as unknown as ToolRegistry;
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
    const engineWorkspacePaths: Array<string | undefined> = [];
    const engineTasks: Task[] = [];
    const progressEvents: unknown[] = [];
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
          const selection = {
            name: "convergent-exec" as const,
            profile,
            method: "rule" as const,
            ruleId: "skill_match" as const,
            rationale: "matched file workflow",
            signals: ["skill:file-write", "score:12"],
            guardApplied: false,
            unguardedName: "convergent-exec" as const,
          };
          return selection;
        },
      },
      createEngine(maxIterations, _budget, workspacePath) {
        engineMaxIterations.push(maxIterations);
        engineWorkspacePaths.push(workspacePath);
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
      onProfileSelected: (selection) => progressEvents.push({ callback: selection.name }),
    });

    const childResult = await runner.runChild(
      { id: "wf-1:worker-1", role: "worker", task: task(), policy: undefined },
      {
        maxIterations: 3,
        workspacePath: "/tmp/keigent/workspaces/ws_wf_1_worker_1",
        onProgress: (event) => progressEvents.push(event),
      },
    );

    expect(childResult.exitReason).toBe("success");
    expect(selectedProfiles).toEqual(["auto"]);
    expect(engineMaxIterations).toEqual([3]);
    expect(engineWorkspacePaths).toEqual(["/tmp/keigent/workspaces/ws_wf_1_worker_1"]);
    expect(engineTasks).toHaveLength(1);
    expect(engineTasks[0]).toMatchObject({ goal: "Do the thing", profile: "convergent-exec" });
    expect(progressEvents).toEqual([
      { callback: "convergent-exec" },
      {
        kind: "profile_selected",
        profile: "convergent-exec",
        via: "rule",
        ruleId: "skill_match",
        rationale: "matched file workflow",
        signals: ["skill:file-write", "score:12"],
        guardApplied: false,
        unguardedProfile: "convergent-exec",
      },
      { kind: "text", iteration: 1, text: "tools:file_read,shell" },
    ]);
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

  it("filters child tools by workflow policy and forwards inherited approval scopes", async () => {
    const toolNamesByRun: string[][] = [];
    const inheritedScopes: Array<string[] | undefined> = [];
    const runner = createEngineWorkflowChildRunner({
      orchestrator: {
        async selectProfile() {
          return { name: "convergent-exec", profile, method: "rule" as const };
        },
      },
      createEngine() {
        return {
          async run(_task, _skills, _profile, _stateCapture, availableTools, _onProgress, options?: { inheritedApprovalScopes?: string[] }) {
            toolNamesByRun.push(availableTools.map((tool) => tool.name));
            inheritedScopes.push(options?.inheritedApprovalScopes);
            return loopResult();
          },
        } satisfies EngineWorkflowRunner;
      },
      registry: registryWithPolicyTools(),
      skillContext: skillContext(),
      stateCapture: {} as StateCapture,
    });

    await runner.runChild({
      id: "wf-1:worker-1",
      role: "worker",
      task: task(),
      policy: {
        maxPermission: "write",
        maxRiskLevel: "R2",
        allowExternalSideEffects: false,
        approvalScopes: ["workspace:/tmp/keigent"],
      },
    });

    await runner.runChild({
      id: "wf-1:verifier-1",
      role: "verifier",
      task: task(),
      policy: {
        maxPermission: "dangerous",
        maxRiskLevel: "R5",
        allowExternalSideEffects: true,
        verifierReadonly: true,
      },
    });

    expect(toolNamesByRun).toEqual([
      ["file_read", "file_write"],
      ["file_read"],
    ]);
    expect(inheritedScopes).toEqual([["workspace:/tmp/keigent"], undefined]);
  });
});
