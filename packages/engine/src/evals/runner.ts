import type { EvalCase, EvalCaseResult, EvalExecutor, EvalFailureCode, EvalReport } from "./types.js";
import type { ExitReason, LoopResult, TrajectoryStep } from "../types.js";

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function toolCallSteps(result: LoopResult): Array<TrajectoryStep & { toolName: string }> {
  return result.trajectory.steps.filter(
    (step): step is TrajectoryStep & { toolName: string } => step.kind === "tool_call" && typeof step.toolName === "string",
  );
}

export function toolsUsedFromResult(result: LoopResult): string[] {
  return unique(toolCallSteps(result).map((step) => step.toolName));
}

export function successfulToolsUsedFromResult(result: LoopResult): string[] {
  return unique(toolCallSteps(result).filter((step) => step.toolSucceeded === true).map((step) => step.toolName));
}

function addFailure(failures: string[], failureCodes: EvalFailureCode[], code: EvalFailureCode, message: string): void {
  failures.push(message);
  failureCodes.push(code);
}

function evaluateCase(evalCase: EvalCase, execution: { selectedProfile?: string; result: LoopResult }, durationMs: number): EvalCaseResult {
  const { result, selectedProfile } = execution;
  const acceptance = evalCase.acceptance;
  const toolsUsed = toolsUsedFromResult(result);
  const successfulToolsUsed = successfulToolsUsedFromResult(result);
  const failures: string[] = [];
  const failureCodes: EvalFailureCode[] = [];

  const profileMatched = evalCase.expectedProfile
    ? selectedProfile === evalCase.expectedProfile
    : null;
  if (profileMatched === false) {
    addFailure(failures, failureCodes, "profile_mismatch", `expected profile ${evalCase.expectedProfile}, got ${selectedProfile ?? "(none)"}`);
  }

  const acceptedExitReasons = acceptance.exitReasons ?? ["success"];
  if (!acceptedExitReasons.includes(result.exitReason)) {
    addFailure(failures, failureCodes, "exit_reason", `exit reason ${result.exitReason} not in accepted reasons: ${acceptedExitReasons.join(", ")}`);
  }

  for (const toolName of acceptance.requiredTools ?? []) {
    if (!successfulToolsUsed.includes(toolName)) {
      addFailure(failures, failureCodes, "tool_missing", `required tool ${toolName} was not used successfully`);
    }
  }

  for (const toolName of acceptance.forbiddenTools ?? []) {
    if (toolsUsed.includes(toolName)) {
      addFailure(failures, failureCodes, "tool_forbidden", `forbidden tool ${toolName} was used`);
    }
  }

  const minCheckpoints = acceptance.minCheckpoints ?? 0;
  if (result.checkpointsPassed < minCheckpoints) {
    addFailure(failures, failureCodes, "checkpoint_missing", `expected at least ${minCheckpoints} passed checkpoints, got ${result.checkpointsPassed}`);
  }

  for (const expectedText of acceptance.finalResponseIncludes ?? []) {
    if (!result.finalResponse.includes(expectedText)) {
      addFailure(failures, failureCodes, "output_missing", `final response missing expected text: ${expectedText}`);
    }
  }

  return {
    id: evalCase.id,
    title: evalCase.title,
    category: evalCase.category,
    passed: failures.length === 0,
    selectedProfile,
    expectedProfile: evalCase.expectedProfile,
    profileMatched,
    exitReason: result.exitReason,
    iterations: result.iterations,
    checkpointsPassed: result.checkpointsPassed,
    totalToolCalls: result.totalToolCalls,
    toolsUsed,
    successfulToolsUsed,
    durationMs,
    failures,
    failureCodes,
    finalResponse: result.finalResponse,
  };
}

function errorResult(evalCase: EvalCase, error: unknown, durationMs: number): EvalCaseResult {
  const message = error instanceof Error ? error.message : String(error);
  const isTimeout = error instanceof Error && error.name === "EvalTimeoutError";
  return {
    id: evalCase.id,
    title: evalCase.title,
    category: evalCase.category,
    passed: false,
    expectedProfile: evalCase.expectedProfile,
    profileMatched: evalCase.expectedProfile ? false : null,
    exitReason: "error" as ExitReason,
    iterations: 0,
    checkpointsPassed: 0,
    totalToolCalls: 0,
    toolsUsed: [],
    successfulToolsUsed: [],
    durationMs,
    failures: [isTimeout ? message : `executor error: ${message}`],
    failureCodes: [isTimeout ? "timeout" : "executor_error"],
    finalResponse: "",
  };
}

class EvalTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`executor timeout after ${timeoutMs}ms`);
    this.name = "EvalTimeoutError";
  }
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (timeoutMs === undefined) return promise;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new EvalTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function buildEvalReport(cases: EvalCaseResult[], durationMs: number, startedAt: string): EvalReport {
  const passed = cases.filter((c) => c.passed).length;
  const profileChecked = cases.filter((c) => c.profileMatched !== null);
  const profileAccuracy = profileChecked.length === 0
    ? null
    : profileChecked.filter((c) => c.profileMatched === true).length / profileChecked.length;

  const failuresByCode = cases.flatMap((c) => c.failureCodes).reduce<Partial<Record<EvalFailureCode, number>>>((acc, code) => {
    acc[code] = (acc[code] ?? 0) + 1;
    return acc;
  }, {});

  return {
    startedAt,
    durationMs,
    total: cases.length,
    passed,
    failed: cases.length - passed,
    profileAccuracy,
    failuresByCode,
    cases,
  };
}

export async function runEvalCases(evalCases: EvalCase[], executor: EvalExecutor): Promise<EvalReport> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const results: EvalCaseResult[] = [];

  for (const evalCase of evalCases) {
    const caseStarted = Date.now();
    try {
      const execution = await runWithTimeout(executor.run(evalCase), evalCase.timeoutMs);
      results.push(evaluateCase(evalCase, execution, Date.now() - caseStarted));
    } catch (error) {
      results.push(errorResult(evalCase, error, Date.now() - caseStarted));
    }
  }

  return buildEvalReport(results, Date.now() - started, startedAt);
}
