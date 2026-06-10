import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { LoopResult, Task, Trajectory } from "../types.js";
import type { WorkflowTrajectory } from "../workflow/types.js";
import { loadWorkflowTrajectory, replayWorkflowTrajectory, saveWorkflowTrajectory } from "../workflow/trajectory.js";

function task(): Task {
  return { goal: "Persist me", profile: "auto" };
}

function childTrajectory(): Trajectory {
  return {
    task: task(),
    profile: "convergent-exec",
    exitReason: "success",
    steps: [{ iteration: 1, kind: "text_output", text: "done" }],
    finalResponse: "done",
    durationMs: 7,
    skillsUsed: ["skill-a"],
  };
}

function childResult(trajectory: Trajectory = childTrajectory()): LoopResult {
  return {
    exitReason: trajectory.exitReason,
    finalResponse: trajectory.finalResponse,
    iterations: 1,
    checkpointsPassed: 0,
    totalToolCalls: 0,
    trajectory,
  };
}

function workflowTrajectory(overrides: Partial<WorkflowTrajectory> = {}): WorkflowTrajectory {
  const child = childTrajectory();
  const autonomy = {
    outcome: "completed_without_escalation" as const,
    repairAttempts: [],
    escalations: [],
  };
  return {
    schemaVersion: 1,
    workflowId: "wf-save",
    mode: "single-loop",
    goal: "Persist me",
    rootTask: task(),
    startedAt: "2026-06-05T00:00:00.000Z",
    durationMs: 7,
    exitReason: "success",
    finalResponse: "done",
    budget: {
      maxChildRuns: 1,
      maxIterationsPerRun: 10,
      maxAggregateIterations: 10,
      maxToolCallsPerRun: 20,
      maxAggregateToolCalls: 20,
      maxRecoveryAttemptsPerRun: 3,
    },
    budgetUsage: { childRuns: 1, iterations: 1, toolCalls: 0, recoveryAttempts: 0, checkpointsPassed: 0, durationMs: 7 },
    autonomy,
    evidence: [],
    events: [
      { kind: "workflow_start", workflowId: "wf-save", mode: "single-loop", goal: "Persist me" },
      { kind: "workflow_done", workflowId: "wf-save", exitReason: "success" },
    ],
    childRuns: [{ id: "wf-save:worker-1", role: "worker", result: childResult(child), trajectory: child }],
    ...overrides,
  };
}

describe("workflow trajectory persistence and replay", () => {
  it("saves and loads workflow trajectory JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "keigent-workflow-"));
    try {
      const original = workflowTrajectory();
      const savedPath = await saveWorkflowTrajectory(original, { dir });
      const loaded = await loadWorkflowTrajectory(savedPath);

      expect(savedPath).toContain("wf-save");
      expect(loaded.workflowId).toBe(original.workflowId);
      expect(loaded.mode).toBe(original.mode);
      expect(loaded.exitReason).toBe(original.exitReason);
      expect(loaded.childRuns[0]?.trajectory).toEqual(original.childRuns[0]?.trajectory);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("replays a workflow trajectory without a child runner", () => {
    const original = workflowTrajectory();

    const replayed = replayWorkflowTrajectory(original);

    expect(replayed.workflowId).toBe(original.workflowId);
    expect(replayed.exitReason).toBe(original.exitReason);
    expect(replayed.finalResponse).toBe(original.finalResponse);
    expect(replayed.childRuns[0]?.trajectory).toEqual(original.childRuns[0]?.trajectory);
    expect(replayed.trajectory).toBe(original);
  });

  it("preserves failed child result and trajectory during replay", () => {
    const failedChild = childTrajectory();
    failedChild.exitReason = "error";
    failedChild.finalResponse = "failed";
    failedChild.steps = [{ iteration: 1, kind: "error", errorMessage: "boom" }];
    const original = workflowTrajectory({
      exitReason: "child_error",
      finalResponse: "failed",
      childRuns: [{ id: "wf-save:worker-1", role: "worker", result: childResult(failedChild), trajectory: failedChild }],
    });

    const replayed = replayWorkflowTrajectory(original);

    expect(replayed.exitReason).toBe("child_error");
    expect(replayed.childRuns[0]?.result.exitReason).toBe("error");
    expect(replayed.childRuns[0]?.trajectory?.steps[0]).toMatchObject({ kind: "error", errorMessage: "boom" });
  });
});
