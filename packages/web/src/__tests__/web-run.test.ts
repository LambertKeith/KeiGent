import { describe, expect, it } from "vitest";
import {
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
});
