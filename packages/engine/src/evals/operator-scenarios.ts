import type { Task } from "../types.js";

export type OperatorScenarioDecision = "accepted" | "deferred" | "rejected";
export type OperatorScenarioJourney =
  | "repo_acceptance"
  | "failure_triage"
  | "skill_promotion_review"
  | "workbench_review"
  | "governed_execution"
  | "automation_no_op_review"
  | "connector_readonly_review";

export interface OperatorScenarioEvalCase {
  id: string;
  title: string;
  level: "L3";
  journey: OperatorScenarioJourney;
  task: Task;
  expectedDecision: OperatorScenarioDecision;
  proves: string;
}

export interface OperatorEvidenceLink {
  kind: "run" | "eval" | "debug_bundle" | "skill" | "tool" | "doc";
  ref: string;
}

export interface OperatorScenarioReview {
  decision: OperatorScenarioDecision;
  confidence: number;
  falseConfidenceRisks: string[];
  blockingIssues: string[];
  nextActions: string[];
  evidenceLinks: OperatorEvidenceLink[];
}

export interface OperatorScenarioReviewer {
  mode: "fixture" | "manual";
  review(testCase: OperatorScenarioEvalCase): Promise<OperatorScenarioReview>;
}

export interface OperatorScenarioFinding {
  code: "fixture_level" | "empty_dataset" | "decision_mismatch" | "missing_next_action" | "missing_evidence";
  severity: "info" | "warning" | "blocking";
  message: string;
  caseId?: string;
}

export interface OperatorScenarioCaseResult {
  id: string;
  title: string;
  level: "L3";
  journey: OperatorScenarioJourney;
  expectedDecision: OperatorScenarioDecision;
  review: OperatorScenarioReview;
  passed: boolean;
  failures: string[];
  proves: string;
}

export interface OperatorScenarioEvalReport {
  startedAt: string;
  durationMs: number;
  level: "L3";
  datasetId: string;
  healthClaim: string;
  totals: { total: number; passed: number; failed: number };
  decisions: Record<OperatorScenarioDecision, number>;
  averageConfidence: number | null;
  falseConfidenceRiskCount: number;
  findings: OperatorScenarioFinding[];
  cases: OperatorScenarioCaseResult[];
}

export interface OperatorAcceptanceCaseSignoff {
  caseId: string;
  humanDecision: OperatorScenarioDecision;
  evidenceInspected: boolean;
  falseConfidenceRisksAccepted: boolean;
  overrideReason?: string;
  notes?: string;
  blockingIssues?: string[];
  nextActions?: string[];
}

export interface OperatorAcceptanceSignoff {
  datasetId: string;
  reviewerName: string;
  reviewedAt: string;
  finalDecision: OperatorScenarioDecision;
  cases: OperatorAcceptanceCaseSignoff[];
}

export interface OperatorAcceptanceIssue {
  code:
    | "dataset_mismatch"
    | "reviewer_missing"
    | "reviewed_at_invalid"
    | "final_decision_invalid"
    | "missing_case_signoff"
    | "unknown_case_signoff"
    | "human_decision_invalid"
    | "evidence_not_inspected"
    | "false_confidence_not_accepted"
    | "override_missing_reason"
    | "human_blocking_issue";
  severity: "warning" | "blocking";
  message: string;
  caseId?: string;
}

export interface OperatorAcceptanceCaseRecord {
  caseId: string;
  title: string;
  expectedDecision: OperatorScenarioDecision;
  fixtureDecision: OperatorScenarioDecision;
  humanDecision?: OperatorScenarioDecision;
  evidenceInspected: boolean;
  falseConfidenceRisksAccepted: boolean;
  overrideReason?: string;
  notes?: string;
  blockingIssues: string[];
  nextActions: string[];
}

export interface OperatorAcceptanceRecord {
  kind: "operator-human-acceptance";
  datasetId: string;
  generatedAt: string;
  fixtureOnly: false;
  reviewerName: string;
  reviewedAt: string;
  finalDecision: OperatorScenarioDecision;
  accepted: boolean;
  totals: { total: number; signedOff: number; blockingIssues: number };
  issues: OperatorAcceptanceIssue[];
  cases: OperatorAcceptanceCaseRecord[];
}

export const OPERATOR_L3_DATASET_ID = "operator-scenario-v1";

export const DEFAULT_OPERATOR_L3_CASES: OperatorScenarioEvalCase[] = [
  scenario("repo-acceptance", "Repo acceptance gate", "repo_acceptance", "Review repo quality gates before accepting the branch", "accepted", "quality gates and evidence are sufficient for acceptance"),
  scenario("failure-triage", "Failure triage ownership", "failure_triage", "Triage a failed run and assign owner without retrying blindly", "deferred", "failed runs need owner, evidence, and next action"),
  scenario("skill-promotion-review", "Skill promotion review", "skill_promotion_review", "Review a learned skill before promotion", "deferred", "skill promotion requires eval coverage and rollback notes"),
  scenario("workbench-review", "Workbench run review", "workbench_review", "Review a run detail page for evidence and false confidence", "accepted", "workbench run detail can support manual review"),
  scenario("governed-execution", "Governed execution denial", "governed_execution", "Review a governed execution request with risky side effects", "rejected", "approval-first governance can reject unsafe execution"),
  scenario("automation-no-op-review", "Automation no-op review", "automation_no_op_review", "Review a no-op automation result without claiming health", "deferred", "no-op automation must state scope and what it does not prove"),
  scenario("connector-readonly-review", "Readonly connector review", "connector_readonly_review", "Review readonly connector evidence and source attribution", "accepted", "readonly connectors can support review without external writes"),
];

export function createOperatorScenarioFixtureReviewer(): OperatorScenarioReviewer {
  return {
    mode: "fixture",
    async review(testCase) {
      return fixtureReviewFor(testCase);
    },
  };
}

export async function runOperatorScenarioEvalCases(
  evalCases: OperatorScenarioEvalCase[],
  reviewer: OperatorScenarioReviewer,
): Promise<OperatorScenarioEvalReport> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const cases: OperatorScenarioCaseResult[] = [];

  for (const evalCase of evalCases) {
    try {
      const review = await reviewer.review(evalCase);
      cases.push(evaluateCase(evalCase, review));
    } catch (error) {
      cases.push(errorCase(evalCase, error));
    }
  }

  return buildReport(cases, Date.now() - started, startedAt);
}

export function formatOperatorAcceptancePacket(report: OperatorScenarioEvalReport): string {
  const lines: string[] = [
    "# L3 Operator Acceptance Packet",
    "",
    `Dataset: ${report.datasetId}`,
    `Started: ${report.startedAt}`,
    `Fixture totals: ${report.totals.passed}/${report.totals.total} cases passed`,
    `Health claim: ${report.healthClaim}`,
    "",
    "> Fixture results are not human acceptance. A human reviewer must inspect the linked evidence and complete the manual sign-off section.",
    "",
    "## Proof boundary",
    "",
    "- Proven: deterministic L3 operator scenario fixtures were evaluated and linked evidence was listed.",
    "- Not proven: human acceptance, production health, live operator readiness, or code-owner approval.",
    "- Evidence inspected: must be checked by the human reviewer before any accepted decision.",
    "- Override reason: required when a human decision overrides fixture evidence or the expected journey outcome.",
    "",
    "## Manual Sign-off",
    "",
    "- [ ] Human reviewer name:",
    "- [ ] Review date:",
    "- [ ] Evidence links opened and inspected",
    "- [ ] Human decision matches or overrides fixture decision",
    "- [ ] Override reason recorded when decision overrides fixture evidence",
    "- [ ] Blocking issues and next actions recorded",
    "- [ ] False-confidence risks accepted or mitigated",
    "",
    "## Scenario Checklist",
    "",
  ];

  for (const testCase of report.cases) {
    lines.push(
      `### ${testCase.id}`,
      "",
      `Title: ${testCase.title}`,
      `Journey: ${testCase.journey}`,
      `Expected decision: ${testCase.expectedDecision}`,
      `Fixture decision: ${testCase.review.decision}`,
      `Confidence: ${testCase.review.confidence.toFixed(2)}`,
      `Proves: ${testCase.proves}`,
      "",
      "Evidence links:",
      ...listOrNone(testCase.review.evidenceLinks.map((link) => `${link.kind}:${link.ref}`)),
      "",
      "Blocking issues:",
      ...listOrNone(testCase.review.blockingIssues),
      "",
      "Next actions:",
      ...listOrNone(testCase.review.nextActions),
      "",
      "False-confidence risks:",
      ...listOrNone(testCase.review.falseConfidenceRisks),
      "",
      "- [ ] Evidence inspected",
      "- [ ] Human decision recorded",
      "- [ ] Override reason:",
      "- [ ] Notes:",
      "",
    );
  }

  if (report.findings.length > 0) {
    lines.push("## Fixture Findings", "");
    for (const finding of report.findings) {
      lines.push(`- ${finding.severity}: ${finding.code}${finding.caseId ? ` (${finding.caseId})` : ""} - ${finding.message}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function buildOperatorAcceptanceRecord(
  report: OperatorScenarioEvalReport,
  signoff: OperatorAcceptanceSignoff,
  generatedAt = new Date().toISOString(),
): OperatorAcceptanceRecord {
  const issues: OperatorAcceptanceIssue[] = [];
  if (signoff.datasetId !== report.datasetId) {
    issues.push({
      code: "dataset_mismatch",
      severity: "blocking",
      message: `Sign-off dataset ${signoff.datasetId} does not match report dataset ${report.datasetId}.`,
    });
  }
  if (!signoff.reviewerName?.trim()) {
    issues.push({ code: "reviewer_missing", severity: "blocking", message: "Human reviewer name is required." });
  }
  if (!Number.isFinite(Date.parse(signoff.reviewedAt))) {
    issues.push({ code: "reviewed_at_invalid", severity: "blocking", message: "reviewedAt must be an ISO date string." });
  }
  if (!isOperatorDecision(signoff.finalDecision)) {
    issues.push({ code: "final_decision_invalid", severity: "blocking", message: "finalDecision must be accepted, deferred, or rejected." });
  }

  const signoffsByCase = new Map(signoff.cases.map((item) => [item.caseId, item]));
  const reportCaseIds = new Set(report.cases.map((item) => item.id));
  const caseRecords: OperatorAcceptanceCaseRecord[] = [];

  for (const testCase of report.cases) {
    const signed = signoffsByCase.get(testCase.id);
    if (!signed) {
      issues.push({ code: "missing_case_signoff", severity: "blocking", caseId: testCase.id, message: "Human sign-off is missing for this scenario." });
      caseRecords.push(caseRecordFor(testCase, undefined));
      continue;
    }

    if (!isOperatorDecision(signed.humanDecision)) {
      issues.push({ code: "human_decision_invalid", severity: "blocking", caseId: testCase.id, message: "humanDecision must be accepted, deferred, or rejected." });
    }
    if (signed.evidenceInspected !== true) {
      issues.push({ code: "evidence_not_inspected", severity: "blocking", caseId: testCase.id, message: "Evidence must be inspected before acceptance." });
    }
    if (signed.falseConfidenceRisksAccepted !== true) {
      issues.push({ code: "false_confidence_not_accepted", severity: "blocking", caseId: testCase.id, message: "False-confidence risks must be accepted or mitigated." });
    }
    const overridesFixtureDecision = signed.humanDecision !== testCase.review.decision;
    const overridesExpectedDecision = signed.humanDecision !== testCase.expectedDecision;
    if ((overridesFixtureDecision || overridesExpectedDecision) && !signed.overrideReason?.trim()) {
      issues.push({ code: "override_missing_reason", severity: "blocking", caseId: testCase.id, message: "Human decision overrides fixture evidence or the expected journey outcome but has no overrideReason." });
    }
    for (const issue of signed.blockingIssues ?? []) {
      if (issue.trim()) {
        issues.push({ code: "human_blocking_issue", severity: "blocking", caseId: testCase.id, message: issue });
      }
    }
    caseRecords.push(caseRecordFor(testCase, signed));
  }

  for (const signed of signoff.cases) {
    if (!reportCaseIds.has(signed.caseId)) {
      issues.push({ code: "unknown_case_signoff", severity: "warning", caseId: signed.caseId, message: "Sign-off references a scenario that is not in the report." });
    }
  }

  const blockingIssues = issues.filter((issue) => issue.severity === "blocking").length;
  return {
    kind: "operator-human-acceptance",
    datasetId: report.datasetId,
    generatedAt,
    fixtureOnly: false,
    reviewerName: signoff.reviewerName,
    reviewedAt: signoff.reviewedAt,
    finalDecision: signoff.finalDecision,
    accepted: signoff.finalDecision === "accepted" && blockingIssues === 0,
    totals: {
      total: report.cases.length,
      signedOff: report.cases.filter((testCase) => signoffsByCase.has(testCase.id)).length,
      blockingIssues,
    },
    issues,
    cases: caseRecords,
  };
}

function caseRecordFor(testCase: OperatorScenarioCaseResult, signed: OperatorAcceptanceCaseSignoff | undefined): OperatorAcceptanceCaseRecord {
  return {
    caseId: testCase.id,
    title: testCase.title,
    expectedDecision: testCase.expectedDecision,
    fixtureDecision: testCase.review.decision,
    ...(signed?.humanDecision ? { humanDecision: signed.humanDecision } : {}),
    evidenceInspected: signed?.evidenceInspected === true,
    falseConfidenceRisksAccepted: signed?.falseConfidenceRisksAccepted === true,
    ...(signed?.overrideReason ? { overrideReason: signed.overrideReason } : {}),
    ...(signed?.notes ? { notes: signed.notes } : {}),
    blockingIssues: signed?.blockingIssues ?? [],
    nextActions: signed?.nextActions ?? [],
  };
}

function isOperatorDecision(value: unknown): value is OperatorScenarioDecision {
  return value === "accepted" || value === "deferred" || value === "rejected";
}

function listOrNone(items: string[]): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : ["- None"];
}

function scenario(
  id: string,
  title: string,
  journey: OperatorScenarioJourney,
  goal: string,
  expectedDecision: OperatorScenarioDecision,
  proves: string,
): OperatorScenarioEvalCase {
  return { id, title, level: "L3", journey, task: { goal, profile: "auto" }, expectedDecision, proves };
}

function evaluateCase(evalCase: OperatorScenarioEvalCase, review: OperatorScenarioReview): OperatorScenarioCaseResult {
  const failures = [
    ...(review.decision !== evalCase.expectedDecision ? [`expected decision ${evalCase.expectedDecision}, got ${review.decision}`] : []),
    ...(review.evidenceLinks.length === 0 ? ["review is missing evidence links"] : []),
    ...(review.decision !== "accepted" && review.nextActions.length === 0 ? ["non-accepted review is missing next actions"] : []),
  ];
  return {
    id: evalCase.id,
    title: evalCase.title,
    level: "L3",
    journey: evalCase.journey,
    expectedDecision: evalCase.expectedDecision,
    review,
    passed: failures.length === 0,
    failures,
    proves: evalCase.proves,
  };
}

function buildReport(
  cases: OperatorScenarioCaseResult[],
  durationMs: number,
  startedAt: string,
): OperatorScenarioEvalReport {
  const total = cases.length;
  const passed = cases.filter((item) => item.passed).length;
  const findings: OperatorScenarioFinding[] = total === 0
    ? [{ code: "empty_dataset", severity: "blocking", message: "No L3 operator scenario cases were provided." }]
    : [{ code: "fixture_level", severity: "info", message: "L3 operator report uses deterministic fixture reviews, not live human acceptance." }];

  for (const item of cases) {
    if (item.review.decision !== item.expectedDecision) {
      findings.push({ code: "decision_mismatch", severity: "blocking", caseId: item.id, message: "Reviewer decision did not match expected journey outcome." });
    }
    if (item.review.evidenceLinks.length === 0) {
      findings.push({ code: "missing_evidence", severity: "blocking", caseId: item.id, message: "Reviewer output had no evidence links." });
    }
    if (item.review.decision !== "accepted" && item.review.nextActions.length === 0) {
      findings.push({ code: "missing_next_action", severity: "warning", caseId: item.id, message: "Non-accepted review needs next actions." });
    }
  }

  return {
    startedAt,
    durationMs,
    level: "L3",
    datasetId: OPERATOR_L3_DATASET_ID,
    healthClaim: "Manual-review scenario fixture, not autonomous product certification",
    totals: { total, passed, failed: total - passed },
    decisions: {
      accepted: cases.filter((item) => item.review.decision === "accepted").length,
      deferred: cases.filter((item) => item.review.decision === "deferred").length,
      rejected: cases.filter((item) => item.review.decision === "rejected").length,
    },
    averageConfidence: total === 0 ? null : cases.reduce((sum, item) => sum + item.review.confidence, 0) / total,
    falseConfidenceRiskCount: cases.reduce((sum, item) => sum + item.review.falseConfidenceRisks.length, 0),
    findings,
    cases,
  };
}

function fixtureReviewFor(testCase: OperatorScenarioEvalCase): OperatorScenarioReview {
  switch (testCase.id) {
    case "repo-acceptance":
      return accepted(0.86, ["run:quality-gates", "eval:real-world-l2"], ["Branch acceptance still depends on code owner review."]);
    case "failure-triage":
      return deferred(
        0.72,
        ["debug_bundle:run_failed_001", "run:run_failed_001"],
        ["Failure owner needs to inspect debug bundle before retry."],
        ["Open the linked debug bundle and assign an owner."],
        ["A green retry would not explain the original failure."],
      );
    case "skill-promotion-review":
      return deferred(
        0.68,
        ["skill:learned-note", "eval:skill-coverage"],
        ["Skill lacks sufficient eval coverage for promotion."],
        ["Add a replay fixture and rollback note before promotion."],
        ["Promoting from one trajectory may encode accidental behavior."],
      );
    case "workbench-review":
      return accepted(0.81, ["run:run_detail_demo", "doc:run-record"], ["Static shell does not prove full interactive product readiness."]);
    case "governed-execution":
      return rejected(
        0.9,
        ["run:approval-denied", "doc:permission-risk"],
        ["Requested action exceeds approved local scope."],
        ["Ask for explicit human approval or reduce the task to readonly inspection."],
        ["Approval bypass would create an unaudited side effect."],
      );
    case "automation-no-op-review":
      return deferred(
        0.77,
        ["run:no-op-automation", "doc:automation-scope"],
        ["No-op scope is narrow and does not prove system health."],
        ["Expand scope or record that no hidden failures were inspected."],
        ["No findings can be mistaken for full health."],
      );
    case "connector-readonly-review":
      return accepted(0.84, ["tool:github_repo_read", "tool:http_get"], ["Readonly connector evidence may still become stale."]);
    default:
      return deferred(0.5, ["doc:unknown-case"], ["Unknown operator scenario."], ["Add fixture reviewer coverage."], ["Unknown case could be misread as accepted."]);
  }
}

function accepted(confidence: number, refs: string[], risks: string[]): OperatorScenarioReview {
  return review("accepted", confidence, refs, [], [], risks);
}

function deferred(
  confidence: number,
  refs: string[],
  blockingIssues: string[],
  nextActions: string[],
  risks: string[],
): OperatorScenarioReview {
  return review("deferred", confidence, refs, blockingIssues, nextActions, risks);
}

function rejected(
  confidence: number,
  refs: string[],
  blockingIssues: string[],
  nextActions: string[],
  risks: string[],
): OperatorScenarioReview {
  return review("rejected", confidence, refs, blockingIssues, nextActions, risks);
}

function review(
  decision: OperatorScenarioDecision,
  confidence: number,
  refs: string[],
  blockingIssues: string[],
  nextActions: string[],
  falseConfidenceRisks: string[],
): OperatorScenarioReview {
  return {
    decision,
    confidence,
    falseConfidenceRisks,
    blockingIssues,
    nextActions,
    evidenceLinks: refs.map(evidenceLink),
  };
}

function evidenceLink(value: string): OperatorEvidenceLink {
  const [kind, ...rest] = value.split(":");
  return {
    kind: evidenceKind(kind),
    ref: rest.join(":") || value,
  };
}

function evidenceKind(value: string | undefined): OperatorEvidenceLink["kind"] {
  const allowed = new Set<OperatorEvidenceLink["kind"]>(["run", "eval", "debug_bundle", "skill", "tool", "doc"]);
  return value && allowed.has(value as OperatorEvidenceLink["kind"]) ? value as OperatorEvidenceLink["kind"] : "doc";
}

function errorCase(evalCase: OperatorScenarioEvalCase, error: unknown): OperatorScenarioCaseResult {
  const message = error instanceof Error ? error.message : String(error);
  return evaluateCase(evalCase, {
    decision: "deferred",
    confidence: 0,
    falseConfidenceRisks: ["Reviewer fixture failed; do not treat this case as accepted."],
    blockingIssues: [message],
    nextActions: ["Fix the operator scenario reviewer fixture."],
    evidenceLinks: [],
  });
}
