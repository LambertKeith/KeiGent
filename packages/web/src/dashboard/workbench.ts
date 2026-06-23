import { escapeHtml } from "../ui/html.js";
import type { RealWorldEvalReportView, RealWorldMetricView } from "./report-model.js";

type ProofBoundaryView = RealWorldEvalReportView["proofBoundary"];

export function renderRealWorldEvalDashboard(view: RealWorldEvalReportView): string {
  return `
    <section class="hero compact"><p class="eyebrow">Dashboard</p><h1>Eval-run linkage without health theater.</h1><p>${escapeHtml(view.healthClaim)}</p></section>
    <section class="run-stats" aria-label="Eval metrics">
      ${renderMetric("Route accuracy", view.metrics.routeAccuracy)}
      ${renderMetric("Task success", view.metrics.taskSuccessRate)}
      ${renderMetric("Evidence quality", view.metrics.evidenceQuality)}
      ${renderMetric("Tool reliability", view.metrics.toolReliability)}
      ${renderMetric("Risk compliance", view.metrics.riskCompliance)}
    </section>
    <section class="split-panels">
      ${panel("Eval-run linkage", renderCaseTable(view))}
      ${panel("False-confidence findings", renderFindings(view))}
    </section>
    <section class="split-panels">
      ${panel("Proof boundary", renderProofBoundary(view))}
      ${panel("Product rules", "<ul class=\"audit-list\"><li>Eval pass is not profile accuracy.</li><li>Replay report is not fresh execution.</li><li>Failure-code count can exceed failed case count.</li><li>Fixture-level reports do not prove product health.</li></ul>")}
    </section>
  `;
}

export function sampleRealWorldEvalDashboardView(): RealWorldEvalReportView {
  return {
    startedAt: "2026-06-10T00:00:00.000Z",
    durationMs: 42,
    level: "L2",
    datasetId: "local-real-task-v1",
    totals: { total: 3, passed: 3, failed: 0 },
    healthClaim: "Fixture-level regression, not product health",
    metrics: {
      routeAccuracy: { value: 1, label: "100.0%" },
      taskSuccessRate: { value: 1 / 3, label: "33.3%" },
      evidenceQuality: { value: 1, label: "100.0%" },
      toolReliability: { value: 1, label: "100.0%" },
      riskCompliance: { value: 1, label: "100.0%" },
    },
    falseSuccessCount: 0,
    falseConfidenceFindings: [
      { code: "fixture_level", severity: "info", message: "Fixture-level report only." },
    ],
    proofBoundary: {
      proven: ["Deterministic L2 fixture cases were evaluated."],
      notProven: ["Fixture results do not prove product health."],
      assumptions: ["Fixtures represent selected local acceptance boundaries only."],
      evidenceGaps: [],
    },
    cases: [
      caseView("file-summary", "Summarize file with evidence", "run_file-summary", "success", "success", true, true, true, true, true),
      caseView("replay-report", "Replay report boundary", "run_replay-report", "replay", "replay", true, true, true, true, false),
      caseView("insufficient-evidence-success-claim", "Insufficient evidence success claim", "run_insufficient-evidence-success-claim", "failure", "failure", true, true, true, true, true, ["insufficient_evidence"], ["success claim was downgraded before acceptance"]),
    ],
  };
}

function caseView(
  id: string,
  title: string,
  runId: string,
  expectedResult: string,
  result: string,
  passed: boolean,
  routeMatched: boolean,
  evidenceChecked: boolean,
  riskCompliant: boolean,
  replayFreshExecution: boolean,
  failureCodes: string[] = [],
  failures: string[] = [],
): RealWorldEvalReportView["cases"][number] {
  return {
    id,
    title,
    level: "L2",
    runId,
    runDetailHref: `#runs/${encodeURIComponent(runId)}`,
    expectedResult,
    result,
    passed,
    routeMatched,
    taskSucceeded: result === "success",
    evidenceChecked,
    riskCompliant,
    falseSuccess: failureCodes.includes("false_success"),
    status: result === "success" ? "succeeded" : result,
    evidenceStatus: evidenceChecked ? "passed" : "not_checked",
    replayFreshExecution,
    failureCodes,
    failures,
    proofBoundary: {
      proven: passed ? [`Case ${id} matched fixture expectation.`] : [],
      notProven: ["Fixture case does not prove product health."],
      assumptions: ["Sample dashboard data is illustrative."],
      evidenceGaps: passed ? [] : failures,
    },
    caseReview: {
      verdict: replayFreshExecution ? (passed ? "evidence_backed" : "blocked") : "replay_only",
      label: replayFreshExecution
        ? (passed ? "Evidence-backed case result" : "Blocked before reviewer acceptance")
        : "Replay result, not a fresh execution",
      reason: replayFreshExecution
        ? (passed ? "Case passed with checked evidence and no proof gaps." : failures[0] ?? "Eval case did not satisfy its acceptance criteria.")
        : "RunRecord replay.freshExecution=false.",
      nextAction: replayFreshExecution
        ? (passed ? "Open Run Detail to inspect supporting evidence before acceptance." : "Resolve blocking eval findings before reviewer acceptance.")
        : "Open Run Detail and do not treat replay as fresh execution.",
    },
  };
}

function renderCaseTable(view: RealWorldEvalReportView): string {
  const rows = view.cases.map((testCase) => `
    <tr>
      <td><a href="${escapeHtml(testCase.runDetailHref)}">${escapeHtml(testCase.id)}</a><small>${escapeHtml(testCase.runId)}</small></td>
      <td>${escapeHtml(testCase.expectedResult)} -> ${escapeHtml(testCase.result)}</td>
      <td>${testCase.passed ? "Passed" : "Failed"}</td>
      <td>${testCase.routeMatched ? "Matched" : "Mismatch"}</td>
      <td>${testCase.evidenceChecked ? escapeHtml(testCase.evidenceStatus) : "Not checked"}</td>
      <td>${testCase.replayFreshExecution ? "Fresh execution" : "Replay report"}</td>
      <td><strong>${escapeHtml(testCase.caseReview.label)}</strong><small>${escapeHtml(testCase.caseReview.reason)}</small></td>
      <td>${escapeHtml(testCase.caseReview.nextAction)}</td>
      <td>${escapeHtml(testCase.failureCodes.join(", ") || "None")}</td>
    </tr>
  `).join("");
  return `<p class="run-goal">${escapeHtml(view.datasetId)} · ${escapeHtml(view.level)} · ${view.totals.passed}/${view.totals.total} passed · ${view.falseSuccessCount} false success</p><div class="table-wrap"><table><thead><tr><th>Case / run</th><th>Expected/result</th><th>Eval</th><th>Route</th><th>Evidence</th><th>Execution</th><th>Reviewer verdict</th><th>Next action</th><th>Failure codes</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderFindings(view: RealWorldEvalReportView): string {
  const findings = view.falseConfidenceFindings.map((finding) => `
    <li>
      <strong>${escapeHtml(finding.code)} · ${escapeHtml(finding.severity)}</strong>
      <span>${finding.caseId ? `${escapeHtml(finding.caseId)}: ` : ""}${escapeHtml(finding.message)}</span>
    </li>
  `).join("");
  return `<ul class="audit-list">${findings || "<li>No false-confidence findings recorded</li>"}</ul>`;
}

function renderProofBoundary(view: RealWorldEvalReportView): string {
  const boundary = proofBoundaryValue(view.proofBoundary);
  return `<ul class="audit-list">
    <li><strong>Proven</strong><span>${escapeHtml(boundary.proven.join(", ") || "None")}</span></li>
    <li><strong>Not proven</strong><span>${escapeHtml(boundary.notProven.join(", ") || "None")}</span></li>
    <li><strong>Assumptions</strong><span>${escapeHtml(boundary.assumptions.join(", ") || "None")}</span></li>
    <li><strong>Evidence gaps</strong><span>${escapeHtml(boundary.evidenceGaps.join(", ") || "None")}</span></li>
  </ul>`;
}

function proofBoundaryValue(value: unknown): ProofBoundaryView {
  if (!value || typeof value !== "object") {
    return {
      proven: [],
      notProven: ["Fixture results do not prove product health."],
      assumptions: ["Proof boundary was absent from the report payload."],
      evidenceGaps: ["Report payload did not include proof boundary evidence."],
    };
  }
  const source = value as Partial<Record<keyof ProofBoundaryView, unknown>>;
  return {
    proven: stringArray(source.proven),
    notProven: stringArray(source.notProven),
    assumptions: stringArray(source.assumptions),
    evidenceGaps: stringArray(source.evidenceGaps),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function renderMetric(label: string, metric: RealWorldMetricView): string {
  return `<div class="kpi compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(metric.label)}</strong></div>`;
}

function panel(title: string, body: string): string {
  return `<section class="panel"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}
