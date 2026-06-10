import { describe, expect, it } from "vitest";
import { appendProgressEvents, buildLiveConsoleView, renderLiveConsole } from "../conversation/live-console.js";
import type { NormalizeRunOptions, ProgressEvent } from "../conversation/normalize.js";

const approvalRequest = {
  toolName: "shell",
  args: { command: "deploy", apiKey: "sk-live-console-secret" },
  permission: "dangerous",
  riskLevel: "R5",
  sideEffect: "local",
  reversible: false,
  action: "Run shell",
  targetResource: "workspace:/tmp/project",
  evidenceRequired: ["command", "exit code"],
  exposesSecrets: true,
};

function baseRun(events: ProgressEvent[]): NormalizeRunOptions {
  return {
    id: "run-live",
    mode: "live",
    task: { goal: "Deploy safely" },
    events,
  };
}

describe("live console view model", () => {
  it("appends progress events without mutating the existing run input", () => {
    const initial = baseRun([{ kind: "iteration_start", iteration: 1 }]);
    const appended = appendProgressEvents(initial, [
      { kind: "tool_call", iteration: 1, toolName: "shell", args: { command: "deploy" } },
    ]);

    expect(initial.events).toHaveLength(1);
    expect(appended.events).toHaveLength(2);
    expect(appended.events[1]).toMatchObject({ kind: "tool_call", toolName: "shell" });
  });

  it("surfaces pending tool, checkpoint, and approval counts for live runs", () => {
    const view = buildLiveConsoleView(baseRun([
      { kind: "iteration_start", iteration: 1 },
      { kind: "tool_call", iteration: 1, toolName: "shell", args: { command: "deploy" } },
      { kind: "checkpoint", iteration: 1, desc: "deployment verified" },
      { kind: "approval_request", iteration: 1, request: approvalRequest },
    ]));

    expect(view.modeLabel).toBe("Live execution");
    expect(view.pending).toEqual({
      tools: 1,
      checkpoints: 1,
      approvals: 1,
      total: 3,
    });
    expect(view.statusBanner).toBe("Live run has pending work");
  });

  it("renders selected inspector content with recursive redaction", () => {
    const view = buildLiveConsoleView(baseRun([
      { kind: "iteration_start", iteration: 1 },
      { kind: "approval_request", iteration: 1, request: approvalRequest },
    ]), "approval-1");
    const html = renderLiveConsole(view);

    expect(view.selected).toMatchObject({
      id: "approval-1",
      kind: "approval",
      title: "approval: shell",
    });
    expect(html).toContain("Selected event inspector");
    expect(html).toContain("approval: shell");
    expect(html).not.toContain("sk-live-console-secret");
    expect(html).toContain("[REDACTED");
  });

  it("labels replay views separately from live execution", () => {
    const view = buildLiveConsoleView({
      ...baseRun([{ kind: "done", exitReason: "success", finalResponse: "ok" }]),
      mode: "replay",
    });

    expect(view.modeLabel).toBe("Replay, not live execution");
    expect(view.statusBanner).toContain("Replay");
    expect(renderLiveConsole(view)).toContain("Replay, not live execution");
  });
});
