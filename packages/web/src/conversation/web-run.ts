import type { WorkflowEvent, WorkflowExitReason } from "@keigent/engine";
import { buildLiveConsoleView, renderLiveConsole } from "./live-console.js";
import type { ExitReason, NormalizeRunOptions, ProgressEvent } from "./normalize.js";
import { escapeHtml } from "../ui/html.js";

export type WebRunStreamEvent =
  | { kind: "run_started"; runId: string; goal: string }
  | { kind: "workflow_event"; runId: string; event: WorkflowEvent }
  | {
      kind: "run_finished";
      runId: string;
      workflowId: string;
      exitReason: WorkflowExitReason;
      finalResponse: string;
      recordId?: string;
      recordPath?: string;
    }
  | { kind: "run_error"; runId: string; message: string };

export interface WebRunLauncherView {
  apiEnabled: boolean;
  run: NormalizeRunOptions;
  error?: string;
  auditHandoff?: WebRunAuditHandoff;
}

export interface WebRunAuditHandoff {
  recordId: string;
  href: string;
  recordPath?: string;
}

export function progressEventsFromStreamEvent(event: WebRunStreamEvent): ProgressEvent[] {
  if (event.kind === "workflow_event" && event.event.kind === "child_event") {
    return event.event.event.kind === "done" ? [] : [event.event.event as ProgressEvent];
  }

  if (event.kind === "run_finished") {
    return [{
      kind: "done",
      exitReason: workflowExitToProgressExit(event.exitReason),
      finalResponse: event.finalResponse,
    }];
  }

  if (event.kind === "run_error") {
    return [{ kind: "done", exitReason: "error", finalResponse: event.message }];
  }

  return [];
}

export function auditHandoffFromStreamEvent(event: WebRunStreamEvent): WebRunAuditHandoff | undefined {
  if (event.kind !== "run_finished" || !event.recordId) return undefined;
  return {
    recordId: event.recordId,
    href: `#runs/${encodeURIComponent(event.recordId)}`,
    ...(event.recordPath ? { recordPath: event.recordPath } : {}),
  };
}

export function renderWebRunLauncher(view: WebRunLauncherView): string {
  const disabled = view.apiEnabled ? "" : " disabled";
  const status = view.apiEnabled ? "Local API connected" : "Local API not connected";
  const error = view.error ? `<p class="launcher-error">${escapeHtml(view.error)}</p>` : "";
  const auditHandoff = view.auditHandoff
    ? `<p class="audit-handoff"><a href="${escapeHtml(view.auditHandoff.href)}">Review run</a><span>${escapeHtml(view.auditHandoff.recordId)}</span></p>`
    : "";
  const launcher = `
    <section class="panel run-launcher">
      <h2>Web Run Launcher</h2>
      <form data-web-run-form class="run-launcher-form">
        <label>
          <span>Task goal</span>
          <textarea name="goal"${disabled}>${escapeHtml(view.run.task.goal)}</textarea>
        </label>
        <div class="launcher-actions">
          <button type="submit"${disabled}>Run</button>
          <span>${escapeHtml(status)}</span>
        </div>
        ${error}
        ${auditHandoff}
      </form>
    </section>
  `;
  return `${launcher}${renderLiveConsole(buildLiveConsoleView(view.run))}`;
}

function workflowExitToProgressExit(exitReason: WorkflowExitReason): ExitReason {
  if (exitReason === "success") return "success";
  if (exitReason === "max_iterations") return "max_iterations";
  if (exitReason === "child_escalated") return "escalated";
  return exitReason as ExitReason;
}
