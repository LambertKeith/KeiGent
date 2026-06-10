import type {
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
  };
}

function runDetailHrefFor(runId: string): string {
  return `#runs/${encodeURIComponent(runId)}`;
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
