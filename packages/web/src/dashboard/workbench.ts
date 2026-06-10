import { escapeHtml } from "../ui/html.js";
import type { RealWorldEvalReportView, RealWorldMetricView } from "./report-model.js";

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
    <section class="panel"><h2>Product rules</h2><ul class="audit-list"><li>Eval pass is not profile accuracy.</li><li>Replay report is not fresh execution.</li><li>Failure-code count can exceed failed case count.</li><li>Fixture-level reports do not prove product health.</li></ul></section>
  `;
}

export function sampleRealWorldEvalDashboardView(): RealWorldEvalReportView {
  return {
    startedAt: "2026-06-10T00:00:00.000Z",
    durationMs: 42,
    level: "L2",
    datasetId: "local-real-task-v1",
    totals: { total: 3, passed: 2, failed: 1 },
    healthClaim: "Fixture-level regression, not product health",
    metrics: {
      routeAccuracy: { value: 1, label: "100.0%" },
      taskSuccessRate: { value: 2 / 3, label: "66.7%" },
      evidenceQuality: { value: 2 / 3, label: "66.7%" },
      toolReliability: { value: 1, label: "100.0%" },
      riskCompliance: { value: 2 / 3, label: "66.7%" },
    },
    falseSuccessCount: 1,
    falseConfidenceFindings: [
      { code: "fixture_level", severity: "info", message: "Fixture-level report only." },
      { code: "false_success", severity: "blocking", caseId: "insufficient-evidence", message: "A non-success case produced success without evidence." },
    ],
    cases: [
      caseView("file-summary", "Summarize file with evidence", "run_file-summary", "success", "success", true, true, true, true, true),
      caseView("replay-report", "Replay report boundary", "run_replay-report", "replay", "replay", true, true, true, true, false),
      caseView("insufficient-evidence", "Insufficient evidence success claim", "run_insufficient-evidence", "failure", "success", false, true, false, false, true, ["false_success"], ["success without evidence"]),
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
      <td>${escapeHtml(testCase.failureCodes.join(", ") || "None")}</td>
    </tr>
  `).join("");
  return `<p class="run-goal">${escapeHtml(view.datasetId)} · ${escapeHtml(view.level)} · ${view.totals.passed}/${view.totals.total} passed · ${view.falseSuccessCount} false success</p><div class="table-wrap"><table><thead><tr><th>Case / run</th><th>Expected/result</th><th>Eval</th><th>Route</th><th>Evidence</th><th>Execution</th><th>Failure codes</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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

function renderMetric(label: string, metric: RealWorldMetricView): string {
  return `<div class="kpi compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(metric.label)}</strong></div>`;
}

function panel(title: string, body: string): string {
  return `<section class="panel"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}
