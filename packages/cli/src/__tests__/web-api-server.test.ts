import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RealWorldEvalReport, RunRecord, RunStoreReadResult, WorkflowEvent, WorkflowResult } from "@keigent/engine";
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
    const store = {
      records: [{ id: "run_saved", status: "succeeded" } as RunRecord],
      errors: [],
      migrationReport: {
        schemaVersion: 1,
        totalRecords: 1,
        normalizedRecords: 0,
        legacyRecords: 0,
        unsupportedRecords: 0,
        warnings: [],
      },
    } satisfies RunStoreReadResult;
    const readRunStore = vi.fn(async () => store);
    const baseUrl = await serve(createWebApiServer({ executeRun: neverExecute, readRunStore }));

    const response = await fetch(`${baseUrl}/api/runs`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      records: [{ id: "run_saved", status: "succeeded" }],
      errors: [],
      migrationReport: {
        schemaVersion: 1,
        totalRecords: 1,
        warnings: [],
      },
    });
    expect(readRunStore).toHaveBeenCalledOnce();
  });

  it("serves the latest real-world eval report for the Workbench dashboard", async () => {
    const report: RealWorldEvalReport = {
      startedAt: "2026-06-10T00:00:00.000Z",
      durationMs: 1,
      level: "L2",
      datasetId: "local-real-task-v1",
      totals: { total: 1, passed: 1, failed: 0 },
      routeAccuracy: 1,
      taskSuccessRate: 1,
      evidenceQuality: 1,
      toolReliability: 1,
      riskCompliance: 1,
      falseSuccessCount: 0,
      falseConfidenceFindings: [],
      proofBoundary: { proven: [], notProven: [], assumptions: [], evidenceGaps: [] },
      cases: [],
    };
    const readRealWorldEvalReport = vi.fn(async () => report);
    const baseUrl = await serve(createWebApiServer({ executeRun: neverExecute, readRealWorldEvalReport }));

    const response = await fetch(`${baseUrl}/api/evals/real-world/local-real-task-v1/latest`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      datasetId: "local-real-task-v1",
      totals: { total: 1 },
    });
    expect(readRealWorldEvalReport).toHaveBeenCalledWith(expect.objectContaining({
      datasetId: "local-real-task-v1",
    }));
  });

  it("returns 404 when the requested real-world eval report is missing", async () => {
    const baseUrl = await serve(createWebApiServer({
      executeRun: neverExecute,
      readRealWorldEvalReport: vi.fn(async () => undefined),
    }));

    const response = await fetch(`${baseUrl}/api/evals/real-world/missing/latest`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "eval report not found",
      datasetId: "missing",
    });
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
  const autonomy = {
    outcome: exitReason === "success" ? "completed_without_escalation" as const : "degraded_without_escalation" as const,
    repairAttempts: [],
    escalations: [],
  };
  return {
    workflowId: "wf_web",
    mode: "single-loop",
    exitReason,
    finalResponse: "done",
    childRuns: [],
    evidence: [],
    budget: { maxChildRuns: 1, maxIterationsPerRun: 1 },
    budgetUsage: { childRuns: 0, iterations: 0, toolCalls: 0, recoveryAttempts: 0, checkpointsPassed: 0, durationMs: 1 },
    autonomy,
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
      autonomy,
      evidence: [],
      events: [],
      childRuns: [],
    },
  };
}
