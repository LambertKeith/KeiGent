import { NAV_ITEMS, type AppSection } from "./app/nav.js";
import { hashForSection, parseHashRoute, type WorkbenchRoute } from "./app/hash-route.js";
import { apiBaseUrlFromEnv, createKeigentApiClient } from "./api/client.js";
import { createApiConnectionMonitor, type ApiConnectionState } from "./api/connection.js";
import { buildChatWorkbenchView, renderChatWorkbench } from "./chat/workbench.js";
import { appendProgressEvents } from "./conversation/live-console.js";
import type { NormalizeRunOptions } from "./conversation/normalize.js";
import { auditHandoffFromStreamEvent, progressEventsFromStreamEvent, type WebRunAuditHandoff, type WebRunStreamEvent } from "./conversation/web-run.js";
import { normalizeRealWorldEvalReport } from "./dashboard/report-model.js";
import { renderRealWorldEvalDashboard, sampleRealWorldEvalDashboardView } from "./dashboard/workbench.js";
import { SAMPLE_CONFIG_VIEW, deriveConfigStatus, normalizeConfigPageView } from "./config/config-view.js";
import { demoRunRecords } from "./runs/demo-records.js";
import { buildRunWorkbenchView, renderRunWorkbench } from "./runs/workbench.js";
import { buildSkillWorkbenchView, renderSkillWorkbench, sampleSkillInputs } from "./skills/workbench.js";
import { escapeHtml } from "./ui/html.js";
import "./styles.css";
import type { SkillLibraryInput } from "./skills/model.js";

const apiBaseUrl = apiBaseUrlFromEnv(import.meta.env as Record<string, unknown>);
const apiClient = apiBaseUrl ? createKeigentApiClient({ baseUrl: apiBaseUrl }) : undefined;
const apiConnectionMonitor = createApiConnectionMonitor(apiClient, apiBaseUrl);
let apiConnectionState: ApiConnectionState = apiConnectionMonitor.state();
let mountVersion = 0;
let activeRunSource: EventSource | undefined;
let launcherError: string | undefined;
let latestAuditHandoff: WebRunAuditHandoff | undefined;
let latestRunRecord: unknown | undefined;

let conversationRun: NormalizeRunOptions = {
  id: "draft",
  mode: "live",
  task: { goal: "" },
  events: [],
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
  if (route.section === "chat") return renderChat();
  if (route.section === "runs") return renderRuns(route.selectedRunId);
  if (route.section === "skills") return renderSkills();
  return renderSettings(route.evalDatasetId);
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

function renderChat(): string {
  return renderChatWorkbench(buildChatWorkbenchView({
    apiEnabled: apiConnectionState.connected,
    run: conversationRun,
    ...(launcherError ? { error: launcherError } : {}),
    ...(latestAuditHandoff ? { auditHandoff: latestAuditHandoff } : {}),
    ...(latestRunRecord ? { runRecord: latestRunRecord } : {}),
  }));
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

function renderConfig(connection: ApiConnectionState): string {
  const view = normalizeConfigPageView({
    fields: SAMPLE_CONFIG_VIEW.fields.map((field) => ({
      label: field.label,
      effectiveValue: field.effectiveValue,
      source: field.source,
      ...(field.secret !== undefined ? { secret: field.secret } : {}),
      issues: field.issues,
    })),
    doctorIssues: SAMPLE_CONFIG_VIEW.doctorIssues,
    apiConnection: { connected: connection.connected, ...(connection.baseUrl ? { baseUrl: connection.baseUrl } : {}) },
  });
  const status = deriveConfigStatus(view);
  const apiConnection = view.apiConnection
    ? `<section class="panel ${view.apiConnection.connected ? "" : "warning"}"><h2>API connection</h2><p><strong>${escapeHtml(view.apiConnection.label)}</strong></p><p>${escapeHtml(view.apiConnection.nextAction)}</p></section>`
    : "";
  return `
    <section class="hero"><p class="eyebrow">Settings</p><h1>Source-aware configuration.</h1><p>No hardcoded keys, no raw secrets, no ambiguity about env/file/default precedence.</p></section>
    ${apiConnection}
    <section class="panel"><h2>Status: ${status}</h2><div class="config-table">${view.fields.map((field) => `<div><strong>${escapeHtml(field.label)}</strong><span>${escapeHtml(field.effectiveValue)}</span><small>${field.source}</small></div>`).join("")}</div></section>
    <section class="panel warning"><h2>Doctor issues</h2>${view.doctorIssues.map((issue) => `<p><strong>${escapeHtml(issue.code)}</strong> — ${escapeHtml(issue.message)}</p>`).join("")}</section>
  `;
}

async function renderSettings(evalDatasetId?: string): Promise<string> {
  const config = renderConfig(apiConnectionState);
  const evalPanel = await renderDashboard(evalDatasetId);
  return `${config}<section class="settings-divider"></section>${evalPanel}`;
}

async function mount(route: WorkbenchRoute = parseHashRoute(window.location.hash)) {
  const version = ++mountVersion;
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("missing #app");
  app.innerHTML = renderShell(route.section, `<section class="hero compact"><p class="eyebrow">Loading</p><h1>Loading Workbench.</h1></section>`);
  const content = await renderSection(route);
  if (version !== mountVersion) return;
  app.innerHTML = renderShell(route.section, content);
  for (const button of app.querySelectorAll<HTMLButtonElement>("[data-section]")) {
    button.addEventListener("click", () => {
      window.location.hash = hashForSection(button.dataset.section as AppSection);
    });
  }
  if (route.section === "chat") wireWebRunLauncher(app);
}

async function refreshApiConnection(options: { force?: boolean } = {}): Promise<void> {
  apiConnectionState = await apiConnectionMonitor.refresh(options);
  void mount();
}

window.addEventListener("hashchange", () => {
  void mount();
});

if (!window.location.hash) window.location.hash = hashForSection("chat");
else void mount();
void refreshApiConnection({ force: true });

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
  latestRunRecord = undefined;
  conversationRun = { id: "starting", mode: "live", task: { goal }, events: [] };
  void mount();

  try {
    apiConnectionState = await apiConnectionMonitor.refresh();
    if (!apiClient || !apiConnectionState.connected) throw new Error("Local API is not connected");
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
          void mount();
        }
        const handoff = auditHandoffFromStreamEvent(streamEvent);
        if (handoff) {
          latestAuditHandoff = handoff;
          void mount();
          void refreshLatestRunRecord(handoff.recordId);
        }
        if (streamEvent.kind === "run_finished" || streamEvent.kind === "run_error") source.close();
      });
    }
    void mount();
  } catch (error) {
    launcherError = error instanceof Error ? error.message : String(error);
    conversationRun = appendProgressEvents(conversationRun, [{ kind: "done", exitReason: "error", finalResponse: launcherError }]);
    void mount();
  }
}

async function refreshLatestRunRecord(recordId: string): Promise<void> {
  if (!apiClient) return;
  try {
    const store = await apiClient.fetchRunStore();
    latestRunRecord = store.records.find((record) => {
      return Boolean(record && typeof record === "object" && "id" in record && record.id === recordId);
    });
    void mount();
  } catch {
    // Chat keeps the live evidence summary if the run store has not refreshed yet.
  }
}
