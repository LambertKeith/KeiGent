import { normalizeConversationRun, type NormalizeRunOptions, type TimelineItem } from "../conversation/normalize.js";
import { escapeHtml } from "../ui/html.js";
import { buildChatWorkbenchView, type ChatWorkbenchInput, type ChatWorkbenchView } from "./model.js";

export { buildChatWorkbenchView, type ChatWorkbenchInput, type ChatWorkbenchView } from "./model.js";

export function renderChatWorkbench(view: ChatWorkbenchView): string {
  const disabled = view.apiEnabled ? "" : " disabled";
  const goal = escapeHtml(view.run.task.goal);
  const error = view.error ? `<p class="chat-error">${escapeHtml(view.error)}</p>` : "";
  const handoff = view.auditHandoff
    ? `<a class="secondary-action" href="${escapeHtml(view.auditHandoff.href)}">Open Run Detail</a>`
    : "";
  const result = view.resultText
    ? `<section class="chat-result"><h2>Result</h2><p>${escapeHtml(view.resultText)}</p></section>`
    : `<section class="chat-result muted"><h2>Result</h2><p>Run a task to see KeiGent's answer here.</p></section>`;

  return `
    <section class="chat-shell">
      <section class="chat-hero">
        <p class="eyebrow">Chat</p>
        <h1>Ask KeiGent to do the work.</h1>
        <p>Start with the task. Evidence, tools, approvals, and raw run details stay available when you need them.</p>
      </section>
      <section class="chat-composer-panel">
        <form data-web-run-form class="chat-composer">
          <label>
            <span>What should KeiGent do?</span>
            <textarea name="goal"${disabled} placeholder="Example: Check the current project config and tell me the next action.">${goal}</textarea>
          </label>
          <div class="chat-actions">
            <button type="submit"${disabled}>Run</button>
            <span class="connection-state">${escapeHtml(view.apiEnabled ? "Local API connected" : "Local API not connected")}</span>
          </div>
          ${!view.apiEnabled ? `<p class="chat-hint">Start KeiGent with <code>corepack pnpm --filter @keigent/cli start web --api</code>.</p>` : ""}
          ${error}
        </form>
      </section>
      <section class="chat-status-grid">
        <div class="chat-status"><span>Status</span><strong>${escapeHtml(view.statusLabel)}</strong></div>
        <div class="chat-status"><span>Next action</span><strong>${escapeHtml(view.nextAction)}</strong></div>
      </section>
      ${result}
      <section class="chat-evidence-summary">
        <h2>Evidence summary</h2>
        <p>${escapeHtml(view.evidenceSummary)}</p>
        <div class="chat-secondary-actions">${handoff}</div>
      </section>
      <details class="execution-details">
        <summary>Show execution details</summary>
        ${renderCompactTimeline(view.run)}
      </details>
    </section>
  `;
}

function renderCompactTimeline(run: NormalizeRunOptions): string {
  const normalized = normalizeConversationRun(run);
  const rows = normalized.timeline.map((item) => `
    <li>
      <strong>${escapeHtml(timelineTitle(item))}</strong>
      <span>${escapeHtml(timelineSummary(item))}</span>
    </li>
  `).join("");

  return `
    <section class="compact-timeline">
      <h2>Event timeline</h2>
      <ul>${rows}</ul>
    </section>
  `;
}

function timelineTitle(item: TimelineItem): string {
  switch (item.kind) {
    case "task":
      return "Task";
    case "profile":
      return `Profile: ${item.profile}`;
    case "skills":
      return "Skills";
    case "iteration":
      return `Iteration ${item.iteration}`;
    case "assistant_text":
      return `Assistant text ${item.iteration}`;
    case "tool_activity":
      return `tool: ${item.toolName}`;
    case "approval":
      return `Approval: ${item.request.toolName}`;
    case "checkpoint":
      return `Checkpoint: ${item.desc}`;
    case "recovery":
      return `Recovery: ${item.decision}`;
    case "escalation":
      return "Escalation";
    case "done":
      return `Done: ${item.exitReason}`;
    case "debug_unknown":
      return "Unknown event";
  }
}

function timelineSummary(item: TimelineItem): string {
  switch (item.kind) {
    case "task":
      return item.goal || "No task entered yet.";
    case "skills":
      return item.skills.join(", ") || "No skills matched.";
    case "tool_activity":
      return item.state;
    case "approval":
      return item.state;
    case "checkpoint":
      return item.state;
    case "assistant_text":
      return item.text;
    case "done":
      return item.finalResponse;
    case "profile":
      return item.rationale ?? item.via;
    case "recovery":
      return item.hint ?? item.reason ?? item.decision;
    case "escalation":
      return item.reason;
    case "iteration":
      return "Started";
    case "debug_unknown":
      return "Available in developer audit views.";
  }
}
