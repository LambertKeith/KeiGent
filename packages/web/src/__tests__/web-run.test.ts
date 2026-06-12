import { describe, expect, it } from "vitest";
import {
  auditHandoffFromStreamEvent,
  progressEventsFromStreamEvent,
  renderWebRunLauncher,
  type WebRunStreamEvent,
} from "../conversation/web-run.js";

describe("web run launcher", () => {
  it("renders a disabled launcher when the local API is not configured", () => {
    const html = renderWebRunLauncher({
      apiEnabled: false,
      run: {
        id: "demo",
        mode: "replay",
        task: { goal: "Create hello.txt" },
        events: [],
      },
    });

    expect(html).toContain("Web Run Launcher");
    expect(html).toContain("Local API not connected");
    expect(html).toContain("disabled");
  });

  it("renders an enabled launcher with the current goal", () => {
    const html = renderWebRunLauncher({
      apiEnabled: true,
      run: {
        id: "draft",
        mode: "live",
        task: { goal: "Inspect repo evidence" },
        events: [],
      },
    });

    expect(html).toContain("Web Run Launcher");
    expect(html).toContain("Inspect repo evidence");
    expect(html).toContain("data-web-run-form");
    expect(html).not.toContain("Local API not connected");
  });

  it("flattens workflow child events into progress events for the live console", () => {
    const streamEvent: WebRunStreamEvent = {
      kind: "workflow_event",
      runId: "web_123",
      event: {
        kind: "child_event",
        workflowId: "wf_123",
        childRunId: "wf_123:worker-1",
        event: { kind: "iteration_start", iteration: 1 },
      },
    };

    expect(progressEventsFromStreamEvent(streamEvent)).toEqual([{ kind: "iteration_start", iteration: 1 }]);
  });

  it("turns terminal run events into live console done events", () => {
    const streamEvent: WebRunStreamEvent = {
      kind: "run_finished",
      runId: "web_123",
      workflowId: "wf_123",
      exitReason: "budget_exceeded",
      finalResponse: "budget stopped the run",
      recordId: "run_wf_123",
    };

    expect(progressEventsFromStreamEvent(streamEvent)).toEqual([{
      kind: "done",
      exitReason: "budget_exceeded",
      finalResponse: "budget stopped the run",
    }]);
  });

  it("keeps the persisted record handoff from terminal run events", () => {
    const streamEvent: WebRunStreamEvent = {
      kind: "run_finished",
      runId: "web_123",
      workflowId: "wf_123",
      exitReason: "success",
      finalResponse: "created",
      recordId: "run_20260612_001",
      recordPath: "/tmp/runs/run_20260612_001/record.json",
    };

    expect(auditHandoffFromStreamEvent(streamEvent)).toEqual({
      recordId: "run_20260612_001",
      recordPath: "/tmp/runs/run_20260612_001/record.json",
      href: "#runs/run_20260612_001",
    });
    expect(auditHandoffFromStreamEvent({ kind: "run_error", runId: "web_123", message: "boom" })).toBeUndefined();
  });

  it("renders a review-run link after a persisted run is available", () => {
    const html = renderWebRunLauncher({
      apiEnabled: true,
      run: {
        id: "web_123",
        mode: "live",
        task: { goal: "Inspect repo evidence" },
        events: [],
      },
      auditHandoff: {
        recordId: "run_20260612_001",
        href: "#runs/run_20260612_001",
      },
    });

    expect(html).toContain("Review run");
    expect(html).toContain("#runs/run_20260612_001");
    expect(html).toContain("run_20260612_001");
  });
});
