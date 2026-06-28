import { describe, expect, it } from "vitest";
import { buildChatWorkbenchView, renderChatWorkbench } from "../chat/workbench.js";
import { demoRunRecords } from "../runs/demo-records.js";

function demoRecord(id: string): unknown {
  return demoRunRecords.find((record) => {
    return Boolean(record && typeof record === "object" && "id" in record && record.id === id);
  });
}

describe("chat workbench", () => {
  it("marks a submitted run as starting before the first stream event arrives", () => {
    const view = buildChatWorkbenchView({
      apiEnabled: true,
      run: {
        id: "starting",
        mode: "live",
        task: { goal: "Check config" },
        events: [],
      },
    });

    expect(view.statusLabel).toBe("Starting");
    expect(view.nextAction).toBe("Wait for the run to finish or open details.");
  });

  it("renders the default task composer without exposing raw audit details", () => {
    const html = renderChatWorkbench(buildChatWorkbenchView({
      apiEnabled: true,
      run: {
        id: "draft",
        mode: "live",
        task: { goal: "" },
        events: [],
      },
    }));

    expect(html).toContain("data-web-run-form");
    expect(html).toContain("What should KeiGent do?");
    expect(html).toContain("Run");
    expect(html).toContain("Local API connected");
    expect(html).not.toContain("Selected event inspector");
    expect(html).not.toContain("raw-inspector");
    expect(html).not.toContain("workflow_event");
    expect(html).not.toContain("Live Run Console");
    expect(html).toContain("<details class=\"execution-details\">");
  });

  it("shows an actionable unavailable state when the local API is disconnected", () => {
    const html = renderChatWorkbench(buildChatWorkbenchView({
      apiEnabled: false,
      run: {
        id: "demo",
        mode: "replay",
        task: { goal: "" },
        events: [],
      },
    }));

    expect(html).toContain("Local API not connected");
    expect(html).toContain("Start KeiGent with");
    expect(html).toContain("disabled");
  });

  it("summarizes a successful run with an audit handoff", () => {
    const html = renderChatWorkbench(buildChatWorkbenchView({
      apiEnabled: true,
      run: {
        id: "web_123",
        mode: "live",
        task: { goal: "Inspect repo evidence" },
        events: [
          { kind: "iteration_start", iteration: 1 },
          { kind: "done", exitReason: "success", finalResponse: "Repo evidence checked." },
        ],
      },
      auditHandoff: {
        recordId: "run_20260624_001",
        href: "#runs/run_20260624_001",
      },
    }));

    expect(html).toContain("Repo evidence checked.");
    expect(html).toContain("Open Run Detail");
    expect(html).toContain("#runs/run_20260624_001");
    expect(html).toContain("Show execution details");
  });

  it("labels failed and budget-stopped runs without claiming success", () => {
    const failed = buildChatWorkbenchView({
      apiEnabled: true,
      run: {
        id: "web_failed",
        mode: "live",
        task: { goal: "Check config" },
        events: [
          { kind: "done", exitReason: "error", finalResponse: "KEIGENT_API_KEY is missing." },
        ],
      },
    });
    const budgetStopped = buildChatWorkbenchView({
      apiEnabled: true,
      run: {
        id: "web_budget",
        mode: "live",
        task: { goal: "Run eval" },
        events: [
          { kind: "done", exitReason: "budget_exceeded", finalResponse: "Budget stopped the run." },
        ],
      },
    });

    expect(failed.statusLabel).toBe("Failed");
    expect(failed.nextAction).toContain("retry");
    expect(budgetStopped.statusLabel).toBe("Needs review");
    expect(budgetStopped.statusLabel).not.toBe("Succeeded");
  });

  it("uses RunRecord evidence as the completion evidence source when available", () => {
    const runRecord = demoRecord("run_file-summary");
    const view = buildChatWorkbenchView({
      apiEnabled: true,
      run: {
        id: "web_123",
        mode: "live",
        task: { goal: "Summarize file with evidence" },
        events: [
          { kind: "done", exitReason: "success", finalResponse: "Summary complete." },
        ],
      },
      auditHandoff: {
        recordId: "run_file-summary",
        href: "#runs/run_file-summary",
      },
      runRecord,
    });

    expect(view.statusLabel).toBe("Succeeded");
    expect(view.evidenceSummary).toContain("RunRecord evidence: passed");
    expect(view.evidenceSummary).toContain("Trust: evidence-backed");
  });

  it("does not treat a successful final response as trusted success before RunRecord evidence loads", () => {
    const view = buildChatWorkbenchView({
      apiEnabled: true,
      run: {
        id: "web_123",
        mode: "live",
        task: { goal: "Summarize file with evidence" },
        events: [
          { kind: "done", exitReason: "success", finalResponse: "Summary complete." },
        ],
      },
      auditHandoff: {
        recordId: "run_file-summary",
        href: "#runs/run_file-summary",
      },
    });

    expect(view.statusLabel).toBe("Needs review");
    expect(view.resultText).toBe("Summary complete.");
    expect(view.evidenceSummary).toContain("RunRecord evidence is still loading");
    expect(view.nextAction).toContain("Open Run Detail");
  });

  it("downgrades success without RunRecord evidence even when no audit handoff is available", () => {
    const view = buildChatWorkbenchView({
      apiEnabled: true,
      run: {
        id: "web_123",
        mode: "live",
        task: { goal: "Summarize file with evidence" },
        events: [
          { kind: "done", exitReason: "success", finalResponse: "Summary complete." },
        ],
      },
    });

    expect(view.statusLabel).toBe("Needs review");
    expect(view.evidenceSummary).toContain("RunRecord evidence is not available");
  });

  it("downgrades successful final text when RunRecord evidence is insufficient", () => {
    const runRecord = demoRecord("run_insufficient-evidence-success-claim");
    const view = buildChatWorkbenchView({
      apiEnabled: true,
      run: {
        id: "web_123",
        mode: "live",
        task: { goal: "Claim success without evidence" },
        events: [
          { kind: "done", exitReason: "success", finalResponse: "Done." },
        ],
      },
      auditHandoff: {
        recordId: "run_insufficient-evidence-success-claim",
        href: "#runs/run_insufficient-evidence-success-claim",
      },
      runRecord,
    });

    expect(view.statusLabel).toBe("Needs review");
    expect(view.evidenceSummary).toContain("insufficient_evidence");
    expect(view.evidenceSummary).toContain("Trust: insufficient-evidence");
  });

  it("shows approval requests as user action instead of ordinary running work", () => {
    const view = buildChatWorkbenchView({
      apiEnabled: true,
      run: {
        id: "web_approval",
        mode: "live",
        task: { goal: "Write a file" },
        events: [
          {
            kind: "approval_request",
            iteration: 1,
            request: {
              toolName: "file_write",
              args: { path: "hello.txt" },
              permission: "write",
              riskLevel: "R3",
              sideEffect: "local",
              reversible: true,
              action: "write file",
              targetResource: "workspace:hello.txt",
              evidenceRequired: ["operator approval"],
              exposesSecrets: false,
            },
          },
        ],
      },
    });

    expect(view.statusLabel).toBe("Waiting for approval");
    expect(view.nextAction).toContain("Review");
  });

  it("keeps denied approvals in needs-user-action state after an approval request", () => {
    const view = buildChatWorkbenchView({
      apiEnabled: true,
      run: {
        id: "web_approval_denied",
        mode: "live",
        task: { goal: "Write a file" },
        events: [
          {
            kind: "approval_request",
            iteration: 1,
            request: {
              toolName: "file_write",
              args: { path: "hello.txt" },
              permission: "write",
              riskLevel: "R3",
              sideEffect: "local",
              reversible: true,
              action: "write file",
              targetResource: "workspace:hello.txt",
              evidenceRequired: ["operator approval"],
              exposesSecrets: false,
            },
          },
          {
            kind: "approval",
            iteration: 1,
            approved: false,
            decidedAt: "2026-06-24T00:00:00.000Z",
            request: {
              toolName: "file_write",
              args: { path: "hello.txt" },
              permission: "write",
              riskLevel: "R3",
              sideEffect: "local",
              reversible: true,
              action: "write file",
              targetResource: "workspace:hello.txt",
              evidenceRequired: ["operator approval"],
              exposesSecrets: false,
            },
          },
        ],
      },
    });

    expect(view.statusLabel).toBe("Needs user action");
    expect(view.nextAction).toContain("Review");
  });

  it("keeps execution timeline behind a closed details disclosure by default", () => {
    const html = renderChatWorkbench(buildChatWorkbenchView({
      apiEnabled: true,
      run: {
        id: "web_123",
        mode: "live",
        task: { goal: "Create file" },
        events: [
          { kind: "tool_call", iteration: 1, toolName: "file_write", args: { path: "hello.txt" } },
        ],
      },
    }));

    expect(html).toContain("<details class=\"execution-details\"");
    expect(html).toContain("Show execution details");
    expect(html).toContain("Event timeline");
    expect(html).toContain("tool: file_write");
    expect(html).not.toContain("Selected event inspector");
  });
});
