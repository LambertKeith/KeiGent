import { escapeHtml } from "../ui/html.js";
import { normalizeRunRecord, summarizeRunRecords, type RunRecordCollectionView, type RunRecordDetailView, type RunRecordListItem } from "./model.js";

export interface RunWorkbenchStats {
  total: number;
  needsAction: number;
  replayable: number;
  failedOrDegraded: number;
}

export interface RunWorkbenchView {
  collection: RunRecordCollectionView;
  selected?: RunRecordDetailView;
  stats: RunWorkbenchStats;
}

export function buildRunWorkbenchView(records: unknown[], selectedRunId?: string): RunWorkbenchView {
  const details = records
    .map(normalizeRunRecord)
    .sort((a, b) => b.summary.createdAt.localeCompare(a.summary.createdAt));
  const selected = details.find((detail) => detail.summary.id === selectedRunId) ?? details[0];

  return {
    collection: summarizeRunRecords(records),
    ...(selected ? { selected } : {}),
    stats: {
      total: details.length,
      needsAction: details.filter((detail) => detail.nextAction.required).length,
      replayable: details.filter((detail) => detail.replay.supported).length,
      failedOrDegraded: details.filter((detail) => ["failed", "degraded", "cancelled"].includes(detail.summary.status)).length,
    },
  };
}

export function renderRunWorkbench(view: RunWorkbenchView): string {
  if (view.collection.empty || !view.selected) {
    return `
      <section class="hero compact"><p class="eyebrow">Runs</p><h1>RunRecord is the product contract.</h1><p>No saved runs are available yet.</p></section>
      <section class="workbench-grid"><aside class="panel run-list-panel">${renderRunList(view.collection.runs, undefined)}</aside><section class="empty-state">${escapeHtml(view.collection.emptyMessage ?? "No run records saved")}</section></section>
    `;
  }

  return `
    <section class="hero compact"><p class="eyebrow">Runs</p><h1>RunRecord is the product contract.</h1><p>Review route, evidence, risk, budget, replay, and redacted payloads from one run record.</p></section>
    <section class="run-stats" aria-label="Run queues">
      ${renderStat("Total", view.stats.total)}
      ${renderStat("Needs action", view.stats.needsAction)}
      ${renderStat("Replayable", view.stats.replayable)}
      ${renderStat("Failed/degraded", view.stats.failedOrDegraded)}
    </section>
    <section class="workbench-grid">
      <aside class="panel run-list-panel">${renderRunList(view.collection.runs, view.selected.summary.id)}</aside>
      <section class="run-detail-stack">
        ${renderSummary(view.selected)}
        ${renderRouteAndSkills(view.selected)}
        ${renderEvidenceAndRisk(view.selected)}
        ${renderProofBoundary(view.selected)}
        ${renderToolsAndBudget(view.selected)}
        ${renderReplayAndFailures(view.selected)}
        ${renderRawInspector(view.selected)}
      </section>
    </section>
  `;
}

function renderRunList(runs: RunRecordListItem[], selectedId: string | undefined): string {
  const rows = runs.map((run) => `
    <button class="run-row ${run.id === selectedId ? "selected" : ""}" data-run-id="${escapeHtml(run.id)}">
      <span><strong>${escapeHtml(run.id)}</strong><small>${escapeHtml(run.createdAt)}</small></span>
      <span>${escapeHtml(run.status)}</span>
      <span>${escapeHtml(run.evidenceLabel)}</span>
      <span>${escapeHtml(run.riskLabel)}</span>
    </button>
  `).join("");
  return `<h2>Run list</h2>${rows || "<p>No run records saved</p>"}`;
}

function renderSummary(run: RunRecordDetailView): string {
  return panel("Run summary", `
    <div class="summary-strip">
      ${renderFact("Status", run.summary.status)}
      ${renderFact("Profile", run.summary.profile)}
      ${renderFact("Workflow", run.summary.workflowMode)}
      ${renderFact("Evidence", run.summary.evidenceLabel)}
      ${renderFact("Risk", run.summary.riskLabel)}
      ${renderFact("Next action", run.nextAction.label)}
    </div>
    <p class="run-goal">${escapeHtml(run.summary.goal)}</p>
  `);
}

function renderRouteAndSkills(run: RunRecordDetailView): string {
  const skills = run.skills.map((skill) => `
    <tr>
      <td>${escapeHtml(skill.name)}</td>
      <td>${skill.injected ? "Injected" : "Available"}</td>
      <td>${escapeHtml(skill.riskDelta)}</td>
      <td>${escapeHtml(skill.reason)}</td>
      <td>${escapeHtml(skill.evalCoverage.join(", ") || "No eval coverage")}</td>
    </tr>
  `).join("");
  return panel("Route and skills", `
    <div class="summary-strip">
      ${renderFact("Source", run.route.source)}
      ${renderFact("Selected profile", run.route.selectedProfile)}
      ${renderFact("Matched skills", String(run.route.matchedSkillIds.length))}
      ${renderFact("Rationale", run.route.rationale ?? "Not reported")}
    </div>
    <div class="table-wrap"><table><thead><tr><th>Skill</th><th>Status</th><th>Risk</th><th>Reason</th><th>Eval coverage</th></tr></thead><tbody>${skills}</tbody></table></div>
  `);
}

function renderEvidenceAndRisk(run: RunRecordDetailView): string {
  const approvals = run.approvals.map((approval) => `
    <tr><td>${escapeHtml(approval.toolName)}</td><td>${approval.approved ? "Approved" : "Denied"}</td><td>${escapeHtml(approval.riskLevel)}</td><td>${escapeHtml(approval.targetResource)}</td></tr>
  `).join("");
  return `
    <div class="split-panels">
      ${panel("Evidence", `
        <div class="summary-strip">
          ${renderFact("Status", run.evidence.status)}
          ${renderFact("Passed", `${run.evidence.passed}/${run.evidence.total}`)}
          ${renderFact("Failed", String(run.evidence.failed))}
          ${renderFact("Sources", run.evidence.sources.join(", ") || "None")}
        </div>
        ${renderListBlock("Blocking evidence", run.evidence.blocking)}
      `)}
      ${panel("Risk and approvals", `
        <div class="summary-strip">
          ${renderFact("Highest risk", run.risk.highestRiskLevel)}
          ${renderFact("Approval", run.risk.approvalRequired ? "Required" : "Not required")}
          ${renderFact("Side effects", `${run.risk.sideEffectsSucceeded}/${run.risk.sideEffectsAttempted}`)}
          ${renderFact("Irreversible", String(run.risk.irreversibleActions))}
        </div>
        <div class="table-wrap"><table><thead><tr><th>Tool</th><th>Decision</th><th>Risk</th><th>Target</th></tr></thead><tbody>${approvals || `<tr><td colspan="4">No approvals recorded</td></tr>`}</tbody></table></div>
      `)}
    </div>
  `;
}

function renderProofBoundary(run: RunRecordDetailView): string {
  return panel("Proof boundary", `
    <div class="split-panels">
      ${renderListBlock("Proven", run.proofBoundary.proven)}
      ${renderListBlock("Not proven", run.proofBoundary.notProven)}
    </div>
    <div class="split-panels">
      ${renderListBlock("Assumptions", run.proofBoundary.assumptions)}
      ${renderListBlock("Evidence gaps", run.proofBoundary.evidenceGaps)}
    </div>
  `);
}

function renderToolsAndBudget(run: RunRecordDetailView): string {
  const tools = run.tools.map((tool) => `
    <tr>
      <td>${escapeHtml(tool.name)}</td>
      <td>${tool.attempted ? "Attempted" : "Not attempted"}</td>
      <td>${tool.succeeded ? "Succeeded" : "Not succeeded"}</td>
      <td>${escapeHtml(tool.permission)}</td>
      <td>${escapeHtml(tool.riskLevel)}</td>
      <td>${escapeHtml(tool.targetResource ?? "Not reported")}</td>
    </tr>
  `).join("");
  return panel("Tools and budget", `
    <div class="summary-strip">
      ${renderFact("Iterations", run.budget.iterations.label)}
      ${renderFact("Tool calls", run.budget.toolCalls.label)}
      ${renderFact("Token estimate", run.budget.tokenEstimate.label)}
      ${renderFact("Provider tokens", run.budget.providerUsage.tokenLabel)}
      ${renderFact("Provider cost", run.budget.providerUsage.costLabel)}
      ${renderFact("Recovery", run.budget.recoveryAttempts.label)}
    </div>
    <div class="table-wrap"><table><thead><tr><th>Tool</th><th>Attempt</th><th>Result</th><th>Permission</th><th>Risk</th><th>Target</th></tr></thead><tbody>${tools || `<tr><td colspan="6">No tools recorded</td></tr>`}</tbody></table></div>
  `);
}

function renderReplayAndFailures(run: RunRecordDetailView): string {
  const artifacts = run.artifacts.map((artifact) => `<li><strong>${escapeHtml(artifact.kind)}</strong><span>${escapeHtml(artifact.path)}</span></li>`).join("");
  const failures = run.failures.map((failure) => `<li><strong>${escapeHtml(failure.code)}</strong><span>${escapeHtml(failure.layer)}: ${escapeHtml(failure.message)} Next: ${escapeHtml(failure.nextAction)}</span></li>`).join("");
  return `
    <div class="split-panels">
      ${panel("Replay and artifacts", `
        <div class="summary-strip">
          ${renderFact("Replay", run.replay.label)}
          ${renderFact("Fresh execution", run.replay.freshExecution ? "Yes" : "No")}
          ${renderFact("Trajectory", run.replay.trajectoryPath ?? "Not available")}
          ${renderFact("Latest report", run.replay.latestReplayReportId ?? "Not available")}
        </div>
        <ul class="audit-list">${artifacts || "<li>No artifacts recorded</li>"}</ul>
      `)}
      ${panel("Failures", `<ul class="audit-list">${failures || "<li>No failures recorded</li>"}</ul>`)}
    </div>
  `;
}

function renderRawInspector(run: RunRecordDetailView): string {
  return panel("Raw redacted record", `<pre class="raw-inspector">${escapeHtml(run.rawJson)}</pre>`);
}

function renderStat(label: string, value: number): string {
  return `<div class="kpi compact"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function renderFact(label: string, value: string): string {
  return `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`;
}

function renderListBlock(label: string, items: string[]): string {
  const body = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>None</li>";
  return `<div class="list-block"><strong>${escapeHtml(label)}</strong><ul>${body}</ul></div>`;
}

function panel(title: string, body: string): string {
  return `<section class="panel"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}
