import { NAV_ITEMS, type AppSection } from "./app/nav.js";
import { normalizeConversationRun, type ProgressEvent } from "./conversation/normalize.js";
import { summarizeEvalReport, type EvalReportView } from "./dashboard/report-model.js";
import { SAMPLE_CONFIG_VIEW, deriveConfigStatus } from "./config/config-view.js";
import { escapeHtml } from "./ui/html.js";
import "./styles.css";

const demoEvents: ProgressEvent[] = [
  { kind: "profile_selected", profile: "convergent-exec", via: "rule", ruleId: "skill_match", rationale: "任务匹配执行 skill file-write", signals: ["skill:file-write", "score:17"] },
  { kind: "skills_matched", skills: ["file-write", "checkpoint-verify"] },
  { kind: "iteration_start", iteration: 1 },
  { kind: "tool_call", iteration: 1, toolName: "file_write", args: { path: "hello.txt", apiKey: "redacted-before-display" } },
  { kind: "tool_result", iteration: 1, toolName: "file_write", result: "created", succeeded: true },
  { kind: "checkpoint", iteration: 1, desc: "File exists" },
  { kind: "verdict", iteration: 1, passed: true, evidence: "hello.txt exists" },
  { kind: "done", exitReason: "success", finalResponse: "hello.txt created" },
];

const demoRun = normalizeConversationRun({ id: "demo", mode: "replay", task: { goal: "Create hello.txt and verify it" }, events: demoEvents });

const demoReport: EvalReportView = {
  startedAt: "2026-06-04T08:00:00.000Z",
  durationMs: 42,
  total: 4,
  passed: 4,
  failed: 0,
  profileAccuracy: 1,
  failuresByCode: {},
  cases: [],
};

function renderShell(section: AppSection): string {
  return `
    <div class="ambient"></div>
    <aside class="sidebar" aria-label="KeiGent sections">
      <div class="brand">KeiGent</div>
      <div class="subtitle">Loop clarity, not AI magic.</div>
      <nav>${NAV_ITEMS.map((item) => `<button class="nav-item ${item.id === section ? "active" : ""}" data-section="${item.id}"><span>${item.label}</span><small>${item.description}</small></button>`).join("")}</nav>
    </aside>
    <main class="main">${section === "conversation" ? renderConversation() : section === "dashboard" ? renderDashboard() : renderConfig()}</main>
  `;
}

function renderConversation(): string {
  const timeline = demoRun.timeline.map((item) => `<article class="timeline-card ${item.kind}"><strong>${escapeHtml(item.kind)}</strong><pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre></article>`).join("");
  return `
    <section class="hero"><p class="eyebrow">Conversation Panel</p><h1>One run, fully inspectable.</h1><p>Profile, skills, tools, checkpoints, and final outcome stay visually separate.</p></section>
    <section class="grid three">
      <div class="panel"><h2>Run summary</h2><dl><dt>Status</dt><dd>${demoRun.status}</dd><dt>Profile</dt><dd>${demoRun.selectedProfile}</dd><dt>Tools</dt><dd>${demoRun.metrics.toolCalls}</dd><dt>Checkpoints</dt><dd>${demoRun.metrics.checkpointsPassed}/${demoRun.metrics.checkpoints}</dd></dl></div>
      <div class="panel timeline"><h2>Timeline</h2>${timeline}</div>
      <div class="panel"><h2>Inspector</h2><p>Select a card in the real version to inspect redacted payloads and evidence. Raw JSON is audit support, not the primary story.</p></div>
    </section>
  `;
}

function renderDashboard(): string {
  const summary = summarizeEvalReport(demoReport);
  return `
    <section class="hero"><p class="eyebrow">Dashboard</p><h1>Eval health without false confidence.</h1><p>Pass rate, profile accuracy, and failure taxonomy are separate by design.</p></section>
    <section class="grid kpis">
      <div class="kpi"><span>Pass rate</span><strong>${summary.passRate === null ? "No cases" : `${(summary.passRate * 100).toFixed(1)}%`}</strong></div>
      <div class="kpi"><span>Profile accuracy</span><strong>${summary.profileAccuracy === null ? "Not checked" : `${(summary.profileAccuracy * 100).toFixed(1)}%`}</strong></div>
      <div class="kpi"><span>Failures</span><strong>${demoReport.failed}</strong></div>
      <div class="kpi"><span>Failure-code count</span><strong>${summary.failureCodeCount}</strong></div>
    </section>
    <section class="panel"><h2>Product rules</h2><ul><li>Failure code count may exceed failed case count.</li><li>Tool attempted is not tool succeeded.</li><li>Replay result is not fresh engine execution.</li></ul></section>
  `;
}

function renderConfig(): string {
  const status = deriveConfigStatus(SAMPLE_CONFIG_VIEW);
  return `
    <section class="hero"><p class="eyebrow">Config</p><h1>Source-aware configuration.</h1><p>No hardcoded keys, no raw secrets, no ambiguity about env/file/default precedence.</p></section>
    <section class="panel"><h2>Status: ${status}</h2><div class="config-table">${SAMPLE_CONFIG_VIEW.fields.map((field) => `<div><strong>${field.label}</strong><span>${field.effectiveValue}</span><small>${field.source}</small></div>`).join("")}</div></section>
    <section class="panel warning"><h2>Doctor issues</h2>${SAMPLE_CONFIG_VIEW.doctorIssues.map((issue) => `<p><strong>${issue.code}</strong> — ${issue.message}</p>`).join("")}</section>
  `;
}

function mount(section: AppSection = "conversation") {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("missing #app");
  app.innerHTML = renderShell(section);
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-section]")) {
    button.addEventListener("click", () => mount(button.dataset.section as AppSection));
  }
}

mount();
