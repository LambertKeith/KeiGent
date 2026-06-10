import { describeAssertion, evaluateAssertions } from "../assertions.js";
import { buildEvidenceBundle } from "../evidence.js";
import { failureSummaryForWorkflowExit } from "../failures.js";
import type { Assertion, LoopResult, ProgressEvent, ProviderUsageSummary, Task, Trajectory } from "../types.js";
import { addProviderUsage } from "../provider-usage.js";
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
    options?: WorkflowChildRunOptions,
  ): Promise<LoopResult>;
}

export interface WorkflowChildRunOptions {
  onProgress?: (event: ProgressEvent) => void;
  maxIterations?: number;
  maxToolCalls?: number;
  maxTokenEstimate?: number;
  maxProviderCostUsd?: number;
  maxWallTimeMs?: number;
  maxRecoveryAttempts?: number;
  signal?: AbortSignal;
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

    if (spec.mode === "reviewed-loop") {
      return this.runReviewedLoop({ spec, startedAt, startMs, events, emit });
    }

    const child: ChildRunSpec = {
      id: `${spec.id}:worker-1`,
      role: "worker",
      task: spec.rootTask,
      policy: spec.policy,
    };

    const { childRun, timedOut } = await this.executeChild(spec, child, emit);

    const durationMs = Date.now() - startMs;
    const budgetUsage = computeBudgetUsage([childRun], durationMs);
    const budgetFailure = findBudgetFailure(spec, budgetUsage, [childRun]);
    const verification = evaluateVerification(spec, childRun);
    const mappedExit = timedOut
      ? "timeout"
      : budgetFailure?.exitReason ?? mapChildExit(childRun.result.exitReason, spec, verification.passed);

    const budgetEvidenceItem = budgetFailure ? budgetEvidence(budgetFailure.message, budgetFailure.sourceChildRunId) : undefined;
    const workflowEvidence = [...verification.evidence, ...(budgetEvidenceItem ? [budgetEvidenceItem] : [])];

    if (spec.mode === "verified-loop") {
      emit({
        kind: "workflow_verdict",
        workflowId: spec.id,
        passed: verification.passed && !budgetFailure,
        evidence: workflowEvidence,
      });
    }

    return this.finish({
      spec,
      startedAt,
      durationMs,
      exitReason: mappedExit,
      finalResponse: childRun.result.finalResponse,
      childRuns: [childRun],
      evidence: workflowEvidence,
      events,
      emit,
      budgetUsage,
    });
  }

  private async runReviewedLoop(input: {
    spec: WorkflowSpec;
    startedAt: string;
    startMs: number;
    events: WorkflowEvent[];
    emit: (event: WorkflowEvent) => void;
  }): Promise<WorkflowResult> {
    const worker: ChildRunSpec = {
      id: `${input.spec.id}:worker-1`,
      role: "worker",
      task: input.spec.rootTask,
      policy: input.spec.policy,
    };
    const workerRun = await this.executeChild(input.spec, worker, input.emit);

    const reviewer: ChildRunSpec = {
      id: `${input.spec.id}:reviewer-1`,
      role: "reviewer",
      task: {
        ...input.spec.rootTask,
        goal: `${input.spec.goal}\n\nReview worker result:\n${workerRun.childRun.result.finalResponse}`,
      },
      policy: {
        ...input.spec.policy,
        verifierReadonly: true,
        allowExternalSideEffects: false,
      },
    };
    const reviewerRun = await this.executeChild(input.spec, reviewer, input.emit);

    const childRuns = [workerRun.childRun, reviewerRun.childRun];
    const durationMs = Date.now() - input.startMs;
    const budgetUsage = computeBudgetUsage(childRuns, durationMs);
    const budgetFailure = findBudgetFailure(input.spec, budgetUsage, childRuns);
    const review = evaluateReviewedLoop(workerRun.childRun, reviewerRun.childRun);
    const timedOut = workerRun.timedOut || reviewerRun.timedOut;
    const exitReason = timedOut
      ? "timeout"
      : budgetFailure?.exitReason
        ?? (workerRun.childRun.result.exitReason !== "success"
          ? mapChildExit(workerRun.childRun.result.exitReason, input.spec, review.passed)
          : reviewerRun.childRun.result.exitReason !== "success"
            ? mapChildExit(reviewerRun.childRun.result.exitReason, input.spec, review.passed)
            : review.passed ? "success" : "verified_failure");
    const budgetEvidenceItem = budgetFailure ? budgetEvidence(budgetFailure.message, budgetFailure.sourceChildRunId) : undefined;
    const workflowEvidence = [...review.evidence, ...(budgetEvidenceItem ? [budgetEvidenceItem] : [])];

    input.emit({
      kind: "workflow_verdict",
      workflowId: input.spec.id,
      passed: review.passed && !budgetFailure && !timedOut,
      evidence: workflowEvidence,
    });

    return this.finish({
      spec: input.spec,
      startedAt: input.startedAt,
      durationMs,
      exitReason,
      finalResponse: `${workerRun.childRun.result.finalResponse}\n\n[review]\n${reviewerRun.childRun.result.finalResponse}`,
      childRuns,
      evidence: workflowEvidence,
      events: input.events,
      emit: input.emit,
      budgetUsage,
    });
  }

  private async executeChild(
    spec: WorkflowSpec,
    child: ChildRunSpec,
    emit: (event: WorkflowEvent) => void,
  ): Promise<{ childRun: ChildRunResult; timedOut: boolean }> {
    emit({ kind: "child_start", workflowId: spec.id, childRunId: child.id, role: child.role });

    let childResult: LoopResult;
    let timedOut = false;
    const abortController = new AbortController();
    try {
      childResult = await withTimeout(
        this.childRunner.runChild(child, {
          maxIterations: spec.budget.maxIterationsPerRun,
          maxToolCalls: spec.budget.maxToolCallsPerRun ?? spec.budget.maxAggregateToolCalls,
          maxTokenEstimate: spec.budget.maxTokenEstimatePerRun ?? spec.budget.maxAggregateTokenEstimate,
          maxProviderCostUsd: spec.budget.maxProviderCostUsdPerRun ?? spec.budget.maxAggregateProviderCostUsd,
          maxWallTimeMs: spec.budget.timeoutMs,
          maxRecoveryAttempts: spec.budget.maxRecoveryAttemptsPerRun,
          signal: abortController.signal,
          onProgress: (event) => emit({ kind: "child_event", workflowId: spec.id, childRunId: child.id, event }),
        }),
        spec.budget.timeoutMs,
        abortController,
      );
    } catch (error) {
      timedOut = isTimeoutError(error);
      childResult = makeSyntheticErrorLoopResult(child.task, timedOut ? "[workflow] timeout" : errorMessage(error));
    }

    const childRun: ChildRunResult = {
      id: child.id,
      role: child.role,
      result: childResult,
      trajectory: childResult.trajectory,
    };

    emit({ kind: "child_done", workflowId: spec.id, childRunId: child.id, exitReason: childResult.exitReason });
    return { childRun, timedOut };
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
    const failure = failureSummaryForWorkflowExit(input.exitReason);
    input.emit({ kind: "workflow_done", workflowId: input.spec.id, exitReason: input.exitReason, ...(failure ? { failure } : {}) });
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
      ...(failure ? { failure } : {}),
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
      ...(failure ? { failure } : {}),
    };
  }
}

function evaluateVerification(spec: WorkflowSpec, childRun: ChildRunResult): { passed: boolean; evidence: WorkflowEvidence[] } {
  if (spec.mode !== "verified-loop") return { passed: true, evidence: [] };

  const checkpointEvidence = collectCheckpointEvidence(childRun);
  const assertionEvidence = collectAssertionEvidence(spec, childRun);
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
  const assertionsPassed = assertionEvidence.length === 0 || assertionEvidence.every((item) => item.passed);
  const passed = childSucceeded && passedCount >= minPassed && assertionsPassed;

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
        ...assertionEvidence,
        ...childResultEvidence,
      ],
    };
  }

  return { passed, evidence: [...checkpointEvidence, ...assertionEvidence, ...childResultEvidence] };
}

function collectAssertionEvidence(spec: WorkflowSpec, childRun: ChildRunResult): WorkflowEvidence[] {
  const assertions = deterministicAssertions(spec.rootTask.successDef?.assertions ?? []);
  if (assertions.length === 0 || !childRun.trajectory) return [];

  const bundle = buildEvidenceBundle(childRun.trajectory);
  return evaluateAssertions(assertions, bundle).map((result) => ({
    kind: "assertion" as const,
    passed: result.passed,
    message: result.evidence,
    sourceChildRunId: childRun.id,
    assertion: describeAssertion(result.assertion),
  }));
}

function deterministicAssertions(assertions: Assertion[]): Assertion[] {
  return assertions.filter((assertion) => assertion.kind !== undefined && assertion.kind !== "legacySignal");
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

function evaluateReviewedLoop(workerRun: ChildRunResult, verifierRun: ChildRunResult): { passed: boolean; evidence: WorkflowEvidence[] } {
  const workerSucceeded = workerRun.result.exitReason === "success";
  const verifierSucceeded = verifierRun.result.exitReason === "success";
  const verifierCheckpoints = collectCheckpointEvidence(verifierRun);
  const hasPassedReviewCheckpoint = verifierCheckpoints.some((item) => item.passed);
  const passed = workerSucceeded && verifierSucceeded && hasPassedReviewCheckpoint;

  return {
    passed,
    evidence: [
      {
        kind: "child_result",
        passed: workerSucceeded,
        message: `worker exited with ${workerRun.result.exitReason}`,
        sourceChildRunId: workerRun.id,
      },
      {
        kind: "child_result",
        passed: verifierSucceeded,
        message: verifierSucceeded ? "reviewer exited with success" : `reviewer exited with ${verifierRun.result.exitReason}`,
        sourceChildRunId: verifierRun.id,
      },
      ...(verifierCheckpoints.length > 0
        ? verifierCheckpoints
        : [{
            kind: "checkpoint" as const,
            passed: false,
            message: "reviewer produced no checkpoint verdict",
            sourceChildRunId: verifierRun.id,
          }]),
    ],
  };
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
    case "budget_exceeded":
      return "budget_exceeded";
    case "escalated":
      return "child_escalated";
  }
}

function computeBudgetUsage(childRuns: ChildRunResult[], durationMs: number): WorkflowBudgetUsage {
  return {
    childRuns: childRuns.length,
    iterations: childRuns.reduce((sum, child) => sum + child.result.iterations, 0),
    toolCalls: childRuns.reduce((sum, child) => sum + countNormalToolCalls(child.result), 0),
    tokenEstimate: childRuns.reduce((sum, child) => sum + (child.result.estimatedTokens ?? child.trajectory?.estimatedTokens ?? 0), 0),
    providerUsage: aggregateProviderUsage(childRuns),
    recoveryAttempts: childRuns.reduce((sum, child) => sum + countRecoveryAttempts(child.result), 0),
    checkpointsPassed: childRuns.reduce((sum, child) => sum + child.result.checkpointsPassed, 0),
    durationMs,
  };
}

function aggregateProviderUsage(childRuns: ChildRunResult[]): ProviderUsageSummary | undefined {
  return childRuns.reduce<ProviderUsageSummary | undefined>(
    (sum, child) => addProviderUsage(sum, child.result.providerUsage ?? child.trajectory?.providerUsage),
    undefined,
  );
}

function countNormalToolCalls(result: LoopResult): number {
  return result.trajectory?.steps.filter((step) => step.kind === "tool_call").length ?? result.totalToolCalls;
}

function countRecoveryAttempts(result: LoopResult): number {
  return result.trajectory?.steps.filter((step) => step.kind === "recovery").length ?? 0;
}

function findBudgetFailure(
  spec: WorkflowSpec,
  usage: WorkflowBudgetUsage,
  childRuns: ChildRunResult[],
): { exitReason: WorkflowExitReason; message: string; sourceChildRunId?: string } | undefined {
  if (usage.childRuns > spec.budget.maxChildRuns) {
    return { exitReason: "budget_exceeded", message: "budget exceeded: maxChildRuns" };
  }
  const overIterationChild = childRuns.find((child) => child.result.iterations > spec.budget.maxIterationsPerRun);
  if (overIterationChild) {
    return {
      exitReason: "budget_exceeded",
      message: `budget exceeded: maxIterationsPerRun (${overIterationChild.result.iterations} > ${spec.budget.maxIterationsPerRun})`,
      sourceChildRunId: overIterationChild.id,
    };
  }
  if (usage.iterations > (spec.budget.maxAggregateIterations ?? Number.POSITIVE_INFINITY)) {
    return { exitReason: "budget_exceeded", message: "budget exceeded: maxAggregateIterations" };
  }
  const overToolChild = childRuns.find(
    (child) => countNormalToolCalls(child.result) > (spec.budget.maxToolCallsPerRun ?? Number.POSITIVE_INFINITY),
  );
  if (overToolChild) {
    return {
      exitReason: "budget_exceeded",
      message: `budget exceeded: maxToolCallsPerRun (${countNormalToolCalls(overToolChild.result)} > ${spec.budget.maxToolCallsPerRun})`,
      sourceChildRunId: overToolChild.id,
    };
  }
  if (usage.toolCalls > (spec.budget.maxAggregateToolCalls ?? Number.POSITIVE_INFINITY)) {
    return { exitReason: "budget_exceeded", message: "budget exceeded: maxAggregateToolCalls" };
  }
  const overTokenChild = childRuns.find(
    (child) => (child.result.estimatedTokens ?? child.trajectory?.estimatedTokens ?? 0) > (spec.budget.maxTokenEstimatePerRun ?? Number.POSITIVE_INFINITY),
  );
  if (overTokenChild) {
    const childTokens = overTokenChild.result.estimatedTokens ?? overTokenChild.trajectory?.estimatedTokens ?? 0;
    return {
      exitReason: "budget_exceeded",
      message: `budget exceeded: maxTokenEstimatePerRun (${childTokens} > ${spec.budget.maxTokenEstimatePerRun})`,
      sourceChildRunId: overTokenChild.id,
    };
  }
  if ((usage.tokenEstimate ?? 0) > (spec.budget.maxAggregateTokenEstimate ?? Number.POSITIVE_INFINITY)) {
    return { exitReason: "budget_exceeded", message: "budget exceeded: maxAggregateTokenEstimate" };
  }
  const overCostChild = childRuns.find(
    (child) =>
      (child.result.providerUsage ?? child.trajectory?.providerUsage)?.costStatus === "priced"
      && ((child.result.providerUsage ?? child.trajectory?.providerUsage)?.costUsd ?? 0) > (spec.budget.maxProviderCostUsdPerRun ?? Number.POSITIVE_INFINITY),
  );
  if (overCostChild) {
    const childCost = (overCostChild.result.providerUsage ?? overCostChild.trajectory?.providerUsage)?.costUsd ?? 0;
    return {
      exitReason: "budget_exceeded",
      message: `budget exceeded: maxProviderCostUsdPerRun (${childCost} > ${spec.budget.maxProviderCostUsdPerRun})`,
      sourceChildRunId: overCostChild.id,
    };
  }
  if (usage.providerUsage?.costStatus === "priced" && usage.providerUsage.costUsd > (spec.budget.maxAggregateProviderCostUsd ?? Number.POSITIVE_INFINITY)) {
    return { exitReason: "budget_exceeded", message: "budget exceeded: maxAggregateProviderCostUsd" };
  }
  const overRecoveryChild = childRuns.find(
    (child) => countRecoveryAttempts(child.result) > (spec.budget.maxRecoveryAttemptsPerRun ?? Number.POSITIVE_INFINITY),
  );
  if (overRecoveryChild) {
    return {
      exitReason: "budget_exceeded",
      message: `budget exceeded: maxRecoveryAttemptsPerRun (${countRecoveryAttempts(overRecoveryChild.result)} > ${spec.budget.maxRecoveryAttemptsPerRun})`,
      sourceChildRunId: overRecoveryChild.id,
    };
  }
  if (usage.durationMs > (spec.budget.timeoutMs ?? Number.POSITIVE_INFINITY)) {
    return { exitReason: "timeout", message: "budget exceeded: timeoutMs" };
  }
  return undefined;
}

function budgetEvidence(message: string, sourceChildRunId?: string): WorkflowEvidence {
  return { kind: "budget", passed: false, message, ...(sourceChildRunId ? { sourceChildRunId } : {}) };
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
