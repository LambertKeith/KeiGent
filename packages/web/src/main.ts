import { NAV_ITEMS, type AppSection } from "./app/nav.js";
import { hashForSection, parseHashRoute, type WorkbenchRoute } from "./app/hash-route.js";
import { apiBaseUrlFromEnv, createKeigentApiClient } from "./api/client.js";
import { appendProgressEvents } from "./conversation/live-console.js";
import type { NormalizeRunOptions, ProgressEvent } from "./conversation/normalize.js";
import { auditHandoffFromStreamEvent, progressEventsFromStreamEvent, renderWebRunLauncher, type WebRunAuditHandoff, type WebRunStreamEvent } from "./conversation/web-run.js";
import { normalizeRealWorldEvalReport } from "./dashboard/report-model.js";
import { renderRealWorldEvalDashboard, sampleRealWorldEvalDashboardView } from "./dashboard/workbench.js";
import { SAMPLE_CONFIG_VIEW, deriveConfigStatus } from "./config/config-view.js";
import { demoRunRecords } from "./runs/demo-records.js";
import { buildRunWorkbenchView, renderRunWorkbench } from "./runs/workbench.js";
import { buildSkillWorkbenchView, renderSkillWorkbench, sampleSkillInputs } from "./skills/workbench.js";
import { escapeHtml } from "./ui/html.js";
import "./styles.css";
import type { SkillLibraryInput } from "./skills/model.js";

const apiBaseUrl = apiBaseUrlFromEnv(import.meta.env as Record<string, unknown>);
const apiClient = apiBaseUrl ? createKeigentApiClient({ baseUrl: apiBaseUrl }) : undefined;
let activeRunSource: EventSource | undefined;
let launcherError: string | undefined;
let latestAuditHandoff: WebRunAuditHandoff | undefined;

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

const demoTask = { goal: "Create hello.txt and verify it" };
let conversationRun: NormalizeRunOptions = {
  id: "demo",
  mode: "replay",
  task: demoTask,
  events: demoEvents,
};

const demoSkillLibrary: SkillLibraryInput = {
  skills: sampleSkillInputs(),
  matchExplanations: [
    {
      name: "file-write",
      status: "verified",
      score: 12,
      signals: ["tag:file", "requires:file_write"],
      matched: true,
      injected: true,
      riskDelta: "declared R2",
      evalCoverage: ["file-write-positive"],
    },
    {
      name: "browser-review",
      status: "candidate",
      score: 8,
      signals: ["tag:browser"],
      matched: true,
      injected: false,
      exclusionReason: "candidate_not_enabled",
      evalCoverage: ["browser-review-positive"],
    },
    {
      name: "legacy-shell",
      status: "deprecated",
      score: 4,
      signals: ["tag:shell"],
      matched: false,
      injected: false,
      exclusionReason: "status_not_executable",
    },
  ],
  recentMatches: [
    { skillName: "file-write", score: 12, matched: true, injected: true, reason: "tag:file" },
  ],
  learningNotes: {
    "file-write": ["Prefer deterministic file paths before writing."],
  },
};

function renderShell(section: AppSection, content: string): string {
  return `
    <div class="ambient"></div>
    <aside class="sidebar" aria-label="KeiGent sections">
      <div class="brand">KeiGent</div>
      <div class="subtitle">Loop clarity, not AI magic.</div>
      <nav>${NAV_ITEMS.map((item) => `<button class="nav-item ${item.id === section ? "active" : ""}" data-section="${item.id}"><span>${item.label}</span><small>${item.description}</small></button>`).join("")}</nav>
    </aside>
    <main class="main">${content}</main>
  `;
}

async function renderSection(route: WorkbenchRoute): Promise<string> {
  if (route.section === "runs") return renderRuns(route.selectedRunId);
  if (route.section === "conversation") return renderConversation();
  if (route.section === "dashboard") return renderDashboard(route.evalDatasetId);
  if (route.section === "skills") return renderSkills();
  return renderConfig();
}

async function renderRuns(selectedRunId?: string): Promise<string> {
  if (apiClient) {
    try {
      const store = await apiClient.fetchRunStore();
      return renderRunWorkbench(buildRunWorkbenchView(store.records, selectedRunId, store.migrationReport));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `${renderRunWorkbench(buildRunWorkbenchView(demoRunRecords, selectedRunId))}<section class="panel warning"><h2>Local API unavailable</h2><p>${escapeHtml(message)}</p></section>`;
    }
  }
  return renderRunWorkbench(buildRunWorkbenchView(demoRunRecords, selectedRunId));
}

function renderConversation(): string {
  return renderWebRunLauncher({
    apiEnabled: Boolean(apiClient),
    run: conversationRun,
    ...(launcherError ? { error: launcherError } : {}),
    ...(latestAuditHandoff ? { auditHandoff: latestAuditHandoff } : {}),
  });
}

async function renderDashboard(evalDatasetId?: string): Promise<string> {
  if (evalDatasetId && apiClient) {
    try {
      const report = await apiClient.fetchLatestRealWorldEvalReport(evalDatasetId);
      return renderRealWorldEvalDashboard(normalizeRealWorldEvalReport(report as Parameters<typeof normalizeRealWorldEvalReport>[0]));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `<section class="panel warning"><h2>Eval report unavailable</h2><p>${escapeHtml(message)}</p></section>${renderRealWorldEvalDashboard(sampleRealWorldEvalDashboardView())}`;
    }
  }

  const dashboard = renderRealWorldEvalDashboard(sampleRealWorldEvalDashboardView());
  if (!evalDatasetId) return dashboard;
  return `<section class="panel"><h2>Selected eval dataset</h2><p>${escapeHtml(evalDatasetId)}</p></section>${dashboard}`;
}

function renderSkills(): string {
  return renderSkillWorkbench(buildSkillWorkbenchView(demoSkillLibrary));
}

function renderConfig(): string {
  const status = deriveConfigStatus(SAMPLE_CONFIG_VIEW);
  return `
    <section class="hero"><p class="eyebrow">Config</p><h1>Source-aware configuration.</h1><p>No hardcoded keys, no raw secrets, no ambiguity about env/file/default precedence.</p></section>
    <section class="panel"><h2>Status: ${status}</h2><div class="config-table">${SAMPLE_CONFIG_VIEW.fields.map((field) => `<div><strong>${field.label}</strong><span>${field.effectiveValue}</span><small>${field.source}</small></div>`).join("")}</div></section>
    <section class="panel warning"><h2>Doctor issues</h2>${SAMPLE_CONFIG_VIEW.doctorIssues.map((issue) => `<p><strong>${issue.code}</strong> — ${issue.message}</p>`).join("")}</section>
  `;
}

async function mount(route: WorkbenchRoute = parseHashRoute(window.location.hash)) {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("missing #app");
  app.innerHTML = renderShell(route.section, `<section class="hero compact"><p class="eyebrow">Loading</p><h1>Loading Workbench.</h1></section>`);
  app.innerHTML = renderShell(route.section, await renderSection(route));
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-section]")) {
    button.addEventListener("click", () => {
      window.location.hash = hashForSection(button.dataset.section as AppSection);
    });
  }
  if (route.section === "conversation") wireWebRunLauncher(app);
}

window.addEventListener("hashchange", () => {
  void mount();
});

if (!window.location.hash) window.location.hash = hashForSection("runs");
else void mount();

function wireWebRunLauncher(app: HTMLDivElement): void {
  const form = app.querySelector<HTMLFormElement>("[data-web-run-form]");
  if (!form || !apiClient) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const goal = String(data.get("goal") ?? "").trim();
    if (!goal) return;
    void startWebRun(goal);
  });
}

async function startWebRun(goal: string): Promise<void> {
  activeRunSource?.close();
  launcherError = undefined;
  latestAuditHandoff = undefined;
  conversationRun = { id: "starting", mode: "live", task: { goal }, events: [] };
  void mount({ section: "conversation" });

  try {
    if (!apiClient) throw new Error("Local API is not connected");
    const session = await apiClient.startRun(goal);
    conversationRun = { ...conversationRun, id: session.id };
    const source = apiClient.openRunEvents(session.id);
    activeRunSource = source;

    for (const eventName of ["workflow_event", "run_finished", "run_error"]) {
      source.addEventListener(eventName, (message) => {
        const streamEvent = JSON.parse((message as MessageEvent).data) as WebRunStreamEvent;
        const events = progressEventsFromStreamEvent(streamEvent);
        if (events.length > 0) {
          conversationRun = appendProgressEvents(conversationRun, events);
          void mount({ section: "conversation" });
        }
        const handoff = auditHandoffFromStreamEvent(streamEvent);
        if (handoff) {
          latestAuditHandoff = handoff;
          window.location.hash = handoff.href;
        }
        if (streamEvent.kind === "run_finished" || streamEvent.kind === "run_error") source.close();
      });
    }
    void mount({ section: "conversation" });
  } catch (error) {
    launcherError = error instanceof Error ? error.message : String(error);
    conversationRun = appendProgressEvents(conversationRun, [{ kind: "done", exitReason: "error", finalResponse: launcherError }]);
    void mount({ section: "conversation" });
  }
}
