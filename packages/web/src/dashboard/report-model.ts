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
  profileAccuracy: number | null;
  failureCodeCount: number;
  invalid: boolean;
  issues: ReportValidationIssue[];
}

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
  return {
    passRate: report.total === 0 ? null : report.passed / report.total,
    profileAccuracy: report.profileAccuracy,
    failureCodeCount,
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
