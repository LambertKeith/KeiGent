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

  it("runs reviewed-loop as worker followed by readonly verifier with reviewer evidence", async () => {
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
    const verifierTrajectory = trajectory({
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
          : loopResult({ finalResponse: "review passed", checkpointsPassed: 1, trajectory: verifierTrajectory });
      },
    });
    const events: Array<{ kind: string; childRunId?: string; role?: string }> = [];

    const result = await runner.run(
      createWorkflowSpec({ id: "wf-reviewed", task: reviewedTask, mode: "reviewed-loop" }),
      (event) => events.push(event),
    );

    expect(result.exitReason).toBe("success");
    expect(result.childRuns.map((child) => child.role)).toEqual(["worker", "verifier"]);
    expect(seenChildren[1]).toMatchObject({
      id: "wf-reviewed:verifier-1",
      role: "verifier",
      policy: { verifierReadonly: true, allowExternalSideEffects: false },
    });
    expect(events.filter((event) => event.kind === "child_start").map((event) => [event.childRunId, event.role])).toEqual([
      ["wf-reviewed:worker-1", "worker"],
      ["wf-reviewed:verifier-1", "verifier"],
    ]);
    expect(result.evidence).toContainEqual(
      expect.objectContaining({
        kind: "checkpoint",
        passed: true,
        message: "reviewer accepted worker result",
        sourceChildRunId: "wf-reviewed:verifier-1",
      }),
    );
    expect(result.finalResponse).toContain("worker done");
    expect(result.finalResponse).toContain("review passed");
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
