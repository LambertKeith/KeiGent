import { access, readFile, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LoopResult, ProgressEvent, Task, Trajectory } from "../types.js";
import { createWorkflowSpec } from "../workflow/planner.js";
import { WorkflowRunner, type WorkflowChildRunner } from "../workflow/runner.js";

function task(overrides: Partial<Task> = {}): Task {
  return { goal: "Do the thing", profile: "auto", ...overrides };
}

function trajectory(overrides: Partial<Trajectory> = {}): Trajectory {
  return {
    task: task(),
    profile: "convergent-exec",
    exitReason: "success",
    steps: [],
    finalResponse: "done",
    durationMs: 5,
    skillsUsed: [],
    ...overrides,
  };
}

function loopResult(overrides: Partial<LoopResult> = {}): LoopResult {
  const baseTrajectory = trajectory({
    exitReason: overrides.exitReason ?? "success",
    finalResponse: overrides.finalResponse ?? "done",
  });
  return {
    exitReason: "success",
    finalResponse: "done",
    iterations: 1,
    checkpointsPassed: 0,
    totalToolCalls: 0,
    trajectory: baseTrajectory,
    ...overrides,
  };
}

function fakeChildRunner(result: LoopResult, childEvents: ProgressEvent[] = []): WorkflowChildRunner {
  return {
    async runChild(_child, options) {
      for (const event of childEvents) options?.onProgress?.(event);
      return result;
    },
  };
}

describe("WorkflowRunner", () => {
  it("wraps a single successful child run and emits ordered workflow events", async () => {
    const childEvent: ProgressEvent = { kind: "text", iteration: 1, text: "working" };
    const childTrajectory = trajectory({ steps: [{ iteration: 1, kind: "text_output", text: "done" }] });
    const result = loopResult({ trajectory: childTrajectory });
    const runner = new WorkflowRunner(fakeChildRunner(result, [childEvent]));
    const spec = createWorkflowSpec({ id: "wf-1", task: task() });
    const events: unknown[] = [];

    const workflowResult = await runner.run(spec, (event) => events.push(event));

    expect(workflowResult.exitReason).toBe("success");
    expect(workflowResult.finalResponse).toBe("done");
    expect(workflowResult.childRuns).toHaveLength(1);
    expect(workflowResult.childRuns[0]?.trajectory).toBe(childTrajectory);
    expect(events.map((event) => (event as { kind: string }).kind)).toEqual([
      "workflow_start",
      "child_start",
      "child_event",
      "child_done",
      "workflow_done",
    ]);
    expect(events[2]).toMatchObject({ kind: "child_event", event: childEvent });
    expect(workflowResult.budgetUsage).toMatchObject({
      childRuns: 1,
      iterations: 1,
      toolCalls: 0,
      checkpointsPassed: 0,
    });
  });

  it("aggregates provider usage and cost from child loop results", async () => {
    const child = loopResult({
      providerUsage: {
        inputTokens: 100,
        outputTokens: 25,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 140,
        costUsd: 0.075,
        costStatus: "priced",
      },
    });
    child.trajectory.providerUsage = child.providerUsage;
    const runner = new WorkflowRunner(fakeChildRunner(child));

    const result = await runner.run(createWorkflowSpec({ id: "wf-provider-usage", task: task() }));

    expect(result.budgetUsage.providerUsage).toEqual({
      inputTokens: 100,
      outputTokens: 25,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 140,
      costUsd: 0.075,
      costStatus: "priced",
    });
    expect(result.trajectory.budgetUsage.providerUsage).toEqual(result.budgetUsage.providerUsage);
  });

  it("runs reviewed-loop as worker followed by readonly reviewer with reviewer evidence", async () => {
    const reviewedTask = task({
      successDef: {
        goal: "Review rubric",
        assertions: [{ description: "reviewer accepts result", signal: "text" }],
      },
    });
    const workerTrajectory = trajectory({
      steps: [{ iteration: 1, kind: "tool_call", toolName: "file_write", toolResult: "ok", toolSucceeded: true }],
      finalResponse: "worker done",
    });
    const reviewerTrajectory = trajectory({
      steps: [
        {
          iteration: 1,
          kind: "checkpoint",
          checkpointDesc: "reviewer accepts result",
          verdictPassed: true,
          verdictEvidence: "reviewer accepted worker result",
          snapshot: { raw: {}, visibleText: "accepted" },
        },
      ],
      finalResponse: "review passed",
    });
    const seenChildren: Array<{ id: string; role: string; policy?: unknown }> = [];
    const runner = new WorkflowRunner({
      async runChild(child) {
        seenChildren.push({ id: child.id, role: child.role, policy: child.policy });
        return child.role === "worker"
          ? loopResult({ finalResponse: "worker done", trajectory: workerTrajectory })
          : loopResult({ finalResponse: "review passed", checkpointsPassed: 1, trajectory: reviewerTrajectory });
      },
    });
    const events: Array<{ kind: string; childRunId?: string; role?: string }> = [];

    const result = await runner.run(
      createWorkflowSpec({ id: "wf-reviewed", task: reviewedTask, mode: "reviewed-loop" }),
      (event) => events.push(event),
    );

    expect(result.exitReason).toBe("success");
    expect(result.childRuns.map((child) => child.role)).toEqual(["worker", "reviewer"]);
    expect(seenChildren[1]).toMatchObject({
      id: "wf-reviewed:reviewer-1",
      role: "reviewer",
      policy: { verifierReadonly: true, allowExternalSideEffects: false },
    });
    expect(events.filter((event) => event.kind === "child_start").map((event) => [event.childRunId, event.role])).toEqual([
      ["wf-reviewed:worker-1", "worker"],
      ["wf-reviewed:reviewer-1", "reviewer"],
    ]);
    expect(result.evidence).toContainEqual(
      expect.objectContaining({
        kind: "checkpoint",
        passed: true,
        message: "reviewer accepted worker result",
        sourceChildRunId: "wf-reviewed:reviewer-1",
      }),
    );
    expect(result.finalResponse).toContain("worker done");
    expect(result.finalResponse).toContain("review passed");
  });

  it("records reviewed-loop rubric and reviewer issues without letting reviewer override worker evidence", async () => {
    const reviewedTask = task({
      successDef: {
        goal: "Review rubric",
        assertions: [{ description: "reviewer accepts result", signal: "text" }],
      },
    });
    const workerTrajectory = trajectory({
      steps: [{
        iteration: 1,
        kind: "checkpoint",
        checkpointDesc: "worker evidence",
        verdictPassed: true,
        verdictEvidence: "worker evidence passed",
        snapshot: { raw: {} },
      }],
      finalResponse: "worker done",
    });
    const reviewerTrajectory = trajectory({
      steps: [{
        iteration: 1,
        kind: "checkpoint",
        checkpointDesc: "reviewer accepts result",
        verdictPassed: false,
        verdictEvidence: "missing source attribution",
        snapshot: { raw: {} },
      }],
      finalResponse: "review failed",
    });
    const runner = new WorkflowRunner({
      async runChild(child) {
        return child.role === "worker"
          ? loopResult({ finalResponse: "worker done", checkpointsPassed: 1, trajectory: workerTrajectory })
          : loopResult({ finalResponse: "review failed", checkpointsPassed: 0, trajectory: reviewerTrajectory });
      },
    });

    const result = await runner.run(createWorkflowSpec({ id: "wf-reviewed-issues", task: reviewedTask, mode: "reviewed-loop" }));

    expect(result.exitReason).toBe("verified_failure");
    expect(result.review).toMatchObject({
      reviewerRunId: "wf-reviewed-issues:reviewer-1",
      rubric: {
        taskGoal: "Do the thing",
        successCriteria: ["[signal:text] reviewer accepts result"],
      },
      issues: [{
        severity: "blocking",
        sourceChildRunId: "wf-reviewed-issues:reviewer-1",
        message: "missing source attribution",
        evidenceKind: "checkpoint",
      }],
    });
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "child_result",
        passed: true,
        message: "worker exited with success",
      }),
      expect.objectContaining({
        kind: "checkpoint",
        passed: false,
        message: "missing source attribution",
      }),
    ]));
  });

  it("maps child error, max_iterations, escalated, and thrown errors to deterministic workflow exits", async () => {
    const cases = [
      { child: loopResult({ exitReason: "error" }), expected: "child_error" },
      { child: loopResult({ exitReason: "max_iterations" }), expected: "max_iterations" },
      { child: loopResult({ exitReason: "escalated" }), expected: "child_escalated" },
    ] as const;

    for (const item of cases) {
      const runner = new WorkflowRunner(fakeChildRunner(item.child));
      const spec = createWorkflowSpec({ id: `wf-${item.expected}`, task: task() });

      await expect(runner.run(spec)).resolves.toMatchObject({ exitReason: item.expected });
    }

    const throwingRunner = new WorkflowRunner({
      async runChild() {
        throw new Error("boom");
      },
    });
    await expect(throwingRunner.run(createWorkflowSpec({ id: "wf-throw", task: task() }))).resolves.toMatchObject({
      exitReason: "child_error",
    });
  });

  it("emits exactly one terminal workflow_done event when the child throws", async () => {
    const runner = new WorkflowRunner({
      async runChild() {
        throw new Error("boom");
      },
    });
    const events: Array<{ kind: string }> = [];

    await runner.run(createWorkflowSpec({ id: "wf-throw", task: task() }), (event) => events.push(event));

    expect(events.filter((event) => event.kind === "workflow_done")).toHaveLength(1);
    expect(events[events.length - 1]).toMatchObject({ kind: "workflow_done", exitReason: "child_error" });
  });

  it("requires passed checkpoint evidence for assertion tasks in verified-loop", async () => {
    const assertionTask = task({
      successDef: {
        goal: "Done",
        assertions: [{ description: "answer visible", signal: "text" }],
      },
    });
    const passedCheckpoint = trajectory({
      steps: [
        {
          iteration: 1,
          kind: "checkpoint",
          checkpointDesc: "answer visible",
          verdictPassed: true,
          verdictEvidence: "observed answer",
          snapshot: { raw: {}, visibleText: "answer" },
        },
      ],
    });
    const runner = new WorkflowRunner(fakeChildRunner(loopResult({ trajectory: passedCheckpoint, checkpointsPassed: 1 })));

    const result = await runner.run(createWorkflowSpec({ id: "wf-verified", task: assertionTask }));

    expect(result.mode).toBe("verified-loop");
    expect(result.exitReason).toBe("success");
    expect(result.evidence).toContainEqual(
      expect.objectContaining({ kind: "checkpoint", passed: true, message: "observed answer" }),
    );
  });

  it("returns verified_failure when assertion task child succeeds without passed checkpoint evidence", async () => {
    const assertionTask = task({
      successDef: {
        goal: "Done",
        assertions: [{ description: "answer visible", signal: "text" }],
      },
    });
    const noCheckpointRunner = new WorkflowRunner(fakeChildRunner(loopResult()));
    const failedCheckpointRunner = new WorkflowRunner(
      fakeChildRunner(
        loopResult({
          trajectory: trajectory({
            steps: [
              {
                iteration: 1,
                kind: "checkpoint",
                checkpointDesc: "answer visible",
                verdictPassed: false,
                verdictEvidence: "not observed",
                snapshot: { raw: {} },
              },
            ],
          }),
        }),
      ),
    );
    const missingVerdictRunner = new WorkflowRunner(
      fakeChildRunner(
        loopResult({
          trajectory: trajectory({
            steps: [
              {
                iteration: 1,
                kind: "checkpoint",
                checkpointDesc: "answer visible",
                verdictEvidence: "verdict flag missing",
                snapshot: { raw: {} },
              },
            ],
          }),
        }),
      ),
    );
    const zeroMinFailedCheckpointRunner = new WorkflowRunner(
      fakeChildRunner(
        loopResult({
          trajectory: trajectory({
            steps: [
              {
                iteration: 1,
                kind: "checkpoint",
                checkpointDesc: "answer visible",
                verdictPassed: false,
                verdictEvidence: "explicit failure",
                snapshot: { raw: {} },
              },
            ],
          }),
        }),
      ),
    );

    await expect(noCheckpointRunner.run(createWorkflowSpec({ id: "wf-no-checkpoint", task: assertionTask }))).resolves.toMatchObject({
      exitReason: "verified_failure",
    });
    await expect(failedCheckpointRunner.run(createWorkflowSpec({ id: "wf-failed-checkpoint", task: assertionTask }))).resolves.toMatchObject({
      exitReason: "verified_failure",
    });
    await expect(missingVerdictRunner.run(createWorkflowSpec({ id: "wf-missing-verdict", task: assertionTask }))).resolves.toMatchObject({
      exitReason: "verified_failure",
    });
    await expect(
      zeroMinFailedCheckpointRunner.run(
        createWorkflowSpec({
          id: "wf-zero-min-failed-checkpoint",
          task: assertionTask,
          verification: { minPassedCheckpoints: 0 },
        }),
      ),
    ).resolves.toMatchObject({ exitReason: "verified_failure" });
  });

  it("returns verified_failure when structured assertions fail even if checkpoint passes", async () => {
    const assertionTask = task({
      successDef: {
        goal: "File written",
        assertions: [{ kind: "toolSucceeded", toolName: "file_write" }],
      },
    });
    const childTrajectory = trajectory({
      steps: [
        {
          iteration: 1,
          kind: "tool_call",
          toolName: "file_write",
          toolArgs: { path: "hello.txt" },
          toolResult: "[错误] denied",
          toolSucceeded: false,
        },
        {
          iteration: 2,
          kind: "checkpoint",
          checkpointDesc: "file write done",
          verdictPassed: true,
          verdictEvidence: "model claimed file exists",
          snapshot: { raw: {} },
        },
      ],
    });
    const runner = new WorkflowRunner(fakeChildRunner(loopResult({ trajectory: childTrajectory, checkpointsPassed: 1 })));

    const result = await runner.run(createWorkflowSpec({ id: "wf-structured-assertion-fail", task: assertionTask }));

    expect(result.exitReason).toBe("verified_failure");
    expect(result.evidence).toContainEqual(
      expect.objectContaining({
        kind: "assertion",
        passed: false,
        assertion: "tool file_write succeeded 1 time(s)",
      }),
    );
  });

  it("summarizes repair attempts that finish with passing evidence", async () => {
    const repairedTrajectory = trajectory({
      steps: [
        {
          iteration: 1,
          kind: "recovery",
          recovery: { decision: "repair", reason: "initial assertion failed", hint: "collect file evidence" },
        },
        {
          iteration: 2,
          kind: "checkpoint",
          checkpointDesc: "fileExists:output.txt",
          verdictPassed: true,
          verdictEvidence: "output.txt exists",
          snapshot: { raw: {} },
        },
      ],
    });
    const runner = new WorkflowRunner(fakeChildRunner(loopResult({
      trajectory: repairedTrajectory,
      checkpointsPassed: 1,
    })));

    const result = await runner.run(createWorkflowSpec({ id: "wf-repair-success", task: task() }));

    expect(result.autonomy.outcome).toBe("self_repaired");
    expect(result.autonomy.repairAttempts[0]).toMatchObject({
      targetAssertion: "fileExists:output.txt",
      reason: "initial assertion failed",
      attempt: 1,
      finalVerdict: "passed",
    });
    expect(result.autonomy.escalations).toEqual([]);
    expect(result.trajectory.autonomy).toEqual(result.autonomy);
  });

  it("escalates when evidence remains insufficient after repair", async () => {
    const assertionTask = task({
      successDef: {
        goal: "File written",
        assertions: [{ kind: "fileExists", path: "output.txt" }],
      },
    });
    const failedAfterRepair = trajectory({
      steps: [
        {
          iteration: 1,
          kind: "recovery",
          recovery: { decision: "repair", reason: "missing file evidence", hint: "rewrite output.txt" },
        },
        {
          iteration: 2,
          kind: "checkpoint",
          checkpointDesc: "fileExists:output.txt",
          verdictPassed: false,
          verdictEvidence: "output.txt missing after repair",
          snapshot: { raw: {} },
        },
      ],
    });
    const runner = new WorkflowRunner(fakeChildRunner(loopResult({
      trajectory: failedAfterRepair,
      checkpointsPassed: 0,
    })));

    const budgetResult = await runner.run(createWorkflowSpec({ id: "wf-repair-insufficient", task: assertionTask }));

    expect(budgetResult.exitReason).toBe("verified_failure");
    expect(budgetResult.autonomy.outcome).toBe("escalated");
    expect(budgetResult.autonomy.repairAttempts[0]).toMatchObject({
      targetAssertion: "fileExists:output.txt",
      finalVerdict: "failed",
    });
    expect(budgetResult.autonomy.escalations[0]).toMatchObject({
      reason: "evidence_insufficient_after_retry",
    });
  });

  it("does not mark workflow verdict passed when a verified child fails after a passed checkpoint", async () => {
    const assertionTask = task({
      successDef: {
        goal: "Done",
        assertions: [{ description: "answer visible", signal: "text" }],
      },
    });
    const passedCheckpoint = trajectory({
      steps: [
        {
          iteration: 1,
          kind: "checkpoint",
          checkpointDesc: "answer visible",
          verdictPassed: true,
          verdictEvidence: "observed answer",
          snapshot: { raw: {}, visibleText: "answer" },
        },
      ],
    });
    const runner = new WorkflowRunner(
      fakeChildRunner(loopResult({ exitReason: "error", trajectory: passedCheckpoint, checkpointsPassed: 1 })),
    );
    const events: Array<{ kind: string; passed?: boolean }> = [];

    const result = await runner.run(createWorkflowSpec({ id: "wf-child-error-after-checkpoint", task: assertionTask }), (event) =>
      events.push(event),
    );

    expect(result.exitReason).toBe("child_error");
    expect(events.find((event) => event.kind === "workflow_verdict")).toMatchObject({ passed: false });
  });

  it("passes maxIterationsPerRun to the child runner", async () => {
    let observedMaxIterations: number | undefined;
    const runner = new WorkflowRunner({
      async runChild(_child, options) {
        observedMaxIterations = options?.maxIterations;
        return loopResult({ iterations: 1 });
      },
    });

    await runner.run(
      createWorkflowSpec({
        id: "wf-pass-max-iterations",
        task: task(),
        budget: { maxIterationsPerRun: 3 },
      }),
    );

    expect(observedMaxIterations).toBe(3);
  });

  it("passes per-run tool, wall-time, recovery, and provider cost budgets to the child runner", async () => {
    let observedOptions: Parameters<WorkflowChildRunner["runChild"]>[1];
    const runner = new WorkflowRunner({
      async runChild(_child, options) {
        observedOptions = options;
        return loopResult({ iterations: 1 });
      },
    });

    await runner.run(
      createWorkflowSpec({
        id: "wf-pass-child-budget",
        task: task(),
        budget: {
          maxIterationsPerRun: 3,
          maxToolCallsPerRun: 4,
          maxTokenEstimatePerRun: 100,
          maxProviderCostUsdPerRun: 0.25,
          timeoutMs: 5_000,
          maxRecoveryAttemptsPerRun: 2,
        },
      }),
    );

    expect(observedOptions).toMatchObject({
      maxIterations: 3,
      maxToolCalls: 4,
      maxTokenEstimate: 100,
      maxProviderCostUsd: 0.25,
      maxWallTimeMs: 5_000,
      maxRecoveryAttempts: 2,
    });
  });

  it("creates and cleans isolated workspaces when workflow isolation is enabled", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "keigent-workflow-isolation-"));
    let childWorkspace: string | undefined;
    const runner = new WorkflowRunner({
      async runChild(_child, options) {
        childWorkspace = options?.workspacePath;
        await writeFile(join(childWorkspace!, "result.txt"), "ok", "utf8");
        return loopResult({ trajectory: trajectory({ steps: [{ iteration: 1, kind: "text_output", text: "done" }] }) });
      },
    });

    const result = await runner.run(createWorkflowSpec({
      id: "wf-isolated-success",
      task: task(),
      workspaceIsolation: { rootDir, cleanupMode: "remove" },
    }));

    expect(childWorkspace).toContain("ws_wf_isolated_success_worker_1");
    expect(result.childRuns[0]?.workspace).toMatchObject({
      workspaceId: "ws_wf_isolated_success_worker_1",
      status: "active",
      cleanupMode: "remove",
      artifacts: [expect.objectContaining({ relativePath: "result.txt" })],
      conflicts: [],
    });
    await expect(access(childWorkspace!)).rejects.toThrow();
  });

  it("marks isolated workspaces abandoned when a child times out", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "keigent-workflow-abandoned-"));
    let childWorkspace: string | undefined;
    const runner = new WorkflowRunner({
      async runChild(_child, options) {
        childWorkspace = options?.workspacePath;
        await writeFile(join(childWorkspace!, "partial.txt"), "partial", "utf8");
        await new Promise((resolve) => setTimeout(resolve, 5));
        return loopResult();
      },
    });

    const result = await runner.run(createWorkflowSpec({
      id: "wf-isolated-timeout",
      task: task(),
      budget: { timeoutMs: 1 },
      workspaceIsolation: { rootDir, cleanupMode: "mark_abandoned" },
    }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(result.exitReason).toBe("timeout");
    expect(result.childRuns[0]?.workspace).toMatchObject({
      workspaceId: "ws_wf_isolated_timeout_worker_1",
      status: "abandoned",
      cleanupMode: "mark_abandoned",
      abandonedReason: "workflow timeout",
      artifacts: [expect.objectContaining({ relativePath: "partial.txt" })],
    });
    await expect(access(childWorkspace!)).resolves.toBeUndefined();
    await expect(readFile(join(childWorkspace!, ".keigent-workspace.json"), "utf8")).resolves.toContain("\"status\": \"abandoned\"");
  });

  it("marks budget_exceeded when aggregate priced provider cost exceeds the workflow budget", async () => {
    const child = loopResult({
      providerUsage: {
        inputTokens: 100,
        outputTokens: 25,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 125,
        costUsd: 0.3,
        costStatus: "priced",
      },
    });
    child.trajectory.providerUsage = child.providerUsage;
    const runner = new WorkflowRunner(fakeChildRunner(child));

    const result = await runner.run(
      createWorkflowSpec({
        id: "wf-provider-cost-budget",
        task: task(),
        budget: { maxAggregateProviderCostUsd: 0.2 },
      }),
    );

    expect(result.exitReason).toBe("budget_exceeded");
    expect(result.budgetUsage.providerUsage).toMatchObject({ costUsd: 0.3, costStatus: "priced" });
    expect(result.evidence).toContainEqual(
      expect.objectContaining({
        kind: "budget",
        passed: false,
        message: expect.stringContaining("maxAggregateProviderCostUsd"),
      }),
    );
  });

  it("marks budget_exceeded when a child result exceeds maxIterationsPerRun", async () => {
    const childTrajectory = trajectory({
      steps: [{ iteration: 2, kind: "text_output", text: "late done" }],
    });
    const child = loopResult({ iterations: 2, trajectory: childTrajectory });
    const runner = new WorkflowRunner(fakeChildRunner(child));
    const events: Array<{ kind: string; exitReason?: string }> = [];

    const result = await runner.run(
      createWorkflowSpec({
        id: "wf-per-run-iteration-budget",
        task: task(),
        budget: {
          maxIterationsPerRun: 1,
          maxAggregateIterations: 10,
        },
      }),
      (event) => events.push(event),
    );

    expect(result.exitReason).toBe("budget_exceeded");
    expect(result.childRuns).toHaveLength(1);
    expect(result.childRuns[0]?.result).toBe(child);
    expect(result.childRuns[0]?.trajectory).toBe(childTrajectory);
    expect(result.trajectory.childRuns[0]?.trajectory).toBe(childTrajectory);
    expect(result.evidence).toContainEqual(
      expect.objectContaining({
        kind: "budget",
        passed: false,
        message: expect.stringContaining("maxIterationsPerRun"),
      }),
    );
    expect(events.filter((event) => event.kind === "workflow_done")).toHaveLength(1);
    expect(events[events.length - 1]).toMatchObject({
      kind: "workflow_done",
      exitReason: "budget_exceeded",
    });
  });

  it("keeps verified-loop verdict false when checkpoint passes but per-run budget is exceeded", async () => {
    const assertionTask = task({
      successDef: {
        goal: "Done",
        assertions: [{ description: "answer visible", signal: "text" }],
      },
    });
    const passedCheckpoint = trajectory({
      steps: [
        {
          iteration: 2,
          kind: "checkpoint",
          checkpointDesc: "answer visible",
          verdictPassed: true,
          verdictEvidence: "observed answer",
          snapshot: { raw: {}, visibleText: "answer" },
        },
      ],
    });
    const child = loopResult({ iterations: 2, trajectory: passedCheckpoint, checkpointsPassed: 1 });
    const runner = new WorkflowRunner(fakeChildRunner(child));
    const events: Array<{ kind: string; passed?: boolean; evidence?: unknown[]; exitReason?: string }> = [];

    const result = await runner.run(
      createWorkflowSpec({
        id: "wf-verified-budget-exceeded",
        task: assertionTask,
        budget: { maxIterationsPerRun: 1, maxAggregateIterations: 10 },
      }),
      (event) => events.push(event),
    );

    expect(result.exitReason).toBe("budget_exceeded");
    expect(result.evidence).toContainEqual(
      expect.objectContaining({
        kind: "budget",
        passed: false,
        sourceChildRunId: "wf-verified-budget-exceeded:worker-1",
        message: expect.stringContaining("maxIterationsPerRun"),
      }),
    );
    expect(events.find((event) => event.kind === "workflow_verdict")).toMatchObject({
      passed: false,
      evidence: expect.arrayContaining([
        expect.objectContaining({
          kind: "budget",
          passed: false,
          sourceChildRunId: "wf-verified-budget-exceeded:worker-1",
        }),
      ]),
    });
  });

  it("enforces child, iteration, tool-call, and timeout budgets", async () => {
    const child = loopResult({
      iterations: 2,
      totalToolCalls: 3,
      trajectory: trajectory({
        steps: [
          { iteration: 1, kind: "tool_call", toolName: "a", toolArgs: {}, toolResult: "ok", toolSucceeded: true },
          { iteration: 1, kind: "tool_call", toolName: "b", toolArgs: {}, toolResult: "ok", toolSucceeded: true },
          { iteration: 1, kind: "tool_call", toolName: "c", toolArgs: {}, toolResult: "ok", toolSucceeded: true },
        ],
      }),
    });

    const maxChildRunsRunner = new WorkflowRunner(fakeChildRunner(child));
    await expect(
      maxChildRunsRunner.run(createWorkflowSpec({ id: "wf-child-budget", task: task(), budget: { maxChildRuns: 0 } })),
    ).resolves.toMatchObject({ exitReason: "budget_exceeded", childRuns: [] });

    const iterationRunner = new WorkflowRunner(fakeChildRunner(child));
    await expect(
      iterationRunner.run(
        createWorkflowSpec({ id: "wf-iteration-budget", task: task(), budget: { maxAggregateIterations: 1 } }),
      ),
    ).resolves.toMatchObject({ exitReason: "budget_exceeded" });

    const toolRunner = new WorkflowRunner(fakeChildRunner(child));
    await expect(
      toolRunner.run(createWorkflowSpec({ id: "wf-tool-budget", task: task(), budget: { maxAggregateToolCalls: 2 } })),
    ).resolves.toMatchObject({ exitReason: "budget_exceeded" });

    const recoveryRunner = new WorkflowRunner(fakeChildRunner(loopResult({
      trajectory: trajectory({
        steps: [
          { iteration: 1, kind: "recovery", recovery: { decision: "retry" } },
          { iteration: 2, kind: "recovery", recovery: { decision: "repair", hint: "collect evidence" } },
        ],
      }),
    })));
    await expect(
      recoveryRunner.run(createWorkflowSpec({ id: "wf-recovery-budget", task: task(), budget: { maxRecoveryAttemptsPerRun: 1 } })),
    ).resolves.toMatchObject({
      exitReason: "budget_exceeded",
      budgetUsage: { recoveryAttempts: 2 },
    });

    const tokenRunner = new WorkflowRunner(fakeChildRunner(loopResult({ estimatedTokens: 101 })));
    await expect(
      tokenRunner.run(createWorkflowSpec({ id: "wf-token-budget", task: task(), budget: { maxTokenEstimatePerRun: 100 } })),
    ).resolves.toMatchObject({
      exitReason: "budget_exceeded",
      budgetUsage: { tokenEstimate: 101 },
    });

    const timeoutRunner = new WorkflowRunner({
      async runChild() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return child;
      },
    });
    await expect(
      timeoutRunner.run(createWorkflowSpec({ id: "wf-timeout", task: task(), budget: { timeoutMs: 1 } })),
    ).resolves.toMatchObject({ exitReason: "timeout" });
  });

  it("ignores late child progress after a timeout so workflow_done remains terminal", async () => {
    const runner = new WorkflowRunner({
      async runChild(_child, options) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        options?.onProgress?.({ kind: "text", iteration: 1, text: "late event" });
        return loopResult();
      },
    });
    const events: Array<{ kind: string }> = [];

    await runner.run(createWorkflowSpec({ id: "wf-late-timeout", task: task(), budget: { timeoutMs: 1 } }), (event) =>
      events.push(event),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(events[events.length - 1]).toMatchObject({ kind: "workflow_done", exitReason: "timeout" });
    expect(events.some((event, index) => index > events.findIndex((item) => item.kind === "workflow_done"))).toBe(false);
  });

  it("aborts the child runner signal on timeout", async () => {
    let observedSignal: AbortSignal | undefined;
    const runner = new WorkflowRunner({
      async runChild(_child, options) {
        observedSignal = options?.signal;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return loopResult();
      },
    });

    await runner.run(createWorkflowSpec({ id: "wf-timeout-abort", task: task(), budget: { timeoutMs: 1 } }));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(observedSignal?.aborted).toBe(true);
  });
});
