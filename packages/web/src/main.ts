import { NAV_ITEMS, type AppSection } from "./app/nav.js";
import { hashForSection, parseHashRoute, type WorkbenchRoute } from "./app/hash-route.js";
import { apiBaseUrlFromEnv, createKeigentApiClient } from "./api/client.js";
import { appendProgressEvents } from "./conversation/live-console.js";
import type { NormalizeRunOptions, ProgressEvent } from "./conversation/normalize.js";
import { progressEventsFromStreamEvent, renderWebRunLauncher, type WebRunStreamEvent } from "./conversation/web-run.js";
import { renderRealWorldEvalDashboard, sampleRealWorldEvalDashboardView } from "./dashboard/workbench.js";
import { SAMPLE_CONFIG_VIEW, deriveConfigStatus } from "./config/config-view.js";
import { buildRunWorkbenchView, renderRunWorkbench } from "./runs/workbench.js";
import { buildSkillWorkbenchView, renderSkillWorkbench, sampleSkillInputs } from "./skills/workbench.js";
import { escapeHtml } from "./ui/html.js";
import "./styles.css";
import type { RunRecord } from "@keigent/engine";
import type { SkillLibraryInput } from "./skills/model.js";

const apiBaseUrl = apiBaseUrlFromEnv(import.meta.env as Record<string, unknown>);
const apiClient = apiBaseUrl ? createKeigentApiClient({ baseUrl: apiBaseUrl }) : undefined;
let activeRunSource: EventSource | undefined;
let launcherError: string | undefined;

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

const demoRunRecord: RunRecord = {
  schemaVersion: 1,
  id: "run_demo",
  createdAt: "2026-06-10T00:00:00.000Z",
  updatedAt: "2026-06-10T00:00:01.000Z",
  status: "succeeded",
  task: {
    goal: "Create hello.txt and verify it",
    source: "cli",
    requestedProfile: "auto",
    resolvedProfile: "convergent-exec",
    requestedWorkflowMode: "verified-loop",
    resolvedWorkflowMode: "verified-loop",
  },
  route: {
    selectedProfile: "convergent-exec",
    source: "rule",
    ruleId: "skill_match",
    rationale: "matched file-write",
    matchedSkillIds: ["file-write"],
  },
  workflow: {
    id: "wf_demo",
    mode: "verified-loop",
    exitReason: "success",
    childRuns: 1,
    budget: {
      maxChildRuns: 1,
      maxIterationsPerRun: 3,
      maxAggregateIterations: 3,
      maxToolCallsPerRun: 5,
      maxAggregateToolCalls: 5,
      maxTokenEstimatePerRun: 8_000,
      maxAggregateTokenEstimate: 8_000,
      maxRecoveryAttemptsPerRun: 2,
      timeoutMs: 120_000,
    },
    budgetUsage: {
      childRuns: 1,
      iterations: 2,
      toolCalls: 1,
      tokenEstimate: 120,
      providerUsage: {
        inputTokens: 100,
        outputTokens: 25,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 140,
        costUsd: 0.075,
        costStatus: "priced",
      },
      recoveryAttempts: 0,
      checkpointsPassed: 1,
      durationMs: 20,
    },
    budgetExceeded: false,
  },
  execution: {
    iterations: 2,
    totalToolCalls: 1,
    successfulToolCalls: 1,
    failedToolCalls: 0,
    checkpointCount: 1,
    passedCheckpoints: 1,
    durationMs: 20,
    exitReason: "success",
    finalResponseSummary: "hello.txt created",
    eventCounts: { profile_selected: 1, tool_call: 1, checkpoint: 1 },
  },
  evidence: { status: "passed", total: 1, passed: 1, failed: 0, sources: ["checkpoint"], blocking: [] },
  risk: {
    highestRiskLevel: "R3",
    permissionClassesUsed: ["write"],
    sideEffectsAttempted: 1,
    sideEffectsSucceeded: 1,
    externalSideEffects: 0,
    irreversibleActions: 0,
    approvalRequired: true,
  },
  approvals: [{
    toolName: "file_write",
    approved: true,
    decidedAt: "2026-06-10T00:00:01.000Z",
    riskLevel: "R3",
    permission: "write",
    sideEffect: "local",
    reversible: true,
    targetResource: "workspace:hello.txt",
  }],
  failures: [],
  artifacts: [{ kind: "workflow_trajectory", path: "~/.keigent/skills/.trajectories/workflows/wf_demo.json" }],
  replay: {
    supported: true,
    trajectoryPath: "~/.keigent/skills/.trajectories/workflows/wf_demo.json",
    trajectorySchemaVersion: 1,
    freshExecution: true,
  },
  autonomy: {
    outcome: "completed_without_escalation",
    repairAttempts: [],
    escalations: [],
  },
  proofBoundary: {
    proven: ["Evidence passed: hello.txt exists"],
    notProven: ["External production health is not proven by this run."],
    assumptions: ["Demo fixture evidence is representative for this local shell only."],
    evidenceGaps: [],
  },
  redaction: { applied: true, rawPayloadStored: false },
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
      return renderRunWorkbench(buildRunWorkbenchView(store.records, selectedRunId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `${renderRunWorkbench(buildRunWorkbenchView([demoRunRecord], selectedRunId))}<section class="panel warning"><h2>Local API unavailable</h2><p>${escapeHtml(message)}</p></section>`;
    }
  }
  return renderRunWorkbench(buildRunWorkbenchView([demoRunRecord], selectedRunId));
}

function renderConversation(): string {
  return renderWebRunLauncher({
    apiEnabled: Boolean(apiClient),
    run: conversationRun,
    ...(launcherError ? { error: launcherError } : {}),
  });
}

function renderDashboard(evalDatasetId?: string): string {
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
