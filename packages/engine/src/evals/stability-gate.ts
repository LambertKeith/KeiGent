import { mergeProofBoundaries, type ProofBoundary } from "../proof-boundary.js";
import type { RunRecord, SkillRunSummary, ToolRunSummary } from "../run-record.js";
import type { FailureCode } from "../failures.js";
import {
  DEFAULT_REAL_WORLD_L2_CASES,
  REAL_WORLD_L2_DATASET_ID,
  createRealWorldFixtureExecutor,
  runRealWorldEvalCases,
  type RealWorldEvalCaseResult,
  type RealWorldEvalReport,
} from "./real-world.js";

export const STABILITY_GATE_REDLINE_IDS = [
  "final_text_not_success",
  "tool_attempted_not_succeeded",
  "replay_not_fresh",
  "empty_evidence_not_100",
  "approval_not_bypassed",
  "blocked_skill_not_injected",
  "reviewer_readonly",
  "parent_timeout_authoritative",
  "secret_redaction",
] as const;

export type StabilityGateRedlineId = typeof STABILITY_GATE_REDLINE_IDS[number];
export type StabilityGateStatus = "passed" | "failed";

export interface StabilityGateRedline {
  id: StabilityGateRedlineId;
  title: string;
  passed: boolean;
  caseIds: string[];
  evidence: string[];
  failure?: string;
}

export interface StabilityGateReport {
  generatedAt: string;
  datasetId: string;
  totalRedlines: number;
  passedRedlines: number;
  failedRedlines: number;
  status: StabilityGateStatus;
  redlines: StabilityGateRedline[];
  proofBoundary: ProofBoundary;
}

export interface BuildStabilityGateReportOptions {
  l2Report: RealWorldEvalReport;
  emptyReport: RealWorldEvalReport;
  generatedAt?: string;
}

export interface RunStabilityGateOptions {
  generatedAt?: string;
}

export async function runStabilityGate(options: RunStabilityGateOptions = {}): Promise<StabilityGateReport> {
  const executor = createRealWorldFixtureExecutor();
  const [l2Report, emptyReport] = await Promise.all([
    runRealWorldEvalCases(DEFAULT_REAL_WORLD_L2_CASES, executor),
    runRealWorldEvalCases([], executor),
  ]);
  return buildStabilityGateReport({
    l2Report,
    emptyReport,
    generatedAt: options.generatedAt,
  });
}

export function buildStabilityGateReport(options: BuildStabilityGateReportOptions): StabilityGateReport {
  const redlines: StabilityGateRedline[] = [
    finalTextNotSuccess(options.l2Report),
    toolAttemptedNotSucceeded(options.l2Report),
    replayNotFresh(options.l2Report),
    emptyEvidenceNotPerfect(options.emptyReport),
    approvalNotBypassed(options.l2Report),
    blockedSkillNotInjected(options.l2Report),
    reviewerReadonly(options.l2Report),
    parentTimeoutAuthoritative(options.l2Report),
    secretRedaction(options.l2Report),
  ];
  const failed = redlines.filter((redline) => !redline.passed);
  const proofBoundary = mergeProofBoundaries([
    options.l2Report.proofBoundary,
    options.emptyReport.proofBoundary,
    {
      proven: failed.length === 0
        ? ["P0 stability gate evaluated all configured false-confidence redlines."]
        : [],
      notProven: [
        "Fixture gate does not prove production health.",
        "Fixture gate does not prove human acceptance.",
      ],
      assumptions: ["Default L2 fixtures represent the current P0 false-confidence boundaries."],
      evidenceGaps: failed.map((redline) => `${redline.id}: ${redline.failure ?? "redline failed"}`),
    },
  ]);

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    datasetId: REAL_WORLD_L2_DATASET_ID,
    totalRedlines: redlines.length,
    passedRedlines: redlines.length - failed.length,
    failedRedlines: failed.length,
    status: failed.length === 0 ? "passed" : "failed",
    redlines,
    proofBoundary,
  };
}

function finalTextNotSuccess(report: RealWorldEvalReport): StabilityGateRedline {
  const testCase = caseById(report, "insufficient-evidence-success-claim");
  const record = testCase?.runRecord;
  const passed = Boolean(
    testCase?.result === "failure" &&
    testCase.expectedResult === "failure" &&
    testCase.expectedFailureCode === "verified_failure" &&
    record?.status === "failed" &&
    record.evidence.status === "insufficient_evidence" &&
    hasFailure(record, "verified_failure"),
  );
  return redline({
    id: "final_text_not_success",
    title: "Final text alone cannot create trusted success",
    caseIds: ["insufficient-evidence-success-claim"],
    passed,
    evidence: [
      `result=${testCase?.result ?? "missing"}`,
      `runStatus=${record?.status ?? "missing"}`,
      `evidenceStatus=${record?.evidence.status ?? "missing"}`,
      `failureCodes=${failureCodes(record).join(",") || "none"}`,
    ],
    failure: "insufficient evidence must remain a verified failure, never trusted success",
  });
}

function toolAttemptedNotSucceeded(report: RealWorldEvalReport): StabilityGateRedline {
  const testCase = caseById(report, "reviewer-readonly-violation");
  const record = testCase?.runRecord;
  const fileWrite = toolByName(record, "file_write");
  const passed = Boolean(
    fileWrite?.attempted === true &&
    fileWrite.succeeded === false &&
    (record?.execution.failedToolCalls ?? 0) >= 1 &&
    (record?.execution.successfulToolCalls ?? 0) === 0,
  );
  return redline({
    id: "tool_attempted_not_succeeded",
    title: "Attempted tools stay separate from succeeded tools",
    caseIds: ["reviewer-readonly-violation"],
    passed,
    evidence: [
      `fileWriteAttempted=${String(fileWrite?.attempted ?? "missing")}`,
      `fileWriteSucceeded=${String(fileWrite?.succeeded ?? "missing")}`,
      `successfulToolCalls=${record?.execution.successfulToolCalls ?? "missing"}`,
      `failedToolCalls=${record?.execution.failedToolCalls ?? "missing"}`,
    ],
    failure: "a failed attempted tool was counted as successful",
  });
}

function replayNotFresh(report: RealWorldEvalReport): StabilityGateRedline {
  const caseIds = ["replay-report", "replay-stale-schema"];
  const cases = caseIds.map((id) => caseById(report, id));
  const passed = cases.every((testCase) =>
    testCase?.result === "replay" &&
    testCase.runRecord.task.source === "replay" &&
    testCase.runRecord.replay.supported === true &&
    testCase.runRecord.replay.freshExecution === false);
  return redline({
    id: "replay_not_fresh",
    title: "Replay output cannot claim fresh execution",
    caseIds,
    passed,
    evidence: cases.map((testCase, index) => {
      const id = caseIds[index]!;
      return `${id}:result=${testCase?.result ?? "missing"},source=${testCase?.runRecord.task.source ?? "missing"},fresh=${String(testCase?.runRecord.replay.freshExecution ?? "missing")}`;
    }),
    failure: "a replay case claimed fresh execution semantics",
  });
}

function emptyEvidenceNotPerfect(report: RealWorldEvalReport): StabilityGateRedline {
  const metrics = [
    report.routeAccuracy,
    report.taskSuccessRate,
    report.evidenceQuality,
    report.toolReliability,
    report.riskCompliance,
  ];
  const hasBlockingFinding = report.falseConfidenceFindings.some((finding) =>
    finding.code === "empty_dataset" && finding.severity === "blocking");
  const passed = report.totals.total === 0 && metrics.every((metric) => metric === null) && hasBlockingFinding;
  return redline({
    id: "empty_evidence_not_100",
    title: "Empty evidence corpus is blocking, not perfect",
    caseIds: [],
    passed,
    evidence: [
      `total=${report.totals.total}`,
      `metrics=${metrics.map((metric) => metric === null ? "null" : String(metric)).join(",")}`,
      `emptyDatasetFinding=${String(hasBlockingFinding)}`,
    ],
    failure: "empty eval input produced perfect-looking metrics or no blocking finding",
  });
}

function approvalNotBypassed(report: RealWorldEvalReport): StabilityGateRedline {
  const testCase = caseById(report, "approval-denied");
  const record = testCase?.runRecord;
  const denied = record?.approvals.some((approval) => !approval.approved) === true;
  const passed = Boolean(
    testCase?.result === "approval_denied" &&
    record?.status === "failed" &&
    record.risk.approvalRequired === true &&
    record.risk.sideEffectsSucceeded === 0 &&
    denied &&
    hasFailure(record, "permission_denied"),
  );
  return redline({
    id: "approval_not_bypassed",
    title: "Approval denial prevents side effects",
    caseIds: ["approval-denied"],
    passed,
    evidence: [
      `result=${testCase?.result ?? "missing"}`,
      `approvalRequired=${String(record?.risk.approvalRequired ?? "missing")}`,
      `deniedApproval=${String(denied)}`,
      `sideEffectsSucceeded=${record?.risk.sideEffectsSucceeded ?? "missing"}`,
    ],
    failure: "approval denial did not block the risky side effect",
  });
}

function blockedSkillNotInjected(report: RealWorldEvalReport): StabilityGateRedline {
  const caseIds = ["stale-skill-blocked", "deprecated-skill-warning"];
  const cases = caseIds.map((id) => caseById(report, id));
  const passed = cases.every((testCase) => {
    const skills = testCase?.runRecord.skills ?? [];
    const hasNonExecutableSkill = skills.some((skill) => isNonExecutableSkill(skill) && !skill.injected);
    return testCase?.result === "failure" &&
      hasFailure(testCase.runRecord, "skill_missing") &&
      testCase.runRecord.evidence.status === "failed" &&
      skills.every((skill) => !skill.injected) &&
      hasNonExecutableSkill;
  });
  return redline({
    id: "blocked_skill_not_injected",
    title: "Blocked or deprecated skills are never injected",
    caseIds,
    passed,
    evidence: cases.map((testCase, index) => {
      const id = caseIds[index]!;
      const skills = testCase?.runRecord.skills ?? [];
      const summary = skills.map((skill) =>
        `${skill.name}:${skill.status ?? "unknown"}:injected=${String(skill.injected)}`).join("|") || "none";
      return `${id}:result=${testCase?.result ?? "missing"},skills=${summary}`;
    }),
    failure: "a blocked, stale, deprecated, or guessed skill was injected",
  });
}

function reviewerReadonly(report: RealWorldEvalReport): StabilityGateRedline {
  const testCase = caseById(report, "reviewer-readonly-violation");
  const record = testCase?.runRecord;
  const fileWrite = toolByName(record, "file_write");
  const denied = record?.approvals.some((approval) => !approval.approved && approval.toolName === "file_write") === true;
  const passed = Boolean(
    testCase?.expectedWorkflowMode === "reviewed-loop" &&
    record?.task.resolvedWorkflowMode === "reviewed-loop" &&
    testCase.result === "failure" &&
    record.status === "failed" &&
    hasFailure(record, "permission_denied") &&
    fileWrite?.attempted === true &&
    fileWrite.succeeded === false &&
    denied,
  );
  return redline({
    id: "reviewer_readonly",
    title: "Reviewer child runs stay readonly",
    caseIds: ["reviewer-readonly-violation"],
    passed,
    evidence: [
      `workflowMode=${record?.task.resolvedWorkflowMode ?? "missing"}`,
      `fileWriteAttempted=${String(fileWrite?.attempted ?? "missing")}`,
      `fileWriteSucceeded=${String(fileWrite?.succeeded ?? "missing")}`,
      `deniedApproval=${String(denied)}`,
    ],
    failure: "reviewer write attempt was not rejected as a policy failure",
  });
}

function parentTimeoutAuthoritative(report: RealWorldEvalReport): StabilityGateRedline {
  const testCase = caseById(report, "parent-timeout-child-success");
  const record = testCase?.runRecord;
  const childSucceeded = record?.childRuns?.some((child) => child.role === "worker" && child.exitReason === "success") === true;
  const passed = Boolean(
    testCase?.result === "failure" &&
    record?.status === "cancelled" &&
    record.workflow?.exitReason === "timeout" &&
    childSucceeded &&
    hasFailure(record, "timeout"),
  );
  return redline({
    id: "parent_timeout_authoritative",
    title: "Parent timeout remains authoritative over child success",
    caseIds: ["parent-timeout-child-success"],
    passed,
    evidence: [
      `result=${testCase?.result ?? "missing"}`,
      `runStatus=${record?.status ?? "missing"}`,
      `workflowExit=${record?.workflow?.exitReason ?? "missing"}`,
      `childSucceeded=${String(childSucceeded)}`,
    ],
    failure: "late child success overrode the parent timeout",
  });
}

function secretRedaction(report: RealWorldEvalReport): StabilityGateRedline {
  const testCase = caseById(report, "redaction-leak-guard");
  const serialized = JSON.stringify(report);
  const forbidden = ["privateuser", "sk-http-secret", "api_key=sk", "Bearer sk-", "sk-live"];
  const containsForbidden = forbidden.some((token) => serialized.includes(token)) || /sk-[A-Za-z0-9]{6,}/.test(serialized);
  const passed = Boolean(
    testCase?.result === "failure" &&
    testCase.expectedFailureCode === "auth_failed" &&
    testCase.runRecord.evidence.status === "failed" &&
    hasFailure(testCase.runRecord, "auth_failed") &&
    !containsForbidden,
  );
  return redline({
    id: "secret_redaction",
    title: "Secret-bearing evidence is blocked or redacted before reports",
    caseIds: ["redaction-leak-guard"],
    passed,
    evidence: [
      `result=${testCase?.result ?? "missing"}`,
      `evidenceStatus=${testCase?.runRecord.evidence.status ?? "missing"}`,
      `containsForbiddenSecret=${String(containsForbidden)}`,
    ],
    failure: "serialized stability input contains an unredacted secret marker",
  });
}

function redline(input: StabilityGateRedline): StabilityGateRedline {
  return {
    id: input.id,
    title: input.title,
    passed: input.passed,
    caseIds: input.caseIds,
    evidence: input.evidence,
    ...(input.passed ? {} : { failure: input.failure ?? "redline failed" }),
  };
}

function caseById(report: RealWorldEvalReport, id: string): RealWorldEvalCaseResult | undefined {
  return report.cases.find((testCase) => testCase.id === id);
}

function failureCodes(record?: RunRecord): FailureCode[] {
  return record?.failures.map((failure) => failure.code) ?? [];
}

function hasFailure(record: RunRecord | undefined, code: FailureCode): boolean {
  return failureCodes(record).includes(code);
}

function toolByName(record: RunRecord | undefined, name: string): ToolRunSummary | undefined {
  return record?.tools?.find((tool) => tool.name === name);
}

function isNonExecutableSkill(skill: SkillRunSummary): boolean {
  return skill.status === "blocked" ||
    skill.status === "quarantined" ||
    skill.status === "deprecated" ||
    skill.exclusionReason === "blocked" ||
    skill.exclusionReason === "status_not_executable" ||
    Boolean(skill.blockedReason);
}
