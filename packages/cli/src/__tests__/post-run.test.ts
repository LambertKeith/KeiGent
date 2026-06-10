import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeigentConfig } from "../config.js";
import { persistWorkflowAndLearn } from "../post-run.js";
import type { LoopResult, WorkflowResult } from "@keigent/engine";

const mocks = vi.hoisted(() => ({
  saveTrajectory: vi.fn(async () => "/tmp/trajectory.json"),
  saveWorkflowTrajectory: vi.fn(async () => "/tmp/workflow.json"),
  saveRunRecord: vi.fn(async () => "/tmp/run/record.json"),
  summarizeRunRecord: vi.fn(() => "Run: run_wf-test\nStatus: succeeded"),
  formatLearningResult: vi.fn(() => "learned\nmore"),
}));

vi.mock("@keigent/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@keigent/engine")>();
  return {
    ...actual,
    saveTrajectory: mocks.saveTrajectory,
    saveWorkflowTrajectory: mocks.saveWorkflowTrajectory,
    saveRunRecord: mocks.saveRunRecord,
    summarizeRunRecord: mocks.summarizeRunRecord,
    formatLearningResult: mocks.formatLearningResult,
  };
});

const config: KeigentConfig = {
  apiKey: "test-key",
  apiProtocol: "openai",
  baseUrl: "https://example.com/v1",
  modelId: "test-model",
  workspace: "/tmp/workspace",
  skillsDir: "/tmp/skills",
  memoryDir: "/tmp/memory",
  headless: true,
  maxIterations: 3,
};

function childResult(overrides: Partial<LoopResult> = {}): LoopResult {
  const task = { goal: "Do it", profile: "convergent-exec" };
  return {
    exitReason: "success",
    finalResponse: "done",
    iterations: 1,
    checkpointsPassed: 0,
    totalToolCalls: 0,
    trajectory: {
      task,
      profile: "convergent-exec",
      exitReason: "success",
      steps: [],
      finalResponse: "done",
      durationMs: 1,
      skillsUsed: ["example-skill"],
    },
    ...overrides,
  } as LoopResult;
}

function workflowResult(exitReason: WorkflowResult["exitReason"]): WorkflowResult {
  const result = childResult();
  return {
    workflowId: "wf-test",
    mode: "single-loop",
    exitReason,
    finalResponse: result.finalResponse,
    childRuns: [{ id: "wf-test:worker-1", role: "worker", result, trajectory: result.trajectory }],
    evidence: [],
    budget: {
      maxChildRuns: 1,
      maxIterationsPerRun: 3,
      maxAggregateIterations: 3,
      maxAggregateToolCalls: 20,
      timeoutMs: 120_000,
    },
    budgetUsage: { childRuns: 1, iterations: 1, toolCalls: 0, checkpointsPassed: 0, durationMs: 1 },
    durationMs: 1,
    trajectory: {
      schemaVersion: 1,
      workflowId: "wf-test",
      mode: "single-loop",
      goal: "Do it",
      rootTask: result.trajectory.task,
      startedAt: "2026-06-06T00:00:00.000Z",
      exitReason,
      finalResponse: result.finalResponse,
      childRuns: [{ id: "wf-test:worker-1", role: "worker", result, trajectory: result.trajectory }],
      evidence: [],
      events: [],
      budget: {
        maxChildRuns: 1,
        maxIterationsPerRun: 3,
        maxAggregateIterations: 3,
        maxAggregateToolCalls: 20,
        timeoutMs: 120_000,
      },
      budgetUsage: { childRuns: 1, iterations: 1, toolCalls: 0, checkpointsPassed: 0, durationMs: 1 },
      durationMs: 1,
    },
  } as WorkflowResult;
}

describe("persistWorkflowAndLearn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves workflow trajectory but does not learn from a failed workflow even when the child succeeded", async () => {
    const learner = { learn: vi.fn(async () => ({ kind: "noop" })) };

    await persistWorkflowAndLearn(workflowResult("budget_exceeded"), config, learner as never, new Map());

    expect(mocks.saveWorkflowTrajectory).toHaveBeenCalledOnce();
    expect(mocks.saveRunRecord).toHaveBeenCalledOnce();
    expect(mocks.saveTrajectory).not.toHaveBeenCalled();
    expect(learner.learn).not.toHaveBeenCalled();
  });

  it("delegates to child trajectory persistence and learning only after workflow success", async () => {
    const learner = { learn: vi.fn(async () => ({ kind: "noop" })) };

    await persistWorkflowAndLearn(workflowResult("success"), config, learner as never, new Map([["example-skill", "body"]]));

    expect(mocks.saveWorkflowTrajectory).toHaveBeenCalledOnce();
    expect(mocks.saveRunRecord).toHaveBeenCalledOnce();
    expect(mocks.saveTrajectory).toHaveBeenCalledOnce();
    expect(learner.learn).toHaveBeenCalledOnce();
  });
});
