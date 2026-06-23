import type {
  ProofBoundary,
  RealWorldEvalCaseResult,
  RealWorldEvalFinding,
  RealWorldEvalReport,
} from "@keigent/engine";

export interface EvalCaseResultView {
  id: string;
  title: string;
  category: string;
  passed: boolean;
  selectedProfile?: string;
  expectedProfile?: string;
  profileMatched: boolean | null;
  exitReason: string;
  iterations: number;
  checkpointsPassed: number;
  totalToolCalls: number;
  toolsUsed: string[];
  successfulToolsUsed: string[];
  durationMs: number;
  failures: string[];
  failureCodes: string[];
  finalResponse: string;
  guardApplied?: boolean;
}

export interface EvalReportView {
  startedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  profileAccuracy: number | null;
  failuresByCode: Record<string, number>;
  cases: EvalCaseResultView[];
}

export interface ReportValidationIssue {
  code: string;
  message: string;
}

export interface DashboardSummary {
  passRate: number | null;
  taskSuccessRate: number | null;
  profileMatchRate: number | null;
  profileAccuracy: number | null;
  toolAttemptedCases: number;
  toolSucceededCases: number;
  checkpointPassedCases: number;
  failureCodeCount: number;
  authoritative: boolean;
  invalid: boolean;
  issues: ReportValidationIssue[];
}

export interface RealWorldMetricView {
  value: number | null;
  label: string;
}

export interface RealWorldEvalCaseView {
  id: string;
  title: string;
  level: string;
  runId: string;
  runDetailHref: string;
  expectedResult: string;
  result: string;
  passed: boolean;
  routeMatched: boolean;
  taskSucceeded: boolean;
  evidenceChecked: boolean;
  riskCompliant: boolean;
  falseSuccess: boolean;
  status: string;
  evidenceStatus: string;
  replayFreshExecution: boolean;
  failureCodes: string[];
  failures: string[];
  proofBoundary: ProofBoundary;
  caseReview: RealWorldEvalCaseReviewView;
}

export type RealWorldEvalCaseReviewVerdict = "evidence_backed" | "needs_review" | "blocked" | "replay_only";

export interface RealWorldEvalCaseReviewView {
  verdict: RealWorldEvalCaseReviewVerdict;
  label: string;
  reason: string;
  nextAction: string;
}

export interface RealWorldEvalReportView {
  startedAt: string;
  durationMs: number;
  level: string;
  datasetId: string;
  totals: RealWorldEvalReport["totals"];
  healthClaim: string;
  metrics: {
    routeAccuracy: RealWorldMetricView;
    taskSuccessRate: RealWorldMetricView;
    evidenceQuality: RealWorldMetricView;
    toolReliability: RealWorldMetricView;
    riskCompliance: RealWorldMetricView;
  };
  falseSuccessCount: number;
  falseConfidenceFindings: RealWorldEvalFinding[];
  proofBoundary: ProofBoundary;
  cases: RealWorldEvalCaseView[];
}

export type DashboardCaseFilter =
  | "guardApplied"
  | "profileMismatch"
  | "toolFailure"
  | "verificationFailure"
  | "permissionDenied";

export function validateEvalReport(report: EvalReportView): ReportValidationIssue[] {
  const issues: ReportValidationIssue[] = [];
  if (!Array.isArray(report.cases)) issues.push({ code: "cases.not_array", message: "cases must be an array" });
  if (report.total !== report.cases.length) issues.push({ code: "total.cases_mismatch", message: `total ${report.total} does not equal cases.length ${report.cases.length}` });
  if (report.passed + report.failed !== report.total) issues.push({ code: "summary.inconsistent", message: "passed + failed must equal total" });
  if (report.profileAccuracy !== null && (report.profileAccuracy < 0 || report.profileAccuracy > 1)) issues.push({ code: "profileAccuracy.invalid", message: "profileAccuracy must be null or between 0 and 1" });
  for (const testCase of report.cases) {
    if (!testCase.id) issues.push({ code: "case.id.missing", message: "case id is required" });
    if (typeof testCase.passed !== "boolean") issues.push({ code: "case.passed.invalid", message: `case ${testCase.id} passed must be boolean` });
  }
  return issues;
}

export function summarizeEvalReport(report: EvalReportView): DashboardSummary {
  const issues = validateEvalReport(report);
  const failureCodeCount = Object.values(report.failuresByCode).reduce((sum, count) => sum + count, 0);
  const authoritative = issues.length === 0 && report.total > 0;
  const profileChecked = report.cases.filter((testCase) => testCase.profileMatched !== null);
  return {
    passRate: report.total === 0 ? null : report.passed / report.total,
    taskSuccessRate: report.total === 0
      ? null
      : report.cases.filter((testCase) => testCase.exitReason === "success").length / report.total,
    profileMatchRate: profileChecked.length === 0
      ? null
      : profileChecked.filter((testCase) => testCase.profileMatched === true).length / profileChecked.length,
    profileAccuracy: report.profileAccuracy,
    toolAttemptedCases: report.cases.filter((testCase) => testCase.totalToolCalls > 0).length,
    toolSucceededCases: report.cases.filter((testCase) => testCase.successfulToolsUsed.length > 0).length,
    checkpointPassedCases: report.cases.filter((testCase) => testCase.checkpointsPassed > 0).length,
    failureCodeCount,
    authoritative,
    invalid: issues.length > 0,
    issues,
  };
}

export function filterFailedCases(report: EvalReportView): EvalCaseResultView[] {
  return report.cases.filter((testCase) => !testCase.passed);
}

export function casesWithFailureCode(report: EvalReportView, code: string): EvalCaseResultView[] {
  return report.cases.filter((testCase) => testCase.failureCodes.includes(code));
}

export function filterDashboardCases(report: EvalReportView, filter: DashboardCaseFilter): EvalCaseResultView[] {
  switch (filter) {
    case "guardApplied":
      return report.cases.filter((testCase) => testCase.guardApplied === true);
    case "profileMismatch":
      return report.cases.filter((testCase) => testCase.profileMatched === false);
    case "toolFailure":
      return report.cases.filter((testCase) => {
        const successfulCount = testCase.successfulToolsUsed.length;
        return testCase.totalToolCalls > successfulCount || testCase.failureCodes.some((code) => code.startsWith("tool_"));
      });
    case "verificationFailure":
      return report.cases.filter((testCase) => {
        return testCase.failureCodes.includes("verified_failure") || testCase.failureCodes.includes("checkpoint_missing");
      });
    case "permissionDenied":
      return casesWithFailureCode(report, "permission_denied");
  }
}

export function normalizeRealWorldEvalReport(report: RealWorldEvalReport): RealWorldEvalReportView {
  return {
    startedAt: report.startedAt,
    durationMs: report.durationMs,
    level: report.level,
    datasetId: report.datasetId,
    totals: report.totals,
    healthClaim: healthClaimForRealWorldReport(report),
    metrics: {
      routeAccuracy: metricView(report.routeAccuracy),
      taskSuccessRate: metricView(report.taskSuccessRate),
      evidenceQuality: metricView(report.evidenceQuality),
      toolReliability: metricView(report.toolReliability),
      riskCompliance: metricView(report.riskCompliance),
    },
    falseSuccessCount: report.falseSuccessCount,
    falseConfidenceFindings: report.falseConfidenceFindings,
    proofBoundary: report.proofBoundary,
    cases: report.cases.map(realWorldCaseView),
  };
}

function realWorldCaseView(testCase: RealWorldEvalCaseResult): RealWorldEvalCaseView {
  return {
    id: testCase.id,
    title: testCase.title,
    level: testCase.level,
    runId: testCase.runId,
    runDetailHref: runDetailHrefFor(testCase.runId),
    expectedResult: testCase.expectedResult,
    result: testCase.result,
    passed: testCase.passed,
    routeMatched: testCase.routeMatched,
    taskSucceeded: testCase.taskSucceeded,
    evidenceChecked: testCase.evidenceChecked,
    riskCompliant: testCase.riskCompliant,
    falseSuccess: testCase.falseSuccess,
    status: testCase.runRecord.status,
    evidenceStatus: testCase.runRecord.evidence.status,
    replayFreshExecution: testCase.runRecord.replay.freshExecution,
    failureCodes: testCase.runRecord.failures.map((failure) => failure.code),
    failures: testCase.failures,
    proofBoundary: testCase.proofBoundary,
    caseReview: caseReviewFor(testCase),
  };
}

function runDetailHrefFor(runId: string): string {
  return `#runs/${encodeURIComponent(runId)}`;
}

function caseReviewFor(testCase: RealWorldEvalCaseResult): RealWorldEvalCaseReviewView {
  const nextAction = nextActionFor(testCase);
  if (!testCase.passed || testCase.falseSuccess || !testCase.riskCompliant) {
    return {
      verdict: "blocked",
      label: "Blocked before reviewer acceptance",
      reason: testCase.failures[0] ?? testCase.runRecord.failures[0]?.message ?? "Eval case did not satisfy its acceptance criteria.",
      nextAction,
    };
  }
  if (!testCase.runRecord.replay.freshExecution) {
    return {
      verdict: "replay_only",
      label: "Replay result, not a fresh execution",
      reason: "RunRecord replay.freshExecution=false.",
      nextAction,
    };
  }
  if (
    testCase.runRecord.status === "no_op"
    || testCase.runRecord.evidence.status === "not_checked"
    || testCase.runRecord.evidence.status === "insufficient_evidence"
    || testCase.proofBoundary.evidenceGaps.length > 0
  ) {
    return {
      verdict: "needs_review",
      label: "Needs reviewer inspection",
      reason: caseReviewReason(testCase),
      nextAction,
    };
  }
  return {
    verdict: "evidence_backed",
    label: "Evidence-backed case result",
    reason: "Case passed with checked evidence and no proof gaps.",
    nextAction,
  };
}

function caseReviewReason(testCase: RealWorldEvalCaseResult): string {
  if (testCase.runRecord.status === "no_op") return "No-op automation requires scope review before acceptance.";
  if (testCase.runRecord.evidence.status === "insufficient_evidence") return "RunRecord evidence is insufficient for trusted success.";
  if (testCase.runRecord.evidence.status === "not_checked") return "RunRecord evidence was not checked.";
  return testCase.proofBoundary.evidenceGaps[0] ?? "Proof boundary requires reviewer inspection.";
}

function nextActionFor(testCase: RealWorldEvalCaseResult): string {
  return testCase.runRecord.nextAction
    ?? testCase.runRecord.failures.find((failure) => failure.nextAction)?.nextAction
    ?? defaultNextActionFor(testCase);
}

function defaultNextActionFor(testCase: RealWorldEvalCaseResult): string {
  if (!testCase.passed || testCase.falseSuccess || !testCase.riskCompliant) {
    return "Resolve blocking eval findings before reviewer acceptance.";
  }
  if (!testCase.runRecord.replay.freshExecution) {
    return "Open Run Detail and do not treat replay as fresh execution.";
  }
  if (testCase.runRecord.status === "no_op" || testCase.proofBoundary.evidenceGaps.length > 0) {
    return "Inspect proof boundary and evidence gaps before accepting this case.";
  }
  return "Open Run Detail to inspect supporting evidence before acceptance.";
}

function metricView(value: number | null): RealWorldMetricView {
  return {
    value,
    label: value === null ? "Not checked" : `${(value * 100).toFixed(1)}%`,
  };
}

function healthClaimForRealWorldReport(report: RealWorldEvalReport): string {
  if (report.totals.total === 0) return "No cases checked";
  return report.falseConfidenceFindings.some((finding) => finding.code === "fixture_level")
    ? "Fixture-level regression, not product health"
    : "Layered eval report, not product health";
}
