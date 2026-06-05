import type { LoopResult, ProgressEvent, Task, Trajectory } from "../types.js";
import type {
  ChildRunResult,
  ChildRunSpec,
  WorkflowBudgetUsage,
  WorkflowEvent,
  WorkflowEvidence,
  WorkflowExitReason,
  WorkflowProgressCallback,
  WorkflowResult,
  WorkflowSpec,
  WorkflowTrajectory,
} from "./types.js";

export interface WorkflowChildRunner {
  runChild(
    child: ChildRunSpec,
    options?: { onProgress?: (event: ProgressEvent) => void; maxIterations?: number; signal?: AbortSignal },
  ): Promise<LoopResult>;
}

export class WorkflowRunner {
  constructor(private readonly childRunner: WorkflowChildRunner) {}

  async run(spec: WorkflowSpec, onProgress?: WorkflowProgressCallback): Promise<WorkflowResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const events: WorkflowEvent[] = [];
    let terminalEmitted = false;
    const emit = (event: WorkflowEvent): void => {
      if (terminalEmitted) return;
      events.push(event);
      onProgress?.(event);
      if (event.kind === "workflow_done") {
        terminalEmitted = true;
      }
    };

    emit({ kind: "workflow_start", workflowId: spec.id, mode: spec.mode, goal: spec.goal });

    if (spec.budget.maxChildRuns < 1) {
      const durationMs = Date.now() - startMs;
      return this.finish({
        spec,
        startedAt,
        durationMs,
        exitReason: "budget_exceeded",
        finalResponse: "[workflow] budget exceeded before starting child runs",
        childRuns: [],
        evidence: [budgetEvidence("maxChildRuns exceeded before starting child run")],
        events,
        emit,
      });
    }

    const child: ChildRunSpec = {
      id: `${spec.id}:worker-1`,
      role: "worker",
      task: spec.rootTask,
      policy: spec.policy,
    };

    emit({ kind: "child_start", workflowId: spec.id, childRunId: child.id, role: child.role });

    let childResult: LoopResult;
    let timedOut = false;
    const abortController = new AbortController();
    try {
      childResult = await withTimeout(
        this.childRunner.runChild(child, {
          maxIterations: spec.budget.maxIterationsPerRun,
          signal: abortController.signal,
          onProgress: (event) => emit({ kind: "child_event", workflowId: spec.id, childRunId: child.id, event }),
        }),
        spec.budget.timeoutMs,
        abortController,
      );
    } catch (error) {
      timedOut = isTimeoutError(error);
      childResult = makeSyntheticErrorLoopResult(spec.rootTask, timedOut ? "[workflow] timeout" : errorMessage(error));
    }

    const childRun: ChildRunResult = {
      id: child.id,
      role: child.role,
      result: childResult,
      trajectory: childResult.trajectory,
    };

    emit({ kind: "child_done", workflowId: spec.id, childRunId: child.id, exitReason: childResult.exitReason });

    const durationMs = Date.now() - startMs;
    const budgetUsage = computeBudgetUsage([childRun], durationMs);
    const budgetExit = findBudgetExit(spec, budgetUsage);
    const verification = evaluateVerification(spec, childRun);
    const mappedExit = timedOut
      ? "timeout"
      : budgetExit ?? mapChildExit(childResult.exitReason, spec, verification.passed);

    if (spec.mode === "verified-loop") {
      emit({ kind: "workflow_verdict", workflowId: spec.id, passed: verification.passed, evidence: verification.evidence });
    }

    return this.finish({
      spec,
      startedAt,
      durationMs,
      exitReason: mappedExit,
      finalResponse: childResult.finalResponse,
      childRuns: [childRun],
      evidence: [...verification.evidence, ...(budgetExit ? [budgetEvidence(`budget exceeded: ${budgetExit}`)] : [])],
      events,
      emit,
      budgetUsage,
    });
  }

  private finish(input: {
    spec: WorkflowSpec;
    startedAt: string;
    durationMs: number;
    exitReason: WorkflowExitReason;
    finalResponse: string;
    childRuns: ChildRunResult[];
    evidence: WorkflowEvidence[];
    events: WorkflowEvent[];
    emit: (event: WorkflowEvent) => void;
    budgetUsage?: WorkflowBudgetUsage;
  }): WorkflowResult {
    input.emit({ kind: "workflow_done", workflowId: input.spec.id, exitReason: input.exitReason });
    const budgetUsage = input.budgetUsage ?? computeBudgetUsage(input.childRuns, input.durationMs);
    const trajectory: WorkflowTrajectory = {
      schemaVersion: 1,
      workflowId: input.spec.id,
      mode: input.spec.mode,
      goal: input.spec.goal,
      rootTask: input.spec.rootTask,
      startedAt: input.startedAt,
      durationMs: input.durationMs,
      exitReason: input.exitReason,
      finalResponse: input.finalResponse,
      budget: input.spec.budget,
      budgetUsage,
      evidence: input.evidence,
      events: input.events,
      childRuns: input.childRuns.map((child) => ({
        id: child.id,
        role: child.role,
        result: child.result,
        trajectory: child.trajectory,
      })),
    };

    return {
      workflowId: input.spec.id,
      mode: input.spec.mode,
      exitReason: input.exitReason,
      finalResponse: input.finalResponse,
      childRuns: input.childRuns,
      evidence: input.evidence,
      budget: input.spec.budget,
      budgetUsage,
      durationMs: input.durationMs,
      trajectory,
    };
  }
}

function evaluateVerification(spec: WorkflowSpec, childRun: ChildRunResult): { passed: boolean; evidence: WorkflowEvidence[] } {
  if (spec.mode !== "verified-loop") return { passed: true, evidence: [] };

  const checkpointEvidence = collectCheckpointEvidence(childRun);
  const minPassed = Math.max(1, spec.verification?.minPassedCheckpoints ?? 1);
  const passedCount = checkpointEvidence.filter((item) => item.passed).length;
  const childSucceeded = childRun.result.exitReason === "success";
  const childResultEvidence: WorkflowEvidence[] = childSucceeded
    ? []
    : [
        {
          kind: "child_result",
          passed: false,
          message: `child exited with ${childRun.result.exitReason}`,
          sourceChildRunId: childRun.id,
        },
      ];
  const passed = childSucceeded && passedCount >= minPassed;

  if (checkpointEvidence.length === 0) {
    return {
      passed: false,
      evidence: [
        {
          kind: "checkpoint",
          passed: false,
          message: "no checkpoint verdict evidence produced by child run",
          sourceChildRunId: childRun.id,
        },
        ...childResultEvidence,
      ],
    };
  }

  return { passed, evidence: [...checkpointEvidence, ...childResultEvidence] };
}

function collectCheckpointEvidence(childRun: ChildRunResult): WorkflowEvidence[] {
  return (childRun.trajectory?.steps ?? [])
    .filter((step) => step.kind === "checkpoint")
    .map((step) => ({
      kind: "checkpoint" as const,
      passed: step.verdictPassed === true,
      message: step.verdictEvidence ?? "checkpoint verdict missing",
      sourceChildRunId: childRun.id,
      assertion: step.checkpointDesc,
    }));
}

function mapChildExit(
  exitReason: LoopResult["exitReason"],
  spec: WorkflowSpec,
  verificationPassed: boolean,
): WorkflowExitReason {
  switch (exitReason) {
    case "success":
      return spec.mode === "verified-loop" && !verificationPassed ? "verified_failure" : "success";
    case "error":
      return "child_error";
    case "max_iterations":
      return "max_iterations";
    case "escalated":
      return "child_escalated";
  }
}

function computeBudgetUsage(childRuns: ChildRunResult[], durationMs: number): WorkflowBudgetUsage {
  return {
    childRuns: childRuns.length,
    iterations: childRuns.reduce((sum, child) => sum + child.result.iterations, 0),
    toolCalls: childRuns.reduce((sum, child) => sum + countNormalToolCalls(child.result), 0),
    checkpointsPassed: childRuns.reduce((sum, child) => sum + child.result.checkpointsPassed, 0),
    durationMs,
  };
}

function countNormalToolCalls(result: LoopResult): number {
  return result.trajectory?.steps.filter((step) => step.kind === "tool_call").length ?? result.totalToolCalls;
}

function findBudgetExit(spec: WorkflowSpec, usage: WorkflowBudgetUsage): WorkflowExitReason | undefined {
  if (usage.childRuns > spec.budget.maxChildRuns) return "budget_exceeded";
  if (usage.iterations > (spec.budget.maxAggregateIterations ?? Number.POSITIVE_INFINITY)) return "budget_exceeded";
  if (usage.toolCalls > (spec.budget.maxAggregateToolCalls ?? Number.POSITIVE_INFINITY)) return "budget_exceeded";
  if (usage.durationMs > (spec.budget.timeoutMs ?? Number.POSITIVE_INFINITY)) return "timeout";
  return undefined;
}

function budgetEvidence(message: string): WorkflowEvidence {
  return { kind: "budget", passed: false, message };
}

class WorkflowTimeoutError extends Error {
  constructor() {
    super("workflow child run timed out");
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs?: number, abortController?: AbortController): Promise<T> {
  if (!timeoutMs) return promise;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      abortController?.abort();
      reject(new WorkflowTimeoutError());
    }, timeoutMs);
    timer.unref?.();
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof WorkflowTimeoutError;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeSyntheticErrorLoopResult(task: Task, message: string): LoopResult {
  const trajectory: Trajectory = {
    task,
    profile: task.profile,
    exitReason: "error",
    steps: [{ iteration: 0, kind: "error", errorMessage: message }],
    finalResponse: message,
    durationMs: 0,
    skillsUsed: [],
  };

  return {
    exitReason: "error",
    finalResponse: message,
    iterations: 0,
    checkpointsPassed: 0,
    totalToolCalls: 0,
    trajectory,
  };
}
