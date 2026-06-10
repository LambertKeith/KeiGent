import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunRecord, WorkflowEvent, WorkflowResult } from "@keigent/engine";
import { createWebApiServer } from "../web-api-server.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
});

describe("web API server", () => {
  it("serves a local health endpoint", async () => {
    const baseUrl = await serve(createWebApiServer({ executeRun: neverExecute }));

    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      service: "keigent-web-api",
    });
  });

  it("reads saved run records for the Workbench", async () => {
    const readRunStore = vi.fn(async () => ({
      records: [{ id: "run_saved", status: "succeeded" } as RunRecord],
      errors: [],
    }));
    const baseUrl = await serve(createWebApiServer({ executeRun: neverExecute, readRunStore }));

    const response = await fetch(`${baseUrl}/api/runs`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      records: [{ id: "run_saved", status: "succeeded" }],
      errors: [],
    });
    expect(readRunStore).toHaveBeenCalledOnce();
  });

  it("starts a web-sourced run and replays progress events over SSE", async () => {
    const event: WorkflowEvent = {
      kind: "workflow_start",
      workflowId: "wf_web",
      mode: "single-loop",
      goal: "Inspect the repo",
    };
    const executeRun = vi.fn(async ({ onProgress }) => {
      onProgress(event);
      return { result: workflowResult("success"), recordId: "run_wf_web" };
    });
    const baseUrl = await serve(createWebApiServer({ executeRun }));

    const start = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: "Inspect the repo" }),
    });
    const session = await start.json() as { id: string; status: string; eventsHref: string };
    const events = await fetch(`${baseUrl}${session.eventsHref}`);
    const stream = await events.text();

    expect(start.status).toBe(202);
    expect(session).toMatchObject({ status: "running", eventsHref: `/api/runs/${session.id}/events` });
    expect(executeRun).toHaveBeenCalledWith(expect.objectContaining({
      goal: "Inspect the repo",
      taskSource: "web",
      onProgress: expect.any(Function),
    }));
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    expect(stream).toContain("event: run_started");
    expect(stream).toContain("event: workflow_event");
    expect(stream).toContain("\"kind\":\"workflow_start\"");
    expect(stream).toContain("event: run_finished");
    expect(stream).toContain("\"recordId\":\"run_wf_web\"");
    expect(stream).toContain("\"finalResponse\":\"done\"");
  });

  it("rejects run requests without a non-empty goal", async () => {
    const executeRun = vi.fn();
    const baseUrl = await serve(createWebApiServer({ executeRun }));

    const response = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ goal: "   " }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "goal is required" });
    expect(executeRun).not.toHaveBeenCalled();
  });
});

async function serve(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function neverExecute(): Promise<never> {
  throw new Error("executeRun should not be called");
}

function workflowResult(exitReason: WorkflowResult["exitReason"]): WorkflowResult {
  return {
    workflowId: "wf_web",
    mode: "single-loop",
    exitReason,
    finalResponse: "done",
    childRuns: [],
    evidence: [],
    budget: { maxChildRuns: 1, maxIterationsPerRun: 1 },
    budgetUsage: { childRuns: 0, iterations: 0, toolCalls: 0, recoveryAttempts: 0, checkpointsPassed: 0, durationMs: 1 },
    durationMs: 1,
    trajectory: {
      schemaVersion: 1,
      workflowId: "wf_web",
      mode: "single-loop",
      goal: "Inspect the repo",
      rootTask: { goal: "Inspect the repo", profile: "auto" },
      startedAt: "2026-06-10T00:00:00.000Z",
      durationMs: 1,
      exitReason,
      finalResponse: "done",
      budget: { maxChildRuns: 1, maxIterationsPerRun: 1 },
      budgetUsage: { childRuns: 0, iterations: 0, toolCalls: 0, recoveryAttempts: 0, checkpointsPassed: 0, durationMs: 1 },
      evidence: [],
      events: [],
      childRuns: [],
    },
  };
}
