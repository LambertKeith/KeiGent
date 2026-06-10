import { normalizeConversationRun, type NormalizeRunOptions, type ProgressEvent, type TimelineItem } from "./normalize.js";
import { escapeHtml } from "../ui/html.js";

export interface LiveConsolePendingSummary {
  tools: number;
  checkpoints: number;
  approvals: number;
  total: number;
}

export interface LiveConsoleInspector {
  id: string;
  kind: TimelineItem["kind"];
  title: string;
  redactedJson: string;
}

export interface LiveConsoleView {
  run: ReturnType<typeof normalizeConversationRun>;
  modeLabel: string;
  statusBanner: string;
  pending: LiveConsolePendingSummary;
  selected: LiveConsoleInspector;
}

export function appendProgressEvents(input: NormalizeRunOptions, events: ProgressEvent[]): NormalizeRunOptions {
  return {
    ...input,
    events: [...input.events, ...events],
  };
}

export function buildLiveConsoleView(input: NormalizeRunOptions, selectedItemId?: string): LiveConsoleView {
  const run = normalizeConversationRun(input);
  const selectedItem = run.timeline.find((item) => item.id === selectedItemId) ?? [...run.timeline].reverse()[0] ?? run.timeline[0]!;
  const pending = pendingSummary(run.timeline);

  return {
    run,
    modeLabel: input.mode === "live" ? "Live execution" : "Replay, not live execution",
    statusBanner: statusBanner(input.mode, pending, run.statusLabel),
    pending,
    selected: inspectorFor(selectedItem),
  };
}

export function renderLiveConsole(view: LiveConsoleView): string {
  const timeline = view.run.timeline.map((item) => `
    <button class="timeline-card ${escapeHtml(item.kind)} ${item.id === view.selected.id ? "selected" : ""}" data-timeline-id="${escapeHtml(item.id)}">
      <strong>${escapeHtml(titleFor(item))}</strong>
      <span>${escapeHtml(summaryFor(item))}</span>
    </button>
  `).join("");

  return `
    <section class="hero compact"><p class="eyebrow">Conversation</p><h1>Live Run Console</h1><p>${escapeHtml(view.modeLabel)} · ${escapeHtml(view.statusBanner)}</p></section>
    <section class="run-stats" aria-label="Live console status">
      ${renderStat("Status", view.run.statusLabel)}
      ${renderStat("Pending tools", String(view.pending.tools))}
      ${renderStat("Pending checkpoints", String(view.pending.checkpoints))}
      ${renderStat("Pending approvals", String(view.pending.approvals))}
    </section>
    <section class="workbench-grid">
      <section class="panel timeline"><h2>Event timeline</h2>${timeline}</section>
      <aside class="panel"><h2>Selected event inspector</h2><p><strong>${escapeHtml(view.selected.title)}</strong></p><pre class="raw-inspector">${escapeHtml(view.selected.redactedJson)}</pre></aside>
    </section>
  `;
}

function pendingSummary(timeline: TimelineItem[]): LiveConsolePendingSummary {
  const tools = timeline.filter((item) => item.kind === "tool_activity" && item.state === "pending").length;
  const checkpoints = timeline.filter((item) => item.kind === "checkpoint" && item.state === "pending").length;
  const approvals = timeline.filter((item) => item.kind === "approval" && item.state === "pending").length;
  return { tools, checkpoints, approvals, total: tools + checkpoints + approvals };
}

function statusBanner(mode: NormalizeRunOptions["mode"], pending: LiveConsolePendingSummary, statusLabel: string): string {
  if (mode === "replay") return `Replay view; original status was ${statusLabel}`;
  if (pending.total > 0) return "Live run has pending work";
  return statusLabel;
}

function inspectorFor(item: TimelineItem): LiveConsoleInspector {
  return {
    id: item.id,
    kind: item.kind,
    title: titleFor(item),
    redactedJson: JSON.stringify(item, null, 2),
  };
}

function titleFor(item: TimelineItem): string {
  switch (item.kind) {
    case "task":
      return "task";
    case "profile":
      return `profile: ${item.profile}`;
    case "skills":
      return `skills: ${item.skills.join(", ") || "none"}`;
    case "iteration":
      return `iteration ${item.iteration}`;
    case "assistant_text":
      return `assistant text ${item.iteration}`;
    case "tool_activity":
      return `tool: ${item.toolName}`;
    case "approval":
      return `approval: ${item.request.toolName}`;
    case "checkpoint":
      return `checkpoint: ${item.desc}`;
    case "recovery":
      return `recovery: ${item.decision}`;
    case "escalation":
      return "escalation";
    case "done":
      return `done: ${item.exitReason}`;
    case "debug_unknown":
      return "unknown event";
  }
}

function summaryFor(item: TimelineItem): string {
  switch (item.kind) {
    case "tool_activity":
      return item.state;
    case "approval":
      return item.state;
    case "checkpoint":
      return item.state;
    case "done":
      return item.finalResponse;
    case "assistant_text":
      return item.text;
    default:
      return item.kind;
  }
}

function renderStat(label: string, value: string): string {
  return `<div class="kpi compact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}
