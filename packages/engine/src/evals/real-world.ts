import { buildRunRecordFromWorkflowResult, type RunRecord } from "../run-record.js";
import { failureSummaryForWorkflowExit, recommendedNextActionFor, type FailureCode, type FailureSummary } from "../failures.js";
import type { ProfileName } from "../orchestrator.js";
import type { ApprovalDecision, ApprovalRequest } from "../tools/types.js";
import type { LoopResult, Task, TrajectoryStep } from "../types.js";
import type { ExecutionMode, WorkflowEvidence, WorkflowExitReason, WorkflowResult } from "../workflow/types.js";

export type RealWorldEvalLevel = "L1" | "L2" | "L3";
export type RealWorldEvalCaseExpectedResult = "success" | "failure" | "approval_denied" | "replay";
export type RealWorldEvalCaseResultKind = RealWorldEvalCaseExpectedResult;

export interface RealWorldEvalCase {
  id: string;
  title: string;
  level: RealWorldEvalLevel;
  task: Task;
  expectedProfile: ProfileName;
  expectedWorkflowMode: ExecutionMode;
  expectedResult: RealWorldEvalCaseExpectedResult;
  expectedFailureCode?: FailureCode;
  requiresApproval?: boolean;
  proves: string;
}

export interface RealWorldEvalExecution {
  selectedProfile: ProfileName;
  workflowMode: ExecutionMode;
  result: RealWorldEvalCaseResultKind;
  runRecord: RunRecord;
}

export interface RealWorldEvalExecutor {
  executionMode: "fixture" | "live" | "replay";
  run(testCase: RealWorldEvalCase): Promise<RealWorldEvalExecution>;
}

export interface RealWorldEvalFinding {
  code: "fixture_level" | "empty_dataset" | "false_success" | "missing_evidence" | "risk_noncompliance";
  severity: "info" | "warning" | "blocking";
  message: string;
  caseId?: string;
}

export interface RealWorldEvalCaseResult {
  id: string;
  title: string;
  level: RealWorldEvalLevel;
  expectedProfile: ProfileName;
  selectedProfile: ProfileName;
  expectedWorkflowMode: ExecutionMode;
  workflowMode: ExecutionMode;
  expectedResult: RealWorldEvalCaseExpectedResult;
  expectedFailureCode?: FailureCode;
  result: RealWorldEvalCaseResultKind;
  passed: boolean;
  routeMatched: boolean;
  taskSucceeded: boolean;
  evidenceChecked: boolean;
  riskCompliant: boolean;
  falseSuccess: boolean;
  failures: string[];
  runRecord: RunRecord;
}

export interface RealWorldEvalReport {
  startedAt: string;
  durationMs: number;
  level: RealWorldEvalLevel;
  datasetId: string;
  totals: { total: number; passed: number; failed: number };
  routeAccuracy: number | null;
  taskSuccessRate: number | null;
  evidenceQuality: number | null;
  toolReliability: number | null;
  riskCompliance: number | null;
  falseSuccessCount: number;
  falseConfidenceFindings: RealWorldEvalFinding[];
  cases: RealWorldEvalCaseResult[];
}

export const REAL_WORLD_L2_DATASET_ID = "local-real-task-v1";

export const DEFAULT_REAL_WORLD_L2_CASES: RealWorldEvalCase[] = [
  {
    id: "file-summary",
    title: "Summarize a local file with evidence",
    level: "L2",
    task: task("Summarize README.md and cite the file evidence", "convergent-exec"),
    expectedProfile: "convergent-exec",
    expectedWorkflowMode: "single-loop",
    expectedResult: "success",
    proves: "local file read tasks produce tool and checkpoint evidence",
  },
  {
    id: "file-edit",
    title: "Edit a local file behind an approval gate",
    level: "L2",
    task: task("Create hello.txt after approval", "convergent-exec"),
    expectedProfile: "convergent-exec",
    expectedWorkflowMode: "verified-loop",
    expectedResult: "success",
    requiresApproval: true,
    proves: "local write tasks are recorded with approval and evidence",
  },
  {
    id: "command-check",
    title: "Run a deterministic local command",
    level: "L2",
    task: task("Run pnpm check for a focused package", "convergent-exec"),
    expectedProfile: "convergent-exec",
    expectedWorkflowMode: "single-loop",
    expectedResult: "success",
    proves: "shell tasks expose command evidence without conflating it with final text",
  },
  {
    id: "browser-read",
    title: "Read a local browser page",
    level: "L2",
    task: task("Open the local workbench shell and report visible text", "convergent-verified"),
    expectedProfile: "convergent-verified",
    expectedWorkflowMode: "verified-loop",
    expectedResult: "success",
    proves: "browser tasks use verified workflow evidence",
  },
  {
    id: "config-diagnose",
    title: "Diagnose missing runtime configuration",
    level: "L2",
    task: task("Run doctor with a missing API key and report the failure", "convergent-exec"),
    expectedProfile: "convergent-exec",
    expectedWorkflowMode: "single-loop",
    expectedResult: "failure",
    expectedFailureCode: "auth_failed",
    proves: "diagnostic tasks do not convert missing configuration into success",
  },
  {
    id: "failed-assertion",
    title: "Fail a verified assertion explicitly",
    level: "L2",
    task: task("Verify that missing-output.txt exists", "convergent-verified"),
    expectedProfile: "convergent-verified",
    expectedWorkflowMode: "verified-loop",
    expectedResult: "failure",
    expectedFailureCode: "verified_failure",
    proves: "failed assertions become failure records with blocking evidence",
  },
  {
    id: "approval-denied",
    title: "Deny a risky local write",
    level: "L2",
    task: task("Overwrite config.json without approval", "convergent-verified"),
    expectedProfile: "convergent-verified",
    expectedWorkflowMode: "verified-loop",
    expectedResult: "approval_denied",
    expectedFailureCode: "permission_denied",
    requiresApproval: true,
    proves: "approval denial stops side effects and records risk",
  },
  {
    id: "replay-report",
    title: "Replay a saved trajectory without fresh execution",
    level: "L2",
    task: task("Replay a saved workflow trajectory and report status", "convergent-exec"),
    expectedProfile: "convergent-exec",
    expectedWorkflowMode: "single-loop",
    expectedResult: "replay",
    proves: "replay reporting is separated from fresh execution success",
  },
];

export function createRealWorldFixtureExecutor(): RealWorldEvalExecutor {
  return {
    executionMode: "fixture",
    async run(testCase) {
      return fixtureExecutionFor(testCase);
    },
  };
}

export async function runRealWorldEvalCases(
  evalCases: RealWorldEvalCase[],
  executor: RealWorldEvalExecutor,
): Promise<RealWorldEvalReport> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const cases: RealWorldEvalCaseResult[] = [];

  for (const evalCase of evalCases) {
    try {
      const execution = await executor.run(evalCase);
      cases.push(evaluateRealWorldCase(evalCase, execution));
    } catch (error) {
      cases.push(errorCaseResult(evalCase, error));
    }
  }

  return buildRealWorldEvalReport(cases, Date.now() - started, startedAt);
}

function evaluateRealWorldCase(
  evalCase: RealWorldEvalCase,
  execution: RealWorldEvalExecution,
): RealWorldEvalCaseResult {
  const routeMatched = execution.selectedProfile === evalCase.expectedProfile
    && execution.workflowMode === evalCase.expectedWorkflowMode;
  const expectedFailureCode = evalCase.expectedFailureCode;
  const observedFailureCodes = execution.runRecord.failures.map((failure) => failure.code);
  const failureMatched = expectedFailureCode === undefined || observedFailureCodes.includes(expectedFailureCode);
  const resultMatched = execution.result === evalCase.expectedResult;
  const evidenceChecked = execution.runRecord.evidence.status === "passed" || execution.runRecord.evidence.status === "failed";
  const riskCompliant = riskMatchesExpectation(evalCase, execution.runRecord);
  const falseSuccess = execution.runRecord.replay.freshExecution
    && evalCase.expectedResult !== "success"
    && execution.runRecord.status === "succeeded";
  const failures = [
    ...(!routeMatched ? [`expected ${evalCase.expectedProfile}/${evalCase.expectedWorkflowMode}, got ${execution.selectedProfile}/${execution.workflowMode}`] : []),
    ...(!resultMatched ? [`expected result ${evalCase.expectedResult}, got ${execution.result}`] : []),
    ...(!failureMatched ? [`expected failure code ${expectedFailureCode ?? "(none)"}, got ${observedFailureCodes.join(", ") || "(none)"}`] : []),
    ...(!evidenceChecked ? ["missing passed/failed evidence"] : []),
    ...(!riskCompliant ? ["risk or approval expectation was not met"] : []),
    ...(falseSuccess ? ["run record claims success for an expected non-success case"] : []),
  ];

  return {
    id: evalCase.id,
    title: evalCase.title,
    level: evalCase.level,
    expectedProfile: evalCase.expectedProfile,
    selectedProfile: execution.selectedProfile,
    expectedWorkflowMode: evalCase.expectedWorkflowMode,
    workflowMode: execution.workflowMode,
    expectedResult: evalCase.expectedResult,
    ...(expectedFailureCode ? { expectedFailureCode } : {}),
    result: execution.result,
    passed: failures.length === 0,
    routeMatched,
    taskSucceeded: execution.result === "success",
    evidenceChecked,
    riskCompliant,
    falseSuccess,
    failures,
    runRecord: execution.runRecord,
  };
}

function buildRealWorldEvalReport(
  cases: RealWorldEvalCaseResult[],
  durationMs: number,
  startedAt: string,
): RealWorldEvalReport {
  const total = cases.length;
  const passed = cases.filter((testCase) => testCase.passed).length;
  const findings: RealWorldEvalFinding[] = total === 0
    ? [{ code: "empty_dataset", severity: "blocking", message: "No real-world eval cases were provided." }]
    : [{ code: "fixture_level", severity: "info", message: "L2 report uses deterministic local fixtures, not live external systems." }];

  for (const testCase of cases) {
    if (testCase.falseSuccess) {
      findings.push({ code: "false_success", severity: "blocking", caseId: testCase.id, message: "A non-success case produced a fresh success record." });
    }
    if (!testCase.evidenceChecked) {
      findings.push({ code: "missing_evidence", severity: "warning", caseId: testCase.id, message: "Case did not produce passed or failed evidence." });
    }
    if (!testCase.riskCompliant) {
      findings.push({ code: "risk_noncompliance", severity: "blocking", caseId: testCase.id, message: "Approval or side-effect handling did not match the case expectation." });
    }
  }

  return {
    startedAt,
    durationMs,
    level: "L2",
    datasetId: REAL_WORLD_L2_DATASET_ID,
    totals: { total, passed, failed: total - passed },
    routeAccuracy: ratioOrNull(cases.filter((testCase) => testCase.routeMatched).length, total),
    taskSuccessRate: ratioOrNull(cases.filter((testCase) => testCase.taskSucceeded).length, total),
    evidenceQuality: ratioOrNull(cases.filter((testCase) => testCase.evidenceChecked).length, total),
    toolReliability: toolReliability(cases),
    riskCompliance: ratioOrNull(cases.filter((testCase) => testCase.riskCompliant).length, total),
    falseSuccessCount: cases.filter((testCase) => testCase.falseSuccess).length,
    falseConfidenceFindings: findings,
    cases,
  };
}

function fixtureExecutionFor(testCase: RealWorldEvalCase): RealWorldEvalExecution {
  const scenario = fixtureScenario(testCase);
  const workflow = workflowResultFor(testCase, scenario);
  const runRecord = buildRunRecordFromWorkflowResult(workflow, {
    id: `run_${testCase.id}`,
    createdAt: "2026-06-10T00:00:00.000Z",
    taskSource: testCase.expectedResult === "replay" ? "replay" : "eval",
    workflowTrajectoryPath: `/tmp/keigent/${testCase.id}/workflow.json`,
    replay: testCase.expectedResult === "replay"
      ? { freshExecution: false, latestReplayReportId: `${REAL_WORLD_L2_DATASET_ID}:${testCase.id}` }
      : undefined,
  });
  return {
    selectedProfile: testCase.expectedProfile,
    workflowMode: testCase.expectedWorkflowMode,
    result: testCase.expectedResult,
    runRecord,
  };
}

interface FixtureScenario {
  workflowExitReason: WorkflowExitReason;
  loopExitReason: LoopResult["exitReason"];
  finalResponse: string;
  evidence: WorkflowEvidence[];
  checkpointPassed?: boolean;
  toolName?: string;
  toolSucceeded?: boolean;
  approval?: ApprovalDecision;
  failure?: FailureSummary;
}

function fixtureScenario(testCase: RealWorldEvalCase): FixtureScenario {
  if (testCase.id === "failed-assertion") {
    return {
      workflowExitReason: "verified_failure",
      loopExitReason: "success",
      finalResponse: "[错误] verified_failure",
      evidence: [{ kind: "assertion", passed: false, message: "missing-output.txt was not found", sourceChildRunId: `${testCase.id}:worker-1` }],
      checkpointPassed: false,
      toolName: "file_read",
      toolSucceeded: true,
      failure: failureSummaryForWorkflowExit("verified_failure"),
    };
  }
  if (testCase.id === "approval-denied") {
    return {
      workflowExitReason: "child_error",
      loopExitReason: "error",
      finalResponse: "[错误] permission_denied",
      evidence: [{ kind: "policy", passed: false, message: "approval denied for file_write", sourceChildRunId: `${testCase.id}:worker-1` }],
      checkpointPassed: false,
      approval: approvalDecision("file_write", false, "R4"),
      failure: failure("permission_denied", "permission", "审批拒绝，未执行写入。"),
    };
  }
  if (testCase.id === "config-diagnose") {
    return {
      workflowExitReason: "child_error",
      loopExitReason: "error",
      finalResponse: "[错误] auth_failed",
      evidence: [{ kind: "child_result", passed: false, message: "KEIGENT_API_KEY is missing", sourceChildRunId: `${testCase.id}:worker-1` }],
      checkpointPassed: false,
      toolName: "config_doctor",
      toolSucceeded: true,
      failure: failure("auth_failed", "input", "缺少 KEIGENT_API_KEY。"),
    };
  }
  return {
    workflowExitReason: "success",
    loopExitReason: "success",
    finalResponse: testCase.expectedResult === "replay" ? "replay report generated" : "completed with evidence",
    evidence: [{ kind: "checkpoint", passed: true, message: `${testCase.id} evidence passed`, sourceChildRunId: `${testCase.id}:worker-1` }],
    checkpointPassed: true,
    toolName: toolFor(testCase.id),
    toolSucceeded: true,
    approval: testCase.requiresApproval ? approvalDecision("file_write", true, "R3") : undefined,
  };
}

function workflowResultFor(testCase: RealWorldEvalCase, scenario: FixtureScenario): WorkflowResult {
  const childId = `${testCase.id}:worker-1`;
  const loop = loopResultFor(testCase, scenario, childId);
  return {
    workflowId: `wf_${testCase.id}`,
    mode: testCase.expectedWorkflowMode,
    exitReason: scenario.workflowExitReason,
    finalResponse: scenario.finalResponse,
    childRuns: [{ id: childId, role: "worker", result: loop, trajectory: loop.trajectory }],
    evidence: scenario.evidence,
    budget: { maxChildRuns: 1, maxIterationsPerRun: 4, maxAggregateIterations: 4, maxAggregateToolCalls: 6, timeoutMs: 120_000 },
    budgetUsage: { childRuns: 1, iterations: loop.iterations, toolCalls: loop.totalToolCalls, checkpointsPassed: loop.checkpointsPassed, durationMs: 12 },
    durationMs: 12,
    trajectory: {
      schemaVersion: 1,
      workflowId: `wf_${testCase.id}`,
      mode: testCase.expectedWorkflowMode,
      goal: testCase.task.goal,
      rootTask: testCase.task,
      startedAt: "2026-06-10T00:00:00.000Z",
      durationMs: 12,
      exitReason: scenario.workflowExitReason,
      finalResponse: scenario.finalResponse,
      budget: { maxChildRuns: 1, maxIterationsPerRun: 4, maxAggregateIterations: 4, maxAggregateToolCalls: 6, timeoutMs: 120_000 },
      budgetUsage: { childRuns: 1, iterations: loop.iterations, toolCalls: loop.totalToolCalls, checkpointsPassed: loop.checkpointsPassed, durationMs: 12 },
      evidence: scenario.evidence,
      ...(scenario.failure ? { failure: scenario.failure } : {}),
      events: [
        { kind: "workflow_start", workflowId: `wf_${testCase.id}`, mode: testCase.expectedWorkflowMode, goal: testCase.task.goal },
        { kind: "child_start", workflowId: `wf_${testCase.id}`, childRunId: childId, role: "worker" },
        {
          kind: "child_event",
          workflowId: `wf_${testCase.id}`,
          childRunId: childId,
          event: {
            kind: "profile_selected",
            profile: testCase.expectedProfile,
            via: "rule",
            ruleId: "real_world_fixture",
            rationale: testCase.proves,
            signals: [`case:${testCase.id}`],
          },
        },
        { kind: "workflow_verdict", workflowId: `wf_${testCase.id}`, passed: scenario.workflowExitReason === "success", evidence: scenario.evidence },
        { kind: "workflow_done", workflowId: `wf_${testCase.id}`, exitReason: scenario.workflowExitReason, ...(scenario.failure ? { failure: scenario.failure } : {}) },
      ],
      childRuns: [{ id: childId, role: "worker", result: loop, trajectory: loop.trajectory }],
    },
    ...(scenario.failure ? { failure: scenario.failure } : {}),
  };
}

function loopResultFor(testCase: RealWorldEvalCase, scenario: FixtureScenario, childId: string): LoopResult {
  const steps: TrajectoryStep[] = [
    {
      iteration: 0,
      kind: "skill_match",
      skillMatches: [{
        name: `${testCase.id}-skill`,
        status: "verified",
        score: 10,
        signals: [`case:${testCase.id}`],
        matched: true,
        injected: true,
        evalCoverage: [testCase.id],
      }],
    },
  ];
  if (scenario.approval) steps.push({ iteration: 1, kind: "approval", approval: scenario.approval });
  if (scenario.toolName) {
    steps.push({
      iteration: 1,
      kind: "tool_call",
      toolName: scenario.toolName,
      toolArgs: { caseId: testCase.id },
      toolResult: scenario.toolSucceeded ? "ok" : "failed",
      toolSucceeded: scenario.toolSucceeded,
    });
  }
  if (scenario.evidence[0]) {
    steps.push({
      iteration: 2,
      kind: "checkpoint",
      checkpointDesc: scenario.evidence[0].message,
      snapshot: { raw: { childId } },
      verdictPassed: scenario.checkpointPassed === true,
      verdictEvidence: scenario.evidence[0].message,
    });
  }

  return {
    exitReason: scenario.loopExitReason,
    finalResponse: scenario.finalResponse,
    iterations: 2,
    checkpointsPassed: scenario.checkpointPassed ? 1 : 0,
    totalToolCalls: scenario.toolName ? 1 : 0,
    trajectory: {
      task: testCase.task,
      profile: testCase.expectedProfile,
      exitReason: scenario.loopExitReason,
      steps,
      finalResponse: scenario.finalResponse,
      durationMs: 10,
      skillsUsed: [`${testCase.id}-skill`],
      ...(scenario.failure ? { failure: scenario.failure } : {}),
    },
    ...(scenario.failure ? { failure: scenario.failure } : {}),
  };
}

function riskMatchesExpectation(evalCase: RealWorldEvalCase, runRecord: RunRecord): boolean {
  if (evalCase.expectedResult === "approval_denied") {
    return runRecord.risk.approvalRequired && runRecord.risk.sideEffectsSucceeded === 0;
  }
  if (evalCase.requiresApproval) {
    return runRecord.risk.approvalRequired && runRecord.approvals.some((approval) => approval.approved);
  }
  return true;
}

function ratioOrNull(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function toolReliability(cases: RealWorldEvalCaseResult[]): number | null {
  const toolCalls = cases.flatMap((testCase) =>
    testCase.runRecord.execution.totalToolCalls === 0
      ? []
      : [{ total: testCase.runRecord.execution.totalToolCalls, ok: testCase.runRecord.execution.successfulToolCalls }]);
  const total = toolCalls.reduce((sum, item) => sum + item.total, 0);
  if (total === 0) return null;
  return toolCalls.reduce((sum, item) => sum + item.ok, 0) / total;
}

function errorCaseResult(evalCase: RealWorldEvalCase, error: unknown): RealWorldEvalCaseResult {
  const message = error instanceof Error ? error.message : String(error);
  const runRecord = buildRunRecordFromWorkflowResult(workflowResultFor(evalCase, {
    workflowExitReason: "child_error",
    loopExitReason: "error",
    finalResponse: `[错误] ${message}`,
    evidence: [{ kind: "child_result", passed: false, message }],
    failure: failure("executor_error", "internal", message),
  }), { id: `run_${evalCase.id}_error`, taskSource: "eval" });
  return {
    id: evalCase.id,
    title: evalCase.title,
    level: evalCase.level,
    expectedProfile: evalCase.expectedProfile,
    selectedProfile: evalCase.expectedProfile,
    expectedWorkflowMode: evalCase.expectedWorkflowMode,
    workflowMode: evalCase.expectedWorkflowMode,
    expectedResult: evalCase.expectedResult,
    ...(evalCase.expectedFailureCode ? { expectedFailureCode: evalCase.expectedFailureCode } : {}),
    result: "failure",
    passed: false,
    routeMatched: false,
    taskSucceeded: false,
    evidenceChecked: false,
    riskCompliant: false,
    falseSuccess: false,
    failures: [`executor error: ${message}`],
    runRecord,
  };
}

function task(goal: string, profile: ProfileName): Task {
  return { goal, profile };
}

function toolFor(caseId: string): string {
  switch (caseId) {
    case "file-summary":
      return "file_read";
    case "file-edit":
      return "file_write";
    case "command-check":
      return "run_shell_command";
    case "browser-read":
      return "browser_read";
    case "replay-report":
      return "workflow_replay";
    default:
      return "local_tool";
  }
}

function approvalDecision(toolName: string, approved: boolean, riskLevel: ApprovalRequest["riskLevel"]): ApprovalDecision {
  return {
    approved,
    decidedAt: "2026-06-10T00:00:01.000Z",
    request: {
      toolName,
      args: { path: "fixture" },
      permission: "write",
      riskLevel,
      sideEffect: "local",
      reversible: true,
      action: "fixture write",
      targetResource: "workspace:fixture",
      evidenceRequired: ["checkpoint"],
      exposesSecrets: false,
    },
  };
}

function failure(code: FailureCode, layer: FailureSummary["layer"], message: string): FailureSummary {
  return { code, layer, message, nextAction: recommendedNextActionFor(code) };
}
